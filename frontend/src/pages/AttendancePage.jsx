import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./AttendancePage.css";

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function fmtDuration(seconds) {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function AttendancePage() {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ start: null, end: null });

  const loadStatus = async () => {
    const res = await authFetch(`${API}/api/v1/attendance/status`);
    if (res.ok) setStatus(await res.json());
  };

  const loadLogs = async () => {
    let url = `${API}/api/v1/attendance/`;
    const params = new URLSearchParams();
    if (dateRange.start) params.set("start", dateRange.start);
    if (dateRange.end) params.set("end", dateRange.end);
    if (params.toString()) url += "?" + params.toString();
    const res = await authFetch(url);
    if (res.ok) setLogs(await res.json());
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    setLoading(false);
  }, [status, logs]);

  const getLocation = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });

  const handleClockIn = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const location = await getLocation();
      const body = location
        ? { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy }
        : {};
      const res = await authFetch(`${API}/api/v1/attendance/clock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ status: "clocked_in", check_in: data.log?.check_in, log_id: data.log?.id });
        loadLogs();
      } else {
        setError(data.detail || "Failed to clock in");
      }
    } catch (e) {
      setError("Network error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const location = await getLocation();
      const body = location
        ? { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy }
        : {};
      const res = await authFetch(`${API}/api/v1/attendance/clock-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ status: "clocked_out" });
        loadLogs();
      } else {
        setError(data.detail || "Failed to clock out");
      }
    } catch (e) {
      setError("Network error");
    } finally {
      setActionLoading(false);
    }
  };

  const isClockedIn = status?.status === "clocked_in";

  return (
    <div className="atp-page">
      <div className="atp-header">
        <h1>Attendance</h1>
      </div>

      {/* Clock-in/out card */}
      <div className="atp-status-card">
        <div className="atp-status-info">
          <span className="atp-status-label">Current status</span>
          <span className={`atp-status-badge ${isClockedIn ? "clocked-in" : "clocked-out"}`}>
            {isClockedIn ? "Clocked In" : "Clocked Out"}
          </span>
          {isClockedIn && status?.check_in && (
            <span className="atp-status-time">Since {fmtTime(status.check_in)}</span>
          )}
        </div>
        <div className="atp-actions">
          {isClockedIn ? (
            <button
              className="atp-btn atp-btn-out"
              onClick={handleClockOut}
              disabled={actionLoading}
            >
              {actionLoading ? "…" : "Clock Out"}
            </button>
          ) : (
            <button
              className="atp-btn atp-btn-in"
              onClick={handleClockIn}
              disabled={actionLoading}
            >
              {actionLoading ? "…" : "Clock In"}
            </button>
          )}
        </div>
        {error && <div className="atp-error">{error}</div>}
        <p className="atp-geo-hint">Location is captured when available for verification.</p>
      </div>

      {/* Log history */}
      <div className="atp-section">
        <h2>My Log History</h2>
        <div className="atp-filters">
          <input
            type="date"
            value={dateRange.start || ""}
            onChange={(e) => setDateRange((r) => ({ ...r, start: e.target.value || null }))}
            placeholder="From"
          />
          <input
            type="date"
            value={dateRange.end || ""}
            onChange={(e) => setDateRange((r) => ({ ...r, end: e.target.value || null }))}
            placeholder="To"
          />
        </div>
        <div className="atp-table-wrap">
          <table className="atp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="atp-empty">
                    No attendance records yet. Clock in to start.
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.work_date}</td>
                  <td>{fmtTime(log.check_in)}</td>
                  <td>{fmtTime(log.check_out)}</td>
                  <td>{fmtDuration(log.total_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
