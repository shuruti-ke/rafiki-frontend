import { useState } from "react";
import { API, authFetch } from "../api.js";

export default function AdminWorkflows() {
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [data, setData] = useState(null);

  const startOnboarding = async () => {
    const res = await authFetch(`${API}/api/v1/workflows/onboarding/${userId}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const d = await res.json();
    setMsg(res.ok ? "Onboarding workflow started." : (d.detail || "Failed to start onboarding"));
  };

  const startOffboarding = async () => {
    const res = await authFetch(`${API}/api/v1/workflows/offboarding/${userId}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const d = await res.json();
    setMsg(res.ok ? "Offboarding workflow started." : (d.detail || "Failed to start offboarding"));
  };

  const loadEmployeeWorkflows = async () => {
    const res = await authFetch(`${API}/api/v1/workflows/employee/${userId}`);
    const d = await res.json();
    if (res.ok) setData(d.workflows || []);
    else setMsg(d.detail || "Failed to load workflows");
  };

  const completeTask = async (taskId) => {
    const res = await authFetch(`${API}/api/v1/workflows/tasks/${taskId}/complete`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const d = await res.json();
    setMsg(res.ok ? "Task completed." : (d.detail || "Failed to complete task"));
    if (res.ok) loadEmployeeWorkflows();
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <h1>Onboarding & Offboarding Workflows</h1>
      <p style={{ color: "var(--muted)" }}>Run and track structured lifecycle task checklists.</p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <input className="search" placeholder="Employee UUID" value={userId} onChange={(e) => setUserId(e.target.value)} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btnPrimary" onClick={startOnboarding}>Start Onboarding</button>
          <button className="btn btnGhost" onClick={startOffboarding}>Start Offboarding</button>
          <button className="btn btnGhost" onClick={loadEmployeeWorkflows}>View Workflows</button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {(data || []).map((wf) => (
          <div key={wf.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 700 }}>{wf.title} · {wf.workflow_type} · {wf.status}</div>
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              {(wf.tasks || []).map((t) => (
                <div key={t.id} className="btn" style={{ textAlign: "left", display: "flex", justifyContent: "space-between" }}>
                  <span>{t.is_completed ? "✅" : "⬜"} {t.title}</span>
                  {!t.is_completed && <button className="btn btnTiny" onClick={() => completeTask(t.id)}>Complete</button>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
