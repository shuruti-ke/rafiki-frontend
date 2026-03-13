import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { API, authFetch } from "../api.js";
import "./ManagerDashboard.css";

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const OUTCOME_META = {
  resolved:   { label: "Resolved",   color: "#34d399", bg: "rgba(52,211,153,.12)"  },
  ongoing:    { label: "Ongoing",    color: "#fbbf24", bg: "rgba(251,191,36,.12)"  },
  escalated:  { label: "Escalated",  color: "#f87171", bg: "rgba(248,113,113,.12)" },
  follow_up:  { label: "Follow-up",  color: "#3b82f6", bg: "rgba(59,130,246,.12)"  },
  pending:    { label: "Pending",    color: "#9ca3af", bg: "rgba(156,163,175,.12)" },
  improved:   { label: "Improved",   color: "#34d399", bg: "rgba(52,211,153,.12)"  },
  worse:      { label: "Declined",   color: "#f87171", bg: "rgba(248,113,113,.12)" },
};

const QUICK_ACTIONS = [
  { to: "/manager/team",      icon: "👥", label: "My Team",          desc: "Direct reports & performance" },
  { to: "/manager/coaching",  icon: "🧠", label: "AI Coaching",      desc: "Generate coaching plans"      },
  { to: "/manager/toolkit",   icon: "🛠️", label: "HR Toolkit",       desc: "Playbooks & templates"        },
  { to: "/manager/timesheets",icon: "⏱️", label: "Timesheets",       desc: "Team hours & submissions"     },
  { to: "/manager/calendar",  icon: "📅", label: "Calendar",         desc: "Upcoming events"              },
];

/* ── Animated counter ── */
function Counter({ value }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!value) return;
    const target = typeof value === "number" ? value : parseFloat(value) || 0;
    let start = 0;
    const step = target / 24;
    const iv = setInterval(() => {
      start += step;
      if (start >= target) { setDisplay(target); clearInterval(iv); }
      else setDisplay(Math.floor(start * 10) / 10);
    }, 30);
    return () => clearInterval(iv);
  }, [value]);
  return <>{typeof value === "number" && !Number.isInteger(value) ? display.toFixed(1) : Math.round(display)}</>;
}

export default function ManagerDashboard() {
  const [dash, setDash]     = useState(null);
  const [shiftDash, setShiftDash] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const name = user.full_name || user.name || "Manager";
  const firstName = name.split(" ")[0];
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    Promise.allSettled([
      authFetch(`${API}/api/v1/manager/dashboard`).then(r => r.ok ? r.json() : null),
      authFetch(`${API}/api/v1/shifts/dashboard`).then(r => r.ok ? r.json() : null),
      authFetch(`${API}/api/v1/performance-360/my-reviews`).then(r => r.ok ? r.json() : { reviews: [] }),
    ])
      .then(([dashR, shiftR, reviewR]) => {
        setDash(dashR.status === "fulfilled" ? dashR.value : null);
        setShiftDash(shiftR.status === "fulfilled" ? shiftR.value : null);
        setReviews(reviewR.status === "fulfilled" ? (reviewR.value.reviews || []) : []);
      })
      .catch(() => {
        setDash(null);
        setShiftDash(null);
        setReviews([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const d = dash || {};

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const STATS = [
    { value: d.team_size || 0,              label: "Team Members",     icon: "👥", color: "#8b5cf6", accent: "rgba(139,92,246,.15)"  },
    { value: d.avg_performance_rating || 0, label: "Avg Rating",       icon: "⭐", color: "#fbbf24", accent: "rgba(251,191,36,.15)"  },
    { value: d.coaching_sessions_count || 0,label: "Coaching Sessions", icon: "🧠", color: "#1fbfb8", accent: "rgba(31,191,184,.15)"  },
    { value: shiftDash?.pending_swap_requests || reviews.filter(r => r.status === "pending").length || 0, label: "Pending Actions", icon: "🗓️", color: "#f87171", accent: "rgba(248,113,113,.15)" },
  ];

  if (loading) {
    return (
      <div className="md-loading">
        <div className="md-loading-ring" />
        <span>Loading your dashboard…</span>
      </div>
    );
  }

  return (
    <div className="md-wrap">

      {/* ── Hero ── */}
      <div className="md-hero">
        <div className="md-hero-glow" />
        <div className="md-hero-content">
          <div className="md-hero-left">
            <div className="md-avatar">{initials}</div>
            <div>
              <h1 className="md-hero-title">{greeting}, {firstName} 👋</h1>
              <p className="md-hero-date">{today}</p>
            </div>
          </div>
          <div className="md-hero-badge">Manager Portal</div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="md-stats">
        {STATS.map((s, i) => (
          <div className="md-stat" key={i} style={{ "--sc": s.color, "--sa": s.accent, animationDelay: `${i * 80}ms` }}>
            <div className="md-stat-icon" style={{ background: s.accent }}>{s.icon}</div>
            <div className="md-stat-value" style={{ color: s.color }}>
              <Counter value={s.value} />
            </div>
            <div className="md-stat-label">{s.label}</div>
            <div className="md-stat-bar" style={{ background: `linear-gradient(90deg, ${s.color}, transparent)` }} />
          </div>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div className="md-grid">

        {/* Quick Actions */}
        <div className="md-card md-card--actions">
          <div className="md-card-head">
            <span className="md-card-title">Quick Actions</span>
          </div>
          <div className="md-actions">
            {QUICK_ACTIONS.map(a => (
              <Link key={a.to} to={a.to} className="md-action">
                <span className="md-action-icon">{a.icon}</span>
                <div>
                  <div className="md-action-label">{a.label}</div>
                  <div className="md-action-desc">{a.desc}</div>
                </div>
                <span className="md-action-arrow">→</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Team Timesheet Status */}
        <div className="md-card">
          <div className="md-card-head">
            <span className="md-card-title">⏱️ Timesheet Status</span>
            <Link to="/manager/timesheets" className="md-card-link">View all →</Link>
          </div>
          {(!d.timesheet_status || d.timesheet_status.length === 0) ? (
            <div className="md-empty">No timesheet data this week.</div>
          ) : (
            <div className="md-rows">
              {d.timesheet_status.map(m => (
                <div key={m.user_id} className="md-row">
                  <div className="md-row-avatar">{(m.name || "?")[0]}</div>
                  <div className="md-row-info">
                    <span className="md-row-name">{m.name}</span>
                    <span className="md-row-sub">{m.hours || 0}h this week</span>
                  </div>
                  <span className="md-chip" style={
                    m.submitted
                      ? { color: "#34d399", background: "rgba(52,211,153,.12)" }
                      : { color: "#f87171", background: "rgba(248,113,113,.12)" }
                  }>
                    {m.submitted ? "✓ Submitted" : "Missing"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Coaching Sessions */}
        <div className="md-card">
          <div className="md-card-head">
            <span className="md-card-title">🧠 Recent Coaching</span>
            <Link to="/manager/coaching" className="md-card-link">View all →</Link>
          </div>
          {(!d.recent_sessions || d.recent_sessions.length === 0) ? (
            <div className="md-empty">No coaching sessions yet. <Link to="/manager/coaching" style={{ color: "#8b5cf6" }}>Start one →</Link></div>
          ) : (
            <div className="md-rows">
              {d.recent_sessions.map(s => {
                const outcome = s.outcome_logged || "pending";
                const meta = OUTCOME_META[outcome] || OUTCOME_META.pending;
                return (
                  <div key={s.id} className="md-row">
                    <div className="md-row-avatar">{(s.employee_name || "?")[0]}</div>
                    <div className="md-row-info">
                      <span className="md-row-name">{s.employee_name || `Employee #${s.employee_member_id}`}</span>
                      <span className="md-row-sub md-row-concern">{s.concern}</span>
                    </div>
                    <div className="md-row-right">
                      <span className="md-chip" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                      <span className="md-row-date">{fmtDate(s.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="md-card">
          <div className="md-card-head">
            <span className="md-card-title">📆 Shift Coverage</span>
          </div>
          {!shiftDash ? (
            <div className="md-empty">No shift insights available.</div>
          ) : (
            <div className="md-rows">
              <div className="md-row">
                <div className="md-row-info">
                  <span className="md-row-name">Assignments next 7 days</span>
                  <span className="md-row-sub">Planned coverage window</span>
                </div>
                <span className="md-chip" style={{ color: "#8b5cf6", background: "rgba(139,92,246,.12)" }}>{shiftDash.assignments_next_7_days || 0}</span>
              </div>
              <div className="md-row">
                <div className="md-row-info">
                  <span className="md-row-name">Pending swaps</span>
                  <span className="md-row-sub">Requests awaiting review</span>
                </div>
                <span className="md-chip" style={{ color: "#f87171", background: "rgba(248,113,113,.12)" }}>{shiftDash.pending_swap_requests || 0}</span>
              </div>
            </div>
          )}
        </div>

        <div className="md-card">
          <div className="md-card-head">
            <span className="md-card-title">📝 Review Inbox</span>
          </div>
          {reviews.length === 0 ? (
            <div className="md-empty">No 360 reviews assigned to you right now.</div>
          ) : (
            <div className="md-rows">
              {reviews.slice(0, 5).map((review) => (
                <div key={review.id} className="md-row">
                  <div className="md-row-avatar">{(review.employee_name || "?")[0]}</div>
                  <div className="md-row-info">
                    <span className="md-row-name">{review.employee_name}</span>
                    <span className="md-row-sub">{review.cycle_name} · {review.reviewer_type}</span>
                  </div>
                  <span className="md-chip" style={review.status === "submitted" ? { color: "#34d399", background: "rgba(52,211,153,.12)" } : { color: "#fbbf24", background: "rgba(251,191,36,.12)" }}>
                    {review.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
