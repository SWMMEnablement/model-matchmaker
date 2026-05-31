// InfoWorks ICM CSV-style export parser → normalized ParsedInp.
// Format is the multi-table CSV produced by ICM's "export network as
// open data":
//   TABLE,<table_name>
//   <header columns>
//   <row 1>
//   <row 2>
//   ...
//   (blank line, then next TABLE,...)
//
// Recognized tables:
//   hw_node       — ID, Type, GroundLevel, ChamberArea[, x, y]
//   hw_conduit    — ID, UsNode, DsNode, Length, Shape, Width, Height, Roughness_n
//   hw_subcatchment — ID, Area, Imperviousness, Width, Slope, OutletNode, Raingage
//   hw_outfall    — ID, GroundLevel, Type (also caught via hw_node Type=Outfall)

import type {
  ParsedInp, SwmmConduit, SwmmCoord, SwmmJunction, SwmmOutfall,
  SwmmSubcatchment, SwmmXsection,
} from "./parseInp";

const num = (s: string | undefined, d = 0): number => {
  if (s === undefined || s === "") return d;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : d;
};

interface IcmTable { name: string; header: string[]; rows: string[][]; }

function splitCsvLine(line: string): string[] {
  // simple CSV splitter — ICM exports don't use quoted commas in normal fields
  return line.split(",").map((s) => s.trim());
}

function parseTables(text: string): IcmTable[] {
  const lines = text.split(/\r?\n/);
  const tables: IcmTable[] = [];
  let current: IcmTable | null = null;
  let expectHeader = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("!") || line.startsWith("#")) continue;
    if (/^TABLE\s*,/i.test(line)) {
      const name = line.replace(/^TABLE\s*,/i, "").trim().toLowerCase();
      current = { name, header: [], rows: [] };
      tables.push(current);
      expectHeader = true;
      continue;
    }
    if (!current) continue;
    if (expectHeader) {
      current.header = splitCsvLine(line).map((c) => c.toLowerCase());
      expectHeader = false;
      continue;
    }
    current.rows.push(splitCsvLine(line));
  }
  return tables;
}

const idx = (header: string[], ...names: string[]): number => {
  for (const n of names) {
    const i = header.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
};

export function parseIcm(text: string): ParsedInp {
  const tables = parseTables(text);

  const junctions: SwmmJunction[] = [];
  const outfalls: SwmmOutfall[] = [];
  const coordinates: SwmmCoord[] = [];
  const nodeTable = tables.find((t) => t.name === "hw_node");
  if (nodeTable) {
    const iId  = idx(nodeTable.header, "id");
    const iTp  = idx(nodeTable.header, "type");
    const iElv = idx(nodeTable.header, "groundlevel", "elevation", "invert");
    const iX   = idx(nodeTable.header, "x");
    const iY   = idx(nodeTable.header, "y");
    for (const r of nodeTable.rows) {
      const id = r[iId];
      if (!id) continue;
      const type = (r[iTp] ?? "").toLowerCase();
      const elev = num(r[iElv]);
      if (type.includes("outfall")) {
        outfalls.push({ id, invertElev: elev, type: "FREE", stage: 0 });
      } else {
        junctions.push({
          id, invertElev: elev, maxDepth: 0,
          initDepth: 0, surDepth: 0, pondedArea: 0,
        });
      }
      if (iX >= 0 && iY >= 0 && r[iX] && r[iY]) {
        coordinates.push({ id, x: num(r[iX]), y: num(r[iY]) });
      }
    }
  }

  const conduits: SwmmConduit[] = [];
  const xsections: SwmmXsection[] = [];
  const condTable = tables.find((t) => t.name === "hw_conduit");
  if (condTable) {
    const iId  = idx(condTable.header, "id");
    const iUs  = idx(condTable.header, "usnode", "us_node", "fromnode");
    const iDs  = idx(condTable.header, "dsnode", "ds_node", "tonode");
    const iLen = idx(condTable.header, "length");
    const iShp = idx(condTable.header, "shape");
    const iW   = idx(condTable.header, "width", "diameter");
    const iH   = idx(condTable.header, "height");
    const iN   = idx(condTable.header, "roughness_n", "roughness", "manning_n");
    for (const r of condTable.rows) {
      const id = r[iId];
      if (!id) continue;
      conduits.push({
        id, fromNode: r[iUs] ?? "", toNode: r[iDs] ?? "",
        length: num(r[iLen]), roughness: num(r[iN]),
        inOffset: 0, outOffset: 0,
      });
      const shape = (r[iShp] ?? "CIRCULAR").toUpperCase();
      xsections.push({
        link: id,
        shape: shape === "CIRCULAR" ? "CIRCULAR" : shape,
        geom1: num(r[iW]),
        geom2: shape === "CIRCULAR" ? 0 : num(r[iH]),
        geom3: 0, geom4: 0, barrels: 1,
      });
    }
  }

  const subcatchments: SwmmSubcatchment[] = [];
  const scTable = tables.find((t) => t.name === "hw_subcatchment");
  if (scTable) {
    const iId  = idx(scTable.header, "id");
    const iA   = idx(scTable.header, "area");
    const iImp = idx(scTable.header, "imperviousness", "percentimperv");
    const iW   = idx(scTable.header, "width");
    const iSl  = idx(scTable.header, "slope");
    const iOut = idx(scTable.header, "outletnode", "outlet");
    const iRg  = idx(scTable.header, "raingage");
    for (const r of scTable.rows) {
      const id = r[iId];
      if (!id) continue;
      subcatchments.push({
        id, raingage: r[iRg] ?? "", outlet: r[iOut] ?? "",
        area: num(r[iA]), percentImperv: num(r[iImp]),
        width: num(r[iW]), slope: num(r[iSl]),
      });
    }
  }

  const sectionLineCounts: Record<string, number> = {};
  for (const t of tables) sectionLineCounts[t.name.toUpperCase()] = t.rows.length;

  return {
    title: "(InfoWorks ICM export)",
    options: {
      flowUnits: "", infiltration: "", flowRouting: "",
      startDate: "", endDate: "", reportStep: "", routingStep: "",
      raw: {},
    },
    junctions, outfalls, storage: [],
    conduits, xsections,
    subcatchments, subareas: [], infiltration: [],
    pumps: [], weirs: [], orifices: [],
    raingages: [], coordinates,
    sectionLineCounts,
  };
}
