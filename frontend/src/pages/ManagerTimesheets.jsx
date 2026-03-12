// frontend/src/pages/ManagerTimesheets.jsx
import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./ManagerTimesheets.css";

const C = {
  purple: "#8b5cf6", teal: "#1fbfb8", blue: "#3b82f6",
  green: "#34d399",  yellow: "#fbbf24", red: "#f87171",
  grad: "linear-gradient(135deg,#8b5cf6 0%,#1fbfb8 100%)",
  text: "#1f2937", muted: "#6b7280", border: "#e5e7eb",
};

function fmtDate(d) { return new Date(d).toISOString().slice(0, 10); }
function monday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - day + (day === 0 ? -6 : 1));
  return dt;
}

const STATUS_META = {
  draft:     { label: "Draft",     bg: "rgba(148,163,184,.15)", color: "#94a3b8" },
  submitted: { label: "Submitted", bg: "rgba(59,130,246,.12)",  color: "#3b82f6" },
  approved:  { label: "Approved",  bg: "rgba(52,211,153,.12)",  color: "#34d399" },
  rejected:  { label: "Rejected",  bg: "rgba(248,113,113,.12)", color: "#f87171" },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.draft;
  return (
    <span style={{ background: m.bg, color: m.color, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: m.color, display: "inline-block" }} />
      {m.label}
    </span>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div className="mts-kpi" style={{ "--kc": color }}>
      <div className="mts-kpi-value">{value ?? "—"}</div>
      <div className="mts-kpi-label">{label}</div>
    </div>
  );
}

function AnomalyBadge({ flags }) {
  if (!flags || flags.length === 0) return null;
  const high = flags.some(f => f.severity === "high");
  return (
    <span title={flags.map(f => f.message).join(" | ")} style={{
      background: high ? "rgba(248,113,113,.15)" : "rgba(251,191,36,.15)",
      color: high ? C.red : C.yellow,
      borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700, cursor: "help", marginLeft: 4,
    }}>⚠ {high ? "High" : "Medium"}</span>
  );
}

/* ── Entry modal ── */
function EntryModal({ entry, anomalyFlags, onClose, onAction }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (action) => { setBusy(true); await onAction(entry.id, action, note); setBusy(false); onClose(); };
  return (
    <div className="mts-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mts-modal">
        <div className="mts-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: C.grad, boxShadow: "0 0 12px rgba(139,92,246,.4)" }} />
            <h2 className="mts-modal-title">Timesheet Entry</h2>
          </div>
          <button className="mts-modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ height: 2, background: C.grad, borderRadius: 99, margin: "14px 0 20px", opacity: .4 }} />

        {anomalyFlags && anomalyFlags.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {anomalyFlags.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 12px", borderRadius: 10, background: f.severity === "high" ? "rgba(248,113,113,.1)" : "rgba(251,191,36,.1)", border: `1px solid ${f.severity === "high" ? "rgba(248,113,113,.25)" : "rgba(251,191,36,.25)"}`, marginBottom: 6, fontSize: 12, color: f.severity === "high" ? C.red : C.yellow }}>
                <span style={{ flexShrink: 0 }}>{f.severity === "high" ? "🔴" : "🟡"}</span>
                <span>{f.message}</span>
              </div>
            ))}
          </div>
        )}

        {entry.is_leave && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.2)", borderRadius: 10, marginBottom: 14, fontSize: 12, color: C.green }}>
            🌴 Auto-generated from approved leave — read only
          </div>
        )}

        <div className="mts-modal-employee">
          <div className="mts-avatar">{(entry.employee_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2)}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{entry.employee_name || "—"}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{entry.department || "No department"}</div>
          </div>
          <StatusBadge status={entry.status} />
        </div>

        <div className="mts-modal-fields">
          {[
            ["Date",        entry.date],
            ["Activity",    entry.project],
            ["Type",        entry.activity_type === "organisational" ? "Organisational" : "Project Work"],
            ["Category",    entry.category],
            ["Hours",       `${Number(entry.hours).toFixed(1)}h`],
            ["Description", entry.description || "—"],
          ].map(([k, v]) => (
            <div key={k} className="mts-modal-field">
              <span style={{ color: C.muted, fontSize: 13 }}>{k}</span>
              <span style={{ fontWeight: 600, fontSize: 13, color: C.text, textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>

        {entry.status === "submitted" && !entry.is_leave && (
          <>
            <div style={{ marginTop: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".5px" }}>Note (optional)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note for the employee…"
                style={{ width: "100%", marginTop: 6, padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, color: C.text, resize: "vertical", minHeight: 64, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
              <button className="mts-btn mts-btn-ghost" onClick={onClose}>Cancel</button>
              <button className="mts-btn" style={{ background: "rgba(248,113,113,.12)", color: C.red, border: "1px solid rgba(248,113,113,.3)" }} onClick={() => act("reject")} disabled={busy}>✗ Reject</button>
              <button className="mts-btn mts-btn-primary" onClick={() => act("approve")} disabled={busy}>✓ Approve</button>
            </div>
          </>
        )}
        {(entry.status !== "submitted" || entry.is_leave) && (
          <div style={{ marginTop: 16, textAlign: "right" }}>
            <button className="mts-btn mts-btn-ghost" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Deputy modal ── */
function DeputyModal({ onClose }) {
  const [members, setMembers]           = useState([]);
  const [deputyId, setDeputyId]         = useState("");
  const [days, setDays]                 = useState(3);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);

  useEffect(() => {
    authFetch(`${API}/api/v1/timesheets/deputy`).then(r => r.json()).then(d => {
      if (d.deputy_manager_id) setDeputyId(d.deputy_manager_id);
      if (d.approval_escalation_days) setDays(d.approval_escalation_days);
    }).catch(() => {});
    authFetch(`${API}/api/v1/employees/`).then(r => r.json()).then(d => {
      setMembers(Array.isArray(d) ? d : (d.employees || []));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    const p = new URLSearchParams({ escalation_days: days });
    if (deputyId) p.set("deputy_id", deputyId);
    await authFetch(`${API}/api/v1/timesheets/deputy?${p}`, { method: "POST" });
    setSaving(false); setSaved(true);
    setTimeout(onClose, 900);
  };

  return (
    <div className="mts-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mts-modal" style={{ maxWidth: 440 }}>
        <div className="mts-modal-head">
          <h2 className="mts-modal-title">Approval Delegation</h2>
          <button className="mts-modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ height: 2, background: C.grad, borderRadius: 99, margin: "14px 0 20px", opacity: .4 }} />
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 1.6 }}>
          When you're unavailable, submitted timesheets will escalate to your deputy after the threshold below.
        </p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".5px", display: "block", marginBottom: 6 }}>Deputy Manager</label>
          {loading ? <div style={{ fontSize: 13, color: C.muted }}>Loading…</div> : (
            <select value={deputyId} onChange={e => setDeputyId(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, outline: "none", background: "#fff" }}>
              <option value="">— None (escalate to HR admin) —</option>
              {members.map(m => <option key={m.user_id || m.id} value={m.user_id || m.id}>{m.name || m.email}</option>)}
            </select>
          )}
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".5px", display: "block", marginBottom: 6 }}>
            Escalate after <strong style={{ color: C.purple }}>{days} day{days !== 1 ? "s" : ""}</strong>
          </label>
          <input type="range" min={1} max={14} value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: "100%", accentColor: C.purple }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginTop: 4 }}><span>1 day</span><span>14 days</span></div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="mts-btn mts-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="mts-btn mts-btn-primary" onClick={save} disabled={saving || saved}>
            {saved ? "✓ Saved" : saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Overdue banner ── */
function OverdueBanner({ entries, onDismiss }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.25)", borderRadius: 12, marginBottom: 14 }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>⏰</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: C.red }}>{entries.length} overdue approval{entries.length !== 1 ? "s" : ""}</span>
        <span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>
          {entries[0] && `${entries[0].employee_name} has been waiting ${entries[0].days_waiting} day${entries[0].days_waiting !== 1 ? "s" : ""}`}
          {entries.length > 1 && ` + ${entries.length - 1} more`}
        </span>
      </div>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 16, padding: 4 }}>✕</button>
    </div>
  );
}

/* ══════════════════════════════════════════ MAIN ══════════════════════════════════════════ */
export default function ManagerTimesheets() {
  const [weekStart,         setWeekStart]         = useState(monday(new Date()));
  const [entries,           setEntries]           = useState([]);
  const [anomalies,         setAnomalies]         = useState({});
  const [overdueEntries,    setOverdueEntries]    = useState([]);
  const [loading,           setLoading]           = useState(false);
  const [filterStatus,      setFilterStatus]      = useState("all");
  const [filterEmp,         setFilterEmp]         = useState("");
  const [selected,          setSelected]          = useState(null);
  const [bulkIds,           setBulkIds]           = useState([]);
  const [showDeputy,        setShowDeputy]        = useState(false);
  const [overdueDismissed,  setOverdueDismissed]  = useState(false);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${weekStart.toLocaleDateString([], { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;

  const load = async () => {
    setLoading(true);
    try {
      let res = await authFetch(`${API}/api/v1/timesheets/admin/all?start=${fmtDate(weekStart)}&end=${fmtDate(weekEnd)}`);
      if (!res.ok) res = await authFetch(`${API}/api/v1/timesheets/team?start=${fmtDate(weekStart)}&end=${fmtDate(weekEnd)}`);
      if (res.ok) setEntries(await res.json());
    } finally { setLoading(false); }
  };

  const loadAnomalies = async () => {
    try {
      const res = await authFetch(`${API}/api/v1/timesheets/admin/anomalies?week_start=${fmtDate(weekStart)}`);
      if (res.ok) {
        const data = await res.json();
        const map = {};
        (data.anomalies || []).forEach(a => { map[a.user_id] = a.flags; });
        setAnomalies(map);
      }
    } catch (_) {}
  };

  const loadOverdue = async () => {
    try {
      const res = await authFetch(`${API}/api/v1/timesheets/admin/overdue-approvals`);
      if (res.ok) { const d = await res.json(); setOverdueEntries(d.entries || []); }
    } catch (_) {}
  };

  useEffect(() => {
    load(); loadAnomalies(); loadOverdue();
    setBulkIds([]); setOverdueDismissed(false);
  }, [weekStart.toISOString()]);

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const thisWeek = () => setWeekStart(monday(new Date()));

  const handleAction = async (id, action) => {
    await authFetch(`${API}/api/v1/timesheets/${id}/${action}`, { method: "POST" });
    load(); loadOverdue();
  };

  const handleBulkApprove = async () => {
    await Promise.all(bulkIds.map(id => authFetch(`${API}/api/v1/timesheets/${id}/approve`, { method: "POST" })));
    setBulkIds([]); load(); loadOverdue();
  };

  const filtered = entries.filter(e => {
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (filterEmp && !(e.employee_name || "").toLowerCase().includes(filterEmp.toLowerCase())) return false;
    return true;
  });

  const totalHours      = entries.filter(e => !e.is_leave).reduce((s, e) => s + Number(e.hours), 0);
  const pendingCount    = entries.filter(e => e.status === "submitted").length;
  const approvedCount   = entries.filter(e => e.status === "approved").length;
  const uniqueEmployees = [...new Set(entries.map(e => e.user_id))].length;
  const anomalyCount    = Object.keys(anomalies).length;

  const byEmployee = {};
  entries.forEach(e => {
    const name = e.employee_name || e.user_id;
    if (!byEmployee[name]) byEmployee[name] = { name, user_id: e.user_id, hours: 0, pending: 0, approved: 0 };
    if (!e.is_leave) byEmployee[name].hours += Number(e.hours);
    if (e.status === "submitted") byEmployee[name].pending++;
    if (e.status === "approved")  byEmployee[name].approved++;
  });
  const employeeSummary = Object.values(byEmployee).sort((a, b) => b.pending - a.pending);

  const submittedIds = filtered.filter(e => e.status === "submitted" && !e.is_leave).map(e => e.id);
  const allChecked   = submittedIds.length > 0 && submittedIds.every(id => bulkIds.includes(id));
  const toggleAll    = () => allChecked ? setBulkIds(bulkIds.filter(id => !submittedIds.includes(id))) : setBulkIds([...new Set([...bulkIds, ...submittedIds])]);
  const toggleOne    = id => setBulkIds(bulkIds.includes(id) ? bulkIds.filter(x => x !== id) : [...bulkIds, id]);

  return (
    <div className="mts-page">
      <div className="mts-header">
        <div>
          <h1 className="mts-title">Team Timesheets</h1>
          <p className="mts-sub">Review and approve your team's timesheet submissions</p>
        </div>
        <button className="mts-btn mts-btn-ghost" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }} onClick={() => setShowDeputy(true)}>
          👤 Delegation Settings
        </button>
      </div>

      {!overdueDismissed && <OverdueBanner entries={overdueEntries} onDismiss={() => setOverdueDismissed(true)} />}

      {anomalyCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", background: "rgba(251,191,36,.07)", border: "1px solid rgba(251,191,36,.22)", borderRadius: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ fontSize: 13, color: C.yellow, fontWeight: 700 }}>{anomalyCount} employee{anomalyCount !== 1 ? "s" : ""} with unusual hours this week</span>
          <span style={{ fontSize: 12, color: C.muted, marginLeft: 4 }}>— hover the ⚠ badge in the table for details</span>
        </div>
      )}

      <div className="mts-week-nav">
        <button className="mts-nav-btn" onClick={prevWeek}>‹</button>
        <div className="mts-week-label">{weekLabel}</div>
        <button className="mts-nav-btn" onClick={nextWeek}>›</button>
        <button className="mts-btn mts-btn-ghost" style={{ marginLeft: 8, fontSize: 12 }} onClick={thisWeek}>This Week</button>
      </div>

      <div className="mts-kpis">
        <KpiCard label="Team Members"      value={uniqueEmployees}             color={C.purple} />
        <KpiCard label="Hours Logged"      value={`${totalHours.toFixed(1)}h`} color={C.teal}   />
        <KpiCard label="Awaiting Approval" value={pendingCount}                color={C.yellow} />
        <KpiCard label="Approved"          value={approvedCount}               color={C.green}  />
        <KpiCard label="Anomalies"         value={anomalyCount}                color={anomalyCount > 0 ? C.red : C.muted} />
      </div>

      {employeeSummary.length > 0 && (
        <div className="mts-emp-strip">
          {employeeSummary.map(emp => {
            const hasAnomaly = !!anomalies[emp.user_id];
            return (
              <div key={emp.name} className="mts-emp-card"
                onClick={() => setFilterEmp(filterEmp === emp.name ? "" : emp.name)}
                style={{ borderColor: filterEmp === emp.name ? C.purple : hasAnomaly ? "rgba(251,191,36,.4)" : C.border }}>
                <div className="mts-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{emp.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{emp.name}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{emp.hours.toFixed(1)}h</div>
                </div>
                {hasAnomaly && <span title={anomalies[emp.user_id]?.[0]?.message} style={{ fontSize: 13 }}>⚠️</span>}
                {emp.pending > 0 && <span style={{ background: C.yellow, color: "#fff", borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{emp.pending}</span>}
                {emp.pending === 0 && emp.approved > 0 && <span style={{ background: "rgba(52,211,153,.15)", color: C.green, borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>✓</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="mts-filters">
        <div className="mts-filter-group">
          {["all", "submitted", "approved", "rejected", "draft"].map(s => (
            <button key={s} className={`mts-filter-btn${filterStatus === s ? " mts-filter-btn--active" : ""}`} onClick={() => setFilterStatus(s)}>
              {s === "all" ? "All" : STATUS_META[s]?.label ?? s}
              {s !== "all" && <span className="mts-filter-count">{entries.filter(e => e.status === s).length}</span>}
            </button>
          ))}
        </div>
        <input className="mts-search" placeholder="🔍 Search employee…" value={filterEmp} onChange={e => setFilterEmp(e.target.value)} />
      </div>

      {bulkIds.length > 0 && (
        <div className="mts-bulk-bar">
          <span style={{ fontSize: 13, color: C.muted }}>{bulkIds.length} entr{bulkIds.length !== 1 ? "ies" : "y"} selected</span>
          <button className="mts-btn mts-btn-primary" onClick={handleBulkApprove}>✓ Approve Selected</button>
        </div>
      )}

      <div className="mts-table-wrap">
        {loading ? (
          <div className="mts-empty">Loading team timesheets…</div>
        ) : filtered.length === 0 ? (
          <div className="mts-empty">{entries.length === 0 ? "No entries this week." : "No entries match the filter."}</div>
        ) : (
          <table className="mts-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                <th>Employee</th>
                <th>Date</th>
                <th>Activity</th>
                <th>Hours</th>
                <th>Status</th>
                <th>Approve</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className="mts-row" onClick={() => setSelected(e)}>
                  <td onClick={ev => ev.stopPropagation()}>
                    {e.status === "submitted" && !e.is_leave && (
                      <input type="checkbox" checked={bulkIds.includes(e.id)} onChange={() => toggleOne(e.id)} />
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="mts-avatar">{(e.employee_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2)}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center" }}>
                          {e.employee_name || "—"}
                          {anomalies[e.user_id] && <AnomalyBadge flags={anomalies[e.user_id]} />}
                        </div>
                        {e.department && <div style={{ fontSize: 11, color: C.muted }}>{e.department}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: C.muted }}>{e.date}</td>
                  <td style={{ fontSize: 13 }}>{e.is_leave ? <span>🌴 {e.project}</span> : e.project}</td>
                  <td style={{ fontWeight: 700, fontSize: 13 }}>{Number(e.hours).toFixed(1)}h</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td onClick={ev => ev.stopPropagation()}>
                    {e.status === "submitted" && !e.is_leave && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="mts-action-btn mts-action-btn--approve" onClick={() => handleAction(e.id, "approve")}>✓</button>
                        <button className="mts-action-btn mts-action-btn--reject"  onClick={() => handleAction(e.id, "reject")}>✗</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.muted, textAlign: "right" }}>
          Showing {filtered.length} of {entries.length} entries
        </div>
      )}

      {selected && <EntryModal entry={selected} anomalyFlags={anomalies[selected.user_id]} onClose={() => setSelected(null)} onAction={async (id, action) => { await handleAction(id, action); setSelected(null); }} />}
      {showDeputy && <DeputyModal onClose={() => setShowDeputy(false)} />}
    </div>
  );
}
