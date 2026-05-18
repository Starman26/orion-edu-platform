// src/pages/Landing.tsx
import { useNavigate } from "react-router-dom";
import "../styles/landing.css";
import heroImage from "../assets/landing-hero.png";
import tecLogo from "../assets/tec-logo.png";
import mitLogo from "../assets/mit-logo.png";
import unamLogo from "../assets/unam-logo.png";

function TerminalMockup() {
  return (
    <div className="land-mockup">
      <img
        src={heroImage}
        alt="ORION Edu interface preview"
        className="land-mockup-image"
      />
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="land-root">
      {/* Grain texture overlay */}
      <div className="land-grain" aria-hidden="true" />

      {/* ── Nav ── */}
      <nav className="land-nav">
        <a href="/" className="land-nav-brand">ORION</a>

        <div className="land-nav-right">
          <div className="land-nav-links">
            <a href="#features" className="land-nav-link">Capabilities</a>
            <a href="#how"      className="land-nav-link">How it works</a>
            <a href="#"         className="land-nav-link">Research</a>
          </div>

          <div className="land-nav-actions">
            <button
              type="button"
              className="land-btn land-btn--ghost-sm"
              onClick={() => navigate("/login")}
            >
              Sign in
            </button>
            <button
              type="button"
              className="land-btn land-btn--outline-sm"
              onClick={() => navigate("/login?signup=true")}
            >
              Join ORION
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="land-hero">
        <div className="land-hero-content">
          <a href="#" className="land-hero-kicker">
            <span className="land-kicker-badge">Now in Beta</span>
            <span className="land-kicker-text">
              Bridge is live: plug in your cobot or PLC and start talking
            </span>
          </a>

          <h1 className="land-hero-title">
            Collapse your lab stack<br />
            <em>into a conversation</em>
          </h1>

          <p className="land-hero-sub">
            ORION replaces disconnected HMIs, SCADA panels, and lab manuals with a
            single AI interface; so researchers focus on engineering outcomes, not on
            learning five different tools.
          </p>

          <div className="land-hero-actions">
            <button
              type="button"
              className="land-btn land-btn--dark"
              onClick={() => navigate("/login?signup=true")}
            >
              Join for free
            </button>
            <button
              type="button"
              className="land-btn land-btn--ghost"
              onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="2" width="6" height="5" rx="1" />
                <rect x="2" y="17" width="6" height="5" rx="1" />
                <rect x="9" y="17" width="6" height="5" rx="1" />
                <rect x="16" y="17" width="6" height="5" rx="1" />
                <path d="M12 7v4M5 17v-2h14v2M12 11v4" />
              </svg>
              See how it works
            </button>
          </div>
        </div>

        <TerminalMockup />
      </section>

      {/* ── Rule ── */}
      <div className="land-rule" />

      {/* ── Social proof ── */}
      <section className="land-proof">
        <span className="land-proof-label">Built &amp; tested at</span>
        <div className="land-proof-logos">
          {[
            { name: "Tecnológico de Monterrey", logo: tecLogo },
            { name: "MIT", logo: mitLogo },
            { name: "FrED Factory", logo: null },
            { name: "UNAM", logo: unamLogo },
          ].map((p, i, arr) => (
            <span key={p.name} className="land-proof-row">
              {p.logo ? (
                <img
                  src={p.logo}
                  alt={`${p.name} logo`}
                  className="land-proof-logo land-proof-logo--img"
                />
              ) : (
                <span
                  className="land-proof-logo land-proof-logo--text"
                  aria-label={p.name}
                >
                  FrED Factory Lab
                </span>
              )}
              {i < arr.length - 1 && (
                <span className="land-proof-dot" aria-hidden="true">·</span>
              )}
            </span>
          ))}
        </div>
      </section>

      {/* ── Rule ── */}
      <div className="land-rule" />

      {/* ── Features ── */}
      <section className="land-section" id="features">
        <div className="land-section-intro">
          <span className="land-section-label">01 — Capabilities</span>
          <h2 className="land-section-title">
            Everything your lab needs,<br /><em>nothing it doesn't</em>
          </h2>
          <p className="land-section-sub">
            Built on a multi-agent architecture designed for real industrial
            environments — not demos.
          </p>
        </div>

        <div className="land-features-grid">
          {[
            {
              id: "A",
              title: "Conversational Control",
              desc: "Chat with your equipment in natural language. No switching between HMIs, SCADA screens, and spreadsheets.",
            },
            {
              id: "B",
              title: "Real-Time Lab Bridge",
              desc: "WebSocket connection to xArm cobots, ABB robots, Siemens PLCs, and any OPC-UA / MQTT device.",
            },
            {
              id: "C",
              title: "Multi-Agent Architecture",
              desc: "Planner, retriever, tool executor, and troubleshooter agents work in concert with human-in-the-loop approval.",
            },
            {
              id: "D",
              title: "Grounded in Your Docs",
              desc: "Upload manuals and SOPs. Every answer traces back to your documentation, not the model's imagination.",
            },
            {
              id: "E",
              title: "Per-Device Skill Cards",
              desc: "Each machine gets its own context: safe positions, joint limits, known faults, and operational constraints.",
            },
            {
              id: "F",
              title: "Voice & Code Modes",
              desc: "Switch between chat, voice, and code — same agent, different interface for different workflows.",
            },
          ].map((f) => (
            <div key={f.id} className="land-feature-card">
              <span className="land-feature-id">{f.id}</span>
              <h3 className="land-feature-title">{f.title}</h3>
              <p className="land-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Rule ── */}
      <div className="land-rule" />

      {/* ── How it works ── */}
      <section className="land-section" id="how">
        <div className="land-section-intro">
          <span className="land-section-label">02 — Workflow</span>
          <h2 className="land-section-title">
            Three steps to<br /><em>a smarter lab</em>
          </h2>
        </div>

        <div className="land-steps-grid">
          {[
            {
              num: "01",
              title: "Connect",
              desc: "Install ORION Edu Connect on your lab bridge PC. It auto-discovers xArm, ABB, and PLC devices on your local network.",
            },
            {
              num: "02",
              title: "Configure",
              desc: "Create equipment profiles with specs, safe positions, and operational boundaries. Upload SOPs and manuals.",
            },
            {
              num: "03",
              title: "Operate",
              desc: "Start chatting. Ask diagnostic questions, run protocols, and monitor your entire lab from a single conversation.",
            },
          ].map((s) => (
            <div key={s.num} className="land-step-card">
              <span className="land-step-num">{s.num}</span>
              <h3 className="land-step-title">{s.title}</h3>
              <p className="land-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="land-cta-section">
        <div className="land-cta-inner">
          <h2 className="land-cta-title">Ready to talk to your lab?</h2>
          <p className="land-cta-sub">
            Create a free account and connect your first device in under 10 minutes.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="land-footer">
        <span className="land-footer-copy">
          © 2026 Cyclicall CC International Industries
        </span>
      </footer>
    </div>
  );
}