import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { API, authFetch } from "../api.js";
import "./EmployeeDashboard.css";

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmtShortDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtRelative(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days}d ago`;
  return fmtShortDate(iso);
}

const C = {
  purple: "#8b5cf6", teal: "#1fbfb8", blue: "#3b82f6",
  green: "#34d399",  yellow: "#fbbf24", red: "#f87171",
  grad: "linear-gradient(135deg,#8b5cf6 0%,#1fbfb8 100%)",
};

const QUICK_ACTIONS = [
  { to: "/chat",        icon: "💬", label: "Ask Rafiki",     color: C.purple },
  { to: "/timesheet",   icon: "⏱️", label: "Log Time",       color: C.teal   },
  { to: "/leave",       icon: "🌴", label: "Request Leave",  color: C.green  },
  { to: "/objectives",  icon: "🎯", label: "My Objectives",  color: C.blue   },
  { to: "/my-documents",icon: "📄", label: "My Documents",   color: C.yellow },
  { to: "/guided-paths",icon: "🧭", label: "Learning Paths", color: C.red    },
];

/* ── Stat card ── */
function StatCard({ label, value, icon, color, to }) {
  const inner = (
    <div className="edash-stat-card" style={{ "--sc": color }}>
      <div className="edash-stat-icon">{icon}</div>
      <div className="edash-stat-value">{value ?? "—"}</div>
      <div className="edash-stat-label">{label}</div>
      <div className="edash-stat-bar" />
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

/* ── Objective row ── */
function ObjRow({ obj }) {
  const pct = Math.round(obj.progress || 0);
  const color = pct >= 80 ? C.green : pct >= 40 ? C.teal : C.yellow;
  return (
    <div className="edash-obj-row">
      <div className="edash-obj-top">
        <span className="edash-obj-name">{obj.title}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div className="edash-obj-track">
        <div className="edash-obj-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      {obj.key_results?.length > 0 && (
        <div className="edash-obj-kr">{obj.key_results.length} key result{obj.key_results.length !== 1 ? "s" : ""}</div>
      )}
    </div>
  );
}

/* ── Event pill ── */
function EventPill({ ev }) {
  return (
    <div className="edash-ev-pill">
      <span className="edash-ev-dot" style={{ background: ev.color || C.purple }} />
      <span className="edash-ev-title">{ev.title}</span>
      <span className="edash-ev-date">{fmtShortDate(ev.start_time)}</span>
    </div>
  );
}

/* ── Announcement card ── */
function AnnCard({ ann }) {
  const [expanded, setExpanded] = useState(false);
  const body = ann.body || ann.content || "";
  const preview = body.length > 100 ? body.slice(0, 100) + "…" : body;
  return (
    <div className="edash-ann-card">
      <div className="edash-ann-top">
        <span className="edash-ann-dot" />
        <span className="edash-ann-title">{ann.title}</span>
        <span className="edash-ann-date">{fmtRelative(ann.created_at)}</span>
      </div>
      <div className="edash-ann-body">{expanded ? body : preview}</div>
      {body.length > 100 && (
        <button className="edash-ann-toggle" onClick={() => setExpanded(e => !e)}>
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

export default function EmployeeDashboard() {
  const user    = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const name    = user.full_name || user.name || user.email || "there";
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  const [objectives,     setObjectives]     = useState([]);
  const [events,         setEvents]         = useState([]);
  const [announcements,  setAnnouncements]  = useState([]);
  const [weeklyHours,    setWeeklyHours]    = useState(null);
  const [leaveBalance,   setLeaveBalance]   = useState(null);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const weekStart = monday.toISOString().slice(0, 10);
    const calEnd = new Date(); calEnd.setDate(calEnd.getDate() + 30);

    Promise.allSettled([
      authFetch(`${API}/api/v1/objectives/`).then(r => r.ok ? r.json() : []),
      authFetch(`${API}/api/v1/calendar/?start=${encodeURIComponent(now.toISOString())}&end=${encodeURIComponent(calEnd.toISOString())}`).then(r => r.ok ? r.json() : []),
      authFetch(`${API}/api/v1/announcements/`).then(r => r.ok ? r.json() : []),
      authFetch(`${API}/api/v1/timesheets/summary/weekly?week_start=${weekStart}`).then(r => r.ok ? r.json() : null),
      authFetch(`${API}/api/v1/leave/balance`).then(r => r.ok ? r.json() : null),
    ]).then(([objR, evR, annR, tsR, lbR]) => {
      if (objR.status === "fulfilled") setObjectives(Array.isArray(objR.value) ? objR.value : []);
      if (evR.status  === "fulfilled") setEvents(Array.isArray(evR.value) ? evR.value : []);
      if (annR.status === "fulfilled") setAnnouncements(Array.isArray(annR.value) ? annR.value : []);
      if (tsR.status  === "fulfilled" && tsR.value) setWeeklyHours(tsR.value.total_hours ?? tsR.value.hours ?? null);
      if (lbR.status  === "fulfilled" && lbR.value) {
        const balances = Array.isArray(lbR.value) ? lbR.value : (lbR.value.balances || []);
        const annual = balances.find(b => b.leave_type === "annual");
        if (annual) setLeaveBalance(parseFloat(annual.entitled_days) - parseFloat(annual.used_days || 0));
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="edash-loading">
        <div className="edash-loading-spinner" />
        <span>Loading your dashboard…</span>
      </div>
    );
  }

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const activeObjs    = objectives.filter(o => o.status !== "completed");
  const completedObjs = objectives.filter(o => o.status === "completed").length;
  const avgProgress   = activeObjs.length ? Math.round(activeObjs.reduce((s, o) => s + (o.progress || 0), 0) / activeObjs.length) : 0;

  return (
    <div className="edash-wrap">

      {/* ── Hero greeting ── */}
      <div className="edash-hero">
        <div className="edash-hero-bg" />
        <div className="edash-hero-content">
          <div className="edash-hero-avatar">{initials}</div>
          <div>
            <h1 className="edash-hero-title">{greetingText()}, {name.split(" ")[0]} 👋</h1>
            <p className="edash-hero-sub">{today}</p>
            {(user.job_title || user.department) && (
              <span className="edash-hero-badge">{user.job_title || user.department}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="edash-stats">
        <StatCard label="Hours This Week"  value={weeklyHours != null ? `${weeklyHours}h` : "—"} icon="⏱️" color={C.teal}   to="/timesheet"  />
        <StatCard label="Active Objectives" value={activeObjs.length}                             icon="🎯" color={C.purple} to="/objectives" />
        <StatCard label="Avg Progress"      value={`${avgProgress}%`}                             icon="📈" color={C.blue}   to="/objectives" />
        <StatCard label="Leave Remaining"   value={leaveBalance != null ? `${leaveBalance}d` : "—"} icon="🌴" color={C.green} to="/leave" />
        <StatCard label="Upcoming Events"   value={events.length}                                 icon="📅" color={C.yellow} to="/calendar"   />
      </div>

      {/* ── Quick actions ── */}
      <div className="edash-section-label">Quick Actions</div>
      <div className="edash-quick-actions">
        {QUICK_ACTIONS.map(a => (
          <Link key={a.to} to={a.to} className="edash-qa" style={{ "--qa-color": a.color }}>
            <span className="edash-qa-icon">{a.icon}</span>
            <span className="edash-qa-label">{a.label}</span>
          </Link>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div className="edash-grid">

        {/* Objectives */}
        <div className="edash-card edash-card--span2">
          <div className="edash-card-head">
            <div className="edash-card-title">My Objectives</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {completedObjs > 0 && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✓ {completedObjs} completed</span>}
              <Link to="/objectives" className="edash-card-link">View all →</Link>
            </div>
          </div>
          {activeObjs.length === 0
            ? <div className="edash-empty">No active objectives. <Link to="/objectives" style={{ color: C.purple }}>Set one →</Link></div>
            : activeObjs.slice(0, 4).map(o => <ObjRow key={o.id} obj={o} />)
          }
        </div>

        {/* Announcements */}
        <div className="edash-card">
          <div className="edash-card-head">
            <div className="edash-card-title">Announcements</div>
            <Link to="/announcements" className="edash-card-link">See all →</Link>
          </div>
          {announcements.length === 0
            ? <div className="edash-empty">No announcements.</div>
            : announcements.slice(0, 3).map(a => <AnnCard key={a.id} ann={a} />)
          }
        </div>

        {/* Upcoming events */}
        <div className="edash-card">
          <div className="edash-card-head">
            <div className="edash-card-title">Upcoming Events</div>
            <Link to="/calendar" className="edash-card-link">Calendar →</Link>
          </div>
          {events.length === 0
            ? <div className="edash-empty">No upcoming events.</div>
            : events.slice(0, 6).map(e => <EventPill key={e.id} ev={e} />)
          }
        </div>

      </div>

    </div>
  );
}
