import { useState, useEffect, useRef } from "react";
import { API, authFetch } from "../api.js";
import "./MessagesPage.css";

// ── Payroll approval block renderer ─────────────────────────
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
    } catch { setDone("error:Network error"); }
    finally { setBusy(false); }
  }

  async function handleReject() {
    setBusy(true);
    try {
      const r = await authFetch(
        `${API}${payload.reject_endpoint}?reason=${encodeURIComponent(rejectReason)}`,
        { method: "POST" }
      );
      const data = await r.json();
      if (r.ok) { setDone("rejected"); onAction && onAction(); }
      else setDone("error:" + (data.detail || "Failed"));
    } catch { setDone("error:Network error"); }
    finally { setBusy(false); }
  }

  const statusLabel = {
    distributed: "Already distributed — no action needed",
    uploaded: "Already approved — HR admin can now parse",
    rejected: "Already rejected",
    uploaded_needs_approval: null,
  }[status];

  return (
    <div className="ms-payroll-block">
      <div className="ms-payroll-title">📌 Payroll Approval Request</div>
      <div className="ms-payroll-meta">
        <span>Month: <strong>{payload.month}</strong></span>
        <span>File: {payload.filename}</span>
        {payload.download_url && (
          <a href={payload.download_url} target="_blank" rel="noreferrer" className="ms-payroll-dl">
            Download file
          </a>
        )}
      </div>

      {done === "approved" && <div className="ms-payroll-status ok">✅ Approved</div>}
      {done === "rejected" && <div className="ms-payroll-status warn">❌ Rejected</div>}
      {done?.startsWith("error:") && <div className="ms-payroll-status err">{done.slice(6)}</div>}

      {!done && !isActionable && (
        <div className="ms-payroll-status muted">
          {statusLabel || "This request is no longer actionable"}
        </div>
      )}

      {!done && isActionable && !showReject && (
        <div className="ms-payroll-actions">
          <button className="btn btnPrimary" onClick={handleApprove} disabled={busy}>
            {busy ? "…" : "Approve"}
          </button>
          <button className="btn btnDanger" onClick={() => setShowReject(true)} disabled={busy}>
            Reject
          </button>
        </div>
      )}

      {!done && isActionable && showReject && (
        <div className="ms-payroll-reject">
          <input
            className="ms-payroll-reason"
            placeholder="Reason for rejection (optional)"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
          />
          <div className="ms-payroll-actions">
            <button className="btn btnDanger" onClick={handleReject} disabled={busy}>
              {busy ? "…" : "Confirm Reject"}
            </button>
            <button className="btn btnGhost" onClick={() => setShowReject(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Objective review block renderer ──────────────────────────
function ObjectiveReviewBlock({ payload, onAction }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [showRevision, setShowRevision] = useState(false);
  const [objStatus, setObjStatus] = useState(null);

  useEffect(() => {
    if (!payload.objective_id) return;
    authFetch(`${API}/api/v1/objectives/${payload.objective_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.status) setObjStatus(data.status); })
      .catch(() => {});
  }, [payload.objective_id]);

  const isActionable = objStatus === "pending_review";

  async function handleApprove() {
    setBusy(true);
    try {
      const r = await authFetch(`${API}${payload.approve_endpoint}`, {
        method: "POST",
        body: JSON.stringify({ review_status: "approved" }),
      });
      const data = await r.json();
      if (r.ok) { setDone("approved"); onAction && onAction(); }
      else setDone("error:" + (data.detail || "Failed"));
    } catch { setDone("error:Network error"); }
    finally { setBusy(false); }
  }

  async function handleNeedsRevision() {
    setBusy(true);
    try {
      const r = await authFetch(`${API}${payload.reject_endpoint}`, {
        method: "POST",
        body: JSON.stringify({ review_status: "needs_revision", review_notes: revisionNotes || null }),
      });
      const data = await r.json();
      if (r.ok) { setDone("needs_revision"); onAction && onAction(); }
      else setDone("error:" + (data.detail || "Failed"));
    } catch { setDone("error:Network error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="ms-payroll-block">
      <div className="ms-payroll-title">📋 Objective Review Request</div>
      <div className="ms-payroll-meta">
        <span>Title: <strong>{payload.title}</strong></span>
        <span>From: {payload.submitter_name}</span>
        <span>Progress: {payload.progress}%</span>
        {payload.target_date && <span>Due: {payload.target_date}</span>}
      </div>
      {payload.description && (
        <div style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0" }}>{payload.description}</div>
      )}
      {payload.key_results_summary && payload.key_results_summary !== "None" && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Key Results: {payload.key_results_summary}</div>
      )}

      {done === "approved" && <div className="ms-payroll-status ok">Approved</div>}
      {done === "needs_revision" && <div className="ms-payroll-status warn">Sent back for revision</div>}
      {done?.startsWith("error:") && <div className="ms-payroll-status err">{done.slice(6)}</div>}

      {!done && !isActionable && objStatus && (
        <div className="ms-payroll-status muted">
          {objStatus === "active" ? "Already approved" : objStatus === "draft" ? "Already sent back for revision" : "No longer pending review"}
        </div>
      )}

      {!done && isActionable && !showRevision && (
        <div className="ms-payroll-actions">
          <button className="btn btnPrimary" onClick={handleApprove} disabled={busy}>
            {busy ? "…" : "Approve"}
          </button>
          <button className="btn btnDanger" onClick={() => setShowRevision(true)} disabled={busy}>
            Needs Revision
          </button>
        </div>
      )}

      {!done && isActionable && showRevision && (
        <div className="ms-payroll-reject">
          <input
            className="ms-payroll-reason"
            placeholder="Review notes (optional)"
            value={revisionNotes}
            onChange={e => setRevisionNotes(e.target.value)}
          />
          <div className="ms-payroll-actions">
            <button className="btn btnDanger" onClick={handleNeedsRevision} disabled={busy}>
              {busy ? "…" : "Confirm"}
            </button>
            <button className="btn btnGhost" onClick={() => setShowRevision(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Parse [[PAYROLL_APPROVAL]]...[[/PAYROLL_APPROVAL]] and [[OBJECTIVE_REVIEW]]...[[/OBJECTIVE_REVIEW]] out of message content
function MessageContent({ content, onAction }) {
  // Check for payroll approval
  const payrollMarker = "[[PAYROLL_APPROVAL]]";
  const payrollEnd = "[[/PAYROLL_APPROVAL]]";
  const payrollStart = content.indexOf(payrollMarker);
  if (payrollStart !== -1) {
    const pEnd = content.indexOf(payrollEnd, payrollStart);
    const before = content.slice(0, payrollStart).trim();
    const jsonStr = content.slice(payrollStart + payrollMarker.length, pEnd === -1 ? undefined : pEnd);
    let payload = {};
    try { payload = JSON.parse(jsonStr); } catch { /* fallback */ }
    return (
      <div>
        {before && <div style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>{before}</div>}
        <PayrollApprovalBlock payload={payload} onAction={onAction} />
      </div>
    );
  }

  // Check for objective review
  const objMarker = "[[OBJECTIVE_REVIEW]]";
  const objEnd = "[[/OBJECTIVE_REVIEW]]";
  const objStart = content.indexOf(objMarker);
  if (objStart !== -1) {
    const oEnd = content.indexOf(objEnd, objStart);
    const before = content.slice(0, objStart).trim();
    const jsonStr = content.slice(objStart + objMarker.length, oEnd === -1 ? undefined : oEnd);
    let payload = {};
    try { payload = JSON.parse(jsonStr); } catch { /* fallback */ }
    return (
      <div>
        {before && <div style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>{before}</div>}
        <ObjectiveReviewBlock payload={payload} onAction={onAction} />
      </div>
    );
  }

  return <div style={{ whiteSpace: "pre-wrap" }}>{content}</div>;
}

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
                      <MessageContent content={m.content} onAction={() => loadThread(activeConvo.id)} />
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
