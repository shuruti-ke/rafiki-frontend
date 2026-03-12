// frontend/src/pages/AdminToolkit.jsx
import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./AdminToolkit.css";

const CATEGORIES = ["coaching", "pip", "conflict", "development", "conversation", "compliance"];

const CAT_META = {
  coaching:     { icon: "🧠", color: "#8b5cf6" },
  conversation: { icon: "💬", color: "#3b82f6" },
  pip:          { icon: "📈", color: "#f87171" },
  development:  { icon: "🌱", color: "#34d399" },
  conflict:     { icon: "🤝", color: "#fbbf24" },
  compliance:   { icon: "📋", color: "#1fbfb8" },
};

const BLANK_FORM = {
  title: "", category: "coaching", language: "en",
  content: { sections: [{ heading: "", body: "", prompts: [] }] },
};

export default function AdminToolkit() {
  const [modules,    setModules]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [seeding,    setSeedloading] = useState(false);
  const [seedMsg,    setSeedMsg]    = useState("");
  const [filterCat,  setFilterCat]  = useState("");
  const [view,       setView]       = useState("list"); // list | edit | create
  const [editing,    setEditing]    = useState(null);   // module being edited
  const [form,       setForm]       = useState(BLANK_FORM);
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState("");

  useEffect(() => { loadModules(); }, [filterCat]);

  async function loadModules() {
    setLoading(true);
    const url = filterCat
      ? `${API}/api/v1/manager/admin/toolkit?category=${filterCat}`
      : `${API}/api/v1/manager/admin/toolkit`;
    try {
      const r = await authFetch(url);
      const d = await r.json();
      setModules(Array.isArray(d) ? d : []);
    } catch { setModules([]); }
    setLoading(false);
  }

  async function seedDefaults() {
    setSeedloading(true); setSeedMsg("");
    try {
      const r = await authFetch(`${API}/api/v1/manager/admin/seed-toolkit`, { method: "POST" });
      const d = await r.json();
      setSeedMsg(d.created > 0
        ? `✅ Seeded ${d.created} default module${d.created !== 1 ? "s" : ""}.`
        : "✓ All default modules already exist.");
      loadModules();
    } catch { setSeedMsg("❌ Failed to seed modules."); }
    setSeedloading(false);
  }

  async function saveModule() {
    setSaving(true); setSaveMsg("");
    const isEdit = !!editing;
    const url = isEdit
      ? `${API}/api/v1/manager/admin/toolkit/${editing.id}`
      : `${API}/api/v1/manager/admin/toolkit`;
    try {
      const r = await authFetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (r.ok) {
        setSaveMsg("✅ Saved.");
        loadModules();
        setTimeout(() => { setView("list"); setEditing(null); setSaveMsg(""); }, 900);
      } else {
        const d = await r.json();
        setSaveMsg("❌ " + (d.detail || "Save failed."));
      }
    } catch { setSaveMsg("❌ Network error."); }
    setSaving(false);
  }

  async function toggleActive(mod) {
    await authFetch(`${API}/api/v1/manager/admin/toolkit/${mod.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !mod.is_active }),
    });
    loadModules();
  }

  function openCreate() {
    setForm(BLANK_FORM);
    setEditing(null);
    setView("create");
    setSaveMsg("");
  }

  function openEdit(mod) {
    setForm({
      title: mod.title,
      category: mod.category,
      language: mod.language || "en",
      content: mod.content || { sections: [] },
    });
    setEditing(mod);
    setView("edit");
    setSaveMsg("");
  }

  // ── Section helpers ──
  function updateSection(idx, field, value) {
    const sections = [...(form.content?.sections || [])];
    sections[idx] = { ...sections[idx], [field]: value };
    setForm(f => ({ ...f, content: { ...f.content, sections } }));
  }

  function addSection() {
    const sections = [...(form.content?.sections || []), { heading: "", body: "", prompts: [] }];
    setForm(f => ({ ...f, content: { ...f.content, sections } }));
  }

  function removeSection(idx) {
    const sections = (form.content?.sections || []).filter((_, i) => i !== idx);
    setForm(f => ({ ...f, content: { ...f.content, sections } }));
  }

  function updatePrompts(idx, raw) {
    const prompts = raw.split("\n").map(s => s.trim()).filter(Boolean);
    updateSection(idx, "prompts", prompts);
  }

  const displayed = modules.filter(m => !filterCat || m.category === filterCat);

  // ── Form view ──
  if (view === "edit" || view === "create") {
    const sections = form.content?.sections || [];
    return (
      <div className="atk-wrap">
        <button className="atk-back-btn" onClick={() => { setView("list"); setEditing(null); }}>
          ← Back to Toolkit
        </button>

        <h1 className="atk-title">{view === "edit" ? "Edit Module" : "Create Module"}</h1>

        <div className="atk-form-card">
          <div className="atk-form-row">
            <div className="atk-field">
              <label>Title *</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. 1:1 Meeting Preparation Guide"
              />
            </div>
            <div className="atk-field atk-field--sm">
              <label>Category *</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{CAT_META[c]?.icon} {c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="atk-field atk-field--xs">
              <label>Language</label>
              <select value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
                <option value="en">EN</option>
                <option value="sw">SW</option>
                <option value="fr">FR</option>
              </select>
            </div>
          </div>

          <div className="atk-sections-label">
            Sections
            <button className="atk-add-section-btn" onClick={addSection}>+ Add Section</button>
          </div>

          {sections.map((sec, idx) => (
            <div key={idx} className="atk-section-card">
              <div className="atk-section-header">
                <span className="atk-section-num">{idx + 1}</span>
                <button className="atk-remove-section" onClick={() => removeSection(idx)} title="Remove section">✕</button>
              </div>
              <div className="atk-field">
                <label>Heading</label>
                <input
                  value={sec.heading}
                  onChange={e => updateSection(idx, "heading", e.target.value)}
                  placeholder="e.g. Before the Meeting"
                />
              </div>
              <div className="atk-field">
                <label>Body</label>
                <textarea
                  rows={3}
                  value={sec.body}
                  onChange={e => updateSection(idx, "body", e.target.value)}
                  placeholder="Describe what the manager should do or know in this section."
                />
              </div>
              <div className="atk-field">
                <label>Suggested Prompts <span className="atk-hint">(one per line)</span></label>
                <textarea
                  rows={3}
                  value={(sec.prompts || []).join("\n")}
                  onChange={e => updatePrompts(idx, e.target.value)}
                  placeholder={"How are you feeling this week?\nWhat's blocking you right now?"}
                />
              </div>
            </div>
          ))}

          {sections.length === 0 && (
            <div className="atk-no-sections">No sections yet. <button className="atk-link" onClick={addSection}>Add one →</button></div>
          )}
        </div>

        {saveMsg && (
          <div className={`atk-save-msg ${saveMsg.startsWith("✅") ? "success" : "error"}`}>{saveMsg}</div>
        )}

        <div className="atk-form-actions">
          <button className="atk-save-btn" onClick={saveModule} disabled={saving || !form.title.trim()}>
            {saving ? "Saving…" : view === "edit" ? "💾 Save Changes" : "✅ Create Module"}
          </button>
          <button className="atk-cancel-btn" onClick={() => { setView("list"); setEditing(null); }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="atk-wrap">
      <div className="atk-header">
        <div>
          <h1 className="atk-title">HR Toolkit</h1>
          <p className="atk-sub">Manage playbooks and conversation frameworks available to managers.</p>
        </div>
        <div className="atk-header-actions">
          <button className="atk-seed-btn" onClick={seedDefaults} disabled={seeding}>
            {seeding ? "Seeding…" : "⚡ Seed Defaults"}
          </button>
          <button className="atk-create-btn" onClick={openCreate}>+ New Module</button>
        </div>
      </div>

      {seedMsg && <div className={`atk-seed-msg ${seedMsg.startsWith("✅") ? "success" : ""}`}>{seedMsg}</div>}

      {/* Category pills */}
      <div className="atk-filters">
        <button
          className={`atk-chip ${!filterCat ? "active" : ""}`}
          onClick={() => setFilterCat("")}
        >✦ All</button>
        {CATEGORIES.map(c => (
          <button
            key={c}
            className={`atk-chip ${filterCat === c ? "active" : ""}`}
            onClick={() => setFilterCat(c)}
            style={filterCat === c ? { color: CAT_META[c]?.color, borderColor: CAT_META[c]?.color + "55" } : {}}
          >
            {CAT_META[c]?.icon} {c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="atk-stats">
        <div className="atk-stat">
          <div className="atk-stat-val">{modules.length}</div>
          <div className="atk-stat-label">Total Modules</div>
        </div>
        <div className="atk-stat">
          <div className="atk-stat-val">{modules.filter(m => m.is_active).length}</div>
          <div className="atk-stat-label">Active</div>
        </div>
        <div className="atk-stat">
          <div className="atk-stat-val">{modules.filter(m => !m.org_id).length}</div>
          <div className="atk-stat-label">Platform Default</div>
        </div>
        <div className="atk-stat">
          <div className="atk-stat-val">{modules.filter(m => m.org_id).length}</div>
          <div className="atk-stat-label">Custom</div>
        </div>
      </div>

      {loading ? (
        <div className="atk-loading"><div className="atk-ring" /><span>Loading…</span></div>
      ) : displayed.length === 0 ? (
        <div className="atk-empty">
          <div className="atk-empty-icon">🛠️</div>
          <p>No toolkit modules yet.</p>
          <button className="atk-seed-btn" onClick={seedDefaults} disabled={seeding} style={{ marginTop: 12 }}>
            ⚡ Seed Default Modules
          </button>
        </div>
      ) : (
        <div className="atk-table">
          <div className="atk-table-head">
            <span>Module</span>
            <span>Category</span>
            <span>Sections</span>
            <span>Version</span>
            <span>Type</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {displayed.map(m => {
            const cat = CAT_META[m.category] || { icon: "✦", color: "#9ca3af" };
            const sections = m.content?.sections?.length || 0;
            return (
              <div key={m.id} className={`atk-table-row ${!m.is_active ? "atk-inactive" : ""}`}>
                <span className="atk-col-title">
                  <span className="atk-col-icon" style={{ color: cat.color }}>{cat.icon}</span>
                  <span>{m.title}</span>
                </span>
                <span>
                  <span className="atk-cat-pill" style={{ color: cat.color, background: cat.color + "18" }}>
                    {m.category}
                  </span>
                </span>
                <span className="atk-muted">{sections}</span>
                <span className="atk-muted">v{m.version}</span>
                <span>
                  <span className={`atk-type-badge ${m.org_id ? "custom" : "platform"}`}>
                    {m.org_id ? "Custom" : "Platform"}
                  </span>
                </span>
                <span>
                  <button
                    className={`atk-toggle ${m.is_active ? "active" : "inactive"}`}
                    onClick={() => toggleActive(m)}
                    title={m.is_active ? "Deactivate" : "Activate"}
                  >
                    {m.is_active ? "Active" : "Inactive"}
                  </button>
                </span>
                <span className="atk-actions">
                  <button className="atk-btn-edit" onClick={() => openEdit(m)}>Edit</button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
