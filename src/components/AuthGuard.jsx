import { Navigate } from "react-router-dom";

export default function AuthGuard({ children, requiredRoles, loginPath = "/login" }) {
  const token = localStorage.getItem("rafiki_token");
  const role = localStorage.getItem("rafiki_role");

  if (!token) {
    return <Navigate to={loginPath} replace />;
  }

  if (requiredRoles && !requiredRoles.includes(role)) {
    return <Navigate to={loginPath} replace />;
  }

  return children;
}
