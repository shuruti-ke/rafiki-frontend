import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";
import "./AdminKnowledgeBase.css";
const CATEGORIES = ["general", "policy", "handbook", "benefits", "training", "compliance", "procedure", "template"];

export default function AdminKnowledgeBase() {
  const [docs, setDocs] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [versions, setVersions] = useState(null);
  const [editing, setEditing] = useState(null);

  // Upload form state
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadCategory, setUploadCategory] = useState("general");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadFile, setUploadFile] = useState(null);

  async function fetchDocs() {
    const params = new URLSearchParams();
    if (categoryFilter) params.set("category", categoryFilter);
    if (search) params.set("search", search);
    const res = await authFetch(`${API}/api/v1/knowledge-base/?${params}`);
    const data = await res.json();
    setDocs(data);
  }

  useEffect(() => { fetchDocs(); }, [categoryFilter, search]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!uploadFile || !uploadTitle) return;
    setUploading(true);

    const params = new URLSearchParams({
      title: uploadTitle,
      description: uploadDesc,
      category: uploadCategory,
      tags: uploadTags,
    });

    const fd = new FormData();
    fd.append("file", uploadFile);

    try {
      const res = await authFetch(`${API}/api/v1/knowledge-base/upload?${params}`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        setShowUpload(false);
        setUploadTitle(""); setUploadDesc(""); setUploadTags(""); setUploadFile(null);
        fetchDocs();
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Archive this document?")) return;
    await authFetch(`${API}/api/v1/knowledge-base/${id}`, { method: "DELETE" });
    fetchDocs();
  }

  async function handleViewVersions(id) {
    const res = await authFetch(`${API}/api/v1/knowledge-base/${id}/versions`);
    const data = await res.json();
    setVersions({ docId: id, list: data });
  }

  async function handleUpdateMeta(id) {
    const res = await authFetch(`${API}/api/v1/knowledge-base/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    if (res.ok) {
      setEditing(null);
      fetchDocs();
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  return (
    <div className="kb-page">
      <div className="kb-header">
        <h1>Knowledge Base</h1>
        <button className="btn btnPrimary" onClick={() => setShowUpload(!showUpload)}>
          {showUpload ? "Cancel" : "Upload Document"}
        </button>
      </div>

      {showUpload && (
        <form className="kb-upload-form" onSubmit={handleUpload}>
          <input
            type="text"
            placeholder="Document title *"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            required
          />
          <textarea
            placeholder="Description (optional)"
            value={uploadDesc}
            onChange={(e) => setUploadDesc(e.target.value)}
          />
          <div className="kb-upload-row">
            <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Tags (comma-separated)"
              value={uploadTags}
              onChange={(e) => setUploadTags(e.target.value)}
            />
          </div>
          <input
            type="file"
            accept=".pdf,.docx,.txt,.csv"
            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            required
          />
          <button className="btn btnPrimary" type="submit" disabled={uploading}>
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </form>
      )}

      <div className="kb-filters">
        <input
          className="search"
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="kb-table">
        <div className="kb-table-head">
          <span>Title</span>
          <span>Category</span>
          <span>Size</span>
          <span>Version</span>
          <span>Indexed</span>
          <span>Actions</span>
        </div>
        {docs.length === 0 ? (
          <div className="kb-empty">No documents found.</div>
        ) : (
          docs.map((doc) => (
            <div key={doc.id} className="kb-table-row">
              <span className="kb-doc-title">
                <strong>{doc.title}</strong>
                {doc.description && <small>{doc.description}</small>}
                {doc.tags?.length > 0 && (
                  <div className="kb-tags">
                    {doc.tags.map((t) => <span key={t} className="kb-tag">{t}</span>)}
                  </div>
                )}
              </span>
              <span className="kb-badge">{doc.category}</span>
              <span>{formatSize(doc.file_size)}</span>
              <span>v{doc.version}</span>
              <span className={doc.is_indexed ? "kb-indexed" : "kb-not-indexed"}>
                {doc.is_indexed ? "Yes" : "No"}
              </span>
              <span className="kb-actions">
                <button className="btn btnTiny" onClick={() => setEditing({
                  id: doc.id, title: doc.title, description: doc.description || "", category: doc.category, tags: doc.tags
                })}>Edit</button>
                <button className="btn btnTiny" onClick={() => handleViewVersions(doc.id)}>Versions</button>
                <button className="btn btnTiny miniBtnDanger" onClick={() => handleDelete(doc.id)}>Archive</button>
              </span>
            </div>
          ))
        )}
      </div>

      {editing && (
        <div className="kb-modal-overlay" onClick={() => setEditing(null)}>
          <div className="kb-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Document</h2>
            <input
              type="text" value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              placeholder="Title"
            />
            <textarea
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="Description"
            />
            <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="kb-modal-actions">
              <button className="btn btnPrimary" onClick={() => handleUpdateMeta(editing.id)}>Save</button>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {versions && (
        <div className="kb-modal-overlay" onClick={() => setVersions(null)}>
          <div className="kb-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Version History</h2>
            {versions.list.map((v) => (
              <div key={v.id} className="kb-version-item">
                <strong>v{v.version}</strong> - {v.original_filename}
                <small>{new Date(v.created_at).toLocaleDateString()}</small>
                {v.is_current && <span className="kb-badge">Current</span>}
              </div>
            ))}
            <button className="btn" onClick={() => setVersions(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
