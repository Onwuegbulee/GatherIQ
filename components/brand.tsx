import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid h-8 w-8 place-items-center rounded-lg bg-brand text-white", className)} aria-hidden>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v6M9 6h6" /><circle cx="6" cy="17" r="2.2" /><circle cx="12" cy="15" r="2.2" /><circle cx="18" cy="17" r="2.2" /><path d="M3.5 21c.4-1.6 1.4-2 2.5-2M9.5 21c.4-1.6 1.2-2 2.5-2s2.1.4 2.5 2M18 19c1.1 0 2.1.4 2.5 2" />
      </svg>
    </span>
  );
}
export function Brand({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <BrandMark />
      <span className={cn("text-[15px] font-semibold tracking-tight", light ? "text-white" : "text-ink")}>GatherIQ</span>
    </span>
  );
}
