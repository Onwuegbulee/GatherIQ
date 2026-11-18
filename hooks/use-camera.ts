"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "loading" | "active" | "error";
export type CameraErrorCode = "unsupported" | "denied" | "not-found" | "in-use" | "disconnected" | "unknown";
export interface CameraError { code: CameraErrorCode; message: string }
export type VideoQuality = "low" | "medium" | "high";
export type Facing = "environment" | "user";

const QUALITY: Record<VideoQuality, { width: number; height: number }> = {
  low: { width: 640, height: 480 },
  medium: { width: 1280, height: 720 },
  high: { width: 1920, height: 1080 },
};

function toError(e: unknown): CameraError {
  const name = (e as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return { code: "denied", message: "Camera access was blocked. Allow camera permission in your browser settings, then try again." };
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return { code: "not-found", message: "No camera was found on this device." };
  if (name === "NotReadableError" || name === "AbortError")
    return { code: "in-use", message: "The camera is being used by another app. Close it and try again." };
  return { code: "unknown", message: "The camera could not be started. Check your connection and permissions, then try again." };
}

export interface UseCameraOptions { facing?: Facing; quality?: VideoQuality; deviceId?: string }

/** Owns the MediaStream lifecycle: start, switch, stop, error handling and cleanup. */
export function useCamera(opts: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<CameraError | null>(null);
  const [facing, setFacing] = useState<Facing>(opts.facing ?? "environment");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [canSwitch, setCanSwitch] = useState(false);
  const mounted = useRef(true);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (mounted.current) setStatus("idle");
  }, []);

  const start = useCallback(async (nextFacing?: Facing) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError({ code: "unsupported", message: "This browser can't access the camera. Use a current version of Chrome, Safari or Firefox over HTTPS." });
      setStatus("error");
      return;
    }
    stop();
    setStatus("loading");
    setError(null);
    const f = nextFacing ?? facing;
    const q = QUALITY[opts.quality ?? "medium"];
    const base: MediaTrackConstraints = { width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: 30, max: 30 } };
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: opts.deviceId && opts.deviceId !== "auto" ? { ...base, deviceId: { exact: opts.deviceId } } : { ...base, facingMode: { ideal: f } },
        });
      } catch (e) {
        if ((e as DOMException).name === "OverconstrainedError") stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        else throw e;
      }
      if (!mounted.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      stream.getVideoTracks().forEach((t) => {
        t.onended = () => {
          if (!mounted.current || streamRef.current !== stream) return;
          streamRef.current = null;
          setError({ code: "disconnected", message: "The camera was disconnected. Reconnect it or tap Retry." });
          setStatus("error");
        };
      });
      const v = videoRef.current;
      if (v) { v.srcObject = stream; await v.play().catch(() => undefined); }
      const settings = stream.getVideoTracks()[0]?.getSettings();
      if (settings?.facingMode === "user" || settings?.facingMode === "environment") setFacing(settings.facingMode);
      else setFacing(f);
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      setDevices(all);
      setCanSwitch(all.length > 1);
      setStatus("active");
    } catch (e) {
      if (mounted.current) { setError(toError(e)); setStatus("error"); }
    }
  }, [facing, opts.deviceId, opts.quality, stop]);

  const switchCamera = useCallback(() => start(facing === "environment" ? "user" : "environment"), [facing, start]);

  // attach stream if the <video> element mounts after the stream exists
  const setVideoEl = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) { el.srcObject = streamRef.current; el.play().catch(() => undefined); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, []);

  return { videoRef: setVideoEl, videoElementRef: videoRef, status, error, facing, devices, canSwitch, start, stop, switchCamera };
}
