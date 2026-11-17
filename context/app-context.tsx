"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AppSettings, AttendanceRecord, ServiceCategory, SessionDraft, SessionResult } from "@/lib/types";
import { DEFAULT_SERVICES, DEFAULT_SETTINGS, MOCK_RECORDS } from "@/lib/mock-data";

const K = { auth: "cc_auth", services: "cc_services", settings: "cc_settings", saved: "cc_saved_records", confirmed: "cc_confirmed" };
const S = { draft: "cc_session_draft", result: "cc_session_result" };

interface AppContextValue {
  ready: boolean;
  authed: boolean;
  login: (remember: boolean) => void;
  logout: () => void;
  services: ServiceCategory[];
  addService: (s: Omit<ServiceCategory, "id">) => void;
  updateService: (s: ServiceCategory) => void;
  deleteService: (id: string) => void;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  records: AttendanceRecord[];
  saveRecord: (r: SessionResult) => AttendanceRecord;
  confirmRecord: (id: string) => void;
  deleteRecord: (id: string) => void;
  draft: SessionDraft | null;
  setDraft: (d: SessionDraft | null) => void;
  result: SessionResult | null;
  setResult: (r: SessionResult | null) => void;
}

const Ctx = createContext<AppContextValue | null>(null);

function read<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(storage: Storage, key: string, value: unknown) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode / quota) — state still works in memory */
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [services, setServices] = useState<ServiceCategory[]>(DEFAULT_SERVICES);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<AttendanceRecord[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [draft, setDraftState] = useState<SessionDraft | null>(null);
  const [result, setResultState] = useState<SessionResult | null>(null);

  useEffect(() => {
    setAuthed(!!(read<string>(localStorage, K.auth) ?? read<string>(sessionStorage, K.auth)));
    setServices(read<ServiceCategory[]>(localStorage, K.services) ?? DEFAULT_SERVICES);
    setSettings({ ...DEFAULT_SETTINGS, ...(read<AppSettings>(localStorage, K.settings) ?? {}) });
    setSaved(read<AttendanceRecord[]>(localStorage, K.saved) ?? []);
    setConfirmed(read<string[]>(localStorage, K.confirmed) ?? []);
    setDraftState(read<SessionDraft>(sessionStorage, S.draft));
    setResultState(read<SessionResult>(sessionStorage, S.result));
    setReady(true);
  }, []);

  const login = useCallback((remember: boolean) => {
    write(remember ? localStorage : sessionStorage, K.auth, "mock-admin-token");
    setAuthed(true);
  }, []);
  const logout = useCallback(() => {
    write(localStorage, K.auth, null);
    write(sessionStorage, K.auth, null);
    setAuthed(false);
  }, []);

  const persistServices = (next: ServiceCategory[]) => { setServices(next); write(localStorage, K.services, next); };
  const addService = (s: Omit<ServiceCategory, "id">) => persistServices([...services, { ...s, id: `svc-${Date.now()}` }]);
  const updateService = (s: ServiceCategory) => persistServices(services.map((x) => (x.id === s.id ? s : x)));
  const deleteService = (id: string) => persistServices(services.filter((x) => x.id !== id));

  const updateSettings = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    write(localStorage, K.settings, next);
  };

  const saveRecord = (r: SessionResult) => {
    const rec: AttendanceRecord = {
      id: `local-${Date.now()}`, serviceName: r.serviceName, serviceType: r.serviceType, date: r.date,
      attendance: r.count, male: r.male, female: r.female, durationSeconds: r.durationSeconds, status: "Confirmed",
      createdBy: settings.adminName, description: r.description, isSample: false,
    };
    const next = [rec, ...saved];
    setSaved(next);
    write(localStorage, K.saved, next);
    return rec;
  };

  const confirmRecord = (id: string) => {
    const next = Array.from(new Set([...confirmed, id]));
    setConfirmed(next);
    write(localStorage, K.confirmed, next);
  };
  const deleteRecord = (id: string) => {
    const next = saved.filter((r) => r.id !== id);
    setSaved(next);
    write(localStorage, K.saved, next);
  };

  const setDraft = (d: SessionDraft | null) => { setDraftState(d); write(sessionStorage, S.draft, d); };
  const setResult = (r: SessionResult | null) => { setResultState(r); write(sessionStorage, S.result, r); };

  const records = useMemo(
    () => [...saved, ...MOCK_RECORDS].map((r) => (confirmed.includes(r.id) ? { ...r, status: "Confirmed" as const } : r)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [saved, confirmed]
  );

  const value: AppContextValue = {
    ready, authed, login, logout, services, addService, updateService, deleteService,
    settings, updateSettings, records, saveRecord, confirmRecord, deleteRecord, draft, setDraft, result, setResult,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
