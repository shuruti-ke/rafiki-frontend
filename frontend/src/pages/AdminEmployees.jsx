import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { API, authFetch } from "../api.js";
import { normalizeEmployeeRecord } from "../utils/employeeRecord.js";
import "./AdminEmployees.css";

export default function AdminEmployees() {
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState(null);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    role: "user",
    department: "",
    employment_type: "",
    work_location: "",
    manager_id: "",
  });
  const [formOptions, setFormOptions] = useState({ departments: [], employment_types: [], work_locations: [], roles: [] });
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
      .then(rows => setEmployees(Array.isArray(rows) ? rows.map(normalizeEmployeeRecord) : []))
      .catch(() => {});
  };

  useEffect(() => { fetchEmployees(); }, []);
  useEffect(() => {
    authFetch(`${API}/api/v1/employees/meta/options`)
      .then(r => (r && r.ok ? r.json() : null))
      .then(d => d && setFormOptions(d))
      .catch(() => {});
  }, []);

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
      if (!body.employment_type) delete body.employment_type;
      if (!body.work_location) delete body.work_location;
      const res = await authFetch(`${API}/api/v1/employees/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setAddMsg({ type: "ok", text: `Employee created. Temp password: ${data.temporary_password}` });
        setAddForm({ name: "", email: "", role: "user", department: "", employment_type: "", work_location: "", manager_id: "" });
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

  const handleToggleActive = async (userId, currentlyActive) => {
    const action = currentlyActive ? "deactivate" : "activate";
    if (!confirm(currentlyActive ? "Deactivate this employee? They will not be able to log in." : "Activate this employee?")) return;
    setStatusLoadingId(userId);
    try {
      const res = await authFetch(`${API}/api/v1/employees/${userId}/${action}`, { method: "POST" });
      if (res.ok) fetchEmployees({ search });
    } catch { /* ignore */ }
    setStatusLoadingId(null);
  };

  const list = employees;

  return (
    <div className="admin-emp-page">
      <h1 className="admin-emp-title">Employee Management</h1>
      <p className="admin-emp-sub">
        View and manage employee records, documents, and evaluations. Layout matches the Manager team view for consistency.
      </p>

      <div className="admin-emp-toolbar">
        <input
          className="admin-emp-search"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="admin-emp-actions-top">
          <button className="btn btnPrimary" onClick={() => { setShowAddForm(f => !f); setAddMsg(null); }}>
            {showAddForm ? "Cancel" : "Add Employee"}
          </button>
          <button
            className="btn btnGhost"
            disabled={batchLoading}
            onClick={() => fileRef.current?.click()}
          >
            {batchLoading ? "Uploading…" : "Batch Upload"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleBatchUpload}
          />
        </div>
      </div>

      {addMsg && (
        <div className={`admin-emp-msg ${addMsg.type === "ok" ? "admin-emp-msg--ok" : "admin-emp-msg--err"}`}>
          {addMsg.text}
        </div>
      )}
      {batchMsg && (
        <div className={`admin-emp-msg ${batchMsg.type === "ok" ? "admin-emp-msg--ok" : "admin-emp-msg--err"}`}>
          {batchMsg.text}
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAddSubmit} className="admin-emp-add-form">
          <input
            className="search admin-emp-add-full"
            placeholder="Full name"
            value={addForm.name}
            onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
          />
          <input
            className="search admin-emp-add-full"
            placeholder="Email *"
            type="email"
            required
            value={addForm.email}
            onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
          />
          <select className="search" value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}>
            {(formOptions.roles?.length ? formOptions.roles : ["user", "manager", "hr_admin", "super_admin"]).map(role => (
              <option key={role} value={role}>
                {role === "user" ? "Employee" : role.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </option>
            ))}
          </select>
          <select className="search" value={addForm.department} onChange={e => setAddForm(f => ({ ...f, department: e.target.value }))}>
            <option value="">Department</option>
            {(formOptions.departments || []).map(dep => (
              <option key={dep} value={dep}>{dep}</option>
            ))}
          </select>
          <select className="search" value={addForm.employment_type} onChange={e => setAddForm(f => ({ ...f, employment_type: e.target.value }))}>
            <option value="">Employment type</option>
            {(formOptions.employment_types || []).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select className="search" value={addForm.work_location} onChange={e => setAddForm(f => ({ ...f, work_location: e.target.value }))}>
            <option value="">Work location</option>
            {(formOptions.work_locations || []).map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
          <select className="search admin-emp-add-full" value={addForm.manager_id} onChange={e => setAddForm(f => ({ ...f, manager_id: e.target.value }))}>
            <option value="">No manager</option>
            {managers.map(m => (
              <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>
            ))}
          </select>
          <button className="btn btnPrimary" type="submit" disabled={addLoading} style={{ justifySelf: "start" }}>
            {addLoading ? "Creating…" : "Create Employee"}
          </button>
        </form>
      )}

      {list.length === 0 ? (
        <div className="admin-emp-empty">
          {employees.length === 0 ? "No employees found." : "No matches for your search."}
        </div>
      ) : (
        <div className="admin-emp-list">
          {list.map((e) => {
            const u = e.user || {};
            const profile = e.profile || {};
            const isInactive = u.is_active === false;
            const name = u.name || u.email || "Unknown";
            const jobTitle = profile.job_title || u.job_title;
            const dept = u.department || profile.department;
            const roleLabel = (u.role || "user").replace(/_/g, " ");
            return (
              <div
                key={u.user_id}
                className={`admin-emp-card ${isInactive ? "admin-emp-card-inactive" : ""}`}
              >
                <Link to={`/admin/employees/${u.user_id}`} className="admin-emp-card-header">
                  <div className="admin-emp-card-avatar">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="admin-emp-card-info">
                    <div className="admin-emp-card-name">
                      {name}
                      {isInactive && <span className="admin-emp-inactive-tag">Inactive</span>}
                    </div>
                    <div className="admin-emp-card-meta">
                      {jobTitle || "No title"}{dept ? ` · ${dept}` : ""}
                    </div>
                  </div>
                  <div className="admin-emp-card-rating">
                    <span className="admin-emp-card-role">{roleLabel}</span>
                  </div>
                  <span className="admin-emp-card-arrow">→</span>
                </Link>
                <div className="admin-emp-card-actions">
                  <Link to={`/admin/employees/${u.user_id}`} className="admin-emp-card-btn admin-emp-card-btn--view">
                    View dashboard
                  </Link>
                  <button
                    type="button"
                    className={`admin-emp-card-btn ${isInactive ? "admin-emp-card-btn--activate" : "admin-emp-card-btn--deactivate"}`}
                    onClick={(ev) => { ev.preventDefault(); handleToggleActive(u.user_id, !isInactive); }}
                    disabled={statusLoadingId === u.user_id}
                  >
                    {statusLoadingId === u.user_id ? "…" : isInactive ? "Activate" : "Deactivate"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
