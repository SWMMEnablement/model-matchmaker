// Default Bill-James-style deductions. All tunable.
// "perUnit" means: deduction = perUnit * |diff| (in the unit's natural unit).
// "perPct" means: deduction = perPct * (relative diff in percent, 0-100).

export interface Weights {
  // Topology (count differences, per percent)
  countJunctionsPerPct: number;
  countConduitsPerPct: number;
  countSubcatchPerPct: number;
  countOutfallsPerPct: number;
  countStoragePerPct: number;
  countSpecialLinkPerPct: number; // pumps, weirs, orifices combined
  orphanElementPenalty: number;   // per unmatched element

  // Geometry
  conduitLengthPerPct: number;    // per % diff
  conduitSlopePer001: number;     // per 0.001 abs diff in slope (derived from length+invert)
  junctionInvertPerM: number;     // per 1.0 elev diff (units of file)
  junctionMaxDepthPerPct: number;
  coordOffsetPerMeter: number;    // per meter offset between matched elements (cap)
  coordOffsetCapPerElement: number;

  // Hydraulics
  roughnessPer001: number;        // per 0.001 abs diff in Manning's n
  xsectionShapeMismatch: number;  // per pair
  xsectionGeom1PerPct: number;

  // Subcatchments
  areaPerPct: number;
  imperviousPerPct: number;       // % imperv field difference
  widthPerPct: number;
  subcatchSlopePerPct: number;

  // Hydrology / boundary
  raingageMismatch: number;       // per pair w/ different raingage assignment
  infiltrationMethodMismatch: number;
  outfallTypeMismatch: number;    // per outfall pair

  // Simulation
  flowUnitsMismatch: number;
  routingModelMismatch: number;
  timestepMismatch: number;

  // Category caps (max deduction any one category may contribute)
  capPerCategory: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  countJunctionsPerPct: 0.5,
  countConduitsPerPct: 0.5,
  countSubcatchPerPct: 0.5,
  countOutfallsPerPct: 1.0,
  countStoragePerPct: 1.0,
  countSpecialLinkPerPct: 1.0,
  orphanElementPenalty: 2,

  conduitLengthPerPct: 0.2,
  conduitSlopePer001: 1.0,
  junctionInvertPerM: 0.5,
  junctionMaxDepthPerPct: 0.1,
  coordOffsetPerMeter: 0.1,
  coordOffsetCapPerElement: 3,

  roughnessPer001: 0.5,
  xsectionShapeMismatch: 5,
  xsectionGeom1PerPct: 0.2,

  areaPerPct: 0.2,
  imperviousPerPct: 0.5,
  widthPerPct: 0.1,
  subcatchSlopePerPct: 0.1,

  raingageMismatch: 5,
  infiltrationMethodMismatch: 10,
  outfallTypeMismatch: 5,

  flowUnitsMismatch: 20,
  routingModelMismatch: 20,
  timestepMismatch: 5,

  capPerCategory: 250,
};

export type Category =
  | "Topology"
  | "Geometry"
  | "Hydraulics"
  | "Subcatchments"
  | "Hydrology"
  | "Boundary"
  | "Simulation";

export const CATEGORIES: Category[] = [
  "Topology", "Geometry", "Hydraulics",
  "Subcatchments", "Hydrology", "Boundary", "Simulation",
];
