import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
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

const PIE_COLORS = [C.purple, C.teal, C.blue, C.yellow, C.green, C.red, "#a78bfa", "#f97316"];

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
   Mini bar chart (horizontal)
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
   Segmented status bar
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
   Hours by Project panel
───────────────────────────────────────────────────── */
function HoursByProject({ data, onAnalytics }) {
  const max = Math.max(...Object.values(data), 1);
  return (
    <>
      <div className="adash-chart-title">
        Hours by Project
        <button className="adash-analytics-btn" onClick={onAnalytics}>
          ↗ Visual Analytics
        </button>
      </div>
      {Object.entries(data)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => (
          <div className="adash-bar-row" key={label}>
            <span className="adash-bar-label" title={label}>{label}</span>
            <div className="adash-bar-track">
              <div className="adash-bar-fill" style={{ width: `${(value / max) * 100}%`, background: C.grad }} />
            </div>
            <span className="adash-bar-value">
              {typeof value === "number" && value % 1 ? value.toFixed(1) : value}
            </span>
          </div>
        ))}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {Object.entries(data)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([project, hours]) => (
            <span key={project} className="adash-chip">
              <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, display: "inline-block", background: C.grad }} />
              <strong>{project}</strong>
              <span>{hours}h</span>
            </span>
          ))}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────
   Custom Recharts tooltip
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
   KPI DETAIL MODAL  — one component for all 5 cards
───────────────────────────────────────────────────── */
function KpiDetailModal({ card, data, onClose }) {
  const navigate = useNavigate();

  const emp   = data?.employees;
  const ts    = data?.timesheets;
  const obj   = data?.objectives;
  const docs  = data?.documents;
  const ann   = data?.announcements;
  const cal   = data?.calendar;

  function goto(path) { onClose(); navigate(path); }

  /* ── Employees ── */
  if (card === "employees") {
    const deptEntries = Object.entries(emp?.by_department || {}).sort((a, b) => b[1] - a[1]);
    const roleEntries = Object.entries(emp?.by_role || {}).sort((a, b) => b[1] - a[1]);
    const pieData = deptEntries.slice(0, 8).map(([name, value]) => ({ name, value }));

    return (
      <ModalShell icon="👥" title="Employees" sub={`${emp?.total ?? "—"} total · ${emp?.active ?? "—"} active`} onClose={onClose}>
        <div className="adash-modal-kpis">
          {[
            { label: "Total",         value: emp?.total ?? "—",           color: C.purple },
            { label: "Active",        value: emp?.active ?? "—",          color: C.green  },
            { label: "New This Month",value: emp?.new_this_month ?? "—",  color: C.teal   },
          ].map(({ label, value, color }) => (
            <div key={label} className="adash-modal-kpi" style={{ "--mkpi-color": color }}>
              <div className="adash-modal-kpi-label">{label}</div>
              <div className="adash-modal-kpi-value">{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <p className="adash-modal-section-label">By Department</p>
            <BarChart data={emp?.by_department || {}} color={C.purple} />
          </div>
          <div>
            <p className="adash-modal-section-label">Dept. share</p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={74}
                  dataKey="value" nameKey="name" paddingAngle={3}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => [v, ""]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {roleEntries.length > 0 && (
          <>
            <p className="adash-modal-section-label" style={{ marginTop: 20 }}>By Role</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {roleEntries.map(([role, count]) => (
                <span key={role} className="adash-chip">
                  <strong>{role}</strong> <span>{count}</span>
                </span>
              ))}
            </div>
          </>
        )}

        <button className="adash-analytics-btn" style={{ marginTop: 20 }} onClick={() => goto("/admin/employees")}>
          Manage Employees →
        </button>
      </ModalShell>
    );
  }

  /* ── Objectives ── */
  if (card === "objectives") {
    const byStatus = obj?.by_status || {};
    const total = obj?.total || 0;
    const barData = Object.entries(byStatus).map(([status, count]) => ({ status, count }));

    return (
      <ModalShell icon="🎯" title="Objectives" sub={`${total} total · ${obj?.avg_progress ?? 0}% avg progress`} onClose={onClose}>
        <div className="adash-modal-kpis">
          {[
            { label: "Total",        value: total,                   color: C.purple },
            { label: "Avg Progress", value: `${obj?.avg_progress ?? 0}%`, color: C.teal },
            { label: "Completed",    value: byStatus.completed ?? 0, color: C.green  },
          ].map(({ label, value, color }) => (
            <div key={label} className="adash-modal-kpi" style={{ "--mkpi-color": color }}>
              <div className="adash-modal-kpi-label">{label}</div>
              <div className="adash-modal-kpi-value">{value}</div>
            </div>
          ))}
        </div>

        <p className="adash-modal-section-label">Status breakdown</p>
        <SegmentedBar data={byStatus} colorMap={STATUS_COLORS} />

        {barData.length > 0 && (
          <ResponsiveContainer width="100%" height={180} style={{ marginTop: 20 }}>
            <RechartBar data={barData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="status" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="count" name="Count" radius={[5,5,0,0]}>
                {barData.map((e, i) => <Cell key={i} fill={STATUS_COLORS[e.status] || C.purple} />)}
              </Bar>
            </RechartBar>
          </ResponsiveContainer>
        )}
      </ModalShell>
    );
  }

  /* ── Timesheets ── */
  if (card === "timesheets") {
    const byProject  = ts?.by_project  || {};
    const byCategory = ts?.by_category || {};
    const topProject = Object.entries(byProject).sort((a, b) => b[1] - a[1])[0];
    const topCat     = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
    const projData   = Object.entries(byProject).sort((a, b) => b[1] - a[1]).slice(0, 8)
                         .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }));

    return (
      <ModalShell icon="⏱️" title="Hours Logged (30d)" sub={`${ts?.total_hours_30d ?? "—"} total · ${ts?.avg_daily ?? "—"} avg/day`} onClose={onClose}>
        <div className="adash-modal-kpis">
          {[
            { label: "Total Hours (30d)", value: ts?.total_hours_30d ?? "—",         color: C.purple },
            { label: "Avg Daily",         value: `${ts?.avg_daily ?? "—"}h`,         color: C.teal   },
            { label: "Top Project",       value: topProject?.[0] ?? "—",             color: C.blue   },
          ].map(({ label, value, color }) => (
            <div key={label} className="adash-modal-kpi" style={{ "--mkpi-color": color }}>
              <div className="adash-modal-kpi-label">{label}</div>
              <div className="adash-modal-kpi-value" style={{ fontSize: label === "Top Project" ? 14 : undefined }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <p className="adash-modal-section-label">By Project</p>
            <BarChart data={byProject} color={C.purple} />
          </div>
          <div>
            <p className="adash-modal-section-label">By Category</p>
            <BarChart data={byCategory} color={C.teal} />
          </div>
        </div>

        {projData.length > 0 && (
          <>
            <p className="adash-modal-section-label" style={{ marginTop: 20 }}>Project hours chart</p>
            <ResponsiveContainer width="100%" height={180}>
              <RechartBar data={projData} barSize={22}>
                <defs>
                  <linearGradient id="kpiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.purple} />
                    <stop offset="100%" stopColor={C.teal} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="hours" name="Hours" fill="url(#kpiGrad)" radius={[5,5,0,0]} />
              </RechartBar>
            </ResponsiveContainer>
          </>
        )}

        <button className="adash-analytics-btn" style={{ marginTop: 20 }} onClick={() => goto("/admin/reports-builder")}>
          Full Report Builder →
        </button>
      </ModalShell>
    );
  }

  /* ── KB Documents ── */
  if (card === "documents") {
    return (
      <ModalShell icon="📄" title="Knowledge Base" sub={`${docs?.kb_doc_count ?? "—"} documents`} onClose={onClose}>
        <div className="adash-modal-kpis">
          {[
            { label: "KB Documents",      value: docs?.kb_doc_count     ?? "—", color: C.purple },
            { label: "Employee Documents",value: docs?.employee_doc_count ?? "—", color: C.teal   },
          ].map(({ label, value, color }) => (
            <div key={label} className="adash-modal-kpi" style={{ "--mkpi-color": color }}>
              <div className="adash-modal-kpi-label">{label}</div>
              <div className="adash-modal-kpi-value">{value}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          Upload policies, handbooks, and resources for employees to access anytime.
        </p>
        <button className="adash-analytics-btn" style={{ marginTop: 20 }} onClick={() => goto("/admin/knowledge-base")}>
          Manage Knowledge Base →
        </button>
      </ModalShell>
    );
  }

  /* ── Announcements ── */
  if (card === "announcements") {
    return (
      <ModalShell icon="📣" title="Announcements" sub={`${ann?.total ?? "—"} total · ${ann?.recent_count ?? "—"} in last 30d`} onClose={onClose}>
        <div className="adash-modal-kpis">
          {[
            { label: "Total",       value: ann?.total         ?? "—", color: C.purple },
            { label: "Last 30 Days",value: ann?.recent_count  ?? "—", color: C.teal   },
          ].map(({ label, value, color }) => (
            <div key={label} className="adash-modal-kpi" style={{ "--mkpi-color": color }}>
              <div className="adash-modal-kpi-label">{label}</div>
              <div className="adash-modal-kpi-value">{value}</div>
            </div>
          ))}
        </div>
        {ann?.recent_count != null && ann?.total != null && ann.total > 0 && (
          <>
            <p className="adash-modal-section-label" style={{ marginTop: 16 }}>Activity (30d vs all-time)</p>
            <div className="adash-seg" style={{ marginBottom: 8 }}>
              <div className="adash-seg-part" style={{
                width: `${Math.round((ann.recent_count / ann.total) * 100)}%`,
                background: C.purple,
              }} />
              <div className="adash-seg-part" style={{
                width: `${100 - Math.round((ann.recent_count / ann.total) * 100)}%`,
                background: C.gray200,
              }} />
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>
              {Math.round((ann.recent_count / ann.total) * 100)}% of all announcements were posted in the last 30 days.
            </p>
          </>
        )}
        <button className="adash-analytics-btn" style={{ marginTop: 20 }} onClick={() => goto("/admin/announcements")}>
          Manage Announcements →
        </button>
      </ModalShell>
    );
  }

  return null;
}

/* ─────────────────────────────────────────────────────
   Modal shell — header + close btn wrapper
───────────────────────────────────────────────────── */
function ModalShell({ icon, title, sub, onClose, children }) {
  return (
    <div className="adash-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adash-modal">
        <div className="adash-modal-header">
          <div>
            <div className="adash-modal-title">
              <div className="adash-logo-dot" />
              <h2>{icon} {title}</h2>
            </div>
            {sub && <p className="adash-modal-sub">{sub}</p>}
          </div>
          <button className="adash-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="adash-modal-rule" />
        {children}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   ANALYTICS MODAL (hours by project deep-dive)
───────────────────────────────────────────────────── */
function AnalyticsModal({ projectData, onClose }) {
  const [tab, setTab] = useState("overview");

  const entries    = Object.entries(projectData || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const totalHours = entries.reduce((s, [, v]) => s + v, 0);
  const avg        = totalHours / (entries.length || 1);
  const barData    = entries.map(([project, hours]) => ({ project, hours, avg: Math.round(avg) }));

  const tabs = [
    { id: "overview", label: "Overview"     },
    { id: "compare",  label: "vs Average"   },
    { id: "dist",     label: "Distribution" },
  ];

  return (
    <div className="adash-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adash-modal">
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

        <div className="adash-tabs">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`adash-tab${tab === t.id ? " adash-tab--active" : ""}`}>{t.label}</button>
          ))}
        </div>

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

        {tab === "compare" && (
          <>
            <p className="adash-modal-section-label">Each project vs team average ({Math.round(avg)}h)</p>
            <ResponsiveContainer width="100%" height={220}>
              <RechartBar data={barData} barGap={4} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="project" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="hours" name="Actual" radius={[5,5,0,0]}>
                  {barData.map((e, i) => <Cell key={i} fill={e.hours >= avg ? C.purple : C.teal} />)}
                </Bar>
                <Bar dataKey="avg" name="Average" fill={C.gray200} radius={[5,5,0,0]} />
              </RechartBar>
            </ResponsiveContainer>
            <div className="adash-proj-cards">
              {barData.map(({ project, hours }) => {
                const above = hours >= avg;
                const diff  = Math.abs(hours - Math.round(avg));
                return (
                  <div key={project} className="adash-proj-card" style={{ "--pc-color": above ? C.purple : C.teal }}>
                    <div className="adash-proj-card-name">{project}</div>
                    <div className="adash-proj-card-hours">{hours}h</div>
                    <div className="adash-proj-card-diff" style={{ color: above ? C.purple : C.teal }}>
                      {above ? `↑ +${diff}h above` : `↓ ${diff}h below`} avg
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "dist" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
            <div>
              <p className="adash-modal-section-label">Share of total hours</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={entries.map(([name, value]) => ({ name, value }))}
                    cx="50%" cy="50%" innerRadius={50} outerRadius={88}
                    dataKey="value" nameKey="name" paddingAngle={3}>
                    {entries.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
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
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length], display: "inline-block" }} />
                        {name}
                      </div>
                      <span className="adash-dist-row-meta">{value}h · {pct}%</span>
                    </div>
                    <div className="adash-dist-track">
                      <div className="adash-dist-fill" style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
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
   MAIN
───────────────────────────────────────────────────── */
export default function AdminDashboard() {
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [activeModal,   setActiveModal]   = useState(null); // "employees"|"objectives"|"timesheets"|"documents"|"announcements"
  const [widgets,       setWidgets]       = useState([]);

  useEffect(() => {
    Promise.allSettled([
      authFetch(`${API}/api/v1/employees/analytics`).then(r => r.ok ? r.json() : null),
      authFetch(`${API}/api/v1/employees/`).then(r => r.ok ? r.json() : []),
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
        const reports = (payload.reports || []).filter(r => r.config?.dashboard_widget).slice(0, 3);
        const results = await Promise.all(
          reports.map(async report => {
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

  const KPI_CARDS = [
    { key: "employees",    icon: "👥", color: "#8b5cf6", value: emp?.total ?? data?._empCount ?? "—", label: "Total Employees",   hint: "Click for breakdown" },
    { key: "objectives",   icon: "🎯", color: "#3b82f6", value: obj?.total ?? "—",                   label: "Active Objectives",  hint: "Click for status view" },
    { key: "timesheets",   icon: "⏱️", color: "#34d399", value: ts?.total_hours_30d ?? "—",           label: "Hours Logged (30d)", hint: "Click for project detail" },
    { key: "documents",    icon: "📄", color: "#fbbf24", value: docs?.kb_doc_count ?? "—",            label: "KB Documents",       hint: "Click for details" },
    { key: "announcements",icon: "📣", color: "#f87171", value: ann?.total ?? "—",                    label: "Announcements",      hint: "Click for details" },
  ];

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

      {/* ── KPI CARDS — clickable ── */}
      <div className="adash-kpis">
        {KPI_CARDS.map(({ key, icon, color, value, label, hint }) => (
          <button
            key={key}
            className="adash-kpi adash-kpi--btn"
            style={{ "--kpi-color": color }}
            onClick={() => setActiveModal(key)}
            title={hint}
          >
            <div className="adash-kpi-icon">{icon}</div>
            <div className="adash-kpi-value">{value}</div>
            <div className="adash-kpi-label">{label}</div>
            <div className="adash-kpi-hint">↗ {hint}</div>
          </button>
        ))}
      </div>

      {/* ── CHARTS ── */}
      {(emp?.by_department || obj?.by_status || ts?.by_category || ts?.by_project) && (
        <>
          <div className="adash-section-head">
            <h2>📊 Analytics</h2>
            <Link to="/admin/reports-builder" className="adash-section-link">View reports →</Link>
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
                <HoursByProject data={ts.by_project} onAnalytics={() => setShowAnalytics(true)} />
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
                    <div key={s.user_id} className={`adash-ts-row adash-ts-row--${s.submitted ? "ok" : "nok"}`}>
                      <span style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                        <span className={`adash-ts-badge adash-ts-badge--${s.submitted ? "ok" : "nok"}`}>
                          {s.submitted ? "✓" : "✗"}
                        </span>
                        {s.name}
                        {s.department && <span className="adash-dept-pill">{s.department}</span>}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{s.hours_this_week}h</span>
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

      {/* ── KPI DETAIL MODAL ── */}
      {activeModal && (
        <KpiDetailModal
          card={activeModal}
          data={data}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* ── PROJECT ANALYTICS MODAL ── */}
      {showAnalytics && ts?.by_project && (
        <AnalyticsModal
          projectData={ts.by_project}
          onClose={() => setShowAnalytics(false)}
        />
      )}

    </div>
  );
}
