import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";

export default function AdminPayrollCompliance() {
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

  useEffect(() => { load(); }, []);

  const saveConfig = async () => {
    if (!cfg) return;
    const res = await authFetch(`${API}/api/v1/payroll/statutory/config`, {
      method: "PUT",
      body: JSON.stringify(cfg),
    });
    const data = await res.json();
    setMsg(res.ok ? "Statutory config saved." : (data.detail || "Failed to save config"));
    if (res.ok) setCfg(data.config);
    if (res.ok) load();
  };

  const runCalc = async () => {
    const res = await authFetch(`${API}/api/v1/payroll/statutory/calculate`, {
      method: "POST",
      body: JSON.stringify(calc),
    });
    const data = await res.json();
    if (res.ok) setResult(data.result);
    else setMsg(data.detail || "Calculation failed");
  };

  const loadValidation = async () => {
    if (!batchId) return;
    const [validateRes, reportRes] = await Promise.all([
      authFetch(`${API}/api/v1/payroll/statutory/validate/batch/${batchId}`, { method: "POST" }),
      authFetch(`${API}/api/v1/payroll/statutory/reports/batch/${batchId}`),
    ]);
    const validateData = await validateRes.json();
    const reportData = await reportRes.json();
    if (validateRes.ok) setValidation(validateData);
    else setMsg(validateData.detail || "Failed to validate payroll batch");
    if (reportRes.ok) setReport(reportData);
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1>Payroll Statutory Compliance (Kenya)</h1>
      <p style={{ color: "var(--muted)" }}>
        Version your statutory rules, validate parsed payroll batches against them, and generate filing-ready summaries for PAYE, NSSF, SHIF, and AHL.
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) 1fr", gap: 20, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          {cfg && (
            <div style={{ display: "grid", gap: 8, marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
              <h3 style={{ margin: 0 }}>Effective-Dated Config</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input className="search" type="date" value={cfg.effective_from || ""} onChange={(e) => setCfg(c => ({ ...c, effective_from: e.target.value }))} placeholder="Effective from" />
                <input className="search" type="date" value={cfg.effective_to || ""} onChange={(e) => setCfg(c => ({ ...c, effective_to: e.target.value }))} placeholder="Effective to" />
                <input className="search" type="number" value={cfg.personal_relief} onChange={(e) => setCfg(c => ({ ...c, personal_relief: Number(e.target.value) }))} placeholder="Personal relief" />
                <input className="search" type="number" step="0.0001" value={cfg.shif_rate} onChange={(e) => setCfg(c => ({ ...c, shif_rate: Number(e.target.value) }))} placeholder="SHIF rate" />
                <input className="search" type="number" step="0.0001" value={cfg.ahl_rate} onChange={(e) => setCfg(c => ({ ...c, ahl_rate: Number(e.target.value) }))} placeholder="AHL rate" />
                <input className="search" type="number" value={cfg.nssf_lower_limit} onChange={(e) => setCfg(c => ({ ...c, nssf_lower_limit: Number(e.target.value) }))} placeholder="NSSF lower limit" />
                <input className="search" type="number" value={cfg.nssf_upper_limit} onChange={(e) => setCfg(c => ({ ...c, nssf_upper_limit: Number(e.target.value) }))} placeholder="NSSF upper limit" />
                <input className="search" type="number" step="0.0001" value={cfg.nssf_rate_tier1} onChange={(e) => setCfg(c => ({ ...c, nssf_rate_tier1: Number(e.target.value) }))} placeholder="NSSF Tier 1 rate" />
                <input className="search" type="number" step="0.0001" value={cfg.nssf_rate_tier2} onChange={(e) => setCfg(c => ({ ...c, nssf_rate_tier2: Number(e.target.value) }))} placeholder="NSSF Tier 2 rate" />
              </div>
              <input className="search" value={cfg.notes || ""} onChange={(e) => setCfg(c => ({ ...c, notes: e.target.value }))} placeholder="Notes for this version" />
              <button className="btn btnPrimary" onClick={saveConfig}>Save Compliance Config</button>
            </div>
          )}

          <div style={{ display: "grid", gap: 8, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <h3 style={{ margin: 0 }}>Statutory Calculator</h3>
            <input className="search" type="number" value={calc.gross_pay} onChange={(e) => setCalc(c => ({ ...c, gross_pay: Number(e.target.value) }))} placeholder="Gross pay" />
            <input className="search" type="number" value={calc.pension_contribution} onChange={(e) => setCalc(c => ({ ...c, pension_contribution: Number(e.target.value) }))} placeholder="Pension contribution" />
            <input className="search" type="number" value={calc.insurance_relief_basis} onChange={(e) => setCalc(c => ({ ...c, insurance_relief_basis: Number(e.target.value) }))} placeholder="Insurance relief basis" />
            <button className="btn btnPrimary" onClick={runCalc}>Calculate</button>
            {result && (
              <div style={{ display: "grid", gap: 6 }}>
                {Object.entries(result).map(([key, value]) => (
                  <div key={key} className="btn" style={{ justifyContent: "space-between" }}>{key}: {String(value)}</div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 8, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <h3 style={{ margin: 0 }}>Config Versions</h3>
            {versions.map((version) => (
              <div key={version.id || `${version.effective_from}-${version.updated_at || "default"}`} className="btn" style={{ textAlign: "left" }}>
                <strong>{version.effective_from || "Default"}{version.is_active ? " · Active" : ""}</strong>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  {version.notes || "No notes"} · SHIF {version.shif_rate} · AHL {version.ahl_rate}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 8, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <h3 style={{ margin: 0 }}>Batch Validation & Filing Pack</h3>
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
          </div>
        </div>
      </div>
    </div>
  );
}
