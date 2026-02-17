import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API } from "../api.js";

export default function ChatPage() {
  // ---- Models (dropdown) ----
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("anthropic/claude-sonnet-4-5");

  // ---- Project files (pinned) ----
  const [projectFiles, setProjectFiles] = useState([]);

  // ---- Chat ----
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState([
    { role: "rafiki", text: "I'm here. What are we building today?" },
  ]);
  const [loading, setLoading] = useState(false);

  // ---- Files ----
  const [textFiles, setTextFiles] = useState([]);
  const [images, setImages] = useState([]);
  const [selectedText, setSelectedText] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  // multi-file context selection (ad-hoc)
  const [contextFiles, setContextFiles] = useState([]);

  // search
  const [fileQuery, setFileQuery] = useState("");

  // vision + delete flags
  const [visionLoading, setVisionLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const endRef = useRef(null);

  const filteredTextFiles = useMemo(() => {
    const q = fileQuery.trim().toLowerCase();
    if (!q) return textFiles;
    return textFiles.filter((f) => f.name.toLowerCase().includes(q));
  }, [textFiles, fileQuery]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  // -----------------------------
  // Backend fetch helpers
  // -----------------------------
  async function refreshFiles() {
    const res = await fetch(`${API}/files`);
    const data = await res.json();
    setTextFiles(data.text ?? []);
    setImages(data.images ?? []);
  }

  async function refreshModels() {
    const res = await fetch(`${API}/models`);
    const data = await res.json();
    setModels(data.models ?? ["stealth"]);
    setSelectedModel(data.default ?? "stealth");
  }

  async function refreshProjectFiles() {
    const res = await fetch(`${API}/project_files`);
    const data = await res.json();
    setProjectFiles(data.files ?? []);
  }

  async function saveProjectFiles(files) {
    const res = await fetch(`${API}/project_files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    const data = await res.json();
    if (data.ok) setProjectFiles(data.files ?? []);
  }

  function toggleProjectFile(name) {
    const next = projectFiles.includes(name)
      ? projectFiles.filter((x) => x !== name)
      : [...projectFiles, name];
    saveProjectFiles(next);
  }

  function toggleContextFile(name) {
    setContextFiles((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  }

  function clearContext() {
    setContextFiles([]);
  }

  async function deleteFile(kind, name) {
    const ok = confirm(`Delete "${name}"? This cannot be undone.`);
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(
        `${API}/delete?kind=${encodeURIComponent(
          kind
        )}&name=${encodeURIComponent(name)}`,
        { method: "DELETE" }
      );
      const data = await res.json();

      if (data.ok) {
        if (selectedText?.name === name) setSelectedText(null);
        if (selectedImage === name) setSelectedImage(null);
        setContextFiles((prev) => prev.filter((x) => x !== name));
        await refreshFiles();
        await refreshProjectFiles();
        setMsgs((m) => [...m, { role: "rafiki", text: `Deleted: ${name}` }]);
      } else {
        setMsgs((m) => [
          ...m,
          { role: "rafiki", text: data.error || "Delete failed" },
        ]);
      }
    } finally {
      setDeleting(false);
    }
  }

  // Initial load
  useEffect(() => {
    refreshFiles();
    refreshProjectFiles();
    refreshModels();
  }, []);

  // -----------------------------
  // Upload / open / describe
  // -----------------------------
  async function uploadText(e) {
    const f = e.target.files?.[0];
    if (!f) return;

    const fd = new FormData();
    fd.append("file", f);

    const res = await fetch(`${API}/upload_text`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();

    if (data.ok) {
      setMsgs((m) => [...m, { role: "rafiki", text: `Uploaded: ${data.filename}` }]);
      await refreshFiles();
      await refreshProjectFiles();
    } else {
      setMsgs((m) => [
        ...m,
        {
          role: "rafiki",
          text: `Upload blocked: ${data.error || "unknown error"}`,
        },
      ]);
    }

    e.target.value = "";
  }

  async function uploadImage(e) {
    const f = e.target.files?.[0];
    if (!f) return;

    const fd = new FormData();
    fd.append("file", f);

    const res = await fetch(`${API}/upload_image`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();

    if (data.ok) {
      setMsgs((m) => [
        ...m,
        { role: "rafiki", text: `Uploaded image: ${data.filename}` },
      ]);
      await refreshFiles();
    } else {
      setMsgs((m) => [
        ...m,
        {
          role: "rafiki",
          text: `Upload blocked: ${data.error || "unknown error"}`,
        },
      ]);
    }

    e.target.value = "";
  }

  async function openText(name) {
    const res = await fetch(
      `${API}/file?name=${encodeURIComponent(name)}`
    );
    const data = await res.json();
    setSelectedText(
      data.ok ? data : { ok: false, name, error: data.error || "Could not open file" }
    );
    setSelectedImage(null);
  }

  async function describeImage(name) {
    setVisionLoading(true);
    try {
      const res = await fetch(
        `${API}/image/describe?name=${encodeURIComponent(name)}`,
        { method: "POST" }
      );
      const data = await res.json();
      setMsgs((m) => [
        ...m,
        { role: "rafiki", text: data.ok ? data.description : (data.error || "Could not describe image") },
      ]);
    } finally {
      setVisionLoading(false);
    }
  }

  // -----------------------------
  // Send chat
  // -----------------------------
  async function send() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setMsgs((m) => [...m, { role: "you", text: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          context_files: contextFiles,
          model: selectedModel,
        }),
      });

      const data = await res.json();
      setMsgs((m) => [...m, { role: "rafiki", text: data.reply ?? "..." }]);
    } catch {
      setMsgs((m) => [
        ...m,
        { role: "rafiki", text: "Backend not reachable. Is it running on :8000?" },
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

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="app">
      <aside className="side">
        <div className="sideHeader">
          <div className="brand">
            <div className="logoDot" />
            <div>
              <div className="brandTitle">Rafiki</div>
              <div className="brandSub">Local Dev Studio</div>
            </div>
          </div>

          <div className="sideActions">
            <button className="btn" onClick={refreshFiles}>Refresh</button>

            <label className="btn btnGhost">
              Upload code/text
              <input
                type="file"
                onChange={uploadText}
                accept=".txt,.md,.py,.js,.ts,.json,.csv,.html,.css,.yml,.yaml"
                hidden
              />
            </label>

            <label className="btn btnGhost">
              Upload image
              <input
                type="file"
                onChange={uploadImage}
                accept="image/png,image/jpeg,image/webp"
                hidden
              />
            </label>
          </div>

          <div className="sideNavLinks">
            <Link to="/knowledge-base" className="btn btnTiny">Knowledge Base</Link>
            <Link to="/announcements" className="btn btnTiny">Announcements</Link>
            <Link to="/admin" className="btn btnTiny btnGhost">HR Portal</Link>
          </div>
        </div>

        {/* Project Files (Pinned) */}
        <div className="sideSection">
          <div className="sectionTop">
            <div className="sectionTitle">Project Files</div>
            <span className="pill">{projectFiles.length}</span>
          </div>

          {projectFiles.length === 0 ? (
            <div className="mutedSmall">Pin key files so Rafiki always uses them.</div>
          ) : (
            <div className="chips">
              {projectFiles.map((f) => (
                <button
                  key={f}
                  className="chip chipPinned"
                  onClick={() => toggleProjectFile(f)}
                  title="Unpin"
                >
                  {f} <span className="chipX">&times;</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Context (Ad-hoc) */}
        <div className="sideSection">
          <div className="sectionTop">
            <div className="sectionTitle">Context</div>
            <button className="btn btnTiny" onClick={clearContext} disabled={contextFiles.length === 0}>
              Clear
            </button>
          </div>

          {contextFiles.length === 0 ? (
            <div className="mutedSmall">Select files below to attach them to chat.</div>
          ) : (
            <div className="chips">
              {contextFiles.map((f) => (
                <button
                  key={f}
                  className="chip"
                  onClick={() => toggleContextFile(f)}
                  title="Remove from context"
                >
                  {f} <span className="chipX">&times;</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Code / Text */}
        <div className="sideSection">
          <div className="sectionTop">
            <div className="sectionTitle">Code / Text</div>
            <span className="pill">{textFiles.length}</span>
          </div>

          <input
            className="search"
            value={fileQuery}
            onChange={(e) => setFileQuery(e.target.value)}
            placeholder="Search files..."
          />

          <div className="list">
            {filteredTextFiles.length === 0 ? (
              <div className="mutedSmall">No code/text files.</div>
            ) : (
              filteredTextFiles.map((f) => {
                const checked = contextFiles.includes(f.name);
                const pinned = projectFiles.includes(f.name);

                return (
                  <div key={f.name} className={`row ${checked ? "rowActive" : ""}`}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleContextFile(f.name)}
                      />
                      <span className="checkMark" />
                    </label>

                    <button className="rowMain" onClick={() => openText(f.name)} title="Open file">
                      <div className="rowName">{f.name}</div>
                      <div className="rowMeta">{Math.round(f.size / 1024)} KB</div>
                    </button>

                    <div className="rowBtns">
                      <button
                        className={`miniBtn ${pinned ? "miniBtnOn" : ""}`}
                        onClick={() => toggleProjectFile(f.name)}
                        type="button"
                        title={pinned ? "Unpin from Project Files" : "Pin to Project Files"}
                      >
                        Pin
                      </button>

                      <button
                        className="miniBtn miniBtnDanger"
                        onClick={() => deleteFile("text", f.name)}
                        disabled={deleting}
                        type="button"
                        title="Delete"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Images */}
        <div className="sideSection">
          <div className="sectionTop">
            <div className="sectionTitle">Images</div>
            <span className="pill">{images.length}</span>
          </div>

          <div className="list">
            {images.length === 0 ? (
              <div className="mutedSmall">No images.</div>
            ) : (
              images.map((f) => (
                <button
                  key={f.name}
                  className={`imgRow ${selectedImage === f.name ? "imgRowActive" : ""}`}
                  onClick={() => { setSelectedImage(f.name); setSelectedText(null); }}
                >
                  <div className="rowName">{f.name}</div>
                  <div className="rowMeta">{Math.round(f.size / 1024)} KB</div>

                  <button
                    className="miniBtn miniBtnDanger"
                    onClick={(e) => { e.stopPropagation(); deleteFile("image", f.name); }}
                    disabled={deleting}
                    title="Delete image"
                    type="button"
                  >
                    Del
                  </button>
                </button>
              ))
            )}
          </div>

          {selectedImage && (
            <div className="imgActions">
              <button className="btn" onClick={() => describeImage(selectedImage)} disabled={visionLoading}>
                {visionLoading ? "Describing..." : "Describe"}
              </button>
              <button className="btn btnGhost" onClick={() => setSelectedImage(null)}>Close</button>
              <div className="mutedSmall">
                Uses OpenAI Vision (needs OPENAI_API_KEY in backend/.env).
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="mainHeader">
          <div>
            <div className="mainTitle">Chat</div>
            <div className="mutedSmall">
              {(projectFiles.length + contextFiles.length) > 0
                ? `Using ${projectFiles.length} pinned + ${contextFiles.length} selected file(s).`
                : "No file context attached."}
            </div>
          </div>

          <div className="headerRight">
            <select
              className="modelSelect"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              title="Choose model"
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            {selectedText?.name && (
              <div className="pill pillSoft" title="Currently opened file">
                Open: {selectedText.name}
              </div>
            )}
          </div>
        </header>

        {selectedText && (
          <section className="viewer">
            <div className="viewerHead">
              <div className="viewerTitle">{selectedText.name}</div>
              <div className="viewerBtns">
                {selectedText?.ok && (
                  <>
                    <button className="btn btnTiny" onClick={() => toggleContextFile(selectedText.name)}>
                      {contextFiles.includes(selectedText.name) ? "Remove from context" : "Add to context"}
                    </button>
                    <button className="btn btnTiny" onClick={() => toggleProjectFile(selectedText.name)}>
                      {projectFiles.includes(selectedText.name) ? "Unpin" : "Pin"}
                    </button>
                  </>
                )}
                <button className="btn btnTiny btnGhost" onClick={() => setSelectedText(null)}>Close</button>
              </div>
            </div>

            {selectedText.ok ? (
              <pre className="code">{selectedText.content}</pre>
            ) : (
              <div className="error">{selectedText.error}</div>
            )}
          </section>
        )}

        <section className="chat">
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="bubble">
                <div className="who">{m.role === "you" ? "You" : "Rafiki"}</div>
                <div className="text">{m.text}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="msg rafiki">
              <div className="bubble">
                <div className="who">Rafiki</div>
                <div className="text">typing...</div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </section>

        <footer className="composer">
          <div className="composerTop">
            {(projectFiles.length + contextFiles.length) > 0 ? (
              <div className="composerHint">
                Context attached: <b>{projectFiles.length}</b> pinned, <b>{contextFiles.length}</b> selected
              </div>
            ) : (
              <div className="composerHint">Tip: tick files on the left to include them.</div>
            )}

            {contextFiles.length > 0 && (
              <button className="btn btnTiny btnGhost" onClick={clearContext}>
                Clear selected
              </button>
            )}
          </div>

          <div className="composerRow">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Tell Rafiki what to build..."
            />
            <button className="btn btnPrimary" onClick={send} disabled={loading || !input.trim()}>
              Send
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
