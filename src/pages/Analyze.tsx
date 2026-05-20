// src/pages/Config.tsx — Analysis page with real Supabase data + embedded chat
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Menu, Plus, Search, BarChart2, Pencil, Trash2, ChevronLeft, ChevronRight, Printer, X, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getAnalysisIcon, hashToIconName } from "../lib/analysisIcons";
import { useThinking } from "../context/Thinkingcontext";
import { useAgentChat } from "../components/useAgentChat";
import type { AgentEvent } from "../components/useAgentChat";
import {
  InlineEventRun,
  type TimelineEvent,
  type EventRun,
} from "../components/ChatComponents";
import { AnalysisChartRenderer } from "../components/AnalysisChartRenderer";
import "../styles/analysis-ui.css";
import "../styles/dashboard-ui.css";

const PmTrackerPanel = lazy(() => import("../components/PmTrackerPanel"));
const EquipmentQueuePanel = lazy(() => import("../components/EquipmentQueuePanel"));

// ── Set to false to permanently disable the 3D Queue announcement ──
const SHOW_3DQUEUE_NOTIF = true;

const ROOT_COLLAPSED_CLASS = "cora-sidebar-collapsed";
const LS_KEY = "cora.sidebarCollapsed";
const AGENT_API_URL = import.meta.env.VITE_AGENT_API_URL || "https://sentinela-909652673285.us-central1.run.app";

// ============================================================================
// TYPES
// ============================================================================

interface AnalysisTemplate {
  id: string;
  name: string;
  description: string;
  template_type: string;
  icon_name: string;
  config: Record<string, unknown>;
}

interface AnalysisSession {
  id: string;
  title: string;
  description: string;
  iconName: string;
  authorName: string;
  auth_user_id: string;
  createdAt: string;
  updatedAt: string;
  lastUserMessage: string | null;
  templateType: string | null;
  templateId: string | null;
  templateConfig: Record<string, unknown> | null;
}

// ============================================================================
// HELPERS
// ============================================================================

async function loadUserProfile(user: any): Promise<{ name: string; role: string | null; teamId: string | null }> {
  if (!user) return { name: "", role: null, teamId: null };

  let baseName = user.email?.split("@")[0] ?? "";
  let role: string | null = null;
  let teamId: string | null = null;

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, active_team_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileData?.full_name) {
    const parts = profileData.full_name.trim().split(/\s+/);
    baseName = parts[0] || baseName;
  }

  teamId = profileData?.active_team_id ?? null;

  if (teamId) {
    const { data: membershipData } = await supabase
      .from("team_memberships")
      .select("role")
      .eq("auth_user_id", user.id)
      .eq("team_id", teamId)
      .maybeSingle();

    if (membershipData?.role) {
      role = membershipData.role;
    }
  }

  return { name: baseName, role, teamId };
}

function renderSessionIcon(iconName: string) {
  const Icon = getAnalysisIcon(iconName);
  return <Icon size={20} strokeWidth={1.5} />;
}

// ============================================================================
// ICONS
// ============================================================================

// ============================================================================
// ANALYSIS HEADER
// ============================================================================

interface AnalysisHeaderProps {
  userName: string;
  userRole: string;
  userError: string | null;
}

function AnalysisHeader({ userName, userRole, userError }: AnalysisHeaderProps) {
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
  const displayRole = userRole || null;

  return (
    <>
      <header className="analysis_header">
        <div className="analysis_headerLeft">
          <button type="button" onClick={toggleSidebar} className="analysis_menuBtn" aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <Menu size={18} />
          </button>
          <div className="analysis_headerDivider" />
          <div className="analysis_userInfo">
            <span className="analysis_pageName">Analysis</span>
            <span className="analysis_pathSeparator">/</span>
            <span className="analysis_userName">{displayName}</span>
            {displayRole && (
              <>
                <span className="analysis_userSeparator">/</span>
                <span className="analysis_userRole">{displayRole}</span>
              </>
            )}
          </div>
          {userError && <span className="analysis_userError">({userError})</span>}
        </div>

        <div className="analysis_headerRight">
          <button type="button" className="analysis_headerBtn">Feedback</button>
        </div>
      </header>
    </>
  );
}

// (CreateAnalysisModal removed — inline form in right panel instead)

// ============================================================================
// ANALYSIS CARD
// ============================================================================

interface CardProps {
  session: AnalysisSession;
  isSelected: boolean;
  isDeleting: boolean;
  currentUserId: string | null;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

function AnalysisCardItem({ session, isSelected, isDeleting, currentUserId, onClick, onEdit, onDelete, onConfirmDelete, onCancelDelete }: CardProps) {
  return (
    <button
      type="button"
      className={`analysis_card ${isSelected ? "analysis_card--selected" : ""}`}
      onClick={onClick}
    >
      <div className="analysis_cardHeader">
        <div className="analysis_cardIcon">
          {renderSessionIcon(session.iconName)}
        </div>
        <span className="analysis_cardTitle">{session.title}</span>
        {isSelected && (
          <div className="analysis_cardCheck">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
      </div>
      <p className="analysis_cardDesc">
        {(() => {
          const desc = session.lastUserMessage || session.description || "No messages yet";
          return desc.length > 60 ? desc.slice(0, 60) + "..." : desc;
        })()}
      </p>
      <div className="analysis_cardAuthor">
        <div className="analysis_cardAuthorAvatar">
          {session.authorName.charAt(0).toUpperCase()}
        </div>
        <span className="analysis_cardAuthorName">{session.authorName}</span>
        {isDeleting ? (
          <div className="analysis_cardConfirmRow" onClick={(e) => e.stopPropagation()}>
            <span className="analysis_cardConfirmText">Delete?</span>
            <span
              role="button"
              tabIndex={0}
              className="analysis_cardConfirmYes"
              onClick={(e) => { e.stopPropagation(); onConfirmDelete(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onConfirmDelete(); } }}
            >
              Yes
            </span>
            <span
              role="button"
              tabIndex={0}
              className="analysis_cardConfirmNo"
              onClick={(e) => { e.stopPropagation(); onCancelDelete(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onCancelDelete(); } }}
            >
              No
            </span>
          </div>
        ) : (
          <div className="analysis_cardActions">
            {session.auth_user_id === currentUserId && (
              <span
                role="button"
                tabIndex={0}
                className="analysis_cardActionBtn"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onEdit(); } }}
              >
                <Pencil size={14} />
              </span>
            )}
            {session.auth_user_id === currentUserId && (
              <span
                role="button"
                tabIndex={0}
                className="analysis_cardActionBtn"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onDelete(); } }}
              >
                <Trash2 size={14} />
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// ============================================================================
// MAIN ANALYSIS PAGE
// ============================================================================

export default function Analysis() {
  // User state
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [userLoadError, setUserLoadError] = useState<string | null>(null);

  // Sessions from Supabase
  const [analysisSessions, setAnalysisSessions] = useState<AnalysisSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Selected session & results
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [analysisPrompt, setAnalysisPrompt] = useState<string | null>(null);
  const [latestResponse, setLatestResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // One-time notification per user
  const [showQueueNotif, setShowQueueNotif] = useState(false);
  useEffect(() => {
    if (!userId) return;
    const key = `orion_notif_3dqueue_${userId}`;
    if (SHOW_3DQUEUE_NOTIF && !localStorage.getItem(key)) {
      const t = setTimeout(() => setShowQueueNotif(true), 800);
      return () => clearTimeout(t);
    }
  }, [userId]);
  const dismissQueueNotif = () => {
    setShowQueueNotif(false);
    if (userId) localStorage.setItem(`orion_notif_3dqueue_${userId}`, "1");
  };

  // Event runs (same pattern as Dashboard)
  const [eventRuns, setEventRuns] = useState<Record<string, EventRun>>({});
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const lastResponseRef = useRef<string>("");

  // Team members (for visibility / participant picker)
  type TeamMemberLite = { auth_user_id: string; full_name: string; email?: string | null };
  const [teamMembers, setTeamMembers] = useState<TeamMemberLite[]>([]);

  // Create form (inline in right panel)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createVisibility, setCreateVisibility] = useState<"private" | "team" | "shared">("private");
  const [createParticipantIds, setCreateParticipantIds] = useState<string[]>([]);
  const [showTeammatePicker, setShowTeammatePicker] = useState(false);

  // Edit form
  const [showEditForm, setShowEditForm] = useState(false);
  const [editSessionId, setEditSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editFirstMsgId, setEditFirstMsgId] = useState<string | null>(null);
  const [editVisibility, setEditVisibility] = useState<"private" | "team" | "shared">("private");
  const [editParticipantIds, setEditParticipantIds] = useState<string[]>([]);
  const [showEditTeammatePicker, setShowEditTeammatePicker] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Left panel collapse
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  // Templates
  const [templates, setTemplates] = useState<AnalysisTemplate[]>([]);
  const [createTemplateId, setCreateTemplateId] = useState<string | null>(null);

  // Thinking context
  const { setIsThinking } = useThinking();

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keep activeRunIdRef in sync
  useEffect(() => { activeRunIdRef.current = activeRunId; }, [activeRunId]);

  // ── useAgentChat ──
  const {
    sendMessage: sendToAgent,
  } = useAgentChat({
    apiUrl: AGENT_API_URL,
    userId: userId || undefined,
    userName: userName || "Usuario",
    sessionId: selectedSessionId || undefined,
    interactionMode: "analysis",
    onEvent: (evt: AgentEvent) => {
      if (evt.type === "tokens") return;

      const timelineEvt: TimelineEvent = {
        id: crypto.randomUUID(),
        node: evt.source.toUpperCase().replace("_NODE", "").replace("_", " "),
        message: evt.content,
        timestamp: evt.timestamp,
      };

      setEventRuns((prev) => {
        const runId = activeRunIdRef.current;
        if (!runId || !prev[runId]) return prev;
        return {
          ...prev,
          [runId]: { ...prev[runId], events: [...prev[runId].events, timelineEvt] },
        };
      });
    },
    onResponse: (responseContent: string) => {
      if (lastResponseRef.current === responseContent) return;
      lastResponseRef.current = responseContent;

      // Replace latest response (not append)
      setLatestResponse(responseContent);

      // Persist AI message to Supabase
      if (userId && selectedSessionId) {
        supabase.schema("chat").from("messages").insert({
          id: crypto.randomUUID(),
          session_id: selectedSessionId,
          auth_user_id: userId,
          sender: "ai",
          content: responseContent,
        }).then(({ error: err }) => {
          if (err) console.error("[AI Msg] Insert failed:", err);
        });
      }

      setIsLoading(false);
      setIsThinking(false);

      // Mark event run as done
      setEventRuns((prev) => {
        const runId = activeRunIdRef.current;
        if (!runId || !prev[runId]) return prev;
        return { ...prev, [runId]: { ...prev[runId], status: "done", isExpanded: false } };
      });
      setActiveRunId(null);
    },
    onError: (errMsg: string) => {
      console.error("Agent error:", errMsg);
      setLatestResponse(`Error connecting to agent: ${errMsg}`);
      setIsLoading(false);
      setIsThinking(false);

      setEventRuns((prev) => {
        const runId = activeRunIdRef.current;
        if (!runId || !prev[runId]) return prev;
        return { ...prev, [runId]: { ...prev[runId], status: "done", isExpanded: false } };
      });
      setActiveRunId(null);
    },
    onStreamEnd: () => {
      // Refetch token balance could go here
    },
  });

  // ── Load templates (table may not exist yet — fail silently) ──
  useEffect(() => {
    supabase
      .schema("chat")
      .from("analysis_templates")
      .select("*")
      .order("created_at")
      .then(({ data, error }) => {
        if (error) {
          // Table doesn't exist yet or other transient error — silently skip
          setTemplates([]);
          return;
        }
        if (data && data.length > 0) {
          setTemplates(data as AnalysisTemplate[]);
          setCreateTemplateId(data[0].id);
        }
      });
  }, []);

  // ── Load user data ──
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          setUserLoadError("Not logged in");
          setUserName("User");
          return;
        }
        setUserId(user.id);
        console.log("[Analysis] Auth user id:", user.id);

        const profile = await loadUserProfile(user);
        console.log("[Analysis] Profile loaded — name:", profile.name, "role:", profile.role, "teamId:", profile.teamId);
        if (profile.name) setUserName(profile.name);
        if (profile.role) setUserRole(profile.role);
        if (profile.teamId) setTeamId(profile.teamId);
      } catch (err) {
        console.error("Failed to load user", err);
        setUserLoadError("Failed to load");
        setUserName("User");
      }
    };
    loadUser();
  }, []);

  // ── Load analysis sessions from Supabase ──
  const fetchSessions = useCallback(async () => {
    if (!userId || !teamId) {
      console.log("[Analysis] fetchSessions skipped — userId:", userId, "teamId:", teamId);
      return;
    }
    setSessionsLoading(true);
    console.log("[Analysis] Fetching sessions for teamId:", teamId, "userId:", userId);

    try {
      const { data: sessions, error: sessErr } = await supabase
        .schema("chat")
        .from("sessions")
        .select("id, title, created_at, updated_at, auth_user_id, template_id, visibility, participant_ids, icon_name")
        .eq("chat_mode", "analysis")
        .eq("status", "active")
        .eq("team_id", teamId)
        .or(`visibility.eq.team,auth_user_id.eq.${userId},participant_ids.cs.{${userId}}`)
        .order("updated_at", { ascending: false });

      console.log("[Analysis] Query result — sessions:", sessions, "error:", sessErr);

      if (sessErr) throw sessErr;
      if (!sessions || sessions.length === 0) {
        console.log("[Analysis] No sessions found for team:", teamId);
        setAnalysisSessions([]);
        setSessionsLoading(false);
        return;
      }

      // Fetch template info for sessions that have a template_id (fail silently)
      const sessionTemplateIds = [
        ...new Set(
          sessions
            .map((s: any) => s.template_id)
            .filter(Boolean) as string[],
        ),
      ];
      const tplMap: Record<string, { template_type: string; icon_name: string; config: Record<string, unknown> }> = {};
      if (sessionTemplateIds.length > 0) {
        const { data: tplRows } = await supabase
          .schema("chat")
          .from("analysis_templates")
          .select("id, template_type, icon_name, config")
          .in("id", sessionTemplateIds);
        for (const t of tplRows ?? []) {
          tplMap[t.id] = { template_type: t.template_type, icon_name: t.icon_name, config: t.config ?? {} };
        }
      }

      // Fetch last user message for each session + author names
      const authUserIds = [...new Set(sessions.map((s: any) => s.auth_user_id))];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("auth_user_id, full_name")
        .in("auth_user_id", authUserIds);

      const nameMap: Record<string, string> = {};
      for (const p of profiles || []) {
        const parts = (p.full_name || "").trim().split(/\s+/);
        nameMap[p.auth_user_id] = parts[0] || "Unknown";
      }

      // Fetch last user message per session
      const mapped: AnalysisSession[] = [];
      for (const s of sessions) {
        const { data: lastMsg } = await supabase
          .schema("chat")
          .from("messages")
          .select("content")
          .eq("session_id", s.id)
          .eq("sender", "user")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const tid = (s as any).template_id ?? null;
        const tpl = tid ? tplMap[tid] ?? null : null;
        mapped.push({
          id: s.id,
          title: s.title || "Untitled Analysis",
          description: "",
          iconName: (s as { icon_name?: string | null }).icon_name || hashToIconName(s.id),
          authorName: nameMap[s.auth_user_id] || "Unknown",
          auth_user_id: s.auth_user_id,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          lastUserMessage: lastMsg?.content || null,
          templateType: tpl?.template_type ?? null,
          templateId: tid,
          templateConfig: tpl?.config ?? null,
        });
      }

      setAnalysisSessions(mapped);
    } catch (err) {
      console.error("Failed to load analysis sessions:", err);
    } finally {
      setSessionsLoading(false);
    }
  }, [userId, teamId]);

  useEffect(() => {
    if (userId && teamId) fetchSessions();
  }, [userId, teamId, fetchSessions]);

  // ── Load team members (for visibility / participant picker) ──
  useEffect(() => {
    if (!teamId || !userId) return;
    let cancelled = false;
    (async () => {
      const { data: memberships } = await supabase
        .from("team_memberships")
        .select("auth_user_id")
        .eq("team_id", teamId);
      const ids = (memberships ?? [])
        .map((m: any) => m.auth_user_id as string)
        .filter((id) => id && id !== userId);
      if (ids.length === 0) {
        if (!cancelled) setTeamMembers([]);
        return;
      }
      const { data: profs } = await supabase
        .from("profiles")
        .select("auth_user_id, full_name, email")
        .in("auth_user_id", ids);
      if (!cancelled) {
        setTeamMembers(
          (profs ?? []).map((p: any) => ({
            auth_user_id: p.auth_user_id,
            full_name: p.full_name || (p.email ?? "Unknown"),
            email: p.email,
          })),
        );
      }
    })();
    return () => { cancelled = true; };
  }, [teamId, userId]);

  // ── Load session data: first user message (prompt) + latest AI response ──
  const loadSessionData = useCallback(async (sessionId: string) => {
    try {
      // Fetch first user message (the analysis prompt/description)
      const { data: firstMsg } = await supabase
        .schema("chat")
        .from("messages")
        .select("content")
        .eq("session_id", sessionId)
        .eq("sender", "user")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      setAnalysisPrompt(firstMsg?.content || null);

      // Fetch latest AI response
      const { data: lastAi } = await supabase
        .schema("chat")
        .from("messages")
        .select("content")
        .eq("session_id", sessionId)
        .eq("sender", "ai")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setLatestResponse(lastAi?.content || null);
      setEventRuns({});
      setActiveRunId(null);
    } catch (err) {
      console.error("Failed to load session data:", err);
    }
  }, []);

  // ── Select a session ──
  const handleSelectSession = (id: string) => {
    setSelectedSessionId(id);
    setShowCreateForm(false);
    lastResponseRef.current = "";
    loadSessionData(id);
  };

  // ── Run Analysis: re-send the prompt to the agent ──
  const handleRunAnalysis = async () => {
    if (!analysisPrompt || isLoading || !selectedSessionId || !userId) return;

    const runId = crypto.randomUUID();

    // Persist user message to Supabase (each run creates a new user message)
    const { error: msgErr } = await supabase.schema("chat").from("messages").insert({
      id: runId,
      session_id: selectedSessionId,
      auth_user_id: userId,
      sender: "user",
      content: analysisPrompt,
      pasted_contents: [],
    });
    if (msgErr) console.error("[RunAnalysis] Failed to insert user message:", msgErr);

    // Create event run for loading UI
    setEventRuns({
      [runId]: {
        id: runId,
        userMessageId: runId,
        events: [],
        status: "streaming",
        isExpanded: true,
      },
    });
    setActiveRunId(runId);
    setIsLoading(true);
    setIsThinking(true);
    lastResponseRef.current = "";

    // Send to agent
    sendToAgent(analysisPrompt);
  };

  // ── Start from blank — create session immediately ──
  const handleStartFromBlank = async () => {
    if (!userId || !teamId) return;

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error } = await supabase.schema("chat").from("sessions").insert({
      id: newId,
      auth_user_id: userId,
      team_id: teamId,
      title: "New Analysis",
      chat_mode: "analysis",
      status: "active",
    });

    if (error) {
      console.error("Failed to create blank session:", error);
      return;
    }

    const newSession: AnalysisSession = {
      id: newId,
      title: "New Analysis",
      description: "",
      iconName: hashToIconName(newId),
      authorName: userName || "User",
      auth_user_id: userId ?? "",
      createdAt: now,
      updatedAt: now,
      lastUserMessage: null,
      templateType: null,
      templateId: null,
      templateConfig: null,
    };

    setAnalysisSessions((prev) => [newSession, ...prev]);
    setSelectedSessionId(newId);
    setAnalysisPrompt(null);
    setLatestResponse(null);
    setEventRuns({});
    setActiveRunId(null);
    lastResponseRef.current = "";
  };

  // ── Create analysis from inline form ──
  const handleCreateAnalysis = async () => {
    if (!userId || !teamId) return;

    const title = createTitle.trim() || "Untitled Analysis";
    const description = createDescription.trim();

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    // 1. Create session — only send template_id if the templates table exists
    const sessionPayload: Record<string, unknown> = {
      id: newId,
      auth_user_id: userId,
      team_id: teamId,
      title,
      chat_mode: "analysis",
      status: "active",
      visibility: createVisibility,
      participant_ids: createVisibility === "shared" ? createParticipantIds : [],
    };
    if (templates.length > 0 && createTemplateId) {
      sessionPayload.template_id = createTemplateId;
    }
    const { error } = await supabase.schema("chat").from("sessions").insert(sessionPayload);

    if (error) {
      console.error("Failed to create analysis:", error);
      return;
    }

    // 2. Insert description as first user message (if provided)
    if (description) {
      const { error: msgErr } = await supabase.schema("chat").from("messages").insert({
        id: crypto.randomUUID(),
        session_id: newId,
        auth_user_id: userId,
        sender: "user",
        content: description,
        pasted_contents: [],
      });
      if (msgErr) console.error("[CreateAnalysis] Failed to insert first message:", msgErr);
    }

    // 3. Add card to left panel
    const chosenTemplate = templates.find((t) => t.id === createTemplateId) ?? null;
    const newSession: AnalysisSession = {
      id: newId,
      title,
      description: "",
      iconName: hashToIconName(newId),
      authorName: userName || "User",
      auth_user_id: userId ?? "",
      createdAt: now,
      updatedAt: now,
      lastUserMessage: description || null,
      templateType: chosenTemplate?.template_type ?? null,
      templateId: createTemplateId ?? null,
      templateConfig: chosenTemplate?.config ?? null,
    };

    setAnalysisSessions((prev) => [newSession, ...prev]);

    // 4. Select session and show results panel (don't auto-run)
    setSelectedSessionId(newId);
    setAnalysisPrompt(description || null);
    setLatestResponse(null);
    setEventRuns({});
    setActiveRunId(null);
    lastResponseRef.current = "";

    // Reset form
    setCreateTitle("");
    setCreateDescription("");
    setCreateVisibility("private");
    setCreateParticipantIds([]);
    setShowTeammatePicker(false);
    setShowCreateForm(false);
  };

  // ── Cancel create form ──
  const handleCancelCreate = () => {
    setCreateTitle("");
    setCreateDescription("");
    setCreateVisibility("private");
    setCreateParticipantIds([]);
    setShowTeammatePicker(false);
    setShowCreateForm(false);
  };

  // ── Edit analysis: open form pre-filled ──
  const handleEditSession = async (sessionId: string) => {
    const session = analysisSessions.find((s) => s.id === sessionId);
    if (!session) return;

    // Fetch last user message (the most recent prompt sent to the agent)
    const { data: lastMsg } = await supabase
      .schema("chat")
      .from("messages")
      .select("id, content")
      .eq("session_id", sessionId)
      .eq("sender", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch visibility + participants
    const { data: sessRow } = await supabase
      .schema("chat")
      .from("sessions")
      .select("visibility, participant_ids")
      .eq("id", sessionId)
      .maybeSingle();

    setEditSessionId(sessionId);
    setEditTitle(session.title);
    setEditDescription(lastMsg?.content || "");
    setEditFirstMsgId(lastMsg?.id || null);
    setEditVisibility((sessRow?.visibility as "private" | "team" | "shared") ?? "private");
    setEditParticipantIds(Array.isArray(sessRow?.participant_ids) ? sessRow.participant_ids : []);
    setShowEditTeammatePicker(false);
    setShowEditForm(true);
    setShowCreateForm(false);
  };

  // ── Save edit ──
  const handleSaveEdit = async () => {
    if (!editSessionId || !userId) return;

    const title = editTitle.trim() || "Untitled Analysis";
    const description = editDescription.trim();

    // Update session title + visibility + participants
    const { error: sessErr } = await supabase
      .schema("chat")
      .from("sessions")
      .update({
        title,
        visibility: editVisibility,
        participant_ids: editVisibility === "shared" ? editParticipantIds : [],
      })
      .eq("id", editSessionId);

    if (sessErr) console.error("[EditAnalysis] Failed to update session:", sessErr);

    // Update or insert first user message
    if (editFirstMsgId) {
      const { error: msgErr } = await supabase
        .schema("chat")
        .from("messages")
        .update({ content: description })
        .eq("id", editFirstMsgId);
      if (msgErr) console.error("[EditAnalysis] Failed to update first message:", msgErr);
    } else if (description) {
      const { error: msgErr } = await supabase.schema("chat").from("messages").insert({
        id: crypto.randomUUID(),
        session_id: editSessionId,
        auth_user_id: userId,
        sender: "user",
        content: description,
        pasted_contents: [],
      });
      if (msgErr) console.error("[EditAnalysis] Failed to insert first message:", msgErr);
    }

    // Update local state
    setAnalysisSessions((prev) =>
      prev.map((s) =>
        s.id === editSessionId
          ? { ...s, title, lastUserMessage: description || s.lastUserMessage }
          : s
      )
    );

    // If this is the selected session, update prompt too
    if (selectedSessionId === editSessionId) {
      setAnalysisPrompt(description || null);
    }

    // Close edit form, go back to results
    setShowEditForm(false);
    setEditSessionId(null);
  };

  // ── Cancel edit ──
  const handleCancelEdit = () => {
    setShowEditForm(false);
    setEditSessionId(null);
  };

  // ── Delete: show inline confirmation ──
  const handleDeleteSession = (sessionId: string) => {
    setDeletingId(sessionId);
  };

  // ── Confirm delete: soft-delete in Supabase ──
  const handleConfirmDelete = async (sessionId: string) => {
    const { error } = await supabase
      .schema("chat")
      .from("sessions")
      .update({ status: "deleted" })
      .eq("id", sessionId);

    if (error) {
      console.error("[DeleteAnalysis] Failed to soft-delete session:", error);
      setDeletingId(null);
      return;
    }

    // Remove from local list
    setAnalysisSessions((prev) => prev.filter((s) => s.id !== sessionId));

    // If this was the selected session, deselect
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(null);
      setAnalysisPrompt(null);
      setLatestResponse(null);
      setEventRuns({});
      setActiveRunId(null);
    }

    // If this was being edited, close edit form
    if (editSessionId === sessionId) {
      setShowEditForm(false);
      setEditSessionId(null);
    }

    setDeletingId(null);
  };

  // ── Cancel delete ──
  const handleCancelDelete = () => {
    setDeletingId(null);
  };

  // Toggle event run expand/collapse
  const handleToggleExpand = (runId: string) => {
    setEventRuns((prev) => {
      if (!prev[runId]) return prev;
      return { ...prev, [runId]: { ...prev[runId], isExpanded: !prev[runId].isExpanded } };
    });
  };

  // Auto-scroll results area
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [latestResponse, eventRuns]);

  // Filtered sessions
  const filteredSessions = analysisSessions.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.lastUserMessage || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get current active event run for loading UI
  const activeRun = activeRunId ? eventRuns[activeRunId] : null;

  // Selected session object
  const selectedSession = analysisSessions.find((s) => s.id === selectedSessionId) || null;

  return (
    <div className="analysis_root">
      <AnalysisHeader
        userName={userName}
        userRole={userRole}
        userError={userLoadError}
      />

      <main
        className={`analysis_content${leftCollapsed && (selectedSession?.templateType === "pm_tracker" || selectedSession?.templateType === "equipment_queue") ? " analysis_content--full" : ""}`}
        style={{
          gridTemplateColumns: leftCollapsed
            ? ((selectedSession?.templateType === "pm_tracker" || selectedSession?.templateType === "equipment_queue") ? "1fr" : "0px 1fr")
            : undefined,
        }}
      >
        {/* Left Panel — Session Cards (hidden entirely for full-screen templates) */}
        {!(leftCollapsed && (selectedSession?.templateType === "pm_tracker" || selectedSession?.templateType === "equipment_queue")) && (
          <div className={`analysis_left${leftCollapsed ? " analysis_left--collapsed" : ""}`}>
            <div className="analysis_leftHeader">
              <div className="analysis_leftHeaderTop">
                <h1 className="analysis_leftTitle">Analysis</h1>
                <button
                  type="button"
                  className="analysis_leftCollapseBtn"
                  onClick={() => setLeftCollapsed(true)}
                  aria-label="Collapse panel"
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>

            <div className="analysis_search">
              <Search size={16} className="analysis_searchIcon" />
              <input
                type="text"
                className="analysis_searchInput"
                placeholder="Search analyses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="analysis_cardList">
              {sessionsLoading ? (
                <div className="analysis_previewEmpty" style={{ padding: 24 }}>
                  <p>Loading sessions...</p>
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="analysis_previewEmpty" style={{ padding: 24 }}>
                  <p>No analyses yet. Create one to get started.</p>
                </div>
              ) : (
                filteredSessions.map((session) => (
                  <AnalysisCardItem
                    key={session.id}
                    session={session}
                    isSelected={selectedSessionId === session.id}
                    isDeleting={deletingId === session.id}
                    currentUserId={userId}
                    onClick={() => handleSelectSession(session.id)}
                    onEdit={() => handleEditSession(session.id)}
                    onDelete={() => handleDeleteSession(session.id)}
                    onConfirmDelete={() => handleConfirmDelete(session.id)}
                    onCancelDelete={handleCancelDelete}
                  />
                ))
              )}
            </div>

            <div className="analysis_leftFooter">
              <button type="button" className="analysis_btnSecondary" onClick={handleStartFromBlank}>
                Start from blank
              </button>
              <button type="button" className="analysis_btnPrimary" onClick={() => { setSelectedSessionId(null); setShowCreateForm(true); }}>
                Create analysis
              </button>
            </div>
          </div>
        )}

        {/* Right Panel — Create Form / Edit Form / Results / Empty */}
        <div className={`analysis_right ${selectedSessionId || showCreateForm || showEditForm ? "analysis_right--active" : ""}${leftCollapsed ? " analysis_right--collapsed" : ""}`}>
          {leftCollapsed && selectedSession?.templateType !== "pm_tracker" && selectedSession?.templateType !== "equipment_queue" && (
            <button
              type="button"
              className="analysis_expandTab"
              onClick={() => setLeftCollapsed(false)}
              aria-label="Expand panel"
            >
              <ChevronRight size={14} />
            </button>
          )}
          {showCreateForm ? (
            /* ── Inline Create Form ── */
            <div className="analysis_createWrapper">
              <div className="analysis_createHeader">
                <div className="analysis_createHeaderIcon">
                  <BarChart2 size={24} strokeWidth={1.5} />
                </div>
                <div className="analysis_createHeaderInfo">
                  <h2 className="analysis_createHeaderTitle">New Analysis</h2>
                  <p className="analysis_createHeaderDesc">Set up your analysis session</p>
                </div>
              </div>

              <div className="analysis_createCard">
                <div className="analysis_createForm">
                  {templates.length > 0 && (
                    <div className="analysis_createField">
                      <label>Template</label>
                      <div className="analysis_templateSelector">
                        {templates.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className={`analysis_templatePill${createTemplateId === t.id ? " analysis_templatePill--selected" : ""}`}
                            onClick={() => setCreateTemplateId(t.id)}
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="analysis_createField">
                    <label htmlFor="create-name">Write a name</label>
                    <input
                      id="create-name"
                      type="text"
                      className="analysis_createInput"
                      placeholder="Enter analysis name..."
                      value={createTitle}
                      onChange={(e) => setCreateTitle(e.target.value)}
                    />
                  </div>

                  <div className="analysis_createField">
                    <label htmlFor="create-desc">A description</label>
                    <textarea
                      id="create-desc"
                      className="analysis_createTextarea"
                      placeholder="Describe what this analysis should explore..."
                      value={createDescription}
                      onChange={(e) => setCreateDescription(e.target.value)}
                      rows={4}
                    />
                  </div>

                  <div className="analysis_createField">
                    <label>Visibility</label>
                    <div className="analysis_visibilityRow">
                      {(["private", "team", "shared"] as const).map((v) => (
                        <button key={v} type="button"
                          className={`analysis_visibilityChip${createVisibility === v ? " is-active" : ""}`}
                          onClick={() => setCreateVisibility(v)}>
                          {v === "private" ? "Solo yo" : v === "team" ? "Todo el equipo" : "Compartido"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {createVisibility === "shared" && (
                    <div className="analysis_createField">
                      <label>Involved teammates</label>
                      <div className="analysis_teammates">
                        {createParticipantIds.map((id) => {
                          const m = teamMembers.find((x) => x.auth_user_id === id);
                          if (!m) return null;
                          return (
                            <span key={id} className="analysis_teammateChip">
                              <span>{m.full_name.split(" ")[0]}</span>
                              <button type="button" className="analysis_teammateChipX"
                                onClick={() => setCreateParticipantIds((prev) => prev.filter((x) => x !== id))}>
                                <X size={11} />
                              </button>
                            </span>
                          );
                        })}
                        <button type="button" className="analysis_addTeammate"
                          onClick={() => setShowTeammatePicker((v) => !v)}>
                          <Plus size={14} />
                          <span>Add teammate</span>
                        </button>
                      </div>
                      {showTeammatePicker && (
                        <div className="analysis_teammatePicker">
                          {teamMembers.length === 0 ? (
                            <div className="analysis_teammatePickerEmpty">No hay otros miembros en el equipo</div>
                          ) : (
                            teamMembers.map((m) => {
                              const selected = createParticipantIds.includes(m.auth_user_id);
                              return (
                                <button key={m.auth_user_id} type="button"
                                  className={`analysis_teammatePickerItem${selected ? " is-selected" : ""}`}
                                  onClick={() => setCreateParticipantIds((prev) =>
                                    prev.includes(m.auth_user_id)
                                      ? prev.filter((x) => x !== m.auth_user_id)
                                      : [...prev, m.auth_user_id])}>
                                  <span>{m.full_name}</span>
                                  {selected && <Check size={13} />}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="analysis_createFooter">
                  <span className="analysis_createMeta">
                    Created by {userName || "User"} &bull; {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <div className="analysis_createActions">
                    <button type="button" className="analysis_btnCancel" onClick={handleCancelCreate}>
                      Cancel
                    </button>
                    <button type="button" className="analysis_btnSave" onClick={handleCreateAnalysis}>
                      Create
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : showEditForm ? (
            /* ── Inline Edit Form ── */
            <div className="analysis_createWrapper">
              <div className="analysis_createHeader">
                <div className="analysis_createHeaderIcon">
                  <Pencil size={24} strokeWidth={1.5} />
                </div>
                <div className="analysis_createHeaderInfo">
                  <h2 className="analysis_createHeaderTitle">Edit Analysis</h2>
                  <p className="analysis_createHeaderDesc">Update the name and task description</p>
                </div>
              </div>

              <div className="analysis_createCard">
                <div className="analysis_createForm">
                  <div className="analysis_createField">
                    <label htmlFor="edit-name">Write a name</label>
                    <input
                      id="edit-name"
                      type="text"
                      className="analysis_createInput"
                      placeholder="Enter analysis name..."
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </div>

                  <div className="analysis_createField">
                    <label htmlFor="edit-desc">A description</label>
                    <textarea
                      id="edit-desc"
                      className="analysis_createTextarea"
                      placeholder="Describe what this analysis should explore..."
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={4}
                    />
                  </div>

                  <div className="analysis_createField">
                    <label>Visibility</label>
                    <div className="analysis_visibilityRow">
                      {(["private", "team", "shared"] as const).map((v) => (
                        <button key={v} type="button"
                          className={`analysis_visibilityChip${editVisibility === v ? " is-active" : ""}`}
                          onClick={() => setEditVisibility(v)}>
                          {v === "private" ? "Solo yo" : v === "team" ? "Todo el equipo" : "Compartido"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {editVisibility === "shared" && (
                    <div className="analysis_createField">
                      <label>Involved teammates</label>
                      <div className="analysis_teammates">
                        {editParticipantIds.map((id) => {
                          const m = teamMembers.find((x) => x.auth_user_id === id);
                          if (!m) return null;
                          return (
                            <span key={id} className="analysis_teammateChip">
                              <span>{m.full_name.split(" ")[0]}</span>
                              <button type="button" className="analysis_teammateChipX"
                                onClick={() => setEditParticipantIds((prev) => prev.filter((x) => x !== id))}>
                                <X size={11} />
                              </button>
                            </span>
                          );
                        })}
                        <button type="button" className="analysis_addTeammate"
                          onClick={() => setShowEditTeammatePicker((v) => !v)}>
                          <Plus size={14} />
                          <span>Add teammate</span>
                        </button>
                      </div>
                      {showEditTeammatePicker && (
                        <div className="analysis_teammatePicker">
                          {teamMembers.length === 0 ? (
                            <div className="analysis_teammatePickerEmpty">No hay otros miembros en el equipo</div>
                          ) : (
                            teamMembers.map((m) => {
                              const selected = editParticipantIds.includes(m.auth_user_id);
                              return (
                                <button key={m.auth_user_id} type="button"
                                  className={`analysis_teammatePickerItem${selected ? " is-selected" : ""}`}
                                  onClick={() => setEditParticipantIds((prev) =>
                                    prev.includes(m.auth_user_id)
                                      ? prev.filter((x) => x !== m.auth_user_id)
                                      : [...prev, m.auth_user_id])}>
                                  <span>{m.full_name}</span>
                                  {selected && <Check size={13} />}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="analysis_createFooter">
                  <span className="analysis_createMeta">
                    Editing &bull; {userName || "User"}
                  </span>
                  <div className="analysis_createActions">
                    <button type="button" className="analysis_btnCancel" onClick={handleCancelEdit}>
                      Cancel
                    </button>
                    <button type="button" className="analysis_btnSave" onClick={handleSaveEdit}>
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : !selectedSessionId ? (
            /* ── Empty state ── */
            <div className="analysis_previewEmpty">
              <div className="analysis_previewEmptyIcon">
                <BarChart2 size={48} strokeWidth={1} />
              </div>
              <h3>Select an analysis</h3>
              <p>Choose an analysis from the left panel to start chatting</p>
            </div>
          ) : (
            /* ── Results view ── */
            <>
              {/* Results header: hidden for full-screen templates */}
              {selectedSession?.templateType !== "pm_tracker" && selectedSession?.templateType !== "equipment_queue" && (
                <div className="analysis_resultsHeader">
                  <div className="analysis_resultsHeaderLeft">
                    <div className="analysis_resultsIcon">
                      {selectedSession && renderSessionIcon(selectedSession.iconName)}
                    </div>
                    <h2 className="analysis_resultsTitle">{selectedSession?.title || "Analysis"}</h2>
                  </div>
                  <button
                    type="button"
                    className="analysis_runBtn"
                    onClick={handleRunAnalysis}
                    disabled={isLoading || !analysisPrompt}
                  >
                    {isLoading ? (
                      <>
                        <svg className="analysis_runBtnSpinner" width="16" height="16" viewBox="0 0 16 16">
                          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" />
                        </svg>
                        Running...
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <polygon points="4,2 14,8 4,14" />
                        </svg>
                        Run Analysis
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Results body — PM Tracker, Equipment Queue, or AI chat */}
              {selectedSession?.templateType === "pm_tracker" ? (
                <div className="analysis_resultsBody analysis_resultsBody--full">
                  <div className="analysis_templateFrame">
                    <Suspense fallback={<div className="analysis_previewEmpty"><p>Loading tracker...</p></div>}>
                      <PmTrackerPanel
                        sessionId={selectedSessionId!}
                        teamId={teamId ?? ""}
                        userId={userId ?? ""}
                        config={selectedSession.templateConfig ?? {}}
                        onExpandSidebar={leftCollapsed ? () => setLeftCollapsed(false) : undefined}
                        onSessionIconChange={(sid, iconName) => {
                          setAnalysisSessions((prev) =>
                            prev.map((s) => (s.id === sid ? { ...s, iconName } : s)),
                          );
                        }}
                      />
                    </Suspense>
                  </div>
                </div>
              ) : selectedSession?.templateType === "equipment_queue" ? (
                <div className="analysis_resultsBody analysis_resultsBody--full">
                  <div className="analysis_templateFrame">
                    <Suspense fallback={<div className="analysis_previewEmpty"><p>Cargando fila...</p></div>}>
                      <EquipmentQueuePanel
                        sessionId={selectedSessionId!}
                        teamId={teamId ?? ""}
                        userId={userId ?? ""}
                        userName={userName || "User"}
                        onExpandSidebar={leftCollapsed ? () => setLeftCollapsed(false) : undefined}
                      />
                    </Suspense>
                  </div>
                </div>
              ) : (
                <div className="analysis_resultsBody">
                  {activeRun && (
                    <InlineEventRun
                      run={activeRun}
                      onToggleExpand={handleToggleExpand}
                    />
                  )}
                  {latestResponse && !isLoading ? (
                    <AnalysisChartRenderer
                      text={latestResponse}
                      isLatestAi
                    />
                  ) : !isLoading && !latestResponse ? (
                    <div className="analysis_previewEmpty" style={{ flex: 1 }}>
                      <div className="analysis_previewEmptyIcon">
                        <BarChart2 size={48} strokeWidth={1} />
                      </div>
                      <h3>{analysisPrompt ? "Ready to run" : "No prompt configured"}</h3>
                      <p>{analysisPrompt ? "Click 'Run Analysis' to execute this analysis" : "Create a new analysis with a description to get started"}</p>
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* One-time feature notification */}
      {showQueueNotif && (
        <div className="analysis_notif" role="status">
          <div className="analysis_notifIcon"><Printer size={20} /></div>
          <div className="analysis_notifBody">
            <span className="analysis_notifTitle">Nuevo: 3D Printer Queue</span>
            <span className="analysis_notifDesc">
              Ya puedes reservar impresoras 3D directamente desde Análisis.
            </span>
            <span className="analysis_notifBy">Designed by Liz, Adrian &amp; Dr Erick</span>
          </div>
          <button type="button" className="analysis_notifClose" onClick={dismissQueueNotif} aria-label="Cerrar">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
