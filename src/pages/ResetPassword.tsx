import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessionReady(true);
      }
    });
  }, []);

  async function handleReset() {
    if (!password || password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setDone(true);
      setTimeout(() => navigate("/login"), 2500);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#fafafa", fontFamily: "Inter, system-ui, sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, padding: 40, width: 400,
        maxWidth: "90vw", display: "flex", flexDirection: "column", gap: 20,
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid #f0f0f0",
      }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700 }}>
            New password
          </h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Choose a strong password for your account.
          </p>
        </div>

        {done ? (
          <div style={{ color: "#16a34a", fontSize: 15, fontWeight: 500 }}>
            ✓ Password updated. Redirecting to login...
          </div>
        ) : !sessionReady ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>
            Verifying reset link...
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                style={{ padding: "10px 14px", borderRadius: 8,
                  border: "1px solid #e5e7eb", fontSize: 14,
                  outline: "none", fontFamily: "inherit" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                onKeyDown={(e) => e.key === "Enter" && handleReset()}
                style={{ padding: "10px 14px", borderRadius: 8,
                  border: "1px solid #e5e7eb", fontSize: 14,
                  outline: "none", fontFamily: "inherit" }}
              />
            </div>
            {error && (
              <p style={{ margin: 0, color: "#dc2626", fontSize: 13 }}>{error}</p>
            )}
            <button type="button" onClick={handleReset}
              disabled={loading || !password || !confirm}
              style={{ padding: "12px", borderRadius: 8, border: "none",
                background: "#111", color: "#fff", fontSize: 15, fontWeight: 600,
                cursor: "pointer", opacity: (loading || !password || !confirm) ? 0.6 : 1 }}>
              {loading ? "Updating..." : "Update password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
