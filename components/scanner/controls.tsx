"use client";
import { cn } from "@/lib/utils";

export function RoundButton({ label, onClick, disabled, size = "md", tone = "glass", children }: {
  label: string; onClick: () => void; disabled?: boolean; size?: "md" | "lg"; tone?: "glass" | "brand" | "danger" | "amber"; children: React.ReactNode;
}) {
  return (
    <div className="flex w-20 flex-col items-center gap-1.5">
      <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
        className={cn("grid place-items-center rounded-full transition active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60",
          size === "lg" ? "h-20 w-20" : "h-14 w-14",
          tone === "glass" && "bg-white/15 text-white backdrop-blur-md hover:bg-white/25",
          tone === "brand" && "bg-brand text-white hover:bg-brand-dark",
          tone === "amber" && "bg-amber-500 text-white hover:bg-amber-600",
          tone === "danger" && "bg-danger text-white hover:bg-red-600")}>
        {children}
      </button>
      <span className="text-[11px] font-medium text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.8)]">{label}</span>
    </div>
  );
}

export function StatusPill({ state, time }: { state: string; time: string }) {
  const map: Record<string, { text: string; dot: string }> = {
    ready: { text: "Ready", dot: "bg-slate-300" },
    recording: { text: "Recording", dot: "bg-red-500 animate-pulse" },
    paused: { text: "Paused", dot: "bg-amber-400" },
    processing: { text: "Processing", dot: "bg-brand" },
    completed: { text: "Completed", dot: "bg-brand" },
  };
  const s = map[state];
  return (
    <div className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-xs font-medium backdrop-blur-md" role="status" aria-live="polite">
      <span className={cn("h-2 w-2 rounded-full", s.dot)} />
      <span>{s.text}</span>
      {(state === "recording" || state === "paused") && <span className="tabular-nums text-white/80">{time}</span>}
    </div>
  );
}
