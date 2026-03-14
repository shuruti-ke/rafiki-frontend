import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";
import "./AdminPayroll.css";

function fmt(num) {
  if (num == null || Number.isNaN(num)) return "—";
  return Number(num).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Section({ title, description, children }) {
  return (
    <div className="ap-step" style={{ marginBottom: 24 }}>
      <h3 className="ap-step-title">{title}</h3>
      {description && <p className="ap-hint" style={{ marginTop: 4, marginBottom: 12 }}>{description}</p>}
      {children}
    </div>
  );
}

function canChangeStatutoryRates(user) {
  if (!user) return false;
  return user.role === "hr_admin" || user.role === "super_admin" || !!user.can_authorize_payroll;
}

export function PayrollCompliancePanel({ embedded = false }) {
  const user = typeof localStorage !== "undefined" ? JSON.parse(localStorage.getItem("rafiki_user") || "{}") : {};
  const [cfg, setCfg] = useState(null);
  const [versions, setVersions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [calc, setCalc] = useState({ gross_pay: 100000, pension_contribution: 0, insurance_relief_basis: 0 });
  const [result, setResult] = useState(null);
  const [validation, setValidation] = useState(null);
  const [report, setReport] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEditRates, setShowEditRates] = useState(false);
  const canChangeRates = canChangeStatutoryRates(user);

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const [res, versionRes, batchRes] = await Promise.all([
        authFetch(`${API}/api/v1/payroll/statutory/config`),
        authFetch(`${API}/api/v1/payroll/statutory/config/versions`),
        authFetch(`${API}/api/v1/payroll/batches`),
      ]);
      if (res.ok) {
        const data = await res.json();
        setCfg(data.config ?? null);
        setMsg("");
      } else {
        setCfg(null);
        const err = await res.json().catch(() => ({}));
        setMsg(err.detail || "Unable to load statutory config.");
      }
      if (versionRes.ok) {
        const data = await versionRes.json();
        setVersions(data.versions || []);
      }
      if (batchRes.ok) {
        const data = await batchRes.json();
        setBatches(Array.isArray(data) ? data : []);
      }
    } catch {
      setMsg("Failed to load compliance data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const saveConfig = async () => {
    if (!cfg) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await authFetch(`${API}/api/v1/payroll/statutory/config`, {
        method: "PUT",
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      setMsg(res.ok ? "Config saved." : (data.detail || "Failed to save"));
      if (res.ok) load();
    } catch {
      setMsg("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const runCalc = async () => {
    setMsg("");
    try {
      const res = await authFetch(`${API}/api/v1/payroll/statutory/calculate`, {
        method: "POST",
        body: JSON.stringify(calc),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data.result);
      } else {
        setMsg(data.detail || "Calculation failed");
        setResult(null);
      }
    } catch {
      setMsg("Calculation failed");
      setResult(null);
    }
  };

  const loadValidation = async () => {
    if (!batchId) return;
    setValidating(true);
    setValidation(null);
    setReport(null);
    setMsg("");
    try {
      const [validateRes, reportRes] = await Promise.all([
        authFetch(`${API}/api/v1/payroll/statutory/validate/batch/${batchId}`, { method: "POST" }),
        authFetch(`${API}/api/v1/payroll/statutory/reports/batch/${batchId}`),
      ]);
      const validateData = await validateRes.json().catch(() => ({}));
      const reportData = reportRes.ok ? await reportRes.json() : null;
      if (validateRes.ok) {
        setValidation(validateData);
      } else {
        const errMsg = typeof validateData.detail === "string" ? validateData.detail : "Validation failed";
        setMsg(errMsg);
      }
      if (reportRes.ok) setReport(reportData);
    } catch {
      setMsg("Failed to load validation or report.");
    } finally {
      setValidating(false);
    }
  };

  const parsedBatches = batches.filter((b) => b.status === "parsed" || b.status === "distributed");

  if (loading) {
    return (
      <div className="ap-section">
        <div className="ap-loading">Loading compliance…</div>
      </div>
    );
  }

  return (
    <div className="ap-section" style={{ maxWidth: 900 }}>
      {!embedded && (
        <>
          <h2 className="ap-section-title" style={{ fontSize: 18, marginBottom: 4 }}>Compliance &amp; Filing</h2>
          <p className="ap-hint" style={{ marginBottom: 20 }}>
            Manage statutory rates (Kenya), run a quick deduction estimate, and validate a payroll batch before filing.
          </p>
        </>
      )}

      {msg && (
        <div className={msg.includes("Failed") || msg.includes("error") ? "ap-error" : "ap-notice ap-notice--success"} style={{ marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* 1. Statutory config */}
      <Section
        title="1. Statutory rates (PAYE, NSSF, SHIF, Housing)"
        description="Rates and limits used for payroll. Only finance managers (or HR admin) can change rates."
      >
        {cfg ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div className="ap-stats-row" style={{ flexWrap: "wrap", gap: 10, padding: 12, background: "var(--panel)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div className="ap-batch-row" style={{ padding: "6px 10px" }}><span className="ap-label">Personal relief</span><strong>{fmt(cfg.personal_relief)} KES</strong></div>
              <div className="ap-batch-row" style={{ padding: "6px 10px" }}><span className="ap-label">SHIF</span><strong>{(Number(cfg.shif_rate) * 100).toFixed(2)}%</strong></div>
              <div className="ap-batch-row" style={{ padding: "6px 10px" }}><span className="ap-label">NSSF tier 1</span><strong>{(Number(cfg.nssf_rate_tier1) * 100).toFixed(2)}%</strong></div>
              <div className="ap-batch-row" style={{ padding: "6px 10px" }}><span className="ap-label">NSSF tier 2</span><strong>{(Number(cfg.nssf_rate_tier2) * 100).toFixed(2)}%</strong></div>
              <div className="ap-batch-row" style={{ padding: "6px 10px" }}><span className="ap-label">Housing (AHL)</span><strong>{(Number(cfg.ahl_rate) * 100).toFixed(2)}%</strong></div>
              <div className="ap-batch-row" style={{ padding: "6px 10px" }}><span className="ap-label">NSSF limits</span><strong>{fmt(cfg.nssf_lower_limit)} – {fmt(cfg.nssf_upper_limit)}</strong></div>
            </div>
            {canChangeRates && (
              <>
                {!showEditRates ? (
                  <button type="button" className="ap-btn ap-btn-secondary" onClick={() => setShowEditRates(true)}>
                    Change rates
                  </button>
                ) : (
                  <div style={{ display: "grid", gap: 16, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                      <label className="ap-form-row">
                        <span className="ap-label">Personal relief (KES)</span>
                        <input type="number" step="0.01" className="ap-input" value={cfg.personal_relief ?? ""} onChange={(e) => setCfg((c) => ({ ...c, personal_relief: Number(e.target.value) }))} />
                      </label>
                      <label className="ap-form-row">
                        <span className="ap-label">SHIF rate %</span>
                        <input type="number" step="0.0001" className="ap-input" value={cfg.shif_rate ?? ""} onChange={(e) => setCfg((c) => ({ ...c, shif_rate: Number(e.target.value) }))} />
                      </label>
                      <label className="ap-form-row">
                        <span className="ap-label">Housing levy (AHL) %</span>
                        <input type="number" step="0.0001" className="ap-input" value={cfg.ahl_rate ?? ""} onChange={(e) => setCfg((c) => ({ ...c, ahl_rate: Number(e.target.value) }))} />
                      </label>
                      <label className="ap-form-row">
                        <span className="ap-label">NSSF lower limit</span>
                        <input type="number" step="0.01" className="ap-input" value={cfg.nssf_lower_limit ?? ""} onChange={(e) => setCfg((c) => ({ ...c, nssf_lower_limit: Number(e.target.value) }))} />
                      </label>
                      <label className="ap-form-row">
                        <span className="ap-label">NSSF upper limit</span>
                        <input type="number" step="0.01" className="ap-input" value={cfg.nssf_upper_limit ?? ""} onChange={(e) => setCfg((c) => ({ ...c, nssf_upper_limit: Number(e.target.value) }))} />
                      </label>
                      <label className="ap-form-row">
                        <span className="ap-label">NSSF tier 1 rate %</span>
                        <input type="number" step="0.0001" className="ap-input" value={cfg.nssf_rate_tier1 ?? ""} onChange={(e) => setCfg((c) => ({ ...c, nssf_rate_tier1: Number(e.target.value) }))} />
                      </label>
                      <label className="ap-form-row">
                        <span className="ap-label">NSSF tier 2 rate %</span>
                        <input type="number" step="0.0001" className="ap-input" value={cfg.nssf_rate_tier2 ?? ""} onChange={(e) => setCfg((c) => ({ ...c, nssf_rate_tier2: Number(e.target.value) }))} />
                      </label>
                    </div>
                    <label className="ap-form-row">
                      <span className="ap-label">Notes (e.g. rate change reason)</span>
                      <input type="text" className="ap-input" value={cfg.notes || ""} onChange={(e) => setCfg((c) => ({ ...c, notes: e.target.value }))} placeholder="Optional" />
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="ap-btn ap-btn-primary" onClick={saveConfig} disabled={saving}>
                        {saving ? "Saving…" : "Save statutory config"}
                      </button>
                      <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setShowEditRates(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="ap-hint">Unable to load config. Ensure you have payroll access.</p>
        )}
      </Section>

      {/* 2. Quick calculator */}
      <Section
        title="2. Quick deduction estimate"
        description="Enter a gross pay to see estimated PAYE, NSSF, SHIF, housing and net pay."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <label className="ap-form-row" style={{ marginBottom: 0 }}>
            <span className="ap-label">Gross pay (KES)</span>
            <input
              type="number"
              step="0.01"
              className="ap-input"
              style={{ width: 140 }}
              value={calc.gross_pay}
              onChange={(e) => setCalc((c) => ({ ...c, gross_pay: Number(e.target.value) }))}
            />
          </label>
          <button type="button" className="ap-btn ap-btn-primary" onClick={runCalc}>
            Calculate
          </button>
        </div>
        {result && (
          <div className="ap-stats-row" style={{ marginTop: 16, flexWrap: "wrap" }}>
            <div className="ap-batch-detail" style={{ padding: 12, borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div><strong>Taxable pay</strong> {fmt(result.taxable_pay)}</div>
                <div><strong>PAYE</strong> {fmt(result.paye)}</div>
                <div><strong>NSSF</strong> {fmt(result.nssf)}</div>
                <div><strong>SHIF</strong> {fmt(result.shif)}</div>
                <div><strong>AHL (housing)</strong> {fmt(result.ahl)}</div>
                <div style={{ marginTop: 6, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  <strong>Est. net pay</strong> {fmt(result.estimated_net_pay)}
                </div>
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* 3. Batch validation & filing */}
      <Section
        title="3. Validate batch &amp; filing summary"
        description="Select a parsed or distributed batch to check it matches statutory rules and view the filing summary."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <select
            className="ap-input"
            value={batchId}
            onChange={(e) => { setBatchId(e.target.value); setValidation(null); setReport(null); }}
            style={{ minWidth: 200 }}
          >
            <option value="">Select payroll batch</option>
            {parsedBatches.map((batch) => (
              <option key={batch.batch_id} value={batch.batch_id}>
                {batch.period_year}-{String(batch.period_month).padStart(2, "0")} — {batch.status}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ap-btn ap-btn-primary"
            onClick={loadValidation}
            disabled={!batchId || validating}
          >
            {validating ? "Loading…" : "Validate &amp; load report"}
          </button>
        </div>

        {validation?.summary && (
          <div className="ap-stats-row" style={{ marginTop: 16, flexWrap: "wrap" }}>
            <div className="ap-batch-row" style={{ padding: "10px 14px" }}>
              <span className="ap-label">Within tolerance</span>
              <strong>{validation.summary.within_tolerance_count}</strong>
            </div>
            <div className="ap-batch-row" style={{ padding: "10px 14px" }}>
              <span className="ap-label">Needs review</span>
              <strong className={validation.summary.needs_review_count > 0 ? "ap-error" : ""}>
                {validation.summary.needs_review_count}
              </strong>
            </div>
            <div className="ap-batch-row" style={{ padding: "10px 14px" }}>
              <span className="ap-label">Declared statutory</span>
              <strong>{fmt(validation.summary.declared_statutory)}</strong>
            </div>
            <div className="ap-batch-row" style={{ padding: "10px 14px" }}>
              <span className="ap-label">Expected statutory</span>
              <strong>{fmt(validation.summary.expected_statutory)}</strong>
            </div>
          </div>
        )}

        {(validation?.formula_note || report?.formula_note) && (
          <p className="ap-hint" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
            {validation?.formula_note || report?.formula_note}
          </p>
        )}

        {report?.filing_summary && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Filing summary</h4>
            {report.filing_note && (
              <p className="ap-hint" style={{ marginBottom: 8, fontSize: 12 }}>{report.filing_note}</p>
            )}
            <div className="ap-stats-row" style={{ flexWrap: "wrap", gap: 10 }}>
              {Object.entries(report.filing_summary).map(([key, value]) => (
                <div key={key} className="ap-batch-row" style={{ padding: "8px 12px" }}>
                  <span className="ap-label" style={{ textTransform: "uppercase", fontSize: 11 }}>{key}</span>
                  <strong>{fmt(value)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {validation?.rows?.length > 0 && (
          <div style={{ marginTop: 16, overflowX: "auto" }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Per-employee validation</h4>
            <table className="ap-entries-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>Employee</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>Declared</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>Expected</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>Variance</th>
                  <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {validation.rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className={row.status === "review" ? "ap-row-unmatched" : ""}>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>{row.employee_name}</td>
                    <td style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>{fmt(row.declared?.statutory_total)}</td>
                    <td style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>{fmt(row.expected?.statutory_total)}</td>
                    <td style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>{fmt(row.variance)}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                      <span className="ap-badge" data-status={row.status}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {validation.rows.length > 20 && (
              <p className="ap-hint" style={{ marginTop: 8 }}>Showing first 20 of {validation.rows.length} rows.</p>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

export default function AdminPayrollCompliance() {
  return <PayrollCompliancePanel />;
}
