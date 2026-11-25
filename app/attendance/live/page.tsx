"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, CameraOff, ImageUp, Loader2, Pause, Play, RefreshCw, RotateCcw, ScanLine, Square, X, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { Modal } from "@/components/ui/modal";
import { Counter } from "@/components/scanner/counter";
import { RoundButton, StatusPill } from "@/components/scanner/controls";
import { useApp } from "@/context/app-context";
import { useCamera } from "@/hooks/use-camera";
import { useAttendanceSession } from "@/hooks/use-attendance-session";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { api } from "@/lib/api";
import { cn, formatDuration } from "@/lib/utils";

export default function LivePage() {
  const { ready, authed, draft } = useApp();
  const router = useRouter();
  useEffect(() => { if (ready && !authed) router.replace("/login"); }, [ready, authed, router]);
  if (!ready || !authed) return <div className="grid h-full place-items-center text-sm text-white/60">Loading…</div>;
  if (!draft)
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div><ScanLine className="mx-auto h-10 w-10 text-brand" /><h1 className="mt-4 text-xl font-semibold">Set up a session first</h1>
          <p className="mt-2 text-sm text-white/70">Choose the service you’re counting before opening the camera.</p>
          <Link href="/attendance/new" className="mt-6 inline-flex h-12 items-center rounded-lg bg-brand px-6 font-medium">Start New Attendance</Link></div>
      </div>
    );
  return <Scanner />;
}

function Scanner() {
  const { draft, settings, setResult } = useApp();
  const router = useRouter();
  const cam = useCamera({ facing: settings.facingMode, quality: settings.videoQuality, deviceId: settings.preferredCamera });
  const session = useAttendanceSession(draft?.id);
  const [confirm, setConfirm] = useState<"end" | "leave" | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [stillBusy, setStillBusy] = useState(false);
  const [stillError, setStillError] = useState<string | null>(null);
  const [stillModal, setStillModal] = useState<{
    originalImage: string;
    annotatedImage: string;
    count: number;
    confidence: number;
    latencyMs: number;
    isGenuineAI: boolean;
    message: string;
  } | null>(null);
  const { state } = session;
  const active = state === "recording" || state === "paused";

  useWakeLock(state === "recording");

  // Auto-pause if the camera drops while recording
  useEffect(() => { if (cam.status === "error" && state === "recording") session.pause(); }, [cam.status, state, session]);

  // Frame sampling for real-time WebSocket CV processing
  useEffect(() => {
    if (cam.status !== "active" || state !== "recording") return;
    const interval = setInterval(() => {
      const video = cam.videoElementRef.current;
      if (!video || video.readyState < 2) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(video.videoWidth || 640, 640);
        canvas.height = Math.min(video.videoHeight || 480, 480);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.65);
          session.sendFrame(dataUrl);
        }
      } catch {
        // frame sampling skipped
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [cam.status, state, session, cam.videoRef]);

  // Guard against accidental loss: tab close/refresh and the browser back button
  useEffect(() => {
    if (!active) return;
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const onPop = () => { history.pushState(null, "", location.href); setConfirm("leave"); };
    history.pushState(null, "", location.href);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", onPop);
    return () => { window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("popstate", onPop); };
  }, [active]);

  const close = () => (active ? setConfirm("leave") : (cam.stop(), router.push("/attendance/new")));

  const runStillDetection = useCallback(async (dataUrl: string) => {
    setStillBusy(true);
    setStillError(null);
    try {
      const res = await api.cv.detectImage(dataUrl, draft?.id);
      setStillModal({
        originalImage: dataUrl,
        annotatedImage: res.annotated_image || dataUrl,
        count: res.count,
        confidence: res.confidence,
        latencyMs: res.latency_ms,
        isGenuineAI: res.is_genuine_ai,
        message: res.message,
      });
    } catch (err: any) {
      setStillError(err?.message || "Could not process image. Please try again.");
    } finally {
      setStillBusy(false);
    }
  }, [draft?.id]);

  const captureStill = useCallback(() => {
    const video = cam.videoElementRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(video.videoWidth || 640, 1280);
    canvas.height = Math.min(video.videoHeight || 480, 960);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    void runStillDetection(dataUrl);
  }, [cam.videoElementRef, runStillDetection]);

  const handlePhotoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        void runStillDetection(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }, [runStillDetection]);

  const finish = useCallback(() => {
    setConfirm(null);
    session.end();
    cam.stop();
    setTimeout(() => {
      session.complete();
      setResult({
        ...draft!,
        count: session.count,
        countSource: session.countSource,
        durationSeconds: session.elapsed,
        endedAt: new Date().toISOString(),
        aiMessage: session.aiMessage,
      });
      router.replace("/attendance/summary");
    }, 1600);
  }, [cam, draft, router, session, setResult]);

  const camOn = cam.status === "active";
  const time = formatDuration(session.elapsed);

  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-950 lg:p-6">
      <div className="relative h-full w-full overflow-hidden bg-black lg:h-[min(88vh,760px)] lg:max-w-4xl lg:rounded-2xl lg:border lg:border-white/10">
        <video ref={cam.videoRef} playsInline muted autoPlay aria-label="Live camera preview"
          className={cn("absolute inset-0 h-full w-full object-cover", cam.facing === "user" && "-scale-x-100", !camOn && "invisible")} />
        {camOn && <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/65" />}
        {camOn && state === "recording" && session.boxes.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
            {session.boxes.map((b, i) => (
              <div
                key={b.track_id ?? i}
                className="absolute rounded-lg border-2 border-emerald-400/90 bg-emerald-400/10"
                style={{
                  left: `${(cam.facing === "user" ? 1 - b.x2 : b.x1) * 100}%`,
                  top: `${b.y1 * 100}%`,
                  width: `${(b.x2 - b.x1) * 100}%`,
                  height: `${(b.y2 - b.y1) * 100}%`,
                }}
              >
                {b.track_id !== null && (
                  <span className="absolute -top-5 left-0 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    #{b.track_id}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {camOn && (
          <div className="pointer-events-none absolute inset-x-6 bottom-52 top-28 max-lg:landscape:bottom-6 max-lg:landscape:top-20" aria-hidden>
            {["left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-2xl", "right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-2xl", "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl", "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl"].map((c) => <i key={c} className={`absolute h-8 w-8 border-white/70 ${c}`} />)}
          </div>)}

        {/* Top bar */}
        <header className="safe-top safe-x absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 pb-2">
          <button onClick={close} aria-label="Close scanner" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/45 backdrop-blur-md active:scale-95"><X className="h-5 w-5" /></button>
          <div className="min-w-0 text-center">
            <Brand light className="justify-center [&>span:first-child]:h-6 [&>span:first-child]:w-6 [&>span:last-child]:text-xs" />
            <p className="mt-0.5 truncate text-sm font-medium text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.8)]">{draft!.serviceName}</p>
          </div>
          <StatusPill state={state} time={time} />
        </header>

        {/* Counter */}
        {camOn && (
          <div className="absolute bottom-44 left-1/2 z-10 -translate-x-1/2 max-lg:landscape:bottom-4 max-lg:landscape:left-4 max-lg:landscape:translate-x-0">
            <Counter
              count={session.count}
              aiUniqueCount={session.aiUniqueCount}
              manualAdjustment={session.manualAdjustment}
              activeInFrame={session.activeInFrame}
              state={state}
              isGenuineAI={session.isGenuineAI}
              countSource={session.countSource}
              wsStatus={session.wsStatus}
              aiMessage={session.aiMessage}
              aiError={session.aiError}
              onAdjust={session.adjustCount}
            />
          </div>
        )}
        {state === "paused" && camOn && <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 text-center"><span className="rounded-full bg-black/55 px-4 py-2 text-sm font-medium backdrop-blur-md">Scanning paused</span></div>}
        {state === "ready" && camOn && <p className="pointer-events-none absolute inset-x-0 top-[28%] z-10 px-8 text-center text-sm font-medium text-white [text-shadow:0_1px_4px_rgba(0,0,0,.8)]">Point the camera at the congregation, then tap Start Scanning.</p>}

        {/* Controls */}
        {camOn && (
          <div className="safe-bottom safe-x absolute inset-x-0 bottom-0 z-10 flex items-end justify-center gap-3 pt-4 max-lg:landscape:inset-x-auto max-lg:landscape:bottom-0 max-lg:landscape:right-0 max-lg:landscape:top-0 max-lg:landscape:flex-col max-lg:landscape:items-center max-lg:landscape:justify-center max-lg:landscape:gap-2 max-lg:landscape:pr-4">
            <RoundButton label="Switch camera" onClick={cam.switchCamera} disabled={!cam.canSwitch}><RefreshCw className="h-6 w-6" /></RoundButton>
            <RoundButton label={stillBusy ? "Detecting…" : "Still photo"} onClick={captureStill} disabled={stillBusy}><Camera className="h-6 w-6" /></RoundButton>
            {state === "ready" && <RoundButton label="Start scanning" size="lg" tone="brand" onClick={session.start}><Play className="h-9 w-9 translate-x-0.5" fill="currentColor" /></RoundButton>}
            {state === "recording" && <RoundButton label="Pause" size="lg" tone="amber" onClick={session.pause}><Pause className="h-9 w-9" fill="currentColor" /></RoundButton>}
            {state === "paused" && <RoundButton label="Resume" size="lg" tone="brand" onClick={session.resume}><Play className="h-9 w-9 translate-x-0.5" fill="currentColor" /></RoundButton>}
            {(state === "processing" || state === "completed") && <RoundButton label="Working…" size="lg" tone="glass" disabled onClick={() => undefined}><Loader2 className="h-8 w-8 animate-spin" /></RoundButton>}
            <RoundButton label="End attendance" tone="danger" onClick={() => setConfirm("end")} disabled={!active}><Square className="h-5 w-5" fill="currentColor" /></RoundButton>
          </div>
        )}

        {/* Camera gate: permission explanation / loading / error */}
        {!camOn && state !== "processing" && (
          <div className="safe-x absolute inset-0 z-20 grid place-items-center bg-slate-950 px-6">
            {cam.status === "loading" ? (
              <div className="text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" /><p className="mt-4 text-sm text-white/80">Starting camera…</p></div>
            ) : cam.status === "error" && cam.error ? (
              <div className="max-w-sm text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-500/15"><CameraOff className="h-7 w-7 text-red-400" /></span>
                <h2 className="mt-4 text-lg font-semibold">{cam.error.code === "denied" ? "Camera access blocked" : cam.error.code === "disconnected" ? "Camera disconnected" : "Camera unavailable"}</h2>
                <p className="mt-2 text-sm text-white/70">{cam.error.message}</p>
                <div className="mt-6 flex flex-col gap-2">
                  <button onClick={() => cam.start()} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand font-medium"><RotateCcw className="h-4 w-4" />Retry</button>
                  <button onClick={close} className="h-12 rounded-lg bg-white/10 font-medium">Leave scanner</button>
                </div>
                {active && <p className="mt-4 text-xs text-amber-300">Your count of {session.count.toLocaleString()} is kept. Scanning is paused until the camera returns.</p>}
              </div>
            ) : (
              <div className="max-w-sm text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand/20"><Camera className="h-7 w-7 text-brand" /></span>
                <h2 className="mt-4 text-xl font-semibold">Allow camera access</h2>
                <p className="mt-2 text-sm text-white/70">GatherIQ uses your rear camera to count the congregation as you walk around. It doesn’t identify anyone, and video isn’t recorded or stored.</p>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-white/50"><ShieldCheck className="h-3.5 w-3.5" />Counting happens on the video stream only.</p>
                <div className="mt-6 flex flex-col gap-2">
                  <button onClick={() => cam.start()} className="h-12 rounded-lg bg-brand font-medium active:scale-[.98]">Enable camera</button>
                  <button onClick={() => fileInputRef.current?.click()} disabled={stillBusy} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white/15 font-medium hover:bg-white/20 disabled:opacity-50">
                    {stillBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                    {stillBusy ? "Analyzing image…" : "Upload or capture still photo"}
                  </button>
                  <button onClick={close} className="h-12 rounded-lg bg-white/10 font-medium">Cancel</button>
                </div>
                {stillError && <p className="mt-3 text-xs text-amber-300">{stillError}</p>}
              </div>
            )}
          </div>
        )}

        {/* Processing */}
        {state === "processing" && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/95"><div className="text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" /><p className="mt-4 font-medium">Preparing your summary…</p><p className="mt-1 text-sm text-white/60">{session.count.toLocaleString()} counted in {time}</p></div></div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoUpload}
      />

      <Modal dark open={!!stillModal} onClose={() => setStillModal(null)} title="Still-image AI detection">
        {stillModal && (
          <div className="space-y-4">
            {stillModal.isGenuineAI ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-white/70">Original image</p>
                    <img src={stillModal.originalImage} alt="Original congregation capture" className="max-h-48 w-full rounded-lg border border-white/15 object-contain bg-black" />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-emerald-300">Processed (YOLOv8 detections)</p>
                    <img src={stillModal.annotatedImage} alt="Processed image with bounding boxes" className="max-h-48 w-full rounded-lg border border-emerald-500/40 object-contain bg-black" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/10 p-3 text-center text-xs">
                  <div><p className="text-white/60">People</p><p className="mt-0.5 text-lg font-bold tabular-nums">{stillModal.count}</p></div>
                  <div><p className="text-white/60">Confidence</p><p className="mt-0.5 text-lg font-bold tabular-nums">{Math.round(stillModal.confidence * 100)}%</p></div>
                  <div><p className="text-white/60">Latency</p><p className="mt-0.5 text-lg font-bold tabular-nums">{stillModal.latencyMs}ms</p></div>
                </div>
                <p className="text-xs text-emerald-300">{stillModal.message}</p>
              </>
            ) : (
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                <p className="font-medium">Detection unavailable</p>
                <p className="mt-1 text-xs text-amber-200/80">{stillModal.message}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStillModal(null)} className="h-11 flex-1 rounded-lg bg-white/10 font-medium">Close</button>
              {stillModal.isGenuineAI && (
                <button
                  onClick={() => {
                    session.applyAICount(stillModal.count, stillModal.message);
                    setStillModal(null);
                    setResult({
                      ...draft!,
                      count: stillModal.count,
                      countSource: "ai",
                      durationSeconds: session.elapsed,
                      endedAt: new Date().toISOString(),
                      aiMessage: stillModal.message,
                    });
                    cam.stop();
                    router.replace("/attendance/summary");
                  }}
                  className="h-11 flex-1 rounded-lg bg-brand font-medium"
                >
                  Use This Count ({stillModal.count})
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal dark open={confirm === "end"} onClose={() => setConfirm(null)} title="End attendance?">
        <p className="text-sm text-white/70">{session.count.toLocaleString()} people counted in {time}. The camera will turn off and you’ll review the summary.</p>
        <div className="mt-5 flex gap-2"><button onClick={() => setConfirm(null)} className="h-11 flex-1 rounded-lg bg-white/10 font-medium">Keep scanning</button><button onClick={finish} className="h-11 flex-1 rounded-lg bg-danger font-medium">End attendance</button></div>
      </Modal>
      <Modal dark open={confirm === "leave"} onClose={() => setConfirm(null)} title="Leave this session?">
        <p className="text-sm text-white/70">Your session is still active. If you leave now, the {session.count.toLocaleString()} counted so far will be lost.</p>
        <div className="mt-5 flex gap-2"><button onClick={() => setConfirm(null)} className="h-11 flex-1 rounded-lg bg-white/10 font-medium">Stay</button><button onClick={() => { cam.stop(); router.push("/attendance/new"); }} className="h-11 flex-1 rounded-lg bg-danger font-medium">Discard &amp; leave</button></div>
      </Modal>
    </div>
  );
}
