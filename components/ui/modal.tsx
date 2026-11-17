"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function useBodyLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}

export function Modal({ open, onClose, title, description, children, dark, size = "md" }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode; dark?: boolean; size?: "md" | "lg";
}) {
  useBodyLock(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-slate-950/55 p-0 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className={cn("relative my-auto w-full rounded-t-3xl p-6 shadow-pop animate-pop-in sm:rounded-3xl", size === "lg" ? "max-w-2xl" : "max-w-md", dark ? "bg-slate-900 text-white" : "bg-white text-ink")}>
        <button onClick={onClose} aria-label="Close" className={cn("absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full", dark ? "hover:bg-white/10" : "text-muted hover:bg-slate-100")}><X className="h-4 w-4" /></button>
        <h2 className="pr-8 text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className={cn("mt-1 text-sm", dark ? "text-white/60" : "text-muted")}>{description}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
