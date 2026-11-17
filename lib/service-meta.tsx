import { BookOpen, CalendarDays, Sparkles, Sun, Users, type LucideIcon } from "lucide-react";

export function serviceMeta(type: string): { Icon: LucideIcon; bg: string; fg: string } {
  switch (type) {
    case "Sunday Service": return { Icon: Sun, bg: "bg-amber-50", fg: "text-amber-600" };
    case "Wednesday Service": return { Icon: BookOpen, bg: "bg-sky-50", fg: "text-sky-600" };
    case "Special Programmes": return { Icon: Sparkles, bg: "bg-violet-50", fg: "text-violet-600" };
    case "Workers' Meeting": return { Icon: Users, bg: "bg-emerald-50", fg: "text-emerald-600" };
    default: return { Icon: CalendarDays, bg: "bg-slate-100", fg: "text-slate-600" };
  }
}

export function ServiceIcon({ type, className = "h-9 w-9" }: { type: string; className?: string }) {
  const { Icon, bg, fg } = serviceMeta(type);
  return <span className={`grid shrink-0 place-items-center rounded-xl ${bg} ${fg} ${className}`}><Icon className="h-[45%] w-[45%]" /></span>;
}
