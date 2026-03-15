import { useState, useEffect, useCallback } from "react";
import { API, authFetch } from "../api.js";
import "./AdminLeave.css";

const STATUS_BADGE = {
  pending:   { label: "Pending Review", cls: "badge-pending" },
  approved:  { label: "Approved", cls: "badge-approved" },
  rejected:  { label: "Rejected", cls: "badge-rejected" },
  cancelled: { label: "Cancelled", cls: "badge-cancelled" },
  amendment_pending: { label: "Amendment Pending", cls: "badge-amendment-pending" },
  amended:   { label: "Amended", cls: "badge-amended" },
};

const LEAVE_LABELS = {
  annual: "Annual", sick: "Sick", maternity: "Maternity", paternity: "Paternity",
};

export default function AdminLeave() {
  const [tab, setTab] = useState("applications");
  const [applications, setApplications] = useState([]);
  const [amendments, setAmendments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    annual_leave_days: 21, sick_leave_days: 10,
    maternity_leave_days: 90, paternity_leave_days: 14,
    carry_over_days: 5, carry_over_expiry_months: 3,
    carry_over_policy: "none", other_leave: [],
  });
  const [policySuccess, setPolicySuccess] = useState("");
  const [policyError, setPolicyError] = useState("");
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [kbDocs, setKbDocs] = useState([]);
  const [selectedKbDoc, setSelectedKbDoc] = useState("");

  // Separate fetch for amendment requests to avoid changing existing tab behaviour.
  const fetchAmendments = useCallback(async () => {
    try {
      const amendRes = await authFetch(`${API}/api/v1/leave/admin/amendments?status=pending`);
      if (amendRes.ok) setAmendments((await amendRes.json()).amendments || []);
    } catch { /* ignore */ }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [appRes, sumRes, polRes, kbRes] = await Promise.all([
        authFetch(`${API}/api/v1/leave/admin/applications`),
        authFetch(`${API}/api/v1/leave/admin/summary`),
        authFetch(`${API}/api/v1/leave/policy`),
        authFetch(`${API}/api/v1/knowledge-base/`),
      ]);
      if (appRes.ok) setApplications((await appRes.json()).applications || []);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (polRes.ok) {
        const d = await polRes.json();
        if (d.policy) {
          setPolicy(d.policy);
          setPolicyForm({
            annual_leave_days: d.policy.annual_leave_days,
            sick_leave_days: d.policy.sick_leave_days,
            maternity_leave_days: d.policy.maternity_leave_days,
            paternity_leave_days: d.policy.paternity_leave_days,
            carry_over_days: d.policy.carry_over_days,
            carry_over_expiry_months: d.policy.carry_over_expiry_months,
            carry_over_policy: d.policy.carry_over_policy,
            other_leave: d.policy.other_leave || [],
          });
          setSelectedKbDoc(d.policy.kb_document_id || "");
        }
      }
      if (kbRes.ok) { const d = await kbRes.json(); setKbDocs(Array.isArray(d) ? d : d.documents || []); }
      await fetchAmendments();
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [fetchAmendments]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleReview = async (status) => {
    if (!reviewModal) return;
    setReviewing(true);
    const res = await authFetch(`${API}/api/v1/leave/admin/review/${reviewModal.id}`, {
      method: "POST",
      body: JSON.stringify({ status, comment: reviewComment || null }),
    });
    if (res.ok) {
      setReviewModal(null);
      setReviewComment("");
      fetchAll();
    }
    setReviewing(false);
  };

  const handleAmendmentReview = async (amendmentId, decision) => {
    const res = await authFetch(`${API}/api/v1/leave/admin/amendments/${amendmentId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, comment: reviewComment || null }),
    });
    if (res.ok) {
      setReviewComment("");
      fetchAll();
    }
  };

  const handleSavePolicy = async () => {
    setSavingPolicy(true); setPolicySuccess(""); setPolicyError("");
    try {
      const res = await authFetch(`${API}/api/v1/leave/policy`, {
        method: "POST",
        body: JSON.stringify({ ...policyForm, kb_document_id: selectedKbDoc || null }),
      });
      const d = await res.json();
      if (res.ok) {
        setPolicySuccess("✅ Leave policy saved successfully.");
        fetchAll();
      } else {
        setPolicyError(d.detail || "Failed to save policy.");
      }
    } catch { setPolicyError("Network error."); }
    setSavingPolicy(false);
  };

  const filteredApps = filterStatus === "all"
    ? applications
    : applications.filter(a => a.status === filterStatus);

  const pendingCount = applications.filter(a => a.status === "pending").length;

  if (loading) return (
    <div className="admin-leave-loading"><div className="leave-spinner" /><p>Loading leave management…</p></div>
  );

  return (
    <div className="admin-leave-page">
      <div className="admin-leave-header">
        <div>
          <h1>Leave Management</h1>
          <p>Review applications, manage policy, and track org-wide leave</p>
        </div>
        {pendingCount > 0 && (
          <div className="pending-badge">⏳ {pendingCount} pending review</div>
        )}
      </div>

      {/* Summary Strip */}
      {summary && (
        <div className="leave-summary-strip">
          {[
            { label: "Pending", val: summary.by_status?.find(s => s.status === "pending")?.count || 0, color: "#f59e0b" },
            { label: "Approved This Year", val: summary.by_status?.find(s => s.status === "approved")?.count || 0, color: "#00C9B1" },
            { label: "Total Days Taken", val: summary.by_status?.find(s => s.status === "approved")?.total_days || 0, color: "#7B2FBE" },
            { label: "Rejected", val: summary.by_status?.find(s => s.status === "rejected")?.count || 0, color: "#ef4444" },
          ].map(({ label, val, color }) => (
            <div key={label} className="summary-kpi">
              <div className="summary-kpi-val" style={{ color }}>{val}</div>
              <div className="summary-kpi-label">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="admin-leave-tabs">
        <button className={`admin-tab ${tab === "applications" ? "active" : ""}`} onClick={() => setTab("applications")}>
          📋 Applications {pendingCount > 0 && <span className="tab-count">{pendingCount}</span>}
        </button>
        <button className={`admin-tab ${tab === "amendments" ? "active" : ""}`} onClick={() => setTab("amendments")}>
          🛠 Amendments {amendments.length > 0 && <span className="tab-count">{amendments.length}</span>}
        </button>
        <button className={`admin-tab ${tab === "policy" ? "active" : ""}`} onClick={() => setTab("policy")}>
          ⚙️ Leave Policy
        </button>
      </div>

      {/* ── APPLICATIONS TAB ── */}
      {tab === "applications" && (
        <div className="apps-tab">
          <div className="filter-row">
            {["pending","approved","rejected","cancelled","all"].map(s => (
              <button key={s} className={`filter-btn ${filterStatus === s ? "active" : ""}`}
                onClick={() => setFilterStatus(s)}>
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                {s === "pending" && pendingCount > 0 && <span className="filter-count">{pendingCount}</span>}
              </button>
            ))}
          </div>

          {filteredApps.length === 0 ? (
            <div className="admin-leave-empty">No {filterStatus !== "all" ? filterStatus : ""} applications found.</div>
          ) : (
            <div className="admin-apps-list">
              {filteredApps.map(app => {
                const status = app.effective_status ?? app.status;
                const badge = STATUS_BADGE[status] || { label: status, cls: "badge-pending" };
                return (
                  <div key={app.id} className={`admin-app-card ${status === "pending" || status === "amendment_pending" ? "admin-app-card--pending" : ""}`}>
                    <div className="admin-app-main">
                      <div className="admin-app-employee">
                        <div className="employee-avatar">{(app.full_name || "?")[0]}</div>
                        <div>
                          <div className="employee-name">{app.full_name || "Unknown Employee"}</div>
                          <div className="employee-meta">{app.email} {app.department && `· ${app.department}`}</div>
                        </div>
                      </div>
                      <div className="admin-app-details">
                        <div className="app-leave-type">{LEAVE_LABELS[app.leave_type] || app.leave_type} Leave</div>
                        <div className="app-dates-info">
                          📅 {new Date(app.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          {app.start_date !== app.end_date && ` → ${new Date(app.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
                        </div>
                        <div className="app-days-info">⏱ {app.working_days} working day{app.working_days !== 1 ? "s" : ""}{app.half_day ? ` (${app.half_day_period} half-day)` : ""}</div>
                        {app.reason && <div className="app-reason-text">💬 "{app.reason}"</div>}
                        {Array.isArray(app.amendment_history) && app.amendment_history.length > 0 && (
                          <div className="app-audit">
                            <strong>Amendment history</strong>
                            {app.amendment_history.map((ah, idx) => (
                              <div key={idx} className="app-audit-item">
                                {ah.cancel_leave ? "Cancel requested" : `Change to ${ah.requested_start_date} → ${ah.requested_end_date} (${ah.requested_working_days} days)`}
                                {" — "}
                                <span className={ah.status === "approved" ? "audit-approved" : ah.status === "rejected" ? "audit-rejected" : ""}>
                                  {ah.status}
                                </span>
                                {ah.reviewed_at && ` · ${new Date(ah.reviewed_at).toLocaleDateString()}`}
                                {ah.review_comment && ` — ${ah.review_comment}`}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="admin-app-actions">
                        <span className={`status-badge ${badge.cls}`}>{badge.label}</span>
                        {(app.status === "pending" || status === "amendment_pending") && (
                          <div className="action-btns">
                            <button className="approve-btn" onClick={() => { setReviewModal(app); setReviewComment(""); }}>
                              Review →
                            </button>
                          </div>
                        )}
                        {app.review_comment && (
                          <div className="review-note">Note: {app.review_comment}</div>
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

      {tab === "amendments" && (
        <div className="apps-tab">
          {amendments.length === 0 ? (
            <div className="admin-leave-empty">No pending amendment requests.</div>
          ) : (
            <div className="admin-apps-list">
              {amendments.map(am => (
                <div key={am.id} className="admin-app-card admin-app-card--pending">
                  <div className="admin-app-main">
                    <div className="admin-app-employee">
                      <div className="employee-avatar">{(am.full_name || "?")[0]}</div>
                      <div>
                        <div className="employee-name">{am.full_name || "Unknown Employee"}</div>
                        <div className="employee-meta">{am.email} {am.department && `· ${am.department}`}</div>
                      </div>
                    </div>
                    <div className="admin-app-details">
                      <div className="app-leave-type">{LEAVE_LABELS[am.leave_type] || am.leave_type} Amendment</div>
                      {am.cancel_leave ? (
                        <div className="app-reason-text">Requested action: Cancel approved leave</div>
                      ) : (
                        <div className="app-dates-info">New dates: {am.requested_start_date} → {am.requested_end_date} ({am.requested_working_days} days)</div>
                      )}
                      {am.requested_reason && <div className="app-reason-text">Reason: {am.requested_reason}</div>}
                    </div>
                    <div className="admin-app-actions">
                      <span className="status-badge badge-pending">Pending Amendment</span>
                      <div className="action-btns">
                        <button className="approve-btn" onClick={() => handleAmendmentReview(am.id, "approved")}>Approve</button>
                        <button className="modal-btn modal-btn--reject" onClick={() => handleAmendmentReview(am.id, "rejected")}>Reject</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── POLICY TAB ── */}
      {tab === "policy" && (
        <div className="policy-tab">
          <div className="policy-section">
            <h2>Leave Entitlements</h2>
            <p className="policy-hint">Set the number of days employees are entitled to per year for each leave type.</p>

            <div className="policy-grid">
              {[
                { key: "annual_leave_days", label: "Annual Leave", icon: "🏖" },
                { key: "sick_leave_days", label: "Sick Leave", icon: "🏥" },
                { key: "maternity_leave_days", label: "Maternity Leave", icon: "👶" },
                { key: "paternity_leave_days", label: "Paternity Leave", icon: "👨‍👧" },
              ].map(({ key, label, icon }) => (
                <div key={key} className="policy-field">
                  <label>{icon} {label} (days/year)</label>
                  <input type="number" min={0} max={365}
                    value={policyForm[key]}
                    onChange={e => setPolicyForm(f => ({ ...f, [key]: parseInt(e.target.value) || 0 }))} />
                </div>
              ))}
            </div>
          </div>

          <div className="policy-section">
            <h2>Carry-Over Policy</h2>
            <p className="policy-hint">Define how unused annual leave days carry over into the next year.</p>

            <div className="policy-grid">
              <div className="policy-field policy-field--full">
                <label>Carry-Over Rule</label>
                <div className="carry-options">
                  {[
                    { val: "none", label: "❌ No carry-over", desc: "All unused days expire at year end" },
                    { val: "capped", label: "📦 Capped carry-over", desc: "Up to a maximum number of days carry over" },
                    { val: "unlimited", label: "♾ Unlimited carry-over", desc: "All unused days roll over" },
                  ].map(opt => (
                    <label key={opt.val} className={`carry-option ${policyForm.carry_over_policy === opt.val ? "carry-option--selected" : ""}`}>
                      <input type="radio" name="carry_policy" value={opt.val}
                        checked={policyForm.carry_over_policy === opt.val}
                        onChange={() => setPolicyForm(f => ({ ...f, carry_over_policy: opt.val }))} />
                      <div>
                        <div className="carry-opt-label">{opt.label}</div>
                        <div className="carry-opt-desc">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {policyForm.carry_over_policy === "capped" && (
                <div className="policy-field">
                  <label>Maximum Carry-Over Days</label>
                  <input type="number" min={1} max={30}
                    value={policyForm.carry_over_days}
                    onChange={e => setPolicyForm(f => ({ ...f, carry_over_days: parseInt(e.target.value) || 0 }))} />
                </div>
              )}

              {policyForm.carry_over_policy !== "none" && (
                <div className="policy-field">
                  <label>Carried-Over Days Expire After (months)</label>
                  <input type="number" min={1} max={12}
                    value={policyForm.carry_over_expiry_months}
                    onChange={e => setPolicyForm(f => ({ ...f, carry_over_expiry_months: parseInt(e.target.value) || 3 }))} />
                  <div className="field-hint">e.g. 3 = carried-over days expire March 31 of the new year</div>
                </div>
              )}
            </div>
          </div>

          <div className="policy-section">
            <h2>Link Leave Policy Document</h2>
            <p className="policy-hint">Link a document from your Knowledge Base so employees and Rafiki AI can reference the full leave policy.</p>
            <div className="policy-field">
              <label>Knowledge Base Document</label>
              <select value={selectedKbDoc} onChange={e => setSelectedKbDoc(e.target.value)}>
                <option value="">— No document linked —</option>
                {kbDocs.map(doc => (
                  <option key={doc.id} value={doc.id}>{doc.title || doc.filename}</option>
                ))}
              </select>
              <div className="field-hint">
                Don't see your policy? <a href="/admin/knowledge-base" target="_blank">Upload it to the Knowledge Base →</a>
              </div>
            </div>
          </div>

          {policySuccess && <div className="policy-alert policy-alert--success">{policySuccess}</div>}
          {policyError && <div className="policy-alert policy-alert--error">{policyError}</div>}

          <button className="save-policy-btn" onClick={handleSavePolicy} disabled={savingPolicy}>
            {savingPolicy ? "Saving…" : "💾 Save Leave Policy"}
          </button>
        </div>
      )}

      {/* ── REVIEW MODAL ── */}
      {reviewModal && (
        <div className="modal-overlay" onClick={() => setReviewModal(null)}>
          <div className="review-modal" onClick={e => e.stopPropagation()}>
            <h3>Review Leave Application</h3>
            <div className="modal-details">
              <div><strong>Employee:</strong> {reviewModal.full_name}</div>
              <div><strong>Leave Type:</strong> {LEAVE_LABELS[reviewModal.leave_type] || reviewModal.leave_type}</div>
              <div><strong>Period:</strong> {reviewModal.start_date} → {reviewModal.end_date}</div>
              <div><strong>Working Days:</strong> {reviewModal.working_days}</div>
              {reviewModal.reason && <div><strong>Reason:</strong> {reviewModal.reason}</div>}
            </div>
            <div className="modal-comment">
              <label>Comment (optional)</label>
              <textarea rows={3} value={reviewComment}
                placeholder="Add a note to the employee…"
                onChange={e => setReviewComment(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="modal-btn modal-btn--reject" disabled={reviewing}
                onClick={() => handleReview("rejected")}>
                {reviewing ? "…" : "❌ Reject"}
              </button>
              <button className="modal-btn modal-btn--approve" disabled={reviewing}
                onClick={() => handleReview("approved")}>
                {reviewing ? "…" : "✅ Approve"}
              </button>
            </div>
            <button className="modal-close" onClick={() => setReviewModal(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
