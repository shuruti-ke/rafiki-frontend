// API base URL — uses env var in production, localhost in dev
export const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * Authenticated fetch helper.
 * - Attaches Bearer token from localStorage
 * - Auto-sets Content-Type for JSON bodies
 * - On 401: clears auth state and redirects to /login
 */
export async function authFetch(url, options = {}) {
  const token = localStorage.getItem("rafiki_token");
  const headers = { ...options.headers };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem("rafiki_token");
    localStorage.removeItem("rafiki_role");
    localStorage.removeItem("rafiki_user");
    window.location.href = "/login";
    return res;
  }

  return res;
}
