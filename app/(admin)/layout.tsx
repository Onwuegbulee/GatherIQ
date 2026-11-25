import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = {
  title: "GatherIQ",
  description: "Point your camera at the congregation. Let AI detect and count the people. Get your attendance report.",
  icons: {
    icon: [{ url: "/gatheriq-icon.svg", type: "image/svg+xml" }],
    shortcut: "/gatheriq-icon.svg",
    apple: "/gatheriq-icon.svg",
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
