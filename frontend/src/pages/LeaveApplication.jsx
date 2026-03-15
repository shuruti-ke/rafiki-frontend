import { useState, useEffect, useCallback } from "react";
import "./LeaveApplication.css";

const API = import.meta.env.VITE_API_URL || "https://rafiki-backend.onrender.com";

function authFetch(url, opts = {}) {
  const token = localStorage.getItem("rafiki_token");
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
}

const LEAVE_LABELS = {
  annual: "Annual Leave",
  sick: "Sick Leave",
  maternity: "Maternity Leave",
  paternity: "Paternity Leave",
};

const STATUS_BADGE = {
  pending: { label: "Pending", cls: "badge-pending" },
  approved: { label: "Approved", cls: "badge-approved" },
  rejected: { label: "Rejected", cls: "badge-rejected" },
  cancelled: { label: "Cancelled", cls: "badge-cancelled" },
  amendment_pending: { label: "Amendment Pending", cls: "badge-amendment-pending" },
  amended: { label: "Amended", cls: "badge-amended" },
};

function workingDays(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  if (e < s) return 0;
  let count = 0, cur = new Date(s);
  while (cur <= e) { if (cur.getDay() !== 0 && cur.getDay() !== 6) count++; cur.setDate(cur.getDate() + 1); }
  return count;
}

export default function LeaveApplication() {
  const [tab, setTab] = useState("apply");
  const [balances, setBalances] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [applications, setApplications] = useState([]);
  const [amendments, setAmendments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [amendSubmitting, setAmendSubmitting] = useState(false);
  const [amendModal, setAmendModal] = useState(null);
  const [amendForm, setAmendForm] = useState({
    start_date: "",
    end_date: "",
    reason: "",
    cancel_leave: false,
    half_day: false,
    half_day_period: "morning",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    leave_type: "annual",
    start_date: "",
    end_date: "",
    reason: "",
    half_day: false,
    half_day_period: "morning",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes, appRes, amendRes] = await Promise.all([
        authFetch(`${API}/api/v1/leave/balance`),
        authFetch(`${API}/api/v1/leave/my-applications`),
        authFetch(`${API}/api/v1/leave/amendments/my`),
      ]);
      if (balRes.ok) {
        const d = await balRes.json();
        setBalances(d.balances || []);
        setPolicy(d.policy);
      }
      if (appRes.ok) {
        const d = await appRes.json();
        setApplications(d.applications || []);
      }
      if (amendRes.ok) {
        const d = await amendRes.json();
        setAmendments(d.amendments || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedBalance = balances.find(b => b.leave_type === form.leave_type);
  const days = form.half_day ? 0.5 : workingDays(form.start_date, form.end_date);
  const available = selectedBalance?.available_days ?? 0;

  const handleSubmit = async () => {
    setError(""); setSuccess("");
    if (!form.start_date || !form.end_date) { setError("Please select start and end dates."); return; }
    if (days <= 0) { setError("No working days in selected range."); return; }
    if (days > available) { setError(`Insufficient balance. You have ${available} days available.`); return; }

    setSubmitting(true);
    try {
      const res = await authFetch(`${API}/api/v1/leave/apply`, {
        method: "POST",
        body: JSON.stringify({
          leave_type: form.leave_type,
          start_date: form.start_date,
          end_date: form.end_date,
          reason: form.reason || null,
          half_day: form.half_day,
          half_day_period: form.half_day ? form.half_day_period : null,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setSuccess("✅ Leave application submitted successfully! HR will review it shortly.");
        setForm({ leave_type: "annual", start_date: "", end_date: "", reason: "", half_day: false, half_day_period: "morning" });
        fetchData();
        setTimeout(() => setTab("history"), 1500);
      } else {
        setError(d.detail || "Failed to submit application.");
      }
    } catch (e) { setError("Network error. Please try again."); }
    setSubmitting(false);
  };

  const handleCancel = async (id) => {
    if (!confirm("Cancel this leave application?")) return;
    const res = await authFetch(`${API}/api/v1/leave/cancel/${id}`, { method: "DELETE" });
    if (res.ok) fetchData();
  };

  const handleOpenAmendment = (app) => {
    setError("");
    setSuccess("");
    setAmendModal(app);
    setAmendForm({
      start_date: app.start_date || "",
      end_date: app.end_date || "",
      reason: "",
      cancel_leave: false,
      half_day: !!app.half_day,
      half_day_period: app.half_day_period || "morning",
    });
  };

  const handleSubmitAmendment = async () => {
    if (!amendModal) return;
    setAmendSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const payload = { ...amendForm };
      if (payload.cancel_leave) {
        delete payload.start_date;
        delete payload.end_date;
      }
      const res = await authFetch(`${API}/api/v1/leave/amendments/${amendModal.id}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (res.ok) {
        setSuccess("✅ Amendment request sent for HR review.");
        setAmendModal(null);
        fetchData();
      } else {
        setError(d.detail || "Failed to request amendment.");
      }
    } catch {
      setError("Network error while submitting amendment.");
    }
    setAmendSubmitting(false);
  };

  if (loading) return (
    <div className="leave-loading">
      <div className="leave-spinner" />
      <p>Loading leave information…</p>
    </div>
  );

  return (
    <div className="leave-page">
      <div className="leave-header">
        <h1>Leave Management</h1>
        <p>Apply for leave, track your balance, and view application history. Need to change or cancel approved leave? Request an amendment — your manager will be notified for re-approval. Approved leave appears on your <a href="/calendar" className="leave-link">Calendar</a>.</p>
      </div>

      {/* Balance Cards */}
      <div className="balance-grid">
        {balances.filter(b => ["annual","sick","maternity","paternity"].includes(b.leave_type) || b.entitled_days > 0).map(b => (
          <div key={b.leave_type} className={`balance-card ${form.leave_type === b.leave_type && tab === "apply" ? "balance-card--selected" : ""}`}
            onClick={() => { setForm(f => ({ ...f, leave_type: b.leave_type })); setTab("apply"); }}>
            <div className="balance-type">{LEAVE_LABELS[b.leave_type] || b.leave_type}</div>
            <div className="balance-available">{b.available_days}</div>
            <div className="balance-label">days available</div>
            <div className="balance-track">
              <div className="balance-track-fill"
                style={{ width: `${b.entitled_days > 0 ? Math.min(100, (b.used_days / (b.entitled_days + b.carried_over_days)) * 100) : 0}%` }} />
            </div>
            <div className="balance-meta">
              <span>{b.used_days} used</span>
              <span>{b.entitled_days} entitled</span>
              {b.carried_over_days > 0 && (
                <span className={`carry-badge ${b.carry_over_expired ? "carry-expired" : ""}`}>
                  +{b.carried_over_days} carried {b.carry_over_expired ? "(expired)" : `(expires ${b.carry_over_expiry})`}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Policy Banner */}
      {policy && (
        <div className="policy-banner">
          <span className="policy-icon">📋</span>
          <div>
            <strong>Leave Policy:</strong> Annual {policy.annual_leave_days} days · Sick {policy.sick_leave_days} days ·
            Carry-over: {policy.carry_over_policy === "none" ? "Not allowed" :
              policy.carry_over_policy === "capped" ? `Up to ${policy.carry_over_days} days (expire after ${policy.carry_over_expiry_months} months)` :
              `Unlimited (expire after ${policy.carry_over_expiry_months} months)`}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="leave-tabs">
        {["apply","history"].map(t => (
          <button key={t} className={`leave-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "apply" ? "📝 Apply for Leave" : "📄 My Applications"}
          </button>
        ))}
      </div>

      {/* Apply Form */}
      {tab === "apply" && (
        <div className="leave-form-card">
          <h2>New Leave Application</h2>

          {error && <div className="leave-alert leave-alert--error">{error}</div>}
          {success && <div className="leave-alert leave-alert--success">{success}</div>}

          <div className="form-grid">
            <div className="form-field">
              <label>Leave Type</label>
              <select value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}>
                {balances.map(b => (
                  <option key={b.leave_type} value={b.leave_type}>
                    {LEAVE_LABELS[b.leave_type] || b.leave_type} ({b.available_days} days available)
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Half Day?</label>
              <div className="toggle-row">
                <label className="toggle">
                  <input type="checkbox" checked={form.half_day} onChange={e => setForm(f => ({ ...f, half_day: e.target.checked }))} />
                  <span className="toggle-slider" />
                </label>
                {form.half_day && (
                  <select value={form.half_day_period} onChange={e => setForm(f => ({ ...f, half_day_period: e.target.value }))}>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                  </select>
                )}
              </div>
            </div>

            <div className="form-field">
              <label>Start Date</label>
              <input type="date" value={form.start_date} min={new Date().toISOString().split("T")[0]}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>

            <div className="form-field">
              <label>End Date</label>
              <input type="date" value={form.end_date} min={form.start_date || new Date().toISOString().split("T")[0]}
                disabled={form.half_day}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>

          <div className="form-field form-field--full">
            <label>Reason (optional)</label>
            <textarea rows={3} value={form.reason} placeholder="Briefly describe the reason for your leave…"
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
          </div>

          {/* Summary Box */}
          {(form.start_date || form.half_day) && (
            <div className={`leave-summary ${days > available ? "leave-summary--warn" : ""}`}>
              <div className="summary-row">
                <span>Working days requested</span>
                <strong>{days}</strong>
              </div>
              <div className="summary-row">
                <span>Available balance</span>
                <strong style={{ color: days > available ? "#ef4444" : "#00C9B1" }}>{available}</strong>
              </div>
              {form.start_date && form.end_date && !form.half_day && (
                <div className="summary-row">
                  <span>Period</span>
                  <strong>{new Date(form.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {new Date(form.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</strong>
                </div>
              )}
              {days > available && (
                <div className="summary-warning">⚠️ Insufficient balance — you need {days - available} more days than available.</div>
              )}
            </div>
          )}

          <button className="leave-submit-btn" onClick={handleSubmit} disabled={submitting || days > available || days === 0}>
            {submitting ? "Submitting…" : "Submit Application →"}
          </button>
        </div>
      )}

      {/* History */}
      {tab === "history" && (
        <div className="leave-history">
          <h2>My Applications</h2>
          {applications.length === 0 ? (
            <div className="leave-empty">No leave applications yet. Apply for your first leave above.</div>
          ) : (
            <div className="apps-list">
              {applications.map(app => {
                const effectiveStatus = app.effective_status ?? app.status;
                const badge = STATUS_BADGE[effectiveStatus] || STATUS_BADGE[app.status] || { label: effectiveStatus, cls: "badge-pending" };
                const pendingAmend = amendments.find(a => a.leave_application_id === app.id && a.status === "pending");
                const history = app.amendment_history || [];
                const isOnCalendar = app.status === "approved" || effectiveStatus === "amended";
                return (
                  <div key={app.id} className="app-card">
                    <div className="app-card-top">
                      <div>
                        <div className="app-type">{LEAVE_LABELS[app.leave_type] || app.leave_type}</div>
                        <div className="app-dates">
                          {new Date(app.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          {app.start_date !== app.end_date && ` → ${new Date(app.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
                          {app.half_day && ` · ${app.half_day_period} half-day`}
                        </div>
                        <div className="app-days">{app.working_days} working day{app.working_days !== 1 ? "s" : ""}</div>
                        {app.reason && <div className="app-reason">"{app.reason}"</div>}
                        {app.review_comment && <div className="app-comment">💬 {app.review_comment}</div>}
                        {history.length > 0 && (
                          <div className="app-audit">
                            <strong>Amendment history:</strong>
                            {history.map((h, i) => (
                              <div key={i} className="app-audit-item">
                                {h.cancel_leave ? "Requested cancellation" : `Requested ${h.requested_start_date} → ${h.requested_end_date} (${h.requested_working_days} days)`}
                                {" — "}
                                <span className={h.status === "approved" ? "audit-approved" : "audit-rejected"}>{h.status}</span>
                                {h.reviewed_at && ` by manager/HR on ${new Date(h.reviewed_at).toLocaleDateString()}`}
                                {h.review_comment && `: ${h.review_comment}`}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="app-card-right">
                        <span className={`status-badge ${badge.cls}`}>{badge.label}</span>
                        <div className="app-submitted">Submitted {new Date(app.created_at).toLocaleDateString()}</div>
                        {isOnCalendar && (
                          <a href="/calendar" className="leave-link leave-link-btn">View in Calendar</a>
                        )}
                        {pendingAmend && (
                          <div className="app-comment">🛠 Amendment pending manager/HR review</div>
                        )}
                        {app.status === "pending" && (
                          <button className="cancel-btn" onClick={() => handleCancel(app.id)}>Cancel</button>
                        )}
                        {(app.status === "approved" || app.status === "pending") && !pendingAmend && (
                          <button className="cancel-btn" onClick={() => handleOpenAmendment(app)}>
                            Request Amendment
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {amendModal && (
        <div className="modal-overlay" onClick={() => setAmendModal(null)}>
          <div className="review-modal" onClick={e => e.stopPropagation()}>
            <h3>Request Leave Amendment</h3>
            <div className="modal-details">
              <div><strong>Type:</strong> {LEAVE_LABELS[amendModal.leave_type] || amendModal.leave_type}</div>
              <div><strong>Current:</strong> {amendModal.start_date} → {amendModal.end_date} ({amendModal.working_days} days)</div>
            </div>
            <div className="modal-comment">
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={amendForm.cancel_leave}
                  onChange={(e) => setAmendForm(f => ({ ...f, cancel_leave: e.target.checked }))}
                />
                Cancel this leave entirely
              </label>
            </div>
            {!amendForm.cancel_leave && (
              <div className="modal-comment">
                <label>New Start Date</label>
                <input
                  type="date"
                  value={amendForm.start_date}
                  onChange={e => setAmendForm(f => ({ ...f, start_date: e.target.value }))}
                />
                <label>New End Date</label>
                <input
                  type="date"
                  value={amendForm.end_date}
                  onChange={e => setAmendForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            )}
            <div className="modal-comment">
              <label>Reason for amendment</label>
              <textarea
                rows={3}
                value={amendForm.reason}
                placeholder="Why are you changing/cancelling this leave?"
                onChange={e => setAmendForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div className="modal-actions">
              <button className="modal-btn modal-btn--reject" onClick={() => setAmendModal(null)}>
                Close
              </button>
              <button className="modal-btn modal-btn--approve" disabled={amendSubmitting} onClick={handleSubmitAmendment}>
                {amendSubmitting ? "Submitting…" : "Submit Amendment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
