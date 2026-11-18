import type { AppSettings, AttendanceRecord, ServiceCategory, SessionDraft, SessionResult, UserProfile } from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const WS_BASE = API_BASE.replace(/^http/, "ws");

class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

let authToken: string | null = null;

export function setApiToken(token: string | null) {
  authToken = token;
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem("cc_access_token", token);
    else localStorage.removeItem("cc_access_token");
  }
}

export function getApiToken(): string | null {
  if (authToken) return authToken;
  if (typeof window !== "undefined") {
    authToken = localStorage.getItem("cc_access_token");
  }
  return authToken;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getApiToken();
  const headers = new Headers(options.headers || {});
  
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = `${API_BASE}${endpoint}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch (err: any) {
    throw new ApiError(`Network error connecting to GatherIQ API: ${err.message}`, 0);
  }

  if (response.status === 204) {
    return null as unknown as T;
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.detail || data?.message || `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

export const api = {
  health: async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      return res.ok;
    } catch {
      return false;
    }
  },

  auth: {
    login: async (email: string, password: string, remember: boolean = false) => {
      const res = await request<{ access_token: string; user: any }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, remember }),
      });
      setApiToken(res.access_token);
      return res;
    },
    setup: async (churchName: string, churchLocation: string, fullName: string, email: string, password: string) => {
      const res = await request<{ access_token: string; user: any }>("/api/auth/setup", {
        method: "POST",
        body: JSON.stringify({
          church_name: churchName,
          church_location: churchLocation,
          full_name: fullName,
          email,
          password,
        }),
      });
      setApiToken(res.access_token);
      return res;
    },
    me: async () => {
      return request<UserProfile>("/api/auth/me");
    },
    refresh: async () => {
      const res = await request<{ access_token: string; user: any }>("/api/auth/refresh", {
        method: "POST",
      });
      setApiToken(res.access_token);
      return res;
    },
    logout: async () => {
      try {
        await request("/api/auth/logout", { method: "POST" });
      } finally {
        setApiToken(null);
      }
    },
  },

  services: {
    list: async (): Promise<ServiceCategory[]> => {
      const res = await request<any[]>("/api/services");
      return res.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        sessionCount: s.session_count,
        averageAttendance: s.average_attendance,
      }));
    },
    create: async (name: string, description: string): Promise<ServiceCategory> => {
      const s = await request<any>("/api/services", {
        method: "POST",
        body: JSON.stringify({ name, description }),
      });
      return { id: s.id, name: s.name, description: s.description };
    },
    update: async (id: string, name?: string, description?: string): Promise<ServiceCategory> => {
      const s = await request<any>(`/api/services/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name, description }),
      });
      return { id: s.id, name: s.name, description: s.description };
    },
    delete: async (id: string): Promise<void> => {
      await request(`/api/services/${id}`, { method: "DELETE" });
    },
  },

  settings: {
    get: async (): Promise<AppSettings> => {
      const res = await request<any>("/api/settings");
      return {
        churchName: res.church_name,
        churchLocation: res.church_location,
        adminName: "",
        adminEmail: "",
        attendanceTarget: res.attendance_target,
        preferredCamera: "auto",
        facingMode: "environment",
        videoQuality: "medium",
        notifyOnSave: res.notify_on_save,
        notifyWeekly: res.notify_weekly,
        compactTables: res.compact_tables,
      };
    },
    update: async (patch: Partial<AppSettings>): Promise<void> => {
      await request("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          church_name: patch.churchName,
          church_location: patch.churchLocation,
          attendance_target: patch.attendanceTarget,
          notify_on_save: patch.notifyOnSave,
          notify_weekly: patch.notifyWeekly,
          compact_tables: patch.compactTables,
        }),
      });
    },
  },

  sessions: {
    create: async (draft: SessionDraft): Promise<any> => {
      return request<any>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          service_id: draft.serviceId || null,
          service_name: draft.serviceName,
          service_type: draft.serviceType,
          attendance_date: draft.date,
          description: draft.description || "",
        }),
      });
    },
    list: async (params: { serviceType?: string; status?: string; search?: string } = {}): Promise<AttendanceRecord[]> => {
      const qs = new URLSearchParams();
      if (params.serviceType) qs.set("service_type", params.serviceType);
      if (params.status) qs.set("status", params.status);
      if (params.search) qs.set("search", params.search);

      const endpoint = `/api/sessions?${qs.toString()}`;
      const res = await request<any[]>(endpoint);
      return res.map((s) => ({
        id: s.id,
        serviceName: s.service_name,
        serviceType: s.service_type,
        date: s.attendance_date,
        attendance: s.total_count,
        durationSeconds: s.duration_seconds || s.effective_seconds || 0,
        status: s.status as "Confirmed" | "Pending",
        createdBy: s.created_by_name || "Admin",
        description: s.description,
        countSource: s.count_source as any,
        isSample: false,
      }));
    },
    get: async (id: string): Promise<AttendanceRecord> => {
      const s = await request<any>(`/api/sessions/${id}`);
      return {
        id: s.id,
        serviceName: s.service_name,
        serviceType: s.service_type,
        date: s.attendance_date,
        attendance: s.total_count,
        durationSeconds: s.duration_seconds || s.effective_seconds || 0,
        status: s.status as "Confirmed" | "Pending",
        createdBy: s.created_by_name || "Admin",
        description: s.description,
        countSource: s.count_source as any,
        isSample: false,
      };
    },
    start: async (id: string) => request(`/api/sessions/${id}/start`, { method: "POST" }),
    pause: async (id: string) => request(`/api/sessions/${id}/pause`, { method: "POST" }),
    resume: async (id: string) => request(`/api/sessions/${id}/resume`, { method: "POST" }),
    end: async (id: string) => request(`/api/sessions/${id}/end`, { method: "POST" }),
    updateCount: async (id: string, count: number, source: "demo" | "manual" | "ai" = "manual") => {
      return request(`/api/sessions/${id}/count`, {
        method: "POST",
        body: JSON.stringify({ total_count: count, count_source: source }),
      });
    },
    confirm: async (id: string) => request(`/api/sessions/${id}/confirm`, { method: "POST" }),
    delete: async (id: string) => request(`/api/sessions/${id}`, { method: "DELETE" }),
  },

  reports: {
    overview: async () => request<any>("/api/reports/overview"),
  },
};
