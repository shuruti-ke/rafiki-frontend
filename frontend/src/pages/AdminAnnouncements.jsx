import { useEffect, useState } from "react";
import { API, authFetch, authFetch } from "../api.js";
import "./AdminAnnouncements.css";
const PRIORITIES = ["low", "normal", "high", "urgent"];

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [reads, setReads] = useState([]);
  const [trainingStatus, setTrainingStatus] = useState([]);

  // Create form
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isTraining, setIsTraining] = useState(false);
  const [priority, setPriority] = useState("normal");
  const [creating, setCreating] = useState(false);

  async function fetchAnnouncements() {
    const res = await authFetch(`${API}/api/v1/announcements/`);
    const data = await res.json();
    setAnnouncements(data);
  }

  useEffect(() => { fetchAnnouncements(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!title || !content) return;
    setCreating(true);
    try {
      const res = await authFetch(`${API}/api/v1/announcements/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, is_training: isTraining, priority }),
      });
      if (res.ok) {
        setShowCreate(false);
        setTitle(""); setContent(""); setIsTraining(false); setPriority("normal");
        fetchAnnouncements();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handlePublish(id) {
    await authFetch(`${API}/api/v1/announcements/${id}/publish`, { method: "POST" });
    fetchAnnouncements();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this announcement?")) return;
    await authFetch(`${API}/api/v1/announcements/${id}`, { method: "DELETE" });
    setSelected(null);
    fetchAnnouncements();
  }

  async function handleSelect(ann) {
    setSelected(ann);
    const [readsRes, trainingRes] = await Promise.all([
      fetch(`${API}/api/v1/announcements/${ann.id}/reads`),
      fetch(`${API}/api/v1/announcements/${ann.id}/training-status`),
    ]);
    setReads(await readsRes.json());
    setTrainingStatus(await trainingRes.json());
  }

  async function handleAssignTraining(annId) {
    const idsStr = prompt("Enter comma-separated user IDs to assign:");
    if (!idsStr) return;
    const userIds = idsStr.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
    if (userIds.length === 0) return;

    await authFetch(`${API}/api/v1/announcements/${annId}/assign-training`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_ids: userIds }),
    });

    if (selected) handleSelect(selected);
  }

  return (
    <div className="ann-page">
      <div className="ann-header">
        <h1>Announcements</h1>
        <button className="btn btnPrimary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "Create Announcement"}
        </button>
      </div>

      {showCreate && (
        <form className="ann-form" onSubmit={handleCreate}>
          <input
            type="text" placeholder="Title *" value={title}
            onChange={(e) => setTitle(e.target.value)} required
          />
          <textarea
            placeholder="Content *" value={content}
            onChange={(e) => setContent(e.target.value)} required
          />
          <div className="ann-form-row">
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="ann-checkbox">
              <input type="checkbox" checked={isTraining} onChange={(e) => setIsTraining(e.target.checked)} />
              Training Material
            </label>
          </div>
          <button className="btn btnPrimary" type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      <div className="ann-grid">
        <div className="ann-list">
          {announcements.length === 0 ? (
            <div className="ann-empty">No announcements yet.</div>
          ) : (
            announcements.map((ann) => (
              <div
                key={ann.id}
                className={`ann-card ${selected?.id === ann.id ? "ann-card-active" : ""}`}
                onClick={() => handleSelect(ann)}
              >
                <div className="ann-card-top">
                  <strong>{ann.title}</strong>
                  <span className={`ann-priority ann-priority-${ann.priority}`}>{ann.priority}</span>
                </div>
                <div className="ann-card-meta">
                  {ann.published_at ? (
                    <span className="ann-published">Published {new Date(ann.published_at).toLocaleDateString()}</span>
                  ) : (
                    <span className="ann-draft">Draft</span>
                  )}
                  {ann.is_training && <span className="ann-training-badge">Training</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {selected && (
          <div className="ann-detail">
            <h2>{selected.title}</h2>
            <p className="ann-detail-content">{selected.content}</p>

            <div className="ann-detail-actions">
              {!selected.published_at && (
                <button className="btn btnPrimary" onClick={() => handlePublish(selected.id)}>Publish</button>
              )}
              {selected.is_training && (
                <button className="btn" onClick={() => handleAssignTraining(selected.id)}>Assign Training</button>
              )}
              <button className="btn miniBtnDanger" onClick={() => handleDelete(selected.id)}>Delete</button>
            </div>

            <div className="ann-section">
              <h3>Read Receipts ({reads.length})</h3>
              {reads.length === 0 ? <p className="ann-muted">No reads yet.</p> : (
                <div className="ann-receipt-list">
                  {reads.map((r) => (
                    <div key={r.id} className="ann-receipt">
                      User #{r.user_id} — {new Date(r.read_at).toLocaleString()}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selected.is_training && (
              <div className="ann-section">
                <h3>Training Status ({trainingStatus.length})</h3>
                {trainingStatus.length === 0 ? <p className="ann-muted">No assignments.</p> : (
                  <div className="ann-receipt-list">
                    {trainingStatus.map((t) => (
                      <div key={t.id} className="ann-receipt">
                        User #{t.user_id} —
                        {t.completed_at ? (
                          <span className="ann-completed"> Completed {new Date(t.completed_at).toLocaleDateString()}</span>
                        ) : (
                          <span className="ann-pending"> Pending{t.due_date ? ` (due ${new Date(t.due_date).toLocaleDateString()})` : ""}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
