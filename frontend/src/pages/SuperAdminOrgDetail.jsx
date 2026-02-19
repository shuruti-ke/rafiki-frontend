import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./SuperAdminDashboard.css";
import "./SuperAdminOrgDetail.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getHeaders() {
  const token = localStorage.getItem("rafiki_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function SuperAdminOrgDetail() {
  const { orgId } = useParams();
  const navigate = useNavigate();

  const [org, setOrg] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Edit form
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [isActive, setIsActive] = useState(true);

  // HR Admin form
  const [showHRForm, setShowHRForm] = useState(false);
  const [hrEmail, setHrEmail] = useState("");
  const [hrPassword, setHrPassword] = useState("");
  const [hrName, setHrName] = useState("");
  const [hrError, setHrError] = useState("");
  const [hrSuccess, setHrSuccess] = useState("");

  const fetchOrg = async () => {
    if (!orgId) return; // ✅ FIX: guard against undefined orgId
    try {
      const [orgRes, usersRes] = await Promise.all([
        fetch(`${API}/super-admin/orgs/${orgId}`, { headers: getHeaders() }),
        fetch(`${API}/super-admin/orgs/${orgId}/users`, { headers: getHeaders() }),
      ]);

      if (!orgRes.ok) {
        navigate("/super-admin");
        return;
      }

      const orgData = await orgRes.json();
      setOrg(orgData);
      setName(orgData.name || "");
      setCode(orgData.org_code || ""); // ✅ FIX: backend returns org_code, not code
      setIndustry(orgData.industry || "");
      setDescription(orgData.description || "");
      setEmployeeCount(orgData.employee_count != null ? String(orgData.employee_count) : "");
      setIsActive(orgData.is_active !== false);

      if (usersRes.ok) setUsers(await usersRes.json());
    } catch {
      navigate("/super-admin");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrg(); }, [orgId]);

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const body = {
        name,
        org_code: code, // ✅ FIX: backend expects org_code, not code
        industry,
        description,
        is_active: isActive,
      };
      if (employeeCount) body.employee_count = Number(employeeCount);

      const res = await fetch(`${API}/super-admin/orgs/${orgId}`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update");
      setOrg(data);
      setSuccess("Organization updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateHR = async (e) => {
    e.preventDefault();
    setHrError("");
    setHrSuccess("");
    try {
      const res = await fetch(`${API}/super-admin/orgs/${orgId}/admin`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ email: hrEmail, password: hrPassword, full_name: hrName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create HR admin");
      setHrSuccess(`HR Admin ${data.email} created.`);
      setHrEmail("");
      setHrPassword("");
      setHrName("");
      setShowHRForm(false);
      fetchOrg();
    } catch (err) {
      setHrError(err.message);
    }
  };

  if (loading) {
    return <div className="sa-org-detail"><p style={{ color: "var(--muted)" }}>Loading...</p></div>;
  }

  if (!org) return null;

  return (
    <div className="sa-org-detail">
      <button className="sa-back-btn" onClick={() => navigate("/super-admin")}>
        &larr; Back to Dashboard
      </button>

      <h1>{org.name}</h1>

      {/* Edit form */}
      <div className="sa-org-section">
        <h2>Organization Details</h2>
        <form className="sa-org-form" onSubmit={handleSave}>
          <div className="sa-org-form-grid">
            <div className="sa-modal-field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="sa-modal-field">
              <label>Company Code</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <div className="sa-modal-field">
              <label>Industry</label>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Technology" />
            </div>
            <div className="sa-modal-field">
              <label>Employee Count</label>
              <input type="number" value={employeeCount} onChange={(e) => setEmployeeCount(e.target.value)} min="0" />
            </div>
          </div>
          <div className="sa-modal-field">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Brief description of the organization" />
          </div>
          <div className="sa-org-toggle">
            <label>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>
          {error && <div className="sa-msg sa-msg-error">{error}</div>}
          {success && <div className="sa-msg sa-msg-success">{success}</div>}
          <button type="submit" className="btn btnPrimary" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>

      {/* Users */}
      <div className="sa-org-section">
        <div className="sa-org-section-header">
          <h2>Users ({users.length})</h2>
          <button className="btn btnPrimary" onClick={() => { setShowHRForm(!showHRForm); setHrError(""); setHrSuccess(""); }}>
            {showHRForm ? "Cancel" : "Add HR Admin"}
          </button>
        </div>

        {hrSuccess && <div className="sa-msg sa-msg-success">{hrSuccess}</div>}

        {showHRForm && (
          <form className="sa-hr-form" onSubmit={handleCreateHR}>
            <div className="sa-org-form-grid">
              <div className="sa-modal-field">
                <label>Full Name</label>
                <input value={hrName} onChange={(e) => setHrName(e.target.value)} placeholder="Jane Doe" required />
              </div>
              <div className="sa-modal-field">
                <label>Email</label>
                <input type="email" value={hrEmail} onChange={(e) => setHrEmail(e.target.value)} placeholder="hr@company.com" required />
              </div>
              <div className="sa-modal-field">
                <label>Password</label>
                <input type="password" value={hrPassword} onChange={(e) => setHrPassword(e.target.value)} placeholder="Set a password" required />
              </div>
            </div>
            {hrError && <div className="sa-msg sa-msg-error">{hrError}</div>}
            <button type="submit" className="btn btnPrimary">Create HR Admin</button>
          </form>
        )}

        {users.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No users in this organization.</p>
        ) : (
          <table className="sa-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id}>{/* ✅ FIX: backend returns user_id, not id */}
                  <td>{u.name || "—"}</td>{/* ✅ FIX: backend returns name, not full_name */}
                  <td>{u.email}</td>
                  <td>
                    <span className={`sa-role-badge sa-role-${u.role}`}>
                      {u.role === "hr_admin" ? "HR Admin" : u.role === "manager" ? "Manager" : "Employee"}
                    </span>
                  </td>
                  <td>
                    <span className={`sa-badge ${u.is_active ? "sa-badge-active" : "sa-badge-inactive"}`}>
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
