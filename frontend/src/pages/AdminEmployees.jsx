import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { API, authFetch } from "../api.js";

export default function AdminEmployees() {
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    authFetch(`${API}/api/v1/employees/`)
      .then(r => r.ok ? r.json() : [])
      .then(setEmployees)
      .catch(() => {});
  }, []);

  const filtered = search.trim()
    ? employees.filter(e => {
        const u = e.user || {};
        const q = search.toLowerCase();
        return (u.name || "").toLowerCase().includes(q) ||
               (u.email || "").toLowerCase().includes(q) ||
               (u.user_id || "").toLowerCase().includes(q);
      })
    : employees;

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Employee Management</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20 }}>
        View and manage employee documents, evaluations, and disciplinary records.
      </p>

      <input
        className="search"
        placeholder="Search by name, email, or ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: "100%", marginBottom: 16, boxSizing: "border-box" }}
      />

      {filtered.length === 0 && (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          {employees.length === 0 ? "No employees found." : "No matches."}
        </p>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {filtered.map((e) => {
          const u = e.user || {};
          return (
            <Link
              key={u.user_id}
              to={`/admin/employees/${u.user_id}`}
              className="btn"
              style={{ textAlign: "left", textDecoration: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span>{u.name || u.email || "Unknown"}</span>
              <span style={{ color: "var(--muted)", fontSize: 12 }}>{u.role || ""} {u.department ? `· ${u.department}` : ""}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
