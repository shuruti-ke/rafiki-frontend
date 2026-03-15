import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";
import "./MyReportsPage.css";

/**
 * My Reports — coaching and other reports for the current employee.
 * Visible only to the employee, their manager, and HR admin (same as private documents).
 * Data from GET /api/v1/coaching/for-employee/:user_id (current user).
 */
export default function MyReportsPage() {
  const [coachingReports, setCoachingReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const user = typeof localStorage !== "undefined"
    ? JSON.parse(localStorage.getItem("rafiki_user") || "{}")
    : {};
  const userId = user.user_id || user.id;

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    authFetch(`${API}/api/v1/coaching/for-employee/${userId}`)
      .then((r) => (r?.ok ? r.json() : []))
      .then((d) => setCoachingReports(Array.isArray(d) ? d : []))
      .catch(() => setCoachingReports([]))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="my-reports-page">
      <h1 className="my-reports-title">My Reports</h1>
      <p className="my-reports-desc">
        Your coaching and performance reports. Only you, your manager, and HR can see these.
      </p>

      <section className="my-reports-section">
        <h2 className="my-reports-section-title">Coaching reports</h2>
        <p className="my-reports-section-desc">
          Sessions your manager has had with you. These are also visible to HR in your employee file.
        </p>
        {loading ? (
          <p className="my-reports-muted">Loading…</p>
        ) : coachingReports.length === 0 ? (
          <p className="my-reports-muted">No coaching sessions on record yet.</p>
        ) : (
          <div className="my-reports-list">
            {coachingReports.map((s) => (
              <div key={s.id} className="my-reports-card">
                <div className="my-reports-card-header">
                  <strong>
                    {s.created_at
                      ? new Date(s.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Session"}
                  </strong>
                  {s.outcome && (
                    <span className="my-reports-badge">
                      {s.outcome.replace("_", " ")}
                    </span>
                  )}
                </div>
                {s.concern && (
                  <div className="my-reports-field">
                    <span className="my-reports-label">Concern:</span> {s.concern}
                  </div>
                )}
                {s.notes && (
                  <div className="my-reports-field">
                    <span className="my-reports-label">Notes:</span> {s.notes}
                  </div>
                )}
                {s.action_items?.length > 0 && (
                  <div className="my-reports-field">
                    <span className="my-reports-label">Action items:</span>
                    <ul className="my-reports-action-list">
                      {s.action_items.map((a, i) => (
                        <li key={i}>
                          {typeof a === "object"
                            ? (a.text || a.description || JSON.stringify(a))
                            : String(a)}
                          {a.due_date && ` (due ${a.due_date})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {s.follow_up_date && (
                  <div className="my-reports-field">
                    <span className="my-reports-label">Follow-up date:</span>{" "}
                    {s.follow_up_date}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="my-reports-section">
        <h2 className="my-reports-section-title">Other reports</h2>
        <p className="my-reports-muted">
          Toolkit-generated reports and other summaries will appear here when available.
        </p>
      </section>
    </div>
  );
}
