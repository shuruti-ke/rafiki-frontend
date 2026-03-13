import { useEffect, useMemo, useState } from "react";
import { API, authFetch } from "../api.js";
import { employeeDisplayName, normalizeEmployeeRecord } from "../utils/employeeRecord.js";

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

const MODE_META = {
  onboarding: {
    title: "Employee Onboarding",
    subtitle: "Set up a structured first-week journey with shared ownership across HR, IT, and the manager.",
    actionLabel: "Start Onboarding Workflow",
    accent: "rgba(34, 197, 94, 0.12)",
  },
  offboarding: {
    title: "Employee Offboarding",
    subtitle: "Coordinate handover, asset return, access closure, and final separation steps.",
    actionLabel: "Start Offboarding Workflow",
    accent: "rgba(249, 115, 22, 0.12)",
  },
};

const OWNER_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "hr", label: "HR" },
  { value: "it", label: "IT" },
];

function buildDefaultTasks(mode) {
  return DEFAULT_TASKS[mode].map((task) => ({ ...task, due_date: "" }));
}

function ownerLabel(value) {
  return OWNER_OPTIONS.find((option) => option.value === value)?.label || value || "Employee";
}

function formatDate(value) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function statPillStyle(active, accent) {
  return {
    border: "1px solid var(--border)",
    borderRadius: 999,
    padding: "8px 12px",
    background: active ? accent : "transparent",
    fontWeight: 600,
  };
}

export default function AdminWorkflows() {
  const [userId, setUserId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [msg, setMsg] = useState("");
  const [workflows, setWorkflows] = useState([]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("onboarding");
  const [title, setTitle] = useState(MODE_META.onboarding.title);
  const [tasks, setTasks] = useState(() => buildDefaultTasks("onboarding"));
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    authFetch(`${API}/api/v1/employees/`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setEmployees(Array.isArray(rows) ? rows.map(normalizeEmployeeRecord) : []))
      .catch(() => setEmployees([]));
  }, []);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.user_id === userId) || null,
    [employees, userId]
  );

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees.slice(0, 14);
    return employees.filter((emp) =>
      [emp.name, emp.email, emp.department, emp.job_title, emp.employment_number].some((value) =>
        String(value || "").toLowerCase().includes(q)
      )
    );
  }, [employees, query]);

  function resetComposer(nextMode) {
    setMode(nextMode);
    setTitle(MODE_META[nextMode].title);
    setTasks(buildDefaultTasks(nextMode));
  }

  async function loadEmployeeWorkflows(targetUserId = userId) {
    if (!targetUserId) {
      setWorkflows([]);
      return;
    }
    setLoadingWorkflows(true);
    try {
      const res = await authFetch(`${API}/api/v1/workflows/employee/${targetUserId}`);
      const data = await res.json();
      if (res.ok) {
        setWorkflows(data.workflows || []);
      } else {
        setWorkflows([]);
        setMsg(data.detail || "Failed to load workflows");
      }
    } catch {
      setWorkflows([]);
      setMsg("Failed to load workflows");
    } finally {
      setLoadingWorkflows(false);
    }
  }

  useEffect(() => {
    loadEmployeeWorkflows(userId);
  }, [userId]);

  function buildPayload() {
    return {
      title: title.trim() || undefined,
      tasks: tasks
        .map((task) => ({
          title: task.title.trim(),
          owner_type: task.owner_type,
          due_date: task.due_date || undefined,
        }))
        .filter((task) => task.title),
    };
  }

  async function startWorkflow() {
    if (!userId) return;
    const endpoint = mode === "onboarding" ? "onboarding" : "offboarding";
    setSubmitting(true);
    try {
      const res = await authFetch(`${API}/api/v1/workflows/${endpoint}/${userId}`, {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      setMsg(
        res.ok
          ? `${mode === "onboarding" ? "Onboarding" : "Offboarding"} workflow started.`
          : (data.detail || `Failed to start ${mode}`)
      );
      if (res.ok) {
        await loadEmployeeWorkflows(userId);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function completeTask(taskId) {
    const res = await authFetch(`${API}/api/v1/workflows/tasks/${taskId}/complete`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setMsg(res.ok ? "Task completed." : (data.detail || "Failed to complete task"));
    if (res.ok) loadEmployeeWorkflows();
  }

  return (
    <div style={{ maxWidth: 1280 }}>
      <h1>Onboarding & Offboarding Workflows</h1>
      <p style={{ color: "var(--muted)" }}>
        Pick an employee on the left to see their workflow history instantly, then build a guided onboarding or offboarding checklist on the right.
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 380px) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 10, border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--panel)" }}>
            <div>
              <h3 style={{ margin: 0 }}>1. Choose Employee</h3>
              <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>
                Search by name, email, department, or employee number. Workflow history opens automatically after selection.
              </p>
            </div>
            <input
              className="search"
              placeholder="Search name, email, department..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--border)", borderRadius: 12, background: "#fff" }}>
              {filteredEmployees.map((emp) => (
                <button
                  key={emp.user_id}
                  className="btn"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    borderRadius: 0,
                    background: userId === emp.user_id ? "rgba(139,92,246,.08)" : "transparent",
                    padding: 14,
                  }}
                  onClick={() => {
                    setUserId(emp.user_id);
                    setMsg("");
                  }}
                >
                  <strong>{employeeDisplayName(emp)}</strong>
                  <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                    {[emp.department, emp.job_title, emp.email].filter(Boolean).join(" · ")}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--panel)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <h3 style={{ margin: 0 }}>2. Workflow History</h3>
                <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>
                  Review active and completed workflows for the selected employee.
                </p>
              </div>
              <button className="btn btnGhost" onClick={() => loadEmployeeWorkflows()} disabled={!userId || loadingWorkflows}>
                {loadingWorkflows ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {!selectedEmployee ? (
              <div style={{ border: "1px dashed var(--border)", borderRadius: 12, padding: 16, color: "var(--muted)" }}>
                Select an employee to view their onboarding and offboarding history.
              </div>
            ) : (
              <>
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, background: "#fff" }}>
                  <div style={{ fontWeight: 700 }}>{employeeDisplayName(selectedEmployee)}</div>
                  <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                    {[selectedEmployee.department, selectedEmployee.job_title, selectedEmployee.email].filter(Boolean).join(" · ") || "Employee profile"}
                  </div>
                </div>

                {loadingWorkflows ? (
                  <div style={{ color: "var(--muted)" }}>Loading workflow history...</div>
                ) : workflows.length === 0 ? (
                  <div style={{ border: "1px dashed var(--border)", borderRadius: 12, padding: 16, color: "var(--muted)" }}>
                    No workflows yet for this employee. Use the builder on the right to create one.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {workflows.map((workflow) => (
                      <div key={workflow.id} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, background: "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{workflow.title}</div>
                            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                              {workflow.workflow_type} · {workflow.status} · {(workflow.tasks || []).filter((task) => task.is_completed).length}/{(workflow.tasks || []).length} complete
                            </div>
                          </div>
                          <div style={statPillStyle(workflow.status === "completed", workflow.status === "completed" ? "rgba(34,197,94,.14)" : "rgba(59,130,246,.12)")}>
                            {workflow.status}
                          </div>
                        </div>

                        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                          {(workflow.tasks || []).map((task) => (
                            <div
                              key={task.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 12,
                                alignItems: "flex-start",
                                border: "1px solid var(--border)",
                                borderRadius: 12,
                                padding: 12,
                                background: task.is_completed ? "rgba(34,197,94,.08)" : "transparent",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 600 }}>
                                  {task.is_completed ? "Completed" : "Open"} · {task.title}
                                </div>
                                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                                  Owner: {ownerLabel(task.owner_type)} · Due: {formatDate(task.due_date)}
                                </div>
                              </div>
                              {!task.is_completed ? (
                                <button className="btn btnTiny" onClick={() => completeTask(task.id)}>
                                  Complete
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 14, border: "1px solid var(--border)", borderRadius: 16, padding: 18, background: "var(--panel)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>3. Build Workflow</h3>
                <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>
                  Create the workflow on the right, adjust the task checklist, then launch it for the selected employee.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className={`btn ${mode === "onboarding" ? "btnPrimary" : "btnGhost"}`}
                  onClick={() => resetComposer("onboarding")}
                >
                  Onboarding
                </button>
                <button
                  className={`btn ${mode === "offboarding" ? "btnPrimary" : "btnGhost"}`}
                  onClick={() => resetComposer("offboarding")}
                >
                  Offboarding
                </button>
              </div>
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 16, background: MODE_META[mode].accent }}>
              <div style={{ fontWeight: 700 }}>{MODE_META[mode].title}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{MODE_META[mode].subtitle}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto", gap: 12, alignItems: "end" }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Workflow Title</div>
                <input
                  className="search"
                  placeholder="Workflow title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <button
                className="btn btnPrimary"
                onClick={startWorkflow}
                disabled={!userId || submitting || buildPayload().tasks.length === 0}
              >
                {submitting ? "Starting..." : MODE_META[mode].actionLabel}
              </button>
            </div>

            <div style={{ display: "grid", gap: 10, border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0 }}>Task Checklist</h3>
                  <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>
                    Assign each task to the right owner and add due dates where accountability matters.
                  </p>
                </div>
                <button
                  className="btn btnGhost"
                  onClick={() => setTasks((prev) => [...prev, { title: "", owner_type: "admin", due_date: "" }])}
                >
                  Add Task
                </button>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {tasks.map((task, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 1.8fr) minmax(120px, 0.8fr) minmax(140px, 0.9fr) auto",
                      gap: 10,
                      alignItems: "end",
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Task</div>
                      <input
                        className="search"
                        placeholder="Task title"
                        value={task.title}
                        onChange={(e) =>
                          setTasks((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, title: e.target.value } : row))
                          )
                        }
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Owner</div>
                      <select
                        className="search"
                        value={task.owner_type}
                        onChange={(e) =>
                          setTasks((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, owner_type: e.target.value } : row))
                          )
                        }
                      >
                        {OWNER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Due Date</div>
                      <input
                        className="search"
                        type="date"
                        value={task.due_date || ""}
                        onChange={(e) =>
                          setTasks((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, due_date: e.target.value } : row))
                          )
                        }
                      />
                    </div>
                    <button className="btn btnGhost" onClick={() => setTasks((prev) => prev.filter((_, i) => i !== idx))}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: "1px dashed var(--border)", borderRadius: 14, padding: 14, color: "var(--muted)" }}>
              {selectedEmployee
                ? `This workflow will be created for ${employeeDisplayName(selectedEmployee)}.`
                : "Select an employee from the left before starting a workflow."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
