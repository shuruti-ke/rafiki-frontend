import { useEffect, useRef, useState } from "react";
import { API, authFetch } from "../api.js";
import "./EmployeeChat.css";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState([
    { role: "rafiki", text: "Hi! I'm Rafiki, your workplace wellbeing assistant. How can I support you today?" },
  ]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setMsgs((m) => [...m, { role: "you", text: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      // Build conversation history (skip the initial greeting, map roles)
      const history = msgs
        .filter((m, i) => !(i === 0 && m.role === "rafiki"))
        .map(m => ({
          role: m.role === "you" ? "user" : "assistant",
          content: m.text,
        }));

      const res = await authFetch(`${API}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });
      const data = await res.json();
      setMsgs((m) => [...m, { role: "rafiki", text: data.reply ?? "..." }]);
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
  );
}
