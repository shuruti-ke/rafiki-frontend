// frontend/src/components/AdminLayout.jsx
import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { API, authFetch } from "../api.js";
import "./AdminLayout.css";

export default function AdminLayout() {
  const navigate = useNavigate();
  const [payrollMessage, setPayrollMessage] = useState("");
  const user = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const hasPayrollAccess = user.role === "hr_admin" || user.role === "super_admin";

  useEffect(() => {
    if (!hasPayrollAccess) return;
    authFetch(`${API}/api/v1/payroll/notifications`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        const p = data.ready_to_parse || 0;
        const d = data.ready_to_distribute || 0;
        const parts = [];
        if (p > 0) parts.push(`${p} to parse`);
        if (d > 0) parts.push(`${d} to distribute`);
        setPayrollMessage(parts.length ? parts.join(" · ") : "");
      })
      .catch(() => {});
  }, [hasPayrollAccess]);

  const handleLogout = () => {
    localStorage.removeItem("rafiki_token");
    localStorage.removeItem("rafiki_role");
    localStorage.removeItem("rafiki_user");
    navigate("/login");
  };

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
          <NavLink to="/admin/usage-report" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Usage Report
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
          <NavLink to="/admin/payroll" className={({ isActive }) => `admin-nav-link admin-nav-link--payroll ${isActive ? "active" : ""}`} title={payrollMessage || "Payroll"}>
            <span className="admin-nav-payroll-label">Payroll</span>
            {payrollMessage && <span className="admin-nav-payroll-msg">{payrollMessage}</span>}
          </NavLink>
          <NavLink to="/admin/leave" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Leave Management
          </NavLink>
          <NavLink to="/admin/shifts" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Shift Management
          </NavLink>
          <NavLink to="/admin/performance-360" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Performance 360
          </NavLink>
          <NavLink to="/admin/workflows" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            On/Offboarding
          </NavLink>
          <NavLink to="/admin/reports-builder" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Reports Builder
          </NavLink>
          <NavLink to="/admin/wellbeing" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Wellbeing
          </NavLink>
          <NavLink to="/admin/calendar" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Calendar
          </NavLink>
          <NavLink to="/admin/timesheets" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Timesheets
          </NavLink>
          <NavLink to="/admin/attendance" className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}>
            Attendance
          </NavLink>
        </nav>

        <div className="admin-nav-footer">
          <NavLink to="/manager" className="admin-nav-link">
            Manager Portal
          </NavLink>
          <a href="https://www.rafikihr.com/dashboard" className="admin-nav-link">
            My Dashboard
          </a>
          <button onClick={handleLogout} className="admin-nav-link"
            style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%", font: "inherit" }}>
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
