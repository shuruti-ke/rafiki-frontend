// frontend/src/pages/ManagerTimesheets.jsx
import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./ManagerTimesheets.css";

/* ── brand tokens ── */
const C = {
  purple: "#8b5cf6", teal: "#1fbfb8", blue: "#3b82f6",
  green: "#34d399",  yellow: "#fbbf24", red: "#f87171",
  grad: "linear-gradient(135deg,#8b5cf6 0%,#1fbfb8 100%)",
  text: "#1f2937", muted: "#6b7280", border: "#e5e7eb",
  gray50: "#f9fafb", gray100: "#f3f4f6", gray200: "#e5e7eb", gray900: "#111827",
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
    <span style={{
      background: m.bg, color: m.color, borderRadius: 999,
      padding: "3px 10px", fontSize: 11, fontWeight: 700,
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>
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

/* ── Detail / approval modal ── */
function EntryModal({ entry, onClose, onAction }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const act = async (action) => {
    setBusy(true);
    await onAction(entry.id, action, note);
    setBusy(false);
    onClose();
  };

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

        {/* Employee info */}
        <div className="mts-modal-employee">
          <div className="mts-avatar">
            {(entry.employee_name || entry.user_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{entry.employee_name || entry.user_name || "—"}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{entry.department || "No department"}</div>
          </div>
          <StatusBadge status={entry.status} />
        </div>

        {/* Fields */}
        <div className="mts-modal-fields">
          {[
            ["Date",        entry.date],
            ["Project",     entry.project],
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

        {/* Approve / reject */}
        {entry.status === "submitted" && (
          <>
            <div style={{ marginTop: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".5px" }}>
                Note (optional)
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add a note for the employee…"
                style={{
                  width: "100%", marginTop: 6, padding: "9px 12px",
                  border: `1px solid ${C.border}`, borderRadius: 10,
                  fontSize: 13, color: C.text, resize: "vertical",
                  minHeight: 64, outline: "none", boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
                onFocus={e => e.target.style.borderColor = "rgba(139,92,246,.45)"}
                onBlur={e => e.target.style.borderColor = C.border}
              />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
              <button className="mts-btn mts-btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="mts-btn"
                style={{ background: "rgba(248,113,113,.12)", color: C.red, border: `1px solid rgba(248,113,113,.3)` }}
                onClick={() => act("reject")} disabled={busy}
              >✗ Reject</button>
              <button className="mts-btn mts-btn-primary" onClick={() => act("approve")} disabled={busy}>
                ✓ Approve
              </button>
            </div>
          </>
        )}

        {entry.status !== "submitted" && (
          <div style={{ marginTop: 16, textAlign: "right" }}>
            <button className="mts-btn mts-btn-ghost" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN
════════════════════════════════════════════ */
export default function ManagerTimesheets() {
  const [weekStart,    setWeekStart]    = useState(monday(new Date()));
  const [entries,      setEntries]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterEmp,    setFilterEmp]    = useState("");
  const [selected,     setSelected]     = useState(null);
  const [bulkIds,      setBulkIds]      = useState([]);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${weekStart.toLocaleDateString([], { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;

  const load = async () => {
    setLoading(true);
    try {
      /* Use /admin/all first (hr_admin); fall back to /team for pure managers */
      let res = await authFetch(
        `${API}/api/v1/timesheets/admin/all?start=${fmtDate(weekStart)}&end=${fmtDate(weekEnd)}`
      );
      if (!res.ok) {
        res = await authFetch(
          `${API}/api/v1/timesheets/team?start=${fmtDate(weekStart)}&end=${fmtDate(weekEnd)}`
        );
      }
      if (res.ok) setEntries(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); setBulkIds([]); }, [weekStart.toISOString()]);

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const thisWeek = () => setWeekStart(monday(new Date()));

  const handleAction = async (id, action) => {
    await authFetch(`${API}/api/v1/timesheets/${id}/${action}`, { method: "POST" });
    load();
  };

  const handleBulkApprove = async () => {
    await Promise.all(bulkIds.map(id =>
      authFetch(`${API}/api/v1/timesheets/${id}/approve`, { method: "POST" })
    ));
    setBulkIds([]);
    load();
  };

  /* ── filters ── */
  const filtered = entries.filter(e => {
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (filterEmp && !(e.employee_name || e.user_name || "").toLowerCase().includes(filterEmp.toLowerCase())) return false;
    return true;
  });

  /* ── KPIs ── */
  const totalHours      = entries.reduce((s, e) => s + Number(e.hours), 0);
  const pendingCount    = entries.filter(e => e.status === "submitted").length;
  const approvedCount   = entries.filter(e => e.status === "approved").length;
  const uniqueEmployees = [...new Set(entries.map(e => e.user_id || e.employee_name))].length;

  /* ── checkbox helpers ── */
  const submittedIds = filtered.filter(e => e.status === "submitted").map(e => e.id);
  const allChecked   = submittedIds.length > 0 && submittedIds.every(id => bulkIds.includes(id));
  const toggleAll    = () => allChecked
    ? setBulkIds(bulkIds.filter(id => !submittedIds.includes(id)))
    : setBulkIds([...new Set([...bulkIds, ...submittedIds])]);
  const toggleOne = id => setBulkIds(bulkIds.includes(id) ? bulkIds.filter(x => x !== id) : [...bulkIds, id]);

  /* ── group by employee for the summary view ── */
  const byEmployee = {};
  entries.forEach(e => {
    const name = e.employee_name || e.user_name || e.user_id;
    if (!byEmployee[name]) byEmployee[name] = { name, dept: e.department, hours: 0, submitted: 0, approved: 0, pending: 0 };
    byEmployee[name].hours    += Number(e.hours);
    if (e.status === "submitted") byEmployee[name].pending++;
    if (e.status === "approved")  byEmployee[name].approved++;
    byEmployee[name].submitted++;
  });
  const employeeSummary = Object.values(byEmployee).sort((a, b) => b.pending - a.pending);

  return (
    <div className="mts-page">

      {/* ── Header ── */}
      <div className="mts-header">
        <div>
          <h1 className="mts-title">Team Timesheets</h1>
          <p className="mts-sub">Review and approve your team's timesheet submissions</p>
        </div>
      </div>

      {/* ── Week nav ── */}
      <div className="mts-week-nav">
        <button className="mts-nav-btn" onClick={prevWeek}>‹</button>
        <div className="mts-week-label">{weekLabel}</div>
        <button className="mts-nav-btn" onClick={nextWeek}>›</button>
        <button className="mts-btn mts-btn-ghost" style={{ marginLeft: 8, fontSize: 12 }} onClick={thisWeek}>
          This Week
        </button>
      </div>

      {/* ── KPIs ── */}
      <div className="mts-kpis">
        <KpiCard label="Team Members"      value={uniqueEmployees}             color={C.purple} />
        <KpiCard label="Total Hours"       value={`${totalHours.toFixed(1)}h`} color={C.teal}   />
        <KpiCard label="Awaiting Approval" value={pendingCount}                color={C.yellow} />
        <KpiCard label="Approved"          value={approvedCount}               color={C.green}  />
      </div>

      {/* ── Employee summary strip ── */}
      {employeeSummary.length > 0 && (
        <div className="mts-emp-strip">
          {employeeSummary.map(emp => (
            <div key={emp.name} className="mts-emp-card"
              onClick={() => setFilterEmp(filterEmp === emp.name ? "" : emp.name)}
              style={{ borderColor: filterEmp === emp.name ? C.purple : C.border }}
            >
              <div className="mts-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                {emp.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{emp.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{emp.hours.toFixed(1)}h</div>
              </div>
              {emp.pending > 0 && (
                <span style={{ background: C.yellow, color: "#fff", borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>
                  {emp.pending} pending
                </span>
              )}
              {emp.pending === 0 && emp.approved > 0 && (
                <span style={{ background: "rgba(52,211,153,.15)", color: C.green, borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>
                  ✓ done
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="mts-filters">
        <div className="mts-filter-group">
          {["all", "submitted", "approved", "rejected", "draft"].map(s => (
            <button key={s}
              className={`mts-filter-btn${filterStatus === s ? " mts-filter-btn--active" : ""}`}
              onClick={() => setFilterStatus(s)}
            >
              {s === "all" ? "All" : STATUS_META[s]?.label ?? s}
              {s !== "all" && (
                <span className="mts-filter-count">
                  {entries.filter(e => e.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <input
          className="mts-search"
          placeholder="🔍 Search employee…"
          value={filterEmp}
          onChange={e => setFilterEmp(e.target.value)}
        />
      </div>

      {/* ── Bulk approve bar ── */}
      {bulkIds.length > 0 && (
        <div className="mts-bulk-bar">
          <span style={{ fontSize: 13, color: C.muted }}>
            {bulkIds.length} entr{bulkIds.length !== 1 ? "ies" : "y"} selected
          </span>
          <button className="mts-btn mts-btn-primary" onClick={handleBulkApprove}>
            ✓ Approve Selected
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="mts-table-wrap">
        {loading ? (
          <div className="mts-empty">Loading team timesheets…</div>
        ) : filtered.length === 0 ? (
          <div className="mts-empty">
            {entries.length === 0
              ? "No timesheet entries submitted this week."
              : "No entries match the current filter."}
          </div>
        ) : (
          <table className="mts-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} title="Select all submitted" />
                </th>
                <th>Employee</th>
                <th>Date</th>
                <th>Project</th>
                <th>Category</th>
                <th>Hours</th>
                <th>Status</th>
                <th>Approve</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className="mts-row" onClick={() => setSelected(e)} title="Click for details">
                  <td onClick={ev => ev.stopPropagation()}>
                    {e.status === "submitted" && (
                      <input type="checkbox" checked={bulkIds.includes(e.id)} onChange={() => toggleOne(e.id)} />
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="mts-avatar">
                        {(e.employee_name || e.user_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{e.employee_name || e.user_name || "—"}</div>
                        {e.department && <div style={{ fontSize: 11, color: C.muted }}>{e.department}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: C.muted }}>{e.date}</td>
                  <td style={{ fontSize: 13 }}>{e.project}</td>
                  <td style={{ fontSize: 12, color: C.muted }}>{e.category}</td>
                  <td style={{ fontWeight: 700, fontSize: 13 }}>{Number(e.hours).toFixed(1)}h</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td onClick={ev => ev.stopPropagation()}>
                    {e.status === "submitted" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="mts-action-btn mts-action-btn--approve"
                          onClick={() => handleAction(e.id, "approve")} title="Approve">✓</button>
                        <button className="mts-action-btn mts-action-btn--reject"
                          onClick={() => handleAction(e.id, "reject")} title="Reject">✗</button>
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

      {selected && (
        <EntryModal
          entry={selected}
          onClose={() => setSelected(null)}
          onAction={async (id, action) => { await handleAction(id, action); setSelected(null); }}
        />
      )}
    </div>
  );
}
