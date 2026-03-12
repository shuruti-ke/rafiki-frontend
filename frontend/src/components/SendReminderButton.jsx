// frontend/src/components/SendReminderButton.jsx
// Drop this into your announcement detail/admin page.
// Usage: <SendReminderButton announcementId={ann.id} readCount={ann.read_count} totalCount={ann.total_recipients} />

import { useState } from "react";
import { API, authFetch } from "../api.js";

export default function SendReminderButton({ announcementId, readCount, totalCount }) {
  const [status,  setStatus]  = useState("idle");   // idle | loading | success | error
  const [result,  setResult]  = useState(null);

  const unreadCount = totalCount != null ? totalCount - (readCount || 0) : null;

  const handleRemind = async () => {
    if (!confirm(`Send a reminder to ${unreadCount != null ? unreadCount : "all unread"} employee(s)?`)) return;

    setStatus("loading");
    setResult(null);

    try {
      const res = await authFetch(`${API}/api/v1/announcements/${announcementId}/remind`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setStatus("success");
        setResult(data.message);
        // Auto-reset after 4s
        setTimeout(() => setStatus("idle"), 4000);
      } else {
        setStatus("error");
        setResult(data.detail || "Failed to send reminder");
      }
    } catch (err) {
      setStatus("error");
      setResult("Network error — please try again");
    }
  };

  return (
    <div className="srb-wrapper" style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: "0.3rem" }}>
      <button
        className={`srb-btn srb-btn--${status}`}
        onClick={handleRemind}
        disabled={status === "loading" || status === "success"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.45rem 1rem",
          borderRadius: "6px",
          border: "none",
          fontFamily: "inherit",
          fontSize: "0.875rem",
          fontWeight: 600,
          cursor: status === "loading" || status === "success" ? "default" : "pointer",
          transition: "background 0.2s, opacity 0.2s",
          background:
            status === "success" ? "#10b981"
            : status === "error"   ? "#ef4444"
            : "#8b5cf6",
          color: "#fff",
          opacity: status === "loading" ? 0.7 : 1,
        }}
      >
        {status === "loading" && (
          <span style={{ display: "inline-block", width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "srb-spin 0.7s linear infinite" }} />
        )}
        {status === "idle"    && "🔔 Send Reminder"}
        {status === "loading" && "Sending…"}
        {status === "success" && "✓ Sent"}
        {status === "error"   && "Retry"}
        {unreadCount != null && status === "idle" && (
          <span style={{ background: "rgba(255,255,255,0.25)", borderRadius: "10px", padding: "1px 7px", fontSize: "0.78rem" }}>
            {unreadCount} unread
          </span>
        )}
      </button>

      {result && status !== "idle" && (
        <span style={{
          fontSize: "0.78rem",
          color: status === "success" ? "#10b981" : "#ef4444",
          paddingLeft: "2px",
        }}>
          {result}
        </span>
      )}

      <style>{`
        @keyframes srb-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
