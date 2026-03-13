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

export default function AdminShiftManagement() {
  const [templates, setTemplates] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [swapRequests, setSwapRequests] = useState([]);
  const [msg, setMsg] = useState("");
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

  useEffect(() => {
    async function run() {
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
    }
    run();
  }, [weekStart]);

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return employees.slice(0, 12);
    return employees.filter((emp) =>
      [
        emp.name,
        emp.email,
        emp.department,
        emp.job_title,
        emp.employment_number,
      ].some((value) => String(value || "").toLowerCase().includes(q))
    );
  }, [employees, employeeQuery]);

  const selectedEmployee = employees.find((emp) => emp.user_id === assign.user_id);
  const weekDays = useMemo(() => {
    const start = new Date(weekStart);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const assignmentConflict = assignments.find(
    (row) => row.user_id === assign.user_id && row.shift_date === assign.shift_date
  );

  async function refreshSchedule() {
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    const [a, swaps, d] = await Promise.all([
      authFetch(`${API}/api/v1/shifts/team?start_date=${isoDate(weekStartDate)}&end_date=${isoDate(weekEndDate)}`),
      authFetch(`${API}/api/v1/shifts/swap-requests?status=pending`),
      authFetch(`${API}/api/v1/shifts/dashboard`),
    ]);
    if (a.ok) setAssignments((await a.json()).assignments || []);
    if (swaps.ok) setSwapRequests((await swaps.json()).requests || []);
    if (d.ok) setDashboard(await d.json());
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

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1>Shift Management</h1>
      <p style={{ color: "var(--muted)" }}>
        Plan the week visually, assign people without UUID hunting, and keep an eye on swaps before they become coverage gaps.
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      {dashboard && (
        <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <div className="btn">Next 7 days assignments: {dashboard.assignments_next_7_days}</div>
          <div className="btn">Pending swaps: {dashboard.pending_swap_requests}</div>
          {(dashboard.by_shift_type || []).map((row) => (
            <div key={row.shift_type} className="btn">{row.shift_type}: {row.count}</div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 380px) 1fr", gap: 20, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "grid", gap: 10, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <h3 style={{ margin: 0 }}>Create Shift Template</h3>
            <input className="search" placeholder="Name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
            <select className="search" value={form.shift_type} onChange={(e) => setForm(f => ({ ...f, shift_type: e.target.value }))}>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="night">Night</option>
              <option value="custom">Custom</option>
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="search" type="time" value={form.start_time} onChange={(e) => setForm(f => ({ ...f, start_time: e.target.value }))} />
              <input className="search" type="time" value={form.end_time} onChange={(e) => setForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
            <label><input type="checkbox" checked={form.crosses_midnight} onChange={(e) => setForm(f => ({ ...f, crosses_midnight: e.target.checked }))} /> Crosses midnight</label>
            <button className="btn btnPrimary" onClick={createTemplate}>Save Template</button>
          </div>

          <div style={{ display: "grid", gap: 10, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <h3 style={{ margin: 0 }}>Assign Shift</h3>
            <select className="search" value={assign.template_id} onChange={(e) => setAssign(a => ({ ...a, template_id: e.target.value }))}>
              <option value="">Select template</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.start_time} - {t.end_time})</option>)}
            </select>
            <input
              className="search"
              placeholder="Search employee by name, email, department..."
              value={employeeQuery}
              onChange={(e) => setEmployeeQuery(e.target.value)}
            />
            <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
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
                  }}
                  onClick={() => setAssign((a) => ({ ...a, user_id: emp.user_id }))}
                >
                  <strong>{employeeDisplayName(emp)}</strong>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>
                    {[emp.department, emp.job_title, emp.email].filter(Boolean).join(" · ")}
                  </div>
                </button>
              ))}
              {filteredEmployees.length === 0 && (
                <div style={{ padding: 12, color: "var(--muted)" }}>No employees match that search.</div>
              )}
            </div>
            {selectedEmployee && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                Selected: <strong>{employeeDisplayName(selectedEmployee)}</strong>
              </div>
            )}
            <input className="search" type="date" value={assign.shift_date} onChange={(e) => setAssign(a => ({ ...a, shift_date: e.target.value }))} />
            {assignmentConflict && (
              <div style={{ color: "#b45309", background: "rgba(251,191,36,.12)", borderRadius: 8, padding: 10 }}>
                Conflict detected: this employee already has a shift on {assignmentConflict.shift_date}.
              </div>
            )}
            <button
              className="btn btnPrimary"
              onClick={createAssignment}
              disabled={!assign.template_id || !assign.user_id || !assign.shift_date || Boolean(assignmentConflict)}
            >
              Create Assignment
            </button>
          </div>

          <div style={{ display: "grid", gap: 8, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <h3 style={{ margin: 0 }}>Pending Swap Requests</h3>
            {swapRequests.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>No swap requests pending this week.</div>
            ) : swapRequests.map((req) => (
              <div key={req.id} className="btn" style={{ textAlign: "left" }}>
                <strong>{req.requester_name || "Employee"}</strong> wants to swap with {req.target_name || "selected teammate"}
                {req.reason ? <div style={{ color: "var(--muted)", marginTop: 4 }}>{req.reason}</div> : null}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Weekly Schedule</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn btnGhost" onClick={() => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() - 7);
                setWeekStart(isoDate(d));
              }}>Previous week</button>
              <input className="search" type="date" value={weekStart} onChange={(e) => setWeekStart(isoDate(startOfWeek(e.target.value)))} style={{ width: 170 }} />
              <button className="btn btnGhost" onClick={() => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() + 7);
                setWeekStart(isoDate(d));
              }}>Next week</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 10 }}>
            {weekDays.map((day) => {
              const dayIso = isoDate(day);
              const rows = assignments.filter((assignment) => assignment.shift_date === dayIso);
              return (
                <div key={dayIso} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--panel)", minHeight: 240 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>{formatWeekday(day)}</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {rows.length === 0 ? (
                      <div style={{ color: "var(--muted)", fontSize: 13 }}>No assignments</div>
                    ) : rows.map((row) => (
                      <div key={row.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "#fff" }}>
                        <div style={{ fontWeight: 700 }}>{row.employee_name || row.email}</div>
                        <div style={{ fontSize: 13, color: "var(--muted)" }}>{row.shift_name} · {row.start_time} - {row.end_time}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{row.shift_type}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "grid", gap: 8, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <h3 style={{ margin: 0 }}>Templates</h3>
            {templates.map(t => <div key={t.id} className="btn" style={{ textAlign: "left" }}>{t.name} · {t.shift_type} · {t.start_time} - {t.end_time}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
