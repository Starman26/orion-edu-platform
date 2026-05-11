// src/components/AppLayout.tsx
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const path = location.pathname.replace(/^\/+/, "");

  const isWidget = path.startsWith("widget");
  if (isWidget) {
    return (
      <div className="w-full h-full bg-transparent">
        <Outlet />
      </div>
    );
  }

  const current =
    path.startsWith("studio") ? "proyectos" :
    path.startsWith("history") ? "chat" :
    path.startsWith("analysis") ? "widget" :
    path.startsWith("living-lab") ? "living" :
    path.startsWith("my-profile") ? "perfil" :
    path.startsWith("management") ? "mgmt" :
    "inicio";

  const isChat = path.startsWith("history");

  const isFullPage =
    isChat ||
    path.startsWith("agent") ||
    path.startsWith("studio") ||
    path.startsWith("analysis") ||
    path.startsWith("living-lab") ||
    path.startsWith("my-profile") ||
    path.startsWith("management") ||
    path === "" ||
    path === "/";

  return (
    <div
      className="
        h-screen w-full overflow-hidden
        bg-[#343437]
        flex
      "
    >
      <Sidebar
        current={current}
        onNavigate={(k) => {
          if (k === "inicio") navigate("/agent");
          else if (k === "proyectos") navigate("/studio");
          else if (k === "living") navigate("/living-lab");
          else if (k === "chat") navigate("/history");
          else if (k === "widget") navigate("/analysis");
          else if (k === "perfil") navigate("/my-profile");
          else if (k === "mgmt") navigate("/management");
        }}
      />

      <main
        className="
          flex-1 h-screen flex flex-col overflow-hidden
          bg-transparent
        "
      >
        {isFullPage ? (
          <div className="flex-1 overflow-hidden">
            <div
              className="
                h-full
                bg-white
                shadow-sm
                overflow-hidden
              "
            >
              <Outlet />
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-10 py-8 bg-white rounded-tl-3xl shadow-sm">
              <Outlet />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}