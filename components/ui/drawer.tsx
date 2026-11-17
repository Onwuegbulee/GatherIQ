"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { useBodyLock } from "./modal";

export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  useBodyLock(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] animate-fade-in" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" />
      <aside role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-pop animate-slide-in">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Close panel" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 scroll-thin">{children}</div>
        {footer && <footer className="border-t border-line p-4">{footer}</footer>}
      </aside>
    </div>
  );
}
