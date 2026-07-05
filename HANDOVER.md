# SWMM5 Similarity Index — Handover

A single-page web app (TanStack Start + React 19 + Vite 7 + Tailwind v4)
that scores how similar two hydraulic-model files are, and now also computes
an N×N similarity matrix across a whole folder. **Everything runs in the
browser** — no server, no database, no auth. Files never leave the user's
machine.

- Preview: https://id-preview--9bff9cc8-7e01-4722-af49-3f4b741429cd.lovable.app
- Published: https://model-harmony-index.lovable.app

---

## 1. What the app does

Three workflows, three routes.

| Route | Purpose |
|-------|---------|
| `/`            | Landing / marketing page — value prop, quick nav. |
| `/compare`     | Pairwise deep-dive: pick model A and model B, get an overall 0–1000 score, radar chart, per-component diffs, adjustable tolerances, PDF export, plus an output (.rpt/.csv) comparison panel with CSV export. |
| `/batch`       | Folder-level: pick a directory, get an N×N score matrix for every `.inp` pair and every `.rpt`/`.csv` pair, click any cell for top deductions, export the matrix as CSV. |
| `/methodology` | Human-readable explanation of the scoring approach (Bill James–style deduction from a baseline of 1000). |

Supported formats
- **SWMM5** `.inp` (input) and `.rpt` (output)
- **EPANET** `.inp` (input) and `.rpt` (output — pressure & flow snapshots)
- **InfoWorks ICM** table-style `.csv` exports (both network schema and result tables)

Cross-format pairs (SWMM ↔ ICM, SWMM ↔ EPANET) are matched by element ID and
scored as a rough congruence check, not a calibration metric.

---

## 2. Repository map

```
src/
├── routes/                      # File-based routing (TanStack Router)
│   ├── __root.tsx               # HTML shell, head metadata, error/404 boundaries
│   ├── index.tsx                # Landing page
│   ├── compare.tsx              # Pairwise compare page (inputs)
│   ├── batch.tsx                # ⬅︎ NEW — folder → NxN matrix
│   └── methodology.tsx          # Methodology / how-scoring-works
│
├── components/
│   ├── SiteHeader.tsx           # Top nav (Compare | Batch | Methodology)
│   └── OutputComparePanel.tsx   # Output-diff panel mounted on /compare
│
└── lib/swmm/                    # ⬅︎ The scoring engine (pure TS, no framework)
    ├── parseInp.ts              # SWMM5 .inp parser → ParsedInp
    ├── parseEpanet.ts           # EPANET .inp parser → ParsedInp
    ├── parseIcm.ts              # ICM CSV parser (network) → ParsedInp
    ├── parseAny.ts              # Sniff + dispatch → { format, parsed }
    ├── parseRpt.ts              # SWMM5 .rpt parser → ParsedRpt
    ├── parseAnyRpt.ts           # Sniff + dispatch for SWMM/ICM/EPANET outputs
    ├── match.ts                 # matchById + matchHybrid (ID + spatial fallback)
    ├── weights.ts               # Category weights (baseline deductions)
    ├── tolerances.ts            # NumericTolerances (deadbands)
    ├── score.ts                 # scoreModels()  → SimilarityReport (0-1000)
    ├── details.ts               # buildComponentDetails() — per-element diffs
    ├── outputCompare.ts         # compareOutputs() → OutputReport (0-1000)
    ├── outputCsv.ts             # CSV export (full + current-view + summary)
    ├── pdfReport.ts             # generatePdfReport() — jsPDF report
    ├── fixtures.ts              # Sample .inp files preloaded on /compare
    └── rptFixtures.ts           # Sample .rpt/.csv files
```

Everything under `src/lib/swmm/` is framework-free — you can lift the folder
into a Node CLI, an Electron app, a lambda, or a test harness with no
React/Router dependencies.

---

## 3. Data model (single source of truth)

`ParsedInp` (in `parseInp.ts`) is the **normalized network schema** all three
input parsers emit:

```ts
interface ParsedInp {
  title: string;
  options: { flowUnits?: string; flowRouting?: string; /* … */ };
  junctions: Junction[];      // { id, invertElev, maxDepth, initDepth, surDepth, pondedArea }
  outfalls:  Outfall[];       // { id, invertElev, type, stage }
  storage:   Storage[];
  conduits:  Conduit[];       // { id, fromNode, toNode, length, roughness, inOffset, outOffset }
  xsections: XSection[];      // { link, shape, geom1, geom2, barrels }
  subcatchments: Subcatchment[];  // { id, raingage, outlet, area, percentImperv, width, slope }
  coordinates: Map<string, { x: number; y: number }>;
}
```

`ParsedRpt` (in `parseRpt.ts`) is the equivalent for outputs:

```ts
interface ParsedRpt {
  nodeDepth: Array<{ id; maxDepth; avgDepth; maxHGL }>;
  nodeFlooding: Array<{ id; totalFloodVolume; hoursFlooded }>;
  linkFlow: Array<{ id; maxFlow; maxVelocity; maxDepthFull }>;
  subRunoff: Array<{ id; totalRunoffVolume; peakRunoff; totalInfil; runoffCoeff }>;
  continuity: { runoffPctError?: number; flowRoutingPctError?: number };
}
```

**When adding a new format**, write a parser that maps to these interfaces.
Everything downstream (scoring, diff tables, matrix, CSV export, PDF) just
works.

---

## 4. Scoring engine

### 4.1 Input similarity — `scoreModels(a, b, opts?)`

Bill James–style: start at **1000**, deduct penalties for each dimension
that diverges beyond its tolerance. Deductions are aggregated into
**categories** (`Simulation`, `Nodes`, `Links`, `Subcatchments`, `Coverage`)
with weights defined in `weights.ts`. Returns:

```ts
{
  overall: 0..1000,
  categoryScores:     Record<Category, number>,
  categoryDeductions: Record<Category, number>,
  deductions: Deduction[],   // full sorted list, drives PDF + top-N UI
  matchStats: { junctions, conduits, subcatchments, outfalls },
  summary: { a: ModelSummary, b: ModelSummary },
}
```

**Matching strategy** (in `match.ts`):
- `matchById` — exact ID match (used for links, where IDs are stable).
- `matchHybrid` — ID first, then greedy spatial fallback within
  `tolerances.spatialDistance` for nodes/subcatchments/outfalls whose IDs
  differ but geometry lines up.

**Tolerances** (in `tolerances.ts`) are **deadbands** — deltas smaller than the
tolerance produce zero deduction. The `/compare` page exposes six sliders
that mutate `NumericTolerances` and re-run scoring instantly (`useMemo`
recomputes the report).

### 4.2 Output similarity — `compareOutputs(a, b, tol?)`

Different math — RMS of relative error per element per property, mapped
`rmse ∈ [0, 0.5] → score ∈ [1000, 0]`, weighted:

```
nodes 30% · links 30% · subcatchments 25% · continuity 15%
```

Continuity penalty: `50 pts per %` of |Δ continuity error| above tolerance,
capped at 500. Returns `OutputReport` with categories, per-element diffs
(`OutputElementDiff`), and per-property rows (`OutputPropRow`) suitable for
CSV export and the expandable element table.

### 4.3 Per-component diffs — `buildComponentDetails(a, b, tol)`

Produces the property-level table you see under the radar chart on
`/compare`. Same matching logic as `scoreModels` — it just labels each row
as `match | differ | only-a | only-b` and computes a Δ + relative %.

---

## 5. Batch mode (`/batch`) — how the matrix is built

1. User picks a folder (or files) via `<input type="file" webkitdirectory>`.
   Everything runs client-side; browser walks sub-folders via
   `webkitRelativePath`.
2. Files are bucketed by extension:
   - `.inp` → parsed with `parseAny()` → `ParsedInp[]`
   - `.rpt / .csv / .txt` → parsed with `parseAnyRpt()` → `ParsedRpt[]`
   - Parse failures land in a "could not be parsed" list, not in the matrix.
3. Two N×N matrices are computed:
   - Inputs: `scoreModels(inps[i], inps[j]).overall`
   - Outputs: `compareOutputs(rpts[i], rpts[j]).overall`
   Diagonal is 1000. Matrices are symmetric — only the upper triangle is
   evaluated and mirrored.
4. Each row also gets an **`avg vs others`** column — mean similarity of that
   file against every other file in the folder. This is the "how typical is
   this model" ranking that answers *"which file is the odd one out?"*.
5. Click any cell to expand a plain-text detail block:
   - For inputs: top 8 deductions with category, label, detail.
   - For outputs: category scores + continuity deltas.
6. Export: each matrix has a **"↓ Export matrix CSV"** button that produces
   a CSV with headers `file, <label₁…labelₙ>, avg_vs_others` and a
   `# <kind> similarity matrix (0-1000)` comment on the first line.

**Complexity note**: matrix build is `O(N² · pair_cost)`. Pair cost is
dominated by hybrid matching, which is `O(m·n)` in element counts. For real
municipal folders (say 40 files × ~2k elements each), expect matrix build
to take seconds, not minutes. If it ever becomes a bottleneck, move
`buildInpMatrix` / `buildRptMatrix` into a Web Worker and stream progress.

---

## 6. CSV / PDF export

Three exporters, one per surface:

- `src/lib/swmm/pdfReport.ts` — `/compare` "Download PDF" button. jsPDF-based.
  Includes overall score, radar snapshot, and full sorted deduction list.
- `src/lib/swmm/outputCsv.ts` — `/compare` output panel:
  - `downloadOutputCsv()` — full report with summary header.
  - `downloadCurrentViewCsv()` — only rows visible after search/filter/sort.
  Both files start with a summary block: overall score, per-category scores,
  per-kind totals + matched/differed/only-A/only-B counts + worst element
  ID and its rel. err. %.
- `src/routes/batch.tsx` — inline `matrixToCsv()` per matrix.

All three use the same `esc()` CSV-escaping pattern; if you add a fourth,
factor `esc` into a shared util.

---

## 7. Adding a new model format (worked example)

Say you want to add MIKE URBAN `.mdb` extracts.

1. Create `src/lib/swmm/parseMike.ts` exporting `parseMike(text): ParsedInp`.
   Map junctions/conduits/etc. onto the shared schema. Missing fields → leave
   as `undefined` (the scorer treats undefined as "unknown", not zero).
2. Extend `ModelFormat` in `parseAny.ts` (`"SWMM5" | "EPANET" | "ICM" | "MIKE"`)
   and add a sniffer + dispatch branch.
3. If MIKE ships an equivalent to `.rpt`, do the same in `parseAnyRpt.ts`.
4. (Optional) Add a fixture to `fixtures.ts` / `rptFixtures.ts` so the
   `/compare` demo buttons can preload it.

No UI code needs to change. Format badges, cross-format warning, batch
matrix, CSV/PDF export — all read `format` off the parsed object.

---

## 8. Local dev / commands

```bash
bun install         # install deps
# The Lovable sandbox runs `bun run dev` for you on port 8080.
# Manual runs (rarely needed):
bunx tsgo --noEmit  # typecheck (fast, TS-only)
bunx vitest run     # run tests if/when added
```

`vite.config.ts` uses the TanStack Start Vite plugin. `src/routeTree.gen.ts`
is **generated** — never edit by hand. Adding a file under `src/routes/`
automatically registers a route.

---

## 9. Known constraints & landmines

- **`webkitdirectory` is non-standard** but supported in Chromium and
  WebKit. Firefox honors it too as of recent versions. Users on very old
  browsers see the "…or pick files" fallback (plain multi-select).
- **Matrix scaling**: N > ~80 will start to feel sluggish on a laptop
  because scoring is on the main thread. Web Worker migration is the
  cleanest fix; a batched `setTimeout(0)` yield loop is the quick fix.
- **ICM CSV format is loose**: real exports come in many table shapes.
  `parseIcm` targets the common `TABLE, hw_*` header style; if a user's
  export uses a different schema, add a fixture that reproduces it and
  extend the parser.
- **Cross-format scoring is a rough congruence check, not calibration.**
  The UI shows an amber banner when formats differ — do not remove it.
- **PDF layout is fixed-width**: long deduction lists paginate but do not
  reflow images. If you add charts to the PDF, render them off-screen at a
  fixed DPI first.
- **Client-side only**: there's no auth, no persistence, no analytics
  hooks. Do not add server routes for scoring — the whole value prop is
  "your files stay on your machine".

---

## 10. Where to change what

| I want to… | Edit |
|---|---|
| Change what deducts points and by how much | `src/lib/swmm/weights.ts` + `score.ts` |
| Change the default tolerances | `src/lib/swmm/tolerances.ts` |
| Add a new numeric tolerance slider on `/compare` | `tolerances.ts` (add field), `compare.tsx` (add input) |
| Change how outputs are compared | `src/lib/swmm/outputCompare.ts` |
| Add a new output category | Add a parser field in `parseRpt.ts`, extend `compareOutputs`, and add a tab in `OutputComparePanel.tsx` |
| Add a new fixture to the demo buttons | `src/lib/swmm/fixtures.ts` and/or `rptFixtures.ts` |
| Restyle the radar / matrix / score dial | The relevant route file — visuals are colocated with the page |
| Add a new nav link | `src/components/SiteHeader.tsx` |
| Add a new page | Create `src/routes/<name>.tsx`; TanStack regenerates the route tree |

---

## 11. Contact points in the code (grep anchors)

- `scoreModels`               — `src/lib/swmm/score.ts`
- `compareOutputs`            — `src/lib/swmm/outputCompare.ts`
- `buildComponentDetails`     — `src/lib/swmm/details.ts`
- `buildInpMatrix` / `buildRptMatrix` — `src/routes/batch.tsx`
- `downloadOutputCsv` / `downloadCurrentViewCsv` — `src/lib/swmm/outputCsv.ts`
- `generatePdfReport`         — `src/lib/swmm/pdfReport.ts`
- `parseAny` / `parseAnyRpt`  — `src/lib/swmm/parseAny.ts`, `parseAnyRpt.ts`

Happy diffing.
