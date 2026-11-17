"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { PageHeader } from "@/components/page-header";
import { useApp } from "@/context/app-context";
import { useUI } from "@/components/ui-provider";
import type { AppSettings } from "@/lib/types";

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted">{hint}</p></div>{children}</div>;
}

export default function SettingsPage() {
  const { settings, updateSettings } = useApp();
  const ui = useUI();
  const [form, setForm] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  useEffect(() => { navigator.mediaDevices?.enumerateDevices?.().then((d) => setCams(d.filter((x) => x.kind === "videoinput"))).catch(() => undefined); }, []);
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);
  const save = (e: React.FormEvent) => { e.preventDefault(); updateSettings(form); setSaved(true); ui.toast("Settings saved"); };

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Settings" description="Manage your church details, camera defaults and preferences." actions={
        <>{saved && <span className="flex items-center gap-1 text-sm text-brand-dark"><Check className="h-4 w-4" />Settings saved</span>}<Button type="submit" disabled={!dirty}>Save changes</Button></>} />

      <Card><CardHeader><CardTitle>Church information</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Church name" htmlFor="cn"><Input id="cn" value={form.churchName} onChange={(e) => set("churchName", e.target.value)} /></Field>
        <Field label="Church location" htmlFor="cl"><Input id="cl" value={form.churchLocation} onChange={(e) => set("churchLocation", e.target.value)} /></Field>
        <Field label="Sunday attendance goal" htmlFor="tg" hint="Shown as the goal gauge on your dashboard."><Input id="tg" type="number" min={1} value={form.attendanceTarget} onChange={(e) => set("attendanceTarget", Math.max(1, Number(e.target.value) || 1))} /></Field>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Administrator profile</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="an"><Input id="an" value={form.adminName} onChange={(e) => set("adminName", e.target.value)} /></Field>
        <Field label="Email" htmlFor="ae"><Input id="ae" type="email" value={form.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} /></Field>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Camera preferences</CardTitle><CardDescription>Used the next time you open the scanner.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3">
        <Field label="Preferred camera" htmlFor="pc"><Select id="pc" value={form.preferredCamera} onChange={(e) => set("preferredCamera", e.target.value)}>
          <option value="auto">Automatic</option>{cams.filter((c) => c.deviceId).map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>)}</Select></Field>
        <Field label="Default facing" htmlFor="fm"><Select id="fm" value={form.facingMode} onChange={(e) => set("facingMode", e.target.value as AppSettings["facingMode"])}><option value="environment">Rear camera</option><option value="user">Front camera</option></Select></Field>
        <Field label="Video quality" htmlFor="vq"><Select id="vq" value={form.videoQuality} onChange={(e) => set("videoQuality", e.target.value as AppSettings["videoQuality"])}><option value="low">Low (640×480)</option><option value="medium">Medium (720p)</option><option value="high">High (1080p)</option></Select></Field>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Application preferences</CardTitle></CardHeader><CardContent className="divide-y divide-line">
        <Row title="Notify when attendance is saved" hint="Show a confirmation after you save a session."><Switch label="Notify when attendance is saved" checked={form.notifyOnSave} onChange={(v) => set("notifyOnSave", v)} /></Row>
        <Row title="Weekly attendance summary" hint="Preference only. Emails need the backend."><Switch label="Weekly attendance summary" checked={form.notifyWeekly} onChange={(v) => set("notifyWeekly", v)} /></Row>
        <Row title="Compact tables" hint="Tighter rows in attendance lists."><Switch label="Compact tables" checked={form.compactTables} onChange={(v) => set("compactTables", v)} /></Row>
      </CardContent></Card>
      <p className="px-1 text-xs text-muted">Settings are stored in this browser only until the backend is connected.</p>
    </form>
  );
}
