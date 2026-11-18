"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, MoreVertical, Search, SearchX, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/form";
import { MenuItem, Popover } from "@/components/ui/popover";
import { PageHeader } from "@/components/page-header";
import { COLORS, Heatmap } from "@/components/charts/charts";
import { StatusBadge } from "@/components/status-badge";
import { ServiceIcon } from "@/lib/service-meta";
import { useUI } from "@/components/ui-provider";
import { useApp } from "@/context/app-context";
import { avg, sum } from "@/lib/stats";
import { downloadCsv } from "@/lib/csv";
import { cn, formatDate, formatMinutes } from "@/lib/utils";
import type { AttendanceRecord } from "@/lib/types";

type SortKey = "date" | "attendance" | "duration";
const DAY = 86_400_000;

function RowMenu({ r }: { r: AttendanceRecord }) {
  const ui = useUI();
  const { confirmRecord, deleteRecord } = useApp();
  return (
    <Popover className="w-52" trigger={({ toggle }) => <button onClick={(e) => { e.stopPropagation(); toggle(); }} aria-label={`Actions for ${r.serviceName}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-slate-100"><MoreVertical className="h-4 w-4" /></button>}>
      {(close) => (<div onClick={(e) => e.stopPropagation()}>
        <MenuItem onClick={() => { close(); ui.openRecord(r.id); }}><Eye className="h-4 w-4" />View details</MenuItem>
        {r.status === "Pending" && <MenuItem onClick={() => { close(); confirmRecord(r.id); ui.toast("Attendance confirmed"); }}><CheckCircle2 className="h-4 w-4" />Confirm attendance</MenuItem>}
        <MenuItem onClick={() => { close(); downloadCsv(`${r.serviceName}-${r.date}.csv`, [["Service", "Date", "Attendance", "Duration", "Status", "Source"], [r.serviceName, r.date, r.attendance, formatMinutes(r.durationSeconds), r.status, r.countSource || (r.isSample ? "Sample" : "Saved")]]); }}><Download className="h-4 w-4" />Export record</MenuItem>
        {!r.isSample && <MenuItem className="text-danger hover:bg-red-50" onClick={() => { close(); deleteRecord(r.id); ui.toast("Record deleted", "info"); }}><Trash2 className="h-4 w-4" />Delete record</MenuItem>}
      </div>)}
    </Popover>
  );
}

export default function HistoryPage() {
  const { records } = useApp();
  const ui = useUI();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState<"All" | "Confirmed" | "Pending">("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const types = useMemo(() => Array.from(new Set(records.map((r) => r.serviceType))), [records]);
  const latest = records[0]?.date ?? "";
  const filtered = useMemo(() => {
    const list = records.filter((r) => (!q || r.serviceName.toLowerCase().includes(q.toLowerCase())) && (type === "all" || r.serviceType === type) && (status === "All" || r.status === status) && (!from || r.date >= from) && (!to || r.date <= to));
    const dir = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const av = sort.key === "date" ? a.date : sort.key === "attendance" ? a.attendance : a.durationSeconds;
      const bv = sort.key === "date" ? b.date : sort.key === "attendance" ? b.attendance : b.durationSeconds;
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [records, q, type, status, from, to, sort]);
  useEffect(() => setPage(1), [q, type, status, from, to, size, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const rows = filtered.slice((page - 1) * size, page * size);
  const peak = filtered.reduce((m, r) => Math.max(m, r.attendance), 1);
  const counts = { All: records.length, Confirmed: records.filter((r) => r.status === "Confirmed").length, Pending: records.filter((r) => r.status === "Pending").length };
  const allOnPage = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const hasFilters = !!(q || from || to || type !== "all" || status !== "All");
  const clear = () => { setQ(""); setType("all"); setStatus("All"); setFrom(""); setTo(""); };
  const setRange = (days: number) => { if (!latest) return; setTo(""); setFrom(days ? new Date(Date.parse(latest) - days * DAY).toISOString().slice(0, 10) : ""); };
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exportRows = (picked.size ? filtered.filter((r) => picked.has(r.id)) : filtered);
  const exportCsv = () => { downloadCsv("attendance-history.csv", [["Service", "Type", "Date", "Attendance", "Duration", "Status", "Source"], ...exportRows.map((r) => [r.serviceName, r.serviceType, r.date, r.attendance, formatMinutes(r.durationSeconds), r.status, r.countSource || (r.isSample ? "Sample" : "Saved")])]); ui.toast(`Exported ${exportRows.length} record${exportRows.length === 1 ? "" : "s"}`); };

  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn("px-4 py-3 font-medium", className)} aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-ink">{children}{sort.key === k ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowDown className="h-3 w-3 opacity-25" />}</button>
    </th>
  );

  const pageNums = useMemo(() => {
    const set = new Set([1, pages, page - 1, page, page + 1]);
    const arr = Array.from(set).filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
    const out: (number | "…")[] = [];
    arr.forEach((n, i) => { if (i && n - arr[i - 1] > 1) out.push("…"); out.push(n); });
    return out;
  }, [page, pages]);

  const kpis = [
    { l: "Sessions", v: filtered.length.toLocaleString(), s: hasFilters ? "Matching your filters" : "All recorded sessions" },
    { l: "People counted", v: sum(filtered).toLocaleString(), s: "Across these sessions" },
    { l: "Average", v: avg(filtered).toLocaleString(), s: "Per session" },
    { l: "Peak", v: (filtered.length ? peak : 0).toLocaleString(), s: "Highest single count" },
  ];

  return (
    <>
      <PageHeader title="Attendance History" description="Every counted session. Sort, filter, confirm and export from one place."
        actions={<Button variant="outline" onClick={exportCsv} disabled={!filtered.length}><Download className="h-4 w-4" />{picked.size ? `Export ${picked.size} selected` : "Export CSV"}</Button>} />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-4 lg:col-span-5">
          {kpis.map((k, i) => (
            <div key={k.l} className={cn("rounded-2xl border p-4 shadow-card", i === 0 ? "border-forest bg-gradient-to-br from-forest to-forest-800 text-white" : "border-slate-200/70 bg-white")}>
              <p className={cn("text-xs font-medium", i === 0 ? "text-white/70" : "text-muted")}>{k.l}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{k.v}</p>
              <p className={cn("mt-1 text-xs", i === 0 ? "text-white/60" : "text-muted")}>{k.s}</p>
            </div>))}
        </div>
        <Card className="lg:col-span-7">
          <CardHeader className="flex-row items-start justify-between"><div><CardTitle>Attendance calendar</CardTitle><CardDescription>Last 26 weeks. Darker means a bigger crowd.</CardDescription></div><Badge tone="amber">Sample data</Badge></CardHeader>
          <CardContent><Heatmap records={records} /></CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Status">
              {(["All", "Confirmed", "Pending"] as const).map((t) => <button key={t} role="tab" aria-selected={status === t} onClick={() => setStatus(t)} className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium", status === t ? "bg-white shadow-sm" : "text-muted")}>{t}<span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] tabular-nums">{counts[t]}</span></button>)}
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <div className="relative min-w-[180px] flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" /><Input className="pl-9" placeholder="Search by service name" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <Popover className="w-72 p-3" trigger={({ toggle }) => <Button variant="outline" onClick={toggle} className={cn((from || to) && "border-brand text-brand-dark")}><CalendarRange className="h-4 w-4" />{from || to ? "Date range on" : "Date range"}</Button>}>
                {(close) => (<div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">{[["30 days", 30], ["90 days", 90], ["1 year", 365], ["All", 0]].map(([l, d]) => <button key={l as string} onClick={() => { setRange(d as number); close(); }} className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:bg-slate-50">{l}</button>)}</div>
                  <div className="grid grid-cols-2 gap-2"><div><p className="mb-1 text-xs text-muted">From</p><Input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div><p className="mb-1 text-xs text-muted">To</p><Input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
                </div>)}
              </Popover>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {["all", ...types].map((t) => (
              <button key={t} onClick={() => setType(t)} aria-pressed={type === t} className={cn("flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium", type === t ? "border-brand bg-brand-soft text-brand-dark" : "border-line text-slate-600 hover:bg-slate-50")}>
                {t !== "all" && <ServiceIcon type={t} className="h-5 w-5" />}{t === "all" ? "All services" : t}
              </button>))}
            {hasFilters && <button onClick={clear} className="ml-auto flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"><X className="h-3.5 w-3.5" />Clear filters</button>}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center"><SearchX className="mx-auto h-8 w-8 text-muted" /><p className="mt-3 font-medium">No sessions match your filters</p><p className="mt-1 text-sm text-muted">Try a different search or widen the date range.</p><Button variant="outline" className="mt-4" onClick={clear}>Clear filters</Button></div>
        ) : (<>
          <div className="hidden overflow-x-auto scroll-thin md:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="bg-slate-50 text-left text-xs text-muted">
                <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all on page" checked={allOnPage} onChange={() => setPicked((s) => { const n = new Set(s); rows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id))); return n; })} className="h-4 w-4 accent-brand" /></th>
                <th className="px-4 py-3 font-medium">Service</th><SortHead k="date">Date</SortHead><SortHead k="attendance" className="w-64">Attendance</SortHead><SortHead k="duration">Duration</SortHead><th className="px-4 py-3 font-medium">Status</th><th className="w-12 px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => ui.openRecord(r.id)} className={cn("group cursor-pointer border-b border-line/60 last:border-0 hover:bg-brand-soft/50", picked.has(r.id) && "bg-brand-soft/60")}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${r.serviceName}`} checked={picked.has(r.id)} onChange={() => togglePick(r.id)} className="h-4 w-4 accent-brand" /></td>
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><ServiceIcon type={r.serviceType} className="h-10 w-10" /><div className="min-w-0"><p className="truncate font-medium">{r.serviceName}</p><div className="mt-0.5 flex gap-1">{r.isSample ? <Badge tone="amber">Sample</Badge> : <Badge tone="green">Saved here</Badge>}</div></div></div></td>
                    <td className="px-4 py-3"><p className="font-medium">{formatDate(r.date, { day: "numeric", month: "short" })}</p><p className="text-xs text-muted">{formatDate(r.date, { weekday: "long" })}</p></td>
                    <td className="px-4 py-3"><div className="flex items-center justify-between"><b className="tabular-nums">{r.attendance.toLocaleString()}</b><span className="text-xs text-muted font-medium">{r.countSource === "ai" ? "AI Count" : r.isSample ? "Sample" : "Manual"}</span></div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" style={{ width: "100%" }}><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (r.attendance / (peak || 1)) * 100)}%` }} /></div></td>
                    <td className="px-4 py-3 text-muted">{formatMinutes(r.durationSeconds)}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-right"><RowMenu r={r} /></td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-line md:hidden">
            {rows.map((r) => (
              <li key={r.id} onClick={() => ui.openRecord(r.id)} className="flex cursor-pointer items-center gap-3 p-4 active:bg-slate-50">
                <ServiceIcon type={r.serviceType} className="h-11 w-11" />
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{r.serviceName}</p><p className="text-xs text-muted">{formatDate(r.date)} · {formatMinutes(r.durationSeconds)}</p><div className="mt-1.5"><StatusBadge status={r.status} /></div></div>
                <div className="text-right"><p className="text-lg font-semibold tabular-nums">{r.attendance.toLocaleString()}</p><p className="text-[11px] text-muted">♂ {r.male} · ♀ {r.female}</p></div>
                <RowMenu r={r} />
              </li>))}
          </ul>
        </>)}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
          <div className="flex items-center gap-2">Show<Select aria-label="Rows per page" value={size} onChange={(e) => setSize(Number(e.target.value))} className="h-8 w-[72px] text-xs">{[10, 20, 50].map((n) => <option key={n}>{n}</option>)}</Select>of {filtered.length} result{filtered.length === 1 ? "" : "s"}{picked.size > 0 && <button onClick={() => setPicked(new Set())} className="ml-2 font-medium text-brand-dark">Clear {picked.size} selected</button>}</div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
            {pageNums.map((n, i) => n === "…" ? <span key={`e${i}`} className="px-1">…</span> : <button key={n} onClick={() => setPage(n)} aria-current={n === page ? "page" : undefined} className={cn("h-8 min-w-8 rounded-lg px-2 text-xs font-medium", n === page ? "bg-brand text-white" : "hover:bg-slate-100")}>{n}</button>)}
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>
    </>
  );
}
