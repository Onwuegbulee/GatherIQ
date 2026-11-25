"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, BarChart3, CalendarCheck, Crown, Lightbulb, Plus, RefreshCw, TrendingUp, Users, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Gauge, TrackBars, TrendArea, WeekdayRadar } from "@/components/charts/charts";
import { StatusBadge } from "@/components/status-badge";
import { ServiceIcon } from "@/lib/service-meta";
import { useUI } from "@/components/ui-provider";
import { useApp } from "@/context/app-context";
import { avg, chronological, growth, runningAverage, sessionsPerMonth, sundaySeries, topBy, trendPoints, weekdayAverages } from "@/lib/stats";
import { cn, formatDate, formatMinutes, todayISO } from "@/lib/utils";

function EmptyChart({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 text-center">
      <BarChart3 className="h-8 w-8 text-slate-300" />
      <p className="mt-2.5 text-sm font-medium text-slate-700">{message}</p>
      <p className="mt-1 text-xs text-muted">Attendance data will appear here after your church records its first session.</p>
      {actionLabel && onAction && (
        <Button size="sm" variant="outline" className="mt-4" onClick={onAction}>
          <Plus className="h-3.5 w-3.5" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { records, settings, dataLoading, dataError, refreshData } = useApp();
  const ui = useUI();
  const [greeting, setGreeting] = useState("Good morning");
  const [today, setToday] = useState("");
  const [range, setRange] = useState(8);
  const [tab, setTab] = useState<"All" | "Confirmed" | "Pending">("All");
  const [insight, setInsight] = useState(0);

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
    setToday(new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()));
  }, []);

  const todays = records.filter((r) => r.date === todayISO());
  const latest = todays[0] ?? records[0];
  const g = growth(records);
  const trend = useMemo(() => trendPoints(records, range), [records, range]);
  const spark = useMemo(() => trendPoints(records, 12).map((p) => p.attendance), [records]);
  const latestSunday = chronological(records.filter((r) => r.serviceType === "Sunday Service")).pop();
  const goalPct = latestSunday ? (latestSunday.attendance / Math.max(1, settings.attendanceTarget)) * 100 : 0;
  const confirmedPct = records.length ? (records.filter((r) => r.status === "Confirmed").length / records.length) * 100 : 0;
  const pending = records.filter((r) => r.status === "Pending").length;
  const top = topBy(records, 5);
  const recent = records.filter((r) => tab === "All" || r.status === tab).slice(0, 6);
  const last8 = trendPoints(records, 8);
  const hasRecords = records.length > 0;

  const insights = useMemo(() => {
    if (records.length === 0) {
      return [
        "No attendance sessions yet. Start your first attendance session to begin recording attendance.",
        "Insights and growth comparisons will appear automatically once your church records services.",
      ];
    }
    const list = [
      `Sunday attendance is ${g >= 0 ? "up" : "down"} ${Math.abs(g).toFixed(1)}% compared with the previous Sunday.`,
      `You have recorded ${records.length} total attendance session${records.length === 1 ? "" : "s"} across all service types.`,
      top[0] ? `Your busiest service was ${top[0].serviceName} on ${formatDate(top[0].date)} with ${top[0].attendance.toLocaleString()} people.` : "Record a service to see highlights here.",
    ];
    if (pending) list.push(`${pending} session${pending > 1 ? "s are" : " is"} waiting for your confirmation.`);
    return list;
  }, [g, top, pending, records.length]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setInsight((i) => (i + 1) % insights.length), 6000);
    return () => clearInterval(id);
  }, [insights.length]);

  const churchName = settings.churchName.trim();

  return (
    <>
      <PageHeader
        title={`${greeting}${churchName ? `, ${churchName}` : ""}.`}
        description={`Here's an overview of your church attendance.${today ? ` ${today}.` : ""}`}
        actions={<Button onClick={ui.openNewAttendance}><Plus className="h-4 w-4" />New Attendance</Button>}
      />

      {dataError && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{dataError}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => refreshData()} disabled={dataLoading}>
            <RefreshCw className={cn("h-3.5 w-3.5", dataLoading && "animate-spin")} />
            Retry
          </Button>
        </div>
      )}

      {dataLoading && !hasRecords ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            variant="dark"
            icon={Users}
            label={todays.length ? "Today's Attendance" : "Latest Attendance"}
            value={todays.length ? todays.reduce((a, r) => a + r.attendance, 0) : latest?.attendance ?? 0}
            hint={latest ? `${latest.serviceName} · ${formatDate(latest.date, { day: "numeric", month: "short" })}` : "No sessions yet"}
            spark={spark}
            delta={hasRecords ? g : undefined}
            onDetails={() => latest && ui.openRecord(latest.id)}
          />
          <StatCard
            variant="mint"
            icon={UsersRound}
            label="Average Attendance"
            value={avg(records)}
            hint={hasRecords ? "Across all recorded sessions" : "No sessions yet"}
            spark={runningAverage(chronological(records).slice(-12).map((r) => r.attendance))}
          />
          <StatCard
            icon={CalendarCheck}
            label="Total Sessions"
            value={records.length}
            hint={hasRecords ? "Recorded attendance sessions" : "No sessions yet"}
            bars={sessionsPerMonth(records)}
          />
          <StatCard
            icon={TrendingUp}
            label="Attendance Growth"
            value={g}
            decimals={1}
            prefix={g >= 0 ? "+" : ""}
            suffix="%"
            hint={hasRecords ? "Latest Sunday vs the one before" : "Needs 2+ Sunday services"}
            spark={sundaySeries(records)}
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Attendance overview</CardTitle><CardDescription>Attendance counted across your recent sessions</CardDescription></div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Range">
                {[8, 16, 99].map((n) => <button key={n} onClick={() => setRange(n)} aria-pressed={range === n} className={cn("h-7 rounded-lg px-3 text-xs font-medium", range === n ? "bg-white shadow-sm" : "text-muted")}>{n === 99 ? "All" : `Last ${n}`}</button>)}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {trend.length === 0 ? (
              <EmptyChart message="No attendance trends to display" actionLabel="Start New Attendance" onAction={ui.openNewAttendance} />
            ) : (
              <TrendArea data={trend} />
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader className="flex-row items-start justify-between"><div><CardTitle>Attendance by service</CardTitle><CardDescription>Share of all recorded attendees</CardDescription></div></CardHeader>
          <CardContent>
            {!hasRecords ? (
              <EmptyChart message="No service breakdown yet" />
            ) : (
              <div className="space-y-4 pt-2">
                {Array.from(new Set(records.map((r) => r.serviceType))).slice(0, 4).map((type) => {
                  const typeTotal = records.filter((r) => r.serviceType === type).reduce((a, b) => a + b.attendance, 0);
                  const allTotal = records.reduce((a, b) => a + b.attendance, 0) || 1;
                  const pct = ((typeTotal / allTotal) * 100).toFixed(1);
                  return (
                    <div key={type}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-800">{type}</span>
                        <span><b className="tabular-nums">{typeTotal.toLocaleString()}</b> <span className="text-muted">· {pct}%</span></span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader><CardTitle>Goals and confirmation</CardTitle><CardDescription>Sunday goal is set in Settings</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 pt-4">
            <Gauge value={goalPct} label="Sunday goal" sub={latestSunday ? `${latestSunday.attendance.toLocaleString()} of ${settings.attendanceTarget.toLocaleString()}` : "No Sunday yet"} />
            <Gauge value={confirmedPct} label="Confirmed" sub={`${records.length - pending} of ${records.length} sessions`} color="#0F766E" />
          </CardContent>
        </Card>

        <Card className="xl:col-span-8">
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Recent session attendance</CardTitle><CardDescription>Total people counted across your last 8 sessions</CardDescription></div>
          </CardHeader>
          <CardContent>
            {last8.length === 0 ? (
              <EmptyChart message="No recorded sessions yet" actionLabel="Start New Attendance" onAction={ui.openNewAttendance} />
            ) : (
              <TrackBars data={last8.map((p) => ({ name: p.label, value: p.attendance }))} height={240} unit="Attendees" />
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader className="flex-row items-start justify-between"><div><CardTitle>Weekly pattern</CardTitle><CardDescription>Average attendance by weekday</CardDescription></div></CardHeader>
          <CardContent>
            {!hasRecords ? (
              <EmptyChart message="No weekly pattern yet" />
            ) : (
              <WeekdayRadar data={weekdayAverages(records)} />
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader><CardTitle className="flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" />Peak services</CardTitle><CardDescription>Your five highest attendances</CardDescription></CardHeader>
          <CardContent className="space-y-1">
            {top.length === 0 ? (
              <EmptyChart message="No peak services yet" />
            ) : (
              top.map((r, i) => (
                <button key={r.id} onClick={() => ui.openRecord(r.id)} className="block w-full rounded-xl p-2.5 text-left hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs font-semibold">{i + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.serviceName}</span><span className="block text-xs text-muted">{formatDate(r.date)}</span></span>
                    <span className="text-sm font-semibold tabular-nums">{r.attendance.toLocaleString()}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${(r.attendance / (top[0].attendance || 1)) * 100}%` }} /></div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#16A34A] via-[#0F9D6B] to-[#0E7490] p-6 text-white shadow-card xl:col-span-4">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
          <div className="relative flex h-full min-h-[260px] flex-col">
            <div className="flex items-center gap-2 text-sm font-medium text-white/90"><Lightbulb className="h-4 w-4" />Insight from your records</div>
            <p key={insight} className="mt-6 flex-1 text-xl font-medium leading-snug animate-fade-in">{insights[insight % insights.length]}</p>
            <div className="mt-6 flex items-center justify-between">
              <div className="flex gap-1.5">{insights.map((_, i) => <button key={i} onClick={() => setInsight(i)} aria-label={`Insight ${i + 1}`} className={cn("h-1.5 rounded-full transition-all", i === insight % insights.length ? "w-6 bg-white" : "w-1.5 bg-white/50")} />)}</div>
              <span className="text-xs text-white/70">Calculated from saved counts</span>
            </div>
          </div>
        </div>

        <Card className="xl:col-span-4">
          <CardHeader><CardTitle>Quick actions</CardTitle><CardDescription>Jump straight to what you need</CardDescription></CardHeader>
          <CardContent className="grid gap-2">
            <button onClick={ui.openNewAttendance} className="flex items-center gap-3 rounded-xl border border-line p-3 text-left hover:bg-slate-50"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-light text-brand-dark"><Plus className="h-4 w-4" /></span><span><b className="block text-sm">Start a new count</b><span className="text-xs text-muted">Opens a quick setup popup</span></span></button>
            <Link href="/attendance/history" className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-slate-50"><span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-50 text-sky-600"><CalendarCheck className="h-4 w-4" /></span><span><b className="block text-sm">Review history</b><span className="text-xs text-muted">Filter, sort and confirm sessions</span></span></Link>
            <Link href="/reports" className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-slate-50"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600"><TrendingUp className="h-4 w-4" /></span><span><b className="block text-sm">Download a report</b><span className="text-xs text-muted">Trends and a CSV export</span></span></Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div><CardTitle>Recent attendance</CardTitle><CardDescription>Select a row to open its details</CardDescription></div>
          <div className="flex rounded-xl bg-slate-100 p-1" role="tablist">
            {(["All", "Confirmed", "Pending"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("h-7 rounded-lg px-3 text-xs font-medium", tab === t ? "bg-white shadow-sm" : "text-muted")}>{t}</button>)}
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[680px] text-sm">
              <thead><tr className="text-left text-xs text-muted">{["Service", "Date", "Attendance", "Method", "Duration", "Status"].map((h) => <th key={h} className="bg-slate-50 px-5 py-2.5 font-medium first:rounded-l-xl last:rounded-r-xl">{h}</th>)}</tr></thead>
              <tbody>
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-muted">
                      {hasRecords ? `No ${tab.toLowerCase()} sessions.` : "No attendance sessions yet. Start your first attendance session to begin recording attendance."}
                    </td>
                  </tr>
                )}
                {recent.map((r) => (
                  <tr key={r.id} onClick={() => ui.openRecord(r.id)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ServiceIcon type={r.serviceType} />
                        <div>
                          <p className="font-medium">{r.serviceName}</p>
                          <Badge tone={r.countSource === "ai" ? "green" : "slate"}>{r.countSource === "ai" ? "AI Verified" : "Saved"}</Badge>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted">{formatDate(r.date)}</td>
                    <td className="px-5 py-3 font-semibold tabular-nums">{r.attendance.toLocaleString()}</td>
                    <td className="px-5 py-3 text-xs font-medium text-muted">{r.countSource === "ai" ? "AI Count" : "Manual"}</td>
                    <td className="px-5 py-3 text-muted">{formatMinutes(r.durationSeconds)}</td>
                    <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
