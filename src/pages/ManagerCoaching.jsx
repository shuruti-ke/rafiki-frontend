import { useState, useEffect } from "react";
import { API } from "../api.js";
import "./ManagerCoaching.css";

export default function ManagerCoaching() {
  const [team, setTeam] = useState([]);
  const [selectedMember, setSelectedMember] = useState("");
  const [concern, setConcern] = useState("");
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");

  // History
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("new"); // "new" | "history"

  useEffect(() => {
    fetch(`${API}/api/v1/manager/team`)
      .then((r) => r.json())
      .then((data) => setTeam(Array.isArray(data) ? data : []))
      .catch(() => {});

    loadHistory();
  }, []);

  function loadHistory() {
    fetch(`${API}/api/v1/manager/coaching/history`)
      .then((r) => r.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => {});
  }

  async function handleGenerate() {
    if (!selectedMember || !concern.trim()) return;

    setGenerating(true);
    setError("");
    setPlan(null);

    try {
      const r = await fetch(`${API}/api/v1/manager/coaching`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_member_id: Number(selectedMember),
          concern: concern.trim(),
        }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${r.status}`);
      }

      const data = await r.json();
      setPlan(data);
      loadHistory();
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function logOutcome(sessionId, outcome) {
    try {
      await fetch(`${API}/api/v1/manager/coaching/${sessionId}/outcome`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      loadHistory();
    } catch (e) {
      // silently fail
    }
  }

  return (
    <div className="mgr-coaching">
      <h1 className="mgr-coaching-title">AI Coaching Assistant</h1>
      <p className="mgr-coaching-sub">
        Generate performance coaching plans using employee data. Wellbeing data is never used.
      </p>

      {/* Tabs */}
      <div className="mgr-coaching-tabs">
        <button
          className={`mgr-tab ${tab === "new" ? "active" : ""}`}
          onClick={() => setTab("new")}
        >
          New Session
        </button>
        <button
          className={`mgr-tab ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          History ({history.length})
        </button>
      </div>

      {tab === "new" && (
        <div className="mgr-coaching-form">
          <div className="mgr-form-group">
            <label className="mgr-form-label">Team Member</label>
            <select
              className="mgr-form-select"
              value={selectedMember}
              onChange={(e) => setSelectedMember(e.target.value)}
            >
              <option value="">Select a team member...</option>
              {team.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}{m.job_title ? ` — ${m.job_title}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="mgr-form-group">
            <label className="mgr-form-label">Your Concern</label>
            <textarea
              className="mgr-form-textarea"
              rows={4}
              placeholder="Describe the performance issue or situation you'd like coaching on (e.g., 'Missing deadlines, seems disengaged in meetings')..."
              value={concern}
              onChange={(e) => setConcern(e.target.value)}
              maxLength={2000}
            />
            <div className="mgr-form-hint">{concern.length}/2000</div>
          </div>

          <button
            className="btn btnPrimary mgr-generate-btn"
            onClick={handleGenerate}
            disabled={generating || !selectedMember || !concern.trim()}
          >
            {generating ? "Generating..." : "Generate Coaching Plan"}
          </button>

          {error && <div className="mgr-coaching-error">{error}</div>}

          {/* Result */}
          {plan && (
            <div className="mgr-plan">
              <h2 className="mgr-plan-heading">Coaching Plan</h2>

              <div className="mgr-plan-section">
                <h3>Situation Summary</h3>
                <p>{plan.situation_summary}</p>
              </div>

              <div className="mgr-plan-section">
                <h3>Conversation Script</h3>
                <pre className="mgr-plan-script">{plan.conversation_script}</pre>
              </div>

              {plan.action_options && plan.action_options.length > 0 && (
                <div className="mgr-plan-section">
                  <h3>Action Options</h3>
                  <ul className="mgr-plan-actions">
                    {plan.action_options.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {plan.escalation_path && (
                <div className="mgr-plan-section">
                  <h3>Escalation Path</h3>
                  <p>{plan.escalation_path}</p>
                </div>
              )}

              {/* Log outcome */}
              <div className="mgr-plan-outcome">
                <h3>Log Outcome (after your conversation)</h3>
                <div className="mgr-outcome-buttons">
                  <button className="btn mgr-outcome-btn improved" onClick={() => logOutcome(plan.session_id, "improved")}>
                    Improved
                  </button>
                  <button className="btn mgr-outcome-btn same" onClick={() => logOutcome(plan.session_id, "same")}>
                    Same
                  </button>
                  <button className="btn mgr-outcome-btn worse" onClick={() => logOutcome(plan.session_id, "worse")}>
                    Worse
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="mgr-coaching-history">
          {history.length === 0 ? (
            <p className="mgr-history-empty">No coaching sessions yet.</p>
          ) : (
            history.map((s) => (
              <div key={s.id} className="mgr-history-card">
                <div className="mgr-history-header">
                  <strong>{s.employee_name || `Employee #${s.employee_member_id}`}</strong>
                  <span className="mgr-history-date">
                    {s.created_at ? new Date(s.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
                <div className="mgr-history-concern">{s.concern}</div>
                <div className="mgr-history-footer">
                  {s.outcome_logged ? (
                    <span className={`mgr-outcome mgr-outcome-${s.outcome_logged}`}>
                      {s.outcome_logged}
                    </span>
                  ) : (
                    <div className="mgr-outcome-buttons-small">
                      <button className="btn btnTiny" onClick={() => logOutcome(s.id, "improved")}>Improved</button>
                      <button className="btn btnTiny" onClick={() => logOutcome(s.id, "same")}>Same</button>
                      <button className="btn btnTiny" onClick={() => logOutcome(s.id, "worse")}>Worse</button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
