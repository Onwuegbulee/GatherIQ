import { cn } from "@/lib/utils";

const tones = {
  green: "bg-brand-light text-brand-dark",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  slate: "bg-slate-100 text-slate-600",
};

export function Badge({ tone = "slate", className, children }: { tone?: keyof typeof tones; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export const SampleBadge = () => <Badge tone="amber">Sample data</Badge>;
