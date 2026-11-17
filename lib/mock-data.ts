import type { AttendanceRecord, ServiceCategory, AppSettings } from "./types";

export const DEFAULT_SERVICES: ServiceCategory[] = [
  { id: "sunday", name: "Sunday Service", description: "Main weekly worship service" },
  { id: "wednesday", name: "Wednesday Service", description: "Midweek Bible study and prayer" },
  { id: "special", name: "Special Programmes", description: "Conferences, crusades and special events" },
  { id: "workers", name: "Workers' Meeting", description: "Meeting for ministry workers and ushers" },
];

export const DEFAULT_SETTINGS: AppSettings = {
  churchName: "Grace Assembly", churchLocation: "Lagos, Nigeria", adminName: "Admin", adminEmail: "admin@churchcount.app",
  attendanceTarget: 1300,
  preferredCamera: "auto", facingMode: "environment", videoQuality: "medium",
  notifyOnSave: true, notifyWeekly: false, compactTables: false,
};

const BASE = Date.UTC(2026, 10, 15); // Sunday, 15 Nov 2026
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const split = (n: number, seed: number) => { const female = Math.round(n * (0.54 + ((seed * 7) % 6) / 100)); return { female, male: n - female }; };

function build(): AttendanceRecord[] {
  const out: AttendanceRecord[] = [];
  const admins = ["Admin", "Tunde A.", "Grace O."];
  const note = "Sample record for demonstration.";
  for (let i = 0; i < 12; i++) {
    const sunday = 1120 + ((i * 53) % 130) + (11 - i) * 6;
    out.push({ id: `s-${i}`, serviceName: "Sunday Service", serviceType: "Sunday Service", date: iso(BASE - i * 7 * DAY), attendance: sunday, ...split(sunday, i),
      durationSeconds: 600 + ((i * 47) % 240), status: i === 0 ? "Pending" : "Confirmed", createdBy: admins[i % 3], isSample: true, description: note });
    const mid = 380 + ((i * 37) % 90) + (11 - i) * 3;
    out.push({ id: `w-${i}`, serviceName: "Wednesday Service", serviceType: "Wednesday Service", date: iso(BASE - (4 + i * 7) * DAY), attendance: mid, ...split(mid, i + 2),
      durationSeconds: 420 + ((i * 31) % 180), status: "Confirmed", createdBy: admins[(i + 1) % 3], isSample: true, description: note });
  }
  const specials: [string, number, number, number][] = [
    ["Annual Thanksgiving Service", 3, 1860, 1260], ["Youth Convention", 6, 1420, 980], ["Easter Special Service", 31, 2210, 1380],
  ];
  specials.forEach(([name, weeksAgo, count, secs], i) =>
    out.push({ id: `p-${i}`, serviceName: name, serviceType: "Special Programmes", date: iso(BASE - (weeksAgo * 7 + 5 - i * 2) * DAY), attendance: count, ...split(count, i + 3),
      durationSeconds: secs, status: "Confirmed", createdBy: "Admin", isSample: true, description: note }));
  for (let i = 0; i < 4; i++) {
    const c = 140 + ((i * 29) % 40);
    out.push({ id: `m-${i}`, serviceName: "Workers' Meeting", serviceType: "Workers' Meeting", date: iso(BASE - (1 + i * 14) * DAY), attendance: c, ...split(c, i + 1),
      durationSeconds: 360 + i * 20, status: "Confirmed", createdBy: "Grace O.", isSample: true, description: note });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export const MOCK_RECORDS: AttendanceRecord[] = build();
