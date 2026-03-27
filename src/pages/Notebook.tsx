// src/pages/Notebook.tsx — LaTeX notebook with open-book aesthetic
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Menu, Download, Grid3X3, FileText } from "lucide-react";
import { latexToHtml } from "../components/latexParser";
import "../styles/notebook.css";

const ROOT_COLLAPSED_CLASS = "cora-sidebar-collapsed";
const LS_KEY = "cora_sidebar_collapsed";

const DEFAULT_CONTENT = `\\title{Bitácora de Laboratorio}
\\author{Leonardo}
\\date{Marzo 2026}
\\maketitle

\\section{Derivadas}

La derivada de una función $f(x)$ se define como:

$$f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$$

\\subsection{Reglas básicas}

\\begin{itemize}
\\item Regla de la potencia: $\\frac{d}{dx} x^n = nx^{n-1}$
\\item Regla del producto: $(fg)' = f'g + fg'$
\\item Regla de la cadena: $(f \\circ g)' = f'(g(x)) \\cdot g'(x)$
\\end{itemize}

\\section{Tabla de derivadas comunes}

\\begin{tabular}{|c|c|}
\\hline
$f(x)$ & $f'(x)$ \\\\
\\hline
$x^n$ & $nx^{n-1}$ \\\\
$e^x$ & $e^x$ \\\\
$\\ln(x)$ & $1/x$ \\\\
$\\sin(x)$ & $\\cos(x)$ \\\\
\\hline
\\end{tabular}

\\section{Ejemplo resuelto}

Encontrar la derivada de $f(x) = 3x^2 + 2x - 5$:

\\begin{align}
f'(x) &= \\frac{d}{dx}(3x^2) + \\frac{d}{dx}(2x) - \\frac{d}{dx}(5) \\\\
&= 6x + 2 - 0 \\\\
&= 6x + 2
\\end{align}

Por lo tanto, la pendiente de la tangente en $x = 1$ es $f'(1) = 8$.`;

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements?: HTMLElement[]) => Promise<void>;
      startup?: { promise: Promise<void> };
    };
  }
}

export default function Notebook() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  });
  const [source, setSource] = useState(DEFAULT_CONTENT);
  const [showGrid, setShowGrid] = useState(true);
  const [mathjaxReady, setMathjaxReady] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sidebar toggle ──
  useEffect(() => {
    if (sidebarCollapsed) document.documentElement.classList.add(ROOT_COLLAPSED_CLASS);
    else document.documentElement.classList.remove(ROOT_COLLAPSED_CLASS);
  }, [sidebarCollapsed]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY, next ? "1" : "0"); } catch { /* noop */ }
      if (next) document.documentElement.classList.add(ROOT_COLLAPSED_CLASS);
      else document.documentElement.classList.remove(ROOT_COLLAPSED_CLASS);
      window.dispatchEvent(new CustomEvent("cora:sidebar-toggle", { detail: { collapsed: next } }));
      return next;
    });
  }, []);

  // ── Load MathJax ──
  useEffect(() => {
    if (window.MathJax) {
      setMathjaxReady(true);
      return;
    }

    // Config
    const configScript = document.createElement("script");
    configScript.type = "text/javascript";
    configScript.textContent = `
      window.MathJax = {
        tex: {
          inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
          displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
          processEscapes: true,
          packages: ['base', 'ams', 'noerrors', 'noundefined', 'boldsymbol', 'color']
        },
        options: {
          skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
        },
        startup: {
          ready: function() {
            MathJax.startup.defaultReady();
          }
        }
      };
    `;
    document.head.appendChild(configScript);

    // MathJax script
    const mjScript = document.createElement("script");
    mjScript.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js";
    mjScript.async = true;
    mjScript.onload = () => {
      if (window.MathJax?.startup?.promise) {
        window.MathJax.startup.promise.then(() => setMathjaxReady(true));
      }
    };
    document.head.appendChild(mjScript);

    return () => {
      document.head.removeChild(configScript);
      document.head.removeChild(mjScript);
    };
  }, []);

  // ── Render preview with debounce ──
  const renderPreview = useCallback(() => {
    if (!previewRef.current) return;
    const html = latexToHtml(source);
    previewRef.current.innerHTML = html;

    if (mathjaxReady && window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([previewRef.current]).catch(() => { /* ignore */ });
    }
  }, [source, mathjaxReady]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(renderPreview, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [renderPreview]);

  // Also re-render when mathjax becomes ready
  useEffect(() => {
    if (mathjaxReady) renderPreview();
  }, [mathjaxReady, renderPreview]);

  // ── Line numbers ──
  const lineCount = useMemo(() => source.split('\n').length, [source]);
  const lineNumbers = useMemo(() => {
    return Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
  }, [lineCount]);

  // ── Export .tex ──
  const downloadTex = useCallback(() => {
    const blob = new Blob([source], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "notebook.tex";
    a.click();
    URL.revokeObjectURL(url);
  }, [source]);

  return (
    <div className="nb_root">
      {/* ── Header ── */}
      <header className="nb_header">
        <div className="nb_headerLeft">
          <button
            type="button"
            onClick={toggleSidebar}
            className="nb_menuBtn"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Menu size={18} />
          </button>
          <div className="nb_headerDivider" />
          <span className="nb_pageName">Notebook</span>
        </div>
        <div className="nb_headerRight" />
      </header>

      {/* ── Content ── */}
      <div className="nb_content">
        {/* Toolbar */}
        <div className="nb_toolbar">
          <div className="nb_toolbarLeft">
            <input
              type="text"
              className="nb_title"
              defaultValue="Untitled Notebook"
              placeholder="Notebook title..."
            />
          </div>
          <div className="nb_toolbarRight">
            <button
              type="button"
              className={`nb_toolBtn ${showGrid ? 'is-active' : ''}`}
              onClick={() => setShowGrid((v) => !v)}
              title="Toggle grid"
            >
              <Grid3X3 size={13} />
              Grid
            </button>
            <button type="button" className="nb_toolBtn" onClick={downloadTex} title="Download .tex">
              <Download size={13} />
              .tex
            </button>
            <button type="button" className="nb_toolBtn" title="PDF (coming soon)" disabled style={{ opacity: 0.4 }}>
              <FileText size={13} />
              PDF
            </button>
          </div>
        </div>

        {/* ── Book ── */}
        <div className="nb_book">
          {/* Left page — Editor */}
          <div className={`nb_page nb_pageLeft ${showGrid ? '' : 'no-grid'}`}>
            <div className="nb_pageHeader">Editor — LaTeX</div>
            <div className="nb_editorArea">
              <div className="nb_lineNumbers" aria-hidden="true">{lineNumbers}</div>
              <textarea
                className="nb_textarea"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                spellCheck={false}
                placeholder="Write LaTeX here..."
              />
            </div>
          </div>

          {/* Spine */}
          <div className="nb_spine" />

          {/* Right page — Preview */}
          <div className="nb_page nb_pageRight">
            <div className="nb_pageHeaderRight">Preview</div>
            <div className="nb_previewScroll">
              <div className="nb_preview" ref={previewRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
