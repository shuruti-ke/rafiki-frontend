/**
 * Route guard for manager pages.
 *
 * In production, this checks JWT role claims.
 * For now (demo mode), it always allows access — matching the backend's
 * DEMO_ROLE = "hr_admin" pattern.
 *
 * To test access denial, set localStorage.setItem("rafiki_role", "user")
 */

import { Navigate } from "react-router-dom";

export default function ManagerRoute({ children }) {
  const role = localStorage.getItem("rafiki_role") || "hr_admin"; // demo default

  if (role !== "manager" && role !== "hr_admin" && role !== "super_admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
