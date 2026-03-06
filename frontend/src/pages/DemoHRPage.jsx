import { Link } from "react-router-dom";
import "./Demo.css";

const NAV_LINKS = [
  { label: "Dashboard", active: true },
  { label: "Usage Report" },
  { label: "Knowledge Base" },
  { label: "Announcements" },
  { label: "Employees" },
  { label: "Guided Paths" },
  { label: "Org Config" },
  { label: "Managers" },
  { label: "Payroll" },
  { label: "Leave Management" },
  { label: "Wellbeing" },
  { label: "Calendar" },
  { label: "Timesheets" },
];

const DEPT_DATA = {
  Engineering: 14,
  Marketing: 8,
  Finance: 7,
  "Human Resources": 6,
  Operations: 5,
  Sales: 5,
};

const OBJ_STATUS = {
  active: 5,
  in_progress: 4,
  completed: 2,
  at_risk: 1,
};

const STATUS_COLORS = {
  active: "#8b5cf6",
  in_progress: "#3b82f6",
  completed: "#34d399",
  at_risk: "#fbbf24",
};

const QUICK_LINKS = [
  { title: "Knowledge Base", desc: "Upload and manage organization documents." },
  { title: "Announcements", desc: "Broadcast updates and track read receipts." },
  { title: "Employees", desc: "Manage employee profiles and records." },
  { title: "Guided Paths", desc: "Create guided wellbeing modules." },
  { title: "Org Config", desc: "Configure organisation context." },
  { title: "Managers", desc: "Assign manager roles and access." },
];

function BarChart({ data, color }) {
  const max = Math.max(...Object.values(data), 1);
  return Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => (
      <div className="demo-bar-row" key={label}>
        <span className="demo-bar-label" title={label}>{label}</span>
        <div className="demo-bar-track">
          <div className="demo-bar-fill" style={{ width: `${(value / max) * 100}%`, background: color }} />
        </div>
        <span className="demo-bar-value">{value}</span>
      </div>
    ));
}

function SegmentedBar({ data, colorMap }) {
  const total = Object.values(data).reduce((s, v) => s + v, 0) || 1;
  return (
    <>
      <div className="demo-seg">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="demo-seg-part" style={{ width: `${(v / total) * 100}%`, background: colorMap[k] || "#94a3b8" }} />
        ))}
      </div>
      <div className="demo-seg-legend">
        {Object.entries(data).map(([k, v]) => (
          <span key={k} className="demo-seg-item">
            <span className="demo-seg-dot" style={{ background: colorMap[k] || "#94a3b8" }} />
            {k} ({v})
          </span>
        ))}
      </div>
    </>
  );
}

export default function DemoHRPage() {
  return (
    <div className="demo-hr">
      {/* Banner */}
      <div className="demo-banner">
        <div className="demo-banner__label">
          <span className="demo-banner__dot" />
          Demo Mode — HR Admin Portal
        </div>
        <Link to="/" className="demo-banner__exit">Exit Demo</Link>
      </div>

      {/* Body */}
      <div className="demo-hr-body">
        {/* Sidebar */}
        <aside className="demo-hr-sidebar">
          <div className="demo-hr-brand">
            <div className="demo-hr-brand-dot" />
            <div>
              <div className="demo-hr-brand-title">Rafiki</div>
              <div className="demo-hr-brand-sub">HR Portal</div>
            </div>
          </div>
          <nav className="demo-hr-nav">
            {NAV_LINKS.map(l => (
              <span key={l.label} className={`demo-hr-nav-link${l.active ? " active" : ""}`}>
                {l.label}
              </span>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <div className="demo-hr-content">
          <div className="demo-greeting">
            <h1>HR Portal Dashboard</h1>
            <div className="demo-greeting-meta">Organization overview and quick analytics.</div>
          </div>

          {/* KPI Cards */}
          <div className="demo-stats">
            <div className="demo-stat" style={{ "--stat-color": "#8b5cf6" }}>
              <div className="demo-stat-value">45</div>
              <div className="demo-stat-label">Total Employees</div>
            </div>
            <div className="demo-stat" style={{ "--stat-color": "#3b82f6" }}>
              <div className="demo-stat-value">12</div>
              <div className="demo-stat-label">Active Objectives</div>
            </div>
            <div className="demo-stat" style={{ "--stat-color": "#34d399" }}>
              <div className="demo-stat-value">320</div>
              <div className="demo-stat-label">Hours Logged (30d)</div>
            </div>
            <div className="demo-stat" style={{ "--stat-color": "#fbbf24" }}>
              <div className="demo-stat-value">8</div>
              <div className="demo-stat-label">KB Documents</div>
            </div>
            <div className="demo-stat" style={{ "--stat-color": "#f87171" }}>
              <div className="demo-stat-value">3</div>
              <div className="demo-stat-label">Announcements</div>
            </div>
          </div>

          {/* Charts */}
          <div className="demo-body">
            <div className="demo-card">
              <div className="demo-card-title">Employees by Department</div>
              <BarChart data={DEPT_DATA} color="#8b5cf6" />
            </div>
            <div className="demo-card">
              <div className="demo-card-title">Objectives by Status</div>
              <SegmentedBar data={OBJ_STATUS} colorMap={STATUS_COLORS} />
            </div>
          </div>

          {/* Quick Links */}
          <div className="demo-links">
            {QUICK_LINKS.map(l => (
              <div key={l.title} className="demo-link">
                <strong>{l.title}</strong>
                <p>{l.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
