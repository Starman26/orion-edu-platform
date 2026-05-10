// src/components/PmTrackerPanel.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Pencil, Search, Grid3X3, List, RefreshCw, Plus, X,
  Calendar, CalendarDays, ShieldCheck, Settings, Trash2, ChevronLeft,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import "../styles/pm-tracker.css";

// --- Constants ---

const COMMIT_DEFS = {
  robot: [
    { id: "r1", label: "Definition of Routines",  deadline: 2 },
    { id: "r2", label: "Programming of Routines",  deadline: 4 },
    { id: "r3", label: "Integration with PLC",     deadline: 6 },
    { id: "r4", label: "Testing",                  deadline: 8 },
    { id: "r5", label: "Live with ORION",          deadline: 10 },
  ],
  plc: [
    { id: "p1", label: "Process Operating Diagram",      deadline: 2 },
    { id: "p2", label: "Program Definition",             deadline: 3 },
    { id: "p3", label: "Sensor & Actuator Integration",  deadline: 4 },
    { id: "p4", label: "I/O Configuration",              deadline: 5 },
    { id: "p5", label: "Programming",                    deadline: 6 },
    { id: "p6", label: "Testing",                        deadline: 8 },
    { id: "p7", label: "Live with ORION",                deadline: 10 },
  ],
  sensor: [
    { id: "s1", label: "Sensor Selection & Wiring", deadline: 2 },
    { id: "s2", label: "Signal Configuration",      deadline: 3 },
    { id: "s3", label: "Calibration",               deadline: 4 },
    { id: "s4", label: "PLC Tag Mapping",           deadline: 5 },
    { id: "s5", label: "Testing",                   deadline: 7 },
    { id: "s6", label: "Live with ORION",           deadline: 10 },
  ],
  hmi: [
    { id: "h1", label: "Definition of User Interfaces", deadline: 3 },
    { id: "h2", label: "Configuration of Signals",      deadline: 4 },
    { id: "h3", label: "Visual Programming",            deadline: 6 },
    { id: "h4", label: "Integration with PLC",          deadline: 7 },
    { id: "h5", label: "Testing",                       deadline: 8 },
    { id: "h6", label: "Live with ORION",               deadline: 10 },
  ],
  mes: [
    { id: "m1", label: "Definition of SOP",          deadline: 3 },
    { id: "m2", label: "Definition of Inventory",    deadline: 4 },
    { id: "m3", label: "Quality Control Validation", deadline: 6 },
    { id: "m4", label: "CT / LT / OEE Integration",  deadline: 7 },
    { id: "m5", label: "Testing",                    deadline: 8 },
    { id: "m6", label: "Live with ORION",            deadline: 10 },
  ],
  erp: [
    { id: "e1", label: "Order Management Definition", deadline: 4 },
    { id: "e2", label: "Inventory Definition",        deadline: 5 },
    { id: "e3", label: "MES-ERP Integration",         deadline: 7 },
    { id: "e4", label: "Testing",                     deadline: 9 },
    { id: "e5", label: "Live with ORION",             deadline: 10 },
  ],
} as const;

type ElementKey = keyof typeof COMMIT_DEFS;
const THEMES = [
  { id: "light",    name: "Light",    bg: "#ffffff", fg: "#111111" },
  { id: "slate",    name: "Slate",    bg: "#1e293b", fg: "#f8fafc" },
  { id: "forest",   name: "Forest",   bg: "#14532d", fg: "#f0fdf4" },
  { id: "ocean",    name: "Ocean",    bg: "#0c4a6e", fg: "#f0f9ff" },
  { id: "sunset",   name: "Sunset",   bg: "#9a3412", fg: "#fff7ed" },
  { id: "midnight", name: "Midnight", bg: "#020617", fg: "#f1f5f9" },
] as const;
const EL_COLOR: Record<string, string> = {
  robot: "#e11d48", plc: "#2563eb", sensor: "#16a34a",
  hmi: "#d97706",  mes: "#7c3aed",  erp: "#0891b2",
};

const EL_LABEL: Record<string, string> = {
  robot: "Robot", plc: "PLC", sensor: "Sensores",
  hmi: "HMI",     mes: "MES",  erp: "ERP",
};

const STATUS_CYCLE: Record<string, TraceCommit["status"]> = {
  pending: "in_progress",
  in_progress: "success",
  success: "failed",
  failed: "pending",
};

const ST_COLOR: Record<string, string> = {
  ok: "#16a34a", info: "#2563eb", warning: "#d97706", critical: "#dc2626",
};

// --- Types ---

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
}

interface TraceCommit {
  id: string;
  entry_id: string;
  commit_key: string;
  element: string;
  element_key?: string;
  label: string;
  deadline_day: number;
  status: "pending" | "in_progress" | "success" | "failed";
  updated_at: string;
}

interface PmTrackerPanelProps {
  sessionId: string;
  teamId: string;
  userId: string;
  config: Record<string, unknown>;
  onExpandSidebar?: () => void;
}

// --- Score helpers ---

type ZoneThresholds = [number, number, number]; // [crítico_max, deficiente_max, riesgo_max]
const DEFAULT_ZONES: ZoneThresholds = [40, 65, 85];

function getTodayDay(project: TraceProject): number {
  const anchor = project.today_override ? new Date(project.today_override) : new Date();
  const anchorDate = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const d = new Date(project.start_date);
  const startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let day = 0;
  const cur = new Date(startDate);
  while (cur <= anchorDate) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) day++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, day);
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

function calcEntryScore(
  commits: TraceCommit[], todayDay: number,
  penaltyPerDay: number, maxPenalty: number,
): number {
  if (commits.length === 0) return 0;
  const base = Math.round(
    (commits.filter((c) => c.status === "success").length / commits.length) * 100,
  );
  const totalPenalty = commits.reduce(
    (s, c) => s + calcPenalty(c.deadline_day, c.status, todayDay, penaltyPerDay, maxPenalty),
    0,
  );
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

function getStartDay(element: string, commitKey: string): number {
  const defs = COMMIT_DEFS[element as ElementKey];
  if (!defs) return 1;
  const idx = defs.findIndex((d: { id: string }) => d.id === commitKey);
  if (idx <= 0) return 1;
  return defs[idx - 1].deadline + 1;
}

function elKey(c: TraceCommit): string {
  return c.element_key ?? c.element;
}

// --- ZoneSlider (umbrales draggables) ---

function ZoneSlider({
  values,
  onChange,
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
          <div
            key={i}
            className="pmt_zoneThumb"
            style={{ left: `${values[i]}%`, borderColor: thumbColors[i] }}
            onPointerDown={startDrag(i)}
          >
            <div className="pmt_zoneBubble">{values[i]}</div>
          </div>
        ))}
      </div>

      <div className="pmt_zoneLabels">
        <div className="pmt_zoneLabel pmt_zoneLabel--red">
          <span>0 – {a}</span><strong>Crítico</strong>
        </div>
        <div className="pmt_zoneLabel pmt_zoneLabel--orange">
          <span>{a} – {b}</span><strong>Deficiente</strong>
        </div>
        <div className="pmt_zoneLabel pmt_zoneLabel--yellow">
          <span>{b} – {c}</span><strong>En Riesgo</strong>
        </div>
        <div className="pmt_zoneLabel pmt_zoneLabel--green">
          <span>{c} – 100</span><strong>OK</strong>
        </div>
      </div>
    </div>
  );
}

// --- Stacked area bar row ---

function StackedRow({
  label, commits,
}: { label: string; commits: TraceCommit[] }) {
  const total   = commits.length;
  const ok      = commits.filter((c) => c.status === "success").length;
  const failed  = commits.filter((c) => c.status === "failed").length;
  const pending = commits.filter((c) => c.status === "pending" || c.status === "in_progress").length;
  return (
    <div className="pmt_stackedRow">
      <span className="pmt_stackedLabel">{label}</span>
      <div className="pmt_stackedBar">
        {total > 0 ? (
          <>
            <div className="pmt_stackedSeg pmt_stackedSeg--ok"   style={{ width: `${(ok / total) * 100}%` }}     title={`OK: ${ok}`} />
            <div className="pmt_stackedSeg pmt_stackedSeg--fail" style={{ width: `${(failed / total) * 100}%` }} title={`Fail: ${failed}`} />
            <div className="pmt_stackedSeg pmt_stackedSeg--pend" style={{ width: `${(pending / total) * 100}%` }} title={`Pending: ${pending}`} />
          </>
        ) : (
          <div style={{ width: "100%", background: "#f3f4f6", height: "100%" }} />
        )}
      </div>
      <span className="pmt_stackedCount">{ok}/{total}</span>
    </div>
  );
}

// --- Gantt Chart ---

function GanttChart({
  entry, commits, todayDay, totalDays, onDeadlineChange,
}: {
  entry: TraceTeamEntry;
  commits: TraceCommit[];
  todayDay: number;
  totalDays: number;
  onDeadlineChange: (commitId: string, newDay: number) => void;
}) {
  return (
    <div className="pmt_gantt">
      <div className="pmt_ganttDays">
        <div className="pmt_ganttLabelSpacer" />
        <div className="pmt_ganttTrack">
          {Array.from({ length: totalDays }, (_, i) => (
            <div key={i} className={`pmt_ganttDayTick${i + 1 === todayDay ? " pmt_ganttDayTick--today" : ""}`}>
              {i + 1}
            </div>
          ))}
        </div>
      </div>
      {commits.map((commit) => {
        const startDay = getStartDay(commit.element, commit.commit_key);
        const barLeft  = `${((startDay - 1) / totalDays) * 100}%`;
        const barWidth = `${((commit.deadline_day - startDay + 1) / totalDays) * 100}%`;
        const isLate   = commit.status !== "success" && todayDay > commit.deadline_day;
        const baseColor =
          commit.status === "failed"      ? "#dc2626" :
          commit.status === "success"     ? (entry.color || "#16a34a") :
          commit.status === "in_progress" ? (entry.color || "#2563eb") : "#94a3b8";
        const barBg =
          commit.status === "in_progress"
            ? `repeating-linear-gradient(45deg,${baseColor},${baseColor} 4px,${baseColor}55 4px,${baseColor}55 8px)`
            : baseColor;
        return (
          <div key={commit.id} className="pmt_ganttRow">
            <div className="pmt_ganttRowLabel">
              <span className="pmt_ganttLabelText" title={commit.label}>{commit.label}</span>
              <span className="pmt_deadlineEdit" onClick={(e) => e.stopPropagation()}>
                Day{" "}
                <input type="number" min={1} max={totalDays} value={commit.deadline_day}
                  onChange={(e) => onDeadlineChange(commit.id, Number(e.target.value))}
                  className="pmt_deadlineInput" />
              </span>
            </div>
            <div className="pmt_ganttTrack">
              <div className="pmt_ganttTodayLine" style={{ left: `${((todayDay - 1) / totalDays) * 100}%` }} />
              <div className={`pmt_ganttBar${isLate ? " pmt_ganttBar--late" : ""}`}
                style={{ left: barLeft, width: barWidth, background: barBg }}
                title={`${commit.label}: Day ${startDay}-${commit.deadline_day}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Team Drawer ---

function TeamDrawer({
  entry, commits, tab, onTabChange, onClose,
  todayDay, totalDays, penaltyPerDay, maxPenalty, zones,
  onStatusChange, onDeadlineChange,
  onAddCommit, onDeleteCommit, onEditCommitLabel,
}: {
  entry: TraceTeamEntry;
  commits: TraceCommit[];
  tab: "overview" | "commits" | "gantt" | "area";
  onTabChange: (t: "overview" | "commits" | "gantt" | "area") => void;
  onClose: () => void;
  todayDay: number;
  totalDays: number;
  penaltyPerDay: number;
  maxPenalty: number;
  zones: ZoneThresholds;
  onStatusChange: (id: string, s: TraceCommit["status"]) => void;
  onDeadlineChange: (id: string, day: number) => void;
  onAddCommit: (draft: { label: string; element: string; deadline_day: number }) => void;
  onDeleteCommit: (commitId: string) => void;
  onEditCommitLabel: (commitId: string, label: string) => void;
}) {
  const [addCommitOpen, setAddCommitOpen]   = useState(false);
  const [commitDraft, setCommitDraft]       = useState({ label: "", element: "robot", deadline_day: 5 });
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft]         = useState("");

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
          <div className="pmt_drawerAvatar" style={{ background: entry.color || "#64748b" }}>
            {entry.pm_name.charAt(0).toUpperCase()}
          </div>
          <div className="pmt_drawerInfo">
            <div className="pmt_drawerTitle">{entry.team_name}</div>
            <div className="pmt_drawerSub">
              PM · {entry.pm_name} ·{" "}
              <span style={{ color: grade.color }}>
                {score} pts · {grade.label}
              </span>
            </div>
          </div>
          <button type="button" className="pmt_drawerClose" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="pmt_drawerTabs">
          {(["overview", "commits", "gantt", "area"] as const).map((t) => (
            <button key={t} type="button"
              className={`pmt_drawerTab${tab === t ? " pmt_drawerTab--active" : ""}`}
              onClick={() => onTabChange(t)}>
              {t === "commits" ? `Commits (${total})` : t === "area" ? "Area" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="pmt_drawerBody">

          {/* Overview */}
          {tab === "overview" && (
            <div className="pmt_drawerOverview">
              <div className="pmt_drawerKpis">
                <div className="pmt_drawerKpi">
                  <span className="pmt_drawerKpiVal">{total}</span>
                  <span className="pmt_drawerKpiLbl">Total</span>
                </div>
                <div className="pmt_drawerKpi pmt_drawerKpi--ok">
                  <span className="pmt_drawerKpiVal">{ok}</span>
                  <span className="pmt_drawerKpiLbl">OK</span>
                </div>
                <div className="pmt_drawerKpi pmt_drawerKpi--fail">
                  <span className="pmt_drawerKpiVal">{failed}</span>
                  <span className="pmt_drawerKpiLbl">Failed</span>
                </div>
                <div className="pmt_drawerKpi pmt_drawerKpi--warn">
                  <span className="pmt_drawerKpiVal">{pending}</span>
                  <span className="pmt_drawerKpiLbl">Pending</span>
                </div>
              </div>
              <div className="pmt_drawerSection">
                <div className="pmt_drawerSectionTitle">Progreso por área</div>
                {Object.entries(EL_LABEL).map(([el, label]) => (
                  <StackedRow key={el} label={label}
                    commits={commits.filter((c) => elKey(c) === el)} />
                ))}
              </div>
            </div>
          )}

          {/* Commits */}
          {tab === "commits" && (
            <>
              <div className="pmt_drawerCommits">
                {commits.map((commit) => {
                  const isLate  = commit.status !== "success" && todayDay > commit.deadline_day;
                  const penalty = calcPenalty(commit.deadline_day, commit.status, todayDay, penaltyPerDay, maxPenalty);
                  const el      = elKey(commit);
                  return (
                    <div key={commit.id} className={`pmt_commitRow2${isLate ? " pmt_commitRow2--late" : ""}`}>
                      <button type="button"
                        className={`pmt_commitPip pmt_commitPip--${commit.status}`}
                        onClick={() => onStatusChange(commit.id, STATUS_CYCLE[commit.status])}
                        title="Click to cycle status" />
                      <span className="pmt_commitArea"
                        style={{ background: (EL_COLOR[el] ?? "#64748b") + "22", color: EL_COLOR[el] ?? "#64748b" }}>
                        {EL_LABEL[el] ?? el}
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
                        <span className="pmt_commitLabel2" title="Click to edit"
                          onClick={() => { setEditingLabelId(commit.id); setLabelDraft(commit.label); }}>
                          {commit.label}
                        </span>
                      )}
                      <span className="pmt_commitDay">Day {commit.deadline_day}</span>
                      {isLate && penalty > 0 && (
                        <span className="pmt_commitPenalty2">-{penalty}pt</span>
                      )}
                      <button type="button" className="pmt_commitDeleteBtn"
                        onClick={() => onDeleteCommit(commit.id)} title="Delete commit">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {!addCommitOpen ? (
                <button type="button" className="pmt_addCommitBtn"
                  onClick={() => setAddCommitOpen(true)}>
                  <Plus size={12} /> Add commit
                </button>
              ) : (
                <div className="pmt_addCommitForm">
                  <select value={commitDraft.element}
                    onChange={(e) => setCommitDraft((d) => ({ ...d, element: e.target.value }))}>
                    {Object.entries(EL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input placeholder="Commit label..." value={commitDraft.label}
                    onChange={(e) => setCommitDraft((d) => ({ ...d, label: e.target.value }))} />
                  <input type="number" min={1} max={totalDays} value={commitDraft.deadline_day}
                    onChange={(e) => setCommitDraft((d) => ({ ...d, deadline_day: +e.target.value }))} />
                  <button type="button" onClick={() => {
                    onAddCommit(commitDraft);
                    setAddCommitOpen(false);
                    setCommitDraft({ label: "", element: "robot", deadline_day: 5 });
                  }}>Add</button>
                  <button type="button" onClick={() => setAddCommitOpen(false)}>Cancel</button>
                </div>
              )}
            </>
          )}

          {/* Area */}
          {tab === "area" && (
            <div className="pmt_areaTab">
              {Object.entries(EL_LABEL).map(([el, label]) => {
                const elCommits = commits.filter((c) => elKey(c) === el);
                if (elCommits.length === 0) return null;
                return (
                  <div key={el} className="pmt_areaGroup">
                    <div className="pmt_areaGroupHead"
                      style={{ borderLeft: `3px solid ${EL_COLOR[el] ?? "#64748b"}` }}>
                      <span className="pmt_areaGroupLabel">{label}</span>
                      <div className="pmt_areaBulkBtns">
                        <button type="button"
                          onClick={() => elCommits.forEach((c) => onStatusChange(c.id, "success"))}>
                          Check Todo OK
                        </button>
                        <button type="button"
                          onClick={() => elCommits.forEach((c) => onStatusChange(c.id, "pending"))}>
                          Reset
                        </button>
                      </div>
                    </div>
                    {elCommits.map((c) => (
                      <div key={c.id} className="pmt_areaCommitRow">
                        <button type="button"
                          className={`pmt_commitPip pmt_commitPip--${c.status}`}
                          onClick={() => onStatusChange(c.id, STATUS_CYCLE[c.status])}
                          title="Click to cycle status" />
                        <span className="pmt_areaCommitLabel">{c.label}</span>
                        <span className="pmt_areaCommitDay">Day {c.deadline_day}</span>
                        <span className={`pmt_areaCommitStatus pmt_areaCommitStatus--${c.status}`}>
                          {c.status.replace("_", " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Gantt */}
          {tab === "gantt" && (
            <div className="pmt_drawerGantt">
              <GanttChart entry={entry} commits={commits}
                todayDay={todayDay} totalDays={totalDays}
                onDeadlineChange={onDeadlineChange} />
            </div>
          )}

        </div>
      </div>
    </>
  );
}

// --- Team Card ---

function TeamCard({
  entry, commits, isSelected, todayDay,
  penaltyPerDay, maxPenalty, zones, editingEntryId, editDraft,
  onSelect, onOpenGantt, onOpenCommits,
  onStartEdit, onChangeEditDraft, onSaveEntry, onCancelEdit, onDeleteEntry,
}: {
  entry: TraceTeamEntry;
  commits: TraceCommit[];
  isSelected: boolean;
  todayDay: number;
  penaltyPerDay: number;
  maxPenalty: number;
  zones: ZoneThresholds;
  editingEntryId: string | null;
  editDraft: { team_name: string; pm_name: string; color: string };
  onSelect: () => void;
  onOpenGantt: () => void;
  onOpenCommits: () => void;
  onStartEdit: () => void;
  onChangeEditDraft: (d: { team_name: string; pm_name: string; color: string }) => void;
  onSaveEntry: (id: string) => void;
  onCancelEdit: () => void;
  onDeleteEntry: () => void;
}) {
  const score     = calcEntryScore(commits, todayDay, penaltyPerDay, maxPenalty);
  const ok        = commits.filter((c) => c.status === "success").length;
  const failed    = commits.filter((c) => c.status === "failed").length;
  const pending   = commits.filter((c) => c.status === "pending" || c.status === "in_progress").length;
  const color     = entry.color || "#64748b";
  const grade     = gradeInfo(score, zones);
  const st        = statusFromScore(score, zones);
  const isEditing = editingEntryId === entry.id;

  return (
    <div
      className={`pmt_card${isSelected ? " pmt_card--selected" : ""}`}
      style={{ "--stripe-color": ST_COLOR[st] } as React.CSSProperties}
      onClick={onSelect}
    >
      {/* Card top */}
      <div className="pmt_cardTop">
        <div className="pmt_pmAvatar" style={{ background: color }}>
          {entry.pm_name.charAt(0).toUpperCase()}
        </div>
        <div className="pmt_cardNames">
          <div className="pmt_pmNameText">{entry.pm_name}</div>
          <div className="pmt_teamNameText">{entry.team_name}</div>
        </div>
        <div className="pmt_scoreBlock">
          <div className="pmt_scoreNum" style={{ color: grade.color }}>{score}</div>
          <div className="pmt_scoreGrade" style={{ color: grade.color }}>{grade.label}</div>
        </div>
        <button type="button" className="pmt_cardEditBtn"
          onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
          title="Edit entry">
          <Pencil size={11} />
        </button>
      </div>

      {/* Edit overlay */}
      {isEditing && (
        <div className="pmt_cardEditOverlay" onClick={(e) => e.stopPropagation()}>
          <div className="pmt_editField">
            <label>Team name</label>
            <input value={editDraft.team_name}
              onChange={(e) => onChangeEditDraft({ ...editDraft, team_name: e.target.value })} />
          </div>
          <div className="pmt_editField">
            <label>PM name</label>
            <input value={editDraft.pm_name}
              onChange={(e) => onChangeEditDraft({ ...editDraft, pm_name: e.target.value })} />
          </div>
          <div className="pmt_editField">
            <label>Color</label>
            <input type="color" value={editDraft.color}
              onChange={(e) => onChangeEditDraft({ ...editDraft, color: e.target.value })} />
          </div>
          <div className="pmt_editActions">
            <button type="button" onClick={onCancelEdit}>Cancel</button>
            <button type="button" onClick={onDeleteEntry} style={{ color: "var(--st-critical)" }}>Delete</button>
            <button type="button" onClick={() => onSaveEntry(entry.id)}>Save</button>
          </div>
        </div>
      )}

      {/* Card body */}
      <div className="pmt_cardBody">
        <div className="pmt_cardScoreRow">
          <span className="pmt_cardScoreLabel">SCORE</span>
          <span className="pmt_cardScoreVal" style={{ color: grade.color }}>
            {score}<span className="pmt_cardScoreMax">/100</span>
          </span>
        </div>
        <div className="pmt_cardScoreTrack">
          <div className="pmt_cardScoreFill" style={{ width: `${score}%`, background: grade.color }} />
        </div>

        <div className="pmt_cardCommitSummary">
          <span className="pmt_cardCommitChip pmt_cardCommitChip--ok">Check {ok}</span>
          <span className="pmt_cardCommitChip pmt_cardCommitChip--fail">X {failed}</span>
          <span className="pmt_cardCommitChip pmt_cardCommitChip--pend">O {pending}</span>
        </div>

        <div className="pmt_elementBars">
          {Object.entries(EL_LABEL).map(([el, label]) => {
            const elCommits = commits.filter((c) => elKey(c) === el);
            const elTotal   = elCommits.length;
            const elOk      = elCommits.filter((c) => c.status === "success").length;
            const elFail    = elCommits.filter((c) => c.status === "failed").length;
            const elPend    = elCommits.filter((c) => c.status === "pending" || c.status === "in_progress").length;
            const pct       = elTotal > 0 ? Math.round((elOk / elTotal) * 100) : 0;
            return (
              <div key={el} className="pmt_elementRow">
                <span className="pmt_elementLabel">{label}</span>
                <div className="pmt_elementTrack">
                  {elTotal > 0 && (
                    <>
                      <div className="pmt_elementFill pmt_elementFill--ok"   style={{ width: `${(elOk / elTotal) * 100}%` }} />
                      <div className="pmt_elementFill pmt_elementFill--fail" style={{ width: `${(elFail / elTotal) * 100}%` }} />
                      <div className="pmt_elementFill pmt_elementFill--pend" style={{ width: `${(elPend / elTotal) * 100}%` }} />
                    </>
                  )}
                </div>
                <span className="pmt_elementCount">{pct}%</span>
                <div className="pmt_elementDots">
                  <span className={`pmt_elementDot${elOk   > 0 ? " pmt_elementDot--ok"   : ""}`} />
                  <span className={`pmt_elementDot${elFail > 0 ? " pmt_elementDot--fail" : ""}`} />
                  <span className={`pmt_elementDot${elPend > 0 ? " pmt_elementDot--pend" : ""}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="pmt_cardFooter" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pmt_cardFooterBtn" onClick={onOpenGantt}>Gantt</button>
        <button type="button" className="pmt_cardFooterBtn" onClick={onOpenCommits}>Commits</button>
      </div>
    </div>
  );
}

// --- List row ---

function TeamListRow({
  entry, commits, todayDay, penaltyPerDay, maxPenalty, zones, onSelect,
}: {
  entry: TraceTeamEntry;
  commits: TraceCommit[];
  todayDay: number;
  penaltyPerDay: number;
  maxPenalty: number;
  zones: ZoneThresholds;
  onSelect: () => void;
}) {
  const score   = calcEntryScore(commits, todayDay, penaltyPerDay, maxPenalty);
  const ok      = commits.filter((c) => c.status === "success").length;
  const failed  = commits.filter((c) => c.status === "failed").length;
  const pending = commits.filter((c) => c.status === "pending" || c.status === "in_progress").length;
  const total   = commits.length;
  const grade   = gradeInfo(score, zones);
  const st      = statusFromScore(score, zones);

  return (
    <div className="pmt_listRow" onClick={onSelect}>
      <div className="pmt_listAvatar" style={{ background: entry.color || "#64748b" }}>
        {entry.pm_name.charAt(0).toUpperCase()}
      </div>
      <div className="pmt_listNames">
        <span className="pmt_listName">{entry.team_name}</span>
        <span className="pmt_listSub">{entry.pm_name}</span>
      </div>
      <div className="pmt_listRowBar">
        <div className="pmt_listRowFill" style={{ width: `${score}%`, background: grade.color }} />
      </div>
      <span className="pmt_listRowScore" style={{ color: grade.color }}>{score}</span>
      <span className={`pmt_listStatus pmt_listStatus--${st}`}>{grade.label}</span>
      <div className="pmt_listRowStats">
        <span className="pmt_listRowStat pmt_listRowStat--ok">Check {ok}</span>
        <span className="pmt_listRowStat pmt_listRowStat--fail">X {failed}</span>
        <span className="pmt_listRowStat pmt_listRowStat--pend">O {pending}</span>
        <span className="pmt_listRowStat">{total} total</span>
      </div>
    </div>
  );
}

// --- Project Gantt (all teams) ---

function ProjectGantt({
  entries, commitsByEntry, todayDay, totalDays, onDeadlineChange,
}: {
  entries: TraceTeamEntry[];
  commitsByEntry: Record<string, TraceCommit[]>;
  todayDay: number;
  totalDays: number;
  onDeadlineChange: (id: string, day: number) => void;
}) {
  return (
    <div className="pmt_projectGantt">
      <div className="pmt_pgHeader">
        <div className="pmt_pgLabelCol">Team / Commit</div>
        <div className="pmt_ganttTrack pmt_pgDayTrack">
          {Array.from({ length: totalDays }, (_, i) => (
            <div key={i} className={`pmt_ganttDayTick${i + 1 === todayDay ? " pmt_ganttDayTick--today" : ""}`}>
              {i + 1}
            </div>
          ))}
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
              <div className="pmt_ganttTrack pmt_pgTeamTrack">
                <div className="pmt_ganttTodayLine"
                  style={{ left: `${((todayDay - 1) / totalDays) * 100}%` }} />
              </div>
            </div>

            {commits.map((commit) => {
              const startDay  = getStartDay(commit.element, commit.commit_key);
              const barLeft   = `${((startDay - 1) / totalDays) * 100}%`;
              const barWidth  = `${((commit.deadline_day - startDay + 1) / totalDays) * 100}%`;
              const isLate    = commit.status !== "success" && todayDay > commit.deadline_day;
              const el        = elKey(commit);
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
                      style={{ background: (EL_COLOR[el] ?? "#64748b") + "22", color: EL_COLOR[el] ?? "#64748b" }}>
                      {EL_LABEL[el] ?? el}
                    </span>
                    <span className="pmt_pgCommitText" title={commit.label}>{commit.label}</span>
                    <span className="pmt_deadlineEdit" onClick={(e) => e.stopPropagation()}>
                      <input type="number" min={1} max={totalDays} value={commit.deadline_day}
                        onChange={(e) => onDeadlineChange(commit.id, Number(e.target.value))}
                        className="pmt_deadlineInput" />
                    </span>
                  </div>
                  <div className="pmt_ganttTrack pmt_pgCommitTrack">
                    <div className="pmt_ganttTodayLine"
                      style={{ left: `${((todayDay - 1) / totalDays) * 100}%` }} />
                    <div className={`pmt_ganttBar${isLate ? " pmt_ganttBar--late" : ""}`}
                      style={{ left: barLeft, width: barWidth, background: barBg }}
                      title={`${commit.label}: Day ${startDay}-${commit.deadline_day}`} />
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

// --- Main component ---

export default function PmTrackerPanel({ sessionId, teamId, userId: _userId, config, onExpandSidebar }: PmTrackerPanelProps) {
  // Template-level defaults (from analysis_templates.config)
  const penaltyPerDay   = (config.penalty_per_day   as number | undefined) ?? 5;
  const maxPenalty      = (config.max_penalty        as number | undefined) ?? 20;
  const configTotalDays = (config.total_working_days as number | undefined) ?? 10;

  // -- Core state --
  const [project, setProject]                 = useState<TraceProject | null>(null);
  const [entries, setEntries]                 = useState<TraceTeamEntry[]>([]);
  const [commitsByEntry, setCommitsByEntry]   = useState<Record<string, TraceCommit[]>>({});
  const [loading, setLoading]                 = useState(true);
  const [creatingProject, setCreatingProject] = useState(false);

  // Project-level config (applies AFTER user saves; falls back to defaults)
  const projectCfg = (project?.config ?? {}) as Record<string, unknown>;
  const theme     = (projectCfg.theme as string | undefined) ?? "light";
  const zones      = (projectCfg.zones as ZoneThresholds | undefined) ?? DEFAULT_ZONES;

  // -- Add tracker form --
  const [showAddEntry, setShowAddEntry]   = useState(false);
  const [newEntryName, setNewEntryName]   = useState("");
  const [newPmName, setNewPmName]         = useState("");
  const [newEntryColor, setNewEntryColor] = useState("#2563eb");
  const [newElement, setNewElement]       = useState<ElementKey>("robot");

  // -- Edit project name --
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft]     = useState("");

  // -- Edit entry --
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ team_name: "", pm_name: "", color: "#2563eb" });

  // -- Drawer --
  const [drawerEntryId, setDrawerEntryId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab]         = useState<"overview" | "commits" | "gantt" | "area">("overview");

  // -- Filters / view --
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "ontrack">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "name" | "progress">("score");
  const [view, setView]     = useState<"grid" | "list" | "gantt">("grid");

  // -- Settings (unified popup) --
  const [showSettings, setShowSettings]   = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({
    start_date: "",
    end_date: "",
    penalty_per_day: penaltyPerDay,
    max_penalty: maxPenalty,
    total_working_days: configTotalDays,
    zones: DEFAULT_ZONES as ZoneThresholds,
    theme: "light",
  });

  // -- ORION Check panel --
  const [showOrionCheck, setShowOrionCheck] = useState(false);

  const totalDays = project?.total_working_days ?? configTotalDays;
  const todayDay  = project ? getTodayDay(project) : 1;

  // -- Load data --
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: projectData, error: projectError } = await supabase
        .from("trace_projects").select("*").eq("team_id", teamId).maybeSingle();

      if (projectError) { console.error("[PmTracker] Load project error:", projectError); return; }

      if (!projectData) {
        setProject(null); setEntries([]); setCommitsByEntry({}); return;
      }

      setProject(projectData as TraceProject);

      const { data: entriesData } = await supabase
        .from("trace_team_entries").select("*")
        .eq("project_id", projectData.id).order("created_at");

      const loadedEntries = (entriesData ?? []) as TraceTeamEntry[];
      setEntries(loadedEntries);

      if (loadedEntries.length > 0) {
        const { data: commitsData } = await supabase
          .from("trace_commits").select("*")
          .in("entry_id", loadedEntries.map((e) => e.id)).order("deadline_day");

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

  // -- Create project --
  const handleCreateProject = async () => {
    setCreatingProject(true);
    try {
      const { data: newProject, error } = await supabase
        .from("trace_projects")
        .insert({
          team_id: teamId,
          analysis_session_id: sessionId || null,
          name: "Flexible Manufacturing Challenge 2026",
          course: "Automatización de Sistemas de Manufactura",
          start_date: new Date().toISOString().split("T")[0],
          end_date: new Date(Date.now() + 14 * 864e5).toISOString().split("T")[0],
          total_working_days: 10,
          penalty_per_day: penaltyPerDay,
          max_penalty: maxPenalty,
        })
        .select().single();
      if (error) { console.error("[PmTracker] Create error:", error); return; }
      setProject(newProject as TraceProject);
    } finally {
      setCreatingProject(false);
    }
  };

  // -- Add team entry --
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
        pm_user_id: null,
        color: newEntryColor ?? "#2563eb",
        orion_validated: false,
      })
      .select().single();

    if (error) { console.error("[PmTracker] Add entry error:", error); return; }

    const entryId = (entry as TraceTeamEntry).id;
    const defs    = COMMIT_DEFS[newElement];
    const inserts = defs.map((d: { id: string; label: string; deadline: number }) => ({
      id: crypto.randomUUID(), entry_id: entryId,
      commit_key: d.id, element: newElement,
      label: d.label, deadline_day: d.deadline,
      status: "pending" as const, updated_at: new Date().toISOString(),
    }));

    const { data: commitsData } = await supabase.from("trace_commits").insert(inserts).select();

    setEntries((prev) => [...prev, entry as TraceTeamEntry]);
    setCommitsByEntry((prev) => ({ ...prev, [entryId]: (commitsData ?? inserts) as TraceCommit[] }));
    setNewEntryName(""); setNewPmName(""); setNewEntryColor("#2563eb"); setShowAddEntry(false);
  };

  // -- Status change (optimistic) --
  const handleStatusChange = useCallback(async (commitId: string, newStatus: TraceCommit["status"]) => {
    const now = new Date().toISOString();
    setCommitsByEntry((prev) => {
      const updated: Record<string, TraceCommit[]> = {};
      for (const [eid, cs] of Object.entries(prev)) {
        updated[eid] = cs.map((c) => c.id === commitId ? { ...c, status: newStatus, updated_at: now } : c);
      }
      return updated;
    });
    await supabase.from("trace_commits").update({ status: newStatus, updated_at: now }).eq("id", commitId);
  }, []);

  // -- Save unified settings (date range + appearance + penalties + zones) --
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
      },
    };
    await supabase.from("trace_projects").update(patch).eq("id", project.id);
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

  // -- Delete entry (commits first, then entry; skip first delete if CASCADE is on) --
  const handleDeleteEntry = async (entryId: string) => {
    await supabase.from("trace_commits").delete().eq("entry_id", entryId);
    await supabase.from("trace_team_entries").delete().eq("id", entryId);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    setCommitsByEntry((prev) => { const next = { ...prev }; delete next[entryId]; return next; });
    setEditingEntryId(null);
  };

  // -- Edit entry --
  const handleSaveEntry = async (entryId: string) => {
    const { error } = await supabase.from("trace_team_entries")
      .update({ team_name: editDraft.team_name, pm_name: editDraft.pm_name, color: editDraft.color })
      .eq("id", entryId);
    if (!error) setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, ...editDraft } : e));
    setEditingEntryId(null);
  };

  // -- ORION validation toggle --
  const handleToggleOrionValidated = useCallback(async (entryId: string, validated: boolean) => {
    await supabase.from("trace_team_entries").update({ orion_validated: validated }).eq("id", entryId);
    setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, orion_validated: validated } : e));
  }, []);

  // -- Add / delete / edit commit label --
  const handleAddCommit = useCallback(async (
    entryId: string,
    draft: { label: string; element: string; deadline_day: number },
  ) => {
    if (!draft.label.trim()) return;
    const insert = {
      id: crypto.randomUUID(),
      entry_id: entryId,
      commit_key: `custom_${Date.now()}`,
      element: draft.element,
      element_key: draft.element,
      label: draft.label.trim(),
      deadline_day: draft.deadline_day,
      status: "pending" as const,
      updated_at: new Date().toISOString(),
    };
    const { data } = await supabase.from("trace_commits").insert(insert).select().single();
    setCommitsByEntry((prev) => ({
      ...prev,
      [entryId]: [...(prev[entryId] ?? []), (data ?? insert) as TraceCommit],
    }));
  }, []);

  const handleDeleteCommit = useCallback(async (entryId: string, commitId: string) => {
    setCommitsByEntry((prev) => ({
      ...prev,
      [entryId]: (prev[entryId] ?? []).filter((c) => c.id !== commitId),
    }));
    await supabase.from("trace_commits").delete().eq("id", commitId);
  }, []);

  const handleEditCommitLabel = useCallback(async (commitId: string, label: string) => {
    setCommitsByEntry((prev) => {
      const updated: Record<string, TraceCommit[]> = {};
      for (const [eid, cs] of Object.entries(prev))
        updated[eid] = cs.map((c) => c.id === commitId ? { ...c, label } : c);
      return updated;
    });
    await supabase.from("trace_commits").update({ label }).eq("id", commitId);
  }, []);

  // -- Deadline change --
  const handleDeadlineChange = useCallback(async (commitId: string, newDay: number) => {
    setCommitsByEntry((prev) => {
      const updated: Record<string, TraceCommit[]> = {};
      for (const [eid, cs] of Object.entries(prev)) {
        updated[eid] = cs.map((c) => c.id === commitId ? { ...c, deadline_day: newDay } : c);
      }
      return updated;
    });
    await supabase.from("trace_commits").update({ deadline_day: newDay }).eq("id", commitId);
  }, []);

  // -- Computed --
  const calcGlobalScore = (e: TraceTeamEntry) =>
    calcEntryScore(commitsByEntry[e.id] ?? [], todayDay, penaltyPerDay, maxPenalty);

  const allCommits     = Object.values(commitsByEntry).flat();
  const successCommits = allCommits.filter((c) => c.status === "success").length;
  const failedCommits  = allCommits.filter((c) => c.status === "failed").length;
  const lateCommits    = allCommits.filter((c) => c.status !== "success" && todayDay > c.deadline_day).length;
  const daysRemaining  = Math.max(0, totalDays - todayDay);
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
      const st = statusFromScore(calcGlobalScore(e), zones);
      if (filter === "critical" && st !== "critical") return false;
      if (filter === "warning"  && st !== "warning")  return false;
      if (filter === "ontrack"  && st !== "ok" && st !== "info") return false;
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
    critical: entries.filter((e) => statusFromScore(calcGlobalScore(e), zones) === "critical").length,
    warning:  entries.filter((e) => statusFromScore(calcGlobalScore(e), zones) === "warning").length,
    ontrack:  entries.filter((e) => {
      const st = statusFromScore(calcGlobalScore(e), zones);
      return st === "ok" || st === "info";
    }).length,
  };

  const sortLabel  = sortBy === "score" ? "Score" : sortBy === "name" ? "Name A-Z" : "Progress";
  const drawerEntry = drawerEntryId ? entries.find((e) => e.id === drawerEntryId) : null;

  // -- Render: loading --
  if (loading) {
    return (
      <div className="pmt_loading">
        <div className="pmt_loadingSpinner" />
        <p>Loading project data...</p>
      </div>
    );
  }

  // -- Render: no project --
  if (!project) {
    return (
      <div className="pmt_emptyProject">
        <Calendar size={48} strokeWidth={1} style={{ color: "rgba(16,17,19,0.2)" }} />
        <h3>No project found</h3>
        <p>Create a PM Tracker project to start monitoring your team's progress.</p>
        <button type="button" className="pmt_createProjectBtn"
          onClick={handleCreateProject} disabled={creatingProject}>
          {creatingProject ? "Creating..." : "Create Project"}
        </button>
      </div>
    );
  }

  // -- Render: dashboard --
  return (
    <div className="pmt_root" data-theme={theme}>
      {/* Slide-over drawer */}
      {drawerEntry && (
        <TeamDrawer
          entry={drawerEntry}
          commits={commitsByEntry[drawerEntry.id] ?? []}
          tab={drawerTab}
          onTabChange={setDrawerTab}
          onClose={() => setDrawerEntryId(null)}
          todayDay={todayDay}
          totalDays={totalDays}
          penaltyPerDay={penaltyPerDay}
          maxPenalty={maxPenalty}
          zones={zones}
          onStatusChange={handleStatusChange}
          onDeadlineChange={handleDeadlineChange}
          onAddCommit={(draft) => handleAddCommit(drawerEntry.id, draft)}
          onDeleteCommit={(cid) => handleDeleteCommit(drawerEntry.id, cid)}
          onEditCommitLabel={handleEditCommitLabel}
        />
      )}

      {/* Toolbar */}
      <div className="pmt_toolbar">
        <div className="pmt_toolbarLeft">
          <div className="pmt_titleRow">
            {onExpandSidebar && (
              <button
                type="button"
                className="pmt_expandBtn"
                onClick={onExpandSidebar}
                aria-label="Expand sidebar"
              >
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
                title="Click to rename">
                {project.name}
              </h1>
            )}
          </div>
        </div>
        <div className="pmt_toolbarRight">
          {/* Single config button (replaces date range + gear) */}
          <button type="button" className="pmt_btnIcon" onClick={() => {
            setSettingsDraft({
              start_date: project.start_date,
              end_date: project.end_date ?? "",
              penalty_per_day: penaltyPerDay,
              max_penalty: maxPenalty,
              total_working_days: totalDays,
              zones: zones,
              theme: theme,
            });
            setShowSettings(true);
          }} title="Configuración del proyecto">
            <Settings size={14} />
          </button>

          <span className="pmt_dayPill">DAY <strong>{todayDay}/{totalDays}</strong></span>

          <button type="button" className="pmt_btnOrion" onClick={() => setShowOrionCheck(true)}
            title="Validación ORION">
            <ShieldCheck size={13} /> ORION Check
          </button>

          <button type="button" className="pmt_btnSecondary" onClick={() => setShowAddEntry((p) => !p)}>
            <Plus size={13} /> Add Tracker
          </button>

          <button type="button" className="pmt_btnIcon" onClick={loadData} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Add tracker form */}
      {showAddEntry && (
        <div className="pmt_addEntryForm">
          <input type="text" className="pmt_addEntryInput" placeholder="Team name..."
            value={newEntryName} onChange={(e) => setNewEntryName(e.target.value)} />
          <input type="text" className="pmt_addEntryInput" placeholder="PM name..."
            value={newPmName} onChange={(e) => setNewPmName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddEntry(); }} />
          <select className="pmt_addEntrySelect" value={newElement}
            onChange={(e) => setNewElement(e.target.value as ElementKey)}>
            {Object.entries(EL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="color" className="pmt_addEntryColor" value={newEntryColor}
            onChange={(e) => setNewEntryColor(e.target.value)} />
          <button type="button" className="pmt_addEntryConfirm" onClick={handleAddEntry}>Add</button>
          <button type="button" className="pmt_addEntryCancel" onClick={() => setShowAddEntry(false)}>Cancel</button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="pmt_kpiStrip">
        <div className="pmt_kpiTile">
          <span className="pmt_kpiLabel">SCORE PROMEDIO</span>
          <span className="pmt_kpiValue" style={{ color: "#7c3aed" }}>{avgScore}<span className="pmt_kpiUnit">/100</span></span>
          <span className="pmt_kpiSub">
            {avgScore >= 75
              ? <><span className="pmt_kpiArrow pmt_kpiArrow--up">up</span> Sobre objetivo (75)</>
              : <><span className="pmt_kpiArrow pmt_kpiArrow--down">down</span> Bajo objetivo (75)</>}
          </span>
        </div>
        <div className="pmt_kpiTile">
          <span className="pmt_kpiLabel">CSR GLOBAL</span>
          <span className="pmt_kpiValue" style={{ color: globalGrade.color }}>{globalCsr}%</span>
          <span className="pmt_kpiSub">{globalGrade.label} · Intención vs ejecución</span>
        </div>
        <div className="pmt_kpiTile">
          <span className="pmt_kpiLabel">COMMITS OK</span>
          <span className="pmt_kpiValue" style={{ color: "var(--st-ok)" }}>{successCommits}</span>
          <span className="pmt_kpiSub">de {allCommits.length} totales</span>
        </div>
        <div className="pmt_kpiTile">
          <span className="pmt_kpiLabel">COMMITS FALLIDOS</span>
          <span className="pmt_kpiValue" style={{ color: "var(--st-critical)" }}>{failedCommits}</span>
          <span className="pmt_kpiSub">{allCommits.length - successCommits} sin completar</span>
        </div>
        <div className="pmt_kpiTile">
          <span className="pmt_kpiLabel">CON RETRASO</span>
          <span className="pmt_kpiValue" style={{ color: "var(--st-warning)" }}>{lateCommits}</span>
          <span className="pmt_kpiSub">{allCommits.length - successCommits} pendientes</span>
        </div>
        <div className="pmt_kpiTile">
          <span className="pmt_kpiLabel">DÍAS RESTANTES</span>
          <span className="pmt_kpiValue" style={{ color: "#2563eb" }}>{daysRemaining}</span>
          <span className="pmt_kpiSub">
            {project?.end_date
              ? `Fin: ${new Date(project.end_date + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}`
              : "--"}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="pmt_body">
        <div className={`pmt_leftCol${view === "gantt" ? " pmt_leftCol--full" : ""}`}>
        <div className="pmt_filterBar">
          <h2 className="pmt_sectionTitle">Avances Generales</h2>
          <div className="pmt_filterPills">
              {(["all", "critical", "warning", "ontrack"] as const).map((k) => (
                <button key={k} type="button"
                  className={`pmt_filterPill${filter === k ? " pmt_filterPill--active" : ""}`}
                  onClick={() => setFilter(k)}>
                  {k !== "all" && (
                    <span className={`pmt_filterDot pmt_filterDot--${k === "ontrack" ? "ok" : k}`} />
                  )}
                  {k === "ontrack" ? "On Track" : k.charAt(0).toUpperCase() + k.slice(1)}
                  <span className="pmt_filterCount">{filterCounts[k]}</span>
                </button>
              ))}
            </div>
            <div className="pmt_filterSearch">
              <Search size={13} />
              <input placeholder="Search teams or PMs..." value={search}
                onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button type="button" className="pmt_filterSort"
              onClick={() => setSortBy((s) => s === "score" ? "name" : s === "name" ? "progress" : "score")}>
              {sortLabel}
            </button>
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
                onClick={() => setView("gantt")}
                title="Vista Gantt">
                <CalendarDays size={13} />
              </button>
            </div>
          </div>

          {/* Team grid / list */}
          {view !== "gantt" && (
            entries.length === 0 ? (
              <div className="pmt_noEntries">
                <p>No team members yet. Use "+ Add Tracker" to start tracking.</p>
              </div>
            ) : view === "grid" ? (
              <div className="pmt_cardGrid">
                {filteredEntries.map((entry) => (
                  <TeamCard
                    key={entry.id}
                    entry={entry}
                    commits={commitsByEntry[entry.id] ?? []}
                    isSelected={drawerEntryId === entry.id}
                    todayDay={todayDay}
                    penaltyPerDay={penaltyPerDay}
                    maxPenalty={maxPenalty}
                    zones={zones}
                    editingEntryId={editingEntryId}
                    editDraft={editDraft}
                    onSelect={() => { setDrawerEntryId(entry.id); setDrawerTab("overview"); }}
                    onOpenGantt={() => { setDrawerEntryId(entry.id); setDrawerTab("gantt"); }}
                    onOpenCommits={() => { setDrawerEntryId(entry.id); setDrawerTab("commits"); }}
                    onStartEdit={() => { setEditDraft({ team_name: entry.team_name, pm_name: entry.pm_name, color: entry.color }); setEditingEntryId(entry.id); }}
                    onChangeEditDraft={setEditDraft}
                    onSaveEntry={handleSaveEntry}
                    onCancelEdit={() => setEditingEntryId(null)}
                    onDeleteEntry={() => handleDeleteEntry(entry.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="pmt_listWrap">
                {filteredEntries.map((entry) => (
                  <TeamListRow
                    key={entry.id}
                    entry={entry}
                    commits={commitsByEntry[entry.id] ?? []}
                    todayDay={todayDay}
                    penaltyPerDay={penaltyPerDay}
                    maxPenalty={maxPenalty}
                    zones={zones}
                    onSelect={() => { setDrawerEntryId(entry.id); setDrawerTab("overview"); }}
                  />
                ))}
              </div>
            )
          )}

          {/* Project Gantt */}
          {view === "gantt" && (
            <ProjectGantt
              entries={filteredEntries}
              commitsByEntry={commitsByEntry}
              todayDay={todayDay}
              totalDays={totalDays}
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
                <span className="pmt_widgetMeta">{entries.length} teams</span>
              </div>
              {(Object.keys(EL_LABEL) as ElementKey[]).map((el) => (
                <StackedRow key={el} label={EL_LABEL[el]}
                  commits={entries.flatMap((e) => (commitsByEntry[e.id] ?? []).filter((c) => elKey(c) === el))} />
              ))}
            </div>

            <div className="pmt_rankingWidget">
              <div className="pmt_widgetHead">
                <span className="pmt_widgetTitle">PM Ranking</span>
              </div>
              {[...entries]
                .sort((a, b) => calcGlobalScore(b) - calcGlobalScore(a))
                .slice(0, 5)
                .map((entry, i) => {
                  const score = calcGlobalScore(entry);
                  const st    = statusFromScore(score, zones);
                  return (
                    <div key={entry.id} className="pmt_rankRow"
                      onClick={() => { setDrawerEntryId(entry.id); setDrawerTab("overview"); }}>
                      <span className="pmt_rankNum">#{i + 1}</span>
                      <div className="pmt_rankInitial" style={{ background: entry.color || "#64748b" }}>
                        {entry.pm_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="pmt_rankInfo">
                        <span className="pmt_rankName">{entry.pm_name}</span>
                        <span className="pmt_rankTeam">{entry.team_name}</span>
                      </div>
                      <div className="pmt_rankScoreBar">
                        <div className="pmt_rankBarTrack">
                          <div className="pmt_rankBarFill"
                            style={{ width: `${score}%`, background: ST_COLOR[st] }} />
                        </div>
                        <span className="pmt_rankScore">{score}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Settings panel (unified: dates + appearance + penalties + zones) */}
      {showSettings && (
        <>
          <div className="pmt_drawerOverlay" onClick={() => setShowSettings(false)} />
          <div className="pmt_orionPanel">
            <div className="pmt_orionHead">
              <Settings size={18} /><span>Configuración del Proyecto</span>
              <button type="button" className="pmt_drawerClose" onClick={() => setShowSettings(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="pmt_orionBody" style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20 }}>

              {/* Rango del proyecto */}
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

              {/* Apariencia */}
              <div className="pmt_settingsSection">
                <div className="pmt_settingsSectionTitle">Apariencia</div>
                <div className="pmt_themeGrid">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`pmt_themeBtn${settingsDraft.theme === t.id ? " pmt_themeBtn--active" : ""}`}
                      onClick={() => setSettingsDraft((d) => ({ ...d, theme: t.id }))}
                      title={t.name}
                    >
                      <div className="pmt_themeSwatch" style={{ background: t.bg }}>
                        <span style={{ color: t.fg }}>Aa</span>
                      </div>
                      <span className="pmt_themeName">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Días y Penalizaciones */}
              <div className="pmt_settingsSection">
                <div className="pmt_settingsSectionTitle">Días y Penalizaciones</div>
                {([
                  ["Días laborales totales",          "total_working_days", 1,  60],
                  ["Penalización por día de retraso", "penalty_per_day",    0,  20],
                  ["Penalización máxima por commit",  "max_penalty",        0, 100],
                ] as [string, "total_working_days" | "penalty_per_day" | "max_penalty", number, number][]).map(([lbl, key, mn, mx]) => (
                  <div key={key} className="pmt_settingsRow">
                    <label>{lbl}</label>
                    <input type="number" min={mn} max={mx} value={settingsDraft[key]}
                      onChange={(e) => setSettingsDraft((d) => ({ ...d, [key]: +e.target.value }))} />
                  </div>
                ))}
              </div>

              {/* Umbrales — ZoneSlider */}
              <div className="pmt_settingsSection">
                <div className="pmt_settingsSectionTitle">Umbrales de Calificación</div>
                <ZoneSlider
                  values={settingsDraft.zones}
                  onChange={(zonesNext) => setSettingsDraft((d) => ({ ...d, zones: zonesNext }))}
                />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="pmt_addEntryCancel" onClick={() => setShowSettings(false)}>Cancelar</button>
                <button type="button" className="pmt_addEntryConfirm" onClick={handleSaveSettings}>Guardar</button>
              </div>
            </div>
          </div>
        </>
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
              {entries.map((entry) => {
                const score = calcGlobalScore(entry);
                const grade = gradeInfo(score, zones);
                return (
                  <div key={entry.id}
                    className={`pmt_orionRow${entry.orion_validated ? " pmt_orionRow--validated" : ""}`}>
                    <div className="pmt_orionAvatar" style={{ background: entry.color || "#64748b" }}>
                      {entry.pm_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="pmt_orionInfo">
                      <span className="pmt_orionTeam">{entry.team_name}</span>
                      <span className="pmt_orionPm">{entry.pm_name}</span>
                    </div>
                    <div className="pmt_orionScore" style={{ color: grade.color }}>
                      {score}
                      <span className="pmt_orionGrade">{grade.label}</span>
                    </div>
                    <button type="button"
                      className={`pmt_orionToggle${entry.orion_validated ? " pmt_orionToggle--on" : ""}`}
                      onClick={() => handleToggleOrionValidated(entry.id, !entry.orion_validated)}>
                      {entry.orion_validated ? "Validado" : "Validar"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}