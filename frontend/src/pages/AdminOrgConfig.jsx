import { useEffect, useState, useRef } from "react";
import { API, authFetch } from "../api.js";
import "./AdminOrgConfig.css";

const INDUSTRIES = [
  "healthcare", "fintech", "telecom", "education", "manufacturing",
  "retail", "ngo", "government", "logistics", "technology", "agriculture",
];
const WORK_ENVS = ["remote", "hybrid", "on-site", "field-based"];
const SENIORITY_BANDS = ["individual_contributor", "team_lead", "manager", "director", "executive"];
const WORK_PATTERNS = ["standard", "night_shift", "rotating", "travel_intensive", "seasonal"];
const COMMON_STRESSORS = [
  "high_emotional_labor", "target_driven", "physical_risk", "monotonous_tasks",
  "client_facing", "deadline_pressure", "shift_work_fatigue", "isolation",
];

export default function AdminOrgConfig() {
  const [tab, setTab] = useState("org"); // org | roles
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Org profile state
  const [orgProfile, setOrgProfile] = useState({
    org_purpose: "",
    industry: "",
    work_environment: "",
    benefits_tags: [],
  });
  const [benefitInput, setBenefitInput] = useState("");

  // Logo state
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoRef = useRef();

  // Role profiles state
  const [roles, setRoles] = useState([]);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({
    role_key: "",
    role_family: "",
    seniority_band: "",
    work_pattern: "",
    stressor_profile: [],
  });

  // ─── Load data ────────────────────────────────────────────────────

  useEffect(() => {
    fetchOrgProfile();
    fetchRoles();
    fetchLogo();
  }, []);

  async function fetchLogo() {
    try {
      const res = await authFetch(`${API}/api/v1/org-config/logo`);
      if (res.ok) {
        const data = await res.json();
        setLogoUrl(data.logo_url || null);
      }
    } catch { /* silent */ }
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setMsg("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await authFetch(`${API}/api/v1/org-config/logo`, { method: "POST", body: fd });
      if (res.ok) {
        const data = await res.json();
        setLogoUrl(data.logo_url);
        setMsg("Logo uploaded successfully");
      } else {
        const err = await res.json();
        setMsg(err.detail || "Logo upload failed");
      }
    } catch {
      setMsg("Logo upload failed");
    } finally {
      setLogoUploading(false);
      if (logoRef.current) logoRef.current.value = "";
    }
  }

  async function fetchOrgProfile() {
    try {
      const res = await authFetch(`${API}/api/v1/org-config/profile`);
      if (res.ok) {
        const data = await res.json();
        setOrgProfile({
          org_purpose: data.org_purpose || "",
          industry: data.industry || "",
          work_environment: data.work_environment || "",
          benefits_tags: data.benefits_tags || [],
        });
      }
    } catch { /* silent */ }
  }

  async function fetchRoles() {
    try {
      const res = await authFetch(`${API}/api/v1/org-config/roles`);
      if (res.ok) setRoles(await res.json());
    } catch { /* silent */ }
  }

  // ─── Org profile handlers ─────────────────────────────────────────

  async function handleSaveOrg() {
    setSaving(true);
    setMsg("");
    try {
      const res = await authFetch(`${API}/api/v1/org-config/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orgProfile),
      });
      if (res.ok) setMsg("Org profile saved");
      else setMsg("Failed to save");
    } catch {
      setMsg("Network error");
    } finally {
      setSaving(false);
    }
  }

  function addBenefit() {
    const tag = benefitInput.trim();
    if (tag && !orgProfile.benefits_tags.includes(tag)) {
      setOrgProfile({ ...orgProfile, benefits_tags: [...orgProfile.benefits_tags, tag] });
    }
    setBenefitInput("");
  }

  function removeBenefit(tag) {
    setOrgProfile({
      ...orgProfile,
      benefits_tags: orgProfile.benefits_tags.filter((t) => t !== tag),
    });
  }

  // ─── Role handlers ────────────────────────────────────────────────

  function startNewRole() {
    setEditingRole("__new__");
    setRoleForm({ role_key: "", role_family: "", seniority_band: "", work_pattern: "", stressor_profile: [] });
  }

  function startEditRole(role) {
    setEditingRole(role.role_key);
    setRoleForm({
      role_key: role.role_key,
      role_family: role.role_family || "",
      seniority_band: role.seniority_band || "",
      work_pattern: role.work_pattern || "",
      stressor_profile: role.stressor_profile || [],
    });
  }

  function toggleStressor(s) {
    const current = roleForm.stressor_profile;
    if (current.includes(s)) {
      setRoleForm({ ...roleForm, stressor_profile: current.filter((x) => x !== s) });
    } else {
      setRoleForm({ ...roleForm, stressor_profile: [...current, s] });
    }
  }

  async function handleSaveRole() {
    setSaving(true);
    setMsg("");
    try {
      if (editingRole === "__new__") {
        const res = await authFetch(`${API}/api/v1/org-config/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(roleForm),
        });
        if (res.ok) {
          setMsg("Role created");
          fetchRoles();
          setEditingRole(null);
        } else {
          const err = await res.json();
          setMsg(err.detail || "Failed to create");
        }
      } else {
        const { role_key, ...updateData } = roleForm;
        const res = await authFetch(`${API}/api/v1/org-config/roles/${editingRole}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateData),
        });
        if (res.ok) {
          setMsg("Role updated");
          fetchRoles();
          setEditingRole(null);
        } else {
          setMsg("Failed to update");
        }
      }
    } catch {
      setMsg("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRole(roleKey) {
    if (!confirm(`Delete role "${roleKey}"?`)) return;
    try {
      await authFetch(`${API}/api/v1/org-config/roles/${roleKey}`, { method: "DELETE" });
      fetchRoles();
      setMsg(`Role "${roleKey}" deleted`);
    } catch { /* silent */ }
  }

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="aoc-page">
      <h1 className="aoc-heading">Organisation Config</h1>
      <p className="aoc-subtitle">
        Configure your organisation's context for adaptive guided paths.
      </p>

      {msg && <div className="aoc-msg">{msg}</div>}

      <div className="aoc-tabs">
        <button className={`aoc-tab ${tab === "org" ? "active" : ""}`} onClick={() => setTab("org")}>
          Org Profile
        </button>
        <button className={`aoc-tab ${tab === "roles" ? "active" : ""}`} onClick={() => setTab("roles")}>
          Role Profiles
        </button>
      </div>

      {/* ─── Org Profile Tab ──────────────────────────────────────── */}
      {tab === "org" && (
        <div className="aoc-form">

          {/* Logo Upload */}
          <div className="aoc-logo-section">
            <div className="aoc-label" style={{ marginBottom: 8 }}>Organisation Logo</div>
            {logoUrl && (
              <img src={logoUrl} alt="Org logo" className="aoc-logo-preview" />
            )}
            <label className="aoc-logo-upload-btn">
              {logoUploading ? "Uploading…" : logoUrl ? "Replace Logo" : "Upload Logo"}
              <input
                ref={logoRef}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                onChange={handleLogoUpload}
                disabled={logoUploading}
              />
            </label>
            <p className="aoc-hint">PNG, JPG or SVG. Appears on employee payslips.</p>
          </div>

          <label className="aoc-label">
            Organisation Purpose
            <input
              className="aoc-input"
              placeholder="e.g. healthcare access, financial inclusion"
              value={orgProfile.org_purpose}
              onChange={(e) => setOrgProfile({ ...orgProfile, org_purpose: e.target.value })}
            />
          </label>

          <label className="aoc-label">
            Industry
            <select
              className="aoc-input"
              value={orgProfile.industry}
              onChange={(e) => setOrgProfile({ ...orgProfile, industry: e.target.value })}
            >
              <option value="">Select industry</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </label>

          <label className="aoc-label">
            Work Environment
            <select
              className="aoc-input"
              value={orgProfile.work_environment}
              onChange={(e) => setOrgProfile({ ...orgProfile, work_environment: e.target.value })}
            >
              <option value="">Select</option>
              {WORK_ENVS.map((e) => (
                <option key={e} value={e}>{e.replace(/-/g, " ")}</option>
              ))}
            </select>
          </label>

          <label className="aoc-label">Benefits Tags</label>
          <div className="aoc-tags">
            {orgProfile.benefits_tags.map((tag) => (
              <span key={tag} className="aoc-tag">
                {tag}
                <button onClick={() => removeBenefit(tag)}>&times;</button>
              </span>
            ))}
          </div>
          <div className="aoc-tag-input-row">
            <input
              className="aoc-input"
              placeholder="Add benefit tag (e.g. EAP, financial_counseling)"
              value={benefitInput}
              onChange={(e) => setBenefitInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBenefit())}
            />
            <button className="btn btnTiny" onClick={addBenefit}>Add</button>
          </div>

          <div className="aoc-actions">
            <button className="btn btnPrimary" onClick={handleSaveOrg} disabled={saving}>
              {saving ? "Saving..." : "Save Org Profile"}
            </button>
          </div>
        </div>
      )}

      {/* ─── Role Profiles Tab ────────────────────────────────────── */}
      {tab === "roles" && (
        <div className="aoc-roles">
          <div className="aoc-roles-header">
            <span>{roles.length} role(s) defined</span>
            <button className="btn btnTiny" onClick={startNewRole}>+ Add Role</button>
          </div>

          {editingRole && (
            <div className="aoc-role-form">
              <h3>{editingRole === "__new__" ? "New Role" : `Edit: ${editingRole}`}</h3>

              {editingRole === "__new__" && (
                <label className="aoc-label">
                  Role Key
                  <input
                    className="aoc-input"
                    placeholder="e.g. customer_support, nurse, sales_manager"
                    value={roleForm.role_key}
                    onChange={(e) => setRoleForm({ ...roleForm, role_key: e.target.value })}
                  />
                </label>
              )}

              <label className="aoc-label">
                Role Family
                <input
                  className="aoc-input"
                  placeholder="e.g. customer support, clinical, sales"
                  value={roleForm.role_family}
                  onChange={(e) => setRoleForm({ ...roleForm, role_family: e.target.value })}
                />
              </label>

              <label className="aoc-label">
                Seniority Band
                <select
                  className="aoc-input"
                  value={roleForm.seniority_band}
                  onChange={(e) => setRoleForm({ ...roleForm, seniority_band: e.target.value })}
                >
                  <option value="">Select</option>
                  {SENIORITY_BANDS.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </label>

              <label className="aoc-label">
                Work Pattern
                <select
                  className="aoc-input"
                  value={roleForm.work_pattern}
                  onChange={(e) => setRoleForm({ ...roleForm, work_pattern: e.target.value })}
                >
                  <option value="">Select</option>
                  {WORK_PATTERNS.map((w) => (
                    <option key={w} value={w}>{w.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </label>

              <label className="aoc-label">Stressor Profile</label>
              <div className="aoc-stressor-chips">
                {COMMON_STRESSORS.map((s) => (
                  <button
                    key={s}
                    className={`gpr-chip ${roleForm.stressor_profile.includes(s) ? "active" : ""}`}
                    onClick={() => toggleStressor(s)}
                  >
                    {s.replace(/_/g, " ")}
                  </button>
                ))}
              </div>

              <div className="aoc-actions">
                <button className="btn btnTiny" onClick={() => setEditingRole(null)}>Cancel</button>
                <button className="btn btnPrimary" onClick={handleSaveRole} disabled={saving}>
                  {saving ? "Saving..." : "Save Role"}
                </button>
              </div>
            </div>
          )}

          <div className="aoc-role-list">
            {roles.map((role) => (
              <div key={role.role_key} className="aoc-role-card">
                <div className="aoc-role-card-header">
                  <strong>{role.role_key}</strong>
                  <div className="aoc-role-card-actions">
                    <button className="btn btnTiny" onClick={() => startEditRole(role)}>Edit</button>
                    <button className="btn btnTiny btnDanger" onClick={() => handleDeleteRole(role.role_key)}>
                      Delete
                    </button>
                  </div>
                </div>
                <div className="aoc-role-card-meta">
                  {role.role_family && <span>Family: {role.role_family}</span>}
                  {role.seniority_band && <span>Seniority: {role.seniority_band.replace(/_/g, " ")}</span>}
                  {role.work_pattern && <span>Pattern: {role.work_pattern.replace(/_/g, " ")}</span>}
                </div>
                {role.stressor_profile?.length > 0 && (
                  <div className="aoc-role-stressors">
                    {role.stressor_profile.map((s) => (
                      <span key={s} className="aoc-tag">{s.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
