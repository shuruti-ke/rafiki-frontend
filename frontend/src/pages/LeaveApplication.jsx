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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
      const [balRes, appRes] = await Promise.all([
        authFetch(`${API}/api/v1/leave/balance`),
        authFetch(`${API}/api/v1/leave/my-applications`),
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
        <p>Apply for leave, track your balance, and view application history</p>
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
                const badge = STATUS_BADGE[app.status] || { label: app.status, cls: "badge-pending" };
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
                      </div>
                      <div className="app-card-right">
                        <span className={`status-badge ${badge.cls}`}>{badge.label}</span>
                        <div className="app-submitted">Submitted {new Date(app.created_at).toLocaleDateString()}</div>
                        {app.status === "pending" && (
                          <button className="cancel-btn" onClick={() => handleCancel(app.id)}>Cancel</button>
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
    </div>
  );
}
