import type { AppSettings, ServiceCategory } from "./types";

export const DEFAULT_SERVICES: ServiceCategory[] = [
  { id: "sunday", name: "Sunday Service", description: "Main weekly worship service" },
  { id: "wednesday", name: "Wednesday Service", description: "Midweek Bible study and prayer" },
  { id: "special", name: "Special Programmes", description: "Conferences, crusades and special events" },
  { id: "workers", name: "Workers' Meeting", description: "Meeting for ministry workers and ushers" },
];

export const EMPTY_SETTINGS: AppSettings = {
  churchName: "",
  churchLocation: "",
  adminName: "",
  adminEmail: "",
  attendanceTarget: 1300,
  preferredCamera: "auto",
  facingMode: "environment",
  videoQuality: "medium",
  notifyOnSave: true,
  notifyWeekly: false,
  compactTables: false,
};
