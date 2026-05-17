// src/components/PmTrackerPanel.tsx
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Pencil, Search, Grid3X3, List, RefreshCw, Plus, X,
  Calendar, CalendarDays, ShieldCheck, Settings, Trash2, ChevronLeft, ChevronDown,
  Copy, Clipboard, Share2, Filter,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { supabase } from "../lib/supabaseClient";
import { useAgentChat } from "./useAgentChat";
import type { AgentEvent } from "./useAgentChat";
import "../styles/pm-tracker.css";

const AGENT_API_URL = import.meta.env.VITE_AGENT_API_URL || "https://sentinela-909652673285.us-central1.run.app";

const WORD_PROMPT_TEMPLATE = `Eres un asistente relajado y cercano que acompaña a un equipo universitario de manufactura.
Tu tono es casual, amigable y motivador — como un compañero que pasa, comenta algo ligero y sigue. No formal, no acartonado, pero tampoco payaso ni chistosito forzado. Cero burlas, cero hate.
Dado el snapshot de KPIs en JSON de abajo, responde ÚNICAMENTE con las siguientes líneas — copia el formato carácter por carácter, sin variaciones:

Línea 1 — etiqueta en negritas con dobles asteriscos:    **Word of the day:**
Línea 2 — la palabra en asteriscos simples (cursiva): *TuPalabra*
Línea 3 — línea vacía
Línea 4 — una frase corta en asteriscos simples y comillas curvas: *"Tu frase aquí."*

Reglas de formato (estrictas):
- Solo markdown estándar: ** para negritas, * para cursiva. NUNCA uses ==, #, >, -, ni otra sintaxis.
- La etiqueta DEBE ser exactamente: **Word of the day:**
- La palabra DEBE ir en asteriscos simples: *Palabra*
- La frase DEBE ir en asteriscos simples y comillas curvas: *"..."*
- Sin preámbulo, sin explicación, sin texto extra antes ni después — solo esas cuatro líneas.
- La frase debe ser breve, natural y motivadora, máx 14 palabras, en español neutro (sin slang regional, sin modismos mexicanos forzados).
- Cambia la palabra y la frase cada vez según el snapshot. Sé creativo pero sobrio.
- Incluye la palabra del día dentro de la frase.

REGLAS DE TONO — IMPORTANTÍSIMAS (esto NO es negociable):
- NUNCA insultes, humilles, te burles, etiquetes ni "roastees" a una persona o equipo.
- NUNCA uses palabras como "deficiente", "flojo", "perdedor", "fracaso", "vago", "mediocre", "inútil", ni etiquetas negativas hacia personas.
- NUNCA sugieras que un equipo cambie su nombre por algo negativo, ni compares para hacer quedar mal a alguien.
- Si alguien va bajo en KPIs, enmárcalo como oportunidad o como un buen momento para retomar ritmo — nunca como defecto personal.
- Reconoce el esfuerzo, el progreso y los avances pequeños igual que los grandes.
- Suena como alguien cercano y empático, no como un crítico ni como un coach motivacional exagerado.

ROTACIÓN DE CONTENIDO — varía el ángulo cada vez. Escoge UNO al azar:
  1. Vibra global: un comentario ligero sobre el ánimo general del equipo según los KPIs.
     Ejemplos: "El equipo va tomando ritmo, se nota el avance.", "Buen momento para sostener la inercia."
  2. Mención individual: nombra a un PM (usa su primer nombre real de "teams") — reconoce al que lidera, anima al que está remontando, o destaca al que avanza estable.
     Ejemplos: "Adrián marcando ritmo claro hoy, buen ejemplo.", "Liz, hoy es buen día para retomar el impulso.", "Patricio avanza estable, eso también cuenta."
  3. Mención grupal: agarra 2–3 nombres de PMs y conéctalos en positivo.
     Ejemplo: "Adrián y Mariana sumando fuerte, Patricio listo para subir el ritmo."
  4. Foco de área: comenta brevemente un área (Robot/PLC/Sensores/HMI/MES/ERP) — celebra la que va arriba o anima a la que va abajo.

Inclínate más por menciones (ángulos 2–3) que por comentarios globales — nombrar personas lo hace más cercano. Usa los nombres reales del snapshot, nunca los inventes.

Ejemplo del ÚNICO formato de salida aceptable:
**Word of the day:**
*Ritmo*

*"Adrián y Mariana marcando ritmo hoy, buen momento para que el resto se sume."*

KPI Snapshot:
\`\`\`json
{SNAPSHOT}
\`\`\`
`;

// ─── Area definitions (user-configurable) ────────────────────────────────────

interface AreaDef {
  key: string;
  label: string;
  color: string;
}

// Area colors — OKLCH unified family. Same lightness (0.62) and chroma (0.155);
// only the hue varies so all 6 categories look harmonized.
const DEFAULT_AREAS: AreaDef[] = [
  { key: "robot",  label: "Robot",    color: "oklch(0.62 0.155 25)" },
  { key: "plc",    label: "PLC",      color: "oklch(0.62 0.155 250)" },
  { key: "sensor", label: "Sensores", color: "oklch(0.62 0.155 145)" },
  { key: "hmi",    label: "HMI",      color: "oklch(0.62 0.155 75)" },
  { key: "mes",    label: "MES",      color: "oklch(0.62 0.155 305)" },
  { key: "erp",    label: "ERP",      color: "oklch(0.62 0.155 195)" },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const THEMES = [
  { id: "light",    name: "Light",    bg: "#ffffff", fg: "#111111", accent: "#2563eb" },
  { id: "slate",    name: "Slate",    bg: "#1e293b", fg: "#f8fafc", accent: "#38bdf8" },
  { id: "forest",   name: "Forest",   bg: "#14532d", fg: "#f0fdf4", accent: "#4ade80" },
  { id: "ocean",    name: "Ocean",    bg: "#0c4a6e", fg: "#f0f9ff", accent: "#7dd3fc" },
  { id: "sunset",   name: "Sunset",   bg: "#9a3412", fg: "#fff7ed", accent: "#fb923c" },
  { id: "midnight", name: "Midnight", bg: "#020617", fg: "#f1f5f9", accent: "#818cf8" },
];

const STATUS_CYCLE: Record<string, TraceCommit["status"]> = {
  pending: "in_progress",
  in_progress: "success",
  success: "failed",
  failed: "pending",
};

const ST_COLOR: Record<string, string> = {
  ok: "#16a34a", info: "#2563eb", warning: "#d97706", critical: "#dc2626",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface TraceProject {
  id: string;
  analysis_session_id: string | null;
  team_id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  today_override: string | null;
  total_working_days: number;
  config?: Record<string, unknown>;
}

interface TraceTeamEntry {
  id: string;
  project_id: string;
  team_slug: string;
  team_name: string;
  pm_name: string;
  pm_user_id: string | null;
  color: string;
  orion_validated: boolean;
  editor_ids?: string[];
}

interface TraceCommit {
  id: string;
  entry_id: string;
  commit_key: string;
  element_key: string;
  label: string;
  description?: string;
  deadline_day: number;
  start_date?: string;
  due_date?: string;
  status: "pending" | "in_progress" | "success" | "failed";
  updated_at: string;
}

interface TeamMember {
  user_id: string;
  role: string;
  email?: string;
  full_name?: string;
  created_at?: string;
}

interface PmTrackerPanelProps {
  sessionId: string;
  teamId: string;
  userId: string;
  config: Record<string, unknown>;
  onExpandSidebar?: () => void;
}

// ─── Score helpers ────────────────────────────────────────────────────────────

type ZoneThresholds = [number, number, number];
const DEFAULT_ZONES: ZoneThresholds = [40, 65, 85];

// Matte avatar palette — same lightness (62%), low-mid saturation, varied hues.
function matteAvatar(name: string): { bg: string; text: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return {
    bg:   `hsl(${hue}, 45%, 62%)`,
    text: `hsl(${hue}, 55%, 22%)`,
  };
}

function getTodayDay(project: TraceProject): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(project.start_date + "T00:00:00");
  const diff = Math.round((today.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diff + 1);
}

function calcPenalty(
  deadlineDay: number, status: string, todayDay: number,
  penaltyPerDay: number, maxPenalty: number,
): number {
  if (status === "success") return 0;
  const daysLate = todayDay - deadlineDay;
  if (daysLate <= 0) return 0;
  return Math.min(maxPenalty, daysLate * penaltyPerDay);
}

function calendarDaysBetween(from: Date | string, to: Date | string): number {
  const fromMs = (typeof from === "string" ? new Date(from + "T00:00:00") : from).setHours(0, 0, 0, 0);
  const toMs   = (typeof to   === "string" ? new Date(to   + "T00:00:00") : to  ).setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((toMs - fromMs) / 86_400_000));
}

function isCommitLate(commit: TraceCommit, todayDay?: number): boolean {
  if (commit.status === "success") return false;
  if (commit.due_date) {
    const due = new Date(commit.due_date + "T23:59:59");
    return new Date() > due;
  }
  if (todayDay !== undefined) return todayDay > commit.deadline_day;
  return false;
}

function commitDaysLate(commit: TraceCommit, penaltyPerDay: number, maxPenalty: number): number {
  if (commit.status === "success" || !commit.due_date) return 0;
  const daysLate = calendarDaysBetween(commit.due_date, new Date().toISOString().split("T")[0]);
  if (daysLate <= 0) return 0;
  return Math.min(maxPenalty, daysLate * penaltyPerDay);
}

function calcEntryScore(
  commits: TraceCommit[], todayDay: number,
  penaltyPerDay: number, maxPenalty: number,
): number {
  if (commits.length === 0) return 0;
  const base = Math.round(
    (commits.filter((c) => c.status === "success").length / commits.length) * 100,
  );
  const totalPenalty = commits.reduce((s, c) => {
    if (c.due_date) return s + commitDaysLate(c, penaltyPerDay, maxPenalty);
    return s + calcPenalty(c.deadline_day, c.status, todayDay, penaltyPerDay, maxPenalty);
  }, 0);
  return Math.max(0, base - totalPenalty);
}

function gradeInfo(
  score: number,
  zones: ZoneThresholds = DEFAULT_ZONES,
): { label: string; color: string } {
  if (score < zones[0]) return { label: "Crítico",    color: "#dc2626" };
  if (score < zones[1]) return { label: "Deficiente", color: "#ea580c" };
  if (score < zones[2]) return { label: "En Riesgo",  color: "#d97706" };
  return                       { label: "OK",         color: "#16a34a" };
}

function statusFromScore(
  s: number,
  zones: ZoneThresholds = DEFAULT_ZONES,
): "ok" | "info" | "warning" | "critical" {
  if (s >= zones[2]) return "ok";
  if (s >= zones[1]) return "info";
  if (s >= zones[0]) return "warning";
  return "critical";
}

function dateToDay(dateStr: string, projectStartDate: string): number {
  const start = new Date(projectStartDate);
  const end   = new Date(dateStr);
  let day = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const target = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= target) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) day++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, day);
}

function dayToDate(day: number, projectStartDate: string): string {
  const start = new Date(projectStartDate);
  let count = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (count < day) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
    if (count < day) cur.setDate(cur.getDate() + 1);
  }
  return cur.toISOString().split("T")[0];
}



function elKey(c: TraceCommit): string {
  return c.element_key;
}

function areaColor(areas: AreaDef[], key: string): string {
  return areas.find((a) => a.key === key)?.color ?? "#64748b";
}

function areaLabel(areas: AreaDef[], key: string): string {
  return areas.find((a) => a.key === key)?.label ?? key;
}

function canEditEntry(entry: TraceTeamEntry, currentUserId: string | null): boolean {
  if (!currentUserId) return false;
  if (entry.pm_user_id === currentUserId) return true;
  if (entry.editor_ids?.includes(currentUserId)) return true;
  return false;
}

// ─── ZoneSlider ───────────────────────────────────────────────────────────────

function ZoneSlider({
  values, onChange,
}: {
  values: ZoneThresholds;
  onChange: (v: ZoneThresholds) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const MIN_GAP = 5;
  const [a, b, c] = values;
  const thumbColors = ["#ea580c", "#d97706", "#16a34a"] as const;

  const startDrag = (i: 0 | 1 | 2) => (e: React.PointerEvent) => {
    e.preventDefault();
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      const next = [...values] as ZoneThresholds;
      let pct = Math.round(((ev.clientX - rect.left) / rect.width) * 100);
      const lo = i === 0 ? 0   : next[i - 1] + MIN_GAP;
      const hi = i === 2 ? 100 : next[i + 1] - MIN_GAP;
      next[i] = Math.max(lo, Math.min(hi, pct));
      onChange(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="pmt_zoneSlider">
      <div className="pmt_zoneBar" ref={barRef}>
        <div className="pmt_zoneSeg pmt_zoneSeg--red"    style={{ left: 0,        width: `${a}%` }} />
        <div className="pmt_zoneSeg pmt_zoneSeg--orange" style={{ left: `${a}%`,  width: `${b - a}%` }} />
        <div className="pmt_zoneSeg pmt_zoneSeg--yellow" style={{ left: `${b}%`,  width: `${c - b}%` }} />
        <div className="pmt_zoneSeg pmt_zoneSeg--green"  style={{ left: `${c}%`,  width: `${100 - c}%` }} />
        {([0, 1, 2] as const).map((i) => (
          <div key={i} className="pmt_zoneThumb"
            style={{ left: `${values[i]}%`, borderColor: thumbColors[i] }}
            onPointerDown={startDrag(i)}>
            <div className="pmt_zoneBubble">{values[i]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sparkline + delta for KPI tiles ─────────────────────────────────────────

function Sparkline({ values, color = "var(--pmt-text-subtle)", width = 60, height = 18 }: {
  values: number[]; color?: string; width?: number; height?: number;
}) {
  if (values.length < 2) {
    return <svg width={width} height={height} className="pmt_kpiSpark" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} className="pmt_kpiSpark">
      <polyline
        fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function useKpiHistory(key: string, value: number): { history: number[]; delta: number | null } {
  const [history, setHistory] = useState<number[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`pmt_kpi_hist_${key}`) ?? "[]");
      return Array.isArray(stored) ? stored : [];
    } catch { return []; }
  });

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    const today = new Date().toISOString().slice(0, 10);
    const dateKey = `pmt_kpi_date_${key}`;
    const lastDate = localStorage.getItem(dateKey);
    if (lastDate === today) return;
    const next = [...history, value].slice(-8);
    setHistory(next);
    try {
      localStorage.setItem(`pmt_kpi_hist_${key}`, JSON.stringify(next));
      localStorage.setItem(dateKey, today);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, key]);

  const series = history.length > 0 && history[history.length - 1] !== value
    ? [...history, value].slice(-8)
    : history;
  const delta = series.length >= 2 ? series[series.length - 1] - series[series.length - 2] : null;
  return { history: series, delta };
}

function KpiSparkBlock({ kpiKey, value, color }: { kpiKey: string; value: number; color?: string }) {
  const { history, delta } = useKpiHistory(kpiKey, value);
  if (history.length < 2) return null;
  const deltaSign = delta === null ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return (
    <div className="pmt_kpiSparkRow">
      <Sparkline values={history} color={color ?? "var(--pmt-text-subtle)"} />
      {delta !== null && delta !== 0 && (
        <span className={`pmt_kpiDelta pmt_kpiDelta--${deltaSign}`}>
          {delta > 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(0)} vs ayer
        </span>
      )}
    </div>
  );
}

// ─── Donut (ok/fail/pend ratio) ──────────────────────────────────────────────

function Donut({ ok, fail, pend, size = 56 }: { ok: number; fail: number; pend: number; size?: number }) {
  const total = ok + fail + pend;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const okPct   = total > 0 ? ok   / total : 0;
  const failPct = total > 0 ? fail / total : 0;
  const pendPct = total > 0 ? pend / total : 0;
  let offset = 0;
  const seg = (pct: number, color: string) => {
    if (pct <= 0) return null;
    const dash = c * pct;
    const el = (
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${c - dash}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    );
    offset += dash;
    return el;
  };
  return (
    <div className="pmt_donutBlock">
      <div className="pmt_donutWrap" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="var(--pmt-border-soft)" strokeWidth={stroke}
          />
          {seg(okPct,   "var(--st-ok)")}
          {seg(failPct, "var(--st-critical)")}
          {seg(pendPct, "var(--st-warning)")}
        </svg>
        <div className="pmt_donutCenter">
          <span className="pmt_donutOk">{ok}</span>
          <span className="pmt_donutTotal">/{total}</span>
        </div>
      </div>
    </div>
  );
}

// ─── StackedRow ───────────────────────────────────────────────────────────────
// Shows 0–100% scale. Each segment is proportional to ok/failed/pending vs total.

function StackedRow({ label, commits, color }: {
  label: string;
  commits: TraceCommit[];
  color?: string;
}) {
  const total    = commits.length;
  const ok       = commits.filter((c) => c.status === "success").length;
  const pct      = total > 0 ? Math.round((ok / total) * 100) : 0;
  const barColor = color ?? "var(--st-ok)";

  return (
    <div className="pmt_stackedRow">
      <span className="pmt_stackedLabel">{label}</span>
      <div className="pmt_stackedBar" style={{ position: "relative" }}>
        {total > 0 && (
          <div style={{
            position: "absolute",
            top: 0, left: 0, bottom: 0,
            width: `${pct}%`,
            background: barColor,
            borderRadius: 4,
            transition: "width 0.4s ease",
          }} />
        )}
      </div>
      <span className="pmt_stackedCount" style={{ minWidth: 30, textAlign: "right" }}>
        {total > 0 ? `${pct}%` : "—"}
      </span>
    </div>
  );
}

// ─── ManageAccessSection ──────────────────────────────────────────────────────

function ManageAccessSection({
  entry, teamMembers, onUpdateEditors,
}: {
  entry: TraceTeamEntry;
  teamMembers: TeamMember[];
  currentUserId: string | null;
  onUpdateEditors: (entryId: string, editorIds: string[]) => Promise<void>;
}) {
  const editors = entry.editor_ids ?? [];
  const [memberSearch, setMemberSearch]         = useState("");
  const [roleFilter, setRoleFilter]             = useState<"all" | "lab_researcher" | "admin">("all");
  const [accessFilter, setAccessFilter]         = useState<"all" | "editor" | "reader">("all");
  const [showMemberFilter, setShowMemberFilter] = useState(false);
  const memberFilterRef                         = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMemberFilter) return;
    const h = (e: MouseEvent) => {
      if (memberFilterRef.current && !memberFilterRef.current.contains(e.target as Node))
        setShowMemberFilter(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMemberFilter]);

  const toggle = async (userId: string) => {
    const next = editors.includes(userId)
      ? editors.filter((id) => id !== userId)
      : [...editors, userId];
    await onUpdateEditors(entry.id, next);
  };

  const filteredMembers = teamMembers
    .filter((m) => m.user_id !== entry.pm_user_id)
    .filter((m) => {
      if (memberSearch.trim()) {
        const q = memberSearch.toLowerCase();
        if (!(m.full_name || "").toLowerCase().includes(q) &&
            !(m.email || "").toLowerCase().includes(q)) return false;
      }
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (accessFilter === "editor" && !editors.includes(m.user_id)) return false;
      if (accessFilter === "reader" &&  editors.includes(m.user_id)) return false;
      return true;
    });

  const hasActiveFilter = roleFilter !== "all" || accessFilter !== "all";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 4, width: "100%" }}>
        <div className="pmt_filterSearch" style={{ flex: 1 }}>
          <Search size={13} />
          <input
            placeholder="Buscar miembro..."
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)} />
        </div>
        <div className="pmt_filterDropWrap" ref={memberFilterRef}>
          <button
            type="button"
            className={`pmt_filterBtn${hasActiveFilter ? " pmt_filterBtn--active" : ""}`}
            onClick={() => setShowMemberFilter((v) => !v)}>
            <Filter size={13} />
            Filtrar
            {hasActiveFilter && <span className="pmt_filterBadge" />}
          </button>
          {showMemberFilter && (
            <div className="pmt_filterMenu" style={{ right: 0, left: "auto" }}>
              <div className="pmt_filterMenuSection">
                <span className="pmt_filterMenuLabel">Rol</span>
                {([
                  { k: "all",            label: "Todos" },
                  { k: "lab_researcher", label: "Lab Researcher" },
                  { k: "admin",          label: "Admin" },
                ] as { k: "all"|"lab_researcher"|"admin"; label: string }[]).map(({ k, label }) => (
                  <button key={k} type="button"
                    className={`pmt_filterMenuOpt${roleFilter === k ? " pmt_filterMenuOpt--active" : ""}`}
                    onClick={() => { setRoleFilter(k); setShowMemberFilter(false); }}>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <div className="pmt_filterMenuSection">
                <span className="pmt_filterMenuLabel">Acceso</span>
                {([
                  { k: "all",    label: "Todos" },
                  { k: "editor", label: "Edición" },
                  { k: "reader", label: "Lectura" },
                ] as { k: "all"|"editor"|"reader"; label: string }[]).map(({ k, label }) => (
                  <button key={k} type="button"
                    className={`pmt_filterMenuOpt${accessFilter === k ? " pmt_filterMenuOpt--active" : ""}`}
                    onClick={() => { setAccessFilter(k); setShowMemberFilter(false); }}>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {filteredMembers
        .map((member) => {
          const isEditor = editors.includes(member.user_id);
          return (
            <div key={member.user_id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 0", borderBottom: "1px solid var(--pmt-border-soft)",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                background: "var(--pmt-accent)", color: "var(--pmt-accent-text)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 600,
              }}>
                {(member.full_name || member.email || "?").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--pmt-text)" }}>
                  {member.full_name || member.email || member.user_id.slice(0, 8)}
                </div>
                {member.email && member.full_name && (
                  <div style={{ fontSize: 10, color: "var(--pmt-text-subtle)" }}>
                    {member.email}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggle(member.user_id)}
                style={{
                  padding: "4px 12px", fontSize: 11, fontWeight: 600,
                  fontFamily: "inherit", borderRadius: 5, cursor: "pointer",
                  border: isEditor ? "1px solid var(--st-ok)" : "1px solid var(--pmt-border)",
                  background: isEditor ? "var(--st-ok-soft)" : "transparent",
                  color: isEditor ? "var(--st-ok)" : "var(--pmt-text-muted)",
                  transition: "all 0.12s",
                }}>
                {isEditor ? "✓ Editor" : "Solo lectura"}
              </button>
            </div>
          );
        })}
      <div style={{ fontSize: 11, color: "var(--pmt-text-subtle)", marginTop: 4 }}>
        El creador siempre tiene acceso completo.
      </div>
    </div>
  );
}

// ─── CommitPieChart ───────────────────────────────────────────────────────────

function CommitPieChart({ ok, failed, pending, total }: {
  ok: number; failed: number; pending: number; total: number;
}) {
  const R = 54; const cx = 70; const cy = 70;
  const circ = 2 * Math.PI * R;

  const allSlices = [
    { value: ok,      color: "var(--st-ok)",      label: "Completadas", key: "ok" },
    { value: pending, color: "var(--st-progress)", label: "En progreso", key: "prog" },
    { value: failed,  color: "var(--st-critical)", label: "Fallidas",    key: "fail" },
  ];

  const activeSlices = allSlices.filter((s) => s.value > 0);

  let offset = 0;
  const paths = activeSlices.map((s) => {
    const frac = s.value / total;
    const dash = frac * circ;
    const gap  = circ - dash;
    const rotation = (offset / total) * 360 - 90;
    offset += s.value;
    return { ...s, dash, gap, rotation };
  });

  return (
    <div className="pmt_pieWrap">
      <svg width={140} height={140} viewBox="0 0 140 140">
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={R} fill="none"
            stroke="var(--pmt-border)" strokeWidth={18} />
        ) : (
          paths.map((p) => (
            <circle key={p.key} cx={cx} cy={cy} r={R}
              fill="none" stroke={p.color} strokeWidth={18}
              strokeDasharray={`${p.dash} ${p.gap}`}
              strokeDashoffset={0}
              transform={`rotate(${p.rotation} ${cx} ${cy})`} />
          ))
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" className="pmt_pieCenter" dominantBaseline="middle">
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="pmt_pieCenterSub" dominantBaseline="middle">
          metas
        </text>
      </svg>
      <div className="pmt_pieLegend">
        {allSlices.map((s) => (
          <div key={s.key} className="pmt_pieLegItem">
            <span className="pmt_pieLegDot" style={{ background: s.color }} />
            <span className="pmt_pieLegLabel">{s.label}</span>
            <span className="pmt_pieLegVal">{s.value}</span>
            <span className="pmt_pieLegPct">
              {total > 0 ? `${Math.round((s.value / total) * 100)}%` : "0%"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TeamDrawer ───────────────────────────────────────────────────────────────

function TeamDrawer({
  entry, commits, tab, areas, onTabChange, onClose,
  todayDay, totalDays, projectStartDate, penaltyPerDay, maxPenalty, zones,
  onStatusChange,
  onAddCommit, onDeleteCommit, onEditCommitLabel, onEditCommitDescription,
  isFirstPlace, canEdit, teamMembers, currentUserId, onUpdateEditors,
  copiedCommits, onCopyCommits, onPasteCommits,
}: {
  entry: TraceTeamEntry;
  commits: TraceCommit[];
  tab: "overview" | "commits";
  areas: AreaDef[];
  onTabChange: (t: "overview" | "commits") => void;
  onClose: () => void;
  todayDay: number;
  totalDays: number;
  projectStartDate: string;
  penaltyPerDay: number;
  maxPenalty: number;
  zones: ZoneThresholds;
  onStatusChange: (id: string, s: TraceCommit["status"]) => void;
  isFirstPlace?: boolean;
  canEdit: boolean;
  teamMembers: TeamMember[];
  currentUserId: string | null;
  onUpdateEditors: (entryId: string, editorIds: string[]) => Promise<void>;
  onAddCommit: (draft: { label: string; element: string; deadline_day: number; due_date?: string }) => void;
  onDeleteCommit: (commitId: string) => void;
  onEditCommitLabel: (commitId: string, label: string) => void;
  onEditCommitDescription: (commitId: string, description: string) => void;
  copiedCommits: TraceCommit[];
  onCopyCommits: (commits: TraceCommit[]) => void;
  onPasteCommits: () => Promise<void>;
}) {
  const [addCommitOpen, setAddCommitOpen]   = useState(false);
  const [commitDraft, setCommitDraft]       = useState({
    label: "",
    element: areas[0]?.key ?? "robot",
    deadline_day: Math.ceil(totalDays / 2),
    start_date: "",
    due_date: "",
  });
  const [editingLabelId, setEditingLabelId]   = useState<string | null>(null);
  const [areaFilter, setAreaFilter]           = useState<string | null>(null);
  const [statusFilter, setStatusFilter]       = useState<"all" | "success" | "in_progress" | "failed">("all");
  const [commitSort, setCommitSort]           = useState<"default" | "deadline" | "status">("default");
  const [showCommitFilter, setShowCommitFilter] = useState(false);
  const commitFilterRef                       = useRef<HTMLDivElement>(null);
  const [commitSearch, setCommitSearch]       = useState("");
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set());
  const [labelDraft, setLabelDraft]           = useState("");
  const [descPopupCommit, setDescPopupCommit] = useState<TraceCommit | null>(null);
  const [descDraft, setDescDraft]             = useState("");

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const clearSelection = () => setSelectedIds(new Set());

  const usedAreas = areas.filter((a) => commits.some((c) => elKey(c) === a.key));

  const visibleCommits = (() => {
    let list = areaFilter ? commits.filter((c) => elKey(c) === areaFilter) : commits;
    if (statusFilter !== "all") list = list.filter((c) => c.status === statusFilter);
    if (commitSearch.trim()) {
      const q = commitSearch.toLowerCase();
      list = list.filter((c) => c.label.toLowerCase().includes(q));
    }
    if (commitSort === "deadline") list = [...list].sort((a, b) => {
      const da = a.due_date ?? String(a.deadline_day).padStart(6, "0");
      const db = b.due_date ?? String(b.deadline_day).padStart(6, "0");
      return da < db ? -1 : da > db ? 1 : 0;
    });
    if (commitSort === "status") {
      const order = { success: 0, in_progress: 1, pending: 2, failed: 3 };
      list = [...list].sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));
    }
    return list;
  })();

  useEffect(() => {
    if (!showCommitFilter) return;
    const h = (e: MouseEvent) => {
      if (commitFilterRef.current && !commitFilterRef.current.contains(e.target as Node))
        setShowCommitFilter(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showCommitFilter]);

  const score   = calcEntryScore(commits, todayDay, penaltyPerDay, maxPenalty);
  const grade   = gradeInfo(score, zones);
  const ok      = commits.filter((c) => c.status === "success").length;
  const failed  = commits.filter((c) => c.status === "failed").length;
  const pending = commits.filter((c) => c.status === "pending" || c.status === "in_progress").length;
  const total   = commits.length;

  return (
    <>
      <div className="pmt_drawerOverlay" onClick={onClose} />
      <div className="pmt_drawer">
        {/* Head */}
        <div className="pmt_drawerHead">
          {(() => {
            const a = matteAvatar(entry.pm_name);
            return (
              <div
                className={`pmt_drawerAvatar${isFirstPlace ? " pmt_avatar--first" : ""}`}
                style={{ background: a.bg, color: a.text }}>
                {entry.pm_name.charAt(0).toUpperCase()}
              </div>
            );
          })()}
          <div className="pmt_drawerInfo">
            <div className="pmt_drawerTitle">{entry.team_name}</div>
            <div className="pmt_drawerSub">
              PM · {entry.pm_name} ·{" "}
              <span style={{ color: grade.color }}>{score} pts · {grade.label}</span>
            </div>
          </div>
          <button type="button" className="pmt_drawerClose" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="pmt_drawerTabs">
          {(["overview", "commits"] as const).map((t) => (
            <button key={t} type="button"
              className={`pmt_drawerTab${tab === t ? " pmt_drawerTab--active" : ""}`}
              onClick={() => onTabChange(t)}>
              {t === "commits" ? `Metas (${total})` : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="pmt_drawerBody">
          <div className="pmt_drawerInner">

          {/* Overview */}
          {tab === "overview" && (
            <div className="pmt_drawerOverview">
              <CommitPieChart ok={ok} failed={failed} pending={pending} total={total} />

              {total === 0 ? (
                <div className="pmt_noEntries" style={{ flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 13 }}>Sin metas registradas.</span>
                  {canEdit && (
                    <button type="button" className="pmt_addEntryConfirm"
                      style={{ fontSize: 12, padding: "6px 14px" }}
                      onClick={() => onTabChange("commits")}>
                      + Agregar primera meta
                    </button>
                  )}
                </div>
              ) : (
                <div className="pmt_drawerSection">
                  <div className="pmt_drawerSectionTitle">Progreso por área</div>
                  {areas.map((area) => (
                    <StackedRow key={area.key} label={area.label}
                      color={area.color}
                      commits={commits.filter((c) => elKey(c) === area.key)} />
                  ))}
                </div>
              )}
              {canEdit && (
                <div className="pmt_drawerSection">
                  <div className="pmt_drawerSectionTitle">Acceso de edición</div>
                  <ManageAccessSection
                    entry={entry}
                    teamMembers={teamMembers}
                    currentUserId={currentUserId}
                    onUpdateEditors={onUpdateEditors}
                  />
                </div>
              )}
            </div>
          )}

          {/* Commits (Metas) */}
          {tab === "commits" && (
            <>
              {/* Filter + copy toolbar */}
              <div className="pmt_commitClipbar">
                {/* Filter dropdown */}
                <div className="pmt_filterDropWrap" ref={commitFilterRef}>
                  <button
                    type="button"
                    className={`pmt_filterBtn${(areaFilter !== null || statusFilter !== "all" || commitSort !== "default") ? " pmt_filterBtn--active" : ""}`}
                    onClick={() => setShowCommitFilter((v) => !v)}>
                    <Filter size={13} />
                    Filtrar
                    {(areaFilter !== null || statusFilter !== "all" || commitSort !== "default") && (
                      <span className="pmt_filterBadge" />
                    )}
                  </button>
                  {showCommitFilter && (
                    <div className="pmt_filterMenu">
                      {/* Área */}
                      {usedAreas.length > 1 && (
                        <div className="pmt_filterMenuSection">
                          <span className="pmt_filterMenuLabel">Área</span>
                          <button type="button"
                            className={`pmt_filterMenuOpt${areaFilter === null ? " pmt_filterMenuOpt--active" : ""}`}
                            onClick={() => { setAreaFilter(null); setShowCommitFilter(false); }}>
                            <span>Todas</span>
                          </button>
                          {usedAreas.map((area) => (
                            <button key={area.key} type="button"
                              className={`pmt_filterMenuOpt${areaFilter === area.key ? " pmt_filterMenuOpt--active" : ""}`}
                              onClick={() => { setAreaFilter((f) => f === area.key ? null : area.key); setShowCommitFilter(false); }}>
                              <span className="pmt_filterDot" style={{ background: area.color }} />
                              <span>{area.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Estado */}
                      <div className="pmt_filterMenuSection">
                        <span className="pmt_filterMenuLabel">Estado</span>
                        {([
                          { k: "all",         label: "Todos",        dot: undefined },
                          { k: "success",     label: "Completadas",  dot: "var(--st-ok)" },
                          { k: "in_progress", label: "En progreso",  dot: "var(--st-progress)" },
                          { k: "failed",      label: "Fallidas",     dot: "var(--st-critical)" },
                        ] as { k: "all"|"success"|"in_progress"|"failed"; label: string; dot?: string }[]).map(({ k, label, dot }) => (
                          <button key={k} type="button"
                            className={`pmt_filterMenuOpt${statusFilter === k ? " pmt_filterMenuOpt--active" : ""}`}
                            onClick={() => { setStatusFilter(k); setShowCommitFilter(false); }}>
                            {dot && <span className="pmt_filterDot" style={{ background: dot }} />}
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                      {/* Ordenar */}
                      <div className="pmt_filterMenuSection">
                        <span className="pmt_filterMenuLabel">Ordenar por</span>
                        {([
                          { k: "default",  label: "Por defecto" },
                          { k: "deadline", label: "Cercanía de fecha" },
                          { k: "status",   label: "Estado" },
                        ] as const).map(({ k, label }) => (
                          <button key={k} type="button"
                            className={`pmt_filterMenuOpt${commitSort === k ? " pmt_filterMenuOpt--active" : ""}`}
                            onClick={() => { setCommitSort(k); setShowCommitFilter(false); }}>
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Search */}
                <div className="pmt_filterSearch">
                  <Search size={13} />
                  <input
                    placeholder="Buscar meta..."
                    value={commitSearch}
                    onChange={(e) => setCommitSearch(e.target.value)} />
                </div>

                {/* Copy / Paste */}
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                  {selectedIds.size > 0 && (
                    <>
                      <span style={{ fontSize: 11, color: "var(--pmt-text-muted)" }}>
                        {selectedIds.size} seleccionada{selectedIds.size !== 1 ? "s" : ""}
                      </span>
                      <button type="button" className="pmt_commitClipBtn pmt_commitClipBtn--copy pmt_commitClipBtn--icon"
                        title="Copiar selección"
                        onClick={() => {
                          onCopyCommits(commits.filter((c) => selectedIds.has(c.id)));
                          clearSelection();
                        }}>
                        <Copy size={13} />
                      </button>
                      <button type="button" className="pmt_commitClipBtn pmt_commitClipBtn--icon"
                        title="Deseleccionar"
                        onClick={clearSelection}>
                        <X size={13} />
                      </button>
                    </>
                  )}
                  {selectedIds.size === 0 && commits.length > 0 && (
                    <button type="button" className="pmt_commitClipBtn pmt_commitClipBtn--copy"
                      onClick={() => onCopyCommits(commits)}>
                      <Copy size={11} />
                      Copiar todas ({commits.length})
                    </button>
                  )}
                  {copiedCommits.length > 0 && canEdit && (
                    <button type="button" className="pmt_commitClipBtn pmt_commitClipBtn--paste"
                      onClick={onPasteCommits}>
                      <Clipboard size={11} />
                      Pegar {copiedCommits.length} meta{copiedCommits.length !== 1 ? "s" : ""}
                    </button>
                  )}
                </div>
              </div>

              <div className="pmt_drawerCommits">
                {commits.length === 0 && !addCommitOpen && (
                  <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--pmt-text-subtle)", fontSize: 13 }}>
                    Aún no hay metas para este equipo.<br />
                    <span style={{ fontSize: 12 }}>Escribe una meta abajo y asígnale un día límite.</span>
                  </div>
                )}
                {visibleCommits.length === 0 && commits.length > 0 && (
                  <div style={{ padding: "24px 20px", textAlign: "center", color: "var(--pmt-text-subtle)", fontSize: 12 }}>
                    Sin metas para esta área.
                  </div>
                )}
                {visibleCommits.map((commit) => {
                  const isLate  = isCommitLate(commit, todayDay);
                  const penalty = commit.due_date
                    ? commitDaysLate(commit, penaltyPerDay, maxPenalty)
                    : calcPenalty(commit.deadline_day, commit.status, todayDay, penaltyPerDay, maxPenalty);
                  const el      = elKey(commit);
                  const isSelected = selectedIds.has(commit.id);
                  return (
                    <div key={commit.id} className={`pmt_commitRow2${isLate ? " pmt_commitRow2--late" : ""}${isSelected ? " pmt_commitRow2--selected" : ""}`}>
                      <input
                        type="checkbox"
                        className="pmt_commitCheckbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(commit.id)} />
                      <button type="button"
                        className={`pmt_commitPip pmt_commitPip--${commit.status}`}
                        onClick={canEdit ? () => onStatusChange(commit.id, STATUS_CYCLE[commit.status]) : undefined}
                        style={canEdit ? undefined : { cursor: "default", pointerEvents: "none" }}
                        title={canEdit ? "Click para cambiar estado" : undefined} />
                      <span className="pmt_commitArea"
                        style={{
                          background: areaColor(areas, el) + "22",
                          color: areaColor(areas, el),
                        }}>
                        {areaLabel(areas, el)}
                      </span>
                      {editingLabelId === commit.id ? (
                        <input className="pmt_commitLabelInput" value={labelDraft} autoFocus
                          onChange={(e) => setLabelDraft(e.target.value)}
                          onBlur={() => { onEditCommitLabel(commit.id, labelDraft); setEditingLabelId(null); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")  { onEditCommitLabel(commit.id, labelDraft); setEditingLabelId(null); }
                            if (e.key === "Escape") { setEditingLabelId(null); }
                          }} />
                      ) : (
                        <span className="pmt_commitLabel2" title="Click para editar"
                          onClick={() => { setEditingLabelId(commit.id); setLabelDraft(commit.label); }}>
                          {commit.label}
                        </span>
                      )}
                      <span className="pmt_commitDay">
                        {commit.due_date
                          ? new Date(commit.due_date + "T00:00:00").toLocaleDateString("es-MX", { month: "short", day: "numeric" })
                          : `Día ${commit.deadline_day}`}
                      </span>
                      {isLate && penalty > 0 && (
                        <span className="pmt_commitPenalty2">-{penalty}pt</span>
                      )}
                      <button type="button" className="pmt_commitDescBtn"
                        title={commit.description ? "Ver/editar descripción" : "Agregar descripción"}
                        onClick={() => { setDescPopupCommit(commit); setDescDraft(commit.description ?? ""); }}>
                        <Pencil size={11} />
                        {commit.description && <span className="pmt_commitDescDot" />}
                      </button>
                      {canEdit && (
                        <button type="button" className="pmt_commitDeleteBtn"
                          onClick={() => onDeleteCommit(commit.id)} title="Eliminar meta">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {!addCommitOpen && canEdit && (
                <button type="button" className="pmt_addCommitBtn"
                  onClick={() => setAddCommitOpen(true)}>
                  <Plus size={12} /> Agregar meta
                </button>
              )}
              {addCommitOpen && (
                <div className="pmt_addCommitForm">
                  <select value={commitDraft.element}
                    onChange={(e) => setCommitDraft((d) => ({ ...d, element: e.target.value }))}>
                    {areas.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                  <input
                    placeholder="Describe la meta..."
                    value={commitDraft.label}
                    autoFocus
                    onChange={(e) => setCommitDraft((d) => ({ ...d, label: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && commitDraft.label.trim() && commitDraft.due_date) {
                        onAddCommit(commitDraft);
                        setAddCommitOpen(false);
                        setCommitDraft({ label: "", element: areas[0]?.key ?? "robot", deadline_day: Math.ceil(totalDays / 2), start_date: "", due_date: "" });
                      }
                    }}
                  />
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 10, color: "var(--pmt-text-subtle)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Inicio
                      </span>
                      <input
                        type="date"
                        value={commitDraft.start_date ?? ""}
                        onChange={(e) => setCommitDraft((d) => ({ ...d, start_date: e.target.value }))}
                        style={{ fontSize: 12, padding: "4px 8px", border: "1px solid var(--pmt-border)", borderRadius: 6, background: "var(--pmt-surface)", color: "var(--pmt-text)", fontFamily: "inherit" }}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 10, color: "var(--pmt-text-subtle)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Límite
                      </span>
                      <input
                        type="date"
                        value={commitDraft.due_date ?? ""}
                        min={commitDraft.start_date ?? ""}
                        onChange={(e) => setCommitDraft((d) => ({
                          ...d,
                          due_date: e.target.value,
                          deadline_day: e.target.value ? dateToDay(e.target.value, projectStartDate) : d.deadline_day,
                        }))}
                        style={{ fontSize: 12, padding: "4px 8px", border: "1px solid var(--pmt-border)", borderRadius: 6, background: "var(--pmt-surface)", color: "var(--pmt-text)", fontFamily: "inherit" }}
                      />
                    </div>
                  </div>
                  <button type="button" onClick={() => {
                    if (!commitDraft.label.trim() || !commitDraft.due_date) return;
                    onAddCommit(commitDraft);
                    setAddCommitOpen(false);
                    setCommitDraft({ label: "", element: areas[0]?.key ?? "robot", deadline_day: Math.ceil(totalDays / 2), start_date: "", due_date: "" });
                  }}>Agregar</button>
                  <button type="button" onClick={() => setAddCommitOpen(false)}>Cancelar</button>
                </div>
              )}

              {/* Description popup */}
              {descPopupCommit && (
                <>
                  <div className="pmt_descOverlay" onClick={() => setDescPopupCommit(null)} />
                  <div className="pmt_descPopup">
                    <div className="pmt_descPopupHead">
                      <span className="pmt_descPopupTitle">Descripción de meta</span>
                      <button type="button" className="pmt_drawerClose"
                        onClick={() => setDescPopupCommit(null)}>
                        <X size={14} />
                      </button>
                    </div>
                    <div className="pmt_descPopupLabel">{descPopupCommit.label}</div>
                    <textarea
                      className="pmt_descTextarea"
                      value={descDraft}
                      placeholder="Añade una descripción, notas o detalles sobre esta meta..."
                      onChange={(e) => setDescDraft(e.target.value)}
                      rows={5}
                      autoFocus
                    />
                    <div className="pmt_descPopupActions">
                      <button type="button" className="pmt_addEntryConfirm"
                        style={{ fontSize: 12, padding: "5px 14px" }}
                        onClick={() => {
                          onEditCommitDescription(descPopupCommit.id, descDraft);
                          setDescPopupCommit(null);
                        }}>
                        Guardar
                      </button>
                      <button type="button" className="pmt_commitClipBtn"
                        style={{ fontSize: 12, padding: "5px 12px" }}
                        onClick={() => setDescPopupCommit(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          </div>{/* pmt_drawerInner */}
        </div>
      </div>
    </>
  );
}

// ─── TeamCard ─────────────────────────────────────────────────────────────────

function TeamCard({
  entry, commits, areas, isSelected, todayDay,
  penaltyPerDay, maxPenalty, zones, editingEntryId, editDraft,
  onSelect, onOpenCommits,
  onStartEdit, onChangeEditDraft, onSaveEntry, onCancelEdit, onDeleteEntry,
  isFirstPlace, canEdit,
}: {
  entry: TraceTeamEntry;
  commits: TraceCommit[];
  areas: AreaDef[];
  isSelected: boolean;
  todayDay: number;
  penaltyPerDay: number;
  maxPenalty: number;
  zones: ZoneThresholds;
  editingEntryId: string | null;
  editDraft: { team_name: string; pm_name: string; color: string };
  onSelect: () => void;
  onOpenCommits: () => void;
  onStartEdit: () => void;
  onChangeEditDraft: (d: { team_name: string; pm_name: string; color: string }) => void;
  onSaveEntry: (id: string) => void;
  onCancelEdit: () => void;
  onDeleteEntry: () => void;
  isFirstPlace?: boolean;
  canEdit: boolean;
}) {
  const score     = calcEntryScore(commits, todayDay, penaltyPerDay, maxPenalty);
  const grade     = gradeInfo(score, zones);
  const isEditing = editingEntryId === entry.id;

  return (
    <div
      className={`pmt_card${isSelected ? " pmt_card--selected" : ""}${isFirstPlace ? " pmt_card--first" : ""}`}
      onClick={onSelect}>
      {/* Top */}
      <div className="pmt_cardTop">
        {(() => {
          const a = matteAvatar(entry.pm_name);
          return (
            <div className={`pmt_pmAvatar${isFirstPlace ? " pmt_avatar--first" : ""}`}
              style={{ background: a.bg, color: a.text }}>
              {entry.pm_name.charAt(0).toUpperCase()}
            </div>
          );
        })()}
        <div className="pmt_cardNames">
          <div className="pmt_pmNameText">{entry.pm_name}</div>
          <div className="pmt_teamNameText">{entry.team_name}</div>
        </div>
        <div className="pmt_scoreBlock">
          <div className="pmt_scoreNum" style={{ color: grade.color }}>{score}</div>
          <div className="pmt_scoreGrade" style={{ color: grade.color }}>{grade.label}</div>
        </div>
        {canEdit && (
          <button type="button" className="pmt_cardEditBtn"
            onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
            title="Editar">
            <Pencil size={11} />
          </button>
        )}
      </div>

      {/* Edit overlay */}
      {isEditing && (
        <div className="pmt_cardEditOverlay" onClick={(e) => e.stopPropagation()}>
          <div className="pmt_editField">
            <label>Nombre del equipo</label>
            <input value={editDraft.team_name}
              onChange={(e) => onChangeEditDraft({ ...editDraft, team_name: e.target.value })} />
          </div>
          <div className="pmt_editField">
            <label>PM</label>
            <input value={editDraft.pm_name}
              onChange={(e) => onChangeEditDraft({ ...editDraft, pm_name: e.target.value })} />
          </div>
          <div className="pmt_editField">
            <label>Color</label>
            <input type="color" value={editDraft.color}
              onChange={(e) => onChangeEditDraft({ ...editDraft, color: e.target.value })} />
          </div>
          <div className="pmt_editActions">
            <button type="button" className="pmt_editActions__delete" onClick={onDeleteEntry}>Eliminar</button>
            <button type="button" className="pmt_editActions__cancel" onClick={onCancelEdit}>Cancelar</button>
            <button type="button" className="pmt_editActions__save" onClick={() => onSaveEntry(entry.id)}>Guardar</button>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="pmt_cardBody">
        <div className="pmt_cardScoreRow">
          <span className="pmt_cardScoreLabel">SCORE</span>
          <span className="pmt_cardScoreVal" style={{ color: grade.color }}>
            {commits.length === 0 ? "—" : score}
            {commits.length > 0 && <span className="pmt_cardScoreMax">/100</span>}
          </span>
        </div>
        <div className="pmt_cardScoreTrack">
          <div className="pmt_cardScoreFill" style={{ width: `${score}%`, background: grade.color }} />
        </div>

        {commits.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--pmt-text-subtle)", textAlign: "center", padding: "8px 0" }}>
            Sin metas · click "Metas" para agregar
          </div>
        ) : (
          <div className="pmt_cardBodyRow">
            <Donut
              ok={commits.filter((c) => c.status === "success").length}
              fail={commits.filter((c) => c.status === "failed").length}
              pend={commits.filter((c) => c.status === "pending" || c.status === "in_progress").length}
            />
            <div className="pmt_elementBars" style={{ flex: 1, minWidth: 0 }}>
              {areas.map((area) => {
                const elCommits = commits.filter((c) => elKey(c) === area.key);
                const elTotal   = elCommits.length;
                const elOk      = elCommits.filter((c) => c.status === "success").length;
                const elFail    = elCommits.filter((c) => c.status === "failed").length;
                const elPend    = elCommits.filter((c) => c.status === "pending" || c.status === "in_progress").length;
                const pct       = elTotal > 0 ? Math.round((elOk / elTotal) * 100) : 0;
                return (
                  <div key={area.key} className="pmt_elementRow">
                    <span className="pmt_elementLabel">{area.label}</span>
                    <div className="pmt_elementTrack">
                      {elTotal > 0 && (
                        <>
                          <div className="pmt_elementFill pmt_elementFill--ok"
                            style={{ width: `${(elOk / elTotal) * 100}%`, background: area.color }} />
                          <div className="pmt_elementFill pmt_elementFill--fail"
                            style={{ width: `${(elFail / elTotal) * 100}%` }} />
                          <div className="pmt_elementFill pmt_elementFill--pend"
                            style={{ width: `${(elPend / elTotal) * 100}%` }} />
                        </>
                      )}
                    </div>
                    <span className="pmt_elementCount">{elTotal > 0 ? `${pct}%` : "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pmt_cardFooter" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pmt_cardFooterBtn" onClick={onOpenCommits}>
          Metas{commits.length > 0 ? ` (${commits.length})` : " +"}
        </button>
      </div>
    </div>
  );
}

// ─── TeamListRow ──────────────────────────────────────────────────────────────

function TeamListRow({
  entry, commits, todayDay, penaltyPerDay, maxPenalty, zones, onSelect, isFirstPlace,
}: {
  entry: TraceTeamEntry;
  commits: TraceCommit[];
  todayDay: number;
  penaltyPerDay: number;
  maxPenalty: number;
  zones: ZoneThresholds;
  onSelect: () => void;
  isFirstPlace?: boolean;
}) {
  const score   = calcEntryScore(commits, todayDay, penaltyPerDay, maxPenalty);
  const total   = commits.length;
  const grade   = gradeInfo(score, zones);
  const st      = statusFromScore(score, zones);

  return (
    <div className="pmt_listRow" onClick={onSelect}>
      <div className={`pmt_listAvatar${isFirstPlace ? " pmt_avatar--first" : ""}`}
        style={{ background: matteAvatar(entry.pm_name).bg, color: matteAvatar(entry.pm_name).text }}>
        {entry.pm_name.charAt(0).toUpperCase()}
      </div>
      <div className="pmt_listNames">
        <span className="pmt_listName">{entry.team_name}</span>
        <span className="pmt_listSub">{entry.pm_name}</span>
      </div>
      <div className="pmt_listRowBar">
        <div className="pmt_listRowFill" style={{ width: `${score}%`, background: grade.color }} />
      </div>
      <span className="pmt_listRowScore" style={{ color: grade.color }}>
        {total > 0 ? score : "—"}
      </span>
      <span className={`pmt_listStatus pmt_listStatus--${total > 0 ? st : "info"}`}>
        {total > 0 ? grade.label : "Sin metas"}
      </span>
      <div className="pmt_listRowStats">
        <span className="pmt_listRowStat">{total} metas</span>
      </div>
    </div>
  );
}

// ─── ProjectGantt ─────────────────────────────────────────────────────────────

function weekendBg(dates: Date[], totalCalDays: number): string {
  if (totalCalDays <= 0) return "transparent";
  const stops: string[] = [];
  let segStart = 0;
  let curWeekend = dates[0]?.getDay() === 0 || dates[0]?.getDay() === 6;
  for (let i = 1; i <= totalCalDays; i++) {
    const nowWeekend = i < dates.length && (dates[i].getDay() === 0 || dates[i].getDay() === 6);
    if (nowWeekend !== curWeekend || i === totalCalDays) {
      const s = ((segStart / totalCalDays) * 100).toFixed(3);
      const e = ((i / totalCalDays) * 100).toFixed(3);
      const col = curWeekend ? "rgba(0,0,0,0.04)" : "transparent";
      stops.push(`${col} ${s}%`, `${col} ${e}%`);
      segStart = i;
      curWeekend = nowWeekend;
    }
  }
  return stops.length ? `linear-gradient(90deg,${stops.join(",")})` : "transparent";
}

function ProjectGantt({
  entries, commitsByEntry, areas, projectStartDate, projectEndDate, onDeadlineChange,
}: {
  entries: TraceTeamEntry[];
  commitsByEntry: Record<string, TraceCommit[]>;
  areas: AreaDef[];
  projectStartDate: string;
  projectEndDate: string | null;
  onDeadlineChange: (id: string, newDate: string) => void;
}) {
  const commitDeadlineDate = (c: TraceCommit) =>
    c.due_date ?? dayToDate(c.deadline_day, projectStartDate);

  const resolvedEnd = projectEndDate ?? (() => {
    const allC = entries.flatMap((e) => commitsByEntry[e.id] ?? []);
    if (allC.length === 0) return projectStartDate;
    return allC.reduce((best, c) => {
      const d = commitDeadlineDate(c);
      return d > best ? d : best;
    }, projectStartDate);
  })();

  const totalCalDays = Math.max(1, calendarDaysBetween(projectStartDate, resolvedEnd) + 1);
  const startObj = new Date(projectStartDate + "T00:00:00");
  const dates: Date[] = Array.from({ length: totalCalDays }, (_, i) => {
    const d = new Date(startObj);
    d.setDate(startObj.getDate() + i);
    return d;
  });

  const todayStr = new Date().toISOString().split("T")[0];
  const todayOff = calendarDaysBetween(projectStartDate, todayStr);
  const todayPct = (todayOff / totalCalDays) * 100;
  const todayDay = Math.max(1, todayOff + 1);

  const wkBg = weekendBg(dates, totalCalDays);

  const tickEvery = totalCalDays > 90 ? 14 : totalCalDays > 45 ? 7 : totalCalDays > 21 ? 3 : 1;
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const fmtDate = (d: Date) => `${d.getDate()} ${months[d.getMonth()]}`;

  const commitStart = (commit: TraceCommit, allCommits: TraceCommit[]) => {
    const el = elKey(commit);
    const sorted = allCommits
      .filter((c) => c.element_key === el)
      .sort((a, b) =>
        calendarDaysBetween(projectStartDate, commitDeadlineDate(a)) -
        calendarDaysBetween(projectStartDate, commitDeadlineDate(b)),
      );
    const idx = sorted.findIndex((c) => c.commit_key === commit.commit_key);
    if (idx <= 0) return projectStartDate;
    const prev = new Date(commitDeadlineDate(sorted[idx - 1]) + "T00:00:00");
    prev.setDate(prev.getDate() + 1);
    return prev.toISOString().split("T")[0];
  };

  return (
    <div className="pmt_projectGantt">
      <div className="pmt_pgHeader">
        <div className="pmt_pgLabelCol">Equipo / Meta</div>
        <div className="pmt_ganttTrack pmt_pgDayTrack" style={{ background: wkBg, overflow: "visible" }}>
          {dates.map((d, i) => {
            if (i % tickEvery !== 0) return null;
            return (
              <div key={i} className="pmt_ganttDateTick" style={{ left: `${(i / totalCalDays) * 100}%` }}>
                {fmtDate(d)}
              </div>
            );
          })}
          {todayOff >= 0 && todayOff < totalCalDays && (
            <div className="pmt_ganttTodayLine" style={{ left: `${todayPct}%` }} />
          )}
        </div>
      </div>

      {entries.map((entry) => {
        const commits = commitsByEntry[entry.id] ?? [];
        return (
          <div key={entry.id} className="pmt_pgGroup">
            <div className="pmt_pgTeamRow">
              <div className="pmt_pgLabelCol">
                <div className="pmt_pgTeamBadge" style={{ background: entry.color || "#64748b" }}>
                  {entry.pm_name.charAt(0).toUpperCase()}
                </div>
                <div className="pmt_pgTeamInfo">
                  <span className="pmt_pgTeamName">{entry.team_name}</span>
                  <span className="pmt_pgPmName">{entry.pm_name}</span>
                </div>
              </div>
              <div className="pmt_ganttTrack pmt_pgTeamTrack" style={{ background: wkBg }}>
                <div className="pmt_ganttTodayLine" style={{ left: `${todayPct}%` }} />
              </div>
            </div>

            {commits.length === 0 && (
              <div className="pmt_pgRow">
                <div className="pmt_pgLabelCol pmt_pgCommitLabel">
                  <span style={{ color: "var(--pmt-text-subtle)", fontSize: 10 }}>Sin metas</span>
                </div>
                <div className="pmt_ganttTrack pmt_pgCommitTrack" style={{ background: wkBg }}>
                  <div className="pmt_ganttTodayLine" style={{ left: `${todayPct}%` }} />
                </div>
              </div>
            )}

            {commits.map((commit) => {
              const deadlineDate = commitDeadlineDate(commit);
              const startDateStr = commitStart(commit, commits);
              const startOff = Math.max(0, calendarDaysBetween(projectStartDate, startDateStr));
              const endOff   = Math.min(totalCalDays - 1, calendarDaysBetween(projectStartDate, deadlineDate));
              const barLeft  = (startOff / totalCalDays) * 100;
              const barWidth = Math.max(0.5, ((endOff - startOff + 1) / totalCalDays) * 100);
              const isLate   = isCommitLate(commit, todayDay);
              const el       = elKey(commit);
              const baseColor =
                commit.status === "failed"      ? "#dc2626" :
                commit.status === "success"     ? (entry.color || "#16a34a") :
                commit.status === "in_progress" ? (entry.color || "#2563eb") : "#94a3b8";
              const barBg =
                commit.status === "in_progress"
                  ? `repeating-linear-gradient(45deg,${baseColor},${baseColor} 4px,${baseColor}55 4px,${baseColor}55 8px)`
                  : baseColor;
              return (
                <div key={commit.id} className="pmt_pgRow">
                  <div className="pmt_pgLabelCol pmt_pgCommitLabel">
                    <span className="pmt_pgCommitEl"
                      style={{ background: areaColor(areas, el) + "22", color: areaColor(areas, el) }}>
                      {areaLabel(areas, el)}
                    </span>
                    <span className="pmt_pgCommitText" title={commit.label}>{commit.label}</span>
                    <span className="pmt_deadlineEdit" onClick={(e) => e.stopPropagation()}>
                      <input type="date"
                        value={deadlineDate}
                        onChange={(e) => onDeadlineChange(commit.id, e.target.value)}
                        className="pmt_deadlineInput" />
                    </span>
                  </div>
                  <div className="pmt_ganttTrack pmt_pgCommitTrack" style={{ background: wkBg }}>
                    <div className="pmt_ganttTodayLine" style={{ left: `${todayPct}%` }} />
                    <div className={`pmt_ganttBar${isLate ? " pmt_ganttBar--late" : ""}`}
                      style={{ left: `${barLeft}%`, width: `${barWidth}%`, background: barBg }}
                      title={`${commit.label}: ${startDateStr} – ${deadlineDate}`} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── SharePanel ──────────────────────────────────────────────────────────────

function SharePanel({
  teamId,
  sessionId,
  projectName: _projectName,
  onClose,
  auditorIds,
  onToggleAuditor,
  isProjectAdmin,
}: {
  teamId: string;
  sessionId: string;
  projectName: string;
  onClose: () => void;
  auditorIds: string[];
  onToggleAuditor: (userId: string) => Promise<void>;
  isProjectAdmin: boolean;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState<string>("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [hoverCode, setHoverCode] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<"idle" | "success" | "error">("idle");
  const [inviteError, setInviteError] = useState("");

  const shareUrl = `${window.location.origin}${window.location.pathname}?session=${encodeURIComponent(sessionId)}&team=${encodeURIComponent(teamId)}`;

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("team_memberships")
        .select("auth_user_id, role, created_at")
        .eq("team_id", teamId)
        .order("created_at");

      if (error) {
        console.error("[SharePanel] Load members error:", error);
        setLoading(false);
        return;
      }

      const base = (data ?? []).map((m: any) => ({
        user_id: m.auth_user_id,
        role: m.role,
        created_at: m.created_at,
      }));

      const ids = base.map((m) => m.user_id);
      const { data: profileData } = await supabase
        .from("profiles")
        .select("auth_user_id, email, full_name")
        .in("auth_user_id", ids);

      if (profileData && profileData.length > 0) {
        const profileMap = Object.fromEntries(
          profileData.map((p: any) => [p.auth_user_id, p])
        );
        setMembers(base.map((m) => ({
          ...m,
          full_name: profileMap[m.user_id]?.full_name ?? undefined,
          email: profileMap[m.user_id]?.email ?? undefined,
        })));
      } else {
        setMembers(base);
      }

      const { data: teamData } = await supabase
        .from("teams")
        .select("join_code, name")
        .eq("id", teamId)
        .single();
      if (teamData?.join_code) setJoinCode(teamData.join_code);

      setLoading(false);
    };
    load();
  }, [teamId]);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || inviting) return;
    setInviting(true);
    setInviteStatus("idle");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-track`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ email: inviteEmail.trim(), team_id: teamId }),
        }
      );
      const json = await res.json();
      if (!res.ok) { setInviteStatus("error"); setInviteError(json.error ?? "Error"); }
      else { setInviteStatus("success"); setInviteEmail(""); }
    } catch {
      setInviteStatus("error"); setInviteError("Error de conexión");
    } finally {
      setInviting(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const roleLabel = (role: string) => {
    if (role === "owner" || role === "admin") return "Admin";
    if (role === "lab_researcher" || role === "researcher") return "Researcher";
    return role;
  };

  const initials = (m: TeamMember) => {
    if (m.full_name) return m.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    if (m.email) return m.email.slice(0, 2).toUpperCase();
    return m.user_id.slice(0, 2).toUpperCase();
  };

  const displayName = (m: TeamMember) =>
    m.full_name || m.email || `Usuario ${m.user_id.slice(0, 6).toUpperCase()}`;

  return (
    <>
      <div className="pmt_drawerOverlay" onClick={onClose} />
      <div className="pmt_orionPanel" style={{ width: 480 }}>
        <div className="pmt_orionHead">
          <Share2 size={16} />
          <span>Compartir Dashboard</span>
          <button type="button" className="pmt_drawerClose" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="pmt_orionBody" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Link section */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--pmt-text-subtle)" }}>
              Link del dashboard
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{
                flex: 1, padding: "8px 12px", fontSize: 12, fontFamily: "var(--pmt-font-mono)",
                background: "var(--pmt-surface-2)", border: "1px solid var(--pmt-border)",
                borderRadius: 6, color: "var(--pmt-text-muted)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {shareUrl}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                style={{
                  padding: "8px 16px", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                  background: copied ? "var(--st-ok)" : "var(--pmt-accent)",
                  color: copied ? "#fff" : "var(--pmt-accent-text)",
                  border: "none", borderRadius: 6, cursor: "pointer",
                  whiteSpace: "nowrap", transition: "background 0.2s",
                  flexShrink: 0,
                }}>
                {copied ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--pmt-text-subtle)" }}>
              Cualquier miembro del lab con acceso puede ver este dashboard en tiempo real.
            </div>
          </div>

          {/* Invite section */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--pmt-text-subtle)" }}>
              Invitar por email
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="email"
                placeholder="correo@ejemplo.com"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteStatus("idle"); }}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                style={{
                  flex: 1, padding: "8px 12px", fontSize: 13, fontFamily: "inherit",
                  background: "var(--pmt-surface-2)", border: "1px solid var(--pmt-border)",
                  borderRadius: 6, color: "var(--pmt-text)", outline: "none",
                }}
              />
              <button type="button" onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}
                style={{
                  padding: "8px 16px", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                  background: "var(--pmt-accent)", color: "var(--pmt-accent-text)",
                  border: "none", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap",
                  opacity: (inviting || !inviteEmail.trim()) ? 0.5 : 1,
                }}>
                {inviting ? "Enviando..." : "Invitar"}
              </button>
            </div>
            {inviteStatus === "success" && (
              <div style={{ fontSize: 12, color: "var(--st-ok)" }}>
                ✓ Invitación enviada — recibirán un email para crear su cuenta.
              </div>
            )}
            {inviteStatus === "error" && (
              <div style={{ fontSize: 12, color: "var(--st-critical)" }}>✗ {inviteError}</div>
            )}
          </div>

          {/* Join code section */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--pmt-text-subtle)" }}>
              Join code del lab
            </div>
            <div
              role="button"
              tabIndex={joinCode ? 0 : -1}
              onClick={() => {
                if (!joinCode) return;
                navigator.clipboard.writeText(joinCode).then(() => {
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") e.currentTarget.click();
              }}
              onMouseEnter={() => setHoverCode(true)}
              onMouseLeave={() => setHoverCode(false)}
              style={{
                padding: "22px 16px", cursor: joinCode ? "pointer" : "default",
                background: copiedCode ? "var(--st-ok-soft, #dcfce7)" : hoverCode ? "var(--pmt-surface-3, var(--pmt-surface-2))" : "var(--pmt-surface-2)",
                border: `1px solid ${copiedCode ? "var(--st-ok)" : "var(--pmt-border)"}`,
                borderRadius: 8, transition: "background 0.15s, border-color 0.15s",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              }}>
              <span style={{
                fontSize: 22, fontWeight: 700, letterSpacing: "0.15em",
                fontFamily: "var(--pmt-font-mono)",
                color: copiedCode ? "var(--st-ok)" : "var(--pmt-text)",
                transition: "color 0.15s",
              }}>
                {joinCode || "—"}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 500, letterSpacing: "0.04em",
                color: copiedCode ? "var(--st-ok)" : "var(--pmt-text-subtle)",
                opacity: (hoverCode || copiedCode) ? 1 : 0,
                transition: "opacity 0.15s",
              }}>
                {copiedCode ? "✓ Copiado" : "click to copy"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--pmt-text-subtle)" }}>
              Comparte este código con tu equipo. Al registrarse e ingresar el código, tendrán acceso automático al dashboard.
            </div>
          </div>

          {/* Members section */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--pmt-text-subtle)" }}>
                Miembros del lab
              </div>
              <span style={{ fontSize: 11, color: "var(--pmt-text-subtle)", fontFamily: "var(--pmt-font-mono)" }}>
                {members.length} {members.length === 1 ? "miembro" : "miembros"}
              </span>
            </div>

            {loading ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--pmt-text-subtle)", fontSize: 13 }}>
                Cargando miembros...
              </div>
            ) : members.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--pmt-text-subtle)", fontSize: 13 }}>
                No hay miembros en este lab todavía.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {members.map((member) => (
                  <div key={member.user_id} className="pmt_orionRow" style={{ padding: "10px 0" }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8,
                      background: "var(--pmt-accent)", color: "var(--pmt-accent-text)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 600, flexShrink: 0,
                    }}>
                      {initials(member)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pmt-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {displayName(member)}
                      </div>
                      {member.email && member.full_name && (
                        <div style={{ fontSize: 11, color: "var(--pmt-text-subtle)" }}>{member.email}</div>
                      )}
                    </div>
                    <span style={{
                      padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: member.role === "owner" || member.role === "admin"
                        ? "var(--st-info-soft)" : "var(--pmt-border-soft)",
                      color: member.role === "owner" || member.role === "admin"
                        ? "var(--st-info)" : "var(--pmt-text-muted)",
                    }}>
                      {roleLabel(member.role)}
                    </span>
                    {isProjectAdmin ? (
                      <button
                        type="button"
                        onClick={() => onToggleAuditor(member.user_id)}
                        style={{
                          padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                          fontFamily: "inherit", cursor: "pointer",
                          background: auditorIds.includes(member.user_id)
                            ? "rgba(217,119,6,0.12)" : "transparent",
                          color: auditorIds.includes(member.user_id)
                            ? "#d97706" : "var(--pmt-text-subtle)",
                          border: auditorIds.includes(member.user_id)
                            ? "1px solid #d97706" : "1px solid var(--pmt-border)",
                          transition: "all 0.12s",
                        }}>
                        {auditorIds.includes(member.user_id) ? "✓ Auditor" : "Auditor"}
                      </button>
                    ) : auditorIds.includes(member.user_id) ? (
                      <span style={{
                        padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                        background: "rgba(217,119,6,0.12)", color: "#d97706",
                        border: "1px solid #d97706",
                      }}>
                        Auditor
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── NoteKpiTile ─────────────────────────────────────────────────────────────
// Editable free-text tile for the KPI strip corner.

function NoteKpiTile({
  value,
  onSave,
  onGenerate,
  generating,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const [saving, setSaving]   = useState(false);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="pmt_kpiNoteTile pmt_kpiNoteTile--editing">
        <textarea
          className="pmt_kpiNoteTextarea"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
          placeholder="Nota, palabra del día, instrucción..."
          rows={3}
        />
        <div className="pmt_kpiNoteActions">
          <button type="button" onClick={() => { setDraft(value); setEditing(false); }}
            className="pmt_kpiNoteCancel">Cancelar</button>
          <button type="button" onClick={commit} disabled={saving}
            className="pmt_kpiNoteSave">{saving ? "..." : "Guardar"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pmt_kpiNoteTile" onClick={() => setEditing(true)} title="Click para editar">
      {value.trim() ? (
        <div className="pmt_kpiNoteText">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
            {value}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="pmt_kpiNoteEmpty">+ Agregar nota o mensaje del día...</p>
      )}
      <div className="pmt_kpiNoteHint">
        <span>click para editar</span>
        {onGenerate && (
          <span
            className={`pmt_kpiNoteRefresh${generating ? " pmt_kpiNoteRefresh--loading" : ""}`}
            onClick={(e) => { e.stopPropagation(); if (!generating) onGenerate(); }}
          >
            {generating ? "generando..." : "↻ refresh word"}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── CustomKpiTile ────────────────────────────────────────────────────────────

function CustomKpiTile({
  name,
  score,
  onSave,
  canEdit,
}: {
  name: string;
  score: number;
  onSave: (name: string, score: number) => Promise<void>;
  canEdit: boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName]     = useState(name);
  const [localScore, setLocalScore]   = useState(score);

  useEffect(() => { setDraftName(name); }, [name]);
  useEffect(() => { setLocalScore(score); }, [score]);

  const commitName = async () => {
    setEditingName(false);
    const trimmed = draftName.trim() || "Personalizado";
    if (trimmed !== name) await onSave(trimmed, localScore);
  };

  const adjustScore = async (delta: number) => {
    const next = Math.max(0, Math.min(100, localScore + delta));
    setLocalScore(next);
    await onSave(name, next);
  };

  return (
    <div className="pmt_kpiTile pmt_kpiTile--sm pmt_kpiTile--custom">
      {editingName && canEdit ? (
        <input
          className="pmt_kpiCustomNameInput"
          value={draftName}
          autoFocus
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitName(); }
            if (e.key === "Escape") { setDraftName(name); setEditingName(false); }
          }}
          maxLength={24}
        />
      ) : (
        <span
          className={`pmt_kpiLabel${canEdit ? " pmt_kpiLabel--editable" : ""}`}
          onClick={canEdit ? () => setEditingName(true) : undefined}
          title={canEdit ? "Click para editar nombre" : undefined}
        >
          {(name.trim() || "PERSONALIZADO").toUpperCase()}
        </span>
      )}
      {canEdit ? (
        <div className="pmt_kpiCustomScore">
          <button type="button" className="pmt_kpiCustomBtn" onClick={() => adjustScore(-1)}>−</button>
          <span className="pmt_kpiValue">{localScore}<span className="pmt_kpiUnit">/100</span></span>
          <button type="button" className="pmt_kpiCustomBtn" onClick={() => adjustScore(1)}>+</button>
        </div>
      ) : (
        <span className="pmt_kpiValue">{localScore}<span className="pmt_kpiUnit">/100</span></span>
      )}
      <span className="pmt_kpiSub">{canEdit ? "click nombre para editar" : "solo auditor"}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PmTrackerPanel({
  sessionId, teamId, userId: _userId, config, onExpandSidebar,
}: PmTrackerPanelProps) {
  const penaltyPerDay   = (config.penalty_per_day   as number | undefined) ?? 5;
  const maxPenalty      = (config.max_penalty        as number | undefined) ?? 20;
  const configTotalDays = (config.total_working_days as number | undefined) ?? 10;

  // ── Core state ──────────────────────────────────────────────────────────────
  const [project, setProject]               = useState<TraceProject | null>(null);
  const [entries, setEntries]               = useState<TraceTeamEntry[]>([]);
  const [commitsByEntry, setCommitsByEntry] = useState<Record<string, TraceCommit[]>>({});
  const [loading, setLoading]               = useState(true);
  const [creatingProject, setCreatingProject] = useState(false);

  // Derived from project config
  const projectCfg  = (project?.config ?? {}) as Record<string, unknown>;
  const theme        = (projectCfg.theme as string | undefined) ?? "light";
  const zones        = (projectCfg.zones as ZoneThresholds | undefined) ?? DEFAULT_ZONES;
  const areas: AreaDef[] = useMemo(
    () => (projectCfg.areas as AreaDef[] | undefined) ?? DEFAULT_AREAS,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project],
  );
  const entryTracks  = (projectCfg.entry_tracks as Record<string, string> | undefined) ?? {};
  const configTracks = (projectCfg.tracks as string[] | undefined) ?? ["Track 1", "Track 2"];

  // ── Add tracker form ────────────────────────────────────────────────────────
  const [showAddEntry, setShowAddEntry]   = useState(false);
  const [newEntryName, setNewEntryName]   = useState("");
  const [newPmName, setNewPmName]         = useState("");
  const [newEntryColor, setNewEntryColor] = useState("#2563eb");
  const [newEntryTrack, setNewEntryTrack] = useState("");
  const [newTrackInput, setNewTrackInput] = useState("");

  // ── Edit project name ───────────────────────────────────────────────────────
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft]     = useState("");

  // ── Edit entry ──────────────────────────────────────────────────────────────
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ team_name: "", pm_name: "", color: "#2563eb" });

  // ── Drawer ──────────────────────────────────────────────────────────────────
  const [drawerEntryId, setDrawerEntryId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab]         = useState<"overview" | "commits">("overview");

  // ── Filters / view ──────────────────────────────────────────────────────────
  const [filter, setFilter]           = useState<"all" | "critical" | "warning" | "ontrack">("all");
  const [search, setSearch]           = useState("");
  const [sortBy, setSortBy]           = useState<"score" | "name" | "progress">("score");
  const [view, setView]               = useState<"grid" | "list" | "gantt">("grid");
  const [trackFilter, setTrackFilter] = useState<string | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // ── Settings ────────────────────────────────────────────────────────────────
  const [showSettings, setShowSettings]   = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({
    start_date: "",
    end_date: "",
    penalty_per_day: penaltyPerDay,
    max_penalty: maxPenalty,
    total_working_days: configTotalDays,
    zones: DEFAULT_ZONES as ZoneThresholds,
    theme: "light",
    areas: DEFAULT_AREAS as AreaDef[],
  });

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) =>
      setCurrentUserId(data.user?.id ?? null)
    );
  }, []);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  useEffect(() => {
    if (!teamId) return;
    const loadMembers = async () => {
      const { data } = await supabase
        .from("team_memberships")
        .select("auth_user_id, role")
        .eq("team_id", teamId);
      if (!data) return;
      const ids = data.map((m: any) => m.auth_user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("auth_user_id, full_name, email")
        .in("auth_user_id", ids);
      const profileMap = Object.fromEntries(
        (profiles ?? []).map((p: any) => [p.auth_user_id, p])
      );
      setTeamMembers(data.map((m: any) => ({
        user_id: m.auth_user_id,
        role: m.role,
        full_name: profileMap[m.auth_user_id]?.full_name,
        email: profileMap[m.auth_user_id]?.email,
      })));
    };
    loadMembers();
  }, [teamId]);

  // ── ORION Check ─────────────────────────────────────────────────────────────
  const [showOrionCheck, setShowOrionCheck] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [wordGenerating, setWordGenerating] = useState(false);

  const totalDays = project?.start_date && project?.end_date
    ? calendarDaysBetween(project.start_date, project.end_date) + 1
    : project?.total_working_days ?? configTotalDays;
  const todayDay  = project ? getTodayDay(project) : 1;

  // ── Auditor role ─────────────────────────────────────────────────────────────
  const auditorIds = (projectCfg.auditor_ids as string[] | undefined) ?? [];
  const isProjectAdmin = teamMembers.some(
    (m) => m.user_id === currentUserId && (m.role === "owner" || m.role === "admin"),
  );
  const canEditCustomKpi = isProjectAdmin || (currentUserId !== null && auditorIds.includes(currentUserId));

  const handleToggleAuditor = useCallback(async (userId: string) => {
    if (!project) return;
    const current = (project.config?.auditor_ids as string[] | undefined) ?? [];
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];
    const newConfig = { ...(project.config ?? {}), auditor_ids: next };
    await supabase.from("trace_projects").update({ config: newConfig }).eq("id", project.id);
    setProject((prev) => prev ? { ...prev, config: newConfig } : prev);
  }, [project]);

  // ── Commit clipboard ─────────────────────────────────────────────────────────
  const [copiedCommits, setCopiedCommits] = useState<TraceCommit[]>([]);

  const handlePasteCommits = useCallback(async (entryId: string) => {
    if (copiedCommits.length === 0) return;
    const now = new Date().toISOString();
    const inserts = copiedCommits.map((c) => ({
      id: crypto.randomUUID(),
      entry_id: entryId,
      commit_key: `goal_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      element_key: c.element_key,
      label: c.label,
      deadline_day: c.deadline_day,
      ...(c.due_date ? { due_date: c.due_date } : {}),
      status: "pending" as const,
      updated_at: now,
    }));
    const { data, error } = await supabase.from("trace_commits").insert(inserts).select();
    if (error) { console.error("[PmTracker] Paste commits error:", error); return; }
    setCommitsByEntry((prev) => ({
      ...prev,
      [entryId]: [...(prev[entryId] ?? []), ...(data as TraceCommit[])].sort(
        (a, b) => a.deadline_day - b.deadline_day,
      ),
    }));
  }, [copiedCommits]);

  // ── Custom KPI save ──────────────────────────────────────────────────────────
  const handleSaveCustomKpi = useCallback(async (kpiName: string, kpiScore: number) => {
    if (!project) return;
    const newConfig = { ...(project.config ?? {}), customKpi: { name: kpiName, score: kpiScore } };
    await supabase.from("trace_projects").update({ config: newConfig }).eq("id", project.id);
    setProject((prev) => prev ? { ...prev, config: newConfig } : prev);
  }, [project]);

  // ── Note save (ref-based to avoid stale closure in onResponse) ───────────────
  const handleSaveNoteRef = useRef<(note: string) => Promise<void>>(async () => {});
  handleSaveNoteRef.current = async (note: string) => {
    if (!project) return;
    const newConfig = { ...(project.config ?? {}), note };
    await supabase.from("trace_projects").update({ config: newConfig }).eq("id", project.id);
    setProject((prev) => prev ? { ...prev, config: newConfig } : prev);
  };

  // ── Word of the Day agent ─────────────────────────────────────────────────────
  const { sendMessage: _generateWord } = useAgentChat({
    apiUrl: AGENT_API_URL,
    userId: _userId || undefined,
    userName: "PM Tracker",
    sessionId: undefined,
    interactionMode: "analysis",
    onEvent: (_evt: AgentEvent) => {},
    onResponse: async (text: string) => {
      await handleSaveNoteRef.current(text);
      setWordGenerating(false);
    },
    onError: () => setWordGenerating(false),
    onStreamEnd: () => {},
  });

  // ── Load data ────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: projectData, error: projectError } = await supabase
        .from("trace_projects").select("*").eq("team_id", teamId).maybeSingle();

      if (projectError) {
        console.error("[PmTracker] Load project error:", projectError);
        return;
      }
      if (!projectData) {
        setProject(null); setEntries([]); setCommitsByEntry({});
        return;
      }

      setProject(projectData as TraceProject);

      const { data: entriesData, error: entriesError } = await supabase
        .from("trace_team_entries").select("*")
        .eq("project_id", projectData.id).order("created_at");

      if (entriesError) console.error("[PmTracker] Load entries error:", entriesError);

      const loadedEntries = (entriesData ?? []) as TraceTeamEntry[];
      setEntries(loadedEntries);

      if (loadedEntries.length > 0) {
        const { data: commitsData, error: commitsError } = await supabase
          .from("trace_commits").select("*")
          .in("entry_id", loadedEntries.map((e) => e.id))
          .order("deadline_day");

        if (commitsError) console.error("[PmTracker] Load commits error:", commitsError);

        const byEntry: Record<string, TraceCommit[]> = {};
        for (const c of (commitsData ?? []) as TraceCommit[]) {
          if (!byEntry[c.entry_id]) byEntry[c.entry_id] = [];
          byEntry[c.entry_id].push(c);
        }
        setCommitsByEntry(byEntry);
      } else {
        setCommitsByEntry({});
      }
    } catch (err) {
      console.error("[PmTracker] Load error:", err);
    } finally {
      setLoading(false);
    }
  }, [sessionId, teamId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!showFilterMenu) return;
    const handler = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node))
        setShowFilterMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilterMenu]);

  // ── Create project ───────────────────────────────────────────────────────────
  const handleCreateProject = async () => {
    setCreatingProject(true);
    try {
      const { data: newProject, error } = await supabase
        .from("trace_projects")
        .insert({
          team_id: teamId,
          analysis_session_id: sessionId || null,
          name: "Flexible Manufacturing Challenge 2026",
          start_date: new Date().toISOString().split("T")[0],
          end_date: new Date(Date.now() + 14 * 864e5).toISOString().split("T")[0],
          total_working_days: 10,
          config: { areas: DEFAULT_AREAS, zones: DEFAULT_ZONES, theme: "light" },
        })
        .select().single();
      if (error) { console.error("[PmTracker] Create error:", error); return; }
      setProject(newProject as TraceProject);
    } finally {
      setCreatingProject(false);
    }
  };

  // ── Add team entry (no auto-commits — user adds goals manually) ──────────────
  const handleAddEntry = async () => {
    if (!project || !newEntryName.trim() || !newPmName.trim()) return;
    const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const { data: entry, error } = await supabase
      .from("trace_team_entries")
      .insert({
        project_id: project.id,
        team_slug: slugify(newEntryName),
        team_name: newEntryName.trim(),
        pm_name: newPmName.trim(),
        pm_user_id: currentUserId ?? null,
        color: newEntryColor ?? "#2563eb",
        orion_validated: false,
        editor_ids: [],
      })
      .select().single();

    if (error) { console.error("[PmTracker] Add entry error:", error); return; }

    const newEntry = entry as TraceTeamEntry;
    setEntries((prev) => [...prev, newEntry]);
    setCommitsByEntry((prev) => ({ ...prev, [newEntry.id]: [] }));

    // Save track to project config if one was chosen
    const effectiveTrack = newEntryTrack === "__new__" ? newTrackInput.trim() : newEntryTrack;
    if (effectiveTrack) {
      const newEntryTracksMap = { ...entryTracks, [newEntry.id]: effectiveTrack };
      const newTracksList = (newEntryTrack === "__new__" && !configTracks.includes(effectiveTrack))
        ? [...configTracks, effectiveTrack]
        : configTracks;
      const newConfig = { ...(project.config ?? {}), entry_tracks: newEntryTracksMap, tracks: newTracksList };
      await supabase.from("trace_projects").update({ config: newConfig }).eq("id", project.id);
      setProject((prev) => prev ? { ...prev, config: newConfig } : prev);
    }

    setNewEntryName(""); setNewPmName(""); setNewEntryColor("#2563eb");
    setNewEntryTrack(""); setNewTrackInput(""); setShowAddEntry(false);

    // Open drawer on commits tab so user can add their first goal
    setDrawerEntryId(newEntry.id);
    setDrawerTab("commits");
  };

  const handleUpdateEditors = useCallback(async (entryId: string, editorIds: string[]) => {
    const { error } = await supabase
      .from("trace_team_entries")
      .update({ editor_ids: editorIds })
      .eq("id", entryId);
    if (error) { console.error("[PmTracker] Update editors error:", error); return; }
    setEntries((prev) => prev.map((e) =>
      e.id === entryId ? { ...e, editor_ids: editorIds } : e
    ));
  }, []);

  // ── Status change (optimistic) ───────────────────────────────────────────────
  const handleStatusChange = useCallback(async (commitId: string, newStatus: TraceCommit["status"]) => {
    const now = new Date().toISOString();
    setCommitsByEntry((prev) => {
      const updated: Record<string, TraceCommit[]> = {};
      for (const [eid, cs] of Object.entries(prev))
        updated[eid] = cs.map((c) => c.id === commitId ? { ...c, status: newStatus, updated_at: now } : c);
      return updated;
    });
    const { error } = await supabase.from("trace_commits")
      .update({ status: newStatus, updated_at: now }).eq("id", commitId);
    if (error) console.error("[PmTracker] Status change error:", error);
  }, []);

  // ── Save settings ────────────────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    if (!project) return;
    const patch = {
      start_date: settingsDraft.start_date || project.start_date,
      end_date: settingsDraft.end_date || null,
      total_working_days: Math.max(1, settingsDraft.total_working_days),
      config: {
        ...(project.config ?? {}),
        penalty_per_day:    settingsDraft.penalty_per_day,
        max_penalty:        settingsDraft.max_penalty,
        total_working_days: settingsDraft.total_working_days,
        zones:              settingsDraft.zones,
        theme:              settingsDraft.theme,
        areas:              settingsDraft.areas,
      },
    };
    const { error } = await supabase.from("trace_projects").update(patch).eq("id", project.id);
    if (error) { console.error("[PmTracker] Save settings error:", error); return; }
    setProject((prev) => prev ? { ...prev, ...patch } : prev);
    setShowSettings(false);
  };

  const handleSaveProjectName = async () => {
    if (project && projectNameDraft.trim() && projectNameDraft !== project.name) {
      await supabase.from("trace_projects").update({ name: projectNameDraft.trim() }).eq("id", project.id);
      setProject((prev) => prev ? { ...prev, name: projectNameDraft.trim() } : prev);
    }
    setEditingProjectName(false);
  };

  // ── Delete entry ─────────────────────────────────────────────────────────────
  const handleDeleteEntry = async (entryId: string) => {
    await supabase.from("trace_commits").delete().eq("entry_id", entryId);
    await supabase.from("trace_team_entries").delete().eq("id", entryId);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    setCommitsByEntry((prev) => { const next = { ...prev }; delete next[entryId]; return next; });
    setEditingEntryId(null);
    if (drawerEntryId === entryId) setDrawerEntryId(null);
  };

  // ── Edit entry ───────────────────────────────────────────────────────────────
  const handleSaveEntry = async (entryId: string) => {
    const { error } = await supabase.from("trace_team_entries")
      .update({ team_name: editDraft.team_name, pm_name: editDraft.pm_name, color: editDraft.color })
      .eq("id", entryId);
    if (error) { console.error("[PmTracker] Save entry error:", error); return; }
    setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, ...editDraft } : e));
    setEditingEntryId(null);
  };



  // ── Add commit (goal) ────────────────────────────────────────────────────────
  const handleAddCommit = useCallback(async (
    entryId: string,
    draft: { label: string; element: string; deadline_day: number; due_date?: string },
  ) => {
    if (!draft.label.trim()) return;
    const insert: Omit<TraceCommit, ""> = {
      id: crypto.randomUUID(),
      entry_id: entryId,
      commit_key: `goal_${Date.now()}`,
      element_key: draft.element,
      label: draft.label.trim(),
      deadline_day: Math.max(1, draft.deadline_day),
      ...(draft.due_date ? { due_date: draft.due_date } : {}),
      status: "pending",
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("trace_commits").insert(insert).select().single();
    if (error) console.error("[PmTracker] Add commit error:", error);
    setCommitsByEntry((prev) => ({
      ...prev,
      [entryId]: [...(prev[entryId] ?? []), (data ?? insert) as TraceCommit].sort(
        (a, b) => a.deadline_day - b.deadline_day,
      ),
    }));
  }, []);

  // ── Delete commit ────────────────────────────────────────────────────────────
  const handleDeleteCommit = useCallback(async (entryId: string, commitId: string) => {
    setCommitsByEntry((prev) => ({
      ...prev,
      [entryId]: (prev[entryId] ?? []).filter((c) => c.id !== commitId),
    }));
    const { error } = await supabase.from("trace_commits").delete().eq("id", commitId);
    if (error) console.error("[PmTracker] Delete commit error:", error);
  }, []);

  // ── Edit commit label ────────────────────────────────────────────────────────
  const handleEditCommitLabel = useCallback(async (commitId: string, label: string) => {
    setCommitsByEntry((prev) => {
      const updated: Record<string, TraceCommit[]> = {};
      for (const [eid, cs] of Object.entries(prev))
        updated[eid] = cs.map((c) => c.id === commitId ? { ...c, label } : c);
      return updated;
    });
    const { error } = await supabase.from("trace_commits").update({ label }).eq("id", commitId);
    if (error) console.error("[PmTracker] Edit label error:", error);
  }, []);

  // ── Edit commit description ──────────────────────────────────────────────────
  const handleEditCommitDescription = useCallback(async (commitId: string, description: string) => {
    setCommitsByEntry((prev) => {
      const updated: Record<string, TraceCommit[]> = {};
      for (const [eid, cs] of Object.entries(prev))
        updated[eid] = cs.map((c) => c.id === commitId ? { ...c, description } : c);
      return updated;
    });
    const { error } = await supabase.from("trace_commits").update({ description }).eq("id", commitId);
    if (error) console.error("[PmTracker] Edit description error:", error);
  }, []);

  // ── Deadline change ──────────────────────────────────────────────────────────
  const handleDeadlineChange = useCallback(async (commitId: string, newDate: string) => {
    if (!project) return;
    const newDay = dateToDay(newDate, project.start_date);
    setCommitsByEntry((prev) => {
      const updated: Record<string, TraceCommit[]> = {};
      for (const [eid, cs] of Object.entries(prev))
        updated[eid] = cs.map((c) => c.id === commitId ? { ...c, deadline_day: newDay, due_date: newDate } : c);
      return updated;
    });
    const { error } = await supabase.from("trace_commits")
      .update({ deadline_day: newDay, due_date: newDate }).eq("id", commitId);
    if (error) console.error("[PmTracker] Deadline change error:", error);
  }, [project]);

  // ── Computed ─────────────────────────────────────────────────────────────────
  const calcGlobalScore = useCallback((e: TraceTeamEntry) =>
    calcEntryScore(commitsByEntry[e.id] ?? [], todayDay, penaltyPerDay, maxPenalty),
  [commitsByEntry, todayDay, penaltyPerDay, maxPenalty]);

  const firstPlaceEntryId = useMemo(() => {
    if (entries.length === 0) return null;
    const scored = entries.filter((e) => (commitsByEntry[e.id] ?? []).length > 0);
    if (scored.length === 0) return null;
    return [...scored].sort((a, b) => calcGlobalScore(b) - calcGlobalScore(a))[0]?.id ?? null;
  }, [entries, commitsByEntry, calcGlobalScore]);

  const allCommits     = Object.values(commitsByEntry).flat();
  const successCommits = allCommits.filter((c) => c.status === "success").length;
  const failedCommits  = allCommits.filter((c) => c.status === "failed").length;
  const lateCommits    = allCommits.filter((c) => isCommitLate(c, todayDay)).length;
  const daysRemaining  = project?.end_date
    ? Math.max(0, calendarDaysBetween(new Date().toISOString().split("T")[0], project.end_date))
    : Math.max(0, totalDays - todayDay);
  const avgScore       = entries.length > 0
    ? Math.round(entries.reduce((s, e) => s + calcGlobalScore(e), 0) / entries.length)
    : 0;
  const globalCsr = allCommits.length > 0
    ? Math.round((successCommits / allCommits.length) * 100)
    : 0;
  const globalGrade = gradeInfo(avgScore, zones);

  // Filter + search + sort
  const filteredEntries = entries
    .filter((e) => {
      const commits = commitsByEntry[e.id] ?? [];
      if (commits.length === 0 && filter !== "all") return false;
      const st = statusFromScore(calcGlobalScore(e), zones);
      if (filter === "critical" && st !== "critical") return false;
      if (filter === "warning"  && st !== "warning")  return false;
      if (filter === "ontrack"  && st !== "ok" && st !== "info") return false;
      if (trackFilter !== null && (entryTracks[e.id] ?? "") !== trackFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!e.team_name.toLowerCase().includes(q) && !e.pm_name.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "name")     return a.team_name.localeCompare(b.team_name);
      if (sortBy === "progress") {
        const aOk = (commitsByEntry[a.id] ?? []).filter((c) => c.status === "success").length;
        const bOk = (commitsByEntry[b.id] ?? []).filter((c) => c.status === "success").length;
        return bOk - aOk;
      }
      return calcGlobalScore(b) - calcGlobalScore(a);
    });

  const filterCounts = {
    all:      entries.length,
    critical: entries.filter((e) => {
      const c = commitsByEntry[e.id] ?? [];
      return c.length > 0 && statusFromScore(calcGlobalScore(e), zones) === "critical";
    }).length,
    warning:  entries.filter((e) => {
      const c = commitsByEntry[e.id] ?? [];
      return c.length > 0 && statusFromScore(calcGlobalScore(e), zones) === "warning";
    }).length,
    ontrack:  entries.filter((e) => {
      const c = commitsByEntry[e.id] ?? [];
      if (c.length === 0) return false;
      const st = statusFromScore(calcGlobalScore(e), zones);
      return st === "ok" || st === "info";
    }).length,
  };

  const drawerEntry = drawerEntryId ? entries.find((e) => e.id === drawerEntryId) : null;

  // ── Word of the Day: generate ─────────────────────────────────────────────────
  const handleGenerateWord = () => {
    if (!project || wordGenerating) return;
    const leader = firstPlaceEntryId ? entries.find((e) => e.id === firstPlaceEntryId) : null;
    const perTeam = entries
      .map((e) => {
        const c = commitsByEntry[e.id] ?? [];
        const ok = c.filter((x) => x.status === "success").length;
        const fail = c.filter((x) => x.status === "failed").length;
        const late = c.filter((x) => isCommitLate(x, todayDay)).length;
        const sc = calcEntryScore(c, todayDay, penaltyPerDay, maxPenalty);
        return {
          pm:    e.pm_name,
          team:  e.team_name,
          score: sc,
          grade: gradeInfo(sc, zones).label,
          commits: { total: c.length, ok, failed: fail, late },
        };
      })
      .sort((a, b) => b.score - a.score);
    const snapshot = {
      day:      { current: todayDay, total: totalDays, remaining: daysRemaining },
      score:    { avg: avgScore, grade: globalGrade.label },
      csr_global: globalCsr,
      commits:  { total: allCommits.length, ok: successCommits, failed: failedCommits, late: lateCommits },
      teams_summary: { total: entries.length, critical: filterCounts.critical, warning: filterCounts.warning, ontrack: filterCounts.ontrack },
      teams:    perTeam,
      areas:    areas.map((area) => {
        const ac = entries.flatMap((e) => (commitsByEntry[e.id] ?? []).filter((c) => elKey(c) === area.key));
        return { label: area.label, pct_ok: ac.length > 0 ? Math.round((ac.filter((c) => c.status === "success").length / ac.length) * 100) : 0 };
      }),
      leader: leader ? { name: leader.pm_name, team: leader.team_name, score: calcGlobalScore(leader) } : null,
    };
    const prompt = WORD_PROMPT_TEMPLATE.replace("{SNAPSHOT}", JSON.stringify(snapshot, null, 2));
    setWordGenerating(true);
    _generateWord(prompt);
  };

  // ── Settings: area helpers ───────────────────────────────────────────────────
  const addArea = () => {
    const newKey = `area_${Date.now()}`;
    setSettingsDraft((d) => ({
      ...d,
      areas: [...d.areas, { key: newKey, label: "Nueva área", color: "#64748b" }],
    }));
  };
  const removeArea = (i: number) => {
    setSettingsDraft((d) => ({ ...d, areas: d.areas.filter((_, idx) => idx !== i) }));
  };
  const updateArea = (i: number, field: keyof AreaDef, value: string) => {
    setSettingsDraft((d) => ({
      ...d,
      areas: d.areas.map((a, idx) => idx === i ? { ...a, [field]: value } : a),
    }));
  };

  // ── Render: loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="pmt_loading">
        <div className="pmt_loadingSpinner" />
        <p>Cargando datos del proyecto...</p>
      </div>
    );
  }

  // ── Render: no project ───────────────────────────────────────────────────────
  if (!project) {
    return (
      <div className="pmt_emptyProject">
        <Calendar size={48} strokeWidth={1} style={{ color: "rgba(16,17,19,0.2)" }} />
        <h3>Sin proyecto</h3>
        <p>Crea un PM Tracker para empezar a monitorear el progreso de tu equipo.</p>
        <button type="button" className="pmt_createProjectBtn"
          onClick={handleCreateProject} disabled={creatingProject}>
          {creatingProject ? "Creando..." : "Crear Proyecto"}
        </button>
      </div>
    );
  }

  // ── Render: dashboard ────────────────────────────────────────────────────────
  return (
    <div className="pmt_root" data-theme={theme}>

      {/* Slide-over drawer */}
      {drawerEntry && (
        <TeamDrawer
          entry={drawerEntry}
          commits={commitsByEntry[drawerEntry.id] ?? []}
          tab={drawerTab}
          areas={areas}
          onTabChange={setDrawerTab}
          onClose={() => setDrawerEntryId(null)}
          todayDay={todayDay}
          totalDays={totalDays}
          projectStartDate={project.start_date}
          penaltyPerDay={penaltyPerDay}
          maxPenalty={maxPenalty}
          zones={zones}
          onStatusChange={handleStatusChange}
          onAddCommit={(draft) => handleAddCommit(drawerEntry.id, draft)}
          onDeleteCommit={(cid) => handleDeleteCommit(drawerEntry.id, cid)}
          onEditCommitLabel={handleEditCommitLabel}
          onEditCommitDescription={handleEditCommitDescription}
          isFirstPlace={drawerEntry.id === firstPlaceEntryId}
          canEdit={canEditEntry(drawerEntry, currentUserId)}
          teamMembers={teamMembers}
          currentUserId={currentUserId}
          onUpdateEditors={handleUpdateEditors}
          copiedCommits={copiedCommits}
          onCopyCommits={setCopiedCommits}
          onPasteCommits={() => handlePasteCommits(drawerEntry.id)}
        />
      )}

      {/* Toolbar */}
      <div className="pmt_toolbar">
        <div className="pmt_toolbarLeft">
          <div className="pmt_titleRow">
            {onExpandSidebar && (
              <button type="button" className="pmt_expandBtn" onClick={onExpandSidebar} aria-label="Expand sidebar">
                <ChevronLeft size={16} />
              </button>
            )}
            {editingProjectName ? (
              <input className="pmt_projectNameInput" value={projectNameDraft}
                onChange={(e) => setProjectNameDraft(e.target.value)}
                onBlur={handleSaveProjectName}
                onKeyDown={(e) => e.key === "Enter" && handleSaveProjectName()}
                autoFocus />
            ) : (
              <h1 className="pmt_h1"
                onClick={() => { setProjectNameDraft(project.name); setEditingProjectName(true); }}
                title="Click para renombrar">
                {project.name}
              </h1>
            )}
          </div>
        </div>
        <div className="pmt_toolbarRight">
          <button type="button" className="pmt_btnIcon" onClick={() => {
            setSettingsDraft({
              start_date: project.start_date,
              end_date: project.end_date ?? "",
              penalty_per_day: penaltyPerDay,
              max_penalty: maxPenalty,
              total_working_days: totalDays,
              zones,
              theme,
              areas,
            });
            setThemeMenuOpen(false);
            setShowSettings(true);
          }} title="Configuración">
            <Settings size={14} />
          </button>

          <button type="button" className="pmt_btnSecondary" onClick={() => setShowShare(true)} title="Compartir">
            <Share2 size={14} /> Share
          </button>

          <span className="pmt_dayPill">DÍA <strong>{todayDay}/{totalDays}</strong></span>

          <button type="button" className="pmt_btnOrion" onClick={() => setShowOrionCheck(true)}>
            <ShieldCheck size={13} /> ORION Check
          </button>

          <button type="button" className="pmt_btnSecondary" onClick={() => setShowAddEntry((p) => !p)}>
            <Plus size={13} /> Add Tracker
          </button>

          <button type="button" className="pmt_btnIcon" onClick={loadData} title="Recargar">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Add tracker form */}
      {showAddEntry && (
        <div className="pmt_addEntryForm">
          <input type="text" className="pmt_addEntryInput" placeholder="Nombre del equipo..."
            value={newEntryName} onChange={(e) => setNewEntryName(e.target.value)} />
          <input type="text" className="pmt_addEntryInput" placeholder="Nombre del PM..."
            value={newPmName} onChange={(e) => setNewPmName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddEntry(); }} />
          <select
            className="pmt_addEntryTrack"
            value={newEntryTrack}
            onChange={(e) => { setNewEntryTrack(e.target.value); setNewTrackInput(""); }}>
            <option value="">Sin track</option>
            {configTracks.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="__new__">+ Nuevo track</option>
          </select>
          {newEntryTrack === "__new__" && (
            <input
              className="pmt_addEntryInput"
              placeholder="Nombre del track..."
              value={newTrackInput}
              autoFocus
              onChange={(e) => setNewTrackInput(e.target.value)}
            />
          )}
          <input type="color" className="pmt_addEntryColor" value={newEntryColor}
            onChange={(e) => setNewEntryColor(e.target.value)} />
          <button type="button" className="pmt_addEntryConfirm" onClick={handleAddEntry}>Agregar</button>
          <button type="button" className="pmt_addEntryCancel" onClick={() => setShowAddEntry(false)}>Cancelar</button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="pmt_kpiStrip">
        {/* Custom KPI tile — first so it's always visible */}
        <CustomKpiTile
          name={(projectCfg.customKpi as { name: string; score: number } | undefined)?.name ?? ""}
          score={(projectCfg.customKpi as { name: string; score: number } | undefined)?.score ?? 0}
          onSave={handleSaveCustomKpi}
          canEdit={canEditCustomKpi}
        />

        {/* Compact KPI tiles */}
        <div className="pmt_kpiTile pmt_kpiTile--sm">
          <span className="pmt_kpiLabel">SCORE PROMEDIO</span>
          <span className="pmt_kpiValue" style={{ color: globalGrade.color }}>
            {entries.length > 0 ? avgScore : "—"}
            {entries.length > 0 && <span className="pmt_kpiUnit">/100</span>}
          </span>
          <span className="pmt_kpiSub">
            {entries.length === 0
              ? "Sin equipos"
              : avgScore >= 75
                ? <><span className="pmt_kpiArrow pmt_kpiArrow--up">↑</span> Sobre objetivo</>
                : <><span className="pmt_kpiArrow pmt_kpiArrow--down">↓</span> Bajo objetivo</>}
          </span>
          <KpiSparkBlock kpiKey="avg_score" value={avgScore} color={globalGrade.color} />
        </div>
        <div className="pmt_kpiTile pmt_kpiTile--sm">
          <span className="pmt_kpiLabel">CSR GLOBAL</span>
          <span className="pmt_kpiValue" style={{ color: globalGrade.color }}>
            {allCommits.length > 0 ? `${globalCsr}%` : "—"}
          </span>
          <span className="pmt_kpiSub">
            {allCommits.length > 0 ? globalGrade.label : "Sin metas"}
          </span>
          <KpiSparkBlock kpiKey="csr_global" value={globalCsr} color={globalGrade.color} />
        </div>
        <div className="pmt_kpiTile pmt_kpiTile--sm">
          <span className="pmt_kpiLabel">METAS OK</span>
          <span className="pmt_kpiValue" style={{ color: "var(--st-ok)" }}>{successCommits}</span>
          <span className="pmt_kpiSub">de {allCommits.length} totales</span>
          <KpiSparkBlock kpiKey="metas_ok" value={successCommits} color="var(--st-ok)" />
        </div>
        <div className="pmt_kpiTile pmt_kpiTile--sm">
          <span className="pmt_kpiLabel">METAS FALLIDAS</span>
          <span className="pmt_kpiValue" style={{ color: "var(--st-critical)" }}>{failedCommits}</span>
          <span className="pmt_kpiSub">{allCommits.length - successCommits} sin completar</span>
          <KpiSparkBlock kpiKey="metas_fail" value={failedCommits} color="var(--st-critical)" />
        </div>
        <div className="pmt_kpiTile pmt_kpiTile--sm">
          <span className="pmt_kpiLabel">CON RETRASO</span>
          <span className="pmt_kpiValue" style={{ color: lateCommits > 0 ? "var(--st-warning)" : "var(--pmt-text)" }}>
            {lateCommits}
          </span>
          <span className="pmt_kpiSub">
            {lateCommits > 0 ? "pasaron su deadline" : "Sin retrasos"}
          </span>
          <KpiSparkBlock kpiKey="con_retraso" value={lateCommits} color="var(--st-warning)" />
        </div>
        <div className="pmt_kpiTile pmt_kpiTile--sm">
          <span className="pmt_kpiLabel">DÍAS RESTANTES</span>
          <span className="pmt_kpiValue" style={{ color: "#2563eb" }}>{daysRemaining}</span>
          <span className="pmt_kpiSub">
            {project?.end_date
              ? `Fin: ${new Date(project.end_date + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`
              : "Sin fecha fin"}
          </span>
          <KpiSparkBlock kpiKey="dias_restantes" value={daysRemaining} color="#2563eb" />
        </div>

        {/* Editable note tile */}
        <NoteKpiTile
          value={(projectCfg.note as string | undefined) ?? ""}
          onSave={handleSaveNoteRef.current}
          onGenerate={handleGenerateWord}
          generating={wordGenerating}
        />
      </div>

      {/* Body */}
      <div className="pmt_body">
        <div className={`pmt_leftCol${view === "gantt" ? " pmt_leftCol--full" : ""}`}>

          {/* Filter bar */}
          <div className="pmt_filterBar">
            <h2 className="pmt_sectionTitle">Avances Generales</h2>

            <div className="pmt_filterSearch">
              <Search size={13} />
              <input placeholder="Buscar equipos o PMs..." value={search}
                onChange={(e) => setSearch(e.target.value)} />
            </div>

            {/* Filter dropdown */}
            <div className="pmt_filterDropWrap" ref={filterMenuRef}>
              <button
                type="button"
                className={`pmt_filterBtn${(filter !== "all" || trackFilter !== null || sortBy !== "score") ? " pmt_filterBtn--active" : ""}`}
                onClick={() => setShowFilterMenu((v) => !v)}>
                <Filter size={13} />
                Filtrar
                {(filter !== "all" || trackFilter !== null || sortBy !== "score") && (
                  <span className="pmt_filterBadge" />
                )}
              </button>

              {showFilterMenu && (
                <div className="pmt_filterMenu">
                  {/* Status */}
                  <div className="pmt_filterMenuSection">
                    <span className="pmt_filterMenuLabel">Estado</span>
                    {(["all", "ontrack", "warning", "critical"] as const).map((k) => (
                      <button key={k} type="button"
                        className={`pmt_filterMenuOpt${filter === k ? " pmt_filterMenuOpt--active" : ""}`}
                        onClick={() => { setFilter(k); setShowFilterMenu(false); }}>
                        {k !== "all" && <span className={`pmt_filterDot pmt_filterDot--${k === "ontrack" ? "ok" : k}`} />}
                        <span>{k === "all" ? "Todos" : k === "ontrack" ? "En curso" : k.charAt(0).toUpperCase() + k.slice(1)}</span>
                        <span className="pmt_filterMenuCount">{filterCounts[k]}</span>
                      </button>
                    ))}
                  </div>

                  {/* Track */}
                  {Object.keys(entryTracks).length > 0 && (
                    <div className="pmt_filterMenuSection">
                      <span className="pmt_filterMenuLabel">Track</span>
                      <button type="button"
                        className={`pmt_filterMenuOpt${trackFilter === null ? " pmt_filterMenuOpt--active" : ""}`}
                        onClick={() => { setTrackFilter(null); setShowFilterMenu(false); }}>
                        <span>Todos</span>
                      </button>
                      {Array.from(new Set(Object.values(entryTracks).filter(Boolean))).map((t) => (
                        <button key={t} type="button"
                          className={`pmt_filterMenuOpt${trackFilter === t ? " pmt_filterMenuOpt--active" : ""}`}
                          onClick={() => { setTrackFilter((prev) => prev === t ? null : t); setShowFilterMenu(false); }}>
                          <span>{t}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Sort */}
                  <div className="pmt_filterMenuSection">
                    <span className="pmt_filterMenuLabel">Ordenar por</span>
                    {(["score", "name", "progress"] as const).map((s) => (
                      <button key={s} type="button"
                        className={`pmt_filterMenuOpt${sortBy === s ? " pmt_filterMenuOpt--active" : ""}`}
                        onClick={() => { setSortBy(s); setShowFilterMenu(false); }}>
                        <span>{s === "score" ? "Score" : s === "name" ? "A – Z" : "Progreso"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pmt_viewToggle">
              <button type="button"
                className={`pmt_viewBtn${view === "grid" ? " pmt_viewBtn--active" : ""}`}
                onClick={() => setView("grid")}>
                <Grid3X3 size={13} />
              </button>
              <button type="button"
                className={`pmt_viewBtn${view === "list" ? " pmt_viewBtn--active" : ""}`}
                onClick={() => setView("list")}>
                <List size={13} />
              </button>
              <button type="button"
                className={`pmt_viewBtn${view === "gantt" ? " pmt_viewBtn--active" : ""}`}
                onClick={() => setView("gantt")} title="Gantt">
                <CalendarDays size={13} />
              </button>
            </div>
          </div>

          {/* Grid / List / Gantt */}
          {view !== "gantt" && (
            entries.length === 0 ? (
              <div className="pmt_noEntries">
                <p>Agrega equipos con "+ Add Tracker" para empezar.</p>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="pmt_noEntries">
                <p>No hay equipos que coincidan con el filtro.</p>
              </div>
            ) : view === "grid" ? (
              <div className="pmt_cardGrid">
                {filteredEntries.map((entry) => (
                  <TeamCard key={entry.id}
                    entry={entry}
                    commits={commitsByEntry[entry.id] ?? []}
                    areas={areas}
                    isSelected={drawerEntryId === entry.id}
                    todayDay={todayDay}
                    penaltyPerDay={penaltyPerDay}
                    maxPenalty={maxPenalty}
                    zones={zones}
                    editingEntryId={editingEntryId}
                    editDraft={editDraft}
                    onSelect={() => { setDrawerEntryId(entry.id); setDrawerTab("overview"); }}
                    onOpenCommits={() => { setDrawerEntryId(entry.id); setDrawerTab("commits"); }}
                    onStartEdit={() => {
                      setEditDraft({ team_name: entry.team_name, pm_name: entry.pm_name, color: entry.color });
                      setEditingEntryId(entry.id);
                    }}
                    onChangeEditDraft={setEditDraft}
                    onSaveEntry={handleSaveEntry}
                    onCancelEdit={() => setEditingEntryId(null)}
                    onDeleteEntry={() => handleDeleteEntry(entry.id)}
                    isFirstPlace={entry.id === firstPlaceEntryId}
                    canEdit={canEditEntry(entry, currentUserId)}
                  />
                ))}
              </div>
            ) : (
              <div className="pmt_listWrap">
                {filteredEntries.map((entry) => (
                  <TeamListRow key={entry.id}
                    entry={entry}
                    commits={commitsByEntry[entry.id] ?? []}
                    todayDay={todayDay}
                    penaltyPerDay={penaltyPerDay}
                    maxPenalty={maxPenalty}
                    zones={zones}
                    onSelect={() => { setDrawerEntryId(entry.id); setDrawerTab("overview"); }}
                    isFirstPlace={entry.id === firstPlaceEntryId}
                  />
                ))}
              </div>
            )
          )}

          {view === "gantt" && (
            <ProjectGantt
              entries={filteredEntries}
              commitsByEntry={commitsByEntry}
              areas={areas}
              projectStartDate={project.start_date}
              projectEndDate={project.end_date ?? null}
              onDeadlineChange={handleDeadlineChange}
            />
          )}
        </div>

        {/* Right col */}
        {view !== "gantt" && (
          <div className="pmt_rightCol">
            <div className="pmt_chartWidget">
              <div className="pmt_widgetHead">
                <span className="pmt_widgetTitle">Avance por área</span>
                <span className="pmt_widgetMeta">{entries.length} equipos</span>
              </div>
              {areas.map((area) => (
                <StackedRow key={area.key} label={area.label}
                  color={area.color}
                  commits={entries.flatMap((e) => (commitsByEntry[e.id] ?? []).filter((c) => elKey(c) === area.key))} />
              ))}
            </div>

            <div className="pmt_rankingWidget">
              <div className="pmt_widgetHead">
                <span className="pmt_widgetTitle">PM Ranking</span>
                <span className="pmt_widgetMeta">top {Math.min(5, entries.length)}</span>
              </div>
              {[...entries]
                .filter((e) => (commitsByEntry[e.id] ?? []).length > 0)
                .sort((a, b) => calcGlobalScore(b) - calcGlobalScore(a))
                .slice(0, 5)
                .map((entry, i) => {
                  const score = calcGlobalScore(entry);
                  const st    = statusFromScore(score, zones);
                  return (
                    <div key={entry.id}
                      className={`pmt_rankRow${i === 0 ? " pmt_rankRow--first" : ""}`}
                      onClick={() => { setDrawerEntryId(entry.id); setDrawerTab("overview"); }}>
                      <span className="pmt_rankNum">#{i + 1}</span>
                      <div className={`pmt_rankInitial${i === 0 ? " pmt_avatar--first" : ""}`}
                        style={{ background: matteAvatar(entry.pm_name).bg, color: matteAvatar(entry.pm_name).text }}>
                        {entry.pm_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="pmt_rankInfo">
                        <span className="pmt_rankName">{entry.pm_name}</span>
                        <span className="pmt_rankTeam">{entry.team_name}</span>
                      </div>
                      <div className="pmt_rankScoreBar">
                        <div className="pmt_rankBarTrack">
                          <div className="pmt_rankBarFill" style={{ width: `${score}%`, background: ST_COLOR[st] }} />
                        </div>
                        <span className="pmt_rankScore">{score}</span>
                      </div>
                    </div>
                  );
                })}
              {entries.every((e) => (commitsByEntry[e.id] ?? []).length === 0) && (
                <div style={{ padding: "20px", textAlign: "center", fontSize: 12, color: "var(--pmt-text-subtle)" }}>
                  Agrega metas a los equipos para ver el ranking
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Settings panel */}
      {showSettings && (
        <>
          <div className="pmt_drawerOverlay" onClick={() => setShowSettings(false)} />
          <div className="pmt_orionPanel" style={{ maxHeight: "82%", width: 560 }}>
            <div className="pmt_orionHead">
              <Settings size={18} /><span>Configuración del Proyecto</span>
              <button type="button" className="pmt_drawerClose" onClick={() => setShowSettings(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="pmt_orionBody" style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20 }}>

              {/* Rango */}
              <div className="pmt_settingsSection">
                <div className="pmt_settingsSectionTitle">Rango del proyecto</div>
                <div className="pmt_settingsRow">
                  <label>Inicio</label>
                  <input type="date" value={settingsDraft.start_date}
                    onChange={(e) => setSettingsDraft((d) => ({ ...d, start_date: e.target.value }))} />
                </div>
                <div className="pmt_settingsRow">
                  <label>Fin</label>
                  <input type="date" value={settingsDraft.end_date}
                    onChange={(e) => setSettingsDraft((d) => ({ ...d, end_date: e.target.value }))} />
                </div>
              </div>

              {/* Áreas configurables */}
              <div className="pmt_settingsSection">
                <div className="pmt_settingsSectionTitle">Áreas de seguimiento</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {settingsDraft.areas.map((area, i) => (
                    <div key={area.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="color"
                        value={area.color}
                        onChange={(e) => updateArea(i, "color", e.target.value)}
                        style={{ width: 32, height: 28, padding: 2, border: "1px solid var(--pmt-border)", borderRadius: 5, cursor: "pointer", background: "transparent", flexShrink: 0 }}
                      />
                      <input
                        type="text"
                        value={area.label}
                        onChange={(e) => updateArea(i, "label", e.target.value)}
                        placeholder="Nombre del área..."
                        style={{ flex: 1, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", background: "var(--pmt-surface)", border: "1px solid var(--pmt-border)", borderRadius: 5, color: "var(--pmt-text)", outline: "none" }}
                      />
                      <button
                        type="button"
                        onClick={() => removeArea(i)}
                        style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--pmt-border)", borderRadius: 5, cursor: "pointer", color: "var(--pmt-text-subtle)", flexShrink: 0 }}
                        title="Eliminar área">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addArea}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "6px 12px", border: "1px dashed var(--pmt-border)", borderRadius: 6, background: "transparent", color: "var(--pmt-text-muted)", fontSize: 12, cursor: "pointer", marginTop: 2 }}>
                    <Plus size={12} /> Agregar área
                  </button>
                </div>
              </div>

              {/* Apariencia */}
              <div className="pmt_settingsSection">
                <div className="pmt_settingsSectionTitle">Apariencia</div>
                {(() => {
                  const currentTheme = THEMES.find((t) => t.id === settingsDraft.theme) ?? THEMES[0];
                  return (
                    <div className="pmt_themeDropdown">
                      <button type="button" className="pmt_themeDropdownTrigger"
                        onClick={() => setThemeMenuOpen((o) => !o)}>
                        <div className="pmt_themeDropdownSwatches">
                          <span style={{ background: currentTheme.bg }} />
                          <span style={{ background: currentTheme.fg }} />
                          <span style={{ background: currentTheme.accent }} />
                        </div>
                        <span className="pmt_themeDropdownName">{currentTheme.name}</span>
                        <ChevronDown size={14}
                          className={`pmt_themeDropdownChevron${themeMenuOpen ? " pmt_themeDropdownChevron--open" : ""}`} />
                      </button>
                      {themeMenuOpen && (
                        <div className="pmt_themeDropdownMenu">
                          {THEMES.map((t) => (
                            <button key={t.id} type="button"
                              className={`pmt_themeDropdownItem${settingsDraft.theme === t.id ? " pmt_themeDropdownItem--active" : ""}`}
                              onClick={() => { setSettingsDraft((d) => ({ ...d, theme: t.id })); setThemeMenuOpen(false); }}>
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

              {/* Días y penalizaciones */}
              <div className="pmt_settingsSection">
                <div className="pmt_settingsSectionTitle">Días y Penalizaciones</div>
                {([
                  ["Días laborales totales",          "total_working_days", 1,  60],
                  ["Penalización por día de retraso", "penalty_per_day",    0,  20],
                  ["Penalización máxima por meta",    "max_penalty",        0, 100],
                ] as [string, "total_working_days" | "penalty_per_day" | "max_penalty", number, number][]).map(([lbl, key, mn, mx]) => (
                  <div key={key} className="pmt_settingsRow">
                    <label>{lbl}</label>
                    <input type="number" min={mn} max={mx} value={settingsDraft[key]}
                      onChange={(e) => setSettingsDraft((d) => ({ ...d, [key]: +e.target.value }))} />
                  </div>
                ))}
              </div>

              {/* Umbrales */}
              <div className="pmt_settingsSection">
                <div className="pmt_settingsSectionTitle">Umbrales de Calificación</div>
                <ZoneSlider
                  values={settingsDraft.zones}
                  onChange={(zonesNext) => setSettingsDraft((d) => ({ ...d, zones: zonesNext }))} />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="pmt_addEntryCancel" onClick={() => setShowSettings(false)}>Cancelar</button>
                <button type="button" className="pmt_addEntryConfirm" onClick={handleSaveSettings}>Guardar</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Share panel */}
      {showShare && project && (
        <SharePanel
          teamId={teamId}
          sessionId={sessionId}
          projectName={project.name}
          onClose={() => setShowShare(false)}
          auditorIds={auditorIds}
          onToggleAuditor={handleToggleAuditor}
          isProjectAdmin={isProjectAdmin}
        />
      )}

      {/* ORION Check panel */}
      {showOrionCheck && (
        <>
          <div className="pmt_drawerOverlay" onClick={() => setShowOrionCheck(false)} />
          <div className="pmt_orionPanel">
            <div className="pmt_orionHead">
              <ShieldCheck size={18} />
              <span>ORION Check</span>
              <button type="button" className="pmt_drawerClose" onClick={() => setShowOrionCheck(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="pmt_orionBody">
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "48px 32px", textAlign: "center" }}>
                <ShieldCheck size={36} strokeWidth={1.2} style={{ color: "var(--pmt-text-subtle)", opacity: 0.5 }} />
                <p style={{ fontSize: 15, fontWeight: 600, color: "var(--pmt-text)", margin: 0 }}>
                  Preparing active validation…
                </p>
                <p style={{ fontSize: 13, color: "var(--pmt-text-subtle)", margin: 0, maxWidth: 280 }}>
                  ORION Check will be available soon. Come back later!
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}