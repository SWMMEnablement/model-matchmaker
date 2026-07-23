// Element-level exports for a single INP-vs-INP pair, used by the batch
// page's pair-inspection modal.
import type { ComponentDetails, ComponentDiff } from "./details";
import type { SimilarityReport } from "./score";

const esc = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const KINDS: (keyof ComponentDetails)[] = ["junctions", "conduits", "subcatchments", "outfalls"];

function rowsFor(kind: string, els: ComponentDiff[]): string[][] {
  const rows: string[][] = [];
  for (const e of els) {
    for (const p of e.props) {
      rows.push([
        kind, e.id, e.matchedBy, e.distance != null ? e.distance.toFixed(3) : "",
        String(e.matched), String(e.differed),
        p.name, p.status,
        p.a == null ? "" : String(p.a),
        p.b == null ? "" : String(p.b),
        p.delta ?? "",
      ]);
    }
  }
  return rows;
}

export function inpPairToCsv(
  nameA: string,
  nameB: string,
  score: SimilarityReport,
  details: ComponentDetails,
): string {
  const catRows = Object.entries(score.categoryScores).map(
    ([k, v]) => `${esc(k)},${v}`,
  );
  const header = [
    `# Pair element-level diff`,
    `# A: ${nameA}`,
    `# B: ${nameB}`,
    `# generated: ${new Date().toISOString()}`,
    `# overall_score: ${score.overall} / 1000`,
    ``,
    `# Category scores`,
    `category,score`,
    ...catRows,
    ``,
    `# Per-kind summary`,
    `kind,elements,matched_properties,differed_properties`,
    ...KINDS.map((k) => {
      const els = details[k];
      const m = els.reduce((s, e) => s + e.matched, 0);
      const d = els.reduce((s, e) => s + e.differed, 0);
      return `${k},${els.length},${m},${d}`;
    }),
    ``,
    `# Element-level rows`,
  ].join("\n");

  const cols = ["kind", "id", "matched_by", "distance", "matched_props", "differed_props", "property", "status", "a", "b", "delta"];
  const body: string[][] = [];
  for (const k of KINDS) body.push(...rowsFor(k, details[k]));
  return header + "\n" + [cols, ...body].map((r) => r.map(esc).join(",")).join("\n");
}

export function inpPairToJson(
  nameA: string,
  nameB: string,
  score: SimilarityReport,
  details: ComponentDetails,
): string {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    a: nameA,
    b: nameB,
    overall: score.overall,
    categoryScores: score.categoryScores,
    deductions: score.deductions,
    details: KINDS.reduce((acc, k) => {
      acc[k] = details[k].map((e) => ({
        id: e.id,
        matchedBy: e.matchedBy,
        distance: e.distance ?? null,
        matched: e.matched,
        differed: e.differed,
        properties: e.props,
      }));
      return acc;
    }, {} as Record<string, unknown>),
  }, null, 2);
}
