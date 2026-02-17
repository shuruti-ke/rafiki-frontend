import { NavLink, Outlet } from "react-router-dom";
import "./ManagerLayout.css";

export default function ManagerLayout() {
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
            Dashboard
          </NavLink>
          <NavLink to="/manager/team" className={({ isActive }) => `mgr-nav-link ${isActive ? "active" : ""}`}>
            My Team
          </NavLink>
          <NavLink to="/manager/coaching" className={({ isActive }) => `mgr-nav-link ${isActive ? "active" : ""}`}>
            Coaching Assistant
          </NavLink>
          <NavLink to="/manager/toolkit" className={({ isActive }) => `mgr-nav-link ${isActive ? "active" : ""}`}>
            HR Toolkit
          </NavLink>
        </nav>

        <div className="mgr-nav-footer">
          <NavLink to="/" className="mgr-nav-link">
            Back to Chat
          </NavLink>
          <NavLink to="/admin" className="mgr-nav-link">
            HR Portal
          </NavLink>
        </div>
      </aside>

      <main className="mgr-main">
        <Outlet />
      </main>
    </div>
  );
}
