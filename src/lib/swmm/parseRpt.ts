// Lightweight parser for SWMM5 .rpt output summary tables.
// We only extract a few headline summaries that engineers compare across runs.

export interface RptNodeDepth {
  id: string;
  type: string;
  avgDepth: number;
  maxDepth: number;
  maxHGL: number;
}

export interface RptNodeFlooding {
  id: string;
  hoursFlooded: number;
  maxRate: number;
  totalFloodVolume: number; // 10^6 gal or 10^6 ltr depending on units
}

export interface RptLinkFlow {
  id: string;
  type: string;
  maxFlow: number;
  maxVelocity: number;
  maxDepthFull: number; // |Flow|/|Full| or d/D
}

export interface RptSubRunoff {
  id: string;
  totalPrecip: number;
  totalRunon: number;
  totalEvap: number;
  totalInfil: number;
  totalRunoffDepth: number;
  totalRunoffVolume: number;
  peakRunoff: number;
  runoffCoeff: number;
}

export interface RptContinuity {
  runoffPctError: number | null;
  flowRoutingPctError: number | null;
  qualityPctError: number | null;
}

export interface ParsedRpt {
  nodeDepth: RptNodeDepth[];
  nodeFlooding: RptNodeFlooding[];
  linkFlow: RptLinkFlow[];
  subRunoff: RptSubRunoff[];
  continuity: RptContinuity;
}

function sliceSection(text: string, header: RegExp): string | null {
  const m = text.match(header);
  if (!m) return null;
  const start = m.index! + m[0].length;
  // Next blank-line followed by all-caps banner or '***' separator ends the table.
  const rest = text.slice(start);
  const endMatch = rest.match(/\n\s*\n\s*(\*{5,}|[A-Z][A-Za-z ]{3,}\n\s*\*{3,})/);
  return endMatch ? rest.slice(0, endMatch.index!) : rest;
}

function dataLines(section: string): string[] {
  return section
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => {
      const t = l.trim();
      if (!t) return false;
      if (t.startsWith("-")) return false;
      if (/^[A-Z][A-Za-z]/.test(t) && /\s{2,}/.test(l) === false) return false;
      // skip header-ish lines (no numeric tokens)
      return /\d/.test(t);
    });
}

function num(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseNodeDepth(text: string): RptNodeDepth[] {
  const sec = sliceSection(text, /Node Depth Summary[\s\S]*?\n\s*-{5,}\s*\n/);
  if (!sec) return [];
  return dataLines(sec).map((l) => {
    const t = l.trim().split(/\s+/);
    // id type avgDepth maxDepth maxHGL day hh:mm reportedMax
    return {
      id: t[0],
      type: t[1] ?? "",
      avgDepth: num(t[2]),
      maxDepth: num(t[3]),
      maxHGL: num(t[4]),
    };
  });
}

function parseNodeFlooding(text: string): RptNodeFlooding[] {
  const sec = sliceSection(text, /Node Flooding Summary[\s\S]*?\n\s*-{5,}\s*\n/);
  if (!sec) return [];
  return dataLines(sec)
    .filter((l) => !/No nodes were flooded/i.test(l))
    .map((l) => {
      const t = l.trim().split(/\s+/);
      // id hoursFlooded maxRate day hh:mm totalFloodVol maxPondedDepth
      return {
        id: t[0],
        hoursFlooded: num(t[1]),
        maxRate: num(t[2]),
        totalFloodVolume: num(t[5]),
      };
    });
}

function parseLinkFlow(text: string): RptLinkFlow[] {
  const sec = sliceSection(text, /Link Flow Summary[\s\S]*?\n\s*-{5,}\s*\n/);
  if (!sec) return [];
  return dataLines(sec).map((l) => {
    const t = l.trim().split(/\s+/);
    // id type maxFlow day hh:mm maxVel maxDFull maxQFull
    return {
      id: t[0],
      type: t[1] ?? "",
      maxFlow: num(t[2]),
      maxVelocity: num(t[5]),
      maxDepthFull: num(t[6]),
    };
  });
}

function parseSubRunoff(text: string): RptSubRunoff[] {
  const sec = sliceSection(text, /Subcatchment Runoff Summary[\s\S]*?\n\s*-{5,}\s*\n/);
  if (!sec) return [];
  return dataLines(sec).map((l) => {
    const t = l.trim().split(/\s+/);
    // id totalPrecip totalRunon totalEvap totalInfil totalRunoffDepth totalRunoffVol peakRunoff coeff
    return {
      id: t[0],
      totalPrecip: num(t[1]),
      totalRunon: num(t[2]),
      totalEvap: num(t[3]),
      totalInfil: num(t[4]),
      totalRunoffDepth: num(t[5]),
      totalRunoffVolume: num(t[6]),
      peakRunoff: num(t[7]),
      runoffCoeff: num(t[8]),
    };
  });
}

function parseContinuity(text: string): RptContinuity {
  const pick = (re: RegExp): number | null => {
    const m = text.match(re);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? n : null;
  };
  return {
    runoffPctError: pick(/Surface Runoff[\s\S]*?Continuity Error[\s\S]*?(-?\d+\.\d+)\s*\n/i)
      ?? pick(/Runoff Quantity Continuity[\s\S]*?Continuity Error \(%\)\s*\.+\s*(-?\d+\.\d+)/i),
    flowRoutingPctError: pick(/Flow Routing Continuity[\s\S]*?Continuity Error \(%\)\s*\.+\s*(-?\d+\.\d+)/i),
    qualityPctError: pick(/Quality Routing Continuity[\s\S]*?Continuity Error \(%\)\s*\.+\s*(-?\d+\.\d+)/i),
  };
}

export function parseRpt(text: string): ParsedRpt {
  return {
    nodeDepth: parseNodeDepth(text),
    nodeFlooding: parseNodeFlooding(text),
    linkFlow: parseLinkFlow(text),
    subRunoff: parseSubRunoff(text),
    continuity: parseContinuity(text),
  };
}

export function isLikelyRpt(text: string): boolean {
  return /EPA STORM WATER MANAGEMENT MODEL/i.test(text)
    || /Node Depth Summary|Link Flow Summary|Subcatchment Runoff Summary/i.test(text);
}
