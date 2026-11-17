"use client";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { NewAttendanceForm } from "@/components/forms/new-attendance-form";

// Direct-link version of the same form that opens as a popup elsewhere in the app.
export default function NewAttendancePage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Start New Attendance" description="Set up an attendance session before scanning your congregation." />
      <Card><CardContent className="p-5 pt-5 sm:p-6"><NewAttendanceForm onStarted={() => router.push("/attendance/live")} /></CardContent></Card>
    </div>
  );
}
