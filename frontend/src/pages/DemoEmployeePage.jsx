import { Link } from "react-router-dom";
import "./Demo.css";

const NAV_LINKS = [
  { label: "Home", active: true },
  { label: "Chat" },
  { label: "Knowledge Base" },
  { label: "My Documents" },
  { label: "Announcements" },
  { label: "Objectives" },
  { label: "Calendar" },
  { label: "Timesheets" },
  { label: "Meetings" },
  { label: "Leave" },
];

const MOCK_OBJECTIVES = [
  { title: "Complete Q1 performance review", progress: 75 },
  { title: "Finish onboarding checklist", progress: 100 },
  { title: "Submit project proposal", progress: 40 },
];

const MOCK_EVENTS = [
  { title: "Team Stand-up", date: "Mar 7", color: "#8b5cf6" },
  { title: "1:1 with Manager", date: "Mar 8", color: "#3b82f6" },
  { title: "Wellness Workshop", date: "Mar 10", color: "#34d399" },
  { title: "Sprint Review", date: "Mar 12", color: "#fbbf24" },
  { title: "Company Town Hall", date: "Mar 14", color: "#f87171" },
];

const MOCK_ANNOUNCEMENTS = [
  { title: "Office Closure — March 15", body: "The office will be closed for the public holiday. Remote work available.", date: "Mar 4" },
  { title: "New Leave Policy Update", body: "Updated leave policy effective April 1. Please review the changes in the Knowledge Base.", date: "Mar 2" },
  { title: "Wellness Challenge Launch", body: "Join the 30-day wellness challenge! Sign up through the Guided Paths section.", date: "Feb 28" },
];

const MOCK_MESSAGES = [
  { name: "Sarah K.", preview: "Can you review the doc?", time: "2h" },
  { name: "James M.", preview: "Meeting moved to 3pm", time: "5h" },
  { name: "HR Team", preview: "Payslip for February ready", time: "1d" },
];

const CAL_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function MiniCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: daysInPrev - firstDow + 1 + i, outside: true });
  for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i, outside: false });
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) for (let i = 1; i <= remaining; i++) cells.push({ day: i, outside: true });

  return (
    <div className="demo-cal">
      <div className="demo-cal-header">
        <span>{monthNames[month].slice(0, 3)} {year}</span>
      </div>
      <div className="demo-cal-grid">
        {CAL_DAYS.map(d => <div key={d} className="demo-cal-dh">{d}</div>)}
        {cells.map((c, i) => (
          <div
            key={i}
            className={`demo-cal-day${c.outside ? " out" : ""}${!c.outside && c.day === today.getDate() ? " today" : ""}`}
          >
            {c.day}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DemoEmployeePage() {
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="demo-emp">
      {/* Banner */}
      <div className="demo-banner">
        <div className="demo-banner__label">
          <span className="demo-banner__dot" />
          Demo Mode — Employee Portal
        </div>
        <Link to="/" className="demo-banner__exit">Exit Demo</Link>
      </div>

      {/* Nav Bar */}
      <nav className="demo-emp-nav">
        <div className="demo-emp-nav-links">
          {NAV_LINKS.map(l => (
            <span key={l.label} className={`demo-emp-nav-link${l.active ? " active" : ""}`}>
              {l.label}
            </span>
          ))}
        </div>
        <div className="demo-portal-switcher">
          <Link to="/demo/hr" className="demo-portal-link">HR Admin</Link>
          <Link to="/demo/manager" className="demo-portal-link">Manager Portal</Link>
        </div>
      </nav>

      {/* Body */}
      <div className="demo-emp-body">
        {/* Sidebar */}
        <aside className="demo-emp-sidebar">
          <div className="demo-msgs">
            <div className="demo-msgs-title">Messages</div>
            {MOCK_MESSAGES.map(m => (
              <div key={m.name} className="demo-msg-item">
                <div>
                  <div className="demo-msg-name">{m.name}</div>
                  <div className="demo-msg-preview">{m.preview}</div>
                </div>
                <span className="demo-msg-time">{m.time}</span>
              </div>
            ))}
          </div>
          <MiniCalendar />
        </aside>

        {/* Main Content */}
        <div className="demo-emp-content">
          {/* Greeting */}
          <div className="demo-greeting">
            <h1>{greetingText()}, Demo Employee</h1>
            <div className="demo-greeting-meta">
              <span>{today}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="demo-stats">
            <div className="demo-stat" style={{ "--stat-color": "#8b5cf6" }}>
              <div className="demo-stat-value">3</div>
              <div className="demo-stat-label">My Objectives</div>
            </div>
            <div className="demo-stat" style={{ "--stat-color": "#3b82f6" }}>
              <div className="demo-stat-value">8.5</div>
              <div className="demo-stat-label">Hours This Week</div>
            </div>
            <div className="demo-stat" style={{ "--stat-color": "#34d399" }}>
              <div className="demo-stat-value">5</div>
              <div className="demo-stat-label">Upcoming Events</div>
            </div>
            <div className="demo-stat" style={{ "--stat-color": "#f87171" }}>
              <div className="demo-stat-value">1</div>
              <div className="demo-stat-label">Unread Messages</div>
            </div>
          </div>

          {/* Cards */}
          <div className="demo-body">
            <div className="demo-card">
              <div className="demo-card-title">Active Objectives</div>
              {MOCK_OBJECTIVES.map(o => (
                <div key={o.title} className="demo-obj">
                  <div className="demo-obj-top">
                    <span className="demo-obj-name">{o.title}</span>
                    <span className="demo-obj-pct">{o.progress}%</span>
                  </div>
                  <div className="demo-obj-track">
                    <div className="demo-obj-fill" style={{ width: `${o.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="demo-card">
              <div className="demo-card-title">Upcoming Events</div>
              {MOCK_EVENTS.map(e => (
                <div key={e.title} className="demo-ev">
                  <span className="demo-ev-dot" style={{ background: e.color }} />
                  <span className="demo-ev-title">{e.title}</span>
                  <span className="demo-ev-date">{e.date}</span>
                </div>
              ))}
            </div>

            <div className="demo-card">
              <div className="demo-card-title">Recent Announcements</div>
              {MOCK_ANNOUNCEMENTS.map(a => (
                <div key={a.title} className="demo-ann">
                  <div className="demo-ann-title">{a.title}</div>
                  <div className="demo-ann-body">{a.body}</div>
                  <div className="demo-ann-date">{a.date}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="demo-actions">
            <Link to="/demo/employee" className="demo-action">Chat with Rafiki</Link>
            <Link to="/demo/employee" className="demo-action">Log Time</Link>
            <Link to="/demo/employee" className="demo-action">My Documents</Link>
            <Link to="/demo/employee" className="demo-action">View Objectives</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
