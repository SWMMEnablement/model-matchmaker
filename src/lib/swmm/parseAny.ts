// Format dispatcher. Sniffs file content to choose the right parser so
// upload/fixture flows don't need the user to declare the format.

import { parseInp, type ParsedInp } from "./parseInp";
import { parseEpanet } from "./parseEpanet";
import { parseIcm } from "./parseIcm";

export type ModelFormat = "SWMM5" | "EPANET" | "ICM";

export interface ParsedAny {
  format: ModelFormat;
  parsed: ParsedInp;
}

export function detectFormat(text: string): ModelFormat {
  const head = text.slice(0, 4000).toUpperCase();
  if (/\bTABLE\s*,\s*HW_/.test(head)) return "ICM";
  // EPANET has [PIPES] / [RESERVOIRS] and no [SUBCATCHMENTS]
  const hasEpanetSections = /\[PIPES\]/.test(head) || /\[RESERVOIRS\]/.test(head);
  const hasSwmmSections =
    /\[SUBCATCHMENTS\]/.test(head) || /\[CONDUITS\]/.test(head) ||
    /\[XSECTIONS\]/.test(head)     || /\[OUTFALLS\]/.test(head);
  if (hasEpanetSections && !hasSwmmSections) return "EPANET";
  return "SWMM5";
}

export function parseAny(text: string, hint?: ModelFormat): ParsedAny {
  const format = hint ?? detectFormat(text);
  switch (format) {
    case "EPANET": return { format, parsed: parseEpanet(text) };
    case "ICM":    return { format, parsed: parseIcm(text) };
    default:       return { format: "SWMM5", parsed: parseInp(text) };
  }
}
