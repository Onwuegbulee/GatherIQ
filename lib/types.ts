export type ScannerState = "ready" | "recording" | "paused" | "processing" | "completed";

export interface ServiceCategory { id: string; name: string; description: string }

export interface AttendanceRecord {
  id: string;
  serviceName: string;
  serviceType: string;
  date: string; // YYYY-MM-DD
  attendance: number;
  male: number;
  female: number;
  durationSeconds: number;
  status: "Confirmed" | "Pending";
  createdBy: string;
  description?: string;
  /** true for built-in demonstration records, false for sessions saved from this browser */
  isSample: boolean;
}

export interface SessionDraft { serviceName: string; serviceType: string; date: string; description: string }

export interface SessionResult extends SessionDraft {
  count: number;
  male: number;
  female: number;
  durationSeconds: number;
  endedAt: string;
  /** Always true until a real detection engine is connected. */
  isDemoCount: boolean;
}

export interface AppSettings {
  churchName: string; churchLocation: string; adminName: string; adminEmail: string;
  attendanceTarget: number;
  preferredCamera: string; facingMode: "environment" | "user"; videoQuality: "low" | "medium" | "high";
  notifyOnSave: boolean; notifyWeekly: boolean; compactTables: boolean;
}
