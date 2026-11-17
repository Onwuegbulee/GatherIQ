"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScannerState } from "@/lib/types";

export type Gender = "male" | "female";

/**
 * Session state machine: ready → recording ⇄ paused → processing → completed.
 *
 * Counts are DEMONSTRATION values adjusted manually. When the detection backend exists, call
 * `receiveDetection({ male, female })` from the WebSocket `onmessage` handler; the UI needs no other change.
 */
export function useAttendanceSession() {
  const [state, setState] = useState<ScannerState>("ready");
  const [male, setMale] = useState(0);
  const [female, setFemale] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const accumulated = useRef(0);

  useEffect(() => {
    if (state !== "recording") return;
    startedAt.current = Date.now();
    const id = setInterval(() => setElapsed(accumulated.current + Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000)), 500);
    return () => {
      clearInterval(id);
      if (startedAt.current) accumulated.current += Math.floor((Date.now() - startedAt.current) / 1000);
      startedAt.current = null;
    };
  }, [state]);

  const start = useCallback(() => setState("recording"), []);
  const pause = useCallback(() => setState((s) => (s === "recording" ? "paused" : s)), []);
  const resume = useCallback(() => setState((s) => (s === "paused" ? "recording" : s)), []);
  const end = useCallback(() => setState("processing"), []);
  const complete = useCallback(() => setState("completed"), []);

  const adjustDemoCount = useCallback((g: Gender, delta: number) => (g === "male" ? setMale : setFemale)((c) => Math.max(0, c + delta)), []);
  /** Future hook-up point for real-time detection results (e.g. WebSocket messages). */
  const receiveDetection = useCallback((r: { male: number; female: number }) => { setMale(Math.max(0, Math.round(r.male))); setFemale(Math.max(0, Math.round(r.female))); }, []);

  return { state, male, female, count: male + female, elapsed, start, pause, resume, end, complete, adjustDemoCount, receiveDetection };
}
