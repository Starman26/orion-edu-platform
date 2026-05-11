import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Signing you in...");

  useEffect(() => {
    const handleCallback = async () => {
      // Check if session already exists (Supabase may have already processed the hash)
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed, active_team_id")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();

        const ready = Boolean(profile?.onboarding_completed && profile?.active_team_id);
        navigate(ready ? "/agent" : "/onboarding", { replace: true });
        return;
      }

      // No session yet — listen for it
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === "SIGNED_IN" && session) {
            subscription.unsubscribe();

            const { data: profile } = await supabase
              .from("profiles")
              .select("onboarding_completed, active_team_id")
              .eq("auth_user_id", session.user.id)
              .maybeSingle();

            const ready = Boolean(profile?.onboarding_completed && profile?.active_team_id);
            navigate(ready ? "/agent" : "/onboarding", { replace: true });
          }

          if (event === "PASSWORD_RECOVERY") {
            subscription.unsubscribe();
            navigate("/auth/reset-password", { replace: true });
          }
        }
      );

      // Fallback after 4 seconds
      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        navigate("/login", { replace: true });
      }, 4000);

      return () => {
        subscription.unsubscribe();
        clearTimeout(timeout);
      };
    };

    handleCallback();
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
