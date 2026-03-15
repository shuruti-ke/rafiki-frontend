import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { API, authFetch } from "../api.js";
import {
  BarChart as RechartBar, Bar, Cell,
  PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import "./AdminDashboard.css";

/* ─────────────────────────────────────────────────────
   Brand colours — mirrors App.css :root exactly
───────────────────────────────────────────────────── */
const C = {
  purple: "#8b5cf6",
  teal:   "#1fbfb8",
  blue:   "#3b82f6",
  green:  "#34d399",
  yellow: "#fbbf24",
  red:    "#f87171",
  grad:   "linear-gradient(135deg,#8b5cf6 0%,#1fbfb8 100%)",
  text:   "#1f2937",
  muted:  "#6b7280",
  border: "#e5e7eb",
  gray50: "#f9fafb",
  gray100:"#f3f4f6",
  gray200:"#e5e7eb",
};

const STATUS_COLORS = {
  draft:       "#94a3b8",
  active:      C.purple,
  in_progress: C.blue,
  completed:   C.green,
  on_track:    C.green,
  at_risk:     C.yellow,
  behind:      C.red,
  cancelled:   "#6b7280",
};

const QUICK_LINKS = [
  { to: "/admin/knowledge-base", icon: "📚", title: "Knowledge Base",  desc: "Upload and manage organization documents."   },
  { to: "/admin/announcements",  icon: "📣", title: "Announcements",   desc: "Broadcast updates and track read receipts." },
  { to: "/admin/employees",      icon: "👤", title: "Employees",       desc: "Manage employee profiles and records."      },
  { to: "/admin/guided-paths",   icon: "🧭", title: "Guided Paths",    desc: "Create guided wellbeing modules."           },
  { to: "/admin/org-config",     icon: "⚙️", title: "Org Config",      desc: "Configure organisation context."           },
  { to: "/admin/managers",       icon: "🛡️", title: "Managers",        desc: "Assign manager roles and access."          },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const TODAY_LABEL = new Date().toLocaleDateString("en-GB", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
});

/* ─────────────────────────────────────────────────────
   ORIGINAL BarChart — unchanged logic, unchanged markup
───────────────────────────────────────────────────── */
function BarChart({ data, color }) {
  const max = Math.max(...Object.values(data), 1);
  return Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => (
      <div className="adash-bar-row" key={label}>
        <span className="adash-bar-label" title={label}>{label}</span>
        <div className="adash-bar-track">
          <div
            className="adash-bar-fill"
            style={{ width: `${(value / max) * 100}%`, background: color || "var(--accent)" }}
          />
        </div>
        <span className="adash-bar-value">
          {typeof value === "number" && value % 1 ? value.toFixed(1) : value}
        </span>
      </div>
    ));
}

/* ─────────────────────────────────────────────────────
   ORIGINAL SegmentedBar — unchanged
───────────────────────────────────────────────────── */
function SegmentedBar({ data, colorMap }) {
  const total = Object.values(data).reduce((s, v) => s + v, 0) || 1;
  return (
    <>
      <div className="adash-seg">
        {Object.entries(data).map(([k, v]) => (
          <div
            key={k}
            className="adash-seg-part"
            style={{ width: `${(v / total) * 100}%`, background: colorMap[k] || "#94a3b8" }}
          />
        ))}
      </div>
      <div className="adash-seg-legend">
        {Object.entries(data).map(([k, v]) => (
          <span key={k} className="adash-seg-item">
            <span className="adash-seg-dot" style={{ background: colorMap[k] || "#94a3b8" }} />
            {k} ({v})
          </span>
        ))}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────
   HOURS BY PROJECT  — original BarChart + Analytics btn
───────────────────────────────────────────────────── */
function HoursByProject({ data, onAnalytics }) {
  const max = Math.max(...Object.values(data), 1);
  return (
    <>
      {/* Title row with button */}
      <div className="adash-chart-title">
        Hours by Project
        <button className="adash-analytics-btn" onClick={onAnalytics}>
          ↗ Visual Analytics
        </button>
      </div>

      {/* Original bar rows — same markup as BarChart */}
      {Object.entries(data)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => (
          <div className="adash-bar-row" key={label}>
            <span className="adash-bar-label" title={label}>{label}</span>
            <div className="adash-bar-track">
              <div
                className="adash-bar-fill"
                style={{
                  width: `${(value / max) * 100}%`,
                  background: C.grad,
                }}
              />
            </div>
            <span className="adash-bar-value">
              {typeof value === "number" && value % 1 ? value.toFixed(1) : value}
            </span>
          </div>
        ))}

      {/* Pill chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {Object.entries(data)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([project, hours]) => (
            <span key={project} className="adash-chip">
              <span style={{
                width: 7, height: 7, borderRadius: 99, flexShrink: 0,
                display: "inline-block", background: C.grad,
              }} />
              <strong>{project}</strong>
              <span>{hours}h</span>
            </span>
          ))}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────
   CHART TOOLTIP (used inside modal)
───────────────────────────────────────────────────── */
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#111827", color: "#fff",
      padding: "9px 13px", borderRadius: 10,
      fontSize: 12, boxShadow: "0 8px 28px rgba(139,92,246,.18)",
      border: "1px solid rgba(139,92,246,.22)",
    }}>
      <div style={{ fontWeight: 800, marginBottom: 5, color: "#a78bfa" }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: p.color, display: "inline-block" }} />
          <span style={{ color: "#d1d5db" }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   ANALYTICS MODAL
───────────────────────────────────────────────────── */
function AnalyticsModal({ projectData, onClose }) {
  const [tab, setTab] = useState("overview");

  const entries    = Object.entries(projectData || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const totalHours = entries.reduce((s, [, v]) => s + v, 0);
  const avg        = totalHours / (entries.length || 1);
  const barData    = entries.map(([project, hours]) => ({ project, hours, avg: Math.round(avg) }));

  const PIE_COLORS = [C.purple, C.teal, C.blue, C.yellow, C.green, C.red, "#a78bfa", "#f97316"];

  const tabs = [
    { id: "overview", label: "Overview"       },
    { id: "compare",  label: "vs Average"     },
    { id: "dist",     label: "Distribution"   },
  ];

  return (
    <div
      className="adash-modal-backdrop"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="adash-modal">

        {/* Header */}
        <div className="adash-modal-header">
          <div>
            <div className="adash-modal-title">
              <div className="adash-logo-dot" />
              <h2>Hours by Project — Analytics</h2>
            </div>
            <p className="adash-modal-sub">
              {entries.length} projects · {totalHours.toLocaleString()} total hours · {Math.round(avg)}h average
            </p>
          </div>
          <button className="adash-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="adash-modal-rule" />

        {/* Tabs */}
        <div className="adash-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`adash-tab${tab === t.id ? " adash-tab--active" : ""}`}
            >{t.label}</button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <>
            <div className="adash-modal-kpis">
              {[
                { label: "Total Hours",     value: totalHours.toLocaleString(), color: C.purple },
                { label: "Avg per Project", value: `${Math.round(avg)}h`,       color: C.teal   },
                { label: "Top Project",     value: entries[0]?.[0] ?? "—",      color: C.blue   },
              ].map(({ label, value, color }) => (
                <div key={label} className="adash-modal-kpi" style={{ "--mkpi-color": color }}>
                  <div className="adash-modal-kpi-label">{label}</div>
                  <div className="adash-modal-kpi-value">{value}</div>
                </div>
              ))}
            </div>

            <p className="adash-modal-section-label">Hours logged by project</p>
            <ResponsiveContainer width="100%" height={210}>
              <RechartBar data={barData} barSize={28}>
                <defs>
                  <linearGradient id="mg1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={C.purple} />
                    <stop offset="100%" stopColor={C.teal}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="project" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="hours" name="Hours" fill="url(#mg1)" radius={[5,5,0,0]} />
              </RechartBar>
            </ResponsiveContainer>
          </>
        )}

        {/* ── VS AVERAGE ── */}
        {tab === "compare" && (
          <>
            <p className="adash-modal-section-label">
              Each project vs team average ({Math.round(avg)}h)
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <RechartBar data={barData} barGap={4} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="project" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="hours" name="Actual" radius={[5,5,0,0]}>
                  {barData.map((e, i) => (
                    <Cell key={i} fill={e.hours >= avg ? C.purple : C.teal} />
                  ))}
                </Bar>
                <Bar dataKey="avg" name="Average" fill={C.gray200} radius={[5,5,0,0]} />
              </RechartBar>
            </ResponsiveContainer>

            <div className="adash-proj-cards">
              {barData.map(({ project, hours }) => {
                const above = hours >= avg;
                const diff  = Math.abs(hours - Math.round(avg));
                return (
                  <div key={project} className="adash-proj-card"
                    style={{ "--pc-color": above ? C.purple : C.teal }}>
                    <div className="adash-proj-card-name">{project}</div>
                    <div className="adash-proj-card-hours">{hours}h</div>
                    <div className="adash-proj-card-diff"
                      style={{ color: above ? C.purple : C.teal }}>
                      {above ? `↑ +${diff}h above` : `↓ ${diff}h below`} avg
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── DISTRIBUTION ── */}
        {tab === "dist" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
            <div>
              <p className="adash-modal-section-label">Share of total hours</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={entries.map(([name, value]) => ({ name, value }))}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={88}
                    dataKey="value" nameKey="name" paddingAngle={3}
                  >
                    {entries.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => [`${v}h`, ""]} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
              {entries.map(([name, value], i) => {
                const pct = Math.round((value / totalHours) * 100);
                return (
                  <div key={name} className="adash-dist-row">
                    <div className="adash-dist-row-head">
                      <div className="adash-dist-row-name">
                        <span style={{
                          width: 9, height: 9, borderRadius: 3,
                          background: PIE_COLORS[i % PIE_COLORS.length],
                          display: "inline-block",
                        }} />
                        {name}
                      </div>
                      <span className="adash-dist-row-meta">{value}h · {pct}%</span>
                    </div>
                    <div className="adash-dist-track">
                      <div className="adash-dist-fill" style={{
                        width: `${pct}%`,
                        background: PIE_COLORS[i % PIE_COLORS.length],
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   MAIN — identical to original, analytics bolt-on only
───────────────────────────────────────────────────── */
export default function AdminDashboard() {
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [widgets,       setWidgets]       = useState([]);

  useEffect(() => {
    Promise.allSettled([
      authFetch(`${API}/api/v1/employees/analytics`).then(r => r.ok ? r.json() : null),
      authFetch(`${API}/api/v1/employees/`).then(r => r.ok ? r.json() : []),
      authFetch(`${API}/api/v1/custom-reports/`).then(r => r.ok ? r.json() : { reports: [] }),
    ]).then(([analyticsR, empListR]) => {
      const analytics = analyticsR.status === "fulfilled" ? analyticsR.value : null;
      const empList   = empListR.status   === "fulfilled" ? empListR.value   : [];
      const empCount  = Array.isArray(empList) ? empList.length : (empList?.total ?? null);
      setData({ ...analytics, _empCount: empCount });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    authFetch(`${API}/api/v1/custom-reports/`)
      .then(r => r.ok ? r.json() : { reports: [] })
      .then(async (payload) => {
        const reports = (payload.reports || []).filter((report) => report.config?.dashboard_widget).slice(0, 3);
        const results = await Promise.all(
          reports.map(async (report) => {
            const res = await authFetch(`${API}/api/v1/custom-reports/run`, {
              method: "POST",
              body: JSON.stringify({ saved_report_id: report.id }),
            });
            return res.ok ? { report, result: await res.json() } : null;
          })
        );
        setWidgets(results.filter(Boolean));
      })
      .catch(() => setWidgets([]));
  }, []);

  if (loading) return <div className="adash-loading">Loading analytics...</div>;

  const emp   = data?.employees;
  const ts    = data?.timesheets;
  const obj   = data?.objectives;
  const docs  = data?.documents;
  const ann   = data?.announcements;
  const tsSub = data?.timesheet_submissions;

  return (
    <div className="adash-wrap">

      {/* ── HEADER ── */}
      <div className="adash-header">
        <div className="adash-header-left">
          <h1>{greeting()}, Admin</h1>
          <p>Organization overview and quick analytics.</p>
        </div>
        <div className="adash-header-date">📅 {TODAY_LABEL}</div>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="adash-kpis">
        <div className="adash-kpi" style={{ "--kpi-color": "#8b5cf6" }}>
          <div className="adash-kpi-icon">👥</div>
          <div className="adash-kpi-value">{emp?.total ?? data?._empCount ?? "—"}</div>
          <div className="adash-kpi-label">Total Employees</div>
        </div>
        <div className="adash-kpi" style={{ "--kpi-color": "#3b82f6" }}>
          <div className="adash-kpi-icon">🎯</div>
          <div className="adash-kpi-value">{obj?.total ?? "—"}</div>
          <div className="adash-kpi-label">Active Objectives</div>
        </div>
        <div className="adash-kpi" style={{ "--kpi-color": "#34d399" }}>
          <div className="adash-kpi-icon">⏱️</div>
          <div className="adash-kpi-value">{ts?.total_hours_30d ?? "—"}</div>
          <div className="adash-kpi-label">Hours Logged (30d)</div>
        </div>
        <div className="adash-kpi" style={{ "--kpi-color": "#fbbf24" }}>
          <div className="adash-kpi-icon">📄</div>
          <div className="adash-kpi-value">{docs?.kb_doc_count ?? "—"}</div>
          <div className="adash-kpi-label">KB Documents</div>
        </div>
        <div className="adash-kpi" style={{ "--kpi-color": "#f87171" }}>
          <div className="adash-kpi-icon">📣</div>
          <div className="adash-kpi-value">{ann?.total ?? "—"}</div>
          <div className="adash-kpi-label">Announcements</div>
        </div>
      </div>

      {/* ── CHARTS ── */}
      {(emp?.by_department || obj?.by_status || ts?.by_category || ts?.by_project) && (
        <>
          <div className="adash-section-head">
            <h2>📊 Analytics</h2>
            <Link to="/admin/reports" className="adash-section-link">View reports →</Link>
          </div>
          <div className="adash-charts">
            {emp?.by_department && Object.keys(emp.by_department).length > 0 && (
              <div className="adash-chart">
                <div className="adash-chart-title">👥 Employees by Department</div>
                <BarChart data={emp.by_department} color="#8b5cf6" />
              </div>
            )}

            {obj?.by_status && Object.keys(obj.by_status).length > 0 && (
              <div className="adash-chart">
                <div className="adash-chart-title">🎯 Objectives by Status</div>
                <SegmentedBar data={obj.by_status} colorMap={STATUS_COLORS} />
              </div>
            )}

            {ts?.by_category && Object.keys(ts.by_category).length > 0 && (
              <div className="adash-chart">
                <div className="adash-chart-title">📂 Time Allocation by Category</div>
                <BarChart data={ts.by_category} color="#3b82f6" />
              </div>
            )}

            {ts?.by_project && Object.keys(ts.by_project).length > 0 && (
              <div className="adash-chart adash-chart--full">
                <HoursByProject
                  data={ts.by_project}
                  onAnalytics={() => setShowAnalytics(true)}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── TIMESHEET SUBMISSIONS ── */}
      {tsSub && (
        <div className="adash-charts" style={{ marginTop: 0 }}>
          <div className="adash-chart adash-chart--full">
            <div className="adash-chart-title">
              🗒️ Timesheet Submissions (This Week)
              <span style={{ fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
                {tsSub.submitted_count} submitted · {tsSub.not_submitted_count} pending
              </span>
            </div>

            {/* Progress bar */}
            {tsSub.submitted_count != null && tsSub.not_submitted_count != null && (() => {
              const pct = Math.round(
                (tsSub.submitted_count / (tsSub.submitted_count + tsSub.not_submitted_count)) * 100
              );
              return (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                    <span>{pct}% submitted</span>
                    <span>{tsSub.submitted_count + tsSub.not_submitted_count} total</span>
                  </div>
                  <div className="adash-progress-track">
                    <div className="adash-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })()}

            {tsSub.staff && tsSub.staff.length > 0 && (
              <div style={{ display: "grid", gap: 4, maxHeight: 260, overflowY: "auto" }}>
                {tsSub.staff
                  .sort((a, b) => a.submitted - b.submitted)
                  .map(s => (
                    <div
                      key={s.user_id}
                      className={`adash-ts-row adash-ts-row--${s.submitted ? "ok" : "nok"}`}
                    >
                      <span style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                        <span className={`adash-ts-badge adash-ts-badge--${s.submitted ? "ok" : "nok"}`}>
                          {s.submitted ? "✓" : "✗"}
                        </span>
                        {s.name}
                        {s.department && (
                          <span className="adash-dept-pill">{s.department}</span>
                        )}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                        {s.hours_this_week}h
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {widgets.length > 0 && (
        <div className="adash-charts" style={{ marginTop: 0 }}>
          {widgets.map(({ report, result }) => (
            <div key={report.id} className="adash-chart">
              <div className="adash-chart-title">{report.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                {(result.rows || []).length} row(s) · {report.config?.dataset || "custom"}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {(result.rows || []).slice(0, 5).map((row, idx) => (
                  <div key={idx} className="adash-ts-row adash-ts-row--ok" style={{ justifyContent: "space-between" }}>
                    <span>{Object.values(row)[0] ?? `Row ${idx + 1}`}</span>
                    <span style={{ color: "var(--muted)" }}>{Object.values(row)[1] ?? ""}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── QUICK LINKS ── */}
      <div className="adash-section-head">
        <h2>⚡ Quick Access</h2>
      </div>
      <div className="adash-links">
        {QUICK_LINKS.map(l => (
          <Link key={l.to} to={l.to} className="adash-link">
            <div className="adash-link-icon">{l.icon}</div>
            <strong>{l.title}</strong>
            <p>{l.desc}</p>
          </Link>
        ))}
      </div>

      {/* ── ANALYTICS MODAL ── */}
      {showAnalytics && ts?.by_project && (
        <AnalyticsModal
          projectData={ts.by_project}
          onClose={() => setShowAnalytics(false)}
        />
      )}

    </div>
  );
}
