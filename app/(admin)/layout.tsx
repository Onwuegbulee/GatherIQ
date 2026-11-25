"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { UIProvider } from "@/components/ui-provider";
import { useApp } from "@/context/app-context";
import { cn } from "@/lib/utils";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { ready, authed, user } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setCollapsed(localStorage.getItem("cc_sidebar") === "1"); }, []);
  useEffect(() => {
    if (ready) {
      if (!authed) {
        router.replace("/login");
      } else if (user?.role === "super_admin") {
        router.replace("/superadmin");
      }
    }
  }, [ready, authed, user, router]);
  useEffect(() => setMobileOpen(false), [pathname]);

  if (!ready || !authed) return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>;
  const toggle = () => { const n = !collapsed; setCollapsed(n); localStorage.setItem("cc_sidebar", n ? "1" : "0"); };
  return (
    <UIProvider>
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,#ECFDF3_0%,#F8FAFC_45%)]">
        <Sidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
          <Topbar onMenu={() => setMobileOpen(true)} />
          <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </UIProvider>
  );
}
