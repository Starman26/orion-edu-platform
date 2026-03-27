// src/components/EquipmentTab.tsx

import { useState, useEffect, useCallback, useRef, DragEvent } from "react";
import {
  Plus, Box, Cpu, Activity, Move, Eye, Bot,
  FileText, Wrench, Loader2, X, ChevronDown, Search,
  FolderOpen, Folder, ArrowLeft, GripVertical, MoreHorizontal,
  Pencil, Trash2, LayoutGrid, List,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";

// ── Types ──

export interface Space {
  id: number;
  name: string;
  description: string | null;
  location: string | null;
  is_active: boolean;
  equipment_count?: number;
}

export interface EquipmentProfile {
  id: string;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  ip_address: string | null;
  description: string | null;
  connected_robot_id: string | null;
  space_id: number | null;
  manuals: { id: string; title: string; pages_total: number }[];
  created_at: string;
}

export const EQUIPMENT_TYPES = [
  { value: "cobot", label: "Cobot / Robot Arm" },
  { value: "plc", label: "PLC / Controller" },
  { value: "sensor", label: "Sensor" },
  { value: "conveyor", label: "Conveyor / Actuator" },
  { value: "camera", label: "Camera / Vision" },
  { value: "generic", label: "Other Equipment" },
] as const;

// ── Icon helper ──

export const equipmentTypeIcon = (type: string, size = 18) => {
  const props = { size, strokeWidth: 1.5 };
  switch (type) {
    case "cobot":    return <Bot {...props} />;
    case "plc":      return <Cpu {...props} />;
    case "sensor":   return <Activity {...props} />;
    case "conveyor": return <Move {...props} />;
    case "camera":   return <Eye {...props} />;
    default:         return <Box {...props} />;
  }
};

// ── Props ──

interface EquipmentTabProps {
  userId: string;
  teamId: string;
  onStartTroubleshoot: (equipment: EquipmentProfile) => void;
}

export default function EquipmentTab({ userId, teamId, onStartTroubleshoot }: EquipmentTabProps) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [equipment, setEquipment] = useState<EquipmentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation: null = root view, number = inside a space
  const [activeSpaceId, setActiveSpaceId] = useState<number | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateSpaceModal, setShowCreateSpaceModal] = useState(false);
  const [troubleshootPopup, setTroubleshootPopup] = useState<EquipmentProfile | null>(null);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const [editingEquipment, setEditingEquipment] = useState<EquipmentProfile | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");

  // Drag and drop
  const [draggedEquipmentId, setDraggedEquipmentId] = useState<string | null>(null);
  const [dragOverSpaceId, setDragOverSpaceId] = useState<number | null | "unassigned">(null);

  // ── Fetch data ──

  const fetchSpaces = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .schema("lab")
        .from("spaces")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setSpaces(data || []);
    } catch (err) {
      console.error("[Spaces] fetch error:", err);
    }
  }, []);

  const fetchEquipment = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .schema("lab")
        .from("equipment_profiles")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const enriched: EquipmentProfile[] = [];
      for (const item of data || []) {
        const { data: links } = await supabase
          .schema("lab")
          .from("equipment_documents")
          .select("document_id")
          .eq("equipment_id", item.id);

        const docIds = (links || []).map((l: { document_id: string }) => l.document_id);
        let manuals: { id: string; title: string; pages_total: number }[] = [];

        if (docIds.length > 0) {
          const { data: docs } = await supabase
            .from("documents")
            .select("id, title, pages_total")
            .in("id", docIds);
          manuals = (docs || []).map((d: { id: string; title: string; pages_total: number }) => ({
            id: d.id,
            title: d.title,
            pages_total: d.pages_total,
          }));
        }

        enriched.push({ ...item, manuals });
      }

      setEquipment(enriched);
    } catch (err) {
      console.error("[Equipment] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    Promise.all([fetchSpaces(), fetchEquipment()]);
  }, [fetchSpaces, fetchEquipment]);

  // ── Computed ──

  const matchesSearch = (eq: EquipmentProfile) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      eq.name.toLowerCase().includes(q) ||
      (eq.brand?.toLowerCase().includes(q) ?? false) ||
      (eq.model?.toLowerCase().includes(q) ?? false) ||
      eq.type.toLowerCase().includes(q)
    );
  };

  const spacesWithCounts = spaces.map((s) => ({
    ...s,
    equipment_count: equipment.filter((e) => e.space_id === s.id && matchesSearch(e)).length,
  }));

  const filteredSpaces = searchQuery
    ? spacesWithCounts.filter((s) => s.equipment_count > 0 || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : spacesWithCounts;

  const unassignedEquipment = equipment.filter((e) => e.space_id === null && matchesSearch(e));
  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || null;
  const activeSpaceEquipment = activeSpaceId
    ? equipment.filter((e) => e.space_id === activeSpaceId && matchesSearch(e))
    : [];

  // ── Handlers ──

  const handleCreateEquipment = async (form: Record<string, any>) => {
    try {
      const { document_ids, space_id, ...profileFields } = form;
      const { data: inserted, error } = await supabase
        .schema("lab")
        .from("equipment_profiles")
        .insert({
          ...profileFields,
          space_id: space_id || null,
          created_by: userId,
          team_id: teamId,
        })
        .select("id")
        .single();
      if (error) throw error;

      const ids = document_ids as string[] | undefined;
      if (ids && ids.length > 0 && inserted) {
        const links = ids.map((docId: string) => ({
          equipment_id: inserted.id,
          document_id: docId,
        }));
        const { error: linkError } = await supabase
          .schema("lab")
          .from("equipment_documents")
          .insert(links);
        if (linkError) console.error("[Equipment] link error:", linkError);
      }

      setShowCreateModal(false);
      fetchEquipment();
    } catch (err) {
      console.error("[Equipment] create error:", err);
    }
  };

  const handleCreateSpace = async (form: { name: string; description: string; location: string }) => {
    try {
      const { error } = await supabase
        .schema("lab")
        .from("spaces")
        .insert({
          name: form.name,
          description: form.description || null,
          location: form.location || null,
        });
      if (error) throw error;
      setShowCreateSpaceModal(false);
      fetchSpaces();
    } catch (err) {
      console.error("[Spaces] create error:", err);
    }
  };

  const handleUpdateSpace = async (spaceId: number, form: { name: string; description: string; location: string }) => {
    try {
      const { error } = await supabase
        .schema("lab")
        .from("spaces")
        .update({
          name: form.name,
          description: form.description || null,
          location: form.location || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", spaceId);
      if (error) throw error;
      setEditingSpace(null);
      fetchSpaces();
    } catch (err) {
      console.error("[Spaces] update error:", err);
    }
  };

  const handleDeleteSpace = async (spaceId: number) => {
    try {
      // Unassign equipment first (SET NULL from FK), then soft-delete
      const { error } = await supabase
        .schema("lab")
        .from("spaces")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", spaceId);
      if (error) throw error;

      if (activeSpaceId === spaceId) setActiveSpaceId(null);
      fetchSpaces();
      fetchEquipment();
    } catch (err) {
      console.error("[Spaces] delete error:", err);
    }
  };

  const handleMoveEquipment = async (equipmentId: string, newSpaceId: number | null) => {
    try {
      const { error } = await supabase
        .schema("lab")
        .from("equipment_profiles")
        .update({ space_id: newSpaceId, updated_at: new Date().toISOString() })
        .eq("id", equipmentId);
      if (error) throw error;

      // Optimistic update
      setEquipment((prev) =>
        prev.map((e) => (e.id === equipmentId ? { ...e, space_id: newSpaceId } : e))
      );
    } catch (err) {
      console.error("[Equipment] move error:", err);
    }
  };

  const handleDeleteEquipment = async (equipmentId: string) => {
    try {
      // Delete document links first
      await supabase
        .schema("lab")
        .from("equipment_documents")
        .delete()
        .eq("equipment_id", equipmentId);

      // Delete the equipment profile
      const { error } = await supabase
        .schema("lab")
        .from("equipment_profiles")
        .delete()
        .eq("id", equipmentId);
      if (error) throw error;

      fetchEquipment();
    } catch (err) {
      console.error("[Equipment] delete error:", err);
    }
  };

  const handleUpdateEquipment = async (form: Record<string, any>) => {
    if (!editingEquipment) return;
    try {
      const { document_ids, space_id, ...profileFields } = form;

      const { error } = await supabase
        .schema("lab")
        .from("equipment_profiles")
        .update({
          ...profileFields,
          space_id: space_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingEquipment.id);
      if (error) throw error;

      // Recreate document links: delete old, insert new
      await supabase
        .schema("lab")
        .from("equipment_documents")
        .delete()
        .eq("equipment_id", editingEquipment.id);

      const ids = document_ids as string[] | undefined;
      if (ids && ids.length > 0) {
        const links = ids.map((docId: string) => ({
          equipment_id: editingEquipment.id,
          document_id: docId,
        }));
        await supabase
          .schema("lab")
          .from("equipment_documents")
          .insert(links);
      }

      setEditingEquipment(null);
      fetchEquipment();
    } catch (err) {
      console.error("[Equipment] update error:", err);
    }
  };

  // ── Drag & Drop handlers ──

  const onDragStart = (e: DragEvent, equipmentId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", equipmentId);
    setDraggedEquipmentId(equipmentId);
  };

  const onDragEnd = () => {
    setDraggedEquipmentId(null);
    setDragOverSpaceId(null);
  };

  const onDragOverSpace = (e: DragEvent, spaceId: number | "unassigned") => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSpaceId(spaceId);
  };

  const onDragLeaveSpace = () => {
    setDragOverSpaceId(null);
  };

  const onDropOnSpace = (e: DragEvent, spaceId: number | null) => {
    e.preventDefault();
    const equipmentId = e.dataTransfer.getData("text/plain");
    if (equipmentId) {
      handleMoveEquipment(equipmentId, spaceId);
    }
    setDraggedEquipmentId(null);
    setDragOverSpaceId(null);
  };

  // ── Loading ──

  if (loading) {
    return (
      <div className="studio__equipmentLoading">
        <Loader2 size={24} className="animate-spin" />
        <span>Loading equipment...</span>
      </div>
    );
  }

  // ══════════════════════════════════════
  // RENDER: Inside a space (drill-down)
  // ══════════════════════════════════════

  if (activeSpaceId !== null && activeSpace) {
    return (
      <div className="studio__equipmentTab">
        {/* Breadcrumb */}
        <button
          type="button"
          className="studio__spaceBreadcrumb"
          onClick={() => setActiveSpaceId(null)}
        >
          <ArrowLeft size={14} />
          <span>All Spaces</span>
        </button>

        {/* Space header */}
        <div className="studio__equipmentHeader">
          <div className="studio__spaceHeaderInfo">
            <FolderOpen size={20} strokeWidth={1.5} />
            <div>
              <h3 className="studio__equipmentTitle">{activeSpace.name}</h3>
              {activeSpace.description && (
                <p className="studio__spaceDescription">{activeSpace.description}</p>
              )}
            </div>
          </div>
          <div className="studio__spaceHeaderActions">
            <button
              type="button"
              className="studio__equipmentAddBtn"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={14} />
              Add Equipment
            </button>
            <SpaceContextMenu
              onEdit={() => setEditingSpace(activeSpace)}
              onDelete={() => {
                if (confirm(`Delete space "${activeSpace.name}"? Equipment will be unassigned.`)) {
                  handleDeleteSpace(activeSpace.id);
                }
              }}
            />
          </div>
        </div>

        {/* Search + view toggle */}
        <div className="studio__searchRow">
          <div className="studio__searchInput">
            <Search size={16} className="studio__searchIcon" />
            <input
              type="text"
              placeholder="Search equipment..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="studio__viewToggles">
            <button
              type="button"
              className={`studio__viewBtn ${viewMode === "grid" ? "is-active" : ""}`}
              title="Grid view"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              type="button"
              className={`studio__viewBtn ${viewMode === "list" ? "is-active" : ""}`}
              title="List view"
              onClick={() => setViewMode("list")}
            >
              <List size={18} />
            </button>
          </div>
        </div>

        {/* Equipment in this space */}
        {activeSpaceEquipment.length === 0 ? (
          <div className="studio__equipmentEmpty">
            <FolderOpen size={40} strokeWidth={1} style={{ color: "#9ca3af" }} />
            <p className="studio__equipmentEmptyTitle">This space is empty</p>
            <p className="studio__equipmentEmptyDesc">
              Add equipment or drag existing equipment into this space.
            </p>
          </div>
        ) : (
          <div className={viewMode === "list" ? "studio__equipmentList" : "studio__equipmentGrid"}>
            {activeSpaceEquipment.map((eq) => (
              <EquipmentCard
                key={eq.id}
                eq={eq}
                viewMode={viewMode}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                isDragging={draggedEquipmentId === eq.id}
                onInfo={() => setTroubleshootPopup(eq)}
                onEdit={() => setEditingEquipment(eq)}
                onDelete={() => {
                  if (confirm(`Delete "${eq.name}"? This cannot be undone.`)) {
                    handleDeleteEquipment(eq.id);
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* Troubleshoot popup */}
        {troubleshootPopup && (
          <TroubleshootPopup
            equipment={troubleshootPopup}
            onStart={() => {
              setTroubleshootPopup(null);
              onStartTroubleshoot(troubleshootPopup);
            }}
            onClose={() => setTroubleshootPopup(null)}
          />
        )}

        {/* Create equipment modal (pre-filled with this space) */}
        {showCreateModal && (
          <CreateEquipmentModal
            spaces={spaces}
            defaultSpaceId={activeSpaceId}
            onSubmit={handleCreateEquipment}
            onClose={() => setShowCreateModal(false)}
          />
        )}

        {/* Edit equipment modal */}
        {editingEquipment && (
          <CreateEquipmentModal
            mode="edit"
            initialData={editingEquipment}
            spaces={spaces}
            defaultSpaceId={editingEquipment.space_id}
            onSubmit={handleUpdateEquipment}
            onClose={() => setEditingEquipment(null)}
          />
        )}

        {/* Edit space modal */}
        {editingSpace && (
          <SpaceFormModal
            mode="edit"
            initial={editingSpace}
            onSubmit={(form) => handleUpdateSpace(editingSpace.id, form)}
            onClose={() => setEditingSpace(null)}
          />
        )}
      </div>
    );
  }

  // ══════════════════════════════════════
  // RENDER: Root view (spaces + unassigned)
  // ══════════════════════════════════════

  return (
    <div className="studio__equipmentTab">
      {/* Search + actions + view toggle */}
      <div className="studio__searchRow">
        <div className="studio__searchInput">
          <Search size={16} className="studio__searchIcon" />
          <input
            type="text"
            placeholder="Search equipment..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="studio__spaceAddBtn"
          onClick={() => setShowCreateSpaceModal(true)}
        >
          <FolderOpen size={14} />
          Create Space
        </button>
        <button
          type="button"
          className="studio__equipmentAddBtn"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={14} />
          Add Equipment
        </button>
        <div className="studio__viewToggles">
          <button
            type="button"
            className={`studio__viewBtn ${viewMode === "grid" ? "is-active" : ""}`}
            title="Grid view"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            type="button"
            className={`studio__viewBtn ${viewMode === "list" ? "is-active" : ""}`}
            title="List view"
            onClick={() => setViewMode("list")}
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {/* Empty state: no spaces AND no equipment */}
      {spaces.length === 0 && equipment.length === 0 && (
        <div className="studio__equipmentEmpty">
          <Box size={40} strokeWidth={1} style={{ color: "#9ca3af" }} />
          <p className="studio__equipmentEmptyTitle">No equipment profiles yet</p>
          <p className="studio__equipmentEmptyDesc">
            Create a space to organize your equipment, or add equipment directly.
          </p>
          <div className="studio__spaceHeaderActions">
            <button
              type="button"
              className="studio__spaceAddBtn"
              onClick={() => setShowCreateSpaceModal(true)}
            >
              <FolderOpen size={14} />
              Create Space
            </button>
            <button
              type="button"
              className="studio__equipmentAddBtn"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={14} />
              Add your first equipment
            </button>
          </div>
        </div>
      )}

      {/* Spaces grid (folders) */}
      {filteredSpaces.length > 0 && (
        <div className="studio__spacesSection">
          <h4 className="studio__sectionLabel">Spaces</h4>
          <div className="studio__spacesGrid">
            {filteredSpaces.map((space) => (
              <div
                key={space.id}
                className={`studio__spaceCard ${
                  dragOverSpaceId === space.id ? "studio__spaceCard--dragOver" : ""
                }`}
                onClick={() => setActiveSpaceId(space.id)}
                onDragOver={(e) => onDragOverSpace(e, space.id)}
                onDragLeave={onDragLeaveSpace}
                onDrop={(e) => onDropOnSpace(e, space.id)}
              >
                <div className="studio__spaceCardIcon">
                  <Folder size={24} strokeWidth={1.5} />
                </div>
                <div className="studio__spaceCardInfo">
                  <span className="studio__spaceCardName">{space.name}</span>
                  <span className="studio__spaceCardMeta">
                    {space.equipment_count} {space.equipment_count === 1 ? "item" : "items"}
                    {space.location ? ` · ${space.location}` : ""}
                  </span>
                </div>
                <div className="studio__spaceCardActions" onClick={(e) => e.stopPropagation()}>
                  <SpaceContextMenu
                    onEdit={() => setEditingSpace(space)}
                    onDelete={() => {
                      if (confirm(`Delete space "${space.name}"? Equipment will be unassigned.`)) {
                        handleDeleteSpace(space.id);
                      }
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unassigned equipment */}
      {unassignedEquipment.length > 0 && (
        <div
          className={`studio__unassignedSection ${
            dragOverSpaceId === "unassigned" ? "studio__unassignedSection--dragOver" : ""
          }`}
          onDragOver={(e) => onDragOverSpace(e, "unassigned")}
          onDragLeave={onDragLeaveSpace}
          onDrop={(e) => onDropOnSpace(e, null)}
        >
          <h4 className="studio__sectionLabel">
            Unassigned Equipment
            <span className="studio__sectionCount">{unassignedEquipment.length}</span>
          </h4>
          <div className={viewMode === "list" ? "studio__equipmentList" : "studio__equipmentGrid"}>
            {unassignedEquipment.map((eq) => (
              <EquipmentCard
                key={eq.id}
                eq={eq}
                viewMode={viewMode}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                isDragging={draggedEquipmentId === eq.id}
                onInfo={() => setTroubleshootPopup(eq)}
                onEdit={() => setEditingEquipment(eq)}
                onDelete={() => {
                  if (confirm(`Delete "${eq.name}"? This cannot be undone.`)) {
                    handleDeleteEquipment(eq.id);
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Equipment inside spaces (shown as cards in root too, for drag source) */}
      {filteredSpaces.some((s) => s.equipment_count! > 0) &&
        unassignedEquipment.length === 0 &&
        equipment.length > 0 && (
          <p className="studio__equipmentHint">
            Click a space to see its equipment, or drag items between spaces.
          </p>
        )}

      {/* Troubleshoot popup */}
      {troubleshootPopup && (
        <TroubleshootPopup
          equipment={troubleshootPopup}
          onStart={() => {
            setTroubleshootPopup(null);
            onStartTroubleshoot(troubleshootPopup);
          }}
          onClose={() => setTroubleshootPopup(null)}
        />
      )}

      {/* Create equipment modal */}
      {showCreateModal && (
        <CreateEquipmentModal
          spaces={spaces}
          defaultSpaceId={activeSpaceId}
          onSubmit={handleCreateEquipment}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Create space modal */}
      {showCreateSpaceModal && (
        <SpaceFormModal
          mode="create"
          onSubmit={handleCreateSpace}
          onClose={() => setShowCreateSpaceModal(false)}
        />
      )}

      {/* Edit space modal */}
      {editingSpace && (
        <SpaceFormModal
          mode="edit"
          initial={editingSpace}
          onSubmit={(form) => handleUpdateSpace(editingSpace.id, form)}
          onClose={() => setEditingSpace(null)}
        />
      )}

      {/* Edit equipment modal */}
      {editingEquipment && (
        <CreateEquipmentModal
          mode="edit"
          initialData={editingEquipment}
          spaces={spaces}
          defaultSpaceId={editingEquipment.space_id}
          onSubmit={handleUpdateEquipment}
          onClose={() => setEditingEquipment(null)}
        />
      )}
    </div>
  );
}


// ═══════════════════════════════════
// Equipment Card (draggable)
// ═══════════════════════════════════

function EquipmentCard({
  eq,
  viewMode = "grid",
  onDragStart,
  onDragEnd,
  isDragging,
  onInfo,
  onEdit,
  onDelete,
}: {
  eq: EquipmentProfile;
  viewMode?: "grid" | "list";
  onDragStart: (e: DragEvent, id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  onInfo: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cardClass = viewMode === "list"
    ? `studio__equipmentListItem ${isDragging ? "studio__equipmentListItem--dragging" : ""}`
    : `studio__equipmentCard ${isDragging ? "studio__equipmentCard--dragging" : ""}`;

  return (
    <div
      className={cardClass}
      draggable
      onDragStart={(e: any) => onDragStart(e, eq.id)}
      onDragEnd={onDragEnd}
    >
      <div className="studio__equipmentCardDragHandle">
        <GripVertical size={14} strokeWidth={1.5} />
      </div>
      <div className="studio__equipmentCardIcon">
        {equipmentTypeIcon(eq.type)}
      </div>
      <div className="studio__equipmentCardInfo">
        <span className="studio__equipmentCardName">{eq.name}</span>
        <span className="studio__equipmentCardMeta">
          {[eq.brand, eq.model].filter(Boolean).join(" ") || eq.type}
        </span>
      </div>
      <div className="studio__equipmentCardBadges">
        {eq.connected_robot_id && (
          <span className="studio__equipmentBadge studio__equipmentBadge--connected">
            Connected
          </span>
        )}
        {eq.manuals.length > 0 && (
          <span className="studio__equipmentBadge studio__equipmentBadge--docs">
            <FileText size={10} />
            {eq.manuals.length} {eq.manuals.length === 1 ? "manual" : "manuals"}
          </span>
        )}
      </div>
      <EquipmentContextMenu
        onEdit={onEdit}
        onDelete={onDelete}
        onTroubleshoot={onInfo}
      />
    </div>
  );
}


// ═══════════════════════════════════
// Troubleshoot Popup
// ═══════════════════════════════════

function TroubleshootPopup({
  equipment,
  onStart,
  onClose,
}: {
  equipment: EquipmentProfile;
  onStart: () => void;
  onClose: () => void;
}) {
  return (
    <div className="studio__equipmentPopupOverlay" onClick={onClose}>
      <div className="studio__equipmentPopupCard" onClick={(e) => e.stopPropagation()}>
        <div className="studio__equipmentPopupIcon">
          {equipmentTypeIcon(equipment.type, 28)}
        </div>
        <h4 className="studio__equipmentPopupTitle">
          Having troubles with {equipment.name}?
        </h4>
        <p className="studio__equipmentPopupDesc">
          The AI agent will diagnose the issue step by step
          {equipment.manuals.length > 0
            ? `, using manuals: ${equipment.manuals.map((m) => m.title).join(", ")} as reference.`
            : ". Link a manual for better diagnostics."}
        </p>
        <div className="studio__equipmentPopupActions">
          <button type="button" className="studio__equipmentPopupPrimary" onClick={onStart}>
            <Wrench size={14} />
            Do Troubleshooting
          </button>
          <button type="button" className="studio__equipmentPopupSecondary" onClick={onClose}>
            No, thanks
          </button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════
// Space Context Menu (edit/delete)
// ═══════════════════════════════════

function SpaceContextMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="studio__contextMenu" ref={ref}>
      <button
        type="button"
        className="studio__contextMenuTrigger"
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="studio__contextMenuDropdown">
          <button
            type="button"
            className="studio__contextMenuItem"
            onClick={() => { setOpen(false); onEdit(); }}
          >
            <Pencil size={13} /> Edit Space
          </button>
          <button
            type="button"
            className="studio__contextMenuItem studio__contextMenuItem--danger"
            onClick={() => { setOpen(false); onDelete(); }}
          >
            <Trash2 size={13} /> Delete Space
          </button>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════
// Equipment Context Menu (edit/delete/troubleshoot)
// ═══════════════════════════════════

function EquipmentContextMenu({
  onEdit,
  onDelete,
  onTroubleshoot,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onTroubleshoot: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="studio__contextMenu" ref={ref}>
      <button
        type="button"
        className="studio__contextMenuTrigger"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="studio__contextMenuDropdown">
          <button
            type="button"
            className="studio__contextMenuItem"
            onClick={() => { setOpen(false); onTroubleshoot(); }}
          >
            <Wrench size={13} /> Troubleshoot
          </button>
          <button
            type="button"
            className="studio__contextMenuItem"
            onClick={() => { setOpen(false); onEdit(); }}
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            type="button"
            className="studio__contextMenuItem studio__contextMenuItem--danger"
            onClick={() => { setOpen(false); onDelete(); }}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════
// Space Form Modal (create / edit)
// ═══════════════════════════════════

function SpaceFormModal({
  mode,
  initial,
  onSubmit,
  onClose,
}: {
  mode: "create" | "edit";
  initial?: Space;
  onSubmit: (form: { name: string; description: string; location: string }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    description: initial?.description || "",
    location: initial?.location || "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    await onSubmit(form);
    setSubmitting(false);
  };

  return (
    <div className="studio__modalOverlay" onClick={onClose}>
      <div className="studio__modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="studio__modalHeader">
          <h2>{mode === "create" ? "Create Space" : "Edit Space"}</h2>
          <button type="button" className="studio__modalClose" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="studio__modalBody">
          <div className="studio__modalField">
            <label>Name *</label>
            <input
              type="text"
              placeholder="e.g. LAB PLCs, Workcell A, Inspection Bay"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>
          <div className="studio__modalField">
            <label>Location</label>
            <input
              type="text"
              placeholder="e.g. Building 3, Room 201"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div className="studio__modalField">
            <label>Description</label>
            <textarea
              placeholder="What equipment lives in this space?"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>

        <div className="studio__modalFooter">
          <button type="button" className="studio__modalCancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="studio__modalSubmit"
            onClick={handleSubmit}
            disabled={!form.name.trim() || submitting}
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : mode === "create" ? (
              <FolderOpen size={14} />
            ) : (
              <Pencil size={14} />
            )}
            {mode === "create" ? "Create Space" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════
// Custom Select Dropdown
// ═══════════════════════════════════

interface CustomSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
}: {
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="studio__customSelect" ref={ref}>
      <button
        type="button"
        className={`studio__customSelectBtn ${open ? "is-open" : ""}`}
        onClick={() => setOpen(!open)}
      >
        <span className="studio__customSelectValue">
          {selected?.icon && <span className="studio__customSelectIcon">{selected.icon}</span>}
          <span className="studio__customSelectLabel">
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown size={14} className={`studio__customSelectChevron ${open ? "is-open" : ""}`} />
      </button>

      {open && (
        <div className="studio__customSelectDropdown">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`studio__customSelectOption ${opt.value === value ? "is-selected" : ""}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.icon && <span className="studio__customSelectIcon">{opt.icon}</span>}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════
// Multi-Select Checkbox Dropdown
// ═══════════════════════════════════

interface MultiSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

function MultiSelectCheckbox({
  options,
  values,
  onChange,
  placeholder = "Select...",
}: {
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const toggle = (val: string) => {
    if (values.includes(val)) {
      onChange(values.filter((v) => v !== val));
    } else {
      onChange([...values, val]);
    }
  };

  const selectedLabels = options
    .filter((o) => values.includes(o.value))
    .map((o) => o.label);

  return (
    <div className="studio__customSelect" ref={ref}>
      <button
        type="button"
        className={`studio__customSelectBtn ${open ? "is-open" : ""}`}
        onClick={() => setOpen(!open)}
      >
        <span className="studio__customSelectValue">
          <span className="studio__customSelectLabel">
            {selectedLabels.length > 0
              ? `${selectedLabels.length} manual${selectedLabels.length > 1 ? "s" : ""} selected`
              : placeholder}
          </span>
        </span>
        <ChevronDown size={14} className={`studio__customSelectChevron ${open ? "is-open" : ""}`} />
      </button>

      {open && (
        <div className="studio__customSelectDropdown">
          {options.length === 0 && (
            <div className="studio__multiSelectEmpty">No manuals available</div>
          )}
          {options.map((opt) => (
            <label
              key={opt.value}
              className={`studio__multiSelectRow ${values.includes(opt.value) ? "is-checked" : ""}`}
            >
              <input
                type="checkbox"
                checked={values.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="studio__multiSelectCheckbox"
              />
              {opt.icon && <span className="studio__customSelectIcon">{opt.icon}</span>}
              <span className="studio__multiSelectLabel">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════
// Create Equipment Modal
// (now with optional Space dropdown)
// ═══════════════════════════════════

function CreateEquipmentModal({
  spaces,
  defaultSpaceId,
  onSubmit,
  onClose,
  mode = "create",
  initialData,
}: {
  spaces: Space[];
  defaultSpaceId: number | null;
  onSubmit: (form: Record<string, any>) => void;
  onClose: () => void;
  mode?: "create" | "edit";
  initialData?: EquipmentProfile;
}) {
  const [form, setForm] = useState({
    name: initialData?.name || "",
    type: initialData?.type || "generic",
    brand: initialData?.brand || "",
    model: initialData?.model || "",
    ip_address: initialData?.ip_address || "",
    description: initialData?.description || "",
    connected_robot_id: initialData?.connected_robot_id || "",
    document_ids: initialData?.manuals?.map((m) => m.id) || ([] as string[]),
    space_id: (initialData?.space_id ?? defaultSpaceId) ? String(initialData?.space_id ?? defaultSpaceId) : "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [manuals, setManuals] = useState<{ id: string; title: string; pages_total: number }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("documents")
          .select("id, title, pages_total")
          .eq("doc_type", "manual")
          .eq("status", "ready")
          .order("created_at", { ascending: false });
        setManuals(data || []);
      } catch (err) {
        console.error("[Equipment] manuals error:", err);
      }
    })();
  }, []);

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    const payload: Record<string, any> = { name: form.name, type: form.type };
    if (form.brand) payload.brand = form.brand;
    if (form.model) payload.model = form.model;
    if (form.ip_address) payload.ip_address = form.ip_address;
    if (form.description) payload.description = form.description;
    if (form.connected_robot_id) payload.connected_robot_id = form.connected_robot_id;
    if (form.document_ids.length > 0) payload.document_ids = form.document_ids;
    if (form.space_id) payload.space_id = parseInt(form.space_id, 10);
    await onSubmit(payload);
    setSubmitting(false);
  };

  const spaceOptions: CustomSelectOption[] = [
    { value: "", label: "No space (unassigned)" },
    ...spaces.map((s) => ({
      value: String(s.id),
      label: s.name,
      icon: <Folder size={14} strokeWidth={1.5} />,
    })),
  ];

  return (
    <div className="studio__modalOverlay" onClick={onClose}>
      <div className="studio__modalCard studio__modalCard--wide" onClick={(e) => e.stopPropagation()}>
        <div className="studio__modalHeader">
          <h2>{mode === "edit" ? "Edit Equipment" : "Add Equipment"}</h2>
          <button type="button" className="studio__modalClose" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="studio__modalBody">
          <div className="studio__modalField">
            <label>Name *</label>
            <input
              type="text"
              placeholder="e.g. xArm6 Lab Principal"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>

          <div className="studio__modalFormRow">
            <div className="studio__modalField">
              <label>Type</label>
              <CustomSelect
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v })}
                options={EQUIPMENT_TYPES.map((t) => ({
                  value: t.value,
                  label: t.label,
                  icon: equipmentTypeIcon(t.value, 14),
                }))}
              />
            </div>
            <div className="studio__modalField">
              <label>Space</label>
              <CustomSelect
                value={form.space_id}
                onChange={(v) => setForm({ ...form, space_id: v })}
                options={spaceOptions}
                placeholder="No space (unassigned)"
              />
            </div>
          </div>

          <div className="studio__modalField">
            <label>Manuals (for AI troubleshooting)</label>
            <MultiSelectCheckbox
              values={form.document_ids}
              onChange={(ids) => setForm({ ...form, document_ids: ids })}
              placeholder="No manuals selected"
              options={manuals.map((m) => ({
                value: m.id,
                label: `${m.title} (${m.pages_total} pages)`,
                icon: <FileText size={14} strokeWidth={1.5} />,
              }))}
            />
          </div>

          <div className="studio__modalFormRow">
            <div className="studio__modalField">
              <label>Brand</label>
              <input type="text" placeholder="e.g. UFactory"
                value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div className="studio__modalField">
              <label>Model</label>
              <input type="text" placeholder="e.g. xArm6"
                value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
          </div>

          {form.type === "cobot" ? (
            <div className="studio__modalFormRow">
              <div className="studio__modalField">
                <label>IP Address</label>
                <input type="text" placeholder="e.g. 192.168.1.100"
                  value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} />
              </div>
              <div className="studio__modalField">
                <label>Connected Robot ID</label>
                <input type="text" placeholder="e.g. xarm-200 (from bridge)"
                  value={form.connected_robot_id} onChange={(e) => setForm({ ...form, connected_robot_id: e.target.value })} />
              </div>
            </div>
          ) : (
            <div className="studio__modalField">
              <label>IP Address</label>
              <input type="text" placeholder="e.g. 192.168.1.100"
                value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} />
            </div>
          )}

          <div className="studio__modalField">
            <label>Description</label>
            <textarea placeholder="Notes about this equipment..." rows={3}
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>

        <div className="studio__modalFooter">
          <button type="button" className="studio__modalCancel" onClick={onClose}>Cancel</button>
          <button type="button" className="studio__modalSubmit"
            onClick={handleSubmit} disabled={!form.name.trim() || submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : mode === "edit" ? <Pencil size={14} /> : <Plus size={14} />}
            {mode === "edit" ? "Save Changes" : "Add Equipment"}
          </button>
        </div>
      </div>
    </div>
  );
}