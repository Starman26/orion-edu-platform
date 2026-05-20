// src/components/KnowledgeGraphSection.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ConnectionLineType,
  ConnectionMode,
  EdgeLabelRenderer,
  useNodesState,
  useEdgesState,
  useReactFlow,
  getSmoothStepPath,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Plus,
  Cpu,
  MapPin,
  Lightbulb,
  Layers,
  Package,
  Link2,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { equipmentTypeIcon } from "./EquipmentTab";

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type NodeKind = "equipment" | "space" | "concept" | "process" | "material";
type Relation =
  | "controls"
  | "monitors"
  | "located_in"
  | "connects_to"
  | "is_a"
  | "part_of"
  | "related_to";

interface KGNodeRow {
  id: string;
  team_id: string;
  kind: NodeKind;
  source_table: string | null;
  source_id: string | null;
  label: string;
  notes: string | null;
  x: number;
  y: number;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
}

interface KGEdgeRow {
  id: string;
  team_id: string;
  source_node_id: string;
  target_node_id: string;
  relation: Relation;
  notes: string | null;
}

interface KGNodeData {
  kind: NodeKind;
  label: string;
  notes: string | null;
  source_table: string | null;
  source_id: string | null;
  [key: string]: unknown;
}

interface KGEdgeData {
  relation: Relation;
  notes: string | null;
  [key: string]: unknown;
}

type RFNode = Node<KGNodeData>;
type RFEdge = Edge<KGEdgeData>;

const NODE_KINDS: { value: NodeKind; label: string; color: string }[] = [
  { value: "equipment", label: "Equipo", color: "#2563eb" },
  { value: "space", label: "Espacio", color: "#0891b2" },
  { value: "concept", label: "Concepto", color: "#7c3aed" },
  { value: "process", label: "Proceso", color: "#ea580c" },
  { value: "material", label: "Material", color: "#16a34a" },
];

const RELATIONS: { value: Relation; label: string }[] = [
  { value: "controls", label: "controla" },
  { value: "monitors", label: "monitorea" },
  { value: "located_in", label: "está en" },
  { value: "connects_to", label: "conecta con" },
  { value: "is_a", label: "es un" },
  { value: "part_of", label: "parte de" },
  { value: "related_to", label: "relacionado con" },
];

// Vertical rails on each side so parallel edges between the same pair of nodes don't stack.
// Order is important: middle slot is used first (single edges), then we fan out top/bottom.
const HANDLE_SLOTS: { id: string; top: string }[] = [
  { id: "mid", top: "50%" },
  { id: "top", top: "30%" },
  { id: "bot", top: "70%" },
  { id: "top2", top: "18%" },
  { id: "bot2", top: "82%" },
];

const KIND_LABEL = (kind: NodeKind) =>
  NODE_KINDS.find((k) => k.value === kind)?.label ?? kind;
const RELATION_LABEL = (rel: Relation) =>
  RELATIONS.find((r) => r.value === rel)?.label ?? rel;

const kindIcon = (kind: NodeKind, equipmentType?: string) => {
  const props = { size: 14, strokeWidth: 1.8 };
  switch (kind) {
    case "equipment":
      return equipmentType ? equipmentTypeIcon(equipmentType, 14) : <Cpu {...props} />;
    case "space":
      return <MapPin {...props} />;
    case "concept":
      return <Lightbulb {...props} />;
    case "process":
      return <Layers {...props} />;
    case "material":
      return <Package {...props} />;
  }
};

// ============================================================================
// PROPS
// ============================================================================

interface KnowledgeGraphSectionProps {
  teamId: string | null;
  userId: string | null;
  canEdit?: boolean;
}

// ============================================================================
// CUSTOM NODE
// ============================================================================

function KGNodeComponent({ data, selected }: NodeProps<RFNode>) {
  const isLinked = !!data.source_id;

  return (
    <div className={`ll_kg_node ${selected ? "ll_kg_node--selected" : ""}`}>
      {/* Multiple handles per side for routing parallel edges; only the mid one is shown to the user */}
      {HANDLE_SLOTS.map((slot) => (
        <Handle
          key={`l-${slot.id}`}
          type="source"
          position={Position.Left}
          id={`l-${slot.id}`}
          className={`ll_kg_handle ${slot.id === "mid" ? "ll_kg_handle--primary" : ""}`}
          style={{ top: slot.top }}
        />
      ))}
      {HANDLE_SLOTS.map((slot) => (
        <Handle
          key={`r-${slot.id}`}
          type="source"
          position={Position.Right}
          id={`r-${slot.id}`}
          className={`ll_kg_handle ${slot.id === "mid" ? "ll_kg_handle--primary" : ""}`}
          style={{ top: slot.top }}
        />
      ))}
      <span className="ll_kg_node_icon">
        {kindIcon(data.kind)}
      </span>
      <span className="ll_kg_node_label">{data.label}</span>
      {isLinked && (
        <span className="ll_kg_node_linked" title="Vinculado a un registro">
          <Link2 size={10} strokeWidth={2} />
        </span>
      )}
    </div>
  );
}

const nodeTypes = { kg: KGNodeComponent };

// ============================================================================
// EDITABLE EDGE — waypoints the user can drag/add/remove
// ============================================================================

interface Waypoint {
  x: number;
  y: number;
}

interface EdgeEditCtx {
  setWaypoints: (edgeId: string, wps: Waypoint[]) => void;
  selectedEdgeId: string | null;
}

const EdgeEditContext = createContext<EdgeEditCtx | null>(null);

function buildPolylinePath(points: Waypoint[]): string {
  if (points.length < 2) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`)
    .join(" ");
}

function midpoint(a: Waypoint, b: Waypoint): Waypoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function EditableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  label,
  style,
  markerEnd,
}: EdgeProps<RFEdge>) {
  const ctx = useContext(EdgeEditContext);
  const { screenToFlowPosition } = useReactFlow();
  const waypoints = useMemo<Waypoint[]>(
    () => (Array.isArray((data as KGEdgeData | undefined)?.waypoints)
      ? ((data as KGEdgeData & { waypoints: Waypoint[] }).waypoints)
      : []),
    [data]
  );

  const isActive = ctx?.selectedEdgeId === id || !!selected;

  // Path + label position
  const { d, labelX, labelY } = useMemo(() => {
    if (waypoints.length === 0) {
      const [path, lx, ly] = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        borderRadius: 8,
      });
      return { d: path, labelX: lx, labelY: ly };
    }
    const pts: Waypoint[] = [
      { x: sourceX, y: sourceY },
      ...waypoints,
      { x: targetX, y: targetY },
    ];
    const path = buildPolylinePath(pts);
    // Place label at midpoint of the middle segment
    const segCount = pts.length - 1;
    const midSeg = Math.floor(segCount / 2);
    const a = pts[midSeg];
    const b = pts[midSeg + 1];
    const m = midpoint(a, b);
    return { d: path, labelX: m.x, labelY: m.y };
  }, [waypoints, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);

  // Drag a waypoint
  const onWaypointPointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.target as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const onMove = (ev: PointerEvent) => {
      const pos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      if (!ctx) return;
      const next = waypoints.slice();
      next[idx] = pos;
      ctx.setWaypoints(id, next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onWaypointDoubleClick = (idx: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ctx) return;
    ctx.setWaypoints(id, waypoints.filter((_, i) => i !== idx));
  };

  // Add a waypoint at the midpoint of a segment
  const addWaypointAt = (idx: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ctx) return;
    const pts: Waypoint[] = [
      { x: sourceX, y: sourceY },
      ...waypoints,
      { x: targetX, y: targetY },
    ];
    const m = midpoint(pts[idx], pts[idx + 1]);
    const next = waypoints.slice();
    next.splice(idx, 0, m);
    ctx.setWaypoints(id, next);
  };

  // Build "+" buttons at midpoint of each segment (only when active)
  const addButtons = useMemo(() => {
    if (!isActive) return [];
    const pts: Waypoint[] = [
      { x: sourceX, y: sourceY },
      ...waypoints,
      { x: targetX, y: targetY },
    ];
    const out: { x: number; y: number; idx: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const m = midpoint(pts[i], pts[i + 1]);
      out.push({ x: m.x, y: m.y, idx: i });
    }
    return out;
  }, [isActive, sourceX, sourceY, targetX, targetY, waypoints]);

  return (
    <>
      <path
        id={id}
        d={d}
        className={`react-flow__edge-path ll_kg_edgePath ${isActive ? "ll_kg_edgePath--active" : ""}`}
        style={style}
        markerEnd={markerEnd}
        fill="none"
      />
      <EdgeLabelRenderer>
        {label != null && label !== "" && (
          <div
            className="ll_kg_edgeLabel"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        )}

        {waypoints.map((wp, idx) => (
          <div
            key={`wp-${idx}`}
            className={`ll_kg_waypoint ${isActive ? "ll_kg_waypoint--active" : ""}`}
            style={{
              transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`,
            }}
            onPointerDown={onWaypointPointerDown(idx)}
            onDoubleClick={onWaypointDoubleClick(idx)}
            title="Arrastra para mover • doble-click para eliminar"
          />
        ))}

        {addButtons.map((b) => (
          <button
            key={`add-${b.idx}`}
            type="button"
            className="ll_kg_waypointAdd"
            style={{
              transform: `translate(-50%, -50%) translate(${b.x}px, ${b.y}px)`,
            }}
            onClick={addWaypointAt(b.idx)}
            title="Agregar punto"
          >
            +
          </button>
        ))}
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { editable: EditableEdge };

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function KnowledgeGraphSection(props: KnowledgeGraphSectionProps) {
  return (
    <section className="ll_section ll_kg_section">
      <p className="ll_kg_subtitle">
        Conecta equipos, conceptos y procesos del laboratorio, para crear el cerebro de ORION, que puede ver, controlar, entender.
      </p>
      <ReactFlowProvider>
        <KnowledgeGraphCanvas {...props} />
      </ReactFlowProvider>
    </section>
  );
}

function KnowledgeGraphCanvas({ teamId, userId, canEdit = false }: KnowledgeGraphSectionProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);

  const [loading, setLoading] = useState(false);

  // Selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Toolbar dropdowns
  const [equipmentMenuOpen, setEquipmentMenuOpen] = useState(false);
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false);
  const [equipmentList, setEquipmentList] = useState<
    { id: string; name: string; type: string }[]
  >([]);
  const [spaceList, setSpaceList] = useState<{ id: number; name: string }[]>([]);

  // Modals
  const [showFreeNodeModal, setShowFreeNodeModal] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);

  // Notice / error inline message
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
  }, []);

  // ── Load graph ──
  const loadGraph = useCallback(async () => {
    if (!teamId) {
      setNodes([]);
      setEdges([]);
      return;
    }
    setLoading(true);
    try {
      const [{ data: nodeRows, error: nErr }, { data: edgeRows, error: eErr }] =
        await Promise.all([
          supabase.schema("lab").from("kg_nodes").select("*").eq("team_id", teamId),
          supabase.schema("lab").from("kg_edges").select("*").eq("team_id", teamId),
        ]);

      if (nErr) console.error("[KG] load nodes:", nErr);
      if (eErr) console.error("[KG] load edges:", eErr);

      const rfNodes: RFNode[] = (nodeRows || []).map((n: KGNodeRow) => ({
        id: n.id,
        type: "kg",
        position: { x: Number(n.x) || 0, y: Number(n.y) || 0 },
        data: {
          kind: n.kind,
          label: n.label,
          notes: n.notes,
          source_table: n.source_table,
          source_id: n.source_id,
        },
      }));

      const rfEdges: RFEdge[] = (edgeRows || []).map((e: KGEdgeRow) => ({
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        type: "editable",
        label: RELATION_LABEL(e.relation),
        data: { relation: e.relation, notes: e.notes },
      }));

      setNodes(rfNodes);
      setEdges(rfEdges);
    } finally {
      setLoading(false);
    }
  }, [teamId, setNodes, setEdges]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // ── Load equipment & spaces for toolbar dropdowns ──
  useEffect(() => {
    if (!teamId) {
      setEquipmentList([]);
      setSpaceList([]);
      return;
    }
    (async () => {
      const [{ data: eq }, { data: sp }] = await Promise.all([
        supabase
          .schema("lab")
          .from("equipment_profiles")
          .select("id, name, type")
          .eq("team_id", teamId)
          .order("name"),
        supabase
          .schema("lab")
          .from("spaces")
          .select("id, name")
          .eq("is_active", true)
          .order("name"),
      ]);
      setEquipmentList((eq || []) as { id: string; name: string; type: string }[]);
      setSpaceList((sp || []) as { id: number; name: string }[]);
    })();
  }, [teamId]);

  // Track linked source_ids that are already in the graph
  const linkedEquipmentIds = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      if (n.data.source_table === "equipment_profiles" && n.data.source_id) {
        set.add(n.data.source_id);
      }
    }
    return set;
  }, [nodes]);

  const linkedSpaceIds = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      if (n.data.source_table === "spaces" && n.data.source_id) {
        set.add(n.data.source_id);
      }
    }
    return set;
  }, [nodes]);

  const availableEquipment = useMemo(
    () => equipmentList.filter((e) => !linkedEquipmentIds.has(e.id)),
    [equipmentList, linkedEquipmentIds]
  );

  const availableSpaces = useMemo(
    () => spaceList.filter((s) => !linkedSpaceIds.has(String(s.id))),
    [spaceList, linkedSpaceIds]
  );

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );
  const selectedEdge = useMemo(
    () => edges.find((e) => e.id === selectedEdgeId) || null,
    [edges, selectedEdgeId]
  );

  // Per-edge handle overrides set by the user via drag-reconnect. Persisted in localStorage per team.
  const [edgeHandles, setEdgeHandles] = useState<Record<string, { sh: string; th: string }>>({});
  // Per-edge waypoints (corner control points). Persisted in localStorage per team.
  const [edgeWaypoints, setEdgeWaypoints] = useState<Record<string, Waypoint[]>>({});

  useEffect(() => {
    if (!teamId) {
      setEdgeHandles({});
      setEdgeWaypoints({});
      return;
    }
    try {
      const rawH = localStorage.getItem(`kg.edgeHandles.${teamId}`);
      setEdgeHandles(rawH ? JSON.parse(rawH) : {});
    } catch {
      setEdgeHandles({});
    }
    try {
      const rawW = localStorage.getItem(`kg.edgeWaypoints.${teamId}`);
      setEdgeWaypoints(rawW ? JSON.parse(rawW) : {});
    } catch {
      setEdgeWaypoints({});
    }
  }, [teamId]);

  const updateEdgeHandlesStore = useCallback(
    (updater: (prev: Record<string, { sh: string; th: string }>) => Record<string, { sh: string; th: string }>) => {
      setEdgeHandles((prev) => {
        const next = updater(prev);
        if (teamId) {
          try {
            localStorage.setItem(`kg.edgeHandles.${teamId}`, JSON.stringify(next));
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    },
    [teamId]
  );

  const updateEdgeWaypointsStore = useCallback(
    (updater: (prev: Record<string, Waypoint[]>) => Record<string, Waypoint[]>) => {
      setEdgeWaypoints((prev) => {
        const next = updater(prev);
        if (teamId) {
          try {
            localStorage.setItem(`kg.edgeWaypoints.${teamId}`, JSON.stringify(next));
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    },
    [teamId]
  );

  const setWaypointsForEdge = useCallback(
    (edgeId: string, wps: Waypoint[]) => {
      updateEdgeWaypointsStore((prev) => {
        if (wps.length === 0) {
          if (!(edgeId in prev)) return prev;
          const next = { ...prev };
          delete next[edgeId];
          return next;
        }
        return { ...prev, [edgeId]: wps };
      });
    },
    [updateEdgeWaypointsStore]
  );

  const editCtxValue = useMemo<EdgeEditCtx>(
    () => ({
      setWaypoints: setWaypointsForEdge,
      selectedEdgeId,
    }),
    [setWaypointsForEdge, selectedEdgeId]
  );

  // Route edges. User overrides win; otherwise parallel edges between same node pair are spread
  // across different handle rails so they don't visually stack.
  const displayEdges = useMemo<RFEdge[]>(() => {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const groups = new Map<string, RFEdge[]>();
    for (const e of edges) {
      const key = [e.source, e.target].sort().join("|");
      const list = groups.get(key) || [];
      list.push(e);
      groups.set(key, list);
    }
    return edges.map((e) => {
      const wps = edgeWaypoints[e.id];
      const dataWithWaypoints = {
        ...(e.data as KGEdgeData),
        waypoints: wps && wps.length ? wps : [],
      } as KGEdgeData & { waypoints: Waypoint[] };

      const override = edgeHandles[e.id];
      if (override) {
        return {
          ...e,
          type: "editable",
          sourceHandle: override.sh,
          targetHandle: override.th,
          data: dataWithWaypoints,
        };
      }
      const sourceNode = nodeById.get(e.source);
      const targetNode = nodeById.get(e.target);
      if (!sourceNode || !targetNode) {
        return { ...e, type: "editable", data: dataWithWaypoints };
      }
      const sourceOnRight = sourceNode.position.x <= targetNode.position.x;
      const key = [e.source, e.target].sort().join("|");
      const group = groups.get(key) || [e];
      const idx = group.findIndex((g) => g.id === e.id);
      const slot = HANDLE_SLOTS[idx % HANDLE_SLOTS.length].id;
      return {
        ...e,
        type: "editable",
        sourceHandle: `${sourceOnRight ? "r" : "l"}-${slot}`,
        targetHandle: `${sourceOnRight ? "l" : "r"}-${slot}`,
        data: dataWithWaypoints,
      };
    });
  }, [edges, nodes, edgeHandles, edgeWaypoints]);

  // Drag an existing edge's endpoint to a different handle (or different node).
  const onReconnect = useCallback(
    async (oldEdge: RFEdge, newConn: Connection) => {
      if (!canEdit) return;
      if (!newConn.source || !newConn.target) return;
      if (newConn.source === newConn.target) return;

      const nodesChanged =
        newConn.source !== oldEdge.source || newConn.target !== oldEdge.target;

      if (nodesChanged) {
        const { error } = await supabase
          .schema("lab")
          .from("kg_edges")
          .update({
            source_node_id: newConn.source,
            target_node_id: newConn.target,
          })
          .eq("id", oldEdge.id);
        if (error) {
          console.error("[KG] reconnect:", error);
          showNotice("No se pudo mover la conexión");
          return;
        }
        setEdges((prev) =>
          prev.map((e) =>
            e.id === oldEdge.id
              ? { ...e, source: newConn.source!, target: newConn.target! }
              : e
          )
        );
      }

      if (newConn.sourceHandle && newConn.targetHandle) {
        updateEdgeHandlesStore((prev) => ({
          ...prev,
          [oldEdge.id]: { sh: newConn.sourceHandle!, th: newConn.targetHandle! },
        }));
      }
    },
    [canEdit, setEdges, updateEdgeHandlesStore, showNotice]
  );

  // Center with jitter for newly added nodes
  const centerPosition = useCallback(() => {
    const cx = 300 + (Math.random() - 0.5) * 160;
    const cy = 220 + (Math.random() - 0.5) * 160;
    return { x: cx, y: cy };
  }, []);

  // ── Insert node helpers ──
  const insertEquipmentNode = useCallback(
    async (eq: { id: string; name: string; type: string }) => {
      if (!teamId || !canEdit) return;
      const pos = centerPosition();
      const { data, error } = await supabase
        .schema("lab")
        .from("kg_nodes")
        .insert({
          team_id: teamId,
          kind: "equipment",
          source_table: "equipment_profiles",
          source_id: eq.id,
          label: eq.name,
          x: pos.x,
          y: pos.y,
          created_by: userId,
        })
        .select("*")
        .single();

      if (error) {
        if ((error.code === "23505") || /duplicate/i.test(error.message)) {
          showNotice("Ya está en el grafo");
        } else {
          console.error("[KG] insert equipment node:", error);
          showNotice("No se pudo agregar el equipo");
        }
        return;
      }
      const row = data as KGNodeRow;
      setNodes((prev) => [
        ...prev,
        {
          id: row.id,
          type: "kg",
          position: { x: Number(row.x), y: Number(row.y) },
          data: {
            kind: row.kind,
            label: row.label,
            notes: row.notes,
            source_table: row.source_table,
            source_id: row.source_id,
          },
        },
      ]);
      setEquipmentMenuOpen(false);
    },
    [teamId, userId, canEdit, centerPosition, setNodes, showNotice]
  );

  const insertSpaceNode = useCallback(
    async (sp: { id: number; name: string }) => {
      if (!teamId || !canEdit) return;
      const pos = centerPosition();
      const { data, error } = await supabase
        .schema("lab")
        .from("kg_nodes")
        .insert({
          team_id: teamId,
          kind: "space",
          source_table: "spaces",
          source_id: String(sp.id),
          label: sp.name,
          x: pos.x,
          y: pos.y,
          created_by: userId,
        })
        .select("*")
        .single();

      if (error) {
        if ((error.code === "23505") || /duplicate/i.test(error.message)) {
          showNotice("Ya está en el grafo");
        } else {
          console.error("[KG] insert space node:", error);
          showNotice("No se pudo agregar el espacio");
        }
        return;
      }
      const row = data as KGNodeRow;
      setNodes((prev) => [
        ...prev,
        {
          id: row.id,
          type: "kg",
          position: { x: Number(row.x), y: Number(row.y) },
          data: {
            kind: row.kind,
            label: row.label,
            notes: row.notes,
            source_table: row.source_table,
            source_id: row.source_id,
          },
        },
      ]);
      setSpaceMenuOpen(false);
    },
    [teamId, userId, canEdit, centerPosition, setNodes, showNotice]
  );

  const insertFreeNode = useCallback(
    async (payload: { kind: NodeKind; label: string; notes: string }) => {
      if (!teamId || !canEdit) return;
      const pos = centerPosition();
      const { data, error } = await supabase
        .schema("lab")
        .from("kg_nodes")
        .insert({
          team_id: teamId,
          kind: payload.kind,
          source_table: null,
          source_id: null,
          label: payload.label,
          notes: payload.notes || null,
          x: pos.x,
          y: pos.y,
          created_by: userId,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[KG] insert free node:", error);
        showNotice("No se pudo crear el nodo");
        return;
      }
      const row = data as KGNodeRow;
      setNodes((prev) => [
        ...prev,
        {
          id: row.id,
          type: "kg",
          position: { x: Number(row.x), y: Number(row.y) },
          data: {
            kind: row.kind,
            label: row.label,
            notes: row.notes,
            source_table: row.source_table,
            source_id: row.source_id,
          },
        },
      ]);
      setShowFreeNodeModal(false);
    },
    [teamId, userId, canEdit, centerPosition, setNodes, showNotice]
  );

  // ── Edge connection handling ──
  const onConnect = useCallback((conn: Connection) => {
    if (!canEdit) return;
    if (!conn.source || !conn.target || conn.source === conn.target) return;
    setPendingConnection(conn);
  }, [canEdit]);

  const confirmEdge = useCallback(
    async (relation: Relation, notes: string) => {
      if (!pendingConnection || !pendingConnection.source || !pendingConnection.target) return;
      if (!teamId || !canEdit) return;
      const { data, error } = await supabase
        .schema("lab")
        .from("kg_edges")
        .insert({
          team_id: teamId,
          source_node_id: pendingConnection.source,
          target_node_id: pendingConnection.target,
          relation,
          notes: notes || null,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[KG] insert edge:", error);
        showNotice("No se pudo crear la relación");
        return;
      }
      const row = data as KGEdgeRow;
      setEdges((prev) => [
        ...prev,
        {
          id: row.id,
          source: row.source_node_id,
          target: row.target_node_id,
          type: "editable",
          label: RELATION_LABEL(row.relation),
          data: { relation: row.relation, notes: row.notes },
        },
      ]);
      setPendingConnection(null);
    },
    [pendingConnection, teamId, canEdit, setEdges, showNotice]
  );

  // ── Position persistence ──
  const onNodeDragStop = useCallback(
    async (_evt: unknown, node: RFNode) => {
      if (!canEdit) return;
      const { error } = await supabase
        .schema("lab")
        .from("kg_nodes")
        .update({ x: node.position.x, y: node.position.y })
        .eq("id", node.id);
      if (error) console.error("[KG] persist position:", error);
    },
    [canEdit]
  );

  // ── Save node field changes (label, notes) ──
  const updateNodeField = useCallback(
    async (id: string, patch: Partial<Pick<KGNodeRow, "label" | "notes">>) => {
      if (!canEdit) return;
      const { error } = await supabase
        .schema("lab")
        .from("kg_nodes")
        .update(patch)
        .eq("id", id);
      if (error) {
        console.error("[KG] update node:", error);
        showNotice("No se pudo guardar el cambio");
        return;
      }
      setNodes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } as KGNodeData } : n
        )
      );
    },
    [canEdit, setNodes, showNotice]
  );

  // ── Delete node ──
  const deleteNode = useCallback(
    async (id: string) => {
      if (!canEdit) return;
      const { error } = await supabase
        .schema("lab")
        .from("kg_nodes")
        .delete()
        .eq("id", id);
      if (error) {
        console.error("[KG] delete node:", error);
        showNotice("No se pudo eliminar el nodo");
        return;
      }
      setNodes((prev) => prev.filter((n) => n.id !== id));
      const removedEdgeIds: string[] = [];
      setEdges((prev) => {
        const keep: RFEdge[] = [];
        for (const e of prev) {
          if (e.source === id || e.target === id) removedEdgeIds.push(e.id);
          else keep.push(e);
        }
        return keep;
      });
      if (removedEdgeIds.length) {
        updateEdgeHandlesStore((prev) => {
          const next = { ...prev };
          for (const eid of removedEdgeIds) delete next[eid];
          return next;
        });
        updateEdgeWaypointsStore((prev) => {
          const next = { ...prev };
          for (const eid of removedEdgeIds) delete next[eid];
          return next;
        });
      }
      setSelectedNodeId(null);
    },
    [canEdit, setNodes, setEdges, updateEdgeHandlesStore, updateEdgeWaypointsStore, showNotice]
  );

  // ── Update edge ──
  const updateEdgeField = useCallback(
    async (id: string, patch: Partial<Pick<KGEdgeRow, "relation" | "notes">>) => {
      if (!canEdit) return;
      const { error } = await supabase
        .schema("lab")
        .from("kg_edges")
        .update(patch)
        .eq("id", id);
      if (error) {
        console.error("[KG] update edge:", error);
        showNotice("No se pudo guardar el cambio");
        return;
      }
      setEdges((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e;
          const nextData: KGEdgeData = { ...(e.data as KGEdgeData), ...patch };
          const nextLabel =
            patch.relation !== undefined ? RELATION_LABEL(patch.relation) : e.label;
          return { ...e, data: nextData, label: nextLabel };
        })
      );
    },
    [canEdit, setEdges, showNotice]
  );

  // ── Delete edge ──
  const deleteEdge = useCallback(
    async (id: string) => {
      if (!canEdit) return;
      const { error } = await supabase
        .schema("lab")
        .from("kg_edges")
        .delete()
        .eq("id", id);
      if (error) {
        console.error("[KG] delete edge:", error);
        showNotice("No se pudo eliminar la relación");
        return;
      }
      setEdges((prev) => prev.filter((e) => e.id !== id));
      updateEdgeHandlesStore((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      updateEdgeWaypointsStore((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setSelectedEdgeId(null);
    },
    [canEdit, setEdges, updateEdgeHandlesStore, updateEdgeWaypointsStore, showNotice]
  );

  const handleNodeClick = useCallback((_: unknown, node: RFNode) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);

  const handleEdgeClick = useCallback((_: unknown, edge: RFEdge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setEquipmentMenuOpen(false);
    setSpaceMenuOpen(false);
  }, []);

  const isEmpty = !loading && nodes.length === 0;

  return (
    <div className="ll_kg_canvas">
      {/* Toolbar — admins only */}
      {canEdit && (
      <div className="ll_kg_toolbar">
        <div className="ll_kg_toolGroup">
          <button
            type="button"
            className="ll_kg_btn"
            onClick={() => {
              setEquipmentMenuOpen((v) => !v);
              setSpaceMenuOpen(false);
            }}
            disabled={!teamId}
          >
            <Plus size={13} strokeWidth={2} />
            Equipo
          </button>
          {equipmentMenuOpen && (
            <div className="ll_kg_dropdown">
              {availableEquipment.length === 0 ? (
                <div className="ll_kg_dropdownEmpty">
                  {equipmentList.length === 0
                    ? "No hay equipos registrados"
                    : "Todos los equipos ya están en el grafo"}
                </div>
              ) : (
                availableEquipment.map((eq) => (
                  <button
                    key={eq.id}
                    type="button"
                    className="ll_kg_dropdownItem"
                    onClick={() => insertEquipmentNode(eq)}
                  >
                    <span className="ll_kg_dropdownIcon">
                      {equipmentTypeIcon(eq.type, 13)}
                    </span>
                    {eq.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="ll_kg_toolGroup">
          <button
            type="button"
            className="ll_kg_btn"
            onClick={() => {
              setSpaceMenuOpen((v) => !v);
              setEquipmentMenuOpen(false);
            }}
            disabled={!teamId}
          >
            <Plus size={13} strokeWidth={2} />
            Espacio
          </button>
          {spaceMenuOpen && (
            <div className="ll_kg_dropdown">
              {availableSpaces.length === 0 ? (
                <div className="ll_kg_dropdownEmpty">
                  {spaceList.length === 0
                    ? "No hay espacios registrados"
                    : "Todos los espacios ya están en el grafo"}
                </div>
              ) : (
                availableSpaces.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    className="ll_kg_dropdownItem"
                    onClick={() => insertSpaceNode(sp)}
                  >
                    <span className="ll_kg_dropdownIcon">
                      <MapPin size={13} strokeWidth={1.8} />
                    </span>
                    {sp.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="ll_kg_btn"
          onClick={() => setShowFreeNodeModal(true)}
          disabled={!teamId}
        >
          <Plus size={13} strokeWidth={2} />
          Nodo libre
        </button>
      </div>
      )}

      {!canEdit && teamId && (
        <div className="ll_kg_viewOnly">
          Solo lectura — solo los admins del lab pueden editar el grafo.
        </div>
      )}

      {notice && <div className="ll_kg_notice">{notice}</div>}

      {/* React Flow */}
      <EdgeEditContext.Provider value={editCtxValue}>
        <ReactFlow
          nodes={nodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          edgesReconnectable={canEdit}
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "editable" }}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionMode={ConnectionMode.Loose}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1.5}
            color="rgba(255, 255, 255, 0.18)"
          />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </EdgeEditContext.Provider>

      {/* Empty state overlay */}
      {isEmpty && teamId && (
        <div className="ll_kg_empty">
          {canEdit ? (
            <p>
              Empieza agregando equipos al grafo. Usa el botón <b>+ Equipo</b> para
              añadir equipos registrados, o <b>+ Nodo libre</b> para conceptos y
              procesos.
            </p>
          ) : (
            <p>
              Aún no hay nodos en el grafo. Pídele a un admin del lab que agregue
              equipos, espacios o conceptos.
            </p>
          )}
        </div>
      )}

      {/* Side panel */}
      {selectedNode && (
        <NodeSidePanel
          key={selectedNode.id}
          node={selectedNode}
          canEdit={canEdit}
          onClose={() => setSelectedNodeId(null)}
          onUpdate={updateNodeField}
          onDelete={deleteNode}
        />
      )}
      {selectedEdge && (
        <EdgeSidePanel
          key={selectedEdge.id}
          edge={selectedEdge}
          nodes={nodes}
          canEdit={canEdit}
          onClose={() => setSelectedEdgeId(null)}
          onUpdate={updateEdgeField}
          onDelete={deleteEdge}
        />
      )}

      {/* Free node modal — admins only */}
      {showFreeNodeModal && canEdit && (
        <FreeNodeModal
          onSave={insertFreeNode}
          onClose={() => setShowFreeNodeModal(false)}
        />
      )}

      {/* Pending edge modal — admins only */}
      {pendingConnection && canEdit && (
        <EdgeModal
          onConfirm={confirmEdge}
          onCancel={() => setPendingConnection(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// SIDE PANEL — NODE
// ============================================================================

interface NodeSidePanelProps {
  node: RFNode;
  canEdit: boolean;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Pick<KGNodeRow, "label" | "notes">>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

function NodeSidePanel({ node, canEdit, onClose, onUpdate, onDelete }: NodeSidePanelProps) {
  const isLinked = !!node.data.source_id;
  const [label, setLabel] = useState(node.data.label);
  const [notes, setNotes] = useState(node.data.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setLabel(node.data.label);
    setNotes(node.data.notes ?? "");
    setConfirmDelete(false);
  }, [node.id, node.data.label, node.data.notes]);

  const handleLabelBlur = () => {
    if (!canEdit || isLinked) return;
    const trimmed = label.trim();
    if (!trimmed || trimmed === node.data.label) return;
    onUpdate(node.id, { label: trimmed });
  };

  const handleNotesBlur = () => {
    if (!canEdit) return;
    const current = node.data.notes ?? "";
    if (notes === current) return;
    onUpdate(node.id, { notes: notes || null });
  };

  return (
    <div className="ll_kg_sidePanel">
      <div className="ll_kg_sidePanelHeader">
        <h4 className="ll_kg_sidePanelTitle">Nodo</h4>
        <button type="button" className="ll_kg_sidePanelClose" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="ll_kg_sidePanelBody">
        <div className="ll_kg_field">
          <label className="ll_kg_fieldLabel">Tipo</label>
          <div className="ll_kg_kindBadge">
            <span>{kindIcon(node.data.kind)}</span>
            {KIND_LABEL(node.data.kind)}
          </div>
        </div>

        <div className="ll_kg_field">
          <label className="ll_kg_fieldLabel">Etiqueta</label>
          <input
            className="ll_kg_input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleLabelBlur}
            disabled={isLinked || !canEdit}
          />
          {isLinked && (
            <span className="ll_kg_helper">vinculado a equipos registrados</span>
          )}
        </div>

        <div className="ll_kg_field">
          <label className="ll_kg_fieldLabel">Notas</label>
          <textarea
            className="ll_kg_textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            rows={3}
            placeholder="Detalles, contexto, observaciones…"
            disabled={!canEdit}
          />
        </div>
      </div>

      {canEdit && (
        <div className="ll_kg_sidePanelFooter">
          {!confirmDelete ? (
            <button
              type="button"
              className="ll_kg_btnDanger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={13} />
              Eliminar nodo
            </button>
          ) : (
            <div className="ll_kg_confirmRow">
              <span className="ll_kg_confirmText">¿Eliminar?</span>
              <button
                type="button"
                className="ll_kg_btnGhost"
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="ll_kg_btnDangerSolid"
                onClick={() => onDelete(node.id)}
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SIDE PANEL — EDGE
// ============================================================================

interface EdgeSidePanelProps {
  edge: RFEdge;
  nodes: RFNode[];
  canEdit: boolean;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Pick<KGEdgeRow, "relation" | "notes">>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

function EdgeSidePanel({ edge, nodes, canEdit, onClose, onUpdate, onDelete }: EdgeSidePanelProps) {
  const sourceLabel = nodes.find((n) => n.id === edge.source)?.data.label ?? "—";
  const targetLabel = nodes.find((n) => n.id === edge.target)?.data.label ?? "—";
  const initialRel = (edge.data?.relation ?? "related_to") as Relation;
  const initialNotes = edge.data?.notes ?? "";

  const [notes, setNotes] = useState(initialNotes);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setNotes(edge.data?.notes ?? "");
    setConfirmDelete(false);
  }, [edge.id, edge.data?.notes]);

  const handleRelationChange = (rel: Relation) => {
    if (!canEdit || rel === initialRel) return;
    onUpdate(edge.id, { relation: rel });
  };

  const handleNotesBlur = () => {
    if (!canEdit) return;
    if (notes === (edge.data?.notes ?? "")) return;
    onUpdate(edge.id, { notes: notes || null });
  };

  return (
    <div className="ll_kg_sidePanel">
      <div className="ll_kg_sidePanelHeader">
        <h4 className="ll_kg_sidePanelTitle">Relación</h4>
        <button type="button" className="ll_kg_sidePanelClose" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="ll_kg_sidePanelBody">
        <div className="ll_kg_field">
          <label className="ll_kg_fieldLabel">De</label>
          <div className="ll_kg_readonlyValue">{sourceLabel}</div>
        </div>

        <div className="ll_kg_field">
          <label className="ll_kg_fieldLabel">Relación</label>
          <select
            className="ll_kg_select"
            value={initialRel}
            onChange={(e) => handleRelationChange(e.target.value as Relation)}
            disabled={!canEdit}
          >
            {RELATIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ll_kg_field">
          <label className="ll_kg_fieldLabel">A</label>
          <div className="ll_kg_readonlyValue">{targetLabel}</div>
        </div>

        <div className="ll_kg_field">
          <label className="ll_kg_fieldLabel">Notas</label>
          <textarea
            className="ll_kg_textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            rows={3}
            placeholder="Detalles de la relación…"
            disabled={!canEdit}
          />
        </div>
      </div>

      {canEdit && (
        <div className="ll_kg_sidePanelFooter">
          {!confirmDelete ? (
            <button
              type="button"
              className="ll_kg_btnDanger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={13} />
              Eliminar relación
            </button>
          ) : (
            <div className="ll_kg_confirmRow">
              <span className="ll_kg_confirmText">¿Eliminar?</span>
              <button
                type="button"
                className="ll_kg_btnGhost"
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="ll_kg_btnDangerSolid"
                onClick={() => onDelete(edge.id)}
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FREE NODE MODAL
// ============================================================================

interface FreeNodeModalProps {
  onSave: (payload: { kind: NodeKind; label: string; notes: string }) => void | Promise<void>;
  onClose: () => void;
}

function FreeNodeModal({ onSave, onClose }: FreeNodeModalProps) {
  const [kind, setKind] = useState<NodeKind>("concept");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setSaving(true);
    await onSave({ kind, label: trimmed, notes });
    setSaving(false);
  };

  return (
    <div className="ll_modalOverlay" onClick={onClose}>
      <div className="ll_modal" onClick={(e) => e.stopPropagation()}>
        <div className="ll_modalHeader">
          <h2 className="ll_modalTitle">Nuevo nodo</h2>
          <button type="button" className="ll_modalClose" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="ll_modalContent">
          <div className="ll_formGroup">
            <label className="ll_label">Tipo</label>
            <select
              className="ll_select"
              value={kind}
              onChange={(e) => setKind(e.target.value as NodeKind)}
            >
              <option value="concept">{KIND_LABEL("concept")}</option>
              <option value="process">{KIND_LABEL("process")}</option>
              <option value="material">{KIND_LABEL("material")}</option>
            </select>
          </div>
          <div className="ll_formGroup">
            <label className="ll_label">Etiqueta</label>
            <input
              className="ll_kg_input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="p. ej. Calibración semanal"
              autoFocus
            />
          </div>
          <div className="ll_formGroup">
            <label className="ll_label">Notas</label>
            <textarea
              className="ll_modalTextarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Descripción opcional…"
              rows={4}
            />
          </div>
        </div>
        <div className="ll_modalFooter">
          <button type="button" className="ll_btnSecondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="ll_btnPrimary"
            onClick={handleSave}
            disabled={saving || !label.trim()}
          >
            {saving ? "Guardando…" : "Crear nodo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EDGE MODAL (relation picker)
// ============================================================================

interface EdgeModalProps {
  onConfirm: (relation: Relation, notes: string) => void | Promise<void>;
  onCancel: () => void;
}

function EdgeModal({ onConfirm, onCancel }: EdgeModalProps) {
  const [relation, setRelation] = useState<Relation>("related_to");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onConfirm(relation, notes);
    setSaving(false);
  };

  return (
    <div className="ll_modalOverlay" onClick={onCancel}>
      <div className="ll_modal" onClick={(e) => e.stopPropagation()}>
        <div className="ll_modalHeader">
          <h2 className="ll_modalTitle">Nueva relación</h2>
          <button type="button" className="ll_modalClose" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <div className="ll_modalContent">
          <div className="ll_formGroup">
            <label className="ll_label">Relación</label>
            <select
              className="ll_select"
              value={relation}
              onChange={(e) => setRelation(e.target.value as Relation)}
              autoFocus
            >
              {RELATIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="ll_formGroup">
            <label className="ll_label">Notas</label>
            <textarea
              className="ll_modalTextarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contexto de la relación (opcional)…"
              rows={3}
            />
          </div>
        </div>
        <div className="ll_modalFooter">
          <button type="button" className="ll_btnSecondary" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="ll_btnPrimary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Guardando…" : "Crear relación"}
          </button>
        </div>
      </div>
    </div>
  );
}
