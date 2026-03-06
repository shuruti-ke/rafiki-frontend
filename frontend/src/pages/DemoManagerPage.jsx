import { Link } from "react-router-dom";
import "./Demo.css";

const NAV_LINKS = [
  { label: "Dashboard", active: true },
  { label: "My Team" },
  { label: "Coaching" },
  { label: "HR Toolkit" },
  { label: "Calendar" },
  { label: "Timesheets" },
];

const MOCK_METRICS = [
  { value: "8", label: "Team Members", color: "#8b5cf6" },
  { value: "4.2", label: "Avg Rating", color: "#3b82f6" },
  { value: "12", label: "Coaching Sessions", color: "#34d399" },
  { value: "3", label: "Upcoming Deadlines", color: "#fbbf24" },
];

const QUICK_ACTIONS = [
  { title: "My Team", desc: "View team performance and manage direct reports." },
  { title: "AI Coaching", desc: "Get AI-powered coaching suggestions for your team." },
  { title: "HR Toolkit", desc: "Access HR templates, policies and toolkits." },
];

const MOCK_TIMESHEETS = [
  { name: "Alice Nkosi", hours: 38, submitted: true },
  { name: "Brian Dlamini", hours: 42, submitted: true },
  { name: "Claire Moyo", hours: 35, submitted: false },
  { name: "David Zulu", hours: 40, submitted: true },
  { name: "Evelyn Phiri", hours: 29, submitted: false },
];

const MOCK_COACHING = [
  { employee: "Alice Nkosi", concern: "Work-life balance", outcome: "positive", date: "Mar 4" },
  { employee: "Brian Dlamini", concern: "Career development", outcome: "positive", date: "Mar 2" },
  { employee: "Claire Moyo", concern: "Skill gap — data analysis", outcome: "pending", date: "Feb 28" },
];

const OUTCOME_COLORS = {
  positive: "#34d399",
  pending: "#fbbf24",
  negative: "#f87171",
};

export default function DemoManagerPage() {
  return (
    <div className="demo-mgr">
      {/* Banner */}
      <div className="demo-banner">
        <div className="demo-banner__label">
          <span className="demo-banner__dot" />
          Demo Mode — Manager Portal
        </div>
        <Link to="/" className="demo-banner__exit">Exit Demo</Link>
      </div>

      <div className="demo-mgr-body">
        {/* Sidebar */}
        <aside className="demo-mgr-sidebar">
          <div className="demo-mgr-brand">
            <div className="demo-mgr-brand-dot" />
            <div>
              <div className="demo-mgr-brand-title">Rafiki</div>
              <div className="demo-mgr-brand-sub">Manager Portal</div>
            </div>
          </div>
          <nav className="demo-mgr-nav">
            {NAV_LINKS.map(l => (
              <span key={l.label} className={`demo-mgr-nav-link${l.active ? " active" : ""}`}>
                {l.label}
              </span>
            ))}
          </nav>
          <div className="demo-mgr-nav-footer">
            <Link to="/demo/employee" className="demo-mgr-footer-link">Back to Chat</Link>
            <Link to="/demo/hr" className="demo-mgr-footer-link">HR Portal</Link>
          </div>
        </aside>

        {/* Main Content */}
        <div className="demo-mgr-content">
          <div className="demo-greeting">
            <h1>Manager Dashboard</h1>
            <div className="demo-greeting-meta">Performance overview and coaching tools for your team.</div>
          </div>

          {/* Metric Cards */}
          <div className="demo-stats">
            {MOCK_METRICS.map(m => (
              <div key={m.label} className="demo-stat" style={{ "--stat-color": m.color }}>
                <div className="demo-stat-value">{m.value}</div>
                <div className="demo-stat-label">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="demo-mgr-actions">
            {QUICK_ACTIONS.map(a => (
              <div key={a.title} className="demo-mgr-action-card">
                <strong>{a.title}</strong>
                <p>{a.desc}</p>
              </div>
            ))}
          </div>

          {/* Team Timesheet Status */}
          <div className="demo-card" style={{ marginTop: 20 }}>
            <div className="demo-card-title">Team Timesheet Status</div>
            <table className="demo-mgr-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Hours This Week</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_TIMESHEETS.map(t => (
                  <tr key={t.name}>
                    <td>{t.name}</td>
                    <td>{t.hours}</td>
                    <td>
                      <span className={`demo-mgr-badge ${t.submitted ? "yes" : "no"}`}>
                        {t.submitted ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recent Coaching Sessions */}
          <div className="demo-card" style={{ marginTop: 16 }}>
            <div className="demo-card-title">Recent Coaching Sessions</div>
            {MOCK_COACHING.map(c => (
              <div key={c.employee + c.date} className="demo-mgr-coaching-row">
                <div className="demo-mgr-coaching-info">
                  <span className="demo-mgr-coaching-name">{c.employee}</span>
                  <span className="demo-mgr-coaching-concern">{c.concern}</span>
                </div>
                <span className="demo-mgr-coaching-outcome" style={{ color: OUTCOME_COLORS[c.outcome] }}>
                  {c.outcome}
                </span>
                <span className="demo-mgr-coaching-date">{c.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
