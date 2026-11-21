import type { AppSettings, AttendanceRecord, ServiceCategory, SessionDraft, SessionResult, UserProfile } from "./types";

const rawApiBase =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export const API_BASE = rawApiBase.replace(/\/+$/, "");

export const WS_BASE = (
  process.env.NEXT_PUBLIC_WS_BASE_URL ||
  process.env.NEXT_PUBLIC_WS_URL ||
  API_BASE.replace(/^http/, "ws")
).replace(/\/+$/, "");

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
    changePassword: async (currentPassword: string, newPassword: string) => {
      return request<{ message: string }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
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

  superadmin: {
    overview: async (): Promise<any> => {
      const res = await request<any>("/api/superadmin/overview");
      return {
        totalChurches: res.total_churches,
        activeChurches: res.active_churches,
        suspendedChurches: res.suspended_churches,
        totalAdministrators: res.total_administrators,
        totalSessions: res.total_sessions,
        totalAttendanceRecorded: res.total_attendance_recorded,
        recentActivity: (res.recent_activity || []).map((l: any) => ({
          id: l.id,
          userId: l.user_id,
          userEmail: l.user_email,
          churchId: l.church_id,
          action: l.action,
          targetType: l.target_type,
          targetId: l.target_id,
          details: l.details,
          ipAddress: l.ip_address,
          createdAt: l.created_at,
        })),
      };
    },
    listChurches: async (params: { q?: string; status?: string } = {}): Promise<any[]> => {
      const qs = new URLSearchParams();
      if (params.q) qs.set("q", params.q);
      if (params.status) qs.set("status_filter", params.status);
      const res = await request<any[]>(`/api/superadmin/churches?${qs.toString()}`);
      return res.map((c) => ({
        id: c.id,
        name: c.name,
        location: c.location,
        email: c.email,
        phone: c.phone,
        isActive: c.is_active,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        adminName: c.admin_name,
        adminEmail: c.admin_email,
        totalSessions: c.total_sessions || 0,
        totalAttendance: c.total_attendance || 0,
      }));
    },
    getChurch: async (churchId: string): Promise<any> => {
      const c = await request<any>(`/api/superadmin/churches/${churchId}`);
      return {
        id: c.id,
        name: c.name,
        location: c.location,
        email: c.email,
        phone: c.phone,
        isActive: c.is_active,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        adminName: c.admin_name,
        adminEmail: c.admin_email,
        totalSessions: c.total_sessions || 0,
        totalAttendance: c.total_attendance || 0,
      };
    },
    registerChurch: async (payload: {
      churchName: string;
      churchEmail?: string;
      phone?: string;
      location?: string;
      adminFullName: string;
      adminEmail: string;
      initialPassword: string;
    }): Promise<any> => {
      const res = await request<any>("/api/superadmin/churches", {
        method: "POST",
        body: JSON.stringify({
          church_name: payload.churchName,
          church_email: payload.churchEmail || "",
          phone: payload.phone || "",
          location: payload.location || "",
          admin_full_name: payload.adminFullName,
          admin_email: payload.adminEmail,
          initial_password: payload.initialPassword,
        }),
      });
      return {
        id: res.id,
        name: res.name,
        location: res.location,
        email: res.email,
        phone: res.phone,
        isActive: res.is_active,
        createdAt: res.created_at,
        updatedAt: res.updated_at,
        adminName: res.admin_name,
        adminEmail: res.admin_email,
        totalSessions: res.total_sessions || 0,
        totalAttendance: res.total_attendance || 0,
      };
    },
    updateChurch: async (churchId: string, payload: {
      name?: string;
      location?: string;
      email?: string;
      phone?: string;
      isActive?: boolean;
    }): Promise<any> => {
      const body: any = {};
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.location !== undefined) body.location = payload.location;
      if (payload.email !== undefined) body.email = payload.email;
      if (payload.phone !== undefined) body.phone = payload.phone;
      if (payload.isActive !== undefined) body.is_active = payload.isActive;

      const res = await request<any>(`/api/superadmin/churches/${churchId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return {
        id: res.id,
        name: res.name,
        location: res.location,
        email: res.email,
        phone: res.phone,
        isActive: res.is_active,
        createdAt: res.created_at,
        updatedAt: res.updated_at,
      };
    },
    toggleStatus: async (churchId: string): Promise<any> => {
      const res = await request<any>(`/api/superadmin/churches/${churchId}/toggle-status`, {
        method: "POST",
      });
      return {
        id: res.id,
        isActive: res.is_active,
      };
    },
    listAdministrators: async (): Promise<any[]> => {
      const res = await request<any[]>("/api/superadmin/administrators");
      return res.map((u) => ({
        id: u.id,
        churchId: u.church_id,
        fullName: u.full_name,
        email: u.email,
        role: u.role,
        isActive: u.is_active,
        mustChangePassword: u.must_change_password,
        createdAt: u.created_at,
      }));
    },
    resetPassword: async (userId: string, newPassword: string): Promise<any> => {
      return request<any>(`/api/superadmin/administrators/${userId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ new_password: newPassword }),
      });
    },
    activityLogs: async (limit: number = 50): Promise<any[]> => {
      const res = await request<any[]>(`/api/superadmin/activity-logs?limit=${limit}`);
      return res.map((l) => ({
        id: l.id,
        userId: l.user_id,
        userEmail: l.user_email,
        churchId: l.church_id,
        action: l.action,
        targetType: l.target_type,
        targetId: l.target_id,
        details: l.details,
        ipAddress: l.ip_address,
        createdAt: l.created_at,
      }));
    },
    getChurchAttendanceStats: async (churchId: string): Promise<any> => {
      return request<any>(`/api/superadmin/churches/${churchId}/attendance-stats`);
    },
  },
};
