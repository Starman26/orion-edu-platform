// src/components/LogoutButton.tsx
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LogoutButton() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
      navigate("/"); // vuelve al Login
    } catch (err) {
      console.error("Error cerrando sesión:", err);
    }
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-lg bg-palette-light hover:bg-palette-light text-palette-dark transition-colors"
    >
      <LogOut className="size-4" />
      Cerrar sesión
    </button>
  );
}
