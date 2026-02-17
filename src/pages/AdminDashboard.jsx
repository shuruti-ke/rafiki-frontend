import { Link } from "react-router-dom";

export default function AdminDashboard() {
  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontWeight: 800, fontSize: 22, marginBottom: 8 }}>HR Portal Dashboard</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 24 }}>
        Manage your organization's knowledge base, announcements, and employee records.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        <Link to="/admin/knowledge-base" style={{ textDecoration: "none" }}>
          <div className="aed-eval-card" style={{ cursor: "pointer" }}>
            <strong style={{ fontSize: 16 }}>Knowledge Base</strong>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
              Upload and manage organization documents, policies, and handbooks.
            </p>
          </div>
        </Link>

        <Link to="/admin/announcements" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="aed-eval-card" style={{ cursor: "pointer" }}>
            <strong style={{ fontSize: 16 }}>Announcements</strong>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
              Broadcast updates, track read receipts, and manage training assignments.
            </p>
          </div>
        </Link>

        <Link to="/admin/employees" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="aed-eval-card" style={{ cursor: "pointer" }}>
            <strong style={{ fontSize: 16 }}>Employees</strong>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
              Manage employee profiles, documents, evaluations, and records.
            </p>
          </div>
        </Link>

        <Link to="/admin/guided-paths" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="aed-eval-card" style={{ cursor: "pointer" }}>
            <strong style={{ fontSize: 16 }}>Guided Paths</strong>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
              Create and manage guided wellbeing modules with video and audio content.
            </p>
          </div>
        </Link>

        <Link to="/admin/org-config" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="aed-eval-card" style={{ cursor: "pointer" }}>
            <strong style={{ fontSize: 16 }}>Org Config</strong>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
              Configure organisation context and role profiles for adaptive guided paths.
            </p>
          </div>
        </Link>

        <Link to="/admin/managers" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="aed-eval-card" style={{ cursor: "pointer" }}>
            <strong style={{ fontSize: 16 }}>Managers</strong>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
              Assign manager roles, configure access scopes, and view audit trails.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
