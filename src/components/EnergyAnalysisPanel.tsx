// src/components/EnergyAnalysisPanel.tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, X, Zap, RefreshCw, Trash2, Activity, Power, ChevronLeft,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import "../styles/energy-analysis.css";

const analysisDb = supabase.schema("analysis");

// ─── Equipment types ──────────────────────────────────────────────────────────

const EQUIPMENT_TYPES = [
  { key: "motor",       label: "Motor",       color: "#e11d48" },
  { key: "pump",        label: "Bomba",       color: "#2563eb" },
  { key: "compressor",  label: "Compresor",   color: "#7c3aed" },
  { key: "lighting",    label: "Iluminación", color: "#f59e0b" },
  { key: "hvac",        label: "HVAC",        color: "#0891b2" },
  { key: "robot",       label: "Robot",       color: "#16a34a" },
  { key: "plc",         label: "PLC",         color: "#9333ea" },
  { key: "sensor",      label: "Sensor",      color: "#14b8a6" },
  { key: "other",       label: "Otro",        color: "#64748b" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  on: "#16a34a", standby: "#d97706", off: "#94a3b8", fault: "#dc2626",
};
const STATUS_LABELS: Record<string, string> = {
  on: "Encendido", standby: "Standby", off: "Apagado", fault: "Fallo",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnergyProject {
  id: string;
  team_id: string;
  analysis_session_id: string | null;
  name: string;
  hub_label: string;
  config?: Record<string, unknown>;
}

interface EnergyEquipment {
  id: string;
  project_id: string;
  name: string;
  type: string;
  color: string;
  power_rating_w: number;
  current_consumption_w: number;
  status: "on" | "off" | "standby" | "fault";
  position_angle: number | null;
  notes?: string | null;
  created_at?: string;
}

interface EnergyAnalysisPanelProps {
  sessionId: string;
  teamId: string;
  userId: string;
  config: Record<string, unknown>;
  onExpandSidebar?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtW(watts: number): string {
  if (watts >= 1000) return `${(watts / 1000).toFixed(1)} kW`;
  return `${Math.round(watts)} W`;
}

function typeMeta(type: string) {
  return EQUIPMENT_TYPES.find((t) => t.key === type) ?? EQUIPMENT_TYPES[EQUIPMENT_TYPES.length - 1];
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end   = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

// ─── HubGraph (SVG hub-and-spoke) ─────────────────────────────────────────────

function HubGraph({
  hubLabel, equipment, onAddEquipment, onSelectEquipment, selectedId,
}: {
  hubLabel: string;
  equipment: EnergyEquipment[];
  onAddEquipment: () => void;
  onSelectEquipment: (id: string) => void;
  selectedId: string | null;
}) {
  const VIEW   = 600;
  const CX     = VIEW / 2;
  const CY     = VIEW / 2;
  const HUB_R  = 44;
  const NODE_R = 26;
  const ORBIT  = 200;

  const positioned = useMemo(() => {
    return equipment.map((eq, i) => {
      const angle = eq.position_angle ?? (i / Math.max(equipment.length, 1)) * 360;
      const pos   = polarToCartesian(CX, CY, ORBIT, angle);
      return { ...eq, _angle: angle, _x: pos.x, _y: pos.y };
    });
  }, [equipment]);

  return (
    <div className="enr_hubWrap">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="enr_hubSvg">
        {/* connecting lines (hub → equipment) */}
        {positioned.map((eq) => (
          <line
            key={`line-${eq.id}`}
            x1={CX} y1={CY}
            x2={eq._x} y2={eq._y}
            className={`enr_link enr_link--${eq.status}`}
          />
        ))}

        {/* hub (central node) */}
        <circle cx={CX} cy={CY} r={HUB_R + 8} className="enr_hubHalo" />
        <circle cx={CX} cy={CY} r={HUB_R} className="enr_hub" />
        <text x={CX} y={CY + 4} textAnchor="middle" className="enr_hubText">
          {hubLabel.slice(0, 14)}
        </text>

        {/* equipment nodes */}
        {positioned.map((eq) => {
          const isSel = eq.id === selectedId;
          const tm    = typeMeta(eq.type);
          return (
            <g
              key={eq.id}
              className={`enr_node${isSel ? " enr_node--selected" : ""}`}
              onClick={() => onSelectEquipment(eq.id)}
              style={{ cursor: "pointer" }}
            >
              <circle cx={eq._x} cy={eq._y} r={NODE_R + 6} className="enr_nodeHalo" />
              <circle
                cx={eq._x} cy={eq._y} r={NODE_R}
                fill={eq.color || tm.color}
                stroke={isSel ? "var(--enr-text)" : "rgba(255,255,255,0.6)"}
                strokeWidth={isSel ? 2.5 : 1.5}
              />
              {/* status indicator dot */}
              <circle
                cx={eq._x + NODE_R - 6} cy={eq._y - NODE_R + 6} r={5}
                fill={STATUS_COLORS[eq.status]}
                stroke="var(--enr-surface)"
                strokeWidth={1.5}
              />
              <text x={eq._x} y={eq._y + NODE_R + 16} textAnchor="middle" className="enr_nodeText">
                {eq.name.slice(0, 14)}
              </text>
              <text x={eq._x} y={eq._y + NODE_R + 30} textAnchor="middle" className="enr_nodeSubText">
                {fmtW(eq.current_consumption_w)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* floating + button anchored above hub */}
      <button type="button" className="enr_addFab" onClick={onAddEquipment} title="Agregar equipo">
        <Plus size={16} />
        <span>Add equipment</span>
      </button>
    </div>
  );
}

// ─── Energy Mix Card (donut by equipment type) ────────────────────────────────

function EnergyMixCard({ equipment }: { equipment: EnergyEquipment[] }) {
  const total = equipment.reduce((s, e) => s + e.current_consumption_w, 0);

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    equipment.forEach((e) => map.set(e.type, (map.get(e.type) ?? 0) + e.current_consumption_w));
    return Array.from(map.entries())
      .map(([type, watts]) => ({
        type, watts,
        pct: total > 0 ? (watts / total) * 100 : 0,
        meta: typeMeta(type),
      }))
      .sort((a, b) => b.watts - a.watts);
  }, [equipment, total]);

  const SIZE = 160, R = 64, CX = SIZE / 2, CY = SIZE / 2;
  let cursor = 0;
  const arcs = byType.map((it) => {
    const start = cursor;
    const end   = cursor + (it.pct / 100) * 360;
    cursor = end;
    return { ...it, start, end };
  });

  return (
    <div className="enr_card">
      <div className="enr_cardHead">
        <span className="enr_cardTitle">Energy Mix</span>
        <span className="enr_cardMeta">por tipo · {equipment.length} equipos</span>
      </div>
      <div className="enr_cardBody">
        {total === 0 ? (
          <div className="enr_emptyMini">Sin consumo registrado.<br />Agrega equipos con consumo {">"} 0 W.</div>
        ) : (
          <>
            <div className="enr_donutWrap">
              <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
                <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--enr-border-soft)" strokeWidth={18} />
                {arcs.map((a) => (
                  <path
                    key={a.type}
                    d={arcPath(CX, CY, R, a.start, a.end)}
                    fill="none"
                    stroke={a.meta.color}
                    strokeWidth={18}
                  />
                ))}
                <text x={CX} y={CY - 2} textAnchor="middle" className="enr_donutVal">
                  {(total / 1000).toFixed(1)}
                </text>
                <text x={CX} y={CY + 16} textAnchor="middle" className="enr_donutUnit">
                  kW total
                </text>
              </svg>
            </div>
            <div className="enr_legend">
              {arcs.map((a) => (
                <div key={a.type} className="enr_legendRow">
                  <span className="enr_legendDot" style={{ background: a.meta.color }} />
                  <span className="enr_legendLbl">{a.meta.label}</span>
                  <span className="enr_legendVal">{a.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Status Card ──────────────────────────────────────────────────────────────

function StatusCard({ equipment }: { equipment: EnergyEquipment[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = { on: 0, standby: 0, off: 0, fault: 0 };
    equipment.forEach((e) => { c[e.status] = (c[e.status] ?? 0) + 1; });
    return c;
  }, [equipment]);

  const totalPower  = equipment.reduce((s, e) => s + e.current_consumption_w, 0);
  const ratedPower  = equipment.reduce((s, e) => s + e.power_rating_w, 0);
  const utilization = ratedPower > 0 ? (totalPower / ratedPower) * 100 : 0;
  const utilColor   = utilization > 85 ? "#dc2626" : utilization > 65 ? "#d97706" : "#16a34a";

  return (
    <div className="enr_card">
      <div className="enr_cardHead">
        <span className="enr_cardTitle">Estado del Sistema</span>
        <span className="enr_cardMeta">utilización en vivo</span>
      </div>
      <div className="enr_cardBody">
        <div className="enr_bigStat">
          <span className="enr_bigStatVal" style={{ color: utilColor }}>
            {utilization.toFixed(0)}<span className="enr_bigStatUnit">%</span>
          </span>
          <span className="enr_bigStatLbl">de capacidad nominal</span>
        </div>
        <div className="enr_utilTrack">
          <div className="enr_utilFill" style={{ width: `${Math.min(100, utilization)}%`, background: utilColor }} />
        </div>
        <div className="enr_statusGrid">
          {(["on", "standby", "off", "fault"] as const).map((s) => (
            <div key={s} className="enr_statusCell">
              <span className="enr_statusDot" style={{ background: STATUS_COLORS[s] }} />
              <span className="enr_statusCnt">{counts[s]}</span>
              <span className="enr_statusLbl">{STATUS_LABELS[s]}</span>
            </div>
          ))}
        </div>
        <div className="enr_kvRow">
          <span>Carga actual</span>
          <strong>{fmtW(totalPower)}</strong>
        </div>
        <div className="enr_kvRow">
          <span>Potencia nominal</span>
          <strong>{fmtW(ratedPower)}</strong>
        </div>
      </div>
    </div>
  );
}

// ─── Add/Edit Equipment Modal ─────────────────────────────────────────────────

function EquipmentModal({
  initial, onSave, onDelete, onClose,
}: {
  initial: EnergyEquipment | null;
  onSave: (eq: Partial<EnergyEquipment>) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Partial<EnergyEquipment>>({
    name: initial?.name ?? "",
    type: initial?.type ?? "motor",
    color: initial?.color ?? typeMeta(initial?.type ?? "motor").color,
    power_rating_w: initial?.power_rating_w ?? 1000,
    current_consumption_w: initial?.current_consumption_w ?? 0,
    status: initial?.status ?? "on",
    notes: initial?.notes ?? "",
  });

  const isEdit = !!initial?.id;

  return (
    <>
      <div className="enr_overlay" onClick={onClose} />
      <div className="enr_modal">
        <div className="enr_modalHead">
          <span>{isEdit ? "Editar equipo" : "Agregar equipo"}</span>
          <button type="button" className="enr_iconBtn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="enr_modalBody">
          <div className="enr_field">
            <label>Nombre</label>
            <input
              type="text"
              value={draft.name ?? ""}
              autoFocus
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Compresor 1, Robot xArm6, S7-1200..."
            />
          </div>
          <div className="enr_field">
            <label>Tipo</label>
            <div className="enr_typeGrid">
              {EQUIPMENT_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`enr_typeBtn${draft.type === t.key ? " enr_typeBtn--active" : ""}`}
                  onClick={() => setDraft((d) => ({ ...d, type: t.key, color: t.color }))}
                  style={draft.type === t.key ? { borderColor: t.color } : undefined}
                >
                  <span className="enr_typeDot" style={{ background: t.color }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="enr_fieldRow">
            <div className="enr_field">
              <label>Potencia nominal (W)</label>
              <input
                type="number" min={0}
                value={draft.power_rating_w ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, power_rating_w: +e.target.value }))}
              />
            </div>
            <div className="enr_field">
              <label>Consumo actual (W)</label>
              <input
                type="number" min={0}
                value={draft.current_consumption_w ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, current_consumption_w: +e.target.value }))}
              />
            </div>
          </div>
          <div className="enr_field">
            <label>Estado</label>
            <div className="enr_statusRow">
              {(["on", "standby", "off", "fault"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`enr_statusBtn${draft.status === s ? " enr_statusBtn--active" : ""}`}
                  onClick={() => setDraft((d) => ({ ...d, status: s }))}
                >
                  <span className="enr_statusDot" style={{ background: STATUS_COLORS[s] }} />
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="enr_field">
            <label>Notas</label>
            <textarea
              rows={2}
              value={draft.notes ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Ubicación, fabricante, modelo, observaciones..."
            />
          </div>
        </div>
        <div className="enr_modalFoot">
          {isEdit && onDelete && (
            <button type="button" className="enr_btnDanger" onClick={onDelete}>
              <Trash2 size={12} /> Eliminar
            </button>
          )}
          <button type="button" className="enr_btnGhost" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="enr_btnPrimary"
            disabled={!draft.name?.trim()}
            onClick={() => onSave(draft)}
          >
            {isEdit ? "Guardar" : "Agregar"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EnergyAnalysisPanel({
  sessionId, teamId, userId: _userId, config: _config, onExpandSidebar,
}: EnergyAnalysisPanelProps) {
  const [project, setProject]   = useState<EnergyProject | null>(null);
  const [equipment, setEquipment] = useState<EnergyEquipment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<{ mode: "add" | "edit"; initial: EnergyEquipment | null } | null>(null);

  const [editingProjectName, setEditingProjectName] = useState(false);
  const [editingHubLabel, setEditingHubLabel]       = useState(false);
  const [nameDraft, setNameDraft]                   = useState("");
  const [hubLabelDraft, setHubLabelDraft]           = useState("");

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: proj, error: projErr } = await analysisDb
        .from("energy_projects")
        .select("*")
        .eq("team_id", teamId)
        .maybeSingle();

      if (projErr) console.error("[Energy] Load project error:", projErr);
      if (!proj) {
        setProject(null); setEquipment([]); return;
      }
      setProject(proj as EnergyProject);

      const { data: eqs, error: eqsErr } = await analysisDb
        .from("energy_equipment")
        .select("*")
        .eq("project_id", proj.id)
        .order("created_at");

      if (eqsErr) console.error("[Energy] Load equipment error:", eqsErr);
      setEquipment((eqs ?? []) as EnergyEquipment[]);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Create project ──────────────────────────────────────────────────────────
  const handleCreateProject = async () => {
    setCreating(true);
    try {
      const { data, error } = await analysisDb
        .from("energy_projects")
        .insert({
          team_id: teamId,
          analysis_session_id: sessionId || null,
          name: "Análisis Energético",
          hub_label: "FrED Factory",
          config: {},
        })
        .select().single();
      if (error) { console.error("[Energy] Create error:", error); return; }
      if (data) setProject(data as EnergyProject);
    } finally {
      setCreating(false);
    }
  };

  // ── Save equipment (add or edit) ────────────────────────────────────────────
  const handleSaveEquipment = async (draft: Partial<EnergyEquipment>) => {
    if (!project) return;
    const isEdit = !!modalState?.initial?.id;

    if (isEdit && modalState?.initial) {
      const id = modalState.initial.id;
      // optimistic
      setEquipment((prev) => prev.map((e) => e.id === id ? ({ ...e, ...draft } as EnergyEquipment) : e));
      const { error } = await analysisDb.from("energy_equipment").update(draft).eq("id", id);
      if (error) console.error("[Energy] Update equipment error:", error);
    } else {
      const insert = {
        project_id: project.id,
        name: draft.name!.trim(),
        type: draft.type ?? "motor",
        color: draft.color ?? typeMeta(draft.type ?? "motor").color,
        power_rating_w: draft.power_rating_w ?? 0,
        current_consumption_w: draft.current_consumption_w ?? 0,
        status: draft.status ?? "on",
        notes: draft.notes ?? null,
        position_angle: null,
      };
      const { data, error } = await analysisDb.from("energy_equipment").insert(insert).select().single();
      if (error) { console.error("[Energy] Insert equipment error:", error); return; }
      if (data) setEquipment((prev) => [...prev, data as EnergyEquipment]);
    }
    setModalState(null);
  };

  // ── Delete equipment ────────────────────────────────────────────────────────
  const handleDeleteEquipment = async () => {
    if (!modalState?.initial?.id) return;
    const id = modalState.initial.id;
    setEquipment((prev) => prev.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
    const { error } = await analysisDb.from("energy_equipment").delete().eq("id", id);
    if (error) console.error("[Energy] Delete equipment error:", error);
    setModalState(null);
  };

  // ── Save project name / hub label ───────────────────────────────────────────
  const handleSaveProjectName = async () => {
    if (project && nameDraft.trim() && nameDraft !== project.name) {
      await analysisDb.from("energy_projects").update({ name: nameDraft.trim() }).eq("id", project.id);
      setProject((p) => p ? { ...p, name: nameDraft.trim() } : p);
    }
    setEditingProjectName(false);
  };

  const handleSaveHubLabel = async () => {
    if (project && hubLabelDraft.trim() && hubLabelDraft !== project.hub_label) {
      await analysisDb.from("energy_projects").update({ hub_label: hubLabelDraft.trim() }).eq("id", project.id);
      setProject((p) => p ? { ...p, hub_label: hubLabelDraft.trim() } : p);
    }
    setEditingHubLabel(false);
  };

  // ── Render: loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="enr_loading">
        <div className="enr_spinner" />
        <p>Cargando análisis energético...</p>
      </div>
    );
  }

  // ── Render: no project ──────────────────────────────────────────────────────
  if (!project) {
    return (
      <div className="enr_empty">
        <Zap size={48} strokeWidth={1.2} style={{ color: "rgba(16,17,19,0.2)" }} />
        <h3>Sin análisis energético</h3>
        <p>Crea uno para mapear el consumo de cada equipo del sistema y visualizar el mix energético.</p>
        <button type="button" className="enr_btnPrimary" onClick={handleCreateProject} disabled={creating}>
          {creating ? "Creando..." : "Crear Análisis Energético"}
        </button>
      </div>
    );
  }

  // ── Render: dashboard ───────────────────────────────────────────────────────
  return (
    <div className="enr_root">
      {/* Toolbar */}
      <div className="enr_toolbar">
        <div className="enr_toolbarLeft">
          <div className="enr_titleRow">
            {onExpandSidebar && (
              <button type="button" className="enr_expandBtn" onClick={onExpandSidebar} aria-label="Expand sidebar">
                <ChevronLeft size={16} />
              </button>
            )}
            {editingProjectName ? (
              <input
                className="enr_titleInput"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleSaveProjectName}
                onKeyDown={(e) => e.key === "Enter" && handleSaveProjectName()}
                autoFocus
              />
            ) : (
              <h1 className="enr_h1"
                onClick={() => { setNameDraft(project.name); setEditingProjectName(true); }}
                title="Click para renombrar">
                {project.name}
              </h1>
            )}
          </div>
        </div>
        <div className="enr_toolbarRight">
          <span className="enr_chip">
            <Activity size={11} /> {equipment.length} equipos
          </span>
          <span className="enr_chip">
            <Power size={11} /> {fmtW(equipment.reduce((s, e) => s + e.current_consumption_w, 0))}
          </span>
          <button type="button" className="enr_btnIcon" onClick={loadData} title="Recargar">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Body: left graph / right cards */}
      <div className="enr_body">
        <div className="enr_leftCol">
          <div className="enr_hubHeader">
            {editingHubLabel ? (
              <input
                className="enr_hubLabelInput"
                value={hubLabelDraft}
                onChange={(e) => setHubLabelDraft(e.target.value)}
                onBlur={handleSaveHubLabel}
                onKeyDown={(e) => e.key === "Enter" && handleSaveHubLabel()}
                autoFocus
              />
            ) : (
              <span
                className="enr_hubLabelEditable"
                onClick={() => { setHubLabelDraft(project.hub_label); setEditingHubLabel(true); }}
                title="Click para renombrar el núcleo"
              >
                {project.hub_label}
              </span>
            )}
            <span className="enr_hubLabelHint">núcleo del sistema</span>
          </div>

          <HubGraph
            hubLabel={project.hub_label}
            equipment={equipment}
            onAddEquipment={() => setModalState({ mode: "add", initial: null })}
            onSelectEquipment={(id) => {
              const eq = equipment.find((e) => e.id === id);
              if (eq) {
                setSelectedId(id);
                setModalState({ mode: "edit", initial: eq });
              }
            }}
            selectedId={selectedId}
          />

          {equipment.length === 0 && (
            <div className="enr_hubEmpty">
              Click <strong>+ Add equipment</strong> arriba del núcleo para agregar tu primer equipo.
            </div>
          )}
        </div>

        <div className="enr_rightCol">
          <EnergyMixCard equipment={equipment} />
          <StatusCard equipment={equipment} />
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalState && (
        <EquipmentModal
          initial={modalState.initial}
          onSave={handleSaveEquipment}
          onDelete={modalState.initial ? handleDeleteEquipment : undefined}
          onClose={() => { setModalState(null); setSelectedId(null); }}
        />
      )}
    </div>
  );
}