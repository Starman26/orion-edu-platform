// src/pages/LivingLabPage.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Menu,
  Pencil,
  Table2,
  FileUp,
  FileText,
  FolderPlus,
  Trash2,
  X,
  Database,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import KnowledgeGraphSection from "../components/KnowledgeGraphSection";
import "../styles/livinglab.css";

const ROOT_COLLAPSED_CLASS = "cora-sidebar-collapsed";
const LS_KEY = "cora.sidebarCollapsed";

// ============================================================================
// TYPES
// ============================================================================

interface TeamMember {
  fullName: string;
  role: string;
}

interface SelectedTable {
  schema: string;
  tableName: string;
  displayName: string;
}

type PreviewRow = Record<string, unknown>;

interface TablePreviewData {
  rows: PreviewRow[];
  columns: string[];
  totalRows: number;
  loading: boolean;
}

// Available schemas / tables for the Add Tables modal
const AVAILABLE_SCHEMAS: { value: string; label: string }[] = [
  { value: "public", label: "public" },
  { value: "chat", label: "chat" },
  { value: "lab", label: "lab" },
];

// ============================================================================
// CHANGE DESCRIPTION MODAL
// ============================================================================

interface DescriptionModalProps {
  currentDescription: string;
  onSave: (desc: string) => void;
  onClose: () => void;
  saving: boolean;
}

function ChangeDescriptionModal({ currentDescription, onSave, onClose, saving }: DescriptionModalProps) {
  const [text, setText] = useState(currentDescription);

  return (
    <div className="ll_modalOverlay" onClick={onClose}>
      <div className="ll_modal" onClick={(e) => e.stopPropagation()}>
        <div className="ll_modalHeader">
          <h2 className="ll_modalTitle">Change Team Description</h2>
          <button type="button" className="ll_modalClose" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="ll_modalContent">
          <textarea
            className="ll_modalTextarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe your team..."
            rows={5}
          />
        </div>
        <div className="ll_modalFooter">
          <button type="button" className="ll_btnSecondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ll_btnPrimary"
            onClick={() => onSave(text)}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ADD TABLES MODAL
// ============================================================================

interface AddTablesModalProps {
  onAdd: (schema: string, tableName: string) => void;
  onClose: () => void;
  existingTables: string[];
}

function AddTablesModal({ onAdd, onClose, existingTables }: AddTablesModalProps) {
  const [selectedSchema, setSelectedSchema] = useState("public");
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Load tables for selected schema
  useEffect(() => {
    const loadTables = async () => {
      setLoadingTables(true);
      setSelectedTable("");
      setPreviewRows([]);

      try {
        if (selectedSchema === "public") {
          const { data, error } = await supabase.rpc("list_public_tables");
          if (!error && data) {
            setTables((data as { table_name: string }[]).map((t) => t.table_name));
          }
        } else {
          // For other schemas, use known table names
          const knownTables: Record<string, string[]> = {
            chat: ["sessions", "messages"],
            lab: ["stations", "equipment", "equipment_status"],
          };
          setTables(knownTables[selectedSchema] || []);
        }
      } catch (err) {
        console.error("Error loading tables:", err);
      } finally {
        setLoadingTables(false);
      }
    };
    loadTables();
  }, [selectedSchema]);

  // Load preview when table is selected
  useEffect(() => {
    if (!selectedTable) {
      setPreviewRows([]);
      return;
    }

    const loadPreview = async () => {
      setLoadingPreview(true);
      try {
        const query = selectedSchema === "public"
          ? supabase.from(selectedTable).select("*").limit(5)
          : supabase.schema(selectedSchema).from(selectedTable).select("*").limit(5);

        const { data, error } = await query;
        if (!error && data) setPreviewRows(data as PreviewRow[]);
      } catch (err) {
        console.error("Error loading preview:", err);
      } finally {
        setLoadingPreview(false);
      }
    };
    loadPreview();
  }, [selectedSchema, selectedTable]);

  const displayName = selectedSchema === "public"
    ? selectedTable
    : `${selectedSchema}.${selectedTable}`;

  const isAlreadyAdded = existingTables.includes(
    selectedSchema === "public" ? selectedTable : `${selectedSchema}_${selectedTable}`
  );

  return (
    <div className="ll_modalOverlay" onClick={onClose}>
      <div className="ll_modal ll_modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="ll_modalHeader">
          <h2 className="ll_modalTitle">Add Table</h2>
          <button type="button" className="ll_modalClose" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="ll_modalContent">
          <div className="ll_formGroup">
            <label className="ll_label">Schema</label>
            <select
              className="ll_select"
              value={selectedSchema}
              onChange={(e) => setSelectedSchema(e.target.value)}
            >
              {AVAILABLE_SCHEMAS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="ll_formGroup">
            <label className="ll_label">Table</label>
            <select
              className="ll_select"
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              disabled={loadingTables}
            >
              <option value="">{loadingTables ? "Loading tables..." : "Select a table..."}</option>
              {tables.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {selectedTable && (
            <div className="ll_previewSection">
              <label className="ll_label">Preview — {displayName}</label>
              <div className="ll_tablePreviewBox">
                {loadingPreview ? (
                  <p className="ll_muted" style={{ padding: 16 }}>Loading preview...</p>
                ) : previewRows.length === 0 ? (
                  <p className="ll_muted" style={{ padding: 16 }}>No rows found.</p>
                ) : (
                  <table className="ll_miniTable">
                    <thead>
                      <tr>
                        {Object.keys(previewRows[0]).map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, idx) => (
                        <tr key={idx}>
                          {Object.entries(row).map(([col, val]) => (
                            <td key={col}>
                              {val === null || val === undefined ? "—" : String(val).slice(0, 60)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="ll_modalFooter">
          <button type="button" className="ll_btnSecondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="ll_btnPrimary"
            onClick={() => { onAdd(selectedSchema, selectedTable); onClose(); }}
            disabled={!selectedTable || isAlreadyAdded}
          >
            {isAlreadyAdded ? "Already added" : "Add Table"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TABLE PREVIEW CARD (dark card)
// ============================================================================

interface TableCardProps {
  table: SelectedTable;
  preview: TablePreviewData;
  onRemove: () => void;
}

function TableCard({ table, preview, onRemove }: TableCardProps) {
  return (
    <div className="ll_tableCard">
      <div className="ll_tableCardHeader">
        <div className="ll_tableCardTitle">
          <Table2 size={14} />
          <span>{table.displayName}</span>
        </div>
        <button type="button" className="ll_tableCardRemove" onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      </div>

      <div className="ll_tableCardBody">
        {preview.loading ? (
          <div className="ll_tableCardLoading">Loading...</div>
        ) : preview.columns.length === 0 ? (
          <div className="ll_tableCardEmpty">No data</div>
        ) : (
          <div className="ll_tableCardScroll">
            <table className="ll_previewTable">
              <thead>
                <tr>
                  {preview.columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, idx) => (
                  <tr key={idx}>
                    {preview.columns.map((col) => {
                      const val = row[col];
                      return (
                        <td key={col}>
                          {val === null || val === undefined ? "—" : String(val).slice(0, 60)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ll_tableCardFooter">
        <span className="ll_tableCardMeta">
          {preview.totalRows} rows &middot; {preview.columns.length} columns
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export function LivingLabPage() {
  const { user } = useAuth();

  // Sidebar toggle (same pattern as Dashboard)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  });

  // User profile data
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);

  // Team description
  const [teamDescription, setTeamDescription] = useState("");
  const [descLoading, setDescLoading] = useState(true);

  // Team members
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  const [showMembersPopup, setShowMembersPopup] = useState(false);

  // Modals
  const [showDescModal, setShowDescModal] = useState(false);
  const [descSaving, setDescSaving] = useState(false);
  const [showAddTableModal, setShowAddTableModal] = useState(false);

  // Knowledge base tables
  const [selectedTables, setSelectedTables] = useState<SelectedTable[]>([]);
  const [tablePreviews, setTablePreviews] = useState<Record<string, TablePreviewData>>({});

  // Active view tab
  const [activeView, setActiveView] = useState<"kb" | "team">("kb");

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Sidebar toggle ──
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

  // ── Load user profile + team data ──
  useEffect(() => {
    if (!user) return;

    const loadProfile = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, active_team_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!profile) return;

      const parts = (profile.full_name || "").trim().split(/\s+/);
      setUserName(parts[0] || user.email?.split("@")[0] || "User");
      setTeamId(profile.active_team_id);

      if (profile.active_team_id) {
        const { data: membership } = await supabase
          .from("team_memberships")
          .select("role")
          .eq("auth_user_id", user.id)
          .eq("team_id", profile.active_team_id)
          .maybeSingle();

        if (membership?.role) setUserRole(membership.role);
      }
    };
    loadProfile();
  }, [user]);

  // ── Load team description ──
  useEffect(() => {
    if (!teamId) {
      setDescLoading(false);
      return;
    }

    const loadDescription = async () => {
      setDescLoading(true);
      const { data } = await supabase
        .from("teams")
        .select("description")
        .eq("id", teamId)
        .maybeSingle();

      setTeamDescription(data?.description || "");
      setDescLoading(false);
    };
    loadDescription();
  }, [teamId]);

  // ── Load team members ──
  useEffect(() => {
    if (!teamId) {
      setMembersLoading(false);
      return;
    }

    const loadMembers = async () => {
      setMembersLoading(true);

      const { data, error } = await supabase
        .from("team_memberships")
        .select("role, auth_user_id")
        .eq("team_id", teamId);

      if (error || !data || data.length === 0) {
        setMembers([]);
        setMembersLoading(false);
        return;
      }

      const userIds = data.map((m: any) => m.auth_user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("auth_user_id, full_name")
        .in("auth_user_id", userIds);

      const nameMap: Record<string, string> = {};
      for (const p of profiles || []) {
        nameMap[p.auth_user_id] = p.full_name || "";
      }

      const result: TeamMember[] = data.map((m: any) => ({
        fullName: nameMap[m.auth_user_id] || "Unknown",
        role: m.role || "member",
      }));

      setMembers(result);
      setMembersLoading(false);
    };
    loadMembers();
  }, [teamId]);

  // ── Save description ──
  const handleSaveDescription = async (newDesc: string) => {
    if (!teamId) return;
    setDescSaving(true);

    const { error } = await supabase
      .from("teams")
      .update({ description: newDesc })
      .eq("id", teamId);

    if (!error) setTeamDescription(newDesc);
    setDescSaving(false);
    setShowDescModal(false);
  };

  // ── Add table to knowledge base ──
  const handleAddTable = async (schema: string, tableName: string) => {
    const key = schema === "public" ? tableName : `${schema}_${tableName}`;
    const displayName = schema === "public" ? tableName : `${schema}.${tableName}`;

    const newTable: SelectedTable = { schema, tableName, displayName };
    setSelectedTables((prev) => [...prev, newTable]);

    // Load preview data
    setTablePreviews((prev) => ({
      ...prev,
      [key]: { rows: [], columns: [], totalRows: 0, loading: true },
    }));

    try {
      const query = schema === "public"
        ? supabase.from(tableName).select("*").limit(10)
        : supabase.schema(schema).from(tableName).select("*").limit(10);

      const { data, error, count } = await query;

      if (!error && data && data.length > 0) {
        const columns = Object.keys(data[0]);
        setTablePreviews((prev) => ({
          ...prev,
          [key]: {
            rows: data as PreviewRow[],
            columns,
            totalRows: count || data.length,
            loading: false,
          },
        }));
      } else {
        setTablePreviews((prev) => ({
          ...prev,
          [key]: { rows: [], columns: [], totalRows: 0, loading: false },
        }));
      }
    } catch {
      setTablePreviews((prev) => ({
        ...prev,
        [key]: { rows: [], columns: [], totalRows: 0, loading: false },
      }));
    }
  };

  // ── Remove table from knowledge base ──
  const handleRemoveTable = (index: number) => {
    const table = selectedTables[index];
    const key = table.schema === "public" ? table.tableName : `${table.schema}_${table.tableName}`;

    setSelectedTables((prev) => prev.filter((_, i) => i !== index));
    setTablePreviews((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  // ── File upload ──
  const handleFileClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      console.log("Files selected:", Array.from(files).map((f) => f.name));
      // TODO: Upload to Supabase storage
    }
    e.target.value = "";
  };

  // ── Grid class for tables ──
  const gridClass = selectedTables.length <= 1
    ? "ll_tablesGrid ll_tablesGrid--1"
    : selectedTables.length === 2
      ? "ll_tablesGrid ll_tablesGrid--2"
      : "ll_tablesGrid ll_tablesGrid--3";

  const existingTableKeys = selectedTables.map((t) =>
    t.schema === "public" ? t.tableName : `${t.schema}_${t.tableName}`
  );

  return (
    <div className="dash_root">
      {/* Header — same structure as Dashboard */}
      <header className="dash_header">
        <div className="dash_headerLeft">
          <button
            type="button"
            onClick={toggleSidebar}
            className="dash_menuBtn"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Menu size={18} />
          </button>

          <div className="dash_headerDivider" />

          <div className="dash_userInfo">
            <span className="dash_pageName">Living Lab</span>
            <span className="dash_pathSeparator">/</span>
            <span className="dash_userName">{userName || "User"}</span>
            {userRole && (
              <>
                <span className="dash_userSeparator">/</span>
                <span className="dash_userRole">{userRole}</span>
              </>
            )}
          </div>
        </div>

        <div className="dash_headerRight">
          <button type="button" className="dash_headerBtn">Feedback</button>
        </div>
      </header>

      {/* Content */}
      <div className="ll_scrollWrap">
      <div className="ll_content">
        {/* View tabs */}
        <div className="ll_tabs" role="tablist" aria-label="Living Lab views">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "kb"}
            className={`ll_tab ${activeView === "kb" ? "ll_tab--active" : ""}`}
            onClick={() => setActiveView("kb")}
          >
            Knowledge Graph
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "team"}
            className={`ll_tab ${activeView === "team" ? "ll_tab--active" : ""}`}
            onClick={() => setActiveView("team")}
          >
            Info Team
            <span className="ll_tabCount">{members.length}</span>
          </button>
        </div>

        {activeView === "kb" && (
          <>
            {/* Knowledge Graph */}
            <KnowledgeGraphSection
              teamId={teamId}
              userId={user?.id ?? null}
              canEdit={userRole === "admin" || userRole === "owner"}
            />
          </>
        )}

        {activeView === "team" && (
        <>
        {/* Top Row — Team Description + Output Connection */}
        <div className="ll_topRow ll_topRow--noMembers">
          {/* Team Description */}
          <div className="ll_description">
            <h2 className="ll_sectionTitle">Team Description</h2>
            {descLoading ? (
              <>
                <div className="ll_skeleton ll_skeleton--mb8" style={{ width: "100%", height: 14 }} />
                <div className="ll_skeleton ll_skeleton--mb8" style={{ width: "80%", height: 14 }} />
                <div className="ll_skeleton" style={{ width: "60%", height: 14 }} />
              </>
            ) : (
              <p className="ll_descriptionText">
                {teamDescription || "No description set. Click below to add one."}
              </p>
            )}
            <button
              type="button"
              className="ll_btnPrimary"
              onClick={() => setShowDescModal(true)}
              disabled={!teamId}
            >
              <Pencil size={14} />
              Change Description
            </button>
          </div>

          {/* ORION Bridge Install */}
          <div className="ll_outputConnection">
            <h2 className="ll_sectionTitle">ORION Bridge</h2>
            <div className="ll_connectionBox">
              <p className="ll_cardDesc">
                Python package for real-time equipment communication. Install it to connect your lab devices to the platform.
              </p>
              <div className="ll_installSection">
                <span className="ll_installLabel">Install via pip</span>
                <div className="ll_installCmd">
                  <code className="ll_installCode">pip install orion-bridge[all]</code>
                  <button
                    type="button"
                    className="ll_copyBtn"
                    onClick={() => navigator.clipboard.writeText("pip install orion-bridge[all]")}
                    title="Copy to clipboard"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Team Members — full-width row */}
        <div className="ll_membersRow">
          <h2 className="ll_sectionTitle">Team Members</h2>
          {membersLoading ? (
            <div className="ll_membersList ll_membersList--row">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="ll_memberRow ll_memberRow--skeleton">
                  <div className="ll_skeleton" style={{ width: 36, height: 36, borderRadius: "50%" }} />
                  <div className="ll_memberInfo">
                    <div className="ll_skeleton" style={{ width: 80, height: 14 }} />
                    <div className="ll_skeleton" style={{ width: 50, height: 11 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="ll_muted">No members found.</p>
          ) : (
            <div className="ll_membersList ll_membersList--row">
              {members.slice(0, 3).map((member, idx) => (
                <div key={idx} className="ll_memberRow">
                  <div className="ll_memberAvatar">
                    <span>{member.fullName.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="ll_memberInfo">
                    <span className="ll_memberName">{member.fullName}</span>
                    <span className="ll_memberRole">{member.role}</span>
                  </div>
                </div>
              ))}
              {members.length > 3 && (
                <button
                  type="button"
                  className="ll_membersSeeAll"
                  onClick={() => setShowMembersPopup(true)}
                >
                  See all teammates →
                </button>
              )}
            </div>
          )}
        </div>
        </>
        )}

        {activeView === "kb" && (
        <>
        {/* Knowledge Base */}
        <div className="ll_knowledge">
          <h2 className="ll_sectionTitle">Knowledge Base</h2>

          <div className="ll_knowledgeActions">
            <button
              type="button"
              className="ll_actionBtn"
              onClick={() => setShowAddTableModal(true)}
              disabled={!teamId}
            >
              <Table2 size={16} />
              Add Tables
            </button>
            <button
              type="button"
              className="ll_actionBtn"
              onClick={handleFileClick}
              disabled={!teamId}
            >
              <FileUp size={16} />
              Add Files
            </button>
            <button type="button" className="ll_actionBtn" disabled={!teamId}>
              <FileText size={16} />
              Create Text
            </button>
            <button type="button" className="ll_actionBtn" disabled={!teamId}>
              <FolderPlus size={16} />
              Create Folder
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          <div className="ll_knowledgeContent">
            {selectedTables.length === 0 ? (
              <div className="ll_emptyState">
                <div className="ll_emptyIcon">
                  <Database size={48} strokeWidth={1} />
                </div>
                <p className="ll_emptyTitle">No tables added yet</p>
                <p className="ll_emptyText">
                  Add tables from your Supabase database to use as knowledge for the agent.
                </p>
              </div>
            ) : (
              <div className={gridClass}>
                {selectedTables.map((table, idx) => {
                  const key = table.schema === "public"
                    ? table.tableName
                    : `${table.schema}_${table.tableName}`;
                  const preview = tablePreviews[key] || {
                    rows: [],
                    columns: [],
                    totalRows: 0,
                    loading: true,
                  };
                  return (
                    <TableCard
                      key={key}
                      table={table}
                      preview={preview}
                      onRemove={() => handleRemoveTable(idx)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </>
        )}
      </div>
      </div>

      {/* Modals */}
      {showDescModal && (
        <ChangeDescriptionModal
          currentDescription={teamDescription}
          onSave={handleSaveDescription}
          onClose={() => setShowDescModal(false)}
          saving={descSaving}
        />
      )}

      {showAddTableModal && (
        <AddTablesModal
          onAdd={handleAddTable}
          onClose={() => setShowAddTableModal(false)}
          existingTables={existingTableKeys}
        />
      )}

      {showMembersPopup && (
        <div
          className="ll_modalOverlay"
          onClick={() => setShowMembersPopup(false)}>
          <div
            className="ll_modal"
            style={{ maxHeight: "70vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="ll_modalHeader">
              <h2 className="ll_modalTitle">Team Members ({members.length})</h2>
              <button type="button" className="ll_modalClose" onClick={() => setShowMembersPopup(false)}>×</button>
            </div>
            <div className="ll_modalContent" style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {members.map((member, idx) => (
                <div key={idx} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "8px 0", borderBottom: "1px solid rgba(13,13,13,0.08)",
                }}>
                  <div className="ll_memberAvatar">
                    <span>{member.fullName.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="ll_memberInfo">
                    <span className="ll_memberName">{member.fullName}</span>
                    <span className="ll_memberRole">{member.role}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LivingLabPage;
