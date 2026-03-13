import { useEffect, useMemo, useState } from "react";
import { API, authFetch } from "../api.js";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const CHART_COLORS = ["#8b5cf6", "#1fbfb8", "#3b82f6", "#fbbf24", "#34d399", "#f87171"];

function downloadCsv(filename, rows) {
  if (!rows?.length) return;
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

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
    chart_type: "bar",
    dashboard_widget: true,
    scheduled_email: "",
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
        chart_type: cfg.chart_type,
        dashboard_widget: cfg.dashboard_widget,
        scheduled_email: cfg.scheduled_email || undefined,
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
          chart_type: cfg.chart_type,
          dashboard_widget: cfg.dashboard_widget,
          scheduled_email: cfg.scheduled_email || undefined,
        },
      }),
    });
    const data = await res.json();
    if (res.ok) setResult(data);
    else setMsg(data.detail || "Failed to run report");
  };

  const runSaved = async (id) => {
    const selected = saved.find((report) => report.id === id);
    if (selected?.config) {
      setCfg((prev) => ({ ...prev, ...selected.config, name: selected.name || prev.name }));
    }
    const res = await authFetch(`${API}/api/v1/custom-reports/run`, {
      method: "POST",
      body: JSON.stringify({ saved_report_id: id }),
    });
    const data = await res.json();
    if (res.ok) setResult(data);
    else setMsg(data.detail || "Failed to run saved report");
  };

  const rows = result?.rows || [];
  const columns = useMemo(() => Array.from(new Set(rows.flatMap((row) => Object.keys(row)))), [rows]);
  const chartData = useMemo(() => {
    if (!rows.length) return [];
    if (cfg.group_by) {
      return rows.map((row, idx) => ({
        name: row[cfg.group_by] ?? `Group ${idx + 1}`,
        value: Number(row.count ?? row.total ?? row.sum_hours ?? row.net_pay_total ?? 0),
      }));
    }
    const firstKey = columns.find((col) => typeof rows[0]?.[col] === "string") || columns[0];
    const valueKey = columns.find((col) => typeof rows[0]?.[col] === "number") || columns[1];
    return rows.slice(0, 12).map((row, idx) => ({
      name: row[firstKey] ?? `Row ${idx + 1}`,
      value: Number(row[valueKey] ?? idx + 1),
    }));
  }, [rows, cfg.group_by, columns]);

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1>Custom Reports Builder</h1>
      <p style={{ color: "var(--muted)" }}>
        Build reports your team can actually use: saved widgets, exportable tables, and quick visual summaries for workforce and payroll questions.
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) 1fr", gap: 20, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 8, marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <h3 style={{ margin: 0 }}>Configure Report</h3>
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
            <select className="search" value={cfg.chart_type} onChange={(e) => setCfg(c => ({ ...c, chart_type: e.target.value }))}>
              <option value="bar">Bar chart</option>
              <option value="pie">Pie chart</option>
              <option value="table">Table only</option>
            </select>
            <input className="search" placeholder="Scheduled email label or recipient list (optional)" value={cfg.scheduled_email} onChange={(e) => setCfg(c => ({ ...c, scheduled_email: e.target.value }))} />
            <label><input type="checkbox" checked={cfg.dashboard_widget} onChange={(e) => setCfg(c => ({ ...c, dashboard_widget: e.target.checked }))} /> Pin as dashboard widget</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btnPrimary" onClick={runAdhoc}>Run Ad-hoc</button>
              <button className="btn btnGhost" onClick={saveReport}>Save Report</button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8, marginBottom: 20, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <h3 style={{ margin: 0 }}>Saved Reports</h3>
            {saved.map(r => (
              <div key={r.id} className="btn" style={{ textAlign: "left", display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>
                  <strong>{r.name}</strong>
                  {r.config?.dashboard_widget ? <span style={{ color: "#8b5cf6", marginLeft: 8 }}>Widget</span> : null}
                </span>
                <button className="btn btnTiny" onClick={() => runSaved(r.id)}>Run</button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {result && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <h3 style={{ margin: 0 }}>Results ({rows.length})</h3>
                <button className="btn btnGhost" onClick={() => downloadCsv(`${cfg.name || cfg.dataset}-report.csv`, rows)}>Export CSV</button>
              </div>

              {cfg.chart_type !== "table" && chartData.length > 0 && (
                <div style={{ height: 300, marginTop: 12 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    {cfg.chart_type === "pie" ? (
                      <PieChart>
                        <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={100}>
                          {chartData.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    ) : (
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}

              <div style={{ overflow: "auto", marginTop: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {columns.map((col) => (
                        <th key={col} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={idx}>
                        {columns.map((col) => (
                          <td key={col} style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                            {typeof row[col] === "object" ? JSON.stringify(row[col]) : String(row[col] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
