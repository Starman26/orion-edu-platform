// src/main.tsx
import ReactDOM from "react-dom/client";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate} from "react-router-dom";
import "./styles.css";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThinkingProvider } from "./context/Thinkingcontext";
import ProtectedRoute from "./context/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
// Pages
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Home";
import Chat from "./pages/History";
import Projects from "./pages/Studio";
import Config from "./pages/Analyze";
import ProfilePage from "./pages/Profile";
import LivingLabPage from "./pages/Lab_Overview";
import ManagementConsolePage from "./pages/ManagementConsole";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";

// Apply saved theme immediately so all routes inherit it
const savedTheme = localStorage.getItem("cora.theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);

/** Redirects authenticated users to /agent; otherwise renders children */
function PublicRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/agent" replace />;
  return children;
}

function AppRoutes() {
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("access_token")) {
      window.location.replace("/auth/callback" + hash);
    }
  }, []);

  return (
    <AuthProvider>
      <ThinkingProvider>

        <Routes>
          {/* Public */}
          <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/auth/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Protected onboarding (no layout) */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            }
          />

          {/* Protected main routes (with layout) */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/agent" element={<Dashboard />} />
            <Route path="/studio" element={<Projects />} />
            <Route path="/history" element={<Chat />} />
            <Route path="/analysis" element={<Config />} />
            <Route path="/living-lab" element={<LivingLabPage />} />
            <Route path="/my-profile" element={<ProfilePage />} />
            <Route path="/management" element={<ManagementConsolePage />} />
          </Route>

          {/* Legacy redirects */}
          <Route path="/dashboard" element={<Navigate to="/agent" replace />} />
          <Route path="/projects" element={<Navigate to="/studio" replace />} />
          <Route path="/chat" element={<Navigate to="/history" replace />} />
          <Route path="/config" element={<Navigate to="/analysis" replace />} />
          <Route path="/living" element={<Navigate to="/living-lab" replace />} />
          <Route path="/profile" element={<Navigate to="/my-profile" replace />} />
          <Route path="/notebook" element={<Navigate to="/agent" replace />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ThinkingProvider>
    </AuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AppRoutes />
  </BrowserRouter>
);