import { useState, useEffect } from "react";
import { API } from "../api.js";
import "./ManagerToolkit.css";

const CATEGORIES = [
  { key: "", label: "All" },
  { key: "coaching", label: "Coaching" },
  { key: "pip", label: "PIP" },
  { key: "conflict", label: "Conflict" },
  { key: "development", label: "Development" },
  { key: "conversation", label: "Conversation" },
  { key: "compliance", label: "Compliance" },
];

export default function ManagerToolkit() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [selectedModule, setSelectedModule] = useState(null);

  useEffect(() => {
    loadModules();
  }, [filter]);

  function loadModules() {
    const url = filter
      ? `${API}/api/v1/manager/toolkit?category=${filter}`
      : `${API}/api/v1/manager/toolkit`;

    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((data) => setModules(Array.isArray(data) ? data : []))
      .catch(() => setModules([]))
      .finally(() => setLoading(false));
  }

  function openModule(mod) {
    setSelectedModule(mod);
  }

  return (
    <div className="mgr-toolkit">
      <h1 className="mgr-toolkit-title">HR Toolkit</h1>
      <p className="mgr-toolkit-sub">
        Playbooks, templates, and conversation frameworks for managers.
      </p>

      {/* Category filter */}
      <div className="mgr-toolkit-filters">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`mgr-filter-chip ${filter === c.key ? "active" : ""}`}
            onClick={() => { setFilter(c.key); setSelectedModule(null); }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {selectedModule ? (
        /* Module detail view */
        <div className="mgr-toolkit-detail">
          <button
            className="btn btnTiny mgr-back-btn"
            onClick={() => setSelectedModule(null)}
          >
            &larr; Back to list
          </button>

          <h2 className="mgr-module-title">{selectedModule.title}</h2>
          <span className="mgr-module-category">{selectedModule.category}</span>

          {selectedModule.content?.sections?.map((section, i) => (
            <div key={i} className="mgr-module-section">
              <h3>{section.heading}</h3>
              <p>{section.body}</p>
              {section.prompts && section.prompts.length > 0 && (
                <div className="mgr-module-prompts">
                  <div className="mgr-prompts-label">Suggested prompts:</div>
                  <ul>
                    {section.prompts.map((p, j) => (
                      <li key={j} className="mgr-prompt-item">&ldquo;{p}&rdquo;</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Module list */
        loading ? (
          <p className="mgr-loading">Loading toolkit...</p>
        ) : modules.length === 0 ? (
          <p className="mgr-toolkit-empty">
            No toolkit modules found. Ask your HR admin to seed the default modules.
          </p>
        ) : (
          <div className="mgr-toolkit-grid">
            {modules.map((m) => (
              <button
                key={m.id}
                className="mgr-toolkit-card"
                onClick={() => openModule(m)}
              >
                <span className="mgr-toolkit-card-cat">{m.category}</span>
                <strong className="mgr-toolkit-card-title">{m.title}</strong>
                <span className="mgr-toolkit-card-meta">
                  v{m.version} · {m.language}
                  {m.org_id ? " · Custom" : " · Platform"}
                </span>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
