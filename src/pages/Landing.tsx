// src/pages/Landing.tsx
import { useNavigate } from "react-router-dom";
import "../styles/landing.css";

function Eyes({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = { sm: { w: 3, h: 8, gap: 8 }, md: { w: 5, h: 14, gap: 14 }, lg: { w: 7, h: 18, gap: 20 } };
  const d = dims[size];
  return (
    <div className="land-eyes-wrap" style={{ gap: d.gap }}>
      <div className="land-eye" style={{ width: d.w, height: d.h }} />
      <div className="land-eye" style={{ width: d.w, height: d.h }} />
    </div>
  );
}

function ProductMockup() {
  return (
    <div className="land-mockup">
      <div className="land-mockup-window">
        <div className="land-mockup-bar">
          <div className="land-mockup-dots"><span /><span /><span /></div>
        </div>
        <div className="land-mockup-body">
          <div className="land-mockup-sidebar">
            <div className="land-mockup-sidebar-item land-mockup-sidebar-item--active" />
            <div className="land-mockup-sidebar-item" />
            <div className="land-mockup-sidebar-item" />
            <div className="land-mockup-sidebar-item" />
            <div className="land-mockup-sidebar-card">
              <Eyes size="sm" />
            </div>
          </div>
          <div className="land-mockup-main">
            <div className="land-mockup-greeting">
              <div className="land-mockup-text land-mockup-text--light" style={{ width: '55%' }} />
              <div className="land-mockup-text land-mockup-text--dark" style={{ width: '40%' }} />
            </div>
            <div className="land-mockup-status">
              <div className="land-mockup-text land-mockup-text--muted" style={{ width: '22%' }} />
            </div>
            <div className="land-mockup-input">
              <div className="land-mockup-text land-mockup-text--muted" style={{ width: '35%' }} />
            </div>
          </div>
          <div className="land-mockup-toolbar">
            <div className="land-mockup-toolbar-btn" />
            <div className="land-mockup-toolbar-btn" />
            <div className="land-mockup-toolbar-btn" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="land-root">
      {/* Dot grid */}
      <div className="land-dotgrid" aria-hidden="true">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="landDots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.8" fill="rgba(16,17,19,0.05)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#landDots)" />
        </svg>
      </div>

      {/* Nav */}
      <nav className="land-nav">
        <span className="land-wordmark">
          <span className="land-wordmark-o">O</span>RION
          <span className="land-wordmark-edu">Edu</span>
        </span>
        <div className="land-nav-right">
          <a href="#features" className="land-nav-link">Features</a>
          <a href="#how" className="land-nav-link">How it works</a>
          <button type="button" className="land-nav-btn land-nav-btn--ghost" onClick={() => navigate("/login")}>Sign in</button>
          <button type="button" className="land-nav-btn land-nav-btn--primary" onClick={() => navigate("/login?signup=true")}>Get started</button>
        </div>
      </nav>

      {/* Hero */}
      <section className="land-hero">
        <div className="land-hero-inner">
          <div className="land-hero-badge">
            <Eyes size="sm" />
            <span>Now in Beta</span>
          </div>

          <h1 className="land-hero-title">
            <span className="land-hero-title--light">Collapse your lab stack</span>
            <br />
            <span className="land-hero-title--dark">into a conversation</span>
          </h1>

          <p className="land-hero-sub">
            ORION Edu replaces disconnected SCADA dashboards, MES terminals, and manual logs
            with a single AI agent that connects to your cobots, PLCs, and sensors.
          </p>

          <div className="land-hero-ctas">
            <button type="button" className="land-cta land-cta--primary" onClick={() => navigate("/login?signup=true")}>Start for free</button>
            <button type="button" className="land-cta land-cta--secondary" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}>See how it works →</button>
          </div>
        </div>

        <ProductMockup />
      </section>

      {/* Social proof */}
      <section className="land-proof">
        <p className="land-proof-label">Built for learning factories and research labs</p>
        <div className="land-proof-logos">
          <span>Tecnológico de Monterrey</span>
          <span className="land-proof-dot">·</span>
          <span>MIT</span>
          <span className="land-proof-dot">·</span>
          <span>FrED Factory</span>
        </div>
      </section>

      {/* Features */}
      <section className="land-section" id="features">
        <div className="land-section-header">
          <span className="land-section-tag">Capabilities</span>
          <h2 className="land-section-title">
            <span className="land-section-title--light">Everything your lab needs,</span>
            <br />
            <span className="land-section-title--dark">nothing it doesn't</span>
          </h2>
        </div>
        <div className="land-features">
          {[
            { title: "Conversational Control", desc: "Chat with your equipment using natural language. No more switching between HMIs, SCADA screens, and spreadsheets.", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg> },
            { title: "Real-Time Lab Bridge", desc: "WebSocket connection to xArm cobots, ABB robots, Siemens PLCs, and any OPC-UA / MQTT device.", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg> },
            { title: "Multi-Agent Architecture", desc: "Planner, retriever, tool executor, and troubleshooter work together with human-in-the-loop confirmation.", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg> },
            { title: "RAG Knowledge Base", desc: "Upload manuals, SOPs, and datasheets. The agent retrieves answers grounded in your documentation.", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> },
            { title: "Voice & Code Modes", desc: "Switch between chat, voice, agent, and code modes — each optimized for different workflows.", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg> },
            { title: "Equipment Profiles", desc: "Each device gets an AI-readable skill card with specs, safe positions, and operational constraints.", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h6"/></svg> },
          ].map((f) => (
            <div key={f.title} className="land-feature">
              <div className="land-feature-icon">{f.icon}</div>
              <h3 className="land-feature-title">{f.title}</h3>
              <p className="land-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="land-section" id="how">
        <div className="land-section-header">
          <span className="land-section-tag">Workflow</span>
          <h2 className="land-section-title">
            <span className="land-section-title--light">Three steps to</span>
            <br />
            <span className="land-section-title--dark">a smarter lab</span>
          </h2>
        </div>
        <div className="land-steps">
          {[
            { num: "01", title: "Connect", desc: "Install ORION Edu Connect on your lab bridge PC. It auto-discovers xArm, ABB, and PLC devices on your network." },
            { num: "02", title: "Configure", desc: "Create equipment profiles with specs, safe positions, and operational boundaries. Upload SOPs and manuals." },
            { num: "03", title: "Operate", desc: "Start chatting. Ask diagnostic questions, run protocols, and monitor your lab from a single conversation." },
          ].map((s) => (
            <div key={s.num} className="land-step">
              <span className="land-step-num">{s.num}</span>
              <h3 className="land-step-title">{s.title}</h3>
              <p className="land-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="land-cta-section">
        <div className="land-cta-card">
          <div className="land-cta-eyescard">
            <Eyes size="md" />
          </div>
          <h2 className="land-cta-title">Ready to talk to your lab?</h2>
          <p className="land-cta-desc">Create a free account and connect your first device in under 10 minutes.</p>
          <div className="land-cta-row">
            <button type="button" className="land-cta land-cta--primary" onClick={() => navigate("/login?signup=true")}>Create account</button>
            <button type="button" className="land-cta land-cta--secondary" onClick={() => navigate("/login")}>Sign in</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="land-footer" style={{ justifyContent: "center" }}>
        <span className="land-footer-text" style={{ opacity: 0.9, fontSize: "0.7rem", letterSpacing: "0.08em" }}>
          designed by Cyclicall CC
        </span>
      </footer>
    </div>
  );
}
