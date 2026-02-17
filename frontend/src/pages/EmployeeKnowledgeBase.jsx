import { useEffect, useState } from "react";
import { API } from "../api.js";
import "./EmployeeKnowledgeBase.css";
const CATEGORIES = ["general", "policy", "handbook", "benefits", "training", "compliance", "procedure", "template"];

export default function EmployeeKnowledgeBase() {
  const [docs, setDocs] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchResults, setSearchResults] = useState(null);

  async function fetchDocs() {
    const params = new URLSearchParams();
    if (categoryFilter) params.set("category", categoryFilter);
    if (search) params.set("search", search);
    const res = await fetch(`${API}/api/v1/knowledge-base/?${params}`);
    const data = await res.json();
    setDocs(data);
  }

  useEffect(() => { fetchDocs(); }, [categoryFilter]);

  async function handleSearch(e) {
    e.preventDefault();
    if (!search.trim()) {
      setSearchResults(null);
      fetchDocs();
      return;
    }

    const res = await fetch(`${API}/api/v1/knowledge-base/search?query=${encodeURIComponent(search)}`);
    const data = await res.json();
    setSearchResults(data.results);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  return (
    <div className="ekb-page">
      <h1>Knowledge Base</h1>
      <p className="ekb-subtitle">Browse and search organization documents.</p>

      <form className="ekb-search-bar" onSubmit={handleSearch}>
        <input
          className="search"
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btnPrimary" type="submit">Search</button>
        {searchResults && (
          <button className="btn" type="button" onClick={() => { setSearchResults(null); setSearch(""); fetchDocs(); }}>
            Clear
          </button>
        )}
      </form>

      <div className="ekb-categories">
        <button
          className={`ekb-cat-btn ${!categoryFilter ? "active" : ""}`}
          onClick={() => setCategoryFilter("")}
        >All</button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={`ekb-cat-btn ${categoryFilter === c ? "active" : ""}`}
            onClick={() => setCategoryFilter(c)}
          >{c}</button>
        ))}
      </div>

      {searchResults ? (
        <div className="ekb-results">
          <h2>Search Results ({searchResults.length})</h2>
          {searchResults.length === 0 ? (
            <p className="ekb-muted">No results found.</p>
          ) : (
            searchResults.map((r) => (
              <div key={r.chunk_id} className="ekb-result-card">
                <strong>{r.document_title}</strong>
                <p>{r.content_preview}</p>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="ekb-doc-grid">
          {docs.length === 0 ? (
            <div className="ekb-empty">No documents available.</div>
          ) : (
            docs.map((doc) => (
              <div key={doc.id} className="ekb-doc-card">
                <div className="ekb-doc-card-top">
                  <strong>{doc.title}</strong>
                  <span className="ekb-badge">{doc.category}</span>
                </div>
                {doc.description && <p className="ekb-doc-desc">{doc.description}</p>}
                <div className="ekb-doc-meta">
                  <span>{formatSize(doc.file_size)}</span>
                  <span>v{doc.version}</span>
                  <span>{doc.original_filename}</span>
                </div>
                {doc.tags?.length > 0 && (
                  <div className="ekb-tags">
                    {doc.tags.map((t) => <span key={t} className="ekb-tag">{t}</span>)}
                  </div>
                )}
                <a
                  className="btn btnTiny"
                  href={`${API}/${doc.file_path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >Download</a>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
