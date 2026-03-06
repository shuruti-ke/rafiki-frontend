// frontend/src/pages/AdminUsageReport.jsx
import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import {
  BarChart as ReBarChart, Bar, Cell,
  AreaChart, Area,
  PieChart, Pie,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import "./AdminUsageReport.css";

const LOGO = "/Rafiki_logo_2.png";

const today = new Date();
const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

const PRESETS = [
  { label: "This month",   start: firstOfMonth.toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) },
  { label: "Last 7 days",  start: new Date(today - 7  * 86400000).toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) },
  { label: "Last 30 days", start: new Date(today - 30 * 86400000).toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) },
  { label: "Last 90 days", start: new Date(today - 90 * 86400000).toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) },
];

/* ── brand tokens ── */
const C = {
  purple: "#8b5cf6", teal: "#1fbfb8", blue: "#3b82f6",
  green: "#34d399",  yellow: "#f59e0b", red: "#f87171",
  violet: "#a78bfa", grad: "linear-gradient(135deg,#8b5cf6 0%,#1fbfb8 100%)",
  text: "#1e293b", muted: "#64748b", border: "#f1f5f9",
  gray100: "#f3f4f6", gray200: "#e5e7eb", gray900: "#111827",
};

/* ── chart tooltip ── */
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: C.gray900, color: "#fff", padding: "9px 13px",
      borderRadius: 10, fontSize: 12,
      boxShadow: "0 8px 28px rgba(139,92,246,.2)",
      border: "1px solid rgba(139,92,246,.2)",
    }}>
      <div style={{ fontWeight: 800, marginBottom: 5, color: "#a78bfa" }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: p.color, display: "inline-block" }} />
          <span style={{ color: "#d1d5db" }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── original small components (unchanged) ── */
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

function EngagementGauge({ score }) {
  const color  = score >= 70 ? C.green : score >= 40 ? C.yellow : C.red;
  const label  = score >= 70 ? "High Engagement" : score >= 40 ? "Moderate" : "Needs Attention";
  const dash   = 251;
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

/* ── CSV export (unchanged) ── */
function exportCSV(data) {
  if (!data) return;
  const p = data.period;
  const rows = [
    ["Rafiki Platform Usage Report"],
    [`Period: ${p.start} to ${p.end}`],
    [],
    ["Module","Metric","Value"],
    ["Employees","Total Active",data.employees?.total_active],
    ["Chat","Total Sessions",data.chat?.total_sessions],
    ["Chat","Unique Users",data.chat?.unique_users],
    ["Chat","Adoption Rate",`${data.chat?.adoption_rate}%`],
    ["Meetings","Total Scheduled",data.meetings?.total_scheduled],
    ["Meetings","Completed",data.meetings?.completed],
    ["Meetings","1-on-1s",data.meetings?.one_on_ones],
    ["Meetings","Group",data.meetings?.group_meetings],
    ["Meetings","Avg Wellbeing Rating",data.meetings?.avg_wellbeing_rating ?? "N/A"],
    ["Documents","Uploaded",data.documents?.total_uploaded],
    ["Guided Paths","Started",data.guided_paths?.total_started],
    ["Guided Paths","Completed",data.guided_paths?.completed],
    ["Guided Paths","Completion Rate",`${data.guided_paths?.completion_rate}%`],
    ["Objectives","Created in Period",data.objectives?.created_in_period],
    ["Objectives","Total Active",data.objectives?.total_active],
    ["Objectives","Avg Progress",`${data.objectives?.avg_progress}%`],
    ["Timesheets","Total Hours",data.timesheets?.total_hours_logged],
    ["Timesheets","Unique Submitters",data.timesheets?.unique_submitters],
    ["Timesheets","Adoption Rate",`${data.timesheets?.adoption_rate}%`],
    ["Announcements","Published",data.announcements?.total_published],
    ["Announcements","Total Reads",data.announcements?.total_reads],
    ["Overall","Engagement Score",`${data.engagement_score}%`],
  ];
  const csv = rows.map(r => r.map(c => `"${c ?? ""}"`).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: `rafiki-usage-${p.start}-to-${p.end}.csv`,
  });
  a.click();
}

/* ════════════════════════════════════════════
   DRILL-DOWN MODAL
   Opens when a ModuleCard is clicked
════════════════════════════════════════════ */
function DrillModal({ module: mod, data, onClose }) {
  if (!mod) return null;

  const PIE_COLORS = [C.purple, C.teal, C.blue, C.yellow, C.green, C.red, C.violet, "#f97316"];

  /* Build per-module chart data */
  const chatData = [
    { name: "Sessions",      value: data.chat?.total_sessions    ?? 0 },
    { name: "Unique Users",  value: data.chat?.unique_users      ?? 0 },
    { name: "Non-Users",     value: Math.max(0, (data.employees?.total_active ?? 0) - (data.chat?.unique_users ?? 0)) },
  ];

  const meetingsData = [
    { name: "1-on-1s",  value: data.meetings?.one_on_ones     ?? 0 },
    { name: "Group",    value: data.meetings?.group_meetings   ?? 0 },
    { name: "Pending",  value: Math.max(0, (data.meetings?.total_scheduled ?? 0) - (data.meetings?.completed ?? 0)) },
    { name: "Done",     value: data.meetings?.completed        ?? 0 },
  ];

  const guidedData = [
    { name: "Started",     value: data.guided_paths?.total_started  ?? 0 },
    { name: "Completed",   value: data.guided_paths?.completed       ?? 0 },
    { name: "In Progress", value: Math.max(0, (data.guided_paths?.total_started ?? 0) - (data.guided_paths?.completed ?? 0)) },
  ];

  const objStatusData = data.objectives?.by_status
    ? Object.entries(data.objectives.by_status).map(([name, value]) => ({ name, value }))
    : [];

  const tsData = [
    { name: "Submitters",    value: data.timesheets?.unique_submitters ?? 0 },
    { name: "Non-Submitters",value: Math.max(0, (data.employees?.total_active ?? 0) - (data.timesheets?.unique_submitters ?? 0)) },
  ];

  const annData = [
    { name: "Published", value: data.announcements?.total_published ?? 0 },
    { name: "Total Reads",value: data.announcements?.total_reads    ?? 0 },
  ];

  const wellbeingRating = data.meetings?.avg_wellbeing_rating;
  const radarData = [
    { metric: "Chat",         value: Math.min(100, (data.chat?.adoption_rate        ?? 0)) },
    { metric: "Timesheets",   value: Math.min(100, (data.timesheets?.adoption_rate  ?? 0)) },
    { metric: "Guided Paths", value: Math.min(100, (data.guided_paths?.completion_rate ?? 0)) },
    { metric: "Objectives",   value: Math.min(100, (data.objectives?.avg_progress   ?? 0)) },
    { metric: "Meetings",     value: Math.min(100, data.meetings?.completed ? Math.round((data.meetings.completed / (data.meetings.total_scheduled || 1)) * 100) : 0) },
  ];

  const modules = {
    chat: {
      title: "Chat Activity — Drill Down",
      color: C.blue,
      content: (
        <>
          <div className="ur-drill-kpis">
            {[
              { label: "Total Sessions",  value: data.chat?.total_sessions,  color: C.blue   },
              { label: "Unique Users",    value: data.chat?.unique_users,    color: C.purple  },
              { label: "Adoption Rate",   value: `${data.chat?.adoption_rate ?? 0}%`, color: C.teal },
              { label: "Non-Adopters",    value: Math.max(0,(data.employees?.total_active??0)-(data.chat?.unique_users??0)), color: C.red },
            ].map(k => (
              <div key={k.label} className="ur-drill-kpi" style={{ "--dk-color": k.color }}>
                <div className="ur-drill-kpi-val">{k.value ?? "—"}</div>
                <div className="ur-drill-kpi-label">{k.label}</div>
              </div>
            ))}
          </div>
          <p className="ur-drill-section-label">Adoption breakdown</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={chatData} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                dataKey="value" nameKey="name" paddingAngle={3}>
                {chatData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={v => [v, ""]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <p className="ur-drill-insight">
            {(data.chat?.adoption_rate ?? 0) < 50
              ? "⚠️ Fewer than half of employees are using the chat — consider a nudge campaign."
              : "✅ Good adoption. Keep engagement high with regular prompts and check-ins."}
          </p>
        </>
      ),
    },

    meetings: {
      title: "Meetings — Drill Down",
      color: C.teal,
      content: (
        <>
          <div className="ur-drill-kpis">
            {[
              { label: "Scheduled",       value: data.meetings?.total_scheduled, color: C.teal   },
              { label: "Completed",       value: data.meetings?.completed,        color: C.green  },
              { label: "1-on-1s",         value: data.meetings?.one_on_ones,      color: C.purple },
              { label: "Group",           value: data.meetings?.group_meetings,   color: C.blue   },
            ].map(k => (
              <div key={k.label} className="ur-drill-kpi" style={{ "--dk-color": k.color }}>
                <div className="ur-drill-kpi-val">{k.value ?? "—"}</div>
                <div className="ur-drill-kpi-label">{k.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <p className="ur-drill-section-label">Meeting type split</p>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={meetingsData} cx="50%" cy="50%" innerRadius={45} outerRadius={80}
                    dataKey="value" nameKey="name" paddingAngle={3}>
                    {meetingsData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={v => [v, ""]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
              <p className="ur-drill-section-label" style={{ margin: 0 }}>Avg Wellbeing Rating</p>
              {wellbeingRating ? (
                <>
                  <div style={{ fontSize: 42, fontWeight: 800, color: wellbeingRating >= 3.5 ? C.green : wellbeingRating >= 2.5 ? C.yellow : C.red, lineHeight: 1 }}>
                    {wellbeingRating.toFixed(1)}<span style={{ fontSize: 18, color: C.muted }}>/5</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.muted }}>
                    {wellbeingRating >= 3.5 ? "😊 Team is feeling good after meetings"
                      : wellbeingRating >= 2.5 ? "😐 Moderate — worth checking in"
                      : "😟 Low — team may be experiencing stress"}
                  </div>
                </>
              ) : (
                <div style={{ color: C.muted, fontSize: 13 }}>No wellbeing ratings yet</div>
              )}
            </div>
          </div>
          <p className="ur-drill-insight">
            Completion rate: <strong>{data.meetings?.total_scheduled ? Math.round((data.meetings.completed / data.meetings.total_scheduled) * 100) : 0}%</strong>
            {" "}of scheduled meetings were completed.
          </p>
        </>
      ),
    },

    documents: {
      title: "Documents — Drill Down",
      color: C.purple,
      content: (
        <>
          <div className="ur-drill-kpis">
            <div className="ur-drill-kpi" style={{ "--dk-color": C.purple }}>
              <div className="ur-drill-kpi-val">{data.documents?.total_uploaded ?? "—"}</div>
              <div className="ur-drill-kpi-label">Uploaded in Period</div>
            </div>
          </div>
          <p className="ur-drill-section-label">Upload activity</p>
          <ResponsiveContainer width="100%" height={160}>
            <ReBarChart data={[{ name: "Uploaded", value: data.documents?.total_uploaded ?? 0 }]} barSize={48}>
              <defs>
                <linearGradient id="docGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.purple} />
                  <stop offset="100%" stopColor={C.teal}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.gray200} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="value" name="Documents" fill="url(#docGrad)" radius={[6,6,0,0]} />
            </ReBarChart>
          </ResponsiveContainer>
          <p className="ur-drill-insight">
            Documents power the AI knowledge base. More uploads = better, more personalised employee responses.
          </p>
        </>
      ),
    },

    guided_paths: {
      title: "Guided Paths — Drill Down",
      color: C.yellow,
      content: (
        <>
          <div className="ur-drill-kpis">
            {[
              { label: "Started",          value: data.guided_paths?.total_started,    color: C.yellow  },
              { label: "Completed",        value: data.guided_paths?.completed,         color: C.green   },
              { label: "Completion Rate",  value: `${data.guided_paths?.completion_rate ?? 0}%`, color: C.teal },
              { label: "In Progress",      value: Math.max(0,(data.guided_paths?.total_started??0)-(data.guided_paths?.completed??0)), color: C.blue },
            ].map(k => (
              <div key={k.label} className="ur-drill-kpi" style={{ "--dk-color": k.color }}>
                <div className="ur-drill-kpi-val">{k.value ?? "—"}</div>
                <div className="ur-drill-kpi-label">{k.label}</div>
              </div>
            ))}
          </div>
          <p className="ur-drill-section-label">Progress breakdown</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={guidedData} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                dataKey="value" nameKey="name" paddingAngle={3}>
                {guidedData.map((_, i) => <Cell key={i} fill={[C.yellow, C.green, C.blue][i]} />)}
              </Pie>
              <Tooltip formatter={v => [v, ""]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <p className="ur-drill-insight">
            {(data.guided_paths?.completion_rate ?? 0) < 50
              ? "⚠️ Completion rate is below 50%. Consider shorter paths or reminder nudges."
              : "✅ Strong completion rate — employees are engaging with guided content."}
          </p>
        </>
      ),
    },

    objectives: {
      title: "Objectives — Drill Down",
      color: C.green,
      content: (
        <>
          <div className="ur-drill-kpis">
            {[
              { label: "Created in Period", value: data.objectives?.created_in_period, color: C.blue   },
              { label: "Total Active",      value: data.objectives?.total_active,      color: C.green  },
              { label: "Avg Progress",      value: `${data.objectives?.avg_progress ?? 0}%`, color: C.teal },
            ].map(k => (
              <div key={k.label} className="ur-drill-kpi" style={{ "--dk-color": k.color }}>
                <div className="ur-drill-kpi-val">{k.value ?? "—"}</div>
                <div className="ur-drill-kpi-label">{k.label}</div>
              </div>
            ))}
          </div>
          {objStatusData.length > 0 && (
            <>
              <p className="ur-drill-section-label">Objectives by status</p>
              <ResponsiveContainer width="100%" height={200}>
                <ReBarChart data={objStatusData} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.gray200} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="value" name="Count" radius={[5,5,0,0]}>
                    {objStatusData.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </ReBarChart>
              </ResponsiveContainer>
            </>
          )}
          {/* Progress bar */}
          <p className="ur-drill-section-label">Average progress across all objectives</p>
          <div style={{ height: 10, background: C.gray100, borderRadius: 99, overflow: "hidden", margin: "4px 0 8px" }}>
            <div style={{
              width: `${data.objectives?.avg_progress ?? 0}%`, height: "100%",
              background: C.grad, borderRadius: 99, transition: "width 1s ease",
            }} />
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>{data.objectives?.avg_progress ?? 0}% average completion</div>
          <p className="ur-drill-insight">
            {(data.objectives?.avg_progress ?? 0) < 40
              ? "⚠️ Low average progress — employees may need support or check-ins on their goals."
              : "✅ Good objective progress. Keep alignment conversations happening regularly."}
          </p>
        </>
      ),
    },

    timesheets: {
      title: "Timesheets — Drill Down",
      color: C.red,
      content: (
        <>
          <div className="ur-drill-kpis">
            {[
              { label: "Total Hours",      value: data.timesheets?.total_hours_logged, color: C.red    },
              { label: "Unique Submitters",value: data.timesheets?.unique_submitters,  color: C.purple },
              { label: "Adoption Rate",    value: `${data.timesheets?.adoption_rate ?? 0}%`, color: C.teal },
              { label: "Non-Submitters",   value: Math.max(0,(data.employees?.total_active??0)-(data.timesheets?.unique_submitters??0)), color: C.muted },
            ].map(k => (
              <div key={k.label} className="ur-drill-kpi" style={{ "--dk-color": k.color }}>
                <div className="ur-drill-kpi-val">{k.value ?? "—"}</div>
                <div className="ur-drill-kpi-label">{k.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <p className="ur-drill-section-label">Submitter split</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={tsData} cx="50%" cy="50%" innerRadius={45} outerRadius={78}
                    dataKey="value" nameKey="name" paddingAngle={3}>
                    <Cell fill={C.green} />
                    <Cell fill={C.gray100} />
                  </Pie>
                  <Tooltip formatter={v => [v, ""]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
              <p className="ur-drill-section-label" style={{ margin: 0 }}>Adoption rate</p>
              <div style={{ fontSize: 48, fontWeight: 800, color: (data.timesheets?.adoption_rate??0) >= 70 ? C.green : C.yellow, lineHeight: 1 }}>
                {data.timesheets?.adoption_rate ?? 0}<span style={{ fontSize: 20, color: C.muted }}>%</span>
              </div>
              <div style={{ height: 8, background: C.gray100, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${data.timesheets?.adoption_rate ?? 0}%`, height: "100%", background: C.grad, borderRadius: 99 }} />
              </div>
            </div>
          </div>
          <p className="ur-drill-insight">
            {(data.timesheets?.adoption_rate ?? 0) < 70
              ? "⚠️ Timesheet adoption is below 70%. Consider automated reminders before deadlines."
              : "✅ Strong adoption. Timesheet data is reliable for project reporting."}
          </p>
        </>
      ),
    },

    announcements: {
      title: "Announcements — Drill Down",
      color: C.violet,
      content: (
        <>
          <div className="ur-drill-kpis">
            {[
              { label: "Published",    value: data.announcements?.total_published, color: C.violet },
              { label: "Total Reads",  value: data.announcements?.total_reads,     color: C.blue   },
              { label: "Avg Reads/Ann",value: data.announcements?.total_published
                  ? Math.round((data.announcements.total_reads ?? 0) / data.announcements.total_published)
                  : "—", color: C.teal },
            ].map(k => (
              <div key={k.label} className="ur-drill-kpi" style={{ "--dk-color": k.color }}>
                <div className="ur-drill-kpi-val">{k.value ?? "—"}</div>
                <div className="ur-drill-kpi-label">{k.label}</div>
              </div>
            ))}
          </div>
          <p className="ur-drill-section-label">Published vs reads</p>
          <ResponsiveContainer width="100%" height={180}>
            <ReBarChart data={annData} barSize={48}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.gray200} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="value" name="Count" radius={[6,6,0,0]}>
                <Cell fill={C.violet} />
                <Cell fill={C.teal}   />
              </Bar>
            </ReBarChart>
          </ResponsiveContainer>
          <p className="ur-drill-insight">
            Each announcement is read on average <strong>
              {data.announcements?.total_published
                ? Math.round((data.announcements.total_reads ?? 0) / data.announcements.total_published)
                : 0}
            </strong> times. Higher numbers indicate strong communication reach.
          </p>
        </>
      ),
    },

    wellbeing: {
      title: "Wellbeing — Drill Down",
      color: C.green,
      content: (
        <>
          <div className="ur-drill-kpis">
            <div className="ur-drill-kpi" style={{ "--dk-color": C.green }}>
              <div className="ur-drill-kpi-val">
                {wellbeingRating ? `${wellbeingRating.toFixed(1)}/5` : "—"}
              </div>
              <div className="ur-drill-kpi-label">Avg Post-Meeting Rating</div>
            </div>
            <div className="ur-drill-kpi" style={{ "--dk-color": C.teal }}>
              <div className="ur-drill-kpi-val">{data.engagement_score ?? "—"}%</div>
              <div className="ur-drill-kpi-label">Engagement Score</div>
            </div>
          </div>
          <p className="ur-drill-section-label">Platform-wide engagement radar</p>
          <ResponsiveContainer width="100%" height={230}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={C.gray200} />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: C.muted }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
              <Radar name="Engagement %" dataKey="value" stroke={C.purple} fill={C.purple} fillOpacity={0.18} strokeWidth={2} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
          <p className="ur-drill-insight">
            {wellbeingRating
              ? wellbeingRating >= 3.5
                ? "✅ Employees report feeling good after meetings — a strong wellbeing signal."
                : "⚠️ Post-meeting wellbeing ratings are low. Consider reviewing meeting frequency and format."
              : "No wellbeing ratings collected yet. Encourage managers to request ratings after meetings."}
          </p>
        </>
      ),
    },
  };

  const mod_def = modules[mod];
  if (!mod_def) return null;

  return (
    <div className="ur-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ur-modal" style={{ "--mod-accent": mod_def.color }}>
        {/* Header */}
        <div className="ur-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="ur-modal-dot" style={{ background: mod_def.color, boxShadow: `0 0 14px ${mod_def.color}66` }} />
            <h2 className="ur-modal-title">{mod_def.title}</h2>
          </div>
          <button className="ur-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="ur-modal-rule" style={{ background: `linear-gradient(90deg,${mod_def.color},${C.teal})` }} />
        <div className="ur-modal-body">{mod_def.content}</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   INTERACTIVE MODULE CARD
   Click to open drill-down
════════════════════════════════════════════ */
function ModuleCard({ title, icon, color, modKey, onOpen, children }) {
  return (
    <div
      className="ur-module ur-module--clickable"
      style={{ "--mod-color": color }}
      onClick={() => onOpen(modKey)}
      title={`Click to explore ${title} in detail`}
    >
      <div className="ur-module-header">
        <span className="ur-module-icon">{icon}</span>
        <span className="ur-module-title">{title}</span>
        <span className="ur-module-expand">↗</span>
      </div>
      <div className="ur-module-body">{children}</div>
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════ */
export default function AdminUsageReport() {
  const [start,      setStart]      = useState(PRESETS[0].start);
  const [end,        setEnd]        = useState(PRESETS[0].end);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [activeModule, setActiveModule] = useState(null);  // which drill-down is open

  const fetchReport = async (s = start, e = end) => {
    setLoading(true); setError("");
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

  const applyPreset = (p) => { setStart(p.start); setEnd(p.end); fetchReport(p.start, p.end); };

  return (
    <div className="ur-wrap" id="ur-printable">

      {/* ── Header (unchanged) ── */}
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

      {/* ── Controls (unchanged) ── */}
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
          {/* hint banner */}
          <div className="ur-hint">
            💡 Click any module card below to explore detailed analytics and insights
          </div>

          {/* KPIs (unchanged) */}
          <div className="ur-kpis">
            <KpiCard label="Active Employees"  value={data.employees?.total_active}         color="#8b5cf6" />
            <KpiCard label="Chat Sessions"     value={data.chat?.total_sessions}            sub={`${data.chat?.adoption_rate}% adoption`}                          color="#3b82f6" />
            <KpiCard label="Meetings"          value={data.meetings?.total_scheduled}       sub={`${data.meetings?.completed} completed`}                          color="#1FBFB8" />
            <KpiCard label="Hours Logged"      value={data.timesheets?.total_hours_logged}  sub={`${data.timesheets?.adoption_rate}% adoption`}                    color="#f59e0b" />
            <KpiCard label="Active Objectives" value={data.objectives?.total_active}        sub={`${data.objectives?.avg_progress}% avg progress`}                 color="#34d399" />
          </div>

          <div className="ur-body">
            {/* Left panel (unchanged) */}
            <div className="ur-left">
              <div className="adash-chart-title">Engagement Score</div>
              <EngagementGauge score={data.engagement_score} />
              <div className="ur-period-box">
                <span>📅 {data.period?.start}</span>
                <span className="ur-period-arrow">→</span>
                <span>{data.period?.end}</span>
              </div>
            </div>

            {/* Module grid — every card is now clickable */}
            <div className="ur-modules">
              <ModuleCard title="Chat Activity"  icon="💬" color="#3b82f6" modKey="chat"         onOpen={setActiveModule}>
                <MetricRow label="Total sessions"  value={data.chat?.total_sessions} />
                <MetricRow label="Unique users"    value={data.chat?.unique_users} />
                <MetricRow label="Adoption rate"   value={`${data.chat?.adoption_rate}%`} highlight />
              </ModuleCard>

              <ModuleCard title="Meetings" icon="📹" color="#1FBFB8" modKey="meetings" onOpen={setActiveModule}>
                <MetricRow label="Scheduled"       value={data.meetings?.total_scheduled} />
                <MetricRow label="Completed"       value={data.meetings?.completed} />
                <MetricRow label="1-on-1s"         value={data.meetings?.one_on_ones} />
                <MetricRow label="Group meetings"  value={data.meetings?.group_meetings} />
                <MetricRow label="Avg wellbeing"   value={data.meetings?.avg_wellbeing_rating ? `${data.meetings.avg_wellbeing_rating}/5 ⭐` : "No data"} highlight />
              </ModuleCard>

              <ModuleCard title="Documents" icon="📄" color="#8b5cf6" modKey="documents" onOpen={setActiveModule}>
                <MetricRow label="Uploaded in period" value={data.documents?.total_uploaded} />
              </ModuleCard>

              <ModuleCard title="Guided Paths" icon="🧭" color="#f59e0b" modKey="guided_paths" onOpen={setActiveModule}>
                <MetricRow label="Started"          value={data.guided_paths?.total_started} />
                <MetricRow label="Completed"        value={data.guided_paths?.completed} />
                <MetricRow label="Completion rate"  value={`${data.guided_paths?.completion_rate}%`} highlight />
              </ModuleCard>

              <ModuleCard title="Objectives" icon="🎯" color="#34d399" modKey="objectives" onOpen={setActiveModule}>
                <MetricRow label="Created in period" value={data.objectives?.created_in_period} />
                <MetricRow label="Total active"      value={data.objectives?.total_active} />
                <MetricRow label="Avg progress"      value={`${data.objectives?.avg_progress}%`} highlight />
                {data.objectives?.by_status && Object.keys(data.objectives.by_status).length > 0 && (
                  <BarChart data={data.objectives.by_status} color="#34d399" />
                )}
              </ModuleCard>

              <ModuleCard title="Timesheets" icon="⏱" color="#f87171" modKey="timesheets" onOpen={setActiveModule}>
                <MetricRow label="Total hours logged"   value={data.timesheets?.total_hours_logged} />
                <MetricRow label="Unique submitters"    value={data.timesheets?.unique_submitters} />
                <MetricRow label="Adoption rate"        value={`${data.timesheets?.adoption_rate}%`} highlight />
              </ModuleCard>

              <ModuleCard title="Announcements" icon="📢" color="#a78bfa" modKey="announcements" onOpen={setActiveModule}>
                <MetricRow label="Published"   value={data.announcements?.total_published} />
                <MetricRow label="Total reads" value={data.announcements?.total_reads} />
              </ModuleCard>

              <ModuleCard title="Wellbeing" icon="💚" color="#34d399" modKey="wellbeing" onOpen={setActiveModule}>
                <MetricRow
                  label="Avg post-meeting rating"
                  value={data.meetings?.avg_wellbeing_rating ? `${data.meetings.avg_wellbeing_rating} / 5` : "No data yet"}
                  highlight
                />
                <p className="ur-note">
                  Ratings collected anonymously after meetings. Scores below 2.5 may indicate team stress.
                </p>
              </ModuleCard>
            </div>
          </div>
        </>
      )}

      {/* Drill-down modal */}
      {activeModule && data && (
        <DrillModal
          module={activeModule}
          data={data}
          onClose={() => setActiveModule(null)}
        />
      )}
    </div>
  );
}
