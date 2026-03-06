// frontend/src/pages/AdminTimesheets.jsx
import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./AdminTimesheets.css";

/* ── brand tokens ── */
const C = {
  purple: "#8b5cf6", teal: "#1fbfb8", blue: "#3b82f6",
  green: "#34d399",  yellow: "#fbbf24", red: "#f87171",
  grad: "linear-gradient(135deg,#8b5cf6 0%,#1fbfb8 100%)",
  text: "#1f2937", muted: "#6b7280", border: "#e5e7eb",
  bg: "#f8fafc", card: "#ffffff", gray50: "#f9fafb",
  gray100: "#f3f4f6", gray200: "#e5e7eb",
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
      background: m.bg, color: m.color,
      borderRadius: 999, padding: "3px 10px",
      fontSize: 11, fontWeight: 700,
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: m.color, display: "inline-block" }} />
      {m.label}
    </span>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div className="ats-kpi" style={{ "--kc": color }}>
      <div className="ats-kpi-value">{value ?? "—"}</div>
      <div className="ats-kpi-label">{label}</div>
    </div>
  );
}

/* ── CSV export ── */
function exportCSV(entries, weekLabel) {
  const rows = [
    ["Rafiki HR — Timesheet Report", weekLabel],
    [],
    ["Employee", "Department", "Date", "Project", "Category", "Hours", "Status", "Description"],
    ...entries.map(e => [
      e.employee_name || e.user_name || "—",
      e.department || "—",
      e.date, e.project, e.category,
      Number(e.hours).toFixed(1), e.status,
      (e.description || "").replace(/,/g, ";"),
    ]),
  ];
  const csv = rows.map(r => r.map(c => `"${c ?? ""}"`).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: `rafiki-timesheets-${weekLabel.replace(/\s/g, "-")}.csv`,
  });
  a.click();
}

/* ── Entry detail modal ── */
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
    <div className="ats-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ats-modal">
        <div className="ats-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 10, height: 10, borderRadius: 999,
              background: C.grad, boxShadow: "0 0 12px rgba(139,92,246,.4)",
            }} />
            <h2 className="ats-modal-title">Timesheet Entry Detail</h2>
          </div>
          <button className="ats-modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ height: 2, background: C.grad, borderRadius: 99, margin: "14px 0 20px", opacity: .4 }} />

        {/* Employee info */}
        <div className="ats-modal-employee">
          <div className="ats-modal-avatar">
            {(entry.employee_name || entry.user_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{entry.employee_name || entry.user_name || "—"}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{entry.department || "No department"}</div>
          </div>
          <StatusBadge status={entry.status} />
        </div>

        {/* Entry fields */}
        <div className="ats-modal-fields">
          {[
            ["Date",        entry.date],
            ["Project",     entry.project],
            ["Category",    entry.category],
            ["Hours",       `${Number(entry.hours).toFixed(1)}h`],
            ["Description", entry.description || "—"],
          ].map(([k, v]) => (
            <div key={k} className="ats-modal-field">
              <span className="ats-modal-field-label">{k}</span>
              <span className="ats-modal-field-value">{v}</span>
            </div>
          ))}
        </div>

        {/* Admin note */}
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
              <button className="ats-btn ats-btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="ats-btn"
                style={{ background: "rgba(248,113,113,.12)", color: C.red, border: `1px solid rgba(248,113,113,.3)` }}
                onClick={() => act("reject")} disabled={busy}
              >✗ Reject</button>
              <button
                className="ats-btn ats-btn-primary"
                onClick={() => act("approve")} disabled={busy}
              >✓ Approve</button>
            </div>
          </>
        )}

        {entry.status !== "submitted" && (
          <div style={{ marginTop: 16, textAlign: "right" }}>
            <button className="ats-btn ats-btn-ghost" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN — Admin Timesheet Report
════════════════════════════════════════════ */
export default function AdminTimesheets() {
  const [weekStart,    setWeekStart]    = useState(monday(new Date()));
  const [entries,      setEntries]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterEmp,    setFilterEmp]    = useState("");
  const [filterProj,   setFilterProj]   = useState("");
  const [selected,     setSelected]     = useState(null);   // entry open in modal
  const [bulkIds,      setBulkIds]      = useState([]);     // selected for bulk approve

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${weekStart.toLocaleDateString([], { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;

  /* ── load all org timesheets for the week ── */
  const load = async () => {
    setLoading(true);
    try {
      /* Try the admin endpoint first; fall back to the standard one */
      const res = await authFetch(
        `${API}/api/v1/timesheets/admin/all?start=${fmtDate(weekStart)}&end=${fmtDate(weekEnd)}`
      );
      if (res.ok) { setEntries(await res.json()); return; }

      /* fallback: /api/v1/timesheets/?start=...&end=... with all=true */
      const res2 = await authFetch(
        `${API}/api/v1/timesheets/?start=${fmtDate(weekStart)}&end=${fmtDate(weekEnd)}&all=true`
      );
      if (res2.ok) setEntries(await res2.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); setBulkIds([]); }, [weekStart.toISOString()]);

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const thisWeek = () => setWeekStart(monday(new Date()));

  /* ── approve / reject single entry ── */
  const handleAction = async (id, action) => {
    const res = await authFetch(`${API}/api/v1/timesheets/${id}/${action}`, { method: "POST" });
    if (res.ok) load();
  };

  /* ── bulk approve ── */
  const handleBulkApprove = async () => {
    await Promise.all(bulkIds.map(id =>
      authFetch(`${API}/api/v1/timesheets/${id}/approve`, { method: "POST" })
    ));
    setBulkIds([]);
    load();
  };

  /* ── filtered entries ── */
  const filtered = entries.filter(e => {
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (filterEmp  && !(e.employee_name || e.user_name || "").toLowerCase().includes(filterEmp.toLowerCase())) return false;
    if (filterProj && !e.project.toLowerCase().includes(filterProj.toLowerCase())) return false;
    return true;
  });

  /* ── KPIs ── */
  const totalHours     = entries.reduce((s, e) => s + Number(e.hours), 0);
  const submitted      = entries.filter(e => e.status === "submitted").length;
  const approved       = entries.filter(e => e.status === "approved").length;
  const uniqueEmployees = [...new Set(entries.map(e => e.user_id || e.employee_name))].length;
  const uniqueProjects  = [...new Set(entries.map(e => e.project))].length;

  /* ── checkbox helpers ── */
  const submittedIds = filtered.filter(e => e.status === "submitted").map(e => e.id);
  const allChecked   = submittedIds.length > 0 && submittedIds.every(id => bulkIds.includes(id));
  const toggleAll    = () => allChecked
    ? setBulkIds(bulkIds.filter(id => !submittedIds.includes(id)))
    : setBulkIds([...new Set([...bulkIds, ...submittedIds])]);
  const toggleOne = (id) => setBulkIds(bulkIds.includes(id)
    ? bulkIds.filter(x => x !== id)
    : [...bulkIds, id]);

  return (
    <div className="ats-page">

      {/* ── Header ── */}
      <div className="ats-header">
        <div>
          <h1 className="ats-title">Timesheet Report</h1>
          <p className="ats-sub">Organisation-wide timesheet overview — review, approve &amp; export</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="ats-btn ats-btn-ghost" onClick={() => exportCSV(filtered, weekLabel)}>
            ↓ Export CSV
          </button>
          <button className="ats-btn ats-btn-ghost" onClick={() => window.print()}>
            🖨 Print
          </button>
        </div>
      </div>

      {/* ── Week nav ── */}
      <div className="ats-week-nav">
        <button className="ats-nav-btn" onClick={prevWeek}>‹</button>
        <div className="ats-week-label">{weekLabel}</div>
        <button className="ats-nav-btn" onClick={nextWeek}>›</button>
        <button className="ats-btn ats-btn-ghost" style={{ marginLeft: 8, fontSize: 12 }} onClick={thisWeek}>
          This Week
        </button>
      </div>

      {/* ── KPI strip ── */}
      <div className="ats-kpis">
        <KpiCard label="Total Hours"       value={`${totalHours.toFixed(1)}h`} color={C.purple} />
        <KpiCard label="Employees"         value={uniqueEmployees}             color={C.teal}   />
        <KpiCard label="Projects"          value={uniqueProjects}              color={C.blue}   />
        <KpiCard label="Awaiting Approval" value={submitted}                   color={C.yellow} />
        <KpiCard label="Approved"          value={approved}                    color={C.green}  />
      </div>

      {/* ── Filters ── */}
      <div className="ats-filters">
        <div className="ats-filter-group">
          {["all", "draft", "submitted", "approved", "rejected"].map(s => (
            <button key={s}
              className={`ats-filter-btn${filterStatus === s ? " ats-filter-btn--active" : ""}`}
              onClick={() => setFilterStatus(s)}>
              {s === "all" ? "All" : STATUS_META[s]?.label ?? s}
              {s !== "all" && (
                <span className="ats-filter-count">
                  {entries.filter(e => e.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="ats-search"
            placeholder="🔍 Employee…"
            value={filterEmp}
            onChange={e => setFilterEmp(e.target.value)}
          />
          <input
            className="ats-search"
            placeholder="🔍 Project…"
            value={filterProj}
            onChange={e => setFilterProj(e.target.value)}
          />
        </div>
      </div>

      {/* ── Bulk approve bar ── */}
      {bulkIds.length > 0 && (
        <div className="ats-bulk-bar">
          <span style={{ fontSize: 13, color: C.muted }}>
            {bulkIds.length} entr{bulkIds.length !== 1 ? "ies" : "y"} selected
          </span>
          <button className="ats-btn ats-btn-primary" onClick={handleBulkApprove}>
            ✓ Approve Selected
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="ats-table-wrap">
        {loading ? (
          <div className="ats-empty">Loading timesheets…</div>
        ) : filtered.length === 0 ? (
          <div className="ats-empty">No entries found for this week / filter.</div>
        ) : (
          <table className="ats-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll}
                    title="Select all submitted" />
                </th>
                <th>Employee</th>
                <th>Dept</th>
                <th>Date</th>
                <th>Project</th>
                <th>Category</th>
                <th>Hours</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id}
                  className="ats-row"
                  onClick={() => setSelected(e)}
                  title="Click to view details"
                >
                  <td onClick={ev => ev.stopPropagation()}>
                    {e.status === "submitted" && (
                      <input type="checkbox"
                        checked={bulkIds.includes(e.id)}
                        onChange={() => toggleOne(e.id)}
                      />
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="ats-avatar">
                        {(e.employee_name || e.user_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{e.employee_name || e.user_name || "—"}</span>
                    </div>
                  </td>
                  <td>
                    <span className="ats-dept-pill">{e.department || "—"}</span>
                  </td>
                  <td style={{ fontSize: 12, color: C.muted }}>{e.date}</td>
                  <td style={{ fontSize: 13 }}>{e.project}</td>
                  <td style={{ fontSize: 12, color: C.muted }}>{e.category}</td>
                  <td style={{ fontWeight: 700, fontSize: 13 }}>{Number(e.hours).toFixed(1)}h</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td onClick={ev => ev.stopPropagation()}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {e.status === "submitted" && (
                        <>
                          <button
                            className="ats-action-btn ats-action-btn--approve"
                            onClick={() => handleAction(e.id, "approve")}
                            title="Approve"
                          >✓</button>
                          <button
                            className="ats-action-btn ats-action-btn--reject"
                            onClick={() => handleAction(e.id, "reject")}
                            title="Reject"
                          >✗</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Row count ── */}
      {!loading && filtered.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.muted, textAlign: "right" }}>
          Showing {filtered.length} of {entries.length} entries
        </div>
      )}

      {/* ── Detail modal ── */}
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
