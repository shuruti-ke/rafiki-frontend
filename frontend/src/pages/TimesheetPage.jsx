import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./TimesheetPage.css";

const CATEGORIES = ["Development","Meetings","Code Review","Documentation","Testing","Design","Research","Admin","Training","Support","Other"];

function fmtDate(d) { return d.toISOString().slice(0,10); }
function monday(d) { const dt = new Date(d); const day = dt.getDay(); const diff = dt.getDate() - day + (day===0?-6:1); dt.setDate(diff); return dt; }

export default function TimesheetPage() {
  const [weekStart, setWeekStart] = useState(monday(new Date()));
  const [entries, setEntries] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const loadEntries = async () => {
    const res = await authFetch(`${API}/api/v1/timesheets/?start=${fmtDate(weekStart)}&end=${fmtDate(weekEnd)}`);
    if (res.ok) setEntries(await res.json());
  };

  const loadSummary = async () => {
    const res = await authFetch(`${API}/api/v1/timesheets/summary/weekly?week_start=${fmtDate(weekStart)}`);
    if (res.ok) setSummary(await res.json());
  };

  const loadProjects = async () => {
    const res = await authFetch(`${API}/api/v1/timesheets/projects`);
    if (res.ok) setProjects(await res.json());
  };

  useEffect(() => { loadEntries(); loadSummary(); }, [weekStart.toISOString()]);
  useEffect(() => { loadProjects(); }, []);

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d); };
  const thisWeek = () => setWeekStart(monday(new Date()));

  const draftEntries = entries.filter(e => e.status === "draft");

  const handleDelete = async (id) => {
    if (!confirm("Delete this entry?")) return;
    const res = await authFetch(`${API}/api/v1/timesheets/${id}`, {method:"DELETE"});
    if (res.ok) { loadEntries(); loadSummary(); }
  };

  const handleSubmit = async () => {
    if (draftEntries.length === 0) return;
    const res = await authFetch(`${API}/api/v1/timesheets/submit`, {
      method:"POST", body: JSON.stringify({entry_ids: draftEntries.map(e=>e.id)}),
    });
    if (res.ok) { loadEntries(); loadSummary(); }
  };

  const openCreate = () => { setEditEntry(null); setShowModal(true); };
  const openEdit = (e) => { setEditEntry(e); setShowModal(true); };

  const weekLabel = `${weekStart.toLocaleDateString([],{month:"short",day:"numeric"})} – ${weekEnd.toLocaleDateString([],{month:"short",day:"numeric",year:"numeric"})}`;

  return (
    <div className="tsp-page">
      <div className="tsp-header">
        <h1>Timesheets</h1>
        <div style={{display:"flex",gap:"0.5rem"}}>
          <button className="tsp-btn tsp-btn-ghost" onClick={thisWeek}>This Week</button>
          <button className="tsp-btn tsp-btn-primary" onClick={openCreate}>+ Log Time</button>
        </div>
      </div>

      <div className="tsp-week-nav">
        <button onClick={prevWeek}>&lsaquo;</button>
        <div className="tsp-week-label">{weekLabel}</div>
        <button onClick={nextWeek}>&rsaquo;</button>
      </div>

      {summary && (
        <div className="tsp-kpis">
          <div className="tsp-kpi">
            <div className="tsp-kpi-value">{summary.total_hours || 0}</div>
            <div className="tsp-kpi-label">Hours This Week</div>
          </div>
          <div className="tsp-kpi">
            <div className="tsp-kpi-value">{summary.entries || 0}</div>
            <div className="tsp-kpi-label">Entries</div>
          </div>
          <div className="tsp-kpi">
            <div className="tsp-kpi-value">{Object.keys(summary.by_day||{}).length}</div>
            <div className="tsp-kpi-label">Days Logged</div>
          </div>
          <div className="tsp-kpi">
            <div className="tsp-kpi-value">{draftEntries.length}</div>
            <div className="tsp-kpi-label">Drafts</div>
          </div>
        </div>
      )}

      <div className="tsp-table-wrap">
        <table className="tsp-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Project</th>
              <th>Category</th>
              <th>Hours</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={6} className="tsp-empty">No entries this week. Click "Log Time" to start.</td></tr>
            )}
            {entries.map(e => (
              <tr key={e.id}>
                <td>{e.date}</td>
                <td>{e.project}</td>
                <td>{e.category}</td>
                <td>{Number(e.hours).toFixed(1)}</td>
                <td><span className={`tsp-status tsp-status-${e.status}`}>{e.status}</span></td>
                <td>
                  <div className="tsp-actions">
                    {(e.status === "draft" || e.status === "rejected") && (
                      <>
                        <button className="tsp-btn tsp-btn-ghost tsp-btn-sm" onClick={() => openEdit(e)}>Edit</button>
                        <button className="tsp-btn tsp-btn-ghost tsp-btn-sm" onClick={() => handleDelete(e.id)}>Del</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draftEntries.length > 0 && (
        <div className="tsp-submit-bar">
          <span>{draftEntries.length} draft{draftEntries.length!==1?"s":""} ready to submit</span>
          <button className="tsp-btn tsp-btn-primary" onClick={handleSubmit}>Submit All Drafts</button>
        </div>
      )}

      {showModal && (
        <EntryModal
          entry={editEntry}
          projects={projects}
          weekStart={weekStart}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadEntries(); loadSummary(); loadProjects(); }}
        />
      )}
    </div>
  );
}

function EntryModal({ entry, projects, weekStart, onClose, onSaved }) {
  const isEdit = !!entry;
  const defaultDate = entry?.date || fmtDate(new Date());
  const [date, setDate] = useState(defaultDate);
  const [project, setProject] = useState(entry?.project || "");
  const [newProject, setNewProject] = useState("");
  const [category, setCategory] = useState(entry?.category || "Development");
  const [hours, setHours] = useState(entry ? String(Number(entry.hours)) : "");
  const [description, setDescription] = useState(entry?.description || "");
  const [saving, setSaving] = useState(false);

  const effectiveProject = project === "__new" ? newProject : project;

  const handleSave = async () => {
    if (!effectiveProject.trim() || !hours) return;
    setSaving(true);
    const body = {
      date, project: effectiveProject.trim(), category,
      hours: parseFloat(hours), description,
    };
    const url = isEdit ? `${API}/api/v1/timesheets/${entry.id}` : `${API}/api/v1/timesheets/`;
    const method = isEdit ? "PUT" : "POST";
    const res = await authFetch(url, {method, body: JSON.stringify(body)});
    setSaving(false);
    if (res.ok) onSaved();
  };

  return (
    <div className="tsp-modal-overlay" onClick={onClose}>
      <div className="tsp-modal" onClick={e => e.stopPropagation()}>
        <h2>{isEdit ? "Edit Entry" : "Log Time"}</h2>

        <div className="tsp-form-row">
          <label>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <div className="tsp-form-row">
          <label>Project</label>
          <select value={project} onChange={e => setProject(e.target.value)}>
            <option value="">Select project...</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
            <option value="__new">+ New project</option>
          </select>
        </div>

        {project === "__new" && (
          <div className="tsp-form-row">
            <label>New Project Name</label>
            <input value={newProject} onChange={e => setNewProject(e.target.value)} placeholder="Project name" />
          </div>
        )}

        <div className="tsp-form-row">
          <label>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="tsp-form-row">
          <label>Hours</label>
          <input type="number" step="0.5" min="0.5" max="24" value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 2.5" />
        </div>

        <div className="tsp-form-row">
          <label>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What did you work on?" />
        </div>

        <div className="tsp-modal-actions">
          <button className="tsp-btn tsp-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="tsp-btn tsp-btn-primary" onClick={handleSave} disabled={saving || !effectiveProject.trim() || !hours}>
            {saving ? "Saving..." : isEdit ? "Update" : "Log"}
          </button>
        </div>
      </div>
    </div>
  );
}
