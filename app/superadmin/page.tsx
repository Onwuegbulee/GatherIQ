"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  Menu,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { SuperAdminSidebar } from "@/components/superadmin/sidebar";
import { useApp } from "@/context/app-context";
import { api } from "@/lib/api";
import type { ActivityLogItem, ChurchDetails, PlatformOverviewData, UserProfile } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export default function SuperAdminDashboardPage() {
  const { ready, authed, user } = useApp();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<string>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Data states
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<PlatformOverviewData | null>(null);
  const [churches, setChurches] = useState<ChurchDetails[]>([]);
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Registration Form State
  const [regBusy, setRegBusy] = useState(false);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regForm, setRegForm] = useState({
    churchName: "",
    churchEmail: "",
    phone: "",
    location: "",
    adminFullName: "",
    adminEmail: "",
    initialPassword: "",
    confirmPassword: "",
  });

  // Password Reset Modal State
  const [resetTargetUser, setResetTargetUser] = useState<UserProfile | null>(null);
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  // Super Admin Change Password State
  const [cpCurrent, setCpCurrent] = useState("");
  const [cpNew, setCpNew] = useState("");
  const [cpConfirm, setCpConfirm] = useState("");
  const [cpBusy, setCpBusy] = useState(false);
  const [cpMessage, setCpMessage] = useState<string | null>(null);
  const [cpError, setCpError] = useState<string | null>(null);

  // Edit Church Modal State
  const [editingChurch, setEditingChurch] = useState<ChurchDetails | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Guard: Must be authenticated Super Admin
  useEffect(() => {
    if (ready) {
      if (!authed) {
        router.replace("/superadmin/login");
      } else if (user && user.role !== "super_admin") {
        router.replace("/dashboard");
      }
    }
  }, [ready, authed, user, router]);

  // Load Platform Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [ovData, chData, admData, logData] = await Promise.all([
        api.superadmin.overview().catch(() => null),
        api.superadmin.listChurches().catch(() => []),
        api.superadmin.listAdministrators().catch(() => []),
        api.superadmin.activityLogs(50).catch(() => []),
      ]);
      if (ovData) setOverview(ovData);
      setChurches(chData);
      setAdmins(admData);
      setLogs(logData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authed && user?.role === "super_admin") {
      loadData();
    }
  }, [authed, user]);

  // Handle Church Registration
  const handleRegisterChurch = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccess(null);

    if (!regForm.churchName.trim()) {
      setRegError("Church name is required.");
      return;
    }
    if (!regForm.adminFullName.trim()) {
      setRegError("Administrator full name is required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(regForm.adminEmail)) {
      setRegError("A valid administrator email is required.");
      return;
    }
    if (regForm.initialPassword.length < 6) {
      setRegError("Password must be at least 6 characters.");
      return;
    }
    if (regForm.initialPassword !== regForm.confirmPassword) {
      setRegError("Passwords do not match.");
      return;
    }

    setRegBusy(true);
    try {
      const created = await api.superadmin.registerChurch({
        churchName: regForm.churchName.trim(),
        churchEmail: regForm.churchEmail.trim() || undefined,
        phone: regForm.phone.trim() || undefined,
        location: regForm.location.trim() || undefined,
        adminFullName: regForm.adminFullName.trim(),
        adminEmail: regForm.adminEmail.trim().toLowerCase(),
        initialPassword: regForm.initialPassword,
      });

      setRegSuccess(`Successfully registered ${created.name} with administrator ${regForm.adminEmail}. Initial password configured.`);
      setRegForm({
        churchName: "",
        churchEmail: "",
        phone: "",
        location: "",
        adminFullName: "",
        adminEmail: "",
        initialPassword: "",
        confirmPassword: "",
      });
      loadData();
    } catch (err: any) {
      setRegError(err?.message || "Failed to register church.");
    } finally {
      setRegBusy(false);
    }
  };

  // Toggle Church Active/Suspended
  const handleToggleStatus = async (churchId: string) => {
    try {
      await api.superadmin.toggleStatus(churchId);
      loadData();
    } catch (err: any) {
      alert(err?.message || "Failed to toggle church status");
    }
  };

  // Handle Password Reset Submission
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    if (newAdminPassword.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    setResetBusy(true);
    setResetError(null);
    try {
      await api.superadmin.resetPassword(resetTargetUser.id, newAdminPassword);
      setResetSuccess(`Password reset for ${resetTargetUser.email}. User must change it on next login.`);
      setNewAdminPassword("");
      setTimeout(() => {
        setResetTargetUser(null);
        setResetSuccess(null);
      }, 1500);
      loadData();
    } catch (err: any) {
      setResetError(err?.message || "Failed to reset password.");
    } finally {
      setResetBusy(false);
    }
  };

  // Handle Super Admin Password Change
  const handleChangeSuperAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpError(null);
    setCpMessage(null);
    if (!cpCurrent) {
      setCpError("Current password is required.");
      return;
    }
    if (cpNew.length < 6) {
      setCpError("New password must be at least 6 characters.");
      return;
    }
    if (cpNew !== cpConfirm) {
      setCpError("New passwords do not match.");
      return;
    }
    setCpBusy(true);
    try {
      await api.auth.changePassword(cpCurrent, cpNew);
      setCpMessage("Password updated successfully. Future logins will require the new password.");
      setCpCurrent("");
      setCpNew("");
      setCpConfirm("");
      loadData();
    } catch (err: any) {
      setCpError(err?.message || "Failed to update password.");
    } finally {
      setCpBusy(false);
    }
  };

  // Handle Church Edit Save
  const handleSaveChurchEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChurch) return;
    setEditBusy(true);
    setEditError(null);
    try {
      await api.superadmin.updateChurch(editingChurch.id, {
        name: editingChurch.name,
        location: editingChurch.location,
        email: editingChurch.email,
        phone: editingChurch.phone,
      });
      setEditingChurch(null);
      loadData();
    } catch (err: any) {
      setEditError(err?.message || "Failed to update church.");
    } finally {
      setEditBusy(false);
    }
  };

  if (!ready || !authed || user?.role !== "super_admin") {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted bg-[#F8FAFC]">
        Authenticating Super Administrator session…
      </div>
    );
  }

  // Filtered churches
  const filteredChurches = churches.filter((c) => {
    const matchesSearch =
      !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.adminEmail && c.adminEmail.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.adminName && c.adminName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && c.isActive) ||
      (statusFilter === "suspended" && !c.isActive);

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,#ECFDF3_0%,#F8FAFC_45%)] text-ink">
      <SuperAdminSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100 lg:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-tight text-ink text-base">GatherIQ Super Admin</span>
              <span className="rounded-md bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                Platform Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={loadData} disabled={loading} className="gap-1.5 text-xs">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Sync
            </Button>
            <div className="hidden sm:flex items-center gap-2 border-l border-slate-200 pl-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-forest text-xs font-semibold text-white">
                SA
              </span>
              <span className="text-xs font-medium text-slate-700">{user?.email}</span>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 space-y-6">
          {/* TAB: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Platform Overview</h1>
                <p className="mt-1 text-sm text-muted">
                  System health, multi-tenant church statistics, and live platform metrics.
                </p>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted">Total Churches</CardTitle>
                    <Building2 className="h-4 w-4 text-brand" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overview?.totalChurches ?? churches.length}</div>
                    <p className="mt-1 text-xs text-muted">
                      {overview?.activeChurches ?? churches.filter((c) => c.isActive).length} active &bull;{" "}
                      {overview?.suspendedChurches ?? churches.filter((c) => !c.isActive).length} suspended
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted">Church Administrators</CardTitle>
                    <Users2 className="h-4 w-4 text-emerald-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overview?.totalAdministrators ?? admins.length}</div>
                    <p className="mt-1 text-xs text-muted">Dedicated tenant accounts</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted">Attendance Sessions</CardTitle>
                    <Activity className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overview?.totalSessions ?? 0}</div>
                    <p className="mt-1 text-xs text-muted">Persisted church service records</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted">Congregation Counted</CardTitle>
                    <UserCheck className="h-4 w-4 text-indigo-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {(overview?.totalAttendanceRecorded ?? 0).toLocaleString()}
                    </div>
                    <p className="mt-1 text-xs text-muted">Aggregated across all services</p>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions & Recent Activity */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold">Registered Churches</CardTitle>
                      <CardDescription>Overview of tenants on the GatherIQ platform</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => setActiveTab("register")} className="gap-1.5 text-xs">
                      <Plus className="h-3.5 w-3.5" /> Register Church
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {churches.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted">No churches registered yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b text-xs font-semibold uppercase text-muted">
                              <th className="pb-3">Church Name</th>
                              <th className="pb-3">Location</th>
                              <th className="pb-3">Admin</th>
                              <th className="pb-3">Status</th>
                              <th className="pb-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {churches.slice(0, 5).map((c) => (
                              <tr key={c.id} className="hover:bg-slate-50/60">
                                <td className="py-3 font-medium text-ink">{c.name}</td>
                                <td className="py-3 text-muted">{c.location || "—"}</td>
                                <td className="py-3 text-muted">{c.adminEmail || "—"}</td>
                                <td className="py-3">
                                  <Badge tone={c.isActive ? "green" : "red"}>
                                    {c.isActive ? "Active" : "Suspended"}
                                  </Badge>
                                </td>
                                <td className="py-3 text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setActiveTab("churches")}
                                    className="text-xs"
                                  >
                                    Manage
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Recent System Activity */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
                    <CardDescription>Audit trail of governance actions</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {logs.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted">No activity logged yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {logs.slice(0, 6).map((log) => (
                          <div key={log.id} className="flex flex-col text-xs space-y-0.5 border-b pb-2">
                            <span className="font-semibold text-ink">{log.action}</span>
                            <span className="text-muted line-clamp-1">{log.details}</span>
                            <span className="text-[10px] text-slate-400">{formatDate(log.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* TAB: CHURCH MANAGEMENT */}
          {activeTab === "churches" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Church Management</h1>
                  <p className="mt-1 text-sm text-muted">
                    Search, inspect, update, and toggle active status for all church tenants.
                  </p>
                </div>
                <Button onClick={() => setActiveTab("register")} className="gap-2">
                  <Plus className="h-4 w-4" /> Register New Church
                </Button>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
                  <Input
                    placeholder="Search by church name, location, or administrator email…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-white"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={statusFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter("all")}
                  >
                    All
                  </Button>
                  <Button
                    variant={statusFilter === "active" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter("active")}
                  >
                    Active
                  </Button>
                  <Button
                    variant={statusFilter === "suspended" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter("suspended")}
                  >
                    Suspended
                  </Button>
                </div>
              </div>

              {/* Church Table */}
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-muted">
                        <tr>
                          <th className="px-6 py-3">Church Information</th>
                          <th className="px-6 py-3">Location &amp; Contact</th>
                          <th className="px-6 py-3">Administrator</th>
                          <th className="px-6 py-3">Sessions &amp; Count</th>
                          <th className="px-6 py-3">Status</th>
                          <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredChurches.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-sm text-muted">
                              No churches found matching your filters.
                            </td>
                          </tr>
                        ) : (
                          filteredChurches.map((c) => (
                            <tr key={c.id} className="hover:bg-slate-50/70">
                              <td className="px-6 py-4">
                                <div className="font-semibold text-ink">{c.name}</div>
                                <div className="text-xs text-muted">ID: {c.id.slice(0, 8)}…</div>
                              </td>
                              <td className="px-6 py-4">
                                <div>{c.location || "No location set"}</div>
                                <div className="text-xs text-muted">{c.phone || c.email || "No contact info"}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="font-medium text-ink">{c.adminName || "No admin assigned"}</div>
                                <div className="text-xs text-muted">{c.adminEmail || "—"}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="font-medium">{c.totalSessions} sessions</div>
                                <div className="text-xs text-muted">{c.totalAttendance.toLocaleString()} people</div>
                              </td>
                              <td className="px-6 py-4">
                                <Badge tone={c.isActive ? "green" : "red"}>
                                  {c.isActive ? "Active" : "Suspended"}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 text-right space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingChurch(c)}
                                  className="text-xs"
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant={c.isActive ? "soft" : "default"}
                                  size="sm"
                                  onClick={() => handleToggleStatus(c.id)}
                                  className="text-xs"
                                >
                                  {c.isActive ? "Suspend" : "Activate"}
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB: REGISTER CHURCH */}
          {activeTab === "register" && (
            <div className="max-w-3xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Register New Church</h1>
                <p className="mt-1 text-sm text-muted">
                  Create a new church tenant and provision its initial church administrator account.
                </p>
              </div>

              {regSuccess && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                  <span>{regSuccess}</span>
                </div>
              )}

              {regError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700 border border-red-200">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span>{regError}</span>
                </div>
              )}

              <Card>
                <form onSubmit={handleRegisterChurch}>
                  <CardHeader>
                    <CardTitle className="text-lg">Church Tenant Details</CardTitle>
                    <CardDescription>Enter the institutional details for this congregation</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Field label="Church Name *" htmlFor="churchName">
                      <Input
                        id="churchName"
                        placeholder="e.g. Grace Community Church"
                        value={regForm.churchName}
                        onChange={(e) => setRegForm({ ...regForm, churchName: e.target.value })}
                        required
                      />
                    </Field>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Church Location / City" htmlFor="location">
                        <Input
                          id="location"
                          placeholder="e.g. Springfield Main Campus"
                          value={regForm.location}
                          onChange={(e) => setRegForm({ ...regForm, location: e.target.value })}
                        />
                      </Field>
                      <Field label="Phone Number" htmlFor="phone">
                        <Input
                          id="phone"
                          placeholder="e.g. +1 555-0199"
                          value={regForm.phone}
                          onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                        />
                      </Field>
                    </div>

                    <Field label="Official Church Email (optional)" htmlFor="churchEmail">
                      <Input
                        id="churchEmail"
                        type="email"
                        placeholder="e.g. contact@gracechurch.org"
                        value={regForm.churchEmail}
                        onChange={(e) => setRegForm({ ...regForm, churchEmail: e.target.value })}
                      />
                    </Field>

                    <div className="pt-4 border-t border-slate-100">
                      <h3 className="text-base font-semibold text-ink">Administrator Information</h3>
                      <p className="text-xs text-muted mb-4">
                        Manually configure the initial administrator credentials. A password change will be enforced on first login.
                      </p>

                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <Field label="Administrator Full Name *" htmlFor="adminFullName">
                            <Input
                              id="adminFullName"
                              placeholder="e.g. Pastor John Doe"
                              value={regForm.adminFullName}
                              onChange={(e) => setRegForm({ ...regForm, adminFullName: e.target.value })}
                              required
                            />
                          </Field>
                          <Field label="Administrator Email *" htmlFor="adminEmail">
                            <Input
                              id="adminEmail"
                              type="email"
                              placeholder="e.g. john@gracechurch.org"
                              value={regForm.adminEmail}
                              onChange={(e) => setRegForm({ ...regForm, adminEmail: e.target.value })}
                              required
                            />
                          </Field>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <Field label="Initial Password *" htmlFor="initialPassword">
                            <div className="relative">
                              <Input
                                id="initialPassword"
                                type={showRegPassword ? "text" : "password"}
                                placeholder="Set initial password"
                                value={regForm.initialPassword}
                                onChange={(e) => setRegForm({ ...regForm, initialPassword: e.target.value })}
                                required
                                className="pr-10"
                              />
                              <button
                                type="button"
                                onClick={() => setShowRegPassword(!showRegPassword)}
                                className="absolute right-2 top-2.5 text-muted hover:text-ink"
                              >
                                {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </Field>

                          <Field label="Confirm Password *" htmlFor="confirmPassword">
                            <Input
                              id="confirmPassword"
                              type={showRegPassword ? "text" : "password"}
                              placeholder="Confirm password"
                              value={regForm.confirmPassword}
                              onChange={(e) => setRegForm({ ...regForm, confirmPassword: e.target.value })}
                              required
                            />
                          </Field>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                      <Button type="button" variant="outline" onClick={() => setActiveTab("churches")}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={regBusy}>
                        {regBusy ? "Creating Church & Admin…" : "Complete Church Registration"}
                      </Button>
                    </div>
                  </CardContent>
                </form>
              </Card>
            </div>
          )}

          {/* TAB: ADMINISTRATOR MANAGEMENT */}
          {activeTab === "admins" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Administrator Management</h1>
                <p className="mt-1 text-sm text-muted">
                  View all system and church administrators, verify roles, and perform password resets.
                </p>
              </div>

              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-muted">
                        <tr>
                          <th className="px-6 py-3">Full Name</th>
                          <th className="px-6 py-3">Email Address</th>
                          <th className="px-6 py-3">Role</th>
                          <th className="px-6 py-3">Church Assignment</th>
                          <th className="px-6 py-3">Security Status</th>
                          <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {admins.map((adm) => (
                          <tr key={adm.id} className="hover:bg-slate-50/70">
                            <td className="px-6 py-4 font-semibold text-ink">{adm.fullName}</td>
                            <td className="px-6 py-4 text-muted">{adm.email}</td>
                            <td className="px-6 py-4">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                                  adm.role === "super_admin"
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-emerald-100 text-emerald-800"
                                )}
                              >
                                {adm.role === "super_admin" ? "Super Admin" : "Church Admin"}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-muted">
                              {adm.churchId ? `Church (${adm.churchId.slice(0, 8)}…)` : "Platform-Wide (None)"}
                            </td>
                            <td className="px-6 py-4">
                              {adm.mustChangePassword ? (
                                <Badge tone="amber">Password Change Required</Badge>
                              ) : (
                                <Badge tone="green">Normal</Badge>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {adm.role !== "super_admin" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setResetTargetUser(adm)}
                                  className="text-xs gap-1"
                                >
                                  <KeyRound className="h-3.5 w-3.5" /> Reset Password
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB: ACTIVITY LOGS */}
          {activeTab === "activity" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Activity &amp; Audit Logs</h1>
                <p className="mt-1 text-sm text-muted">
                  Immutable audit records of all administrative actions, church status updates, and password changes.
                </p>
              </div>

              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-muted">
                        <tr>
                          <th className="px-6 py-3">Timestamp</th>
                          <th className="px-6 py-3">Action</th>
                          <th className="px-6 py-3">Operator</th>
                          <th className="px-6 py-3">Target</th>
                          <th className="px-6 py-3">Details</th>
                          <th className="px-6 py-3">IP Address</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {logs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-sm text-muted">
                              No activity logs recorded yet.
                            </td>
                          </tr>
                        ) : (
                          logs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-50/70 text-xs">
                              <td className="px-6 py-3 text-muted">{formatDate(log.createdAt)}</td>
                              <td className="px-6 py-3 font-semibold text-ink">{log.action}</td>
                              <td className="px-6 py-3 text-muted">{log.userEmail}</td>
                              <td className="px-6 py-3 text-slate-700">
                                {log.targetType} ({log.targetId.slice(0, 8)}…)
                              </td>
                              <td className="px-6 py-3 text-slate-600 max-w-xs truncate">{log.details}</td>
                              <td className="px-6 py-3 text-muted">{log.ipAddress || "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB: PLATFORM SETTINGS */}
          {activeTab === "settings" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Platform Settings</h1>
                <p className="mt-1 text-sm text-muted">
                  Platform policies, global security flags, and computer vision configuration.
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Security &amp; Privacy Standards</CardTitle>
                  <CardDescription>GatherIQ core privacy constraints</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                    <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-ink">Zero Face Recognition Policy</p>
                      <p className="text-xs text-muted">
                        No member biometric templates, facial recognition models, or demographic profiling is permitted on the platform.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                    <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-ink">Argon2 Password Hashing</p>
                      <p className="text-xs text-muted">
                        All passwords are encrypted with memory-hard Argon2id parameters. Plaintext passwords are never persisted.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                    <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-ink">Multi-Tenant Church Isolation</p>
                      <p className="text-xs text-muted">
                        Strict database foreign key constraints and query filters guarantee church administrators only access their own congregation data.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB: SUPER ADMIN PROFILE */}
          {activeTab === "profile" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Super Admin Profile</h1>
                <p className="mt-1 text-sm text-muted">
                  Manage platform administrator account credentials and enforce secure password changes.
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Account Information</CardTitle>
                  <CardDescription>Active Super Administrator credentials</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted font-medium">Full Name</span>
                    <span className="col-span-2 font-semibold text-ink">{user?.fullName || "Platform Super Admin"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted font-medium">Email / Username</span>
                    <span className="col-span-2 font-semibold text-ink">{user?.email || "superadmin@gatheriq.dev"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted font-medium">Role</span>
                    <span className="col-span-2">
                      <span className="rounded-md bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">
                        super_admin (Platform-Wide)
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Change Password Card */}
              <Card>
                <form onSubmit={handleChangeSuperAdminPassword}>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Change Super Admin Password</CardTitle>
                    <CardDescription>
                      Update the master platform password using the current password.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {cpMessage && (
                      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{cpMessage}</span>
                      </div>
                    )}
                    {cpError && (
                      <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{cpError}</span>
                      </div>
                    )}

                    <Field label="Current Password" htmlFor="currentPassword">
                      <Input
                        id="currentPassword"
                        type="password"
                        placeholder="Enter current password"
                        value={cpCurrent}
                        onChange={(e) => setCpCurrent(e.target.value)}
                        required
                      />
                    </Field>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="New Password" htmlFor="newPassword">
                        <Input
                          id="newPassword"
                          type="password"
                          placeholder="At least 6 characters"
                          value={cpNew}
                          onChange={(e) => setCpNew(e.target.value)}
                          required
                        />
                      </Field>
                      <Field label="Confirm New Password" htmlFor="confirmNewPassword">
                        <Input
                          id="confirmNewPassword"
                          type="password"
                          placeholder="Re-enter new password"
                          value={cpConfirm}
                          onChange={(e) => setCpConfirm(e.target.value)}
                          required
                        />
                      </Field>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button type="submit" disabled={cpBusy}>
                        {cpBusy ? "Updating Password…" : "Update Password"}
                      </Button>
                    </div>
                  </CardContent>
                </form>
              </Card>
            </div>
          )}
        </main>
      </div>

      {/* Edit Church Modal */}
      {editingChurch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b">
              <h3 className="text-lg font-bold text-ink">Edit Church Details</h3>
              <button
                onClick={() => setEditingChurch(null)}
                className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {editError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                <AlertCircle className="h-4 w-4" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveChurchEdit} className="mt-4 space-y-4">
              <Field label="Church Name" htmlFor="editName">
                <Input
                  id="editName"
                  value={editingChurch.name}
                  onChange={(e) => setEditingChurch({ ...editingChurch, name: e.target.value })}
                  required
                />
              </Field>

              <Field label="Location" htmlFor="editLocation">
                <Input
                  id="editLocation"
                  value={editingChurch.location}
                  onChange={(e) => setEditingChurch({ ...editingChurch, location: e.target.value })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Email" htmlFor="editEmail">
                  <Input
                    id="editEmail"
                    value={editingChurch.email}
                    onChange={(e) => setEditingChurch({ ...editingChurch, email: e.target.value })}
                  />
                </Field>
                <Field label="Phone" htmlFor="editPhone">
                  <Input
                    id="editPhone"
                    value={editingChurch.phone}
                    onChange={(e) => setEditingChurch({ ...editingChurch, phone: e.target.value })}
                  />
                </Field>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setEditingChurch(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editBusy}>
                  {editBusy ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="text-lg font-bold text-ink">Reset Admin Password</h3>
              <button
                onClick={() => setResetTargetUser(null)}
                className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs text-muted">
              Configure a new temporary password for <strong>{resetTargetUser.email}</strong>. The user will be required to change it on next login.
            </p>

            {resetSuccess && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{resetSuccess}</span>
              </div>
            )}

            {resetError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                <AlertCircle className="h-4 w-4" />
                <span>{resetError}</span>
              </div>
            )}

            <form onSubmit={handleResetPasswordSubmit} className="mt-4 space-y-4">
              <Field label="New Initial Password" htmlFor="resetPassword">
                <div className="relative">
                  <Input
                    id="resetPassword"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2 top-2.5 text-muted hover:text-ink"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button type="button" variant="outline" onClick={() => setResetTargetUser(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={resetBusy}>
                  {resetBusy ? "Resetting…" : "Reset Password"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
