# 🏭 OmniPulse Warehouse OS

**An Autonomous Smart Warehouse & Logistics Operations Platform**

> Real-time visibility, AI-driven decision-making, and autonomous fleet orchestration — unified in a single command console for modern high-velocity fulfillment centers.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-Build-646CFF?logo=vite)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-Styling-38B2AC?logo=tailwind-css)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 📖 Table of Contents

- [Problem Statement](#-problem-statement)
- [Our Solution](#-our-solution)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Screenshots](#-screenshots)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Security](#-security)
- [Performance & Efficiency](#-performance--efficiency)
- [Accessibility](#-accessibility)
- [Testing](#-testing)
- [Roadmap](#-roadmap)
- [Team](#-team)
- [License](#-license)

---

## 🎯 Problem Statement

Modern warehouses juggle high-velocity order volumes, autonomous mobile robots (AMRs), IoT sensor networks, and human workforce coordination — but most operators still rely on fragmented, siloed tools to manage them. This leads to:

- Poor real-time visibility into floor operations and robot fleet status
- Delayed response to SLA breaches, safety hazards, and equipment failures
- Manual, reactive decision-making instead of predictive, AI-assisted optimization
- No single command center unifying inventory, fleet, workforce, and telemetry data

**OmniPulse Warehouse OS** solves this by unifying every operational layer of a smart warehouse into one real-time, AI-augmented command platform.

---

## 💡 Our Solution

OmniPulse Warehouse OS is a full front-end simulation of a next-generation Warehouse Execution System (WES). It models a live, event-driven warehouse environment — AMR robots navigating the floor, orders flowing through a fulfillment pipeline, IoT sensors streaming telemetry, and an AI copilot surfacing actionable recommendations — all rendered through a fast, accessible, and visually polished interface.

It's built to demonstrate how autonomous logistics operations *should* be managed: proactively, transparently, and with humans and machines coordinated through a single source of truth.

---

## ✨ Key Features

### 🌐 Live Warehouse Floor & AMR Swarm Grid
Interactive 2D blueprint of the warehouse floor with real-time heatmaps (storage utilization, thermal zones, AMR traffic density) and a clickable rack inspector showing shelf-level SKU and expiry data.

### 🤖 Autonomous Fleet & AGV/AMR Robotics Command
Live fleet telemetry — battery, task, coordinates, speed, payload — with collision-avoidance path visualization and an emergency halt / manual override system.

### 📊 Real-Time Operations Kanban
End-to-end order pipeline from Inbound Receiving to Manifested & Dispatched, with live SLA countdown timers and TSP-based pick route optimization.

### 🧠 AI Decision Engine & Shift Copilot
Natural-language assistant with explainable AI recommendations — load rebalancing, slotting optimization, and predictive bottleneck alerts with one-click approve & execute.

### ⚙️ IoT Sensor Telemetry & Predictive Maintenance
Live monitoring of conveyor vibration, ambient temperature/humidity, hydraulic pressure, and dock cycles, with MTBF and remaining-useful-life health scoring.

### 👥 Workforce & Safety Intelligence
Shift roster with pick-rate and fatigue index tracking, plus real-time geofence alerts when workers enter active AMR corridors.

### 📦 Inventory Intelligence & Reverse Logistics
Multi-tier SKU search and a full RMA triage workflow (Inspect → Restock / Refurbish / Recycle / Dispose).

### 🔍 Universal Command Palette
`Ctrl+K` / `Cmd+K` instant search across SKUs, Orders, Zones, and Worker profiles.

### ▶️ Live Event Simulation Engine
Play / Pause / Fast-Forward controls driving realistic simulated order flow, robot movement, and sensor fluctuation — with full data export (CSV + printable reports).

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18+ with TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS (custom glassmorphism + glow utilities) |
| Icons | lucide-react |
| State Management | React Context API + custom hooks |
| Simulation | Event-driven mock service layer |
| Testing | Vitest + React Testing Library |

**Design language:** Obsidian dark mode with Electric Violet (`#8B5CF6`) and Emerald Green (`#10B981`) accents, glassmorphic cards, and monospace telemetry readouts — built for 24/7 control-room readability.

---

## 🏗 Architecture

```
Views (Screens)  →  Components (UI)  →  Context (State)  →  Services (Mock Data / Simulation Engine)
                                              ↓
                                     Types (Domain Models)
```

- **Modular separation** between Views, Components, Context, Types, and Services keeps logic testable and UI reusable.
- **Event-driven simulation engine** drives realistic state changes (orders, robots, telemetry) independent of UI rendering, using isolated context slices to avoid unnecessary re-renders.
- **Strict TypeScript interfaces** for every domain entity: `InventoryItem`, `WarehouseZone`, `AMRRobot`, `Order`, `TelemetrySensor`, `AuditLog`, `Worker`.

---

## 📸 Screenshots

> _Add screenshots or a short demo GIF here before submission — evaluators weight visual proof heavily._

| Warehouse Floor Grid | Fleet Command | AI Copilot |
|---|---|---|
| _screenshot_ | _screenshot_ | _screenshot_ |

---

## 🚀 Getting Started

### Prerequisites
- Node.js ≥ 18.x
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/<your-username>/omnipulse-warehouse-os.git
cd omnipulse-warehouse-os

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build for Production

```bash
npm run build
npm run preview
```

### Run Tests

```bash
npm run test
```

---

## 📁 Project Structure

```
src/
├── components/       # Reusable UI components (cards, badges, charts, drawers)
├── views/            # Top-level screens (Floor Grid, Fleet Command, Kanban, etc.)
├── context/          # React Context providers for global state slices
├── services/         # Mock data + event-driven simulation engine
├── types/            # TypeScript interfaces for all domain entities
├── utils/            # Shared utility functions (formatting, thresholds, sanitization)
├── hooks/            # Custom hooks (simulation ticks, debounced search, etc.)
└── App.tsx
```

---

## 🔒 Security

- No `dangerouslySetInnerHTML` anywhere in the codebase.
- All user input (search, filters, manual override commands, RMA notes) is validated and sanitized before use.
- CSV export sanitizes cell values to prevent CSV/formula injection.
- Strict TypeScript with no implicit `any`, plus runtime type guards at mock-data boundaries.
- Emergency Halt / Manual Override requires explicit confirmation to prevent accidental activation.
- No sensitive data persisted to `localStorage`/`sessionStorage`; all state is held in-memory.
- Error boundaries isolate failures so one module can't crash the entire app.

---

## ⚡ Performance & Efficiency

- Expensive computations (heatmaps, TSP route optimization, fleet aggregation) are memoized with `useMemo`/`React.memo`.
- Simulation engine uses functional state updates and batched updates to minimize re-renders.
- Long lists (SKUs, fleet, Kanban cards) use stable keys and virtualization.
- Debounced search and filtering to avoid re-computation on every keystroke.
- Canvas/SVG floor grid re-renders are isolated from unrelated telemetry state changes.
- Heavy views are lazy-loaded via `React.lazy` + `Suspense` to reduce initial load time.

---

## ♿ Accessibility

- All interactive elements are keyboard-navigable with visible focus states.
- Status and alerts are never conveyed by color alone — paired with icons/text.
- Modals and drawers trap and restore focus correctly.
- Critical alerts (SLA breach, geofence warnings, emergency halt) are announced via `aria-live` regions for screen readers.
- Color contrast ratios meet WCAG AA across the dark theme.

---

## ✅ Testing

- Unit tests cover core utility logic: SLA calculations, TSP heuristic, sanitization helpers, and health-score thresholds.
- Smoke tests confirm every major view renders without errors.
- Interactive logic (search, simulation controls, override triggers) is separated from UI for isolated, pure-function testing.

---

## 🗺 Roadmap

- [ ] Real backend integration (WebSocket-based live telemetry)
- [ ] Multi-warehouse / multi-tenant support
- [ ] Role-based access control for operators vs. supervisors
- [ ] Mobile-responsive floor-ops companion view
- [ ] Integration with real WMS/ERP systems via API adapters

---

## 👥 Team

| Name | Role |
|---|---|
| _Your Name_ | Full-Stack Development |
| _Teammate_ | Frontend / UI |
| _Teammate_ | Data / Simulation Logic |

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">Built for the India Agentic AI / Prompt Wars Hackathon 🚀</p>
