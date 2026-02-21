import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./ObjectivesPage.css";

const STATUSES = ["all", "draft", "active", "pending_review", "completed"];
const STATUS_LABELS = { all: "All", draft: "Draft", active: "Active", pending_review: "Pending Review", completed: "Completed" };

export default function ObjectivesPage() {
  const [objectives, setObjectives] = useState([]);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", target_date: "" });
  const [krDrafts, setKrDrafts] = useState([{ title: "", target_value: 100, current_value: 0, unit: "%" }]);

  const load = async () => {
    const url = filter === "all" ? `${API}/api/v1/objectives/` : `${API}/api/v1/objectives/?status=${filter}`;
    const res = await authFetch(url);
    if (res.ok) setObjectives(await res.json());
  };

  useEffect(() => { load(); }, [filter]);

  const handleCreate = async () => {
    const body = {
      title: form.title,
      description: form.description || null,
      target_date: form.target_date || null,
      key_results: krDrafts.filter(k => k.title.trim()),
    };
    const res = await authFetch(`${API}/api/v1/objectives/`, { method: "POST", body: JSON.stringify(body) });
    if (res.ok) {
      setShowForm(false);
      setForm({ title: "", description: "", target_date: "" });
      setKrDrafts([{ title: "", target_value: 100, current_value: 0, unit: "%" }]);
      load();
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this objective?")) return;
    await authFetch(`${API}/api/v1/objectives/${id}`, { method: "DELETE" });
    setSelected(null);
    load();
  };

  const handleSubmitReview = async (id) => {
    const res = await authFetch(`${API}/api/v1/objectives/${id}/submit-review`, { method: "POST" });
    if (res.ok) { load(); setSelected(await res.json()); }
  };

  const handleUpdateKR = async (objId, krId, value) => {
    const res = await authFetch(`${API}/api/v1/objectives/${objId}/key-results/${krId}`, {
      method: "PUT", body: JSON.stringify({ current_value: parseFloat(value) || 0 }),
    });
    if (res.ok) {
      const obj = await authFetch(`${API}/api/v1/objectives/${objId}`);
      if (obj.ok) { const data = await obj.json(); setSelected(data); load(); }
    }
  };

  const handleAddKR = async (objId) => {
    const res = await authFetch(`${API}/api/v1/objectives/${objId}/key-results`, {
      method: "POST", body: JSON.stringify({ title: "New Key Result", target_value: 100, current_value: 0, unit: "%" }),
    });
    if (res.ok) {
      const obj = await authFetch(`${API}/api/v1/objectives/${objId}`);
      if (obj.ok) { const data = await obj.json(); setSelected(data); load(); }
    }
  };

  const handleDeleteKR = async (objId, krId) => {
    await authFetch(`${API}/api/v1/objectives/${objId}/key-results/${krId}`, { method: "DELETE" });
    const obj = await authFetch(`${API}/api/v1/objectives/${objId}`);
    if (obj.ok) { const data = await obj.json(); setSelected(data); load(); }
  };

  return (
    <div className="obj-page">
      <div className="obj-header">
        <h2>My Objectives</h2>
        <button className="btn btnPrimary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "New Objective"}
        </button>
      </div>

      {showForm && (
        <div className="obj-form">
          <h3>Create Objective</h3>
          <div className="obj-form-row">
            <label>Title</label>
            <input className="search" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="What do you want to achieve?" />
          </div>
          <div className="obj-form-row">
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Add details..." rows={2} />
          </div>
          <div className="obj-form-row">
            <label>Target Date</label>
            <input type="date" value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })} />
          </div>
          <div className="obj-kr-editor">
            <h4>Key Results</h4>
            {krDrafts.map((kr, i) => (
              <div key={i} className="obj-kr-editor-row">
                <input className="search" placeholder="Key result title" value={kr.title} onChange={e => { const u = [...krDrafts]; u[i].title = e.target.value; setKrDrafts(u); }} />
                <input className="obj-kr-input" type="number" placeholder="Target" value={kr.target_value} onChange={e => { const u = [...krDrafts]; u[i].target_value = parseFloat(e.target.value) || 0; setKrDrafts(u); }} />
                <input className="obj-kr-input" placeholder="Unit" value={kr.unit} onChange={e => { const u = [...krDrafts]; u[i].unit = e.target.value; setKrDrafts(u); }} style={{ width: 60 }} />
                <button className="obj-kr-remove" onClick={() => setKrDrafts(krDrafts.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button className="btn btnTiny" onClick={() => setKrDrafts([...krDrafts, { title: "", target_value: 100, current_value: 0, unit: "%" }])}>+ Add Key Result</button>
          </div>
          <div className="obj-form-actions">
            <button className="btn btnPrimary" onClick={handleCreate} disabled={!form.title.trim()}>Create Objective</button>
            <button className="btn btnGhost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="obj-filters">
        {STATUSES.map(s => (
          <button key={s} className={`obj-filter-btn${filter === s ? " active" : ""}`} onClick={() => { setFilter(s); setSelected(null); }}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="obj-list">
        {objectives.length === 0 && <div className="obj-empty">No objectives yet. Create one to get started!</div>}
        {objectives.map(obj => (
          <div key={obj.id} className={`obj-card${selected?.id === obj.id ? " selected" : ""}`} onClick={() => setSelected(obj)}>
            <div className="obj-card-top">
              <span className="obj-card-title">{obj.title}</span>
              <span className={`obj-badge obj-badge-${obj.status}`}>{obj.status.replace("_", " ")}</span>
            </div>
            <div className="obj-card-meta">
              {obj.target_date && <span>Due: {obj.target_date}</span>}
              <span>{obj.key_results?.length || 0} key results</span>
              <span>{obj.progress}% complete</span>
            </div>
            <div className="obj-progress-track">
              <div className="obj-progress-fill" style={{ width: `${obj.progress}%` }} />
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="obj-detail">
          <h3>{selected.title}</h3>
          <div className="obj-card-meta" style={{ marginBottom: 4 }}>
            <span className={`obj-badge obj-badge-${selected.status}`}>{selected.status.replace("_", " ")}</span>
            {selected.target_date && <span>Due: {selected.target_date}</span>}
            <span>{selected.progress}%</span>
          </div>
          {selected.description && <div className="obj-detail-desc">{selected.description}</div>}

          {selected.review_status && (
            <div className="obj-review-info">
              <strong>Review: {selected.review_status.replace("_", " ")}</strong>
              {selected.review_notes && <div>{selected.review_notes}</div>}
            </div>
          )}

          <div className="obj-kr-list">
            {(selected.key_results || []).map(kr => (
              <div key={kr.id} className="obj-kr-item">
                <span className="obj-kr-title">{kr.title}</span>
                <input className="obj-kr-input" type="number" defaultValue={kr.current_value}
                  onBlur={e => { if (parseFloat(e.target.value) !== kr.current_value) handleUpdateKR(selected.id, kr.id, e.target.value); }}
                  onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                />
                <span className="obj-kr-unit">/ {kr.target_value} {kr.unit}</span>
                <button className="obj-kr-remove" onClick={() => handleDeleteKR(selected.id, kr.id)}>×</button>
              </div>
            ))}
          </div>

          <div className="obj-detail-actions">
            <button className="btn btnTiny" onClick={() => handleAddKR(selected.id)}>+ Key Result</button>
            {(selected.status === "draft" || selected.status === "active") && (
              <button className="btn btnTiny btnPrimary" onClick={() => handleSubmitReview(selected.id)}>Submit for Review</button>
            )}
            {(selected.status === "draft" || selected.status === "cancelled") && (
              <button className="btn btnTiny" style={{ color: "var(--danger)" }} onClick={() => handleDelete(selected.id)}>Delete</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
