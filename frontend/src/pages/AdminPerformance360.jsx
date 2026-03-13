import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";

export default function AdminPerformance360() {
  const [cycles, setCycles] = useState([]);
  const [msg, setMsg] = useState("");
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

  async function load() {
    const r = await authFetch(`${API}/api/v1/performance-360/cycles`);
    if (r.ok) setCycles((await r.json()).cycles || []);
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
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <h1>Performance 360</h1>
      <p style={{ color: "var(--muted)" }}>Manage review cycles and assign 360 feedback reviewers.</p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
        <h3>Create Review Cycle</h3>
        <input className="search" placeholder="Cycle name" value={cycle.name} onChange={(e) => setCycle(c => ({ ...c, name: e.target.value }))} />
        <div style={{ display: "flex", gap: 8 }}>
          <input className="search" type="date" value={cycle.period_start} onChange={(e) => setCycle(c => ({ ...c, period_start: e.target.value }))} />
          <input className="search" type="date" value={cycle.period_end} onChange={(e) => setCycle(c => ({ ...c, period_end: e.target.value }))} />
          <input className="search" type="date" value={cycle.due_date} onChange={(e) => setCycle(c => ({ ...c, due_date: e.target.value }))} />
        </div>
        <button className="btn btnPrimary" onClick={createCycle}>Create Cycle</button>
      </div>

      <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
        <h3>Add 360 Reviewer Request</h3>
        <select className="search" value={req.cycle_id} onChange={(e) => setReq(r => ({ ...r, cycle_id: e.target.value }))}>
          <option value="">Select cycle</option>
          {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="search" placeholder="Employee UUID" value={req.employee_user_id} onChange={(e) => setReq(r => ({ ...r, employee_user_id: e.target.value }))} />
        <input className="search" placeholder="Reviewer UUID" value={req.reviewer_user_id} onChange={(e) => setReq(r => ({ ...r, reviewer_user_id: e.target.value }))} />
        <select className="search" value={req.reviewer_type} onChange={(e) => setReq(r => ({ ...r, reviewer_type: e.target.value }))}>
          <option value="self">Self</option>
          <option value="manager">Manager</option>
          <option value="peer">Peer</option>
          <option value="subordinate">Subordinate</option>
          <option value="cross_functional">Cross-functional</option>
        </select>
        <button className="btn btnPrimary" onClick={addReviewerRequest}>Add Request</button>
      </div>

      <h3>Cycles</h3>
      <div style={{ display: "grid", gap: 8 }}>
        {cycles.map(c => (
          <div key={c.id} className="btn" style={{ textAlign: "left" }}>
            {c.name} · {c.period_start} to {c.period_end} · due {c.due_date || "N/A"}
          </div>
        ))}
      </div>
    </div>
  );
}
