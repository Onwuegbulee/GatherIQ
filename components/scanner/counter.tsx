"use client";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Gender } from "@/hooks/use-attendance-session";

function Stepper({ label, value, dot, onAdjust, enabled }: { label: string; value: number; dot: string; onAdjust: (d: number) => void; enabled: boolean }) {
  return (
    <div className="flex-1 rounded-xl bg-white/10 px-2 py-2">
      <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-white/80"><i className="h-2 w-2 rounded-full" style={{ background: dot }} />{label}</p>
      <p className="text-2xl font-semibold tabular-nums leading-tight">{value.toLocaleString()}</p>
      {enabled && (
        <div className="mt-1 flex justify-center gap-1.5">
          <button onClick={() => onAdjust(-1)} aria-label={`Subtract 1 ${label}`} className="grid h-9 w-9 place-items-center rounded-full bg-white/15 active:scale-95"><Minus className="h-4 w-4" /></button>
          <button onClick={() => onAdjust(1)} aria-label={`Add 1 ${label}`} className="grid h-9 w-9 place-items-center rounded-full bg-white/25 active:scale-95"><Plus className="h-4 w-4" /></button>
        </div>)}
    </div>
  );
}

export function Counter({ male, female, count, state, onAdjust }: { male: number; female: number; count: number; state: string; onAdjust: (g: Gender, d: number) => void }) {
  const live = state === "recording";
  return (
    <div className="w-[min(92vw,340px)] rounded-3xl bg-black/50 px-4 py-3 text-center ring-1 ring-white/15 backdrop-blur-md max-lg:landscape:w-64">
      <div className="mb-1 flex items-center justify-center gap-2 text-[10px] font-semibold tracking-wider">
        <span className={cn("flex items-center gap-1 rounded px-1.5 py-0.5", live ? "bg-red-500/90" : "bg-white/20")}><span className={cn("h-1.5 w-1.5 rounded-full bg-white", live && "animate-pulse")} />{live ? "LIVE" : state === "paused" ? "PAUSED" : "STANDBY"}</span>
        <span className="rounded bg-amber-400/90 px-1.5 py-0.5 text-slate-900">DEMO MODE</span>
      </div>
      <p className="text-6xl font-semibold leading-none tracking-tight tabular-nums [text-shadow:0_2px_8px_rgba(0,0,0,.6)] sm:text-7xl max-lg:landscape:text-5xl" data-testid="count">{count.toLocaleString()}</p>
      <p className="mb-2 mt-1.5 text-xs font-medium tracking-[0.2em] text-white/85">PEOPLE DETECTED</p>
      <div className="flex gap-2">
        <Stepper label="Men" value={male} dot="#14532D" enabled={live} onAdjust={(d) => onAdjust("male", d)} />
        <Stepper label="Women" value={female} dot="#4ADE80" enabled={live} onAdjust={(d) => onAdjust("female", d)} />
      </div>
      {live && <p className="mt-2 text-[10px] text-white/55">Test counters. Tap + or − to simulate counts.</p>}
    </div>
  );
}
