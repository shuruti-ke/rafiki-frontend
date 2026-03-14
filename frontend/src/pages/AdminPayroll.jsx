import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { API, authFetch } from "../api.js";
import { PayrollCompliancePanel } from "./AdminPayrollCompliance.jsx";
import "./AdminPayroll.css";

const TAB_LABELS = {
  approve: "Approve Payroll",
  upload: "Payroll Run",
  batches: "Batch History",
  compliance: "Compliance & Filing",
};

function getTabsAndDefault() {
  const user = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const hasApprove = !!(user.can_authorize_payroll || user.role === "super_admin");
  const hasProcess = !!(user.can_process_payroll || user.role === "super_admin");
  const tabs = [];
  if (hasApprove) tabs.push("approve");
  tabs.push("batches");
  if (hasProcess) tabs.push("upload");
  tabs.push("compliance");
  const defaultTab = hasApprove ? "approve" : hasProcess ? "upload" : "batches";
  return { tabs, defaultTab };
}

export default function AdminPayroll() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { tabs, defaultTab } = getTabsAndDefault();
  const [tab, setTab] = useState(() => {
    const requestedTab = searchParams.get("tab");
    return tabs.includes(requestedTab) ? requestedTab : defaultTab;
  });

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab && tabs.includes(requestedTab) && requestedTab !== tab) {
      setTab(requestedTab);
    }
  }, [searchParams, tab, tabs]);

  function handleTabChange(nextTab) {
    setTab(nextTab);
    setSearchParams(nextTab === "upload" || nextTab === defaultTab ? {} : { tab: nextTab });
  }

  return (
    <div className="ap-page">
      <div className="ap-header">
        <h1 className="ap-title">Payroll</h1>
        <p className="ap-subtitle">
          Approve payroll, view batch history, run payroll, and complete filing review from one workspace.
        </p>
      </div>

      <div className="ap-tabs">
        {tabs.map((t) => (
          <button
            key={t}
            className={`ap-tab ${tab === t ? "active" : ""}`}
            onClick={() => handleTabChange(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="ap-body">
        {tab === "approve" && <ApproveTab />}
        {tab === "upload" && <UploadTab />}
        {tab === "batches" && <BatchesTab />}
        {tab === "compliance" && <PayrollCompliancePanel embedded />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Approve Tab — batches pending approval (Finance Manager only: can_authorize_payroll)
// ─────────────────────────────────────────────
function ApproveTab() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null); // batch_id being approved/rejected

  useEffect(() => {
    authFetch(`${API}/api/v1/payroll/batches`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setBatches(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pending = batches.filter((b) => b.status === "uploaded_needs_approval");

  async function handleApprove(batchId) {
    setActing(batchId);
    try {
      const r = await authFetch(`${API}/api/v1/payroll/batches/${batchId}/approve`, { method: "POST" });
      const data = await r.json();
      if (r.ok) {
        const br = await authFetch(`${API}/api/v1/payroll/batches`);
        const bdata = await br.json();
        if (Array.isArray(bdata)) setBatches(bdata);
      } else {
        alert(data.detail || "Approve failed");
      }
    } catch (e) {
      alert(e.message || "Approve failed");
    }
    setActing(null);
  }

  async function handleReject(batchId) {
    const reason = window.prompt("Rejection reason (optional):") || "";
    setActing(batchId);
    try {
      const r = await authFetch(
        `${API}/api/v1/payroll/batches/${batchId}/reject?reason=${encodeURIComponent(reason)}`,
        { method: "POST" }
      );
      const data = await r.json();
      if (r.ok) {
        const br = await authFetch(`${API}/api/v1/payroll/batches`);
        const bdata = await br.json();
        if (Array.isArray(bdata)) setBatches(bdata);
      } else {
        alert(data.detail || "Reject failed");
      }
    } catch (e) {
      alert(e.message || "Reject failed");
    }
    setActing(null);
  }

  if (loading) return <div className="ap-loading">Loading…</div>;
  if (pending.length === 0) {
    return (
      <div className="ap-section">
        <p className="ap-hint">No payroll batches awaiting your approval. Check Batch History for all batches.</p>
      </div>
    );
  }

  return (
    <div className="ap-section">
      <p className="ap-hint" style={{ marginBottom: 16 }}>
        The following batches need your approval before they can be parsed and distributed.
      </p>
      <div className="ap-batches-list">
        {pending.map((b) => (
          <div key={b.batch_id} className="ap-batch-row">
            <div className="ap-batch-month">
              {b.period_year}-{String(b.period_month).padStart(2, "0")}
            </div>
            <span className="ap-badge" data-status={b.status}>{b.status.replace(/_/g, " ")}</span>
            <span className="ap-batch-date">{new Date(b.created_at).toLocaleDateString()}</span>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <button
                className="ap-btn ap-btn-primary"
                onClick={() => handleApprove(b.batch_id)}
                disabled={acting === b.batch_id}
              >
                {acting === b.batch_id ? "…" : "Approve"}
              </button>
              <button
                className="ap-btn ap-btn-ghost"
                onClick={() => handleReject(b.batch_id)}
                disabled={acting === b.batch_id}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
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
  const [runMonth, setRunMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [runMsg, setRunMsg] = useState("");
  const [runErr, setRunErr] = useState("");
  const [runningMonthly, setRunningMonthly] = useState(false);
  const runBtnRef = useRef(null);

  // Prepare pay: run-preview rows and local edits (for Thomas: bonuses, deductions, loans)
  const [previewRows, setPreviewRows] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [savingAdjustments, setSavingAdjustments] = useState(false);
  const [adjustmentsSaved, setAdjustmentsSaved] = useState(false);

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

  async function loadPreview() {
    setPreviewError("");
    setPreviewLoading(true);
    try {
      const r = await authFetch(`${API}/api/v1/payroll/run-preview?month=${encodeURIComponent(runMonth)}`);
      const data = await r.json();
      if (!r.ok) {
        setPreviewError(data.detail || "Failed to load preview");
        setPreviewRows([]);
        return;
      }
      setPreviewRows(data.rows || []);
    } catch (err) {
      setPreviewError("Failed to load preview: " + err.message);
      setPreviewRows([]);
    } finally {
      setPreviewLoading(false);
    }
  }

  function updatePreviewRow(userId, field, value) {
    const next =
      field === "notes"
        ? value
        : field === "base_salary_override"
          ? (value === "" || isNaN(parseFloat(value)) ? null : parseFloat(value))
          : parseFloat(value) || 0;
    setPreviewRows((rows) =>
      rows.map((r) =>
        r.user_id === userId ? { ...r, adjustment: { ...(r.adjustment || {}), [field]: next } } : r
      )
    );
    setAdjustmentsSaved(false);
  }

  async function saveAdjustments() {
    setPreviewError("");
    setSavingAdjustments(true);
    try {
      const adjustments = previewRows.map((r) => ({
        user_id: r.user_id,
        base_salary_override: r.adjustment?.base_salary_override ?? null,
        bonus: r.adjustment?.bonus ?? 0,
        pension_optional: r.adjustment?.pension_optional ?? 0,
        insurance_relief_basis: r.adjustment?.insurance_relief_basis ?? 0,
        loan_repayment: r.adjustment?.loan_repayment ?? 0,
        other_deductions: r.adjustment?.other_deductions ?? 0,
        notes: r.adjustment?.notes ?? null,
      }));
      const r = await authFetch(`${API}/api/v1/payroll/run-adjustments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: runMonth, adjustments }),
      });
      const data = await r.json();
      if (!r.ok) {
        setPreviewError(data.detail || "Failed to save adjustments");
        return;
      }
      setAdjustmentsSaved(true);
      loadPreview();
    } catch (err) {
      setPreviewError("Failed to save: " + err.message);
    } finally {
      setSavingAdjustments(false);
    }
  }

  async function handleRunMonthly(e) {
    e.preventDefault();
    setRunMsg("");
    setRunErr("");
    setError("");
    setRunningMonthly(true);
    try {
      const r = await authFetch(
        `${API}/api/v1/payroll/run-monthly?month=${encodeURIComponent(runMonth)}`,
        { method: "POST" }
      );
      const data = await r.json();
      if (!r.ok) {
        setRunErr(data.detail || "Failed to run monthly payroll");
        return;
      }
      setMonth(runMonth);
      setBatch(data);
      setParseResult(null);
      setDistributeResult(null);
      setApprovalSent(false);
      setRunMsg(data.warning || "Batch created from employee salaries. Request approval, then parse and distribute.");
    } catch (err) {
      setRunErr("Failed to run monthly payroll: " + err.message);
    } finally {
      setRunningMonthly(false);
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

  async function handleParseAndDistribute() {
    if (!batch) return;
    setDistributing(true);
    setError("");
    setParseResult(null);
    try {
      const r = await authFetch(
        `${API}/api/v1/payroll/batches/${batch.batch_id}/parse-and-distribute`,
        { method: "POST" }
      );
      const data = await r.json();
      if (!r.ok) {
        setError(data.detail || "Parse and distribute failed");
        return;
      }
      setDistributeResult(data);
      setBatch((b) => ({ ...b, status: "distributed" }));
    } catch (err) {
      setError("Parse and distribute failed: " + err.message);
    } finally {
      setDistributing(false);
    }
  }

  async function handleSendBack() {
    if (!batch) return;
    const reason = window.prompt("Reason for sending back (visible to creator and finance manager):") ?? "";
    setError("");
    try {
      const r = await authFetch(
        `${API}/api/v1/payroll/batches/${batch.batch_id}/send-back?reason=${encodeURIComponent(reason)}`,
        { method: "POST" }
      );
      const data = await r.json();
      if (!r.ok) {
        setError(data.detail || "Send back failed");
        return;
      }
      setBatch((b) => ({ ...b, status: "uploaded_needs_approval" }));
    } catch (err) {
      setError("Send back failed: " + err.message);
    }
  }

  const user = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const canProcessPayroll = !!(user.can_process_payroll || user.role === "super_admin");
  const canDistributePayroll = user.role === "hr_admin" || user.role === "super_admin";
  const canParse = batch && batch.status === "uploaded";
  const canDistribute = batch && batch.status === "parsed" && parseResult && parseResult.reconciled;
  const needsApproval = batch && batch.status === "uploaded_needs_approval";
  const canParseAndDistribute = canParse && canDistributePayroll;

  return (
    <div className="ap-section">
      {canProcessPayroll && (
        <div className="ap-prepare-pay">
          <h3 className="ap-subtitle">Prepare pay for month</h3>
          <p className="ap-hint" style={{ marginBottom: 12 }}>
            Edit bonuses, deductions, loan repayments, and optional pension before running the month. Tax (PAYE, NSSF, SHIF, housing) is calculated from the same formula as the final run.
          </p>
          <div className="ap-run-row" style={{ marginBottom: 12 }}>
            <input
              type="month"
              className="ap-input ap-input--month"
              value={runMonth}
              onChange={(e) => { setRunMonth(e.target.value); setAdjustmentsSaved(false); }}
            />
            <button type="button" className="ap-btn ap-btn-ghost" onClick={loadPreview} disabled={previewLoading}>
              {previewLoading ? "Loading…" : "Load preview"}
            </button>
            {previewRows.length > 0 && (
              <button type="button" className="ap-btn ap-btn-primary" onClick={saveAdjustments} disabled={savingAdjustments}>
                {savingAdjustments ? "Saving…" : "Save adjustments"}
              </button>
            )}
          </div>
          {previewError && <div className="ap-notice ap-notice--error">{previewError}</div>}
          {adjustmentsSaved && <div className="ap-notice ap-notice--success">Adjustments saved. Run for Month will use these values.</div>}
          {previewRows.length > 0 && (
            <>
              <p className="ap-hint" style={{ marginTop: 8, marginBottom: 0 }}>
                Pass-through columns (PAYE, NSSF, SHIF, AHL, Net) reflect saved values. Save adjustments to refresh after editing.
              </p>
              <div className="ap-preview-table-wrap">
              <table className="ap-preview-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Base</th>
                    <th>Base override</th>
                    <th>Bonus</th>
                    <th>Pension</th>
                    <th>Loan</th>
                    <th>Other ded.</th>
                    <th>PAYE</th>
                    <th>NSSF</th>
                    <th>SHIF</th>
                    <th>AHL</th>
                    <th>Total stat.</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => (
                    <tr key={r.user_id}>
                      <td>{r.employee_name}</td>
                      <td>{Number(r.base_salary).toLocaleString()}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="—"
                          className="ap-input ap-input--small"
                          value={r.adjustment?.base_salary_override ?? ""}
                          onChange={(e) => updatePreviewRow(r.user_id, "base_salary_override", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="ap-input ap-input--small"
                          value={r.adjustment?.bonus ?? 0}
                          onChange={(e) => updatePreviewRow(r.user_id, "bonus", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="ap-input ap-input--small"
                          value={r.adjustment?.pension_optional ?? 0}
                          onChange={(e) => updatePreviewRow(r.user_id, "pension_optional", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="ap-input ap-input--small"
                          value={r.adjustment?.loan_repayment ?? 0}
                          onChange={(e) => updatePreviewRow(r.user_id, "loan_repayment", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="ap-input ap-input--small"
                          value={r.adjustment?.other_deductions ?? 0}
                          onChange={(e) => updatePreviewRow(r.user_id, "other_deductions", e.target.value)}
                        />
                      </td>
                      <td>{Number(r.paye).toLocaleString()}</td>
                      <td>{Number(r.nssf).toLocaleString()}</td>
                      <td>{Number(r.shif).toLocaleString()}</td>
                      <td>{Number(r.ahl).toLocaleString()}</td>
                      <td>{Number(r.statutory_total).toLocaleString()}</td>
                      <td>{Number(r.net).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      )}

      <form className="ap-form" onSubmit={handleUpload}>
        <div className="ap-form-row ap-form-row-split">
          <div>
            <label className="ap-label">Run Monthly Payroll</label>
            <div className="ap-run-row">
              <input
                type="month"
                className="ap-input ap-input--month"
                value={runMonth}
                onChange={(e) => setRunMonth(e.target.value)}
                required
              />
              <button
                ref={runBtnRef}
                type="button"
                className="ap-btn ap-btn-secondary"
                onClick={handleRunMonthly}
                disabled={runningMonthly}
              >
                Run for Month
              </button>
              {runningMonthly && (
                <span className="ap-loading" style={{ marginLeft: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span className="ap-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} aria-hidden />
                  Payroll is processing…
                </span>
              )}
            </div>
            <p className="ap-hint">
              Choose the month to process. After running, complete the flow in Batch History (approve → parse → distribute).
            </p>
            {runMsg && <div className="ap-notice ap-notice--success">{runMsg}</div>}
            {runErr && <div className="ap-notice ap-notice--error">{runErr}</div>}
          </div>
        </div>
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

          {/* 3 steps: (1) Thomas create (2) Finance approve (3) HR admin parse & distribute */}
          {needsApproval && (
            <div className="ap-step">
              <h3 className="ap-step-title">Step 2 — Finance manager: Approve</h3>
              <p className="ap-hint">Approval request sent to the Finance manager. After they approve, HR Admin can complete Step 3 in Batch History.</p>
            </div>
          )}

          {/* Step 3: HR admin — Parse & distribute, or Send back if there's an issue */}
          {canParseAndDistribute && (
            <div className="ap-step">
              <h3 className="ap-step-title">Step 3 — Parse & distribute</h3>
              <p className="ap-hint">Parse the payroll file and issue payslips to all matched employees in one action. If something is wrong, send the batch back so creator or finance can fix it.</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  className="ap-btn ap-btn-primary"
                  onClick={handleParseAndDistribute}
                  disabled={distributing}
                >
                  {distributing ? "Parsing & distributing…" : "Parse & distribute"}
                </button>
                <button type="button" className="ap-btn ap-btn-ghost" onClick={handleSendBack}>
                  Send back (have an issue)
                </button>
              </div>
            </div>
          )}
          {canParse && !canDistributePayroll && (
            <div className="ap-step">
              <p className="ap-hint">Step 3: Only HR Admin can parse and distribute. Complete in Batch History.</p>
            </div>
          )}

          {/* Parse results (when batch was parsed separately, e.g. legacy) */}
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

              {/* Distribute (when batch was already parsed, e.g. legacy flow) */}
              <div className="ap-step">
                <h3 className="ap-step-title">Distribute payslips</h3>
                {canDistributePayroll ? (
                  <>
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
                  </>
                ) : (
                  <p className="ap-hint">Only HR Admin can distribute. Complete in Batch History.</p>
                )}
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
  const [preview, setPreview] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [distributeResult, setDistributeResult] = useState(null);
  const [validation, setValidation] = useState(null);
  const [filingReport, setFilingReport] = useState(null);
  const [approvalTrail, setApprovalTrail] = useState(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

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
    setPreview(null);
    setDistributeResult(null);
    setValidation(null);
    setFilingReport(null);
    setApprovalTrail(null);
    if (batch.status === "distributed" || batch.status === "parsed") {
      try {
        const fetches = [
          authFetch(`${API}/api/v1/payroll/batches/${batch.batch_id}/verify`),
          authFetch(`${API}/api/v1/payroll/statutory/validate/batch/${batch.batch_id}`, { method: "POST" }),
          authFetch(`${API}/api/v1/payroll/statutory/reports/batch/${batch.batch_id}`),
        ];
        if (batch.status === "distributed") {
          fetches.push(authFetch(`${API}/api/v1/payroll/batches/${batch.batch_id}/approval-trail`));
        }
        const results = await Promise.all(fetches);
        if (results[0].ok) setDetail(await results[0].json());
        if (results[1].ok) setValidation(await results[1].json());
        if (results[2].ok) setFilingReport(await results[2].json());
        if (batch.status === "distributed" && results[3]?.ok) setApprovalTrail(await results[3].json());
      } catch {}
    } else if (batch.status === "uploaded_needs_approval" || batch.status === "uploaded") {
      try {
        const r = await authFetch(`${API}/api/v1/payroll/batches/${batch.batch_id}/preview`);
        if (r.ok) setPreview(await r.json());
      } catch {}
    }
    setLoadingDetail(false);
  }

  async function handleParse(batchId) {
    setParsing(true);
    setDetail(null);
    try {
      // POST /parse transitions status uploaded→parsed and returns results
      const r = await authFetch(`${API}/api/v1/payroll/batches/${batchId}/parse`, { method: "POST" });
      const data = await r.json();
      if (r.ok) {
        setDetail(data);
        // refresh batch list so status shows "parsed"
        const br = await authFetch(`${API}/api/v1/payroll/batches`);
        const bdata = await br.json();
        if (Array.isArray(bdata)) {
          setBatches(bdata);
          const updated = bdata.find(b => b.batch_id === batchId);
          if (updated) setSelectedBatch(updated);
        }
      } else {
        setDetail({ error: data.detail || "Parse failed" });
      }
    } catch (e) {
      setDetail({ error: e.message });
    }
    setParsing(false);
  }

  async function handleDistribute(batchId) {
    if (!confirm("Distribute payslips to all matched employees? This cannot be undone.")) return;
    setDistributing(true);
    try {
      const r = await authFetch(`${API}/api/v1/payroll/batches/${batchId}/distribute`, { method: "POST" });
      const data = await r.json();
      if (r.ok) {
        setDistributeResult(data.message || "Payslips distributed successfully.");
        const br = await authFetch(`${API}/api/v1/payroll/batches`);
        const bdata = await br.json();
        if (Array.isArray(bdata)) {
          setBatches(bdata);
          const updated = bdata.find(b => b.batch_id === batchId);
          if (updated) setSelectedBatch(updated);
        }
      } else {
        setDistributeResult("Error: " + (data.detail || "Distribution failed"));
      }
    } catch (e) {
      setDistributeResult("Error: " + e.message);
    }
    setDistributing(false);
  }

  async function handleParseAndDistribute(batchId) {
    if (!confirm("Parse the payroll file and distribute payslips to all matched employees? This cannot be undone.")) return;
    setDistributing(true);
    setDetail(null);
    setDistributeResult(null);
    try {
      const r = await authFetch(`${API}/api/v1/payroll/batches/${batchId}/parse-and-distribute`, { method: "POST" });
      const data = await r.json();
      if (r.ok) {
        setDistributeResult(data.message || "Parsed and distributed successfully.");
        const br = await authFetch(`${API}/api/v1/payroll/batches`);
        const bdata = await br.json();
        if (Array.isArray(bdata)) {
          setBatches(bdata);
          const updated = bdata.find(b => b.batch_id === batchId);
          if (updated) setSelectedBatch(updated);
        }
      } else {
        setDistributeResult("Error: " + (data.detail || "Parse and distribute failed"));
      }
    } catch (e) {
      setDistributeResult("Error: " + e.message);
    }
    setDistributing(false);
  }

  async function handleSendBack(batchId) {
    const reason = window.prompt("Reason for sending back (visible to creator and finance manager):") ?? "";
    try {
      const r = await authFetch(
        `${API}/api/v1/payroll/batches/${batchId}/send-back?reason=${encodeURIComponent(reason)}`,
        { method: "POST" }
      );
      const data = await r.json();
      if (r.ok) {
        const br = await authFetch(`${API}/api/v1/payroll/batches`);
        const bdata = await br.json();
        if (Array.isArray(bdata)) {
          setBatches(bdata);
          const updated = bdata.find(b => b.batch_id === batchId);
          if (updated) setSelectedBatch(updated);
        }
        setDistributeResult(null);
      } else {
        setDistributeResult("Error: " + (data.detail || "Send back failed"));
      }
    } catch (e) {
      setDistributeResult("Error: " + e.message);
    }
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

  async function handleExportCsv(batchId) {
    setExportingCsv(true);
    try {
      const r = await authFetch(`${API}/api/v1/payroll/batches/${batchId}/export-csv`);
      if (!r.ok) return;
      const blob = await r.blob();
      const disp = r.headers.get("Content-Disposition");
      const match = disp && disp.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : `payroll_batch_${batchId}_with_summary.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
    setExportingCsv(false);
  }

  const user = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const canParsePayroll = user.role === "hr_admin" || user.role === "super_admin";
  const canDistributePayroll = user.role === "hr_admin" || user.role === "super_admin";
  const canApprovePayroll = !!(user.can_authorize_payroll || user.role === "super_admin");
  const canRejectPayroll = !!(user.can_approve_payroll || user.can_authorize_payroll || user.role === "hr_admin" || user.role === "super_admin");

  if (loading) return <div className="ap-loading">Loading…</div>;
  if (batches.length === 0) {
    return <div className="ap-empty">No payroll batches yet. Upload a payroll file to get started.</div>;
  }

  return (
    <div className="ap-section">
      <div className="ap-batches-list">
        {batches.map((b) => (
          <div key={b.batch_id} className="ap-batch-list-item" style={{ marginBottom: selected === b.batch_id ? 0 : undefined }}>
            <div
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

            {selected === b.batch_id && selectedBatch && (
              <div className="ap-batch-detail" style={{ marginTop: 0 }}>
          <div className="ap-batch-detail-header">
            <span className="ap-badge" data-status={selectedBatch.status}>
              {selectedBatch.status.replace(/_/g, " ")}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="ap-btn ap-btn-ghost"
                onClick={() => handleDownload(selected)}
                disabled={downloading}
              >
                {downloading ? "…" : "Download File"}
              </button>
              {(selectedBatch.status === "parsed" || selectedBatch.status === "distributed") && (
                <button
                  className="ap-btn ap-btn-ghost"
                  onClick={() => handleExportCsv(selected)}
                  disabled={exportingCsv}
                >
                  {exportingCsv ? "…" : "Download CSV with summary"}
                </button>
              )}
            </div>
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

              {validation?.summary && (
                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  <div className="ap-step-title">Statutory Validation</div>
                  <div className="ap-stats-row">
                    <Stat label="Within Tolerance" value={validation.summary.within_tolerance_count} />
                    <Stat label="Needs Review" value={validation.summary.needs_review_count} warn={validation.summary.needs_review_count > 0} />
                    <Stat label="Declared Statutory" value={fmt(validation.summary.declared_statutory)} />
                    <Stat label="Expected Statutory" value={fmt(validation.summary.expected_statutory)} />
                  </div>
                </div>
              )}

              {filingReport?.filing_summary && (
                <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                  <div className="ap-step-title">Filing Summary</div>
                  {filingReport.filing_note && (
                    <p className="ap-hint" style={{ fontSize: 12, margin: 0 }}>{filingReport.filing_note}</p>
                  )}
                  <div className="ap-stats-row">
                    {Object.entries(filingReport.filing_summary).map(([key, value]) => (
                      <Stat key={key} label={key.toUpperCase()} value={fmt(value)} />
                    ))}
                  </div>
                </div>
              )}

              {approvalTrail && selectedBatch.status === "distributed" && (
                <div className="ap-step" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <h3 className="ap-step-title">Approval trail</h3>
                  <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
                    <div>
                      <span className="ap-label">{approvalTrail.requested_by?.role_label}: </span>
                      <strong>{approvalTrail.requested_by?.name || "—"}</strong>
                    </div>
                    <div>
                      <span className="ap-label">{approvalTrail.approved_by?.role_label}: </span>
                      <strong>{approvalTrail.approved_by?.name || "—"}</strong>
                      {approvalTrail.approved_by?.at && (
                        <span className="ap-hint" style={{ marginLeft: 8, fontSize: 12 }}>({new Date(approvalTrail.approved_by.at).toLocaleString()})</span>
                      )}
                    </div>
                    <div>
                      <span className="ap-label">{approvalTrail.distributed_by?.role_label}: </span>
                      <strong>{approvalTrail.distributed_by?.name || "—"}</strong>
                      {approvalTrail.distributed_by?.at && (
                        <span className="ap-hint" style={{ marginLeft: 8, fontSize: 12 }}>({new Date(approvalTrail.distributed_by.at).toLocaleString()})</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Action buttons: Step 3 (HR admin) = Parse & distribute when uploaded; or Distribute when already parsed (legacy) */}
          {(selectedBatch.status === "uploaded" || selectedBatch.status === "parsed") && (
            <div className="ap-step" style={{ marginTop: 16 }}>
              {selectedBatch.status === "uploaded" && canDistributePayroll && (
                <>
                  <h3 className="ap-step-title">Step 3 — Parse & distribute</h3>
                  <p className="ap-hint">Parse the payroll file and issue payslips in one action. If you have an issue with this payroll, send it back so creator or finance can fix it.</p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      className="ap-btn ap-btn-primary"
                      onClick={() => handleParseAndDistribute(selected)}
                      disabled={distributing}
                    >
                      {distributing ? "Parsing & distributing…" : "Parse & distribute"}
                    </button>
                    <button
                      type="button"
                      className="ap-btn ap-btn-ghost"
                      onClick={() => handleSendBack(selected)}
                    >
                      Send back (have an issue)
                    </button>
                  </div>
                </>
              )}
              {selectedBatch.status === "uploaded" && !canDistributePayroll && (
                <p className="ap-hint">Step 3: Only HR Admin can parse and distribute.</p>
              )}
              {detail?.error && (
                <div className="ap-error" style={{ marginTop: 8 }}>{detail.error}</div>
              )}
              {selectedBatch.status === "parsed" && detail && canDistributePayroll && (
                <>
                  <h3 className="ap-step-title">Distribute Payslips</h3>
                  {detail.matched_count === 0 && (
                    <div className="ap-error">No employees matched — cannot distribute.</div>
                  )}
                  {distributeResult ? (
                    <div className={distributeResult.startsWith("Error") ? "ap-error" : "ap-success"}>
                      {distributeResult}
                    </div>
                  ) : (
                    <button
                      className="ap-btn ap-btn-primary"
                      onClick={() => handleDistribute(selected)}
                      disabled={distributing || detail.matched_count === 0}
                    >
                      {distributing ? "Distributing…" : `Distribute to ${detail.matched_count} employees`}
                    </button>
                  )}
                </>
              )}
              {selectedBatch.status === "parsed" && detail && !canDistributePayroll && (
                <p className="ap-hint">Only HR Admin can distribute and issue payslips.</p>
              )}
            </div>
          )}

          {distributeResult && selectedBatch.status === "distributed" && (
            <div className="ap-success" style={{ marginTop: 12 }}>{distributeResult}</div>
          )}

          {/* Statutory preview for uploaded / uploaded_needs_approval (PAYE, SHIF, housing, etc.) */}
          {preview && (selectedBatch.status === "uploaded_needs_approval" || selectedBatch.status === "uploaded") && (
            <div className="ap-step" style={{ marginTop: 16 }}>
              <h3 className="ap-step-title">Statutory breakdown (preview)</h3>
              <div className="ap-stats-row" style={{ marginBottom: 12 }}>
                <Stat label="Employees" value={preview.employee_count} />
                <Stat label="Total Gross" value={fmt(preview.totals?.gross_pay)} />
                <Stat label="PAYE" value={fmt(preview.totals?.paye)} />
                <Stat label="NSSF" value={fmt(preview.totals?.nssf)} />
                <Stat label="SHIF" value={fmt(preview.totals?.shif)} />
                <Stat label="Housing (AHL)" value={fmt(preview.totals?.ahl)} />
                <Stat label="Statutory Total" value={fmt(preview.totals?.statutory_total)} />
                <Stat label="Est. Net Pay" value={fmt(preview.totals?.estimated_net_pay)} />
              </div>
              <div className="ap-entries-table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Gross</th>
                      <th>PAYE</th>
                      <th>NSSF</th>
                      <th>SHIF</th>
                      <th>Housing (AHL)</th>
                      <th>Relief</th>
                      <th>Statutory Total</th>
                      <th>Est. Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.entries?.map((e, i) => (
                      <tr key={i}>
                        <td>{e.employee_name}</td>
                        <td>{fmt(e.gross_pay)}</td>
                        <td>{fmt(e.paye)}</td>
                        <td>{fmt(e.nssf)}</td>
                        <td>{fmt(e.shif)}</td>
                        <td>{fmt(e.ahl)}</td>
                        <td>{fmt(e.personal_relief)}</td>
                        <td>{fmt(e.statutory_total)}</td>
                        <td>{fmt(e.estimated_net_pay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedBatch.status === "uploaded_needs_approval" && (canApprovePayroll || canRejectPayroll) && (
                <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                  {canApprovePayroll && (
                    <button
                      className="ap-btn ap-btn-primary"
                      onClick={async () => {
                        setApproving(true);
                        try {
                          const r = await authFetch(`${API}/api/v1/payroll/batches/${selected}/approve`, { method: "POST" });
                          const data = await r.json();
                          if (r.ok) {
                            const br = await authFetch(`${API}/api/v1/payroll/batches`);
                            const bdata = await br.json();
                            if (Array.isArray(bdata)) {
                              setBatches(bdata);
                              const updated = bdata.find((b) => b.batch_id === selected);
                              if (updated) {
                                setSelectedBatch(updated);
                                setPreview(null);
                                loadDetail(updated);
                              }
                            }
                          } else alert(data.detail || "Approve failed");
                        } catch (e) {
                          alert(e.message || "Approve failed");
                        }
                        setApproving(false);
                      }}
                      disabled={approving}
                    >
                      {approving ? "…" : "Approve"}
                    </button>
                  )}
                  {canRejectPayroll && (
                    <button
                      className="ap-btn ap-btn-ghost"
                      onClick={async () => {
                        const reason = window.prompt("Rejection reason (optional):") ?? "";
                        setRejecting(true);
                        try {
                          const r = await authFetch(
                            `${API}/api/v1/payroll/batches/${selected}/reject?reason=${encodeURIComponent(reason)}`,
                            { method: "POST" }
                          );
                          const data = await r.json();
                          if (r.ok) {
                            const br = await authFetch(`${API}/api/v1/payroll/batches`);
                            const bdata = await br.json();
                            if (Array.isArray(bdata)) {
                              setBatches(bdata);
                              const updated = bdata.find((b) => b.batch_id === selected);
                              if (updated) setSelectedBatch(updated);
                              setPreview(null);
                              setDetail(null);
                            }
                          } else alert(data.detail || "Reject failed");
                        } catch (e) {
                          alert(e.message || "Reject failed");
                        }
                        setRejecting(false);
                      }}
                      disabled={rejecting}
                    >
                      Reject
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {!detail && !preview && !loadingDetail && selectedBatch.status !== "distributed" && selectedBatch.status !== "parsed" && selectedBatch.status !== "uploaded" && selectedBatch.status !== "uploaded_needs_approval" && (
            <div className="ap-hint" style={{ marginTop: 12 }}>
              Detailed breakdown available after parsing.
            </div>
          )}
              </div>
            )}
          </div>
        ))}
      </div>
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
