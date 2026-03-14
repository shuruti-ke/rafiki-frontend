import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { API, authFetch } from "../api.js";
import "./ManagerLayout.css";

export default function ManagerLayout() {
  const navigate = useNavigate();
  const userRole = localStorage.getItem("rafiki_role") || "";
  const isAdmin = ["hr_admin", "super_admin"].includes(userRole);
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("rafiki_user") || "{}"));
  const [pendingPayrollApprovals, setPendingPayrollApprovals] = useState(0);
  const [payrollMessage, setPayrollMessage] = useState("");
  const hasPayrollAccess = !!(user.can_process_payroll || user.can_approve_payroll || user.can_authorize_payroll);
  const needsPayrollAction = !!(user.can_authorize_payroll || user.role === "super_admin");
  const isHrAdmin = user.role === "hr_admin" || user.role === "super_admin";
  const isFinanceApprover = !!(user.can_authorize_payroll || user.role === "super_admin");

  useEffect(() => {
    const token = localStorage.getItem("rafiki_token");
    if (!token) return;
    authFetch(`${API}/auth/me`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          localStorage.setItem("rafiki_user", JSON.stringify(data));
          setUser(data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasPayrollAccess) return;
    authFetch(`${API}/api/v1/payroll/notifications`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        const a = data.awaiting_approval || 0;
        const p = data.ready_to_parse || 0;
        const d = data.ready_to_distribute || 0;
        setPendingPayrollApprovals(a);
        const parts = [];
        if (isFinanceApprover && a > 0) parts.push(`${a} awaiting your approval`);
        if (isHrAdmin && p > 0) parts.push(`${p} to parse`);
        if (isHrAdmin && d > 0) parts.push(`${d} to distribute`);
        if (!isFinanceApprover && !isHrAdmin && a > 0) parts.push(`${a} awaiting finance approval`);
        setPayrollMessage(parts.length ? parts.join(" · ") : "");
      })
      .catch(() => {});
  }, [hasPayrollAccess, isFinanceApprover, isHrAdmin]);

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
          <NavLink to="/manager/calendar" className={({ isActive }) => `mgr-nav-link ${isActive ? "active" : ""}`}>
            Calendar
          </NavLink>
          <NavLink to="/manager/timesheets" className={({ isActive }) => `mgr-nav-link ${isActive ? "active" : ""}`}>
            Team Timesheets
          </NavLink>
          <NavLink to="/manager/attendance" className={({ isActive }) => `mgr-nav-link ${isActive ? "active" : ""}`}>
            Team Attendance
          </NavLink>
          {hasPayrollAccess && (
            <NavLink to="/manager/payroll" className={({ isActive }) => `mgr-nav-link mgr-nav-link--payroll ${isActive ? "active" : ""}`} title={payrollMessage || "Payroll"}>
              <span className="mgr-nav-payroll-label">
                Payroll
                {pendingPayrollApprovals > 0 && (
                  <span className="mgr-nav-payroll-badge" title="Action required">{pendingPayrollApprovals}</span>
                )}
              </span>
              {payrollMessage && <span className="mgr-nav-payroll-msg">{payrollMessage}</span>}
            </NavLink>
          )}
        </nav>

        <div className="mgr-nav-footer">
          <a href="https://www.rafikihr.com/dashboard" className="mgr-nav-link">
            My Dashboard
          </a>
          {isAdmin && (
            <NavLink to="/admin" className="mgr-nav-link">
              HR Portal
            </NavLink>
          )}
          <button onClick={handleLogout} className="mgr-nav-link" style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%", font: "inherit" }}>
            Logout
          </button>
        </div>
      </aside>

      <main className="mgr-main">
        <Outlet />
      </main>
    </div>
  );
}
