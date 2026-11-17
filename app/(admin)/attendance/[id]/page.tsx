"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RecordDetails } from "@/components/record-details";
import { useUI } from "@/components/ui-provider";
import { useApp } from "@/context/app-context";

export default function AttendanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { records, ready, confirmRecord } = useApp();
  const ui = useUI();
  const r = records.find((x) => x.id === id);
  const back = <Link href="/attendance/history" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Back to attendance history</Link>;
  if (!ready) return null;
  if (!r) return (<div>{back}<Card className="p-10 text-center"><h1 className="text-lg font-semibold">Record not found</h1><p className="mt-1 text-sm text-muted">This session may have been removed or the link is wrong.</p><Link href="/attendance/history" className={buttonVariants({ className: "mt-4" })}>Go to history</Link></Card></div>);
  return (
    <div className="mx-auto max-w-2xl">
      {back}
      <Card className="p-5 sm:p-6">
        <RecordDetails record={r} />
        {r.status === "Pending" && <Button className="mt-5 w-full" onClick={() => { confirmRecord(r.id); ui.toast("Attendance confirmed"); }}><CheckCircle2 className="h-4 w-4" />Confirm attendance</Button>}
      </Card>
    </div>
  );
}
