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
const DATASET_META = {
  employees: {
    label: "Employees",
    description: "Track workforce shape, team distribution, and people trends.",
    accent: "#8b5cf6",
    groupOptions: ["department", "job_title", "employment_type", "work_location"],
  },
  leave: {
    label: "Leave",
    description: "Review request patterns, approvals, and leave usage by team or type.",
    accent: "#f59e0b",
    groupOptions: ["status", "leave_type", "department", "employment_type"],
  },
  timesheets: {
    label: "Timesheets",
    description: "Understand hours worked, utilization, and attendance-related reporting.",
    accent: "#3b82f6",
    groupOptions: ["department", "job_title", "work_location", "employee_name"],
  },
  payroll: {
    label: "Payroll",
    description: "Analyze payroll totals, pay distribution, and compensation reporting.",
    accent: "#14b8a6",
    groupOptions: ["department", "job_title", "employment_type", "employee_name"],
  },
};
const CHART_LABELS = {
  bar: "Bar Chart",
  pie: "Pie Chart",
  table: "Table Only",
};

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

function MetricCard({ label, value, accent }) {
  return (
    <div style={{ ...cardStyle({ gap: 6, padding: 16, background: "#fff" }), minWidth: 150 }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent || "var(--text)" }}>{value}</div>
    </div>
  );
}

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
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSavedId, setActiveSavedId] = useState("");
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

  const datasetMeta = DATASET_META[cfg.dataset] || DATASET_META.employees;

  async function load() {
    setLoadingSaved(true);
    const res = await authFetch(`${API}/api/v1/custom-reports/`);
    if (res.ok) setSaved((await res.json()).reports || []);
    setLoadingSaved(false);
  }
  useEffect(() => { load(); }, []);

  const saveReport = async () => {
    setSaving(true);
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
    setSaving(false);
  };

  const runAdhoc = async () => {
    setRunning(true);
    setActiveSavedId("");
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
    setRunning(false);
  };

  const runSaved = async (id) => {
    const selected = saved.find((report) => report.id === id);
    setActiveSavedId(id);
    if (selected?.config) {
      setCfg((prev) => ({ ...prev, ...selected.config, name: selected.name || prev.name }));
    }
    setRunning(true);
    const res = await authFetch(`${API}/api/v1/custom-reports/run`, {
      method: "POST",
      body: JSON.stringify({ saved_report_id: id }),
    });
    const data = await res.json();
    if (res.ok) setResult(data);
    else setMsg(data.detail || "Failed to run saved report");
    setRunning(false);
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

  const numericColumns = useMemo(
    () => columns.filter((col) => rows.some((row) => typeof row[col] === "number")),
    [columns, rows]
  );
  const previewValueColumn = numericColumns[0] || "—";
  const topChartRow = chartData[0];

  function applyDataset(dataset) {
    const options = DATASET_META[dataset]?.groupOptions || [];
    setCfg((current) => ({
      ...current,
      dataset,
      group_by: options.includes(current.group_by) ? current.group_by : current.group_by,
      name: current.name || `${dataset} report`,
    }));
  }

  return (
    <div style={{ maxWidth: 1320, display: "grid", gap: 18 }}>
      <div
        style={{
          ...cardStyle({ gap: 14, padding: 22, background: "linear-gradient(135deg, rgba(139,92,246,0.10), rgba(31,191,184,0.10))" }),
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>Custom Reports Builder</h1>
            <p style={{ color: "var(--muted)", margin: "8px 0 0", maxWidth: 780 }}>
              Build polished workforce reports faster with saved layouts, chart-ready summaries, exports, and dashboard-ready widgets in one reporting studio.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="btn" style={{ background: "#fff", borderRadius: 999 }}>
              {saved.length} saved report{saved.length === 1 ? "" : "s"}
            </div>
            <div className="btn" style={{ background: "#fff", borderRadius: 999 }}>
              {rows.length} result row{rows.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {msg ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.82)",
              border: "1px solid rgba(139,92,246,0.12)",
            }}
          >
            {msg}
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <MetricCard label="Dataset" value={datasetMeta.label} accent={datasetMeta.accent} />
        <MetricCard label="Visualization" value={CHART_LABELS[cfg.chart_type]} accent="#2563eb" />
        <MetricCard label="Grouped By" value={cfg.group_by || "Ungrouped"} accent="#0f766e" />
        <MetricCard label="Dashboard Widget" value={cfg.dashboard_widget ? "Pinned" : "Not Pinned"} accent={cfg.dashboard_widget ? "#7c3aed" : "#6b7280"} />
        <MetricCard label="Primary Value" value={previewValueColumn} accent="#b45309" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 420px) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={cardStyle()}>
            <SectionHeader
              title="Report Studio"
              subtitle="Choose a dataset, define the grouping, and decide how the report should be visualized and shared."
            />

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 700 }}>Choose dataset</div>
              <div style={{ display: "grid", gap: 10 }}>
                {Object.entries(DATASET_META).map(([key, meta]) => (
                  <button
                    key={key}
                    type="button"
                    className="btn"
                    onClick={() => applyDataset(key)}
                    style={{
                      textAlign: "left",
                      background: cfg.dataset === key ? `${meta.accent}12` : "#fff",
                      border: `1px solid ${cfg.dataset === key ? `${meta.accent}55` : "var(--border)"}`,
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <strong style={{ color: meta.accent }}>{meta.label}</strong>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{meta.groupOptions.length} suggested dimensions</span>
                    </div>
                    <div style={{ color: "var(--muted)", marginTop: 6, fontSize: 13 }}>{meta.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Report name</div>
                <input className="search" placeholder="Report name" value={cfg.name} onChange={(e) => setCfg((c) => ({ ...c, name: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Grouping field</div>
                <input className="search" placeholder="Group by (optional)" value={cfg.group_by} onChange={(e) => setCfg((c) => ({ ...c, group_by: e.target.value }))} />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {datasetMeta.groupOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="btn"
                    onClick={() => setCfg((current) => ({ ...current, group_by: option }))}
                    style={{
                      background: cfg.group_by === option ? `${datasetMeta.accent}14` : "#fff",
                      borderRadius: 999,
                      border: `1px solid ${cfg.group_by === option ? `${datasetMeta.accent}55` : "var(--border)"}`,
                    }}
                  >
                    {option}
                  </button>
                ))}
                {cfg.group_by ? (
                  <button type="button" className="btn btnGhost" onClick={() => setCfg((current) => ({ ...current, group_by: "" }))}>
                    Clear grouping
                  </button>
                ) : null}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Start date</div>
                <input className="search" type="date" value={cfg.start_date} onChange={(e) => setCfg((c) => ({ ...c, start_date: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>End date</div>
                <input className="search" type="date" value={cfg.end_date} onChange={(e) => setCfg((c) => ({ ...c, end_date: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Visualization</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {Object.entries(CHART_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="btn"
                    onClick={() => setCfg((current) => ({ ...current, chart_type: value }))}
                    style={{
                      background: cfg.chart_type === value ? "rgba(139,92,246,.12)" : "#fff",
                      borderRadius: 14,
                      border: `1px solid ${cfg.chart_type === value ? "rgba(139,92,246,.35)" : "var(--border)"}`,
                      padding: 12,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Scheduled email label or recipient list</div>
              <input className="search" placeholder="Optional email routing or schedule label" value={cfg.scheduled_email} onChange={(e) => setCfg((c) => ({ ...c, scheduled_email: e.target.value }))} />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 14 }}>
              <input type="checkbox" checked={cfg.dashboard_widget} onChange={(e) => setCfg((c) => ({ ...c, dashboard_widget: e.target.checked }))} />
              Pin this report as a dashboard widget
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button className="btn btnPrimary" onClick={runAdhoc} disabled={running}>
                {running ? "Running..." : "Run Report"}
              </button>
              <button className="btn btnGhost" onClick={saveReport} disabled={saving}>
                {saving ? "Saving..." : "Save Report"}
              </button>
            </div>
          </div>

          <div style={cardStyle()}>
            <SectionHeader
              title="Saved Reports"
              subtitle="Reuse recurring reports, launch them instantly, and keep the most useful ones on the dashboard."
            />
            {loadingSaved ? (
              <div style={{ color: "var(--muted)" }}>Loading saved reports...</div>
            ) : saved.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>No saved reports yet. Save your most-used layouts here for quick reuse.</div>
            ) : saved.map((report) => (
              <div
                key={report.id}
                style={{
                  ...cardStyle({ gap: 8, padding: 14, background: activeSavedId === report.id ? "rgba(139,92,246,.08)" : "#fff" }),
                  borderColor: activeSavedId === report.id ? "rgba(139,92,246,.28)" : "var(--border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div>
                    <strong>{report.name}</strong>
                    <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                      {(DATASET_META[report.config?.dataset]?.label || report.config?.dataset || "Custom")} · {(CHART_LABELS[report.config?.chart_type] || "Table Only")}
                    </div>
                  </div>
                  {report.config?.dashboard_widget ? (
                    <span style={{ padding: "6px 10px", borderRadius: 999, background: "rgba(139,92,246,.12)", color: "#7c3aed", fontSize: 12, fontWeight: 700 }}>
                      Widget
                    </span>
                  ) : null}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>
                    Grouped by: {report.config?.group_by || "none"}{report.config?.scheduled_email ? ` · Email: ${report.config.scheduled_email}` : ""}
                  </div>
                  <button className="btn btnTiny" onClick={() => runSaved(report.id)}>
                    Run
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={cardStyle()}>
            <SectionHeader
              title="Result Workspace"
              subtitle="Review a visual summary, inspect the raw rows, and export the report when it is ready to share."
              action={
                result ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btnGhost" onClick={() => downloadCsv(`${cfg.name || cfg.dataset}-report.csv`, rows)}>Export CSV</button>
                    <button className="btn btnGhost" onClick={() => setResult(null)}>Clear Results</button>
                  </div>
                ) : null
              }
            />

            {!result ? (
              <div style={{ ...cardStyle({ gap: 8, padding: 18, background: "#fff" }) }}>
                <strong>No report results yet</strong>
                <div style={{ color: "var(--muted)" }}>
                  Configure a dataset on the left, choose a grouping or chart style, and run the report to generate your workspace preview.
                </div>
              </div>
            ) : null}

            {result && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                  <MetricCard label="Rows" value={rows.length} accent="#7c3aed" />
                  <MetricCard label="Columns" value={columns.length} accent="#14b8a6" />
                  <MetricCard label="Chart Data Points" value={chartData.length} accent="#2563eb" />
                  <MetricCard label="Top Segment" value={topChartRow?.name || "—"} accent="#b45309" />
                </div>

                {cfg.chart_type !== "table" && chartData.length > 0 ? (
                  <div style={{ ...cardStyle({ gap: 10, padding: 16, background: "#fff" }) }}>
                    <SectionHeader
                      title={CHART_LABELS[cfg.chart_type]}
                      subtitle={cfg.group_by ? `Grouped by ${cfg.group_by}` : "Visualization based on returned report rows"}
                    />
                    <div style={{ height: 320 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        {cfg.chart_type === "pie" ? (
                          <PieChart>
                            <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={110}>
                              {chartData.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        ) : (
                          <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Bar dataKey="value" fill={datasetMeta.accent} radius={[8, 8, 0, 0]} />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : null}

                <div style={{ ...cardStyle({ gap: 12, padding: 16, background: "#fff" }) }}>
                  <SectionHeader title={`Results Table (${rows.length})`} subtitle="Raw rows returned from the custom report runner." />
                  <div style={{ overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {columns.map((col) => (
                            <th key={col} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid var(--border)", background: "rgba(139,92,246,.04)" }}>{col}</th>
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
              </>
            )}
          </div>

          {result && (
            <div style={cardStyle()}>
              <SectionHeader
                title="Current Report Summary"
                subtitle="Quick-read metadata for the report currently loaded in the workspace."
              />
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  <div style={{ ...cardStyle({ gap: 6, padding: 14, background: "#fff" }) }}>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Dataset</div>
                    <strong>{datasetMeta.label}</strong>
                  </div>
                  <div style={{ ...cardStyle({ gap: 6, padding: 14, background: "#fff" }) }}>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Chart Type</div>
                    <strong>{CHART_LABELS[cfg.chart_type]}</strong>
                  </div>
                </div>
                <div style={{ ...cardStyle({ gap: 6, padding: 14, background: "#fff" }) }}>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Applied Filters</div>
                  <div style={{ color: "var(--text)" }}>
                    Group by: {cfg.group_by || "none"} · Date range: {cfg.start_date || "any"} to {cfg.end_date || "any"}
                  </div>
                </div>
                <div style={{ ...cardStyle({ gap: 6, padding: 14, background: "#fff" }) }}>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Distribution Insight</div>
                  <div style={{ color: "var(--text)" }}>
                    {topChartRow
                      ? `${topChartRow.name} is currently the top segment in the preview with a value of ${topChartRow.value}.`
                      : "Run a grouped report to surface a quick chart insight here."}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
