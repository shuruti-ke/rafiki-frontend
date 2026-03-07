import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { API, authFetch } from "../api.js";
import NotificationBell from "./NotificationBell.jsx";
import "./EmployeeLayout.css";

/* ══════════════════════════════════════
   Nav structure — grouped with icons
══════════════════════════════════════ */
const NAV_GROUPS = [
  {
    label: "Workspace",
    links: [
      { to: "/dashboard",     label: "Home",          icon: "🏠" },
      { to: "/chat",          label: "Chat",          icon: "💬" },
      { to: "/calendar",      label: "Calendar",      icon: "📅" },
      { to: "/meetings",      label: "Meetings",      icon: "🎥" },
    ],
  },
  {
    label: "My Work",
    links: [
      { to: "/objectives",    label: "Objectives",    icon: "🎯" },
      { to: "/timesheet",     label: "Timesheets",    icon: "⏱️" },
      { to: "/leave",         label: "Leave",         icon: "🌴" },
      { to: "/my-report",     label: "My Report",     icon: "📊" },
    ],
  },
  {
    label: "Company",
    links: [
      { to: "/announcements", label: "Announcements", icon: "📣" },
      { to: "/knowledge-base",label: "Knowledge Base",icon: "📚" },
      { to: "/my-documents",  label: "My Documents",  icon: "📄" },
      { to: "/guided-paths",  label: "Guided Paths",  icon: "🧭" },
    ],
  },
];

/* ══════════════════════════════════════
   Helpers + sub-components (unchanged)
══════════════════════════════════════ */
const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function pad(n) { return String(n).padStart(2, "0"); }
function fmtDate(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function fmtTime(iso) { if (!iso) return ""; const d = new Date(iso); return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/* ── PayrollApprovalBlock (unchanged) ── */
function PayrollApprovalBlock({ payload, onAction }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [batchStatus, setBatchStatus] = useState(null);

  useEffect(() => {
    if (!payload.batch_id) return;
    authFetch(`${API}/api/v1/payroll/batches/${payload.batch_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.status) setBatchStatus(data.status); })
      .catch(() => {});
  }, [payload.batch_id]);

  const status = batchStatus || payload.batch_status;
  const isActionable = status === "uploaded_needs_approval";

  async function handleApprove() {
    setBusy(true);
    try {
      const r = await authFetch(`${API}${payload.approve_endpoint}`, { method: "POST" });
      const data = await r.json();
      if (r.ok) { setDone("approved"); onAction && onAction(); }
      else setDone("error:" + (data.detail || "Failed"));
    } catch { setDone("error:Network error"); } finally { setBusy(false); }
  }

  async function handleReject() {
    setBusy(true);
    try {
      const r = await authFetch(`${API}${payload.reject_endpoint}?reason=${encodeURIComponent(rejectReason)}`, { method: "POST" });
      const data = await r.json();
      if (r.ok) { setDone("rejected"); onAction && onAction(); }
      else setDone("error:" + (data.detail || "Failed"));
    } catch { setDone("error:Network error"); } finally { setBusy(false); }
  }

  const statusLabel = { distributed: "Already distributed", uploaded: "Already approved", rejected: "Already rejected", uploaded_needs_approval: null }[status];

  return (
    <div style={{ background: "rgba(139,92,246,0.08)", borderRadius: 8, padding: "8px 10px", marginTop: 4, fontSize: "0.8rem" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Payroll Approval</div>
      <div style={{ color: "var(--muted)", marginBottom: 4 }}>{payload.month} — {payload.filename}</div>
      {payload.download_url && <a href={payload.download_url} target="_blank" rel="noreferrer" style={{ color: "#8b5cf6", fontSize: "0.75rem" }}>Download</a>}
      {done === "approved" && <div style={{ color: "#34d399", marginTop: 4 }}>Approved</div>}
      {done === "rejected" && <div style={{ color: "#f87171", marginTop: 4 }}>Rejected</div>}
      {done?.startsWith("error:") && <div style={{ color: "#f87171", marginTop: 4 }}>{done.slice(6)}</div>}
      {!done && !isActionable && statusLabel && <div style={{ color: "#9ca3af", marginTop: 4 }}>{statusLabel}</div>}
      {!done && isActionable && !showReject && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button className="btn btnPrimary btnTiny" onClick={handleApprove} disabled={busy}>{busy ? "…" : "Approve"}</button>
          <button className="btn btnGhost btnTiny" onClick={() => setShowReject(true)} disabled={busy}>Reject</button>
        </div>
      )}
      {!done && isActionable && showReject && (
        <div style={{ marginTop: 6 }}>
          <input style={{ width: "100%", padding: "4px 6px", borderRadius: 4, border: "1px solid #e5e7eb", fontSize: "0.75rem", marginBottom: 4, fontFamily: "inherit" }} placeholder="Reason (optional)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btnPrimary btnTiny" onClick={handleReject} disabled={busy}>{busy ? "…" : "Confirm Reject"}</button>
            <button className="btn btnGhost btnTiny" onClick={() => setShowReject(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── ObjectiveReviewBlock (unchanged) ── */
function ObjectiveReviewBlock({ payload, onAction }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [notes, setNotes] = useState("");
  const [showRevise, setShowRevise] = useState(false);

  async function handleApprove() {
    setBusy(true);
    try {
      const r = await authFetch(`${API}${payload.approve_endpoint}`, { method: "POST", body: JSON.stringify({ review_status: "approved", review_notes: notes }) });
      const data = await r.json();
      if (r.ok) { setDone("approved"); onAction && onAction(); }
      else setDone("error:" + (data.detail || "Failed"));
    } catch { setDone("error:Network error"); } finally { setBusy(false); }
  }

  async function handleRevise() {
    setBusy(true);
    try {
      const r = await authFetch(`${API}${payload.reject_endpoint}`, { method: "POST", body: JSON.stringify({ review_status: "needs_revision", review_notes: notes }) });
      const data = await r.json();
      if (r.ok) { setDone("needs_revision"); onAction && onAction(); }
      else setDone("error:" + (data.detail || "Failed"));
    } catch { setDone("error:Network error"); } finally { setBusy(false); }
  }

  return (
    <div style={{ background: "rgba(123,47,190,0.08)", borderRadius: 8, padding: "10px 12px", marginTop: 4, fontSize: "0.8rem" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 Objective Review Request</div>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{payload.title}</div>
      {payload.description && <div style={{ color: "#9ca3af", marginBottom: 4 }}>{payload.description}</div>}
      <div style={{ color: "#9ca3af", fontSize: "0.75rem", marginBottom: 2 }}>From: {payload.submitter_name || "Employee"}{payload.target_date ? ` · Due: ${payload.target_date}` : ""}</div>
      {payload.key_results_summary && <div style={{ color: "#9ca3af", fontSize: "0.75rem", marginBottom: 6 }}>{payload.key_results_summary}</div>}
      {payload.progress != null && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ height: 4, background: "rgba(0,0,0,.08)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${payload.progress}%`, background: "#1fbfb8", borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: 2 }}>{payload.progress}% complete</div>
        </div>
      )}
      {done === "approved" && <div style={{ color: "#34d399", marginTop: 4, fontWeight: 600 }}>✓ Approved</div>}
      {done === "needs_revision" && <div style={{ color: "#f59e0b", marginTop: 4, fontWeight: 600 }}>↩ Sent back for revision</div>}
      {done?.startsWith("error:") && <div style={{ color: "#f87171", marginTop: 4 }}>{done.slice(6)}</div>}
      {!done && (
        <>
          <textarea style={{ width: "100%", marginTop: 6, padding: "4px 6px", borderRadius: 4, border: "1px solid #e5e7eb", fontSize: "0.75rem", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} rows={2} placeholder="Notes (optional)..." value={notes} onChange={e => setNotes(e.target.value)} />
          {!showRevise ? (
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button className="btn btnPrimary btnTiny" onClick={handleApprove} disabled={busy}>{busy ? "…" : "✓ Approve"}</button>
              <button className="btn btnGhost btnTiny" onClick={() => setShowRevise(true)} disabled={busy}>↩ Request Revision</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button className="btn btnPrimary btnTiny" onClick={handleRevise} disabled={busy}>{busy ? "…" : "Confirm Revision"}</button>
              <button className="btn btnGhost btnTiny" onClick={() => setShowRevise(false)} disabled={busy}>Cancel</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── SidebarMessageContent (unchanged) ── */
function SidebarMessageContent({ content, onAction }) {
  const payrollMatch = content.match(/\[\[PAYROLL_APPROVAL\]\]([\s\S]*?)\[\[\/PAYROLL_APPROVAL\]\]/);
  if (payrollMatch) {
    try {
      const payload = JSON.parse(payrollMatch[1].trim());
      const before = content.slice(0, content.indexOf("[[PAYROLL_APPROVAL]]")).trim();
      return <div>{before && <div style={{ marginBottom: 4 }}>{before}</div>}<PayrollApprovalBlock payload={payload} onAction={onAction} /></div>;
    } catch {}
  }
  const objMatch = content.match(/\[\[OBJECTIVE_REVIEW\]\]([\s\S]*?)\[\[\/OBJECTIVE_REVIEW\]\]/);
  if (objMatch) {
    try {
      const payload = JSON.parse(objMatch[1].trim());
      const before = content.slice(0, content.indexOf("[[OBJECTIVE_REVIEW]]")).trim();
      return <div>{before && <div style={{ marginBottom: 4 }}>{before}</div>}<ObjectiveReviewBlock payload={payload} onAction={onAction} /></div>;
    } catch {}
  }
  return <span style={{ whiteSpace: "pre-wrap" }}>{content}</span>;
}

/* ── PeoplePicker (unchanged) ── */
function PeoplePicker({ colleagues, selected, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const filtered = colleagues.filter(c => !selected.find(s => s.id === c.id) && (c.name || c.email || "").toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="people-picker" ref={ref}>
      <div className="people-picker-chips">{selected.map(s => <span key={s.id} className="people-picker-chip">{s.name || s.email}<button className="people-picker-chip-x" onClick={() => onChange(selected.filter(x => x.id !== s.id))}>×</button></span>)}</div>
      <input className="people-picker-input" placeholder="Search colleagues..." value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && query && (
        <div className="people-picker-dropdown">
          {filtered.length === 0 ? <div className="people-picker-empty">No results</div> : filtered.slice(0, 8).map(c => <div key={c.id} className="people-picker-option" onMouseDown={() => { onChange([...selected, c]); setQuery(""); setOpen(false); }}>{c.name || c.email}</div>)}
        </div>
      )}
    </div>
  );
}

/* ── MiniCalendar (unchanged) ── */
function MiniCalendar() {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selDate, setSel]  = useState(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const start = new Date(year, month, 1).toISOString();
    const end   = new Date(year, month + 1, 0, 23, 59).toISOString();
    authFetch(`${API}/api/v1/calendar/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
      .then(r => r.ok ? r.json() : []).then(d => setEvents(Array.isArray(d) ? d : [])).catch(() => {});
  }, [year, month]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function eventsOnDay(d) {
    if (!d) return [];
    const iso = fmtDate(year, month, d);
    return events.filter(e => e.start_time && e.start_time.slice(0, 10) === iso);
  }

  const selEvents = selDate ? eventsOnDay(selDate) : [];

  return (
    <div className="emp-cal">
      <div className="emp-cal-header">
        <button className="emp-cal-nav" onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}>‹</button>
        <span className="emp-cal-title">{MONTH_NAMES[month].slice(0, 3)} {year}</span>
        <button className="emp-cal-nav" onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}>›</button>
      </div>
      <div className="emp-cal-grid">
        {DAY_NAMES.map(d => <div key={d} className="emp-cal-dh">{d}</div>)}
        {cells.map((d, i) => {
          const isToday = d && d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
          const isSel   = d && d === selDate;
          const evs     = eventsOnDay(d);
          return (
            <div key={i} className={`emp-cal-day${!d ? " out" : ""}${isToday ? " today" : ""}${isSel ? " sel" : ""}`} onClick={() => d && setSel(d === selDate ? null : d)}>
              <span>{d || ""}</span>
              {evs.length > 0 && <span className="emp-cal-dot" style={{ background: evs[0].color || "#8b5cf6" }} />}
            </div>
          );
        })}
      </div>
      {selDate && (
        <div className="emp-cal-events">
          <div className="emp-cal-events-title">{MONTH_NAMES[month].slice(0, 3)} {selDate}</div>
          {selEvents.length === 0 ? <div className="emp-cal-empty">No events</div> : selEvents.map(e => (
            <div key={e.id} className="emp-cal-ev">
              <span className="emp-cal-ev-dot" style={{ background: e.color || "#8b5cf6" }} />
              <span className="emp-cal-ev-title">{e.title}</span>
              <span className="emp-cal-ev-time">{fmtTime(e.start_time)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── SidebarMessages (unchanged logic, new panel wrapper) ── */
function SidebarMessages({ onUnreadChange }) {
  const user    = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const myId    = user.id || user.user_id;
  const [conversations, setConversations] = useState([]);
  const [activeConvo, setActiveConvo]     = useState(null);
  const [thread, setThread]               = useState([]);
  const [dmInput, setDmInput]             = useState("");
  const [showNewMsg, setShowNewMsg]       = useState(false);
  const [colleagues, setColleagues]       = useState([]);
  const [newRecipients, setNewRecipients] = useState([]);
  const [newMsgContent, setNewMsgContent] = useState("");
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const threadEndRef = useRef(null);

  const loadConversations = () => {
    authFetch(`${API}/api/v1/messages/conversations`).then(r => r.ok ? r.json() : []).then(d => {
      const arr = Array.isArray(d) ? d : [];
      setConversations(arr);
      const total = arr.reduce((s, c) => s + (c.unread_count || 0), 0);
      onUnreadChange && onUnreadChange(total);
    }).catch(() => {});
  };

  const loadThread = (id) => {
    authFetch(`${API}/api/v1/messages/conversations/${id}/messages`).then(r => r.ok ? r.json() : []).then(d => {
      setThread(Array.isArray(d) ? d : []);
      setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }).catch(() => {});
    authFetch(`${API}/api/v1/messages/conversations/${id}/read`, { method: "POST" }).catch(() => {});
  };

  useEffect(() => {
    loadConversations();
    authFetch(`${API}/api/v1/messages/colleagues`).then(r => r.ok ? r.json() : []).then(d => setColleagues(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      loadConversations();
      if (activeConvo) loadThread(activeConvo.id);
    }, 15000);
    return () => clearInterval(iv);
  }, [activeConvo?.id]);

  const sendDM = async () => {
    if (!dmInput.trim() || !activeConvo) return;
    const res = await authFetch(`${API}/api/v1/messages/conversations/${activeConvo.id}/messages`, { method: "POST", body: JSON.stringify({ content: dmInput }) });
    if (res.ok) { setDmInput(""); loadThread(activeConvo.id); loadConversations(); }
  };

  const startNewConvo = async () => {
    if (newRecipients.length === 0 || !newMsgContent.trim()) return;
    const body = { recipient_ids: newRecipients.map(r => r.id), content: newMsgContent };
    if (newRecipients.length > 1 && newGroupTitle.trim()) body.title = newGroupTitle.trim();
    const res = await authFetch(`${API}/api/v1/messages/conversations`, { method: "POST", body: JSON.stringify(body) });
    if (res.ok) {
      const convo = await res.json();
      setShowNewMsg(false); setNewRecipients([]); setNewMsgContent(""); setNewGroupTitle("");
      loadConversations(); setActiveConvo(convo);
    }
  };

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);

  if (activeConvo && !showNewMsg) {
    return (
      <div className="emp-msg">
        <div className="emp-msg-header">
          <button className="emp-msg-back" onClick={() => setActiveConvo(null)}>‹</button>
          <span className="emp-msg-header-name">{activeConvo.is_group && <span className="emp-msg-group-icon">G</span>}{activeConvo.display_name}</span>
        </div>
        <div className="emp-msg-thread">
          {thread.map(m => {
            const sender = activeConvo.participants?.find(p => p.id === m.sender_id);
            return (
              <div key={m.id} className={`emp-msg-bubble ${m.sender_id === myId ? "mine" : "theirs"}`}>
                {activeConvo.is_group && m.sender_id !== myId && <div className="emp-msg-sender">{sender?.name || "Unknown"}</div>}
                <SidebarMessageContent content={m.content} onAction={() => loadThread(activeConvo.id)} />
                <div className="emp-msg-time">{fmtTime(m.created_at)}</div>
              </div>
            );
          })}
          <div ref={threadEndRef} />
        </div>
        <div className="emp-msg-input">
          <textarea value={dmInput} onChange={e => setDmInput(e.target.value)} placeholder="Type a message..." onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDM(); } }} />
          <button className="btn btnPrimary btnTiny" onClick={sendDM} disabled={!dmInput.trim()}>Send</button>
        </div>
      </div>
    );
  }

  if (showNewMsg) {
    return (
      <div className="emp-msg">
        <div className="emp-msg-header">
          <button className="emp-msg-back" onClick={() => setShowNewMsg(false)}>‹</button>
          <span className="emp-msg-header-name">New Message</span>
        </div>
        <div className="emp-msg-new">
          <PeoplePicker colleagues={colleagues} selected={newRecipients} onChange={setNewRecipients} />
          {newRecipients.length > 1 && <input className="people-picker-input" value={newGroupTitle} onChange={e => setNewGroupTitle(e.target.value)} placeholder="Group name (optional)..." />}
          <textarea value={newMsgContent} onChange={e => setNewMsgContent(e.target.value)} placeholder="Write your message..." rows={3} />
          <div className="emp-msg-new-actions">
            <button className="btn btnPrimary btnTiny" onClick={startNewConvo} disabled={newRecipients.length === 0 || !newMsgContent.trim()}>Send</button>
            <button className="btn btnGhost btnTiny" onClick={() => setShowNewMsg(false)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="emp-msg">
      <div className="emp-msg-header">
        <span className="emp-msg-header-name">Messages {totalUnread > 0 && <span className="emp-msg-badge">{totalUnread}</span>}</span>
        <button className="emp-msg-compose" onClick={() => setShowNewMsg(true)} title="New Message">+</button>
      </div>
      <div className="emp-msg-list">
        {conversations.length === 0 && <div className="emp-msg-empty">No conversations yet</div>}
        {conversations.map(c => (
          <div key={c.id} className="emp-msg-item" onClick={() => { setActiveConvo(c); setShowNewMsg(false); }}>
            <div className="emp-msg-item-top">
              <span className="emp-msg-item-name">{c.is_group && <span className="emp-msg-group-icon">G</span>}{c.display_name}</span>
              <span className="emp-msg-item-time">{timeAgo(c.last_message_at)}</span>
            </div>
            <div className="emp-msg-item-preview">
              {c.unread_count > 0 && <span className="emp-msg-unread">{c.unread_count}</span>}
              {(c.last_message || "No messages").replace(/\[\[PAYROLL_APPROVAL\]\][\s\S]*?\[\[\/PAYROLL_APPROVAL\]\]/g, "[Payroll approval request]").trim()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   PAGE TITLES
══════════════════════════════════════ */
const PAGE_TITLES = {
  "/dashboard":      "Home",
  "/chat":           "Chat",
  "/calendar":       "Calendar",
  "/meetings":       "Meetings",
  "/objectives":     "Objectives",
  "/timesheet":      "Timesheets",
  "/leave":          "Leave",
  "/my-report":      "My Report",
  "/announcements":  "Announcements",
  "/knowledge-base": "Knowledge Base",
  "/my-documents":   "My Documents",
  "/guided-paths":   "Guided Paths",
};

/* ══════════════════════════════════════
   MAIN LAYOUT
══════════════════════════════════════ */
export default function EmployeeLayout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [collapsed,    setCollapsed]    = useState(false);
  const [mobileOpen,   setMobileOpen]   = useState(false);
  const [msgPanelOpen, setMsgPanelOpen] = useState(false);
  const [unreadCount,  setUnreadCount]  = useState(0);

  const user      = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const name      = user.full_name || user.name || user.email || "Employee";
  const initials  = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const role      = localStorage.getItem("rafiki_role") || "";
  const isManager = role === "manager" || role === "hr_admin" || role === "super_admin";
  const isAdmin   = role === "hr_admin" || role === "super_admin";
  const isFlush   = location.pathname === "/chat";

  const pageTitle = PAGE_TITLES[location.pathname] || "Rafiki";

  const handleLogout = () => {
    localStorage.removeItem("rafiki_token");
    localStorage.removeItem("rafiki_role");
    localStorage.removeItem("rafiki_user");
    navigate("/login");
  };

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className="emp-layout">

      {/* ── Sidebar nav ── */}
      <nav className={`emp-sidebar-nav${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}
           style={{ position: "relative" }}>

        {/* Collapse toggle (desktop only) */}
        <button className="emp-nav-collapse" onClick={() => setCollapsed(c => !c)} title={collapsed ? "Expand" : "Collapse"}
          style={{ display: window.innerWidth <= 768 ? "none" : "flex" }}>
          {collapsed ? "›" : "‹"}
        </button>

        {/* Brand */}
        <div className="emp-nav-brand">
          <div className="emp-nav-brand-mark">R</div>
          <div className="emp-nav-brand-text">
            <div className="emp-nav-brand-name">Rafiki</div>
            <div className="emp-nav-brand-sub">Employee Portal</div>
          </div>
        </div>

        {/* User card */}
        <div className="emp-nav-user">
          <div className="emp-nav-avatar">{initials}</div>
          <div className="emp-nav-user-info">
            <div className="emp-nav-user-name">{name.split(" ")[0]}</div>
            <div className="emp-nav-user-role">{user.job_title || user.department || role || "Employee"}</div>
          </div>
        </div>

        {/* Nav groups */}
        <div className="emp-nav-scroll">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="emp-nav-section">
              <div className="emp-nav-section-label">{group.label}</div>
              {group.links.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => `emp-nav-link${isActive ? " active" : ""}`}
                >
                  <span className="emp-nav-icon">{link.icon}</span>
                  <span className="emp-nav-label">{link.label}</span>
                  {link.to === "/chat" && unreadCount > 0 && (
                    <span className="emp-nav-badge">{unreadCount}</span>
                  )}
                  <span className="emp-nav-tooltip">{link.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom: portal links + logout */}
        <div className="emp-nav-bottom">
          {isManager && (
            <NavLink to="/manager" className="emp-nav-portal-link">
              <span className="emp-nav-icon">🏢</span>
              <span className="emp-nav-bottom-label">Manager Portal</span>
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/admin" className="emp-nav-portal-link">
              <span className="emp-nav-icon">⚙️</span>
              <span className="emp-nav-bottom-label">HR Admin</span>
            </NavLink>
          )}
          <button className="emp-nav-logout-btn" onClick={handleLogout}>
            <span className="emp-nav-icon">👋</span>
            <span className="emp-nav-bottom-label">Logout</span>
          </button>
        </div>
      </nav>

      {/* Mobile overlay */}
      <div className={`emp-sidebar-overlay${mobileOpen ? " visible" : ""}`} onClick={() => setMobileOpen(false)} />

      {/* ── Main area ── */}
      <div className="emp-main">

        {/* Top bar */}
        <div className="emp-topbar">
          {/* Hamburger — mobile only */}
          <button className="emp-hamburger" onClick={() => setMobileOpen(o => !o)}>☰</button>

          <div className="emp-topbar-title">{pageTitle}</div>

          <div className="emp-topbar-actions">
            {/* Notification bell */}
            <NotificationBell />
            {/* Messages icon */}
            <button
              className="emp-topbar-icon-btn"
              onClick={(e) => { e.stopPropagation(); setMsgPanelOpen(o => !o); }}
              title="Messages"
            >
              💬
              {unreadCount > 0 && <span className="emp-topbar-unread">{unreadCount}</span>}
            </button>
          </div>
        </div>

        {/* Page content */}
        <div className={`emp-content${isFlush ? " emp-content--flush" : ""}`}>
          <Outlet />
        </div>
      </div>

      {/* ── Messages slide-out panel (portal → escapes any stacking context) ── */}
      {createPortal(
        <div className={`emp-msg-panel${msgPanelOpen ? " open" : ""}`}>
          <div className="emp-msg-panel-header">
            <span className="emp-msg-panel-title">Messages</span>
            <button className="emp-msg-panel-close" onClick={() => setMsgPanelOpen(false)}>✕</button>
          </div>
          <SidebarMessages onUnreadChange={setUnreadCount} />
          <MiniCalendar />
        </div>,
        document.body
      )}
    </div>
  );
}
