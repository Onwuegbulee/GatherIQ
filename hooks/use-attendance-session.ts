"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScannerState } from "@/lib/types";
import { WS_BASE, api, getApiToken } from "@/lib/api";

export function useAttendanceSession(sessionId?: string) {
  const [state, setState] = useState<ScannerState>("ready");
  const [count, setCount] = useState(0);
  const [countSource, setCountSource] = useState<"ai" | "manual">("manual");
  const [isGenuineAI, setIsGenuineAI] = useState(false);
  const [aiMessage, setAiMessage] = useState<string>("Waiting for AI vision connection…");
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
    if (!sessionId || typeof window === "undefined") {
      setIsGenuineAI(false);
      setAiMessage("AI vision engine is not connected.");
      return;
    }

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
            } else {
              setIsGenuineAI(false);
            }
            if (data.message) setAiMessage(data.message);
          } else if (data.type === "count_update") {
            setCount(data.total_count);
            setCountSource(data.count_source === "ai" ? "ai" : "manual");
            setIsGenuineAI(Boolean(data.is_genuine_ai));
            if (data.message) setAiMessage(data.message);
          } else if (data.type === "connected") {
            if (typeof data.current_total === "number") setCount(data.current_total);
            setIsGenuineAI(Boolean(data.cv_ready));
            setCountSource(data.cv_ready ? "ai" : "manual");
            setAiMessage(data.cv_status || (data.cv_ready ? "AI vision engine is ready." : "AI vision engine is not connected."));
          } else if (data.type === "error") {
            setIsGenuineAI(false);
            setAiMessage(data.message || "AI vision connection error.");
          }
        } catch {
          // ignore non-json messages
        }
      };

      socket.onerror = () => {
        setIsGenuineAI(false);
        setAiMessage("AI vision engine is not connected.");
      };

      socket.onclose = () => {
        setIsGenuineAI(false);
      };
    } catch {
      setIsGenuineAI(false);
      setAiMessage("AI vision engine is not connected.");
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId]);

  const start = useCallback(() => {
    setState("recording");
    if (sessionId) api.sessions.start(sessionId).catch(() => undefined);
  }, [sessionId]);

  const pause = useCallback(() => {
    setState((s) => (s === "recording" ? "paused" : s));
    if (sessionId) api.sessions.pause(sessionId).catch(() => undefined);
  }, [sessionId]);

  const resume = useCallback(() => {
    setState((s) => (s === "paused" ? "recording" : s));
    if (sessionId) api.sessions.resume(sessionId).catch(() => undefined);
  }, [sessionId]);

  const end = useCallback(() => {
    setState("processing");
    if (sessionId) api.sessions.end(sessionId).catch(() => undefined);
  }, [sessionId]);

  const complete = useCallback(() => setState("completed"), []);

  const adjustCount = useCallback((delta: number) => {
    setCount((c) => {
      const next = Math.max(0, c + delta);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "manual_adjust", delta }));
      }
      return next;
    });
    setCountSource("manual");
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
