// Single source of truth for format-support maturity. Referenced from the
// landing page, methodology, compare, and batch pages so the product
// tells one consistent story about what is actually implemented.

export type SupportLevel =
  | "Implemented"
  | "Beta"
  | "Experimental"
  | "Structural only"
  | "Adapter required";

export interface FormatSupport {
  format: string;
  level: SupportLevel;
  scope: string;
}

export const FORMAT_SUPPORT: FormatSupport[] = [
  { format: "SWMM5 .inp",       level: "Implemented",      scope: "Full pairwise index across all seven categories." },
  { format: "SWMM5 .rpt",       level: "Beta",             scope: "Node/link/subcatchment summary comparison." },
  { format: "EPANET .inp",      level: "Experimental",     scope: "Structural comparison only — pressurized-pipe physics is not equivalent to SWMM drainage." },
  { format: "EPANET .rpt",      level: "Experimental",     scope: "Summary comparison; not validated against pinned EPANET builds." },
  { format: "InfoWorks ICM CSV", level: "Adapter required", scope: "Requires an export profile that maps to the SWMM element schema. Generic ICM CSV is not supported." },
  { format: "SWMM ↔ EPANET",    level: "Structural only",  scope: "Topology and geometry only. No hydraulic-equivalence claim." },
  { format: "SWMM ↔ ICM",       level: "Adapter required", scope: "Meaningful when the ICM export profile is declared." },
];

export const LEVEL_TONE: Record<SupportLevel, string> = {
  "Implemented":       "text-success border-success/40 bg-success/10",
  "Beta":              "text-primary border-primary/40 bg-primary/10",
  "Experimental":      "text-warning border-warning/40 bg-warning/10",
  "Structural only":   "text-warning border-warning/40 bg-warning/10",
  "Adapter required":  "text-muted-foreground border-border bg-secondary",
};
