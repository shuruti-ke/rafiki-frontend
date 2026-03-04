import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API, authFetch } from "../api.js";
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
    phone: "",
    gender: "",
    city: "",
  });

  const fetchEmployee = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, balRes] = await Promise.all([
        authFetch(`${API}/api/v1/employees/${userId}`),
        authFetch(`${API}/api/v1/leave/balance/${userId}`),
      ]);
      if (empRes.ok) {
        const data = await empRes.json();
        // backend returns { user: {...}, profile: {...} }
        const user = data.user || data;
        const profile = data.profile || {};
        const merged = { ...user, ...profile, name: user.name || profile.name || "" };
        setEmployee(merged);
        setForm({
          name: merged.name || "",
          job_title: merged.job_title || "",
          department: merged.department || "",
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

  const handleSave = async () => {
    setSaving(true); setSaveMsg(""); setSaveErr("");
    try {
      const res = await authFetch(`${API}/api/v1/employees/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name || null,
          job_title: form.job_title || null,
          department: form.department || null,
          phone: form.phone || null,
          gender: form.gender || null,
          city: form.city || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMsg("✅ Profile updated successfully.");
        setEditMode(false);
        fetchEmployee();
      } else {
        setSaveErr(data.detail || "Failed to save.");
      }
    } catch { setSaveErr("Network error."); }
    setSaving(false);
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
            </div>
          </div>
          <button
            className={`emp-edit-btn ${editMode ? "emp-edit-btn--cancel" : ""}`}
            onClick={() => { setEditMode(!editMode); setSaveMsg(""); setSaveErr(""); }}
          >
            {editMode ? "✕ Cancel" : "✏️ Edit Profile"}
          </button>
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
                <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
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
