"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, CheckCircle2, History, LayoutDashboard, Search, Settings, Tags, Info, ScanLine, CornerDownLeft } from "lucide-react";
import { Modal, useBodyLock } from "@/components/ui/modal";
import { Drawer } from "@/components/ui/drawer";
import { Button, buttonVariants } from "@/components/ui/button";
import { NewAttendanceForm } from "@/components/forms/new-attendance-form";
import { RecordDetails } from "@/components/record-details";
import { ServiceIcon } from "@/lib/service-meta";
import { useApp } from "@/context/app-context";
import { cn, formatDate } from "@/lib/utils";

interface UIValue { toast: (text: string, tone?: "success" | "info") => void; openNewAttendance: () => void; openRecord: (id: string) => void; openSearch: () => void }
const Ctx = createContext<UIValue | null>(null);
export function useUI() { const c = useContext(Ctx); if (!c) throw new Error("useUI must be used inside <UIProvider>"); return c; }

export function UIProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { records, confirmRecord } = useApp();
  const [newOpen, setNewOpen] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string; tone: "success" | "info" }[]>([]);

  const toast = useCallback((text: string, tone: "success" | "info" = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<UIValue>(() => ({ toast, openNewAttendance: () => setNewOpen(true), openRecord: setRecordId, openSearch: () => setSearchOpen(true) }), [toast]);
  const rec = records.find((r) => r.id === recordId);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Start New Attendance" description="Set up an attendance session before scanning your congregation." size="lg">
        <NewAttendanceForm onStarted={() => { setNewOpen(false); router.push("/attendance/live"); }} />
      </Modal>
      <Drawer open={!!rec} onClose={() => setRecordId(null)} title="Attendance details"
        footer={rec && (
          <div className="flex gap-2">
            <Link href={`/attendance/${rec.id}`} onClick={() => setRecordId(null)} className={buttonVariants({ variant: "outline", className: "flex-1" })}>Open full page</Link>
            {rec.status === "Pending" && <Button className="flex-1" onClick={() => { confirmRecord(rec.id); toast("Attendance confirmed"); }}><CheckCircle2 className="h-4 w-4" />Confirm attendance</Button>}
          </div>)}>
        {rec && <RecordDetails record={rec} />}
      </Drawer>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} onNew={() => { setSearchOpen(false); setNewOpen(true); }} onRecord={(id) => { setSearchOpen(false); setRecordId(id); }} />
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-pop animate-toast-in">
            {t.tone === "success" ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Info className="h-4 w-4 text-sky-300" />}{t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

function SearchPalette({ open, onClose, onNew, onRecord }: { open: boolean; onClose: () => void; onNew: () => void; onRecord: (id: string) => void }) {
  const router = useRouter();
  const { records } = useApp();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  useBodyLock(open);
  useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);

  const items = useMemo(() => {
    const go = (href: string) => () => { onClose(); router.push(href); };
    const pages = [
      { key: "new", label: "Start new attendance", hint: "Action", icon: <ScanLine className="h-4 w-4" />, run: onNew },
      { key: "dash", label: "Dashboard", hint: "Page", icon: <LayoutDashboard className="h-4 w-4" />, run: go("/dashboard") },
      { key: "hist", label: "Attendance History", hint: "Page", icon: <History className="h-4 w-4" />, run: go("/attendance/history") },
      { key: "svc", label: "Services", hint: "Page", icon: <Tags className="h-4 w-4" />, run: go("/services") },
      { key: "rep", label: "Reports", hint: "Page", icon: <BarChart3 className="h-4 w-4" />, run: go("/reports") },
      { key: "set", label: "Settings", hint: "Page", icon: <Settings className="h-4 w-4" />, run: go("/settings") },
    ];
    const term = q.trim().toLowerCase();
    const pg = term ? pages.filter((p) => p.label.toLowerCase().includes(term)) : pages;
    const rs = (term ? records.filter((r) => (r.serviceName + " " + r.date + " " + formatDate(r.date)).toLowerCase().includes(term)) : records.slice(0, 3)).slice(0, 6)
      .map((r) => ({ key: r.id, label: r.serviceName, hint: `${formatDate(r.date)} · ${r.attendance.toLocaleString()}`, icon: <ServiceIcon type={r.serviceType} className="h-6 w-6" />, run: () => onRecord(r.id) }));
    return [...pg, ...rs];
  }, [q, records, router, onClose, onNew, onRecord]);

  if (!open) return null;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter") items[idx]?.run();
    if (e.key === "Escape") onClose();
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/50 p-4 pt-[12vh] backdrop-blur-[2px] animate-fade-in" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-pop animate-pop-in">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 text-muted" />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey} placeholder="Search sessions, pages and actions…" aria-label="Search" className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted">ESC</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2 scroll-thin">
          {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">No results for “{q}”.</li>}
          {items.map((it, i) => (
            <li key={it.key}>
              <button onMouseEnter={() => setIdx(i)} onClick={it.run} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm", i === idx ? "bg-brand-soft" : "")}>
                <span className="grid h-6 w-6 place-items-center text-slate-500">{it.icon}</span><span className="flex-1 font-medium">{it.label}</span><span className="text-xs text-muted">{it.hint}</span>{i === idx && <CornerDownLeft className="h-3.5 w-3.5 text-muted" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
