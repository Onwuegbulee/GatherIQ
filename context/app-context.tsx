"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AppSettings, AttendanceRecord, ServiceCategory, SessionDraft, SessionResult, UserProfile } from "@/lib/types";
import { DEFAULT_SERVICES, EMPTY_SETTINGS } from "@/lib/defaults";
import { api, getApiToken, setApiToken } from "@/lib/api";
import { SessionTimeoutModal } from "@/components/session-timeout-modal";

const K = {
  auth: "cc_auth",
  services: "cc_services",
  settings: "cc_settings",
  saved: "cc_saved_records",
  confirmed: "cc_confirmed",
  lastActivity: "cc_last_activity",
  logoutEvent: "cc_logout_event",
};
const S = { draft: "cc_session_draft", result: "cc_session_result" };

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const WARNING_AT_MS = 13 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 3_000;
const SERVER_PING_INTERVAL_MS = 60_000;

interface AppContextValue {
  ready: boolean;
  authed: boolean;
  user: UserProfile | null;
  dataLoading: boolean;
  dataError: string | null;
  refreshData: () => Promise<void>;
  login: (email?: string, password?: string, remember?: boolean) => Promise<UserProfile>;
  setupChurch: (churchName: string, churchLocation: string, fullName: string, email: string, password: string) => Promise<boolean>;
  logout: (reason?: "manual" | "inactivity") => Promise<void>;
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
  const router = useRouter();
  const pathname = usePathname();
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

  const [timeoutWarningOpen, setTimeoutWarningOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(120);
  const [extendingSession, setExtendingSession] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const lastServerPingRef = useRef<number>(0);
  const loggingOutRef = useRef<boolean>(false);
  const warningOpenRef = useRef<boolean>(false);
  warningOpenRef.current = timeoutWarningOpen;

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

  const markActivityTimestamp = useCallback((now: number = Date.now()) => {
    lastActivityRef.current = now;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(K.lastActivity, String(now));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const clearLocalAuthState = useCallback(() => {
    setApiToken(null);
    write(localStorage, K.auth, null);
    write(sessionStorage, K.auth, null);
    write(localStorage, K.saved, null);
    write(localStorage, K.services, null);
    write(localStorage, K.settings, null);
    write(localStorage, K.confirmed, null);
    write(localStorage, K.lastActivity, null);
    write(sessionStorage, S.draft, null);
    write(sessionStorage, S.result, null);
    setTimeoutWarningOpen(false);
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

  const login = useCallback(async (email?: string, password?: string, remember: boolean = true): Promise<UserProfile> => {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }
    const res = await api.auth.login(email.trim(), password, remember);
    loggingOutRef.current = false;
    markActivityTimestamp(Date.now());
    lastServerPingRef.current = Date.now();
    setTimeoutWarningOpen(false);
    setUser(res.user);
    setAuthed(true);
    setBackendOnline(true);
    write(remember ? localStorage : sessionStorage, K.auth, res.access_token);

    // If church user, fetch fresh church services, settings, and sessions
    if (res.user.role !== "super_admin" && (res.user.church_id || res.user.churchId)) {
      await loadChurchData(res.user);
    }

    return res.user;
  }, [loadChurchData, markActivityTimestamp]);

  const setupChurch = useCallback(async (churchName: string, churchLocation: string, fullName: string, email: string, password: string) => {
    const res = await api.auth.setup(churchName, churchLocation, fullName, email, password);
    loggingOutRef.current = false;
    markActivityTimestamp(Date.now());
    lastServerPingRef.current = Date.now();
    setTimeoutWarningOpen(false);
    setUser(res.user);
    setAuthed(true);
    setBackendOnline(true);
    write(localStorage, K.auth, res.access_token);
    await loadChurchData(res.user);
    return true;
  }, [loadChurchData, markActivityTimestamp]);

  const logout = useCallback(async (reason: "manual" | "inactivity" = "manual") => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;

    const isSuperAdmin = user?.role === "super_admin" || (pathname?.startsWith("/superadmin") ?? false);

    try {
      // If an attendance session is active/recording during inactivity logout,
      // pause it cleanly on the server before revoking tokens so counts & duration are preserved.
      if (reason === "inactivity") {
        const activeDraft = draft ?? read<SessionDraft>(sessionStorage, S.draft);
        if (activeDraft?.id && getApiToken()) {
          await api.sessions.pause(activeDraft.id).catch(() => undefined);
        }
      }
      await api.auth.logout();
    } catch {
      // ignore network errors during logout cleanup
    } finally {
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(K.logoutEvent, JSON.stringify({ at: Date.now(), reason }));
        } catch {
          /* ignore */
        }
      }
      clearLocalAuthState();
      loggingOutRef.current = false;

      if (reason === "inactivity") {
        router.replace(isSuperAdmin ? "/superadmin/login?reason=inactivity" : "/login?reason=inactivity");
      }
    }
  }, [clearLocalAuthState, draft, pathname, router, user?.role]);

  const handleStayLoggedIn = useCallback(async () => {
    setExtendingSession(true);
    try {
      await api.auth.refresh();
      const now = Date.now();
      markActivityTimestamp(now);
      lastServerPingRef.current = now;
      setTimeoutWarningOpen(false);
    } catch {
      await logout("inactivity");
    } finally {
      setExtendingSession(false);
    }
  }, [logout, markActivityTimestamp]);

  // Record meaningful route navigation as user activity
  useEffect(() => {
    if (!ready || !authed || warningOpenRef.current) return;
    const now = Date.now();
    if (now - lastActivityRef.current >= ACTIVITY_THROTTLE_MS) {
      markActivityTimestamp(now);
    }
  }, [pathname, ready, authed, markActivityTimestamp]);

  // Inactivity monitoring, warning countdown, and multi-tab synchronization
  useEffect(() => {
    if (!ready || !authed || typeof window === "undefined") return;

    // Initialize activity timestamp if absent or stale from an older session
    const storedRaw = localStorage.getItem(K.lastActivity);
    const storedTime = storedRaw ? Number(storedRaw) : NaN;
    if (!storedRaw || Number.isNaN(storedTime)) {
      markActivityTimestamp(Date.now());
    } else {
      lastActivityRef.current = storedTime;
    }

    const onUserActivity = () => {
      if (warningOpenRef.current) return;
      const now = Date.now();
      if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;
      markActivityTimestamp(now);

      if (now - lastServerPingRef.current >= SERVER_PING_INTERVAL_MS) {
        lastServerPingRef.current = now;
        api.auth.activity().catch((err: any) => {
          if (err?.status === 401) {
            void logout("inactivity");
          }
        });
      }
    };

    const events: (keyof WindowEventMap)[] = [
      "mousedown",
      "mousemove",
      "keydown",
      "touchstart",
      "scroll",
      "pointerdown",
    ];
    events.forEach((evt) => window.addEventListener(evt, onUserActivity, { passive: true }));

    const onStorage = (e: StorageEvent) => {
      if (e.key === K.logoutEvent && e.newValue) {
        let reason: "manual" | "inactivity" = "manual";
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed?.reason === "inactivity") reason = "inactivity";
        } catch {
          /* ignore */
        }
        const isSuperAdmin = user?.role === "super_admin" || (pathname?.startsWith("/superadmin") ?? false);
        clearLocalAuthState();
        router.replace(
          isSuperAdmin
            ? reason === "inactivity"
              ? "/superadmin/login?reason=inactivity"
              : "/superadmin/login"
            : reason === "inactivity"
              ? "/login?reason=inactivity"
              : "/login"
        );
      } else if (e.key === K.lastActivity && e.newValue) {
        const ts = Number(e.newValue);
        if (!Number.isNaN(ts)) {
          lastActivityRef.current = ts;
          if (Date.now() - ts < WARNING_AT_MS) {
            setTimeoutWarningOpen(false);
          }
        }
      }
    };
    window.addEventListener("storage", onStorage);

    const interval = window.setInterval(() => {
      const raw = localStorage.getItem(K.lastActivity);
      const latest = raw ? Number(raw) : lastActivityRef.current;
      const effectiveLatest = Number.isNaN(latest) ? lastActivityRef.current : Math.max(latest, lastActivityRef.current);
      const idleMs = Date.now() - effectiveLatest;

      if (idleMs >= INACTIVITY_TIMEOUT_MS) {
        void logout("inactivity");
      } else if (idleMs >= WARNING_AT_MS) {
        setTimeoutWarningOpen(true);
        setRemainingSeconds(Math.max(0, Math.ceil((INACTIVITY_TIMEOUT_MS - idleMs) / 1000)));
      } else if (warningOpenRef.current) {
        setTimeoutWarningOpen(false);
      }
    }, 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, onUserActivity));
      window.removeEventListener("storage", onStorage);
      window.clearInterval(interval);
    };
  }, [ready, authed, clearLocalAuthState, logout, markActivityTimestamp, pathname, router, user?.role]);

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

  return (
    <Ctx.Provider value={value}>
      {children}
      {ready && authed && (
        <SessionTimeoutModal
          open={timeoutWarningOpen}
          remainingSeconds={remainingSeconds}
          busy={extendingSession}
          onStayLoggedIn={() => void handleStayLoggedIn()}
          onLogoutNow={() => void logout("inactivity")}
        />
      )}
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
