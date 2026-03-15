import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { API, authFetch } from "../api.js";
import NotificationBell from "./NotificationBell.jsx";
import "./AdminLayout.css";

/* ── Nav groups ── */
const NAV_GROUPS = [
  {
    label: "Overview", icon: "🏠",
    links: [
      { to: "/admin",              end: true, label: "Dashboard",    icon: "🏠" },
      { to: "/admin/usage-report",           label: "Usage Report",  icon: "📈" },
    ],
  },
  {
    label: "People", icon: "👥",
    links: [
      { to: "/admin/employees",  label: "Employees",        icon: "👤" },
      { to: "/admin/managers",   label: "Managers",         icon: "🛡️" },
      { to: "/admin/leave",      label: "Leave Management", icon: "🌴" },
      { to: "/admin/attendance", label: "Attendance",       icon: "📍" },
      { to: "/admin/shifts",     label: "Shift Management", icon: "🗓️" },
    ],
  },
  {
    label: "Operations", icon: "⚡",
    links: [
      { to: "/admin/payroll",          label: "Payroll",         icon: "💰", payroll: true },
      { to: "/admin/timesheets",       label: "Timesheets",      icon: "⏱️" },
      { to: "/admin/calendar",         label: "Calendar",        icon: "📅" },
      { to: "/admin/performance-360",  label: "Performance 360", icon: "⭐" },
      { to: "/admin/workflows",        label: "On/Offboarding",  icon: "✅" },
    ],
  },
  {
    label: "Content", icon: "📚",
    links: [
      { to: "/admin/announcements",  label: "Announcements",  icon: "📣" },
      { to: "/admin/knowledge-base", label: "Knowledge Base", icon: "📚" },
      { to: "/admin/guided-paths",   label: "Guided Paths",   icon: "🧭" },
      { to: "/admin/wellbeing",      label: "Wellbeing",      icon: "💚" },
    ],
  },
  {
    label: "Settings", icon: "🔧",
    links: [
      { to: "/admin/org-config",      label: "Org Config",      icon: "⚙️" },
      { to: "/admin/reports-builder", label: "Reports Builder", icon: "📊" },
    ],
  },
];

const PAGE_TITLES = {
  "/admin":                  "Dashboard",
  "/admin/usage-report":     "Usage Report",
  "/admin/employees":        "Employees",
  "/admin/managers":         "Managers",
  "/admin/leave":            "Leave Management",
  "/admin/attendance":       "Attendance",
  "/admin/shifts":           "Shift Management",
  "/admin/payroll":          "Payroll",
  "/admin/timesheets":       "Timesheets",
  "/admin/calendar":         "Calendar",
  "/admin/performance-360":  "Performance 360",
  "/admin/workflows":        "On/Offboarding",
  "/admin/announcements":    "Announcements",
  "/admin/knowledge-base":   "Knowledge Base",
  "/admin/guided-paths":     "Guided Paths",
  "/admin/wellbeing":        "Wellbeing",
  "/admin/org-config":       "Org Config",
  "/admin/reports-builder":  "Reports Builder",
};

export default function AdminLayout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [collapsed,   setCollapsed]   = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [openGroups,  setOpenGroups]  = useState(() => new Set(NAV_GROUPS.map(g => g.label)));
  const [payrollMsg,  setPayrollMsg]  = useState("");

  const user = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const name     = user.full_name || user.name || user.email || "Admin";
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const hasPayrollAccess = user.role === "hr_admin" || user.role === "super_admin";

  const pageTitle = PAGE_TITLES[location.pathname] || "HR Portal";

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!hasPayrollAccess) return;
    authFetch(`${API}/api/v1/payroll/notifications`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const p = data.ready_to_parse || 0;
        const d = data.ready_to_distribute || 0;
        const parts = [];
        if (p > 0) parts.push(`${p} to parse`);
        if (d > 0) parts.push(`${d} to distribute`);
        setPayrollMsg(parts.length ? parts.join(" · ") : "");
      })
      .catch(() => {});
  }, [hasPayrollAccess]);

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

  return (
    <div className="adm-layout">

      {/* ── Sidebar ── */}
      <nav className={`adm-sidebar${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>

        <button className="adm-nav-collapse" onClick={() => setCollapsed(c => !c)} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? "›" : "‹"}
        </button>

        {/* Brand */}
        <div className="adm-nav-brand">
          <div className="adm-nav-brand-mark">R</div>
          <div className="adm-nav-brand-text">
            <div className="adm-nav-brand-name">Rafiki</div>
            <div className="adm-nav-brand-sub">HR Portal</div>
          </div>
        </div>

        {/* User card */}
        <div className="adm-nav-user">
          <div className="adm-nav-avatar">{initials}</div>
          <div className="adm-nav-user-info">
            <div className="adm-nav-user-name">{name.split(" ")[0]}</div>
            <div className="adm-nav-user-role">{user.job_title || "HR Admin"}</div>
          </div>
        </div>

        {/* Scrollable nav */}
        <div className="adm-nav-scroll">
          {NAV_GROUPS.map(group => {
            const isOpen = openGroups.has(group.label);
            return (
              <div key={group.label} className="adm-nav-section">
                <button
                  className="adm-nav-section-header"
                  onClick={() => !collapsed && toggleGroup(group.label)}
                  title={collapsed ? group.label : undefined}
                >
                  <span className="adm-nav-section-icon">{group.icon}</span>
                  <span className="adm-nav-section-label">{group.label}</span>
                  <span className={`adm-nav-chevron${isOpen ? " open" : ""}`} />
                </button>

                {(isOpen || collapsed) && (
                  <div className="adm-nav-section-items">
                    {group.links.map(link => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        end={link.end}
                        title={link.label}
                        className={({ isActive }) => `adm-nav-link${isActive ? " active" : ""}`}
                      >
                        <span className="adm-nav-icon">{link.icon}</span>
                        <span className="adm-nav-label">{link.label}</span>
                        {link.payroll && payrollMsg && (
                          <span className="adm-nav-badge adm-nav-badge--warn" title={payrollMsg}>!</span>
                        )}
                        <span className="adm-nav-tooltip">{link.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom portal switcher */}
        <div className="adm-nav-bottom">
          <NavLink to="/manager" className="adm-nav-portal-link">
            <span className="adm-nav-icon">🏢</span>
            <span className="adm-nav-bottom-label">Manager Portal</span>
          </NavLink>
          <NavLink to="/dashboard" className="adm-nav-portal-link">
            <span className="adm-nav-icon">👤</span>
            <span className="adm-nav-bottom-label">My Dashboard</span>
          </NavLink>
          <button className="adm-nav-logout-btn" onClick={handleLogout}>
            <span className="adm-nav-icon">👋</span>
            <span className="adm-nav-bottom-label">Logout</span>
          </button>
        </div>
      </nav>

      <div className={`adm-sidebar-overlay${mobileOpen ? " visible" : ""}`} onClick={() => setMobileOpen(false)} />

      {/* ── Main ── */}
      <div className="adm-main">
        <div className="adm-topbar">
          <button className="adm-hamburger" onClick={() => setMobileOpen(o => !o)}>☰</button>
          <div className="adm-topbar-title">{pageTitle}</div>
          <div className="adm-topbar-actions">
            <NotificationBell />
          </div>
        </div>
        <div className="adm-content">
          <Outlet />
        </div>
      </div>

    </div>
  );
}
