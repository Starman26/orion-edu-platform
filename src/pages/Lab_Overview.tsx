// src/pages/LivingLabPage.tsx
import { useState, useEffect, useCallback } from "react";
import {
  Menu,
  Wifi,
  SlidersHorizontal,
  MessageSquare,
  Copy,
  Check,
  ExternalLink,
  Download,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import KnowledgeGraphSection from "../components/KnowledgeGraphSection";
import "../styles/livinglab.css";

const ROOT_COLLAPSED_CLASS = "cora-sidebar-collapsed";
const LS_KEY = "cora.sidebarCollapsed";

// ============================================================================
// TYPES
// ============================================================================

// "Your Bridge" onboarding steps
const BRIDGE_STEPS: { num: string; icon: React.ReactNode; title: string; text: string }[] = [
  {
    num: "01",
    icon: <Wifi size={18} strokeWidth={1.6} />,
    title: "Connect",
    text: "Install ORION-Bridge  on your PC. Start setting up your lab environment, connected devices and more.",
  },
  {
    num: "02",
    icon: <SlidersHorizontal size={18} strokeWidth={1.6} />,
    title: "Configure",
    text: "Create equipment profiles and customize your lab's knowledge base. ORION's flexible schema can represent any device, protocol, or workflow.",
  },
  {
    num: "03",
    icon: <MessageSquare size={18} strokeWidth={1.6} />,
    title: "Operate",
    text: "Start chatting. Ask diagnostic questions, run protocols, and monitor your entire lab from a single conversation. All that and more in Studio",
  },
];

// ============================================================================
// MAIN PAGE
// ============================================================================

export function LivingLabPage() {
  const { user } = useAuth();

  // Sidebar toggle (same pattern as Dashboard)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  });

  // User profile data
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);

  const [bridgeCopied, setBridgeCopied] = useState(false);


  // Knowledge base tables
  // Active view tab
  const [activeView, setActiveView] = useState<"kb" | "team">("kb");

  // ── Sidebar toggle ──
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

  // ── Load user profile + team data ──
  useEffect(() => {
    if (!user) return;

    const loadProfile = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, active_team_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!profile) return;

      const parts = (profile.full_name || "").trim().split(/\s+/);
      setUserName(parts[0] || user.email?.split("@")[0] || "User");
      setTeamId(profile.active_team_id);

      if (profile.active_team_id) {
        const { data: membership } = await supabase
          .from("team_memberships")
          .select("role")
          .eq("auth_user_id", user.id)
          .eq("team_id", profile.active_team_id)
          .maybeSingle();

        if (membership?.role) setUserRole(membership.role);
      }
    };
    loadProfile();
  }, [user]);

  return (
    <div className="dash_root">
      {/* Header — same structure as Dashboard */}
      <header className="dash_header">
        <div className="dash_headerLeft">
          <button
            type="button"
            onClick={toggleSidebar}
            className="dash_menuBtn"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Menu size={18} />
          </button>

          <div className="dash_headerDivider" />

          <div className="dash_userInfo">
            <span className="dash_pageName">Living Lab</span>
            <span className="dash_pathSeparator">/</span>
            <span className="dash_userName">{userName || "User"}</span>
            {userRole && (
              <>
                <span className="dash_userSeparator">/</span>
                <span className="dash_userRole">{userRole}</span>
              </>
            )}
          </div>
        </div>

        <div className="dash_headerRight">
          <button type="button" className="dash_headerBtn">Feedback</button>
        </div>
      </header>

      {/* Content */}
      <div className="ll_scrollWrap">
      <div className="ll_content">
        {/* View tabs */}
        <div className="ll_tabs" role="tablist" aria-label="Living Lab views">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "kb"}
            className={`ll_tab ${activeView === "kb" ? "ll_tab--active" : ""}`}
            onClick={() => setActiveView("kb")}
          >
            Knowledge Graph
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "team"}
            className={`ll_tab ${activeView === "team" ? "ll_tab--active" : ""}`}
            onClick={() => setActiveView("team")}
          >
            Your Bridge
          </button>
        </div>

        {activeView === "kb" && (
          <div className="ll_kgWrap">
            <KnowledgeGraphSection
              teamId={teamId}
              userId={user?.id ?? null}
              canEdit={userRole === "admin" || userRole === "owner"}
            />
          </div>
        )}

        {activeView === "team" && (
        <div className="ll_bridgeView">

          {/* ── Hero — two columns ── */}
          <div className="ll_bridgeHero">
            <div className="ll_bridgeHeroText">
              <span className="ll_bridgeLabel">ORION Bridge</span>
              <h2 className="ll_bridgeTitle">
                Your lab's physical layer,<br />
                <em>connected.</em>
              </h2>
              <p className="ll_bridgeSub">
                ORION Bridge is a lightweight Python daemon that runs on your lab PC and
                creates a persistent connection to the platform. Once running, ORION can
                discover, monitor, and control any device on your local network through
                a single conversation.
              </p>
            </div>
            <div className="ll_bridgeHeroImg" aria-hidden="true" />
          </div>

          {/* ── Steps ── */}
          <div className="ll_bridgeSteps">
            {BRIDGE_STEPS.map((step) => (
              <div key={step.num} className="ll_bridgeStep">
                <div className="ll_bridgeStepHead">
                  <span className="ll_bridgeStepNum">{step.num}</span>
                  <span className="ll_bridgeStepIcon">{step.icon}</span>
                </div>
                <h3 className="ll_bridgeStepTitle">{step.title}</h3>
                <p className="ll_bridgeStepText">{step.text}</p>
              </div>
            ))}
          </div>

          {/* ── Quick links ── */}
          <div className="ll_bridgeQuickLinks">
            <div className="ll_bridgeQuickItem">
              <span className="ll_bridgeQuickLabel">Install</span>
              <div className="ll_bridgeQuickCmd">
                <code className="ll_bridgeQuickCode">pip install orion-bridge[all]</code>
                <button
                  type="button"
                  className="ll_bridgeQuickCopy"
                  title="Copy"
                  onClick={() => {
                    navigator.clipboard.writeText("pip install orion-bridge[all]");
                    setBridgeCopied(true);
                    setTimeout(() => setBridgeCopied(false), 2000);
                  }}
                >
                  {bridgeCopied
                    ? <Check size={12} strokeWidth={2.5} />
                    : <Copy size={12} strokeWidth={2} />}
                </button>
              </div>
            </div>

            <div className="ll_bridgeQuickDivider" />

            <a
              href="https://github.com/Starman26/orion-bridge-v2"
              target="_blank"
              rel="noopener noreferrer"
              className="ll_bridgeQuickItem ll_bridgeQuickItem--link"
            >
              <span className="ll_bridgeQuickLabel">Repository</span>
              <span className="ll_bridgeQuickAction">
                github.com/Starman26/orion-bridge-v2
                <ExternalLink size={11} strokeWidth={2} />
              </span>
            </a>

            <div className="ll_bridgeQuickDivider" />

            <a
              href="/orion-bridge-config-guide.pdf"
              download
              className="ll_bridgeQuickItem ll_bridgeQuickItem--link"
            >
              <span className="ll_bridgeQuickLabel">Docs</span>
              <span className="ll_bridgeQuickAction">
                Download configuration guide
                <Download size={11} strokeWidth={2} />
              </span>
            </a>
          </div>

        </div>
        )}

      </div>
      </div>
    </div>
  );
}

export default LivingLabPage;
