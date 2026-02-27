import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";
import "./EmployeeAnnouncements.css";

export default function EmployeeAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [readIds, setReadIds] = useState(new Set());
  const [trainingAssignments, setTrainingAssignments] = useState([]);

  async function fetchAnnouncements() {
    const res = await authFetch(`${API}/api/v1/announcements/`);
    const data = await res.json();
    // Only show published announcements
    setAnnouncements(data.filter((a) => a.published_at));
  }

  useEffect(() => { fetchAnnouncements(); }, []);

  async function handleSelect(ann) {
    // Auto-mark as read via GET detail endpoint
    const res = await authFetch(`${API}/api/v1/announcements/${ann.id}`);
    const data = await res.json();
    setSelected(data);
    setReadIds((prev) => new Set([...prev, ann.id]));

    // Fetch training status for this user
    if (ann.is_training) {
      const tRes = await authFetch(`${API}/api/v1/announcements/${ann.id}/training-status`);
      const tData = await tRes.json();
      setTrainingAssignments(tData);
    } else {
      setTrainingAssignments([]);
    }
  }

  async function handleCompleteTraining(annId) {
    await authFetch(`${API}/api/v1/announcements/${annId}/complete-training`, { method: "POST" });
    // Refresh
    if (selected) handleSelect(selected);
  }

  // Check if current user (demo user 1) has a pending training assignment
  function getMyAssignment(annId) {
    return trainingAssignments.find((t) => t.announcement_id === annId && t.user_id === 1);
  }

  return (
    <div className="ea-page">
      <h1>Announcements</h1>
      <p className="ea-subtitle">Stay updated with the latest company news and training.</p>

      <div className="ea-grid">
        <div className="ea-list">
          {announcements.length === 0 ? (
            <div className="ea-empty">No announcements.</div>
          ) : (
            announcements.map((ann) => (
              <div
                key={ann.id}
                className={`ea-card ${selected?.id === ann.id ? "ea-card-active" : ""} ${!readIds.has(ann.id) ? "ea-card-unread" : ""}`}
                onClick={() => handleSelect(ann)}
              >
                <div className="ea-card-top">
                  {!readIds.has(ann.id) && <span className="ea-unread-dot" />}
                  <strong>{ann.title}</strong>
                  <span className={`ea-priority ea-priority-${ann.priority}`}>{ann.priority}</span>
                </div>
                <div className="ea-card-meta">
                  <span>{new Date(ann.published_at).toLocaleDateString()}</span>
                  {ann.is_training && <span className="ea-training-badge">Training</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {selected && (
          <div className="ea-detail">
            <h2>{selected.title}</h2>
            <div className="ea-detail-meta">
              <span>{new Date(selected.published_at).toLocaleDateString()}</span>
              <span className={`ea-priority ea-priority-${selected.priority}`}>{selected.priority}</span>
            </div>
            <div className="ea-detail-content">{selected.content}</div>

            {selected.is_training && (() => {
              const myAssignment = getMyAssignment(selected.id);
              if (!myAssignment) return null;
              return (
                <div className="ea-training-section">
                  <h3>Training Assignment</h3>
                  {myAssignment.completed_at ? (
                    <p className="ea-completed">
                      Completed on {new Date(myAssignment.completed_at).toLocaleDateString()}
                    </p>
                  ) : (
                    <div>
                      <p className="ea-pending">
                        Not yet completed
                        {myAssignment.due_date && ` — Due: ${new Date(myAssignment.due_date).toLocaleDateString()}`}
                      </p>
                      <button className="btn btnPrimary" onClick={() => handleCompleteTraining(selected.id)}>
                        Mark as Complete
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
