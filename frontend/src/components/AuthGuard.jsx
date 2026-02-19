import { Navigate, useLocation } from "react-router-dom";

function normalizeRole(role) {
  return String(role || "")
    .toLowerCase()
    .replace("userrole.", "")   // handles "UserRole.hr_admin"
    .trim();
}

export default function AuthGuard({ children, requiredRoles = [], loginPath = "/login" }) {
  const location = useLocation();

  const token = localStorage.getItem("rafiki_token");
  const role = normalizeRole(localStorage.getItem("rafiki_role"));

  const isOnLoginPath = location.pathname === loginPath;

  // 1) No token → go to login (but never loop if already there)
  if (!token) {
    if (isOnLoginPath) return children;
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  // 2) Token exists but role missing/invalid → clear and go to login once
  if (!role) {
    localStorage.removeItem("rafiki_token");
    localStorage.removeItem("rafiki_role");
    localStorage.removeItem("rafiki_user");
    if (isOnLoginPath) return children;
    return <Navigate to={loginPath} replace />;
  }

  // 3) Role check (also don’t loop if already on login path)
  if (requiredRoles.length) {
    const allowed = requiredRoles.map(normalizeRole);
    if (!allowed.includes(role)) {
      if (isOnLoginPath) return children;
      return <Navigate to={loginPath} replace />;
    }
  }

  return children;
}
