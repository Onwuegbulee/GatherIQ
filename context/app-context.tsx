"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AppSettings, AttendanceRecord, ServiceCategory, SessionDraft, SessionResult, UserProfile } from "@/lib/types";
import { DEFAULT_SERVICES, DEFAULT_SETTINGS, MOCK_RECORDS } from "@/lib/mock-data";
import { api, getApiToken, setApiToken } from "@/lib/api";

const K = {
  auth: "cc_auth",
  services: "cc_services",
  settings: "cc_settings",
  saved: "cc_saved_records",
  confirmed: "cc_confirmed",
};
const S = { draft: "cc_session_draft", result: "cc_session_result" };

interface AppContextValue {
  ready: boolean;
  authed: boolean;
  user: UserProfile | null;
  login: (email?: string, password?: string, remember?: boolean) => Promise<boolean>;
  setupChurch: (churchName: string, churchLocation: string, fullName: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  services: ServiceCategory[];
  addService: (s: Omit<ServiceCategory, "id">) => Promise<void>;
  updateService: (s: ServiceCategory) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  records: AttendanceRecord[];
  saveRecord: (r: SessionResult) => Promise<AttendanceRecord>;
  confirmRecord: (id: string) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  draft: SessionDraft | null;
  setDraft: (d: SessionDraft | null) => void;
  result: SessionResult | null;
  setResult: (r: SessionResult | null) => void;
  backendOnline: boolean;
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
    /* storage unavailable */
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [services, setServices] = useState<ServiceCategory[]>(DEFAULT_SERVICES);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<AttendanceRecord[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [draft, setDraftState] = useState<SessionDraft | null>(null);
  const [result, setResultState] = useState<SessionResult | null>(null);

  // Initialize from storage and verify backend connection
  useEffect(() => {
    const cachedToken = getApiToken() || read<string>(localStorage, K.auth) || read<string>(sessionStorage, K.auth);
    setServices(read<ServiceCategory[]>(localStorage, K.services) ?? DEFAULT_SERVICES);
    setSettings({ ...DEFAULT_SETTINGS, ...(read<AppSettings>(localStorage, K.settings) ?? {}) });
    setSaved(read<AttendanceRecord[]>(localStorage, K.saved) ?? []);
    setConfirmed(read<string[]>(localStorage, K.confirmed) ?? []);
    setDraftState(read<SessionDraft>(sessionStorage, S.draft));
    setResultState(read<SessionResult>(sessionStorage, S.result));

    async function init() {
      // Clean up legacy mock tokens if present
      if (cachedToken === "mock-admin-token") {
        setApiToken(null);
        write(localStorage, K.auth, null);
        write(sessionStorage, K.auth, null);
      }

      const isOnline = await api.health();
      setBackendOnline(isOnline);

      const activeToken = getApiToken();
      if (activeToken && isOnline) {
        try {
          const profile = await api.auth.me();
          setUser(profile);
          setAuthed(true);
          // Fetch real services, settings, and sessions
          const [realServices, realSettings, realSessions] = await Promise.all([
            api.services.list().catch(() => null),
            api.settings.get().catch(() => null),
            api.sessions.list().catch(() => null),
          ]);
          if (realServices) {
            setServices(realServices);
            write(localStorage, K.services, realServices);
          }
          if (realSettings) {
            setSettings((prev) => ({ ...prev, ...realSettings }));
            write(localStorage, K.settings, realSettings);
          }
          if (realSessions && realSessions.length > 0) {
            setSaved(realSessions);
            write(localStorage, K.saved, realSessions);
          }
        } catch {
          // Token might be expired, try refresh
          try {
            const refreshed = await api.auth.refresh();
            setUser(refreshed.user);
            setAuthed(true);
          } catch {
            // Token invalid or refresh expired: clear credentials
            setApiToken(null);
            write(localStorage, K.auth, null);
            write(sessionStorage, K.auth, null);
            setUser(null);
            setAuthed(false);
          }
        }
      } else {
        // Backend offline or no valid token: NEVER silently authenticate
        setUser(null);
        setAuthed(false);
      }
      setReady(true);
    }

    init();
  }, []);

  const login = useCallback(async (email?: string, password?: string, remember: boolean = true) => {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }
    const res = await api.auth.login(email, password, remember);
    setUser(res.user);
    setAuthed(true);
    write(remember ? localStorage : sessionStorage, K.auth, res.access_token);

    // Fetch fresh church services, settings, and sessions
    const [svcs, stgs, sess] = await Promise.all([
      api.services.list().catch(() => null),
      api.settings.get().catch(() => null),
      api.sessions.list().catch(() => null),
    ]);
    if (svcs) setServices(svcs);
    if (stgs) setSettings((prev) => ({ ...prev, ...stgs }));
    if (sess) setSaved(sess);

    return true;
  }, []);

  const setupChurch = useCallback(async (churchName: string, churchLocation: string, fullName: string, email: string, password: string) => {
    const res = await api.auth.setup(churchName, churchLocation, fullName, email, password);
    setUser(res.user);
    setAuthed(true);
    write(localStorage, K.auth, res.access_token);
    const [svcs, stgs] = await Promise.all([
      api.services.list().catch(() => null),
      api.settings.get().catch(() => null),
    ]);
    if (svcs) setServices(svcs);
    if (stgs) setSettings((prev) => ({ ...prev, ...stgs }));
    return true;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore
    }
    setApiToken(null);
    write(localStorage, K.auth, null);
    write(sessionStorage, K.auth, null);
    setUser(null);
    setAuthed(false);
  }, []);

  const addService = async (s: Omit<ServiceCategory, "id">) => {
    try {
      const created = await api.services.create(s.name, s.description);
      const next = [...services, created];
      setServices(next);
      write(localStorage, K.services, next);
    } catch {
      const fallback = { ...s, id: `svc-${Date.now()}` };
      const next = [...services, fallback];
      setServices(next);
      write(localStorage, K.services, next);
    }
  };

  const updateService = async (s: ServiceCategory) => {
    try {
      await api.services.update(s.id, s.name, s.description);
    } catch {
      // offline fallback
    }
    const next = services.map((x) => (x.id === s.id ? s : x));
    setServices(next);
    write(localStorage, K.services, next);
  };

  const deleteService = async (id: string) => {
    try {
      await api.services.delete(id);
    } catch {
      // offline fallback
    }
    const next = services.filter((x) => x.id !== id);
    setServices(next);
    write(localStorage, K.services, next);
  };

  const updateSettings = async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    write(localStorage, K.settings, next);
    try {
      await api.settings.update(patch);
    } catch {
      // offline fallback
    }
  };

  const saveRecord = async (r: SessionResult): Promise<AttendanceRecord> => {
    let rec: AttendanceRecord;
    try {
      // Persist to real backend
      const createdSession = await api.sessions.create({
        serviceName: r.serviceName,
        serviceType: r.serviceType,
        date: r.date,
        description: r.description || "",
      });
      await api.sessions.start(createdSession.id);
      await api.sessions.updateCount(createdSession.id, r.count, r.countSource || (r.isDemoCount ? "demo" : "manual"));
      await api.sessions.end(createdSession.id);
      await api.sessions.confirm(createdSession.id);

      rec = {
        id: createdSession.id,
        serviceName: r.serviceName,
        serviceType: r.serviceType,
        date: r.date,
        attendance: r.count,
        durationSeconds: r.durationSeconds,
        status: "Confirmed",
        createdBy: settings.adminName || "Admin",
        description: r.description,
        countSource: r.countSource || (r.isDemoCount ? "demo" : "manual"),
        isSample: false,
      };
    } catch {
      // Offline fallback
      rec = {
        id: `local-${Date.now()}`,
        serviceName: r.serviceName,
        serviceType: r.serviceType,
        date: r.date,
        attendance: r.count,
        durationSeconds: r.durationSeconds,
        status: "Confirmed",
        createdBy: settings.adminName || "Admin",
        description: r.description,
        countSource: r.countSource || (r.isDemoCount ? "demo" : "manual"),
        isSample: false,
      };
    }

    const next = [rec, ...saved.filter((x) => x.id !== rec.id)];
    setSaved(next);
    write(localStorage, K.saved, next);
    return rec;
  };

  const confirmRecord = async (id: string) => {
    try {
      await api.sessions.confirm(id);
    } catch {
      // offline fallback
    }
    const next = Array.from(new Set([...confirmed, id]));
    setConfirmed(next);
    write(localStorage, K.confirmed, next);
  };

  const deleteRecord = async (id: string) => {
    try {
      await api.sessions.delete(id);
    } catch {
      // offline fallback
    }
    const next = saved.filter((r) => r.id !== id);
    setSaved(next);
    write(localStorage, K.saved, next);
  };

  const setDraft = (d: SessionDraft | null) => {
    setDraftState(d);
    write(sessionStorage, S.draft, d);
  };

  const setResult = (r: SessionResult | null) => {
    setResultState(r);
    write(sessionStorage, S.result, r);
  };

  const records = useMemo(() => {
    const list = saved.length > 0 ? saved : MOCK_RECORDS;
    return list
      .map((r) => (confirmed.includes(r.id) ? { ...r, status: "Confirmed" as const } : r))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [saved, confirmed]);

  const value: AppContextValue = {
    ready,
    authed,
    user,
    backendOnline,
    login,
    setupChurch,
    logout,
    services,
    addService,
    updateService,
    deleteService,
    settings,
    updateSettings,
    records,
    saveRecord,
    confirmRecord,
    deleteRecord,
    draft,
    setDraft,
    result,
    setResult,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
