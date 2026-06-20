import type { ParsedRpt } from "./parseRpt";

export interface OutputPropRow {
  name: string;
  a: number | string | null;
  b: number | string | null;
  delta: string;
  pct: number; // 0..1 normalized magnitude
  status: "match" | "differ" | "only-a" | "only-b";
}

export interface OutputElementDiff {
  id: string;
  kind: "node" | "link" | "subcatchment";
  matched: number;
  differs: number;
  worstPct: number;
  props: OutputPropRow[];
  status: "match" | "differ" | "only-a" | "only-b";
}

export interface OutputCategoryScore {
  label: string;
  score: number; // 0..1000
  rmsePct: number; // mean relative error
  count: number;
}

export interface OutputReport {
  overall: number; // 0..1000
  categories: OutputCategoryScore[];
  continuity: {
    a: ParsedRpt["continuity"];
    b: ParsedRpt["continuity"];
    deltaRunoffPct: number | null;
    deltaFlowPct: number | null;
  };
  elements: {
    nodes: OutputElementDiff[];
    links: OutputElementDiff[];
    subcatchments: OutputElementDiff[];
  };
  summary: {
    a: { nodes: number; links: number; subs: number; flooded: number };
    b: { nodes: number; links: number; subs: number; flooded: number };
  };
}

export interface OutputTolerances {
  depthPct: number; // % allowed before counting as differ
  flowPct: number;
  runoffPct: number;
  continuityPct: number; // % absolute for continuity
}

export const DEFAULT_OUTPUT_TOLERANCES: OutputTolerances = {
  depthPct: 5,
  flowPct: 10,
  runoffPct: 5,
  continuityPct: 1,
};

const TOL = DEFAULT_OUTPUT_TOLERANCES;

function relErr(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / denom;
}

function propRow(
  name: string,
  a: number | undefined,
  b: number | undefined,
  tolPct: number,
): OutputPropRow {
  if (a === undefined && b === undefined) {
    return { name, a: null, b: null, delta: "—", pct: 0, status: "match" };
  }
  if (a === undefined) return { name, a: null, b: b!, delta: "only B", pct: 1, status: "only-b" };
  if (b === undefined) return { name, a: a!, b: null, delta: "only A", pct: 1, status: "only-a" };
  const err = relErr(a, b);
  const pct = err;
  const within = err * 100 <= tolPct;
  const delta = `Δ ${(b - a).toFixed(3)} (${(err * 100).toFixed(1)}%)`;
  return { name, a, b, delta, pct, status: within ? "match" : "differ" };
}

function summariseRows(rows: OutputPropRow[]): { matched: number; differs: number; worst: number; status: OutputElementDiff["status"] } {
  let matched = 0, differs = 0, worst = 0;
  let onlyA = true, onlyB = true;
  for (const r of rows) {
    if (r.status === "match") matched++;
    else differs++;
    worst = Math.max(worst, r.pct);
    if (r.status !== "only-b") onlyB = false;
    if (r.status !== "only-a") onlyA = false;
  }
  const status: OutputElementDiff["status"] =
    onlyA ? "only-a" : onlyB ? "only-b" : differs === 0 ? "match" : "differ";
  return { matched, differs, worst, status };
}

function compareNodes(a: ParsedRpt, b: ParsedRpt, tol: OutputTolerances): OutputElementDiff[] {
  const ma = new Map(a.nodeDepth.map((n) => [n.id, n]));
  const mb = new Map(b.nodeDepth.map((n) => [n.id, n]));
  const fa = new Map(a.nodeFlooding.map((n) => [n.id, n]));
  const fb = new Map(b.nodeFlooding.map((n) => [n.id, n]));
  const ids = new Set([...ma.keys(), ...mb.keys()]);
  return [...ids].sort().map((id) => {
    const na = ma.get(id), nb = mb.get(id);
    const flA = fa.get(id), flB = fb.get(id);
    const rows: OutputPropRow[] = [
      propRow("maxDepth", na?.maxDepth, nb?.maxDepth, tol.depthPct),
      propRow("avgDepth", na?.avgDepth, nb?.avgDepth, tol.depthPct),
      propRow("maxHGL", na?.maxHGL, nb?.maxHGL, tol.depthPct),
      propRow("floodVol", flA?.totalFloodVolume, flB?.totalFloodVolume, tol.flowPct),
      propRow("hoursFlooded", flA?.hoursFlooded, flB?.hoursFlooded, tol.flowPct),
    ];
    const s = summariseRows(rows);
    return { id, kind: "node", matched: s.matched, differs: s.differs, worstPct: s.worst, props: rows, status: s.status };
  });
}

function compareLinks(a: ParsedRpt, b: ParsedRpt, tol: OutputTolerances): OutputElementDiff[] {
  const ma = new Map(a.linkFlow.map((n) => [n.id, n]));
  const mb = new Map(b.linkFlow.map((n) => [n.id, n]));
  const ids = new Set([...ma.keys(), ...mb.keys()]);
  return [...ids].sort().map((id) => {
    const la = ma.get(id), lb = mb.get(id);
    const rows: OutputPropRow[] = [
      propRow("maxFlow", la?.maxFlow, lb?.maxFlow, tol.flowPct),
      propRow("maxVelocity", la?.maxVelocity, lb?.maxVelocity, tol.flowPct),
      propRow("maxDepth/Full", la?.maxDepthFull, lb?.maxDepthFull, tol.depthPct),
    ];
    const s = summariseRows(rows);
    return { id, kind: "link", matched: s.matched, differs: s.differs, worstPct: s.worst, props: rows, status: s.status };
  });
}

function compareSubs(a: ParsedRpt, b: ParsedRpt, tol: OutputTolerances): OutputElementDiff[] {
  const ma = new Map(a.subRunoff.map((n) => [n.id, n]));
  const mb = new Map(b.subRunoff.map((n) => [n.id, n]));
  const ids = new Set([...ma.keys(), ...mb.keys()]);
  return [...ids].sort().map((id) => {
    const sa = ma.get(id), sb = mb.get(id);
    const rows: OutputPropRow[] = [
      propRow("totalRunoffVol", sa?.totalRunoffVolume, sb?.totalRunoffVolume, tol.runoffPct),
      propRow("peakRunoff", sa?.peakRunoff, sb?.peakRunoff, tol.runoffPct),
      propRow("totalInfil", sa?.totalInfil, sb?.totalInfil, tol.runoffPct),
      propRow("runoffCoeff", sa?.runoffCoeff, sb?.runoffCoeff, tol.runoffPct),
    ];
    const s = summariseRows(rows);
    return { id, kind: "subcatchment", matched: s.matched, differs: s.differs, worstPct: s.worst, props: rows, status: s.status };
  });
}

function categoryScore(label: string, elements: OutputElementDiff[]): OutputCategoryScore {
  if (elements.length === 0) return { label, score: 1000, rmsePct: 0, count: 0 };
  let sumSq = 0, n = 0;
  for (const e of elements) {
    for (const p of e.props) {
      if (p.status === "only-a" || p.status === "only-b") { sumSq += 1; n++; }
      else { sumSq += p.pct * p.pct; n++; }
    }
  }
  const rmse = Math.sqrt(sumSq / Math.max(1, n));
  // Map rmse 0 -> 1000, 0.5+ -> 0 (linear, clamped).
  const score = Math.max(0, Math.min(1000, Math.round(1000 * (1 - Math.min(1, rmse * 2)))));
  return { label, score, rmsePct: rmse * 100, count: elements.length };
}

export function compareOutputs(
  a: ParsedRpt,
  b: ParsedRpt,
  tolerances: Partial<OutputTolerances> = {},
): OutputReport {
  const tol = { ...TOL, ...tolerances };
  const nodes = compareNodes(a, b, tol);
  const links = compareLinks(a, b, tol);
  const subs = compareSubs(a, b, tol);

  const catNodes = categoryScore("Node depths", nodes);
  const catLinks = categoryScore("Link flows", links);
  const catSubs = categoryScore("Sub runoff", subs);

  // Continuity penalty: each percentage point of |Δ continuity| above tol = 50 pts off, capped.
  const cA = a.continuity, cB = b.continuity;
  const deltaR = cA.runoffPctError != null && cB.runoffPctError != null
    ? Math.abs(cA.runoffPctError - cB.runoffPctError) : null;
  const deltaF = cA.flowRoutingPctError != null && cB.flowRoutingPctError != null
    ? Math.abs(cA.flowRoutingPctError - cB.flowRoutingPctError) : null;
  let contScore = 1000;
  for (const d of [deltaR, deltaF]) {
    if (d == null) continue;
    const over = Math.max(0, d - tol.continuityPct);
    contScore -= Math.min(500, over * 50);
  }
  contScore = Math.max(0, Math.round(contScore));
  const catCont: OutputCategoryScore = { label: "Continuity", score: contScore, rmsePct: (deltaR ?? 0) + (deltaF ?? 0), count: 2 };

  const categories = [catNodes, catLinks, catSubs, catCont];
  // Weighted overall: nodes 30, links 30, subs 25, continuity 15
  const weights = [0.30, 0.30, 0.25, 0.15];
  const overall = Math.round(
    categories.reduce((acc, c, i) => acc + c.score * weights[i], 0),
  );

  return {
    overall,
    categories,
    continuity: {
      a: cA, b: cB,
      deltaRunoffPct: deltaR,
      deltaFlowPct: deltaF,
    },
    elements: { nodes, links, subcatchments: subs },
    summary: {
      a: { nodes: a.nodeDepth.length, links: a.linkFlow.length, subs: a.subRunoff.length, flooded: a.nodeFlooding.length },
      b: { nodes: b.nodeDepth.length, links: b.linkFlow.length, subs: b.subRunoff.length, flooded: b.nodeFlooding.length },
    },
  };
}
