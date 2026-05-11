// src/pages/ManagementConsole.tsx
import { useState, useEffect, useCallback } from "react";
import { Menu } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import "../styles/analysis-ui.css";

const ROOT_COLLAPSED_CLASS = "cora-sidebar-collapsed";
const LS_KEY = "cora.sidebarCollapsed";

async function loadUserProfile(user: any): Promise<{ name: string; role: string | null }> {
  if (!user) return { name: "", role: null };
  let baseName = user.email?.split("@")[0] ?? "";
  let role: string | null = null;

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, active_team_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileData?.full_name) {
    const parts = profileData.full_name.trim().split(/\s+/);
    baseName = parts[0] || baseName;
  }

  if (profileData?.active_team_id) {
    const { data: membershipData } = await supabase
      .from("team_memberships")
      .select("role")
      .eq("auth_user_id", user.id)
      .eq("team_id", profileData.active_team_id)
      .maybeSingle();
    if (membershipData?.role) role = membershipData.role;
  }

  return { name: baseName, role };
}

// ============================================================================
// HEADER
// ============================================================================

interface ConsoleHeaderProps {
  userName: string;
  userRole: string | null;
}

function ConsoleHeader({ userName, userRole }: ConsoleHeaderProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (sidebarCollapsed) document.documentElement.classList.add(ROOT_COLLAPSED_CLASS);
    else document.documentElement.classList.remove(ROOT_COLLAPSED_CLASS);
  }, [sidebarCollapsed]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY, next ? "1" : "0"); } catch {}
      if (next) document.documentElement.classList.add(ROOT_COLLAPSED_CLASS);
      else document.documentElement.classList.remove(ROOT_COLLAPSED_CLASS);
      window.dispatchEvent(new CustomEvent("cora:sidebar-toggle", { detail: { collapsed: next } }));
      return next;
    });
  }, []);

  const displayName = userName || "User";

  return (
    <header className="analysis_header">
      <div className="analysis_headerLeft">
        <button
          type="button"
          onClick={toggleSidebar}
          className="analysis_menuBtn"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Menu size={18} />
        </button>
        <div className="analysis_headerDivider" />
        <div className="analysis_userInfo">
          <span className="analysis_pageName">Management Console</span>
          <span className="analysis_pathSeparator">/</span>
          <span className="analysis_userName">{displayName}</span>
          {userRole && (
            <>
              <span className="analysis_userSeparator">/</span>
              <span className="analysis_userRole">{userRole}</span>
            </>
          )}
        </div>
      </div>
      <div className="analysis_headerRight">
        <button type="button" className="analysis_headerBtn">Feedback</button>
      </div>
    </header>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function ManagementConsolePage() {
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      loadUserProfile(user).then(({ name, role }) => {
        setUserName(name);
        setUserRole(role);
      });
    });
  }, []);

  return (
    <div className="analysis_root">
      <ConsoleHeader userName={userName} userRole={userRole} />
    </div>
  );
}
