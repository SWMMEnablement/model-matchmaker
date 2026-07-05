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

export function outputReportToCsv(report: OutputReport): string {
  const header = ["kind", "id", "element_status", "property", "prop_status", "a", "b", "delta", "rel_err_pct"];
  const lines: string[][] = [header];
  lines.push(...rowsFor("node", report.elements.nodes));
  lines.push(...rowsFor("link", report.elements.links));
  lines.push(...rowsFor("subcatchment", report.elements.subcatchments));
  return lines.map((r) => r.map(esc).join(",")).join("\n");
}

export function downloadOutputCsv(report: OutputReport, filename = "output-diff.csv"): void {
  const csv = outputReportToCsv(report);
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
