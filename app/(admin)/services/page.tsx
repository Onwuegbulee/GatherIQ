"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/page-header";
import { ServiceIcon } from "@/lib/service-meta";
import { useUI } from "@/components/ui-provider";
import { useApp } from "@/context/app-context";
import { avg } from "@/lib/stats";
import type { ServiceCategory } from "@/lib/types";

export default function ServicesPage() {
  const { services, addService, updateService, deleteService, records } = useApp();
  const ui = useUI();
  const [form, setForm] = useState<{ id?: string; name: string; description: string } | null>(null);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<ServiceCategory | null>(null);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const name = form.name.trim();
    if (!name) return setError("Enter a service name.");
    if (services.some((s) => s.id !== form.id && s.name.toLowerCase() === name.toLowerCase())) return setError("A service with this name already exists.");
    if (form.id) { updateService({ id: form.id, name, description: form.description.trim() }); ui.toast("Service updated"); }
    else { addService({ name, description: form.description.trim() }); ui.toast("Service added"); }
    setForm(null); setError("");
  };

  return (
    <>
      <PageHeader title="Services" description="Service categories appear when you start a new attendance session." actions={<Button onClick={() => { setForm({ name: "", description: "" }); setError(""); }}><Plus className="h-4 w-4" />Add service</Button>} />
      {services.length === 0 ? (
        <Card className="px-6 py-16 text-center"><p className="font-medium">No services yet</p><p className="mt-1 text-sm text-muted">Add a service category to use it when starting attendance.</p></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((s) => {
            const mine = records.filter((r) => r.serviceType === s.name);
            return (
              <Card key={s.id} className="p-5">
                <div className="flex items-start justify-between gap-3"><ServiceIcon type={s.name} className="h-11 w-11" />
                  <div className="flex gap-1"><Button size="sm" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => { setForm({ ...s }); setError(""); }}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" className="text-danger hover:bg-red-50" aria-label={`Delete ${s.name}`} onClick={() => setRemoving(s)}><Trash2 className="h-4 w-4" /></Button></div></div>
                <p className="mt-4 font-semibold">{s.name}</p><p className="mt-1 min-h-[2.5rem] text-sm text-muted">{s.description || "No description"}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm"><div><p className="text-xs text-muted">Sessions</p><p className="font-semibold tabular-nums">{mine.length}</p></div><div><p className="text-xs text-muted">Average</p><p className="font-semibold tabular-nums">{mine.length ? avg(mine).toLocaleString() : "—"}</p></div></div>
              </Card>);
          })}
        </div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit service" : "Add service"} description="Services are the categories you choose from when starting attendance.">
        {form && (
          <form onSubmit={save} className="space-y-4" noValidate>
            <Field label="Service name" htmlFor="sn" error={error}><Input id="sn" autoFocus value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(""); }} placeholder="e.g. Prayer Night" /></Field>
            <Field label="Description (optional)" htmlFor="sd"><Input id="sd" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this service for?" /></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button type="submit">{form.id ? "Save changes" : "Add service"}</Button></div>
          </form>)}
      </Modal>
      <Modal open={!!removing} onClose={() => setRemoving(null)} title={`Delete “${removing?.name}”?`}>
        <p className="text-sm text-muted">Past attendance records keep their service name. This category will no longer appear when starting a session.</p>
        <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="destructive" onClick={() => { if (removing) { deleteService(removing.id); ui.toast("Service deleted", "info"); } setRemoving(null); }}>Delete service</Button></div>
      </Modal>
    </>
  );
}
