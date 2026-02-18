import { useState, useEffect } from "react";
import "./SuperAdminDashboard.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "X-User-Role": "super_admin",
  };
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState({ total_orgs: 0, total_users: 0, total_hr_admins: 0 });
  const [orgs, setOrgs] = useState([]);
  const [hrAdmins, setHrAdmins] = useState([]);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [showHRModal, setShowHRModal] = useState(false);
  const [error, setError] = useState("");

  // Org form
  const [orgName, setOrgName] = useState("");
  const [orgCode, setOrgCode] = useState("");

  // HR Admin form
  const [hrEmail, setHrEmail] = useState("");
  const [hrPassword, setHrPassword] = useState("");
  const [hrName, setHrName] = useState("");
  const [hrOrgId, setHrOrgId] = useState("");

  const fetchAll = async () => {
    try {
      const [sRes, oRes, hRes] = await Promise.all([
        fetch(`${API}/api/v1/super-admin/stats`, { headers: getHeaders() }),
        fetch(`${API}/api/v1/super-admin/organizations`, { headers: getHeaders() }),
        fetch(`${API}/api/v1/super-admin/hr-admins`, { headers: getHeaders() }),
      ]);
      if (sRes.ok) setStats(await sRes.json());
      if (oRes.ok) setOrgs(await oRes.json());
      if (hRes.ok) setHrAdmins(await hRes.json());
    } catch {
      /* ignore fetch errors on load */
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch(`${API}/api/v1/super-admin/organizations`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ name: orgName, code: orgCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create org");
      setShowOrgModal(false);
      setOrgName("");
      setOrgCode("");
      fetchAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateHR = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch(`${API}/api/v1/super-admin/hr-admins`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ email: hrEmail, password: hrPassword, full_name: hrName, org_id: Number(hrOrgId) }),
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
      setError(err.message);
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
          <div className="label">HR Admins</div>
          <div className="value">{stats.total_hr_admins}</div>
        </div>
      </div>

      <div className="sa-actions">
        <button className="btn btnPrimary" onClick={() => { setError(""); setShowOrgModal(true); }}>
          Onboard Company
        </button>
        <button className="btn btnPrimary" onClick={() => { setError(""); setShowHRModal(true); }}>
          Create HR Admin
        </button>
      </div>

      {/* Organizations table */}
      <div className="sa-section">
        <h2>Organizations</h2>
        {orgs.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No organizations yet.</p>
        ) : (
          <table className="sa-table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Code</th></tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}><td>{o.id}</td><td>{o.name}</td><td>{o.code}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* HR Admins table */}
      <div className="sa-section">
        <h2>HR Admins</h2>
        {hrAdmins.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No HR admins yet.</p>
        ) : (
          <table className="sa-table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Email</th><th>Org ID</th></tr>
            </thead>
            <tbody>
              {hrAdmins.map((u) => (
                <tr key={u.id}><td>{u.id}</td><td>{u.full_name}</td><td>{u.email}</td><td>{u.org_id}</td></tr>
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
                <label>Company Name</label>
                <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Corp" required />
              </div>
              <div className="sa-modal-field">
                <label>Company Code</label>
                <input value={orgCode} onChange={(e) => setOrgCode(e.target.value)} placeholder="acme" required />
              </div>
              {error && <div className="login-error">{error}</div>}
              <div className="sa-modal-btns">
                <button type="submit" className="btn btnPrimary">Create</button>
                <button type="button" className="btn" onClick={() => setShowOrgModal(false)}>Cancel</button>
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
              <div className="sa-modal-field">
                <label>Organization</label>
                <select value={hrOrgId} onChange={(e) => setHrOrgId(e.target.value)} required>
                  <option value="">Select organization...</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
                  ))}
                </select>
              </div>
              {error && <div className="login-error">{error}</div>}
              <div className="sa-modal-btns">
                <button type="submit" className="btn btnPrimary">Create</button>
                <button type="button" className="btn" onClick={() => setShowHRModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
