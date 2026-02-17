import { NavLink, Outlet } from "react-router-dom";
import "./AdminLayout.css";

export default function AdminLayout() {
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-logo-dot" />
          <div>
            <div className="admin-brand-title">Rafiki</div>
            <div className="admin-brand-sub">HR Portal</div>
          </div>
        </div>

        <nav className="admin-nav">
          <NavLink to="/admin" end className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Dashboard
          </NavLink>
          <NavLink to="/admin/knowledge-base" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Knowledge Base
          </NavLink>
          <NavLink to="/admin/announcements" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Announcements
          </NavLink>
          <NavLink to="/admin/employees" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Employees
          </NavLink>
          <NavLink to="/admin/guided-paths" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Guided Paths
          </NavLink>
          <NavLink to="/admin/org-config" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Org Config
          </NavLink>
          <NavLink to="/admin/managers" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Managers
          </NavLink>
        </nav>

        <div className="admin-nav-footer">
          <NavLink to="/manager" className="admin-nav-link">
            Manager Portal
          </NavLink>
          <NavLink to="/" className="admin-nav-link">
            Back to Chat
          </NavLink>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
