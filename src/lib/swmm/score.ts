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
