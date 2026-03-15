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

const AI_QUICK_PROMPTS = [
  { label: "1:1 meeting prep",     prompt: "Guide for preparing and running effective 1:1 meetings",           category: "coaching" },
  { label: "Difficult conversation", prompt: "Framework for having a difficult performance or behavior conversation", category: "conversation" },
  { label: "PIP discussion",     prompt: "How to introduce and discuss a performance improvement plan",   category: "pip" },
  { label: "Feedback script",    prompt: "Clear, constructive feedback script for a direct report",        category: "coaching" },
  { label: "Conflict mediation", prompt: "Steps to mediate conflict between two team members",             category: "conflict" },
  { label: "Onboarding checklist", prompt: "Manager checklist for onboarding a new direct report",        category: "development" },
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
  const [aiPrompt,        setAiPrompt]        = useState("");
  const [generating,       setGenerating]       = useState(false);
  const [generateError,    setGenerateError]    = useState("");
  const [generatedModule,  setGeneratedModule] = useState(null);
  const [saveInProgress,   setSaveInProgress]   = useState(false);

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

  async function doGenerate(save = false) {
    const prompt = (aiPrompt || "").trim();
    if (!prompt) {
      setGenerateError("Describe what you need (e.g. 'script for giving feedback', 'PIP discussion steps').");
      return;
    }
    setGenerateError("");
    setGenerating(true);
    if (save) setSaveInProgress(true);
    try {
      const r = await authFetch(`${API}/api/v1/manager/toolkit/generate`, {
        method: "POST",
        body: JSON.stringify({ prompt, category: null, save }),
      });
      const data = await r.json();
      if (!r.ok) {
        setGenerateError(data.detail || "Generation failed.");
        return;
      }
      const gen = data.generated || data;
      if (data.saved && data.module) {
        setModules(prev => [data.module, ...prev]);
        setGeneratedModule(null);
        setAiPrompt("");
      } else {
        setGeneratedModule({
          id: null,
          title: gen.title,
          category: gen.category,
          content: gen.content || {},
          version: 1,
          org_id: null,
          is_active: true,
          language: "en",
          created_by: null,
          approved_by: null,
          created_at: null,
          updated_at: null,
        });
      }
    } catch {
      setGenerateError("Network error. Try again.");
    } finally {
      setGenerating(false);
      setSaveInProgress(false);
    }
  }

  async function saveGeneratedToToolkit() {
    if (!generatedModule) return;
    setSaveInProgress(true);
    setGenerateError("");
    try {
      const r = await authFetch(`${API}/api/v1/manager/toolkit/generate`, {
        method: "POST",
        body: JSON.stringify({
          save: true,
          generated: {
            title: generatedModule.title,
            category: generatedModule.category,
            content: generatedModule.content,
          },
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setGenerateError(data.detail || "Save failed.");
        return;
      }
      if (data.module) {
        setModules(prev => [data.module, ...prev]);
        setGeneratedModule(null);
        setAiPrompt("");
      }
    } catch {
      setGenerateError("Network error. Try again.");
    } finally {
      setSaveInProgress(false);
    }
  }

  const displayed = modules.filter(m =>
    !search || m.title.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedModule) {
    return <ModuleDetail module={selectedModule} onBack={() => setSelectedModule(null)} />;
  }

  if (generatedModule) {
    return (
      <ModuleDetail
        module={generatedModule}
        onBack={() => setGeneratedModule(null)}
        isGenerated
        onSaveToToolkit={saveGeneratedToToolkit}
        saveInProgress={saveInProgress}
      />
    );
  }

  return (
    <div className="mtk-wrap">

      {/* ── Header ── */}
      <div className="mtk-header">
        <div>
          <h1 className="mtk-title">HR Toolkit</h1>
          <p className="mtk-sub">Playbooks, templates, and conversation frameworks. Create custom guides with AI.</p>
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

      {/* ── Create with AI ── */}
      <div className="mtk-ai-block">
        <div className="mtk-ai-label">✨ Create a toolkit on demand</div>
        <div className="mtk-ai-row">
          <input
            className="mtk-ai-input"
            placeholder="e.g. Script for giving feedback, PIP discussion steps, onboarding checklist…"
            value={aiPrompt}
            onChange={e => { setAiPrompt(e.target.value); setGenerateError(""); }}
            onKeyDown={e => e.key === "Enter" && doGenerate(false)}
          />
          <button
            type="button"
            className="mtk-ai-generate-btn"
            onClick={() => doGenerate(false)}
            disabled={generating || !aiPrompt.trim()}
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
        <div className="mtk-ai-quick">
          {AI_QUICK_PROMPTS.map(({ label, prompt, category }) => (
            <button
              key={label}
              type="button"
              className="mtk-ai-chip"
              onClick={() => { setAiPrompt(prompt); setGenerateError(""); }}
            >
              {label}
            </button>
          ))}
        </div>
        {generateError && <div className="mtk-ai-error">{generateError}</div>}
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
function ModuleDetail({ module, onBack, isGenerated, onSaveToToolkit, saveInProgress }) {
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
      <div className="mtk-detail-actions">
        <button className="mtk-back-btn" onClick={onBack}>← Back to Toolkit</button>
        {isGenerated && onSaveToToolkit && (
          <button
            type="button"
            className="mtk-save-generated-btn"
            onClick={onSaveToToolkit}
            disabled={saveInProgress}
          >
            {saveInProgress ? "Saving…" : "💾 Save to my toolkit"}
          </button>
        )}
      </div>

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
            {isGenerated && (
              <span className="mtk-card-badge mtk-badge-ai" style={{ marginLeft: 8 }}>✨ AI generated</span>
            )}
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
