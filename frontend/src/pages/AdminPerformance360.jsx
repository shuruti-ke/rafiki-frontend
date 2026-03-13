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
  });
  const [req, setReq] = useState({
    cycle_id: "",
    employee_user_id: "",
    reviewer_user_id: "",
    reviewer_type: "manager",
  });
  const [summaryTarget, setSummaryTarget] = useState({ cycle_id: "", employee_user_id: "" });

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

  const createCycle = async () => {
    setMsg("");
    const res = await authFetch(`${API}/api/v1/performance-360/cycles`, {
      method: "POST",
      body: JSON.stringify({ ...cycle, template: {} }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Performance cycle created." : (data.detail || "Failed to create cycle"));
    if (res.ok) {
      setCycle({ name: "", period_start: "", period_end: "", due_date: "" });
      load();
    }
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
            <input className="search" placeholder="Cycle name" value={cycle.name} onChange={(e) => setCycle(c => ({ ...c, name: e.target.value }))} />
            <div style={{ display: "flex", gap: 8 }}>
              <input className="search" type="date" value={cycle.period_start} onChange={(e) => setCycle(c => ({ ...c, period_start: e.target.value }))} />
              <input className="search" type="date" value={cycle.period_end} onChange={(e) => setCycle(c => ({ ...c, period_end: e.target.value }))} />
              <input className="search" type="date" value={cycle.due_date} onChange={(e) => setCycle(c => ({ ...c, due_date: e.target.value }))} />
            </div>
            <button className="btn btnPrimary" onClick={createCycle}>Create Cycle</button>
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
              <span style={{ color: "var(--muted)", fontSize: 13 }}>{cycles.length} active or historical cycles</span>
            </div>
            {cycles.map(c => (
              <button
                key={c.id}
                className="btn"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setSummaryTarget((prev) => ({ cycle_id: c.id, employee_user_id: prev.employee_user_id }));
                  if (summaryTarget.employee_user_id) loadSummary(c.id, summaryTarget.employee_user_id);
                }}
              >
                <strong>{c.name}</strong>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  {c.period_start} to {c.period_end} · due {c.due_date || "N/A"}
                </div>
              </button>
            ))}
          </div>

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
