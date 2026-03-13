import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";

const CONFIG_FIELDS = [
  {
    key: "effective_from",
    label: "Effective From",
    help: "The date this statutory configuration starts applying to payroll runs.",
    type: "date",
  },
  {
    key: "effective_to",
    label: "Effective To",
    help: "Optional end date. Leave blank if this is the active open-ended config.",
    type: "date",
  },
  {
    key: "personal_relief",
    label: "PAYE Personal Relief",
    help: "Monthly personal tax relief subtracted from PAYE before final tax is charged.",
    type: "number",
    step: "0.01",
  },
  {
    key: "shif_rate",
    label: "SHIF Rate",
    help: "Percentage applied to gross pay for the Social Health Insurance Fund.",
    type: "number",
    step: "0.0001",
  },
  {
    key: "ahl_rate",
    label: "Affordable Housing Levy Rate",
    help: "Percentage charged on gross pay for the housing levy.",
    type: "number",
    step: "0.0001",
  },
  {
    key: "nssf_lower_limit",
    label: "NSSF Lower Earnings Limit",
    help: "Upper earnings cap used for the first NSSF contribution tier.",
    type: "number",
    step: "0.01",
  },
  {
    key: "nssf_upper_limit",
    label: "NSSF Upper Earnings Limit",
    help: "Maximum pensionable earnings considered when calculating NSSF tier contributions.",
    type: "number",
    step: "0.01",
  },
  {
    key: "nssf_rate_tier1",
    label: "NSSF Tier 1 Rate",
    help: "Contribution rate applied to earnings up to the lower NSSF limit.",
    type: "number",
    step: "0.0001",
  },
  {
    key: "nssf_rate_tier2",
    label: "NSSF Tier 2 Rate",
    help: "Contribution rate applied to earnings between the lower and upper NSSF limits.",
    type: "number",
    step: "0.0001",
  },
];

const CALCULATOR_FIELDS = [
  {
    key: "gross_pay",
    label: "Gross Pay",
    help: "Total monthly earnings before statutory deductions and voluntary deductions.",
    type: "number",
    step: "0.01",
  },
  {
    key: "pension_contribution",
    label: "Employee Pension Contribution",
    help: "Any employee pension amount that should reduce taxable pay before PAYE.",
    type: "number",
    step: "0.01",
  },
  {
    key: "insurance_relief_basis",
    label: "Insurance Relief Basis",
    help: "Monthly qualifying insurance premium used to compute insurance tax relief.",
    type: "number",
    step: "0.01",
  },
];

function FieldCard({ label, help, children }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 10 }}>{help}</div>
      {children}
    </div>
  );
}

function SectionShell({ title, description, children }) {
  return (
    <div style={{ display: "grid", gap: 12, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
      <div>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {description ? <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function PayrollCompliancePanel({ embedded = false }) {
  const [cfg, setCfg] = useState(null);
  const [versions, setVersions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [calc, setCalc] = useState({ gross_pay: 100000, pension_contribution: 0, insurance_relief_basis: 0 });
  const [result, setResult] = useState(null);
  const [validation, setValidation] = useState(null);
  const [report, setReport] = useState(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const [res, versionRes, batchRes] = await Promise.all([
      authFetch(`${API}/api/v1/payroll/statutory/config`),
      authFetch(`${API}/api/v1/payroll/statutory/config/versions`),
      authFetch(`${API}/api/v1/payroll/batches`),
    ]);
    if (res.ok) {
      const data = await res.json();
      setCfg(data.config);
    }
    if (versionRes.ok) {
      const data = await versionRes.json();
      setVersions(data.versions || []);
    }
    if (batchRes.ok) {
      const data = await batchRes.json();
      setBatches(Array.isArray(data) ? data : []);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const saveConfig = async () => {
    if (!cfg) return;
    const res = await authFetch(`${API}/api/v1/payroll/statutory/config`, {
      method: "PUT",
      body: JSON.stringify(cfg),
    });
    const data = await res.json();
    setMsg(res.ok ? "Statutory config saved." : (data.detail || "Failed to save config"));
    if (res.ok) {
      setCfg(data.config);
      load();
    }
  };

  const runCalc = async () => {
    const res = await authFetch(`${API}/api/v1/payroll/statutory/calculate`, {
      method: "POST",
      body: JSON.stringify(calc),
    });
    const data = await res.json();
    if (res.ok) {
      setResult(data.result);
      setMsg("");
    } else {
      setMsg(data.detail || "Calculation failed");
    }
  };

  const loadValidation = async () => {
    if (!batchId) return;
    const [validateRes, reportRes] = await Promise.all([
      authFetch(`${API}/api/v1/payroll/statutory/validate/batch/${batchId}`, { method: "POST" }),
      authFetch(`${API}/api/v1/payroll/statutory/reports/batch/${batchId}`),
    ]);
    const validateData = await validateRes.json();
    const reportData = await reportRes.json();
    if (validateRes.ok) {
      setValidation(validateData);
      setMsg("");
    } else {
      setMsg(validateData.detail || "Failed to validate payroll batch");
    }
    if (reportRes.ok) setReport(reportData);
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      {!embedded && (
        <>
          <h1>Payroll Statutory Compliance (Kenya)</h1>
          <p style={{ color: "var(--muted)" }}>
            Version your statutory rules, validate parsed payroll batches against them, and generate filing-ready summaries for PAYE, NSSF, SHIF, and AHL.
          </p>
        </>
      )}
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) 1fr", gap: 20, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          {cfg && (
            <SectionShell
              title="Effective-Dated Statutory Config"
              description="Keep historical payroll rules intact by saving dated versions whenever rates or tax relief rules change."
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {CONFIG_FIELDS.map((field) => (
                  <FieldCard key={field.key} label={field.label} help={field.help}>
                    <input
                      className="search"
                      type={field.type}
                      step={field.step}
                      value={cfg[field.key] ?? ""}
                      onChange={(e) =>
                        setCfg((current) => ({
                          ...current,
                          [field.key]:
                            field.type === "number"
                              ? Number(e.target.value)
                              : e.target.value,
                        }))
                      }
                      placeholder={field.label}
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </FieldCard>
                ))}
              </div>
              <FieldCard
                label="Version Notes"
                help="Document why this config exists, for example a government rate change or a new compliance period."
              >
                <input
                  className="search"
                  value={cfg.notes || ""}
                  onChange={(e) => setCfg((current) => ({ ...current, notes: e.target.value }))}
                  placeholder="Notes for this version"
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </FieldCard>
              <button className="btn btnPrimary" onClick={saveConfig}>Save Compliance Config</button>
            </SectionShell>
          )}

          <SectionShell
            title="Statutory Calculator"
            description="Use this quick estimator to understand how a single employee's gross pay flows into statutory deductions and estimated net pay."
          >
            <div style={{ display: "grid", gap: 10 }}>
              {CALCULATOR_FIELDS.map((field) => (
                <FieldCard key={field.key} label={field.label} help={field.help}>
                  <input
                    className="search"
                    type={field.type}
                    step={field.step}
                    value={calc[field.key]}
                    onChange={(e) => setCalc((current) => ({ ...current, [field.key]: Number(e.target.value) }))}
                    placeholder={field.label}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </FieldCard>
              ))}
            </div>
            <button className="btn btnPrimary" onClick={runCalc}>Calculate</button>
            {result && (
              <div style={{ display: "grid", gap: 6 }}>
                {Object.entries(result).map(([key, value]) => (
                  <div key={key} className="btn" style={{ justifyContent: "space-between" }}>{key}: {String(value)}</div>
                ))}
              </div>
            )}
          </SectionShell>

          <SectionShell
            title="Config Versions"
            description="Review the dated versions saved for this organization so payroll teams can audit which rates applied to which period."
          >
            {versions.map((version) => (
              <div key={version.id || `${version.effective_from}-${version.updated_at || "default"}`} className="btn" style={{ textAlign: "left" }}>
                <strong>{version.effective_from || "Default"}{version.is_active ? " · Active" : ""}</strong>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  {version.notes || "No notes"} · SHIF {version.shif_rate} · AHL {version.ahl_rate}
                </div>
              </div>
            ))}
          </SectionShell>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <SectionShell
            title="Batch Validation & Filing Pack"
            description="Validate a parsed payroll batch against the active statutory config, then review the filing summary before final payroll sign-off."
          >
            <div style={{ display: "flex", gap: 8 }}>
              <select className="search" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                <option value="">Select payroll batch</option>
                {batches.map((batch) => (
                  <option key={batch.batch_id} value={batch.batch_id}>
                    {batch.period_year}-{String(batch.period_month).padStart(2, "0")} · {batch.status}
                  </option>
                ))}
              </select>
              <button className="btn btnPrimary" onClick={loadValidation} disabled={!batchId}>Validate</button>
            </div>

            {validation && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div className="btn">Within tolerance: {validation.summary?.within_tolerance_count}</div>
                <div className="btn">Needs review: {validation.summary?.needs_review_count}</div>
                <div className="btn">Declared statutory: {validation.summary?.declared_statutory}</div>
                <div className="btn">Expected statutory: {validation.summary?.expected_statutory}</div>
              </div>
            )}

            {report && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
                  {Object.entries(report.filing_summary || {}).map(([key, value]) => (
                    <div key={key} className="btn">{key}: {value}</div>
                  ))}
                </div>
                <div style={{ overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>Employee</th>
                        <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>Declared</th>
                        <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>Expected</th>
                        <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>Variance</th>
                        <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report.rows || []).slice(0, 12).map((row) => (
                        <tr key={row.employee_name}>
                          <td style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>{row.employee_name}</td>
                          <td style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>{row.declared?.statutory_total}</td>
                          <td style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>{row.expected?.statutory_total}</td>
                          <td style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>{row.variance}</td>
                          <td style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </SectionShell>
        </div>
      </div>
    </div>
  );
}

export default function AdminPayrollCompliance() {
  return <PayrollCompliancePanel />;
}
