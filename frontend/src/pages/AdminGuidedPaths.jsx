import { useEffect, useState } from "react";
import { API, authFetch, authFetch } from "../api.js";
import "./AdminGuidedPaths.css";

const CATEGORIES = ["relaxation", "cbt", "workplace", "financial", "positive_psychology"];
const ICONS = ["lungs", "brain", "clock", "battery", "shield", "chat", "heart", "zap", "leaf", "wallet", "moon"];
const STEP_TYPES = ["intro", "prompt", "input", "reflection", "rating", "summary", "video", "audio"];
const INPUT_TYPES = [
  { value: "", label: "None" },
  { value: "free_text", label: "Free text" },
  { value: "rating_0_10", label: "Rating 0-10" },
];

function emptyStep() {
  return { type: "prompt", message: "", expected_input: "", safety_check: false, media_url: "" };
}

export default function AdminGuidedPaths() {
  const [modules, setModules] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingModule, setEditingModule] = useState(null); // null = create, object = edit

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState("relaxation");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [icon, setIcon] = useState("brain");
  const [triggers, setTriggers] = useState("");
  const [steps, setSteps] = useState([emptyStep()]);
  const [saving, setSaving] = useState(false);

  async function fetchModules() {
    const res = await authFetch(`${API}/api/v1/guided-paths/modules?active_only=false`);
    if (res.ok) setModules(await res.json());
  }

  useEffect(() => { fetchModules(); }, []);

  function resetForm() {
    setName(""); setCategory("relaxation"); setDescription("");
    setDurationMinutes(10); setIcon("brain"); setTriggers("");
    setSteps([emptyStep()]);
    setEditingModule(null);
  }

  function openCreate() {
    resetForm();
    setShowModal(true);
  }

  async function openEdit(mod) {
    // Fetch full detail with steps
    const res = await authFetch(`${API}/api/v1/guided-paths/modules/${mod.id}`);
    if (!res.ok) return;
    const detail = await res.json();
    setEditingModule(detail);
    setName(detail.name);
    setCategory(detail.category);
    setDescription(detail.description || "");
    setDurationMinutes(detail.duration_minutes);
    setIcon(detail.icon || "brain");
    setTriggers((detail.triggers || []).join(", "));
    setSteps(
      (detail.steps || []).map((s) => ({
        type: s.type || "prompt",
        message: s.message || "",
        expected_input: s.expected_input || "",
        safety_check: s.safety_check || false,
        media_url: s.media_url || "",
      }))
    );
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      category,
      description: description.trim() || null,
      duration_minutes: durationMinutes,
      icon,
      triggers: triggers.split(",").map((t) => t.trim()).filter(Boolean),
      safety_checks: steps.filter((s) => s.safety_check).map((s) => s.message.slice(0, 60)),
      steps: steps.map((s) => ({
        type: s.type,
        message: s.message,
        expected_input: s.expected_input || null,
        safety_check: s.safety_check,
        media_url: (s.type === "video" || s.type === "audio") ? (s.media_url || null) : null,
      })),
    };

    try {
      const url = editingModule
        ? `${API}/api/v1/guided-paths/admin/modules/${editingModule.id}`
        : `${API}/api/v1/guided-paths/admin/modules`;
      const method = editingModule ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowModal(false);
        resetForm();
        fetchModules();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(mod) {
    if (!confirm(`Deactivate "${mod.name}"? It will no longer be available to employees.`)) return;
    const res = await authFetch(`${API}/api/v1/guided-paths/admin/modules/${mod.id}`, { method: "DELETE" });
    if (res.ok) fetchModules();
  }

  // Step builder helpers
  function updateStep(index, field, value) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function removeStep(index) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function moveStep(index, direction) {
    setSteps((prev) => {
      const arr = [...prev];
      const target = index + direction;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  }

  return (
    <div className="agp-page">
      <div className="agp-header">
        <h1>Guided Paths</h1>
        <button className="btn btnPrimary" onClick={openCreate}>Create Module</button>
      </div>

      <table className="agp-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Type</th>
            <th>Status</th>
            <th>Steps</th>
            <th>Duration</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {modules.length === 0 ? (
            <tr><td colSpan={7} className="agp-empty">No modules yet. Create one to get started.</td></tr>
          ) : (
            modules.map((mod) => (
              <tr key={mod.id}>
                <td><strong>{mod.name}</strong></td>
                <td>{mod.category}</td>
                <td>
                  {mod.org_id ? (
                    <span className="agp-badge agp-badge-custom">Custom</span>
                  ) : (
                    <span className="agp-badge agp-badge-global">Global</span>
                  )}
                </td>
                <td>
                  {mod.is_active ? (
                    <span className="agp-badge agp-badge-active">Active</span>
                  ) : (
                    <span className="agp-badge agp-badge-inactive">Inactive</span>
                  )}
                </td>
                <td>{mod.steps?.length ?? "—"}</td>
                <td>{mod.duration_minutes} min</td>
                <td>
                  {mod.org_id ? (
                    <div className="agp-actions">
                      <button className="btn btnTiny" onClick={() => openEdit(mod)}>Edit</button>
                      {mod.is_active && (
                        <button className="btn btnTiny miniBtnDanger" onClick={() => handleDeactivate(mod)}>Deactivate</button>
                      )}
                    </div>
                  ) : (
                    <span className="agp-muted">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="agp-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="agp-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingModule ? "Edit Module" : "Create Module"}</h2>

            <form onSubmit={handleSave}>
              {/* Basic info */}
              <div className="agp-form-grid">
                <div className="agp-field">
                  <label>Name *</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="agp-field">
                  <label>Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="agp-field">
                  <label>Duration (min)</label>
                  <input type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
                </div>
                <div className="agp-field">
                  <label>Icon</label>
                  <select value={icon} onChange={(e) => setIcon(e.target.value)}>
                    {ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>

              <div className="agp-field">
                <label>Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="agp-field">
                <label>Triggers (comma-separated)</label>
                <input type="text" value={triggers} onChange={(e) => setTriggers(e.target.value)} placeholder="e.g. anxiety, stress, burnout" />
              </div>

              {/* Step builder */}
              <div className="agp-step-builder">
                <div className="agp-step-builder-header">
                  <h3>Steps</h3>
                  <button type="button" className="btn btnTiny" onClick={() => setSteps([...steps, emptyStep()])}>
                    + Add Step
                  </button>
                </div>

                {steps.map((step, idx) => (
                  <div key={idx} className="agp-step-item">
                    <div className="agp-step-num">{idx + 1}</div>
                    <div className="agp-step-fields">
                      <div className="agp-step-row">
                        <select value={step.type} onChange={(e) => updateStep(idx, "type", e.target.value)}>
                          {STEP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select value={step.expected_input} onChange={(e) => updateStep(idx, "expected_input", e.target.value)}>
                          {INPUT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <label className="agp-checkbox">
                          <input type="checkbox" checked={step.safety_check} onChange={(e) => updateStep(idx, "safety_check", e.target.checked)} />
                          Safety
                        </label>
                      </div>
                      <textarea
                        placeholder="Step message..."
                        value={step.message}
                        onChange={(e) => updateStep(idx, "message", e.target.value)}
                      />
                      {(step.type === "video" || step.type === "audio") && (
                        <input
                          type="url"
                          placeholder={step.type === "video" ? "YouTube / Vimeo URL" : "Audio file URL"}
                          value={step.media_url}
                          onChange={(e) => updateStep(idx, "media_url", e.target.value)}
                        />
                      )}
                    </div>
                    <div className="agp-step-actions">
                      <button type="button" title="Move up" disabled={idx === 0} onClick={() => moveStep(idx, -1)}>&uarr;</button>
                      <button type="button" title="Move down" disabled={idx === steps.length - 1} onClick={() => moveStep(idx, 1)}>&darr;</button>
                      <button type="button" title="Remove" className="miniBtnDanger" disabled={steps.length <= 1} onClick={() => removeStep(idx)}>&times;</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="agp-form-footer">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btnPrimary" disabled={saving}>
                  {saving ? "Saving..." : editingModule ? "Update Module" : "Create Module"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
