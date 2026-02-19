import { Navigate, useLocation } from "react-router-dom";

export default function AuthGuard({ children, requiredRoles = [], loginPath = "/login" }) {
  const location = useLocation();

  const token = localStorage.getItem("rafiki_token"); // or whatever you store
  const role = localStorage.getItem("rafiki_role");   // adjust to your app

  // ✅ If we're already on the login page, do NOT redirect again (prevents loops)
  if (!token) {
    if (location.pathname === loginPath) return children;
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  if (requiredRoles.length && !requiredRoles.includes(role)) {
    return <Navigate to={loginPath} replace />;
  }

  return children;
}
