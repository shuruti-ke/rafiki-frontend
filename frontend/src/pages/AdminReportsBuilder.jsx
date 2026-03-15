import { useEffect, useMemo, useState } from "react";
import { API, authFetch } from "../api.js";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell, Legend,
} from "recharts";

/* ── Design tokens ── */
const CHART_COLORS = ["#8b5cf6","#1fbfb8","#3b82f6","#fbbf24","#34d399","#f87171","#ec4899","#f97316"];

const DATASET_META = {
  employees:  { label:"Employees",  icon:"👥", accent:"#8b5cf6", groupOptions:["department","job_title","employment_type","work_location"], description:"Workforce shape, team distribution, headcount trends." },
  leave:      { label:"Leave",      icon:"🌿", accent:"#f59e0b", groupOptions:["status","leave_type","department","employment_type"],       description:"Request patterns, approvals, leave usage by team." },
  timesheets: { label:"Timesheets", icon:"⏱",  accent:"#3b82f6", groupOptions:["department","job_title","work_location","employee_name"],   description:"Hours worked, utilization, attendance patterns." },
  payroll:    { label:"Payroll",    icon:"💰", accent:"#14b8a6", groupOptions:["department","job_title","employment_type","employee_name"],  description:"Pay distribution, payroll totals, compensation." },
  attendance: { label:"Attendance", icon:"📍", accent:"#10b981", groupOptions:["department","work_date","employee_name"],                   description:"Check-in patterns, hours worked, presence trends." },
};

const CHART_META = {
  bar:   { label:"Bar Chart",  icon:"▐▌" },
  pie:   { label:"Pie Chart",  icon:"◑"  },
  table: { label:"Table",      icon:"≡"  },
};

const TEMPLATES = [
  { name:"Headcount by Dept",       dataset:"employees",  group_by:"department",  chart_type:"bar"   },
  { name:"Leave by Type",           dataset:"leave",      group_by:"leave_type",  chart_type:"pie"   },
  { name:"Leave by Department",     dataset:"leave",      group_by:"department",  chart_type:"bar"   },
  { name:"Attendance Trends",       dataset:"attendance", group_by:"work_date",   chart_type:"bar"   },
  { name:"Payroll Summary",         dataset:"payroll",    group_by:"",            chart_type:"table" },
];

/* ── Helpers ── */
function downloadCsv(filename, rows) {
  if (!rows?.length) return;
  const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const csv = [headers.join(","), ...rows.map(r =>
    headers.map(k => `"${String(r[k] ?? "").replaceAll('"','""')}"`).join(",")
  )].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8;" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const label = (txt) => (
  <div style={{ fontSize:12, fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>{txt}</div>
);

const Divider = () => <div style={{ height:1, background:"var(--border)", margin:"4px 0" }} />;

/* ── Main component ── */
export default function AdminReportsBuilder() {
  const [saved,         setSaved]         = useState([]);
  const [result,        setResult]        = useState(null);
  const [toast,         setToast]         = useState("");
  const [loadingSaved,  setLoadingSaved]  = useState(true);
  const [running,       setRunning]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [activeSavedId, setActiveSavedId] = useState("");
  const [aiQuery,       setAiQuery]       = useState("");
  const [aiQuerying,    setAiQuerying]    = useState(false);
  const [aiInsights,    setAiInsights]    = useState("");
  const [aiLoading,     setAiLoading]     = useState(false);

  const [cfg, setCfg] = useState({
    name:"", dataset:"employees", group_by:"", start_date:"", end_date:"",
    chart_type:"bar", dashboard_widget:true, scheduled_email:"",
  });

  const meta = DATASET_META[cfg.dataset] || DATASET_META.employees;
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  /* ── Data loading ── */
  const loadSaved = async () => {
    setLoadingSaved(true);
    const res = await authFetch(`${API}/api/v1/custom-reports/`);
    if (res.ok) setSaved((await res.json()).reports || []);
    setLoadingSaved(false);
  };
  useEffect(() => { loadSaved(); }, []);

  /* ── Actions ── */
  const runAdhoc = async () => {
    setRunning(true); setActiveSavedId(""); setAiInsights("");
    const res = await authFetch(`${API}/api/v1/custom-reports/run`, {
      method:"POST", body:JSON.stringify({ config:{
        dataset:cfg.dataset, group_by:cfg.group_by,
        start_date:cfg.start_date||undefined, end_date:cfg.end_date||undefined,
        chart_type:cfg.chart_type,
      }}),
    });
    const data = await res.json();
    if (res.ok) setResult(data); else showToast(data.detail || "Failed to run report");
    setRunning(false);
  };

  const runSaved = async (id) => {
    const sel = saved.find(r => r.id === id);
    setActiveSavedId(id); setAiInsights("");
    if (sel?.config) setCfg(p => ({ ...p, ...sel.config, name:sel.name||p.name }));
    setRunning(true);
    const res = await authFetch(`${API}/api/v1/custom-reports/run`, {
      method:"POST", body:JSON.stringify({ saved_report_id:id }),
    });
    const data = await res.json();
    if (res.ok) setResult(data); else showToast(data.detail || "Failed");
    setRunning(false);
  };

  const saveReport = async () => {
    setSaving(true);
    const res = await authFetch(`${API}/api/v1/custom-reports/`, {
      method:"POST", body:JSON.stringify({
        name:cfg.name || `${cfg.dataset} report`, description:"",
        config:{ dataset:cfg.dataset, group_by:cfg.group_by, start_date:cfg.start_date||undefined,
          end_date:cfg.end_date||undefined, chart_type:cfg.chart_type, dashboard_widget:cfg.dashboard_widget },
      }),
    });
    const data = await res.json();
    showToast(res.ok ? "Report saved." : (data.detail || "Failed to save"));
    if (res.ok) loadSaved();
    setSaving(false);
  };

  const runAiQuery = async () => {
    if (!aiQuery.trim()) return;
    setAiQuerying(true); setAiInsights("");
    try {
      const res = await authFetch(`${API}/api/v1/custom-reports/ai-query`, {
        method:"POST", body:JSON.stringify({ question:aiQuery }),
      });
      const data = await res.json();
      if (res.ok) {
        setCfg(c => ({
          ...c,
          dataset:   data.dataset    || c.dataset,
          group_by:  data.group_by   || c.group_by,
          start_date:data.start_date || c.start_date,
          end_date:  data.end_date   || c.end_date,
          chart_type:data.chart_type || c.chart_type,
          name:      data.name       || c.name,
        }));
        showToast("✨ Report configured by AI — click Run to see results.");
      } else {
        showToast(data.detail || "AI query failed");
      }
    } catch { showToast("AI query failed"); }
    setAiQuerying(false);
  };

  const loadAiInsights = async () => {
    if (!rows.length) return;
    setAiLoading(true);
    try {
      const res = await authFetch(`${API}/api/v1/custom-reports/ai-insights`, {
        method:"POST", body:JSON.stringify({
          dataset:cfg.dataset, group_by:cfg.group_by,
          start_date:cfg.start_date||null, end_date:cfg.end_date||null, rows,
        }),
      });
      const data = await res.json();
      if (res.ok) setAiInsights(data.insights || ""); else showToast(data.detail || "Failed");
    } catch { showToast("AI insights failed"); }
    setAiLoading(false);
  };

  /* ── Derived chart data ── */
  const rows = result?.rows || [];
  const columns = useMemo(() => Array.from(new Set(rows.flatMap(r => Object.keys(r)))), [rows]);
  const chartData = useMemo(() => {
    if (!rows.length) return [];
    const nameKey = cfg.group_by || columns.find(c => typeof rows[0]?.[c] === "string") || columns[0];
    const valKey  = columns.find(c => typeof rows[0]?.[c] === "number") || columns[1];
    return rows.slice(0,20).map((r,i) => ({
      name:  String(r[nameKey] ?? `Row ${i+1}`),
      value: Number(r[valKey]  ?? 0),
    }));
  }, [rows, cfg.group_by, columns]);

  const topRow = chartData[0];

  /* ── Render ── */
  return (
    <div style={{ display:"grid", gap:20, maxWidth:1400 }}>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          padding:"12px 16px", borderRadius:12, fontSize:14,
          background:"rgba(139,92,246,0.09)", border:"1px solid rgba(139,92,246,0.2)",
          color:"var(--text)", animation:"fadeIn 0.2s",
        }}>
          {toast}
        </div>
      )}

      {/* ── Page header ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ margin:0 }}>Reports Builder</h1>
          <p style={{ margin:"6px 0 0", color:"var(--muted)", fontSize:14 }}>
            Build custom workforce reports, visualize data, and get AI-powered insights.
          </p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ fontSize:13, color:"var(--muted)" }}>{saved.length} saved</span>
          {result && <span style={{ fontSize:13, color:"var(--muted)" }}>· {rows.length} rows</span>}
        </div>
      </div>

      {/* ── AI Query bar ── */}
      <div style={{
        background:"linear-gradient(135deg, rgba(139,92,246,0.07) 0%, rgba(31,191,184,0.07) 100%)",
        border:"1px solid rgba(139,92,246,0.18)", borderRadius:16, padding:"16px 20px",
        display:"grid", gap:12,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22, lineHeight:1 }}>✨</span>
          <div>
            <div style={{ fontWeight:700, fontSize:15 }}>Ask AI to build your report</div>
            <div style={{ fontSize:13, color:"var(--muted)" }}>
              e.g. "Leave by department for Q1 2026" · "Payroll totals last 3 months" · "Attendance trends by team"
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <input
            className="search"
            style={{ flex:1, fontSize:14 }}
            placeholder="Describe the report you need..."
            value={aiQuery}
            onChange={e => setAiQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && runAiQuery()}
          />
          <button
            className="btn btnPrimary"
            onClick={runAiQuery}
            disabled={aiQuerying || !aiQuery.trim()}
            style={{ whiteSpace:"nowrap", padding:"10px 18px", fontSize:14 }}
          >
            {aiQuerying ? "Thinking…" : "✨ Ask AI"}
          </button>
        </div>

        {/* Quick templates */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:12, color:"var(--muted)", fontWeight:600 }}>Quick start:</span>
          {TEMPLATES.map(tpl => (
            <button
              key={tpl.name}
              className="btn"
              onClick={() => { setCfg(c => ({...c, name:tpl.name, dataset:tpl.dataset, group_by:tpl.group_by, chart_type:tpl.chart_type})); setAiInsights(""); setResult(null); }}
              style={{
                borderRadius:999, fontSize:12, padding:"4px 12px",
                background: cfg.name === tpl.name ? "rgba(139,92,246,0.12)" : "var(--panel)",
                border:`1px solid ${cfg.name === tpl.name ? "rgba(139,92,246,0.4)" : "var(--border)"}`,
                color: cfg.name === tpl.name ? "#7c3aed" : "var(--text)",
                fontWeight: cfg.name === tpl.name ? 600 : 400,
              }}
            >
              {tpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div style={{ display:"grid", gridTemplateColumns:"360px minmax(0,1fr)", gap:20, alignItems:"start" }}>

        {/* ── LEFT: Config panel ── */}
        <div style={{ display:"grid", gap:16 }}>

          {/* Dataset picker */}
          <div style={{ background:"var(--panel)", border:"1px solid var(--border)", borderRadius:16, padding:18, display:"grid", gap:12 }}>
            <div style={{ fontWeight:700, fontSize:15 }}>Dataset</div>
            <div style={{ display:"grid", gap:6 }}>
              {Object.entries(DATASET_META).map(([key, m]) => (
                <button
                  key={key}
                  onClick={() => setCfg(c => ({ ...c, dataset:key, name:c.name||`${key} report` }))}
                  style={{
                    display:"flex", alignItems:"center", gap:12, padding:"10px 12px",
                    borderRadius:12, border:`1.5px solid ${cfg.dataset===key ? m.accent+"66" : "var(--border)"}`,
                    background: cfg.dataset===key ? m.accent+"10" : "transparent",
                    cursor:"pointer", textAlign:"left", width:"100%",
                  }}
                >
                  <span style={{ fontSize:20, lineHeight:1 }}>{m.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:14, color: cfg.dataset===key ? m.accent : "var(--text)" }}>{m.label}</div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>{m.description}</div>
                  </div>
                  {cfg.dataset===key && (
                    <span style={{ width:8, height:8, borderRadius:"50%", background:m.accent, flexShrink:0 }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Config options */}
          <div style={{ background:"var(--panel)", border:"1px solid var(--border)", borderRadius:16, padding:18, display:"grid", gap:14 }}>
            <div style={{ fontWeight:700, fontSize:15 }}>Report Settings</div>

            <div>
              {label("Report name")}
              <input
                className="search"
                placeholder={`${meta.label} report`}
                value={cfg.name}
                onChange={e => setCfg(c => ({...c, name:e.target.value}))}
                style={{ fontSize:14 }}
              />
            </div>

            <div>
              {label("Group by")}
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {meta.groupOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => setCfg(c => ({...c, group_by: c.group_by===opt ? "" : opt}))}
                    style={{
                      padding:"5px 12px", borderRadius:999, fontSize:13, cursor:"pointer",
                      border:`1.5px solid ${cfg.group_by===opt ? meta.accent+"66" : "var(--border)"}`,
                      background: cfg.group_by===opt ? meta.accent+"12" : "transparent",
                      color: cfg.group_by===opt ? meta.accent : "var(--text)",
                      fontWeight: cfg.group_by===opt ? 600 : 400,
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <Divider />

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                {label("From")}
                <input className="search" type="date" value={cfg.start_date} style={{ fontSize:14 }}
                  onChange={e => setCfg(c => ({...c, start_date:e.target.value}))} />
              </div>
              <div>
                {label("To")}
                <input className="search" type="date" value={cfg.end_date} style={{ fontSize:14 }}
                  onChange={e => setCfg(c => ({...c, end_date:e.target.value}))} />
              </div>
            </div>

            <Divider />

            <div>
              {label("Visualization")}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                {Object.entries(CHART_META).map(([val, m]) => (
                  <button
                    key={val}
                    onClick={() => setCfg(c => ({...c, chart_type:val}))}
                    style={{
                      padding:"10px 8px", borderRadius:12, cursor:"pointer", textAlign:"center",
                      border:`1.5px solid ${cfg.chart_type===val ? "rgba(139,92,246,0.5)" : "var(--border)"}`,
                      background: cfg.chart_type===val ? "rgba(139,92,246,0.08)" : "transparent",
                    }}
                  >
                    <div style={{ fontSize:18, marginBottom:4 }}>{m.icon}</div>
                    <div style={{ fontSize:12, fontWeight:600, color: cfg.chart_type===val ? "#7c3aed" : "var(--muted)" }}>{m.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <Divider />

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <button className="btn btnPrimary" onClick={runAdhoc} disabled={running}
                style={{ fontSize:14, padding:"10px" }}>
                {running ? "Running…" : "▶ Run Report"}
              </button>
              <button className="btn btnGhost" onClick={saveReport} disabled={saving}
                style={{ fontSize:14, padding:"10px" }}>
                {saving ? "Saving…" : "⊕ Save"}
              </button>
            </div>
          </div>

          {/* Saved reports */}
          <div style={{ background:"var(--panel)", border:"1px solid var(--border)", borderRadius:16, padding:18, display:"grid", gap:10 }}>
            <div style={{ fontWeight:700, fontSize:15 }}>Saved Reports</div>
            {loadingSaved ? (
              <div style={{ color:"var(--muted)", fontSize:14 }}>Loading…</div>
            ) : saved.length === 0 ? (
              <div style={{ color:"var(--muted)", fontSize:14 }}>No saved reports yet. Save your most-used layouts for quick reuse.</div>
            ) : saved.map(r => {
              const rm = DATASET_META[r.config?.dataset];
              return (
                <div
                  key={r.id}
                  style={{
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"10px 12px", borderRadius:12,
                    border:`1px solid ${activeSavedId===r.id ? "rgba(139,92,246,0.3)" : "var(--border)"}`,
                    background: activeSavedId===r.id ? "rgba(139,92,246,0.06)" : "var(--panel2)",
                    gap:10,
                  }}
                >
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {rm?.icon && <span style={{ marginRight:6 }}>{rm.icon}</span>}{r.name}
                    </div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>
                      {rm?.label || r.config?.dataset} · {r.config?.group_by || "no grouping"}
                    </div>
                  </div>
                  <button className="btn btnTiny" onClick={() => runSaved(r.id)}
                    style={{ flexShrink:0, fontSize:13 }}>
                    Run
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Results workspace ── */}
        <div style={{ display:"grid", gap:16 }}>

          {/* Empty state */}
          {!result && (
            <div style={{
              background:"var(--panel)", border:"1px solid var(--border)", borderRadius:16,
              padding:"56px 24px", textAlign:"center", display:"grid", gap:10,
            }}>
              <div style={{ fontSize:40 }}>📊</div>
              <div style={{ fontWeight:700, fontSize:16 }}>No report yet</div>
              <div style={{ fontSize:14, color:"var(--muted)", maxWidth:400, margin:"0 auto" }}>
                Choose a dataset, set your filters, and click <strong>Run Report</strong> — or use the AI bar above to describe what you need.
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"center", marginTop:8 }}>
                <button className="btn btnPrimary" onClick={runAdhoc} disabled={running}
                  style={{ fontSize:14, padding:"10px 20px" }}>
                  {running ? "Running…" : "▶ Run Report"}
                </button>
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <>
              {/* Result header */}
              <div style={{
                background:"var(--panel)", border:"1px solid var(--border)", borderRadius:16, padding:"16px 20px",
                display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10,
              }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:15 }}>
                    {meta.icon} {cfg.name || `${meta.label} report`}
                  </div>
                  <div style={{ fontSize:13, color:"var(--muted)", marginTop:3 }}>
                    {rows.length} rows · grouped by {cfg.group_by || "none"}
                    {cfg.start_date && ` · ${cfg.start_date} → ${cfg.end_date||"now"}`}
                    {topRow && ` · top: ${topRow.name}`}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button className="btn btnGhost" style={{ fontSize:13 }}
                    onClick={() => downloadCsv(`${cfg.name||cfg.dataset}.csv`, rows)}>
                    ↓ CSV
                  </button>
                  <button className="btn btnGhost" style={{ fontSize:13 }}
                    onClick={() => { setResult(null); setAiInsights(""); }}>
                    ✕ Clear
                  </button>
                </div>
              </div>

              {/* Chart */}
              {cfg.chart_type !== "table" && chartData.length > 0 && (
                <div style={{ background:"var(--panel)", border:"1px solid var(--border)", borderRadius:16, padding:"18px 20px" }}>
                  <div style={{ fontWeight:600, fontSize:14, marginBottom:16 }}>
                    {CHART_META[cfg.chart_type]?.label} — {meta.label}
                    {cfg.group_by && <span style={{ fontWeight:400, color:"var(--muted)" }}> by {cfg.group_by}</span>}
                  </div>
                  <div style={{ height:300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      {cfg.chart_type === "pie" ? (
                        <PieChart>
                          <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={110} label={({name,percent}) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                            {chartData.map((_,i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={v => v.toLocaleString()} />
                          <Legend />
                        </PieChart>
                      ) : (
                        <BarChart data={chartData} margin={{ top:4, right:8, left:0, bottom:4 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="name" tick={{ fontSize:12, fill:"var(--muted)" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize:12, fill:"var(--muted)" }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={v => v.toLocaleString()} contentStyle={{ borderRadius:10, border:"1px solid var(--border)", fontSize:13 }} />
                          <Bar dataKey="value" fill={meta.accent} radius={[6,6,0,0]} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* AI Insights */}
              <div style={{
                background:"linear-gradient(135deg, rgba(139,92,246,0.06), rgba(31,191,184,0.06))",
                border:"1px solid rgba(139,92,246,0.15)", borderRadius:16, padding:"16px 20px",
                display:"grid", gap:10,
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:18 }}>🤖</span>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14 }}>AI Insights</div>
                      <div style={{ fontSize:12, color:"var(--muted)" }}>AI-generated analysis of your report</div>
                    </div>
                  </div>
                  {!aiInsights && !aiLoading && (
                    <button className="btn btnPrimary" onClick={loadAiInsights}
                      style={{ fontSize:13, padding:"8px 14px", whiteSpace:"nowrap" }}>
                      ✨ Generate Insights
                    </button>
                  )}
                  {aiInsights && (
                    <button className="btn btnGhost" onClick={() => setAiInsights("")}
                      style={{ fontSize:13 }}>Regenerate</button>
                  )}
                </div>
                {aiLoading && (
                  <div style={{ fontSize:14, color:"var(--muted)", fontStyle:"italic" }}>Analysing your data…</div>
                )}
                {aiInsights && (
                  <div style={{
                    fontSize:14, lineHeight:1.75, color:"var(--text)",
                    background:"rgba(255,255,255,0.6)", borderRadius:10,
                    padding:"12px 14px", border:"1px solid rgba(139,92,246,0.1)",
                  }}>
                    {aiInsights}
                  </div>
                )}
                {!aiInsights && !aiLoading && (
                  <div style={{ fontSize:13, color:"var(--muted)" }}>
                    Click "Generate Insights" to get an AI narrative of this report — trends, anomalies, and recommendations.
                  </div>
                )}
              </div>

              {/* Data table */}
              <div style={{ background:"var(--panel)", border:"1px solid var(--border)", borderRadius:16, padding:"18px 20px" }}>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:14 }}>
                  Data Table <span style={{ fontWeight:400, color:"var(--muted)", fontSize:13 }}>({rows.length} rows)</span>
                </div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
                    <thead>
                      <tr>
                        {columns.map(col => (
                          <th key={col} style={{
                            textAlign:"left", padding:"9px 12px", fontSize:12, fontWeight:600,
                            color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.05em",
                            borderBottom:"2px solid var(--border)", whiteSpace:"nowrap",
                            background:"var(--panel2)",
                          }}>{col.replace(/_/g," ")}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row,i) => (
                        <tr key={i} style={{ background: i%2===0 ? "transparent" : "rgba(0,0,0,0.015)" }}>
                          {columns.map(col => (
                            <td key={col} style={{ padding:"9px 12px", borderBottom:"1px solid var(--border)", verticalAlign:"top", color:"var(--text)" }}>
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
      </div>
    </div>
  );
}
