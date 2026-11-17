"use client";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { ServiceIcon } from "@/lib/service-meta";
import { COLORS } from "@/components/charts/charts";
import { formatDate, formatDuration } from "@/lib/utils";
import type { AttendanceRecord } from "@/lib/types";

export function GenderSplit({ male, female }: { male: number; female: number }) {
  const t = male + female || 1;
  const wp = Math.round((female / t) * 100);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full transition-[width] duration-700" style={{ width: `${100 - wp}%`, background: COLORS.male }} />
        <div className="h-full transition-[width] duration-700" style={{ width: `${wp}%`, background: COLORS.female }} />
      </div>
      <div className="mt-2.5 flex justify-between text-sm">
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS.male }} />Men <b className="tabular-nums">{male.toLocaleString()}</b><span className="text-muted">({100 - wp}%)</span></span>
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS.female }} />Women <b className="tabular-nums">{female.toLocaleString()}</b><span className="text-muted">({wp}%)</span></span>
      </div>
    </div>
  );
}

export function RecordDetails({ record: r }: { record: AttendanceRecord }) {
  const rows: [string, string][] = [
    ["Service type", r.serviceType], ["Date", formatDate(r.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })],
    ["Scanning duration", formatDuration(r.durationSeconds)], ["Session status", "Completed"], ["Created by", r.createdBy],
    ["Confirmation status", r.status === "Confirmed" ? "Confirmed by administrator" : "Awaiting confirmation"],
  ];
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <ServiceIcon type={r.serviceType} className="h-11 w-11" />
        <div className="min-w-0"><p className="truncate font-semibold">{r.serviceName}</p><p className="text-sm text-muted">{formatDate(r.date)}</p></div>
        <div className="ml-auto flex flex-col items-end gap-1"><StatusBadge status={r.status} />{r.isSample ? <Badge tone="amber">Sample data</Badge> : <Badge tone="green">Saved here</Badge>}</div>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-forest to-forest-800 p-6 text-center text-white">
        <p className="text-6xl font-semibold tabular-nums tracking-tight">{r.attendance.toLocaleString()}</p>
        <p className="mt-1 text-xs font-medium tracking-[0.2em] text-white/70">PEOPLE COUNTED</p>
      </div>
      <div className="rounded-2xl border border-line p-4"><p className="mb-3 text-sm font-medium">Men and women</p><GenderSplit male={r.male} female={r.female} /></div>
      <dl className="divide-y divide-line rounded-2xl border border-line">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
      </dl>
      {r.description && <div className="rounded-2xl border border-line p-4 text-sm"><p className="text-muted">Description</p><p className="mt-1">{r.description}</p></div>}
    </div>
  );
}
