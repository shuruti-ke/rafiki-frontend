import { NavLink, Outlet, useNavigate } from "react-router-dom";
import NotificationBell from "./NotificationBell.jsx";
import "./ManagerLayout.css";

export default function ManagerLayout() {
  const navigate = useNavigate();
  const userRole = localStorage.getItem("rafiki_role") || "";
  const isAdmin = ["hr_admin", "super_admin"].includes(userRole);

  const handleLogout = () => {
    localStorage.removeItem("rafiki_token");
    localStorage.removeItem("rafiki_role");
    localStorage.removeItem("rafiki_user");
    navigate("/login");
  };

  return (
    <div className="mgr-layout">
      <aside className="mgr-sidebar">
        <div className="mgr-brand">
          <div className="mgr-logo-dot" />
          <div>
            <div className="mgr-brand-title">Rafiki</div>
            <div className="mgr-brand-sub">Manager Portal</div>
          </div>
        </div>

        <nav className="mgr-nav">
          <NavLink to="/manager" end className={({ isActive }) => `mgr-nav-link ${isActive ? "active" : ""}`}>
            <span>🏠</span> Dashboard
          </NavLink>
          <NavLink to="/manager/team" className={({ isActive }) => `mgr-nav-link ${isActive ? "active" : ""}`}>
            <span>👥</span> My Team
          </NavLink>
          <NavLink to="/manager/coaching" className={({ isActive }) => `mgr-nav-link ${isActive ? "active" : ""}`}>
            <span>🧠</span> Coaching Assistant
          </NavLink>
          <NavLink to="/manager/toolkit" className={({ isActive }) => `mgr-nav-link ${isActive ? "active" : ""}`}>
            <span>🛠️</span> HR Toolkit
          </NavLink>
          <NavLink to="/manager/calendar" className={({ isActive }) => `mgr-nav-link ${isActive ? "active" : ""}`}>
            <span>📅</span> Calendar
          </NavLink>
          <NavLink to="/manager/timesheets" className={({ isActive }) => `mgr-nav-link ${isActive ? "active" : ""}`}>
            <span>⏱️</span> Team Timesheets
          </NavLink>
        </nav>

        <div className="mgr-nav-footer">
          <NavLink to="/chat" className="mgr-nav-link">
            <span>💬</span> Employee Portal
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className="mgr-nav-link">
              <span>⚙️</span> HR Portal
            </NavLink>
          )}
          <button onClick={handleLogout} className="mgr-nav-link"
            style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%", font: "inherit" }}>
            <span>👋</span> Logout
          </button>
        </div>
      </aside>

      <main className="mgr-main">
        <div className="mgr-topbar">
          <NotificationBell />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
