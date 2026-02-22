import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API, authFetch } from "../api.js";
import "./GuidedPathRunner.css";

const THEMES = [
  { key: "stress", label: "Stress" },
  { key: "anxiety", label: "Anxiety" },
  { key: "workload", label: "Workload" },
  { key: "conflict", label: "Conflict" },
  { key: "sleep", label: "Sleep" },
  { key: "financial", label: "Finances" },
  { key: "motivation", label: "Motivation" },
];

const TIME_OPTIONS = [
  { minutes: 2, label: "2 min" },
  { minutes: 5, label: "5 min" },
  { minutes: 10, label: "10 min" },
];

function getEmbedUrl(url) {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return null;
}

function stressBandFromRating(rating) {
  if (rating <= 3) return "low";
  if (rating <= 6) return "moderate";
  if (rating <= 8) return "high";
  return "crisis";
}

export default function GuidedPathRunner() {
  const { moduleId } = useParams();
  const navigate = useNavigate();

  // Context collection phase
  const [phase, setPhase] = useState("context"); // context | running | outcome | completed
  const [preRating, setPreRating] = useState(5);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [selectedTime, setSelectedTime] = useState(5);

  // Session state
  const [sessionId, setSessionId] = useState(null);
  const [moduleName, setModuleName] = useState("");
  const [step, setStep] = useState(null);
  const [status, setStatus] = useState("");
  const [userInput, setUserInput] = useState("");
  const [rating, setRating] = useState(5);
  const [loading, setLoading] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  // Outcome phase
  const [postRating, setPostRating] = useState(5);

  async function handleStartSession() {
    setLoading(true);
    setPhase("running");
    try {
      const body = {
        stress_band: stressBandFromRating(preRating),
        theme_category: selectedTheme,
        available_time: selectedTime,
        pre_rating: preRating,
      };
      const res = await authFetch(`${API}/api/v1/guided-paths/modules/${moduleId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to start session");
      const data = await res.json();
      setSessionId(data.session_id);
      setModuleName(data.module_name);
      setStep(data.step);
      setStatus(data.status);
    } catch {
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdvance() {
    if (!sessionId) return;
    setAdvancing(true);
    try {
      let response = null;
      if (step?.expected_input === "free_text") response = userInput;
      else if (step?.expected_input === "rating_0_10") response = String(rating);

      const res = await authFetch(`${API}/api/v1/guided-paths/sessions/${sessionId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (!res.ok) throw new Error("Failed to advance");
      const data = await res.json();

      if (data.completed) {
        setPhase("outcome");
        setStep(null);
      } else {
        setStep(data.step);
        setStatus(data.status);
        setUserInput("");
        setRating(5);
      }
    } finally {
      setAdvancing(false);
    }
  }

  async function handleSubmitOutcome() {
    try {
      await authFetch(`${API}/api/v1/guided-paths/sessions/${sessionId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pre_rating: preRating, post_rating: postRating }),
      });
    } catch {
      // non-critical
    }
    setPhase("completed");
  }

  // ─── Context collection screen ─────────────────────────────────────

  if (phase === "context") {
    return (
      <div className="gpr-page">
        <div className="gpr-context-screen">
          <h2>Before we begin</h2>
          <p className="gpr-context-subtitle">
            Help us personalise this session for you.
          </p>

          <div className="gpr-context-section">
            <label>How are you feeling right now?</label>
            <div className="gpr-rating">
              <input
                type="range" min="0" max="10"
                value={preRating}
                onChange={(e) => setPreRating(Number(e.target.value))}
              />
              <div className="gpr-rating-labels">
                <span>0 - Great</span><span>5</span><span>10 - Struggling</span>
              </div>
              <div className="gpr-rating-value">{preRating}</div>
            </div>
          </div>

          <div className="gpr-context-section">
            <label>What's on your mind?</label>
            <div className="gpr-theme-chips">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  className={`gpr-chip ${selectedTheme === t.key ? "active" : ""}`}
                  onClick={() => setSelectedTheme(selectedTheme === t.key ? null : t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="gpr-context-section">
            <label>How much time do you have?</label>
            <div className="gpr-time-options">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={t.minutes}
                  className={`gpr-time-btn ${selectedTime === t.minutes ? "active" : ""}`}
                  onClick={() => setSelectedTime(t.minutes)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="gpr-actions" style={{ marginTop: 24 }}>
            <button className="btn btnTiny" onClick={() => navigate(-1)}>Cancel</button>
            <button className="btn btnPrimary" onClick={handleStartSession}>
              Start Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Loading ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="gpr-page">
        <div className="gpr-loading">Preparing your session...</div>
      </div>
    );
  }

  // ─── Error ─────────────────────────────────────────────────────────

  if (status === "error") {
    return (
      <div className="gpr-page">
        <div className="gpr-error">
          <p>Failed to start this module.</p>
          <button className="btn" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  // ─── Outcome screen (post-rating) ─────────────────────────────────

  if (phase === "outcome") {
    return (
      <div className="gpr-page">
        <div className="gpr-outcome-screen">
          <div className="gpr-complete-icon">&#10003;</div>
          <h2>Nice work!</h2>
          <p>You've finished <strong>{moduleName}</strong>.</p>

          <div className="gpr-context-section" style={{ marginTop: 24 }}>
            <label>How do you feel now?</label>
            <div className="gpr-rating">
              <input
                type="range" min="0" max="10"
                value={postRating}
                onChange={(e) => setPostRating(Number(e.target.value))}
              />
              <div className="gpr-rating-labels">
                <span>0 - Same</span><span>5</span><span>10 - Much better</span>
              </div>
              <div className="gpr-rating-value">{postRating}</div>
            </div>
          </div>

          <div className="gpr-actions" style={{ marginTop: 24 }}>
            <button className="btn btnPrimary" onClick={handleSubmitOutcome}>
              Submit & Finish
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Completed ─────────────────────────────────────────────────────

  if (phase === "completed") {
    return (
      <div className="gpr-page">
        <div className="gpr-complete">
          <div className="gpr-complete-icon">&#10003;</div>
          <h2>Session Complete</h2>
          <p>Thank you for taking time for yourself today.</p>
          <button className="btn btnPrimary" onClick={() => navigate("/guided-paths")}>
            Explore More
          </button>
        </div>
      </div>
    );
  }

  // ─── Step runner (main flow) ───────────────────────────────────────

  if (!step) return null;

  const embedUrl = step?.type === "video" && step?.media_url ? getEmbedUrl(step.media_url) : null;
  const isDirectVideo = step?.type === "video" && step?.media_url && !embedUrl;

  return (
    <div className="gpr-page">
      <div className="gpr-header">
        <button className="btn btnTiny" onClick={() => navigate(-1)}>&larr; Exit</button>
        <span className="gpr-title">{moduleName}</span>
        <span className="gpr-progress">
          Step {step.step_index + 1} of {step.total_steps}
        </span>
      </div>

      <div className="gpr-progress-bar">
        <div
          className="gpr-progress-fill"
          style={{ width: `${((step.step_index + 1) / step.total_steps) * 100}%` }}
        />
      </div>

      <div className="gpr-step-card">
        <span className="gpr-step-type">{step.type}</span>

        {step.type === "video" && step.media_url && (
          <div className="gpr-video-container">
            {embedUrl ? (
              <iframe
                src={embedUrl}
                title="Video content"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : isDirectVideo ? (
              <video controls src={step.media_url}>
                Your browser does not support video playback.
              </video>
            ) : null}
          </div>
        )}

        {step.type === "audio" && step.media_url && (
          <div className="gpr-audio-container">
            <audio controls src={step.media_url}>
              Your browser does not support audio playback.
            </audio>
          </div>
        )}

        <div className="gpr-message">{step.message}</div>

        {step.expected_input === "free_text" && (
          <textarea
            className="gpr-input"
            placeholder="Type your response..."
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
          />
        )}

        {step.expected_input === "rating_0_10" && (
          <div className="gpr-rating">
            <label>Rating: {rating}</label>
            <input
              type="range" min="0" max="10"
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
            />
            <div className="gpr-rating-labels">
              <span>0</span><span>5</span><span>10</span>
            </div>
          </div>
        )}

        <div className="gpr-actions">
          <button
            className="btn btnPrimary"
            onClick={handleAdvance}
            disabled={advancing || (step.expected_input === "free_text" && !userInput.trim())}
          >
            {advancing ? "..." : step.step_index + 1 === step.total_steps ? "Finish" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
