"use client";
import { useEffect } from "react";

/** Keeps the screen awake while `active` is true (where the Wake Lock API is supported). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try { lock = await navigator.wakeLock.request("screen"); if (cancelled) lock.release().catch(() => undefined); } catch { /* denied or unsupported */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisible); lock?.release().catch(() => undefined); };
  }, [active]);
}
