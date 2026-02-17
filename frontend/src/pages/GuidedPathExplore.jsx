import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../api.js";
import "./GuidedPathExplore.css";

const ICON_MAP = {
  fire: "&#128293;",
  wind: "&#127744;",
  cloud: "&#9729;",
  brain: "&#129504;",
  heart: "&#10084;",
  star: "&#11088;",
};

function ModuleIcon({ icon }) {
  const html = ICON_MAP[icon] || ICON_MAP.brain;
  return <span className="gpe-icon" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function GuidedPathExplore() {
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [modRes, sugRes] = await Promise.all([
          fetch(`${API}/api/v1/guided-paths/modules`),
          fetch(`${API}/api/v1/guided-paths/suggest`, { method: "POST" }),
        ]);
        if (modRes.ok) setModules(await modRes.json());
        if (sugRes.ok) {
          const data = await sugRes.json();
          setSuggestions(data.suggestions || []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="gpe-page">
        <div className="gpe-loading">Loading modules...</div>
      </div>
    );
  }

  return (
    <div className="gpe-page">
      <h1 className="gpe-heading">Guided Paths</h1>
      <p className="gpe-subtitle">
        Short, guided exercises to help you reset, reflect, and recharge.
      </p>

      {suggestions.length > 0 && (
        <section className="gpe-section">
          <h2 className="gpe-section-title">Suggested for you</h2>
          <div className="gpe-grid">
            {suggestions.map((mod) => (
              <button
                key={mod.id}
                className="gpe-card gpe-card-suggested"
                onClick={() => navigate(`/guided-paths/${mod.id}`)}
              >
                <ModuleIcon icon={mod.icon} />
                <div className="gpe-card-body">
                  <strong>{mod.name}</strong>
                  <span className="gpe-card-meta">{mod.duration_minutes} min</span>
                  {mod.description && <p className="gpe-card-desc">{mod.description}</p>}
                  {mod.match_reason && (
                    <span className="gpe-card-reason">{mod.match_reason}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="gpe-section">
        <h2 className="gpe-section-title">All modules</h2>
        {modules.length === 0 ? (
          <p className="gpe-empty">No modules available yet.</p>
        ) : (
          <div className="gpe-grid">
            {modules.map((mod) => (
              <button
                key={mod.id}
                className="gpe-card"
                onClick={() => navigate(`/guided-paths/${mod.id}`)}
              >
                <ModuleIcon icon={mod.icon} />
                <div className="gpe-card-body">
                  <strong>{mod.name}</strong>
                  <span className="gpe-card-meta">
                    {mod.duration_minutes} min &middot; {mod.category}
                  </span>
                  {mod.description && <p className="gpe-card-desc">{mod.description}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
