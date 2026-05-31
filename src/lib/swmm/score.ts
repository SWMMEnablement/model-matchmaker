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
