// SWMM5 .inp parser — section-aware, whitespace tokenized.
// Returns a structured ParsedInp the scoring engine consumes.

export interface SwmmJunction {
  id: string;
  invertElev: number;
  maxDepth: number;
  initDepth: number;
  surDepth: number;
  pondedArea: number;
}
export interface SwmmOutfall {
  id: string;
  invertElev: number;
  type: string; // FREE, FIXED, TIDAL, TIMESERIES, NORMAL
  stage: number;
}
export interface SwmmConduit {
  id: string;
  fromNode: string;
  toNode: string;
  length: number;
  roughness: number;
  inOffset: number;
  outOffset: number;
}
export interface SwmmXsection {
  link: string;
  shape: string;
  geom1: number;
  geom2: number;
  geom3: number;
  geom4: number;
  barrels: number;
}
export interface SwmmSubcatchment {
  id: string;
  raingage: string;
  outlet: string;
  area: number;
  percentImperv: number;
  width: number;
  slope: number;
}
export interface SwmmSubarea {
  subcatch: string;
  nImperv: number;
  nPerv: number;
  sImperv: number;
  sPerv: number;
  pctZero: number;
}
export interface SwmmInfiltration {
  subcatch: string;
  params: number[];
}
export interface SwmmCoord {
  id: string;
  x: number;
  y: number;
}
export interface SwmmPump { id: string; fromNode: string; toNode: string; }
export interface SwmmWeir { id: string; fromNode: string; toNode: string; type: string; }
export interface SwmmOrifice { id: string; fromNode: string; toNode: string; type: string; }
export interface SwmmStorage { id: string; invertElev: number; maxDepth: number; }
export interface SwmmRaingage { id: string; format: string; interval: string; }

export interface SwmmOptions {
  flowUnits: string;
  infiltration: string;
  flowRouting: string;
  startDate: string;
  endDate: string;
  reportStep: string;
  routingStep: string;
  raw: Record<string, string>;
}

export interface ParsedInp {
  title: string;
  options: SwmmOptions;
  junctions: SwmmJunction[];
  outfalls: SwmmOutfall[];
  storage: SwmmStorage[];
  conduits: SwmmConduit[];
  xsections: SwmmXsection[];
  subcatchments: SwmmSubcatchment[];
  subareas: SwmmSubarea[];
  infiltration: SwmmInfiltration[];
  pumps: SwmmPump[];
  weirs: SwmmWeir[];
  orifices: SwmmOrifice[];
  raingages: SwmmRaingage[];
  coordinates: SwmmCoord[];
  sectionLineCounts: Record<string, number>;
}

const num = (s: string | undefined, d = 0): number => {
  if (s === undefined) return d;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : d;
};

export function parseInp(text: string): ParsedInp {
  const lines = text.split(/\r?\n/);
  const sections: Record<string, string[][]> = {};
  const titleLines: string[] = [];
  let current = "";

  for (const raw of lines) {
    const line = raw.split(";")[0].trim();
    if (!line) continue;
    const m = line.match(/^\[([A-Z0-9_]+)\]$/i);
    if (m) {
      current = m[1].toUpperCase();
      if (!sections[current]) sections[current] = [];
      continue;
    }
    if (current === "TITLE") {
      titleLines.push(line);
      continue;
    }
    if (!current) continue;
    const tokens = line.split(/\s+/);
    sections[current].push(tokens);
  }

  const sectionLineCounts: Record<string, number> = {};
  for (const k of Object.keys(sections)) sectionLineCounts[k] = sections[k].length;

  const rawOptions: Record<string, string> = {};
  for (const row of sections.OPTIONS ?? []) {
    if (row.length >= 2) rawOptions[row[0].toUpperCase()] = row.slice(1).join(" ");
  }

  const options: SwmmOptions = {
    flowUnits: rawOptions.FLOW_UNITS ?? "",
    infiltration: rawOptions.INFILTRATION ?? "",
    flowRouting: rawOptions.FLOW_ROUTING ?? "",
    startDate: rawOptions.START_DATE ?? "",
    endDate: rawOptions.END_DATE ?? "",
    reportStep: rawOptions.REPORT_STEP ?? "",
    routingStep: rawOptions.ROUTING_STEP ?? "",
    raw: rawOptions,
  };

  const junctions: SwmmJunction[] = (sections.JUNCTIONS ?? []).map((r) => ({
    id: r[0],
    invertElev: num(r[1]),
    maxDepth: num(r[2]),
    initDepth: num(r[3]),
    surDepth: num(r[4]),
    pondedArea: num(r[5]),
  }));

  const outfalls: SwmmOutfall[] = (sections.OUTFALLS ?? []).map((r) => ({
    id: r[0],
    invertElev: num(r[1]),
    type: (r[2] ?? "").toUpperCase(),
    stage: num(r[3]),
  }));

  const storage: SwmmStorage[] = (sections.STORAGE ?? []).map((r) => ({
    id: r[0],
    invertElev: num(r[1]),
    maxDepth: num(r[2]),
  }));

  const conduits: SwmmConduit[] = (sections.CONDUITS ?? []).map((r) => ({
    id: r[0],
    fromNode: r[1],
    toNode: r[2],
    length: num(r[3]),
    roughness: num(r[4]),
    inOffset: num(r[5]),
    outOffset: num(r[6]),
  }));

  const xsections: SwmmXsection[] = (sections.XSECTIONS ?? []).map((r) => ({
    link: r[0],
    shape: (r[1] ?? "").toUpperCase(),
    geom1: num(r[2]),
    geom2: num(r[3]),
    geom3: num(r[4]),
    geom4: num(r[5]),
    barrels: num(r[6], 1),
  }));

  const subcatchments: SwmmSubcatchment[] = (sections.SUBCATCHMENTS ?? []).map((r) => ({
    id: r[0],
    raingage: r[1],
    outlet: r[2],
    area: num(r[3]),
    percentImperv: num(r[4]),
    width: num(r[5]),
    slope: num(r[6]),
  }