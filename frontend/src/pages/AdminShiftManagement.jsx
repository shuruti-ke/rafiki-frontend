import { useEffect, useMemo, useState } from "react";
import { API, authFetch } from "../api.js";
import { employeeDisplayName, normalizeEmployeeRecord } from "../utils/employeeRecord.js";

function startOfWeek(input) {
  const d = new Date(input);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function formatWeekday(d) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatWeekRange(days) {
  if (!days.length) return "";
  const first = days[0];
  const last = days[days.length - 1];
  return `${first.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${last.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatTime(value) {
  if (!value) return "";
  const [hours = "00", minutes = "00"] = String(value).split(":");
  const d = new Date();
  d.setHours(Number(hours), Number(minutes), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function shiftTone(type) {
  if (type === "morning") return { bg: "rgba(245, 158, 11, 0.14)", color: "#b45309" };
  if (type === "afternoon") return { bg: "rgba(59, 130, 246, 0.12)", color: "#1d4ed8" };
  if (type === "night") return { bg: "rgba(79, 70, 229, 0.14)", color: "#4338ca" };
  return { bg: "rgba(139, 92, 246, 0.12)", color: "#7c3aed" };
}

function cardStyle({ gap = 12, padding = 18, background = "var(--panel)" } = {}) {
  return {
    display: "grid",
    gap,
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding,
    background,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
  };
}

function MetricCard({ label, value, tone }) {
  return (
    <div
      style={{
        ...cardStyle({ gap: 6, padding: 16, background: "#fff" }),
        minWidth: 160,
        borderColor: tone?.border || "var(--border)",
      }}
    >
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: tone?.text || "var(--text)" }}>{value}</div>
    </div>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {subtitle ? <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export default function AdminShiftManagement() {
  const [templates, setTemplates] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [swapRequests, setSwapRequests] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [weekStart, setWeekStart] = useState(() => isoDate(startOfWeek(new Date())));
  const [form, setForm] = useState({
    name: "",
    shift_type: "custom",
    start_time: "08:00",
    end_time: "17:00",
    crosses_midnight: false,
  });
  const [assign, setAssign] = useState({ template_id: "", user_id: "", shift_date: "" });

  async function loadPage(showFullLoader = false) {
    if (showFullLoader) setLoading(true);
    else setRefreshing(true);

    try {
      const weekStartDate = new Date(weekStart);
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekStartDate.getDate() + 6);

      const [t, d, e, a, swaps] = await Promise.all([
        authFetch(`${API}/api/v1/shifts/templates`),
        authFetch(`${API}/api/v1/shifts/dashboard`),
        authFetch(`${API}/api/v1/employees/`),
        authFetch(`${API}/api/v1/shifts/team?start_date=${isoDate(weekStartDate)}&end_date=${isoDate(weekEndDate)}`),
        authFetch(`${API}/api/v1/shifts/swap-requests?status=pending`),
      ]);

      if (t.ok) setTemplates((await t.json()).templates || []);
      if (d.ok) setDashboard(await d.json());
      if (e.ok) {
        const data = await e.json();
        setEmployees(Array.isArray(data) ? data.map(normalizeEmployeeRecord) : []);
      }
      if (a.ok) setAssignments((await a.json()).assignments || []);
      if (swaps.ok) setSwapRequests((await swaps.json()).requests || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadPage(assignments.length === 0 && employees.length === 0);
  }, [weekStart]);

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return employees.slice(0, 12);
    return employees.filter((emp) =>
      [emp.name, emp.email, emp.department, emp.job_title, emp.employment_number].some((value) =>
        String(value || "").toLowerCase().includes(q)
      )
    );
  }, [employees, employeeQuery]);

  const selectedEmployee = employees.find((emp) => emp.user_id === assign.user_id);
  const selectedTemplate = templates.find((template) => template.id === assign.template_id);

  const weekDays = useMemo(() => {
    const start = new Date(weekStart);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const assignmentsByDay = useMemo(() => {
    return weekDays.reduce((acc, day) => {
      const dayIso = isoDate(day);
      acc[dayIso] = assignments.filter((assignment) => assignment.shift_date === dayIso);
      return acc;
    }, {});
  }, [assignments, weekDays]);

  const assignmentConflict = assignments.find(
    (row) => row.user_id === assign.user_id && row.shift_date === assign.shift_date
  );

  const assignedHeadcount = new Set(assignments.map((row) => row.user_id).filter(Boolean)).size;
  const openDays = weekDays.filter((day) => (assignmentsByDay[isoDate(day)] || []).length === 0).length;
  const busiestDay = weekDays.reduce(
    (current, day) => {
      const count = (assignmentsByDay[isoDate(day)] || []).length;
      if (!current || count > current.count) {
        return { label: formatWeekday(day), count };
      }
      return current;
    },
    null
  );

  async function refreshSchedule() {
    await loadPage(false);
  }

  const createTemplate = async () => {
    setMsg("");
    const res = await authFetch(`${API}/api/v1/shifts/templates`, {
      method: "POST",
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg("Shift template created.");
      setForm({ name: "", shift_type: "custom", start_time: "08:00", end_time: "17:00", crosses_midnight: false });
      const t = await authFetch(`${API}/api/v1/shifts/templates`);
      if (t.ok) setTemplates((await t.json()).templates || []);
    } else {
      setMsg(data.detail || "Failed to create template.");
    }
  };

  const createAssignment = async () => {
    setMsg("");
    const res = await authFetch(`${API}/api/v1/shifts/assignments`, {
      method: "POST",
      body: JSON.stringify(assign),
    });
    const data = await res.json();
    setMsg(res.ok ? "Shift assignment created." : (data.detail || "Failed to assign shift."));
    if (res.ok) {
      setAssign({ template_id: assign.template_id, user_id: "", shift_date: "" });
      setEmployeeQuery("");
      refreshSchedule();
    }
  };

  if (loading) {
    return <div style={{ color: "var(--muted)" }}>Loading shift planner...</div>;
  }

  return (
    <div style={{ maxWidth: 1320, display: "grid", gap: 18 }}>
      <div
        style={{
          ...cardStyle({ gap: 14, padding: 22, background: "linear-gradient(135deg, rgba(139,92,246,0.10), rgba(45,212,191,0.10))" }),
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>Shift Management</h1>
            <p style={{ color: "var(--muted)", margin: "8px 0 0", maxWidth: 760 }}>
              Plan weekly coverage with clearer schedule visibility, faster employee assignment, and a more polished control center for templates and swap requests.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="btn" style={{ background: "#fff", borderRadius: 999 }}>
              Week of {formatWeekRange(weekDays)}
            </div>
            <button className="btn btnGhost" onClick={refreshSchedule} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "Refresh Schedule"}
            </button>
          </div>
        </div>

        {msg ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.8)",
              border: "1px solid rgba(139,92,246,0.12)",
              color: "var(--text)",
            }}
          >
            {msg}
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <MetricCard label="Assignments Next 7 Days" value={dashboard?.assignments_next_7_days ?? assignments.length} tone={{ text: "#7c3aed" }} />
        <MetricCard label="Assigned Employees" value={assignedHeadcount} tone={{ text: "#0f766e" }} />
        <MetricCard label="Pending Swaps" value={dashboard?.pending_swap_requests ?? swapRequests.length} tone={{ text: "#b45309" }} />
        <MetricCard label="Open Days" value={openDays} tone={{ text: openDays > 0 ? "#dc2626" : "#16a34a" }} />
        <MetricCard label="Busiest Day" value={busiestDay?.count ? `${busiestDay.label}` : "None"} tone={{ text: "#2563eb" }} />
      </div>

      {(dashboard?.by_shift_type || []).length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(dashboard.by_shift_type || []).map((row) => {
            const tone = shiftTone(row.shift_type);
            return (
              <div
                key={row.shift_type}
                style={{
                  padding: "10px 14px",
                  borderRadius: 999,
                  background: tone.bg,
                  color: tone.color,
                  fontWeight: 700,
                  border: "1px solid rgba(15, 23, 42, 0.05)",
                }}
              >
                {row.shift_type}: {row.count}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(330px, 390px) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 18 }}>
          <div style={cardStyle()}>
            <SectionHeader
              title="Create Shift Template"
              subtitle="Build reusable shift patterns so weekly planning becomes faster and more consistent."
            />
            <input className="search" placeholder="Template name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <select className="search" value={form.shift_type} onChange={(e) => setForm((f) => ({ ...f, shift_type: e.target.value }))}>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="night">Night</option>
              <option value="custom">Custom</option>
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Start time</div>
                <input className="search" type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>End time</div>
                <input className="search" type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 14 }}>
              <input type="checkbox" checked={form.crosses_midnight} onChange={(e) => setForm((f) => ({ ...f, crosses_midnight: e.target.checked }))} />
              This shift crosses midnight
            </label>
            <button className="btn btnPrimary" onClick={createTemplate}>Save Template</button>
          </div>

          <div style={cardStyle()}>
            <SectionHeader
              title="Quick Assign"
              subtitle="Choose a shift template, search the right employee, and assign directly into the current week."
            />
            <select className="search" value={assign.template_id} onChange={(e) => setAssign((a) => ({ ...a, template_id: e.target.value }))}>
              <option value="">Select shift template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({formatTime(template.start_time)} - {formatTime(template.end_time)})
                </option>
              ))}
            </select>

            {selectedTemplate ? (
              <div style={{ ...cardStyle({ gap: 6, padding: 14, background: "#fff" }) }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <strong>{selectedTemplate.name}</strong>
                  <span
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: shiftTone(selectedTemplate.shift_type).bg,
                      color: shiftTone(selectedTemplate.shift_type).color,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {selectedTemplate.shift_type}
                  </span>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  {formatTime(selectedTemplate.start_time)} - {formatTime(selectedTemplate.end_time)}
                  {selectedTemplate.crosses_midnight ? " · crosses midnight" : ""}
                </div>
              </div>
            ) : null}

            <input
              className="search"
              placeholder="Search employee by name, email, department..."
              value={employeeQuery}
              onChange={(e) => setEmployeeQuery(e.target.value)}
            />
            <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid var(--border)", borderRadius: 14, background: "#fff" }}>
              {filteredEmployees.map((emp) => (
                <button
                  key={emp.user_id}
                  className="btn"
                  style={{
                    width: "100%",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    borderRadius: 0,
                    textAlign: "left",
                    display: "block",
                    background: assign.user_id === emp.user_id ? "rgba(139,92,246,.08)" : "transparent",
                    padding: 14,
                  }}
                  onClick={() => setAssign((a) => ({ ...a, user_id: emp.user_id }))}
                >
                  <strong>{employeeDisplayName(emp)}</strong>
                  <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                    {[emp.department, emp.job_title, emp.email].filter(Boolean).join(" · ")}
                  </div>
                </button>
              ))}
              {filteredEmployees.length === 0 && (
                <div style={{ padding: 14, color: "var(--muted)" }}>No employees match that search.</div>
              )}
            </div>

            {selectedEmployee ? (
              <div style={{ ...cardStyle({ gap: 6, padding: 14, background: "#fff" }) }}>
                <strong>{employeeDisplayName(selectedEmployee)}</strong>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  {[selectedEmployee.department, selectedEmployee.job_title, selectedEmployee.email].filter(Boolean).join(" · ")}
                </div>
              </div>
            ) : null}

            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Shift date</div>
              <input className="search" type="date" value={assign.shift_date} onChange={(e) => setAssign((a) => ({ ...a, shift_date: e.target.value }))} />
            </div>

            {assignmentConflict ? (
              <div style={{ color: "#b45309", background: "rgba(251,191,36,.12)", borderRadius: 14, padding: 12 }}>
                Conflict detected: this employee already has a shift on {assignmentConflict.shift_date}.
              </div>
            ) : null}

            <button
              className="btn btnPrimary"
              onClick={createAssignment}
              disabled={!assign.template_id || !assign.user_id || !assign.shift_date || Boolean(assignmentConflict)}
            >
              Create Assignment
            </button>
          </div>

          <div style={cardStyle()}>
            <SectionHeader
              title="Pending Swap Requests"
              subtitle="Review employee swap activity early so coverage gaps do not surprise the team."
            />
            {swapRequests.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>No swap requests pending this week.</div>
            ) : swapRequests.map((req) => (
              <div key={req.id} style={{ ...cardStyle({ gap: 6, padding: 14, background: "#fff" }) }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <strong>{req.requester_name || "Employee"}</strong>
                  <span style={{ padding: "6px 10px", borderRadius: 999, background: "rgba(249,115,22,.12)", color: "#c2410c", fontSize: 12, fontWeight: 700 }}>
                    Pending
                  </span>
                </div>
                <div style={{ color: "var(--text)", fontSize: 14 }}>
                  Wants to swap with {req.target_name || "selected teammate"}
                </div>
                {req.reason ? <div style={{ color: "var(--muted)", fontSize: 13 }}>{req.reason}</div> : null}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={cardStyle()}>
            <SectionHeader
              title="Weekly Schedule"
              subtitle="See each day at a glance, spot under-covered days, and navigate week by week."
              action={
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    className="btn btnGhost"
                    onClick={() => {
                      const d = new Date(weekStart);
                      d.setDate(d.getDate() - 7);
                      setWeekStart(isoDate(d));
                    }}
                  >
                    Previous
                  </button>
                  <input
                    className="search"
                    type="date"
                    value={weekStart}
                    onChange={(e) => setWeekStart(isoDate(startOfWeek(e.target.value)))}
                    style={{ width: 170 }}
                  />
                  <button
                    className="btn btnGhost"
                    onClick={() => {
                      const d = new Date(weekStart);
                      d.setDate(d.getDate() + 7);
                      setWeekStart(isoDate(d));
                    }}
                  >
                    Next
                  </button>
                </div>
              }
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 12 }}>
              {weekDays.map((day) => {
                const dayIso = isoDate(day);
                const rows = assignmentsByDay[dayIso] || [];
                const today = dayIso === isoDate(new Date());

                return (
                  <div
                    key={dayIso}
                    style={{
                      border: today ? "1px solid rgba(124,58,237,0.45)" : "1px solid var(--border)",
                      borderRadius: 18,
                      padding: 14,
                      background: today ? "linear-gradient(180deg, rgba(139,92,246,0.08), #fff)" : "var(--panel)",
                      minHeight: 320,
                      display: "grid",
                      gap: 10,
                      alignContent: "start",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{formatWeekday(day)}</div>
                        <div style={{ color: "var(--muted)", fontSize: 12 }}>{rows.length} assignment{rows.length === 1 ? "" : "s"}</div>
                      </div>
                      {today ? (
                        <span style={{ padding: "6px 10px", borderRadius: 999, background: "rgba(124,58,237,.12)", color: "#7c3aed", fontSize: 12, fontWeight: 700 }}>
                          Today
                        </span>
                      ) : null}
                    </div>

                    {rows.length === 0 ? (
                      <div
                        style={{
                          border: "1px dashed var(--border)",
                          borderRadius: 14,
                          padding: 14,
                          color: "var(--muted)",
                          fontSize: 13,
                          background: "#fff",
                        }}
                      >
                        No assignments yet. Use the quick assign panel to add coverage.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {rows.map((row) => {
                          const tone = shiftTone(row.shift_type);
                          return (
                            <div
                              key={row.id}
                              style={{
                                border: "1px solid var(--border)",
                                borderRadius: 14,
                                padding: 12,
                                background: "#fff",
                                display: "grid",
                                gap: 8,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                                <div style={{ fontWeight: 700 }}>{row.employee_name || row.email}</div>
                                <span
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: 999,
                                    background: tone.bg,
                                    color: tone.color,
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  {row.shift_type}
                                </span>
                              </div>
                              <div style={{ fontSize: 13, color: "var(--text)" }}>{row.shift_name}</div>
                              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                {formatTime(row.start_time)} - {formatTime(row.end_time)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={cardStyle()}>
            <SectionHeader
              title="Template Library"
              subtitle="Keep the most common shift patterns visible so planners can reuse them quickly."
            />
            {templates.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>No templates yet. Create your first reusable shift pattern from the setup panel.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                {templates.map((template) => {
                  const tone = shiftTone(template.shift_type);
                  return (
                    <div key={template.id} style={{ ...cardStyle({ gap: 8, padding: 14, background: "#fff" }) }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <strong>{template.name}</strong>
                        <span style={{ padding: "6px 10px", borderRadius: 999, background: tone.bg, color: tone.color, fontSize: 12, fontWeight: 700 }}>
                          {template.shift_type}
                        </span>
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: 13 }}>
                        {formatTime(template.start_time)} - {formatTime(template.end_time)}
                        {template.crosses_midnight ? " · crosses midnight" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
