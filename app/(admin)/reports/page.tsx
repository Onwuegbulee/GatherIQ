"use client";
import { useMemo, useState } from "react";
import { CalendarDays, Download, TrendingUp, Users, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SampleBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/page-header";
import { COLORS, GenderBars, GenderDonut, GroupedBars, TrackBars, TrendArea } from "@/components/charts/charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { useUI } from "@/components/ui-provider";
import { useApp } from "@/context/app-context";
import { averageByType, avg, chronological, genderTotals, growth, sum, sundaySeries, trendPoints } from "@/lib/stats";
import { downloadCsv } from "@/lib/csv";
import { cn, formatDate, formatMinutes } from "@/lib/utils";

const DAY = 86_400_000;
const presets = [{ id: "4w", label: "4 weeks", days: 28 }, { id: "12w", label: "12 weeks", days: 84 }, { id: "6m", label: "6 months", days: 183 }, { id: "all", label: "All time", days: 0 }];
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export default function ReportsPage() {
  const { records } = useApp();
  const ui = useUI();
  const latest = records[0]?.date ?? iso(Date.now());
  const [preset, setPreset] = useState("12w");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const range = useMemo(() => {
    if (from || to) return { from, to };
    const p = presets.find((x) => x.id === preset)!;
    return { from: p.days ? iso(Date.parse(latest) - p.days * DAY) : "", to: "" };
  }, [from, to, preset, latest]);
  const data = useMemo(() => records.filter((r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to)), [records, range]);

  const weekly = useMemo(() => {
    const m = new Map<string, number>();
    chronological(data).forEach((r) => { const d = new Date(r.date + "T00:00:00Z"); const k = iso(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY); m.set(k, (m.get(k) ?? 0) + r.attendance); });
    return Array.from(m, ([k, v]) => ({ name: formatDate(k, { day: "numeric", month: "short" }), value: v })).slice(-10);
  }, [data]);
  const monthly = useMemo(() => {
    const m = new Map<string, Record<string, number[]>>();
    chronological(data).forEach((r) => { const k = r.date.slice(0, 7); const g = m.get(k) ?? {}; (g[r.serviceType] ??= []).push(r.attendance); m.set(k, g); });
    const mean = (a?: number[]) => (a?.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
    return Array.from(m, ([k, g]) => ({ label: formatDate(k + "-01", { month: "short", year: "2-digit" }), Sunday: mean(g["Sunday Service"]), Wednesday: mean(g["Wednesday Service"]), Special: mean(g["Special Programmes"]) }));
  }, [data]);
  const g = growth(data);
  const gt = genderTotals(data);
  const trend = trendPoints(data, 16);

  const exportCsv = () => { downloadCsv(`churchcount-report-${latest}.csv`, [
    ["Service", "Service type", "Date", "Attendance", "Men", "Women", "Duration", "Status", "Source"],
    ...data.map((r) => [r.serviceName, r.serviceType, r.date, r.attendance, r.male, r.female, formatMinutes(r.durationSeconds), r.status, r.isSample ? "Sample" : "Saved"]),
  ]); ui.toast("Report downloaded"); };

  return (
    <>
      <PageHeader title="Reports" description="Attendance trends and comparisons for the period you choose." actions={<Button onClick={exportCsv} disabled={!data.length}><Download className="h-4 w-4" />Download report (CSV)</Button>} />
      <Card className="mb-6 flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Date range">
          {presets.map((p) => <button key={p.id} onClick={() => { setPreset(p.id); setFrom(""); setTo(""); }} aria-pressed={!from && !to && preset === p.id} className={cn("h-9 rounded-xl px-3.5 text-sm font-medium", !from && !to && preset === p.id ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100")}>{p.label}</button>)}
        </div>
        <div className="flex items-center gap-2"><Input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /><span className="text-sm text-muted">to</span><Input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
      </Card>

      {data.length === 0 ? (
        <Card className="px-6 py-16 text-center"><p className="font-medium">No attendance in this period</p><p className="mt-1 text-sm text-muted">Pick a wider date range to see trends.</p></Card>
      ) : (<>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard variant="dark" icon={UsersRound} label="Average attendance" value={avg(data)} hint="Per session" spark={trend.map((p) => p.attendance)} />
          <StatCard variant="mint" icon={Users} label="Total counted" value={sum(data)} hint="All sessions in period" />
          <StatCard icon={CalendarDays} label="Sessions" value={data.length} hint="In selected period" />
          <StatCard icon={TrendingUp} label="Sunday growth" value={g} decimals={1} prefix={g >= 0 ? "+" : ""} suffix="%" hint="Latest vs previous Sunday" spark={sundaySeries(data)} />
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-8"><CardHeader className="flex-row justify-between"><div><CardTitle>Attendance trend</CardTitle><CardDescription>Every session, oldest to newest</CardDescription></div><SampleBadge /></CardHeader><CardContent><TrendArea data={trend} /></CardContent></Card>
          <Card className="xl:col-span-4"><CardHeader className="flex-row justify-between"><div><CardTitle>Men and women</CardTitle><CardDescription>In the selected period</CardDescription></div><SampleBadge /></CardHeader>
            <CardContent><GenderDonut male={gt.male} female={gt.female} size={180} /><div className="mt-4 flex justify-center gap-5 text-sm"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS.male }} />Men <b className="tabular-nums">{gt.male.toLocaleString()}</b></span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS.female }} />Women <b className="tabular-nums">{gt.female.toLocaleString()}</b></span></div></CardContent></Card>
          <Card className="xl:col-span-6"><CardHeader className="flex-row justify-between"><div><CardTitle>Weekly attendance</CardTitle><CardDescription>Total counted per week</CardDescription></div><SampleBadge /></CardHeader><CardContent><TrackBars data={weekly} unit="Total" /></CardContent></Card>
          <Card className="xl:col-span-6"><CardHeader className="flex-row justify-between"><div><CardTitle>Men and women by service</CardTitle><CardDescription>Latest 10 sessions</CardDescription></div><SampleBadge /></CardHeader><CardContent><GenderBars data={trendPoints(data, 10).map((p) => ({ label: p.label, male: p.male, female: p.female }))} height={260} /></CardContent></Card>
          <Card className="xl:col-span-8"><CardHeader className="flex-row justify-between"><div><CardTitle>Monthly attendance by service</CardTitle><CardDescription>Average per session each month</CardDescription></div><SampleBadge /></CardHeader>
            <CardContent><GroupedBars data={monthly} keys={[{ key: "Sunday", name: "Sunday Service", color: "#16A34A" }, { key: "Wednesday", name: "Wednesday Service", color: "#86EFAC" }, { key: "Special", name: "Special Programmes", color: "#0F172A" }]} /></CardContent></Card>
          <Card className="xl:col-span-4"><CardHeader><CardTitle>Service comparison</CardTitle><CardDescription>Average per session</CardDescription></CardHeader><CardContent><TrackBars data={averageByType(data).map((a) => ({ name: a.name, value: a.average }))} height={300} /></CardContent></Card>
        </div>
      </>)}
    </>
  );
}
