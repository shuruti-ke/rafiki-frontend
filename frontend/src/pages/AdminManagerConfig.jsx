import { useState, useEffect } from "react";
import { API } from "../api.js";
import "./AdminManagerConfig.css";

const LEVELS = ["L1", "L2", "L3", "L4"];
const DATA_TYPES = ["profile", "objectives", "evaluations", "disciplinary"];
const FEATURES = ["coaching_ai", "pip_tools", "dev_plans", "toolkit"];

export default function AdminManagerConfig() {
  const [configs, setConfigs] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("managers"); // "managers" | "audit"

  // New manager form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    user_id: "",
    manager_level: "L1",
    allowed_data_types: ["profile", "objectives", "evaluations"],
    allowed_features: ["coaching_ai"],
  });
  const [formError, setFormError] = useState("");

  useEffect(() => {
    loadConfigs();
  }, []);

  function loadConfigs() {
    setLoading(true);
    fetch(`${API}/api/v1/manager/admin/configs`)
      .then((r) => r.json())
      .then((data) => setConfigs(Array.isArray(data) ? data : []))
      .catch(() => setConfigs([]))
      .finally(() => setLoading(false));
  }

  function loadAudit() {
    fetch(`${API}/api/v1/manager/admin/audit`)
      .then((r) => r.json())
      .then((data) => setAudit(Array.isArray(data) ? data : []))
      .catch(() => setAudit([]));
  }

  function switchTab(t) {
    setTab(t);
    if (t === "audit" && audit.length === 0) loadAudit();
  }

  async function handleCreate() {
    setFormError("");
    if (!form.user_id) {
      setFormError("User ID is required");
      return;
    }

    try {
      const r = await fetch(`${API}/api/v1/manager/admin/configs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: Number(form.user_id),
          manager_level: form.manager_level,
          allowed_data_types: form.allowed_data_types,
          allowed_features: form.allowed_features,
        }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${r.status}`);
      }

      setShowForm(false);
      setForm({ user_id: "", manager_level: "L1", allowed_data_types: ["profile", "objectives", "evaluations"], allowed_features: ["coaching_ai"] });
      loadConfigs();
    } catch (e) {
      setFormError(e.message);
    }
  }

  async function handleDelete(configId) {
    if (!confirm("Revoke this manager's access?")) return;

    try {
      await fetch(`${API}/api/v1/manager/admin/configs/${configId}`, { method: "DELETE" });
      loadConfigs();
    } catch (e) {
      // silently fail
    }
  }

  async function handleToggleActive(config) {
    try {
      await fetch(`${API}/api/v1/manager/admin/configs/${config.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !config.is_active }),
      });
      loadConfigs();
    } catch (e) {
      // silently fail
    }
  }

  async function seedToolkit() {
    try {
      const r = await fetch(`${API}/api/v1/manager/admin/seed-toolkit`, { method: "POST" });
      const data = await r.json();
      alert(`Seeded ${data.modules_created} toolkit modules`);
    } catch (e) {
      alert("Failed to seed toolkit");
    }
  }

  function toggleArrayItem(arr, item) {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
  }

  return (
    <div className="amc">
      <h1 className="amc-title">Manager Configuration</h1>
      <p className="amc-sub">
        Assign manager roles, configure access scope, and view audit trails.
      </p>

      {/* Tabs */}
      <div className="amc-tabs">
        <button className={`mgr-tab ${tab === "managers" ? "active" : ""}`} onClick={() => switchTab("managers")}>
          Managers ({configs.length})
        </button>
        <button className={`mgr-tab ${tab === "audit" ? "active" : ""}`} onClick={() => switchTab("audit")}>
          Audit Trail
        </button>
        <button className="btn btnTiny" style={{ marginLeft: "auto" }} onClick={seedToolkit}>
          Seed Default Toolkit
        </button>
      </div>

      {tab === "managers" && (
        <>
          <div className="amc-actions">
            <button className="btn btnPrimary" onClick={() => setShowForm(!showForm)}>
              {showForm ? "Cancel" : "+ Assign Manager"}
            </button>
          </div>

          {showForm && (
            <div className="amc-form">
              <div className="amc-form-row">
                <label>User ID</label>
                <input
                  type="number"
                  className="mgr-form-select"
                  placeholder="Employee user ID"
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                />
              </div>

              <div className="amc-form-row">
                <label>Manager Level</label>
                <div className="amc-chip-group">
                  {LEVELS.map((l) => (
                    <button
                      key={l}
                      className={`mgr-filter-chip ${form.manager_level === l ? "active" : ""}`}
                      onClick={() => setForm({ ...form, manager_level: l })}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="amc-level-help">
                  L1 = Direct reports · L2 = Department · L3 = Multi-department · L4 = Org aggregates only
                </div>
              </div>

              <div className="amc-form-row">
                <label>Allowed Data Types</label>
                <div className="amc-chip-group">
                  {DATA_TYPES.map((dt) => (
                    <button
                      key={dt}
                      className={`mgr-filter-chip ${form.allowed_data_types.includes(dt) ? "active" : ""}`}
                      onClick={() => setForm({ ...form, allowed_data_types: toggleArrayItem(form.allowed_data_types, dt) })}
                    >
                      {dt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="amc-form-row">
                <label>Allowed Features</label>
                <div className="amc-chip-group">
                  {FEATURES.map((f) => (
                    <button
                      key={f}
                      className={`mgr-filter-chip ${form.allowed_features.includes(f) ? "active" : ""}`}
                      onClick={() => setForm({ ...form, allowed_features: toggleArrayItem(form.allowed_features, f) })}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {formError && <div className="mgr-coaching-error">{formError}</div>}

              <button className="btn btnPrimary" onClick={handleCreate}>
                Save Manager Config
              </button>
            </div>
          )}

          {loading ? (
            <p className="mgr-loading">Loading...</p>
          ) : configs.length === 0 ? (
            <p className="amc-empty">No managers configured yet.</p>
          ) : (
            <div className="amc-list">
              {configs.map((c) => (
                <div key={c.id} className={`amc-card ${!c.is_active ? "inactive" : ""}`}>
                  <div className="amc-card-header">
                    <strong>User #{c.user_id}</strong>
                    <div className="amc-card-badges">
                      <span className="mgr-rating-badge">{c.manager_level}</span>
                      <span className={`amc-status ${c.is_active ? "active" : "inactive"}`}>
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  <div className="amc-card-details">
                    <div className="amc-detail-row">
                      <span className="amc-detail-label">Data:</span>
                      {(c.allowed_data_types || []).join(", ") || "none"}
                    </div>
                    <div className="amc-detail-row">
                      <span className="amc-detail-label">Features:</span>
                      {(c.allowed_features || []).join(", ") || "none"}
                    </div>
                  </div>
                  <div className="amc-card-actions">
                    <button className="btn btnTiny" onClick={() => handleToggleActive(c)}>
                      {c.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button className="btn btnTiny" style={{ color: "var(--danger)" }} onClick={() => handleDelete(c.id)}>
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "audit" && (
        <div className="amc-audit">
          {audit.length === 0 ? (
            <p className="amc-empty">No manager audit entries yet.</p>
          ) : (
            <table className="amc-audit-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((e) => (
                  <tr key={e.id}>
                    <td>{e.created_at ? new Date(e.created_at).toLocaleString() : ""}</td>
                    <td>#{e.user_id}</td>
                    <td>{e.action}</td>
                    <td>{e.resource_type}{e.resource_id ? ` #${e.resource_id}` : ""}</td>
                    <td className="amc-audit-details">
                      {e.details ? JSON.stringify(e.details) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
