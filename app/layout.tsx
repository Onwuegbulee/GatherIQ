import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { AppProvider } from "@/context/app-context";

export const metadata: Metadata = {
  title: "GatherIQ",
  description: "Point your camera at the congregation. Let AI detect and count the people. Get your attendance report.",
  icons: {
    icon: [{ url: "/gatheriq-icon.svg", type: "image/svg+xml" }],
    shortcut: "/gatheriq-icon.svg",
    apple: "/gatheriq-icon.svg",
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#16A34A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body className="font-sans"><AppProvider>{children}</AppProvider></body>
    </html>
  );
}
