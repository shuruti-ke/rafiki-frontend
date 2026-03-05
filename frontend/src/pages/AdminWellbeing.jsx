import { useState, useEffect, useCallback } from "react";
import { API, authFetch } from "../api.js";
import "./AdminWellbeing.css";

const SENTIMENT_COLORS = { positive: "#34d399", neutral: "#94a3b8", negative: "#f87171" };
const CRISIS_TOPICS = new Set(["self_harm", "suicidal_thoughts"]);
const FILTER_OPTIONS = ["all", "open", "acknowledged", "resolved"];

function stressColor(v) {
  if (v <= 2) return "#34d399";
  if (v <= 3) return "#eab308";
  return "#ef4444";
}

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AdminWellbeing() {
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [alertFilter, setAlertFilter] = useState("all");
  const [topics, setTopics] = useState([]);
  const [stressDepts, setStressDepts] = useState([]);
  const [sentimentTrend, setSentimentTrend] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedAlert, setExpandedAlert] = useState(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [configOpen, setConfigOpen] = useState(false);

  const loadData = useCallback(() => {
    Promise.allSettled([
      authFetch(`${API}/api/v1/wellbeing/dashboard`).then(r => r.ok ? r.json() : null),
      authFetch(`${API}/api/v1/wellbeing/alerts`).then(r => r.ok ? r.json() : []),
      authFetch(`${API}/api/v1/wellbeing/topics`).then(r => r.ok ? r.json() : []),
      authFetch(`${API}/api/v1/wellbeing/stress-by-department`).then(r => r.ok ? r.json() : []),
      authFetch(`${API}/api/v1/wellbeing/sentiment-trend`).then(r => r.ok ? r.json() : []),
      authFetch(`${API}/api/v1/wellbeing/crisis-config`).then(r => r.ok ? r.json() : null),
    ]).then(([dashR, alertsR, topicsR, stressR, trendR, configR]) => {
      if (dashR.status === "fulfilled") setDashboard(dashR.value);
      if (alertsR.status === "fulfilled") setAlerts(alertsR.value || []);
      if (topicsR.status === "fulfilled") setTopics(topicsR.value || []);
      if (stressR.status === "fulfilled") setStressDepts(stressR.value || []);
      if (trendR.status === "fulfilled") setSentimentTrend(trendR.value || []);
      if (configR.status === "fulfilled" && configR.value) setConfig(configR.value);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAcknowledge = async (id) => {
    const r = await authFetch(`${API}/api/v1/wellbeing/alerts/${id}/acknowledge`, { method: "POST" });
    if (r.ok) {
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: "acknowledged" } : a));
      setExpandedAlert(null);
    }
  };

  const handleResolve = async (id) => {
    const r = await authFetch(`${API}/api/v1/wellbeing/alerts/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ notes: resolveNotes }),
    });
    if (r.ok) {
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: "resolved", resolution_notes: resolveNotes } : a));
      setExpandedAlert(null);
      setResolveNotes("");
    }
  };

  const saveConfig = async (updates) => {
    const newConfig = { ...config, ...updates };
    const r = await authFetch(`${API}/api/v1/wellbeing/crisis-config`, {
      method: "PUT",
      body: JSON.stringify(newConfig),
    });
    if (r.ok) setConfig(newConfig);
  };

  const addContact = () => {
    const contacts = [...(config?.crisis_contacts || []), { name: "", phone: "", email: "", role: "" }];
    setConfig(prev => ({ ...prev, crisis_contacts: contacts }));
  };

  const removeContact = (i) => {
    const contacts = (config?.crisis_contacts || []).filter((_, idx) => idx !== i);
    saveConfig({ crisis_contacts: contacts });
  };

  const updateContact = (i, field, value) => {
    const contacts = [...(config?.crisis_contacts || [])];
    contacts[i] = { ...contacts[i], [field]: value };
    setConfig(prev => ({ ...prev, crisis_contacts: contacts }));
  };

  const addHelpline = () => {
    const helplines = [...(config?.custom_helplines || []), { name: "", number: "", country: "" }];
    setConfig(prev => ({ ...prev, custom_helplines: helplines }));
  };

  const removeHelpline = (i) => {
    const helplines = (config?.custom_helplines || []).filter((_, idx) => idx !== i);
    saveConfig({ custom_helplines: helplines });
  };

  const updateHelpline = (i, field, value) => {
    const helplines = [...(config?.custom_helplines || [])];
    helplines[i] = { ...helplines[i], [field]: value };
    setConfig(prev => ({ ...prev, custom_helplines: helplines }));
  };

  if (loading) return <div className="wb-loading">Loading wellbeing data...</div>;

  const filteredAlerts = alertFilter === "all" ? alerts : alerts.filter(a => a.status === alertFilter);
  const sentBreakdown = dashboard?.sentiment_breakdown || {};
  const sentTotal = Object.values(sentBreakdown).reduce((s, v) => s + v, 0) || 1;
  const maxTopicCount = Math.max(...topics.map(t => t.count), 1);
  const maxStress = 5;

  return (
    <div className="wb-wrap">
      <div className="wb-header">
        <h1>Wellbeing Dashboard</h1>
        <p>Organization mental health insights and crisis management.</p>
      </div>

      {/* KPI Row */}
      <div className="wb-kpis">
        <div className="wb-kpi" style={{ "--kpi-color": "#ef4444" }}>
          <div className="wb-kpi-value">
            {dashboard?.open_alerts ?? 0}
            {(dashboard?.open_alerts || 0) > 0 && <span className="wb-pulse-dot" style={{ marginLeft: 8 }} />}
          </div>
          <div className="wb-kpi-label">Active Crisis Alerts</div>
        </div>
        <div className="wb-kpi" style={{ "--kpi-color": stressColor(dashboard?.avg_stress || 0) }}>
          <div className="wb-kpi-value">{dashboard?.avg_stress ?? "—"}</div>
          <div className="wb-kpi-label">Avg Stress Level (1-5)</div>
        </div>
        <div className="wb-kpi" style={{ "--kpi-color": "#34d399" }}>
          <div className="wb-kpi-value">{dashboard?.positive_sentiment_pct ?? 0}%</div>
          <div className="wb-kpi-label">Positive Sentiment</div>
        </div>
        <div className="wb-kpi" style={{ "--kpi-color": "#3b82f6" }}>
          <div className="wb-kpi-value">{dashboard?.conversations_this_month ?? 0}</div>
          <div className="wb-kpi-label">Conversations This Month</div>
        </div>
      </div>

      {/* Crisis Alerts Panel */}
      <div className="wb-panels">
        <div className="wb-panel full">
          <div className="wb-panel-title">
            Crisis Alerts
            {(dashboard?.open_alerts || 0) > 0 && <span className="wb-pulse-dot" />}
          </div>

          <div className="wb-alerts-filters">
            {FILTER_OPTIONS.map(f => (
              <button key={f} className={`wb-filter-btn ${alertFilter === f ? "active" : ""}`} onClick={() => setAlertFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {filteredAlerts.length === 0 ? (
            <div className="wb-empty">No alerts to show.</div>
          ) : (
            filteredAlerts.map(a => (
              <div key={a.id}>
                <div className={`wb-alert-row ${a.risk_level}`} onClick={() => setExpandedAlert(expandedAlert === a.id ? null : a.id)}>
                  <span className="wb-alert-name">{a.employee_name}</span>
                  <span className="wb-alert-dept">{a.department || ""}</span>
                  <span className={`wb-risk-badge ${a.risk_level}`}>{a.risk_level}</span>
                  <span className="wb-alert-excerpt">{a.trigger_text?.slice(0, 60)}</span>
                  <span className="wb-alert-time">{timeAgo(a.created_at)}</span>
                  <span className={`wb-status-badge ${a.status}`}>{a.status}</span>
                </div>

                {expandedAlert === a.id && (
                  <div className="wb-alert-detail">
                    <div className="wb-alert-detail-text">
                      <strong>Trigger text:</strong> {a.trigger_text || "N/A"}
                    </div>
                    {a.detected_patterns && a.detected_patterns.length > 0 && (
                      <div className="wb-alert-detail-text">
                        <strong>Detected patterns:</strong> {a.detected_patterns.join(", ")}
                      </div>
                    )}
                    {a.resolution_notes && (
                      <div className="wb-alert-detail-text">
                        <strong>Resolution notes:</strong> {a.resolution_notes}
                      </div>
                    )}
                    {a.status === "open" && (
                      <div className="wb-alert-actions">
                        <button className="wb-btn primary" onClick={() => handleAcknowledge(a.id)}>Acknowledge</button>
                        <input className="wb-resolve-input" placeholder="Resolution notes..." value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} />
                        <button className="wb-btn" onClick={() => handleResolve(a.id)}>Resolve</button>
                      </div>
                    )}
                    {a.status === "acknowledged" && (
                      <div className="wb-alert-actions">
                        <input className="wb-resolve-input" placeholder="Resolution notes..." value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} />
                        <button className="wb-btn primary" onClick={() => handleResolve(a.id)}>Resolve</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Sentiment + Topics side by side */}
      <div className="wb-panels">
        <div className="wb-panel">
          <div className="wb-panel-title">Organization Sentiment</div>
          {/* Segmented bar */}
          <div className="wb-seg">
            {Object.entries(sentBreakdown).map(([k, v]) => (
              <div key={k} className="wb-seg-part" style={{ width: `${(v / sentTotal) * 100}%`, background: SENTIMENT_COLORS[k] || "#94a3b8" }} />
            ))}
          </div>
          <div className="wb-seg-legend">
            {Object.entries(sentBreakdown).map(([k, v]) => (
              <span key={k} className="wb-seg-item">
                <span className="wb-seg-dot" style={{ background: SENTIMENT_COLORS[k] || "#94a3b8" }} />
                {k} ({v})
              </span>
            ))}
          </div>

          {/* Daily trend */}
          {sentimentTrend.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>30-Day Sentiment Trend</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 60 }}>
                {sentimentTrend.map((d, i) => {
                  const norm = ((d.avg_sentiment + 1) / 2) * 100; // -1..1 -> 0..100
                  const color = d.avg_sentiment >= 0.2 ? "#34d399" : d.avg_sentiment <= -0.2 ? "#f87171" : "#94a3b8";
                  return (
                    <div key={i} style={{ flex: 1, minWidth: 3, height: `${Math.max(norm, 5)}%`, background: color, borderRadius: 2 }}
                      title={`${d.date?.slice(0, 10)}: ${d.avg_sentiment}`} />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="wb-panel">
          <div className="wb-panel-title">Mental Health Topics</div>
          {topics.length === 0 ? (
            <div className="wb-empty">No topics recorded yet.</div>
          ) : (
            topics.filter(t => t.count > 0).map(t => (
              <div className="wb-bar-row" key={t.topic}>
                <span className="wb-bar-label">{t.topic.replace(/_/g, " ")}</span>
                <div className="wb-bar-track">
                  <div className="wb-bar-fill" style={{
                    width: `${(t.count / maxTopicCount) * 100}%`,
                    background: CRISIS_TOPICS.has(t.topic) ? "#ef4444" : "var(--accent)",
                  }} />
                </div>
                <span className="wb-bar-value">{t.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Stress by Department */}
      <div className="wb-panels">
        <div className="wb-panel full">
          <div className="wb-panel-title">Stress by Department</div>
          {stressDepts.length === 0 ? (
            <div className="wb-empty">No department data yet.</div>
          ) : (
            stressDepts.sort((a, b) => b.avg_stress - a.avg_stress).map(d => (
              <div className="wb-bar-row" key={d.department}>
                <span className="wb-bar-label">{d.department}</span>
                <div className="wb-bar-track">
                  <div className="wb-bar-fill" style={{
                    width: `${(d.avg_stress / maxStress) * 100}%`,
                    background: stressColor(d.avg_stress),
                  }} />
                </div>
                <span className="wb-bar-value">{d.avg_stress}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Crisis Configuration */}
      {config && (
        <div className="wb-panel full" style={{ marginBottom: 24 }}>
          <div className="wb-config-toggle" onClick={() => setConfigOpen(!configOpen)}>
            <span className={`wb-config-arrow ${configOpen ? "open" : ""}`}>&#9654;</span>
            <h3>Crisis Configuration</h3>
          </div>

          {configOpen && (
            <div>
              {/* Toggles */}
              <div className="wb-toggle-row">
                <span className="wb-toggle-label">Auto-alert managers on crisis</span>
                <button className={`wb-toggle ${config.auto_alert_managers ? "on" : ""}`}
                  onClick={() => saveConfig({ auto_alert_managers: !config.auto_alert_managers })} />
              </div>
              <div className="wb-toggle-row">
                <span className="wb-toggle-label">Auto-alert HR admins on crisis</span>
                <button className={`wb-toggle ${config.auto_alert_hr ? "on" : ""}`}
                  onClick={() => saveConfig({ auto_alert_hr: !config.auto_alert_hr })} />
              </div>

              {/* Crisis Contacts */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Organization Crisis Contacts</div>
                <div className="wb-contact-list">
                  {(config.crisis_contacts || []).map((c, i) => (
                    <div className="wb-contact-row" key={i}>
                      <input className="wb-contact-input" placeholder="Name" value={c.name || ""} onChange={e => updateContact(i, "name", e.target.value)} onBlur={() => saveConfig({ crisis_contacts: config.crisis_contacts })} />
                      <input className="wb-contact-input" placeholder="Phone" value={c.phone || ""} onChange={e => updateContact(i, "phone", e.target.value)} onBlur={() => saveConfig({ crisis_contacts: config.crisis_contacts })} />
                      <input className="wb-contact-input" placeholder="Email" value={c.email || ""} onChange={e => updateContact(i, "email", e.target.value)} onBlur={() => saveConfig({ crisis_contacts: config.crisis_contacts })} />
                      <input className="wb-contact-input" placeholder="Role" value={c.role || ""} onChange={e => updateContact(i, "role", e.target.value)} onBlur={() => saveConfig({ crisis_contacts: config.crisis_contacts })} />
                      <button className="wb-remove-btn" onClick={() => removeContact(i)}>&#10005;</button>
                    </div>
                  ))}
                  <button className="wb-add-btn" onClick={addContact}>+ Add Contact</button>
                </div>
              </div>

              {/* Custom Helplines */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Custom Helplines (shown to users in crisis)</div>
                <div className="wb-contact-list">
                  {(config.custom_helplines || []).map((h, i) => (
                    <div className="wb-contact-row" key={i} style={{ gridTemplateColumns: "1fr 1fr 1fr 32px" }}>
                      <input className="wb-contact-input" placeholder="Name" value={h.name || ""} onChange={e => updateHelpline(i, "name", e.target.value)} onBlur={() => saveConfig({ custom_helplines: config.custom_helplines })} />
                      <input className="wb-contact-input" placeholder="Number" value={h.number || ""} onChange={e => updateHelpline(i, "number", e.target.value)} onBlur={() => saveConfig({ custom_helplines: config.custom_helplines })} />
                      <input className="wb-contact-input" placeholder="Country" value={h.country || ""} onChange={e => updateHelpline(i, "country", e.target.value)} onBlur={() => saveConfig({ custom_helplines: config.custom_helplines })} />
                      <button className="wb-remove-btn" onClick={() => removeHelpline(i)}>&#10005;</button>
                    </div>
                  ))}
                  <button className="wb-add-btn" onClick={addHelpline}>+ Add Helpline</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
