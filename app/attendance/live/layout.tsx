import type { Viewport } from "next";

// Dedicated scanner layout: no sidebar or dashboard chrome, dark system UI, no pinch-zoom while scanning.
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover", themeColor: "#020617" };

export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 overscroll-none bg-slate-950 text-white">{children}</div>;
}
