import { cn } from "@/lib/utils";
import type { AttendanceRecord } from "@/lib/types";
export const StatusBadge = ({ status }: { status: AttendanceRecord["status"] }) => (
  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", status === "Confirmed" ? "bg-brand-light text-brand-dark" : "bg-amber-100 text-amber-700")}>
    <i className={cn("h-1.5 w-1.5 rounded-full", status === "Confirmed" ? "bg-brand" : "bg-amber-500")} />{status}
  </span>
);
