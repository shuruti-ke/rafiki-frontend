/**
 * frontend/src/components/EmployeeChat.jsx
 * Sprint 6 — Agentic AI chat with action cards
 *
 * Architecture:
 *  - History lives in React state (sent to backend each turn)
 *  - session_id returned from backend, stored in state
 *  - action_cards from backend rendered as structured UI blocks below each reply
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { API, authFetch } from "../api.js";
import "./EmployeeChat.css";

// ─────────────────────────────────────────────────────────────────────────────
// Markdown-lite renderer (handles **bold**, *italic*, `code`, bullet lists)
// ─────────────────────────────────────────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^[-•]\s(.+)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n/g, "<br/>");
}

function MsgText({ text }) {
  return (
    <span
      className="chat-msg-text"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action card components
// ─────────────────────────────────────────────────────────────────────────────

function LeaveBalanceCard({ card }) {
  const typeEmoji = { annual: "🌴", sick: "🤒", maternity: "👶", paternity: "👨‍👧", compassionate: "🤍", unpaid: "⏸️" };
  return (
    <div className="ac-card ac-leave-balance">
      <div className="ac-card-header">
        <span className="ac-card-icon">📊</span>
        <span className="ac-card-title">{card.title}</span>
      </div>
      <div className="ac-balance-grid">
        {(card.balances || []).map(b => {
          const pct = b.total_days > 0 ? Math.round((b.days_taken / b.total_days) * 100) : 0;
          return (
            <div key={b.leave_type} className="ac-balance-row">
              <div className="ac-balance-label">
                <span>{typeEmoji[b.leave_type] || "📋"}</span>
                <span className="ac-balance-type">{b.leave_type.charAt(0).toUpperCase() + b.leave_type.slice(1)}</span>
              </div>
              <div className="ac-balance-bar-wrap">
                <div className="ac-balance-bar">
                  <div className="ac-balance-bar-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <span className="ac-balance-nums">
                  <strong>{b.days_remaining}</strong>/{b.total_days} days left
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeaveSubmittedCard({ card }) {
  const statusColor = card.status === "pending" ? "#f59e0b" : card.status === "approved" ? "#10b981" : "#ef4444";
  return (
    <div className="ac-card ac-leave-submitted">
      <div className="ac-card-header">
        <span className="ac-card-icon">✅</span>
        <span className="ac-card-title">{card.title}</span>
        <span className="ac-card-badge" style={{ background: `${statusColor}22`, color: statusColor }}>
          {card.status}
        </span>
      </div>
      <div className="ac-info-rows">
        <div className="ac-info-row"><span>Type</span><strong>{card.leave_type?.charAt(0).toUpperCase() + card.leave_type?.slice(1)}</strong></div>
        <div className="ac-info-row"><span>From</span><strong>{formatDate(card.start_date)}</strong></div>
        <div className="ac-info-row"><span>To</span><strong>{formatDate(card.end_date)}</strong></div>
        <div className="ac-info-row"><span>Duration</span><strong>{card.days} day{card.days !== 1 ? "s" : ""}</strong></div>
        {card.request_id && <div className="ac-info-row ac-muted"><span>Ref</span><span>#{card.request_id.slice(0, 8)}</span></div>}
      </div>
    </div>
  );
}

function CalendarEventsCard({ card }) {
  if (!card.events?.length) {
    return (
      <div className="ac-card ac-calendar">
        <div className="ac-card-header">
          <span className="ac-card-icon">📅</span>
          <span className="ac-card-title">{card.title}</span>
        </div>
        <div className="ac-empty">No events in this period.</div>
      </div>
    );
  }
  return (
    <div className="ac-card ac-calendar">
      <div className="ac-card-header">
        <span className="ac-card-icon">📅</span>
        <span className="ac-card-title">{card.title}</span>
      </div>
      <div className="ac-event-list">
        {card.events.slice(0, 5).map(ev => (
          <div key={ev.id} className="ac-event-row">
            <div className="ac-event-dot" />
            <div className="ac-event-info">
              <div className="ac-event-name">{ev.title}</div>
              <div className="ac-event-time">{formatDateTime(ev.start)}{ev.location ? ` · ${ev.location}` : ""}</div>
            </div>
          </div>
        ))}
        {card.events.length > 5 && <div className="ac-muted" style={{ paddingTop: 4 }}>+{card.events.length - 5} more</div>}
      </div>
    </div>
  );
}

function EventCreatedCard({ card }) {
  return (
    <div className="ac-card ac-event-created">
      <div className="ac-card-header">
        <span className="ac-card-icon">🗓️</span>
        <span className="ac-card-title">{card.title}</span>
      </div>
      <div className="ac-info-rows">
        <div className="ac-info-row"><span>Event</span><strong>{card.event_title}</strong></div>
        <div className="ac-info-row"><span>Start</span><strong>{formatDateTime(card.start)}</strong></div>
        <div className="ac-info-row"><span>End</span><strong>{formatDateTime(card.end)}</strong></div>
        {card.event_id && <div className="ac-info-row ac-muted"><span>Ref</span><span>#{card.event_id.slice(0, 8)}</span></div>}
      </div>
    </div>
  );
}

function TimesheetSummaryCard({ card }) {
  const pct = card.expected_hours > 0 ? Math.round((card.total_hours / card.expected_hours) * 100) : 0;
  const barColor = pct >= 100 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="ac-card ac-timesheet">
      <div className="ac-card-header">
        <span className="ac-card-icon">⏱️</span>
        <span className="ac-card-title">{card.title}</span>
        <span className="ac-card-sub">{formatDateShort(card.week_start)} – {formatDateShort(card.week_end)}</span>
      </div>
      <div className="ac-timesheet-total">
        <div className="ac-balance-bar" style={{ marginBottom: 4 }}>
          <div className="ac-balance-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
        </div>
        <span className="ac-muted"><strong style={{ color: barColor }}>{card.total_hours}h</strong> of {card.expected_hours}h logged</span>
      </div>
      {card.entries?.length > 0 && (
        <div className="ac-ts-entries">
          {card.entries.map(e => (
            <div key={e.date} className="ac-ts-row">
              <span className="ac-ts-day">{dayLabel(e.date)}</span>
              <span className="ac-ts-hours">{e.hours}h</span>
              {e.projects && <span className="ac-muted ac-ts-proj">{e.projects}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimesheetLoggedCard({ card }) {
  return (
    <div className="ac-card ac-timesheet-logged">
      <div className="ac-card-header">
        <span className="ac-card-icon">✅</span>
        <span className="ac-card-title">{card.title}</span>
      </div>
      <div className="ac-info-rows">
        <div className="ac-info-row"><span>Date</span><strong>{formatDate(card.work_date)}</strong></div>
        <div className="ac-info-row"><span>Hours</span><strong>{card.hours}h</strong></div>
        {card.project && <div className="ac-info-row"><span>Project</span><strong>{card.project}</strong></div>}
      </div>
    </div>
  );
}

function ObjectivesCard({ card }) {
  if (!card.objectives?.length) {
    return (
      <div className="ac-card ac-objectives">
        <div className="ac-card-header"><span className="ac-card-icon">🎯</span><span className="ac-card-title">{card.title}</span></div>
        <div className="ac-empty">No active objectives.</div>
      </div>
    );
  }
  return (
    <div className="ac-card ac-objectives">
      <div className="ac-card-header"><span className="ac-card-icon">🎯</span><span className="ac-card-title">{card.title}</span></div>
      {card.objectives.map(obj => (
        <div key={obj.id} className="ac-obj-row">
          <div className="ac-obj-header">
            <span className="ac-obj-title">{obj.title}</span>
            <span className="ac-obj-pct">{obj.progress}%</span>
          </div>
          <div className="ac-balance-bar">
            <div className="ac-balance-bar-fill" style={{ width: `${obj.progress}%`, background: "#1fbfb8" }} />
          </div>
          {obj.target_date && <div className="ac-muted" style={{ fontSize: "0.72rem", marginTop: 2 }}>Due {formatDate(obj.target_date)}</div>}
        </div>
      ))}
    </div>
  );
}

function KnowledgeResultsCard({ card }) {
  if (!card.results?.length) {
    return (
      <div className="ac-card ac-knowledge">
        <div className="ac-card-header"><span className="ac-card-icon">📚</span><span className="ac-card-title">{card.title}</span></div>
        <div className="ac-empty">No policy articles found.</div>
      </div>
    );
  }
  return (
    <div className="ac-card ac-knowledge">
      <div className="ac-card-header"><span className="ac-card-icon">📚</span><span className="ac-card-title">{card.title}</span></div>
      <div className="ac-kb-list">
        {card.results.map(r => (
          <div key={r.id} className="ac-kb-row">
            <div className="ac-kb-title">{r.title}</div>
            {r.category && <div className="ac-kb-cat">{r.category}</div>}
            {r.snippet && <div className="ac-kb-snippet">{r.snippet.slice(0, 180)}{r.snippet.length > 180 ? "…" : ""}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionCard({ card }) {
  switch (card.type) {
    case "leave_balance":      return <LeaveBalanceCard card={card} />;
    case "leave_submitted":    return <LeaveSubmittedCard card={card} />;
    case "calendar_events":    return <CalendarEventsCard card={card} />;
    case "event_created":      return <EventCreatedCard card={card} />;
    case "timesheet_summary":  return <TimesheetSummaryCard card={card} />;
    case "timesheet_logged":   return <TimesheetLoggedCard card={card} />;
    case "objectives":         return <ObjectivesCard card={card} />;
    case "knowledge_results":  return <KnowledgeResultsCard card={card} />;
    default:                   return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function formatDateShort(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
  catch { return iso; }
}
function formatDateTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
function dayLabel(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric" }); }
  catch { return iso; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suggestion chips
// ─────────────────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { label: "📋 Check leave balance", prompt: "What's my leave balance?" },
  { label: "🌴 Request leave", prompt: "I'd like to request annual leave" },
  { label: "📅 My calendar", prompt: "What's on my calendar this week?" },
  { label: "⏱️ Log hours", prompt: "Log 8 hours for today" },
  { label: "🎯 My objectives", prompt: "Show me my current objectives" },
  { label: "📚 Leave policy", prompt: "What is our leave policy?" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Typing indicator
// ─────────────────────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="chat-msg assistant">
      <div className="chat-avatar assistant-avatar">R</div>
      <div className="chat-bubble typing-bubble">
        <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Attachment pill
// ─────────────────────────────────────────────────────────────────────────────
function AttachmentPill({ att, onRemove }) {
  return (
    <div className="chat-attachment-pill">
      <span className="chat-att-icon">{att.mime_type?.startsWith("image/") ? "🖼️" : "📄"}</span>
      <span className="chat-att-name">{att.filename}</span>
      <button className="chat-att-remove" onClick={onRemove}>✕</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main EmployeeChat component
// ─────────────────────────────────────────────────────────────────────────────

export default function EmployeeChat() {
  const [messages, setMessages] = useState([]);  // { role, content, action_cards? }
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError]       = useState(null);

  const bottomRef   = useRef(null);
  const inputRef    = useRef(null);
  const fileInputRef = useRef(null);

  const isFirstLoad = messages.length === 0;

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  const historyForAPI = useCallback(() =>
    messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content }))
  , [messages]);

  async function handleSend(overrideText) {
    const text = (overrideText ?? input).trim();
    if (!text && attachments.length === 0) return;
    if (loading) return;

    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const body = {
        message: text,
        history: historyForAPI(),
        session_id: sessionId || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const res = await authFetch(`${API}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error ${res.status}`);
      }

      const data = await res.json();

      if (data.session_id && !sessionId) setSessionId(data.session_id);
      setAttachments([]);

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          action_cards: data.action_cards || [],
        },
      ]);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setMessages(prev => prev.slice(0, -1)); // remove optimistic user msg
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch(`${API}/api/v1/chat/upload-attachment`, { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Upload failed");
      }
      const att = await res.json();
      setAttachments(prev => [...prev, att]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadBusy(false);
    }
  }

  function handleNewChat() {
    setMessages([]);
    setSessionId(null);
    setInput("");
    setAttachments([]);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <div className="emp-chat-root">

      {/* ── Header ── */}
      <div className="emp-chat-header">
        <div className="emp-chat-header-left">
          <div className="emp-chat-avatar">R</div>
          <div>
            <div className="emp-chat-name">Rafiki AI</div>
            <div className="emp-chat-status">
              <span className="emp-chat-status-dot" />
              Agentic · can take actions on your behalf
            </div>
          </div>
        </div>
        <button className="emp-chat-new-btn" onClick={handleNewChat} title="New conversation">
          ✏️ New chat
        </button>
      </div>

      {/* ── Message list ── */}
      <div className="emp-chat-messages">

        {/* Welcome / empty state */}
        {isFirstLoad && (
          <div className="emp-chat-welcome">
            <div className="emp-chat-welcome-icon">✨</div>
            <div className="emp-chat-welcome-title">What can I help you with today?</div>
            <div className="emp-chat-welcome-sub">
              I can check your leave balance, book time off, log timesheets, look up policies, and more.
            </div>
            <div className="emp-chat-suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s.prompt} className="emp-chat-chip" onClick={() => handleSend(s.prompt)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            {msg.role === "assistant" && (
              <div className="chat-avatar assistant-avatar">R</div>
            )}
            <div className="chat-msg-body">
              <div className={`chat-bubble ${msg.role}-bubble`}>
                <MsgText text={msg.content} />
              </div>
              {/* Action cards rendered below assistant bubble */}
              {msg.action_cards?.length > 0 && (
                <div className="chat-action-cards">
                  {msg.action_cards.map((card, ci) => (
                    <ActionCard key={ci} card={card} />
                  ))}
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="chat-avatar user-avatar">You</div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {loading && <TypingDots />}

        {/* Error banner */}
        {error && (
          <div className="chat-error-banner">
            ⚠️ {error}
            <button onClick={() => setError(null)} className="chat-error-dismiss">✕</button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div className="emp-chat-input-area">

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="chat-attachments-row">
            {attachments.map((att, i) => (
              <AttachmentPill
                key={i}
                att={att}
                onRemove={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}

        <div className="emp-chat-input-row">
          {/* Attach button */}
          <button
            className="emp-chat-attach-btn"
            title="Attach a file"
            disabled={loading || uploadBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadBusy ? "⏳" : "📎"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={handleFileChange}
            accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx"
          />

          {/* Text input */}
          <textarea
            ref={inputRef}
            className="emp-chat-textarea"
            placeholder="Ask Rafiki anything, or request an action…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />

          {/* Send button */}
          <button
            className="emp-chat-send-btn"
            onClick={() => handleSend()}
            disabled={loading || (!input.trim() && attachments.length === 0)}
          >
            {loading ? <span className="send-spinner" /> : "↑"}
          </button>
        </div>

        <div className="emp-chat-input-hint">
          Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
