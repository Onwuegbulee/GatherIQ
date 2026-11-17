"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Info } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenderSplit } from "@/components/record-details";
import { useUI } from "@/components/ui-provider";
import { useApp } from "@/context/app-context";
import { formatDate, formatDuration } from "@/lib/utils";

export default function SummaryPage() {
  const { ready, result, saveRecord, setResult, setDraft, settings } = useApp();
  const ui = useUI();
  const router = useRouter();
  const [savedId, setSavedId] = useState<string | null>(null);

  if (!ready) return null;
  if (!result && !savedId)
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">No attendance to summarise</h1>
        <p className="mt-2 text-sm text-muted">Finish a scanning session and the summary will appear here.</p>
        <Button className="mt-6" onClick={ui.openNewAttendance}>Start New Attendance</Button>
      </div>
    );
  if (savedId)
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-light"><CheckCircle2 className="h-9 w-9 text-brand" /></span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Attendance saved</h1>
        <p className="mt-2 text-sm text-muted">The record is stored in this browser and now appears in your attendance history.</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={() => ui.openRecord(savedId)}>View record</Button>
          <Link href="/dashboard" className={buttonVariants()}>Back to Dashboard</Link>
        </div>
      </div>
    );

  const r = result!;
  const rows: [string, string][] = [["Service name", r.serviceName], ["Attendance date", formatDate(r.date)], ["Scanning duration", formatDuration(r.durationSeconds)], ["Session status", "Completed"]];
  const confirm = () => {
    const rec = saveRecord(r);
    setSavedId(rec.id); setResult(null); setDraft(null);
    if (settings.notifyOnSave) ui.toast("Attendance saved to your records");
  };
  return (
    <div className="mx-auto max-w-xl">
      <div className="text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-light"><CheckCircle2 className="h-7 w-7 text-brand" /></span><h1 className="mt-3 text-2xl font-semibold tracking-tight">Attendance Completed</h1></div>
      <div className="mt-6 rounded-3xl bg-gradient-to-br from-forest via-forest-800 to-[#166534] p-8 text-center text-white shadow-card">
        <p className="text-7xl font-semibold tabular-nums tracking-tight">{r.count.toLocaleString()}</p>
        <p className="mt-2 text-xs font-medium tracking-[0.2em] text-white/70">TOTAL PEOPLE COUNTED</p>
        {r.isDemoCount && <Badge tone="amber" className="mt-4">Demonstration count</Badge>}
      </div>
      <Card className="mt-4 p-5"><p className="mb-3 text-sm font-medium">Men and women</p><GenderSplit male={r.male} female={r.female} /></Card>
      {r.isDemoCount && <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800"><Info className="mt-0.5 h-4 w-4 shrink-0" /><p>These numbers were entered manually in demo mode. AI counting isn’t connected yet, so this is sample data, not a detected total.</p></div>}
      <Card className="mt-4"><dl className="divide-y divide-line">
        {rows.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-4 px-5 py-3 text-sm"><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
        <div className="px-5 py-3 text-sm"><dt className="text-muted">Attendance confirmation</dt><dd className="mt-0.5 font-medium">Review the count above, then confirm to save it to your records.</dd></div>
      </dl></Card>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
        <Button size="lg" className="flex-1" onClick={confirm}>Confirm &amp; Save Attendance</Button>
        <Button size="lg" variant="outline" className="flex-1" onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
      </div>
    </div>
  );
}
