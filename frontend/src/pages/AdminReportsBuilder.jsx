import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";

export default function AdminReportsBuilder() {
  const [saved, setSaved] = useState([]);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState("");
  const [cfg, setCfg] = useState({
    name: "",
    dataset: "employees",
    group_by: "",
    start_date: "",
    end_date: "",
  });

  async function load() {
    const res = await authFetch(`${API}/api/v1/custom-reports/`);
    if (res.ok) setSaved((await res.json()).reports || []);
  }
  useEffect(() => { load(); }, []);

  const saveReport = async () => {
    const payload = {
      name: cfg.name || `${cfg.dataset} report`,
      description: "",
      config: {
        dataset: cfg.dataset,
        group_by: cfg.group_by,
        start_date: cfg.start_date || undefined,
        end_date: cfg.end_date || undefined,
      },
    };
    const res = await authFetch(`${API}/api/v1/custom-reports/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setMsg(res.ok ? "Report saved." : (data.detail || "Failed to save report"));
    if (res.ok) load();
  };

  const runAdhoc = async () => {
    const res = await authFetch(`${API}/api/v1/custom-reports/run`, {
      method: "POST",
      body: JSON.stringify({
        config: {
          dataset: cfg.dataset,
          group_by: cfg.group_by,
          start_date: cfg.start_date || undefined,
          end_date: cfg.end_date || undefined,
        },
      }),
    });
    const data = await res.json();
    if (res.ok) setResult(data);
    else setMsg(data.detail || "Failed to run report");
  };

  const runSaved = async (id) => {
    const res = await authFetch(`${API}/api/v1/custom-reports/run`, {
      method: "POST",
      body: JSON.stringify({ saved_report_id: id }),
    });
    const data = await res.json();
    if (res.ok) setResult(data);
    else setMsg(data.detail || "Failed to run saved report");
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1>Custom Reports Builder</h1>
      <p style={{ color: "var(--muted)" }}>Create reusable, filterable workforce and payroll reports.</p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
        <input className="search" placeholder="Report name" value={cfg.name} onChange={(e) => setCfg(c => ({ ...c, name: e.target.value }))} />
        <select className="search" value={cfg.dataset} onChange={(e) => setCfg(c => ({ ...c, dataset: e.target.value }))}>
          <option value="employees">Employees</option>
          <option value="leave">Leave</option>
          <option value="timesheets">Timesheets</option>
          <option value="payroll">Payroll</option>
        </select>
        <input className="search" placeholder="Group by (optional)" value={cfg.group_by} onChange={(e) => setCfg(c => ({ ...c, group_by: e.target.value }))} />
        <div style={{ display: "flex", gap: 8 }}>
          <input className="search" type="date" value={cfg.start_date} onChange={(e) => setCfg(c => ({ ...c, start_date: e.target.value }))} />
          <input className="search" type="date" value={cfg.end_date} onChange={(e) => setCfg(c => ({ ...c, end_date: e.target.value }))} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btnPrimary" onClick={runAdhoc}>Run Ad-hoc</button>
          <button className="btn btnGhost" onClick={saveReport}>Save Report</button>
        </div>
      </div>

      <h3>Saved Reports</h3>
      <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
        {saved.map(r => (
          <div key={r.id} className="btn" style={{ textAlign: "left", display: "flex", justifyContent: "space-between" }}>
            <span>{r.name}</span>
            <button className="btn btnTiny" onClick={() => runSaved(r.id)}>Run</button>
          </div>
        ))}
      </div>

      {result && (
        <div>
          <h3>Results ({result.rows?.length || 0})</h3>
          <pre style={{ whiteSpace: "pre-wrap", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
            {JSON.stringify(result.rows || [], null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
