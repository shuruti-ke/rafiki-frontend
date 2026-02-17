import { useState } from "react";
import { Link } from "react-router-dom";

export default function AdminEmployees() {
  const [searchId, setSearchId] = useState("");

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Employee Management</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20 }}>
        View and manage employee documents, evaluations, and disciplinary records.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          className="search"
          placeholder="Enter employee ID..."
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          style={{ flex: 1 }}
        />
        {searchId && (
          <Link to={`/admin/employees/${searchId}`} className="btn btnPrimary">
            View Profile
          </Link>
        )}
      </div>

      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Enter an employee user ID to manage their profile, or use the direct links below for demo accounts.
      </p>

      <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
        {[1, 2, 3].map((id) => (
          <Link
            key={id}
            to={`/admin/employees/${id}`}
            className="btn"
            style={{ textAlign: "left", textDecoration: "none" }}
          >
            Employee #{id}
          </Link>
        ))}
      </div>
    </div>
  );
}
