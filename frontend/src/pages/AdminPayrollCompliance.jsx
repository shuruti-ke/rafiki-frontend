import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";

export default function AdminPayrollCompliance() {
  const [cfg, setCfg] = useState(null);
  const [calc, setCalc] = useState({ gross_pay: 100000, pension_contribution: 0, insurance_relief_basis: 0 });
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await authFetch(`${API}/api/v1/payroll/statutory/config`);
    const data = await res.json();
    if (res.ok) setCfg(data.config);
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

  return (
    <div style={{ maxWidth: 900 }}>
      <h1>Payroll Statutory Compliance (Kenya)</h1>
      <p style={{ color: "var(--muted)" }}>Configure PAYE/NSSF/SHIF/AHL rules and run statutory checks.</p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      {cfg && (
        <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
          <h3>Config</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input className="search" type="number" value={cfg.personal_relief} onChange={(e) => setCfg(c => ({ ...c, personal_relief: Number(e.target.value) }))} placeholder="Personal relief" />
            <input className="search" type="number" step="0.0001" value={cfg.shif_rate} onChange={(e) => setCfg(c => ({ ...c, shif_rate: Number(e.target.value) }))} placeholder="SHIF rate" />
            <input className="search" type="number" step="0.0001" value={cfg.ahl_rate} onChange={(e) => setCfg(c => ({ ...c, ahl_rate: Number(e.target.value) }))} placeholder="AHL rate" />
            <input className="search" type="number" value={cfg.nssf_lower_limit} onChange={(e) => setCfg(c => ({ ...c, nssf_lower_limit: Number(e.target.value) }))} placeholder="NSSF lower limit" />
            <input className="search" type="number" value={cfg.nssf_upper_limit} onChange={(e) => setCfg(c => ({ ...c, nssf_upper_limit: Number(e.target.value) }))} placeholder="NSSF upper limit" />
          </div>
          <button className="btn btnPrimary" onClick={saveConfig}>Save Compliance Config</button>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        <h3>Statutory Calculator</h3>
        <input className="search" type="number" value={calc.gross_pay} onChange={(e) => setCalc(c => ({ ...c, gross_pay: Number(e.target.value) }))} placeholder="Gross pay" />
        <input className="search" type="number" value={calc.pension_contribution} onChange={(e) => setCalc(c => ({ ...c, pension_contribution: Number(e.target.value) }))} placeholder="Pension contribution" />
        <input className="search" type="number" value={calc.insurance_relief_basis} onChange={(e) => setCalc(c => ({ ...c, insurance_relief_basis: Number(e.target.value) }))} placeholder="Insurance relief basis" />
        <button className="btn btnPrimary" onClick={runCalc}>Calculate</button>
      </div>

      {result && (
        <pre style={{ whiteSpace: "pre-wrap", marginTop: 14, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
