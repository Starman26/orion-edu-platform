// src/pages/Login.tsx — White Canvas Redesign
// Matches Dashboard aesthetic: #fafafa bg, Neu Machina + Inter, thin borders, minimal
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/login-ui.css";

import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const { login, signup } = useAuth() as any;

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = new URLSearchParams(window.location.search);
  const startAsSignup = searchParams.get("signup") === "true";
  const [isSignup, setIsSignup] = useState(startAsSignup);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const isElectron = useMemo(() => Boolean((window as any).electronAPI), []);

  useEffect(() => {
    window.electronAPI?.setWindowSize(800, 500);
    return () => {
      window.electronAPI?.setWindowSize(1200, 800);
    };
  }, []);

  const routeAfterAuth = async (authUserId: string) => {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, onboarding_completed, active_team_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (profileError) {
      console.error("Error consultando profiles:", profileError);
      navigate("/onboarding");
      return;
    }

    const onboardingOk = Boolean(profile?.onboarding_completed);
    const hasActiveTeam = Boolean(profile?.active_team_id);

    if (!profile || !onboardingOk || !hasActiveTeam) {
      navigate("/onboarding");
    } else {
      navigate("/agent");
    }
  };

  useEffect(() => {
    const off = window.electronAPI?.onAuthCallback?.(async (rawUrl: string) => {
      try {
        setError(null);
        setLoading(true);

        const url = new URL(rawUrl);
        const code = url.searchParams.get("code");

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          const userId = data?.user?.id || data?.session?.user?.id;
          if (!userId)
            throw new Error("No se pudo obtener el usuario desde la sesión (code exchange).");

          await routeAfterAuth(userId);
          return;
        }

        const hash = (url.hash || "").replace(/^#/, "");
        const params = new URLSearchParams(hash);
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");

        if (access_token && refresh_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) throw error;

          const userId = data?.user?.id || data?.session?.user?.id;
          if (!userId)
            throw new Error("No se pudo obtener el usuario desde la sesión (setSession).");

          await routeAfterAuth(userId);
          return;
        }

        throw new Error("Callback recibido, pero no venía 'code' ni tokens.");
      } catch (err: any) {
        console.error("Error procesando OAuth callback:", err);
        setError(err?.message || "No se pudo completar el login con Google.");
      } finally {
        setLoading(false);
      }
    });

    return () => off?.();
  }, [navigate]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = (form.get("usuario") as string) || "";
    const password = (form.get("contrasena") as string) || "";

    try {
      const authUser = isSignup
        ? await signup(email, password)
        : await login(email, password);

      if (!authUser) throw new Error("No se pudo obtener el usuario.");
      await routeAfterAuth(authUser.id);
    } catch (err: any) {
      console.error("Error en auth:", err);
      setError(err.message || "Ocurrió un error. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  const getCallbackUrl = () => {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${window.location.origin}/auth/callback`;
    }
    return "https://www.orion-learning.com/auth/callback";
  };

  async function handleGoogleLogin() {
    setError(null);
    setLoading(true);

    try {
      if (!isElectron) {
        // Open popup synchronously from the click to avoid popup blockers
        const w = 500;
        const h = 650;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        const popup = window.open(
          "about:blank",
          "orion-oauth",
          `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );

        if (!popup) {
          setError("Please allow popups for this site to sign in with Google.");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: getCallbackUrl(),
            skipBrowserRedirect: true,
          },
        });

        if (error || !data?.url) {
          popup.close();
          throw error || new Error("Could not start OAuth flow.");
        }

        popup.location.href = data.url;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            if (event === "SIGNED_IN" && session) {
              subscription.unsubscribe();
              clearInterval(closedCheck);
              if (!popup.closed) popup.close();
              await routeAfterAuth(session.user.id);
            }
          }
        );

        const closedCheck = setInterval(() => {
          if (popup.closed) {
            clearInterval(closedCheck);
            subscription.unsubscribe();
            setLoading(false);
          }
        }, 500);

        return;
      }

      const redirectTo = "cora://auth/callback";
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });

      if (error) throw error;

      const oauthUrl = data?.url;
      if (!oauthUrl)
        throw new Error("No se recibió la URL de OAuth desde Supabase.");

      if ((window as any).fredie?.openExternal) {
        (window as any).fredie.openExternal(oauthUrl);
      } else {
        window.open(oauthUrl, "_blank");
      }
    } catch (err: any) {
      console.error("Error en login con Google:", err);
      setError(err.message || "No se pudo iniciar sesión con Google.");
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(
      forgotEmail.trim(),
      { redirectTo: `${window.location.origin}/auth/reset-password` }
    );
    setForgotLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setForgotSent(true);
    }
  }

  // ── Dot grid background (matches dashboard particle grid aesthetic) ──
  const DotGrid = () => (
    <div className="login-dotgrid" aria-hidden="true">
      <svg width="100%" height="100%">
        <defs>
          <pattern id="dotPattern" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="rgba(16,17,19,0.06)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotPattern)" />
      </svg>
    </div>
  );

  return (
    <div className="login-root">
      <DotGrid />

      {/* Top bar — matches landing nav rhythm */}
      <header className="login-topbar">
        <div className="login-topbar-left">
          <span className="login-wordmark">ORION</span>
        </div>
        <div className="login-topbar-center">
          <button type="button" className="login-back-text" onClick={() => navigate("/")}>
            Back
          </button>
        </div>
        <div className="login-topbar-right">
          <span className="login-topbar-label">
            {isSignup ? "Sign up" : "Sign in"}
          </span>
        </div>
      </header>

      {/* Main centered form */}
      <main className="login-main">
        <div className="login-form-container">
          {/* Greeting */}
          <div className="login-greeting">
            <h1 className="login-title">
              {isSignup ? (
                <>
                  <span className="login-title-light">Create your</span>
                  <br />
                  <span className="login-title-dark">account</span>
                </>
              ) : (
                <>
                  <span className="login-title-light">Welcome</span>
                  <br />
                  <span className="login-title-dark">back</span>
                </>
              )}
            </h1>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label htmlFor="usuario" className="login-label">
                Email
              </label>
              <input
                id="usuario"
                name="usuario"
                type="email"
                required
                placeholder="you@company.com"
                className="login-input"
                autoComplete="email"
              />
            </div>

            <div className="login-field">
              <div className="login-label-row">
                <label htmlFor="contrasena" className="login-label">
                  Password
                </label>
                {!isSignup && (
                  <button
                    type="button"
                    className="login-forgot"
                    onClick={() => { setShowForgot(true); setForgotSent(false); setForgotEmail(""); }}>
                    Forgot?
                  </button>
                )}
              </div>
              <div className="login-input-wrap">
                <input
                  id="contrasena"
                  name="contrasena"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Enter your password"
                  className="login-input"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {!isSignup && (
              <div className="login-remember">
                <input
                  type="checkbox"
                  id="remember"
                  name="remember"
                  className="login-checkbox"
                />
                <label htmlFor="remember" className="login-remember-label">
                  Remember me
                </label>
              </div>
            )}

            {error && <p className="login-error">{error}</p>}

            <button type="submit" disabled={loading} className="login-submit">
              {loading
                ? isSignup
                  ? "Creating..."
                  : "Signing in..."
                : isSignup
                ? "Create account"
                : "Sign in"}
            </button>
          </form>

          {/* Divider */}
          {!isSignup && (
            <>
              <div className="login-divider">
                <div className="login-divider-line" />
                <span className="login-divider-text">or</span>
                <div className="login-divider-line" />
              </div>

              {/* Social */}
              <div className="login-social">
                <button
                  type="button"
                  className="login-social-btn"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                >
                  <svg className="login-social-icon" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </button>

                <button
                  type="button"
                  className="login-social-btn"
                  disabled
                  title="Facebook login not configured"
                >
                  <svg className="login-social-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z" />
                  </svg>
                  Continue with Facebook
                </button>
              </div>
            </>
          )}

          {/* Toggle */}
          <div className="login-toggle">
            {isSignup ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setIsSignup(false); setError(null); }}
                  className="login-toggle-link"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setIsSignup(true); setError(null); }}
                  className="login-toggle-link"
                >
                  Create one
                </button>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Bottom disclaimer */}
      <footer className="login-footer">
        <span>Created by Cyclicall International Industries</span>
      </footer>

      {showForgot && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowForgot(false)}>
          <div style={{
            background: "#fff", borderRadius: 6, padding: 32, width: 380,
            maxWidth: "90vw", display: "flex", flexDirection: "column", gap: 16,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Reset password</h2>
            {forgotSent ? (
              <>
                <p style={{ color: "#111", fontSize: 14, margin: 0 }}>
                  Check your inbox. We sent you a reset link.
                </p>
                <button type="button"
                  onClick={() => setShowForgot(false)}
                  style={{ padding: "10px", borderRadius: 8, border: "none",
                    background: "#111", color: "#fff", fontSize: 14,
                    fontWeight: 600, cursor: "pointer" }}>
                  Done
                </button>
              </>
            ) : (
              <>
                <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>
                  Enter your email and we'll send you a reset link.
                </p>
                <input type="email" placeholder="you@company.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
                  style={{ padding: "10px 14px", borderRadius: 8,
                    border: "1px solid #e5e7eb", fontSize: 14,
                    outline: "none", fontFamily: "inherit" }}
                  autoFocus />
                <button type="button" onClick={handleForgotPassword}
                  disabled={forgotLoading || !forgotEmail.trim()}
                  style={{ padding: "10px", borderRadius: 8, border: "none",
                    background: "#111", color: "#fff", fontSize: 14, fontWeight: 600,
                    cursor: "pointer",
                    opacity: (forgotLoading || !forgotEmail.trim()) ? 0.6 : 1 }}>
                  {forgotLoading ? "Sending..." : "Send reset link"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}