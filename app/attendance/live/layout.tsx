import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "GatherIQ",
  icons: {
    icon: [{ url: "/gatheriq-icon.svg", type: "image/svg+xml" }],
    shortcut: "/gatheriq-icon.svg",
    apple: "/gatheriq-icon.svg",
  },
};

// Dedicated scanner layout: no sidebar or dashboard chrome, dark system UI, no pinch-zoom while scanning.
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover", themeColor: "#020617" };

export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 overscroll-none bg-slate-950 text-white">{children}</div>;
}
