import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AuthCallback() {
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
        window.location.replace(ready ? "/agent" : "/onboarding");
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
            window.location.replace(ready ? "/agent" : "/onboarding");
          }

          if (event === "PASSWORD_RECOVERY") {
            subscription.unsubscribe();
            window.location.replace("/auth/reset-password");
          }
        }
      );

      // Fallback after 4 seconds
      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        window.location.replace("/login");
      }, 4000);

      return () => {
        subscription.unsubscribe();
        clearTimeout(timeout);
      };
    };

    handleCallback();
  }, []);

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
      <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>Signing you in...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
