import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { API, authFetch } from "../api.js";

export default function AdminEmployees() {
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", role: "user", department: "", manager_id: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [addMsg, setAddMsg] = useState(null);
  const [batchMsg, setBatchMsg] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const fileRef = useRef(null);

  const fetchEmployees = (opts = {}) => {
    const { search = "" } = opts;
    const params = new URLSearchParams();
    const trimmed = search.trim();
    const includeInactive = !!trimmed; // when searching, allow inactive employees

    if (trimmed) params.append("search", trimmed);
    if (includeInactive) params.append("include_inactive", "true");

    const url = params.toString()
      ? `${API}/api/v1/employees/?${params.toString()}`
      : `${API}/api/v1/employees/`;

    authFetch(url)
      .then(r => (r && r.ok ? r.json() : []))
      .then(setEmployees)
      .catch(() => {});
  };

  useEffect(() => { fetchEmployees(); }, []);

  // When search changes, re-query the backend so inactive employees can be found
  useEffect(() => {
    fetchEmployees({ search });
  }, [search]);

  const managers = employees
    .map(e => e.user || {})
    .filter(u => u.role === "manager" || u.role === "admin");

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setAddLoading(true);
    setAddMsg(null);
    try {
      const body = { ...addForm };
      if (!body.manager_id) delete body.manager_id;
      if (!body.department) delete body.department;
      const res = await authFetch(`${API}/api/v1/employees/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setAddMsg({ type: "ok", text: `Employee created. Temp password: ${data.temporary_password}` });
        setAddForm({ name: "", email: "", role: "user", department: "", manager_id: "" });
        setShowAddForm(false);
        fetchEmployees();
      } else {
        setAddMsg({ type: "err", text: data.detail || "Failed to create employee" });
      }
    } catch {
      setAddMsg({ type: "err", text: "Network error" });
    } finally {
      setAddLoading(false);
    }
  };

  const handleBatchUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBatchLoading(true);
    setBatchMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch(`${API}/api/v1/employees/batch-upload`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        const s = data.summary || {};
        setBatchMsg({ type: "ok", text: `Batch complete: ${s.created} created, ${s.skipped} skipped, ${s.errors} errors` });
        fetchEmployees();
      } else {
        setBatchMsg({ type: "err", text: data.detail || "Batch upload failed" });
      }
    } catch {
      setBatchMsg({ type: "err", text: "Network error" });
    } finally {
      setBatchLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const list = employees;

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Employee Management</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 16 }}>
        View and manage employee documents, evaluations, and disciplinary records.
      </p>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn btnPrimary" onClick={() => { setShowAddForm(f => !f); setAddMsg(null); }}>
          {showAddForm ? "Cancel" : "Add Employee"}
        </button>
        <button
          className="btn btnGhost"
          disabled={batchLoading}
          onClick={() => fileRef.current?.click()}
        >
          {batchLoading ? "Uploading..." : "Batch Upload"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          style={{ display: "none" }}
          onChange={handleBatchUpload}
        />
      </div>

      {/* Feedback messages */}
      {addMsg && (
        <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13, background: addMsg.type === "ok" ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)", color: addMsg.type === "ok" ? "#34d399" : "#f87171" }}>
          {addMsg.text}
        </div>
      )}
      {batchMsg && (
        <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13, background: batchMsg.type === "ok" ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)", color: batchMsg.type === "ok" ? "#34d399" : "#f87171" }}>
          {batchMsg.text}
        </div>
      )}

      {/* Inline add form */}
      {showAddForm && (
        <form onSubmit={handleAddSubmit} style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginBottom: 16, display: "grid", gap: 10 }}>
          <input
            className="search"
            placeholder="Full name"
            value={addForm.name}
            onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
            style={{ width: "100%", boxSizing: "border-box" }}
          />
          <input
            className="search"
            placeholder="Email *"
            type="email"
            required
            value={addForm.email}
            onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
            style={{ width: "100%", boxSizing: "border-box" }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <select
              className="search"
              value={addForm.role}
              onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box" }}
            >
              <option value="user">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <input
              className="search"
              placeholder="Department"
              value={addForm.department}
              onChange={e => setAddForm(f => ({ ...f, department: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <select
            className="search"
            value={addForm.manager_id}
            onChange={e => setAddForm(f => ({ ...f, manager_id: e.target.value }))}
            style={{ width: "100%", boxSizing: "border-box" }}
          >
            <option value="">No manager</option>
            {managers.map(m => (
              <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>
            ))}
          </select>
          <button className="btn btnPrimary" type="submit" disabled={addLoading} style={{ justifySelf: "start" }}>
            {addLoading ? "Creating..." : "Create Employee"}
          </button>
        </form>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          className="search"
          placeholder="Search by name, email, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, boxSizing: "border-box" }}
        />
      </div>

      {list.length === 0 && (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          {employees.length === 0 ? "No employees found." : "No matches."}
        </p>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {list.map((e) => {
          const u = e.user || {};
          const isInactive = u.is_active === false;
          return (
            <Link
              key={u.user_id}
              to={`/admin/employees/${u.user_id}`}
              className="btn"
              style={{ textAlign: "left", textDecoration: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span>
                {u.name || u.email || "Unknown"}
                {isInactive && (
                  <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 6px", borderRadius: 999, background: "rgba(248,113,113,0.12)", color: "#f87171" }}>
                    Inactive
                  </span>
                )}
              </span>
              <span style={{ color: "var(--muted)", fontSize: 12 }}>
                {u.role || ""} {u.department ? `· ${u.department}` : ""}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
