import { useState, useEffect, useRef } from "react";
import { API, authFetch } from "../api.js";
import "./MessagesPage.css";

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessagesPage() {
  const currentUser = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const myId = currentUser.id;

  const [tab, setTab] = useState("wall");

  // Wall state
  const [wallMsgs, setWallMsgs] = useState([]);
  const [wallInput, setWallInput] = useState("");

  // DM state
  const [conversations, setConversations] = useState([]);
  const [activeConvo, setActiveConvo] = useState(null);
  const [thread, setThread] = useState([]);
  const [dmInput, setDmInput] = useState("");
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [colleagues, setColleagues] = useState([]);
  const [newRecipient, setNewRecipient] = useState("");
  const [newMsgContent, setNewMsgContent] = useState("");

  const threadEndRef = useRef(null);

  // ── Loaders ──
  const loadWall = async () => {
    const res = await authFetch(`${API}/api/v1/messages/wall`);
    if (res.ok) setWallMsgs(await res.json());
  };

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

  useEffect(() => {
    if (tab === "wall") loadWall();
    else { loadConversations(); loadColleagues(); }
  }, [tab]);

  useEffect(() => {
    if (activeConvo) loadThread(activeConvo.id);
  }, [activeConvo?.id]);

  // Scroll thread to bottom
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  // Polling
  useEffect(() => {
    const iv = setInterval(() => {
      if (tab === "wall") loadWall();
      else {
        loadConversations();
        if (activeConvo) loadThread(activeConvo.id);
      }
    }, 15000);
    return () => clearInterval(iv);
  }, [tab, activeConvo?.id]);

  // ── Wall Actions ──
  const postWall = async () => {
    if (!wallInput.trim()) return;
    const res = await authFetch(`${API}/api/v1/messages/wall`, { method: "POST", body: JSON.stringify({ content: wallInput }) });
    if (res.ok) { setWallInput(""); loadWall(); }
  };

  const deleteWall = async (id) => {
    await authFetch(`${API}/api/v1/messages/wall/${id}`, { method: "DELETE" });
    loadWall();
  };

  // ── DM Actions ──
  const sendDM = async () => {
    if (!dmInput.trim() || !activeConvo) return;
    const res = await authFetch(`${API}/api/v1/messages/conversations/${activeConvo.id}/messages`, {
      method: "POST", body: JSON.stringify({ content: dmInput }),
    });
    if (res.ok) { setDmInput(""); loadThread(activeConvo.id); loadConversations(); }
  };

  const startNewConvo = async () => {
    if (!newRecipient || !newMsgContent.trim()) return;
    const res = await authFetch(`${API}/api/v1/messages/conversations`, {
      method: "POST", body: JSON.stringify({ recipient_id: newRecipient, content: newMsgContent }),
    });
    if (res.ok) {
      const convo = await res.json();
      setShowNewMsg(false);
      setNewRecipient("");
      setNewMsgContent("");
      loadConversations();
      setActiveConvo(convo);
    }
  };

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);

  return (
    <div className="ms-page">
      <div className="ms-tabs">
        <button className={`ms-tab${tab === "wall" ? " active" : ""}`} onClick={() => setTab("wall")}>
          Wall
        </button>
        <button className={`ms-tab${tab === "dm" ? " active" : ""}`} onClick={() => setTab("dm")}>
          Messages
          {totalUnread > 0 && <span className="ms-tab-badge">{totalUnread}</span>}
        </button>
      </div>

      {tab === "wall" && (
        <div className="ms-wall">
          <div className="ms-wall-input">
            <textarea
              value={wallInput}
              onChange={e => setWallInput(e.target.value)}
              placeholder="Share something with your org..."
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postWall(); } }}
            />
            <button className="btn btnPrimary" onClick={postWall} disabled={!wallInput.trim()}>Post</button>
          </div>
          <div className="ms-wall-feed">
            {wallMsgs.length === 0 && <div className="ms-empty">No messages yet. Be the first to post!</div>}
            {wallMsgs.map(m => (
              <div key={m.id} className={`ms-wall-msg${m.is_pinned ? " pinned" : ""}`}>
                {m.is_pinned && <div className="ms-wall-pin">Pinned</div>}
                <div className="ms-wall-msg-header">
                  <span className="ms-wall-author">{m.author_name}</span>
                  <span className="ms-wall-time">
                    {timeAgo(m.created_at)}
                    {m.user_id === myId && (
                      <button className="ms-wall-delete" onClick={() => deleteWall(m.id)}>×</button>
                    )}
                  </span>
                </div>
                <div className="ms-wall-content">{m.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "dm" && (
        <div className="ms-dm">
          <div className="ms-dm-sidebar">
            <div className="ms-dm-sidebar-header">
              <button className="btn btnTiny btnPrimary" style={{ width: "100%" }} onClick={() => { setShowNewMsg(true); setActiveConvo(null); }}>
                New Message
              </button>
            </div>
            <div className="ms-dm-list">
              {conversations.map(c => (
                <div key={c.id} className={`ms-dm-item${activeConvo?.id === c.id ? " active" : ""}`} onClick={() => { setActiveConvo(c); setShowNewMsg(false); }}>
                  <div className="ms-dm-item-top">
                    <span className="ms-dm-item-name">{c.other_user_name}</span>
                    <span className="ms-dm-item-time">{timeAgo(c.last_message_at)}</span>
                  </div>
                  <div className="ms-dm-item-preview">
                    {c.unread_count > 0 && <span className="ms-dm-unread">{c.unread_count}</span>}{" "}
                    {c.last_message || "No messages"}
                  </div>
                </div>
              ))}
              {conversations.length === 0 && <div className="ms-empty" style={{ padding: "20px" }}>No conversations</div>}
            </div>
          </div>

          <div className="ms-dm-panel">
            {showNewMsg ? (
              <div className="ms-new-msg">
                <h4>New Message</h4>
                <select value={newRecipient} onChange={e => setNewRecipient(e.target.value)}>
                  <option value="">Select a colleague...</option>
                  {colleagues.map(c => (
                    <option key={c.id} value={c.id}>{c.name || c.email}</option>
                  ))}
                </select>
                <textarea
                  value={newMsgContent}
                  onChange={e => setNewMsgContent(e.target.value)}
                  placeholder="Write your message..."
                  rows={3}
                />
                <div className="ms-new-msg-actions">
                  <button className="btn btnPrimary" onClick={startNewConvo} disabled={!newRecipient || !newMsgContent.trim()}>Send</button>
                  <button className="btn btnGhost" onClick={() => setShowNewMsg(false)}>Cancel</button>
                </div>
              </div>
            ) : activeConvo ? (
              <>
                <div className="ms-dm-panel-header">{activeConvo.other_user_name}</div>
                <div className="ms-dm-thread">
                  {thread.map(m => (
                    <div key={m.id} className={`ms-dm-msg ${m.sender_id === myId ? "mine" : "theirs"}`}>
                      <div>{m.content}</div>
                      <div className="ms-dm-msg-time">{fmtTime(m.created_at)}</div>
                    </div>
                  ))}
                  <div ref={threadEndRef} />
                </div>
                <div className="ms-dm-input">
                  <textarea
                    value={dmInput}
                    onChange={e => setDmInput(e.target.value)}
                    placeholder="Type a message..."
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDM(); } }}
                  />
                  <button className="btn btnPrimary" onClick={sendDM} disabled={!dmInput.trim()}>Send</button>
                </div>
              </>
            ) : (
              <div className="ms-dm-empty">Select a conversation or start a new one</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
