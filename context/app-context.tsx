"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AppSettings, AttendanceRecord, ServiceCategory, SessionDraft, SessionResult, UserProfile } from "@/lib/types";
import { DEFAULT_SERVICES, EMPTY_SETTINGS } from "@/lib/defaults";
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
  dataLoading: boolean;
  dataError: string | null;
  refreshData: () => Promise<void>;
  login: (email?: string, password?: string, remember?: boolean) => Promise<UserProfile>;
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
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceCategory[]>(DEFAULT_SERVICES);
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [saved, setSaved] = useState<AttendanceRecord[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [draft, setDraftState] = useState<SessionDraft | null>(null);
  const [result, setResultState] = useState<SessionResult | null>(null);

  const loadChurchData = useCallback(async (profile: UserProfile) => {
    if (profile.role === "super_admin" || (!profile.church_id && !profile.churchId)) {
      return;
    }
    setDataLoading(true);
    setDataError(null);
    const [svcRes, stgRes, sessRes] = await Promise.allSettled([
      api.services.list(),
      api.settings.get(),
      api.sessions.list(),
    ]);

    if (svcRes.status === "fulfilled") {
      setServices(svcRes.value);
      write(localStorage, K.services, svcRes.value);
    }

    if (stgRes.status === "fulfilled") {
      const merged: AppSettings = {
        ...EMPTY_SETTINGS,
        ...(read<AppSettings>(localStorage, K.settings) ?? {}),
        ...stgRes.value,
        adminName: stgRes.value.adminName || profile.fullName || profile.full_name || "Admin",
        adminEmail: stgRes.value.adminEmail || profile.email || "",
      };
      setSettings(merged);
      write(localStorage, K.settings, merged);
    } else {
      setSettings((prev) => ({
        ...prev,
        adminName: prev.adminName || profile.fullName || profile.full_name || "Admin",
        adminEmail: prev.adminEmail || profile.email || "",
      }));
    }

    if (sessRes.status === "fulfilled") {
      setSaved(sessRes.value);
      write(localStorage, K.saved, sessRes.value);
      setBackendOnline(true);
    } else {
      setDataError("Unable to load attendance records from the server. Please check your connection and try again.");
    }

    setDataLoading(false);
  }, []);

  const refreshData = useCallback(async () => {
    if (!user) return;
    await loadChurchData(user);
  }, [user, loadChurchData]);

  // Initialize from storage and verify backend connection
  useEffect(() => {
    const cachedToken = getApiToken() || read<string>(localStorage, K.auth) || read<string>(sessionStorage, K.auth);
    setServices(read<ServiceCategory[]>(localStorage, K.services) ?? DEFAULT_SERVICES);
    setSettings({ ...EMPTY_SETTINGS, ...(read<AppSettings>(localStorage, K.settings) ?? {}) });
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

      const activeToken = getApiToken();
      if (activeToken) {
        try {
          const profile = await api.auth.me();
          setUser(profile);
          setAuthed(true);
          setBackendOnline(true);

          if (profile.role !== "super_admin" && (profile.church_id || profile.churchId)) {
            await loadChurchData(profile);
          }
        } catch (err: any) {
          if (err?.status === 401) {
            try {
              const refreshed = await api.auth.refresh();
              setUser(refreshed.user);
              setAuthed(true);
              setBackendOnline(true);
              if (refreshed.user && refreshed.user.role !== "super_admin" && (refreshed.user.church_id || refreshed.user.churchId)) {
                await loadChurchData(refreshed.user);
              }
            } catch (refErr: any) {
              if (refErr?.status === 401) {
                setApiToken(null);
                write(localStorage, K.auth, null);
                write(sessionStorage, K.auth, null);
                setUser(null);
                setAuthed(false);
              }
            }
          } else if (err?.status === 0) {
            setBackendOnline(false);
            setDataError("Cannot reach the server right now. Please try again.");
          }
        }
      } else {
        // No access token in storage: attempt session restoration via refresh token / cookie
        try {
          const refreshed = await api.auth.refresh();
          setUser(refreshed.user);
          setAuthed(true);
          setBackendOnline(true);

          if (refreshed.user?.role !== "super_admin" && (refreshed.user?.church_id || refreshed.user?.churchId)) {
            await loadChurchData(refreshed.user);
          }
        } catch {
          setUser(null);
          setAuthed(false);
        }
      }

      api.health().then((online) => setBackendOnline(online)).catch(() => {});
      setReady(true);
    }

    init();
  }, [loadChurchData]);

  const login = useCallback(async (email?: string, password?: string, remember: boolean = true): Promise<UserProfile> => {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }
    const res = await api.auth.login(email.trim(), password, remember);
    setUser(res.user);
    setAuthed(true);
    setBackendOnline(true);
    write(remember ? localStorage : sessionStorage, K.auth, res.access_token);

    // If church user, fetch fresh church services, settings, and sessions
    if (res.user.role !== "super_admin" && (res.user.church_id || res.user.churchId)) {
      await loadChurchData(res.user);
    }

    return res.user;
  }, [loadChurchData]);

  const setupChurch = useCallback(async (churchName: string, churchLocation: string, fullName: string, email: string, password: string) => {
    const res = await api.auth.setup(churchName, churchLocation, fullName, email, password);
    setUser(res.user);
    setAuthed(true);
    setBackendOnline(true);
    write(localStorage, K.auth, res.access_token);
    await loadChurchData(res.user);
    return true;
  }, [loadChurchData]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore
    }
    setApiToken(null);
    write(localStorage, K.auth, null);
    write(sessionStorage, K.auth, null);
    write(localStorage, K.saved, null);
    write(localStorage, K.services, null);
    write(localStorage, K.settings, null);
    write(localStorage, K.confirmed, null);
    write(sessionStorage, S.draft, null);
    write(sessionStorage, S.result, null);
    setUser(null);
    setAuthed(false);
    setSaved([]);
    setConfirmed([]);
    setServices(DEFAULT_SERVICES);
    setSettings(EMPTY_SETTINGS);
    setDraftState(null);
    setResultState(null);
    setDataError(null);
  }, []);

  const addService = async (s: Omit<ServiceCategory, "id">) => {
    const created = await api.services.create(s.name, s.description);
    const next = [...services, created];
    setServices(next);
    write(localStorage, K.services, next);
  };

  const updateService = async (s: ServiceCategory) => {
    await api.services.update(s.id, s.name, s.description);
    const next = services.map((x) => (x.id === s.id ? s : x));
    setServices(next);
    write(localStorage, K.services, next);
  };

  const deleteService = async (id: string) => {
    await api.services.delete(id);
    const next = services.filter((x) => x.id !== id);
    setServices(next);
    write(localStorage, K.services, next);
  };

  const updateSettings = async (patch: Partial<AppSettings>) => {
    await api.settings.update(patch);
    const next = { ...settings, ...patch };
    setSettings(next);
    write(localStorage, K.settings, next);
  };

  const saveRecord = async (r: SessionResult): Promise<AttendanceRecord> => {
    let sessionId = r.id;
    if (!sessionId) {
      const createdSession = await api.sessions.create({
        serviceId: r.serviceId,
        serviceName: r.serviceName,
        serviceType: r.serviceType,
        date: r.date,
        description: r.description || "",
      });
      const createdId: string = createdSession.id;
      sessionId = createdId;
      await api.sessions.start(createdId);
    }

    const source = r.countSource === "ai" ? "ai" : "manual";
    await api.sessions.start(sessionId!).catch(() => undefined);
    await api.sessions.updateCount(sessionId!, r.count, source).catch(() => undefined);
    await api.sessions.end(sessionId!).catch(() => undefined);
    await api.sessions.confirm(sessionId!);

    const rec: AttendanceRecord = {
      id: sessionId!,
      serviceName: r.serviceName,
      serviceType: r.serviceType,
      date: r.date,
      attendance: r.count,
      durationSeconds: r.durationSeconds,
      status: "Confirmed",
      createdBy: settings.adminName || user?.fullName || "Admin",
      description: r.description,
      countSource: source,
    };

    const next = [rec, ...saved.filter((x) => x.id !== rec.id)];
    setSaved(next);
    write(localStorage, K.saved, next);
    return rec;
  };

  const confirmRecord = async (id: string) => {
    await api.sessions.confirm(id);
    const next = Array.from(new Set([...confirmed, id]));
    setConfirmed(next);
    write(localStorage, K.confirmed, next);
    setSaved((prev) => {
      const updated = prev.map((r) => (r.id === id ? { ...r, status: "Confirmed" as const } : r));
      write(localStorage, K.saved, updated);
      return updated;
    });
  };

  const deleteRecord = async (id: string) => {
    await api.sessions.delete(id);
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
    return saved
      .map((r) => (confirmed.includes(r.id) ? { ...r, status: "Confirmed" as const } : r))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [saved, confirmed]);

  const value: AppContextValue = {
    ready,
    authed,
    user,
    dataLoading,
    dataError,
    refreshData,
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
