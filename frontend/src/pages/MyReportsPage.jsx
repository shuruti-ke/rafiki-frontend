import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";
import "./MyReportsPage.css";

function formatSessionDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * My Reports — coaching and other reports for the current employee.
 * Visible only to the employee, their manager, and HR admin (same as private documents).
 * Data from GET /api/v1/coaching/for-employee/:user_id (current user).
 */
export default function MyReportsPage() {
  const [coachingReports, setCoachingReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);

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

  useEffect(() => {
    if (!selectedReport) return;
    const onEscape = (e) => {
      if (e.key === "Escape") setSelectedReport(null);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [selectedReport]);

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
              <div
                key={s.id}
                className="my-reports-card my-reports-card--clickable"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedReport(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedReport(s);
                  }
                }}
                aria-label={`View coaching report from ${s.created_at ? new Date(s.created_at).toLocaleDateString() : "session"}`}
              >
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
                      {String(s.outcome).replace("_", " ")}
                    </span>
                  )}
                </div>
                {s.concern && (
                  <div className="my-reports-field">
                    <span className="my-reports-label">Concern:</span> {s.concern}
                  </div>
                )}
                <span className="my-reports-card-hint">Click to view full report</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Detail modal — full report with manager comments, date/time, etc. */}
      {selectedReport && (
        <div
          className="my-reports-modal-backdrop"
          onClick={() => setSelectedReport(null)}
          onKeyDown={(e) => e.key === "Escape" && setSelectedReport(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
        >
          <div
            className="my-reports-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="my-reports-modal-header">
              <h2 id="report-modal-title" className="my-reports-modal-title">
                Coaching session report
              </h2>
              <button
                type="button"
                className="my-reports-modal-close"
                onClick={() => setSelectedReport(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="my-reports-modal-body">
              <div className="my-reports-detail-row">
                <span className="my-reports-label">Session date & time</span>
                <span>{formatSessionDateTime(selectedReport.created_at)}</span>
              </div>
              {selectedReport.updated_at && String(selectedReport.updated_at) !== String(selectedReport.created_at) && (
                <div className="my-reports-detail-row">
                  <span className="my-reports-label">Last updated</span>
                  <span>{formatSessionDateTime(selectedReport.updated_at)}</span>
                </div>
              )}
              {selectedReport.outcome && (
                <div className="my-reports-detail-row">
                  <span className="my-reports-label">Outcome</span>
                  <span className="my-reports-badge my-reports-badge--inline">
                    {String(selectedReport.outcome).replace("_", " ")}
                  </span>
                </div>
              )}
              <div className="my-reports-detail-row">
                <span className="my-reports-label">Concern discussed</span>
                <p className="my-reports-detail-value">{selectedReport.concern || "—"}</p>
              </div>
              {selectedReport.notes && (
                <div className="my-reports-detail-block">
                  <span className="my-reports-label">Manager comments</span>
                  <p className="my-reports-detail-value my-reports-detail-notes">{selectedReport.notes}</p>
                </div>
              )}
              {selectedReport.action_items?.length > 0 && (
                <div className="my-reports-detail-block">
                  <span className="my-reports-label">Action items</span>
                  <ul className="my-reports-action-list">
                    {selectedReport.action_items.map((a, i) => (
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
              {selectedReport.follow_up_date && (
                <div className="my-reports-detail-row">
                  <span className="my-reports-label">Follow-up date</span>
                  <span>{selectedReport.follow_up_date}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <section className="my-reports-section">
        <h2 className="my-reports-section-title">Other reports</h2>
        <p className="my-reports-muted">
          Toolkit-generated reports and other summaries will appear here when available.
        </p>
      </section>
    </div>
  );
}
