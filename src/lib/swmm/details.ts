// Per-component diff explanations rendered alongside the radar chart.
// Built separately from score.ts so the scoring engine stays focused on
// producing the single Bill-James-style index; this file produces the
// human-readable "which properties matched or differed" tables.

import type { ParsedInp } from "./parseInp";
import { coordMap, matchById, matchHybrid } from "./match";
import { DEFAULT_TOLERANCES, type NumericTolerances } from "./tolerances";

export type PropStatus = "match" | "differ" | "only-a" | "only-b";

export interface PropRow {
  name: string;
  a: string | number | null;
  b: string | number | null;
  status: PropStatus;
  delta?: string;
}

export interface ComponentDiff {
  id: string;
  matchedBy: "id" | "spatial" | "unmatched";
  distance?: number;
  matched: number;
  differed: number;
  props: PropRow[];
}

export interface ComponentDetails {
  junctions: ComponentDiff[];
  conduits: ComponentDiff[];
  subcatchments: ComponentDiff[];
  outfalls: ComponentDiff[];
}

const eq = (a: unknown, b: unknown): boolean => a === b;

const fmt = (v: number | string | null | undefined): string | number | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? +v.toFixed(4) : null;
  return v;
};

interface FieldSpec<T> {
  name: string;
  pick: (x: T) => number | string | null | undefined;
  tol?: number;
}

function diffRows<T>(a: T, b: T, fields: FieldSpec<T>[]): PropRow[] {
  return fields.map((f) => {
    const av = f.pick(a);
    const bv = f.pick(b);
    const hasA = av !== undefined && av !== null && av !== "";
    const hasB = bv !== undefined && bv !== null && bv !== "";
    let status: PropStatus = "match";
    let delta: string | undefined;
    if (!hasA && !hasB) {
      status = "match";
    } else if (!hasA) {
      status = "only-b";
    } else if (!hasB) {
      status = "only-a";
    } else if (typeof av === "number" && typeof bv === "number") {
      const d = av - bv;
      if (Math.abs(d) > (f.tol ?? 1e-6)) {
        status = "differ";
        const denom = Math.max(Math.abs(av), Math.abs(bv));
        const pct = denom > 0 ? (Math.abs(d) / denom) * 100 : 0;
        delta = `Δ ${d > 0 ? "+" : ""}${d.toFixed(3)} (${pct.toFixed(1)}%)`;
      }
    } else if (!eq(av, bv)) {
      status = "differ";
      delta = `${av} → ${bv}`;
    }
    return { name: f.name, a: fmt(av), b: fmt(bv), status, delta };
  });
}

const summarise = (rows: PropRow[]) => ({
  matched: rows.filter((r) => r.status === "match").length,
  differed: rows.filter((r) => r.status !== "match").length,
});

function unmatched(id: string, side: "only-a" | "only-b"): ComponentDiff {
  return {
    id, matchedBy: "unmatched", matched: 0, differed: 1,
    props: [{
      name: "(presence)",
      a: side === "only-a" ? id : null,
      b: side === "only-b" ? id : null,
      status: side,
      delta: side === "only-a" ? "Only in Model A" : "Only in Model B",
    }],
  };
}

export function buildComponentDetails(
  a: ParsedInp,
  b: ParsedInp,
  tolerances: Partial<NumericTolerances> = {},
): ComponentDetails {
  const t: NumericTolerances = { ...DEFAULT_TOLERANCES, ...tolerances };
  const tol = t.spatialDistance;
  const cA = coordMap(a);
  const cB = coordMap(b);

  const jM = matchHybrid(a.junctions, b.junctions, cA, cB, tol);
  const kM = matchById(a.conduits, b.conduits);
  const sM = matchHybrid(a.subcatchments, b.subcatchments, cA, cB, tol);
  const oM = matchHybrid(a.outfalls, b.outfalls, cA, cB, tol);

  const xA = new Map(a.xsections.map((x) => [x.link, x]));
  const xB = new Map(b.xsections.map((x) => [x.link, x]));

  const junctions: ComponentDiff[] = jM.pairs.map(({ a: x, b: y, byId, distance }) => {
    const rows = diffRows(x, y, [
      { name: "invertElev", pick: (j) => j.invertElev, tol: t.invertElev },
      { name: "maxDepth",   pick: (j) => j.maxDepth,   tol: 0.001 },
      { name: "initDepth",  pick: (j) => j.initDepth,  tol: 0.001 },
      { name: "surDepth",   pick: (j) => j.surDepth,   tol: 0.001 },
      { name: "pondedArea", pick: (j) => j.pondedArea, tol: 0.001 },
    ]);
    return {
      id: x.id, matchedBy: byId ? "id" : "spatial",
      distance, ...summarise(rows), props: rows,
    };
  });
  for (const x of jM.onlyInA) junctions.push(unmatched(x.id, "only-a"));
  for (const y of jM.onlyInB) junctions.push(unmatched(y.id, "only-b"));

  const conduits: ComponentDiff[] = kM.pairs.map(({ a: x, b: y }) => {
    const sa = xA.get(x.id); const sb = xB.get(y.id);
    const lenTol = Math.max(Math.abs(x.length), Math.abs(y.length)) * (t.conduitLengthPct / 100);
    const rows: PropRow[] = diffRows(x, y, [
      { name: "fromNode",  pick: (c) => c.fromNode },
      { name: "toNode",    pick: (c) => c.toNode },
      { name: "length",    pick: (c) => c.length,    tol: lenTol },
      { name: "roughness", pick: (c) => c.roughness, tol: t.roughness },
      { name: "inOffset",  pick: (c) => c.inOffset,  tol: 0.01 },
      { name: "outOffset", pick: (c) => c.outOffset, tol: 0.01 },
    ]);
    if (sa && sb) {
      rows.push(...diffRows(sa, sb, [
        { name: "shape",   pick: (s) => s.shape },
        { name: "geom1",   pick: (s) => s.geom1, tol: 0.001 },
        { name: "geom2",   pick: (s) => s.geom2, tol: 0.001 },
        { name: "barrels", pick: (s) => s.barrels },
      ]));
    }
    return { id: x.id, matchedBy: "id", ...summarise(rows), props: rows };
  });
  for (const x of kM.onlyInA) conduits.push(unmatched(x.id, "only-a"));
  for (const y of kM.onlyInB) conduits.push(unmatched(y.id, "only-b"));

  const subcatchments: ComponentDiff[] = sM.pairs.map(({ a: x, b: y, byId, distance }) => {
    const areaTol = Math.max(Math.abs(x.area), Math.abs(y.area)) * (t.areaPct / 100);
    const rows = diffRows(x, y, [
      { name: "raingage",      pick: (s) => s.raingage },
      { name: "outlet",        pick: (s) => s.outlet },
      { name: "area",          pick: (s) => s.area,          tol: areaTol },
      { name: "percentImperv", pick: (s) => s.percentImperv, tol: t.imperviousPct },
      { name: "width",         pick: (s) => s.width,         tol: 0.1 },
      { name: "slope",         pick: (s) => s.slope,         tol: 0.0001 },
    ]);
    return {
      id: x.id, matchedBy: byId ? "id" : "spatial",
      distance, ...summarise(rows), props: rows,
    };
  });
  for (const x of sM.onlyInA) subcatchments.push(unmatched(x.id, "only-a"));
  for (const y of sM.onlyInB) subcatchments.push(unmatched(y.id, "only-b"));

  const outfalls: ComponentDiff[] = oM.pairs.map(({ a: x, b: y, byId, distance }) => {
    const rows = diffRows(x, y, [
      { name: "invertElev", pick: (o) => o.invertElev, tol: 0.001 },
      { name: "type",       pick: (o) => o.type },
      { name: "stage",      pick: (o) => o.stage,      tol: 0.001 },
    ]);
    return {
      id: x.id, matchedBy: byId ? "id" : "spatial",
      distance, ...summarise(rows), props: rows,
    };
  });
  for (const x of oM.onlyInA) outfalls.push(unmatched(x.id, "only-a"));
  for (const y of oM.onlyInB) outfalls.push(unmatched(y.id, "only-b"));

  return { junctions, conduits, subcatchments, outfalls };
}
