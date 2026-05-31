// EPANET .inp parser → normalized ParsedInp shape so the SWMM5 scoring
// engine can compare EPANET networks without a separate codepath.
// Mapping:
//   [JUNCTIONS]   id elev demand     → SwmmJunction (invertElev=elev)
//   [RESERVOIRS]  id head            → SwmmOutfall  (type=FIXED, stage=head)
//   [TANKS]       id elev ...        → SwmmStorage
//   [PIPES]       id n1 n2 L D C     → SwmmConduit + SwmmXsection (CIRCULAR, geom1=D)
//   [PUMPS]       id n1 n2 ...       → SwmmPump
//   [COORDINATES] id x y             → SwmmCoord
//   [OPTIONS]                        → flowUnits, headloss method (~routing)
// Roughness is EPANET's Hazen-Williams C (or D-W ε / Manning's n
// depending on headloss). We store the raw value; diff calc still
// applies. Diameter is preserved in the units EPANET uses (mm or in).

import type {
  ParsedInp, SwmmConduit, SwmmCoord, SwmmJunction, SwmmOutfall,
  SwmmPump, SwmmStorage, SwmmXsection,
} from "./parseInp";

const num = (s: string | undefined, d = 0): number => {
  if (s === undefined) return d;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : d;
};

function sectionize(text: string): { sections: Record<string, string[][]>; title: string } {
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
    if (current === "TITLE") { titleLines.push(line); continue; }
    if (!current) continue;
    sections[current].push(line.split(/\s+/));
  }
  return { sections, title: titleLines.join(" ").slice(0, 200) };
}

export function parseEpanet(text: string): ParsedInp {
  const { sections, title } = sectionize(text);

  const rawOptions: Record<string, string> = {};
  for (const row of sections.OPTIONS ?? []) {
    if (row.length >= 2) rawOptions[row[0].toUpperCase()] = row.slice(1).join(" ");
  }

  const junctions: SwmmJunction[] = (sections.JUNCTIONS ?? []).map((r) => ({
    id: r[0], invertElev: num(r[1]),
    maxDepth: 0, initDepth: 0, surDepth: 0, pondedArea: 0,
  }));
  const outfalls: SwmmOutfall[] = (sections.RESERVOIRS ?? []).map((r) => ({
    id: r[0], invertElev: num(r[1]), type: "FIXED", stage: num(r[1]),
  }));
  const storage: SwmmStorage[] = (sections.TANKS ?? []).map((r) => ({
    id: r[0], invertElev: num(r[1]), maxDepth: num(r[3]),
  }));
  const conduits: SwmmConduit[] = (sections.PIPES ?? []).map((r) => ({
    id: r[0], fromNode: r[1], toNode: r[2],
    length: num(r[3]), roughness: num(r[5]),
    inOffset: 0, outOffset: 0,
  }));
  const xsections: SwmmXsection[] = (sections.PIPES ?? []).map((r) => ({
    link: r[0], shape: "CIRCULAR",
    geom1: num(r[4]) / 1000, // EPANET diam is mm or in; rescale mm→m
    geom2: 0, geom3: 0, geom4: 0, barrels: 1,
  }));
  const pumps: SwmmPump[] = (sections.PUMPS ?? []).map((r) => ({
    id: r[0], fromNode: r[1], toNode: r[2],
  }));
  const coordinates: SwmmCoord[] = (sections.COORDINATES ?? []).map((r) => ({
    id: r[0], x: num(r[1]), y: num(r[2]),
  }));

  const sectionLineCounts: Record<string, number> = {};
  for (const k of Object.keys(sections)) sectionLineCounts[k] = sections[k].length;

  return {
    title: title || "(EPANET model)",
    options: {
      flowUnits: rawOptions.UNITS ?? rawOptions.FLOW_UNITS ?? "",
      infiltration: "",
      flowRouting: rawOptions.HEADLOSS ?? "",
      startDate: "", endDate: "", reportStep: "", routingStep: "",
      raw: rawOptions,
    },
    junctions, outfalls, storage,
    conduits, xsections,
    subcatchments: [], subareas: [], infiltration: [],
    pumps, weirs: [], orifices: [],
    raingages: [], coordinates,
    sectionLineCounts,
  };
}
