// CoachingSessionForm.jsx
// Sprint 3 — Rafiki HR | Replaces free-form chat log in manager coaching tab
// Imports authFetch and API from ../api.js

import { useState, useEffect } from "react";
import { authFetch, API } from "../api.js";

const OUTCOMES = [
  { value: "resolved",   label: "✅ Resolved",       color: "#34d399" },
  { value: "ongoing",    label: "🔄 Ongoing",         color: "#fbbf24" },
  { value: "escalated",  label: "⚠️ Escalated",       color: "#f87171" },
  { value: "follow_up",  label: "📅 Follow-up needed", color: "#3b82f6" },
];

const defaultForm = {
  employee_id: "",
  concern: "",
  notes: "",
  action_items: [],
  outcome: "",
  follow_up_date: "",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function ActionItemRow({ item, index, onChange, onRemove }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 160px 40px",
      gap: "8px",
      alignItems: "center",
      padding: "10px 12px",
      background: "rgba(139,92,246,0.06)",
      borderRadius: "8px",
      border: "1px solid rgba(139,92,246,0.15)",
    }}>
      <input
        value={item.text}
        onChange={e => onChange(index, "text", e.target.value)}
        placeholder="Action item description…"
        style={inputStyle}
      />
      <input
        type="date"
        value={item.due_date}
        onChange={e => onChange(index, "due_date", e.target.value)}
        style={{ ...inputStyle, fontSize: "13px" }}
      />
      <button onClick={() => onRemove(index)} style={iconBtnStyle} title="Remove">
        ✕
      </button>
    </div>
  );
}

function SessionCard({ session, employees, onEdit }) {
  const emp = employees.find(e => e.user_id === session.employee_id);
  // TeamMemberResponse field is `name`, not `full_name`
  const outcome = OUTCOMES.find(o => o.value === session.outcome);
  const date = new Date(session.created_at).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e8e3f0",
      borderRadius: "12px",
      padding: "18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      boxShadow: "0 2px 8px rgba(139,92,246,0.07)",
      transition: "box-shadow 0.2s",
      cursor: "pointer",
    }}
    onClick={() => onEdit(session)}
    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(139,92,246,0.14)"}
    onMouseLeave={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(139,92,246,0.07)"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "Playfair Display, serif", fontSize: "15px", fontWeight: 600, color: "#1a1a2e" }}>
            {emp?.name || "Unknown employee"}
          </div>
          <div style={{ fontSize: "12px", color: "#8b7fa8", marginTop: "2px" }}>{date}</div>
        </div>
        {outcome && (
          <span style={{
            fontSize: "12px",
            fontFamily: "Source Sans 3, sans-serif",
            background: outcome.color + "20",
            color: outcome.color,
            border: `1px solid ${outcome.color}40`,
            borderRadius: "20px",
            padding: "3px 10px",
            fontWeight: 600,
          }}>
            {outcome.label}
          </span>
        )}
      </div>
      <div style={{ fontSize: "14px", color: "#3d3550", lineHeight: 1.5, fontFamily: "Source Sans 3, sans-serif" }}>
        <strong style={{ color: "#8b5cf6" }}>Concern:</strong> {session.concern}
      </div>
      {session.action_items?.length > 0 && (
        <div style={{ fontSize: "12px", color: "#8b7fa8" }}>
          {session.action_items.length} action item{session.action_items.length !== 1 ? "s" : ""}
          {session.follow_up_date ? ` · Follow-up ${new Date(session.follow_up_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : ""}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CoachingSessionForm({ prefillData = null, onSessionSaved }) {
  const [form, setForm] = useState(prefillData ? { ...defaultForm, ...prefillData } : defaultForm);
  const [sessions, setSessions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [newActionText, setNewActionText] = useState("");
  const [view, setView] = useState("list"); // "list" | "form"

  // ── Data fetching ──
  useEffect(() => {
    fetchSessions();
    fetchEmployees();
  }, []);

  // If parent passes prefillData (from AI "Save as Session"), open form
  useEffect(() => {
    if (prefillData && Object.keys(prefillData).length > 0) {
      setForm(f => ({ ...f, ...prefillData }));
      setEditingId(null);
      setView("form");
    }
  }, [prefillData]);

  async function fetchSessions() {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/coaching/`);
      if (!res.ok) throw new Error("Failed to load sessions");
      const data = await res.json();
      setSessions(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchEmployees() {
    try {
      const res = await authFetch(`${API}/manager/team`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      // TeamMemberResponse uses `name` (not `full_name`)
      setEmployees(data);
    } catch {}
  }

  // ── Form helpers ──
  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function addActionItem() {
    if (!newActionText.trim()) return;
    setForm(f => ({
      ...f,
      action_items: [...f.action_items, { text: newActionText.trim(), due_date: "", completed: false }],
    }));
    setNewActionText("");
  }

  function updateActionItem(index, key, value) {
    setForm(f => {
      const items = [...f.action_items];
      items[index] = { ...items[index], [key]: value };
      return { ...f, action_items: items };
    });
  }

  function removeActionItem(index) {
    setForm(f => ({ ...f, action_items: f.action_items.filter((_, i) => i !== index) }));
  }

  function openEdit(session) {
    setForm({
      employee_id: session.employee_id,
      concern: session.concern,
      notes: session.notes || "",
      action_items: session.action_items || [],
      outcome: session.outcome || "",
      follow_up_date: session.follow_up_date || "",
    });
    setEditingId(session.id);
    setView("form");
  }

  function resetForm() {
    setForm(defaultForm);
    setEditingId(null);
    setError(null);
    setSuccess(false);
    setView("list");
  }

  // ── CRUD ──
  async function handleSubmit() {
    if (!form.employee_id) { setError("Please select an employee."); return; }
    if (!form.concern.trim()) { setError("Please describe the concern."); return; }

    setSaving(true);
    setError(null);
    try {
      const url = editingId
        ? `${API}/coaching/${editingId}`
        : `${API}/coaching/`;
      const method = editingId ? "PUT" : "POST";

      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Save failed");
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      fetchSessions();
      if (onSessionSaved) onSessionSaved();
      resetForm();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingId) return;
    if (!window.confirm("Delete this coaching session? This cannot be undone.")) return;
    try {
      const res = await authFetch(`${API}/coaching/${editingId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      fetchSessions();
      resetForm();
    } catch (e) {
      setError(e.message);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "Source Sans 3, sans-serif",
      color: "#1a1a2e",
      maxWidth: "800px",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "24px",
      }}>
        <div>
          <h2 style={{
            fontFamily: "Playfair Display, serif",
            fontSize: "22px",
            fontWeight: 700,
            color: "#1a1a2e",
            margin: 0,
            background: "linear-gradient(135deg,#8b5cf6 0%,#1fbfb8 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            Coaching Sessions
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#8b7fa8" }}>
            {view === "list"
              ? `${sessions.length} session${sessions.length !== 1 ? "s" : ""} recorded`
              : editingId ? "Edit session" : "New session"}
          </p>
        </div>
        {view === "list" ? (
          <button onClick={() => setView("form")} style={primaryBtnStyle}>
            + New Session
          </button>
        ) : (
          <button onClick={resetForm} style={ghostBtnStyle}>
            ← Back to list
          </button>
        )}
      </div>

      {/* Session list */}
      {view === "list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {loading && <LoadingSpinner />}
          {!loading && sessions.length === 0 && (
            <EmptyState onNew={() => setView("form")} />
          )}
          {sessions.map(s => (
            <SessionCard key={s.id} session={s} employees={employees} onEdit={openEdit} />
          ))}
        </div>
      )}

      {/* Session form */}
      {view === "form" && (
        <div style={{
          background: "#fff",
          borderRadius: "12px",
          border: "1px solid #e8e3f0",
          padding: "28px",
          boxShadow: "0 4px 20px rgba(139,92,246,0.08)",
        }}>

          {/* Employee select */}
          <FormSection label="Employee" required>
            <select
              value={form.employee_id}
              onChange={e => setField("employee_id", e.target.value)}
              style={{ ...inputStyle, color: form.employee_id ? "#1a1a2e" : "#9ca3af" }}
            >
              <option value="">Select team member…</option>
              {employees.map(e => (
                <option key={e.user_id} value={e.user_id}>{e.name}</option>
              ))}
            </select>
          </FormSection>

          {/* Concern */}
          <FormSection label="Concern" required hint="Brief description of what prompted this session">
            <textarea
              value={form.concern}
              onChange={e => setField("concern", e.target.value)}
              placeholder="Describe the concern or topic discussed…"
              rows={3}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
            />
          </FormSection>

          {/* Notes */}
          <FormSection label="Session notes" hint="Observations, context, and discussion summary">
            <textarea
              value={form.notes}
              onChange={e => setField("notes", e.target.value)}
              placeholder="Key points from the conversation…"
              rows={4}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
            />
          </FormSection>

          {/* Action items */}
          <FormSection label="Action items">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {form.action_items.map((item, i) => (
                <ActionItemRow
                  key={i} item={item} index={i}
                  onChange={updateActionItem}
                  onRemove={removeActionItem}
                />
              ))}
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <input
                  value={newActionText}
                  onChange={e => setNewActionText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addActionItem())}
                  placeholder="Add action item… (press Enter)"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={addActionItem} style={secondaryBtnStyle}>Add</button>
              </div>
            </div>
          </FormSection>

          {/* Outcome */}
          <FormSection label="Outcome">
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {OUTCOMES.map(o => (
                <button
                  key={o.value}
                  onClick={() => setField("outcome", form.outcome === o.value ? "" : o.value)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "20px",
                    border: `1.5px solid ${form.outcome === o.value ? o.color : "#e2d9f3"}`,
                    background: form.outcome === o.value ? o.color + "18" : "#fff",
                    color: form.outcome === o.value ? o.color : "#6b5c8a",
                    fontSize: "13px",
                    fontFamily: "Source Sans 3, sans-serif",
                    fontWeight: form.outcome === o.value ? 700 : 400,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </FormSection>

          {/* Follow-up date */}
          <FormSection label="Follow-up date" hint="Optional — set a reminder to check in">
            <input
              type="date"
              value={form.follow_up_date}
              onChange={e => setField("follow_up_date", e.target.value)}
              style={{ ...inputStyle, maxWidth: "220px" }}
            />
          </FormSection>

          {/* Feedback */}
          {error && (
            <div style={{
              padding: "12px 16px", borderRadius: "8px",
              background: "#fef2f2", border: "1px solid #fca5a5",
              color: "#dc2626", fontSize: "14px", marginBottom: "16px",
            }}>
              ⚠️ {error}
            </div>
          )}
          {success && (
            <div style={{
              padding: "12px 16px", borderRadius: "8px",
              background: "#f0fdf4", border: "1px solid #86efac",
              color: "#16a34a", fontSize: "14px", marginBottom: "16px",
            }}>
              ✅ Session saved successfully
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", paddingTop: "8px" }}>
            {editingId && (
              <button onClick={handleDelete} style={dangerBtnStyle}>
                Delete
              </button>
            )}
            <button onClick={resetForm} style={ghostBtnStyle}>Cancel</button>
            <button onClick={handleSubmit} disabled={saving} style={primaryBtnStyle}>
              {saving ? "Saving…" : editingId ? "Update session" : "Save session"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function FormSection({ label, required, hint, children }) {
  return (
    <div style={{ marginBottom: "22px" }}>
      <label style={{
        display: "block",
        fontSize: "13px",
        fontWeight: 700,
        color: "#6b5c8a",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: "6px",
      }}>
        {label}{required && <span style={{ color: "#8b5cf6", marginLeft: "3px" }}>*</span>}
      </label>
      {hint && <p style={{ fontSize: "12px", color: "#a89fc0", margin: "0 0 8px" }}>{hint}</p>}
      {children}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div style={{ textAlign: "center", padding: "40px", color: "#8b7fa8" }}>
      <div style={{
        width: "32px", height: "32px", margin: "0 auto 12px",
        border: "3px solid #e8e3f0",
        borderTopColor: "#8b5cf6",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      Loading sessions…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyState({ onNew }) {
  return (
    <div style={{
      textAlign: "center", padding: "60px 20px",
      background: "rgba(139,92,246,0.03)",
      borderRadius: "12px",
      border: "2px dashed #e2d9f3",
    }}>
      <div style={{ fontSize: "40px", marginBottom: "16px" }}>🤝</div>
      <div style={{ fontFamily: "Playfair Display, serif", fontSize: "18px", color: "#3d3550", marginBottom: "8px" }}>
        No coaching sessions yet
      </div>
      <div style={{ fontSize: "14px", color: "#8b7fa8", marginBottom: "20px" }}>
        Sessions saved here will also appear on each employee's profile timeline.
      </div>
      <button onClick={onNew} style={primaryBtnStyle}>Start your first session</button>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1.5px solid #e2d9f3",
  fontSize: "14px",
  fontFamily: "Source Sans 3, sans-serif",
  color: "#1a1a2e",
  background: "#faf9ff",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

const primaryBtnStyle = {
  padding: "10px 22px",
  borderRadius: "8px",
  border: "none",
  background: "linear-gradient(135deg,#8b5cf6 0%,#1fbfb8 100%)",
  color: "#fff",
  fontSize: "14px",
  fontFamily: "Source Sans 3, sans-serif",
  fontWeight: 700,
  cursor: "pointer",
  transition: "opacity 0.15s",
};

const secondaryBtnStyle = {
  padding: "10px 16px",
  borderRadius: "8px",
  border: "1.5px solid #8b5cf6",
  background: "transparent",
  color: "#8b5cf6",
  fontSize: "14px",
  fontFamily: "Source Sans 3, sans-serif",
  fontWeight: 600,
  cursor: "pointer",
};

const ghostBtnStyle = {
  padding: "10px 18px",
  borderRadius: "8px",
  border: "1.5px solid #e2d9f3",
  background: "transparent",
  color: "#6b5c8a",
  fontSize: "14px",
  fontFamily: "Source Sans 3, sans-serif",
  cursor: "pointer",
};

const dangerBtnStyle = {
  padding: "10px 18px",
  borderRadius: "8px",
  border: "1.5px solid #f87171",
  background: "transparent",
  color: "#f87171",
  fontSize: "14px",
  fontFamily: "Source Sans 3, sans-serif",
  cursor: "pointer",
};

const iconBtnStyle = {
  width: "32px", height: "32px",
  borderRadius: "6px",
  border: "1px solid #e2d9f3",
  background: "transparent",
  color: "#a89fc0",
  cursor: "pointer",
  fontSize: "12px",
  display: "flex", alignItems: "center", justifyContent: "center",
};
