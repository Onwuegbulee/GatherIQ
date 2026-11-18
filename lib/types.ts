export type ScannerState = "ready" | "recording" | "paused" | "processing" | "completed";

export interface ServiceCategory {
  id: string;
  name: string;
  description: string;
  sessionCount?: number;
  averageAttendance?: number;
}

export interface AttendanceRecord {
  id: string;
  serviceName: string;
  serviceType: string;
  date: string; // YYYY-MM-DD
  attendance: number;
  durationSeconds: number;
  status: "Confirmed" | "Pending";
  createdBy: string;
  description?: string;
  countSource?: "ai" | "demo" | "manual";
  /** true for sample records, false for real sessions */
  isSample: boolean;
  male?: number;
  female?: number;
}

export interface SessionDraft {
  id?: string;
  serviceId?: string;
  serviceName: string;
  serviceType: string;
  date: string;
  description: string;
}

export interface SessionResult extends SessionDraft {
  count: number;
  durationSeconds: number;
  endedAt: string;
  countSource: "ai" | "demo" | "manual";
  isDemoCount: boolean;
  male?: number;
  female?: number;
}

export interface AppSettings {
  churchName: string;
  churchLocation: string;
  adminName: string;
  adminEmail: string;
  attendanceTarget: number;
  preferredCamera: string;
  facingMode: "environment" | "user";
  videoQuality: "low" | "medium" | "high";
  notifyOnSave: boolean;
  notifyWeekly: boolean;
  compactTables: boolean;
}

export interface UserProfile {
  id: string;
  churchId: string;
  fullName: string;
  email: string;
  role: string;
}
