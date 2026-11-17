"use client";
import { useState } from "react";
import { Camera, Lock, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { ServiceIcon } from "@/lib/service-meta";
import { useApp } from "@/context/app-context";
import { cn, todayISO } from "@/lib/utils";

export function NewAttendanceForm({ onStarted }: { onStarted: () => void }) {
  const { services, setDraft, setResult } = useApp();
  const types = [...services.map((s) => s.name), "Other"];
  const [serviceType, setServiceType] = useState(types[0] ?? "Other");
  const [serviceName, setServiceName] = useState("");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ name?: string; date?: string }>({});

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    const name = serviceName.trim() || (serviceType === "Other" ? "" : serviceType);
    const next: typeof errors = {};
    if (!name) next.name = "Enter a service name.";
    if (!date) next.date = "Choose the attendance date.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setResult(null);
    setDraft({ serviceName: name, serviceType, date, description: description.trim() });
    onStarted();
  };

  return (
    <form onSubmit={start} className="space-y-5" noValidate>
      <div>
        <p className="mb-2 text-sm font-medium">Service type</p>
        <div role="radiogroup" aria-label="Service type" className="grid grid-cols-2 gap-2">
          {types.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={serviceType === t} onClick={() => setServiceType(t)}
              className={cn("flex items-center gap-2.5 rounded-xl border p-2.5 text-left text-sm font-medium transition-colors", serviceType === t ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-line hover:bg-slate-50")}>
              <ServiceIcon type={t} className="h-8 w-8" /><span className="leading-tight">{t}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Service name" htmlFor="name" error={errors.name} hint={`Leave blank to use “${serviceType}”.`}>
          <Input id="name" placeholder={serviceType === "Other" ? "e.g. Choir rehearsal" : serviceType} value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
        </Field>
        <Field label="Attendance date" htmlFor="date" error={errors.date}><Input id="date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Description (optional)" htmlFor="desc"><Textarea id="desc" className="min-h-[72px]" placeholder="Anything worth noting about this service" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="flex gap-3 rounded-xl bg-brand-soft p-3.5 text-sm text-slate-700 ring-1 ring-green-200/70">
        <Camera className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" />
        <p>Next, your browser will ask for camera access. The camera is only used to count the congregation. ChurchCount AI doesn’t identify people or store video.</p>
      </div>
      <Button type="submit" size="lg" className="w-full tracking-wide"><ScanLine className="h-5 w-5" />START ATTENDANCE</Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted"><Lock className="h-3 w-3" />No member names or personal details are collected.</p>
    </form>
  );
}
