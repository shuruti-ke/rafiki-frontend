import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";
import "./MyDocumentsPage.css";

export default function MyDocumentsPage() {
  const [tab, setTab] = useState("all");
  const [documents, setDocuments] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("other");
  const [uploadVisibility, setUploadVisibility] = useState("private");
  const [uploadFile, setUploadFile] = useState(null);
  const [visibilityUpdating, setVisibilityUpdating] = useState(null);

  async function fetchDocuments() {
    try {
      const res = await authFetch(`${API}/api/v1/employee-docs/me`);
      if (res.ok) setDocuments(await res.json());
    } catch (e) {
      console.error("Failed to fetch documents", e);
    }
  }

  async function fetchPayslips() {
    try {
      const res = await authFetch(`${API}/api/v1/payroll/my-payslips`);
      if (res.ok) setPayslips(await res.json());
    } catch (e) {
      console.error("Failed to fetch payslips", e);
    }
  }

  useEffect(() => {
    fetchDocuments();
    fetchPayslips();
  }, []);

  async function handleUpload(e) {
    e.preventDefault();
    if (!uploadFile || !uploadTitle) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", uploadFile);
    const params = new URLSearchParams({
      title: uploadTitle,
      doc_type: uploadType,
      visibility: uploadVisibility,
    });
    try {
      const res = await authFetch(`${API}/api/v1/employee-docs/me/upload?${params}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) { alert(`Upload failed (${res.status}).`); return; }
      setShowUpload(false);
      setUploadTitle("");
      setUploadType("other");
      setUploadVisibility("private");
      setUploadFile(null);
      fetchDocuments();
    } catch (e) {
      alert("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docId) {
    if (!confirm("Delete this document?")) return;
    const res = await authFetch(`${API}/api/v1/employee-docs/me/${docId}`, { method: "DELETE" });
    if (res.ok) fetchDocuments();
    else alert(`Delete failed (${res.status}).`);
  }

  async function handleDownload(docId) {
    const res = await authFetch(`${API}/api/v1/employee-docs/${docId}/download`);
    if (res.ok) {
      const data = await res.json();
      if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } else {
      alert(`Download failed (${res.status}).`);
    }
  }

  async function handleToggleVisibility(doc) {
    const next = doc.visibility === "private" ? "hr_visible" : "private";
    setVisibilityUpdating(doc.id);
    try {
      const res = await authFetch(
        `${API}/api/v1/employee-docs/me/${doc.id}/visibility?visibility=${next}`,
        { method: "PUT" }
      );
      if (res.ok) {
        setDocuments((prev) =>
          prev.map((d) => d.id === doc.id ? { ...d, visibility: next } : d)
        );
      } else {
        alert(`Failed to update visibility (${res.status}).`);
      }
    } finally {
      setVisibilityUpdating(null);
    }
  }

  function formatSize(bytes) {
    if (!bytes) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatCurrency(val) {
    if (val == null) return "-";
    return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  }

  const allDocs = documents.filter((d) => d.doc_type !== "payslip");
  const payslipDocs = documents.filter((d) => d.doc_type === "payslip");

  return (
    <div className="mydoc-page">
      <div className="mydoc-header">
        <h1>My Documents</h1>
        <p className="mydoc-sub">Upload and manage your personal documents. Control who can see each one.</p>
      </div>

      <div className="mydoc-tabs">
        {[["all", "All Documents"], ["payslips", "Payslips"]].map(([key, label]) => (
          <button key={key} className={`mydoc-tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* All Documents Tab */}
      {tab === "all" && (
        <div>
          <div className="mydoc-section-head">
            <h2>Documents ({allDocs.length})</h2>
            <button className="btn btnPrimary" onClick={() => setShowUpload(!showUpload)}>
              {showUpload ? "Cancel" : "+ Upload Document"}
            </button>
          </div>

          {showUpload && (
            <form className="mydoc-upload-form" onSubmit={handleUpload}>
              <input
                type="text"
                placeholder="Document title *"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                required
              />
              <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
                <option value="other">Other</option>
                <option value="contract">Contract</option>
                <option value="id_document">ID Document</option>
                <option value="certificate">Certificate</option>
                <option value="letter">Letter</option>
              </select>

              <div className="mydoc-visibility-row">
                <span className="mydoc-visibility-label">Visibility:</span>
                <label className={`mydoc-vis-option ${uploadVisibility === "private" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="visibility"
                    value="private"
                    checked={uploadVisibility === "private"}
                    onChange={() => setUploadVisibility("private")}
                  />
                  🔒 Private (only me)
                </label>
                <label className={`mydoc-vis-option ${uploadVisibility === "hr_visible" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="visibility"
                    value="hr_visible"
                    checked={uploadVisibility === "hr_visible"}
                    onChange={() => setUploadVisibility("hr_visible")}
                  />
                  👁 HR can view
                </label>
              </div>

              <input
                type="file"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg"
                required
              />
              <button className="btn btnPrimary" type="submit" disabled={uploading}>
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </form>
          )}

          {allDocs.length === 0 ? (
            <p className="mydoc-empty">No documents yet. Upload your first document above.</p>
          ) : (
            <div className="mydoc-table">
              {allDocs.map((doc) => (
                <div key={doc.id} className="mydoc-table-row">
                  <div className="mydoc-row-info">
                    <strong>{doc.title}</strong>
                    <span className="mydoc-badge">{doc.doc_type.replace(/_/g, " ")}</span>
                    <span className="mydoc-meta">{formatSize(doc.file_size)} · {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : "—"}</span>
                  </div>
                  <div className="mydoc-row-actions">
                    <button
                      className={`mydoc-vis-btn ${doc.visibility === "hr_visible" ? "vis-hr" : "vis-private"}`}
                      onClick={() => handleToggleVisibility(doc)}
                      disabled={visibilityUpdating === doc.id}
                      title={doc.visibility === "private" ? "Only you can see this — click to share with HR" : "HR can see this — click to make private"}
                    >
                      {visibilityUpdating === doc.id ? "…" : doc.visibility === "hr_visible" ? "👁 HR visible" : "🔒 Private"}
                    </button>
                    <button className="btn btnTiny" onClick={() => handleDownload(doc.id)}>Download</button>
                    <button className="btn btnTiny miniBtnDanger" onClick={() => handleDelete(doc.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mydoc-hint">
            🔒 <strong>Private</strong> — only you can see this document. &nbsp;
            👁 <strong>HR visible</strong> — your HR admin can also view it.
          </p>
        </div>
      )}

      {/* Payslips Tab */}
      {tab === "payslips" && (
        <div>
          <div className="mydoc-section-head">
            <h2>Payslips ({payslips.length})</h2>
          </div>

          {payslips.length === 0 && payslipDocs.length === 0 ? (
            <p className="mydoc-empty">No payslips available yet.</p>
          ) : (
            <>
              {payslips.map((ps) => (
                <div key={ps.payslip_id} className="mydoc-payslip-card">
                  <div className="mydoc-payslip-info">
                    <h3>Payslip — {ps.month || new Date(ps.created_at).toLocaleDateString()}</h3>
                  </div>
                  <div className="mydoc-payslip-amounts">
                    <div className="mydoc-payslip-amount"><label>Gross</label><span>{formatCurrency(ps.gross_pay)}</span></div>
                    <div className="mydoc-payslip-amount"><label>Deductions</label><span>{formatCurrency(ps.total_deductions)}</span></div>
                    <div className="mydoc-payslip-amount"><label>Net</label><span>{formatCurrency(ps.net_pay)}</span></div>
                    <button className="btn btnTiny" onClick={async () => {
                      const res = await authFetch(`${API}/api/v1/payroll/my-payslips/${ps.payslip_id}/download`);
                      if (res.ok) { const d = await res.json(); window.open(d.url, "_blank"); }
                      else alert(`Download failed (${res.status}).`);
                    }}>Download</button>
                  </div>
                </div>
              ))}
              {payslipDocs.filter((d) => !payslips.some((ps) => ps.document_id === d.id)).map((doc) => (
                <div key={doc.id} className="mydoc-payslip-card">
                  <div className="mydoc-payslip-info"><h3>{doc.title}</h3><p>{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ""}</p></div>
                  <button className="btn btnTiny" onClick={() => handleDownload(doc.id)}>Download</button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
