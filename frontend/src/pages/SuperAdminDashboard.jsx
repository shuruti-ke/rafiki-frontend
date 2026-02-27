import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./SuperAdminDashboard.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getHeaders() {
  const token = localStorage.getItem("rafiki_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total_orgs: 0, total_users: 0, active_orgs: 0 });
  const [orgs, setOrgs] = useState([]);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [showHRModal, setShowHRModal] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Org form
  const [orgName, setOrgName] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [orgIndustry, setOrgIndustry] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [orgEmployeeCount, setOrgEmployeeCount] = useState("");

  // HR Admin form
  const [hrEmail, setHrEmail] = useState("");
  const [hrPassword, setHrPassword] = useState("");
  const [hrName, setHrName] = useState("");
  const [hrOrgId, setHrOrgId] = useState("");

  const fetchAll = async () => {
    try {
      const [sRes, oRes] = await Promise.all([
        fetch(`${API}/super-admin/stats`, { headers: getHeaders() }),
        fetch(`${API}/super-admin/orgs`, { headers: getHeaders() }),
      ]);
      if (sRes.ok) setStats(await sRes.json());
      if (oRes.ok) setOrgs(await oRes.json());
    } catch {
      /* ignore fetch errors on load */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const body = { name: orgName };
      if (orgCode.trim()) body.org_code = orgCode.trim(); // ✅ FIXED
      if (orgIndustry.trim()) body.industry = orgIndustry.trim();
      if (orgDescription.trim()) body.description = orgDescription.trim();
      if (orgEmployeeCount) body.employee_count = Number(orgEmployeeCount);

      const res = await authFetch(`${API}/super-admin/orgs`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create org");

      setShowOrgModal(false);
      setOrgName("");
      setOrgCode("");
      setOrgIndustry("");
      setOrgDescription("");
      setOrgEmployeeCount("");
      fetchAll();
    } catch (err) {
      setError(err.message || "Failed to create org");
    }
  };

  const handleCreateHR = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await authFetch(`${API}/super-admin/orgs/${hrOrgId}/admin`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ email: hrEmail, password: hrPassword, full_name: hrName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create HR admin");

      setShowHRModal(false);
      setHrEmail("");
      setHrPassword("");
      setHrName("");
      setHrOrgId("");
      fetchAll();
    } catch (err) {
      setError(err.message || "Failed to create HR admin");
    }
  };

  return (
    <div className="sa-dashboard">
      <h1>Super Admin Dashboard</h1>

      <div className="sa-stats">
        <div className="sa-stat-card">
          <div className="label">Organizations</div>
          <div className="value">{stats.total_orgs}</div>
        </div>
        <div className="sa-stat-card">
          <div className="label">Total Users</div>
          <div className="value">{stats.total_users}</div>
        </div>
        <div className="sa-stat-card">
          <div className="label">Active Orgs</div>
          <div className="value">{stats.active_orgs}</div>
        </div>
      </div>

      <div className="sa-actions">
        <button
          className="btn btnPrimary"
          onClick={() => {
            setError("");
            setShowOrgModal(true);
          }}
        >
          Onboard Company
        </button>
        <button
          className="btn btnPrimary"
          onClick={() => {
            setError("");
            setShowHRModal(true);
          }}
        >
          Create HR Admin
        </button>
      </div>

      {/* Organizations table */}
      <div className="sa-section">
        <h2>Organizations</h2>
        {loading ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading...</p>
        ) : orgs.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No organizations yet.</p>
        ) : (
          <table className="sa-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Industry</th>
                <th>Users</th>
                <th>HR Admin</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr
                  key={o.org_id} // ✅ FIXED
                  className="sa-table-row-link"
                  onClick={() => navigate(`/super-admin/orgs/${o.org_id}`)} // ✅ FIXED
                >
                  <td>{o.name}</td>
                  <td>
                    <code className="sa-code">{o.org_code}</code> {/* ✅ FIXED */}
                  </td>
                  <td>{o.industry || "—"}</td>
                  <td>{o.user_count}</td>
                  <td>{o.admin_email || "—"}</td>
                  <td>
                    <span className={`sa-badge ${o.is_active ? "sa-badge-active" : "sa-badge-inactive"}`}>
                      {o.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Onboard Company Modal */}
      {showOrgModal && (
        <div className="sa-modal-overlay" onClick={() => setShowOrgModal(false)}>
          <div className="sa-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Onboard Company</h3>
            <form className="sa-modal-form" onSubmit={handleCreateOrg}>
              <div className="sa-modal-field">
                <label>Company Name *</label>
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme Corp"
                  required
                />
              </div>
              <div className="sa-modal-field">
                <label>Company Code (auto-generated if blank)</label>
                <input
                  value={orgCode}
                  onChange={(e) => setOrgCode(e.target.value)}
                  placeholder="e.g. 54321"
                />
              </div>
              <div className="sa-modal-field">
                <label>Industry</label>
                <input
                  value={orgIndustry}
                  onChange={(e) => setOrgIndustry(e.target.value)}
                  placeholder="e.g. Technology"
                />
              </div>
              <div className="sa-modal-field">
                <label>Description</label>
                <input
                  value={orgDescription}
                  onChange={(e) => setOrgDescription(e.target.value)}
                  placeholder="Brief description"
                />
              </div>
              <div className="sa-modal-field">
                <label>Employee Count</label>
                <input
                  type="number"
                  value={orgEmployeeCount}
                  onChange={(e) => setOrgEmployeeCount(e.target.value)}
                  placeholder="e.g. 50"
                  min="0"
                />
              </div>

              {error && <div className="login-error">{error}</div>}

              <div className="sa-modal-btns">
                <button type="submit" className="btn btnPrimary">
                  Create
                </button>
                <button type="button" className="btn" onClick={() => setShowOrgModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create HR Admin Modal */}
      {showHRModal && (
        <div className="sa-modal-overlay" onClick={() => setShowHRModal(false)}>
          <div className="sa-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create HR Admin</h3>
            <form className="sa-modal-form" onSubmit={handleCreateHR}>
              <div className="sa-modal-field">
                <label>Organization *</label>
                <select value={hrOrgId} onChange={(e) => setHrOrgId(e.target.value)} required>
                  <option value="">Select organization...</option>
                  {orgs.map((o) => (
                    <option key={o.org_id} value={o.org_id}>
                      {o.name} ({o.org_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sa-modal-field">
                <label>Full Name *</label>
                <input
                  value={hrName}
                  onChange={(e) => setHrName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                />
              </div>

              <div className="sa-modal-field">
                <label>Email *</label>
                <input
                  type="email"
                  value={hrEmail}
                  onChange={(e) => setHrEmail(e.target.value)}
                  placeholder="hr@company.com"
                  required
                />
              </div>

              <div className="sa-modal-field">
                <label>Password *</label>
                <input
                  type="password"
                  value={hrPassword}
                  onChange={(e) => setHrPassword(e.target.value)}
                  placeholder="Set a password"
                  required
                />
              </div>

              {error && <div className="login-error">{error}</div>}

              <div className="sa-modal-btns">
                <button type="submit" className="btn btnPrimary">
                  Create
                </button>
                <button type="button" className="btn" onClick={() => setShowHRModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
