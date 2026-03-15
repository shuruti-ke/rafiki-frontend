/**
 * Manager proxy — submit leave and clock attendance on behalf of employees
 * who don't have direct system access (field staff, support staff, etc.).
 */
import { useState, useEffect, useCallback } from "react";
import { API, authFetch } from "../api.js";
import "./ManagerOnBehalf.css";

const LEAVE_TYPES = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "maternity", label: "Maternity Leave" },
  { value: "paternity", label: "Paternity Leave" },
];

const LEAVE_LABELS = { annual: "Annual", sick: "Sick", maternity: "Maternity", paternity: "Paternity" };

export default function ManagerOnBehalf() {
  const [team, setTeam] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState(null);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: "annual",
    start_date: "",
    end_date: "",
    reason: "",
    half_day: false,
    half_day_period: "morning",
  });
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [attendanceSubmitting, setAttendanceSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [amendments, setAmendments] = useState([]);
  const [amendmentsLoading, setAmendmentsLoading] = useState(false);
  const [amendmentReviewComment, setAmendmentReviewComment] = useState("");
  const [reviewingAmendmentId, setReviewingAmendmentId] = useState(null);

  const fetchTeam = useCallback(async () => {
    setLoadingTeam(true);
    try {
      const r = await authFetch(`${API}/api/v1/manager/team`);
      const data = await r.json();
      setTeam(Array.isArray(data) ? data : []);
      if (!selectedId && data?.length) setSelectedId(data[0].user_id);
    } catch {
      setTeam([]);
    }
    setLoadingTeam(false);
  }, [selectedId]);

  useEffect(() => {
    fetchTeam();
  }, []);

  const fetchAttendanceStatus = useCallback(async () => {
    if (!selectedId) {
      setAttendanceStatus(null);
      return;
    }
    setLoadingStatus(true);
    try {
      const r = await authFetch(`${API}/api/v1/attendance/team?user_id=${selectedId}&limit=1`);
      const logs = await r.json();
      const latest = Array.isArray(logs) && logs[0];
      setAttendanceStatus(
        latest && !latest.check_out
          ? { status: "clocked_in", check_in: latest.check_in, log_id: latest.id }
          : { status: "clocked_out" }
      );
    } catch {
      setAttendanceStatus({ status: "clocked_out" });
    }
    setLoadingStatus(false);
  }, [selectedId]);

  useEffect(() => {
    fetchAttendanceStatus();
  }, [fetchAttendanceStatus]);

  const fetchAmendments = useCallback(async () => {
    setAmendmentsLoading(true);
    try {
      const r = await authFetch(`${API}/api/v1/leave/manager/amendments`);
      const data = await r.json();
      setAmendments(Array.isArray(data?.amendments) ? data.amendments : []);
    } catch {
      setAmendments([]);
    }
    setAmendmentsLoading(false);
  }, []);

  useEffect(() => {
    fetchAmendments();
  }, [fetchAmendments]);

  const handleManagerAmendmentReview = async (amendmentId, decision) => {
    setReviewingAmendmentId(amendmentId);
    try {
      const res = await authFetch(`${API}/api/v1/leave/manager/amendments/${amendmentId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, comment: amendmentReviewComment || null }),
      });
      if (res.ok) {
        setAmendmentReviewComment("");
        setMessage({ type: "success", text: `Amendment ${decision}.` });
        fetchAmendments();
      } else {
        const d = await res.json();
        setMessage({ type: "error", text: d.detail || "Failed to review amendment." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    }
    setReviewingAmendmentId(null);
  };

  const selectedEmployee = team.find((m) => m.user_id === selectedId);

  const handleLeaveSubmit = async (e) => {
    e.preventDefault();
    if (!selectedId) {
      setMessage({ type: "error", text: "Select an employee first." });
      return;
    }
    if (!leaveForm.start_date || !leaveForm.end_date) {
      setMessage({ type: "error", text: "Enter start and end dates." });
      return;
    }
    setMessage({ type: "", text: "" });
    setLeaveSubmitting(true);
    try {
      const res = await authFetch(`${API}/api/v1/leave/apply-on-behalf`, {
        method: "POST",
        body: JSON.stringify({
          employee_id: selectedId,
          leave_type: leaveForm.leave_type,
          start_date: leaveForm.start_date,
          end_date: leaveForm.end_date,
          reason: leaveForm.reason || null,
          half_day: leaveForm.half_day,
          half_day_period: leaveForm.half_day ? leaveForm.half_day_period : null,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Leave application submitted on behalf of employee." });
        setLeaveForm({ leave_type: "annual", start_date: "", end_date: "", reason: "", half_day: false, half_day_period: "morning" });
      } else {
        setMessage({ type: "error", text: d.detail || "Failed to submit leave." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    }
    setLeaveSubmitting(false);
  };

  const handleClockIn = async () => {
    if (!selectedId) return;
    setAttendanceSubmitting(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await authFetch(`${API}/api/v1/attendance/clock-in-on-behalf`, {
        method: "POST",
        body: JSON.stringify({ employee_id: selectedId }),
      });
      const d = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Clocked in on behalf of employee." });
        fetchAttendanceStatus();
      } else {
        setMessage({ type: "error", text: d.detail || "Failed to clock in." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    }
    setAttendanceSubmitting(false);
  };

  const handleClockOut = async () => {
    if (!selectedId) return;
    setAttendanceSubmitting(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await authFetch(`${API}/api/v1/attendance/clock-out-on-behalf`, {
        method: "POST",
        body: JSON.stringify({ employee_id: selectedId }),
      });
      const d = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Clocked out on behalf of employee." });
        fetchAttendanceStatus();
      } else {
        setMessage({ type: "error", text: d.detail || "Failed to clock out." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    }
    setAttendanceSubmitting(false);
  };

  if (loadingTeam) {
    return (
      <div className="mgr-ob-page">
        <p className="mgr-ob-loading">Loading team…</p>
      </div>
    );
  }

  return (
    <div className="mgr-ob-page">
      <h1 className="mgr-ob-title">Act on behalf of employee</h1>
      <p className="mgr-ob-desc">
        Submit leave and record attendance for team members who don’t have direct access to the system (e.g. field staff, support staff).
      </p>

      {/* Leave amendments — pending requests from direct reports */}
      {amendments.length > 0 && (
        <section className="mgr-ob-card mgr-ob-amendments">
          <h2 className="mgr-ob-card-title">Leave amendments pending your review</h2>
          {amendmentsLoading ? (
            <p className="mgr-ob-muted">Loading…</p>
          ) : (
            <>
              <input
                type="text"
                className="mgr-ob-amendment-comment"
                placeholder="Comment for your decision (optional, applies to next action)"
                value={amendmentReviewComment}
                onChange={(e) => setAmendmentReviewComment(e.target.value)}
              />
              <ul className="mgr-ob-amendments-list">
                {amendments.map((am) => (
                  <li key={am.id} className="mgr-ob-amendment-item">
                    <div className="mgr-ob-amendment-info">
                      <strong>{am.employee_name || am.employee_email || "Employee"}</strong>
                      <span className="mgr-ob-amendment-type">{LEAVE_LABELS[am.leave_type] || am.leave_type} leave</span>
                      {am.cancel_leave ? (
                        <span>Requested: <strong>Cancel</strong> approved leave (was {am.current_start_date} → {am.current_end_date})</span>
                      ) : (
                        <span>Requested: change to {am.requested_start_date} → {am.requested_end_date} ({am.requested_working_days} days)</span>
                      )}
                      {am.requested_reason && <span className="mgr-ob-amendment-reason">Reason: {am.requested_reason}</span>}
                    </div>
                    <div className="mgr-ob-amendment-actions">
                      <button
                        type="button"
                        className="mgr-ob-btn mgr-ob-btn--approve"
                        disabled={reviewingAmendmentId !== null}
                        onClick={() => handleManagerAmendmentReview(am.id, "approved")}
                      >
                        {reviewingAmendmentId === am.id ? "…" : "Approve"}
                      </button>
                      <button
                        type="button"
                        className="mgr-ob-btn mgr-ob-btn--reject"
                        disabled={reviewingAmendmentId !== null}
                        onClick={() => handleManagerAmendmentReview(am.id, "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <div className="mgr-ob-select-section">
        <label className="mgr-ob-label">Select employee</label>
        <select
          className="mgr-ob-select"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">— Select —</option>
          {team.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.name || m.email || m.user_id} {m.department ? ` · ${m.department}` : ""}
            </option>
          ))}
        </select>
      </div>

      {!selectedId && team.length > 0 && (
        <p className="mgr-ob-hint">Select an employee above to submit leave or record attendance.</p>
      )}

      {selectedEmployee && (
        <>
          {message.text && (
            <div className={`mgr-ob-msg mgr-ob-msg--${message.type}`}>{message.text}</div>
          )}

          <section className="mgr-ob-card">
            <h2 className="mgr-ob-card-title">Attendance</h2>
            {loadingStatus ? (
              <p className="mgr-ob-muted">Checking status…</p>
            ) : (
              <div className="mgr-ob-attendance">
                <p className="mgr-ob-status">
                  {attendanceStatus?.status === "clocked_in" ? (
                    <>Clocked in since {attendanceStatus.check_in ? new Date(attendanceStatus.check_in).toLocaleString() : "—"}</>
                  ) : (
                    <>Not clocked in</>
                  )}
                </p>
                <div className="mgr-ob-attendance-actions">
                  <button
                    type="button"
                    className="mgr-ob-btn mgr-ob-btn--in"
                    onClick={handleClockIn}
                    disabled={attendanceSubmitting || attendanceStatus?.status === "clocked_in"}
                  >
                    {attendanceSubmitting ? "…" : "Clock in"}
                  </button>
                  <button
                    type="button"
                    className="mgr-ob-btn mgr-ob-btn--out"
                    onClick={handleClockOut}
                    disabled={attendanceSubmitting || attendanceStatus?.status !== "clocked_in"}
                  >
                    {attendanceSubmitting ? "…" : "Clock out"}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="mgr-ob-card">
            <h2 className="mgr-ob-card-title">Submit leave on behalf</h2>
            <form className="mgr-ob-leave-form" onSubmit={handleLeaveSubmit}>
              <div className="mgr-ob-field">
                <label>Leave type</label>
                <select
                  value={leaveForm.leave_type}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, leave_type: e.target.value }))}
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="mgr-ob-row">
                <div className="mgr-ob-field">
                  <label>Start date</label>
                  <input
                    type="date"
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm((f) => ({ ...f, start_date: e.target.value }))}
                  />
                </div>
                <div className="mgr-ob-field">
                  <label>End date</label>
                  <input
                    type="date"
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm((f) => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="mgr-ob-field">
                <label>Reason (optional)</label>
                <input
                  type="text"
                  placeholder="Reason for leave"
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                />
              </div>
              <div className="mgr-ob-field">
                <label>
                  <input
                    type="checkbox"
                    checked={leaveForm.half_day}
                    onChange={(e) => setLeaveForm((f) => ({ ...f, half_day: e.target.checked }))}
                  />
                  Half day
                </label>
                {leaveForm.half_day && (
                  <select
                    value={leaveForm.half_day_period}
                    onChange={(e) => setLeaveForm((f) => ({ ...f, half_day_period: e.target.value }))}
                  >
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                  </select>
                )}
              </div>
              <button type="submit" className="mgr-ob-btn mgr-ob-btn--primary" disabled={leaveSubmitting}>
                {leaveSubmitting ? "Submitting…" : "Submit leave"}
              </button>
            </form>
          </section>
        </>
      )}

      {team.length === 0 && (
        <div className="mgr-ob-empty">
          <p>No team members found. You can only act on behalf of your direct reports or team.</p>
        </div>
      )}
    </div>
  );
}
