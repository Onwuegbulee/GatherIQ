"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Camera, ChevronsLeft, ChevronsRight, ChevronUp, History, LayoutDashboard, LogOut, ScanLine, Settings, Tags, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Brand, BrandMark } from "@/components/brand";
import { Popover, MenuItem } from "@/components/ui/popover";
import { useApp } from "@/context/app-context";
import { useUI } from "@/components/ui-provider";

interface Item { label: string; icon: LucideIcon; href?: string; action?: "new" }
const NAV: { group: string; items: Item[] }[] = [
  { group: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  { group: "Attendance", items: [{ action: "new", label: "New Attendance", icon: ScanLine }, { href: "/attendance/history", label: "Attendance History", icon: History }] },
  { group: "Management", items: [{ href: "/services", label: "Services", icon: Tags }, { href: "/reports", label: "Reports", icon: BarChart3 }] },
  { group: "Preferences", items: [{ href: "/settings", label: "Settings", icon: Settings }] },
];

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const ui = useUI();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scroll-thin" aria-label="Main">
      {NAV.map((g) => (
        <div key={g.group}>
          {!collapsed && <p className="mb-1.5 px-3 text-xs font-medium text-muted">{g.group}</p>}
          <ul className="space-y-1">
            {g.items.map(({ href, action, label, icon: Icon }) => {
              const active = !!href && (pathname === href || (href === "/attendance/history" && /^\/attendance\/(?!new|live|summary)/.test(pathname)));
              const cls = cn("flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                active ? "bg-brand text-white shadow-[0_8px_18px_-8px_rgba(22,163,74,.8)]" : "text-slate-600 hover:bg-slate-100 hover:text-ink", collapsed && "justify-center px-0");
              const inner = <><Icon className="h-[18px] w-[18px] shrink-0" />{!collapsed && <span className="truncate">{label}</span>}</>;
              return (
                <li key={label}>
                  {href ? <Link href={href} onClick={onNavigate} title={collapsed ? label : undefined} aria-current={active ? "page" : undefined} className={cls}>{inner}</Link>
                    : <button onClick={() => { onNavigate?.(); ui.openNewAttendance(); }} title={collapsed ? label : undefined} className={cls}>{inner}</button>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Promo({ onDone }: { onDone?: () => void }) {
  const ui = useUI();
  return (
    <div className="mx-3 mb-3 overflow-hidden rounded-2xl bg-gradient-to-br from-forest to-forest-800 p-4 text-white">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><Camera className="h-[18px] w-[18px]" /></span>
      <p className="mt-3 text-sm font-semibold">Count a service</p>
      <p className="mt-1 text-xs leading-relaxed text-white/70">Open the camera scanner and walk the congregation.</p>
      <button onClick={() => { onDone?.(); ui.openNewAttendance(); }} className="mt-3 h-9 w-full rounded-lg bg-white text-sm font-medium text-forest hover:bg-green-50">Start attendance</button>
    </div>
  );
}

function Profile({ collapsed }: { collapsed: boolean }) {
  const { settings, logout } = useApp();
  const router = useRouter();
  return (
    <div className="border-t border-line p-3">
      <Popover align="left" className="bottom-full mb-2 mt-0 w-56" trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open} aria-label="Account menu" className={cn("flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-100", collapsed && "justify-center")}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-light text-xs font-semibold text-brand-dark">{settings.adminName.slice(0, 2).toUpperCase()}</span>
          {!collapsed && <><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{settings.adminName}</span><span className="block truncate text-xs text-muted">Administrator</span></span><ChevronUp className="h-4 w-4 text-muted" /></>}
        </button>)}>
        {(close) => (<>
          <div className="px-2.5 py-2"><p className="truncate text-sm font-medium">{settings.adminName}</p><p className="truncate text-xs text-muted">{settings.adminEmail}</p></div>
          <MenuItem onClick={() => { close(); router.push("/settings"); }}><Settings className="h-4 w-4" />Account settings</MenuItem>
          <MenuItem className="text-danger hover:bg-red-50" onClick={() => { logout(); router.replace("/login"); }}><LogOut className="h-4 w-4" />Log out</MenuItem>
        </>)}
      </Popover>
    </div>
  );
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onClose }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onClose: () => void }) {
  return (
    <>
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200/70 bg-white transition-[width] duration-200 lg:flex", collapsed ? "w-[76px]" : "w-64")}>
        <div className={cn("flex h-16 items-center px-5", collapsed && "justify-center px-0")}>{collapsed ? <BrandMark /> : <Brand />}</div>
        <NavList collapsed={collapsed} />
        {!collapsed && <Promo />}
        <button onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={cn("mx-3 mb-2 flex h-9 items-center gap-2 rounded-xl px-3 text-sm text-muted hover:bg-slate-100", collapsed && "justify-center px-0")}>
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />Collapse</>}
        </button>
        <Profile collapsed={collapsed} />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 animate-fade-in" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-pop animate-slide-in [animation-direction:normal]" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="flex h-16 items-center justify-between px-4"><Brand /><button onClick={onClose} aria-label="Close navigation" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
            <NavList collapsed={false} onNavigate={onClose} />
            <Promo onDone={onClose} />
            <Profile collapsed={false} />
          </aside>
        </div>
      )}
    </>
  );
}
