import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./ManagerToolkit.css";

const CATEGORIES = [
  { key: "",             label: "All",          icon: "✦" },
  { key: "coaching",     label: "Coaching",     icon: "🧠" },
  { key: "conversation", label: "Conversation", icon: "💬" },
  { key: "pip",          label: "PIP",          icon: "📈" },
  { key: "development",  label: "Development",  icon: "🌱" },
  { key: "conflict",     label: "Conflict",     icon: "🤝" },
  { key: "compliance",   label: "Compliance",   icon: "📋" },
];

const CAT_COLORS = {
  coaching:     { color: "#8b5cf6", bg: "rgba(139,92,246,.10)" },
  conversation: { color: "#3b82f6", bg: "rgba(59,130,246,.10)"  },
  pip:          { color: "#f87171", bg: "rgba(248,113,113,.10)" },
  development:  { color: "#34d399", bg: "rgba(52,211,153,.10)"  },
  conflict:     { color: "#fbbf24", bg: "rgba(251,191,36,.10)"  },
  compliance:   { color: "#1fbfb8", bg: "rgba(31,191,184,.10)"  },
};

function getCat(key) {
  return CAT_COLORS[key] || { color: "#9ca3af", bg: "rgba(156,163,175,.10)" };
}

function getCatIcon(key) {
  return CATEGORIES.find(c => c.key === key)?.icon || "✦";
}

export default function ManagerToolkit() {
  const [modules,         setModules]         = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [seeding,         setSeeding]         = useState(false);
  const [filter,          setFilter]          = useState("");
  const [search,          setSearch]          = useState("");
  const [selectedModule,  setSelectedModule]  = useState(null);
  const [seedMsg,         setSeedMsg]         = useState("");

  useEffect(() => { loadModules(); }, [filter]);

  function loadModules() {
    const url = filter
      ? `${API}/api/v1/manager/toolkit?category=${filter}`
      : `${API}/api/v1/manager/toolkit`;
    setLoading(true);
    authFetch(url)
      .then(r => r.ok ? r.json() : [])
      .then(data => setModules(Array.isArray(data) ? data : []))
      .catch(() => setModules([]))
      .finally(() => setLoading(false));
  }

  async function seedModules() {
    setSeeding(true);
    setSeedMsg("");
    try {
      const r = await authFetch(`${API}/api/v1/manager/admin/seed-toolkit`, { method: "POST" });
      const d = await r.json();
      setSeedMsg(d.created > 0
        ? `✅ Seeded ${d.created} default module${d.created !== 1 ? "s" : ""}.`
        : "✓ All default modules already exist.");
      loadModules();
    } catch {
      setSeedMsg("Failed to seed modules.");
    }
    setSeeding(false);
  }

  const displayed = modules.filter(m =>
    !search || m.title.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedModule) {
    return <ModuleDetail module={selectedModule} onBack={() => setSelectedModule(null)} />;
  }

  return (
    <div className="mtk-wrap">

      {/* ── Header ── */}
      <div className="mtk-header">
        <div>
          <h1 className="mtk-title">HR Toolkit</h1>
          <p className="mtk-sub">Playbooks, templates, and conversation frameworks.</p>
        </div>
        <div className="mtk-header-actions">
          <div className="mtk-search-wrap">
            <span className="mtk-search-icon">🔍</span>
            <input
              className="mtk-search"
              placeholder="Search modules…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {modules.length === 0 && !loading && (
            <button className="mtk-seed-btn" onClick={seedModules} disabled={seeding}>
              {seeding ? "Seeding…" : "⚡ Load Default Modules"}
            </button>
          )}
        </div>
      </div>

      {seedMsg && <div className="mtk-seed-msg">{seedMsg}</div>}

      {/* ── Category filter ── */}
      <div className="mtk-filters">
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            className={`mtk-filter-chip ${filter === c.key ? "active" : ""}`}
            onClick={() => { setFilter(c.key); setSelectedModule(null); }}
            style={filter === c.key && c.key ? {
              background: getCat(c.key).bg,
              color: getCat(c.key).color,
              borderColor: getCat(c.key).color + "44",
            } : {}}
          >
            <span>{c.icon}</span> {c.label}
          </button>
        ))}
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div className="mtk-loading">
          <div className="mtk-loading-ring" />
          <span>Loading toolkit…</span>
        </div>
      ) : displayed.length === 0 ? (
        <div className="mtk-empty">
          <div className="mtk-empty-icon">🛠️</div>
          <div className="mtk-empty-text">No modules found.</div>
          {modules.length === 0 && (
            <button className="mtk-seed-btn" onClick={seedModules} disabled={seeding} style={{ marginTop: 16 }}>
              {seeding ? "Seeding…" : "⚡ Load Default Modules"}
            </button>
          )}
        </div>
      ) : (
        <div className="mtk-grid">
          {displayed.map(m => {
            const cat = getCat(m.category);
            const sections = m.content?.sections || [];
            return (
              <button key={m.id} className="mtk-card" onClick={() => setSelectedModule(m)}>
                <div className="mtk-card-icon" style={{ background: cat.bg, color: cat.color }}>
                  {getCatIcon(m.category)}
                </div>
                <div className="mtk-card-body">
                  <div className="mtk-card-cat" style={{ color: cat.color }}>{m.category}</div>
                  <div className="mtk-card-title">{m.title}</div>
                  <div className="mtk-card-meta">
                    {sections.length} section{sections.length !== 1 ? "s" : ""} ·
                    v{m.version} ·
                    <span className={`mtk-card-badge ${m.org_id ? "custom" : "platform"}`}>
                      {m.org_id ? "Custom" : "Platform"}
                    </span>
                  </div>
                </div>
                <span className="mtk-card-arrow" style={{ color: cat.color }}>→</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Module detail view ── */
function ModuleDetail({ module, onBack }) {
  const cat = getCat(module.category);
  const sections = module.content?.sections || [];
  const [copied, setCopied] = useState(null);

  function copyPrompt(text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  return (
    <div className="mtk-wrap">
      <button className="mtk-back-btn" onClick={onBack}>← Back to Toolkit</button>

      <div className="mtk-detail-hero" style={{ borderColor: cat.color + "33" }}>
        <div className="mtk-detail-icon" style={{ background: cat.bg, color: cat.color }}>
          {getCatIcon(module.category)}
        </div>
        <div>
          <div className="mtk-detail-cat" style={{ color: cat.color }}>{module.category}</div>
          <h2 className="mtk-detail-title">{module.title}</h2>
          <div className="mtk-detail-meta">
            v{module.version} · {module.language?.toUpperCase() || "EN"}
            {module.approved_by && ` · Approved`}
            <span className={`mtk-card-badge ${module.org_id ? "custom" : "platform"}`} style={{ marginLeft: 8 }}>
              {module.org_id ? "Custom" : "Platform"}
            </span>
          </div>
        </div>
      </div>

      <div className="mtk-detail-sections">
        {sections.map((section, i) => (
          <div key={i} className="mtk-section">
            <div className="mtk-section-num" style={{ background: cat.bg, color: cat.color }}>
              {i + 1}
            </div>
            <div className="mtk-section-body">
              <h3 className="mtk-section-heading">{section.heading}</h3>
              <p className="mtk-section-text">{section.body}</p>

              {section.prompts && section.prompts.length > 0 && (
                <div className="mtk-prompts">
                  <div className="mtk-prompts-label">💬 Suggested prompts</div>
                  {section.prompts.map((p, j) => (
                    <div key={j} className="mtk-prompt-row">
                      <div className="mtk-prompt-text">"{p}"</div>
                      <button
                        className="mtk-copy-btn"
                        onClick={() => copyPrompt(p)}
                        title="Copy to clipboard"
                      >
                        {copied === p ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
