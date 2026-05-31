import type { ParsedInp } from "./parseInp";
import { coordMap, matchById, matchHybrid } from "./match";
import { CATEGORIES, DEFAULT_WEIGHTS, type Category, type Weights } from "./weights";

export interface Deduction {
  category: Category;
  amount: number;
  label: string;
  detail?: string;
}

export interface SimilarityReport {
  overall: number;          // 0..1000
  baseline: number;         // 1000
  categoryScores: Record<Category, number>;
  categoryDeductions: Record<Category, number>;
  deductions: Deduction[];
  matchStats: {
    junctions: { matched: number; onlyA: number; onlyB: number };
    conduits: { matched: number; onlyA: number; onlyB: number };
    subcatchments: { matched: number; onlyA: number; onlyB: number };
    outfalls: { matched: number; onlyA: number; onlyB: number };
  };
  summary: {
    a: ModelSummary;
    b: ModelSummary;
  };
}

export interface ModelSummary {
  title: string;
  flowUnits: string;
  routing: string;
  junctions: number;
  conduits: number;
  subcatchments: number;
  outfalls: number;
  storage: number;
  totalConduitLength: number;
  totalSubcatchArea: number;
}

const pct = (a: number, b: number): number => {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return 0;
  return (Math.abs(a - b) / denom) * 100;
};

const countPct = (a: number, b: number): number => {
  const m = Math.max(a, b);
  if (m === 0) return 0;
  return (Math.abs(a - b) / m) * 100;
};

function summarize(p: ParsedInp): ModelSummary {
  return {
    title: p.title || "(untitled)",
    flowUnits: p.options.flowUnits || "?",
    routing: p.options.flowRouting || "?",
    junctions: p.junctions.length,
    conduits: p.conduits.length,
    subcatchments: p.subcatchments.length,
    outfalls: p.outfalls.length,
    storage: p.storage.length,
    totalConduitLength: p.conduits.reduce((s, c) => s + c.length, 0),
    totalSubcatchArea: p.subcatchments.reduce((s, c) => s + c.area, 0),
  };
}

export interface ScoreOptions {
  weights?: Partial<Weights>;
  spatialToleranceMeters?: number;
}

export function scoreModels(
  a: ParsedInp,
  b: ParsedInp,
  opts: ScoreOptions = {},
): SimilarityReport {
  const w: Weights = { ...DEFAULT_WEIGHTS, ...(opts.weights ?? {}) };
  const tol = opts.spatialToleranceMeters ?? 5;
  const deductions: Deduction[] = [];
  const add = (c: Category, amount: number, label: string, detail?: string) => {
    if (amount <= 0) return;
    deductions.push({ category: c, amount, label, detail });
  };

  // ── Simulation options ─────────────────────────────────────────
  if (a.options.flowUnits && b.options.flowUnits &&
      a.options.flowUnits !== b.options.flowUnits) {
    add("Simulation", w.flowUnitsMismatch, "FLOW_UNITS differ",
        `${a.options.flowUnits} vs ${b.options.flowUnits}`);
  }
  if (a.options.flowRouting && b.options.flowRouting &&
      a.options.flowRouting !== b.options.flowRouting) {
    add("Simulation", w.routingModelMismatch, "FLOW_ROUTING differs",
        `${a.options.flowRouting} vs ${b.options.flowRouting}`);
  }
  if (a.options.routingStep && b.options.routingStep &&
      a.options.routingStep !== b.options.routingStep) {
    add("Simulation", w.timestepMismatch, "Routing time-step differs",
        `${a.options.routingStep} vs ${b.options.routingStep}`);
  }
  if (a.options.infiltration && b.options.infiltration &&
      a.options.infiltration !== b.options.infiltration) {
    add("Hydrology", w.infiltrationMethodMismatch, "Infiltration method differs",
        `${a.options.infiltration} vs ${b.options.infiltration}`);
  }

  // ── Topology (counts) ──────────────────────────────────────────
  const topoChecks: Array<[string, number, number, number]> = [
    ["junctions", a.junctions.length, b.junctions.length, w.countJunctionsPerPct],
    ["conduits", a.conduits.length, b.conduits.length, w.countConduitsPerPct],
    ["subcatchments", a.subcatchments.length, b.subcatchments.length, w.countSubcatchPerPct],
    ["outfalls", a.outfalls.length, b.outfalls.length, w.countOutfallsPerPct],
    ["storage", a.storage.length, b.storage.length, w.countStoragePerPct],
    ["pumps+weirs+orifices",
      a.pumps.length + a.weirs.length + a.orifices.length,
      b.pumps.length + b.weirs.length + b.orifices.length,
      w.countSpecialLinkPerPct],
  ];
  for (const [name, va, vb, perPct] of topoChecks) {
    const p = countPct(va, vb);
    const ded = p * perPct;
    if (ded > 0) add("Topology", ded, `Count diff: ${name}`,
                     `${va} vs ${vb} (${p.toFixed(1)}%)`);
  }

  // ── Matching ───────────────────────────────────────────────────
  const cA = coordMap(a);
  const cB = coordMap(b);
  const jM = matchHybrid(a.junctions, b.junctions, cA, cB, tol);
  const kM = matchById(a.conduits, b.conduits);
  const sM = matchHybrid(a.subcatchments, b.subcatchments, cA, cB, tol);
  const oM = matchHybrid(a.outfalls, b.outfalls, cA, cB, tol);

  const orphans =
    jM.onlyInA.length + jM.onlyInB.length +
    kM.onlyInA.length + kM.onlyInB.length +
    sM.onlyInA.length + sM.onlyInB.length +
    oM.onlyInA.length + oM.onlyInB.length;
  if (orphans > 0) {
    add("Topology", orphans * w.orphanElementPenalty,
        `${orphans} unmatched elements`,
        `Could not pair these between models (by ID or within ${tol}m).`);
  }

  // ── Geometry per matched junction ──────────────────────────────
  let invertDed = 0, depthDed = 0, coordDed = 0;
  for (const { a: x, b: y, distance } of jM.pairs) {
    invertDed += Math.abs(x.invertElev - y.invertElev) * w.junctionInvertPerM;
    depthDed  += (pct(x.maxDepth, y.maxDepth) * w.junctionMaxDepthPerPct);
    if (distance && distance > 0) {
      coordDed += Math.min(distance * w.coordOffsetPerMeter, w.coordOffsetCapPerElement);
    }
  }
  if (invertDed > 0) add("Geometry", invertDed, "Junction invert elevation diffs",
                         `${jM.pairs.length} matched junctions`);
  if (depthDed > 0)  add("Geometry", depthDed,  "Junction max-depth diffs");
  if (coordDed > 0)  add("Geometry", coordDed,  "Coordinate offsets on spatially matched nodes");

  // ── Geometry per matched conduit ───────────────────────────────
  let lenDed = 0, slopeDed = 0, roughDed = 0;
  for (const { a: x, b: y } of kM.pairs) {
    lenDed += pct(x.length, y.length) * w.conduitLengthPerPct;
    // approximate slope using length and invert offsets
    const sA = x.length > 0 ? Math.abs(x.inOffset - x.outOffset) / x.length : 0;
    const sB = y.length > 0 ? Math.abs(y.inOffset - y.outOffset) / y.length : 0;
    slopeDed += (Math.abs(sA - sB) / 0.001) * w.conduitSlopePer001;
    roughDed += (Math.abs(x.roughness - y.roughness) / 0.001) * w.roughnessPer001;
  }
  if (lenDed > 0)   add("Geometry", lenDed, "Conduit length diffs",
                        `${kM.pairs.length} matched conduits`);
  if (slopeDed > 0) add("Geometry", slopeDed, "Conduit slope diffs");
  if (roughDed > 0) add("Hydraulics", roughDed, "Manning's n diffs on conduits");

  // ── Xsection comparison (matched by link id) ───────────────────
  const xA = new Map(a.xsections.map((x) => [x.link, x]));
  const xB = new Map(b.xsections.map((x) => [x.link, x]));
  let shapeDed = 0, geomDed = 0;
  for (const { a: x } of kM.pairs) {
    const sa = xA.get(x.id); const sb = xB.get(x.id);
    if (!sa || !sb) continue;
    if (sa.shape !== sb.shape) shapeDed += w.xsectionShapeMismatch;
    geomDed += pct(sa.geom1, sb.geom1) * w.xsectionGeom1PerPct;
  }
  if (shapeDed > 0) add("Hydraulics", shapeDed, "Cross-section shape mismatches");
  if (geomDed > 0)  add("Hydraulics", geomDed,  "Cross-section size (geom1) diffs");

  // ── Subcatchment attribute diffs ───────────────────────────────
  let areaDed = 0, impDed = 0, widthDed = 0, scSlopeDed = 0, rainDed = 0;
  for (const { a: x, b: y } of sM.pairs) {
    areaDed   += pct(x.area, y.area)             * w.areaPerPct;
    impDed    += Math.abs(x.percentImperv - y.percentImperv) * w.imperviousPerPct;
    widthDed  += pct(x.width, y.width)           * w.widthPerPct;
    scSlopeDed+= pct(x.slope, y.slope)           * w.subcatchSlopePerPct;
    if (x.raingage && y.raingage && x.raingage !== y.raingage) {
      rainDed += w.raingageMismatch;
    }
  }
  if (areaDed > 0)    add("Subcatchments", areaDed,    "Subcatchment area diffs");
  if (impDed > 0)     add("Subcatchments", impDed,     "%-impervious diffs");
  if (widthDed > 0)   add("Subcatchments", widthDed,   "Subcatchment width diffs");
  if (scSlopeDed > 0) add("Subcatchments", scSlopeDed, "Subcatchment slope diffs");
  if (rainDed > 0)    add("Hydrology", rainDed, "Raingage assignment differs on matched subcatchments");

  // ── Boundary: outfall types ────────────────────────────────────
  let outTypeDed = 0;
  for (const { a: x, b: y } of oM.pairs) {
    if (x.type && y.type && x.type !== y.type) outTypeDed += w.outfallTypeMismatch;
  }
  if (outTypeDed > 0) add("Boundary", outTypeDed, "Outfall type mismatches");

  // ── Roll up per category with caps ─────────────────────────────
  const categoryDeductions: Record<Category, number> = {
    Topology: 0, Geometry: 0, Hydraulics: 0,
    Subcatchments: 0, Hydrology: 0, Boundary: 0, Simulation: 0,
  };
  for (const d of deductions) categoryDeductions[d.category] += d.amount;

  const categoryScores: Record<Category, number> = {
    Topology: 0, Geometry: 0, Hydraulics: 0,
    Subcatchments: 0, Hydrology: 0, Boundary: 0, Simulation: 0,
  };
  let totalCapped = 0;
  for (const c of CATEGORIES) {
    const capped = Math.min(categoryDeductions[c], w.capPerCategory);
    totalCapped += capped;
    // Each category's local score is 1000-baseline indicator scaled to the cap
    categoryScores[c] = Math.max(0, Math.round(1000 - (capped / w.capPerCategory) * 1000));
  }
  const overall = Math.max(0, Math.round(1000 - totalCapped));

  // Sort deductions largest-first for the UI top-N table
  deductions.sort((x, y) => y.amount - x.amount);

  return {
    overall, baseline: 1000,
    categoryScores, categoryDeductions,
    deductions,
    matchStats: {
      junctions:     { matched: jM.pairs.length, onlyA: jM.onlyInA.length, onlyB: jM.onlyInB.length },
      conduits:      { matched: kM.pairs.length, onlyA: kM.onlyInA.length, onlyB: kM.onlyInB.length },
      subcatchments: { matched: sM.pairs.length, onlyA: sM.onlyInA.length, onlyB: sM.onlyInB.length },
      outfalls:      { matched: oM.pairs.length, onlyA: oM.onlyInA.length, onlyB: oM.onlyInB.length },
    },
    summary: { a: summarize(a), b: summarize(b) },
  };
}
