import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // ✅ mientras se hidrata la sesión, NO redirijas
  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center text-palette-medium">
        Cargando...
      </div>
    );
  }

  // ✅ si no hay usuario, manda a login y guarda a dónde quería ir
  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
}
