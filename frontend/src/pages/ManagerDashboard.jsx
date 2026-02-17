import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { API } from "../api.js";
import "./ManagerDashboard.css";

export default function ManagerDashboard() {
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/v1/manager/dashboard`)
      .then((r) => r.json())
      .then(setDash)
      .catch(() => setDash(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="mgr-loading">Loading dashboard...</p>;

  const d = dash || {};

  return (
    <div className="mgr-dash">
      <h1 className="mgr-dash-title">Manager Dashboard</h1>
      <p className="mgr-dash-sub">
        Performance overview and coaching tools for your team.
      </p>

      {/* Metric cards */}
      <div className="mgr-dash-metrics">
        <div className="mgr-metric-card">
          <div className="mgr-metric-value">{d.team_size || 0}</div>
          <div className="mgr-metric-label">Team Members</div>
        </div>
        <div className="mgr-metric-card">
          <div className="mgr-metric-value">
            {d.avg_performance_rating ? d.avg_performance_rating.toFixed(1) : "—"}
          </div>
          <div className="mgr-metric-label">Avg Rating</div>
        </div>
        <div className="mgr-metric-card">
          <div className="mgr-metric-value">{d.coaching_sessions_count || 0}</div>
          <div className="mgr-metric-label">Coaching Sessions</div>
        </div>
        <div className="mgr-metric-card">
          <div className="mgr-metric-value">{d.upcoming_deadlines || 0}</div>
          <div className="mgr-metric-label">Upcoming Deadlines</div>
        </div>
      </div>

      {/* Quick actions */}
      <h2 className="mgr-section-title">Quick Actions</h2>
      <div className="mgr-dash-actions">
        <Link to="/manager/team" className="mgr-action-card">
          <strong>My Team</strong>
          <p>View direct reports, profiles, and performance history.</p>
        </Link>
        <Link to="/manager/coaching" className="mgr-action-card">
          <strong>AI Coaching</strong>
          <p>Generate coaching plans using performance data.</p>
        </Link>
        <Link to="/manager/toolkit" className="mgr-action-card">
          <strong>HR Toolkit</strong>
          <p>Access playbooks, templates, and conversation scripts.</p>
        </Link>
      </div>

      {/* Recent coaching sessions */}
      {d.recent_sessions && d.recent_sessions.length > 0 && (
        <>
          <h2 className="mgr-section-title">Recent Coaching Sessions</h2>
          <div className="mgr-dash-sessions">
            {d.recent_sessions.map((s) => (
              <div key={s.id} className="mgr-session-row">
                <div className="mgr-session-info">
                  <strong>{s.employee_name || `Employee #${s.employee_member_id}`}</strong>
                  <span className="mgr-session-concern">{s.concern}</span>
                </div>
                <div className="mgr-session-meta">
                  {s.outcome_logged ? (
                    <span className={`mgr-outcome mgr-outcome-${s.outcome_logged}`}>
                      {s.outcome_logged}
                    </span>
                  ) : (
                    <span className="mgr-outcome mgr-outcome-pending">pending</span>
                  )}
                  <span className="mgr-session-date">
                    {s.created_at ? new Date(s.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
