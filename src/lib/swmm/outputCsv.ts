// CSV + JSON export for output comparison diffs.
import type { OutputReport, OutputElementDiff } from "./outputCompare";
import type { OutputTolerances } from "./outputCompare";

const esc = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function rowsFor(kind: string, els: OutputElementDiff[]): string[][] {
  const rows: string[][] = [];
  for (const e of els) {
    if (e.props.length === 0) {
      rows.push([kind, e.id, e.status, "", "", "", "", "", ""]);
      continue;
    }
    for (const p of e.props) {
      rows.push([
        kind,
        e.id,
        e.status,
        p.name,
        p.status,
        p.a == null ? "" : String(p.a),
        p.b == null ? "" : String(p.b),
        p.delta,
        (p.pct * 100).toFixed(3),
      ]);
    }
  }
  return rows;
}

interface KindStats {
  kind: string;
  total: number;
  matched: number;
  differed: number;
  onlyA: number;
  onlyB: number;
  worstId: string;
  worstPct: number;
}

function statsFor(kind: string, els: OutputElementDiff[]): KindStats {
  let matched = 0, differed = 0, onlyA = 0, onlyB = 0;
  let worstId = "", worstPct = 0;
  for (const e of els) {
    if (e.status === "match") matched++;
    else if (e.status === "only-a") onlyA++;
    else if (e.status === "only-b") onlyB++;
    else differed++;
    if (e.worstPct > worstPct) { worstPct = e.worstPct; worstId = e.id; }
  }
  return { kind, total: els.length, matched, differed, onlyA, onlyB, worstId, worstPct };
}

export interface ViewState {
  tab?: string;
  search?: string;
  statusFilter?: string;
  sortBy?: string;
}

interface ExportOptions {
  scope: "all" | "current-view";
  activeKind?: "node" | "link" | "subcatchment";
  view?: ViewState;
  tolerances?: OutputTolerances;
}

function buildSummary(
  report: OutputReport,
  perKind: KindStats[],
  opts: ExportOptions,
): string[][] {
  const rows: string[][] = [];
  rows.push(["# Output similarity export"]);
  rows.push(["# Generated", new Date().toISOString()]);
  rows.push(["# Scope", opts.scope]);
  rows.push(["# Overall score", String(report.overall), "/ 1000"]);

  if (opts.view) {
    rows.push([]);
    rows.push(["# View state"]);
    rows.push(["#", "Active tab", opts.view.tab ?? ""]);
    rows.push(["#", "Search", opts.view.search ?? ""]);
    rows.push(["#", "Status filter", opts.view.statusFilter ?? ""]);
    rows.push(["#", "Sort", opts.view.sortBy ?? ""]);
  }

  if (opts.tolerances) {
    rows.push([]);
    rows.push(["# Tolerances"]);
    rows.push(["#", "Node depth Δ %", String(opts.tolerances.depthPct)]);
    rows.push(["#", "Link flow Δ %", String(opts.tolerances.flowPct)]);
    rows.push(["#", "Sub runoff Δ %", String(opts.tolerances.runoffPct)]);
    rows.push(["#", "Continuity Δ % abs", String(opts.tolerances.continuityPct)]);
  }

  rows.push([]);
  rows.push(["# Category", "Score", "RMS rel. err %", "Elements"]);
  for (const c of report.categories) {
    rows.push(["#", c.label, String(c.score), c.rmsePct.toFixed(3), String(c.count)]);
  }
  rows.push([]);
  rows.push(["# Kind", "Total", "Matched", "Differed", "Only A", "Only B", "Worst element", "Worst rel. err %"]);
  for (const s of perKind) {
    rows.push([
      "#", s.kind, String(s.total), String(s.matched), String(s.differed),
      String(s.onlyA), String(s.onlyB),
      s.worstId || "—",
      s.total > 0 ? (s.worstPct * 100).toFixed(3) : "—",
    ]);
  }
  rows.push([]);
  return rows;
}

const HEADER = ["kind", "id", "element_status", "property", "prop_status", "a", "b", "delta", "rel_err_pct"];

function serialise(rows: string[][]): string {
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export the entire report (all kinds, unfiltered) with a summary header.
 */
export function outputReportToCsv(report: OutputReport, tolerances?: OutputTolerances): string {
  const perKind: KindStats[] = [
    statsFor("node", report.elements.nodes),
    statsFor("link", report.elements.links),
    statsFor("subcatchment", report.elements.subcatchments),
  ];
  const rows = buildSummary(report, perKind, { scope: "all", tolerances });
  rows.push(HEADER);
  rows.push(...rowsFor("node", report.elements.nodes));
  rows.push(...rowsFor("link", report.elements.links));
  rows.push(...rowsFor("subcatchment", report.elements.subcatchments));
  return serialise(rows);
}

export function downloadOutputCsv(
  report: OutputReport,
  filename = "output-diff.csv",
  tolerances?: OutputTolerances,
): void {
  triggerDownload(outputReportToCsv(report, tolerances), filename, "text/csv");
}

/**
 * Export only the rows currently visible after search / filter / sort on the
 * active tab. Summary section reflects the visible slice for the active kind
 * and reports full totals for the other kinds so the reader keeps context.
 */
export function outputCurrentViewToCsv(
  report: OutputReport,
  visible: OutputElementDiff[],
  activeKind: "node" | "link" | "subcatchment",
  view: ViewState,
  tolerances?: OutputTolerances,
): string {
  const visibleStats = statsFor(activeKind, visible);
  const other: KindStats[] = (
    activeKind === "node"
      ? [statsFor("link", report.elements.links), statsFor("subcatchment", report.elements.subcatchments)]
      : activeKind === "link"
      ? [statsFor("node", report.elements.nodes), statsFor("subcatchment", report.elements.subcatchments)]
      : [statsFor("node", report.elements.nodes), statsFor("link", report.elements.links)]
  ).map((s) => ({ ...s, kind: `${s.kind} (full)` }));

  const rows = buildSummary(report, [
    { ...visibleStats, kind: `${activeKind} (visible)` },
    ...other,
  ], { scope: "current-view", activeKind, view, tolerances });
  rows.push(HEADER);
  rows.push(...rowsFor(activeKind, visible));
  return serialise(rows);
}

export function downloadCurrentViewCsv(
  report: OutputReport,
  visible: OutputElementDiff[],
  activeKind: "node" | "link" | "subcatchment",
  view: ViewState,
  filename = "output-diff-view.csv",
  tolerances?: OutputTolerances,
): void {
  triggerDownload(
    outputCurrentViewToCsv(report, visible, activeKind, view, tolerances),
    filename,
    "text/csv",
  );
}

/**
 * JSON export of the currently-visible rows, including per-element props with
 * A/B values and deltas, plus the summary/view/tolerance context.
 */
export function outputCurrentViewToJson(
  report: OutputReport,
  visible: OutputElementDiff[],
  activeKind: "node" | "link" | "subcatchment",
  view: ViewState,
  tolerances?: OutputTolerances,
): string {
  const visibleStats = statsFor(activeKind, visible);
  const payload = {
    generatedAt: new Date().toISOString(),
    scope: "current-view" as const,
    overall: report.overall,
    categories: report.categories,
    continuity: report.continuity,
    tolerances: tolerances ?? null,
    view,
    activeKind,
    stats: {
      visible: visibleStats,
      full: {
        node: statsFor("node", report.elements.nodes),
        link: statsFor("link", report.elements.links),
        subcatchment: statsFor("subcatchment", report.elements.subcatchments),
      },
    },
    elements: visible.map((e) => ({
      id: e.id,
      kind: e.kind,
      status: e.status,
      matched: e.matched,
      differs: e.differs,
      worstRelErrPct: e.worstPct * 100,
      properties: e.props.map((p) => ({
        name: p.name,
        status: p.status,
        a: p.a,
        b: p.b,
        delta: p.delta,
        relErrPct: p.pct * 100,
      })),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadCurrentViewJson(
  report: OutputReport,
  visible: OutputElementDiff[],
  activeKind: "node" | "link" | "subcatchment",
  view: ViewState,
  filename = "output-diff-view.json",
  tolerances?: OutputTolerances,
): void {
  triggerDownload(
    outputCurrentViewToJson(report, visible, activeKind, view, tolerances),
    filename,
    "application/json",
  );
}
