export interface SwmmJunction { id: string; invertElev: number; maxDepth: number; initDepth: number; surDepth: number; pondedArea: number; }
export interface SwmmOutfall { id: string; invertElev: number; type: string; stage: number; }
export interface SwmmConduit { id: string; fromNode: string; toNode: string; length: number; roughness: number; inOffset: number; outOffset: number; }
export interface SwmmXsection { link: string; shape: string; geom1: number; geom2: number; geom3: number; geom4: number; barrels: number; }
export interface SwmmSubcatchment { id: string; raingage: string; outlet: string; area: number; percentImperv: number; width: number; slope: number; }
export interface SwmmSubarea { subcatch: string; nImperv: number; nPerv: number; sImperv: number; sPerv: number; pctZero: number; }
export interface SwmmInfiltration { subcatch: string; params: number[]; }
export interface SwmmCoord { id: string; x: number; y: number; }
export interface SwmmPump { id: string; fromNode: string; toNode: string; }
export interface SwmmWeir { id: string; fromNode: string; toNode: string; type: string; }
export interface SwmmOrifice { id: string; fromNode: string; toNode: string; type: string; }
export interface SwmmStorage { id: string; invertElev: number; maxDepth: number; }
export interface SwmmRaingage { id: string; format: string; interval: string; }

export interface SwmmOptions {
  flowUnits: string; infiltration: string; flowRouting: string;
  startDate: string; endDate: string; reportStep: string; routingStep: string;
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
