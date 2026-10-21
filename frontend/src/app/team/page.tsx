"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, RefreshCw } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth, type AuthUser } from "@/context/AuthContext";
import { getAuthToken } from "@/lib/api";

const roles = ["manager", "pharmacist", "cashier", "inventory_staff"];
const roleName = (role: string) => role.replaceAll("_", " ");
const blankForm = () => ({ full_name: "", email: "", username: "", phone: "", password: "", role: "cashier", is_active: true });
const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to manage staff accounts.";

async function teamRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000"}/api/auth/users${path}`, {
    method, headers: { Authorization: `Bearer ${getAuthToken()}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "Unable to manage staff accounts.");
  return result;
}

export default function TeamPage() {
  const { user } = useAuth();
  const allowed = user?.role === "owner" || user?.role === "manager";
  const [staff, setStaff] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const assignableRoles = user?.role === "owner" ? roles : roles.filter((role) => role !== "manager");

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    teamRequest<{ users: AuthUser[] }>("").then((result) => {
      if (active) { setStaff(result.users); setError(null); }
    }).catch((err: unknown) => { if (active) setError(errorText(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, refresh]);

  function reload() { setLoading(true); setRefresh((value) => value + 1); }
  function edit(target: AuthUser) {
    setEditing(target.id);
    setForm({ full_name: target.full_name, email: target.email, username: target.username, phone: target.phone ?? "", password: "", role: target.role, is_active: target.is_active });
    setFormError(null);
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    if ((editing === null || form.password) && (form.password.length < 8 || new TextEncoder().encode(form.password).length > 72)) { setFormError("Use a password of at least 8 characters and at most 72 UTF-8 bytes."); return; }
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    setSuccess(null);
    try {
      const payload = { full_name: form.full_name.trim(), email: form.email.trim(), username: form.username.trim(), phone: form.phone.trim(), role: form.role, is_active: form.is_active, ...(form.password ? { password: form.password } : {}) };
      const result = await teamRequest<{ user: AuthUser }>(editing === null ? "" : `/${editing}`, editing === null ? "POST" : "PATCH", payload);
      setSuccess(`${result.user.full_name}: account ${editing === null ? "created" : "updated"}.`);
      setOpen(false);
      setForm(blankForm());
      reload();
    } catch (err: unknown) { setFormError(errorText(err)); }
    finally { savingRef.current = false; setSaving(false); }
  }

  if (!allowed) return <div className="page-body"><h1 className="page-title">Team & Access</h1><p style={{ marginTop: "1rem" }}>Owners and managers can manage store staff.</p></div>;

  return <div>
    <header className="page-header"><div><h1 className="page-title">Team & Access</h1><p className="page-subtitle">Staff accounts for Store #{user?.store_id}</p></div><ThemeToggle /></header>
    <div className="page-body" style={{ display: "grid", gap: "1.25rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}><button className="btn btn-secondary" disabled={loading || saving} onClick={reload}><RefreshCw size={15} />Refresh</button><button className="btn btn-primary" disabled={saving} onClick={() => { setEditing(null); setForm(blankForm()); setFormError(null); setOpen(true); }}><Plus size={15} />Add staff member</button></div>
      {success && <p role="status" style={{ color: "var(--status-high-text)" }}>{success}</p>}
      {error && <p role="alert" style={{ color: "var(--status-low-text)" }}>{error}</p>}
      <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>Owners can manage branch managers and staff. Managers can manage pharmacists, cashiers, and inventory staff. Owner accounts and your own account are protected here; use Settings for your own profile.</p>
      {open && <section className="card" aria-labelledby="staff-form-title"><h2 id="staff-form-title" className="card-title">{editing === null ? "Add staff member" : "Edit staff access"}</h2>
        {formError && <p role="alert" style={{ color: "var(--status-low-text)", marginBottom: "1rem" }}>{formError}</p>}
        <form onSubmit={save} style={{ display: "grid", gap: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
            <label className="form-group"><span className="form-label">Full name</span><input className="form-input" required maxLength={200} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">Login email</span><input className="form-input" type="email" autoComplete="off" required maxLength={200} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">Username</span><input className="form-input" autoComplete="off" required maxLength={100} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">Phone</span><input className="form-input" type="tel" maxLength={20} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="form-group"><span className="form-label">Role</span><select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{assignableRoles.map((role) => <option key={role} value={role}>{roleName(role)}</option>)}</select></label>
            <label className="form-group"><span className="form-label">{editing === null ? "Initial password" : "New password (leave empty to keep current)"}</span><input className="form-input" type="password" autoComplete="new-password" required={editing === null} minLength={8} maxLength={72} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Active account</label>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>Deactivated staff cannot sign in or use existing sessions online. Account and audit history are retained.</p>
          <div style={{ display: "flex", gap: "0.75rem" }}><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save staff account"}</button><button className="btn btn-secondary" type="button" disabled={saving} onClick={() => { setOpen(false); setForm(blankForm()); }}>Cancel</button></div>
        </form>
      </section>}
      {loading ? <p role="status">Loading staff accounts…</p> : !error && <section className="card"><h2 className="card-title">Current store staff ({staff.length})</h2>{staff.length === 0 ? <p>No staff accounts found.</p> : <div className="table-container"><table className="data-table"><thead><tr><th>Name</th><th>Email / username</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{staff.map((target) => {
        const editable = target.id !== user?.id && target.role !== "owner" && (user?.role === "owner" || target.role !== "manager");
        return <tr key={target.id}><td>{target.full_name}{target.id === user?.id ? " (you)" : ""}</td><td>{target.email}<br /><small>{target.username}</small></td><td>{roleName(target.role)}</td><td>{target.is_active ? "Active" : "Deactivated"}</td><td>{editable ? <button className="btn btn-secondary" disabled={saving} onClick={() => edit(target)}>Edit access</button> : "Protected account"}</td></tr>;
      })}</tbody></table></div>}</section>}
    </div>
  </div>;
}
