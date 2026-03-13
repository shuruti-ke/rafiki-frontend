import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";

export default function MyWorkflowsPage() {
  const [workflows, setWorkflows] = useState([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await authFetch(`${API}/api/v1/workflows/my`);
    const data = await res.json();
    if (res.ok) setWorkflows(data.workflows || []);
  }

  useEffect(() => {
    load().catch(() => setWorkflows([]));
  }, []);

  async function completeTask(taskId) {
    const res = await authFetch(`${API}/api/v1/workflows/tasks/${taskId}/complete`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setMsg(res.ok ? "Task completed." : (data.detail || "Failed to complete task"));
    if (res.ok) load();
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1>My Workflows</h1>
      <p style={{ color: "var(--muted)" }}>
        Track onboarding or offboarding tasks with owner and due-date context.
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "grid", gap: 12 }}>
        {workflows.length === 0 ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)", color: "var(--muted)" }}>
            No active workflows assigned to you.
          </div>
        ) : workflows.map((workflow) => (
          <div key={workflow.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{workflow.title}</div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>{workflow.workflow_type} · {workflow.status}</div>
              </div>
              <div className="btn">
                {(workflow.tasks || []).filter((task) => task.is_completed).length}/{(workflow.tasks || []).length} complete
              </div>
            </div>

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {(workflow.tasks || []).map((task) => (
                <div key={task.id} className="btn" style={{ textAlign: "left", display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <strong>{task.is_completed ? "✅" : "⬜"} {task.title}</strong>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>
                      Owner: {task.owner_type || "employee"}{task.due_date ? ` · Due ${task.due_date}` : ""}
                    </div>
                  </div>
                  {!task.is_completed && <button className="btn btnTiny" onClick={() => completeTask(task.id)}>Complete</button>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
