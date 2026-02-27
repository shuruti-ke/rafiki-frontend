import { useState, useEffect } from "react";
import { API, authFetch, authFetch } from "../api.js";
import "./ManagerTeam.css";

export default function ManagerTeam() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [evals, setEvals] = useState({});

  useEffect(() => {
    authFetch(`${API}/api/v1/manager/team`)
      .then((r) => r.json())
      .then((data) => setTeam(Array.isArray(data) ? data : []))
      .catch(() => setTeam([]))
      .finally(() => setLoading(false));
  }, []);

  function toggleExpand(userId) {
    if (expanded === userId) {
      setExpanded(null);
      return;
    }
    setExpanded(userId);

    // Load evaluations if not cached
    if (!evals[userId]) {
      authFetch(`${API}/api/v1/manager/team/${userId}/evaluations`)
        .then((r) => r.json())
        .then((data) =>
          setEvals((prev) => ({ ...prev, [userId]: Array.isArray(data) ? data : [] }))
        )
        .catch(() =>
          setEvals((prev) => ({ ...prev, [userId]: [] }))
        );
    }
  }

  if (loading) return <p className="mgr-loading">Loading team...</p>;

  return (
    <div className="mgr-team">
      <h1 className="mgr-team-title">My Team</h1>
      <p className="mgr-team-sub">
        View your direct reports and their performance data. Wellbeing data is never shown here.
      </p>

      {team.length === 0 ? (
        <div className="mgr-team-empty">
          <p>No team members found.</p>
          <p className="mgr-team-empty-hint">
            Ask your HR admin to configure your manager scope, or add employee evaluations first.
          </p>
        </div>
      ) : (
        <div className="mgr-team-list">
          {team.map((m) => (
            <div key={m.user_id} className="mgr-team-card">
              <button
                className="mgr-team-card-header"
                onClick={() => toggleExpand(m.user_id)}
              >
                <div className="mgr-team-avatar">
                  {(m.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="mgr-team-info">
                  <div className="mgr-team-name">{m.name}</div>
                  <div className="mgr-team-meta">
                    {m.job_title || "No title"}{m.department ? ` · ${m.department}` : ""}
                  </div>
                </div>
                <div className="mgr-team-rating">
                  {m.last_evaluation_rating ? (
                    <span className="mgr-rating-badge">{m.last_evaluation_rating}/5</span>
                  ) : (
                    <span className="mgr-rating-none">No rating</span>
                  )}
                </div>
                <span className={`mgr-expand-icon ${expanded === m.user_id ? "open" : ""}`}>
                  &#9662;
                </span>
              </button>

              {expanded === m.user_id && (
                <div className="mgr-team-detail">
                  <h3>Performance Evaluations</h3>
                  {!evals[m.user_id] ? (
                    <p className="mgr-detail-loading">Loading...</p>
                  ) : evals[m.user_id].length === 0 ? (
                    <p className="mgr-detail-empty">No evaluations on record.</p>
                  ) : (
                    <div className="mgr-eval-list">
                      {evals[m.user_id].map((ev) => (
                        <div key={ev.id} className="mgr-eval-card">
                          <div className="mgr-eval-header">
                            <strong>{ev.evaluation_period}</strong>
                            <span className="mgr-rating-badge">{ev.overall_rating}/5</span>
                          </div>
                          {ev.strengths && (
                            <div className="mgr-eval-field">
                              <span className="mgr-eval-label">Strengths:</span> {ev.strengths}
                            </div>
                          )}
                          {ev.areas_for_improvement && (
                            <div className="mgr-eval-field">
                              <span className="mgr-eval-label">Areas for improvement:</span> {ev.areas_for_improvement}
                            </div>
                          )}
                          {ev.goals_for_next_period && (
                            <div className="mgr-eval-field">
                              <span className="mgr-eval-label">Goals:</span> {ev.goals_for_next_period}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
