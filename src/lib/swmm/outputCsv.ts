// CSV export for output comparison diffs.
import type { OutputReport, OutputElementDiff } from "./outputCompare";

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

interface ExportOptions {
  scope: "all" | "current-view";
  activeKind?: "node" | "link" | "subcatchment";
  filterLabel?: string;
}

function buildSummary(
  report: OutputReport,
  perKind: KindStats[],
  opts: ExportOptions,
): string[][] {
  const rows: string[][] = [];
  rows.push(["# Output similarity export"]);
  rows.push(["# Scope", opts.scope]);
  if (opts.filterLabel) rows.push(["# Filter", opts.filterLabel]);
  rows.push(["# Overall score", String(report.overall), "/ 1000"]);
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

function triggerDownload(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
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
export function outputReportToCsv(report: OutputReport): string {
  const perKind: KindStats[] = [
    statsFor("node", report.elements.nodes),
    statsFor("link", report.elements.links),
    statsFor("subcatchment", report.elements.subcatchments),
  ];
  const rows = buildSummary(report, perKind, { scope: "all" });
  rows.push(HEADER);
  rows.push(...rowsFor("node", report.elements.nodes));
  rows.push(...rowsFor("link", report.elements.links));
  rows.push(...rowsFor("subcatchment", report.elements.subcatchments));
  return serialise(rows);
}

export function downloadOutputCsv(report: OutputReport, filename = "output-diff.csv"): void {
  triggerDownload(outputReportToCsv(report), filename);
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
  filterLabel: string,
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
  ], { scope: "current-view", activeKind, filterLabel });
  rows.push(HEADER);
  rows.push(...rowsFor(activeKind, visible));
  return serialise(rows);
}

export function downloadCurrentViewCsv(
  report: OutputReport,
  visible: OutputElementDiff[],
  activeKind: "node" | "link" | "subcatchment",
  filterLabel: string,
  filename = "output-diff-view.csv",
): void {
  triggerDownload(outputCurrentViewToCsv(report, visible, activeKind, filterLabel), filename);
}
