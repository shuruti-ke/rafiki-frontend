import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./LoginPage.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function LoginPage() {
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

      localStorage.setItem("rafiki_token", data.access_token);
      localStorage.setItem("rafiki_role", data.user.role);
      // Fetch /me so we have canonical user (e.g. payroll flags) from the same API that layout uses
      try {
        const meRes = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        if (meRes.ok) {
          const meUser = await meRes.json();
          localStorage.setItem("rafiki_user", JSON.stringify(meUser));
        } else {
          localStorage.setItem("rafiki_user", JSON.stringify(data.user));
        }
      } catch {
        localStorage.setItem("rafiki_user", JSON.stringify(data.user));
      }

      if (data.user.role === "super_admin") navigate("/super-admin", { replace: true });
      else if (data.user.role === "hr_admin") navigate("/admin", { replace: true });
      else navigate("/chat", { replace: true });
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
        <div className="login-subtitle">Sign in to your workspace</div>

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
              {loading ? "Signing in..." : `Sign In to ${orgName}`}
            </button>
            <div className="login-btn-helper">
              You will be taken to your employee, manager, or HR workspace after sign-in.
            </div>
          </form>
        )}

        <div className="login-links">
          <Link to="/">Home</Link>
        </div>
      </div>
    </div>
  );
}
