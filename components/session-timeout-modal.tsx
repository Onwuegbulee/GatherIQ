"use client";
import { Clock, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function SessionTimeoutModal({
  open,
  remainingSeconds,
  busy,
  onStayLoggedIn,
  onLogoutNow,
}: {
  open: boolean;
  remainingSeconds: number;
  busy?: boolean;
  onStayLoggedIn: () => void;
  onLogoutNow: () => void;
}) {
  return (
    <Modal open={open} onClose={() => undefined} title="Your session is about to expire">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p>
            You have been inactive for some time. For your security, GatherIQ will log you out shortly.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-line bg-slate-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium text-muted">
            <Clock className="h-4 w-4 text-brand-dark" />
            Time remaining
          </span>
          <span
            className="text-xl font-bold tabular-nums text-ink"
            aria-live="polite"
          >
            {formatCountdown(remainingSeconds)}
          </span>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onLogoutNow}
            disabled={busy}
            className="sm:flex-1"
          >
            <LogOut className="h-4 w-4" />
            Log out now
          </Button>
          <Button
            type="button"
            onClick={onStayLoggedIn}
            disabled={busy}
            className="sm:flex-1"
          >
            {busy ? "Extending…" : "Stay logged in"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
