import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { API, authFetch } from "../api.js";

export default function AdminEmployees() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/api/v1/org-members/`);
      if (res.ok) {
        const data = await res.json();
        setEmployees(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  const filtered = employees.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (e.email || "").toLowerCase().includes(q) ||
      (e.name || e.full_name || "").toLowerCase().includes(q) ||
      (e.user_id || "").toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Employee Management</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20 }}>
        View and manage employee documents, evaluations, and disciplinary records.
      </p>

      <input
        className="search"
        placeholder="Search by name, email, or ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: "100%", marginBottom: 16 }}
      />

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading employees...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No employees found.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {filtered.map((emp) => (
            <Link
              key={emp.user_id || emp.id}
              to={`/admin/employees/${emp.user_id || emp.id}`}
              className="btn"
              style={{ textAlign: "left", textDecoration: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <strong>{emp.name || emp.full_name || emp.email || "Unnamed"}</strong>
                {emp.email && <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 8 }}>{emp.email}</span>}
              </div>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{emp.role || "user"}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
