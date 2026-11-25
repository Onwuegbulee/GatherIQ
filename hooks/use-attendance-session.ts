"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScannerState } from "@/lib/types";
import { WS_BASE, api, getApiToken } from "@/lib/api";

export interface DetectionBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  track_id: number | null;
  confidence: number;
}

export function useAttendanceSession(sessionId?: string) {
  const [state, setState] = useState<ScannerState>("ready");
  const [count, setCount] = useState(0);
  const [aiUniqueCount, setAiUniqueCount] = useState(0);
  const [manualAdjustment, setManualAdjustment] = useState(0);
  const [activeInFrame, setActiveInFrame] = useState(0);
  const [boxes, setBoxes] = useState<DetectionBox[]>([]);
  const [countSource, setCountSource] = useState<"ai" | "manual">("manual");
  const [isGenuineAI, setIsGenuineAI] = useState(false);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");
  const [aiMessage, setAiMessage] = useState<string>("Connecting to AI vision engine…");
  const [aiError, setAiError] = useState<string | null>(null);
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
      setWsStatus("disconnected");
      setIsGenuineAI(false);
      setAiMessage("AI vision engine is not connected.");
      return;
    }

    const token = getApiToken();
    const wsUrl = `${WS_BASE}/api/ws/session/${sessionId}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    let socket: WebSocket;
    setWsStatus("connecting");
    setAiError(null);

    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "detection_result") {
            if (data.is_genuine_ai) {
              setCount(data.total_count ?? 0);
              setAiUniqueCount(data.ai_unique_count ?? data.total_count ?? 0);
              setManualAdjustment(data.manual_adjustment ?? 0);
              setActiveInFrame(data.active_in_frame ?? 0);
              setBoxes(Array.isArray(data.boxes) ? data.boxes : []);
              setIsGenuineAI(true);
              setCountSource("ai");
              setAiError(null);
            } else {
              setIsGenuineAI(false);
              setActiveInFrame(0);
              setBoxes([]);
              if (data.message) setAiError(data.message);
            }
            if (data.message) setAiMessage(data.message);
          } else if (data.type === "count_update") {
            setCount(data.total_count ?? 0);
            if (typeof data.ai_unique_count === "number") setAiUniqueCount(data.ai_unique_count);
            if (typeof data.manual_adjustment === "number") setManualAdjustment(data.manual_adjustment);
            setCountSource(data.count_source === "ai" ? "ai" : "manual");
            setIsGenuineAI(Boolean(data.is_genuine_ai));
            if (data.message) setAiMessage(data.message);
          } else if (data.type === "connected") {
            setWsStatus("connected");
            if (typeof data.current_total === "number") setCount(data.current_total);
            if (typeof data.ai_unique_count === "number") setAiUniqueCount(data.ai_unique_count);
            if (typeof data.manual_adjustment === "number") setManualAdjustment(data.manual_adjustment);
            setIsGenuineAI(Boolean(data.cv_ready));
            setCountSource(data.cv_ready ? "ai" : "manual");
            setAiMessage(data.cv_status || (data.cv_ready ? "AI vision engine is ready." : "AI vision engine is not connected."));
          } else if (data.type === "error") {
            setWsStatus("error");
            setIsGenuineAI(false);
            setAiError(data.message || "AI vision connection error.");
            setAiMessage(data.message || "AI vision connection error.");
          }
        } catch {
          // ignore non-json messages
        }
      };

      socket.onerror = () => {
        setWsStatus("error");
        setIsGenuineAI(false);
        setAiError("AI vision engine connection failed.");
        setAiMessage("AI vision engine is not connected.");
      };

      socket.onclose = () => {
        setWsStatus("disconnected");
        setIsGenuineAI(false);
      };
    } catch {
      setWsStatus("error");
      setIsGenuineAI(false);
      setAiError("AI vision engine is not connected.");
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
    setActiveInFrame(0);
    setBoxes([]);
    if (sessionId) api.sessions.pause(sessionId).catch(() => undefined);
  }, [sessionId]);

  const resume = useCallback(() => {
    setState((s) => (s === "paused" ? "recording" : s));
    if (sessionId) api.sessions.resume(sessionId).catch(() => undefined);
  }, [sessionId]);

  const end = useCallback(() => {
    setState("processing");
    setActiveInFrame(0);
    setBoxes([]);
    if (sessionId) api.sessions.end(sessionId).catch(() => undefined);
  }, [sessionId]);

  const complete = useCallback(() => setState("completed"), []);

  const applyAICount = useCallback((newCount: number, message?: string) => {
    const safeCount = Math.max(0, Math.round(newCount));
    setCount(safeCount);
    setAiUniqueCount(safeCount);
    setManualAdjustment(0);
    setCountSource("ai");
    setIsGenuineAI(true);
    setAiError(null);
    if (message) setAiMessage(message);
  }, []);

  const adjustCount = useCallback((delta: number) => {
    setCount((c) => Math.max(0, c + delta));
    setManualAdjustment((m) => m + delta);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "manual_adjust", delta }));
    } else {
      setCountSource("manual");
      setIsGenuineAI(false);
    }
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
    aiUniqueCount,
    manualAdjustment,
    activeInFrame,
    boxes,
    elapsed,
    countSource,
    isGenuineAI,
    wsStatus,
    aiMessage,
    aiError,
    start,
    pause,
    resume,
    end,
    complete,
    applyAICount,
    adjustCount,
    sendFrame,
  };
}
