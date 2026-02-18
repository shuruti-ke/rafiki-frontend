import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./LoginPage.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function EmployeeLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [code, setCode] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invalid company code");
      setOrgName(data.org_name);
      setOrgCode(code.trim());
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, org_code: orgCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Login failed");

      localStorage.setItem("rafiki_token", data.token);
      localStorage.setItem("rafiki_role", data.role);
      localStorage.setItem("rafiki_user", JSON.stringify(data.user));
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetCode = () => {
    setStep(1);
    setOrgName("");
    setOrgCode("");
    setError("");
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo-dot" />
          <div className="login-brand-title">Rafiki</div>
        </div>
        <div className="login-subtitle">Employee Portal</div>

        {step === 1 ? (
          <form className="login-form" onSubmit={handleVerifyCode}>
            <div className="login-field">
              <label>Company Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter your company code"
                required
              />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? "Verifying..." : "Continue"}
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleLogin}>
            <div className="login-org-badge">
              <span className="org-name">{orgName}</span>
              <button type="button" onClick={resetCode}>Change</button>
            </div>
            <div className="login-field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
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
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}

        <div className="login-links">
          <Link to="/admin/login">HR Admin Login</Link>
          {" | "}
          <Link to="/super-admin/login">Super Admin</Link>
        </div>
      </div>
    </div>
  );
}
