"use client";
import { Minus, Plus, Sparkles, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";

export function Counter({
  count,
  aiUniqueCount = 0,
  manualAdjustment = 0,
  activeInFrame = 0,
  state,
  isGenuineAI = false,
  wsStatus = "disconnected",
  aiMessage,
  aiError,
  onAdjust,
}: {
  count: number;
  aiUniqueCount?: number;
  manualAdjustment?: number;
  activeInFrame?: number;
  state: string;
  isGenuineAI?: boolean;
  countSource?: string;
  wsStatus?: "connecting" | "connected" | "disconnected" | "error";
  aiMessage?: string;
  aiError?: string | null;
  onAdjust: (delta: number) => void;
}) {
  const live = state === "recording";

  return (
    <div className="w-[min(92vw,340px)] rounded-3xl bg-black/55 px-5 py-4 text-center ring-1 ring-white/15 backdrop-blur-md max-lg:landscape:w-64">
      {/* State / Mode Badge */}
      <div className="mb-2 flex items-center justify-center gap-2 text-[10px] font-semibold tracking-wider">
        <span
          className={cn(
            "flex items-center gap-1 rounded px-2 py-0.5",
            live ? "bg-red-500/90" : "bg-white/20"
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full bg-white", live && "animate-pulse")} />
          {live ? "SCANNING" : state === "paused" ? "PAUSED" : "STANDBY"}
        </span>

        {isGenuineAI ? (
          <span className="flex items-center gap-1 rounded bg-emerald-500 px-2 py-0.5 text-white">
            <Sparkles className="h-3 w-3" />
            AI DETECTING
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded bg-white/20 px-2 py-0.5 font-medium text-white">
            <Sliders className="h-3 w-3" />
            {wsStatus === "connecting" ? "AI CONNECTING" : "MANUAL COUNT"}
          </span>
        )}
      </div>

      {/* Large Total People Count Display */}
      <p
        className="text-6xl font-bold leading-none tracking-tight tabular-nums [text-shadow:0_2px_12px_rgba(0,0,0,.7)] sm:text-7xl max-lg:landscape:text-5xl"
        data-testid="count"
      >
        {count.toLocaleString()}
      </p>
      <p className="mt-2 text-xs font-semibold tracking-[0.2em] text-white/90">
        TOTAL PEOPLE COUNTED
      </p>

      {/* Genuine AI Breakdown: in-frame detections vs unique tracked session total */}
      {isGenuineAI && (
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-white/85">
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 tabular-nums">
            {activeInFrame} in frame
          </span>
          <span className="rounded-full bg-emerald-500/25 px-2.5 py-0.5 tabular-nums text-emerald-200">
            {aiUniqueCount} unique tracked
          </span>
          {manualAdjustment !== 0 && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 tabular-nums">
              {manualAdjustment > 0 ? `+${manualAdjustment}` : manualAdjustment} manual
            </span>
          )}
        </div>
      )}

      {/* Manual Adjuster Controls (when AI vision is not active) */}
      {live && !isGenuineAI && (
        <div className="mt-4 flex items-center justify-center gap-4 rounded-2xl bg-white/10 p-2.5">
          <button
            onClick={() => onAdjust(-1)}
            aria-label="Subtract 1 person"
            className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 transition-transform hover:bg-white/25 active:scale-95"
          >
            <Minus className="h-5 w-5" />
          </button>
          <span className="text-xs font-medium text-white/80">Adjust Count</span>
          <button
            onClick={() => onAdjust(1)}
            aria-label="Add 1 person"
            className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white transition-transform hover:bg-brand-dark active:scale-95"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      )}

      {aiError && (
        <p className="mt-2 text-[11px] text-amber-300">{aiError}</p>
      )}

      {live && !isGenuineAI && !aiError && (
        <p className="mt-2.5 text-[11px] text-white/70">
          {aiMessage || "AI vision engine is not connected. Tap + or − to adjust count manually."}
        </p>
      )}

      {live && isGenuineAI && !aiError && (
        <p className="mt-2 text-[11px] text-emerald-300">
          YOLOv8 + ByteTrack actively counting people.
        </p>
      )}
    </div>
  );
}
