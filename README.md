# ORION Edu

**Collapse your lab stack into a conversation.**

ORION Edu is an AI-powered laboratory management and automation platform built for educational institutions and research labs. It replaces disconnected SCADA dashboards, MES terminals, and manual logs with a single AI agent — **Sentinela** — that lets you control lab equipment through natural language.

> Built for learning factories like Tecnológico de Monterrey, MIT, and FrED Factory.

Created by **Cyclicall International Industries**.

---

## Features

### Sentinela AI Agent
- Natural language control of lab equipment (cobots, PLCs, sensors, conveyors)
- Multi-agent architecture: Planner, Retriever, Tool Executor, Troubleshooter
- Real-time streaming responses via SSE
- Human-in-the-Loop (HITL) safety verification for critical operations
- RAG-powered knowledge base for manuals, SOPs, and datasheets

### Studio — Equipment & Automation
- Equipment profiles with specs, safe positions, and operational constraints
- Practice scenarios and automation templates
- Troubleshooting diagnostics with recall of similar past issues
- Support for xArm cobots, ABB robots, Siemens PLCs, and more

### Analysis & Reporting
- Data visualization with interactive charts
- Trend analysis and lab performance insights

### Living Lab
- Team database management and data schema configuration
- Collaborative workspaces with role-based access (`admin`, `lab_researcher`)

### Learning Profile
- Personalized onboarding with learning preferences (theory, visual, examples, practice, step-by-step)
- Skills tracking, badges, and progress monitoring
- Career and academic profile integration

### Multi-Platform
- Web application
- Desktop application (Electron) with multi-window support

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS 4 |
| Build | Vite 5 |
| Desktop | Electron 30 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + Google OAuth |
| AI Agent | Sentinela API (SSE streaming) |
| UI | Framer Motion, Recharts, Lucide, React Markdown |

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd Orion-edu-platform

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in your Supabase URL, API keys, and agent endpoint
```

### Development

```bash
# Start the web app
npm run dev

# Build for production
npm run build

# Build desktop app (Electron)
npm run build:desktop
```

---

## Project Structure

```
src/
├── components/       # Reusable UI components (Chat, Sidebar, Equipment, Tools)
├── context/          # React contexts (Auth, Thinking state)
├── pages/            # Route pages
│   ├── Landing.tsx   # Marketing landing page
│   ├── Login.tsx     # Authentication
│   ├── Onboarding.tsx# Initial setup flow
│   ├── Home.tsx      # Agent/Dashboard — main chat interface
│   ├── Studio.tsx    # Equipment & automation management
│   ├── History.tsx   # Chat session history
│   ├── Analyze.tsx   # Analysis & reporting
│   ├── Profile.tsx   # User profile & learning preferences
│   └── Lab_Overview.tsx # Living Lab — team database
├── styles.css        # Global styles
└── main.tsx          # App entry point & routing
```

---

## Supported Equipment

| Category | Examples | Protocols |
|----------|----------|-----------|
| Cobots/Robots | xArm 6-axis, ABB | WebSocket |
| Controllers | Siemens PLCs | OPC-UA |
| Sensors | Temperature, pressure, motion | MQTT |
| Actuators | Conveyors, motors | WebSocket |
| Vision | Cameras, vision systems | WebSocket |

---

## Safety

ORION Edu operates real equipment. All physical operations go through safety verification:

- **Safe** — Read-only operations (sensor data, status checks)
- **Caution** — Configuration changes requiring confirmation
- **Dangerous** — Physical movements requiring full HITL verification

---

## License

Proprietary — Cyclicall International Industries. All rights reserved.
