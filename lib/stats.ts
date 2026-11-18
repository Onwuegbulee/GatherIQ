import type { AttendanceRecord } from "./types";
import { formatDate } from "./utils";

export const sum = (r: AttendanceRecord[]) => r.reduce((a, x) => a + x.attendance, 0);
export const avg = (r: AttendanceRecord[]) => (r.length ? Math.round(sum(r) / r.length) : 0);
export const chronological = (r: AttendanceRecord[]) => [...r].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
export const genderTotals = (r: AttendanceRecord[]) => ({ male: r.reduce((a, x) => a + (x.male || 0), 0), female: r.reduce((a, x) => a + (x.female || 0), 0) });

export function growth(records: AttendanceRecord[]) {
  const s = chronological(records.filter((r) => r.serviceType === "Sunday Service"));
  if (s.length < 2) return 0;
  const a = s[s.length - 1].attendance, b = s[s.length - 2].attendance;
  return b ? ((a - b) / b) * 100 : 0;
}

export const sundaySeries = (records: AttendanceRecord[], n = 10) =>
  chronological(records.filter((r) => r.serviceType === "Sunday Service")).slice(-n).map((r) => r.attendance);

export function averageByType(records: AttendanceRecord[]) {
  const groups: [string, string][] = [["Sunday Service", "Sunday"], ["Wednesday Service", "Wednesday"], ["Special Programmes", "Special"]];
  return groups.map(([type, name]) => ({ name, average: avg(records.filter((r) => r.serviceType === type)) }));
}

export interface TrendPoint { label: string; attendance: number; male?: number; female?: number; name: string; date: string }
export const trendPoints = (records: AttendanceRecord[], n = 10): TrendPoint[] =>
  chronological(records).slice(-n).map((r) => ({ label: formatDate(r.date, { day: "numeric", month: "short" }), attendance: r.attendance, male: r.male || 0, female: r.female || 0, name: r.serviceName, date: r.date }));

export function runningAverage(values: number[]) {
  let t = 0;
  return values.map((v, i) => ((t += v), Math.round(t / (i + 1))));
}

export function weekdayAverages(records: AttendanceRecord[]) {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const b: number[][] = names.map(() => []);
  records.forEach((r) => b[(new Date(r.date + "T00:00:00Z").getUTCDay() + 6) % 7].push(r.attendance));
  return names.map((day, i) => ({ day, avg: b[i].length ? Math.round(b[i].reduce((x, y) => x + y, 0) / b[i].length) : 0 }));
}

export const topBy = (records: AttendanceRecord[], n = 5) => [...records].sort((a, b) => b.attendance - a.attendance).slice(0, n);

export function sessionsPerMonth(records: AttendanceRecord[], n = 7) {
  const m = new Map<string, number>();
  chronological(records).forEach((r) => m.set(r.date.slice(0, 7), (m.get(r.date.slice(0, 7)) ?? 0) + 1));
  return Array.from(m.values()).slice(-n);
}
