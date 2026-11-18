"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AttendanceRecord } from "@/lib/types";
import type { TrendPoint } from "@/lib/stats";
import { formatDate } from "@/lib/utils";

export const COLORS = { male: "#14532D", female: "#4ADE80", brand: "#16A34A", track: "#EEF2F6" };
const axis = { stroke: "#94A3B8", fontSize: 12, tickLine: false, axisLine: false } as const;
const uid = (raw: string) => raw.replace(/:/g, "");

/* ---------- Sparkline ---------- */
export function Sparkline({ data, stroke = "#16A34A", className }: { data: number[]; stroke?: string; className?: string }) {
  const id = uid(useId());
  if (data.length < 2) return null;
  const min = Math.min(...data), span = Math.max(...data) - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * 100, 30 - ((v - min) / span) * 26] as const);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) { const cx = (pts[i - 1][0] + pts[i][0]) / 2; d += ` C${cx},${pts[i - 1][1]} ${cx},${pts[i][1]} ${pts[i][0]},${pts[i][1]}`; }
  return (
    <svg viewBox="0 0 100 34" preserveAspectRatio="none" className={className} aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={stroke} stopOpacity=".32" /><stop offset="1" stopColor={stroke} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L100,34 L0,34 Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Mini bars ---------- */
export function MiniBars({ data, color = "#16A34A", track = "#E2E8F0" }: { data: number[]; color?: string; track?: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-12 items-end gap-1.5" aria-hidden>
      {data.map((v, i) => (
        <div key={i} className="relative flex-1 rounded-md" style={{ height: "100%", background: track }}>
          <div className="absolute inset-x-0 bottom-0 rounded-md transition-[height] duration-700" style={{ height: `${(v / max) * 100}%`, background: i === data.length - 1 ? color : `${color}99` }} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Trend area ---------- */
function TrendTip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="min-w-[170px] rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-pop">
      <p className="font-semibold text-ink">{p.name}</p>
      <p className="text-muted">{formatDate(p.date)}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{p.attendance.toLocaleString()}</p>
      <p className="mt-1 text-[11px] font-medium tracking-wide text-brand-dark">TOTAL PEOPLE COUNTED</p>
    </div>
  );
}

export function TrendArea({ data, height = 300 }: { data: TrendPoint[]; height?: number }) {
  const id = uid(useId());
  return (
    <div style={{ height }} role="img" aria-label="Attendance trend chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#16A34A" stopOpacity=".35" /><stop offset="1" stopColor="#16A34A" stopOpacity="0" /></linearGradient></defs>
          <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="label" {...axis} dy={8} />
          <YAxis {...axis} domain={["dataMin - 150", "dataMax + 150"]} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)} />
          <Tooltip content={<TrendTip />} cursor={{ stroke: "#16A34A", strokeDasharray: "4 4" }} />
          <Area type="monotone" dataKey="attendance" stroke="#16A34A" strokeWidth={2.5} fill={`url(#${id})`} dot={{ r: 3, fill: "#fff", stroke: "#16A34A", strokeWidth: 2 }} activeDot={{ r: 6, fill: "#16A34A", stroke: "#fff", strokeWidth: 3 }} animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Gender donut ---------- */
export function GenderDonut({ male, female, size = 200 }: { male: number; female: number; size?: number }) {
  const data = [{ name: "Women", value: female, fill: COLORS.female }, { name: "Men", value: male, fill: COLORS.male }];
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }} role="img" aria-label={`Men ${male}, women ${female}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius="70%" outerRadius="100%" paddingAngle={4} cornerRadius={10} stroke="none" startAngle={90} endAngle={-270} animationDuration={900}>
            {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div><p className="text-2xl font-semibold tabular-nums tracking-tight">{(male + female).toLocaleString()}</p><p className="text-xs text-muted">People counted</p></div>
      </div>
    </div>
  );
}

/* ---------- Gender stacked bars with ghost track ---------- */
function StackTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-pop">
      <p className="mb-1.5 font-semibold">{label}</p>
      {payload.map((p) => <div key={p.name} className="flex items-center justify-between gap-4"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}</span><b className="tabular-nums">{p.value.toLocaleString()}</b></div>)}
    </div>
  );
}
export function GenderBars({ data, height = 280 }: { data: { label: string; male: number; female: number }[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Men and women attendance by service">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="label" {...axis} dy={8} />
          <YAxis {...axis} />
          <Tooltip content={<StackTip />} cursor={{ fill: "rgba(148,163,184,.12)" }} />
          <Bar dataKey="male" name="Men" stackId="g" fill={COLORS.male} radius={[0, 0, 8, 8]} maxBarSize={34} background={{ fill: COLORS.track, radius: 8 }} animationDuration={900} />
          <Bar dataKey="female" name="Women" stackId="g" fill={COLORS.female} radius={[8, 8, 0, 0]} maxBarSize={34} animationDuration={900} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Ghost-track bars ---------- */
export function TrackBars({ data, height = 260, unit = "Average" }: { data: { name: string; value: number }[]; height?: number; unit?: string }) {
  return (
    <div style={{ height }} role="img" aria-label="Attendance bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} barCategoryGap="26%">
          <XAxis dataKey="name" {...axis} dy={8} />
          <YAxis {...axis} />
          <Tooltip cursor={{ fill: "rgba(148,163,184,.12)" }} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }} formatter={(v: number) => [v.toLocaleString(), unit]} />
          <Bar dataKey="value" fill="#16A34A" radius={[8, 8, 8, 8]} maxBarSize={44} background={{ fill: COLORS.track, radius: 8 }} animationDuration={900} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GroupedBars({ data, keys, height = 300 }: { data: Record<string, string | number>[]; keys: { key: string; color: string; name: string }[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Attendance comparison chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="label" {...axis} dy={8} />
          <YAxis {...axis} />
          <Tooltip cursor={{ fill: "rgba(148,163,184,.12)" }} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }} />
          {keys.map((k) => <Bar key={k.key} dataKey={k.key} name={k.name} fill={k.color} radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={900} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Gauge with needle ---------- */
export function Gauge({ value, label, sub, color = "#16A34A" }: { value: number; label: string; sub?: string; color?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const [p, setP] = useState(0);
  useEffect(() => { const t = requestAnimationFrame(() => setP(pct)); return () => cancelAnimationFrame(t); }, [pct]);
  return (
    <div className="text-center">
      <svg viewBox="0 0 120 70" className="mx-auto w-full max-w-[170px]" role="img" aria-label={`${label}: ${Math.round(value)}%`}>
        <path d="M10,62 A50,50 0 0 1 110,62" fill="none" stroke="#E8EEF2" strokeWidth="10" strokeLinecap="round" pathLength={100} />
        <path d="M10,62 A50,50 0 0 1 110,62" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" pathLength={100} strokeDasharray={`${p} 100`} style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1)" }} />
        <g style={{ transform: `rotate(${-90 + p * 1.8}deg)`, transformOrigin: "60px 62px", transition: "transform 1.1s cubic-bezier(.2,.8,.2,1)" }}>
          <line x1="60" y1="62" x2="60" y2="26" stroke="#0F172A" strokeWidth="2.2" strokeLinecap="round" /><circle cx="60" cy="62" r="4.5" fill="#0F172A" /><circle cx="60" cy="62" r="1.6" fill="#fff" />
        </g>
      </svg>
      <p className="-mt-1 text-2xl font-semibold tabular-nums tracking-tight">{Math.round(value)}%</p>
      <p className="text-sm font-medium">{label}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

/* ---------- Weekday radar ---------- */
export function WeekdayRadar({ data, height = 240 }: { data: { day: string; avg: number }[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Average attendance by weekday">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#E2E8F0" />
          <PolarAngleAxis dataKey="day" tick={{ fontSize: 12, fill: "#64748B" }} />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }} formatter={(v: number) => [v.toLocaleString(), "Average"]} />
          <Radar dataKey="avg" stroke="#16A34A" strokeWidth={2} fill="#16A34A" fillOpacity={0.25} animationDuration={900} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Calendar heatmap ---------- */
const DAY = 86_400_000;
export function Heatmap({ records, weeks = 26 }: { records: AttendanceRecord[]; weeks?: number }) {
  const { cells, max } = useMemo(() => {
    const byDay = new Map<string, number>();
    records.forEach((r) => byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.attendance));
    const latest = records.reduce((m, r) => (r.date > m ? r.date : m), records[0]?.date ?? "2026-01-01");
    const end = Date.parse(latest + "T00:00:00Z");
    const lastMon = end - ((new Date(end).getUTCDay() + 6) % 7) * DAY;
    const first = lastMon - (weeks - 1) * 7 * DAY;
    const out: { date: string; v: number; future: boolean }[] = [];
    for (let c = 0; c < weeks; c++) for (let d = 0; d < 7; d++) {
      const t = first + (c * 7 + d) * DAY; const date = new Date(t).toISOString().slice(0, 10);
      out.push({ date, v: byDay.get(date) ?? 0, future: t > end });
    }
    return { cells: out, max: Math.max(1, ...Array.from(byDay.values())) };
  }, [records, weeks]);
  const shade = (v: number) => { if (!v) return "#EEF2F6"; const r = v / max; return r < 0.2 ? "#BBF7D0" : r < 0.4 ? "#86EFAC" : r < 0.65 ? "#22C55E" : r < 0.85 ? "#15803D" : "#14532D"; };
  return (
    <div>
      <div className="overflow-x-auto pb-1 scroll-thin"><div className="grid min-w-[420px] grid-flow-col grid-rows-7 gap-[3px]">
        {cells.map((c) => <div key={c.date} title={c.future ? "" : `${formatDate(c.date)}${c.v ? ` · ${c.v.toLocaleString()} people` : " · no session"}`} className="aspect-square rounded-[4px]" style={{ background: c.future ? "transparent" : shade(c.v) }} />)}
      </div></div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-muted">Less{["#EEF2F6", "#BBF7D0", "#22C55E", "#15803D", "#14532D"].map((c) => <i key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />)}More</div>
    </div>
  );
}
