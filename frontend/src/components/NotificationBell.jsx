/**
 * frontend/src/components/NotificationBell.jsx
 * Sprint 5 — Rafiki HR | Shared notification bell + slide-out panel
 *
 * Usage (drop into any layout topbar):
 *   import NotificationBell from "./NotificationBell.jsx";
 *   <NotificationBell />
 *
 * Polls GET /api/v1/notifications/unread-count every 60 s.
 * On bell click: fetches full list, opens panel.
 * Mark-read fires POST /api/v1/notifications/mark-read.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API, authFetch } from "../api.js";
import "./NotificationBell.css";

/* ── Kind metadata — icon + accent colour ─────────────────────────── */
const KIND_META = {
  timesheet_overdue:    { icon: "⏱", color: "#f87171", label: "Timesheets"  },
  session_reminder:     { icon: "📅", color: "#3b82f6", label: "Calendar"    },
  announcement_unread:  { icon: "📣", color: "#8b5cf6", label: "News"        },
  guided_path_assigned: { icon: "🗺", color: "#1fbfb8", label: "Guided Path" },
  coaching_followup_due:{ icon: "🎯", color: "#fbbf24", label: "Coaching"    },
  leave_pending:        { icon: "🌿", color: "#34d399", label: "Leave"       },
};

function kindMeta(kind) {
  return KIND_META[kind] || { icon: "🔔", color: "#8b5cf6", label: "Notification" };
}

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)  return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open,         setOpen]         = useState(false);
  const [unread,       setUnread]       = useState(0);
  const [notifications,setNotifications]= useState([]);
  const [loading,      setLoading]      = useState(false);
  const panelRef = useRef(null);

  /* ── Poll unread count every 60 s ─────────────────────────────── */
  const fetchCount = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/v1/notifications/unread-count`);
      if (res.ok) {
        const data = await res.json();
        setUnread(data.unread_count ?? 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 60_000);
    return () => clearInterval(id);
  }, [fetchCount]);

  /* ── Open panel: fetch full list ──────────────────────────────── */
  const openPanel = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    try {
      const res = await authFetch(`${API}/api/v1/notifications?limit=40`);
      if (res.ok) setNotifications(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Close on outside click ───────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        // Don't close if the click was inside the messages panel
        if (e.target.closest && e.target.closest(".emp-msg-panel")) return;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  /* ── Mark individual as read ──────────────────────────────────── */
  const markOne = useCallback(async (id, link) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
    );
    setUnread(prev => Math.max(0, prev - 1));
    try {
      await authFetch(`${API}/api/v1/notifications/mark-read`, {
        method: "POST",
        body: JSON.stringify({ notification_ids: [id] }),
      });
    } catch {}
    if (link) {
      setOpen(false);
      navigate(link);
    }
  }, [navigate]);

  /* ── Mark all as read ─────────────────────────────────────────── */
  const markAll = useCallback(async () => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
    setUnread(0);
    try {
      await authFetch(`${API}/api/v1/notifications/mark-read`, {
        method: "POST",
        body: JSON.stringify({ notification_ids: null }),
      });
    } catch {}
  }, []);

  const unreadItems = notifications.filter(n => !n.read_at);

  return (
    <div className="nbell-root" ref={panelRef}>

      {/* ── Bell button ─────────────────────────────────────────── */}
      <button
        className={`nbell-btn${open ? " nbell-btn--active" : ""}`}
        onClick={open ? () => setOpen(false) : openPanel}
        title="Notifications"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
      >
        🔔
        {unread > 0 && (
          <span className="nbell-badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {/* ── Slide-out panel ─────────────────────────────────────── */}
      {open && (
        <div className="nbell-panel">

          <div className="nbell-panel-header">
            <span className="nbell-panel-title">Notifications</span>
            <div className="nbell-panel-actions">
              {unreadItems.length > 0 && (
                <button className="nbell-mark-all" onClick={markAll}>
                  Mark all read
                </button>
              )}
              <button className="nbell-close" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>

          <div className="nbell-list">
            {loading && (
              <div className="nbell-empty">
                <div className="nbell-skeleton" />
                <div className="nbell-skeleton nbell-skeleton--short" />
                <div className="nbell-skeleton" />
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="nbell-empty">
                <div className="nbell-empty-icon">🔔</div>
                <div className="nbell-empty-text">You're all caught up!</div>
              </div>
            )}

            {!loading && notifications.map(n => {
              const meta    = kindMeta(n.kind);
              const isUnread = !n.read_at;
              return (
                <div
                  key={n.id}
                  className={`nbell-item${isUnread ? " nbell-item--unread" : ""}`}
                  onClick={() => markOne(n.id, n.link)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === "Enter" && markOne(n.id, n.link)}
                >
                  <div
                    className="nbell-item-icon"
                    style={{ "--kind-color": meta.color }}
                  >
                    {meta.icon}
                  </div>
                  <div className="nbell-item-body">
                    <div className="nbell-item-title">{n.title}</div>
                    {n.body && <div className="nbell-item-body-text">{n.body}</div>}
                    <div className="nbell-item-meta">
                      <span className="nbell-item-kind" style={{ color: meta.color }}>
                        {meta.label}
                      </span>
                      <span className="nbell-item-time">{timeAgo(n.created_at)}</span>
                    </div>
                  </div>
                  {isUnread && <div className="nbell-item-dot" style={{ background: meta.color }} />}
                </div>
              );
            })}
          </div>

        </div>
      )}
    </div>
  );
}
