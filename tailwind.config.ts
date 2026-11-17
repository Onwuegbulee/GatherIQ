import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F8FAFC", ink: "#0F172A", muted: "#64748B", line: "#E2E8F0",
        brand: { DEFAULT: "#16A34A", dark: "#15803D", light: "#DCFCE7", soft: "#F0FDF4" },
        forest: { DEFAULT: "#0B3D22", 800: "#14532D" },
        success: "#22C55E", warning: "#F59E0B", danger: "#EF4444",
      },
      fontFamily: { sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"] },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.04), 0 14px 32px -18px rgba(15,23,42,.16)",
        pop: "0 28px 70px -18px rgba(15,23,42,.38)",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        popIn: { from: { opacity: "0", transform: "translateY(10px) scale(.97)" }, to: { opacity: "1", transform: "none" } },
        slideIn: { from: { transform: "translateX(100%)" }, to: { transform: "none" } },
        toastIn: { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        "fade-in": "fadeIn .18s ease-out", "pop-in": "popIn .22s cubic-bezier(.2,.8,.2,1)",
        "slide-in": "slideIn .28s cubic-bezier(.2,.8,.2,1)", "toast-in": "toastIn .25s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
