"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Play } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RecordDetails } from "@/components/record-details";
import { useUI } from "@/components/ui-provider";
import { useApp } from "@/context/app-context";
import { api } from "@/lib/api";

export default function AttendanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { records, ready, confirmRecord, refreshData, setDraft } = useApp();
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const r = records.find((x) => x.id === id);
  const back = <Link href="/attendance/history" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Back to attendance history</Link>;
  if (!ready) return null;
  if (!r) return (<div>{back}<Card className="p-10 text-center"><h1 className="text-lg font-semibold">Record not found</h1><p className="mt-1 text-sm text-muted">This session may have been removed or the link is wrong.</p><Link href="/attendance/history" className={buttonVariants({ className: "mt-4" })}>Go to history</Link></Card></div>);

  const isInterrupted = (r.status as string) !== "Confirmed" && (r.status as string) !== "Pending";

  const handleConfirm = async () => {
    setBusy(true);
    try {
      if (isInterrupted) {
        await api.sessions.start(r.id).catch(() => undefined);
        await api.sessions.end(r.id).catch(() => undefined);
      }
      await confirmRecord(r.id);
      await refreshData();
      ui.toast("Attendance confirmed");
    } catch (err: any) {
      ui.toast(err?.message || "Could not confirm attendance", "info");
    } finally {
      setBusy(false);
    }
  };

  const handleResume = () => {
    setDraft({
      id: r.id,
      serviceName: r.serviceName,
      serviceType: r.serviceType,
      date: r.date,
      description: r.description || "",
    });
    router.push("/attendance/live");
  };

  return (
    <div className="mx-auto max-w-2xl">
      {back}
      <Card className="p-5 sm:p-6">
        <RecordDetails record={r} />
        {r.status === "Pending" && (
          <Button className="mt-5 w-full" disabled={busy} onClick={() => void handleConfirm()}>
            <CheckCircle2 className="h-4 w-4" />{busy ? "Confirming…" : "Confirm attendance"}
          </Button>
        )}
        {isInterrupted && (
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="flex-1" disabled={busy} onClick={handleResume}>
              <Play className="h-4 w-4" />Resume scanning
            </Button>
            <Button className="flex-1" disabled={busy} onClick={() => void handleConfirm()}>
              <CheckCircle2 className="h-4 w-4" />{busy ? "Confirming…" : "End & confirm attendance"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
