import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { API, authFetch } from "../api.js";
import NotificationBell from "./NotificationBell.jsx";
import "./ManagerLayout.css";

/* ── Nav groups ── */
const NAV_GROUPS = [
  {
    label: "Overview", icon: "🏠",
    links: [
      { to: "/manager", end: true, label: "Dashboard", icon: "🏠" },
    ],
  },
  {
    label: "My Team", icon: "👥",
    links: [
      { to: "/manager/team",                label: "My Team",            icon: "👥" },
      { to: "/manager/on-behalf",           label: "On Behalf",          icon: "🤝", title: "Submit leave and clock attendance on behalf of staff" },
      { to: "/manager/performance-reviews", label: "Performance Reviews", icon: "⭐" },
      { to: "/manager/coaching",            label: "Coaching Assistant",  icon: "🎯" },
    ],
  },
  {
    label: "Tools", icon: "🧰",
    links: [
      { to: "/manager/toolkit",    label: "HR Toolkit",       icon: "🧰" },
      { to: "/manager/calendar",   label: "Calendar",         icon: "📅" },
      { to: "/manager/timesheets", label: "Team Timesheets",  icon: "⏱️" },
      { to: "/manager/attendance", label: "Team Attendance",  icon: "📍" },
    ],
  },
];

const PAGE_TITLES = {
  "/manager":                      "Dashboard",
  "/manager/team":                 "My Team",
  "/manager/on-behalf":            "On Behalf",
  "/manager/performance-reviews":  "Performance Reviews",
  "/manager/coaching":             "Coaching Assistant",
  "/manager/toolkit":              "HR Toolkit",
  "/manager/calendar":             "Calendar",
  "/manager/timesheets":           "Team Timesheets",
  "/manager/attendance":           "Team Attendance",
  "/manager/payroll":              "Payroll",
};

export default function ManagerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed,  setCollapsed]  = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => new Set(NAV_GROUPS.map(g => g.label)));
  const [user, setUser]             = useState(() => JSON.parse(localStorage.getItem("rafiki_user") || "{}"));
  const [pendingPayroll, setPendingPayroll] = useState(0);
  const [payrollMsg, setPayrollMsg] = useState("");

  const userRole = localStorage.getItem("rafiki_role") || "";
  const isAdmin  = ["hr_admin", "super_admin"].includes(userRole);
  const hasPayrollAccess  = !!(user.can_process_payroll || user.can_approve_payroll || user.can_authorize_payroll);
  const isFinanceApprover = !!(user.can_authorize_payroll || user.role === "super_admin");
  const isHrAdmin         = user.role === "hr_admin" || user.role === "super_admin";

  const name     = user.full_name || user.name || user.email || "Manager";
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const pageTitle = PAGE_TITLES[location.pathname] || "Manager Portal";

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    const token = localStorage.getItem("rafiki_token");
    if (!token) return;
    authFetch(`${API}/auth/me`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
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
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const a = data.awaiting_approval || 0;
        const p = data.ready_to_parse    || 0;
        const d = data.ready_to_distribute || 0;
        setPendingPayroll(a);
        const parts = [];
        if (isFinanceApprover && a > 0) parts.push(`${a} awaiting your approval`);
        if (isHrAdmin && p > 0) parts.push(`${p} to parse`);
        if (isHrAdmin && d > 0) parts.push(`${d} to distribute`);
        if (!isFinanceApprover && !isHrAdmin && a > 0) parts.push(`${a} awaiting finance approval`);
        setPayrollMsg(parts.length ? parts.join(" · ") : "");
      })
      .catch(() => {});
  }, [hasPayrollAccess, isFinanceApprover, isHrAdmin]);

  function toggleGroup(label) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  function handleLogout() {
    localStorage.removeItem("rafiki_token");
    localStorage.removeItem("rafiki_role");
    localStorage.removeItem("rafiki_user");
    navigate("/login");
  }

  /* Build payroll link if access granted */
  const payrollLink = hasPayrollAccess
    ? { to: "/manager/payroll", end: false, label: "Payroll", icon: "💰", payroll: true }
    : null;

  return (
    <div className="mgr-layout">

      {/* ── Sidebar ── */}
      <nav className={`mgr-sidebar${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>

        <button className="mgr-nav-collapse" onClick={() => setCollapsed(c => !c)} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? "›" : "‹"}
        </button>

        {/* Brand */}
        <div className="mgr-nav-brand">
          <div className="mgr-nav-brand-mark">R</div>
          <div className="mgr-nav-brand-text">
            <div className="mgr-nav-brand-name">Rafiki</div>
            <div className="mgr-nav-brand-sub">Manager Portal</div>
          </div>
        </div>

        {/* User card */}
        <div className="mgr-nav-user">
          <div className="mgr-nav-avatar">{initials}</div>
          <div className="mgr-nav-user-info">
            <div className="mgr-nav-user-name">{name.split(" ")[0]}</div>
            <div className="mgr-nav-user-role">{user.job_title || user.department || "Manager"}</div>
          </div>
        </div>

        {/* Scrollable nav */}
        <div className="mgr-nav-scroll">
          {NAV_GROUPS.map(group => {
            const isOpen = openGroups.has(group.label);
            /* inject payroll under Tools */
            const links = group.label === "Tools" && payrollLink
              ? [...group.links, payrollLink]
              : group.links;
            return (
              <div key={group.label} className="mgr-nav-section">
                <button
                  className="mgr-nav-section-header"
                  onClick={() => !collapsed && toggleGroup(group.label)}
                  title={collapsed ? group.label : undefined}
                >
                  <span className="mgr-nav-section-icon">{group.icon}</span>
                  <span className="mgr-nav-section-label">{group.label}</span>
                  <span className={`mgr-nav-chevron${isOpen ? " open" : ""}`} />
                </button>

                {(isOpen || collapsed) && (
                  <div className="mgr-nav-section-items">
                    {links.map(link => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        end={link.end}
                        title={link.title || link.label}
                        className={({ isActive }) => `mgr-nav-link${isActive ? " active" : ""}`}
                      >
                        <span className="mgr-nav-icon">{link.icon}</span>
                        <span className="mgr-nav-label">{link.label}</span>
                        {link.payroll && pendingPayroll > 0 && (
                          <span className="mgr-nav-badge mgr-nav-badge--warn" title={payrollMsg}>{pendingPayroll}</span>
                        )}
                        <span className="mgr-nav-tooltip">{link.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom portal switcher */}
        <div className="mgr-nav-bottom">
          <NavLink to="/dashboard" className="mgr-nav-portal-link">
            <span className="mgr-nav-icon">👤</span>
            <span className="mgr-nav-bottom-label">My Dashboard</span>
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className="mgr-nav-portal-link">
              <span className="mgr-nav-icon">⚙️</span>
              <span className="mgr-nav-bottom-label">HR Portal</span>
            </NavLink>
          )}
          <button className="mgr-nav-logout-btn" onClick={handleLogout}>
            <span className="mgr-nav-icon">👋</span>
            <span className="mgr-nav-bottom-label">Logout</span>
          </button>
        </div>
      </nav>

      <div className={`mgr-sidebar-overlay${mobileOpen ? " visible" : ""}`} onClick={() => setMobileOpen(false)} />

      {/* ── Main ── */}
      <div className="mgr-main">
        <div className="mgr-topbar">
          <button className="mgr-hamburger" onClick={() => setMobileOpen(o => !o)}>☰</button>
          <div className="mgr-topbar-title">{pageTitle}</div>
          <div className="mgr-topbar-actions">
            <NotificationBell />
          </div>
        </div>
        <div className="mgr-content">
          <Outlet />
        </div>
      </div>

    </div>
  );
}
