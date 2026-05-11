import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Signing you in...");

  useEffect(() => {
    // Supabase v2 auto-processes the hash on page load.
    // onAuthStateChange fires immediately if session already exists.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session) {
          subscription.unsubscribe();
          setStatus("Loading your workspace...");

          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("onboarding_completed, active_team_id")
              .eq("auth_user_id", session.user.id)
              .maybeSingle();

            const ready = Boolean(profile?.onboarding_completed && profile?.active_team_id);
            navigate(ready ? "/agent" : "/onboarding", { replace: true });
          } catch {
            navigate("/agent", { replace: true });
          }
        }

        if (event === "PASSWORD_RECOVERY") {
          subscription.unsubscribe();
          navigate("/auth/reset-password", { replace: true });
        }

        if (event === "SIGNED_OUT") {
          subscription.unsubscribe();
          navigate("/login", { replace: true });
        }
      }
    );

    // Fallback: if no event fires in 5 seconds, try getSession directly
    const timeout = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        subscription.unsubscribe();
        navigate("/agent", { replace: true });
      } else {
        subscription.unsubscribe();
        navigate("/login", { replace: true });
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#fafafa",
      fontFamily: "Inter, system-ui, sans-serif",
      flexDirection: "column",
      gap: 16,
    }}>
      <div style={{
        width: 32,
        height: 32,
        border: "2.5px solid #e5e7eb",
        borderTop: "2.5px solid #0a0a0a",
        borderRadius: "50%",
        animation: "spin 0.75s linear infinite",
      }} />
      <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>{status}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
