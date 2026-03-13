import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";

export default function AdminShiftManagement() {
  const [templates, setTemplates] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    name: "",
    shift_type: "custom",
    start_time: "08:00",
    end_time: "17:00",
    crosses_midnight: false,
  });

  const [assign, setAssign] = useState({ template_id: "", user_id: "", shift_date: "" });

  async function load() {
    const [t, d] = await Promise.all([
      authFetch(`${API}/api/v1/shifts/templates`),
      authFetch(`${API}/api/v1/shifts/dashboard`),
    ]);
    if (t.ok) setTemplates((await t.json()).templates || []);
    if (d.ok) setDashboard(await d.json());
  }

  useEffect(() => { load(); }, []);

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
      load();
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
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <h1>Shift Management</h1>
      <p style={{ color: "var(--muted)" }}>Create shifts, assign staff, and monitor swap workload.</p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      {dashboard && (
        <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <div className="btn">Next 7 days assignments: {dashboard.assignments_next_7_days}</div>
          <div className="btn">Pending swaps: {dashboard.pending_swap_requests}</div>
        </div>
      )}

      <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        <h3>Create Shift Template</h3>
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

      <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        <h3>Assign Shift</h3>
        <select className="search" value={assign.template_id} onChange={(e) => setAssign(a => ({ ...a, template_id: e.target.value }))}>
          <option value="">Select template</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.start_time} - {t.end_time})</option>)}
        </select>
        <input className="search" placeholder="Employee User UUID" value={assign.user_id} onChange={(e) => setAssign(a => ({ ...a, user_id: e.target.value }))} />
        <input className="search" type="date" value={assign.shift_date} onChange={(e) => setAssign(a => ({ ...a, shift_date: e.target.value }))} />
        <button className="btn btnPrimary" onClick={createAssignment}>Create Assignment</button>
      </div>

      <h3>Templates</h3>
      <div style={{ display: "grid", gap: 8 }}>
        {templates.map(t => <div key={t.id} className="btn" style={{ textAlign: "left" }}>{t.name} · {t.shift_type} · {t.start_time} - {t.end_time}</div>)}
      </div>
    </div>
  );
}
