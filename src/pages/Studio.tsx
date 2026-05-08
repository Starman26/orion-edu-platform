import { useState, useEffect, useCallback } from "react";
import { Menu, Plus, Search, LayoutGrid, List, FileText, Sparkles, Info, MoreHorizontal, Loader2, X } from "lucide-react";
import { MapIcon, SparklesIcon, BoltIcon, PlayCircleIcon, ChartBarIcon, PresentationChartLineIcon } from "@heroicons/react/24/outline";
import { supabase } from "../lib/supabaseClient";
import PracticeView from "../components/PracticeView";
import AutomationView from "../components/AutomationView";
import EquipmentTab from "../components/EquipmentTab";
import TroubleshootView from "../components/TroubleshootView";
import type { EquipmentProfile } from "../components/EquipmentTab";
import { loadUserProfile, timeAgo, parseSteps } from "../components/StudioHelpers";
import type { Automation, UserProgress, ActivePractice } from "../components/StudioHelpers";

import "../styles/dashboard-ui.css";
import "../styles/studio.css";
import "../styles/studio-practice.css";

const ROOT_COLLAPSED_CLASS = "cora-sidebar-collapsed";
const LS_KEY = "cora.sidebarCollapsed";

// ============================================================================
// DASHBOARD HEADER (replica from Home.tsx)
// ============================================================================

interface DashboardHeaderProps {
  userName: string;
  userRole?: string | null;
  userError?: string | null;
  currentPage?: string;
  titleBarVisible?: boolean;
  headerMinimal?: boolean;
  onToggleTitleBar?: () => void;
  headerControls?: React.ReactNode;
}

function DashboardHeader({
  userName,
  userRole,
  userError,
  currentPage = "Studio",
  headerMinimal = false,
  headerControls,
}: DashboardHeaderProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_KEY) === "1";
    } catch {
      return false;
    }
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

  const displayName = (userName || "").trim() || "User";
  const displayRole = userRole || null;

  return (
    <>
      <header className={`dash_header ${headerMinimal ? "dash_header--minimal" : ""}`}>
        <div className="dash_headerLeft">
          <button
            type="button"
            onClick={toggleSidebar}
            className="dash_menuBtn"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Menu size={18} />
          </button>

          {!headerMinimal && (
            <>
              <div className="dash_headerDivider" />

              <div className="dash_userInfo">
                <span className="dash_pageName">{currentPage}</span>
                <span className="dash_pathSeparator">/</span>
                <span className="dash_userName">{displayName}</span>
                {displayRole && (
                  <>
                    <span className="dash_userSeparator">/</span>
                    <span className="dash_userRole">{displayRole}</span>
                  </>
                )}
              </div>
              {userError && <span className="dash_userError">({userError})</span>}
            </>
          )}
        </div>

        {!headerMinimal && (
          <div className="dash_headerRight">
            {headerControls}
            <button type="button" className="dash_headerBtn">
              Feedback
            </button>

          </div>
        )}
      </header>
    </>
  );
}

// ============================================================================
// STUDIO MODAL — New Automation / Add Equipment
// ============================================================================

function StudioModal({ type, onClose, onSubmit }: {
  type: "automation" | "equipment";
  onClose: () => void;
  onSubmit: (data: { title: string; description: string; difficulty: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState("beginner");

  return (
    <div className="studio__modalOverlay" onClick={onClose}>
      <div className="studio__modalCard" onClick={e => e.stopPropagation()}>
        <div className="studio__modalHeader">
          <h2>{type === "automation" ? "New Automation" : "Add Equipment"}</h2>
          <button type="button" className="studio__modalClose" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="studio__modalBody">
          <div className="studio__modalField">
            <label>{type === "automation" ? "Name" : "Equipment name"}</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={type === "automation" ? "e.g. Pick and place routine" : "e.g. UR5e Robot Arm"}
              autoFocus
            />
          </div>

          <div className="studio__modalField">
            <label>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description..."
              rows={3}
            />
          </div>

          {type === "automation" && (
            <div className="studio__modalField">
              <label>Difficulty</label>
              <div className="studio__modalDiffBtns">
                {["beginner", "intermediate", "advanced"].map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`studio__modalDiffBtn ${difficulty === d ? "is-active" : ""}`}
                    onClick={() => setDifficulty(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="studio__modalFooter">
          <button type="button" className="studio__modalCancel" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="studio__modalSubmit"
            onClick={() => onSubmit({ title, description, difficulty })}
            disabled={!title.trim()}
          >
            {type === "automation" ? "Create" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STUDIO PAGE
// ============================================================================

export default function Studio() {
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userLoadError, setUserLoadError] = useState<string | null>(null);
  const [headerMode, setHeaderMode] = useState<0 | 1 | 2>(0);
  const [practiceHeaderControls, setPracticeHeaderControls] = useState<React.ReactNode>(null);
  const [viewMode, setViewMode] = useState<"grid" | "columns" | "list">("grid");
  const [activeTab, setActiveTab] = useState<"modules" | "progress" | "analytics" | "equipment">("modules");
  // Dynamic data
  const [userId, setUserId] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [userProgress, setUserProgress] = useState<Record<string, UserProgress>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [activePractice, setActivePractice] = useState<ActivePractice | null>(null);
  const [activeAutomation, setActiveAutomation] = useState<ActivePractice | null>(null);
  const [automationHeaderControls, setAutomationHeaderControls] = useState<React.ReactNode>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState<"automation" | "equipment" | null>(null);
  const [activeTroubleshoot, setActiveTroubleshoot] = useState<EquipmentProfile | null>(null);

  // Carousel
  const [carouselOffset, setCarouselOffset] = useState(0);
  const CARDS_VISIBLE = 4;

  // Derived lists
  const practices = automations.filter(a => a.type === "practice");
  const activePractices = practices.filter(p => userProgress[p.id]?.status !== "completed");
  const userAutomations = automations.filter(a => a.type !== "practice");
  const filteredAutomations = searchQuery
    ? userAutomations.filter(a => a.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : userAutomations;

  useEffect(() => {
    let alive = true;

    const loadData = async () => {
      setUserLoadError(null);
      setDataLoading(true);

      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error) { setUserLoadError("Could not load user"); setDataLoading(false); return; }

      const user = data?.user;
      if (!user) { setUserLoadError("Not authenticated"); setDataLoading(false); return; }

      setUserId(user.id);

      try {
        const profile = await loadUserProfile(user);
        if (!alive) return;

        setUserName(profile.name);
        setUserRole(profile.role);
        setTeamId(profile.teamId);



        // Load automations from lab schema
        const autoQuery = supabase
          .schema("lab")
          .from("automations")
          .select("id, title, description, type, difficulty, md_content, sort_order, created_by, team_id, created_at")
          .order("sort_order", { ascending: true, nullsFirst: false });

        if (profile.teamId) {
          autoQuery.or(`team_id.eq.${profile.teamId},team_id.is.null`);
        } else {
          autoQuery.is("team_id", null);
        }

        const { data: autoData, error: autoErr } = await autoQuery;
        if (autoErr) console.error("[Studio] Automations error:", autoErr);
        console.log("[Studio] Loaded automations:", autoData?.length);
        if (autoData) {
          for (const a of autoData) {
            console.log(`[Studio] automation "${a.title}" md_content:`, a.md_content ? `${a.md_content.length} chars` : "NULL");
          }
        }
        if (alive && autoData) setAutomations(autoData as Automation[]);

        // Load user progress
        const { data: progressData, error: progressErr } = await supabase
          .schema("lab")
          .from("user_automation_progress")
          .select("automation_id, status, current_step, started_at, completed_at, session_id")
          .eq("auth_user_id", user.id);

        if (progressErr) console.error("[Studio] Progress error:", progressErr);
        console.log("[Studio] Loaded progress:", progressData);
        if (alive && progressData) {
          const map: Record<string, UserProgress> = {};
          for (const p of progressData) {
            map[p.automation_id] = p as UserProgress;
          }
          setUserProgress(map);
        }
      } catch {
        if (alive) setUserLoadError("Error loading data");
      } finally {
        if (alive) setDataLoading(false);
      }
    };

    loadData();
    return () => { alive = false; };
  }, []);

  // ── Handlers ──

  const handleStartPractice = async (automation: Automation) => {
    const existing = userProgress[automation.id];

    // Open existing session — preserve progress for any active status (in_progress, paused, completed)
    if (existing?.session_id) {
      setActivePractice({ automation, sessionId: existing.session_id });
      return;
    }

    // Create new chat session
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error: sessionErr } = await supabase.schema("chat").from("sessions").insert({
      id: sessionId,
      auth_user_id: userId,
      team_id: teamId,
      title: `Practice: ${automation.title}`,
      chat_mode: "practice",
    });
    if (sessionErr) console.error("[Studio] Session insert error:", sessionErr);

    const { error: progressErr } = await supabase.schema("lab").from("user_automation_progress").upsert({
      auth_user_id: userId,
      automation_id: automation.id,
      session_id: sessionId,
      status: "in_progress",
      current_step: 0,
      started_at: now,
      last_active_at: now,
    }, { onConflict: "auth_user_id,automation_id" });
    if (progressErr) console.error("[Studio] Progress upsert error:", progressErr);

    setUserProgress(prev => ({
      ...prev,
      [automation.id]: {
        automation_id: automation.id,
        status: "in_progress",
        current_step: 0,
        started_at: now,
        completed_at: null,
        session_id: sessionId,
      },
    }));

    setActivePractice({ automation, sessionId });
  };

  const handleProgressUpdate = (automationId: string, updates: Partial<UserProgress>) => {
    setUserProgress(prev => ({
      ...prev,
      [automationId]: { ...prev[automationId], ...updates } as UserProgress,
    }));
  };

  const handleStartAutomation = async (automation: Automation) => {
    const existing = userProgress[automation.id];
    if (existing?.session_id) {
      setActiveAutomation({ automation, sessionId: existing.session_id });
      return;
    }
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error: sessionErr } = await supabase.schema("chat").from("sessions").insert({
      id: sessionId,
      auth_user_id: userId,
      team_id: teamId,
      title: `Automation: ${automation.title}`,
      chat_mode: "automation",
    });
    if (sessionErr) console.error("[Studio] Automation session error:", sessionErr);
    const { error: progressErr } = await supabase.schema("lab").from("user_automation_progress").upsert({
      auth_user_id: userId,
      automation_id: automation.id,
      session_id: sessionId,
      status: "in_progress",
      current_step: 0,
      started_at: now,
      last_active_at: now,
    }, { onConflict: "auth_user_id,automation_id" });
    if (progressErr) console.error("[Studio] Automation progress error:", progressErr);
    setUserProgress(prev => ({
      ...prev,
      [automation.id]: { automation_id: automation.id, status: "in_progress", current_step: 0, started_at: now, completed_at: null, session_id: sessionId },
    }));
    setActiveAutomation({ automation, sessionId });
  };

  const handleRestartPractice = async (automation: Automation) => {
    // Create a fresh session and reset progress
    const newSessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error: sessionErr } = await supabase.schema("chat").from("sessions").insert({
      id: newSessionId,
      auth_user_id: userId,
      team_id: teamId,
      title: `Practice: ${automation.title}`,
      chat_mode: "practice",
    });
    if (sessionErr) console.error("[Studio] Restart session error:", sessionErr);

    const { error: progressErr } = await supabase.schema("lab").from("user_automation_progress").upsert({
      auth_user_id: userId,
      automation_id: automation.id,
      session_id: newSessionId,
      status: "in_progress",
      current_step: 0,
      started_at: now,
      completed_at: null,
      last_active_at: now,
    }, { onConflict: "auth_user_id,automation_id" });
    if (progressErr) console.error("[Studio] Restart progress error:", progressErr);

    setUserProgress(prev => ({
      ...prev,
      [automation.id]: {
        automation_id: automation.id,
        status: "in_progress",
        current_step: 0,
        started_at: now,
        completed_at: null,
        session_id: newSessionId,
      },
    }));

    setActivePractice({ automation, sessionId: newSessionId });
  };

  const handleNewAutomation = async (data: { title: string; description: string; difficulty: string }) => {
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error } = await supabase.schema("lab").from("automations").insert({
      id: newId,
      title: data.title,
      description: data.description || null,
      type: "automation",
      difficulty: data.difficulty,
      md_content: "",
      sort_order: automations.length,
      created_by: userId,
      team_id: teamId,
      created_at: now,
    });

    if (error) {
      console.error("[Studio] Create automation error:", error);
      return;
    }

    const newAutomation: Automation = {
      id: newId,
      title: data.title,
      description: data.description || null,
      type: "automation",
      difficulty: data.difficulty,
      md_content: null,
      sort_order: automations.length,
      created_by: userId,
      team_id: teamId,
      created_at: now,
    };
    setAutomations(prev => [...prev, newAutomation]);
    setModalOpen(null);
    handleStartAutomation(newAutomation);
  };

  const practiceIcons = [MapIcon, SparklesIcon, BoltIcon, PlayCircleIcon];
  const practiceIconStyles = ["studio__actionIcon--purple", "studio__actionIcon--red", "studio__actionIcon--purple", "studio__actionIcon--red"];

  // ── Automation view ──
  if (activeAutomation) {
    return (
      <div className={`dash_root ${headerMode === 1 ? "dash_root--headerMinimal" : ""}`}>
        <DashboardHeader
          userName={userName}
          userRole={userRole}
          userError={userLoadError}
          currentPage="Studio"
          titleBarVisible={headerMode === 2}
          headerMinimal={headerMode === 1}
          onToggleTitleBar={() => setHeaderMode(prev => (prev === 0 ? 1 : 0))}
          headerControls={automationHeaderControls}
        />
        <div className="dash_body studio" style={{ flex: 1, overflow: "auto" }}>
          <AutomationView
            automation={activeAutomation.automation}
            sessionId={activeAutomation.sessionId}
            userId={userId}
            teamId={teamId || ""}
            onBack={() => setActiveAutomation(null)}
            onHeaderControls={setAutomationHeaderControls}
          />
        </div>
      </div>
    );
  }

  // ── Troubleshoot view ──
  if (activeTroubleshoot) {
    return (
      <div className={`dash_root ${headerMode === 1 ? "dash_root--headerMinimal" : ""}`}>
        <DashboardHeader
          userName={userName}
          userRole={userRole}
          userError={userLoadError}
          currentPage="Studio"
          titleBarVisible={headerMode === 2}
          headerMinimal={headerMode === 1}
          onToggleTitleBar={() => setHeaderMode(prev => (prev === 0 ? 1 : 0))}
        />
        <div className="dash_body studio" style={{ flex: 1, overflow: "auto" }}>
          <TroubleshootView
            equipment={activeTroubleshoot}
            userId={userId}
            teamId={teamId || ""}
            onBack={() => setActiveTroubleshoot(null)}
          />
        </div>
      </div>
    );
  }

  // ── Practice view ──
  if (activePractice) {
    return (
      <div className={`dash_root ${headerMode === 1 ? "dash_root--headerMinimal" : ""}`}>
        <DashboardHeader
          userName={userName}
          userRole={userRole}
          userError={userLoadError}
          currentPage="Studio"
          titleBarVisible={headerMode === 2}
          headerMinimal={headerMode === 1}
          onToggleTitleBar={() => setHeaderMode(prev => (prev === 0 ? 1 : 0))}
          headerControls={practiceHeaderControls}
        />
        <div className="dash_body studio" style={{ flex: 1, overflow: "auto" }}>
          <PracticeView
            automation={activePractice.automation}
            sessionId={activePractice.sessionId}
            userId={userId}
            teamId={teamId || ""}
            progress={userProgress[activePractice.automation.id]}
            onBack={() => setActivePractice(null)}
            onProgressUpdate={handleProgressUpdate}
            onRestart={handleRestartPractice}
            onHeaderControls={setPracticeHeaderControls}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`dash_root ${headerMode === 1 ? "dash_root--headerMinimal" : ""}`}>
      <DashboardHeader
        userName={userName}
        userRole={userRole}
        userError={userLoadError}
        currentPage="Studio"
        titleBarVisible={headerMode === 2}
        headerMinimal={headerMode === 1}
        onToggleTitleBar={() => setHeaderMode(prev => (prev === 0 ? 1 : 0))}
      />

      {/* Main content */}
      <div className="dash_body studio" style={{ flex: 1, overflow: "auto" }}>
        <div className="studio__inner">

          {/* 1. Header */}
          <div className="studio__topBar">
            <h1 className="studio__title">Practice Room</h1>
          </div>

          {/* 2. Practice cards — carousel */}
          {dataLoading ? (
            <div className="studio__actions" style={{ justifyContent: "center", display: "flex", padding: "24px 0" }}>
              <Loader2 size={22} className="animate-spin" style={{ color: "#9ca3af" }} />
            </div>
          ) : activePractices.length > 0 ? (
            <div className="studio_carouselWrap">
              {carouselOffset > 0 && (
                <button
                  type="button"
                  className="studio_carouselArrow studio_carouselArrow--left"
                  onClick={() => setCarouselOffset(prev => Math.max(0, prev - 1))}
                  aria-label="Previous practices"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}

              <div className="studio_carouselViewport">
                <div
                  className="studio_carouselTrack"
                  style={{ transform: `translateX(-${carouselOffset * (100 / CARDS_VISIBLE)}%)` }}
                >
                  {activePractices.map((p, idx) => {
                    const Icon = practiceIcons[idx % practiceIcons.length];
                    const iconStyle = practiceIconStyles[idx % practiceIconStyles.length];
                    const prog = userProgress[p.id];
                    const steps = parseSteps(p.md_content);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="studio__actionCard"
                        onClick={() => handleStartPractice(p)}
                      >
                        <span className={`studio__actionIcon ${iconStyle}`}>
                          <Icon className="w-5 h-5" />
                        </span>
                        <div className="studio__actionText">
                          <span className="studio__actionTitle">{p.title}</span>
                          <span className="studio__actionSub">
                            {prog?.status === "in_progress"
                              ? `Step ${(prog.current_step ?? 0) + 1}/${steps.length || "?"} — In progress`
                              : p.description || `${p.difficulty} · ${steps.length} steps`}
                          </span>
                        </div>
                        {prog?.status === "in_progress" && (
                          <span className="studio__statusDot studio__statusDot--active" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {carouselOffset + CARDS_VISIBLE < activePractices.length && (
                <button
                  type="button"
                  className="studio_carouselArrow studio_carouselArrow--right"
                  onClick={() => setCarouselOffset(prev => Math.min(activePractices.length - CARDS_VISIBLE, prev + 1))}
                  aria-label="Next practices"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <div className="studio__actions" style={{ justifyContent: "center", display: "flex", padding: "16px 0" }}>
              <span style={{ color: "#9ca3af", fontSize: "13.5px" }}>No practices available yet.</span>
            </div>
          )}

          {/* 3. Tabs */}
          <div className="studio__tabs">
            <div className="studio__tabList">
              <button type="button" className={`studio__tab ${activeTab === "modules" ? "is-active" : ""}`} onClick={() => setActiveTab("modules")}>Modules</button>
              <button type="button" className={`studio__tab ${activeTab === "progress" ? "is-active" : ""}`} onClick={() => setActiveTab("progress")}>Progress</button>
              <button type="button" className={`studio__tab ${activeTab === "analytics" ? "is-active" : ""}`} onClick={() => setActiveTab("analytics")}>Analytics</button>
              <button type="button" className={`studio__tab ${activeTab === "equipment" ? "is-active" : ""}`} onClick={() => setActiveTab("equipment")}>Equipment</button>
            </div>
            <a href="#" className="studio__tabLink" onClick={(e) => e.preventDefault()}>
              <Sparkles size={13} />
              Your Essentials
            </a>
          </div>

          {/* ── Tab: Modules ── */}
          {activeTab === "modules" && (<>

          {/* 4. Search bar */}
          <div className="studio__searchRow">
            <div className="studio__searchInput">
              <Search size={16} className="studio__searchIcon" />
              <input
                type="text"
                placeholder="Search modules and projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button type="button" className="studio__createBtn" onClick={() => setModalOpen("automation")}>
              <Plus size={16} />
              New Automation
            </button>
            <div className="studio__viewToggles">
              <button type="button" className={`studio__viewBtn ${viewMode === "grid" ? "is-active" : ""}`} title="Grid view" onClick={() => setViewMode("grid")}>
                <LayoutGrid size={18} />
              </button>
              <button type="button" className={`studio__viewBtn ${viewMode === "list" ? "is-active" : ""}`} title="List view" onClick={() => setViewMode("list")}>
                <List size={18} />
              </button>
            </div>
          </div>

          {/* Automations — Grid view */}
          {viewMode === "grid" && (
            <div className="studio__grid">
              {filteredAutomations.length === 0 && !dataLoading && (
                <div className="studio__emptyState" style={{ gridColumn: "1 / -1", padding: "48px 24px" }}>
                  <FileText size={36} style={{ color: "#d1d5db", marginBottom: 12 }} />
                  <h3 className="studio__emptyTitle">No automations yet</h3>
                  <p className="studio__emptySub">Create your first automation to get started.</p>
                  <button type="button" className="studio__createBtn" style={{ marginTop: 16 }} onClick={() => setModalOpen("automation")}>
                    <Plus size={16} />
                    New Automation
                  </button>
                </div>
              )}
              {filteredAutomations.map((a) => (
                <button key={a.id} type="button" className="studio__bookCard" onClick={() => handleStartAutomation(a)}>
                  <div className="studio__bookThumb">
                    <div className="studio__bookCover">
                      <span className="studio__coverTitle">{a.title}</span>
                      <span className="studio__coverSub">{a.description || a.difficulty}</span>
                    </div>
                    <span className="studio__bookBadge">
                      <span className={`studio__badgeDot ${userProgress[a.id]?.status === "completed" ? "" : userProgress[a.id]?.status === "in_progress" ? "" : "studio__badgeDot--draft"}`} />
                      {userProgress[a.id]?.status === "completed" ? "Completed" : userProgress[a.id]?.status === "in_progress" ? "Active" : "Draft"}
                    </span>
                  </div>
                  <div className="studio__bookInfo">
                    <FileText size={14} className="studio__bookIcon" />
                    <div className="studio__bookMeta">
                      <span className="studio__bookTitle">{a.title}</span>
                      <span className="studio__bookDate">{timeAgo(a.created_at)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Automations — List view */}
          {viewMode === "list" && (
            <div className="studio__listView">
              <div className="studio__listHeader">
                <span className="studio__listHeaderCell studio__listHeaderCell--title">Title</span>
                <span className="studio__listHeaderCell studio__listHeaderCell--created">Created</span>
                <span className="studio__listHeaderCell studio__listHeaderCell--status">Status</span>
                <span className="studio__listHeaderCell studio__listHeaderCell--actions" />
              </div>

              {filteredAutomations.length === 0 && !dataLoading && (
                <div style={{ padding: "32px 16px", textAlign: "center", color: "#9ca3af", fontSize: "13.5px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <span>No automations found.</span>
                  <button type="button" className="studio__createBtn" onClick={() => setModalOpen("automation")}>
                    <Plus size={16} />
                    New Automation
                  </button>
                </div>
              )}

              {filteredAutomations.map((a) => {
                const status = userProgress[a.id]?.status;
                return (
                  <div key={a.id} className="studio__listRow" onClick={() => handleStartAutomation(a)} style={{ cursor: "pointer" }}>
                    <div className="studio__listCell studio__listCell--title">
                      <FileText size={14} className="studio__listDocIcon" />
                      <span>{a.title}</span>
                    </div>
                    <div className="studio__listCell studio__listCell--created">{timeAgo(a.created_at)}</div>
                    <div className="studio__listCell studio__listCell--status">
                      <span className={`studio__listBadge ${status === "in_progress" || status === "completed" ? "studio__listBadge--active" : "studio__listBadge--draft"}`}>
                        <span className={`studio__badgeDot ${status === "in_progress" || status === "completed" ? "" : "studio__badgeDot--draft"}`} />
                        {status === "completed" ? "Completed" : status === "in_progress" ? "Active" : "Draft"}
                      </span>
                    </div>
                    <div className="studio__listCell studio__listCell--actions">
                      <button type="button" className="studio__listActionBtn"><Info size={15} /></button>
                      <button type="button" className="studio__listActionBtn"><MoreHorizontal size={15} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          </>)}

          {/* ── Tab: Progress ── */}
          {activeTab === "progress" && (
            <div className="studio__progressTab">
              {automations.filter(a => userProgress[a.id]).length === 0 ? (
                <div className="studio__emptyState">
                  <ChartBarIcon className="studio__emptyIcon" />
                  <h3 className="studio__emptyTitle">No progress yet</h3>
                  <p className="studio__emptySub">Start a practice or automation to track your progress here.</p>
                </div>
              ) : (
                <div className="studio__progressList">
                  {automations.filter(a => userProgress[a.id]).map((a, idx) => {
                    const prog = userProgress[a.id];
                    const steps = parseSteps(a.md_content);
                    const totalSteps = steps.length || 1;
                    const currentStep = prog.current_step ?? 0;
                    const clampedStep = Math.min(currentStep + 1, totalSteps);
                    const pct = prog.status === "completed" ? 100 : Math.round((clampedStep / totalSteps) * 100);
                    const isPractice = a.type === "practice";
                    const PIcon = isPractice ? practiceIcons[idx % practiceIcons.length] : null;
                    return (
                      <div key={a.id} className="studio__progressItem studio__progressItem--withIcon">
                        <span className="studio__actionIcon studio__actionIcon--purple studio__progressItemIcon">
                          {PIcon ? <PIcon className="w-5 h-5" /> : <FileText size={18} />}
                        </span>
                        <div className="studio__progressItemContent">
                          <div className="studio__progressItemTop">
                            <span className="studio__progressItemTitle">{a.title}</span>
                            <span className={`studio__progressItemStatus studio__progressItemStatus--${prog.status === "completed" ? "done" : prog.status === "in_progress" ? "active" : "paused"}`}>
                              {prog.status === "completed" ? "Completed" : prog.status === "in_progress" ? "In progress" : "Paused"}
                            </span>
                          </div>
                          <div className="studio__progressItemBar">
                            <div className="studio__progressItemFill" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="studio__progressItemMeta">
                            <span>{steps.length > 0 ? `Step ${clampedStep} / ${totalSteps}` : `${pct}%`}</span>
                            <span className={`studio__typeBadge ${isPractice ? "studio__typeBadge--practice" : "studio__typeBadge--automation"}`}>
                              {isPractice ? "Practice" : "Automation"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Analytics ── */}
          {activeTab === "analytics" && (
            <div className="studio__emptyState">
              <PresentationChartLineIcon className="studio__emptyIcon" />
              <h3 className="studio__emptyTitle">Analytics Dashboard</h3>
              <p className="studio__emptySub">Coming soon — monitor performance metrics and insights.</p>
            </div>
          )}

          {/* ── Tab: Equipment ── */}
          {activeTab === "equipment" && (
            <EquipmentTab
              userId={userId}
              teamId={teamId || ""}
              onStartTroubleshoot={(eq) => setActiveTroubleshoot(eq)}
            />
          )}

        </div>
      </div>

      {/* Studio Modal */}
      {modalOpen && (
        <StudioModal
          type={modalOpen}
          onClose={() => setModalOpen(null)}
          onSubmit={modalOpen === "automation" ? handleNewAutomation : (data) => {
            console.log("[Studio] Add equipment:", data);
            setModalOpen(null);
          }}
        />
      )}
    </div>
  );
}
