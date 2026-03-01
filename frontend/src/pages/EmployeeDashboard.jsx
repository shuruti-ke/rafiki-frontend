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
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function EmployeeDashboard() {
  const user = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const name = user.full_name || user.name || user.email || "there";

  const [objectives, setObjectives] = useState([]);
  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [weeklyHours, setWeeklyHours] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const weekStart = monday.toISOString().slice(0, 10);

    const end = new Date();
    end.setDate(end.getDate() + 30);
    const calStart = now.toISOString();
    const calEnd = end.toISOString();

    Promise.allSettled([
      authFetch(`${API}/api/v1/objectives/`).then(r => r.ok ? r.json() : []),
      authFetch(`${API}/api/v1/calendar/?start=${encodeURIComponent(calStart)}&end=${encodeURIComponent(calEnd)}`).then(r => r.ok ? r.json() : []),
      authFetch(`${API}/api/v1/announcements/`).then(r => r.ok ? r.json() : []),
      authFetch(`${API}/api/v1/timesheets/summary/weekly?week_start=${weekStart}`).then(r => r.ok ? r.json() : null),
      authFetch(`${API}/api/v1/messages/conversations`).then(r => r.ok ? r.json() : []),
    ]).then(([objR, evR, annR, tsR, msgR]) => {
      if (objR.status === "fulfilled") setObjectives(Array.isArray(objR.value) ? objR.value : []);
      if (evR.status === "fulfilled") setEvents(Array.isArray(evR.value) ? evR.value : []);
      if (annR.status === "fulfilled") setAnnouncements(Array.isArray(annR.value) ? annR.value : []);
      if (tsR.status === "fulfilled" && tsR.value) setWeeklyHours(tsR.value.total_hours ?? tsR.value.hours ?? null);
      if (msgR.status === "fulfilled" && Array.isArray(msgR.value)) {
        setUnreadCount(msgR.value.reduce((s, c) => s + (c.unread_count || 0), 0));
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="edash-loading">Loading your dashboard...</div>;

  const topObjectives = objectives.slice(0, 3);
  const upcomingEvents = events.slice(0, 5);
  const recentAnnouncements = announcements.slice(0, 3);
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="edash-wrap">
      {/* Greeting */}
      <div className="edash-greeting">
        <h1>{greetingText()}, {name.split(" ")[0]}</h1>
        <div className="edash-greeting-meta">
          <span>{today}</span>
          {(user.department || user.job_title) && (
            <span className="edash-badge">{user.job_title || user.department}</span>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="edash-stats">
        <div className="edash-stat" style={{ "--stat-color": "#8b5cf6" }}>
          <div className="edash-stat-value">{objectives.length}</div>
          <div className="edash-stat-label">My Objectives</div>
        </div>
        <div className="edash-stat" style={{ "--stat-color": "#3b82f6" }}>
          <div className="edash-stat-value">{weeklyHours != null ? weeklyHours : "—"}</div>
          <div className="edash-stat-label">Hours This Week</div>
        </div>
        <div className="edash-stat" style={{ "--stat-color": "#34d399" }}>
          <div className="edash-stat-value">{upcomingEvents.length}</div>
          <div className="edash-stat-label">Upcoming Events</div>
        </div>
        <div className="edash-stat" style={{ "--stat-color": "#f87171" }}>
          <div className="edash-stat-value">{unreadCount}</div>
          <div className="edash-stat-label">Unread Messages</div>
        </div>
      </div>

      {/* 3-column body */}
      <div className="edash-body">
        {/* Objectives */}
        <div className="edash-card">
          <div className="edash-card-title">Active Objectives</div>
          {topObjectives.length === 0 && <div className="edash-empty">No objectives yet.</div>}
          {topObjectives.map(o => {
            const pct = Math.round(o.progress || 0);
            return (
              <div key={o.id} className="edash-obj">
                <div className="edash-obj-top">
                  <span className="edash-obj-name">{o.title}</span>
                  <span className="edash-obj-pct">{pct}%</span>
                </div>
                <div className="edash-obj-track">
                  <div className="edash-obj-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Events */}
        <div className="edash-card">
          <div className="edash-card-title">Upcoming Events</div>
          {upcomingEvents.length === 0 && <div className="edash-empty">No upcoming events.</div>}
          {upcomingEvents.map(e => (
            <div key={e.id} className="edash-ev">
              <span className="edash-ev-dot" style={{ background: e.color || "#8b5cf6" }} />
              <span className="edash-ev-title">{e.title}</span>
              <span className="edash-ev-date">{fmtShortDate(e.start_time)}</span>
            </div>
          ))}
        </div>

        {/* Announcements */}
        <div className="edash-card">
          <div className="edash-card-title">Recent Announcements</div>
          {recentAnnouncements.length === 0 && <div className="edash-empty">No announcements.</div>}
          {recentAnnouncements.map(a => (
            <div key={a.id} className="edash-ann">
              <div className="edash-ann-title">{a.title}</div>
              <div className="edash-ann-body">{a.body || a.content || ""}</div>
              <div className="edash-ann-date">{fmtShortDate(a.created_at)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="edash-actions">
        <Link to="/chat" className="edash-action">Chat with Rafiki</Link>
        <Link to="/timesheet" className="edash-action">Log Time</Link>
        <Link to="/my-documents" className="edash-action">My Documents</Link>
        <Link to="/objectives" className="edash-action">View Objectives</Link>
      </div>
    </div>
  );
}
