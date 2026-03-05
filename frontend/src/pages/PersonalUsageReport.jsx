// frontend/src/pages/PersonalUsageReport.jsx
import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./PersonalUsageReport.css";

const LOGO = "/Rafiki_logo_2.png";

const today = new Date();
const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

const PRESETS = [
  { label: "This month", start: firstOfMonth.toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) },
  { label: "Last 7 days", start: new Date(today - 7 * 86400000).toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) },
  { label: "Last 30 days", start: new Date(today - 30 * 86400000).toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) },
  { label: "Last 90 days", start: new Date(today - 90 * 86400000).toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) },
];

const WELLBEING_EMOJI = ["", "😔", "😕", "😐", "🙂", "😊"];

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="pur-stat" style={{ "--stat-color": color }}>
      <div className="pur-stat-icon">{icon}</div>
      <div className="pur-stat-value">{value ?? "—"}</div>
      <div className="pur-stat-label">{label}</div>
      {sub && <div className="pur-stat-sub">{sub}</div>}
    </div>
  );
}

function ProgressBar({ label, value, max = 100, color }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="pur-progress-row">
      <div className="pur-progress-top">
        <span className="pur-progress-label">{label}</span>
        <span className="pur-progress-val">{value}{max === 100 ? "%" : ""}</span>
      </div>
      <div className="pur-progress-track">
        <div className="pur-progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function SectionCard({ title, icon, color, children }) {
  return (
    <div className="pur-section" style={{ "--sec-color": color }}>
      <div className="pur-section-header">
        <span>{icon}</span>
        <span className="pur-section-title">{title}</span>
      </div>
      {children}
    </div>
  );
}

function MetricRow({ label, value }) {
  return (
    <div className="pur-metric-row">
      <span className="pur-metric-label">{label}</span>
      <span className="pur-metric-value">{value ?? "—"}</span>
    </div>
  );
}

export default function PersonalUsageReport() {
  const user = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const name = user.full_name || user.name || user.email || "You";

  const [start, setStart] = useState(PRESETS[0].start);
  const [end, setEnd] = useState(PRESETS[0].end);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchReport = async (s = start, e = end) => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`${API}/api/v1/usage/me?start=${s}&end=${e}`);
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

  const wb = data?.meetings?.avg_wellbeing;
  const wbEmoji = wb ? WELLBEING_EMOJI[Math.round(wb)] : null;

  return (
    <div className="pur-wrap">
      {/* Header */}
      <div className="pur-header">
        <div className="pur-header-left">
          <img src={LOGO} alt="Rafiki" className="pur-logo" />
          <div>
            <h1 className="pur-title">My Activity Report</h1>
            <p className="pur-subtitle">Your personal platform usage — {name.split(" ")[0]}</p>
          </div>
        </div>
      </div>

      {/* Date controls */}
      <div className="pur-controls">
        <div className="pur-presets">
          {PRESETS.map(p => (
            <button key={p.label}
              className={`pur-preset${start === p.start && end === p.end ? " pur-preset-active" : ""}`}
              onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="pur-daterow">
          <input type="date" className="pur-date-input" value={start} onChange={e => setStart(e.target.value)} />
          <span>to</span>
          <input type="date" className="pur-date-input" value={end} onChange={e => setEnd(e.target.value)} />
          <button className="pur-run-btn" onClick={() => fetchReport()} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="pur-error">{error}</div>}

      {loading && (
        <div className="pur-loading">
          <img src={LOGO} alt="Rafiki" className="pur-loading-logo" />
          <p>Loading your activity...</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Top stat cards */}
          <div className="pur-stats">
            <StatCard icon="💬" label="Chat Sessions" value={data.chat?.sessions} color="#8b5cf6" />
            <StatCard icon="📹" label="Meetings Hosted" value={data.meetings?.hosted} sub={`+ ${data.meetings?.attended ?? 0} attended`} color="#1FBFB8" />
            <StatCard icon="⏱" label="Hours Logged" value={data.timesheets?.hours_logged} color="#f59e0b" />
            <StatCard icon="🎯" label="Active Objectives" value={data.objectives?.active} sub={`${data.objectives?.avg_progress ?? 0}% avg progress`} color="#34d399" />
            <StatCard icon="🧭" label="Paths Completed" value={data.guided_paths?.completed} sub={`${data.guided_paths?.completion_rate ?? 0}% rate`} color="#3b82f6" />
            <StatCard icon="📢" label="Announcements Read" value={data.announcements?.read} color="#a78bfa" />
          </div>

          {/* Wellbeing highlight */}
          {wb && (
            <div className="pur-wellbeing-banner">
              <span className="pur-wb-emoji">{wbEmoji}</span>
              <div>
                <div className="pur-wb-title">Your avg post-meeting wellbeing: {wb}/5</div>
                <div className="pur-wb-sub">
                  {wb >= 4 ? "You're thriving! Keep it up." :
                   wb >= 3 ? "Doing okay. Check in with yourself regularly." :
                   "Meetings seem tough lately. Consider speaking to your manager or HR."}
                </div>
              </div>
            </div>
          )}

          {/* Detail sections */}
          <div className="pur-sections">
            <SectionCard title="Chat Activity" icon="💬" color="#8b5cf6">
              <MetricRow label="AI chat sessions" value={data.chat?.sessions} />
              <p className="pur-tip">💡 Chat with Rafiki to get instant answers about policies, benefits, and more.</p>
            </SectionCard>

            <SectionCard title="Meetings" icon="📹" color="#1FBFB8">
              <MetricRow label="Meetings hosted" value={data.meetings?.hosted} />
              <MetricRow label="Meetings attended" value={data.meetings?.attended} />
              {wb && <MetricRow label="Avg wellbeing rating" value={`${wb}/5 ${wbEmoji}`} />}
            </SectionCard>

            <SectionCard title="Objectives" icon="🎯" color="#34d399">
              <MetricRow label="Total objectives" value={data.objectives?.total} />
              <MetricRow label="Active" value={data.objectives?.active} />
              {data.objectives?.avg_progress > 0 && (
                <ProgressBar label="Average progress" value={data.objectives?.avg_progress} color="#34d399" />
              )}
            </SectionCard>

            <SectionCard title="Timesheets" icon="⏱" color="#f59e0b">
              <MetricRow label="Hours logged" value={data.timesheets?.hours_logged} />
              <p className="pur-tip">💡 Keep timesheets up to date to help your manager track workload fairly.</p>
            </SectionCard>

            <SectionCard title="Guided Paths" icon="🧭" color="#3b82f6">
              <MetricRow label="Paths started" value={data.guided_paths?.started} />
              <MetricRow label="Paths completed" value={data.guided_paths?.completed} />
              {data.guided_paths?.started > 0 && (
                <ProgressBar label="Completion rate" value={data.guided_paths?.completion_rate} color="#3b82f6" />
              )}
            </SectionCard>

            <SectionCard title="Documents" icon="📄" color="#8b5cf6">
              <MetricRow label="Documents uploaded" value={data.documents?.uploaded} />
            </SectionCard>

            <SectionCard title="Announcements" icon="📢" color="#a78bfa">
              <MetricRow label="Announcements read" value={data.announcements?.read} />
              <p className="pur-tip">💡 Stay on top of announcements to keep informed about org updates.</p>
            </SectionCard>
          </div>

          <p className="pur-period-note">
            Report covers {data.period?.start} to {data.period?.end}
          </p>
        </>
      )}
    </div>
  );
}
