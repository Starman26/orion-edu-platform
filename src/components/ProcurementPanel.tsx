// src/components/ProcurementPanel.tsx
import { useState, useEffect, useRef } from "react";
import { Plus, X, ExternalLink, Trash2, Pencil, Search, ChevronRight, Filter, Settings, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { OrionSelect } from "./OrionSelect";
import "../styles/procurement.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type RFQStatus     = "pending" | "in_review" | "approved" | "rejected";
type Priority      = "high" | "medium" | "low";
type Currency      = "MXN" | "USD";
type DeliveryStatus = "pending_shipment" | "shipped" | "delivered";
type TabView       = "quotes" | "approvals" | "deliveries" | "bom";

interface Quote {
  id: string;
  rfqNumber: string;
  supplier: string;
  description: string;
  items: number;
  total: number;
  currency: Currency;
  status: RFQStatus;
  date: string;
  priority: Priority;
  link: string;
  deliveryStatus: DeliveryStatus;
}

interface BomItem {
  id: string;
  partNumber: string;
  name: string;
  qty: number;
  unit: string;
  unitCost: number;
  currency: Currency;
  supplier: string;
  link: string;
  category: string;
}

export interface ProcurementPanelProps {
  sessionId: string;
  teamId: string;
  userId: string;
  userName: string;
  onExpandSidebar?: () => void;
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<RFQStatus, { label: string; dot: string; cls: string }> = {
  pending:   { label: "Pendiente",   dot: "rgba(16,17,19,0.25)", cls: "prc_badge--pending"   },
  in_review: { label: "En Revisión", dot: "rgba(16,17,19,0.45)", cls: "prc_badge--in_review" },
  approved:  { label: "Aprobado",    dot: "rgba(16,17,19,0.75)", cls: "prc_badge--approved"  },
  rejected:  { label: "Rechazado",   dot: "rgba(16,17,19,0.20)", cls: "prc_badge--rejected"  },
};

const PRIORITY_CFG: Record<Priority, { label: string; cls: string }> = {
  high:   { label: "Alta",  cls: "prc_badge--high"   },
  medium: { label: "Media", cls: "prc_badge--medium"  },
  low:    { label: "Baja",  cls: "prc_badge--low"     },
};

const DELIVERY_CFG: Record<DeliveryStatus, { label: string; dot: string; cls: string }> = {
  pending_shipment: { label: "Pendiente de envío", dot: "rgba(217,119,6,0.55)",  cls: "prc_badge--pending"   },
  shipped:          { label: "Enviado",            dot: "rgba(124,58,237,0.55)", cls: "prc_badge--in_review" },
  delivered:        { label: "Entregado",          dot: "rgba(5,150,105,0.65)",  cls: "prc_badge--approved"  },
};

const STATUS_DOT_COLORFUL: Record<RFQStatus, string> = {
  pending:   "#d97706",
  in_review: "#7C3AED",
  approved:  "#059669",
  rejected:  "#dc2626",
};

const UNITS = ["pza", "kg", "kit", "lic", "m", "l"];
const STATUS_ORDER: RFQStatus[] = ["pending", "in_review", "approved", "rejected"];
const DELIVERY_ORDER: DeliveryStatus[] = ["pending_shipment", "shipped", "delivered"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, c: Currency) {
  return new Intl.NumberFormat(c === "MXN" ? "es-MX" : "en-US", {
    style: "currency", currency: c, minimumFractionDigits: 0,
  }).format(n);
}

function rowToQuote(r: Record<string, unknown>): Quote {
  return {
    id:             r.id as string,
    rfqNumber:      r.rfq_number as string,
    supplier:       r.supplier as string,
    description:    r.description as string,
    items:          r.items as number,
    total:          Number(r.total),
    currency:       r.currency as Currency,
    status:         r.status as RFQStatus,
    date:           r.date as string,
    priority:       r.priority as Priority,
    link:           (r.link as string) ?? "",
    deliveryStatus: (r.delivery_status as DeliveryStatus) ?? "pending_shipment",
  };
}

function rowToBom(r: Record<string, unknown>): BomItem {
  return {
    id:         r.id as string,
    partNumber: r.part_number as string,
    name:       r.name as string,
    qty:        Number(r.qty),
    unit:       r.unit as string,
    unitCost:   Number(r.unit_cost),
    currency:   r.currency as Currency,
    supplier:   r.supplier as string,
    link:       (r.link as string) ?? "",
    category:   r.category as string,
  };
}

// ── Form defaults ─────────────────────────────────────────────────────────────

const blankQuote = () => ({
  supplier: "", description: "", items: "", total: "",
  currency: "MXN" as Currency, priority: "medium" as Priority, link: "",
});

const blankBom = () => ({
  partNumber: "", name: "", qty: "", unit: "pza",
  unitCost: "", currency: "MXN" as Currency, supplier: "", link: "", category: "",
});

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProcurementPanel({ sessionId, teamId, userId, onExpandSidebar }: ProcurementPanelProps) {
  const [loading, setLoading]            = useState(true);
  const [tab, setTab]                    = useState<TabView>("quotes");
  const [search, setSearch]              = useState("");
  const [statusFilter, setStatusFilter]  = useState<RFQStatus | "all">("all");
  const [quotes, setQuotes]              = useState<Quote[]>([]);
  const [bom, setBom]                    = useState<BomItem[]>([]);
  const [isAdmin, setIsAdmin]            = useState(false);

  // Quote modal
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteForm, setQuoteForm]           = useState(blankQuote());

  // Filter dropdown
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Theme switcher
  type PrcTheme = "default" | "colorful";
  const [prcTheme, setPrcTheme] = useState<PrcTheme>(
    () => (localStorage.getItem("prc-theme") as PrcTheme | null) ?? "default",
  );
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // BOM modal
  const [showBomModal, setShowBomModal] = useState(false);
  const [bomForm, setBomForm]           = useState(blankBom());
  const [editBomId, setEditBomId]       = useState<string | null>(null);

  // ── Close filter on outside click ────────────────────────────────────────
  useEffect(() => {
    if (!showFilterMenu) return;
    const handler = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilterMenu]);

  // ── Close theme menu on outside click ────────────────────────────────────
  useEffect(() => {
    if (!showThemeMenu) return;
    const handler = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setShowThemeMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showThemeMenu]);

  const handleSetTheme = (t: PrcTheme) => {
    setPrcTheme(t);
    localStorage.setItem("prc-theme", t);
    setShowThemeMenu(false);
  };

  // ── Load from Supabase ────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [quotesRes, bomRes] = await Promise.all([
        supabase.schema("chat").from("prc_quotes").select("*").eq("session_id", sessionId).order("created_at"),
        supabase.schema("chat").from("prc_bom").select("*").eq("session_id", sessionId).order("created_at"),
      ]);
      if (cancelled) return;
      if (quotesRes.data) setQuotes(quotesRes.data.map(rowToQuote));
      if (bomRes.data)    setBom(bomRes.data.map(rowToBom));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // ── Role: is current user admin/owner of this team ───────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!teamId || !userId) { setIsAdmin(false); return; }
    (async () => {
      const { data } = await supabase
        .from("team_memberships")
        .select("role")
        .eq("team_id", teamId)
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      const role = data?.role as string | undefined;
      setIsAdmin(role === "admin" || role === "owner");
    })();
    return () => { cancelled = true; };
  }, [teamId, userId]);

  // ── Quote handlers ────────────────────────────────────────────────────────

  const handleAddQuote = async () => {
    if (!quoteForm.supplier.trim() || !quoteForm.description.trim()) return;
    const rfqNumber = `RFQ-${new Date().getFullYear()}-${String(quotes.length + 1).padStart(3, "0")}`;
    const payload = {
      session_id:  sessionId,
      rfq_number:  rfqNumber,
      supplier:    quoteForm.supplier.trim(),
      description: quoteForm.description.trim(),
      items:       Number(quoteForm.items) || 0,
      total:       Number(quoteForm.total) || 0,
      currency:    quoteForm.currency,
      priority:    quoteForm.priority,
      link:        quoteForm.link.trim(),
      status:      "pending" as RFQStatus,
      date:        new Date().toISOString().slice(0, 10),
    };
    const { data, error } = await supabase.schema("chat").from("prc_quotes").insert(payload).select().single();
    if (error) { console.error("[PRC] Insert quote:", error); return; }
    setQuotes((prev) => [...prev, rowToQuote(data)]);
    setQuoteForm(blankQuote());
    setShowQuoteModal(false);
  };

  const handleUpdateStatus = async (id: string, status: RFQStatus) => {
    const { error } = await supabase.schema("chat").from("prc_quotes").update({ status }).eq("id", id);
    if (error) { console.error("[PRC] Update status:", error); return; }
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)));

    if (status === "approved") {
      const quote = quotes.find((q) => q.id === id);
      if (!quote) return;

      // Avoid duplicates if the quote was already added to BOM
      const { data: existing } = await supabase
        .schema("chat").from("prc_bom")
        .select("id")
        .eq("session_id", sessionId)
        .eq("source_quote_id", id)
        .maybeSingle();

      if (!existing) {
        const { data: newRow, error: bomErr } = await supabase
          .schema("chat").from("prc_bom")
          .insert({
            session_id:      sessionId,
            part_number:     quote.rfqNumber,
            name:            quote.description,
            qty:             1,
            unit:            "pza",
            unit_cost:       quote.total,
            currency:        quote.currency,
            supplier:        quote.supplier,
            link:            quote.link,
            category:        "Cotización Aprobada",
            source_quote_id: id,
          })
          .select()
          .single();
        if (bomErr) { console.error("[PRC] Auto BOM insert:", bomErr); return; }
        setBom((prev) => [...prev, rowToBom(newRow)]);
      }
    }
  };

  const handleUpdateDelivery = async (id: string, delivery_status: DeliveryStatus) => {
    const { error } = await supabase.schema("chat").from("prc_quotes").update({ delivery_status }).eq("id", id);
    if (error) { console.error("[PRC] Update delivery status:", error); return; }
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, deliveryStatus: delivery_status } : q)));
  };

  // ── BOM handlers ──────────────────────────────────────────────────────────

  const handleSaveBom = async () => {
    if (!bomForm.partNumber.trim() || !bomForm.name.trim()) return;
    const payload = {
      session_id:  sessionId,
      part_number: bomForm.partNumber.trim(),
      name:        bomForm.name.trim(),
      qty:         Number(bomForm.qty) || 0,
      unit:        bomForm.unit,
      unit_cost:   Number(bomForm.unitCost) || 0,
      currency:    bomForm.currency,
      supplier:    bomForm.supplier.trim(),
      link:        bomForm.link.trim(),
      category:    bomForm.category.trim(),
    };
    if (editBomId) {
      const { data, error } = await supabase.schema("chat").from("prc_bom").update(payload).eq("id", editBomId).select().single();
      if (error) { console.error("[PRC] Update BOM:", error); return; }
      setBom((prev) => prev.map((b) => (b.id === editBomId ? rowToBom(data) : b)));
    } else {
      const { data, error } = await supabase.schema("chat").from("prc_bom").insert(payload).select().single();
      if (error) { console.error("[PRC] Insert BOM:", error); return; }
      setBom((prev) => [...prev, rowToBom(data)]);
    }
    setBomForm(blankBom());
    setEditBomId(null);
    setShowBomModal(false);
  };

  const handleEditBom = (item: BomItem) => {
    setEditBomId(item.id);
    setBomForm({
      partNumber: item.partNumber, name: item.name,
      qty: String(item.qty), unit: item.unit,
      unitCost: String(item.unitCost), currency: item.currency,
      supplier: item.supplier, link: item.link, category: item.category,
    });
    setShowBomModal(true);
  };

  const handleDeleteBom = async (id: string) => {
    const { error } = await supabase.schema("chat").from("prc_bom").delete().eq("id", id);
    if (error) { console.error("[PRC] Delete BOM:", error); return; }
    setBom((prev) => prev.filter((b) => b.id !== id));
  };

  const closeBomModal = () => { setShowBomModal(false); setEditBomId(null); setBomForm(blankBom()); };

  // ── Derived data ──────────────────────────────────────────────────────────

  const s = search.toLowerCase();

  const filteredQuotes = quotes.filter((q) => {
    const matchSearch = !s || q.supplier.toLowerCase().includes(s) || q.description.toLowerCase().includes(s) || q.rfqNumber.toLowerCase().includes(s);
    const matchStatus = statusFilter === "all" || q.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredBom = bom.filter(
    (b) => !s || b.name.toLowerCase().includes(s) || b.partNumber.toLowerCase().includes(s) || b.supplier.toLowerCase().includes(s),
  );

  const quoteStats = {
    total:    quotes.length,
    pending:  quotes.filter((q) => q.status === "pending" || q.status === "in_review").length,
    approved: quotes.filter((q) => q.status === "approved").length,
    rejected: quotes.filter((q) => q.status === "rejected").length,
  };

  const bomStats = {
    items:      bom.length,
    suppliers:  new Set(bom.map((b) => b.supplier)).size,
    categories: new Set(bom.map((b) => b.category)).size,
    totalMXN:   bom.filter((b) => b.currency === "MXN").reduce((acc, b) => acc + b.qty * b.unitCost, 0),
    totalUSD:   bom.filter((b) => b.currency === "USD").reduce((acc, b) => acc + b.qty * b.unitCost, 0),
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="prc_root" {...(prcTheme !== "default" ? { "data-prc-theme": prcTheme } : {})}>

      {/* ── Top bar ── */}
      <div className="prc_topBar">
        <div className="prc_topLeft">
          {onExpandSidebar && (
            <button type="button" className="prc_expandBtn" onClick={onExpandSidebar} aria-label="Expandir panel lateral">
              <ChevronRight size={16} />
            </button>
          )}
          <nav className="prc_tabs">
            {(
              [
                ["quotes",     "Cotizaciones"],
                ["approvals",  "Aprobaciones"],
                ["deliveries", "Entregas"],
                ["bom",        "Bill of Materials"],
              ] as [TabView, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`prc_tab${tab === key ? " prc_tab--active" : ""}`}
                onClick={() => { setTab(key); setSearch(""); setStatusFilter("all"); }}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="prc_topRight">
          {tab === "quotes" && (
            <div className="prc_filterDropWrap" ref={filterMenuRef}>
              <button
                type="button"
                className={`prc_filterBtn${statusFilter !== "all" ? " prc_filterBtn--active" : ""}`}
                onClick={() => setShowFilterMenu((v) => !v)}
              >
                <Filter size={13} />
                Filtrar
                {statusFilter !== "all" && <span className="prc_filterBadge" />}
              </button>
              {showFilterMenu && (
                <div className="prc_filterMenu">
                  <div className="prc_filterMenuSection">
                    <span className="prc_filterMenuLabel">Estado</span>
                    {(["all", ...STATUS_ORDER] as const).map((st) => {
                      const count = st === "all" ? quotes.length : quotes.filter((q) => q.status === st).length;
                      return (
                        <button
                          key={st}
                          type="button"
                          className={`prc_filterMenuOpt${statusFilter === st ? " prc_filterMenuOpt--active" : ""}`}
                          onClick={() => { setStatusFilter(st); setShowFilterMenu(false); }}
                        >
                          <span>{st === "all" ? "Todos" : STATUS_CFG[st].label}</span>
                          <span className="prc_filterMenuCount">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="prc_searchWrap">
            <Search size={14} className="prc_searchIcon" />
            <input
              type="text"
              className="prc_searchInput"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {tab === "quotes" && (
            <button type="button" className="prc_btn prc_btn--primary"
              onClick={() => { setQuoteForm(blankQuote()); setShowQuoteModal(true); }}>
              <Plus size={15} />
              Nueva Solicitud
            </button>
          )}
          {tab === "bom" && (
            <button type="button" className="prc_btn prc_btn--primary"
              onClick={() => { setBomForm(blankBom()); setEditBomId(null); setShowBomModal(true); }}>
              <Plus size={15} />
              Agregar Item
            </button>
          )}

          {/* Theme switcher */}
          <div className="prc_themeWrap" ref={themeMenuRef}>
            <button
              type="button"
              className={`prc_themeBtn${showThemeMenu ? " prc_themeBtn--open" : ""}`}
              onClick={() => setShowThemeMenu((v) => !v)}
              title="Cambiar tema"
            >
              <Settings size={14} />
            </button>
            {showThemeMenu && (
              <div className="prc_themeMenu">
                <div className="prc_themeMenuTitle">Apariencia</div>
                {(
                  [
                    { key: "default",  label: "Clásico",  sub: "Limpio y minimalista", swatch: "linear-gradient(135deg,#101113,#374151)" },
                    { key: "colorful", label: "Colorido", sub: "Vibrante e intenso",   swatch: "linear-gradient(135deg,#7C3AED,#EC4899)" },
                  ] as { key: PrcTheme; label: string; sub: string; swatch: string }[]
                ).map(({ key, label, sub, swatch }) => (
                  <button
                    key={key}
                    type="button"
                    className={`prc_themeOpt${prcTheme === key ? " prc_themeOpt--active" : ""}`}
                    onClick={() => handleSetTheme(key)}
                  >
                    <div className="prc_themeSwatch" style={{ background: swatch }} />
                    <div className="prc_themeOptInfo">
                      <div>{label}</div>
                      <div className="prc_themeOptSub">{sub}</div>
                    </div>
                    {prcTheme === key && (
                      <div className="prc_themeCheck">
                        <Check size={9} strokeWidth={3} color="#fff" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="prc_body">

        {loading ? (
          <div className="prc_emptyState">Cargando...</div>
        ) : (
          <>
            {/* ════ Cotizaciones ════ */}
            {tab === "quotes" && (
              <>
                <div className="prc_stats">
                  {([
                    { label: "Total RFQs", value: quoteStats.total    },
                    { label: "Pendientes", value: quoteStats.pending   },
                    { label: "Aprobadas",  value: quoteStats.approved  },
                    { label: "Rechazadas", value: quoteStats.rejected  },
                  ] as const).map((c) => (
                    <div key={c.label} className="prc_statCard">
                      <div className="prc_statLabel">{c.label}</div>
                      <div className="prc_statValue">{c.value}</div>
                    </div>
                  ))}
                </div>


                <div className="prc_tableWrap">
                  {filteredQuotes.length === 0 ? (
                    <div className="prc_emptyState">
                      {quotes.length === 0 ? "Aún no hay cotizaciones. Crea la primera con el botón de arriba." : "No se encontraron cotizaciones"}
                    </div>
                  ) : (
                    <table className="prc_table">
                      <thead>
                        <tr>
                          {["ID", "Proveedor", "Descripción", "Items", "Total", "Prioridad", "Status", "Link", "Acciones"].map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredQuotes.map((q) => {
                          const sc = STATUS_CFG[q.status];
                          const pc = PRIORITY_CFG[q.priority];
                          return (
                            <tr key={q.id}>
                              <td><span className="prc_tdMono">{q.rfqNumber}</span></td>
                              <td style={{ fontWeight: 600 }}>{q.supplier}</td>
                              <td className="prc_tdMuted prc_tdEllipsis">{q.description}</td>
                              <td style={{ textAlign: "center" }}>{q.items}</td>
                              <td><span className="prc_tdMono">{fmt(q.total, q.currency)}</span></td>
                              <td><span className={`prc_badge ${pc.cls}`}>{pc.label}</span></td>
                              <td>
                                <span className={`prc_badge ${sc.cls}`}>
                                  <span className="prc_badgeDot" style={{ background: prcTheme === "colorful" ? STATUS_DOT_COLORFUL[q.status] : sc.dot }} />
                                  {sc.label}
                                </span>
                              </td>
                              <td>
                                {q.link
                                  ? <a href={q.link} target="_blank" rel="noopener noreferrer" className="prc_linkChip"><ExternalLink size={11} />Ver</a>
                                  : <span className="prc_linkNone">—</span>}
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                  {q.status === "pending" && (
                                    isAdmin ? (
                                      <button type="button" className="prc_btn prc_btn--ghost prc_btn--sm" onClick={() => handleUpdateStatus(q.id, "in_review")}>
                                        Revisar
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: 11, color: "rgba(16,17,19,0.35)", fontStyle: "italic" }}>Solo admin</span>
                                    )
                                  )}
                                  {q.status === "in_review" && (
                                    isAdmin ? (
                                      <>
                                        <button type="button" className="prc_btn prc_btn--success prc_btn--sm" onClick={() => handleUpdateStatus(q.id, "approved")}>Aprobar</button>
                                        <button type="button" className="prc_btn prc_btn--danger  prc_btn--sm" onClick={() => handleUpdateStatus(q.id, "rejected")}>Rechazar</button>
                                      </>
                                    ) : (
                                      <span style={{ fontSize: 11, color: "rgba(16,17,19,0.35)", fontStyle: "italic" }}>Solo admin</span>
                                    )
                                  )}
                                  {(q.status === "approved" || q.status === "rejected") && (
                                    <span style={{ fontSize: 11, color: "rgba(16,17,19,0.35)", fontStyle: "italic" }}>Finalizado</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {/* ════ Aprobaciones — Kanban ════ */}
            {tab === "approvals" && (
              <div className="prc_kanban">
                {STATUS_ORDER.map((status) => {
                  const cfg      = STATUS_CFG[status];
                  const dotColor = prcTheme === "colorful" ? STATUS_DOT_COLORFUL[status] : cfg.dot;
                  const cards    = quotes.filter((q) => q.status === status);
                  return (
                    <div key={status} className="prc_kanbanCol">
                      <div className="prc_kanbanHeader">
                        <span className="prc_kanbanDot" style={{ background: dotColor }} />
                        <span className="prc_kanbanTitle">{cfg.label}</span>
                        <span className="prc_kanbanCount">{cards.length}</span>
                      </div>

                      {cards.length === 0 ? (
                        <div className="prc_kanbanEmpty">Sin elementos</div>
                      ) : (
                        cards.map((q) => (
                          <div key={q.id} className="prc_kanbanCard" style={{ borderLeft: `3px solid ${dotColor}` }}>
                            <div className="prc_kanbanCardTop">
                              <span className="prc_kanbanId">{q.rfqNumber}</span>
                              <span className={`prc_badge ${PRIORITY_CFG[q.priority].cls}`}>{PRIORITY_CFG[q.priority].label}</span>
                            </div>
                            <div className="prc_kanbanSupplier">{q.supplier}</div>
                            <div className="prc_kanbanDesc">{q.description}</div>
                            <div className="prc_kanbanFooter">
                              <span className="prc_kanbanAmount">{fmt(q.total, q.currency)}</span>
                              <span className="prc_kanbanDate">{q.date}</span>
                            </div>
                            {(status === "pending" || status === "in_review") && (
                              isAdmin ? (
                                <div className="prc_kanbanActions">
                                  {status === "pending" && (
                                    <button type="button" className="prc_btn prc_btn--ghost prc_btn--sm" style={{ flex: 1, justifyContent: "center" }}
                                      onClick={() => handleUpdateStatus(q.id, "in_review")}>
                                      Enviar a Revisión
                                    </button>
                                  )}
                                  {status === "in_review" && (
                                    <>
                                      <button type="button" className="prc_btn prc_btn--success prc_btn--sm" style={{ flex: 1, justifyContent: "center" }}
                                        onClick={() => handleUpdateStatus(q.id, "approved")}>
                                        ✓ Aprobar
                                      </button>
                                      <button type="button" className="prc_btn prc_btn--danger prc_btn--sm" style={{ flex: 1, justifyContent: "center" }}
                                        onClick={() => handleUpdateStatus(q.id, "rejected")}>
                                        ✗ Rechazar
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div className="prc_kanbanActions" style={{ justifyContent: "center" }}>
                                  <span style={{ fontSize: 11, color: "rgba(16,17,19,0.4)", fontStyle: "italic" }}>
                                    Solo administradores
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ════ Entregas — Kanban ════ */}
            {tab === "deliveries" && (
              <>
                <div className="prc_stats">
                  {(DELIVERY_ORDER.map((ds) => ({
                    label: DELIVERY_CFG[ds].label,
                    value: quotes.filter((q) => q.status === "approved" && q.deliveryStatus === ds).length,
                  })) as { label: string; value: number }[]).map((c) => (
                    <div key={c.label} className="prc_statCard">
                      <div className="prc_statLabel">{c.label}</div>
                      <div className="prc_statValue">{c.value}</div>
                    </div>
                  ))}
                  <div className="prc_statCard">
                    <div className="prc_statLabel">Total aprobadas</div>
                    <div className="prc_statValue">{quotes.filter((q) => q.status === "approved").length}</div>
                  </div>
                </div>

                <div className="prc_kanban">
                  {DELIVERY_ORDER.map((ds) => {
                    const cfg   = DELIVERY_CFG[ds];
                    const cards = quotes.filter((q) => q.status === "approved" && q.deliveryStatus === ds);
                    const prev  = DELIVERY_ORDER[DELIVERY_ORDER.indexOf(ds) - 1];
                    const next  = DELIVERY_ORDER[DELIVERY_ORDER.indexOf(ds) + 1];
                    return (
                      <div key={ds} className="prc_kanbanCol">
                        <div className="prc_kanbanHeader">
                          <span className="prc_kanbanDot" style={{ background: cfg.dot }} />
                          <span className="prc_kanbanTitle">{cfg.label}</span>
                          <span className="prc_kanbanCount">{cards.length}</span>
                        </div>

                        {cards.length === 0 ? (
                          <div className="prc_kanbanEmpty">Sin elementos</div>
                        ) : (
                          cards.map((q) => (
                            <div key={q.id} className="prc_kanbanCard" style={{ borderLeft: `3px solid ${cfg.dot}` }}>
                              <div className="prc_kanbanCardTop">
                                <span className="prc_kanbanId">{q.rfqNumber}</span>
                                <span className={`prc_badge ${PRIORITY_CFG[q.priority].cls}`}>{PRIORITY_CFG[q.priority].label}</span>
                              </div>
                              <div className="prc_kanbanSupplier">{q.supplier}</div>
                              <div className="prc_kanbanDesc">{q.description}</div>
                              <div className="prc_kanbanFooter">
                                <span className="prc_kanbanAmount">{fmt(q.total, q.currency)}</span>
                                <span className="prc_kanbanDate">{q.date}</span>
                              </div>
                              <div className="prc_kanbanActions">
                                {isAdmin ? (
                                  <>
                                    {prev && (
                                      <button type="button" className="prc_btn prc_btn--ghost prc_btn--sm" style={{ flex: 1, justifyContent: "center" }}
                                        onClick={() => handleUpdateDelivery(q.id, prev)}>
                                        ← {DELIVERY_CFG[prev].label}
                                      </button>
                                    )}
                                    {next && (
                                      <button type="button" className="prc_btn prc_btn--success prc_btn--sm" style={{ flex: 1, justifyContent: "center" }}
                                        onClick={() => handleUpdateDelivery(q.id, next)}>
                                        {DELIVERY_CFG[next].label} →
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <span style={{ fontSize: 11, color: "rgba(16,17,19,0.4)", fontStyle: "italic", width: "100%", textAlign: "center" }}>
                                    Solo administradores
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ════ Bill of Materials ════ */}
            {tab === "bom" && (
              <>
                <div className="prc_stats">
                  {([
                    { label: "Total Items",   value: bomStats.items                                                   },
                    { label: "Proveedores",   value: bomStats.suppliers                                               },
                    { label: "Categorías",    value: bomStats.categories                                              },
                    { label: "Total MXN",     value: `$${bomStats.totalMXN.toLocaleString("en-US")}`, sub: "Pesos"   },
                    { label: "Total USD",     value: `$${bomStats.totalUSD.toLocaleString("en-US")}`, sub: "Dólares"  },
                  ] as const).map((c) => (
                    <div key={c.label} className="prc_statCard">
                      <div className="prc_statLabel">{c.label}</div>
                      <div className="prc_statValue">{c.value}</div>
                      {"sub" in c && c.sub && <div className="prc_statSub">{c.sub}</div>}
                    </div>
                  ))}
                </div>

                <div className="prc_tableWrap">
                  {filteredBom.length === 0 ? (
                    <div className="prc_emptyState">
                      {bom.length === 0 ? "Aún no hay items en el BOM. Agrega el primero con el botón de arriba." : "No se encontraron items"}
                    </div>
                  ) : (
                    <table className="prc_table">
                      <thead>
                        <tr>
                          {["No. Parte", "Nombre", "Cant.", "Unidad", "Costo Unit.", "Subtotal", "Proveedor", "Categoría", "Link", ""].map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBom.map((b) => (
                          <tr key={b.id}>
                            <td><span className="prc_tdMono">{b.partNumber}</span></td>
                            <td style={{ fontWeight: 600 }}>{b.name}</td>
                            <td style={{ textAlign: "center", fontWeight: 700 }}>{b.qty}</td>
                            <td className="prc_tdMuted">{b.unit}</td>
                            <td><span className="prc_tdMono">{fmt(b.unitCost, b.currency)}</span></td>
                            <td><span className="prc_tdMono" style={{ fontWeight: 700 }}>{fmt(b.qty * b.unitCost, b.currency)}</span></td>
                            <td className="prc_tdMuted">{b.supplier}</td>
                            <td><span className="prc_badge prc_badge--cat">{b.category}</span></td>
                            <td>
                              {b.link
                                ? <a href={b.link} target="_blank" rel="noopener noreferrer" className="prc_linkChip"><ExternalLink size={11} />Ver</a>
                                : <span className="prc_linkNone">—</span>}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 2 }}>
                                <button type="button" className="prc_iconBtn" onClick={() => handleEditBom(b)}><Pencil size={14} /></button>
                                <button type="button" className="prc_iconBtn prc_iconBtn--danger" onClick={() => handleDeleteBom(b.id)}><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ════ Quote Modal ════ */}
      {showQuoteModal && (
        <div className="prc_overlay" onClick={() => setShowQuoteModal(false)}>
          <div className="prc_modal" onClick={(e) => e.stopPropagation()}>
            <div className="prc_modalHeader">
              <span className="prc_modalTitle">Nueva Solicitud de Cotización</span>
              <button type="button" className="prc_modalClose" onClick={() => setShowQuoteModal(false)}><X size={18} /></button>
            </div>
            <div className="prc_modalBody">
              <div className="prc_field">
                <label className="prc_label">Proveedor</label>
                <input className="prc_input" placeholder="Ej: CTR Scientific"
                  value={quoteForm.supplier} onChange={(e) => setQuoteForm((f) => ({ ...f, supplier: e.target.value }))} />
              </div>
              <div className="prc_field">
                <label className="prc_label">Descripción</label>
                <input className="prc_input" placeholder="Descripción de la solicitud"
                  value={quoteForm.description} onChange={(e) => setQuoteForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="prc_fieldRow">
                <div className="prc_field">
                  <label className="prc_label">No. Items</label>
                  <input type="number" className="prc_input" placeholder="0"
                    value={quoteForm.items} onChange={(e) => setQuoteForm((f) => ({ ...f, items: e.target.value }))} />
                </div>
                <div className="prc_field">
                  <label className="prc_label">Total Estimado</label>
                  <input type="number" className="prc_input" placeholder="0.00"
                    value={quoteForm.total} onChange={(e) => setQuoteForm((f) => ({ ...f, total: e.target.value }))} />
                </div>
              </div>
              <div className="prc_fieldRow">
                <div className="prc_field">
                  <label className="prc_label">Moneda</label>
                  <OrionSelect
                    value={quoteForm.currency}
                    options={[{ value: "MXN", label: "MXN" }, { value: "USD", label: "USD" }]}
                    onChange={(v) => setQuoteForm((f) => ({ ...f, currency: v as Currency }))}
                  />
                </div>
                <div className="prc_field">
                  <label className="prc_label">Prioridad</label>
                  <OrionSelect
                    value={quoteForm.priority}
                    options={[{ value: "high", label: "Alta" }, { value: "medium", label: "Media" }, { value: "low", label: "Baja" }]}
                    onChange={(v) => setQuoteForm((f) => ({ ...f, priority: v as Priority }))}
                  />
                </div>
              </div>
              <div className="prc_field">
                <label className="prc_label">Link de compra / catálogo</label>
                <input className="prc_input" placeholder="https://proveedor.com/catalogo"
                  value={quoteForm.link} onChange={(e) => setQuoteForm((f) => ({ ...f, link: e.target.value }))} />
              </div>
            </div>
            <div className="prc_modalFooter">
              <button type="button" className="prc_btn prc_btn--ghost" onClick={() => setShowQuoteModal(false)}>Cancelar</button>
              <button type="button" className="prc_btn prc_btn--primary" onClick={handleAddQuote}>Crear Solicitud</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ BOM Modal ════ */}
      {showBomModal && (
        <div className="prc_overlay" onClick={closeBomModal}>
          <div className="prc_modal" onClick={(e) => e.stopPropagation()}>
            <div className="prc_modalHeader">
              <span className="prc_modalTitle">{editBomId ? "Editar Item BOM" : "Nuevo Item BOM"}</span>
              <button type="button" className="prc_modalClose" onClick={closeBomModal}><X size={18} /></button>
            </div>
            <div className="prc_modalBody">
              <div className="prc_fieldRow">
                <div className="prc_field">
                  <label className="prc_label">No. Parte</label>
                  <input className="prc_input" placeholder="Ej: SIL-BIO-001"
                    value={bomForm.partNumber} onChange={(e) => setBomForm((f) => ({ ...f, partNumber: e.target.value }))} />
                </div>
                <div className="prc_field">
                  <label className="prc_label">Categoría</label>
                  <input className="prc_input" placeholder="Ej: Seguridad"
                    value={bomForm.category} onChange={(e) => setBomForm((f) => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div className="prc_field">
                <label className="prc_label">Nombre del componente</label>
                <input className="prc_input" placeholder="Nombre completo"
                  value={bomForm.name} onChange={(e) => setBomForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="prc_fieldRow">
                <div className="prc_field">
                  <label className="prc_label">Cantidad</label>
                  <input type="number" className="prc_input" placeholder="0"
                    value={bomForm.qty} onChange={(e) => setBomForm((f) => ({ ...f, qty: e.target.value }))} />
                </div>
                <div className="prc_field">
                  <label className="prc_label">Unidad</label>
                  <OrionSelect
                    value={bomForm.unit}
                    options={UNITS.map((u) => ({ value: u, label: u }))}
                    onChange={(v) => setBomForm((f) => ({ ...f, unit: v }))}
                  />
                </div>
              </div>
              <div className="prc_fieldRow">
                <div className="prc_field">
                  <label className="prc_label">Costo Unitario</label>
                  <input type="number" className="prc_input" placeholder="0.00"
                    value={bomForm.unitCost} onChange={(e) => setBomForm((f) => ({ ...f, unitCost: e.target.value }))} />
                </div>
                <div className="prc_field">
                  <label className="prc_label">Moneda</label>
                  <OrionSelect
                    value={bomForm.currency}
                    options={[{ value: "MXN", label: "MXN" }, { value: "USD", label: "USD" }]}
                    onChange={(v) => setBomForm((f) => ({ ...f, currency: v as Currency }))}
                  />
                </div>
              </div>
              <div className="prc_field">
                <label className="prc_label">Proveedor</label>
                <input className="prc_input" placeholder="Ej: Leuze Electronic"
                  value={bomForm.supplier} onChange={(e) => setBomForm((f) => ({ ...f, supplier: e.target.value }))} />
              </div>
              <div className="prc_field">
                <label className="prc_label">Link de referencia / compra</label>
                <input className="prc_input" placeholder="https://..."
                  value={bomForm.link} onChange={(e) => setBomForm((f) => ({ ...f, link: e.target.value }))} />
              </div>
            </div>
            <div className="prc_modalFooter">
              <button type="button" className="prc_btn prc_btn--ghost" onClick={closeBomModal}>Cancelar</button>
              <button type="button" className="prc_btn prc_btn--primary" onClick={handleSaveBom}>
                {editBomId ? "Guardar Cambios" : "Agregar Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
