// frontend/src/components/AdminLayout.jsx
import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import NotificationBell from "./NotificationBell.jsx";
import "./AdminLayout.css";

const NAV_GROUPS = [
  {
    key: "people",
    label: "People",
    icon: "👥",
    items: [
      { to: "/admin/employees",   label: "Employees" },
      { to: "/admin/managers",    label: "Managers" },
      { to: "/admin/org-config",  label: "Org Config" },
    ],
  },
  {
    key: "engagement",
    label: "Engagement",
    icon: "📣",
    items: [
      { to: "/admin/announcements",  label: "Announcements" },
      { to: "/admin/knowledge-base", label: "Knowledge Base" },
      { to: "/admin/toolkit",        label: "HR Toolkit" },
      { to: "/admin/guided-paths",   label: "Guided Paths" },
      { to: "/admin/wellbeing",      label: "Wellbeing" },
      { to: "/admin/calendar",       label: "Calendar" },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    icon: "⚙️",
    items: [
      { to: "/admin/leave",      label: "Leave Management" },
      { to: "/admin/payroll",    label: "Payroll" },
      { to: "/admin/timesheets", label: "Timesheets" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    icon: "📊",
    items: [
      { to: "/admin/reports",      label: "HR Reports" },
      { to: "/admin/usage-report", label: "Usage Report" },
    ],
  },
];

const STORAGE_KEY = "rafiki_sidebar_open";

function loadOpenSections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Default: all open
  return Object.fromEntries(NAV_GROUPS.map(g => [g.key, true]));
}

function saveOpenSections(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const [openSections, setOpenSections] = useState(loadOpenSections);

  useEffect(() => { saveOpenSections(openSections); }, [openSections]);

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

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
          {/* Top-level dashboard — ungrouped */}
          <NavLink
            to="/admin"
            end
            className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}
          >
            Dashboard
          </NavLink>

          {/* Grouped sections */}
          {NAV_GROUPS.map(group => (
            <div key={group.key} className="admin-nav-group">
              <button
                className="admin-nav-group-header"
                onClick={() => toggleSection(group.key)}
                aria-expanded={openSections[group.key]}
              >
                <span className="admin-nav-group-icon">{group.icon}</span>
                <span className="admin-nav-group-label">{group.label}</span>
                <span className={`admin-nav-chevron${openSections[group.key] ? " admin-nav-chevron--open" : ""}`} />
              </button>

              {openSections[group.key] && (
                <div className="admin-nav-group-items">
                  {group.items.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `admin-nav-link admin-nav-link--child ${isActive ? "active" : ""}`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="admin-nav-footer">
          <NavLink to="/manager" className="admin-nav-link">Manager Portal</NavLink>
          <NavLink to="/chat"    className="admin-nav-link">Employee Portal</NavLink>
          <button
            onClick={handleLogout}
            className="admin-nav-link"
            style={{
              background: "none", border: "none", cursor: "pointer",
              textAlign: "left", width: "100%", font: "inherit",
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-topbar">
          <NotificationBell />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
