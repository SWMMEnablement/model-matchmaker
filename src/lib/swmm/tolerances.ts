// User-adjustable deadbands for matching and scoring. Any |Δ| ≤ the
// relevant tolerance is treated as "match" by details.ts AND ignored by
// score.ts. Spatial distance is the hybrid-matcher cutoff in map units.

export interface NumericTolerances {
  spatialDistance: number;    // map units (m/ft) for coord-based matching
  invertElev: number;         // file units (m or ft) for node inverts
  conduitLengthPct: number;   // percent for conduit length
  roughness: number;          // absolute Manning's n (or HW C)
  areaPct: number;            // percent for subcatchment area
  imperviousPct: number;      // percentage points for %imperv
}

export const DEFAULT_TOLERANCES: NumericTolerances = {
  spatialDistance: 5,
  invertElev: 0.01,
  conduitLengthPct: 1,
  roughness: 0.0005,
  areaPct: 1,
  imperviousPct: 1,
};
