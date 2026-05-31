
# SWMM5 Similarity Index

A Bill James–style similarity score (start at 1000, deduct for differences) for comparing two SWMM5 `.inp` models. Built as a reusable scoring engine wrapped in a TanStack Start web app where you upload two `.inp` files and get an overall score plus category and element-level breakdowns.

## How the Bill James adaptation works

Bill James's index starts at 1000 and subtracts points for each attribute difference (e.g. −1 per 20 hits, −1 per 50 runs, plus position penalty). We mirror that exactly:

```text
Score = 1000
      − Σ (deduction_per_unit × |attrA − attrB|, capped per attribute)
      − categorical penalties (different model type, different units, etc.)
```

A score of **1000 = identical**, **900+ = very similar**, **<600 = essentially different models**.

### Categories and default deductions (v1, tunable in UI)

Element matching is **hybrid**: match by ID first; for unmatched elements, fall back to nearest-neighbor on COORDINATES (within a configurable tolerance, default 5 m). Unmatched elements after both passes count as "extra/missing" penalties.

| Category | Attributes compared | Example deduction |
|---|---|---|
| Network topology | Junction count, conduit count, subcatchment count, outfall count, storage count, pump count, weir count, orifice count | −1 per 2% count difference; −2 per orphan element |
| Geometry | Conduit length, slope, invert elevations, junction max depth, coordinates offset | −1 per 5% length diff, −1 per 0.001 slope diff |
| Hydraulics | Roughness (Manning's n), cross-section type & dimensions, losses | −1 per 0.002 n diff, −5 per shape-type mismatch |
| Subcatchments | Area, %imperv, width, slope, N-imperv/perv, dstore, infiltration params | −1 per 5% area diff, −1 per 2% imperv diff |
| Hydrology | Raingage assignment, rainfall totals, infiltration method | −10 per method mismatch |
| Boundary conditions | Outfall type & stage, inflows, DWF, RDII | −5 per outfall type mismatch |
| Simulation options | FLOW_UNITS, ROUTING_MODEL, time step, start/end times | −20 per units mismatch (hard incompatibility flag) |

Each category produces a sub-score; the overall index is the weighted sum (weights editable).

## Deliverables

1. **`src/lib/swmm/` scoring engine** (pure TypeScript, no UI deps)
   - `parseInp.ts` — section-aware `.inp` parser ([TITLE], [JUNCTIONS], [CONDUITS], [SUBCATCHMENTS], [XSECTIONS], [OPTIONS], [COORDINATES], etc.)
   - `match.ts` — hybrid ID + spatial matcher
   - `score.ts` — category scorers + overall index, returns a `SimilarityReport`
   - `weights.ts` — default deduction table, overridable

2. **Web app routes**
   - `/` — landing page explaining the index (Bill James reference, methodology, example)
   - `/compare` — upload two `.inp` files, run scoring **client-side** (files never leave the browser), show:
     - Big overall score (e.g. 847 / 1000)
     - Radar chart of 7 category sub-scores
     - Table of top 20 contributing deductions ("Conduit C-12: length differs by 47 m, −3")
     - Element match table (matched / unmatched / orphan)
     - Downloadable JSON + CSV report
   - `/methodology` — full deduction table, editable weights persisted in localStorage

3. **Sample fixtures** — two small `.inp` files in `src/lib/swmm/fixtures/` for the landing-page demo

## Technical notes

- **Parsing**: SWMM5 `.inp` is a flat INI-like file with `[SECTION]` headers and whitespace-delimited rows. Pure JS parser, no native deps.
- **All scoring runs in the browser** — no server functions needed for v1. Keeps it private, fast, and free to host.
- **Charts**: Recharts (already shadcn-friendly) for the radar + bar charts.
- **Design**: clean technical/engineering aesthetic — monospace for IDs and numeric deltas, restrained palette (slate + a single accent for the score). I'll pick tokens during build.

## Out of scope (v1)

- ICM, EPANET, and cross-format comparison (extensible later — the matcher and scorer are format-agnostic; only the parser is SWMM-specific)
- Comparing simulation results (.out / .rpt) — this scores *model definitions*, not output time series
- Geospatial map view of matched elements (could add later with Leaflet)

## Future extensions (noted, not built)

- `parseEpanet.ts` to enable EPANET vs EPANET using the same engine
- An "adapter layer" mapping ICM exports → the internal element schema for SWMM↔ICM
- Result-file comparison (peak flows, volumes, flood durations) as a separate "Calibration Similarity" score
