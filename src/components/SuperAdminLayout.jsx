import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "../components/AdminLayout.css";

export default function SuperAdminLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("rafiki_token");
    localStorage.removeItem("rafiki_role");
    localStorage.removeItem("rafiki_user");
    navigate("/super-admin/login");
  };

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-logo-dot" />
          <div>
            <div className="admin-brand-title">Rafiki</div>
            <div className="admin-brand-sub">Super Admin</div>
          </div>
        </div>

        <nav className="admin-nav">
          <NavLink to="/super-admin" end className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Dashboard
          </NavLink>
        </nav>

        <div className="admin-nav-footer">
          <button onClick={handleLogout} className="admin-nav-link" style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%", font: "inherit" }}>
            Logout
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
