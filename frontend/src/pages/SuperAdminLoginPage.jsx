import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./LoginPage.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function SuperAdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Login failed");

      localStorage.setItem("rafiki_token", data.access_token);
      localStorage.setItem("rafiki_role", data.user.role);
      localStorage.setItem("rafiki_user", JSON.stringify(data.user));

      if (data.user.role === "super_admin") navigate("/super-admin");
      else if (data.user.role === "hr_admin") navigate("/admin");
      else navigate("/chat");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo-dot" />
          <div className="login-brand-title">Rafiki</div>
        </div>
        <div className="login-subtitle">Super Admin Portal</div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@shoulder2leanon.com"
              required
            />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In to Platform Admin"}
          </button>
          <div className="login-btn-helper">
            Continue to organization billing, platform oversight, and super admin controls.
          </div>
        </form>

        <div className="login-links">
          <Link to="/login">Employee / HR Login</Link>
        </div>
      </div>
    </div>
  );
}
