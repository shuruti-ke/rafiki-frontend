import { useEffect, useRef, useState, useCallback } from "react";
import { API, authFetch } from "../api.js";
import "./EmployeeChat.css";

const GREETING = { role: "rafiki", text: "Hi! I'm Rafiki, your workplace wellbeing assistant. How can I support you today?" };

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState([GREETING]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const endRef = useRef(null);

  // Load sessions list
  const loadSessions = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/v1/chat/sessions`);
      if (res.ok) setSessions(await res.json());
    } catch {}
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  // Load a specific session's messages
  async function loadSession(id) {
    try {
      const res = await authFetch(`${API}/api/v1/chat/sessions/${id}/messages`);
      if (!res.ok) return;
      const messages = await res.json();
      setSessionId(id);
      setMsgs([
        GREETING,
        ...messages.map(m => ({
          role: m.role === "user" ? "you" : "rafiki",
          text: m.content,
        })),
      ]);
    } catch {}
  }

  function startNewChat() {
    setSessionId(null);
    setMsgs([GREETING]);
    setInput("");
  }

  async function deleteSession(e, id) {
    e.stopPropagation();
    try {
      await authFetch(`${API}/api/v1/chat/sessions/${id}`, { method: "DELETE" });
      setSessions(s => s.filter(x => x.id !== id));
      if (sessionId === id) startNewChat();
    } catch {}
  }

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setMsgs((m) => [...m, { role: "you", text: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const history = msgs
        .filter((m, i) => !(i === 0 && m.role === "rafiki"))
        .map(m => ({
          role: m.role === "you" ? "user" : "assistant",
          content: m.text,
        }));

      const body = { message: trimmed, history };
      if (sessionId) body.session_id = sessionId;

      const res = await authFetch(`${API}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setMsgs((m) => [...m, { role: "rafiki", text: data.reply ?? "..." }]);

      // Store session id from response
      if (data.session_id && !sessionId) {
        setSessionId(data.session_id);
      }
      // Refresh sidebar
      loadSessions();
    } catch {
      setMsgs((m) => [
        ...m,
        { role: "rafiki", text: "Something went wrong. Please try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="ec-layout">
      {/* Sidebar */}
      <div className={`ec-sidebar ${sidebarOpen ? "" : "ec-sidebar-collapsed"}`}>
        <button className="ec-new-chat-btn" onClick={startNewChat}>+ New Chat</button>
        <div className="ec-session-list">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`ec-session-item ${s.id === sessionId ? "ec-session-active" : ""}`}
              onClick={() => loadSession(s.id)}
            >
              <div className="ec-session-title">{s.title}</div>
              <div className="ec-session-meta">
                <span className="ec-session-date">{timeAgo(s.updated_at)}</span>
                <button className="ec-session-delete" onClick={e => deleteSession(e, s.id)} title="Delete">×</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Toggle sidebar on mobile */}
      <button className="ec-sidebar-toggle" onClick={() => setSidebarOpen(o => !o)}>
        {sidebarOpen ? "◀" : "▶"}
      </button>

      {/* Main chat */}
      <div className="ec-page">
        <div className="ec-header">
          <div className="ec-brand">
            <div className="logoDot" />
            <div>
              <div className="ec-title">Rafiki</div>
              <div className="ec-subtitle">Your workplace wellbeing assistant</div>
            </div>
          </div>
        </div>

        <div className="ec-messages">
          {msgs.map((m, i) => (
            <div key={i} className={`ec-msg ${m.role}`}>
              <div className="ec-bubble">
                <div className="ec-who">{m.role === "you" ? "You" : "Rafiki"}</div>
                <div className="ec-text">{m.text}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="ec-msg rafiki">
              <div className="ec-bubble">
                <div className="ec-who">Rafiki</div>
                <div className="ec-text ec-typing">typing...</div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        <div className="ec-composer">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="How are you feeling today?"
            rows={2}
          />
          <button className="btn btnPrimary" onClick={send} disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
