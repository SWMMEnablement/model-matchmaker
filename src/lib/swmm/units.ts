// Unit normalization. SWMM FLOW_UNITS declares the unit system for the
// whole file: CFS/GPM/MGD ⇒ US customary (feet, acres); CMS/LPS/MLD ⇒ SI
// (meters, hectares). We convert every length-bearing field to canonical
// SI (meters, m², m³/s) BEFORE scoring so a CFS-vs-CMS pair with correctly
// converted values scores as identical instead of losing a flat penalty.

import type { ParsedInp } from "./parseInp";

export type UnitSystem = "US" | "SI" | "UNKNOWN";

const US_FLOW = new Set(["CFS", "GPM", "MGD"]);
const SI_FLOW = new Set(["CMS", "LPS", "MLD"]);

export function detectUnitSystem(flowUnits: string): UnitSystem {
  const u = (flowUnits || "").toUpperCase().trim();
  if (US_FLOW.has(u)) return "US";
  if (SI_FLOW.has(u)) return "SI";
  return "UNKNOWN";
}

const FT_TO_M = 0.3048;
const ACRE_TO_M2 = 4046.8564224;

export interface NormalizeResult {
  parsed: ParsedInp;
  system: UnitSystem;
  converted: boolean;
}

/**
 * Returns a copy of the parsed model with lengths in meters and areas in
 * m². Idempotent for SI files. Non-length fields (roughness, %imperv,
 * slope, geom shape codes) are untouched.
 */
export function normalizeToSI(p: ParsedInp): NormalizeResult {
  const system = detectUnitSystem(p.options.flowUnits);
  if (system !== "US") {
    return { parsed: p, system, converted: false };
  }
  const L = (v: number) => v * FT_TO_M;
  return {
    system,
    converted: true,
    parsed: {
      ...p,
      junctions: p.junctions.map((j) => ({
        ...j,
        invertElev: L(j.invertElev),
        maxDepth: L(j.maxDepth),
        initDepth: L(j.initDepth),
        surDepth: L(j.surDepth),
        // pondedArea is ft² in US units
        pondedArea: j.pondedArea * FT_TO_M * FT_TO_M,
      })),
      outfalls: p.outfalls.map((o) => ({
        ...o,
        invertElev: L(o.invertElev),
        stage: L(o.stage),
      })),
      storage: p.storage.map((s) => ({
        ...s,
        invertElev: L(s.invertElev),
        maxDepth: L(s.maxDepth),
      })),
      conduits: p.conduits.map((c) => ({
        ...c,
        length: L(c.length),
        inOffset: L(c.inOffset),
        outOffset: L(c.outOffset),
      })),
      xsections: p.xsections.map((x) => ({
        ...x,
        geom1: L(x.geom1),
        geom2: L(x.geom2),
        geom3: L(x.geom3),
        geom4: L(x.geom4),
      })),
      subcatchments: p.subcatchments.map((s) => ({
        ...s,
        area: s.area * ACRE_TO_M2,
        width: L(s.width),
      })),
      coordinates: p.coordinates.map((c) => ({
        ...c,
        x: L(c.x),
        y: L(c.y),
      })),
    },
  };
}
