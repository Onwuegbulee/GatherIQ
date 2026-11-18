"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScannerState } from "@/lib/types";
import { WS_BASE, getApiToken } from "@/lib/api";

export function useAttendanceSession(sessionId?: string) {
  const [state, setState] = useState<ScannerState>("ready");
  const [count, setCount] = useState(0);
  const [countSource, setCountSource] = useState<"demo" | "ai" | "manual">("demo");
  const [isGenuineAI, setIsGenuineAI] = useState(false);
  const [aiMessage, setAiMessage] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);

  const startedAt = useRef<number | null>(null);
  const accumulated = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Duration accumulation timer
  useEffect(() => {
    if (state !== "recording") return;
    startedAt.current = Date.now();
    const id = setInterval(() => {
      setElapsed(accumulated.current + Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000));
    }, 500);

    return () => {
      clearInterval(id);
      if (startedAt.current) accumulated.current += Math.floor((Date.now() - startedAt.current) / 1000);
      startedAt.current = null;
    };
  }, [state]);

  // WebSocket lifecycle
  useEffect(() => {
    if (!sessionId || typeof window === "undefined") return;

    const token = getApiToken();
    const wsUrl = `${WS_BASE}/api/ws/session/${sessionId}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    let socket: WebSocket;

    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "detection_result") {
            if (data.is_genuine_ai) {
              setCount(data.total_count);
              setIsGenuineAI(true);
              setCountSource("ai");
            }
            if (data.message) setAiMessage(data.message);
          } else if (data.type === "count_update") {
            setCount(data.total_count);
            setCountSource(data.count_source);
            setIsGenuineAI(data.is_genuine_ai);
          } else if (data.type === "connected") {
            if (data.current_total) setCount(data.current_total);
            if (data.cv_status) setAiMessage(data.cv_status);
            setIsGenuineAI(data.cv_ready);
          }
        } catch {
          // ignore non-json messages
        }
      };

      socket.onerror = () => {
        // Fall back cleanly to demo/manual counting
        setIsGenuineAI(false);
      };
    } catch {
      // WS not available
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId]);

  const start = useCallback(() => setState("recording"), []);
  const pause = useCallback(() => setState((s) => (s === "recording" ? "paused" : s)), []);
  const resume = useCallback(() => setState((s) => (s === "paused" ? "recording" : s)), []);
  const end = useCallback(() => setState("processing"), []);
  const complete = useCallback(() => setState("completed"), []);

  const adjustCount = useCallback((delta: number) => {
    setCount((c) => {
      const next = Math.max(0, c + delta);
      // Inform WebSocket if connected
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "demo_adjust", delta }));
      }
      return next;
    });
    setCountSource("demo");
    setIsGenuineAI(false);
  }, []);

  const sendFrame = useCallback((frameBlobOrB64: Blob | string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (typeof frameBlobOrB64 === "string") {
      wsRef.current.send(JSON.stringify({ type: "frame", image: frameBlobOrB64 }));
    } else {
      wsRef.current.send(frameBlobOrB64);
    }
  }, []);

  return {
    state,
    count,
    elapsed,
    countSource,
    isGenuineAI,
    aiMessage,
    start,
    pause,
    resume,
    end,
    complete,
    adjustCount,
    sendFrame,
  };
}
