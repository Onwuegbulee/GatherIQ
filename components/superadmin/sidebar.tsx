"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Settings,
  ShieldAlert,
  Users2,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Brand, BrandMark } from "@/components/brand";
import { Popover, MenuItem } from "@/components/ui/popover";
import { useApp } from "@/context/app-context";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

const SUPER_NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Governance",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "churches", label: "Church Management", icon: Building2 },
      { id: "register", label: "Register Church", icon: PlusCircle },
    ],
  },
  {
    group: "Administration",
    items: [
      { id: "admins", label: "Administrators", icon: Users2 },
      { id: "activity", label: "Activity Logs", icon: Activity },
    ],
  },
  {
    group: "System",
    items: [
      { id: "settings", label: "Platform Settings", icon: Settings },
      { id: "profile", label: "Super Admin Profile", icon: ShieldAlert },
    ],
  },
];

export function SuperAdminSidebar({
  activeTab,
  onSelectTab,
  collapsed,
  onToggle,
  mobileOpen,
  onClose,
}: {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const { user, logout } = useApp();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace("/superadmin/login");
  };

  const navList = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scroll-thin" aria-label="Super Admin Main">
      {SUPER_NAV.map((g) => (
        <div key={g.group}>
          {!collapsed && <p className="mb-1.5 px-3 text-xs font-medium text-muted uppercase tracking-wider">{g.group}</p>}
          <ul className="space-y-1">
            {g.items.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              const cls = cn(
                "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors text-left",
                active
                  ? "bg-forest-800 text-white shadow-sm font-semibold"
                  : "text-slate-600 hover:bg-slate-100 hover:text-ink",
                collapsed && "justify-center px-0"
              );
              return (
                <li key={id}>
                  <button
                    onClick={() => {
                      onSelectTab(id);
                      onClose();
                    }}
                    title={collapsed ? label : undefined}
                    className={cls}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const profile = (
    <div className="border-t border-line p-3">
      <Popover
        align="left"
        className="bottom-full mb-2 mt-0 w-56"
        trigger={({ toggle, open }) => (
          <button
            onClick={toggle}
            aria-expanded={open}
            aria-label="Account menu"
            className={cn(
              "flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-100",
              collapsed && "justify-center"
            )}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest text-xs font-semibold text-white">
              SA
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">Super Admin</span>
                  <span className="block truncate text-xs text-muted">Platform Governance</span>
                </span>
                <ChevronUp className="h-4 w-4 text-muted" />
              </>
            )}
          </button>
        )}
      >
        {(close) => (
          <>
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium">{user?.fullName || "Super Admin"}</p>
              <p className="truncate text-xs text-muted">{user?.email || "superadmin@gatheriq.dev"}</p>
            </div>
            <MenuItem
              onClick={() => {
                close();
                onSelectTab("profile");
              }}
            >
              <ShieldAlert className="h-4 w-4" />
              Security &amp; Profile
            </MenuItem>
            <MenuItem className="text-danger hover:bg-red-50" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Log out
            </MenuItem>
          </>
        )}
      </Popover>
    </div>
  );

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200/70 bg-white transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-64"
        )}
      >
        <div className={cn("flex h-16 items-center px-5", collapsed && "justify-center px-0")}>
          {collapsed ? <BrandMark /> : <Brand />}
        </div>
        {navList}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mx-3 mb-2 flex h-9 items-center gap-2 rounded-xl px-3 text-sm text-muted hover:bg-slate-100",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />Collapse</>}
        </button>
        {profile}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 animate-fade-in" onClick={onClose} />
          <aside
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-pop animate-slide-in [animation-direction:normal]"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="flex h-16 items-center justify-between px-4">
              <Brand />
              <button
                onClick={onClose}
                aria-label="Close navigation"
                className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {navList}
            {profile}
          </aside>
        </div>
      )}
    </>
  );
}
