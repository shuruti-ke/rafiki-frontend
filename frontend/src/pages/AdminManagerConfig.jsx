import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { API, authFetch } from "../api.js";
import "./AdminManagerConfig.css";

const MANAGER_LEVELS = ["L1", "L2", "L3"];
const ALLOWED_DATA_TYPES = ["profile", "objectives", "evaluations"];
const ALLOWED_FEATURES = [
  { id: "coaching_ai", label: "AI Coaching" },
  { id: "toolkit", label: "HR Toolkit" },
];

export default function AdminManagerConfig() {
  const [employees, setEmployees] = useState([]);
  const [managerConfigs, setManagerConfigs] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(null); // user_id being saved
  const [savingConfig, setSavingConfig] = useState(null); // user_id for config save
  const [search, setSearch]       = useState("");
  const [filterMgr, setFilterMgr] = useState("all");
  const [toast, setToast]         = useState(null);
  const [optionsForManager, setOptionsForManager] = useState(null); // user_id when panel open

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [empRes, configRes] = await Promise.all([
        authFetch(`${API}/api/v1/employees/`),
        authFetch(`${API}/api/v1/manager/admin/configs`),
      ]);
      if (empRes.ok) setEmployees(await empRes.json());
      if (configRes.ok) setManagerConfigs(await configRes.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // All users who are managers or hr_admin
  const managers = employees.filter(e =>
    ["manager","hr_admin","super_admin"].includes(e.user?.role)
  );

  const getConfigForManager = (userId) =>
    managerConfigs.find(c => c.user_id === userId) || null;

  const departments = [...new Set(
    employees
      .map(e => e.user?.department || e.profile?.department || "")
      .filter(Boolean)
  )].sort();

  const [optionsForm, setOptionsForm] = useState({
    manager_level: "L1",
    department_scope: [],
    allowed_data_types: ["profile", "objectives", "evaluations"],
    allowed_features: ["coaching_ai"],
  });

  const openOptions = (m) => {
    const cfg = getConfigForManager(m.user?.user_id);
    setOptionsForManager(m.user?.user_id);
    setOptionsForm(cfg ? {
      manager_level: cfg.manager_level || "L1",
      department_scope: Array.isArray(cfg.department_scope) ? [...cfg.department_scope] : [],
      allowed_data_types: Array.isArray(cfg.allowed_data_types) ? [...cfg.allowed_data_types] : ["profile", "objectives", "evaluations"],
      allowed_features: Array.isArray(cfg.allowed_features) ? [...cfg.allowed_features] : ["coaching_ai"],
    } : {
      manager_level: "L1",
      department_scope: [],
      allowed_data_types: ["profile", "objectives", "evaluations"],
      allowed_features: ["coaching_ai"],
    });
  };

  const updateOptionsForm = (field, value) => {
    setOptionsForm(prev => ({ ...prev, [field]: value }));
  };

  const toggleList = (field, item) => {
    setOptionsForm(prev => {
      const list = prev[field] || [];
      const next = list.includes(item) ? list.filter(x => x !== item) : [...list, item];
      return { ...prev, [field]: next };
    });
  };

  const saveManagerOptions = async () => {
    const userId = optionsForManager;
    if (!userId) return;
    const cfg = getConfigForManager(userId);
    setSavingConfig(userId);
    try {
      if (cfg) {
        const r = await authFetch(`${API}/api/v1/manager/admin/configs/${cfg.id}`, {
          method: "PUT",
          body: JSON.stringify({
            manager_level: optionsForm.manager_level,
            department_scope: optionsForm.department_scope,
            allowed_data_types: optionsForm.allowed_data_types,
            allowed_features: optionsForm.allowed_features,
          }),
        });
        if (r.ok) {
          showToast("Manager options updated");
          await load();
          setOptionsForManager(null);
        } else {
          const d = await r.json();
          showToast(d.detail || "Update failed", false);
        }
      } else {
        const r = await authFetch(`${API}/api/v1/manager/admin/configs`, {
          method: "POST",
          body: JSON.stringify({
            user_id: userId,
            manager_level: optionsForm.manager_level,
            department_scope: optionsForm.department_scope,
            allowed_data_types: optionsForm.allowed_data_types,
            allowed_features: optionsForm.allowed_features,
          }),
        });
        if (r.ok) {
          showToast("Manager options added");
          await load();
          setOptionsForManager(null);
        } else {
          const d = await r.json();
          showToast(d.detail || "Create failed", false);
        }
      }
    } catch { showToast("Network error", false); }
    setSavingConfig(null);
  };

  const removeManagerConfig = async (configId) => {
    if (!window.confirm("Remove these options for this manager? They will still have manager role but use default scope.")) return;
    try {
      const r = await authFetch(`${API}/api/v1/manager/admin/configs/${configId}`, { method: "DELETE" });
      if (r.ok) {
        showToast("Manager options removed");
        await load();
        setOptionsForManager(null);
      } else {
        const d = await r.json();
        showToast(d.detail || "Delete failed", false);
      }
    } catch { showToast("Network error", false); }
  };

  // Promote/demote role
  const setRole = async (emp, newRole) => {
    const uid = emp.user?.user_id;
    setSaving(uid);
    try {
      const r = await authFetch(`${API}/api/v1/employees/${uid}`, {
        method: "PUT",
        body: JSON.stringify({ role: newRole }),
      });
      if (r.ok) {
        showToast(`${emp.user?.name || emp.user?.email} set to ${newRole}`);
        await load();
      } else {
        const d = await r.json();
        showToast(d.detail || "Failed to update role", false);
      }
    } catch { showToast("Network error", false); }
    setSaving(null);
  };

  // Assign manager_id
  const assignManager = async (emp, managerId) => {
    const uid = emp.user?.user_id;
    setSaving(uid);
    try {
      const r = await authFetch(`${API}/api/v1/employees/${uid}`, {
        method: "PUT",
        body: JSON.stringify({ manager_id: managerId || null }),
      });
      if (r.ok) {
        const mgrName = managerId
          ? employees.find(e => e.user?.user_id === managerId)?.user?.name || "manager"
          : "unassigned";
        showToast(`${emp.user?.name || emp.user?.email} assigned to ${mgrName}`);
        await load();
      } else {
        const d = await r.json();
        showToast(d.detail || "Failed to assign", false);
      }
    } catch { showToast("Network error", false); }
    setSaving(null);
  };

  // Filter employees
  const filtered = employees.filter(e => {
    const name = (e.user?.name || e.user?.email || "").toLowerCase();
    const dept = (e.user?.department || e.profile?.department || "").toLowerCase();
    const q = search.toLowerCase();
    if (q && !name.includes(q) && !dept.includes(q)) return false;
    if (filterMgr === "unassigned" && e.user?.manager_id) return false;
    if (filterMgr === "assigned"   && !e.user?.manager_id) return false;
    if (filterMgr === "managers"   && !["manager","hr_admin","super_admin"].includes(e.user?.role)) return false;
    return true;
  });

  const getManagerName = (mgr_id) => {
    const m = employees.find(e => e.user?.user_id === mgr_id);
    return m ? (m.user?.name || m.user?.email) : "—";
  };

  const initial = (emp) => (emp.user?.name || emp.user?.email || "?")[0].toUpperCase();

  const ROLE_BADGE = {
    user:        { label: "Employee",   bg: "#EDE9FE", color: "#6D28D9" },
    manager:     { label: "Manager",    bg: "#DBEAFE", color: "#1D4ED8" },
    hr_admin:    { label: "HR Admin",   bg: "#D1FAE5", color: "#065F46" },
    super_admin: { label: "Super Admin",bg: "#FEF3C7", color: "#92400E" },
  };

  return (
    <div className="mgrcfg-page">
      {toast && (
        <div className={`mgrcfg-toast${toast.ok ? "" : " mgrcfg-toast--err"}`}>
          {toast.ok ? "✓" : "✗"} {toast.msg}
        </div>
      )}

      <div className="mgrcfg-header">
        <div>
          <h1>Manager Configuration</h1>
          <p>Assign employees to managers and manage roles</p>
        </div>
        <div className="mgrcfg-header-actions">
          <Link to="/manager/coaching" className="mgrcfg-coaching-link">
            <span className="mgrcfg-coaching-icon">🧠</span>
            AI Coaching
          </Link>
          <div className="mgrcfg-stats">
          <div className="mgrcfg-stat">
            <span className="mgrcfg-stat-num">{managers.length}</span>
            <span className="mgrcfg-stat-lbl">Managers</span>
          </div>
          <div className="mgrcfg-stat">
            <span className="mgrcfg-stat-num">
              {employees.filter(e => e.user?.manager_id).length}
            </span>
            <span className="mgrcfg-stat-lbl">Assigned</span>
          </div>
          <div className="mgrcfg-stat">
            <span className="mgrcfg-stat-num" style={{color:"#f59e0b"}}>
              {employees.filter(e => !e.user?.manager_id && e.user?.role === "user").length}
            </span>
            <span className="mgrcfg-stat-lbl">Unassigned</span>
          </div>
          </div>
        </div>
      </div>

      {/* Managers overview strip */}
      {managers.length > 0 && (
        <div className="mgrcfg-mgr-strip">
          <div className="mgrcfg-strip-title">Active Managers</div>
          <div className="mgrcfg-mgr-cards">
            {managers.map(m => {
              const reports = employees.filter(e => e.user?.manager_id === m.user?.user_id);
              const cfg = getConfigForManager(m.user?.user_id);
              const optionsOpen = optionsForManager === m.user?.user_id;
              return (
                <div key={m.user?.user_id} className={`mgrcfg-mgr-card${optionsOpen ? " mgrcfg-mgr-card--open" : ""}`}>
                  <div className="mgrcfg-mgr-av">{initial(m)}</div>
                  <div className="mgrcfg-mgr-info">
                    <div className="mgrcfg-mgr-name">{m.user?.name || m.user?.email}</div>
                    <div className="mgrcfg-mgr-dept">{m.user?.department || m.profile?.department || "—"}</div>
                  </div>
                  <div className="mgrcfg-mgr-reports">{reports.length} reports</div>
                  <button
                    type="button"
                    className="mgrcfg-mgr-options-btn"
                    onClick={() => optionsOpen ? setOptionsForManager(null) : openOptions(m)}
                    aria-expanded={optionsOpen}
                  >
                    {cfg ? "Edit options" : "Add options"}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Expandable options panel for selected manager */}
          {optionsForManager && (() => {
            const m = managers.find(x => x.user?.user_id === optionsForManager);
            const cfg = m ? getConfigForManager(m.user?.user_id) : null;
            if (!m) return null;
            return (
              <div className="mgrcfg-options-panel">
                <h3 className="mgrcfg-options-title">Options for {m.user?.name || m.user?.email}</h3>

                <div className="mgrcfg-options-row">
                  <label className="mgrcfg-options-label">Manager level</label>
                  <select
                    className="mgrcfg-options-select"
                    value={optionsForm.manager_level}
                    onChange={e => updateOptionsForm("manager_level", e.target.value)}
                  >
                    {MANAGER_LEVELS.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <span className="mgrcfg-options-hint">L1 = direct reports only, L2 = reports of reports, L3 = department scope</span>
                </div>

                <div className="mgrcfg-options-row">
                  <label className="mgrcfg-options-label">Department scope (L3)</label>
                  <div className="mgrcfg-options-chips">
                    {departments.map(d => (
                      <label key={d} className="mgrcfg-options-chip">
                        <input
                          type="checkbox"
                          checked={optionsForm.department_scope.includes(d)}
                          onChange={() => toggleList("department_scope", d)}
                        />
                        <span>{d}</span>
                      </label>
                    ))}
                    {departments.length === 0 && (
                      <span className="mgrcfg-options-muted">No departments in org yet</span>
                    )}
                  </div>
                </div>

                <div className="mgrcfg-options-row">
                  <label className="mgrcfg-options-label">Allowed data types</label>
                  <div className="mgrcfg-options-chips">
                    {ALLOWED_DATA_TYPES.map(d => (
                      <label key={d} className="mgrcfg-options-chip">
                        <input
                          type="checkbox"
                          checked={optionsForm.allowed_data_types.includes(d)}
                          onChange={() => toggleList("allowed_data_types", d)}
                        />
                        <span>{d}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="mgrcfg-options-row">
                  <label className="mgrcfg-options-label">Allowed features</label>
                  <div className="mgrcfg-options-chips">
                    {ALLOWED_FEATURES.map(({ id, label }) => (
                      <label key={id} className="mgrcfg-options-chip">
                        <input
                          type="checkbox"
                          checked={optionsForm.allowed_features.includes(id)}
                          onChange={() => toggleList("allowed_features", id)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="mgrcfg-options-actions">
                  <button
                    type="button"
                    className="mgrcfg-options-save"
                    onClick={saveManagerOptions}
                    disabled={savingConfig === optionsForManager}
                  >
                    {savingConfig === optionsForManager ? "Saving…" : "Save options"}
                  </button>
                  {cfg && (
                    <button
                      type="button"
                      className="mgrcfg-options-remove"
                      onClick={() => removeManagerConfig(cfg.id)}
                    >
                      Remove options
                    </button>
                  )}
                  <button
                    type="button"
                    className="mgrcfg-options-cancel"
                    onClick={() => setOptionsForManager(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Filters */}
      <div className="mgrcfg-filters">
        <input
          className="mgrcfg-search"
          placeholder="Search employees…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="mgrcfg-filter-tabs">
          {[["all","All"],["unassigned","Unassigned"],["assigned","Assigned"],["managers","Managers"]].map(([v,l]) => (
            <button key={v}
              className={`mgrcfg-filter-tab${filterMgr===v?" mgrcfg-filter-tab--active":""}`}
              onClick={() => setFilterMgr(v)}>
              {l}
              {v === "unassigned" && employees.filter(e=>!e.user?.manager_id&&e.user?.role==="user").length > 0 && (
                <span className="mgrcfg-filter-badge">
                  {employees.filter(e=>!e.user?.manager_id&&e.user?.role==="user").length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Employee table */}
      {loading ? (
        <div className="mgrcfg-loading">Loading employees…</div>
      ) : (
        <div className="mgrcfg-table-wrap">
          <table className="mgrcfg-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Role</th>
                <th>Assigned Manager</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="mgrcfg-empty">No employees found</td></tr>
              )}
              {filtered.map(emp => {
                const uid   = emp.user?.user_id;
                const role  = emp.user?.role || "user";
                const badge = ROLE_BADGE[role] || ROLE_BADGE.user;
                const isBusy = saving === uid;
                const currentMgrId = emp.user?.manager_id;

                return (
                  <tr key={uid} className={isBusy ? "mgrcfg-row--saving" : ""}>
                    {/* Employee */}
                    <td>
                      <div className="mgrcfg-emp-cell">
                        <div className="mgrcfg-emp-av">{initial(emp)}</div>
                        <div>
                          <div className="mgrcfg-emp-name">{emp.user?.name || emp.user?.email}</div>
                          <div className="mgrcfg-emp-email">{emp.user?.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="mgrcfg-dept">
                      {emp.user?.department || emp.profile?.department || "—"}
                    </td>

                    {/* Role badge + toggle */}
                    <td>
                      <div className="mgrcfg-role-cell">
                        <span className="mgrcfg-role-badge" style={{background:badge.bg,color:badge.color}}>
                          {badge.label}
                        </span>
                        {role === "user" ? (
                          <button className="mgrcfg-action-btn mgrcfg-action-btn--promote"
                            onClick={() => setRole(emp, "manager")} disabled={isBusy}>
                            {isBusy ? "…" : "Make Manager"}
                          </button>
                        ) : role === "manager" ? (
                          <button className="mgrcfg-action-btn mgrcfg-action-btn--demote"
                            onClick={() => setRole(emp, "user")} disabled={isBusy}>
                            {isBusy ? "…" : "Remove Manager"}
                          </button>
                        ) : null}
                      </div>
                    </td>

                    {/* Assign manager dropdown */}
                    <td>
                      <select
                        className={`mgrcfg-select${!currentMgrId ? " mgrcfg-select--unset" : ""}`}
                        value={currentMgrId || ""}
                        onChange={e => assignManager(emp, e.target.value || null)}
                        disabled={isBusy || uid === currentMgrId}
                      >
                        <option value="">— Unassigned —</option>
                        {managers
                          .filter(m => m.user?.user_id !== uid) // can't be own manager
                          .map(m => (
                            <option key={m.user?.user_id} value={m.user?.user_id}>
                              {m.user?.name || m.user?.email}
                            </option>
                          ))
                        }
                      </select>
                    </td>

                    {/* Actions */}
                    <td>
                      {currentMgrId && (
                        <button className="mgrcfg-action-btn mgrcfg-action-btn--unassign"
                          onClick={() => assignManager(emp, null)} disabled={isBusy}>
                          {isBusy ? "…" : "Unassign"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
