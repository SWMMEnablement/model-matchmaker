// Parse ICM/EPANET output exports into the same ParsedRpt shape used for SWMM5
// so the output-compare engine can diff them against a SWMM5 .rpt directly.

import { parseRpt, isLikelyRpt, type ParsedRpt } from "./parseRpt";

export type RptFormat = "SWMM5" | "ICM" | "EPANET";

export interface ParsedRptWithFormat {
  parsed: ParsedRpt;
  format: RptFormat;
}

// ---------- ICM CSV output ----------
// Expected tables (header row required):
//   TABLE,sim_node
//   ID,MaxDepth,AvgDepth,MaxHGL,FloodVolume,HoursFlooded
//   TABLE,sim_link
//   ID,MaxFlow,MaxVelocity,MaxDepthFull
//   TABLE,sim_subcatchment
//   ID,TotalRunoffVolume,PeakRunoff,TotalInfil,RunoffCoeff
//   TABLE,sim_continuity
//   Runoff,FlowRouting

function splitIcmTables(text: string): Record<string, string[][]> {
  const out: Record<string, string[][]> = {};
  let current: string | null = null;
  let headers: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("!") || line.startsWith("#")) continue;
    if (/^TABLE\s*,/i.test(line)) {
      current = line.split(",")[1]?.trim() ?? null;
      headers = [];
      if (current) out[current] = [];
      continue;
    }
    if (!current) continue;
    const cells = line.split(",").map((c) => c.trim());
    if (headers.length === 0) { headers = cells; out[current].push(headers); continue; }
    out[current].push(cells);
  }
  return out;
}

function col(headers: string[], ...names: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  for (const n of names) {
    const i = lower.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function n(s: string | undefined): number {
  if (!s) return 0;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : 0;
}

function parseIcmOutput(text: string): ParsedRpt {
  const tables = splitIcmTables(text);

  const out: ParsedRpt = {
    nodeDepth: [], nodeFlooding: [], linkFlow: [], subRunoff: [],
    continuity: { runoffPctError: null, flowRoutingPctError: null, qualityPctError: null },
  };

  const nodeTbl = tables["sim_node"] ?? tables["hw_node_results"] ?? tables["node_results"];
  if (nodeTbl && nodeTbl.length > 1) {
    const h = nodeTbl[0];
    const iId = col(h, "ID", "Node", "NodeID");
    const iMax = col(h, "MaxDepth", "Max_Depth", "DepthMax");
    const iAvg = col(h, "AvgDepth", "Avg_Depth", "DepthAvg");
    const iHGL = col(h, "MaxHGL", "Max_HGL", "MaxLevel");
    const iVol = col(h, "FloodVolume", "TotalFloodVol", "Flood_Vol");
    const iHrs = col(h, "HoursFlooded", "Flood_Hours");
    for (const r of nodeTbl.slice(1)) {
      const id = r[iId]; if (!id) continue;
      out.nodeDepth.push({
        id, type: "JUNCTION",
        avgDepth: n(r[iAvg]), maxDepth: n(r[iMax]), maxHGL: n(r[iHGL]),
      });
      const vol = n(r[iVol]); const hrs = n(r[iHrs]);
      if (vol > 0 || hrs > 0) {
        out.nodeFlooding.push({ id, hoursFlooded: hrs, maxRate: 0, totalFloodVolume: vol });
      }
    }
  }

  const linkTbl = tables["sim_link"] ?? tables["sim_conduit"] ?? tables["hw_conduit_results"];
  if (linkTbl && linkTbl.length > 1) {
    const h = linkTbl[0];
    const iId = col(h, "ID", "Link", "Conduit");
    const iFlow = col(h, "MaxFlow", "Flow_Max", "PeakFlow");
    const iVel = col(h, "MaxVelocity", "Velocity_Max");
    const iDF = col(h, "MaxDepthFull", "Depth_Full", "DFull");
    for (const r of linkTbl.slice(1)) {
      const id = r[iId]; if (!id) continue;
      out.linkFlow.push({
        id, type: "CONDUIT",
        maxFlow: n(r[iFlow]), maxVelocity: n(r[iVel]), maxDepthFull: n(r[iDF]),
      });
    }
  }

  const subTbl = tables["sim_subcatchment"] ?? tables["hw_subcatchment_results"];
  if (subTbl && subTbl.length > 1) {
    const h = subTbl[0];
    const iId = col(h, "ID", "Subcatchment", "SubID");
    const iVol = col(h, "TotalRunoffVolume", "RunoffVol", "Runoff_Volume");
    const iPeak = col(h, "PeakRunoff", "Peak");
    const iInf = col(h, "TotalInfil", "Infiltration");
    const iCoef = col(h, "RunoffCoeff", "Coefficient");
    for (const r of subTbl.slice(1)) {
      const id = r[iId]; if (!id) continue;
      out.subRunoff.push({
        id,
        totalPrecip: 0, totalRunon: 0, totalEvap: 0,
        totalInfil: n(r[iInf]),
        totalRunoffDepth: 0,
        totalRunoffVolume: n(r[iVol]),
        peakRunoff: n(r[iPeak]),
        runoffCoeff: n(r[iCoef]),
      });
    }
  }

  const contTbl = tables["sim_continuity"] ?? tables["continuity"];
  if (contTbl && contTbl.length > 1) {
    const h = contTbl[0]; const r = contTbl[1];
    const iR = col(h, "Runoff", "RunoffError");
    const iF = col(h, "FlowRouting", "FlowError");
    if (iR >= 0) out.continuity.runoffPctError = n(r[iR]);
    if (iF >= 0) out.continuity.flowRoutingPctError = n(r[iF]);
  }

  return out;
}

// ---------- EPANET .rpt ----------
// EPANET reports list per-time-step pressures/flows. For a similarity pass we
// extract per-node max pressure/head and per-link max |flow|/|velocity| across
// the report. Supports either "Node Results" / "Link Results" multi-step tables
// or a single "Time = X" snapshot.

function parseEpanetOutput(text: string): ParsedRpt {
  const out: ParsedRpt = {
    nodeDepth: [], nodeFlooding: [], linkFlow: [], subRunoff: [],
    continuity: { runoffPctError: null, flowRoutingPctError: null, qualityPctError: null },
  };

  // Aggregate per-id across all snapshots.
  const nodeAgg = new Map<string, { maxP: number; sumP: number; nP: number; maxH: number }>();
  const linkAgg = new Map<string, { maxF: number; maxV: number }>();

  // Match blocks: "Node Results at HH:MM:SS Hrs:" then a table; columns:
  // Node  Demand  Head  Pressure  Quality
  const nodeBlock = /Node Results[^\n]*\n\s*-{3,}[\s\S]*?\n([\s\S]*?)(?=\n\s*Link Results|\n\s*Node Results|\n\s{0,4}[A-Z][\s\S]*?\n\s*-{5,}|$)/gi;
  for (const m of text.matchAll(nodeBlock)) {
    for (const line of m[1].split(/\r?\n/)) {
      const t = line.trim().split(/\s+/);
      if (t.length < 4 || !/\d/.test(t[1] ?? "")) continue;
      const id = t[0]; const head = parseFloat(t[2]); const press = parseFloat(t[3]);
      if (!Number.isFinite(head) || !Number.isFinite(press)) continue;
      const a = nodeAgg.get(id) ?? { maxP: -Infinity, sumP: 0, nP: 0, maxH: -Infinity };
      a.maxP = Math.max(a.maxP, press);
      a.sumP += press; a.nP += 1;
      a.maxH = Math.max(a.maxH, head);
      nodeAgg.set(id, a);
    }
  }

  const linkBlock = /Link Results[^\n]*\n\s*-{3,}[\s\S]*?\n([\s\S]*?)(?=\n\s*Node Results|\n\s*Link Results|\n\s{0,4}[A-Z][\s\S]*?\n\s*-{5,}|$)/gi;
  for (const m of text.matchAll(linkBlock)) {
    for (const line of m[1].split(/\r?\n/)) {
      const t = line.trim().split(/\s+/);
      if (t.length < 3 || !/\d/.test(t[1] ?? "")) continue;
      const id = t[0]; const flow = Math.abs(parseFloat(t[1])); const vel = parseFloat(t[2]);
      if (!Number.isFinite(flow)) continue;
      const a = linkAgg.get(id) ?? { maxF: -Infinity, maxV: -Infinity };
      a.maxF = Math.max(a.maxF, flow);
      if (Number.isFinite(vel)) a.maxV = Math.max(a.maxV, vel);
      linkAgg.set(id, a);
    }
  }

  for (const [id, a] of nodeAgg) {
    // Map EPANET pressure → "depth", head → "HGL" so the existing diff engine
    // works without specialising. Engineers reading the report should treat
    // node depths as pressure-equivalents when the format is EPANET.
    out.nodeDepth.push({
      id, type: "NODE",
      avgDepth: a.nP > 0 ? a.sumP / a.nP : 0,
      maxDepth: a.maxP === -Infinity ? 0 : a.maxP,
      maxHGL: a.maxH === -Infinity ? 0 : a.maxH,
    });
  }
  for (const [id, a] of linkAgg) {
    out.linkFlow.push({
      id, type: "PIPE",
      maxFlow: a.maxF === -Infinity ? 0 : a.maxF,
      maxVelocity: a.maxV === -Infinity ? 0 : a.maxV,
      maxDepthFull: 0,
    });
  }

  return out;
}

// ---------- Sniffer ----------

export function isLikelyIcmOutput(text: string): boolean {
  return /TABLE\s*,\s*(sim_node|sim_link|sim_conduit|sim_subcatchment|hw_\w+_results)/i.test(text);
}

export function isLikelyEpanetOutput(text: string): boolean {
  return /(Node Results|Link Results)[\s\S]*?-{5,}/i.test(text)
    && !/Subcatchment Runoff Summary/i.test(text);
}

export function parseAnyRpt(text: string, hint?: RptFormat): ParsedRptWithFormat {
  if (hint === "ICM" || (!hint && isLikelyIcmOutput(text))) {
    return { parsed: parseIcmOutput(text), format: "ICM" };
  }
  if (hint === "EPANET" || (!hint && isLikelyEpanetOutput(text))) {
    return { parsed: parseEpanetOutput(text), format: "EPANET" };
  }
  if (hint === "SWMM5" || isLikelyRpt(text)) {
    return { parsed: parseRpt(text), format: "SWMM5" };
  }
  // Fallback: try SWMM parser, it tolerates empty input.
  return { parsed: parseRpt(text), format: "SWMM5" };
}
