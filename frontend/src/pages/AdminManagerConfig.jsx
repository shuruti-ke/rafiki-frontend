import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./AdminManagerConfig.css";

export default function AdminManagerConfig() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(null); // user_id being saved
  const [search, setSearch]       = useState("");
  const [filterMgr, setFilterMgr] = useState("all");
  const [toast, setToast]         = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/api/v1/employees/`);
      if (r.ok) setEmployees(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // All users who are managers or hr_admin
  const managers = employees.filter(e =>
    ["manager","hr_admin","super_admin"].includes(e.user?.role)
  );

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

      {/* Managers overview strip */}
      {managers.length > 0 && (
        <div className="mgrcfg-mgr-strip">
          <div className="mgrcfg-strip-title">Active Managers</div>
          <div className="mgrcfg-mgr-cards">
            {managers.map(m => {
              const reports = employees.filter(e => e.user?.manager_id === m.user?.user_id);
              return (
                <div key={m.user?.user_id} className="mgrcfg-mgr-card">
                  <div className="mgrcfg-mgr-av">{initial(m)}</div>
                  <div className="mgrcfg-mgr-info">
                    <div className="mgrcfg-mgr-name">{m.user?.name || m.user?.email}</div>
                    <div className="mgrcfg-mgr-dept">{m.user?.department || m.profile?.department || "—"}</div>
                  </div>
                  <div className="mgrcfg-mgr-reports">{reports.length} reports</div>
                </div>
              );
            })}
          </div>
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
