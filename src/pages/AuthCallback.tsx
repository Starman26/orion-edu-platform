import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AuthCallback() {
  useEffect(() => {
    const handleCallback = async () => {
      console.log("[AuthCallback] Full URL:", window.location.href.slice(0, 200));

      const isInPopup = Boolean(window.opener && window.opener !== window);

      const routeAfterSession = async (userId: string) => {
        if (isInPopup) {
          window.close();
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed, active_team_id")
          .eq("auth_user_id", userId)
          .maybeSingle();
        const ready = Boolean(profile?.onboarding_completed && profile?.active_team_id);
        window.location.replace(ready ? "/agent" : "/onboarding");
      };

      // PKCE flow: Supabase redirects with ?code= in the query string
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");
      if (code) {
        console.log("[AuthCallback] PKCE code found, exchanging for session...");
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[AuthCallback] exchangeCodeForSession error:", error.message);
          if (isInPopup) window.close();
          else window.location.replace("/login");
          return;
        }
        if (data.session) {
          await routeAfterSession(data.session.user.id);
          return;
        }
      }

      // Implicit flow fallback: tokens in URL hash
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (access_token && refresh_token) {
        console.log("[AuthCallback] Implicit tokens found, setting session...");
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          console.error("[AuthCallback] setSession error:", error.message);
          if (isInPopup) window.close();
          else window.location.replace("/login");
          return;
        }
        if (data.session) {
          await routeAfterSession(data.session.user.id);
          return;
        }
      }

      // Session may already exist (e.g. page refresh)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await routeAfterSession(session.user.id);
        return;
      }

      // Last resort: listen for auth state change
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === "SIGNED_IN" && session) {
            subscription.unsubscribe();
            clearTimeout(timeout);
            await routeAfterSession(session.user.id);
          }

          if (event === "PASSWORD_RECOVERY") {
            subscription.unsubscribe();
            clearTimeout(timeout);
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
