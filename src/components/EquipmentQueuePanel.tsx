// src/components/EquipmentQueuePanel.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, User, Search, ChevronLeft, ChevronRight, Check, Filter, RefreshCw, Pencil, Settings, ChevronDown, ClipboardList, Clock, AlertTriangle, CheckCircle2, BookOpen, Shield, Wrench, Eye, Users, Lock, Bell, FileText, Zap, Info, Flag, Star, Trash2, Box, type LucideIcon } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { equipmentTypeIcon, EQUIPMENT_TYPES, type EquipmentProfile } from "./EquipmentTab";
import { OrionSelect } from "./OrionSelect";
import "../styles/equipment-queue.css";
import "../styles/pm-tracker.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueEntry {
  id: string;
  team_id: string;
  equipment_id: string;
  requested_by_user_id: string;
  requested_by_name: string;
  scheduled_at: string;
  duration_hours: number;
  status: "waiting" | "in_use" | "done" | "cancelled";
  notes: string | null;
  material: string | null;
  session_id: string | null;
  created_at: string;
}

const RULE_ICONS: Record<string, LucideIcon> = {
  clipboard: ClipboardList, clock: Clock, alert: AlertTriangle,
  check: CheckCircle2, book: BookOpen, shield: Shield,
  wrench: Wrench, eye: Eye, users: Users, lock: Lock,
  bell: Bell, file: FileText, zap: Zap, info: Info,
  flag: Flag, star: Star, trash: Trash2, box: Box,
  refresh: RefreshCw,
};
const RULE_ICON_DEFAULT = "clipboard";

function RuleIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Comp = RULE_ICONS[name] ?? RULE_ICONS[RULE_ICON_DEFAULT];
  return <Comp size={size} />;
}

interface EquipmentRule {
  id: string;
  order: number;
  icon: string;
  title: string;
  description: string;
}

export interface EquipmentQueuePanelProps {
  teamId: string;
  userId: string;
  userName: string;
  sessionId?: string;
  onExpandSidebar?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────


const STATUS_DOT: Record<string, string> = {
  waiting: "var(--pmt-text-subtle)",
  in_use:  "var(--st-warning)",
  done:    "var(--st-ok)",
};

const SECTION_ORDER: QueueEntry["status"][] = ["in_use", "waiting", "done"];

const KANBAN_COLS: { status: QueueEntry["status"]; label: string; dot: string }[] = [
  { status: "waiting",   label: "En espera",  dot: "var(--pmt-text-subtle)" },
  { status: "in_use",    label: "En uso",     dot: "var(--st-warning)" },
  { status: "done",      label: "Completado", dot: "var(--st-ok)" },
  { status: "cancelled", label: "Fallido",    dot: "var(--st-critical)" },
];

const SECTION_LABEL: Record<string, string> = {
  in_use:  "EN CURSO",
  waiting: "En cola",
  done:    "Completados",
};

const SECTION_MORE_LABEL: Record<string, string> = {
  in_use:  "en curso",
  waiting: "en cola",
  done:    "completadas",
};

const SECTION_VISIBLE = 3;

const THEMES = [
  { id: "light",    name: "Light",    bg: "#ffffff", fg: "#111111", accent: "#2563eb" },
  { id: "slate",    name: "Slate",    bg: "#1e293b", fg: "#f8fafc", accent: "#38bdf8" },
  { id: "forest",   name: "Forest",   bg: "#14532d", fg: "#f0fdf4", accent: "#4ade80" },
  { id: "ocean",    name: "Ocean",    bg: "#0c4a6e", fg: "#f0f9ff", accent: "#7dd3fc" },
  { id: "sunset",   name: "Sunset",   bg: "#9a3412", fg: "#fff7ed", accent: "#fb923c" },
  { id: "midnight", name: "Midnight", bg: "#020617", fg: "#f1f5f9", accent: "#818cf8" },
];

const PALETTE = [
  { bg: "#eff6ff", border: "#2563eb", text: "#1d4ed8" }, // blue
  { bg: "#f0fdf4", border: "#16a34a", text: "#15803d" }, // green
  { bg: "#faf5ff", border: "#7c3aed", text: "#6d28d9" }, // purple
  { bg: "#fff7ed", border: "#ea580c", text: "#c2410c" }, // orange
  { bg: "#fdf2f8", border: "#db2777", text: "#be185d" }, // pink
  { bg: "#f0fdfa", border: "#0891b2", text: "#0e7490" }, // teal
  { bg: "#fef2f2", border: "#dc2626", text: "#b91c1c" }, // red
  { bg: "#eef2ff", border: "#4f46e5", text: "#4338ca" }, // indigo
];

const CAL_START = 0;   // midnight
const CAL_END   = 24;  // midnight
const HOUR_PX   = 52;  // px per hour slot

// ─── Calendar layout ─────────────────────────────────────────────────────────

interface CalEventLayout extends QueueEntry {
  startMs: number;
  endMs: number;
  col: number;
  totalCols: number;
}

function computeCalLayout(events: QueueEntry[]): CalEventLayout[] {
  const laid: CalEventLayout[] = events
    .map((e) => ({
      ...e,
      startMs: new Date(e.scheduled_at).getTime(),
      endMs:   new Date(e.scheduled_at).getTime() + e.duration_hours * 3_600_000,
      col: 0,
      totalCols: 1,
    }))
    .sort((a, b) => a.startMs - b.startMs);

  // Greedy column assignment
  const colEnd: number[] = [];
  for (const ev of laid) {
    let placed = false;
    for (let c = 0; c < colEnd.length; c++) {
      if (colEnd[c] <= ev.startMs) {
        ev.col = c; colEnd[c] = ev.endMs; placed = true; break;
      }
    }
    if (!placed) { ev.col = colEnd.length; colEnd.push(ev.endMs); }
  }

  // Determine total columns per event (max col among all that overlap it + 1)
  for (let i = 0; i < laid.length; i++) {
    let max = laid[i].col;
    for (let j = 0; j < laid.length; j++) {
      if (i !== j && laid[j].startMs < laid[i].endMs && laid[j].endMs > laid[i].startMs) {
        max = Math.max(max, laid[j].col);
      }
    }
    laid[i].totalCols = max + 1;
  }

  return laid;
}

// ─── Auto-status (derived from time, never manually cycled) ──────────────────

function computeAutoStatus(entry: QueueEntry): "waiting" | "in_use" | "done" {
  const now   = Date.now();
  const start = new Date(entry.scheduled_at).getTime();
  const end   = start + entry.duration_hours * 3_600_000;
  if (now >= end)   return "done";
  if (now >= start) return "in_use";
  return "waiting";
}

// Status efectivo: respeta cambios manuales (kanban drop) y avanza
// automáticamente las entradas todavía "waiting" cuando pasa su horario.
function effectiveStatus(entry: QueueEntry): QueueEntry["status"] {
  if (entry.status === "waiting") return computeAutoStatus(entry);
  return entry.status;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtCalHeader(d: Date) {
  return d.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

const AVATAR_PALETTE: { bg: string; text: string }[] = [
  { bg: "#dbeafe", text: "#1e40af" }, // blue
  { bg: "#fef3c7", text: "#92400e" }, // amber
  { bg: "#dcfce7", text: "#166534" }, // green
  { bg: "#fce7f3", text: "#9d174d" }, // pink
  { bg: "#ede9fe", text: "#5b21b6" }, // purple
  { bg: "#cffafe", text: "#155e75" }, // cyan
  { bg: "#fee2e2", text: "#991b1b" }, // red
  { bg: "#fed7aa", text: "#9a3412" }, // orange
  { bg: "#e0e7ff", text: "#3730a3" }, // indigo
  { bg: "#ccfbf1", text: "#115e59" }, // teal
];

function avatarColor(name: string): { bg: string; text: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function fmtDurCompact(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function fmtMinCompact(mins: number): string {
  if (mins < 60) return `${mins}m`;
  return fmtDurCompact(mins / 60);
}

function entryScheduleLabel(entry: { scheduled_at: string }, status: "waiting" | "in_use" | "done" | "cancelled"): string {
  const time = fmtTime(entry.scheduled_at);
  if (status === "in_use") return `iniciado ${time}`;
  if (status === "waiting") return `inicia ${time}`;
  if (status === "done") return `terminó ${time}`;
  return time;
}

function entryRemainingLabel(entry: { scheduled_at: string; duration_hours: number }, status: "waiting" | "in_use" | "done" | "cancelled"): string {
  const now = Date.now();
  const start = new Date(entry.scheduled_at).getTime();
  const end = start + entry.duration_hours * 3_600_000;
  if (status === "in_use") {
    return `resta ${fmtMinCompact(Math.max(0, Math.round((end - now) / 60000)))}`;
  }
  if (status === "waiting") {
    const diffMin = Math.round((start - now) / 60000);
    if (diffMin <= 0) return "comenzando";
    return `en ${fmtMinCompact(diffMin)}`;
  }
  if (status === "done") return "completado";
  return "fallido";
}

// ─── Setup notice ─────────────────────────────────────────────────────────────

const SETUP_SQL = `-- 1. Create table
CREATE TABLE IF NOT EXISTS lab.equipment_queue_entries (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       text        NOT NULL,
  equipment_id  text        NOT NULL,
  requested_by_user_id text NOT NULL,
  requested_by_name    text NOT NULL,
  scheduled_at  timestamptz NOT NULL,
  duration_hours numeric    NOT NULL DEFAULT 1,
  material      text,
  status        text        NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting','in_use','done','cancelled')),
  notes         text,
  session_id    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE lab.equipment_queue_entries ENABLE ROW LEVEL SECURITY;

-- 3. Policies
CREATE POLICY "queue_select" ON lab.equipment_queue_entries
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM public.team_memberships
      WHERE auth_user_id = auth.uid()::text));

CREATE POLICY "queue_insert" ON lab.equipment_queue_entries
  FOR INSERT WITH CHECK (
    requested_by_user_id = auth.uid()::text AND
    team_id IN (SELECT team_id FROM public.team_memberships
      WHERE auth_user_id = auth.uid()::text));

CREATE POLICY "queue_update" ON lab.equipment_queue_entries
  FOR UPDATE USING (
    team_id IN (SELECT team_id FROM public.team_memberships
      WHERE auth_user_id = auth.uid()::text));`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function EquipmentQueuePanel({
  teamId,
  userId,
  userName,
  sessionId,
  onExpandSidebar,
}: EquipmentQueuePanelProps) {
  // ── Config (title / subtitle / theme) persisted in localStorage ──
  const configKey = `equeue_config_${sessionId ?? teamId}`;
  const loadConfig = () => {
    try { return JSON.parse(localStorage.getItem(configKey) ?? "null") ?? {}; } catch { return {}; }
  };
  const [title, setTitle]       = useState<string>(() => loadConfig().title    ?? "Equipment Queue");
  const [subtitle, setSubtitle] = useState<string>(() => loadConfig().subtitle ?? "Reserva virtual de equipos del laboratorio");
  const [theme, setTheme]       = useState<string>(() => loadConfig().theme    ?? "light");
  const [showSettings,  setShowSettings]  = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [sDraftTitle,   setSDraftTitle]   = useState("");
  const [sDraftSub,     setSDraftSub]     = useState("");
  const [sDraftTheme,   setSDraftTheme]   = useState("light");

  const openSettings = () => {
    setSDraftTitle(title); setSDraftSub(subtitle); setSDraftTheme(theme);
    setShowSettings(true);
  };
  const saveSettings = () => {
    setTitle(sDraftTitle); setSubtitle(sDraftSub); setTheme(sDraftTheme);
    try { localStorage.setItem(configKey, JSON.stringify({ title: sDraftTitle, subtitle: sDraftSub, theme: sDraftTheme })); } catch {}
    setShowSettings(false);
  };

  // ── Rules (localStorage) ──
  const rulesKey = `equeue_rules_${sessionId ?? teamId}`;
  const loadRules = (): EquipmentRule[] => {
    try { return JSON.parse(localStorage.getItem(rulesKey) ?? "null") ?? []; } catch { return []; }
  };
  const [rules, setRules] = useState<EquipmentRule[]>(loadRules);
  const persistRules = (next: EquipmentRule[]) => {
    setRules(next);
    try { localStorage.setItem(rulesKey, JSON.stringify(next)); } catch {}
  };
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [rIcon,  setRIcon]  = useState(RULE_ICON_DEFAULT);
  const [rTitle, setRTitle] = useState("");
  const [rDesc,  setRDesc]  = useState("");
  const [editRuleId, setEditRuleId] = useState<string | null>(null);
  const [erIcon,  setErIcon]  = useState("");
  const [erTitle, setErTitle] = useState("");
  const [erDesc,  setErDesc]  = useState("");

  const handleAddRule = () => {
    if (!rTitle.trim()) return;
    const next = [...rules, { id: crypto.randomUUID(), order: rules.length + 1, icon: rIcon || RULE_ICON_DEFAULT, title: rTitle.trim(), description: rDesc.trim() }];
    persistRules(next);
    setRIcon("📋"); setRTitle(""); setRDesc(""); setShowRuleForm(false);
  };
  const openEditRule = (r: EquipmentRule) => {
    setErIcon(r.icon); setErTitle(r.title); setErDesc(r.description); setEditRuleId(r.id);
  };
  const handleSaveRule = (id: string) => {
    if (!erTitle.trim()) return;
    persistRules(rules.map((r) => r.id === id ? { ...r, icon: erIcon || RULE_ICON_DEFAULT, title: erTitle.trim(), description: erDesc.trim() } : r));
    setEditRuleId(null);
  };
  const handleDeleteRule = (id: string) => {
    const next = rules.filter((r) => r.id !== id).map((r, i) => ({ ...r, order: i + 1 }));
    persistRules(next);
    setEditRuleId(null);
  };

  const [equipment, setEquipment]   = useState<EquipmentProfile[]>([]);
  const [entries, setEntries]       = useState<QueueEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tableError, setTableError] = useState(false);
  const [selectedEqId, setSelectedEqId] = useState<string | null>(null);
  const [showForm, setShowForm]     = useState(false);
  const [midView, setMidView]       = useState<"list" | "rules" | "kanban">("list");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [expandedFullSections, setExpandedFullSections] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver,   setDragOver]   = useState<string | null>(null);
  const [calDate, setCalDate]       = useState(() => new Date());

  const [leftSearch, setLeftSearch]   = useState("");
  const [filterType, setFilterType]   = useState<string | null>(null);
  const [leftStatusFilter, setLeftStatusFilter] = useState<"all" | "free" | "in_use">("all");
  const [showFilter, setShowFilter]   = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Pinned equipment IDs — persisted per team in localStorage
  const pinnedKey = `equeue_pinned_${teamId}`;
  const disclaimerKey = `equeue_disclaimer_dismissed_${userId}`;
  const [disclaimerHidden, setDisclaimerHidden] = useState<boolean>(() => {
    try { return localStorage.getItem(disclaimerKey) === "1"; } catch { return false; }
  });
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(pinnedKey) ?? "null") ?? []; }
    catch { return []; }
  });
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Persist pinned IDs whenever they change
  useEffect(() => {
    try { localStorage.setItem(pinnedKey, JSON.stringify(pinnedIds)); } catch {}
  }, [pinnedIds, pinnedKey]);

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    if (showPicker) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilter(false);
      }
    };
    if (showFilter) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilter]);

  const togglePin = (id: string) => {
    setPinnedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Form state
  const [fEquipmentId, setFEquipmentId] = useState("");
  const [fScheduledAt, setFScheduledAt] = useState("");
  const [fDurH, setFDurH] = useState(1);
  const [fDurM, setFDurM] = useState(0);
  const [fNotes, setFNotes]             = useState("");
  const [fMaterial, setFMaterial]       = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [conflictError, setConflictError] = useState(false);

  // Edit state
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [eScheduledAt, setEScheduledAt]   = useState("");
  const [eDurH, setEDurH] = useState(1);
  const [eDurM, setEDurM] = useState(0);
  const [eNotes, setENotes]               = useState("");
  const [eMaterial, setEMaterial]         = useState("");
  const [eSaving, setESaving]             = useState(false);

  const calScrollRef = useRef<HTMLDivElement>(null);
  const [calPopup, setCalPopup] = useState<QueueEntry | null>(null);

  // ── Load equipment ──
  useEffect(() => {
    if (!teamId) return;
    supabase.schema("lab").from("equipment_profiles")
      .select("id, name, type, brand, model, description, ip_address, connected_robot_id, space_id, created_at")
      .eq("team_id", teamId)
      .then(({ data }) => { if (data) setEquipment(data as EquipmentProfile[]); });
  }, [teamId]);

  // ── Load entries ──
  const fetchEntries = useCallback(async () => {
    if (!teamId) return;
    const { data, error } = await supabase.schema("lab").from("equipment_queue_entries")
      .select("*").eq("team_id", teamId).neq("status", "cancelled")
      .order("scheduled_at", { ascending: true });
    if (error) {
      // Only show "table not found" banner if the error genuinely indicates a missing
      // table or unexposed schema. Transient errors (network, 5xx, auth) shouldn't
      // wipe the panel — keep showing existing entries.
      const msg = (error.message || "").toLowerCase();
      const code = (error.code || "").toString();
      const isMissingTable =
        code === "42P01" ||                       // postgres: undefined_table
        code === "PGRST205" ||                    // postgrest: table not in schema cache
        msg.includes("does not exist") ||
        msg.includes("could not find the table") ||
        msg.includes("schema cache");
      if (isMissingTable) setTableError(true);
      else console.error("[EquipmentQueue] Transient fetch error:", error);
    } else {
      setTableError(false);
      setEntries((data as QueueEntry[]) ?? []);
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Auto-refresh: re-fetch every 20s. Skip if tab is hidden or user is editing/adding.
  useEffect(() => {
    const POLL_MS = 20_000;
    const tick = () => {
      if (document.hidden) return;
      if (editingId !== null) return;
      if (showForm) return;
      fetchEntries();
    };
    const id = setInterval(tick, POLL_MS);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchEntries, editingId, showForm]);

  // Scroll calendar to 7am on mount
  useEffect(() => {
    if (calScrollRef.current) {
      calScrollRef.current.scrollTop = 7 * HOUR_PX;
    }
  }, []);

  // Re-evaluate auto-status every 30 seconds
  useEffect(() => {
    const id = setInterval(() => setEntries((prev) => [...prev]), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Add entry ──
  const handleAdd = async () => {
    if (!fEquipmentId || !fScheduledAt) return;
    const durH = fDurH + fDurM / 60;
    const newStart = new Date(fScheduledAt).getTime();
    const newEnd   = newStart + durH * 3_600_000;
    const conflict = entries.some((e) => {
      if (e.equipment_id !== fEquipmentId) return false;
      if (e.status === "done" || e.status === "cancelled") return false;
      const eStart = new Date(e.scheduled_at).getTime();
      const eEnd   = eStart + e.duration_hours * 3_600_000;
      return newStart < eEnd && newEnd > eStart;
    });
    if (conflict) { setConflictError(true); return; }
    setConflictError(false);
    setSubmitting(true);
    const newId = crypto.randomUUID();
    const payload = {
      id: newId, team_id: teamId, equipment_id: fEquipmentId,
      requested_by_user_id: userId, requested_by_name: userName,
      scheduled_at: new Date(fScheduledAt).toISOString(), duration_hours: durH,
      status: "waiting" as const, notes: fNotes.trim() || null,
      material: fMaterial || null,
      session_id: sessionId ?? null,
    };
    const { error } = await supabase.schema("lab").from("equipment_queue_entries").insert(payload);
    if (!error) {
      setEntries((prev) => [...prev, { ...payload, created_at: new Date().toISOString() }]);
      setCalDate(new Date(fScheduledAt));
      setFEquipmentId(""); setFScheduledAt(""); setFDurH(1); setFDurM(0); setFNotes(""); setFMaterial("");
      setConflictError(false);
      setShowForm(false);
    }
    setSubmitting(false);
  };

  // ── Save edit ──
  const handleSaveEdit = async (entryId: string) => {
    if (!eScheduledAt) return;
    setESaving(true);
    const updates = {
      scheduled_at: new Date(eScheduledAt).toISOString(),
      duration_hours: eDurH + eDurM / 60,
      notes: eNotes.trim() || null,
      material: eMaterial || null,
    };
    const { error } = await supabase.schema("lab").from("equipment_queue_entries")
      .update(updates).eq("id", entryId);
    if (!error) {
      setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, ...updates } : e));
      setEditingId(null);
    }
    setESaving(false);
  };

  const openEdit = (entry: QueueEntry) => {
    // Convert stored ISO to datetime-local value (strip seconds/ms)
    const local = new Date(entry.scheduled_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    const dtLocal = `${local.getFullYear()}-${pad(local.getMonth()+1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
    setEScheduledAt(dtLocal);
    setEDurH(Math.floor(entry.duration_hours));
    setEDurM(Math.round((entry.duration_hours % 1) * 60));
    setENotes(entry.notes ?? "");
    setEMaterial(entry.material ?? "");
    setEditingId(entry.id);
  };

  // ── Cancel entry ──
  const handleCancel = async (entryId: string) => {
    await supabase.schema("lab").from("equipment_queue_entries")
      .update({ status: "cancelled" }).eq("id", entryId);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  const handleKanbanDrop = async (targetStatus: QueueEntry["status"]) => {
    setDragOver(null);
    if (!draggingId) return;
    const entry = entries.find((e) => e.id === draggingId);
    if (!entry || entry.status === targetStatus) { setDraggingId(null); return; }
    await supabase.schema("lab").from("equipment_queue_entries")
      .update({ status: targetStatus }).eq("id", draggingId);
    setEntries((prev) => prev.map((e) => e.id === draggingId ? { ...e, status: targetStatus } : e));
    setDraggingId(null);
  };

  const getEq   = (id: string) => equipment.find((e) => e.id === id);
  const getEqName = (id: string) => getEq(id)?.name ?? "Equipment";
  const isPrinter = (id: string) => /printer|3d|impresora/i.test(getEq(id)?.name ?? "");
  const getEqColor = (id: string) => {
    const idx = equipment.findIndex((e) => e.id === id);
    return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
  };

  // ── Derived data ──
  const midEntries = entries.filter((e) =>
    !selectedEqId || e.equipment_id === selectedEqId
  );

  const calEntries = (() => {
    const dayStart = new Date(calDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(calDate); dayEnd.setHours(24, 0, 0, 0);
    return entries.filter((e) => {
      const s = new Date(e.scheduled_at).getTime();
      const end = s + e.duration_hours * 3_600_000;
      return s < dayEnd.getTime() && end > dayStart.getTime();
    });
  })();

  // ── Table not set up ──
  if (tableError) {
    return (
      <div className="equeue_root">
        <div className="equeue_toolbar">
          <div className="equeue_titleRow">
            <h2 className="equeue_h1">Equipment Queue</h2>
          </div>
        </div>
        <div className="equeue_setupWrap">
          <div className="equeue_setupNotice">
            <span className="equeue_setupIcon">⚠</span>
            <p className="equeue_setupTitle">Tabla no encontrada</p>
            <p className="equeue_setupDesc">Ejecuta esta migración en el SQL editor de Supabase:</p>
            <pre className="equeue_setupSql">{SETUP_SQL}</pre>
            <button type="button" className="equeue_btnSave"
              onClick={() => { setTableError(false); setLoading(true); fetchEntries(); }}>
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Open form and pre-fill equipment ──
  const openForm = (eqId?: string) => {
    setFEquipmentId(eqId ?? selectedEqId ?? "");
    setShowForm(true);
  };

  return (
    <div className="equeue_root" data-theme={theme}>

      {/* ── Toolbar ── */}
      <div className="equeue_toolbar">
        <div className="equeue_toolbarLeft">
          <div className="equeue_titleRow">
            {onExpandSidebar && (
              <button type="button" className="equeue_expandBtn" onClick={onExpandSidebar}>
                <ChevronLeft size={16} />
              </button>
            )}
            <h2 className="equeue_h1">{title}</h2>
          </div>
          <span className="equeue_toolbarSub">{subtitle}</span>
        </div>
        <div className="equeue_toolbarRight">
          {/* Picker — "Add Equipment" */}
          <div className="equeue_toolbarPickerWrap" ref={pickerRef}>
            <button type="button" className="equeue_addBtn"
              onClick={() => setShowPicker((v) => !v)}>
              <Plus size={13} />
              Add Equipment
            </button>
            {showPicker && (
              <div className="equeue_picker equeue_picker--toolbar">
                <div className="equeue_pickerHeader">Selecciona equipos</div>
                {equipment.length === 0 ? (
                  <div className="equeue_pickerEmpty">Sin equipos registrados</div>
                ) : (
                  equipment.map((eq) => {
                    const pinned = pinnedIds.includes(eq.id);
                    return (
                      <button key={eq.id} type="button"
                        className={`equeue_pickerItem${pinned ? " is-checked" : ""}`}
                        onClick={() => togglePin(eq.id)}>
                        <span className="equeue_pickerItemIcon">{equipmentTypeIcon(eq.type, 14)}</span>
                        <span className="equeue_pickerItemName">{eq.name}</span>
                        {pinned && <Check size={13} className="equeue_pickerCheck" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <button type="button" className="equeue_btnIcon" onClick={fetchEntries} title="Recargar">
            <RefreshCw size={14} />
          </button>
          <button type="button" className="equeue_btnIcon" onClick={openSettings} title="Configuración">
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* ── Sub-bar (between title and panels) ── */}
      {(() => {
        const now = new Date();
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

        // Disponibles ahora
        const inUseEqIds = new Set(
          entries.filter((e) => effectiveStatus(e) === "in_use").map((e) => e.equipment_id)
        );
        const pinnedEq = equipment.filter((eq) => pinnedIds.includes(eq.id));
        const totalPinned = pinnedEq.length;
        const freeEq = pinnedEq.filter((eq) => !inUseEqIds.has(eq.id));
        const freeCount = freeEq.length;
        const freeNames = freeEq.slice(0, 2).map((eq) => eq.name).join(", ");
        const freeMore = freeCount > 2 ? `, +${freeCount - 2}` : "";

        // Próxima reserva — cualquier reserva con scheduled_at en el futuro
        const proxima = entries
          .filter((e) => new Date(e.scheduled_at).getTime() > now.getTime())
          .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
        const proximaMinutes = proxima
          ? Math.max(0, Math.round((new Date(proxima.scheduled_at).getTime() - now.getTime()) / 60000))
          : 0;

        // Reservas hoy
        const todayEntries = entries.filter((e) => {
          const t = new Date(e.scheduled_at).getTime();
          return t >= todayStart.getTime() && t <= todayEnd.getTime();
        });
        const todayCount = todayEntries.length;
        const todayCupo = Math.max(todayCount, totalPinned * 8);
        const todayDone = todayEntries.filter((e) => effectiveStatus(e) === "done").length;
        const todayInUse = todayEntries.filter((e) => effectiveStatus(e) === "in_use").length;

        // Utilización semanal + bars per day (semana lunes→domingo)
        const weekStart = new Date(now);
        weekStart.setHours(0, 0, 0, 0);
        const dow = weekStart.getDay(); // Sun=0..Sat=6
        weekStart.setDate(weekStart.getDate() - ((dow + 6) % 7)); // back to Monday
        const dayHours: number[] = Array.from({ length: 7 }, (_, i) => {
          const dayStart = new Date(weekStart);
          dayStart.setDate(dayStart.getDate() + i);
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);
          return entries
            .filter((e) => {
              const t = new Date(e.scheduled_at).getTime();
              return t >= dayStart.getTime() && t < dayEnd.getTime();
            })
            .reduce((a, e) => a + e.duration_hours, 0);
        });
        // Cap realista: 8h × 5 días laborales por equipo = 40h/semana por equipo
        const weekCapPerEq = 8 * 5;
        const weekHours = dayHours.reduce((a, h) => a + h, 0);
        const totalCap = totalPinned * weekCapPerEq;
        const utilizacion = totalCap === 0 ? 0 : Math.round((weekHours / totalCap) * 100);
        const maxDayH = Math.max(1, ...dayHours);

        return (
          <div className="equeue_subBar">
            <div className="equeue_subKpiCard">
              <span className="equeue_subKpiLabel">Disponibles ahora</span>
              <div className="equeue_subKpiRow">
                <span className="equeue_subKpiValue">{freeCount}</span>
                <span className="equeue_subKpiUnit">/ {totalPinned}<br/><span className="equeue_subKpiUnitSm">equipos</span></span>
              </div>
              <span className="equeue_subKpiSub">
                <span className="equeue_subKpiDot" style={{ background: "var(--st-ok)" }} />
                {freeNames || "—"}{freeMore} {freeCount > 0 && "libres"}
              </span>
            </div>

            <div className="equeue_subKpiCard">
              <span className="equeue_subKpiLabel">Próxima reserva</span>
              <div className="equeue_subKpiRow">
                <span className="equeue_subKpiValue">
                  {proxima ? fmtTime(proxima.scheduled_at) : "—"}
                </span>
                {proxima && (
                  <span className="equeue_subKpiUnit">
                    en {proximaMinutes}<br/><span className="equeue_subKpiUnitSm">min</span>
                  </span>
                )}
              </div>
              <span className="equeue_subKpiSub">
                {proxima
                  ? <>{proxima.requested_by_name} · <strong>{getEqName(proxima.equipment_id)}</strong> · {fmtDurCompact(proxima.duration_hours)}</>
                  : "Sin reservas próximas"}
              </span>
            </div>

            <div className="equeue_subKpiCard">
              <span className="equeue_subKpiLabel">Reservas hoy</span>
              <div className="equeue_subKpiRow">
                <span className="equeue_subKpiValue">{todayCount}</span>
                <span className="equeue_subKpiUnit">/ {todayCupo}<br/><span className="equeue_subKpiUnitSm">cupo</span></span>
              </div>
              <span className="equeue_subKpiSub">
                <span style={{ color: "var(--st-ok)" }}>{todayDone} completadas</span>
                {" · "}
                <span style={{ color: "var(--st-warning)" }}>{todayInUse} en curso</span>
              </span>
            </div>

            <div className="equeue_subKpiCard">
              <span className="equeue_subKpiLabel">Utilización semanal</span>
              <div className="equeue_subKpiRow">
                <span className="equeue_subKpiValue" style={{ color: utilizacion > 70 ? "var(--st-warning)" : "var(--pmt-text)" }}>
                  {utilizacion}
                </span>
                <span className="equeue_subKpiUnit">%</span>
                <div className="equeue_subKpiBars">
                  {dayHours.map((h, i) => (
                    <span key={i} className="equeue_subKpiBar"
                      style={{ height: `${Math.max(8, (h / maxDayH) * 100)}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 3-panel body ── */}
      <div className={`equeue_body${midView === "kanban" ? " equeue_body--kanban" : ""}`}>

        {/* ── LEFT: Equipment list ── */}
        <div className="equeue_leftPanel">
          {/* Search + filter bar */}
          <div className="equeue_leftTopBar">
            <div className="equeue_leftSearchWrap">
              <Search size={13} className="equeue_leftSearchIcon" />
              <input
                type="text"
                placeholder="Buscar equipos..."
                value={leftSearch}
                onChange={(e) => setLeftSearch(e.target.value)}
                className="equeue_leftSearchInput"
              />
            </div>

            <div className="equeue_leftFilterWrap" ref={filterRef}>
              <button
                type="button"
                className={`equeue_leftFilterBtn${filterType ? " is-active" : ""}`}
                title="Filtrar por tipo"
                onClick={() => setShowFilter((v) => !v)}
              >
                <Filter size={13} />
              </button>
              {showFilter && (
                <div className="equeue_filterDropdown">
                  <div className="equeue_pickerHeader">Tipo de equipo</div>
                  <button
                    type="button"
                    className={`equeue_pickerItem${!filterType ? " is-checked" : ""}`}
                    onClick={() => { setFilterType(null); setShowFilter(false); }}
                  >
                    <span className="equeue_pickerItemName">Todos</span>
                    {!filterType && <Check size={13} className="equeue_pickerCheck" />}
                  </button>
                  {EQUIPMENT_TYPES.filter((t) =>
                    equipment.some((eq) => pinnedIds.includes(eq.id) && eq.type === t.value)
                  ).map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={`equeue_pickerItem${filterType === t.value ? " is-checked" : ""}`}
                      onClick={() => { setFilterType(t.value); setShowFilter(false); }}
                    >
                      <span className="equeue_pickerItemIcon">{equipmentTypeIcon(t.value, 13)}</span>
                      <span className="equeue_pickerItemName">{t.label}</span>
                      {filterType === t.value && <Check size={13} className="equeue_pickerCheck" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Status filter chips */}
          {pinnedIds.length > 0 && (() => {
            const total = pinnedIds.length;
            const inUseCount = pinnedIds.filter((id) =>
              entries.some((e) => e.equipment_id === id && effectiveStatus(e) === "in_use")
            ).length;
            const freeCount = total - inUseCount;
            return (
              <div className="equeue_leftStatusFilter">
                <button type="button"
                  className={`equeue_leftStatusChip${leftStatusFilter === "all" ? " is-active" : ""}`}
                  onClick={() => setLeftStatusFilter("all")}>
                  Todos <span className="equeue_leftStatusChipCount">{total}</span>
                </button>
                <button type="button"
                  className={`equeue_leftStatusChip${leftStatusFilter === "free" ? " is-active" : ""}`}
                  onClick={() => setLeftStatusFilter("free")}>
                  Libres <span className="equeue_leftStatusChipCount">{freeCount}</span>
                </button>
                <button type="button"
                  className={`equeue_leftStatusChip${leftStatusFilter === "in_use" ? " is-active" : ""}`}
                  onClick={() => setLeftStatusFilter("in_use")}>
                  En uso <span className="equeue_leftStatusChipCount">{inUseCount}</span>
                </button>
              </div>
            );
          })()}

          {/* Pinned equipment cards */}
          {pinnedIds.length === 0 ? (
            <div className="equeue_leftEmpty">
              Usa "Add Equipment" para agregar equipos aquí
            </div>
          ) : (
            equipment.filter((eq) => {
              if (!pinnedIds.includes(eq.id)) return false;
              if (filterType && eq.type !== filterType) return false;
              if (leftSearch && !eq.name.toLowerCase().includes(leftSearch.toLowerCase()) &&
                  !(eq.brand ?? "").toLowerCase().includes(leftSearch.toLowerCase())) return false;
              if (leftStatusFilter !== "all") {
                const eqInUse = entries.some((e) => e.equipment_id === eq.id && effectiveStatus(e) === "in_use");
                if (leftStatusFilter === "in_use" && !eqInUse) return false;
                if (leftStatusFilter === "free" && eqInUse) return false;
              }
              return true;
            }).map((eq) => {
              const inUse   = entries.some((e) => e.equipment_id === eq.id && effectiveStatus(e) === "in_use");
              const waiting = entries.filter((e) => e.equipment_id === eq.id && effectiveStatus(e) === "waiting").length;
              const isActive = selectedEqId === eq.id;
              const color = getEqColor(eq.id);
              return (
                <button key={eq.id} type="button"
                  className={`equeue_eqItem${isActive ? " is-active" : ""}`}
                  style={{ borderLeft: `3px solid ${color.border}` }}
                  onClick={() => setSelectedEqId(isActive ? null : eq.id)}>
                  <div className="equeue_eqItemBody">
                    <span className="equeue_eqItemName">{eq.name}</span>
                    {(eq.brand || eq.model) && (
                      <span className="equeue_eqItemSub">
                        {[eq.brand, eq.model].filter(Boolean).join(" ")}
                      </span>
                    )}
                    {waiting > 0 && (
                      <span className="equeue_eqItemBadge">{waiting} en espera</span>
                    )}
                  </div>
                  <div className="equeue_eqItemIcon">
                    {equipmentTypeIcon(eq.type, 22)}
                    {inUse && <span className="equeue_eqItemDot" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* ── MIDDLE + RIGHT wrapper (for spanning disclaimer) ── */}
        <div className="equeue_midRightWrap">
          {/* Disclaimer — arriba, span mid + right (dismissible) */}
          {!disclaimerHidden && (
            <div className="equeue_disclaimer">
              <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Usa <strong>Añadir Reserva</strong> para crear nuevas reservas · En{" "}
                <strong>Kanban</strong> arrastra tarjetas entre columnas para cambiar su
                estado · Arrastrar a <strong>Fallido</strong> cancela la entrada · El
                estado se actualiza automáticamente según el horario
              </span>
              <button type="button" className="equeue_disclaimerClose"
                onClick={() => {
                  setDisclaimerHidden(true);
                  try { localStorage.setItem(disclaimerKey, "1"); } catch {}
                }}
                title="Ocultar">
                <X size={13} />
              </button>
            </div>
          )}
          <div className="equeue_midRightTop">

        {/* ── MIDDLE: Queue entries ── */}
        <div className="equeue_midPanel">
          {/* Equipment context bar (single-equipment view) */}
          {selectedEqId && (
            <div className="equeue_midEqBar">
              <button type="button" className="equeue_midEqBack"
                onClick={() => setSelectedEqId(null)} title="Volver a vista general">
                <ChevronLeft size={15} />
              </button>
              <span className="equeue_midEqName">
                {getEqName(selectedEqId)}
              </span>
            </div>
          )}

          {/* Tab bar */}
          <div className="equeue_midBar">
            <div className="equeue_midTabs">
              <button type="button"
                className={`equeue_midTab${midView === "list" ? " is-active" : ""}`}
                onClick={() => setMidView("list")}>
                <span className="equeue_midTabLabel">Reservas</span> <span className="equeue_midTabCount">{midEntries.length}</span>
              </button>
              <button type="button"
                className={`equeue_midTab${midView === "rules" ? " is-active" : ""}`}
                onClick={() => setMidView("rules")}>
                <span className="equeue_midTabLabel">Reglas</span> <span className="equeue_midTabCount">{rules.length}</span>
              </button>
              <button type="button"
                className={`equeue_midTab${midView === "kanban" ? " is-active" : ""}`}
                onClick={() => setMidView("kanban")}>
                <span className="equeue_midTabLabel">Kanban</span>
              </button>
            </div>
            <div className="equeue_midBarActions">
              {disclaimerHidden && (
                <button type="button" className="equeue_infoBtn"
                  onClick={() => {
                    setDisclaimerHidden(false);
                    try { localStorage.removeItem(disclaimerKey); } catch {}
                  }}
                  title="Mostrar información">
                  <Info size={13} />
                </button>
              )}
              {(midView === "list" || midView === "kanban") && (
                <button type="button" className="equeue_addBtn" onClick={() => openForm()}>
                  <Plus size={13} /> Añadir
                </button>
              )}
            </div>
          </div>

          {/* Rules view */}
          {midView === "rules" && (
            <div className="equeue_rulesPanel">
              <div className="equeue_rulesToolbar">
                <button type="button" className="equeue_addBtn"
                  onClick={() => { setShowRuleForm(true); setEditRuleId(null); }}>
                  <Plus size={13} /> Agregar regla
                </button>
              </div>

              {showRuleForm && (
                <div className="equeue_ruleFormCard">
                  <div className="equeue_ruleFormField">
                    <label>Título</label>
                    <input type="text" value={rTitle}
                      onChange={(e) => setRTitle(e.target.value)} placeholder="Nombre de la regla" />
                  </div>
                  <div className="equeue_ruleFormField">
                    <label>Icono</label>
                    <div className="equeue_iconPicker">
                      {Object.keys(RULE_ICONS).map((key) => (
                        <button key={key} type="button"
                          className={`equeue_iconOption${rIcon === key ? " is-active" : ""}`}
                          onClick={() => setRIcon(key)} title={key}>
                          <RuleIcon name={key} size={15} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="equeue_ruleFormField">
                    <label>Descripción</label>
                    <input type="text" value={rDesc}
                      onChange={(e) => setRDesc(e.target.value)} placeholder="Describe la regla..." />
                  </div>
                  <div className="equeue_ruleFormActions">
                    <button type="button" className="equeue_btnCancel"
                      onClick={() => { setShowRuleForm(false); setRIcon(RULE_ICON_DEFAULT); setRTitle(""); setRDesc(""); }}>
                      Cancelar
                    </button>
                    <button type="button" className="equeue_btnSave"
                      disabled={!rTitle.trim()} onClick={handleAddRule}>
                      Agregar
                    </button>
                  </div>
                </div>
              )}

              {rules.length === 0 && !showRuleForm ? (
                <div className="equeue_rulesEmpty"><span>Sin reglas configuradas</span></div>
              ) : (
                <div className="equeue_rulesList">
                  {rules.map((rule) => {
                    const isEditingRule = editRuleId === rule.id;
                    return (
                      <div key={rule.id} className="equeue_ruleCard">
                        <div className="equeue_ruleIconWrap">
                          <RuleIcon name={rule.icon} size={16} />
                        </div>
                        <div className="equeue_ruleBody">
                          {isEditingRule ? (
                            <div className="equeue_ruleEditForm">
                              <div className="equeue_ruleFormField">
                                <label>Título</label>
                                <input type="text" value={erTitle}
                                  onChange={(e) => setErTitle(e.target.value)} />
                              </div>
                              <div className="equeue_ruleFormField">
                                <label>Icono</label>
                                <div className="equeue_iconPicker">
                                  {Object.keys(RULE_ICONS).map((key) => (
                                    <button key={key} type="button"
                                      className={`equeue_iconOption${erIcon === key ? " is-active" : ""}`}
                                      onClick={() => setErIcon(key)} title={key}>
                                      <RuleIcon name={key} size={15} />
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="equeue_ruleFormField">
                                <label>Descripción</label>
                                <input type="text" value={erDesc}
                                  onChange={(e) => setErDesc(e.target.value)} />
                              </div>
                              <div className="equeue_ruleFormActions">
                                <button type="button" className="equeue_editDelete"
                                  onClick={() => handleDeleteRule(rule.id)}>Eliminar</button>
                                <div style={{ display:"flex", gap:6 }}>
                                  <button type="button" className="equeue_btnCancel"
                                    onClick={() => setEditRuleId(null)}>Cancelar</button>
                                  <button type="button" className="equeue_btnSave"
                                    disabled={!erTitle.trim()}
                                    onClick={() => handleSaveRule(rule.id)}>Guardar</button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="equeue_ruleTop">
                                <span className="equeue_ruleNum">
                                  {String(rule.order).padStart(2, "0")}
                                </span>
                                <span className="equeue_ruleTitle">{rule.title}</span>
                              </div>
                              {rule.description && (
                                <span className="equeue_ruleDesc">{rule.description}</span>
                              )}
                            </>
                          )}
                        </div>
                        {!isEditingRule && (
                          <button type="button" className="equeue_midCardEdit"
                            onClick={() => openEditRule(rule)} title="Editar regla">
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Kanban view */}
          {midView === "kanban" && (
            <>
            <div className="equeue_kanban">
              {KANBAN_COLS.map(({ status, label, dot }) => {
                const colEntries = midEntries.filter((e) => effectiveStatus(e) === status);
                const isOver = dragOver === status;
                return (
                  <div key={status}
                    className={`equeue_kanbanCol${isOver ? " is-over" : ""}`}
                    onDragOver={(ev) => { ev.preventDefault(); setDragOver(status); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => handleKanbanDrop(status)}>
                    <div className="equeue_kanbanColHead">
                      <span className="equeue_kanbanDot" style={{ background: dot }} />
                      <span className="equeue_kanbanColLabel">{label}</span>
                      <span className="equeue_kanbanCount">{colEntries.length}</span>
                    </div>
                    <div className="equeue_kanbanCards">
                      {colEntries.length === 0 ? (
                        <div className="equeue_kanbanEmpty">Arrastra aquí</div>
                      ) : (
                        colEntries.map((entry) => {
                          const eq = getEq(entry.equipment_id);
                          const color = getEqColor(entry.equipment_id);
                          const ac = avatarColor(entry.requested_by_name);
                          return (
                            <div key={entry.id}
                              className="equeue_kanbanCard"
                              draggable
                              onDragStart={() => setDraggingId(entry.id)}
                              onDragEnd={() => { setDraggingId(null); setDragOver(null); }}>
                              <span className="equeue_kanbanCardBar" style={{ background: color.border }} />
                              <button type="button" className="equeue_kanbanCardX"
                                onClick={() => handleCancel(entry.id)} title="Eliminar">
                                <X size={11} />
                              </button>
                              <span className="equeue_kanbanCardAvatar"
                                style={{ background: ac.bg, color: ac.text }}>
                                {entry.requested_by_name.charAt(0).toUpperCase()}
                              </span>
                              <div className="equeue_kanbanCardBody">
                                <span className="equeue_kanbanCardName">{entry.requested_by_name}</span>
                                <div className="equeue_kanbanCardSubRow">
                                  {eq && (
                                    <span className="equeue_kanbanCardEq">
                                      {equipmentTypeIcon(eq.type, 10)}
                                      {eq.name}
                                    </span>
                                  )}
                                  <span className="equeue_midCardSep">·</span>
                                  <span>{fmtTime(entry.scheduled_at)}</span>
                                  {entry.material && (
                                    <span className="equeue_midCardMaterial">{entry.material}</span>
                                  )}
                                </div>
                              </div>
                              <div className="equeue_kanbanCardRight">
                                <span className="equeue_kanbanCardDur">{fmtDurCompact(entry.duration_hours)}</span>
                                <span className="equeue_kanbanCardRem">{entryRemainingLabel(entry, status)}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            </>
          )}

          {/* Sections */}
          {midView === "list" && (<>
            <div className="equeue_midScroll">
            {loading ? (
              <div className="equeue_loading">Cargando...</div>
            ) : (
              SECTION_ORDER.map((status) => {
                const sectionEntries = midEntries.filter((e) => effectiveStatus(e) === status);
                const isEmpty = sectionEntries.length === 0;
                const userToggled = collapsedSections.has(status);
                const isCollapsed = isEmpty ? !userToggled : userToggled;
                const isFullExpanded = expandedFullSections.has(status);
                const visibleEntries = isFullExpanded
                  ? sectionEntries
                  : sectionEntries.slice(0, SECTION_VISIBLE);
                const hiddenEntries = isFullExpanded
                  ? []
                  : sectionEntries.slice(SECTION_VISIBLE);
                const hiddenDur = hiddenEntries.reduce((a, e) => a + e.duration_hours, 0);
                return (
                  <div key={status} className="equeue_midSection">
                    <button type="button" className="equeue_midSectionHeader"
                      onClick={() => {
                        setCollapsedSections((prev) => {
                          const n = new Set(prev);
                          if (n.has(status)) n.delete(status); else n.add(status);
                          return n;
                        });
                      }}>
                      <ChevronDown size={12}
                        className={`equeue_midSectionChevron${isCollapsed ? " is-collapsed" : ""}`} />
                      <span className="equeue_midSectionDot" style={{ background: STATUS_DOT[status] }} />
                      <span className="equeue_midSectionLabel">{SECTION_LABEL[status]}</span>
                      <span className="equeue_midSectionCount">· {sectionEntries.length}</span>
                    </button>

                    {isCollapsed ? null : isEmpty ? (
                      <div className="equeue_midEmpty">Sin entradas</div>
                    ) : (
                      visibleEntries.map((entry) => {
                        const eq = getEq(entry.equipment_id);
                        const isEditing = editingId === entry.id;
                        return (
                          <div key={entry.id}
                            className={`equeue_midCard${isEditing ? " is-editing" : ""}`}>

                            <div className="equeue_midCardLeft">
                              {(() => {
                                const c = avatarColor(entry.requested_by_name);
                                return (
                                  <span className="equeue_midCardAvatar"
                                    style={{ background: c.bg, color: c.text, borderColor: c.bg }}>
                                    {entry.requested_by_name.charAt(0).toUpperCase()}
                                  </span>
                                );
                              })()}
                            </div>

                            <div className="equeue_midCardBody">
                              {isEditing ? (
                                /* ── Edit form ── */
                                <div className="equeue_editForm" onClick={(e) => e.stopPropagation()}>
                                  <div className="equeue_editRow">
                                    <div className="equeue_editField">
                                      <label>Fecha y hora</label>
                                      <input type="datetime-local" value={eScheduledAt}
                                        onChange={(e) => setEScheduledAt(e.target.value)} />
                                    </div>
                                    <div className="equeue_editField equeue_editField--sm">
                                      <label>Duración</label>
                                      <div className="equeue_durRow">
                                        <input type="number" min="0" max="23" value={eDurH}
                                          onChange={(e) => setEDurH(Math.max(0, Math.min(23, Number(e.target.value))))} />
                                        <span>h</span>
                                        <input type="number" min="0" max="59" value={eDurM}
                                          onChange={(e) => setEDurM(Math.max(0, Math.min(59, Number(e.target.value))))} />
                                        <span>min</span>
                                      </div>
                                    </div>
                                  </div>
                                  {isPrinter(entry.equipment_id) && (
                                    <div className="equeue_editField">
                                      <label>Material</label>
                                      <OrionSelect
                                        value={eMaterial}
                                        options={[{ value: "", label: "— Selecciona material —" }, ...["PLA","PETG","ABS","TPU","ASA","Nylon","Resina","Fibra de carbono"].map((m) => ({ value: m, label: m }))]}
                                        onChange={setEMaterial}
                                      />
                                    </div>
                                  )}
                                  <div className="equeue_editField">
                                    <label>Descripción</label>
                                    <input type="text" placeholder="Notas..."
                                      value={eNotes} onChange={(e) => setENotes(e.target.value)} />
                                  </div>
                                  <div className="equeue_editActions">
                                    <button type="button" className="equeue_editDelete"
                                      onClick={() => handleCancel(entry.id)}>
                                      Eliminar
                                    </button>
                                    <div className="equeue_editActionRight">
                                      <button type="button" className="equeue_btnCancel"
                                        onClick={() => setEditingId(null)}>Cancelar</button>
                                      <button type="button" className="equeue_btnSave"
                                        disabled={eSaving || !eScheduledAt}
                                        onClick={() => handleSaveEdit(entry.id)}>
                                        {eSaving ? "Guardando..." : "Guardar"}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                /* ── Normal view ── */
                                <>
                                  <div className="equeue_midCardTopRow">
                                    <span className="equeue_midCardUser">{entry.requested_by_name}</span>
                                    <span className="equeue_midCardDot">·</span>
                                    <span className="equeue_midCardEq">
                                      {eq && equipmentTypeIcon(eq.type, 12)}
                                      {getEqName(entry.equipment_id)}
                                    </span>
                                  </div>
                                  <div className="equeue_midCardSubRow">
                                    {entry.notes && (
                                      <>
                                        <span className="equeue_midCardNotes">{entry.notes}</span>
                                        <span className="equeue_midCardSep">·</span>
                                      </>
                                    )}
                                    <span>{entryScheduleLabel(entry, status)}</span>
                                    {entry.material && (
                                      <>
                                        <span className="equeue_midCardSep">·</span>
                                        <span className="equeue_midCardMaterial">{entry.material}</span>
                                      </>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>

                            {!isEditing && (
                              <div className="equeue_midCardRight">
                                <span className="equeue_midCardDur">{fmtDurCompact(entry.duration_hours)}</span>
                                <span className="equeue_midCardRem">{entryRemainingLabel(entry, status)}</span>
                              </div>
                            )}

                            {!isEditing && entry.requested_by_user_id === userId && (
                              <button type="button" className="equeue_midCardEdit"
                                onClick={(ev) => { ev.stopPropagation(); openEdit(entry); }}
                                title="Editar">
                                <Pencil size={12} />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}

                    {!isCollapsed && !isEmpty && (hiddenEntries.length > 0 || isFullExpanded && sectionEntries.length > SECTION_VISIBLE) && (
                      <button type="button" className="equeue_midSectionMore"
                        onClick={() => {
                          setExpandedFullSections((prev) => {
                            const n = new Set(prev);
                            if (n.has(status)) n.delete(status); else n.add(status);
                            return n;
                          });
                        }}>
                        <ChevronDown size={12}
                          className={`equeue_midSectionMoreChevron${isFullExpanded ? " is-up" : ""}`} />
                        <span className="equeue_midSectionMoreLabel">
                          {isFullExpanded
                            ? `Ver menos ${SECTION_MORE_LABEL[status]}`
                            : `Ver ${hiddenEntries.length} más ${SECTION_MORE_LABEL[status]}`}
                        </span>
                        {!isFullExpanded && hiddenDur > 0 && (
                          <span className="equeue_midSectionMoreDur">≈ {fmtDurCompact(hiddenDur)}</span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })
            )}
            </div>
          </>)}

        </div>

        {/* ── RIGHT: Day calendar ── */}
        <div className="equeue_rightPanel">
          <div className="equeue_calHeader">
            <button type="button" className="equeue_calTodayBtn"
              onClick={() => setCalDate(new Date())}>
              → Hoy
            </button>
            <button type="button" className="equeue_calNavBtn"
              onClick={() => setCalDate((d) => addDays(d, -1))}>
              <ChevronLeft size={14} />
            </button>
            <button type="button" className="equeue_calNavBtn"
              onClick={() => setCalDate((d) => addDays(d, 1))}>
              <ChevronRight size={14} />
            </button>
            <span className="equeue_calDateLabel">{fmtCalHeader(calDate)}</span>
          </div>

          <div className="equeue_calScroll" ref={calScrollRef}>
            <div className="equeue_calGrid" style={{ height: (CAL_END - CAL_START) * HOUR_PX }}>
              {/* Hour lines */}
              {Array.from({ length: CAL_END - CAL_START }, (_, i) => CAL_START + i).map((h) => (
                <div key={h} className="equeue_calHourRow"
                  style={{ top: (h - CAL_START) * HOUR_PX }}>
                  <span className="equeue_calHourLabel">{h}</span>
                  <span className="equeue_calHourLine" />
                </div>
              ))}

              {/* Current time line */}
              {isSameDay(calDate, new Date()) && (() => {
                const now = new Date();
                const frac = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
                if (frac < CAL_START || frac > CAL_END) return null;
                const top = (frac - CAL_START) * HOUR_PX;
                return (
                  <div className="equeue_calNowLine" style={{ top }}>
                    <span className="equeue_calNowLabel">
                      {String(now.getHours()).padStart(2, "0")}:
                      {String(now.getMinutes()).padStart(2, "0")}
                    </span>
                    <span className="equeue_calNowDot" />
                    <span className="equeue_calNowBar" />
                  </div>
                );
              })()}

              {/* Events */}
              {computeCalLayout(calEntries).map((entry) => {
                const dayStartMs = (() => { const d = new Date(calDate); d.setHours(0,0,0,0); return d.getTime(); })();
                const entryStartMs = new Date(entry.scheduled_at).getTime();
                const entryEndMs   = entryStartMs + entry.duration_hours * 3_600_000;

                // Clamp to [CAL_START, CAL_END] within this day
                const startFrac = Math.max(CAL_START, (entryStartMs - dayStartMs) / 3_600_000);
                const endFrac   = Math.min(CAL_END,   (entryEndMs   - dayStartMs) / 3_600_000);
                if (startFrac >= CAL_END || endFrac <= CAL_START) return null;

                const topPx    = (startFrac - CAL_START) * HOUR_PX;
                const heightPx = Math.max((endFrac - startFrac) * HOUR_PX, 28);

                const continuesFromPrev = entryStartMs < dayStartMs;
                const continuesToNext  = entryEndMs > dayStartMs + 24 * 3_600_000;

                const eq    = getEq(entry.equipment_id);
                const colW  = `calc((100% - 8px) / ${entry.totalCols} - 2px)`;
                const colL  = `calc(4px + (100% - 8px) * ${entry.col} / ${entry.totalCols})`;
                const color = getEqColor(entry.equipment_id);
                return (
                  <div key={entry.id} className="equeue_calEvent"
                    style={{
                      top: topPx, height: heightPx, left: colL, width: colW, right: "auto",
                      background: color.bg, borderLeftColor: color.border, cursor: "pointer",
                      ...(continuesFromPrev ? { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: `2px dashed ${color.border}` } : {}),
                      ...(continuesToNext   ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: `2px dashed ${color.border}` } : {}),
                    }}
                    onClick={() => setCalPopup(entry)}>
                    <span className="equeue_calEventTitle" style={{ color: color.text }}>
                      {eq ? eq.name : "Equipment"}
                    </span>
                    <span className="equeue_calEventSub">{entry.requested_by_name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        </div>{/* equeue_midRightTop */}

        </div>{/* equeue_midRightWrap */}

      </div>{/* equeue_body */}

      {/* ── Add entry modal ── */}
      {showForm && (
        <>
          <div className="equeue_modalOverlay" onClick={() => { setShowForm(false); setConflictError(false); }} />
          <div className="equeue_modal">
            <div className="equeue_formHeader">
              <span className="equeue_formTitle">Nueva reserva</span>
              <button type="button" className="equeue_formClose" onClick={() => { setShowForm(false); setConflictError(false); }}>
                <X size={14} />
              </button>
            </div>
            <div className="equeue_formBody">
              <div className="equeue_formField">
                <label>Equipo</label>
                <OrionSelect
                  value={fEquipmentId}
                  options={[{ value: "", label: "Selecciona un equipo..." }, ...equipment.filter((eq) => pinnedIds.includes(eq.id)).map((eq) => ({ value: eq.id, label: eq.name + (eq.brand ? ` · ${eq.brand}` : "") }))]}
                  onChange={(v) => { setFEquipmentId(v); setConflictError(false); }}
                />
              </div>
              <div className="equeue_formRow">
                <div className="equeue_formField">
                  <label>¿Cuándo lo necesitas?</label>
                  <input type="datetime-local" value={fScheduledAt}
                    onChange={(e) => { setFScheduledAt(e.target.value); setConflictError(false); }} />
                </div>
                <div className="equeue_formField">
                  <label>Duración</label>
                  <div className="equeue_durRow">
                    <input type="number" min="0" max="23" value={fDurH}
                      onChange={(e) => setFDurH(Math.max(0, Math.min(23, Number(e.target.value))))} />
                    <span>h</span>
                    <input type="number" min="0" max="59" value={fDurM}
                      onChange={(e) => setFDurM(Math.max(0, Math.min(59, Number(e.target.value))))} />
                    <span>min</span>
                  </div>
                </div>
              </div>
              {isPrinter(fEquipmentId) && (
                <div className="equeue_formField">
                  <label>Material</label>
                  <OrionSelect
                    value={fMaterial}
                    options={[{ value: "", label: "— Selecciona material —" }, ...["PLA","PETG","ABS","TPU","ASA","Nylon","Resina","Fibra de carbono"].map((m) => ({ value: m, label: m }))]}
                    onChange={setFMaterial}
                  />
                </div>
              )}
              <div className="equeue_formField">
                <label>Notas (opcional)</label>
                <input type="text" placeholder="¿En qué vas a trabajar?"
                  value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
              </div>
            </div>
            {conflictError && (
              <div className="equeue_conflictBanner">
                ⚠ Este equipo ya tiene una reserva activa en ese horario.
              </div>
            )}
            <div className="equeue_formFooter">
              <span className="equeue_formUser"><User size={12} />{userName}</span>
              <div className="equeue_formActions">
                <button type="button" className="equeue_btnCancel" onClick={() => { setShowForm(false); setConflictError(false); }}>Cancelar</button>
                <button type="button" className="equeue_btnSave" onClick={handleAdd}
                  disabled={submitting || !fEquipmentId || !fScheduledAt}>
                  {submitting ? "Agregando..." : "Agregar"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Calendar event popup ── */}
      {calPopup && (() => {
        const eq = getEq(calPopup.equipment_id);
        const color = getEqColor(calPopup.equipment_id);
        const ac = avatarColor(calPopup.requested_by_name);
        const st = effectiveStatus(calPopup);
        const statusLabel: Record<string, string> = {
          waiting: "En espera", in_use: "En uso", done: "Completado", cancelled: "Cancelado",
        };
        const statusColor: Record<string, string> = {
          waiting: "var(--pmt-text-subtle)", in_use: "var(--st-warning)",
          done: "var(--st-ok)", cancelled: "var(--st-critical)",
        };
        return (
          <>
            <div className="equeue_modalOverlay" onClick={() => setCalPopup(null)} />
            <div className="equeue_calPopup">
              <div className="equeue_calPopupBar" style={{ background: color.border }} />
              <button type="button" className="equeue_formClose" style={{ position: "absolute", top: 10, right: 10 }}
                onClick={() => setCalPopup(null)}>
                <X size={14} />
              </button>
              <div className="equeue_calPopupHeader">
                <span className="equeue_calPopupEq" style={{ color: color.text }}>
                  {eq ? <>{equipmentTypeIcon(eq.type, 14)} {eq.name}</> : "Equipment"}
                </span>
                <span className="equeue_calPopupStatus" style={{ color: statusColor[st] }}>
                  {statusLabel[st] ?? st}
                </span>
              </div>
              <div className="equeue_calPopupUser">
                <span className="equeue_calPopupAvatar" style={{ background: ac.bg, color: ac.text }}>
                  {calPopup.requested_by_name.charAt(0).toUpperCase()}
                </span>
                <span className="equeue_calPopupUserName">{calPopup.requested_by_name}</span>
              </div>
              <div className="equeue_calPopupRows">
                <div className="equeue_calPopupRow">
                  <span className="equeue_calPopupLabel">Inicio</span>
                  <span>{fmtTime(calPopup.scheduled_at)}</span>
                </div>
                <div className="equeue_calPopupRow">
                  <span className="equeue_calPopupLabel">Fin est.</span>
                  <span>{fmtTime(new Date(new Date(calPopup.scheduled_at).getTime() + calPopup.duration_hours * 3_600_000).toISOString())}</span>
                </div>
                <div className="equeue_calPopupRow">
                  <span className="equeue_calPopupLabel">Duración</span>
                  <span>{fmtDurCompact(calPopup.duration_hours)}</span>
                </div>
                <div className="equeue_calPopupRow">
                  <span className="equeue_calPopupLabel">Restante</span>
                  <span>{entryRemainingLabel(calPopup, st)}</span>
                </div>
                {calPopup.material && (
                  <div className="equeue_calPopupRow">
                    <span className="equeue_calPopupLabel">Material</span>
                    <span>{calPopup.material}</span>
                  </div>
                )}
                {calPopup.notes && (
                  <div className="equeue_calPopupRow">
                    <span className="equeue_calPopupLabel">Notas</span>
                    <span>{calPopup.notes}</span>
                  </div>
                )}
              </div>
              {calPopup.requested_by_user_id === userId && (
                <div className="equeue_calPopupActions">
                  <button type="button" className="equeue_btnCancel"
                    onClick={() => { setCalPopup(null); openEdit(calPopup); }}>
                    <Pencil size={12} /> Editar
                  </button>
                  <button type="button" className="equeue_editDelete"
                    onClick={() => { handleCancel(calPopup.id); setCalPopup(null); }}>
                    Cancelar reserva
                  </button>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ── Settings drawer (same pattern as PM Tracker) ── */}
      {showSettings && (
        <>
          <div className="pmt_drawerOverlay" onClick={() => setShowSettings(false)} />
          <div className="pmt_orionPanel" style={{ maxHeight: "80%", width: 460 }}>
            <div className="pmt_orionHead">
              <Settings size={18} />
              <span>Configuración</span>
              <button type="button" className="pmt_drawerClose" onClick={() => setShowSettings(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="pmt_orionBody" style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20 }}>

              {/* General */}
              <div className="pmt_settingsSection">
                <div className="pmt_settingsSectionTitle">General</div>
                <div className="pmt_settingsRow">
                  <label>Título</label>
                  <input type="text" value={sDraftTitle}
                    onChange={(e) => setSDraftTitle(e.target.value)}
                    style={{ width: "auto", minWidth: 180 }} />
                </div>
                <div className="pmt_settingsRow pmt_settingsRow--col">
                  <label>Descripción</label>
                  <textarea value={sDraftSub} rows={3}
                    onChange={(e) => setSDraftSub(e.target.value)}
                    style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13, padding: "6px 8px", borderRadius: 4, border: "1px solid var(--pmt-border)", background: "var(--pmt-surface-2)", color: "var(--pmt-text)", outline: "none" }} />
                </div>
              </div>

              {/* Apariencia */}
              <div className="pmt_settingsSection">
                <div className="pmt_settingsSectionTitle">Apariencia</div>
                {(() => {
                  const cur = THEMES.find((t) => t.id === sDraftTheme) ?? THEMES[0];
                  return (
                    <div className="pmt_themeDropdown">
                      <button type="button" className="pmt_themeDropdownTrigger"
                        onClick={() => setThemeMenuOpen((o) => !o)}>
                        <div className="pmt_themeDropdownSwatches">
                          <span style={{ background: cur.bg }} />
                          <span style={{ background: cur.fg }} />
                          <span style={{ background: cur.accent }} />
                        </div>
                        <span className="pmt_themeDropdownName">{cur.name}</span>
                        <ChevronDown size={14}
                          className={`pmt_themeDropdownChevron${themeMenuOpen ? " pmt_themeDropdownChevron--open" : ""}`} />
                      </button>
                      {themeMenuOpen && (
                        <div className="pmt_themeDropdownMenu">
                          {THEMES.map((t) => (
                            <button key={t.id} type="button"
                              className={`pmt_themeDropdownItem${sDraftTheme === t.id ? " pmt_themeDropdownItem--active" : ""}`}
                              onClick={() => { setSDraftTheme(t.id); setThemeMenuOpen(false); }}>
                              <div className="pmt_themeDropdownSwatches">
                                <span style={{ background: t.bg }} />
                                <span style={{ background: t.fg }} />
                                <span style={{ background: t.accent }} />
                              </div>
                              <span className="pmt_themeDropdownName">{t.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="pmt_addEntryCancel"
                  onClick={() => { setShowSettings(false); setThemeMenuOpen(false); }}>
                  Cancelar
                </button>
                <button type="button" className="pmt_addEntryConfirm" onClick={saveSettings}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
