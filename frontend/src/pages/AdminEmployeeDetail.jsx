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

function DependentForm({ userId, onSaved, API, authFetch }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ contact_type: "dependent", full_name: "", relationship: "", phone: "", email: "", date_of_birth: "", notes: "" });
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const res = await authFetch(`${API}/api/v1/employees/${userId}/dependents`, {
      method: "POST",
      body: JSON.stringify({ ...f, date_of_birth: f.date_of_birth || null }),
    });
    setSaving(false);
    if (res.ok) { setF({ contact_type: "dependent", full_name: "", relationship: "", phone: "", email: "", date_of_birth: "", notes: "" }); setOpen(false); onSaved(); }
  };
  if (!open) return <button type="button" className="emp-edit-btn" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>+ Add dependent / contact</button>;
  return (
    <form className="emp-inline-form" onSubmit={handleSubmit}>
      <select value={f.contact_type} onChange={e => setF(x => ({ ...x, contact_type: e.target.value }))}>
        <option value="next_of_kin">Next of kin</option>
        <option value="emergency_contact">Emergency contact</option>
        <option value="dependent">Dependent</option>
      </select>
      <input placeholder="Full name" value={f.full_name} onChange={e => setF(x => ({ ...x, full_name: e.target.value }))} required />
      <input placeholder="Relationship" value={f.relationship} onChange={e => setF(x => ({ ...x, relationship: e.target.value }))} />
      <input placeholder="Phone" value={f.phone} onChange={e => setF(x => ({ ...x, phone: e.target.value }))} />
      <input placeholder="Email" value={f.email} onChange={e => setF(x => ({ ...x, email: e.target.value }))} />
      <input type="date" placeholder="DOB" value={f.date_of_birth} onChange={e => setF(x => ({ ...x, date_of_birth: e.target.value }))} />
      <div className="emp-inline-form-actions">
        <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

const emptyWork = { employer_name: "", job_title: "", start_date: "", end_date: "", is_current: "", responsibilities: "" };
function WorkExperienceForm({ userId, onSaved, API, authFetch, editItem, onCancelEdit }) {
  const isEdit = !!editItem?.id;
  const [open, setOpen] = useState(!!editItem);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(editItem ? {
    employer_name: editItem.employer_name || "",
    job_title: editItem.job_title || "",
    start_date: editItem.start_date || "",
    end_date: editItem.end_date || "",
    is_current: editItem.is_current || "",
    responsibilities: editItem.responsibilities || "",
  } : { ...emptyWork });
  useEffect(() => {
    if (editItem) {
      setOpen(true);
      setF({
        employer_name: editItem.employer_name || "",
        job_title: editItem.job_title || "",
        start_date: editItem.start_date || "",
        end_date: editItem.end_date || "",
        is_current: editItem.is_current || "",
        responsibilities: editItem.responsibilities || "",
      });
    } else if (!open) setF({ ...emptyWork });
  }, [editItem, open]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...f, start_date: f.start_date || null, end_date: f.end_date || null, is_current: f.is_current || null, responsibilities: f.responsibilities || null };
    const url = isEdit
      ? `${API}/api/v1/employees/${userId}/work-experience/${editItem.id}`
      : `${API}/api/v1/employees/${userId}/work-experience`;
    const res = await authFetch(url, { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) });
    setSaving(false);
    if (res.ok) { setF({ ...emptyWork }); setOpen(false); onCancelEdit?.(); onSaved(); }
  };
  const handleCancel = () => { setOpen(false); setF({ ...emptyWork }); onCancelEdit?.(); };
  if (!open && !editItem) return <button type="button" className="emp-edit-btn" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>+ Add work experience</button>;
  return (
    <form className="emp-inline-form" onSubmit={handleSubmit}>
      <input placeholder="Employer name" value={f.employer_name} onChange={e => setF(x => ({ ...x, employer_name: e.target.value }))} required />
      <input placeholder="Job title" value={f.job_title} onChange={e => setF(x => ({ ...x, job_title: e.target.value }))} />
      <input type="date" placeholder="Start" value={f.start_date} onChange={e => setF(x => ({ ...x, start_date: e.target.value }))} />
      <input type="date" placeholder="End" value={f.end_date} onChange={e => setF(x => ({ ...x, end_date: e.target.value }))} />
      <label><input type="checkbox" checked={f.is_current === "true"} onChange={e => setF(x => ({ ...x, is_current: e.target.checked ? "true" : "" }))} /> Current</label>
      <textarea placeholder="Responsibilities" value={f.responsibilities} onChange={e => setF(x => ({ ...x, responsibilities: e.target.value }))} rows={2} />
      <div className="emp-inline-form-actions">
        <button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Update" : "Save"}</button>
        <button type="button" onClick={handleCancel}>Cancel</button>
      </div>
    </form>
  );
}

const emptyEdu = { institution: "", qualification: "", field_of_study: "", year_completed: "", is_certification: "" };
function EducationForm({ userId, onSaved, API, authFetch, editItem, onCancelEdit }) {
  const isEdit = !!editItem?.id;
  const [open, setOpen] = useState(!!editItem);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(editItem ? {
    institution: editItem.institution || "",
    qualification: editItem.qualification || "",
    field_of_study: editItem.field_of_study || "",
    year_completed: editItem.year_completed != null ? String(editItem.year_completed) : "",
    is_certification: editItem.is_certification || "",
  } : { ...emptyEdu });
  useEffect(() => {
    if (editItem) {
      setOpen(true);
      setF({
        institution: editItem.institution || "",
        qualification: editItem.qualification || "",
        field_of_study: editItem.field_of_study || "",
        year_completed: editItem.year_completed != null ? String(editItem.year_completed) : "",
        is_certification: editItem.is_certification || "",
      });
    } else if (!open) setF({ ...emptyEdu });
  }, [editItem, open]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...f, year_completed: f.year_completed ? parseInt(f.year_completed, 10) : null, is_certification: f.is_certification || null };
    const url = isEdit ? `${API}/api/v1/employees/${userId}/education/${editItem.id}` : `${API}/api/v1/employees/${userId}/education`;
    const res = await authFetch(url, { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) });
    setSaving(false);
    if (res.ok) { setF({ ...emptyEdu }); setOpen(false); onCancelEdit?.(); onSaved(); }
  };
  const handleCancel = () => { setOpen(false); setF({ ...emptyEdu }); onCancelEdit?.(); };
  if (!open && !editItem) return <button type="button" className="emp-edit-btn" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>+ Add education</button>;
  return (
    <form className="emp-inline-form" onSubmit={handleSubmit}>
      <input placeholder="Institution" value={f.institution} onChange={e => setF(x => ({ ...x, institution: e.target.value }))} required />
      <input placeholder="Qualification" value={f.qualification} onChange={e => setF(x => ({ ...x, qualification: e.target.value }))} />
      <input placeholder="Field of study" value={f.field_of_study} onChange={e => setF(x => ({ ...x, field_of_study: e.target.value }))} />
      <input placeholder="Year completed" type="number" min="1900" max="2100" value={f.year_completed} onChange={e => setF(x => ({ ...x, year_completed: e.target.value }))} />
      <label><input type="checkbox" checked={f.is_certification === "true"} onChange={e => setF(x => ({ ...x, is_certification: e.target.checked ? "true" : "" }))} /> Certification</label>
      <div className="emp-inline-form-actions">
        <button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Update" : "Save"}</button>
        <button type="button" onClick={handleCancel}>Cancel</button>
      </div>
    </form>
  );
}

const emptyAsset = { asset_type: "laptop", description: "", serial_number: "", assigned_date: "", returned_date: "", notes: "" };
function AssetForm({ userId, onSaved, API, authFetch, editItem, onCancelEdit }) {
  const isEdit = !!editItem?.id;
  const [open, setOpen] = useState(!!editItem);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(editItem ? {
    asset_type: editItem.asset_type || "laptop",
    description: editItem.description || "",
    serial_number: editItem.serial_number || "",
    assigned_date: editItem.assigned_date || "",
    returned_date: editItem.returned_date || "",
    notes: editItem.notes || "",
  } : { ...emptyAsset });
  useEffect(() => {
    if (editItem) {
      setOpen(true);
      setF({
        asset_type: editItem.asset_type || "laptop",
        description: editItem.description || "",
        serial_number: editItem.serial_number || "",
        assigned_date: editItem.assigned_date || "",
        returned_date: editItem.returned_date || "",
        notes: editItem.notes || "",
      });
    } else if (!open) setF({ ...emptyAsset });
  }, [editItem, open]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...f, assigned_date: f.assigned_date || null, returned_date: f.returned_date || null };
    const url = isEdit ? `${API}/api/v1/employees/${userId}/assets/${editItem.id}` : `${API}/api/v1/employees/${userId}/assets`;
    const res = await authFetch(url, { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) });
    setSaving(false);
    if (res.ok) { setF({ ...emptyAsset }); setOpen(false); onCancelEdit?.(); onSaved(); }
  };
  const handleCancel = () => { setOpen(false); setF({ ...emptyAsset }); onCancelEdit?.(); };
  if (!open && !editItem) return <button type="button" className="emp-edit-btn" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>+ Assign asset</button>;
  return (
    <form className="emp-inline-form" onSubmit={handleSubmit}>
      <select value={f.asset_type} onChange={e => setF(x => ({ ...x, asset_type: e.target.value }))}>
        <option value="laptop">Laptop</option>
        <option value="phone">Phone</option>
        <option value="tablet">Tablet</option>
        <option value="badge">Badge</option>
        <option value="equipment">Equipment</option>
        <option value="other">Other</option>
      </select>
      <input placeholder="Description" value={f.description} onChange={e => setF(x => ({ ...x, description: e.target.value }))} />
      <input placeholder="Serial number" value={f.serial_number} onChange={e => setF(x => ({ ...x, serial_number: e.target.value }))} />
      <input type="date" placeholder="Assigned date" value={f.assigned_date} onChange={e => setF(x => ({ ...x, assigned_date: e.target.value }))} />
      <input type="date" placeholder="Returned date" value={f.returned_date} onChange={e => setF(x => ({ ...x, returned_date: e.target.value }))} />
      <div className="emp-inline-form-actions">
        <button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Update" : "Save"}</button>
        <button type="button" onClick={handleCancel}>Cancel</button>
      </div>
    </form>
  );
}

function DocumentUpload({ userId, onUploaded, API, authFetch }) {
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("id_document");
  const [file, setFile] = useState(null);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await authFetch(`${API}/api/v1/employee-docs/${userId}/upload?doc_type=${encodeURIComponent(docType)}&title=${encodeURIComponent(title.trim())}`, {
      method: "POST",
      body: form,
      headers: {},
    });
    setUploading(false);
    if (res.ok) { setTitle(""); setFile(null); setDocType("id_document"); onUploaded(); }
  };
  return (
    <form className="emp-inline-form emp-doc-upload-form" onSubmit={handleSubmit} style={{ marginTop: 8 }}>
      <span className="emp-doc-upload-label">Upload personal document</span>
      <select value={docType} onChange={e => setDocType(e.target.value)} aria-label="Document type">
        <option value="id_document">ID / Passport</option>
        <option value="contract">Contract</option>
        <option value="certificate">Certificate</option>
        <option value="nda">NDA</option>
        <option value="letter">Letter</option>
        <option value="payslip">Payslip</option>
        <option value="other">Other</option>
      </select>
      <input placeholder="Document title" value={title} onChange={e => setTitle(e.target.value)} required />
      <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" aria-label="Choose file" />
      <button type="submit" disabled={uploading || !file} className="emp-edit-btn">{uploading ? "Uploading…" : "Upload"}</button>
    </form>
  );
}

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
    monthly_salary: "",
    marital_status: "",
    number_of_dependents: "",
  });
  const [payrollFlags, setPayrollFlags] = useState({
    can_process_payroll: false,
    can_approve_payroll: false,
    can_authorize_payroll: false,
  });
  const [creds, setCreds] = useState(null);
  const [credsLoading, setCredsLoading] = useState(false);
  const [credsVisible, setCredsVisible] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [formOptions, setFormOptions] = useState({ departments: [], employment_types: [], work_locations: [] });

  // Extended profile sections
  const [dependents, setDependents] = useState([]);
  const [workExperience, setWorkExperience] = useState([]);
  const [education, setEducation] = useState([]);
  const [assets, setAssets] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [editingWork, setEditingWork] = useState(null);
  const [editingEdu, setEditingEdu] = useState(null);
  const [editingAsset, setEditingAsset] = useState(null);

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
        const profile = data?.profile || {};
        setForm({
          name: merged.name || "",
          job_title: merged.job_title || "",
          department: merged.department || "",
          employment_type: merged.employment_type || "",
          work_location: merged.work_location || "",
          phone: merged.phone || "",
          gender: merged.gender || "",
          city: merged.city || "",
          monthly_salary: merged.monthly_salary != null && merged.monthly_salary !== "" ? String(merged.monthly_salary) : "",
          marital_status: profile.marital_status || "",
          number_of_dependents: profile.number_of_dependents != null ? String(profile.number_of_dependents) : "",
        });
        const u = merged.user || {};
        setPayrollFlags({
          can_process_payroll: !!u.can_process_payroll,
          can_approve_payroll: !!u.can_approve_payroll,
          can_authorize_payroll: !!u.can_authorize_payroll,
        });
      }
      if (balRes.ok) {
        setLeaveBalance(await balRes.json());
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchEmployee(); }, [fetchEmployee]);

  const fetchSections = useCallback(async () => {
    if (!userId) return;
    setSectionsLoading(true);
    try {
      const [depRes, workRes, eduRes, assetRes, docRes] = await Promise.all([
        authFetch(`${API}/api/v1/employees/${userId}/dependents`),
        authFetch(`${API}/api/v1/employees/${userId}/work-experience`),
        authFetch(`${API}/api/v1/employees/${userId}/education`),
        authFetch(`${API}/api/v1/employees/${userId}/assets`),
        authFetch(`${API}/api/v1/employee-docs/${userId}`),
      ]);
      if (depRes.ok) setDependents(await depRes.json());
      if (workRes.ok) setWorkExperience(await workRes.json());
      if (eduRes.ok) setEducation(await eduRes.json());
      if (assetRes.ok) setAssets(await assetRes.json());
      if (docRes.ok) setDocuments(await docRes.json());
    } catch (e) { console.error(e); }
    setSectionsLoading(false);
  }, [userId]);

  useEffect(() => { fetchSections(); }, [fetchSections]);

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
          monthly_salary: form.monthly_salary !== "" && Number.isFinite(parseFloat(form.monthly_salary)) ? parseFloat(form.monthly_salary) : null,
          marital_status: form.marital_status || null,
          number_of_dependents: form.number_of_dependents !== "" && Number.isFinite(parseInt(form.number_of_dependents, 10)) ? parseInt(form.number_of_dependents, 10) : null,
          can_process_payroll: payrollFlags.can_process_payroll,
          can_approve_payroll: payrollFlags.can_approve_payroll,
          can_authorize_payroll: payrollFlags.can_authorize_payroll,
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
              <div className="emp-form-field">
                <label>Monthly salary</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Used for auto payroll run"
                  value={form.monthly_salary}
                  onChange={e => setForm(f => ({ ...f, monthly_salary: e.target.value }))}
                />
              </div>
              <div className="emp-form-field">
                <label>Marital status</label>
                <select value={form.marital_status} onChange={e => setForm(f => ({ ...f, marital_status: e.target.value }))}>
                  <option value="">— Select —</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="divorced">Divorced</option>
                  <option value="widowed">Widowed</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="emp-form-field">
                <label>Number of dependents</label>
                <input
                  type="number"
                  min="0"
                  value={form.number_of_dependents}
                  onChange={e => setForm(f => ({ ...f, number_of_dependents: e.target.value }))}
                />
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
                {
                  label: "Monthly salary",
                  value: employee.monthly_salary != null && employee.monthly_salary !== ""
                    ? (typeof employee.monthly_salary === "number"
                        ? employee.monthly_salary.toLocaleString()
                        : String(employee.monthly_salary))
                    : "—",
                },
                { label: "Marital status", value: (employee.profile?.marital_status || employee.marital_status) || "—" },
                { label: "Number of dependents", value: (employee.profile?.number_of_dependents ?? employee.number_of_dependents) ?? "—" },
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

        {/* Payroll Permissions Card */}
        <div className="emp-detail-card">
          <div className="emp-card-title">Payroll Permissions</div>
          <p className="emp-permissions-hint">
            Control who can process, approve, and authorize payroll. Changes take effect immediately.
          </p>
          <div className="emp-permissions-grid">
            <label className="emp-permission-row">
              <input
                type="checkbox"
                checked={payrollFlags.can_process_payroll}
                onChange={(e) =>
                  setPayrollFlags((f) => ({ ...f, can_process_payroll: e.target.checked }))
                }
              />
              <span>
                Can process payroll
                <span className="emp-permission-sub">
                  Typically for Accounts / Payroll Officer – can upload, parse, and prepare runs.
                </span>
              </span>
            </label>
            <label className="emp-permission-row">
              <input
                type="checkbox"
                checked={payrollFlags.can_approve_payroll}
                onChange={(e) =>
                  setPayrollFlags((f) => ({ ...f, can_approve_payroll: e.target.checked }))
                }
              />
              <span>
                Can approve payroll
                <span className="emp-permission-sub">
                  Typically for HR Admin – reviews prepared runs before finance authorization.
                </span>
              </span>
            </label>
            <label className="emp-permission-row">
              <input
                type="checkbox"
                checked={payrollFlags.can_authorize_payroll}
                onChange={(e) =>
                  setPayrollFlags((f) => ({ ...f, can_authorize_payroll: e.target.checked }))
                }
              />
              <span>
                Can authorize payroll
                <span className="emp-permission-sub">
                  Typically for Finance Manager – final authorization and payslip distribution.
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Dependents / Personal details */}
        <div className="emp-detail-card">
          <div className="emp-card-title">Dependent / Personal details</div>
          <p className="emp-section-desc">Next of kin, emergency contacts, dependents.</p>
          {sectionsLoading ? <p className="emp-muted">Loading…</p> : (
            <>
              {dependents.length === 0 ? <p className="emp-muted">No dependents or contacts added yet.</p> : (
                <ul className="emp-section-list">
                  {dependents.map((d) => (
                    <li key={d.id} className="emp-section-item">
                      <span className="emp-section-item-type">{d.contact_type?.replace("_", " ")}</span>
                      <strong>{d.full_name}</strong>
                      {d.relationship && <span> · {d.relationship}</span>}
                      {d.phone && <span> · {d.phone}</span>}
                      <div className="emp-section-item-actions">
                        <button type="button" className="emp-link-btn" onClick={async () => {
                          if (!confirm("Remove this contact?")) return;
                          const r = await authFetch(`${API}/api/v1/employees/${userId}/dependents/${d.id}`, { method: "DELETE" });
                          if (r.ok) fetchSections();
                        }}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <DependentForm userId={userId} onSaved={fetchSections} API={API} authFetch={authFetch} />
            </>
          )}
        </div>

        {/* Work Experience */}
        <div className="emp-detail-card">
          <div className="emp-card-title">Work experience</div>
          <p className="emp-section-desc">Previous employers, roles, duration, responsibilities.</p>
          {sectionsLoading ? <p className="emp-muted">Loading…</p> : (
            <>
              {workExperience.length === 0 ? <p className="emp-muted">No work experience added yet.</p> : (
                <ul className="emp-section-list">
                  {workExperience.map((w) => (
                    <li key={w.id} className="emp-section-item">
                      <strong>{w.employer_name}</strong>
                      {w.job_title && <span> · {w.job_title}</span>}
                      {w.start_date && <span> · {w.start_date}</span>}
                      {w.end_date && !w.is_current && <span> – {w.end_date}</span>}
                      {w.is_current === "true" && <span className="emp-badge-current">Current</span>}
                      <div className="emp-section-item-actions">
                        <button type="button" className="emp-link-btn" onClick={() => setEditingWork(w)}>Edit</button>
                        <button type="button" className="emp-link-btn emp-link-btn--danger" onClick={async () => {
                          if (!confirm("Remove this entry?")) return;
                          const r = await authFetch(`${API}/api/v1/employees/${userId}/work-experience/${w.id}`, { method: "DELETE" });
                          if (r.ok) fetchSections();
                        }}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <WorkExperienceForm userId={userId} onSaved={fetchSections} API={API} authFetch={authFetch} editItem={editingWork} onCancelEdit={() => setEditingWork(null)} />
            </>
          )}
        </div>

        {/* Education */}
        <div className="emp-detail-card">
          <div className="emp-card-title">Education history</div>
          <p className="emp-section-desc">Qualifications, institutions, certifications, year of completion.</p>
          {sectionsLoading ? <p className="emp-muted">Loading…</p> : (
            <>
              {education.length === 0 ? <p className="emp-muted">No education added yet.</p> : (
                <ul className="emp-section-list">
                  {education.map((e) => (
                    <li key={e.id} className="emp-section-item">
                      <strong>{e.institution}</strong>
                      {e.qualification && <span> · {e.qualification}</span>}
                      {e.field_of_study && <span> · {e.field_of_study}</span>}
                      {e.year_completed && <span> · {e.year_completed}</span>}
                      <div className="emp-section-item-actions">
                        <button type="button" className="emp-link-btn" onClick={() => setEditingEdu(e)}>Edit</button>
                        <button type="button" className="emp-link-btn emp-link-btn--danger" onClick={async () => {
                          if (!confirm("Remove this entry?")) return;
                          const r = await authFetch(`${API}/api/v1/employees/${userId}/education/${e.id}`, { method: "DELETE" });
                          if (r.ok) fetchSections();
                        }}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <EducationForm userId={userId} onSaved={fetchSections} API={API} authFetch={authFetch} editItem={editingEdu} onCancelEdit={() => setEditingEdu(null)} />
            </>
          )}
        </div>

        {/* Company assets */}
        <div className="emp-detail-card">
          <div className="emp-card-title">Company assets</div>
          <p className="emp-section-desc">Devices, equipment, and other assets assigned to the employee.</p>
          {sectionsLoading ? <p className="emp-muted">Loading…</p> : (
            <>
              {assets.length === 0 ? <p className="emp-muted">No assets assigned yet.</p> : (
                <ul className="emp-section-list">
                  {assets.map((a) => (
                    <li key={a.id} className="emp-section-item">
                      <span className="emp-section-item-type">{a.asset_type}</span>
                      <strong>{a.description || a.asset_type}</strong>
                      {a.serial_number && <span> · {a.serial_number}</span>}
                      {a.assigned_date && <span> · Assigned {a.assigned_date}</span>}
                      {a.returned_date && <span className="emp-returned"> Returned {a.returned_date}</span>}
                      <div className="emp-section-item-actions">
                        <button type="button" className="emp-link-btn" onClick={() => setEditingAsset(a)}>Edit</button>
                        <button type="button" className="emp-link-btn emp-link-btn--danger" onClick={async () => {
                          if (!confirm("Remove this asset record?")) return;
                          const r = await authFetch(`${API}/api/v1/employees/${userId}/assets/${a.id}`, { method: "DELETE" });
                          if (r.ok) fetchSections();
                        }}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <AssetForm userId={userId} onSaved={fetchSections} API={API} authFetch={authFetch} editItem={editingAsset} onCancelEdit={() => setEditingAsset(null)} />
            </>
          )}
        </div>

        {/* Document management */}
        <div className="emp-detail-card">
          <div className="emp-card-title">Document management</div>
          <p className="emp-section-desc">Upload and manage personal documents: ID copies, contracts, certificates, NDAs, letters. Employees can also upload from their profile.</p>
          {sectionsLoading ? <p className="emp-muted">Loading…</p> : (
            <>
              {documents.length === 0 ? <p className="emp-muted">No documents uploaded yet.</p> : (
                <ul className="emp-section-list">
                  {documents.map((doc) => (
                    <li key={doc.id} className="emp-section-item">
                      <strong>{doc.title}</strong>
                      <span className="emp-section-item-type"> · {doc.doc_type?.replace("_", " ")}</span>
                      <div className="emp-section-item-actions">
                        <button type="button" className="emp-link-btn" onClick={async () => {
                          const r = await authFetch(`${API}/api/v1/employee-docs/${doc.id}/download`);
                          if (r.ok) { const d = await r.json(); if (d.url) window.open(d.url, "_blank"); }
                        }}>Download</button>
                        <button type="button" className="emp-link-btn emp-link-btn--danger" onClick={async () => {
                          if (!confirm("Delete this document?")) return;
                          await authFetch(`${API}/api/v1/employee-docs/${userId}/${doc.id}`, { method: "DELETE" });
                          fetchSections();
                        }}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <DocumentUpload userId={userId} onUploaded={fetchSections} API={API} authFetch={authFetch} />
            </>
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
