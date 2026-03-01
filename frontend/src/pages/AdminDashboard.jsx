import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { API, authFetch } from "../api.js";
import "./AdminDashboard.css";

const STATUS_COLORS = {
  draft: "#94a3b8",
  active: "#8b5cf6",
  in_progress: "#3b82f6",
  completed: "#34d399",
  on_track: "#34d399",
  at_risk: "#fbbf24",
  behind: "#f87171",
  cancelled: "#6b7280",
};

const QUICK_LINKS = [
  { to: "/admin/knowledge-base", title: "Knowledge Base", desc: "Upload and manage organization documents." },
  { to: "/admin/announcements", title: "Announcements", desc: "Broadcast updates and track read receipts." },
  { to: "/admin/employees", title: "Employees", desc: "Manage employee profiles and records." },
  { to: "/admin/guided-paths", title: "Guided Paths", desc: "Create guided wellbeing modules." },
  { to: "/admin/org-config", title: "Org Config", desc: "Configure organisation context." },
  { to: "/admin/managers", title: "Managers", desc: "Assign manager roles and access." },
];

function BarChart({ data, color }) {
  const max = Math.max(...Object.values(data), 1);
  return Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => (
      <div className="adash-bar-row" key={label}>
        <span className="adash-bar-label" title={label}>{label}</span>
        <div className="adash-bar-track">
          <div className="adash-bar-fill" style={{ width: `${(value / max) * 100}%`, background: color || "var(--accent)" }} />
        </div>
        <span className="adash-bar-value">{typeof value === "number" && value % 1 ? value.toFixed(1) : value}</span>
      </div>
    ));
}

function SegmentedBar({ data, colorMap }) {
  const total = Object.values(data).reduce((s, v) => s + v, 0) || 1;
  return (
    <>
      <div className="adash-seg">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="adash-seg-part" style={{ width: `${(v / total) * 100}%`, background: colorMap[k] || "#94a3b8" }} />
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

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch(`${API}/api/v1/employees/analytics`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="adash-loading">Loading analytics...</div>;

  const emp = data?.employees;
  const ts = data?.timesheets;
  const obj = data?.objectives;
  const docs = data?.documents;
  const ann = data?.announcements;

  return (
    <div className="adash-wrap">
      <div className="adash-header">
        <h1>HR Portal Dashboard</h1>
        <p>Organization overview and quick analytics.</p>
      </div>

      {/* KPI Cards */}
      <div className="adash-kpis">
        <div className="adash-kpi" style={{ "--kpi-color": "#8b5cf6" }}>
          <div className="adash-kpi-value">{emp?.total ?? "—"}</div>
          <div className="adash-kpi-label">Total Employees</div>
        </div>
        <div className="adash-kpi" style={{ "--kpi-color": "#3b82f6" }}>
          <div className="adash-kpi-value">{obj?.total ?? "—"}</div>
          <div className="adash-kpi-label">Active Objectives</div>
        </div>
        <div className="adash-kpi" style={{ "--kpi-color": "#34d399" }}>
          <div className="adash-kpi-value">{ts?.total_hours_30d ?? "—"}</div>
          <div className="adash-kpi-label">Hours Logged (30d)</div>
        </div>
        <div className="adash-kpi" style={{ "--kpi-color": "#fbbf24" }}>
          <div className="adash-kpi-value">{docs?.kb_doc_count ?? "—"}</div>
          <div className="adash-kpi-label">KB Documents</div>
        </div>
        <div className="adash-kpi" style={{ "--kpi-color": "#f87171" }}>
          <div className="adash-kpi-value">{ann?.total ?? "—"}</div>
          <div className="adash-kpi-label">Announcements</div>
        </div>
      </div>

      {/* Charts */}
      <div className="adash-charts">
        {emp?.by_department && Object.keys(emp.by_department).length > 0 && (
          <div className="adash-chart">
            <div className="adash-chart-title">Employees by Department</div>
            <BarChart data={emp.by_department} color="#8b5cf6" />
          </div>
        )}

        {obj?.by_status && Object.keys(obj.by_status).length > 0 && (
          <div className="adash-chart">
            <div className="adash-chart-title">Objectives by Status</div>
            <SegmentedBar data={obj.by_status} colorMap={STATUS_COLORS} />
          </div>
        )}

        {ts?.by_category && Object.keys(ts.by_category).length > 0 && (
          <div className="adash-chart">
            <div className="adash-chart-title">Time Allocation by Category</div>
            <BarChart data={ts.by_category} color="#3b82f6" />
          </div>
        )}

        {ts?.by_project && Object.keys(ts.by_project).length > 0 && (
          <div className="adash-chart">
            <div className="adash-chart-title">Hours by Project</div>
            <BarChart data={ts.by_project} color="#34d399" />
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="adash-links">
        {QUICK_LINKS.map(l => (
          <Link key={l.to} to={l.to} className="adash-link">
            <strong>{l.title}</strong>
            <p>{l.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
