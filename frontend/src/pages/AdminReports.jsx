/**
 * frontend/src/pages/AdminReports.jsx
 * Sprint 5 — Rafiki HR | Cross-module HR Reporting Dashboard
 *
 * Route: /admin/reports  (add to App.jsx + HR sidebar)
 * Auth:  HR admin only (inherits from AdminLayout)
 * Deps:  recharts (already used in AdminDashboard)
 *
 * Data flow:
 *   - GET /api/v1/admin/reports/summary  → panels 1–4
 *   - GET /api/v1/wellbeing/dashboard    → panel 5 (existing endpoint)
 * Two parallel fetches; each panel renders independently as data arrives.
 */

import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell, PieChart, Pie,
} from "recharts";
import { API, authFetch } from "../api.js";
import "./AdminReports.css";

/* ── Palette — mirrors App.css :root exactly ─────────────────────── */
const C = {
  purple: "#8b5cf6",
  teal:   "#1fbfb8",
  blue:   "#3b82f6",
  green:  "#34d399",
  yellow: "#fbbf24",
  red:    "#f87171",
  grad:   "linear-gradient(135deg,#8b5cf6 0%,#1fbfb8 100%)",
};

const OUTCOME_COLORS = {
  resolved:   C.green,
  ongoing:    C.blue,
  follow_up:  C.yellow,
  escalated:  C.red,
};

/* ── Shared sub-components ───────────────────────────────────────── */

function PanelShell({ title, color, icon, children, loading }) {
  return (
    <div className="ar-panel">
      <div className="ar-panel-header" style={{ "--panel-color": color }}>
        <span className="ar-panel-icon">{icon}</span>
        <span className="ar-panel-title">{title}</span>
      </div>
      <div className="ar-panel-body">
        {loading ? <div className="ar-skeleton-wrap"><div className="ar-skeleton"/><div className="ar-skeleton ar-skeleton--short"/></div> : children}
      </div>
    </div>
  );
}

function HorizBar({ label, value, max, color, suffix = "" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="ar-hbar-row">
      <span className="ar-hbar-label" title={label}>{label}</span>
      <div className="ar-hbar-track">
        <div className="ar-hbar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="ar-hbar-val">{typeof value === "number" && value % 1 ? value.toFixed(1) : value}{suffix}</span>
    </div>
  );
}

function StatPill({ value, label, color }) {
  return (
    <div className="ar-stat-pill" style={{ "--pill-color": color }}>
      <div className="ar-stat-val">{value ?? "—"}</div>
      <div className="ar-stat-label">{label}</div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ar-tooltip">
      <div className="ar-tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="ar-tooltip-row">
          <span className="ar-tooltip-dot" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

/* ── Panel 1: Timesheet Anomalies ─────────────────────────────────── */
function TimesheetAnomaliesPanel({ data, loading }) {
  if (!data && !loading) return null;
  const deptEntries = Object.entries(data?.by_department || {}).sort((a, b) => b[1] - a[1]);
  const maxDept     = Math.max(...deptEntries.map(([, v]) => v), 1);

  return (
    <PanelShell title="Timesheet Anomalies" color={C.red} icon="⚠️" loading={loading}>
      <div className="ar-stat-row">
        <StatPill value={data?.total_flagged} label="Flagged employees" color={C.red} />
        <StatPill value={data?.week_analysed} label="Week analysed" color={C.purple} />
      </div>
      {deptEntries.length > 0 && (
        <>
          <div className="ar-subsection-label">Flagged by department</div>
          {deptEntries.map(([dept, count]) => (
            <HorizBar key={dept} label={dept} value={count} max={maxDept} color={C.red} />
          ))}
        </>
      )}
      {data?.top_anomaly_types && Object.keys(data.top_anomaly_types).length > 0 && (
        <>
          <div className="ar-subsection-label" style={{ marginTop: 16 }}>Entry status breakdown</div>
          <div className="ar-chip-row">
            {Object.entries(data.top_anomaly_types).map(([type, count]) => (
              <span key={type} className="ar-chip" style={{ "--chip-color": type === "rejected" ? C.red : C.yellow }}>
                {type} · {count}
              </span>
            ))}
          </div>
        </>
      )}
      {deptEntries.length === 0 && !loading && (
        <div className="ar-empty">No anomalies flagged for last week ✓</div>
      )}
    </PanelShell>
  );
}

/* ── Panel 2: Leave Balances ──────────────────────────────────────── */
function LeaveBalancesPanel({ data, loading }) {
  const deptEntries = Object.entries(data?.avg_remaining_by_dept || {})
    .sort((a, b) => a[1] - b[1]); // lowest balance first
  const maxBalance  = Math.max(...deptEntries.map(([, v]) => v), 1);
  const reasonEntries = Object.entries(data?.top_leave_reasons || {}).sort((a, b) => b[1] - a[1]);

  return (
    <PanelShell title="Leave Balance Summary" color={C.green} icon="🌿" loading={loading}>
      <div className="ar-stat-row">
        <StatPill value={data?.pending_applications} label="Pending approval" color={C.yellow} />
        <StatPill value={data?.year} label="Leave year" color={C.teal} />
      </div>
      {deptEntries.length > 0 && (
        <>
          <div className="ar-subsection-label">Avg days remaining by dept</div>
          {deptEntries.map(([dept, avg]) => (
            <HorizBar key={dept} label={dept} value={avg} max={maxBalance} color={C.green} suffix=" d" />
          ))}
        </>
      )}
      {reasonEntries.length > 0 && (
        <>
          <div className="ar-subsection-label" style={{ marginTop: 16 }}>Top leave types taken</div>
          <div className="ar-chip-row">
            {reasonEntries.map(([type, count]) => (
              <span key={type} className="ar-chip" style={{ "--chip-color": C.teal }}>
                {type} · {count}
              </span>
            ))}
          </div>
        </>
      )}
    </PanelShell>
  );
}

/* ── Panel 3: Coaching Outcomes ───────────────────────────────────── */
function CoachingOutcomesPanel({ data, loading }) {
  const outcomeEntries = Object.entries(data?.outcomes || {});
  const pieData = outcomeEntries.map(([name, value]) => ({
    name,
    value,
    color: OUTCOME_COLORS[name] || C.purple,
  }));

  return (
    <PanelShell title="Coaching Session Outcomes" color={C.purple} icon="🎯" loading={loading}>
      <div className="ar-stat-row">
        <StatPill value={data?.total_sessions_90d} label="Sessions (90d)" color={C.blue} />
        <StatPill value={data?.overdue_followups}  label="Overdue follow-ups" color={C.red} />
        <StatPill value={data?.upcoming_followups} label="Due this week" color={C.yellow} />
      </div>
      {pieData.length > 0 && (
        <div className="ar-pie-wrap">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="ar-pie-legend">
            {pieData.map(({ name, value, color }) => (
              <div key={name} className="ar-pie-legend-item">
                <span className="ar-pie-dot" style={{ background: color }} />
                <span>{name}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
      {data?.overdue_followups > 0 && (
        <div className="ar-alert-banner" style={{ "--alert-color": C.red }}>
          ⚠️ {data.overdue_followups} coaching follow-up{data.overdue_followups !== 1 ? "s are" : " is"} overdue — review in the coaching module.
        </div>
      )}
    </PanelShell>
  );
}

/* ── Panel 4: Guided Path Completion ──────────────────────────────── */
function GuidedPathsPanel({ data, loading }) {
  const modules = data?.modules || [];
  const chartData = modules.slice(0, 8).map(m => ({
    name: m.module.length > 18 ? m.module.slice(0, 17) + "…" : m.module,
    completed: m.completed,
    total: m.total_sessions,
    delta: m.avg_rating_delta,
  }));

  return (
    <PanelShell title="Guided Path Completions" color={C.teal} icon="🗺" loading={loading}>
      <div className="ar-stat-row">
        <StatPill
          value={data?.overall_completion_rate != null ? `${data.overall_completion_rate}%` : null}
          label="Overall completion"
          color={C.teal}
        />
        <StatPill value={modules.length} label="Active modules" color={C.blue} />
      </div>
      {chartData.length > 0 && (
        <>
          <div className="ar-subsection-label">Completions per module</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,.1)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "#6b7280" }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total"     name="Assigned"  fill={`${C.purple}33`} radius={[4,4,0,0]} />
              <Bar dataKey="completed" name="Completed" fill={C.teal}          radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          {modules.some(m => m.avg_rating_delta !== null) && (
            <>
              <div className="ar-subsection-label" style={{ marginTop: 16 }}>Avg pre→post rating delta</div>
              {modules
                .filter(m => m.avg_rating_delta !== null)
                .sort((a, b) => (b.avg_rating_delta ?? 0) - (a.avg_rating_delta ?? 0))
                .slice(0, 5)
                .map(m => (
                  <div key={m.module} className="ar-delta-row">
                    <span className="ar-delta-name">{m.module}</span>
                    <span
                      className="ar-delta-val"
                      style={{ color: m.avg_rating_delta >= 0 ? C.green : C.red }}
                    >
                      {m.avg_rating_delta >= 0 ? "+" : ""}{m.avg_rating_delta?.toFixed(2)}
                    </span>
                  </div>
                ))}
            </>
          )}
        </>
      )}
      {modules.length === 0 && !loading && (
        <div className="ar-empty">No guided path session data yet.</div>
      )}
    </PanelShell>
  );
}

/* ── Panel 5: Wellbeing Score Trends ─────────────────────────────── */

const PERIOD_OPTIONS = [
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
];

function WellbeingTrendsPanel() {
  const [period, setPeriod]   = useState(30);
  const [data,   setData]     = useState(null);
  const [trend,  setTrend]    = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (days) => {
    setLoading(true);
    try {
      const [dashRes, trendRes] = await Promise.allSettled([
        authFetch(`${API}/api/v1/wellbeing/dashboard`),
        authFetch(`${API}/api/v1/wellbeing/trend?days=${days}`),
      ]);
      if (dashRes.status  === "fulfilled" && dashRes.value.ok)  setData(await dashRes.value.json());
      if (trendRes.status === "fulfilled" && trendRes.value.ok) {
        const raw = await trendRes.value.json();
        setTrend(Array.isArray(raw) ? raw : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  const chartData = trend.map(r => ({
    date: r.date ? r.date.slice(5, 10) : "",   // MM-DD
    stress:    r.avg_stress,
    sentiment: +(((r.avg_sentiment ?? 0) + 1) / 2 * 100).toFixed(1), // -1..1 → 0..100
  }));

  return (
    <PanelShell title="Wellbeing Score Trends" color={C.yellow} icon="💛" loading={loading}>
      <div className="ar-stat-row">
        <StatPill
          value={data?.positive_sentiment_pct != null ? `${data.positive_sentiment_pct}%` : null}
          label="Positive sentiment"
          color={C.green}
        />
        <StatPill
          value={data?.avg_stress != null ? data.avg_stress.toFixed(1) : null}
          label="Avg stress (1–5)"
          color={data?.avg_stress > 3 ? C.red : C.yellow}
        />
        <StatPill value={data?.conversations_this_month} label="Conversations (mo)" color={C.blue} />
        <StatPill value={data?.open_alerts} label="Open crisis alerts" color={C.red} />
      </div>

      {/* Period selector */}
      <div className="ar-period-row">
        {PERIOD_OPTIONS.map(opt => (
          <button
            key={opt.days}
            className={`ar-period-btn ${period === opt.days ? "ar-period-btn--active" : ""}`}
            onClick={() => setPeriod(opt.days)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(251,191,36,.12)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#6b7280" }} />
            <Line
              type="monotone"
              dataKey="sentiment"
              name="Sentiment score (0–100)"
              stroke={C.yellow}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="stress"
              name="Avg stress (1–5)"
              stroke={C.red}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        !loading && <div className="ar-empty">No trend data for this period.</div>
      )}

      {data?.open_alerts > 0 && (
        <div className="ar-alert-banner" style={{ "--alert-color": C.red }}>
          🚨 {data.open_alerts} open crisis alert{data.open_alerts !== 1 ? "s" : ""} — review in the Wellbeing module.
        </div>
      )}
    </PanelShell>
  );
}

/* ── Main page ────────────────────────────────────────────────────── */
export default function AdminReports() {
  const [summary, setSummary]   = useState(null);
  const [loadingMain, setLoadingMain] = useState(true);
  const [error, setError]       = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const loadSummary = useCallback(async () => {
    setLoadingMain(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/api/v1/admin/reports/summary`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setSummary(await res.json());
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMain(false);
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  return (
    <div className="ar-wrap">

      {/* Header */}
      <div className="ar-header">
        <div>
          <h1 className="ar-heading">HR Reports</h1>
          <p className="ar-subheading">
            Cross-module analytics for all active HR areas
            {lastRefresh && (
              <span className="ar-refresh-note">
                · refreshed {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <button className="ar-refresh-btn" onClick={loadSummary} disabled={loadingMain}>
          {loadingMain ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div className="ar-error-banner">
          Failed to load report data: {error}.{" "}
          <button className="ar-error-retry" onClick={loadSummary}>Retry</button>
        </div>
      )}

      {/* Panel grid — 2 columns on wide screens */}
      <div className="ar-grid">
        <TimesheetAnomaliesPanel data={summary?.timesheet_anomalies} loading={loadingMain} />
        <LeaveBalancesPanel      data={summary?.leave_balances}      loading={loadingMain} />
        <CoachingOutcomesPanel   data={summary?.coaching_outcomes}   loading={loadingMain} />
        <GuidedPathsPanel        data={summary?.guided_paths}        loading={loadingMain} />
        {/* Wellbeing manages its own fetch + period state */}
        <WellbeingTrendsPanel />
      </div>

    </div>
  );
}
