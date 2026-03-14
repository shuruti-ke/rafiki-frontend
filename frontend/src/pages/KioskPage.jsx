/**
 * Kiosk mode — shared device clock-in/out for non-digital employees.
 * No login. Uses org code + employee email or employment number.
 */
import { useState } from "react";
import "./KioskPage.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function KioskPage() {
  const [orgCode, setOrgCode] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const checkOrg = async () => {
    if (!orgCode.trim()) return;
    setLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const r = await fetch(`${API}/api/v1/kiosk/org-check?org_code=${encodeURIComponent(orgCode.trim())}`);
      const d = await r.json();
      if (r.ok) {
        setOrgName(d.org_name || "");
      } else {
        setOrgName("");
        setMessage({ type: "error", text: d.detail || "Organization not found." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
      setOrgName("");
    }
    setLoading(false);
  };

  const handleClockIn = async (e) => {
    e.preventDefault();
    if (!orgCode.trim() || !employeeId.trim()) {
      setMessage({ type: "error", text: "Enter org code and employee ID or email." });
      return;
    }
    setLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const r = await fetch(`${API}/api/v1/kiosk/clock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_code: orgCode.trim(),
          employee_identifier: employeeId.trim(),
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setMessage({ type: "success", text: `${d.employee_name || "Employee"} clocked in.` });
      } else {
        setMessage({ type: "error", text: d.detail || "Failed to clock in." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    }
    setLoading(false);
  };

  const handleClockOut = async (e) => {
    e.preventDefault();
    if (!orgCode.trim() || !employeeId.trim()) {
      setMessage({ type: "error", text: "Enter org code and employee ID or email." });
      return;
    }
    setLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const r = await fetch(`${API}/api/v1/kiosk/clock-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_code: orgCode.trim(),
          employee_identifier: employeeId.trim(),
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setMessage({ type: "success", text: `${d.employee_name || "Employee"} clocked out.` });
      } else {
        setMessage({ type: "error", text: d.detail || "Failed to clock out." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    }
    setLoading(false);
  };

  return (
    <div className="kiosk-page">
      <div className="kiosk-card">
        <h1 className="kiosk-title">Attendance kiosk</h1>
        <p className="kiosk-desc">
          Enter your org code and employee ID (or email), then tap Clock in or Clock out.
        </p>

        <div className="kiosk-form">
          <div className="kiosk-field">
            <label>Org code</label>
            <input
              type="text"
              placeholder="e.g. rafiki"
              value={orgCode}
              onChange={(e) => setOrgCode(e.target.value)}
              onBlur={checkOrg}
              autoCapitalize="off"
            />
          </div>
          {orgName && <p className="kiosk-org-name">Welcome, {orgName}</p>}
          <div className="kiosk-field">
            <label>Employee ID or email</label>
            <input
              type="text"
              placeholder="Employment number or email"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              autoCapitalize="off"
            />
          </div>

          {message.text && (
            <div className={`kiosk-msg kiosk-msg--${message.type}`}>{message.text}</div>
          )}

          <div className="kiosk-actions">
            <button
              type="button"
              className="kiosk-btn kiosk-btn--in"
              onClick={handleClockIn}
              disabled={loading}
            >
              {loading ? "…" : "Clock in"}
            </button>
            <button
              type="button"
              className="kiosk-btn kiosk-btn--out"
              onClick={handleClockOut}
              disabled={loading}
            >
              {loading ? "…" : "Clock out"}
            </button>
          </div>
        </div>
      </div>

      <p className="kiosk-footer">
        For use on shared devices in reception or staff rooms. No login required.
      </p>
    </div>
  );
}
