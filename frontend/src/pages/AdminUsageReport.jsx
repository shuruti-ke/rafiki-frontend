// frontend/src/pages/AdminUsageReport.jsx
import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./AdminUsageReport.css";

const LOGO = "/Rafiki_logo_2.png";

const today = new Date();
const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

const PRESETS = [
  { label: "This month", start: firstOfMonth.toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) },
  { label: "Last 7 days", start: new Date(today - 7 * 86400000).toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) },
  { label: "Last 30 days", start: new Date(today - 30 * 86400000).toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) },
  { label: "Last 90 days", start: new Date(today - 90 * 86400000).toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) },
];

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="ur-kpi" style={{ "--kpi-color": color }}>
      <div className="ur-kpi-value">{value ?? "—"}</div>
      <div className="ur-kpi-label">{label}</div>
      {sub && <div className="ur-kpi-sub">{sub}</div>}
    </div>
  );
}

function MetricRow({ label, value, highlight }) {
  return (
    <div className={`ur-metric-row${highlight ? " ur-metric-highlight" : ""}`}>
      <span className="ur-metric-label">{label}</span>
      <span className="ur-metric-value">{value ?? "—"}</span>
    </div>
  );
}

function BarChart({ data, color }) {
  if (!data || !Object.keys(data).length) return <div className="ur-empty-small">No data</div>;
  const max = Math.max(...Object.values(data), 1);
  return (
    <div className="ur-barchart">
      {Object.entries(data).map(([label, value]) => (
        <div className="ur-bar-row" key={label}>
          <span className="ur-bar-label">{label}</span>
          <div className="ur-bar-track">
            <div className="ur-bar-fill" style={{ width: `${(value / max) * 100}%`, background: color }} />
          </div>
          <span className="ur-bar-val">{typeof value === "number" && value % 1 ? value.toFixed(1) : value}</span>
        </div>
      ))}
    </div>
  );
}

function ModuleCard({ title, icon, color, children }) {
  return (
    <div className="ur-module" style={{ "--mod-color": color }}>
      <div className="ur-module-header">
        <span className="ur-module-icon">{icon}</span>
        <span className="ur-module-title">{title}</span>
      </div>
      <div className="ur-module-body">{children}</div>
    </div>
  );
}

function EngagementGauge({ score }) {
  const color = score >= 70 ? "#34d399" : score >= 40 ? "#fbbf24" : "#f87171";
  const label = score >= 70 ? "High Engagement" : score >= 40 ? "Moderate" : "Needs Attention";
  const dash = 251; // circumference of r=40 circle
  const offset = dash - (dash * score) / 100;
  return (
    <div className="ur-gauge">
      <svg viewBox="0 0 100 100" className="ur-gauge-svg">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="10" />
        <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={dash} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 50 50)" />
        <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="700" fill="#1e293b">{score}%</text>
        <text x="50" y="60" textAnchor="middle" fontSize="8" fill="#64748b">score</text>
      </svg>
      <div className="ur-gauge-label" style={{ color }}>{label}</div>
      <p className="ur-gauge-desc">Composite engagement across chat, timesheets, guided paths &amp; objectives</p>
    </div>
  );
}

function exportCSV(data) {
  if (!data) return;
  const p = data.period;
  const rows = [
    ["Rafiki Platform Usage Report"],
    [`Period: ${p.start} to ${p.end}`],
    [],
    ["Module", "Metric", "Value"],
    ["Employees", "Total Active", data.employees?.total_active],
    ["Chat", "Total Sessions", data.chat?.total_sessions],
    ["Chat", "Unique Users", data.chat?.unique_users],
    ["Chat", "Adoption Rate", `${data.chat?.adoption_rate}%`],
    ["Meetings", "Total Scheduled", data.meetings?.total_scheduled],
    ["Meetings", "Completed", data.meetings?.completed],
    ["Meetings", "1-on-1s", data.meetings?.one_on_ones],
    ["Meetings", "Group", data.meetings?.group_meetings],
    ["Meetings", "Avg Wellbeing Rating", data.meetings?.avg_wellbeing_rating ?? "N/A"],
    ["Documents", "Uploaded", data.documents?.total_uploaded],
    ["Guided Paths", "Started", data.guided_paths?.total_started],
    ["Guided Paths", "Completed", data.guided_paths?.completed],
    ["Guided Paths", "Completion Rate", `${data.guided_paths?.completion_rate}%`],
    ["Objectives", "Created in Period", data.objectives?.created_in_period],
    ["Objectives", "Total Active", data.objectives?.total_active],
    ["Objectives", "Avg Progress", `${data.objectives?.avg_progress}%`],
    ["Timesheets", "Total Hours", data.timesheets?.total_hours_logged],
    ["Timesheets", "Unique Submitters", data.timesheets?.unique_submitters],
    ["Timesheets", "Adoption Rate", `${data.timesheets?.adoption_rate}%`],
    ["Announcements", "Published", data.announcements?.total_published],
    ["Announcements", "Total Reads", data.announcements?.total_reads],
    ["Overall", "Engagement Score", `${data.engagement_score}%`],
  ];
  const csv = rows.map(r => r.map(c => `"${c ?? ""}"`).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: `rafiki-usage-${p.start}-to-${p.end}.csv`,
  });
  a.click();
}

export default function AdminUsageReport() {
  const [start, setStart] = useState(PRESETS[0].start);
  const [end, setEnd] = useState(PRESETS[0].end);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchReport = async (s = start, e = end) => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`${API}/api/v1/admin/usage-report?start=${s}&end=${e}`);
      if (!res.ok) throw new Error((await res.json()).detail || "Failed to load report");
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReport(); }, []);

  const applyPreset = (p) => {
    setStart(p.start);
    setEnd(p.end);
    fetchReport(p.start, p.end);
  };

  return (
    <div className="ur-wrap" id="ur-printable">
      {/* Header */}
      <div className="ur-header">
        <div className="ur-header-left">
          <img src={LOGO} alt="Rafiki" className="ur-logo" />
          <div>
            <h1 className="ur-title">Platform Usage Report</h1>
            <p className="ur-subtitle">Organisation-wide activity across all modules</p>
          </div>
        </div>
        <div className="ur-header-actions">
          <button className="adash-link-btn" onClick={() => exportCSV(data)} disabled={!data}>↓ Export CSV</button>
          <button className="adash-link-btn" onClick={() => window.print()}>🖨 Print / PDF</button>
        </div>
      </div>

      {/* Controls */}
      <div className="ur-controls">
        <div className="ur-presets">
          {PRESETS.map(p => (
            <button key={p.label}
              className={`ur-preset${start === p.start && end === p.end ? " ur-preset-active" : ""}`}
              onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="ur-daterow">
          <input type="date" className="ur-date-input" value={start} onChange={e => setStart(e.target.value)} />
          <span>to</span>
          <input type="date" className="ur-date-input" value={end} onChange={e => setEnd(e.target.value)} />
          <button className="adash-run-btn" onClick={() => fetchReport()} disabled={loading}>
            {loading ? "Loading..." : "Run Report"}
          </button>
        </div>
      </div>

      {error && <div className="ur-error">{error}</div>}

      {loading && (
        <div className="ur-loading">
          <img src={LOGO} alt="Rafiki" className="ur-loading-logo" />
          <p>Generating report...</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* KPIs */}
          <div className="ur-kpis">
            <KpiCard label="Active Employees" value={data.employees?.total_active} color="#8b5cf6" />
            <KpiCard label="Chat Sessions" value={data.chat?.total_sessions} sub={`${data.chat?.adoption_rate}% adoption`} color="#3b82f6" />
            <KpiCard label="Meetings" value={data.meetings?.total_scheduled} sub={`${data.meetings?.completed} completed`} color="#1FBFB8" />
            <KpiCard label="Hours Logged" value={data.timesheets?.total_hours_logged} sub={`${data.timesheets?.adoption_rate}% adoption`} color="#f59e0b" />
            <KpiCard label="Active Objectives" value={data.objectives?.total_active} sub={`${data.objectives?.avg_progress}% avg progress`} color="#34d399" />
          </div>

          <div className="ur-body">
            {/* Left panel */}
            <div className="ur-left">
              <div className="adash-chart-title">Engagement Score</div>
              <EngagementGauge score={data.engagement_score} />
              <div className="ur-period-box">
                <span>📅 {data.period?.start}</span>
                <span className="ur-period-arrow">→</span>
                <span>{data.period?.end}</span>
              </div>
            </div>

            {/* Module grid */}
            <div className="ur-modules">
              <ModuleCard title="Chat Activity" icon="💬" color="#3b82f6">
                <MetricRow label="Total sessions" value={data.chat?.total_sessions} />
                <MetricRow label="Unique users" value={data.chat?.unique_users} />
                <MetricRow label="Adoption rate" value={`${data.chat?.adoption_rate}%`} highlight />
              </ModuleCard>

              <ModuleCard title="Meetings" icon="📹" color="#1FBFB8">
                <MetricRow label="Scheduled" value={data.meetings?.total_scheduled} />
                <MetricRow label="Completed" value={data.meetings?.completed} />
                <MetricRow label="1-on-1s" value={data.meetings?.one_on_ones} />
                <MetricRow label="Group meetings" value={data.meetings?.group_meetings} />
                <MetricRow label="Avg wellbeing" value={data.meetings?.avg_wellbeing_rating ? `${data.meetings.avg_wellbeing_rating}/5 ⭐` : "No data"} highlight />
              </ModuleCard>

              <ModuleCard title="Documents" icon="📄" color="#8b5cf6">
                <MetricRow label="Uploaded in period" value={data.documents?.total_uploaded} />
              </ModuleCard>

              <ModuleCard title="Guided Paths" icon="🧭" color="#f59e0b">
                <MetricRow label="Started" value={data.guided_paths?.total_started} />
                <MetricRow label="Completed" value={data.guided_paths?.completed} />
                <MetricRow label="Completion rate" value={`${data.guided_paths?.completion_rate}%`} highlight />
              </ModuleCard>

              <ModuleCard title="Objectives" icon="🎯" color="#34d399">
                <MetricRow label="Created in period" value={data.objectives?.created_in_period} />
                <MetricRow label="Total active" value={data.objectives?.total_active} />
                <MetricRow label="Avg progress" value={`${data.objectives?.avg_progress}%`} highlight />
                {data.objectives?.by_status && Object.keys(data.objectives.by_status).length > 0 && (
                  <BarChart data={data.objectives.by_status} color="#34d399" />
                )}
              </ModuleCard>

              <ModuleCard title="Timesheets" icon="⏱" color="#f87171">
                <MetricRow label="Total hours logged" value={data.timesheets?.total_hours_logged} />
                <MetricRow label="Unique submitters" value={data.timesheets?.unique_submitters} />
                <MetricRow label="Adoption rate" value={`${data.timesheets?.adoption_rate}%`} highlight />
              </ModuleCard>

              <ModuleCard title="Announcements" icon="📢" color="#a78bfa">
                <MetricRow label="Published" value={data.announcements?.total_published} />
                <MetricRow label="Total reads" value={data.announcements?.total_reads} />
              </ModuleCard>

              <ModuleCard title="Wellbeing" icon="💚" color="#34d399">
                <MetricRow
                  label="Avg post-meeting rating"
                  value={data.meetings?.avg_wellbeing_rating ? `${data.meetings.avg_wellbeing_rating} / 5` : "No data yet"}
                  highlight
                />
                <p className="ur-note">
                  Ratings collected anonymously after meetings. Scores below 2.5 may indicate team stress — consider follow-up.
                </p>
              </ModuleCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
