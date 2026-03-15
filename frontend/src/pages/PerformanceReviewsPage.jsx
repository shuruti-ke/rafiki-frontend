import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";
import "./PerformanceReviewsPage.css";

const REVIEWER_TYPE_LABELS = {
  self: "Self-review",
  manager: "Manager review",
  peer: "Peer feedback",
  subordinate: "Subordinate feedback",
  cross_functional: "Cross-functional feedback",
};

export default function PerformanceReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReview, setSelectedReview] = useState(null);
  const [form, setForm] = useState({ rating: "", feedback_text: "", criteria_ratings: {} });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [revRes, remRes] = await Promise.all([
        authFetch(`${API}/api/v1/performance-360/my-reviews`),
        authFetch(`${API}/api/v1/performance-360/reminders`),
      ]);
      if (revRes.ok) {
        const data = await revRes.json();
        setReviews(data.reviews || []);
      }
      if (remRes.ok) {
        const data = await remRes.json();
        setReminders(data.reminders || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const pending = reviews.filter((r) => r.status === "pending");
  const submitted = reviews.filter((r) => r.status === "submitted");

  function openForm(review) {
    setSelectedReview(review);
    const scale = review.cycle_template?.rating_scale || { min: 1, max: 5 };
    const criteria = review.cycle_template?.criteria || [];
    const defaultCriteria = {};
    criteria.forEach((c) => { defaultCriteria[c.id] = scale.min ?? 1; });
    setForm({
      rating: "",
      feedback_text: "",
      criteria_ratings: defaultCriteria,
    });
    setMsg("");
  }

  function setCriterionRating(criterionId, value) {
    setForm((f) => ({ ...f, criteria_ratings: { ...f.criteria_ratings, [criterionId]: value } }));
  }

  async function submitReview() {
    if (!selectedReview) return;
    const rating = parseFloat(form.rating, 10);
    if (Number.isNaN(rating)) {
      setMsg("Please enter an overall rating.");
      return;
    }
    setSubmitting(true);
    setMsg("");
    try {
      const res = await authFetch(`${API}/api/v1/performance-360/reviews/${selectedReview.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          feedback_text: form.feedback_text || null,
          criteria_ratings: Object.keys(form.criteria_ratings).length ? form.criteria_ratings : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg("Review submitted successfully.");
        setSelectedReview(null);
        load();
      } else {
        setMsg(data.detail || "Failed to submit review.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const scale = selectedReview?.cycle_template?.rating_scale || { min: 1, max: 5, labels: [] };
  const min = scale.min ?? 1;
  const max = scale.max ?? 5;
  const labels = scale.labels || [];
  const criteria = selectedReview?.cycle_template?.criteria || [];

  return (
    <div className="perf-reviews-page">
      <h1 className="perf-reviews-title">Performance reviews</h1>
      <p className="perf-reviews-desc">
        Complete your self-review and any review requests where you are the reviewer (e.g. manager or peer). Use the criteria and rating scale set by HR.
      </p>

      {reminders.length > 0 && (
        <div className="perf-reviews-reminders">
          <strong>Upcoming deadlines</strong>
          {reminders.map((r) => (
            <div key={r.cycle_id}>
              {r.cycle_name}: due {r.due_date} · {r.pending_count} pending review{r.pending_count !== 1 ? "s" : ""}
            </div>
          ))}
        </div>
      )}

      {msg && <div className="perf-reviews-msg">{msg}</div>}

      {loading ? (
        <p className="perf-reviews-muted">Loading…</p>
      ) : selectedReview ? (
        <div className="perf-reviews-form-card">
          <div className="perf-reviews-form-header">
            <h2>Submit review: {REVIEWER_TYPE_LABELS[selectedReview.reviewer_type] || selectedReview.reviewer_type}</h2>
            <p className="perf-reviews-muted">
              {selectedReview.employee_name} · {selectedReview.cycle_name}
              {selectedReview.cycle_due_date ? ` · Due ${selectedReview.cycle_due_date}` : ""}
            </p>
            <button type="button" className="perf-reviews-btn-ghost" onClick={() => setSelectedReview(null)}>← Back to list</button>
          </div>

          {criteria.length > 0 && (
            <div className="perf-reviews-criteria">
              <strong>Criteria ratings</strong>
              <p className="perf-reviews-muted">Rate each criterion from {min} to {max}. Pair ratings with written feedback below for clear, actionable input.</p>
              {criteria.map((c) => (
                <div key={c.id} className="perf-reviews-criterion-row">
                  <label>{c.label}</label>
                  <select
                    value={form.criteria_ratings[c.id] ?? min}
                    onChange={(e) => setCriterionRating(c.id, parseFloat(e.target.value, 10))}
                  >
                    {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((v) => (
                      <option key={v} value={v}>{v} {labels[v - min] ? `– ${labels[v - min]}` : ""}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          <div className="perf-reviews-overall">
            <label><strong>Overall rating</strong> ({min}–{max})</label>
            <select value={form.rating} onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))} required>
              <option value="">Select rating</option>
              {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((v) => (
                <option key={v} value={v}>{v} {labels[v - min] ? `– ${labels[v - min]}` : ""}</option>
              ))}
            </select>
          </div>

          <div className="perf-reviews-feedback">
            <label><strong>Written feedback</strong></label>
            <p className="perf-reviews-muted">Provide context and actionable next steps. Best practice: pair numerical ratings with clear written feedback.</p>
            <textarea
              rows={5}
              value={form.feedback_text}
              onChange={(e) => setForm((f) => ({ ...f, feedback_text: e.target.value }))}
              placeholder="Summarise strengths, areas for improvement, and recommendations…"
            />
          </div>

          <div className="perf-reviews-form-actions">
            <button type="button" className="perf-reviews-btn-primary" onClick={submitReview} disabled={submitting || !form.rating}>
              {submitting ? "Submitting…" : "Submit review"}
            </button>
            <button type="button" className="perf-reviews-btn-ghost" onClick={() => setSelectedReview(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="perf-reviews-section">
              <h2>Pending your input</h2>
              <div className="perf-reviews-list">
                {pending.map((r) => (
                  <div key={r.id} className="perf-reviews-card">
                    <div className="perf-reviews-card-main">
                      <strong>{r.employee_name}</strong>
                      <span className="perf-reviews-badge">{REVIEWER_TYPE_LABELS[r.reviewer_type] || r.reviewer_type}</span>
                      <span className="perf-reviews-muted">{r.cycle_name}{r.cycle_due_date ? ` · Due ${r.cycle_due_date}` : ""}</span>
                    </div>
                    <button type="button" className="perf-reviews-btn-primary" onClick={() => openForm(r)}>Complete review</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {submitted.length > 0 && (
            <div className="perf-reviews-section">
              <h2>Submitted</h2>
              <div className="perf-reviews-list">
                {submitted.map((r) => (
                  <div key={r.id} className="perf-reviews-card perf-reviews-card-submitted">
                    <strong>{r.employee_name}</strong>
                    <span className="perf-reviews-badge">{REVIEWER_TYPE_LABELS[r.reviewer_type] || r.reviewer_type}</span>
                    <span className="perf-reviews-muted">{r.cycle_name} · Rating: {r.rating ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {reviews.length === 0 && !loading && (
            <p className="perf-reviews-muted">You have no performance review requests. When HR launches a cycle and assigns you as a reviewer (e.g. self-review or manager review), they will appear here.</p>
          )}
        </>
      )}
    </div>
  );
}
