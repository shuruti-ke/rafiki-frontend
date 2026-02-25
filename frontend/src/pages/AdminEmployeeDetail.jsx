import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { API, authFetch } from "../api.js";
import "./AdminEmployeeDetail.css";

export default function AdminEmployeeDetail() {
  const { userId } = useParams();
  const [tab, setTab] = useState("documents");
  const [documents, setDocuments] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [disciplinary, setDisciplinary] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Evaluation form
  const [showEvalForm, setShowEvalForm] = useState(false);
  const [evalPeriod, setEvalPeriod] = useState("");
  const [evalRating, setEvalRating] = useState(3);
  const [evalStrengths, setEvalStrengths] = useState("");
  const [evalImprove, setEvalImprove] = useState("");
  const [evalGoals, setEvalGoals] = useState("");
  const [evalComments, setEvalComments] = useState("");

  // Credentials
  const [credentials, setCredentials] = useState(null);
  const [credLoading, setCredLoading] = useState(false);
  const [credResetLoading, setCredResetLoading] = useState(false);
  const [credCopied, setCredCopied] = useState(false);

  // Disciplinary form
  const [showDiscForm, setShowDiscForm] = useState(false);
  const [discType, setDiscType] = useState("verbal_warning");
  const [discDesc, setDiscDesc] = useState("");
  const [discDate, setDiscDate] = useState("");
  const [discOutcome, setDiscOutcome] = useState("");

  async function fetchDocuments() {
    const res = await fetch(`${API}/api/v1/employee-docs/${userId}`);
    setDocuments(await res.json());
  }

  async function fetchEvaluations() {
    const res = await fetch(`${API}/api/v1/employee-docs/${userId}/evaluations`);
    setEvaluations(await res.json());
  }

  async function fetchDisciplinary() {
    const res = await fetch(`${API}/api/v1/employee-docs/${userId}/disciplinary`);
    setDisciplinary(await res.json());
  }

  async function fetchCredentials() {
    setCredLoading(true);
    try {
      const res = await authFetch(`${API}/api/v1/employees/${userId}/credentials`);
      if (res.ok) setCredentials(await res.json());
    } finally {
      setCredLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!confirm("Generate a new temporary password for this employee?")) return;
    setCredResetLoading(true);
    try {
      const res = await authFetch(`${API}/api/v1/employees/${userId}/reset-password`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setCredentials((prev) => ({ ...prev, initial_password: data.temporary_password }));
      }
    } finally {
      setCredResetLoading(false);
    }
  }

  function copyCredentials() {
    if (!credentials) return;
    const text = `Email: ${credentials.email}\nPassword: ${credentials.initial_password || "(not set)"}`;
    navigator.clipboard.writeText(text);
    setCredCopied(true);
    setTimeout(() => setCredCopied(false), 2000);
  }

  useEffect(() => {
    fetchDocuments();
    fetchEvaluations();
    fetchDisciplinary();
  }, [userId]);

  async function handleUploadDoc(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const title = prompt("Document title:");
    if (!title) return;
    const docType = prompt("Document type (contract, id_document, certificate, letter, other):", "other") || "other";

    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const params = new URLSearchParams({ title, doc_type: docType });

    try {
      await fetch(`${API}/api/v1/employee-docs/${userId}/upload?${params}`, { method: "POST", body: fd });
      fetchDocuments();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDeleteDoc(docId) {
    if (!confirm("Delete this document?")) return;
    await fetch(`${API}/api/v1/employee-docs/${userId}/${docId}`, { method: "DELETE" });
    fetchDocuments();
  }

  async function handleCreateEval(e) {
    e.preventDefault();
    await fetch(`${API}/api/v1/employee-docs/${userId}/evaluations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evaluation_period: evalPeriod,
        evaluator_id: 1,
        overall_rating: evalRating,
        strengths: evalStrengths || null,
        areas_for_improvement: evalImprove || null,
        goals_for_next_period: evalGoals || null,
        comments: evalComments || null,
      }),
    });
    setShowEvalForm(false);
    setEvalPeriod(""); setEvalRating(3); setEvalStrengths(""); setEvalImprove(""); setEvalGoals(""); setEvalComments("");
    fetchEvaluations();
  }

  async function handleCreateDisc(e) {
    e.preventDefault();
    await fetch(`${API}/api/v1/employee-docs/${userId}/disciplinary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        record_type: discType,
        description: discDesc,
        date_of_incident: discDate,
        outcome: discOutcome || null,
      }),
    });
    setShowDiscForm(false);
    setDiscType("verbal_warning"); setDiscDesc(""); setDiscDate(""); setDiscOutcome("");
    fetchDisciplinary();
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  const ratingStars = (n) => {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={i < n ? "aed-star-filled" : "aed-star-empty"}>*</span>
    ));
  };

  return (
    <div className="aed-page">
      <div className="aed-header">
        <Link to="/admin/employees" className="btn btnTiny">Back</Link>
        <h1>Employee #{userId}</h1>
      </div>

      <div className="aed-tabs">
        {["documents", "evaluations", "disciplinary", "credentials"].map((t) => (
          <button
            key={t}
            className={`aed-tab ${tab === t ? "active" : ""}`}
            onClick={() => {
              setTab(t);
              if (t === "credentials" && !credentials) fetchCredentials();
            }}
          >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {/* Documents Tab */}
      {tab === "documents" && (
        <div className="aed-section">
          <div className="aed-section-head">
            <h2>Documents ({documents.length})</h2>
            <label className="btn btnPrimary">
              {uploading ? "Uploading..." : "Upload Document"}
              <input type="file" hidden onChange={handleUploadDoc} accept=".pdf,.docx,.txt,.png,.jpg" />
            </label>
          </div>
          {documents.length === 0 ? (
            <p className="aed-muted">No documents attached.</p>
          ) : (
            <div className="aed-table">
              {documents.map((doc) => (
                <div key={doc.id} className="aed-table-row">
                  <span><strong>{doc.title}</strong></span>
                  <span className="aed-badge">{doc.doc_type}</span>
                  <span>{formatSize(doc.file_size)}</span>
                  <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                  <span>
                    <a className="btn btnTiny" href={`${API}/${doc.file_path}`} target="_blank" rel="noopener noreferrer">Download</a>
                    <button className="btn btnTiny miniBtnDanger" onClick={() => handleDeleteDoc(doc.id)}>Delete</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Evaluations Tab */}
      {tab === "evaluations" && (
        <div className="aed-section">
          <div className="aed-section-head">
            <h2>Performance Evaluations ({evaluations.length})</h2>
            <button className="btn btnPrimary" onClick={() => setShowEvalForm(!showEvalForm)}>
              {showEvalForm ? "Cancel" : "New Evaluation"}
            </button>
          </div>

          {showEvalForm && (
            <form className="aed-form" onSubmit={handleCreateEval}>
              <input type="text" placeholder="Evaluation period (e.g., Q1 2026) *" value={evalPeriod}
                onChange={(e) => setEvalPeriod(e.target.value)} required />
              <div className="aed-form-row">
                <label>Rating (1-5):</label>
                <input type="number" min="1" max="5" value={evalRating}
                  onChange={(e) => setEvalRating(parseInt(e.target.value))} />
              </div>
              <textarea placeholder="Strengths" value={evalStrengths} onChange={(e) => setEvalStrengths(e.target.value)} />
              <textarea placeholder="Areas for improvement" value={evalImprove} onChange={(e) => setEvalImprove(e.target.value)} />
              <textarea placeholder="Goals for next period" value={evalGoals} onChange={(e) => setEvalGoals(e.target.value)} />
              <textarea placeholder="Additional comments" value={evalComments} onChange={(e) => setEvalComments(e.target.value)} />
              <button className="btn btnPrimary" type="submit">Create Evaluation</button>
            </form>
          )}

          {evaluations.length === 0 ? (
            <p className="aed-muted">No evaluations recorded.</p>
          ) : (
            evaluations.map((ev) => (
              <div key={ev.id} className="aed-eval-card">
                <div className="aed-eval-top">
                  <strong>{ev.evaluation_period}</strong>
                  <div className="aed-rating">{ratingStars(ev.overall_rating)} ({ev.overall_rating}/5)</div>
                </div>
                {ev.strengths && <div><label>Strengths:</label> <p>{ev.strengths}</p></div>}
                {ev.areas_for_improvement && <div><label>Improve:</label> <p>{ev.areas_for_improvement}</p></div>}
                {ev.goals_for_next_period && <div><label>Goals:</label> <p>{ev.goals_for_next_period}</p></div>}
                {ev.comments && <div><label>Comments:</label> <p>{ev.comments}</p></div>}
                <small className="aed-muted">{new Date(ev.created_at).toLocaleDateString()}</small>
              </div>
            ))
          )}
        </div>
      )}

      {/* Disciplinary Tab */}
      {tab === "disciplinary" && (
        <div className="aed-section">
          <div className="aed-section-head">
            <h2>Disciplinary Records ({disciplinary.length})</h2>
            <button className="btn btnPrimary" onClick={() => setShowDiscForm(!showDiscForm)}>
              {showDiscForm ? "Cancel" : "New Record"}
            </button>
          </div>

          {showDiscForm && (
            <form className="aed-form" onSubmit={handleCreateDisc}>
              <select value={discType} onChange={(e) => setDiscType(e.target.value)}>
                <option value="verbal_warning">Verbal Warning</option>
                <option value="written_warning">Written Warning</option>
                <option value="suspension">Suspension</option>
                <option value="termination">Termination</option>
                <option value="other">Other</option>
              </select>
              <textarea placeholder="Description *" value={discDesc}
                onChange={(e) => setDiscDesc(e.target.value)} required />
              <input type="date" value={discDate} onChange={(e) => setDiscDate(e.target.value)} required />
              <textarea placeholder="Outcome" value={discOutcome} onChange={(e) => setDiscOutcome(e.target.value)} />
              <button className="btn btnPrimary" type="submit">Create Record</button>
            </form>
          )}

          {disciplinary.length === 0 ? (
            <p className="aed-muted">No disciplinary records.</p>
          ) : (
            disciplinary.map((rec) => (
              <div key={rec.id} className="aed-disc-card">
                <div className="aed-disc-top">
                  <span className={`aed-disc-type aed-disc-${rec.record_type}`}>
                    {rec.record_type.replace("_", " ")}
                  </span>
                  <span>{new Date(rec.date_of_incident).toLocaleDateString()}</span>
                </div>
                <p>{rec.description}</p>
                {rec.outcome && <div><label>Outcome:</label> <p>{rec.outcome}</p></div>}
              </div>
            ))
          )}
        </div>
      )}
      {/* Credentials Tab */}
      {tab === "credentials" && (
        <div className="aed-section">
          <div className="aed-section-head">
            <h2>Login Credentials</h2>
          </div>

          {credLoading && <p className="aed-muted">Loading…</p>}

          {!credLoading && credentials && (
            <div className="aed-cred-card">
              <div className="aed-cred-row">
                <span className="aed-cred-label">Email</span>
                <span className="aed-cred-value">{credentials.email || "—"}</span>
              </div>
              <div className="aed-cred-row">
                <span className="aed-cred-label">Temporary Password</span>
                <span className="aed-cred-value aed-cred-pw">
                  {credentials.initial_password
                    ? credentials.initial_password
                    : <em className="aed-muted">Not set — employee may have changed it</em>}
                </span>
              </div>
              <div className="aed-cred-actions">
                <button className="btn btnPrimary" onClick={copyCredentials} disabled={!credentials.initial_password}>
                  {credCopied ? "Copied!" : "Copy Credentials"}
                </button>
                <button className="btn" onClick={handleResetPassword} disabled={credResetLoading}>
                  {credResetLoading ? "Resetting…" : "Reset Password"}
                </button>
              </div>
              <p className="aed-muted" style={{ marginTop: 12, fontSize: 12 }}>
                Share these credentials with the employee so they can log in. They should change their password after first login.
                Resetting generates a new temporary password and saves it here.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
