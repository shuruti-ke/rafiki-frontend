import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./LoginPage.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function HRAdminLoginPage() {
  const navigate = useNavigate();

  // ✅ Restore org state from storage (prevents reset loop)
  const [step, setStep] = useState(() =>
    localStorage.getItem("rafiki_org_code") ? 2 : 1
  );

  const [code, setCode] = useState(
    () => localStorage.getItem("rafiki_org_code") || ""
  );

  const [orgName, setOrgName] = useState(
    () => localStorage.getItem("rafiki_org_name") || ""
  );

  const [orgCode, setOrgCode] = useState(
    () => localStorage.getItem("rafiki_org_code") || ""
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const cleanCode = code.trim();

      const res = await fetch(`${API}/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleanCode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invalid company code");

      setOrgName(data.org_name);
      setOrgCode(cleanCode);

      // ✅ Persist org
      localStorage.setItem("rafiki_org_name", data.org_name);
      localStorage.setItem("rafiki_org_code", cleanCode);

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
        body: JSON.stringify({
          email: email.trim(),
          password,
          org_code: orgCode,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Login failed");

      // ✅ Save auth safely
      localStorage.setItem("rafiki_token", data.access_token);
      localStorage.setItem("rafiki_role", String(data.user.role || ""));
      localStorage.setItem("rafiki_user", JSON.stringify(data.user));

      // ✅ Prevent back button bounce
      navigate("/admin", { replace: true });

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetCode = () => {
    // ✅ Clear persisted org
    localStorage.removeItem("rafiki_org_name");
    localStorage.removeItem("rafiki_org_code");

    setStep(1);
    setOrgName("");
    setOrgCode("");
    setCode("");
    setError("");
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo-dot" />
          <div className="login-brand-title">Rafiki</div>
        </div>

        <div className="login-subtitle">HR Admin Portal</div>

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
              <button type="button" onClick={resetCode}>
                Change
              </button>
            </div>

            <div className="login-field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hr@company.com"
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
          <Link to="/super-admin/login">Super Admin</Link>
          {" | "}
          <Link to="/login">Employee Login</Link>
        </div>
      </div>
    </div>
  );
}
