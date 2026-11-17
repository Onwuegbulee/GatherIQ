"use client";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/use-count-up";
import { MiniBars, Sparkline } from "@/components/charts/charts";

export function StatCard({ label, value, decimals = 0, prefix = "", suffix = "", hint, icon: Icon, variant = "light", spark, bars, delta, onDetails }: {
  label: string; value: number; decimals?: number; prefix?: string; suffix?: string; hint?: string;
  icon: React.ComponentType<{ className?: string }>; variant?: "dark" | "mint" | "light";
  spark?: number[]; bars?: number[]; delta?: number; onDetails?: () => void;
}) {
  const v = useCountUp(value);
  const dark = variant === "dark";
  const text = `${prefix}${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border p-5 shadow-card",
      dark ? "border-forest bg-gradient-to-br from-forest via-forest-800 to-[#166534] text-white" : variant === "mint" ? "border-green-200/70 bg-gradient-to-br from-brand-soft to-brand-light/70" : "border-slate-200/70 bg-white")}>
      {dark && <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />}
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn("grid h-9 w-9 place-items-center rounded-xl", dark ? "bg-white/15" : "bg-white text-brand-dark shadow-sm ring-1 ring-black/5")}><Icon className="h-[18px] w-[18px]" /></span>
          <p className={cn("text-sm font-medium", dark ? "text-white/80" : "text-slate-600")}>{label}</p>
        </div>
        {onDetails && <button onClick={onDetails} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", dark ? "border-white/25 hover:bg-white/10" : "border-line bg-white/70 hover:bg-white")}>See details</button>}
      </div>
      <div className="relative mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-4xl font-semibold leading-none tracking-tight tabular-nums">{text}</p>
          {hint && <p className={cn("mt-2 truncate text-xs", dark ? "text-white/70" : "text-muted")}>{hint}</p>}
        </div>
        {delta !== undefined && (
          <span className={cn("flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-xs font-semibold", dark ? "bg-white/15 text-white" : delta >= 0 ? "bg-brand-light text-brand-dark" : "bg-red-100 text-red-700")}>
            {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {spark && <Sparkline data={spark} stroke={dark ? "#86EFAC" : "#16A34A"} className="relative -mx-1 mt-3 h-12 w-[calc(100%+0.5rem)]" />}
      {bars && <div className="relative mt-3"><MiniBars data={bars} /></div>}
    </div>
  );
}
