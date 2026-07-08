import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { parseAny, type ModelFormat } from "@/lib/swmm/parseAny";
import type { ParsedInp } from "@/lib/swmm/parseInp";
import { scoreModels } from "@/lib/swmm/score";
import { DEFAULT_WEIGHTS } from "@/lib/swmm/weights";
import { DEFAULT_TOLERANCES } from "@/lib/swmm/tolerances";
import { parseAnyRpt, type RptFormat } from "@/lib/swmm/parseAnyRpt";
import type { ParsedRpt } from "@/lib/swmm/parseRpt";
import { compareOutputs, DEFAULT_OUTPUT_TOLERANCES } from "@/lib/swmm/outputCompare";

export const Route = createFileRoute("/batch")({
  head: () => ({
    meta: [
      { title: "Batch similarity — SWMM5 Similarity Index" },
      { name: "description", content: "Pick a folder of .inp or .rpt files and get an N×N similarity heatmap plus a cross-type .inp × .rpt coverage matrix." },
    ],
  }),
  component: BatchPage,
});

const APP_VERSION = "batch-similarity/1.1.0";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

interface InpEntry  { name: string; parsed: ParsedInp; format: ModelFormat; }
interface RptEntry  { name: string; parsed: ParsedRpt; format: RptFormat;   }
interface FailEntry { name: string; kind: "inp" | "rpt"; error: string; }

interface Ranking { name: string; avg: number; rank: number; }

interface Matrix {
  kind: "inp" | "rpt" | "cross";
  rowLabels: string[];
  colLabels: string[];
  scores: number[][];      // rows × cols
  avgOthers: number[];     // row-wise mean excluding self (or full mean for cross)
  ranking: Ranking[];      // sorted by avgOthers desc
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

const isInp = (n: string) => /\.inp$/i.test(n);
const isRpt = (n: string) => /\.(rpt|csv|txt)$/i.test(n);

/** Heatmap color: green (high) → amber (mid) → red (low). */
function heatStyle(score: number, self = false): React.CSSProperties {
  if (self) return { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" };
  const s = Math.max(0, Math.min(1000, score)) / 1000;
  const hue = 0 + s * 130;              // 0 red → 130 green
  const light = 22 + (1 - s) * 8;       // darker for high scores → readable text
  const alpha = 0.35 + s * 0.55;
  return {
    background: `hsla(${hue.toFixed(0)}, 70%, ${light.toFixed(0)}%, ${alpha.toFixed(2)})`,
    color: "hsl(0 0% 98%)",
  };
}

function rankOf(labels: string[], avg: number[]): Ranking[] {
  return labels
    .map((name, i) => ({ name, avg: avg[i], rank: 0 }))
    .sort((a, b) => b.avg - a.avg)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

function buildInpMatrix(entries: InpEntry[]): Matrix {
  const n = entries.length;
  const scores: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    scores[i][i] = 1000;
    for (let j = i + 1; j < n; j++) {
      let v = 0;
      try { v = scoreModels(entries[i].parsed, entries[j].parsed).overall; } catch { v = 0; }
      scores[i][j] = v; scores[j][i] = v;
    }
  }
  const labels = entries.map((e) => e.name);
  const avg = scores.map((row, i) =>
    n > 1 ? Math.round(row.reduce((s, v, j) => (i === j ? s : s + v), 0) / (n - 1)) : 1000,
  );
  return { kind: "inp", rowLabels: labels, colLabels: labels, scores, avgOthers: avg, ranking: rankOf(labels, avg) };
}

function buildRptMatrix(entries: RptEntry[]): Matrix {
  const n = entries.length;
  const scores: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    scores[i][i] = 1000;
    for (let j = i + 1; j < n; j++) {
      let v = 0;
      try { v = compareOutputs(entries[i].parsed, entries[j].parsed).overall; } catch { v = 0; }
      scores[i][j] = v; scores[j][i] = v;
    }
  }
  const labels = entries.map((e) => e.name);
  const avg = scores.map((row, i) =>
    n > 1 ? Math.round(row.reduce((s, v, j) => (i === j ? s : s + v), 0) / (n - 1)) : 1000,
  );
  return { kind: "rpt", rowLabels: labels, colLabels: labels, scores, avgOthers: avg, ranking: rankOf(labels, avg) };
}

// ── Cross-type coverage ──────────────────────────────────────────
// Compares an INP model against an RPT report by ID overlap per element class.
// Score = weighted coverage: fraction of RPT element IDs that also appear in the
// INP model, weighted by category counts. 1000 = every reported element is
// declared in the model; 0 = no overlap at all.

interface CoverageDetail {
  score: number;
  nodes: { overlap: number; rptCount: number };
  links: { overlap: number; rptCount: number };
  subs:  { overlap: number; rptCount: number };
  missing: { nodes: string[]; links: string[]; subs: string[] };
}

function inpIds(p: ParsedInp): { nodes: Set<string>; links: Set<string>; subs: Set<string> } {
  const nodes = new Set<string>();
  p.junctions.forEach((x) => nodes.add(x.id));
  p.outfalls.forEach((x) => nodes.add(x.id));
  p.storage.forEach((x) => nodes.add(x.id));
  const links = new Set<string>();
  p.conduits.forEach((x) => links.add(x.id));
  p.pumps.forEach((x) => links.add(x.id));
  p.weirs.forEach((x) => links.add(x.id));
  p.orifices.forEach((x) => links.add(x.id));
  const subs = new Set<string>();
  p.subcatchments.forEach((x) => subs.add(x.id));
  return { nodes, links, subs };
}

function coverage(inp: ParsedInp, rpt: ParsedRpt): CoverageDetail {
  const ids = inpIds(inp);
  const rNodes = new Set([...rpt.nodeDepth.map((x) => x.id), ...rpt.nodeFlooding.map((x) => x.id)]);
  const rLinks = new Set(rpt.linkFlow.map((x) => x.id));
  const rSubs  = new Set(rpt.subRunoff.map((x) => x.id));

  const hit = (want: Set<string>, have: Set<string>) => {
    let n = 0; const miss: string[] = [];
    want.forEach((id) => { if (have.has(id)) n++; else miss.push(id); });
    return { n, miss };
  };
  const n = hit(rNodes, ids.nodes);
  const l = hit(rLinks, ids.links);
  const s = hit(rSubs,  ids.subs);

  const total = rNodes.size + rLinks.size + rSubs.size;
  const hits  = n.n + l.n + s.n;
  const score = total === 0 ? 0 : Math.round((hits / total) * 1000);

  return {
    score,
    nodes: { overlap: n.n, rptCount: rNodes.size },
    links: { overlap: l.n, rptCount: rLinks.size },
    subs:  { overlap: s.n, rptCount: rSubs.size  },
    missing: { nodes: n.miss.slice(0, 20), links: l.miss.slice(0, 20), subs: s.miss.slice(0, 20) },
  };
}

function buildCrossMatrix(inps: InpEntry[], rpts: RptEntry[]): Matrix {
  const rows = inps.length, cols = rpts.length;
  const scores: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      try { scores[i][j] = coverage(inps[i].parsed, rpts[j].parsed).score; }
      catch { scores[i][j] = 0; }
    }
  }
  const rowLabels = inps.map((e) => e.name);
  const colLabels = rpts.map((e) => e.name);
  const avg = scores.map((row) => cols === 0 ? 0 : Math.round(row.reduce((s, v) => s + v, 0) / cols));
  return { kind: "cross", rowLabels, colLabels, scores, avgOthers: avg, ranking: rankOf(rowLabels, avg) };
}

// ── Export ──────────────────────────────────────────────────────

const esc = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

interface ExportMeta {
  folder: string;
  generatedAt: string;
  appVersion: string;
  scoring: Record<string, unknown>;
}

function meta(folder: string): ExportMeta {
  return {
    folder,
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    scoring: {
      inpWeights: DEFAULT_WEIGHTS,
      inpTolerances: DEFAULT_TOLERANCES,
      rptTolerances: DEFAULT_OUTPUT_TOLERANCES,
      crossMetric: "ID coverage: |RPT_ids ∩ INP_ids| / |RPT_ids|, weighted equally across nodes/links/subs, scaled to 0-1000",
      scale: "0-1000 (higher = more similar)",
    },
  };
}

function matrixToCsv(m: Matrix, meta: ExportMeta, title: string): string {
  const header: string[] = [];
  header.push(`# ${title}`);
  header.push(`# folder: ${meta.folder}`);
  header.push(`# generated: ${meta.generatedAt}`);
  header.push(`# version: ${meta.appVersion}`);
  header.push(`# scale: 0-1000`);
  header.push(`# rows: ${m.rowLabels.length}  cols: ${m.colLabels.length}  type: ${m.kind}`);
  header.push(`# scoring: ${JSON.stringify(meta.scoring)}`);
  header.push("");

  const rowHeader = ["file", ...m.colLabels, "avg_vs_others", "rank"];
  const rankByName = new Map(m.ranking.map((r) => [r.name, r.rank]));
  const body = m.rowLabels.map((l, i) => [
    l,
    ...m.scores[i].map(String),
    String(m.avgOthers[i]),
    String(rankByName.get(l) ?? ""),
  ]);
  const rankingBlock = [
    "",
    "# Ranking (highest avg-vs-others first)",
    ["rank", "file", "avg_vs_others"].join(","),
    ...m.ranking.map((r) => [r.rank, esc(r.name), r.avg].join(",")),
  ];
  return header.join("\n") + "\n"
    + [rowHeader, ...body].map((r) => r.map(esc).join(",")).join("\n")
    + "\n" + rankingBlock.join("\n");
}

function matrixToJson(m: Matrix, meta: ExportMeta): string {
  const rankByName = new Map(m.ranking.map((r) => [r.name, r.rank]));
  const pairs: { row: string; col: string; score: number }[] = [];
  for (let i = 0; i < m.rowLabels.length; i++) {
    for (let j = 0; j < m.colLabels.length; j++) {
      if (m.kind !== "cross" && i === j) continue;
      pairs.push({ row: m.rowLabels[i], col: m.colLabels[j], score: m.scores[i][j] });
    }
  }
  const payload = {
    ...meta,
    matrix: {
      kind: m.kind,
      rows: m.rowLabels,
      cols: m.colLabels,
      scores: m.scores,
      avgVsOthers: m.rowLabels.map((name, i) => ({
        name,
        avg: m.avgOthers[i],
        rank: rankByName.get(name) ?? null,
      })),
      ranking: m.ranking,
      pairs,
    },
  };
  return JSON.stringify(payload, null, 2);
}

function download(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────────────────────
// Matrix table (heatmap)
// ────────────────────────────────────────────────────────────────

function MatrixTable({
  m, onCell, rowAxisLabel, colAxisLabel,
}: {
  m: Matrix;
  onCell?: (i: number, j: number) => void;
  rowAxisLabel: string;
  colAxisLabel: string;
}) {
  if (m.rowLabels.length === 0 || m.colLabels.length === 0) return null;
  const rankByName = new Map(m.ranking.map((r) => [r.name, r.rank]));
  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse font-mono text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-border bg-card p-2 text-left">
              {rowAxisLabel} ＼ {colAxisLabel}
            </th>
            {m.colLabels.map((l) => (
              <th
                key={l}
                className="border-b border-border bg-card p-2 text-center whitespace-nowrap max-w-[10rem] truncate"
                title={l}
              >
                {l.split("/").pop()}
              </th>
            ))}
            <th className="border-b border-border bg-card p-2 text-center">avg</th>
            <th className="border-b border-border bg-card p-2 text-center">rank</th>
          </tr>
        </thead>
        <tbody>
          {m.rowLabels.map((row, i) => (
            <tr key={row}>
              <th
                className="sticky left-0 z-10 border-b border-border/40 bg-card p-2 text-left max-w-[18rem] truncate"
                title={row}
              >
                {row.split("/").pop()}
              </th>
              {m.colLabels.map((col, j) => {
                const v = m.scores[i][j];
                const self = m.kind !== "cross" && i === j;
                return (
                  <td
                    key={j}
                    onClick={() => !self && onCell?.(i, j)}
                    style={heatStyle(v, self)}
                    className={`border border-background/40 p-2 text-center ${self ? "" : "cursor-pointer hover:outline hover:outline-2 hover:outline-primary"}`}
                    title={self ? "self" : `${row} vs ${col}: ${v}`}
                  >
                    {self ? "—" : v}
                  </td>
                );
              })}
              <td style={heatStyle(m.avgOthers[i])} className="border border-background/40 p-2 text-center font-bold">
                {m.avgOthers[i]}
              </td>
              <td className="border-b border-border/40 p-2 text-center text-muted-foreground">
                #{rankByName.get(row) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankingList({ m }: { m: Matrix }) {
  if (m.ranking.length === 0) return null;
  return (
    <div className="mt-3 rounded-md border border-border bg-card/50 p-3">
      <div className="mb-1 text-xs font-mono uppercase tracking-widest text-muted-foreground">
        Ranking by avg vs others
      </div>
      <ol className="space-y-0.5 font-mono text-xs">
        {m.ranking.map((r) => (
          <li key={r.name} className="flex items-center gap-3">
            <span className="w-8 text-right text-muted-foreground">#{r.rank}</span>
            <span style={heatStyle(r.avg)} className="w-14 rounded px-2 py-0.5 text-center">{r.avg}</span>
            <span className="truncate" title={r.name}>{r.name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────

function BatchPage() {
  const [inps, setInps] = useState<InpEntry[]>([]);
  const [rpts, setRpts] = useState<RptEntry[]>([]);
  const [failed, setFailed] = useState<FailEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [folderName, setFolderName] = useState<string>("");
  const [detail, setDetail] = useState<{ title: string; text: string } | null>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setDetail(null);
    const okInp: InpEntry[] = [];
    const okRpt: RptEntry[] = [];
    const bad: FailEntry[] = [];

    const first = files[0] as File & { webkitRelativePath?: string };
    const root = first.webkitRelativePath?.split("/")[0] ?? "(files)";
    setFolderName(root);

    for (const f of Array.from(files)) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      try {
        if (isInp(rel)) {
          const text = await f.text();
          const parsed = parseAny(text);
          okInp.push({ name: rel, parsed: parsed.parsed, format: parsed.format });
        } else if (isRpt(rel)) {
          const text = await f.text();
          const parsed = parseAnyRpt(text);
          okRpt.push({ name: rel, parsed: parsed.parsed, format: parsed.format });
        }
      } catch (e) {
        bad.push({ name: rel, kind: isInp(rel) ? "inp" : "rpt", error: e instanceof Error ? e.message : String(e) });
      }
    }

    setInps(okInp); setRpts(okRpt); setFailed(bad); setBusy(false);
  }, []);

  const inpMatrix = useMemo(() => buildInpMatrix(inps), [inps]);
  const rptMatrix = useMemo(() => buildRptMatrix(rpts), [rpts]);
  const crossMatrix = useMemo(() => buildCrossMatrix(inps, rpts), [inps, rpts]);
  const exportMeta = useMemo(() => meta(folderName || "batch"), [folderName]);

  const openInpDetail = useCallback((i: number, j: number) => {
    try {
      const r = scoreModels(inps[i].parsed, inps[j].parsed);
      const top = r.deductions.slice().sort((a, b) => b.amount - a.amount).slice(0, 8);
      const lines = [
        `Score: ${r.overall} / 1000`,
        "",
        "Top deductions:",
        ...top.map((d) => `  −${d.amount.toFixed(1)}  [${d.category}]  ${d.label}${d.detail ? " — " + d.detail : ""}`),
      ];
      setDetail({ title: `${inps[i].name}  vs  ${inps[j].name}`, text: lines.join("\n") });
    } catch (e) {
      setDetail({ title: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }, [inps]);

  const openRptDetail = useCallback((i: number, j: number) => {
    try {
      const r = compareOutputs(rpts[i].parsed, rpts[j].parsed);
      const lines = [
        `Output score: ${r.overall} / 1000`,
        "",
        "Categories:",
        ...r.categories.map((c) => `  ${c.label.padEnd(14)}  ${c.score}  (rms rel err ${c.rmsePct.toFixed(2)}%, n=${c.count})`),
        "",
        `Continuity Δ runoff: ${r.continuity.deltaRunoffPct?.toFixed(3) ?? "—"} %`,
        `Continuity Δ flow  : ${r.continuity.deltaFlowPct?.toFixed(3) ?? "—"} %`,
      ];
      setDetail({ title: `${rpts[i].name}  vs  ${rpts[j].name}`, text: lines.join("\n") });
    } catch (e) {
      setDetail({ title: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }, [rpts]);

  const openCrossDetail = useCallback((i: number, j: number) => {
    try {
      const c = coverage(inps[i].parsed, rpts[j].parsed);
      const lines = [
        `Coverage score: ${c.score} / 1000  (fraction of reported IDs found in the input model)`,
        "",
        `Nodes : ${c.nodes.overlap} / ${c.nodes.rptCount} matched`,
        `Links : ${c.links.overlap} / ${c.links.rptCount} matched`,
        `Subs  : ${c.subs.overlap}  / ${c.subs.rptCount}  matched`,
        "",
        c.missing.nodes.length ? `Missing nodes (first ${c.missing.nodes.length}): ${c.missing.nodes.join(", ")}` : "",
        c.missing.links.length ? `Missing links (first ${c.missing.links.length}): ${c.missing.links.join(", ")}` : "",
        c.missing.subs.length  ? `Missing subs  (first ${c.missing.subs.length}): ${c.missing.subs.join(", ")}`  : "",
      ].filter(Boolean);
      setDetail({ title: `${inps[i].name}  ↔  ${rpts[j].name}`, text: lines.join("\n") });
    } catch (e) {
      setDetail({ title: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }, [inps, rpts]);

  const exportButtons = (m: Matrix, base: string, title: string) => (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => download(matrixToCsv(m, exportMeta, title), `${folderName || "batch"}-${base}.csv`, "text/csv;charset=utf-8")}
        className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20 cursor-pointer"
      >
        ↓ CSV
      </button>
      <button
        type="button"
        onClick={() => download(matrixToJson(m, exportMeta), `${folderName || "batch"}-${base}.json`, "application/json")}
        className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20 cursor-pointer"
      >
        ↓ JSON
      </button>
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Batch similarity across a folder</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Pick a folder of hydraulic model files. Inputs are scored against inputs, results against results,
        and a cross-type matrix scores every <code className="font-mono text-xs">.inp</code> against every
        <code className="font-mono text-xs"> .rpt</code>/<code className="font-mono text-xs">.csv</code> by
        reported-ID coverage. Everything runs in the browser — no files leave your machine.
      </p>

      <div className="mt-6 rounded-lg border border-dashed border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-mono text-primary hover:bg-primary/20">
            Choose folder…
            <input
              type="file"
              // @ts-expect-error webkitdirectory is a non-standard HTML attribute
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
          <label className="cursor-pointer rounded-md border border-border bg-secondary px-4 py-2 text-sm font-mono hover:bg-secondary/80">
            …or pick files
            <input
              type="file"
              multiple
              accept=".inp,.rpt,.csv,.txt,text/plain"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
          {folderName && (
            <span className="font-mono text-xs text-muted-foreground">
              root: <span className="text-foreground">{folderName}</span> · {inps.length} .inp · {rpts.length} .rpt/.csv · {failed.length} failed
            </span>
          )}
        </div>
        {busy && <div className="mt-3 text-sm text-muted-foreground">Parsing and scoring…</div>}
      </div>

      {inps.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-semibold">Input models (.inp) — {inps.length}×{inps.length}</h2>
              <p className="text-sm text-muted-foreground">Heatmap · click any cell for the top deductions between that pair.</p>
            </div>
            {exportButtons(inpMatrix, "inp-similarity", "Input similarity matrix (0-1000)")}
          </div>
          <MatrixTable m={inpMatrix} onCell={openInpDetail} rowAxisLabel="inp" colAxisLabel="inp" />
          <RankingList m={inpMatrix} />
        </section>
      )}

      {rpts.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-semibold">Simulation reports (.rpt / .csv) — {rpts.length}×{rpts.length}</h2>
              <p className="text-sm text-muted-foreground">Heatmap · click any cell for the category-level output breakdown.</p>
            </div>
            {exportButtons(rptMatrix, "rpt-similarity", "Output similarity matrix (0-1000)")}
          </div>
          <MatrixTable m={rptMatrix} onCell={openRptDetail} rowAxisLabel="rpt" colAxisLabel="rpt" />
          <RankingList m={rptMatrix} />
        </section>
      )}

      {inps.length > 0 && rpts.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-semibold">Cross-type coverage — {inps.length} .inp × {rpts.length} .rpt/.csv</h2>
              <p className="text-sm text-muted-foreground">
                Score = fraction of element IDs in the report that also exist in the input model.
                Rows ranked by average coverage across all reports. Click any cell for the missing-ID breakdown.
              </p>
            </div>
            {exportButtons(crossMatrix, "cross-coverage", "Cross-type coverage matrix (0-1000)")}
          </div>
          <MatrixTable m={crossMatrix} onCell={openCrossDetail} rowAxisLabel="inp" colAxisLabel="rpt" />
          <RankingList m={crossMatrix} />
        </section>
      )}

      {detail && (
        <section className="mt-6 rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground truncate" title={detail.title}>
              {detail.title}
            </div>
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="rounded-md border border-border px-2 py-1 text-xs font-mono hover:bg-secondary cursor-pointer"
            >
              close
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">{detail.text}</pre>
        </section>
      )}

      {failed.length > 0 && (
        <section className="mt-8 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <div className="text-xs font-mono uppercase tracking-widest text-destructive">
            Files that could not be parsed ({failed.length})
          </div>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {failed.map((f) => (
              <li key={f.name}>
                <span className="text-foreground">{f.name}</span>{" "}
                <span className="text-muted-foreground">[{f.kind}]</span>{" "}
                <span className="text-destructive">— {f.error}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {inps.length === 0 && rpts.length === 0 && !busy && (
        <div className="mt-10 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>Nothing loaded yet. Choose a folder that contains SWMM5 <code>.inp</code>, EPANET <code>.inp</code>,
          InfoWorks ICM <code>.csv</code> exports, or SWMM5/EPANET <code>.rpt</code> reports. Sub-folders are
          walked recursively.</p>
        </div>
      )}
    </main>
  );
}
