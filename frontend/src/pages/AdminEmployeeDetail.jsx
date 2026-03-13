import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API, authFetch } from "../api.js";
import { normalizeEmployeeRecord } from "../utils/employeeRecord.js";
import "./AdminEmployeeDetail.css";

const GENDER_OPTIONS = [
  { value: "", label: "— Not specified —" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other / Prefer not to say" },
];

const LEAVE_LABELS = {
  annual: "Annual Leave",
  sick: "Sick Leave",
  maternity: "Maternity Leave",
  paternity: "Paternity Leave",
};

export default function AdminEmployeeDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState(null);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState({
    name: "",
    job_title: "",
    department: "",
    employment_type: "",
    work_location: "",
    phone: "",
    gender: "",
    city: "",
  });
  const [creds, setCreds] = useState(null);
  const [credsLoading, setCredsLoading] = useState(false);
  const [credsVisible, setCredsVisible] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [formOptions, setFormOptions] = useState({ departments: [], employment_types: [], work_locations: [] });

  const fetchEmployee = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, balRes] = await Promise.all([
        authFetch(`${API}/api/v1/employees/${userId}`),
        authFetch(`${API}/api/v1/leave/balance/${userId}`),
      ]);
      if (empRes.ok) {
        const data = await empRes.json();
        const merged = normalizeEmployeeRecord(data);
        setEmployee(merged);
        setForm({
          name: merged.name || "",
          job_title: merged.job_title || "",
          department: merged.department || "",
          employment_type: merged.employment_type || "",
          work_location: merged.work_location || "",
          phone: merged.phone || "",
          gender: merged.gender || "",
          city: merged.city || "",
        });
      }
      if (balRes.ok) {
        setLeaveBalance(await balRes.json());
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchEmployee(); }, [fetchEmployee]);
  useEffect(() => {
    authFetch(`${API}/api/v1/employees/meta/options`)
      .then(r => (r && r.ok ? r.json() : null))
      .then(d => d && setFormOptions(d))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaveMsg(""); setSaveErr("");
    try {
      const res = await authFetch(`${API}/api/v1/employees/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name || null,
          job_title: form.job_title || null,
          department: form.department || null,
          employment_type: form.employment_type || null,
          work_location: form.work_location || null,
          phone: form.phone || null,
          gender: form.gender || null,
          city: form.city || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMsg("✅ Profile updated successfully.");
        setEditMode(false);
        await fetchEmployee();   // re-fetch so gender & leave balances update immediately
      } else {
        setSaveErr(data.detail || "Failed to save.");
      }
    } catch { setSaveErr("Network error."); }
    setSaving(false);
  };

  const fetchCredentials = async () => {
    setCredsLoading(true);
    try {
      const res = await authFetch(`${API}/api/v1/employees/${userId}/credentials`);
      if (res.ok) {
        const data = await res.json();
        setCreds(data);
        setCredsVisible(true);
      }
    } catch { /* ignore */ }
    setCredsLoading(false);
  };

  const handleResetPassword = async () => {
    if (!confirm("Generate a new temporary password for this employee? They will need to use the new password to log in.")) return;
    setResetLoading(true);
    setResetMsg(null);
    try {
      const res = await authFetch(`${API}/api/v1/employees/${userId}/reset-password`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setResetMsg({ type: "ok", text: `New password: ${data.temporary_password}` });
        setCreds(prev => prev ? { ...prev, initial_password: data.temporary_password } : prev);
      } else {
        setResetMsg({ type: "err", text: data.detail || "Failed to reset password" });
      }
    } catch { setResetMsg({ type: "err", text: "Network error" }); }
    setResetLoading(false);
  };

  const handleToggleActive = async () => {
    if (!employee) return;
    const currentlyActive = employee.is_active !== false;
    const action = currentlyActive ? "deactivate" : "activate";
    const confirmText = currentlyActive
      ? "Deactivate this employee? They will no longer be able to log in."
      : "Activate this employee so they can log in again?";
    if (!confirm(confirmText)) return;

    setStatusLoading(true);
    setStatusMsg(null);
    try {
      const res = await authFetch(`${API}/api/v1/employees/${userId}/${action}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg({ type: "ok", text: currentlyActive ? "Employee deactivated." : "Employee activated." });
        setEmployee(prev => prev ? { ...prev, is_active: data.is_active } : prev);
      } else {
        setStatusMsg({ type: "err", text: data.detail || "Failed to update status." });
      }
    } catch {
      setStatusMsg({ type: "err", text: "Network error." });
    }
    setStatusLoading(false);
  };

  if (loading) return (
    <div className="emp-detail-loading">
      <div className="emp-detail-spinner" />
      <p>Loading employee profile…</p>
    </div>
  );

  if (!employee) return (
    <div className="emp-detail-error">
      <p>Employee not found.</p>
      <button onClick={() => navigate("/admin/employees")}>← Back to Employees</button>
    </div>
  );

  const genderLabel = GENDER_OPTIONS.find(g => g.value === (employee.gender || ""))?.label || "— Not specified —";

  return (
    <div className="emp-detail-page">
      {/* Header */}
      <div className="emp-detail-header">
        <button className="emp-detail-back" onClick={() => navigate("/admin/employees")}>
          ← Employees
        </button>
        <div className="emp-detail-title-row">
          <div className="emp-detail-avatar">
            {(employee.name || employee.email || "?")[0].toUpperCase()}
          </div>
          <div>
            <h1>{employee.name || employee.email}</h1>
            <div className="emp-detail-meta">
              {employee.job_title && <span>{employee.job_title}</span>}
              {employee.department && <span>· {employee.department}</span>}
              <span className={`emp-role-badge emp-role-badge--${employee.role}`}>
                {employee.role?.replace("_", " ")}
              </span>
              {employee.is_active === false && (
                <span className="emp-status-badge emp-status-badge--inactive">
                  Inactive
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className={`emp-edit-btn ${editMode ? "emp-edit-btn--cancel" : ""}`}
              onClick={() => { setEditMode(!editMode); setSaveMsg(""); setSaveErr(""); }}
            >
              {editMode ? "✕ Cancel" : "✏️ Edit Profile"}
            </button>
            <button
              className="emp-edit-btn"
              style={{ fontSize: 13, background: "rgba(248,113,113,0.08)", color: "#ef4444" }}
              onClick={handleToggleActive}
              disabled={statusLoading}
            >
              {statusLoading
                ? "Updating…"
                : employee.is_active === false
                ? "Activate Employee"
                : "Deactivate Employee"}
            </button>
          </div>
        </div>
      </div>

      <div className="emp-detail-body">
        {/* Profile Card */}
        <div className="emp-detail-card">
          <div className="emp-card-title">Profile Information</div>

          {saveMsg && <div className="emp-alert emp-alert--success">{saveMsg}</div>}
          {saveErr && <div className="emp-alert emp-alert--error">{saveErr}</div>}

          {editMode ? (
            <div className="emp-form-grid">
              <div className="emp-form-field">
                <label>Full Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="emp-form-field">
                <label>Job Title</label>
                <input value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} />
              </div>
              <div className="emp-form-field">
                <label>Department</label>
                <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                  <option value="">Select department</option>
                  {(formOptions.departments || []).map(dep => (
                    <option key={dep} value={dep}>{dep}</option>
                  ))}
                </select>
              </div>
              <div className="emp-form-field">
                <label>Employment Type</label>
                <select value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))}>
                  <option value="">Select employment type</option>
                  {(formOptions.employment_types || []).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="emp-form-field">
                <label>Work Location</label>
                <select value={form.work_location} onChange={e => setForm(f => ({ ...f, work_location: e.target.value }))}>
                  <option value="">Select work location</option>
                  {(formOptions.work_locations || []).map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>
              <div className="emp-form-field">
                <label>Phone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="emp-form-field">
                <label>City / Office</label>
                <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>

              {/* Gender — critical for leave entitlements */}
              <div className="emp-form-field emp-form-field--highlight">
                <label>
                  Gender
                  <span className="emp-field-note">Used to show correct leave entitlements (maternity / paternity)</span>
                </label>
                <div className="gender-options">
                  {GENDER_OPTIONS.filter(g => g.value !== "").map(opt => (
                    <label key={opt.value} className={`gender-option ${form.gender === opt.value ? "gender-option--selected" : ""}`}>
                      <input
                        type="radio"
                        name="gender"
                        value={opt.value}
                        checked={form.gender === opt.value}
                        onChange={() => setForm(f => ({ ...f, gender: opt.value }))}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                  <label className={`gender-option ${form.gender === "" ? "gender-option--selected" : ""}`}>
                    <input
                      type="radio"
                      name="gender"
                      value=""
                      checked={form.gender === ""}
                      onChange={() => setForm(f => ({ ...f, gender: "" }))}
                    />
                    <span>Not specified</span>
                  </label>
                </div>
              </div>

              <div className="emp-form-actions">
                <button className="emp-save-btn" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "💾 Save Changes"}
                </button>
              </div>
            </div>
          ) : (
            <div className="emp-profile-grid">
              {[
                { label: "Email", value: employee.email },
              { label: "Full Name", value: employee.name || "—" },
                { label: "Phone", value: employee.phone || "—" },
                { label: "Department", value: employee.department || "—" },
                { label: "Employment Type", value: employee.employment_type || "—" },
                { label: "Work Location", value: employee.work_location || "—" },
                { label: "Job Title", value: employee.job_title || "—" },
                { label: "City / Office", value: employee.city || "—" },
                { label: "Role", value: employee.role?.replace("_", " ") || "—" },
                {
                  label: "Gender",
                  value: genderLabel,
                  highlight: !employee.gender,
                  highlightMsg: "⚠️ Set gender so the correct leave entitlements are shown",
                },
              ].map(({ label, value, highlight, highlightMsg }) => (
                <div key={label} className={`emp-profile-row ${highlight ? "emp-profile-row--warn" : ""}`}>
                  <span className="emp-profile-label">{label}</span>
                  <span className="emp-profile-value">
                    {value}
                    {highlight && highlightMsg && (
                      <span className="emp-profile-warn">{highlightMsg}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Login Credentials Card */}
        <div className="emp-detail-card">
          <div className="emp-card-title">Login Credentials</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="emp-profile-grid">
              <div className="emp-profile-row">
                <span className="emp-profile-label">Email</span>
                <span className="emp-profile-value">{employee.email}</span>
              </div>
              <div className="emp-profile-row">
                <span className="emp-profile-label">Initial Password</span>
                <span className="emp-profile-value">
                  {credsVisible && creds?.initial_password
                    ? creds.initial_password
                    : creds && !creds.initial_password
                    ? "— not stored —"
                    : "••••••••"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!credsVisible ? (
                <button
                  className="emp-edit-btn"
                  onClick={fetchCredentials}
                  disabled={credsLoading}
                  style={{ fontSize: 13 }}
                >
                  {credsLoading ? "Loading…" : "Show Password"}
                </button>
              ) : (
                <button
                  className="emp-edit-btn"
                  onClick={() => setCredsVisible(false)}
                  style={{ fontSize: 13 }}
                >
                  Hide Password
                </button>
              )}
              <button
                className="emp-edit-btn"
                onClick={handleResetPassword}
                disabled={resetLoading}
                style={{ fontSize: 13, background: "rgba(248,113,113,0.1)", color: "#f87171" }}
              >
                {resetLoading ? "Resetting…" : "Reset Password"}
              </button>
            </div>
            {resetMsg && (
              <div className={`emp-alert ${resetMsg.type === "ok" ? "emp-alert--success" : "emp-alert--error"}`}>
                {resetMsg.text}
              </div>
            )}
            {statusMsg && (
              <div className={`emp-alert ${statusMsg.type === "ok" ? "emp-alert--success" : "emp-alert--error"}`}>
                {statusMsg.text}
              </div>
            )}
          </div>
        </div>

        {/* Leave Balance Card */}
        {leaveBalance && (
          <div className="emp-detail-card">
            <div className="emp-card-title">
              Leave Balances — {leaveBalance.year}
              {leaveBalance.gender && (
                <span className="emp-gender-tag">
                  {leaveBalance.gender === "male" ? "♂ Male" : leaveBalance.gender === "female" ? "♀ Female" : "⚧ Other"}
                </span>
              )}
              {leaveBalance.policy_is_default && (
                <span className="emp-policy-default-tag">Using default policy — no custom policy set</span>
              )}
            </div>
            <div className="emp-leave-grid">
              {(leaveBalance.balances || []).map(b => (
                <div key={b.leave_type} className="emp-leave-card">
                  <div className="emp-leave-type">{LEAVE_LABELS[b.leave_type] || b.leave_type}</div>
                  <div className="emp-leave-available">{b.available_days}</div>
                  <div className="emp-leave-sub">days available</div>
                  <div className="emp-leave-track">
                    <div className="emp-leave-track-fill"
                      style={{ width: `${b.entitled_days > 0 ? Math.min(100, (b.used_days / b.entitled_days) * 100) : 0}%` }} />
                  </div>
                  <div className="emp-leave-stats">
                    <span>{b.used_days} used</span>
                    <span>{b.entitled_days} entitled</span>
                    {b.carried_over_days > 0 && (
                      <span className={b.carry_over_expired ? "emp-carry-expired" : "emp-carry"}>
                        +{b.carried_over_days} carried
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
