# 🌊 SWMM5 Model Matchmaker

<div align="center">

[![SWMM5](https://img.shields.io/badge/SWMM5-EPA%20Hydraulic%20Model-0077b6?style=for-the-badge&logo=water&logoColor=white)](https://www.epa.gov/water-research/storm-water-management-model-swmm)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-Build-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Privacy](https://img.shields.io/badge/100%25-Browser%20Only-2ecc71?style=for-the-badge&logo=shield&logoColor=white)](#privacy)

**A Bill James–style similarity index for stormwater models.**

_Upload two SWMM5 `.inp` files. Get a 0–1000 score. Everything runs in your browser._

[🚀 Compare Models](#usage) · [📐 Methodology](#methodology) · [🔧 Dev Setup](#development)

</div>

---

## 🎯 What Is This?

> **"How alike are your two SWMM5 models — really?"**

[Bill James](https://www.baseball-reference.com/friv/similar.shtml) invented Similarity Scores for baseball players: start at 1,000, subtract points for every statistical difference. **Model Matchmaker** applies the same logic to EPA SWMM5 `.inp` files.

Every section of the input file becomes a scoring category. Every attribute pair becomes a potential deduction. One number tells you whether two models are calibration siblings — or total strangers.

```
Score = 1000
      − Σ (deduction_per_unit × |attr_A − attr_B|)   // capped per attribute
      − categorical penalties                          // units, routing, etc.
```

| Score | Meaning |
|------:|:--------|
| **1000** | ✅ Identical models |
| **900 +** | 🔵 Same model, light edits |
| **700 – 899** | 🟡 Same network, meaningful differences |
| **< 600** | 🔴 Different models entirely |

---

## ✨ Features

| Feature | Detail |
|:--------|:-------|
| 🔀 **Hybrid element matching** | Match by ID first; fall back to nearest-neighbor on coordinates within a user-set tolerance |
| 📊 **7 scored categories** | Topology · Geometry · Hydraulics · Subcatchments · Hydrology · Boundary Conditions · Simulation Settings |
| 🔍 **Top-N deduction drivers** | Largest score deductions surfaced first — see *exactly* why models diverge |
| 🔒 **Fully private** | Parsing and scoring run 100 % in your browser — no upload, no server, no data leaves your machine |
| ⚡ **Fast** | Handles large `.inp` files instantly thanks to browser-native JS parsing |
| 📋 **Side-by-side compare** | `/compare` route lets you inspect per-category breakdowns |

---

## 🗂️ Project Structure

```
model-matchmaker/
├── src/
│   ├── routes/
│   │   ├── index.tsx          # Landing page & score legend
│   │   ├── compare.tsx        # File upload + diff engine
│   │   └── methodology.tsx    # Scoring algorithm docs
│   ├── components/            # Shared UI components (shadcn/ui)
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # SWMM5 parser & scoring logic
│   ├── styles.css             # Tailwind base styles
│   └── server.ts              # TanStack Start server entry
├── package.json
└── vite.config.ts
```

---

## 🚀 Usage

1. **Open the app** (local dev or deployed URL)
2. **Navigate to `/compare`**
3. **Upload Model A** — drag & drop or click to browse for a `.inp` file
4. **Upload Model B** — same process
5. **Read your score** — 0–1000 with per-category breakdown and top deduction drivers

No account. No server. No storage. Just results.

---

## 📐 Methodology

The scoring engine mirrors James's baseball formula adapted for hydraulic infrastructure:

### Categories & Caps

| # | Category | What's Compared |
|---|:---------|:----------------|
| 1 | **Topology** | Conduit count, node connectivity, loop structure |
| 2 | **Geometry** | Conduit length, diameter/height, shape type |
| 3 | **Hydraulics** | Manning's n, invert elevations, max depth |
| 4 | **Subcatchments** | Area, imperviousness, slope, width |
| 5 | **Hydrology** | Infiltration parameters, RDII, LID controls |
| 6 | **Boundary Conditions** | Outfalls, storage, external inflows |
| 7 | **Simulation Settings** | Routing method, time step, report interval |

Each category is **individually capped** so no single difference can dominate the total score. Full algorithm details live in [/methodology](/src/routes/methodology.tsx).

---

## 🛠️ Development

### Prerequisites

- [Bun](https://bun.sh/) ≥ 1.0 (or Node ≥ 18 with npm)

### Quick Start

```bash
# Clone
git clone https://github.com/SWMMEnablement/model-matchmaker.git
cd model-matchmaker

# Install dependencies
bun install

# Start dev server
bun run dev
```

App runs at `http://localhost:3000`.

### Available Scripts

| Command | Action |
|:--------|:-------|
| `bun run dev` | Start Vite dev server with HMR |
| `bun run build` | Production build → `dist/` |
| `bun run preview` | Preview production build locally |
| `bun run lint` | ESLint check |
| `bun run format` | Prettier format |

### Stack

- **Framework:** [TanStack Start](https://tanstack.com/start) (React + file-based routing)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Build:** [Vite](https://vitejs.dev/) + [Bun](https://bun.sh/)
- **Language:** TypeScript 5

---

## 🔒 Privacy

All computation — file reading, parsing, scoring — happens **entirely in your browser** via JavaScript. No `.inp` file contents are ever transmitted to any server. This design was intentional: SWMM5 models frequently contain proprietary infrastructure data.

---

## 🌐 Background

[EPA SWMM5](https://www.epa.gov/water-research/storm-water-management-model-swmm) is the world's most widely used public-domain stormwater model. Engineers maintain dozens or hundreds of model versions across calibration runs, design alternatives, and regulatory submittals. Tracking how similar two versions are has historically meant manual inspection — this tool automates that comparison.

Inspired by Bill James's [Hall of Fame Similarity Scores](https://www.baseball-reference.com/friv/similar.shtml). SWMM5 is a public-domain hydraulic model maintained by the US EPA. This project is not affiliated with either.

---

## 🤝 Contributing

Issues and pull requests are welcome! Please open an issue first for large changes.

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-improvement`
3. Commit your changes: `git commit -m "feat: describe change"`
4. Push and open a PR against `main`

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built with 💧 by the <a href="https://github.com/SWMMEnablement">SWMMEnablement</a> community</sub>
</div>
