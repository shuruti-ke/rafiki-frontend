import { useEffect, useMemo, useState } from "react";
import { API, authFetch } from "../api.js";

const DEFAULT_TASKS = {
  onboarding: [
    { title: "Send welcome pack", owner_type: "admin" },
    { title: "Complete profile and payroll forms", owner_type: "employee" },
    { title: "Provision laptop and apps", owner_type: "it" },
    { title: "Manager welcome call", owner_type: "manager" },
  ],
  offboarding: [
    { title: "Schedule exit interview", owner_type: "hr" },
    { title: "Collect company assets", owner_type: "admin" },
    { title: "Complete handover", owner_type: "employee" },
    { title: "Disable access and settle final pay", owner_type: "it" },
  ],
};

function employeeLabel(emp) {
  return emp?.name || emp?.email || "Unnamed employee";
}

export default function AdminWorkflows() {
  const [userId, setUserId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [msg, setMsg] = useState("");
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("onboarding");
  const [title, setTitle] = useState("");
  const [tasks, setTasks] = useState(DEFAULT_TASKS.onboarding);

  useEffect(() => {
    authFetch(`${API}/api/v1/employees/`)
      .then((res) => res.ok ? res.json() : [])
      .then((rows) => setEmployees(Array.isArray(rows) ? rows : []))
      .catch(() => setEmployees([]));
  }, []);

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees.slice(0, 12);
    return employees.filter((emp) =>
      [emp.name, emp.email, emp.department, emp.job_title].some((value) =>
        String(value || "").toLowerCase().includes(q)
      )
    );
  }, [employees, query]);

  function resetTasks(nextMode) {
    setMode(nextMode);
    setTasks(DEFAULT_TASKS[nextMode].map((task) => ({ ...task, due_date: "" })));
    setTitle(nextMode === "onboarding" ? "Employee Onboarding" : "Employee Offboarding");
  }

  useEffect(() => {
    resetTasks("onboarding");
  }, []);

  function buildPayload() {
    return {
      title: title.trim() || undefined,
      tasks: tasks.map((task) => ({
        title: task.title,
        owner_type: task.owner_type,
        due_date: task.due_date || undefined,
      })),
    };
  }

  const startOnboarding = async () => {
    const res = await authFetch(`${API}/api/v1/workflows/onboarding/${userId}`, {
      method: "POST",
      body: JSON.stringify(buildPayload()),
    });
    const d = await res.json();
    setMsg(res.ok ? "Onboarding workflow started." : (d.detail || "Failed to start onboarding"));
    if (res.ok) loadEmployeeWorkflows();
  };

  const startOffboarding = async () => {
    const res = await authFetch(`${API}/api/v1/workflows/offboarding/${userId}`, {
      method: "POST",
      body: JSON.stringify(buildPayload()),
    });
    const d = await res.json();
    setMsg(res.ok ? "Offboarding workflow started." : (d.detail || "Failed to start offboarding"));
    if (res.ok) loadEmployeeWorkflows();
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
    <div style={{ maxWidth: 1200 }}>
      <h1>Onboarding & Offboarding Workflows</h1>
      <p style={{ color: "var(--muted)" }}>
        Run cross-functional employee journeys with task ownership, due dates, and a cleaner employee picker.
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) 1fr", gap: 20, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 8, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <h3 style={{ margin: 0 }}>Select Employee</h3>
            <input className="search" placeholder="Search name, email, department..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
              {filteredEmployees.map((emp) => (
                <button
                  key={emp.user_id}
                  className="btn"
                  style={{ width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid var(--border)", borderRadius: 0, background: userId === emp.user_id ? "rgba(139,92,246,.08)" : "transparent" }}
                  onClick={() => setUserId(emp.user_id)}
                >
                  <strong>{employeeLabel(emp)}</strong>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>{[emp.department, emp.job_title, emp.email].filter(Boolean).join(" · ")}</div>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className={`btn ${mode === "onboarding" ? "btnPrimary" : "btnGhost"}`} onClick={() => resetTasks("onboarding")}>Onboarding</button>
              <button className={`btn ${mode === "offboarding" ? "btnPrimary" : "btnGhost"}`} onClick={() => resetTasks("offboarding")}>Offboarding</button>
            </div>
            <input className="search" placeholder="Workflow title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button className="btn btnGhost" onClick={loadEmployeeWorkflows} disabled={!userId}>View Workflows</button>
          </div>

          <div style={{ display: "grid", gap: 10, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Task Checklist</h3>
              <button
                className="btn btnGhost"
                onClick={() => setTasks((prev) => [...prev, { title: "", owner_type: "admin", due_date: "" }])}
              >
                Add Task
              </button>
            </div>
            {tasks.map((task, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr auto", gap: 8 }}>
                <input
                  className="search"
                  placeholder="Task title"
                  value={task.title}
                  onChange={(e) => setTasks((prev) => prev.map((row, i) => i === idx ? { ...row, title: e.target.value } : row))}
                />
                <select
                  className="search"
                  value={task.owner_type}
                  onChange={(e) => setTasks((prev) => prev.map((row, i) => i === idx ? { ...row, owner_type: e.target.value } : row))}
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="hr">HR</option>
                  <option value="it">IT</option>
                </select>
                <input
                  className="search"
                  type="date"
                  value={task.due_date || ""}
                  onChange={(e) => setTasks((prev) => prev.map((row, i) => i === idx ? { ...row, due_date: e.target.value } : row))}
                />
                <button className="btn btnGhost" onClick={() => setTasks((prev) => prev.filter((_, i) => i !== idx))}>Remove</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btnPrimary" onClick={startOnboarding} disabled={!userId || mode !== "onboarding"}>Start Onboarding</button>
              <button className="btn btnPrimary" onClick={startOffboarding} disabled={!userId || mode !== "offboarding"}>Start Offboarding</button>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {(data || []).length === 0 ? (
            <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)", color: "var(--muted)" }}>
              No workflows loaded yet. Select an employee and click `View Workflows`.
            </div>
          ) : (data || []).map((wf) => (
            <div key={wf.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{wf.title}</div>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>{wf.workflow_type} · {wf.status}</div>
                </div>
                <div className="btn">{(wf.tasks || []).filter((t) => t.is_completed).length}/{(wf.tasks || []).length} complete</div>
              </div>
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {(wf.tasks || []).map((t) => (
                  <div key={t.id} className="btn" style={{ textAlign: "left", display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <strong>{t.is_completed ? "✅" : "⬜"} {t.title}</strong>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>
                        Owner: {t.owner_type || "employee"}{t.due_date ? ` · Due ${t.due_date}` : ""}
                      </div>
                    </div>
                    {!t.is_completed && <button className="btn btnTiny" onClick={() => completeTask(t.id)}>Complete</button>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
