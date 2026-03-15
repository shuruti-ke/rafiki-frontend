import { useEffect, useMemo, useState } from "react";
import { API, authFetch } from "../api.js";
import { employeeDisplayName, normalizeEmployeeRecord } from "../utils/employeeRecord.js";

const REVIEWER_TYPES = [
  ["self", "Self"],
  ["manager", "Manager"],
  ["peer", "Peer"],
  ["subordinate", "Subordinate"],
  ["cross_functional", "Cross-functional"],
];

const DEFAULT_TEMPLATE = {
  criteria: [
    { id: "c1", label: "Quality of work", weight: 1 },
    { id: "c2", label: "Meeting objectives", weight: 1 },
    { id: "c3", label: "Communication & collaboration", weight: 1 },
    { id: "c4", label: "Initiative & growth", weight: 1 },
  ],
  rating_scale: { min: 1, max: 5, labels: ["Needs improvement", "Developing", "Meets expectations", "Exceeds expectations", "Exceptional"] },
  period_type: "quarterly",
};

export default function AdminPerformance360() {
  const [cycles, setCycles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState(null);
  const [msg, setMsg] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [reviewerQuery, setReviewerQuery] = useState("");
  const [cycle, setCycle] = useState({
    name: "",
    period_start: "",
    period_end: "",
    due_date: "",
    period_type: "quarterly",
  });
  const [req, setReq] = useState({
    cycle_id: "",
    employee_user_id: "",
    reviewer_user_id: "",
    reviewer_type: "manager",
  });
  const [summaryTarget, setSummaryTarget] = useState({ cycle_id: "", employee_user_id: "" });
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [launchingId, setLaunchingId] = useState(null);

  async function load() {
    const [r, e] = await Promise.all([
      authFetch(`${API}/api/v1/performance-360/cycles`),
      authFetch(`${API}/api/v1/employees/`),
    ]);
    if (r.ok) setCycles((await r.json()).cycles || []);
    if (e.ok) {
      const data = await e.json();
      setEmployees(Array.isArray(data) ? data.map(normalizeEmployeeRecord) : []);
    }
  }

  useEffect(() => { load(); }, []);

  async function loadCycle(cycleId) {
    if (!cycleId) { setSelectedCycle(null); setEditingTemplate(null); return; }
    const res = await authFetch(`${API}/api/v1/performance-360/cycles/${cycleId}`);
    const data = await res.json();
    if (res.ok && data.cycle) {
      setSelectedCycle(data.cycle);
      const t = data.cycle.template || {};
      setEditingTemplate({
        criteria: Array.isArray(t.criteria) && t.criteria.length ? t.criteria : DEFAULT_TEMPLATE.criteria,
        rating_scale: t.rating_scale && t.rating_scale.min != null ? t.rating_scale : DEFAULT_TEMPLATE.rating_scale,
        period_type: t.period_type || "quarterly",
      });
    } else {
      setSelectedCycle(null);
      setEditingTemplate(null);
    }
  }

  const createCycle = async () => {
    setMsg("");
    const template = {
      ...DEFAULT_TEMPLATE,
      period_type: cycle.period_type || "quarterly",
    };
    const res = await authFetch(`${API}/api/v1/performance-360/cycles`, {
      method: "POST",
      body: JSON.stringify({
        name: cycle.name,
        period_start: cycle.period_start,
        period_end: cycle.period_end,
        due_date: cycle.due_date || null,
        template,
      }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Performance cycle created (draft). Edit template below and launch when ready." : (data.detail || "Failed to create cycle"));
    if (res.ok) {
      setCycle({ name: "", period_start: "", period_end: "", due_date: "", period_type: "quarterly" });
      await load();
      if (data.cycle?.id) loadCycle(data.cycle.id);
    }
  };

  const saveTemplate = async () => {
    if (!selectedCycle?.id || !editingTemplate) return;
    setMsg("");
    const res = await authFetch(`${API}/api/v1/performance-360/cycles/${selectedCycle.id}`, {
      method: "PATCH",
      body: JSON.stringify({ template: editingTemplate }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Template saved." : (data.detail || "Failed to save template"));
    if (res.ok) { await load(); setSelectedCycle((prev) => prev && { ...prev, template: editingTemplate }); }
  };

  const launchCycle = async (cycleId) => {
    setMsg("");
    setLaunchingId(cycleId);
    const res = await authFetch(`${API}/api/v1/performance-360/cycles/${cycleId}/launch`, { method: "POST" });
    const data = await res.json();
    setMsg(res.ok ? `Cycle launched. ${data.created_requests || 0} review request(s) created (self + manager for each employee).` : (data.detail || "Failed to launch"));
    setLaunchingId(null);
    if (res.ok) { await load(); loadCycle(cycleId); }
  };

  const addCriterion = () => {
    if (!editingTemplate) return;
    const id = `c${Date.now()}`;
    setEditingTemplate((t) => ({ ...t, criteria: [...(t.criteria || []), { id, label: "New criterion", weight: 1 }] }));
  };
  const removeCriterion = (id) => {
    setEditingTemplate((t) => ({ ...t, criteria: (t.criteria || []).filter((c) => c.id !== id) }));
  };
  const updateCriterion = (id, field, value) => {
    setEditingTemplate((t) => ({
      ...t,
      criteria: (t.criteria || []).map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    }));
  };

  const addReviewerRequest = async () => {
    if (!req.cycle_id) return;
    const payload = [{
      employee_user_id: req.employee_user_id,
      reviewer_user_id: req.reviewer_user_id,
      reviewer_type: req.reviewer_type,
    }];
    const res = await authFetch(`${API}/api/v1/performance-360/cycles/${req.cycle_id}/requests`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setMsg(res.ok ? `Created ${data.created_requests} review request(s).` : (data.detail || "Failed to add request"));
    if (res.ok && req.cycle_id && req.employee_user_id) {
      setSummaryTarget({ cycle_id: req.cycle_id, employee_user_id: req.employee_user_id });
      loadSummary(req.cycle_id, req.employee_user_id);
    }
  };

  async function loadSummary(cycleId = summaryTarget.cycle_id, employeeId = summaryTarget.employee_user_id) {
    if (!cycleId || !employeeId) return;
    const res = await authFetch(`${API}/api/v1/performance-360/cycles/${cycleId}/employee/${employeeId}/summary`);
    const data = await res.json();
    if (res.ok) setSummary(data);
    else setMsg(data.detail || "Failed to load review summary");
  }

  const employeeMatches = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    const base = !q ? employees.slice(0, 10) : employees.filter((emp) =>
      [emp.name, emp.email, emp.department, emp.job_title].some((value) =>
        String(value || "").toLowerCase().includes(q)
      )
    );
    return base;
  }, [employees, employeeQuery]);

  const reviewerMatches = useMemo(() => {
    const q = reviewerQuery.trim().toLowerCase();
    const base = !q ? employees.slice(0, 10) : employees.filter((emp) =>
      [emp.name, emp.email, emp.department, emp.job_title].some((value) =>
        String(value || "").toLowerCase().includes(q)
      )
    );
    return base.filter((emp) => emp.user_id !== req.employee_user_id);
  }, [employees, reviewerQuery, req.employee_user_id]);

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1>Performance 360</h1>
      <p style={{ color: "var(--muted)" }}>
        Launch review cycles, pick employees and reviewers by name, and inspect completion and rating mix without leaving the page.
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) 1fr", gap: 20, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "grid", gap: 8, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <h3 style={{ margin: 0 }}>Create Review Cycle</h3>
            <input className="search" placeholder="Cycle name (e.g. Q1 2025)" value={cycle.name} onChange={(e) => setCycle(c => ({ ...c, name: e.target.value }))} />
            <select className="search" value={cycle.period_type} onChange={(e) => setCycle(c => ({ ...c, period_type: e.target.value }))}>
              <option value="quarterly">Quarterly</option>
              <option value="bi_annual">Bi-annual</option>
              <option value="annual">Annual</option>
            </select>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="search" type="date" placeholder="Period start" value={cycle.period_start} onChange={(e) => setCycle(c => ({ ...c, period_start: e.target.value }))} />
              <input className="search" type="date" placeholder="Period end" value={cycle.period_end} onChange={(e) => setCycle(c => ({ ...c, period_end: e.target.value }))} />
              <input className="search" type="date" placeholder="Due date" value={cycle.due_date} onChange={(e) => setCycle(c => ({ ...c, due_date: e.target.value }))} />
            </div>
            <button className="btn btnPrimary" onClick={createCycle} disabled={!cycle.name || !cycle.period_start || !cycle.period_end}>Create Cycle (draft)</button>
          </div>

          <div style={{ display: "grid", gap: 10, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <h3 style={{ margin: 0 }}>Add Reviewer Request</h3>
            <select className="search" value={req.cycle_id} onChange={(e) => setReq(r => ({ ...r, cycle_id: e.target.value }))}>
              <option value="">Select cycle</option>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <input className="search" placeholder="Search employee to review..." value={employeeQuery} onChange={(e) => setEmployeeQuery(e.target.value)} />
            <div style={{ maxHeight: 150, overflow: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
              {employeeMatches.map((emp) => (
                <button
                  key={emp.user_id}
                  className="btn"
                  style={{ width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid var(--border)", borderRadius: 0, background: req.employee_user_id === emp.user_id ? "rgba(139,92,246,.08)" : "transparent" }}
                  onClick={() => setReq(r => ({ ...r, employee_user_id: emp.user_id }))}
                >
                  <strong>{employeeDisplayName(emp)}</strong>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>{[emp.department, emp.job_title, emp.email].filter(Boolean).join(" · ")}</div>
                </button>
              ))}
            </div>

            <input className="search" placeholder="Search reviewer..." value={reviewerQuery} onChange={(e) => setReviewerQuery(e.target.value)} />
            <div style={{ maxHeight: 150, overflow: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
              {reviewerMatches.map((emp) => (
                <button
                  key={emp.user_id}
                  className="btn"
                  style={{ width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid var(--border)", borderRadius: 0, background: req.reviewer_user_id === emp.user_id ? "rgba(31,191,184,.08)" : "transparent" }}
                  onClick={() => setReq(r => ({ ...r, reviewer_user_id: emp.user_id }))}
                >
                  <strong>{employeeDisplayName(emp)}</strong>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>{[emp.department, emp.job_title, emp.email].filter(Boolean).join(" · ")}</div>
                </button>
              ))}
            </div>

            <select className="search" value={req.reviewer_type} onChange={(e) => setReq(r => ({ ...r, reviewer_type: e.target.value }))}>
              {REVIEWER_TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
            <button className="btn btnPrimary" onClick={addReviewerRequest} disabled={!req.cycle_id || !req.employee_user_id || !req.reviewer_user_id}>Add Request</button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 8, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Cycles</h3>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>{cycles.length} cycles</span>
            </div>
            {cycles.map(c => (
              <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: selectedCycle?.id === c.id ? "rgba(139,92,246,.06)" : "transparent" }}>
                <button
                  type="button"
                  className="btn"
                  style={{ width: "100%", textAlign: "left", marginBottom: 8 }}
                  onClick={() => { loadCycle(c.id); setSummaryTarget((prev) => ({ cycle_id: c.id, employee_user_id: prev.employee_user_id })); if (summaryTarget.employee_user_id) loadSummary(c.id, summaryTarget.employee_user_id); }}
                >
                  <strong>{c.name}</strong>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>
                    {c.period_start} to {c.period_end} · due {c.due_date || "N/A"} · <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{c.status}</span>
                  </div>
                </button>
                {c.status === "draft" && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn btnPrimary" onClick={() => loadCycle(c.id)}>Edit template</button>
                    <button type="button" className="btn" style={{ background: "rgba(34,197,94,.12)", color: "#15803d" }} onClick={() => launchCycle(c.id)} disabled={launchingId === c.id}>{launchingId === c.id ? "Launching…" : "Launch cycle"}</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {selectedCycle && editingTemplate && (
            <div style={{ display: "grid", gap: 12, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
              <h3 style={{ margin: 0 }}>Review template: {selectedCycle.name}</h3>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Evaluation criteria and rating scale. Employees and managers will see this when completing self-review and manager review.</p>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong>Criteria</strong>
                  <button type="button" className="btn btnGhost" onClick={addCriterion}>+ Add criterion</button>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {(editingTemplate.criteria || []).map((cr) => (
                    <li key={cr.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input className="search" style={{ flex: 1 }} value={cr.label} onChange={(e) => updateCriterion(cr.id, "label", e.target.value)} placeholder="Criterion name" />
                      <input className="search" type="number" min={0.1} step={0.1} style={{ width: 60 }} value={cr.weight} onChange={(e) => updateCriterion(cr.id, "weight", parseFloat(e.target.value) || 1)} />
                      <button type="button" className="btn" style={{ color: "#dc2626" }} onClick={() => removeCriterion(cr.id)}>Remove</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Rating scale</strong>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                  <span>Min</span>
                  <input type="number" className="search" style={{ width: 56 }} value={editingTemplate.rating_scale?.min ?? 1} onChange={(e) => setEditingTemplate((t) => ({ ...t, rating_scale: { ...t.rating_scale, min: parseInt(e.target.value, 10) || 1 } }))} />
                  <span>Max</span>
                  <input type="number" className="search" style={{ width: 56 }} value={editingTemplate.rating_scale?.max ?? 5} onChange={(e) => setEditingTemplate((t) => ({ ...t, rating_scale: { ...t.rating_scale, max: parseInt(e.target.value, 10) || 5 } }))} />
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)" }}>Labels (comma-separated, one per scale point)</label>
                  <input className="search" style={{ width: "100%", marginTop: 4 }} value={(editingTemplate.rating_scale?.labels || []).join(", ")} onChange={(e) => setEditingTemplate((t) => ({ ...t, rating_scale: { ...t.rating_scale, labels: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } }))} placeholder="Needs improvement, Developing, Meets, Exceeds, Exceptional" />
                </div>
              </div>
              <button type="button" className="btn btnPrimary" onClick={saveTemplate}>Save template</button>
            </div>
          )}

          <div style={{ display: "grid", gap: 10, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <h3 style={{ margin: 0 }}>Review Summary</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <select className="search" value={summaryTarget.cycle_id} onChange={(e) => setSummaryTarget((prev) => ({ ...prev, cycle_id: e.target.value }))}>
                <option value="">Cycle</option>
                {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="search" value={summaryTarget.employee_user_id} onChange={(e) => setSummaryTarget((prev) => ({ ...prev, employee_user_id: e.target.value }))}>
                <option value="">Employee</option>
                {employees.map(emp => <option key={emp.user_id} value={emp.user_id}>{employeeDisplayName(emp)}</option>)}
              </select>
              <button className="btn btnGhost" onClick={() => loadSummary()} disabled={!summaryTarget.cycle_id || !summaryTarget.employee_user_id}>Load</button>
            </div>

            {!summary ? (
              <div style={{ color: "var(--muted)" }}>Pick a cycle and employee to inspect review progress and average ratings.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <div className="btn">Average rating: {summary.average_rating ?? "—"}</div>
                  {Object.entries(summary.ratings_by_reviewer_type || {}).map(([key, value]) => (
                    <div key={key} className="btn">{key}: {value}</div>
                  ))}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {(summary.reviews || []).map((review, idx) => (
                    <div key={`${review.reviewer_type}-${idx}`} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <strong>{review.reviewer_type}</strong>
                        <span style={{ color: review.status === "submitted" ? "#15803d" : "var(--muted)" }}>
                          {review.status}
                        </span>
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                        Rating: {review.rating ?? "Pending"}
                      </div>
                      {review.feedback_text ? <div style={{ marginTop: 8 }}>{review.feedback_text}</div> : null}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
