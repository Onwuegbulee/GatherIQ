"use client";
import { Bell, Menu, Plus, Search } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { ServiceIcon } from "@/lib/service-meta";
import { useApp } from "@/context/app-context";
import { useUI } from "@/components/ui-provider";
import { formatDate } from "@/lib/utils";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const ui = useUI();
  const { records } = useApp();
  const pending = records.filter((r) => r.status === "Pending");
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button onClick={onMenu} aria-label="Open navigation" className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100 lg:hidden"><Menu className="h-5 w-5" /></button>
      <Brand className="lg:hidden" />
      <button onClick={ui.openSearch} className="ml-auto flex h-10 w-10 items-center gap-2 rounded-xl border border-line bg-slate-50 px-3 text-sm text-muted hover:bg-white sm:ml-0 sm:w-full sm:max-w-md lg:max-w-lg" aria-label="Search">
        <Search className="h-4 w-4 shrink-0" /><span className="hidden flex-1 text-left sm:block">Search sessions, pages and actions…</span><kbd className="hidden rounded-md border border-line bg-white px-1.5 py-0.5 text-[10px] sm:block">⌘K</kbd>
      </button>
      <div className="ml-auto hidden items-center gap-2 sm:flex">
        <Popover trigger={({ toggle }) => (
          <button onClick={toggle} aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-white hover:bg-slate-50">
            <Bell className="h-[18px] w-[18px]" />{pending.length > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-danger ring-2 ring-white" />}
          </button>)} className="w-80">
          {(close) => (
            <div>
              <p className="px-2.5 pb-1 pt-2 text-sm font-semibold">Notifications</p>
              {pending.length === 0 ? <p className="px-2.5 py-6 text-center text-sm text-muted">You’re all caught up.</p> : pending.slice(0, 4).map((r) => (
                <button key={r.id} onClick={() => { close(); ui.openRecord(r.id); }} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left hover:bg-slate-100">
                  <ServiceIcon type={r.serviceType} className="h-9 w-9" />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{r.serviceName} needs confirmation</span><span className="block text-xs text-muted">{formatDate(r.date)} · {r.attendance.toLocaleString()} counted</span></span>
                </button>))}
            </div>)}
        </Popover>
        <Button onClick={ui.openNewAttendance}><Plus className="h-4 w-4" />New Attendance</Button>
      </div>
    </header>
  );
}
