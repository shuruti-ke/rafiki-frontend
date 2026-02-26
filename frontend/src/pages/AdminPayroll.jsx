import { useState, useEffect, useRef } from "react";
import { API, authFetch } from "../api.js";
import "./AdminPayroll.css";

const TABS = ["upload", "batches", "templates"];
const TAB_LABELS = { upload: "Upload Payroll", batches: "History", templates: "Templates" };

export default function AdminPayroll() {
  const [tab, setTab] = useState("upload");

  return (
    <div className="ap-page">
      <div className="ap-header">
        <h1 className="ap-title">Payroll</h1>
        <p className="ap-subtitle">Upload monthly payroll files, verify totals, and distribute payslips to employees.</p>
      </div>

      <div className="ap-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`ap-tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="ap-body">
        {tab === "upload" && <UploadTab />}
        {tab === "batches" && <BatchesTab />}
        {tab === "templates" && <TemplatesTab />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Upload Tab — upload file, parse, verify, distribute
// ─────────────────────────────────────────────
function UploadTab() {
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [batch, setBatch] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [distributeResult, setDistributeResult] = useState(null);
  const [error, setError] = useState("");
  const [force, setForce] = useState(false);

  // Approval state
  const [approvers, setApprovers] = useState([]);
  const [approverId, setApproverId] = useState("");
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [approvalSent, setApprovalSent] = useState(false);

  useEffect(() => {
    authFetch(`${API}/api/v1/payroll/templates`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTemplates(data);
          if (data.length > 0) setTemplateId(data[0].template_id);
        }
      })
      .catch(() => {});

    authFetch(`${API}/api/v1/payroll/approvers`)
      .then((r) => r.json())
      .then((data) => {
        if (data.approvers) setApprovers(data.approvers);
      })
      .catch(() => {});
  }, []);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file || !templateId || !month) return;
    setError("");
    setUploading(true);
    setBatch(null);
    setParseResult(null);
    setDistributeResult(null);
    setApprovalSent(false);

    const fd = new FormData();
    fd.append("file", file);

    const url = `${API}/api/v1/payroll/upload?month=${month}&template_id=${templateId}&force=${force}`;
    try {
      const r = await authFetch(url, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 409) {
          setError(data.detail + " Check 'force replace' to override.");
        } else {
          setError(data.detail || "Upload failed");
        }
        return;
      }
      setBatch(data);
    } catch (err) {
      setError("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleRequestApproval() {
    if (!approverId || !batch) return;
    setRequestingApproval(true);
    setError("");
    try {
      const r = await authFetch(
        `${API}/api/v1/payroll/batches/${batch.batch_id}/request-approval?approver_user_id=${approverId}`,
        { method: "POST" }
      );
      const data = await r.json();
      if (!r.ok) {
        setError(data.detail || "Failed to send approval request");
        return;
      }
      setApprovalSent(true);
      setBatch((b) => ({ ...b, status: "uploaded_needs_approval" }));
    } catch (err) {
      setError("Request failed: " + err.message);
    } finally {
      setRequestingApproval(false);
    }
  }

  async function handleParse() {
    if (!batch) return;
    setParsing(true);
    setError("");
    setParseResult(null);
    try {
      const r = await authFetch(`${API}/api/v1/payroll/batches/${batch.batch_id}/parse`, {
        method: "POST",
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.detail || "Parse failed");
        return;
      }
      setParseResult(data);
      setBatch((b) => ({ ...b, status: "parsed" }));
    } catch (err) {
      setError("Parse failed: " + err.message);
    } finally {
      setParsing(false);
    }
  }

  async function handleDistribute() {
    if (!batch) return;
    setDistributing(true);
    setError("");
    try {
      const r = await authFetch(
        `${API}/api/v1/payroll/batches/${batch.batch_id}/distribute`,
        { method: "POST" }
      );
      const data = await r.json();
      if (!r.ok) {
        setError(data.detail || "Distribution failed");
        return;
      }
      setDistributeResult(data);
      setBatch((b) => ({ ...b, status: "distributed" }));
    } catch (err) {
      setError("Distribution failed: " + err.message);
    } finally {
      setDistributing(false);
    }
  }

  const canParse = batch && batch.status === "uploaded";
  const canDistribute = batch && batch.status === "parsed" && parseResult && parseResult.reconciled;
  const needsApproval = batch && batch.status === "uploaded_needs_approval";

  return (
    <div className="ap-section">
      <form className="ap-form" onSubmit={handleUpload}>
        <div className="ap-form-row">
          <label className="ap-label">Month</label>
          <input
            type="month"
            className="ap-input"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            required
          />
        </div>

        <div className="ap-form-row">
          <label className="ap-label">Template</label>
          {templates.length === 0 ? (
            <p className="ap-hint">No templates yet — create one in the Templates tab first.</p>
          ) : (
            <select
              className="ap-input"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              required
            >
              {templates.map((t) => (
                <option key={t.template_id} value={t.template_id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="ap-form-row">
          <label className="ap-label">Payroll File</label>
          <input
            type="file"
            className="ap-input"
            accept=".csv,.xlsx,.xls,.pdf,.docx"
            onChange={(e) => setFile(e.target.files[0] || null)}
            required
          />
          <span className="ap-hint">CSV, Excel (.xlsx/.xls), PDF, or Word</span>
        </div>

        <div className="ap-form-row ap-checkbox-row">
          <input
            type="checkbox"
            id="force"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
          />
          <label htmlFor="force" className="ap-hint">
            Force replace if this month already has a distributed payroll
          </label>
        </div>

        {error && <div className="ap-error">{error}</div>}

        <button
          type="submit"
          className="ap-btn ap-btn-primary"
          disabled={uploading || !file || !templateId || templates.length === 0}
        >
          {uploading ? "Uploading…" : "Upload Payroll File"}
        </button>
      </form>

      {batch && (
        <div className="ap-workflow">
          <div className="ap-workflow-header">
            <span className="ap-badge" data-status={batch.status}>{batch.status.replace(/_/g, " ")}</span>
            <span className="ap-workflow-month">
              {batch.period_year}-{String(batch.period_month).padStart(2, "0")}
            </span>
            {batch.replaced && <span className="ap-badge" data-status="warning">replaced</span>}
          </div>

          {batch.warning && <div className="ap-warning">{batch.warning}</div>}

          {/* Step 1: Request Approval */}
          {needsApproval && !approvalSent && (
            <div className="ap-step">
              <h3 className="ap-step-title">Step 1 — Request Approval</h3>
              <p className="ap-hint">Select an approver to send a DM approval request before proceeding.</p>
              <div className="ap-form-row">
                <select
                  className="ap-input"
                  value={approverId}
                  onChange={(e) => setApproverId(e.target.value)}
                >
                  <option value="">Select approver…</option>
                  {approvers.map((a) => (
                    <option key={a.user_id} value={a.user_id}>
                      {a.name || a.email} ({a.role})
                    </option>
                  ))}
                </select>
                <button
                  className="ap-btn ap-btn-primary"
                  onClick={handleRequestApproval}
                  disabled={!approverId || requestingApproval}
                >
                  {requestingApproval ? "Sending…" : "Send Approval Request"}
                </button>
              </div>
            </div>
          )}

          {needsApproval && approvalSent && (
            <div className="ap-step">
              <div className="ap-success">
                Approval request sent via DM. Waiting for approver to approve before you can parse.
              </div>
            </div>
          )}

          {/* Step 2: Parse */}
          {canParse && (
            <div className="ap-step">
              <h3 className="ap-step-title">Step 2 — Parse & Verify</h3>
              <p className="ap-hint">Extract employee salary data from the uploaded file.</p>
              <button
                className="ap-btn ap-btn-primary"
                onClick={handleParse}
                disabled={parsing}
              >
                {parsing ? "Parsing…" : "Parse Payroll File"}
              </button>
            </div>
          )}

          {/* Parse results */}
          {parseResult && (
            <div className="ap-parse-result">
              <div className="ap-stats-row">
                <Stat label="Employees" value={parseResult.employee_count} />
                <Stat label="Matched" value={parseResult.matched_count} />
                <Stat label="Total Gross" value={fmt(parseResult.total_gross)} />
                <Stat label="Total Deductions" value={fmt(parseResult.total_deductions)} />
                <Stat label="Total Net" value={fmt(parseResult.total_net)} />
                <Stat
                  label="Reconciled"
                  value={parseResult.reconciled ? "✓ Yes" : "✗ No"}
                  warn={!parseResult.reconciled}
                />
              </div>

              {parseResult.unmatched_names?.length > 0 && (
                <div className="ap-unmatched">
                  <strong>Unmatched employees</strong> — these names were not found in the system:
                  <ul>
                    {parseResult.unmatched_names.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="ap-entries-table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Gross</th>
                      <th>Deductions</th>
                      <th>Net Pay</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.entries?.map((e, i) => (
                      <tr key={i} className={e.matched_user_id ? "" : "ap-row-unmatched"}>
                        <td>{e.employee_name}</td>
                        <td>{fmt(e.gross_salary)}</td>
                        <td>{fmt(e.deductions)}</td>
                        <td>{fmt(e.net_salary)}</td>
                        <td>{e.matched_user_id ? "✓" : "✗ unmatched"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Step 3: Distribute */}
              <div className="ap-step">
                <h3 className="ap-step-title">Step 3 — Distribute Payslips</h3>
                {!parseResult.reconciled && (
                  <div className="ap-error">
                    Cannot distribute — totals do not reconcile. Check the payroll file for errors.
                  </div>
                )}
                {parseResult.matched_count === 0 && (
                  <div className="ap-error">
                    No employees matched. Ensure employee names in the file match their names in the system.
                  </div>
                )}
                <button
                  className="ap-btn ap-btn-primary"
                  onClick={handleDistribute}
                  disabled={!canDistribute || distributing}
                >
                  {distributing ? "Distributing…" : `Distribute to ${parseResult.matched_count} employees`}
                </button>
              </div>
            </div>
          )}

          {distributeResult && (
            <div className="ap-success">
              {distributeResult.message}
            </div>
          )}

          {batch.status === "distributed" && !distributeResult && (
            <div className="ap-success">This payroll has already been distributed.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Batches Tab — history
// ─────────────────────────────────────────────
function BatchesTab() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    authFetch(`${API}/api/v1/payroll/batches`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setBatches(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function loadDetail(batch) {
    setSelected(batch.batch_id);
    setSelectedBatch(batch);
    setLoadingDetail(true);
    setDetail(null);
    if (batch.status === "distributed" || batch.status === "parsed") {
      try {
        const r = await authFetch(`${API}/api/v1/payroll/batches/${batch.batch_id}/verify`);
        if (r.ok) setDetail(await r.json());
      } catch {}
    }
    setLoadingDetail(false);
  }

  async function handleDownload(batchId) {
    setDownloading(true);
    try {
      const r = await authFetch(`${API}/api/v1/payroll/batches/${batchId}/download`);
      if (r.ok) {
        const data = await r.json();
        window.open(data.url, "_blank");
      }
    } catch {}
    setDownloading(false);
  }

  if (loading) return <div className="ap-loading">Loading…</div>;
  if (batches.length === 0) {
    return <div className="ap-empty">No payroll batches yet. Upload a payroll file to get started.</div>;
  }

  return (
    <div className="ap-section">
      <div className="ap-batches-list">
        {batches.map((b) => (
          <div
            key={b.batch_id}
            className={`ap-batch-row ${selected === b.batch_id ? "selected" : ""}`}
            onClick={() => loadDetail(b)}
          >
            <div className="ap-batch-month">
              {b.period_year}-{String(b.period_month).padStart(2, "0")}
            </div>
            <span className="ap-badge" data-status={b.status}>{b.status.replace(/_/g, " ")}</span>
            {b.computed_total != null && (
              <span className="ap-batch-total">Net: {fmt(b.computed_total)}</span>
            )}
            <span className="ap-batch-date">{new Date(b.created_at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>

      {selected && selectedBatch && (
        <div className="ap-batch-detail">
          <div className="ap-batch-detail-header">
            <span className="ap-badge" data-status={selectedBatch.status}>
              {selectedBatch.status.replace(/_/g, " ")}
            </span>
            <button
              className="ap-btn ap-btn-ghost"
              onClick={() => handleDownload(selected)}
              disabled={downloading}
            >
              {downloading ? "…" : "Download File"}
            </button>
          </div>

          {loadingDetail && <div className="ap-loading">Loading detail…</div>}

          {detail && (
            <>
              <div className="ap-stats-row">
                <Stat label="Employees" value={detail.employee_count} />
                <Stat label="Matched" value={detail.matched_count} />
                <Stat label="Total Gross" value={fmt(detail.total_gross)} />
                <Stat label="Total Deductions" value={fmt(detail.total_deductions)} />
                <Stat label="Total Net" value={fmt(detail.total_net)} />
                <Stat label="Reconciled" value={detail.reconciled ? "✓ Yes" : "✗ No"} warn={!detail.reconciled} />
              </div>
              {detail.unmatched_names?.length > 0 && (
                <div className="ap-unmatched">
                  <strong>Unmatched:</strong> {detail.unmatched_names.join(", ")}
                </div>
              )}
              <div className="ap-entries-table">
                <table>
                  <thead>
                    <tr><th>Name</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Match</th></tr>
                  </thead>
                  <tbody>
                    {detail.entries?.map((e, i) => (
                      <tr key={i} className={e.matched_user_id ? "" : "ap-row-unmatched"}>
                        <td>{e.employee_name}</td>
                        <td>{fmt(e.gross_salary)}</td>
                        <td>{fmt(e.deductions)}</td>
                        <td>{fmt(e.net_salary)}</td>
                        <td>{e.matched_user_id ? "✓" : "✗"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!detail && !loadingDetail && selectedBatch.status !== "distributed" && selectedBatch.status !== "parsed" && (
            <div className="ap-hint" style={{ marginTop: 12 }}>
              Detailed breakdown available after parsing.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Templates Tab
// ─────────────────────────────────────────────
function TemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();

  function load() {
    authFetch(`${API}/api/v1/payroll/templates`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setTemplates(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setUploading(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await authFetch(
        `${API}/api/v1/payroll/templates/upload?title=${encodeURIComponent(title)}`,
        { method: "POST", body: fd }
      );
      const data = await r.json();
      if (!r.ok) { setError(data.detail || "Upload failed"); return; }
      setTitle("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (err) {
      setError("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(templateId) {
    if (!confirm("Delete this template?")) return;
    await authFetch(`${API}/api/v1/payroll/templates/${templateId}`, { method: "DELETE" });
    setTemplates((prev) => prev.filter((t) => t.template_id !== templateId));
  }

  return (
    <div className="ap-section">
      <form className="ap-form" onSubmit={handleUpload}>
        <h3 className="ap-section-title">Upload Template</h3>
        <p className="ap-hint">
          A template is your payroll file format (PDF, Word, or Excel). Upload it once so you can
          reference it when uploading monthly payroll files.
        </p>
        <div className="ap-form-row">
          <label className="ap-label">Template Name</label>
          <input
            className="ap-input"
            placeholder="e.g. Monthly Salary Sheet"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="ap-form-row">
          <label className="ap-label">File</label>
          <input
            ref={fileRef}
            type="file"
            className="ap-input"
            accept=".pdf,.docx,.xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files[0] || null)}
            required
          />
        </div>
        {error && <div className="ap-error">{error}</div>}
        <button
          type="submit"
          className="ap-btn ap-btn-primary"
          disabled={uploading || !file || !title.trim()}
        >
          {uploading ? "Uploading…" : "Save Template"}
        </button>
      </form>

      <div className="ap-template-list">
        {loading && <div className="ap-loading">Loading…</div>}
        {!loading && templates.length === 0 && (
          <div className="ap-empty">No templates yet.</div>
        )}
        {templates.map((t) => (
          <div key={t.template_id} className="ap-template-row">
            <div className="ap-template-title">{t.title}</div>
            <div className="ap-template-meta">{t.mime_type} · {new Date(t.created_at).toLocaleDateString()}</div>
            <button
              className="ap-btn ap-btn-danger"
              onClick={() => handleDelete(t.template_id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function Stat({ label, value, warn }) {
  return (
    <div className={`ap-stat ${warn ? "warn" : ""}`}>
      <div className="ap-stat-value">{value}</div>
      <div className="ap-stat-label">{label}</div>
    </div>
  );
}

function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
