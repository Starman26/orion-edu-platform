// src/components/Sidebar.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlaskConical,
  LogOut,
  ChevronDown,
  Check,
  Info,
  X,
  MessageSquare,
  Clock,
  BarChart3,
  Settings,
  LayoutGrid,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useThinking } from "../context/Thinkingcontext";
import { supabase } from "../lib/supabaseClient";

import "../styles/sidebar.css";

type NavItem = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | null;
  /** If true, badge becomes a dot indicator in collapsed mode. Neutral badges (Beta, etc.) disappear. */
  attention?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

type Team = {
  id: string;
  name: string;
  description: string | null;
};

type TeamMembershipRow = {
  team_id: string;
  role: string;
  teams: Team | Team[] | null;
};

type MembershipLite = {
  auth_user_id: string | null;
  role?: string | null;
};

type Member = {
  id: string;
  full_name: string | null;
  auth_user_id: string | null;
};

/** Orion brand mark — simple ring inside the workspace switcher square. */
function OrionMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.25" />
    </svg>
  );
}

const LS_KEY = "cora_sidebar_collapsed";
const ROOT_COLLAPSED_CLASS = "cora-sidebar-collapsed";

function getInitials(value: string | null): string {
  if (!value) return "?";
  const clean = value.trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return clean.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function shortId(v: string | null) {
  if (!v) return "Unknown";
  if (v.length <= 10) return v;
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

/**
 * Renders a workspace name with the brand-italic tail.
 * "Orion Edu" → "Orion <em>Edu</em>"  (single word → just the word)
 */
function renderWorkspaceName(name: string | null | undefined): React.ReactNode {
  if (!name) return "No lab";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] ?? "No lab";
  const [first, ...rest] = parts;
  return (
    <>
      {first}
      <em className="sidebar__workspaceItalic">{rest.join(" ")}</em>
    </>
  );
}

function useClickOutside(
  ref: React.RefObject<HTMLElement>,
  onOutside: () => void
) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside]);
}

export function Sidebar({
  current,
  onNavigate,
  onTeamChange,
}: {
  current: string;
  onNavigate: (key: string) => void;
  onTeamChange?: (teamId: string) => void;
}) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { isThinking } = useThinking();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(LS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEY, collapsed ? "1" : "0");
    } catch {}

    if (collapsed) document.documentElement.classList.add(ROOT_COLLAPSED_CLASS);
    else document.documentElement.classList.remove(ROOT_COLLAPSED_CLASS);
  }, [collapsed]);

  useEffect(() => {
    const onToggle = (e: Event) => {
      const ce = e as CustomEvent<{ collapsed?: boolean }>;
      const next = Boolean(ce.detail?.collapsed);
      setCollapsed(next);
    };

    window.addEventListener("cora:sidebar-toggle", onToggle as EventListener);
    return () => window.removeEventListener("cora:sidebar-toggle", onToggle as EventListener);
  }, []);

  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);

  const switcherRef = useRef<HTMLDivElement>(null);
  useClickOutside(switcherRef, () => setSwitcherOpen(false));

  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showTeamPopup, setShowTeamPopup] = useState(false);

  const [buddyEnabled, setBuddyEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem("orion.buddy") !== "0"; } catch { return true; }
  });

  useEffect(() => {
    const onBuddy = (e: Event) => {
      const ce = e as CustomEvent<{ enabled: boolean }>;
      setBuddyEnabled(ce.detail.enabled);
    };
    window.addEventListener("orion:buddy-toggle", onBuddy as EventListener);
    return () => window.removeEventListener("orion:buddy-toggle", onBuddy as EventListener);
  }, []);

  // Agent info modal state
  const [isCardHovered, setIsCardHovered] = useState(false);
  const [showAgentInfo, setShowAgentInfo] = useState(false);

  // Add Lab modal state
  const [showAddLab, setShowAddLab] = useState(false);
  const [newLabName, setNewLabName] = useState("");
  const [newLabDescription, setNewLabDescription] = useState("");
  const [creatingLab, setCreatingLab] = useState(false);
  const [createLabError, setCreateLabError] = useState<string | null>(null);

  // ─── Eye animation state ──────────────────────────────────────────
  type EyeState =
    | "idle"
    | "blink"
    | "wide"
    | "look"
    | "sleepy"
    | "zzz"
    | "wink"
    | "mousetrack"
    | "squint"
    | "happy"
    | "surprised";

  const [eyeState, setEyeState] = useState<EyeState>("idle");
  const [lookDir, setLookDir] = useState({ x: 0, y: 0 });
  const eyeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mouse tracking refs
  const eyesContainerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const mouseTrackingActive = useRef(false);

  const isNightTime = () => new Date().getHours() >= 20;
  const isDeepNight = () => {
    const hour = new Date().getHours();
    return hour >= 23 || hour < 8;
  };

  const computeMouseOffset = useCallback((clientX: number, clientY: number) => {
    const el = eyesContainerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxOffset = 5;
    const clamp = Math.min(dist / 120, 1);
    return {
      x: (dx / (dist || 1)) * maxOffset * clamp,
      y: (dy / (dist || 1)) * maxOffset * clamp,
    };
  }, []);

  const handleSidebarMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!mouseTrackingActive.current) return;
      const offset = computeMouseOffset(e.clientX, e.clientY);
      setMousePos(offset);
    },
    [computeMouseOffset]
  );

  // ─── Eye animation loop ───────────────────────────────────────────
  const runEyeLoop = useCallback(() => {
    if (eyeTimerRef.current) clearTimeout(eyeTimerRef.current);

    if (isDeepNight()) {
      const sleepActions: EyeState[] = ["sleepy", "sleepy", "sleepy", "zzz", "zzz"];
      const pick = sleepActions[Math.floor(Math.random() * sleepActions.length)];
      setEyeState(pick);
      eyeTimerRef.current = setTimeout(() => {
        setEyeState("sleepy");
        eyeTimerRef.current = setTimeout(runEyeLoop, 3000 + Math.random() * 3000);
      }, pick === "zzz" ? 4000 : 3000 + Math.random() * 2000);
      return;
    }

    const night = isNightTime();
    const hovering = isSidebarHovered;

    let actions: EyeState[];
    if (hovering) {
      actions = ["mousetrack", "mousetrack", "mousetrack", "wink", "happy", "blink", "blink", "squint", "idle"];
    } else if (night) {
      actions = ["sleepy", "sleepy", "zzz", "blink", "wink", "idle", "idle", "idle"];
    } else {
      actions = ["blink", "blink", "wide", "look", "wink", "squint", "happy", "surprised", "idle", "idle", "idle"];
    }

    const pick = actions[Math.floor(Math.random() * actions.length)];
    const nextDelay = () => night ? 2500 + Math.random() * 2500 : 2000 + Math.random() * 2500;
    const scheduleNext = (afterMs?: number) => {
      eyeTimerRef.current = setTimeout(runEyeLoop, afterMs ?? nextDelay());
    };
    const doThenIdle = (state: EyeState, durationMs: number, cleanup?: () => void) => {
      setEyeState(state);
      eyeTimerRef.current = setTimeout(() => {
        cleanup?.();
        setEyeState("idle");
        scheduleNext();
      }, durationMs);
    };

    switch (pick) {
      case "blink": doThenIdle("blink", 180); break;
      case "wide": doThenIdle("wide", 1000 + Math.random() * 1500); break;
      case "look":
        setLookDir({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 6 });
        doThenIdle("look", 1500 + Math.random() * 2500, () => setLookDir({ x: 0, y: 0 }));
        break;
      case "sleepy": doThenIdle("sleepy", 3500 + Math.random() * 2000); break;
      case "zzz": doThenIdle("zzz", 3500); break;
      case "wink": doThenIdle("wink", 400 + Math.random() * 300); break;
      case "mousetrack":
        mouseTrackingActive.current = true;
        setEyeState("mousetrack");
        eyeTimerRef.current = setTimeout(() => {
          mouseTrackingActive.current = false;
          setMousePos({ x: 0, y: 0 });
          setEyeState("idle");
          scheduleNext();
        }, 3000 + Math.random() * 2000);
        break;
      case "squint": doThenIdle("squint", 1200 + Math.random() * 1500); break;
      case "happy": doThenIdle("happy", 1500 + Math.random() * 1500); break;
      case "surprised": doThenIdle("surprised", 800 + Math.random() * 600); break;
      default: setEyeState("idle"); scheduleNext(); break;
    }
  }, [isSidebarHovered]);

  useEffect(() => {
    if (!collapsed && !isThinking) {
      eyeTimerRef.current = setTimeout(runEyeLoop, 1000 + Math.random() * 2000);
    } else {
      if (eyeTimerRef.current) clearTimeout(eyeTimerRef.current);
      mouseTrackingActive.current = false;
      setEyeState("idle");
      setLookDir({ x: 0, y: 0 });
      setMousePos({ x: 0, y: 0 });
    }
    return () => { if (eyeTimerRef.current) clearTimeout(eyeTimerRef.current); };
  }, [collapsed, isThinking, runEyeLoop]);

  const eyeStyle = useCallback((): React.CSSProperties | undefined => {
    if (eyeState === "look") return { "--look-x": `${lookDir.x}px`, "--look-y": `${lookDir.y}px` } as React.CSSProperties;
    if (eyeState === "mousetrack") return { "--look-x": `${mousePos.x}px`, "--look-y": `${mousePos.y}px` } as React.CSSProperties;
    return undefined;
  }, [eyeState, lookDir, mousePos]);

  const eyeClassName = useCallback((side: "left" | "right"): string => {
    const base = "sidebar__eye";
    if (isThinking) return base;
    if (eyeState === "wink") return side === "left" ? `${base} sidebar__eye--wink` : base;
    if (eyeState === "mousetrack") return `${base} sidebar__eye--look`;
    if (eyeState !== "idle") return `${base} sidebar__eye--${eyeState}`;
    return base;
  }, [eyeState, isThinking]);

  const activeTeam = useMemo(() => {
    if (!activeTeamId) return null;
    return teams.find((t) => t.id === activeTeamId) || null;
  }, [teams, activeTeamId]);

  // ─── Sections ─────────────────────────────────────────────────────
  const navSection: NavSection = useMemo(() => ({
    title: "Navigation",
    items: [
      { key: "inicio", label: "Agent", icon: MessageSquare },
      { key: "proyectos", label: "Studio", icon: LayoutGrid, badge: "Beta" },
      { key: "living", label: "Living Lab", icon: FlaskConical },
      { key: "chat", label: "History", icon: Clock },
    ],
  }), []);

  const insightsSection: NavSection = useMemo(() => ({
    title: "Insights",
    items: [
      { key: "widget", label: "Analysis", icon: BarChart3 },
    ],
  }), []);

  const normalizeTeam = (t: Team | Team[] | null): Team | null => {
    if (!t) return null;
    return Array.isArray(t) ? t[0] ?? null : t;
  };

  useEffect(() => {
    const loadTeams = async () => {
      setLoadingTeams(true);
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!user) { setTeams([]); setActiveTeamId(null); return; }

        const { data: profile, error: profileErr } = await supabase
          .from("profiles").select("active_team_id").eq("auth_user_id", user.id).maybeSingle();
        if (profileErr) console.warn("No pude leer profiles.active_team_id:", profileErr);

        const { data: memberships, error: memErr } = await supabase
          .from("team_memberships").select("team_id, role, teams:teams(id, name, description)").eq("auth_user_id", user.id);
        if (memErr) throw memErr;

        const rows = (memberships ?? []) as TeamMembershipRow[];
        const labs: Team[] = rows.map((m) => normalizeTeam(m.teams)).filter((t): t is Team => Boolean(t));
        const uniq = Array.from(new Map(labs.map((t) => [t.id, t])).values());
        setTeams(uniq);

        const preferred = (profile as any)?.active_team_id as string | null;
        const fallback = uniq[0]?.id ?? null;
        setActiveTeamId(preferred && uniq.some((t) => t.id === preferred) ? preferred : fallback);
      } catch (e) {
        console.error("Error cargando labs:", e);
        setTeams([]); setActiveTeamId(null);
      } finally { setLoadingTeams(false); }
    };
    loadTeams();
  }, []);

  useEffect(() => {
    const loadMembers = async () => {
      if (!activeTeamId) { setMembers([]); return; }
      setLoadingMembers(true);
      try {
        const { data: mems, error: memErr } = await supabase.from("team_memberships").select("auth_user_id, role").eq("team_id", activeTeamId).limit(50);
        if (memErr) throw memErr;

        const membershipRows = (mems ?? []) as MembershipLite[];
        const ids = membershipRows.map((r) => r.auth_user_id).filter(Boolean) as string[];
        if (ids.length === 0) { setMembers([]); return; }

        const { data: profs, error: profErr } = await supabase.from("profiles").select("id, full_name, auth_user_id").in("auth_user_id", ids).limit(50);
        if (profErr) throw profErr;

        const profileMap = new Map<string, Member>();
        (profs ?? []).forEach((p: any) => { if (p.auth_user_id) profileMap.set(p.auth_user_id, p); });

        const merged: Member[] = ids.map((authId) => {
          const p = profileMap.get(authId);
          if (p) return p;
          return { id: authId, full_name: null, auth_user_id: authId };
        });

        merged.sort((a, b) => {
          const an = a.full_name || shortId(a.auth_user_id);
          const bn = b.full_name || shortId(b.auth_user_id);
          return an.localeCompare(bn);
        });
        setMembers(merged);
      } catch (e) { console.error("Error cargando miembros:", e); setMembers([]); }
      finally { setLoadingMembers(false); }
    };
    loadMembers();
  }, [activeTeamId]);

  const handleSelectTeam = async (teamId: string) => {
    setActiveTeamId(teamId);
    setSwitcherOpen(false);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) return;
      const { error } = await supabase.from("profiles").update({ active_team_id: teamId }).eq("auth_user_id", user.id);
      if (error) throw error;
      onTeamChange?.(teamId);
    } catch (e) { console.error("No pude actualizar active_team_id:", e); }
  };

  const handleLogout = async () => {
    try { await logout(); navigate("/"); }
    catch (err) { console.error("Error al cerrar sesión:", err); }
  };

  const handleProfile = () => navigate("/my-profile");

  const handleCreateLab = async () => {
    const name = newLabName.trim();
    if (!name) { setCreateLabError("Enter a lab name."); return; }

    setCreatingLab(true);
    setCreateLabError(null);

    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) { setCreateLabError("Session expired. Please sign in again."); return; }

      const join_code = Math.random().toString(36).substring(2, 8).toUpperCase();

      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .insert({
          name,
          description: newLabDescription.trim() || null,
          join_code,
          created_by: user.id,
        })
        .select("id, name, description")
        .single();

      if (teamError || !teamData) {
        console.error("Error creating team:", teamError);
        setCreateLabError("Could not create the lab.");
        return;
      }

      const { error: membershipError } = await supabase
        .from("team_memberships")
        .upsert(
          { team_id: teamData.id, auth_user_id: user.id, role: "admin" },
          { onConflict: "team_id,auth_user_id" }
        );

      if (membershipError) {
        console.error("Error creating membership:", membershipError);
        setCreateLabError("Lab created but could not link membership.");
        return;
      }

      setTeams((prev) => [...prev, teamData as Team]);
      await handleSelectTeam(teamData.id);

      setNewLabName("");
      setNewLabDescription("");
      setShowAddLab(false);
    } catch (e) {
      console.error(e);
      setCreateLabError("Something went wrong. Try again.");
    } finally {
      setCreatingLab(false);
    }
  };

  // ─── Renderers ────────────────────────────────────────────────────
  const renderNavItem = (item: NavItem) => {
    const active = current === item.key;
    const Icon = item.icon;
    const showBadge = !collapsed && !!item.badge;
    const showDot = collapsed && !!item.badge && !!item.attention;

    return (
      <button
        key={item.key}
        type="button"
        onClick={() => onNavigate(item.key)}
        className={`sidebar__item ${active ? "is-active" : ""}`}
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="sidebar__itemIcon" />
        <span className="sidebar__itemLabel">{item.label}</span>
        {showBadge && <span className="sidebar__badge">{item.badge}</span>}
        {showDot && <span className="sidebar__badgeDot" aria-hidden="true" />}
      </button>
    );
  };

  const renderMembers = () => {
    if (loadingMembers) {
      return collapsed ? null : <div className="sidebar__hint">Loading...</div>;
    }
    if (members.length === 0) {
      return collapsed ? null : <div className="sidebar__hint">No members</div>;
    }

    if (collapsed) {
      const first = members[0];
      const extra = members.length - 1;
      return (
        <div className="sidebar__membersCollapsed">
          <div
            className="sidebar__avatar"
            title={first.full_name || ""}
            aria-label={first.full_name || "Team member"}
          >
            {getInitials(first.full_name || first.auth_user_id || "?")}
          </div>
          {extra > 0 && (
            <div
              className="sidebar__memberMore"
              title={`${extra} more member${extra === 1 ? "" : "s"}`}
              aria-label={`${extra} more`}
            >
              +{extra}
            </div>
          )}
        </div>
      );
    }

    return (
      <>
        <div className="sidebar__membersList">
          {members.slice(0, 4).map((m) => {
            const displayName = m.full_name || shortId(m.auth_user_id) || "Member";
            const initials = getInitials(m.full_name || m.auth_user_id || "?");
            return (
              <div key={m.id} className="sidebar__memberRow">
                <div className="sidebar__avatar">{initials}</div>
                <span className="sidebar__memberName">{displayName}</span>
              </div>
            );
          })}
          {members.length > 4 && (
            <button
              type="button"
              onClick={() => setShowTeamPopup(true)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 11, color: "var(--text-muted, #6b7280)",
                padding: "4px 8px", width: "100%", textAlign: "left",
                fontFamily: "inherit",
              }}>
              + {members.length - 4} more teammates
            </button>
          )}
        </div>

        {showTeamPopup && (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
              zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onClick={() => setShowTeamPopup(false)}>
            <div
              style={{
                background: "var(--bg-surface, #1a1a1a)",
                border: "1px solid var(--border, #2a2a2a)",
                borderRadius: 12, padding: 24, width: 400, maxWidth: "90vw",
                maxHeight: "70vh", overflow: "hidden",
                display: "flex", flexDirection: "column", gap: 16,
              }}
              onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>Team Members ({members.length})</span>
                <button
                  type="button"
                  onClick={() => setShowTeamPopup(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "inherit" }}>
                  ×
                </button>
              </div>
              <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {members.map((member) => (
                  <div key={member.id} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                    borderBottom: "1px solid var(--border, #2a2a2a)",
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: "var(--accent, #3b82f6)", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 600,
                    }}>
                      {getInitials(member.full_name || member.auth_user_id || "?")}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {member.full_name || "Sin nombre"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted, #6b7280)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {shortId(member.auth_user_id)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <aside
      className={`sidebar drag-region ${collapsed ? "is-collapsed" : ""}`}
      onMouseEnter={() => setIsSidebarHovered(true)}
      onMouseLeave={() => {
        setIsSidebarHovered(false);
        if (mouseTrackingActive.current) {
          mouseTrackingActive.current = false;
          setMousePos({ x: 0, y: 0 });
        }
      }}
      onMouseMove={handleSidebarMouseMove}
    >
      {/* ── Header: Workspace switcher ── */}
      <div className="sidebar__header no-drag" ref={switcherRef}>
        <button
          type="button"
          className="sidebar__workspaceBtn"
          onClick={() => setSwitcherOpen((v) => !v)}
          disabled={loadingTeams}
          aria-label="Switch workspace"
          aria-expanded={switcherOpen}
          aria-haspopup="listbox"
        >
          <span className="sidebar__workspaceMark" aria-hidden="true">
            <OrionMark className="sidebar__workspaceMarkIcon" />
          </span>
          <span className="sidebar__workspaceText">
            <span className="sidebar__workspaceEyebrow">Workspace</span>
            <span className="sidebar__workspaceName">
              {renderWorkspaceName(activeTeam?.name)}
            </span>
          </span>
          <ChevronDown className="sidebar__workspaceChev" aria-hidden="true" />
        </button>

        {switcherOpen && (
          <div className="sidebar__dropdown" role="listbox">
            {teams.length === 0 ? (
              <div className="sidebar__dropdownEmpty">No labs found</div>
            ) : (
              teams.map((t) => {
                const selected = t.id === activeTeamId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`sidebar__dropdownItem ${selected ? "is-selected" : ""}`}
                    onClick={() => handleSelectTeam(t.id)}
                  >
                    <span className="sidebar__dropdownName">{t.name || "Untitled"}</span>
                    {selected && <Check className="sidebar__check" />}
                  </button>
                );
              })
            )}
            <div className="sidebar__dropdownDivider" />
            <button
              type="button"
              className="sidebar__dropdownItem sidebar__dropdownAdd"
              onClick={() => { setSwitcherOpen(false); setShowAddLab(true); }}
            >
              <span className="sidebar__dropdownAddIcon">+</span>
              <span className="sidebar__dropdownName">Add Lab</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Scroll area: nav sections + team ── */}
      <div className="sidebar__scroll no-drag">
        {/* Navigation */}
        <div className="sidebar__section">
          <div className="sidebar__sectionTitle">{navSection.title}</div>
          <div className="sidebar__sectionItems">
            {navSection.items.map(renderNavItem)}
          </div>
        </div>

        {/* Insights */}
        <div className="sidebar__section">
          <div className="sidebar__sectionTitle">{insightsSection.title}</div>
          <div className="sidebar__sectionItems">
            {insightsSection.items.map(renderNavItem)}
          </div>
        </div>

        {/* Team Card with Pixel Eyes — expanded only */}
        {buddyEnabled && <div
          className="sidebar__teamCard"
          onMouseEnter={() => setIsCardHovered(true)}
          onMouseLeave={() => setIsCardHovered(false)}
          aria-hidden={collapsed}
        >
          <div
            ref={eyesContainerRef}
            className={`sidebar__simpleEyes ${isThinking ? "is-thinking" : ""}`}
          >
            <div className={eyeClassName("left")} style={eyeStyle()} />
            <div className={eyeClassName("right")} style={eyeStyle()} />
          </div>

          {eyeState === "zzz" && (
            <div className="sidebar__zzzContainer">
              <span className="sidebar__zFloat sidebar__zFloat--1">z</span>
              <span className="sidebar__zFloat sidebar__zFloat--2">z</span>
              <span className="sidebar__zFloat sidebar__zFloat--3">z</span>
            </div>
          )}

          <button
            type="button"
            className={`sidebar__infoBtn ${isCardHovered ? "is-visible" : ""}`}
            onClick={() => setShowAgentInfo(true)}
            aria-label="About Sentinela"
            tabIndex={collapsed ? -1 : 0}
          >
            <Info className="sidebar__infoBtnIcon" />
          </button>
        </div>}

        {/* Team / members */}
        <div className="sidebar__section sidebar__section--team">
          <div className="sidebar__sectionTitle">Team</div>
          {renderMembers()}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="sidebar__footer no-drag">
        <button
          type="button"
          onClick={handleProfile}
          className="sidebar__footerItem"
          title={collapsed ? "Settings" : undefined}
          aria-label="Settings"
        >
          <Settings className="sidebar__footerIcon" />
          <span className="sidebar__footerLabel">Settings</span>
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="sidebar__footerItem"
          title={collapsed ? "Log Out" : undefined}
          aria-label="Log Out"
        >
          <LogOut className="sidebar__footerIcon" />
          <span className="sidebar__footerLabel">Log Out</span>
        </button>
      </div>

      {/* Agent Info Modal */}
      {showAgentInfo && (
        <div className="sidebar__agentModalOverlay" onClick={() => setShowAgentInfo(false)}>
          <div className="sidebar__agentModal" onClick={(e) => e.stopPropagation()}>
            <button className="sidebar__agentModalClose" onClick={() => setShowAgentInfo(false)} aria-label="Close">
              <X className="sidebar__agentModalCloseIcon" />
            </button>
            <div className="sidebar__agentModalHeader">
              <div className="sidebar__agentModalEyes">
                <div className="sidebar__agentModalEye" />
                <div className="sidebar__agentModalEye" />
              </div>
            </div>
            <div className="sidebar__agentModalContent">
              <h3 className="sidebar__agentModalTitle">Hi, I'm Sentinela</h3>
              <p className="sidebar__agentModalSubtitle">The Main Agent for your lab. Happy to be working with you!</p>
              <div className="sidebar__agentModalSection">
                <h4 className="sidebar__agentModalSectionTitle">This is what I can do:</h4>
                <ul className="sidebar__agentModalList">
                  <li><span className="sidebar__agentModalBullet">→</span>Answer questions about your data and processes</li>
                  <li><span className="sidebar__agentModalBullet">→</span>Help troubleshoot issues in your lab equipment</li>
                  <li><span className="sidebar__agentModalBullet">→</span>Generate reports and analyze trends</li>
                  <li><span className="sidebar__agentModalBullet">→</span>Connect with your knowledge base and documentation</li>
                  <li><span className="sidebar__agentModalBullet">→</span>Execute tasks and automate workflows</li>
                </ul>
              </div>
              <p className="sidebar__agentModalFooter">Just ask me anything in the chat. I'm here to help!</p>
            </div>
          </div>
        </div>
      )}

      {/* Add Lab Modal */}
      {showAddLab && (
        <div className="sidebar__agentModalOverlay" onClick={() => setShowAddLab(false)}>
          <div className="sidebar__agentModal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <button
              className="sidebar__agentModalClose"
              onClick={() => { setShowAddLab(false); setCreateLabError(null); }}
              aria-label="Close"
            >
              <X className="sidebar__agentModalCloseIcon" />
            </button>
            <div className="sidebar__agentModalContent" style={{ paddingTop: 24 }}>
              <h3 className="sidebar__agentModalTitle">Create a new Lab</h3>
              <p className="sidebar__agentModalSubtitle">You'll be the administrator of this lab.</p>

              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, opacity: 0.6 }}>
                    Lab Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. FrED Factory"
                    value={newLabName}
                    onChange={(e) => setNewLabName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newLabName.trim()) handleCreateLab(); }}
                    autoFocus
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 10,
                      border: "1px solid var(--sidebar-hairline, rgba(0,0,0,0.08))",
                      background: "var(--sidebar-bg, #fafafa)",
                      fontSize: 14, outline: "none", color: "inherit",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, opacity: 0.6 }}>
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="What does this lab focus on?"
                    value={newLabDescription}
                    onChange={(e) => setNewLabDescription(e.target.value)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 10,
                      border: "1px solid var(--sidebar-hairline, rgba(0,0,0,0.08))",
                      background: "var(--sidebar-bg, #fafafa)",
                      fontSize: 14, outline: "none", color: "inherit",
                    }}
                  />
                </div>

                {createLabError && (
                  <p style={{ fontSize: 13, color: "#e53e3e", margin: 0 }}>{createLabError}</p>
                )}

                <button
                  type="button"
                  onClick={handleCreateLab}
                  disabled={creatingLab || !newLabName.trim()}
                  style={{
                    marginTop: 4, padding: "10px 0", borderRadius: 10,
                    background: "#101113", color: "#fafafa",
                    fontSize: 14, fontWeight: 500, border: "none", cursor: "pointer",
                    opacity: creatingLab || !newLabName.trim() ? 0.5 : 1,
                  }}
                >
                  {creatingLab ? "Creating..." : "Create Lab"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}