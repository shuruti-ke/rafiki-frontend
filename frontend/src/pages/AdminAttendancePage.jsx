import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./AttendancePage.css";

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDuration(seconds) {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function LocationLink({ lat, long: lng, accuracy }) {
  if (lat == null || lng == null) return <span className="atp-muted">—</span>;
  const url = `https://www.google.com/maps?q=${lat},${lng}`;
  const label = accuracy ? `±${accuracy}m` : "";
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="atp-loc-link" title={`${lat.toFixed(4)}, ${lng.toFixed(4)}`}>
      📍 {label || "View"}
    </a>
  );
}

export default function AdminAttendancePage() {
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ start: "", end: "", user_id: "" });

  const loadEmployees = async () => {
    const res = await authFetch(`${API}/api/v1/employees/`);
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.employees || []);
      setEmployees(list);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.start) params.set("start", filters.start);
    if (filters.end) params.set("end", filters.end);
    if (filters.user_id) params.set("user_id", filters.user_id);
    const url = `${API}/api/v1/attendance/team${params.toString() ? "?" + params.toString() : ""}`;
    const res = await authFetch(url);
    if (res.ok) setLogs(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [filters.start, filters.end, filters.user_id]);

  return (
    <div className="atp-page">
      <div className="atp-header">
        <h1>Attendance Records</h1>
      </div>

      <div className="atp-filters" style={{ marginBottom: "1rem" }}>
        <input
          type="date"
          value={filters.start}
          onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))}
          placeholder="From"
        />
        <input
          type="date"
          value={filters.end}
          onChange={(e) => setFilters((f) => ({ ...f, end: e.target.value }))}
          placeholder="To"
        />
        <select
          value={filters.user_id}
          onChange={(e) => setFilters((f) => ({ ...f, user_id: e.target.value }))}
          style={{
            padding: "0.45rem 0.6rem",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--panel)",
            color: "var(--text)",
            fontSize: "0.85rem",
            minWidth: 180,
          }}
        >
          <option value="">All employees</option>
          {employees.map((emp, i) => {
            const u = emp.user || emp;
            const id = u.user_id || emp.user_id || emp.id;
            const name = u.name || emp.name || u.email || emp.email || "Unknown";
            return (
              <option key={id || i} value={id || ""}>
                {name}
              </option>
            );
          })}
        </select>
      </div>

      <div className="atp-table-wrap">
        <table className="atp-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Date</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Duration</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="atp-empty">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={6} className="atp-empty">
                  No attendance records found.
                </td>
              </tr>
            )}
            {!loading &&
              logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.user_name || "Unknown"}</td>
                  <td>{log.work_date}</td>
                  <td>{fmtTime(log.check_in)}</td>
                  <td>{fmtTime(log.check_out)}</td>
                  <td>{fmtDuration(log.total_seconds)}</td>
                  <td>
                    <LocationLink lat={log.check_in_lat} long={log.check_in_long} accuracy={log.check_in_accuracy} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
