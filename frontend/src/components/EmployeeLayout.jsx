import { useState, useEffect, useRef } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { API, authFetch } from "../api.js";
import "./EmployeeLayout.css";

const links = [
  { to: "/chat", label: "Chat" },
  { to: "/knowledge-base", label: "Knowledge Base" },
  { to: "/my-documents", label: "My Documents" },
  { to: "/announcements", label: "Announcements" },
  { to: "/guided-paths", label: "Guided Paths" },
  { to: "/objectives", label: "Objectives" },
  { to: "/calendar", label: "Calendar" },
  { to: "/timesheet", label: "Timesheets" },
];

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function pad(n) { return String(n).padStart(2, "0"); }
function fmtDate(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function fmtTime(iso) { if (!iso) return ""; const d = new Date(iso); return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/* ─── Mini Calendar ─── */
function MiniCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);

  const loadEvents = async () => {
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    const res = await authFetch(`${API}/api/v1/calendar/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    if (res.ok) setEvents(await res.json());
  };

  useEffect(() => { loadEvents(); }, [year, month]);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); setSelectedDay(null); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); setSelectedDay(null); };

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: daysInPrev - firstDow + 1 + i, outside: true });
  for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i, outside: false });
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) for (let i = 1; i <= remaining; i++) cells.push({ day: i, outside: true });

  const eventsForDay = (d) => {
    const ds = fmtDate(year, month, d);
    return events.filter(e => e.start_time && e.start_time.slice(0, 10) === ds);
  };

  const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const dayEvents = selectedDay ? eventsForDay(selectedDay) : [];

  return (
    <div className="emp-cal">
      <div className="emp-cal-header">
        <button className="emp-cal-nav" onClick={prevMonth}>&lsaquo;</button>
        <span className="emp-cal-title">{MONTH_NAMES[month].slice(0, 3)} {year}</span>
        <button className="emp-cal-nav" onClick={nextMonth}>&rsaquo;</button>
      </div>
      <div className="emp-cal-grid">
        {DAY_NAMES.map(d => <div key={d} className="emp-cal-dh">{d}</div>)}
        {cells.map((c, i) => {
          const de = !c.outside ? eventsForDay(c.day) : [];
          const sel = selectedDay === c.day && !c.outside;
          return (
            <div
              key={i}
              className={`emp-cal-day${c.outside ? " out" : ""}${!c.outside && isToday(c.day) ? " today" : ""}${sel ? " sel" : ""}`}
              onClick={() => !c.outside && setSelectedDay(sel ? null : c.day)}
            >
              <span>{c.day}</span>
              {de.length > 0 && <span className="emp-cal-dot" />}
            </div>
          );
        })}
      </div>
      {selectedDay && (
        <div className="emp-cal-events">
          <div className="emp-cal-events-title">{MONTH_NAMES[month].slice(0, 3)} {selectedDay}</div>
          {dayEvents.length === 0 && <div className="emp-cal-empty">No events</div>}
          {dayEvents.map(e => (
            <div key={e.id} className="emp-cal-ev">
              <span className="emp-cal-ev-dot" style={{ background: e.color || "#8b5cf6" }} />
              <span className="emp-cal-ev-title">{e.title}</span>
              <span className="emp-cal-ev-time">
                {e.is_all_day ? "All day" : fmtTime(e.start_time)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── People Picker (shared component) ─── */
function PeoplePicker({ colleagues, selected, onChange }) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef(null);

  const selectedIds = new Set(selected.map(s => s.id));
  const filtered = colleagues.filter(c =>
    !selectedIds.has(c.id) &&
    ((c.name || "").toLowerCase().includes(search.toLowerCase()) ||
     (c.email || "").toLowerCase().includes(search.toLowerCase()))
  );

  const addPerson = (c) => {
    onChange([...selected, { id: c.id, name: c.name || c.email }]);
    setSearch("");
  };

  const removePerson = (id) => {
    onChange(selected.filter(s => s.id !== id));
  };

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="people-picker" ref={wrapperRef}>
      {selected.length > 0 && (
        <div className="people-picker-chips">
          {selected.map(s => (
            <span key={s.id} className="people-picker-chip">
              {s.name}
              <button className="people-picker-chip-x" onClick={() => removePerson(s.id)}>&times;</button>
            </span>
          ))}
        </div>
      )}
      <input
        className="people-picker-input"
        value={search}
        onChange={e => setSearch(e.target.value)}
        onFocus={() => setShowDropdown(true)}
        placeholder="Type name or email..."
      />
      {showDropdown && search.length > 0 && (
        <div className="people-picker-dropdown">
          {filtered.length === 0 && <div className="people-picker-empty">No matches</div>}
          {filtered.map(c => (
            <div key={c.id} className="people-picker-option" onClick={() => addPerson(c)}>
              {c.name || c.email}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Sidebar Messages ─── */
function SidebarMessages() {
  const currentUser = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const myId = currentUser.id;

  const [conversations, setConversations] = useState([]);
  const [activeConvo, setActiveConvo] = useState(null);
  const [thread, setThread] = useState([]);
  const [dmInput, setDmInput] = useState("");
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [colleagues, setColleagues] = useState([]);
  const [newRecipients, setNewRecipients] = useState([]);
  const [newMsgContent, setNewMsgContent] = useState("");
  const [newGroupTitle, setNewGroupTitle] = useState("");

  const threadEndRef = useRef(null);

  const loadConversations = async () => {
    const res = await authFetch(`${API}/api/v1/messages/conversations`);
    if (res.ok) setConversations(await res.json());
  };

  const loadThread = async (convoId) => {
    const res = await authFetch(`${API}/api/v1/messages/conversations/${convoId}/messages`);
    if (res.ok) {
      setThread(await res.json());
      authFetch(`${API}/api/v1/messages/conversations/${convoId}/read`, { method: "POST" });
    }
  };

  const loadColleagues = async () => {
    const res = await authFetch(`${API}/api/v1/messages/colleagues`);
    if (res.ok) setColleagues(await res.json());
  };

  useEffect(() => { loadConversations(); loadColleagues(); }, []);

  useEffect(() => {
    if (activeConvo) loadThread(activeConvo.id);
  }, [activeConvo?.id]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  // Polling
  useEffect(() => {
    const iv = setInterval(() => {
      loadConversations();
      if (activeConvo) loadThread(activeConvo.id);
    }, 15000);
    return () => clearInterval(iv);
  }, [activeConvo?.id]);

  const sendDM = async () => {
    if (!dmInput.trim() || !activeConvo) return;
    const res = await authFetch(`${API}/api/v1/messages/conversations/${activeConvo.id}/messages`, {
      method: "POST", body: JSON.stringify({ content: dmInput }),
    });
    if (res.ok) { setDmInput(""); loadThread(activeConvo.id); loadConversations(); }
  };

  const startNewConvo = async () => {
    if (newRecipients.length === 0 || !newMsgContent.trim()) return;
    const body = {
      recipient_ids: newRecipients.map(r => r.id),
      content: newMsgContent,
    };
    if (newRecipients.length > 1 && newGroupTitle.trim()) {
      body.title = newGroupTitle.trim();
    }
    const res = await authFetch(`${API}/api/v1/messages/conversations`, {
      method: "POST", body: JSON.stringify(body),
    });
    if (res.ok) {
      const convo = await res.json();
      setShowNewMsg(false);
      setNewRecipients([]);
      setNewMsgContent("");
      setNewGroupTitle("");
      loadConversations();
      setActiveConvo(convo);
    }
  };

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);

  // ── Thread view ──
  if (activeConvo && !showNewMsg) {
    return (
      <div className="emp-msg">
        <div className="emp-msg-header">
          <button className="emp-msg-back" onClick={() => setActiveConvo(null)}>&lsaquo;</button>
          <span className="emp-msg-header-name">
            {activeConvo.is_group && <span className="emp-msg-group-icon" title="Group">G</span>}
            {activeConvo.display_name}
          </span>
        </div>
        <div className="emp-msg-thread">
          {thread.map(m => {
            const sender = activeConvo.participants?.find(p => p.id === m.sender_id);
            return (
              <div key={m.id} className={`emp-msg-bubble ${m.sender_id === myId ? "mine" : "theirs"}`}>
                {activeConvo.is_group && m.sender_id !== myId && (
                  <div className="emp-msg-sender">{sender?.name || "Unknown"}</div>
                )}
                <div>{m.content}</div>
                <div className="emp-msg-time">{fmtTime(m.created_at)}</div>
              </div>
            );
          })}
          <div ref={threadEndRef} />
        </div>
        <div className="emp-msg-input">
          <textarea
            value={dmInput}
            onChange={e => setDmInput(e.target.value)}
            placeholder="Type a message..."
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDM(); } }}
          />
          <button className="btn btnPrimary btnTiny" onClick={sendDM} disabled={!dmInput.trim()}>Send</button>
        </div>
      </div>
    );
  }

  // ── New message view ──
  if (showNewMsg) {
    return (
      <div className="emp-msg">
        <div className="emp-msg-header">
          <button className="emp-msg-back" onClick={() => setShowNewMsg(false)}>&lsaquo;</button>
          <span className="emp-msg-header-name">New Message</span>
        </div>
        <div className="emp-msg-new">
          <PeoplePicker colleagues={colleagues} selected={newRecipients} onChange={setNewRecipients} />
          {newRecipients.length > 1 && (
            <input
              className="people-picker-input"
              value={newGroupTitle}
              onChange={e => setNewGroupTitle(e.target.value)}
              placeholder="Group name (optional)..."
            />
          )}
          <textarea
            value={newMsgContent}
            onChange={e => setNewMsgContent(e.target.value)}
            placeholder="Write your message..."
            rows={3}
          />
          <div className="emp-msg-new-actions">
            <button className="btn btnPrimary btnTiny" onClick={startNewConvo} disabled={newRecipients.length === 0 || !newMsgContent.trim()}>Send</button>
            <button className="btn btnGhost btnTiny" onClick={() => setShowNewMsg(false)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Conversation list view ──
  return (
    <div className="emp-msg">
      <div className="emp-msg-header">
        <span className="emp-msg-header-name">
          Messages {totalUnread > 0 && <span className="emp-msg-badge">{totalUnread}</span>}
        </span>
        <button className="emp-msg-compose" onClick={() => setShowNewMsg(true)} title="New Message">+</button>
      </div>
      <div className="emp-msg-list">
        {conversations.length === 0 && <div className="emp-msg-empty">No conversations yet</div>}
        {conversations.map(c => (
          <div
            key={c.id}
            className="emp-msg-item"
            onClick={() => { setActiveConvo(c); setShowNewMsg(false); }}
          >
            <div className="emp-msg-item-top">
              <span className="emp-msg-item-name">
                {c.is_group && <span className="emp-msg-group-icon" title="Group">G</span>}
                {c.display_name}
              </span>
              <span className="emp-msg-item-time">{timeAgo(c.last_message_at)}</span>
            </div>
            <div className="emp-msg-item-preview">
              {c.unread_count > 0 && <span className="emp-msg-unread">{c.unread_count}</span>}
              {c.last_message || "No messages"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Layout ─── */
export default function EmployeeLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("rafiki_token");
    localStorage.removeItem("rafiki_role");
    localStorage.removeItem("rafiki_user");
    navigate("/login");
  };

  const isFlush = location.pathname === "/chat";

  return (
    <div className="emp-layout">
      <nav className="emp-nav">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) => `emp-nav-link${isActive ? " active" : ""}`}
          >
            {l.label}
          </NavLink>
        ))}
        <div className="emp-nav-spacer" />
        <button onClick={handleLogout} className="emp-nav-logout">
          Logout
        </button>
      </nav>
      <div className="emp-body">
        <aside className="emp-sidebar">
          <SidebarMessages />
          <MiniCalendar />
        </aside>
        <div className={`emp-content${isFlush ? " emp-content--flush" : ""}`}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
