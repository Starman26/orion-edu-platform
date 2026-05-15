// src/components/EquipmentQueuePanel.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, User, Search, ChevronLeft, ChevronRight, Check, Filter, RefreshCw, Pencil, Settings, ChevronDown, ClipboardList, Clock, AlertTriangle, CheckCircle2, BookOpen, Shield, Wrench, Eye, Users, Lock, Bell, FileText, Zap, Info, Flag, Star, Trash2, Box, type LucideIcon } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { equipmentTypeIcon, EQUIPMENT_TYPES, type EquipmentProfile } from "./EquipmentTab";
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

const SECTION_LABEL: Record<string, string> = {
  in_use:  "EN CURSO",
  waiting: "En cola",
  done:    "Completados",
};

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

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("es", { month: "short", day: "numeric" });
}


function fmtDurHM(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  const [midView, setMidView]       = useState<"list" | "rules">("list");
  const [calDate, setCalDate]       = useState(() => new Date());

  const [leftSearch, setLeftSearch]   = useState("");
  const [filterType, setFilterType]   = useState<string | null>(null);
  const [showFilter, setShowFilter]   = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Pinned equipment IDs — persisted per team in localStorage
  const pinnedKey = `equeue_pinned_${teamId}`;
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
    if (error) { setTableError(true); } else { setEntries((data as QueueEntry[]) ?? []); }
    setLoading(false);
  }, [teamId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

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
      scheduled_at: fScheduledAt, duration_hours: durH,
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
      scheduled_at: eScheduledAt,
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

  const calEntries = entries.filter((e) => isSameDay(new Date(e.scheduled_at), calDate));

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

          <button type="button" className="equeue_addBtn" onClick={() => openForm()}>
            <Plus size={13} />
            Agregar a la fila
          </button>
          <button type="button" className="equeue_btnIcon" onClick={fetchEntries} title="Recargar">
            <RefreshCw size={14} />
          </button>
          <button type="button" className="equeue_btnIcon" onClick={openSettings} title="Configuración">
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* ── 3-panel body ── */}
      <div className="equeue_body">

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

          {/* Pinned equipment cards */}
          {pinnedIds.length === 0 ? (
            <div className="equeue_leftEmpty">
              Usa "Add Equipment" para agregar equipos aquí
            </div>
          ) : (
            equipment.filter((eq) =>
              pinnedIds.includes(eq.id) &&
              (!filterType || eq.type === filterType) &&
              (!leftSearch || eq.name.toLowerCase().includes(leftSearch.toLowerCase()) ||
               (eq.brand ?? "").toLowerCase().includes(leftSearch.toLowerCase()))
            ).map((eq) => {
              const inUse   = entries.some((e) => e.equipment_id === eq.id && computeAutoStatus(e) === "in_use");
              const waiting = entries.filter((e) => e.equipment_id === eq.id && computeAutoStatus(e) === "waiting").length;
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
                    {equipmentTypeIcon(eq.type, 26)}
                    {inUse && <span className="equeue_eqItemDot" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

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
                Lista de uso
              </button>
              <button type="button"
                className={`equeue_midTab${midView === "rules" ? " is-active" : ""}`}
                onClick={() => setMidView("rules")}>
                Vista de reglas
              </button>
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

          {/* Add form (inline) */}
          {midView === "list" && showForm && (
            <div className="equeue_formCard">
              <div className="equeue_formHeader">
                <span className="equeue_formTitle">Nueva reserva</span>
                <button type="button" className="equeue_formClose" onClick={() => setShowForm(false)}>
                  <X size={14} />
                </button>
              </div>
              <div className="equeue_formBody">
                <div className="equeue_formField">
                  <label>Equipo</label>
                  <select value={fEquipmentId} onChange={(e) => { setFEquipmentId(e.target.value); setConflictError(false); }}>
                    <option value="">Selecciona un equipo...</option>
                    {equipment.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.name}{eq.brand ? ` · ${eq.brand}` : ""}
                      </option>
                    ))}
                  </select>
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
                    <select value={fMaterial} onChange={(e) => setFMaterial(e.target.value)}>
                      <option value="">— Selecciona material —</option>
                      {["PLA","PETG","ABS","TPU","ASA","Nylon","Resina","Fibra de carbono"].map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
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
          )}

          {/* Sections */}
          {midView === "list" && <div className="equeue_midScroll">
            {loading ? (
              <div className="equeue_loading">Cargando...</div>
            ) : (
              SECTION_ORDER.map((status) => {
                const sectionEntries = midEntries.filter((e) => computeAutoStatus(e) === status);
                if (sectionEntries.length === 0 && status === "done") return null;
                return (
                  <div key={status} className="equeue_midSection">
                    <div className="equeue_midSectionHeader">
                      <span className="equeue_midSectionDot" style={{ background: STATUS_DOT[status] }} />
                      <span className="equeue_midSectionLabel">{SECTION_LABEL[status]}</span>
                    </div>

                    {sectionEntries.length === 0 ? (
                      <div className="equeue_midEmpty">Sin entradas</div>
                    ) : (
                      sectionEntries.map((entry) => {
                        const eq = getEq(entry.equipment_id);
                        const isEditing = editingId === entry.id;
                        return (
                          <div key={entry.id}
                            className={`equeue_midCard${isEditing ? " is-editing" : ""}`}>

                            <div className="equeue_midCardLeft">
                              <span className="equeue_midCardAvatar">
                                {entry.requested_by_name.charAt(0).toUpperCase()}
                              </span>
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
                                      <select value={eMaterial} onChange={(e) => setEMaterial(e.target.value)}>
                                        <option value="">— Selecciona material —</option>
                                        {["PLA","PETG","ABS","TPU","ASA","Nylon","Resina","Fibra de carbono"].map((m) => (
                                          <option key={m} value={m}>{m}</option>
                                        ))}
                                      </select>
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
                                  <div className="equeue_midCardTop">
                                    <span className="equeue_midCardEq">
                                      {eq && equipmentTypeIcon(eq.type, 12)}
                                      {getEqName(entry.equipment_id)}
                                    </span>
                                  </div>
                                  <span className="equeue_midCardUser">{entry.requested_by_name}</span>
                                  {entry.notes && (
                                    <span className="equeue_midCardNotes">{entry.notes}</span>
                                  )}
                                  <div className="equeue_midCardMeta">
                                    <span>{fmtShortDate(entry.scheduled_at)}</span>
                                    <span>{fmtTime(entry.scheduled_at)}</span>
                                    <span>Duration: {fmtDurHM(entry.duration_hours)}</span>
                                    {entry.material && <span>{entry.material}</span>}
                                  </div>
                                </>
                              )}
                            </div>

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
                  </div>
                );
              })
            )}
          </div>}
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

              {/* Events */}
              {computeCalLayout(calEntries).map((entry) => {
                const d = new Date(entry.scheduled_at);
                const startFrac = d.getHours() + d.getMinutes() / 60;
                const topPx = (startFrac - CAL_START) * HOUR_PX;
                const heightPx = Math.max(entry.duration_hours * HOUR_PX, 28);
                const eq = getEq(entry.equipment_id);
                const inRange = startFrac >= CAL_START && startFrac < CAL_END;
                if (!inRange) return null;
                const colW = `calc((100% - 8px) / ${entry.totalCols} - 2px)`;
                const colL = `calc(4px + (100% - 8px) * ${entry.col} / ${entry.totalCols})`;
                const color = getEqColor(entry.equipment_id);
                return (
                  <div key={entry.id} className="equeue_calEvent"
                    style={{ top: topPx, height: heightPx, left: colL, width: colW, right: "auto",
                      background: color.bg, borderLeftColor: color.border }}>
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

      </div>{/* equeue_body */}

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
                <div className="pmt_settingsRow">
                  <label>Descripción</label>
                  <input type="text" value={sDraftSub}
                    onChange={(e) => setSDraftSub(e.target.value)}
                    style={{ width: "auto", minWidth: 180 }} />
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
