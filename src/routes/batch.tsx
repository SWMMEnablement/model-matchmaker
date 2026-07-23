import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseAny, type ModelFormat } from "@/lib/swmm/parseAny";
import type { ParsedInp } from "@/lib/swmm/parseInp";
import { scoreModels } from "@/lib/swmm/score";
import { DEFAULT_WEIGHTS } from "@/lib/swmm/weights";
import { DEFAULT_TOLERANCES } from "@/lib/swmm/tolerances";
import { parseAnyRpt, type RptFormat } from "@/lib/swmm/parseAnyRpt";
import type { ParsedRpt } from "@/lib/swmm/parseRpt";
import { compareOutputs, DEFAULT_OUTPUT_TOLERANCES } from "@/lib/swmm/outputCompare";
import { buildComponentDetails } from "@/lib/swmm/details";
import { inpPairToCsv, inpPairToJson } from "@/lib/swmm/pairExport";
import { outputReportToCsv } from "@/lib/swmm/outputCsv";

export const Route = createFileRoute("/batch")({
  head: () => ({
    meta: [
      { title: "Batch similarity — SWMM5 Similarity Index" },
      { name: "description", content: "Pick a folder of .inp or .rpt files and get an N×N similarity heatmap plus a cross-type .inp × .rpt coverage matrix." },
    ],
  }),
  component: BatchPage,
});

const APP_VERSION = "batch-similarity/1.2.0";
const CACHE_KEY = "swmm-batch-cache/v1";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

interface FileSig { name: string; size: number; lastModified: number; }
interface InpEntry  { name: string; parsed: ParsedInp; format: ModelFormat; sig: FileSig; }
interface RptEntry  { name: string; parsed: ParsedRpt; format: RptFormat;   sig: FileSig; }
interface FailEntry { name: string; kind: "inp" | "rpt"; error: string; }

interface Ranking { name: string; avg: number; rank: number; }

interface Matrix {
  kind: "inp" | "rpt" | "cross";
  rowLabels: string[];
  colLabels: string[];
  scores: number[][];
  avgOthers: number[];
  ranking: Ranking[];
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

const isInp = (n: string) => /\.inp$/i.test(n);
const isRpt = (n: string) => /\.(rpt|csv|txt)$/i.test(n);

function heatStyle(score: number, self = false, dim = false): React.CSSProperties {
  if (self) return { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" };
  if (dim) return { background: "hsl(var(--muted) / 0.4)", color: "hsl(var(--muted-foreground))" };
  const s = Math.max(0, Math.min(1000, score)) / 1000;
  const hue = 0 + s * 130;
  const light = 22 + (1 - s) * 8;
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

function buildInpMatrix(entries: InpEntry[], cached?: number[][]): Matrix {
  const n = entries.length;
  const scores: number[][] = cached ?? Array.from({ length: n }, () => Array(n).fill(0));
  if (!cached) {
    for (let i = 0; i < n; i++) {
      scores[i][i] = 1000;
      for (let j = i + 1; j < n; j++) {
        let v = 0;
        try { v = scoreModels(entries[i].parsed, entries[j].parsed).overall; } catch { v = 0; }
        scores[i][j] = v; scores[j][i] = v;
      }
    }
  }
  const labels = entries.map((e) => e.name);
  const avg = scores.map((row, i) =>
    n > 1 ? Math.round(row.reduce((s, v, j) => (i === j ? s : s + v), 0) / (n - 1)) : 1000,
  );
  return { kind: "inp", rowLabels: labels, colLabels: labels, scores, avgOthers: avg, ranking: rankOf(labels, avg) };
}

function buildRptMatrix(entries: RptEntry[], cached?: number[][]): Matrix {
  const n = entries.length;
  const scores: number[][] = cached ?? Array.from({ length: n }, () => Array(n).fill(0));
  if (!cached) {
    for (let i = 0; i < n; i++) {
      scores[i][i] = 1000;
      for (let j = i + 1; j < n; j++) {
        let v = 0;
        try { v = compareOutputs(entries[i].parsed, entries[j].parsed).overall; } catch { v = 0; }
        scores[i][j] = v; scores[j][i] = v;
      }
    }
  }
  const labels = entries.map((e) => e.name);
  const avg = scores.map((row, i) =>
    n > 1 ? Math.round(row.reduce((s, v, j) => (i === j ? s : s + v), 0) / (n - 1)) : 1000,
  );
  return { kind: "rpt", rowLabels: labels, colLabels: labels, scores, avgOthers: avg, ranking: rankOf(labels, avg) };
}

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

function buildCrossMatrix(inps: InpEntry[], rpts: RptEntry[], cached?: number[][]): Matrix {
  const rows = inps.length, cols = rpts.length;
  const scores: number[][] = cached ?? Array.from({ length: rows }, () => Array(cols).fill(0));
  if (!cached) {
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        try { scores[i][j] = coverage(inps[i].parsed, rpts[j].parsed).score; }
        catch { scores[i][j] = 0; }
      }
    }
  }
  const rowLabels = inps.map((e) => e.name);
  const colLabels = rpts.map((e) => e.name);
  const avg = scores.map((row) => cols === 0 ? 0 : Math.round(row.reduce((s, v) => s + v, 0) / cols));
  return { kind: "cross", rowLabels, colLabels, scores, avgOthers: avg, ranking: rankOf(rowLabels, avg) };
}

// ── Cache ────────────────────────────────────────────────────────

interface CacheEntry {
  version: string;
  weightsKey: string;
  inpSigs: FileSig[];
  rptSigs: FileSig[];
  inpScores: number[][];
  rptScores: number[][];
  crossScores: number[][];
}

const weightsKey = () => JSON.stringify({
  w: DEFAULT_WEIGHTS,
  t: DEFAULT_TOLERANCES,
  o: DEFAULT_OUTPUT_TOLERANCES,
});

const sigsEq = (a: FileSig[], b: FileSig[]) =>
  a.length === b.length && a.every((s, i) => s.name === b[i].name && s.size === b[i].size && s.lastModified === b[i].lastModified);

function readCache(folder: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}:${folder}`);
    if (!raw) return null;
    const c = JSON.parse(raw) as CacheEntry;
    if (c.version !== APP_VERSION || c.weightsKey !== weightsKey()) return null;
    return c;
  } catch { return null; }
}

function writeCache(folder: string, entry: CacheEntry): void {
  try { localStorage.setItem(`${CACHE_KEY}:${folder}`, JSON.stringify(entry)); } catch { /* quota */ }
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

function meta(folder: string, threshold: number): ExportMeta {
  return {
    folder,
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    scoring: {
      inpWeights: DEFAULT_WEIGHTS,
      inpTolerances: DEFAULT_TOLERANCES,
      rptTolerances: DEFAULT_OUTPUT_TOLERANCES,
      minScoreFilter: threshold,
      crossMetric: "ID coverage: |RPT_ids ∩ INP_ids| / |RPT_ids|, weighted equally across nodes/links/subs, scaled to 0-1000",
      scale: "0-1000 (higher = more similar)",
    },
  };
}

function matrixToCsv(m: Matrix, meta: ExportMeta, title: string, threshold: number): string {
  const header: string[] = [];
  header.push(`# ${title}`);
  header.push(`# folder: ${meta.folder}`);
  header.push(`# generated: ${meta.generatedAt}`);
  header.push(`# version: ${meta.appVersion}`);
  header.push(`# scale: 0-1000  min-score filter: ${threshold}`);
  header.push(`# rows: ${m.rowLabels.length}  cols: ${m.colLabels.length}  type: ${m.kind}`);
  header.push(`# scoring: ${JSON.stringify(meta.scoring)}`);
  header.push("");

  const rowHeader = ["file", ...m.colLabels, "avg_vs_others", "rank"];
  const rankByName = new Map(m.ranking.map((r) => [r.name, r.rank]));
  const body = m.rowLabels.map((l, i) => [
    l,
    ...m.scores[i].map((v, j) => {
      const self = m.kind !== "cross" && i === j;
      if (self) return "";
      return v >= threshold ? String(v) : "";
    }),
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

function matrixToJson(m: Matrix, meta: ExportMeta, threshold: number): string {
  const rankByName = new Map(m.ranking.map((r) => [r.name, r.rank]));
  const pairs: { row: string; col: string; score: number }[] = [];
  for (let i = 0; i < m.rowLabels.length; i++) {
    for (let j = 0; j < m.colLabels.length; j++) {
      if (m.kind !== "cross" && i === j) continue;
      const v = m.scores[i][j];
      if (v < threshold) continue;
      pairs.push({ row: m.rowLabels[i], col: m.colLabels[j], score: v });
    }
  }
  const payload = {
    ...meta,
    filter: { minScore: threshold },
    matrix: {
      kind: m.kind,
      rows: m.rowLabels,
      cols: m.colLabels,
      scores: m.scores,
      avgVsOthers: m.rowLabels.map((name, i) => ({
        name, avg: m.avgOthers[i], rank: rankByName.get(name) ?? null,
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

// Top-K pairs across all three matrices.
interface TopPair { kind: Matrix["kind"]; row: string; col: string; score: number; }

function collectPairs(matrices: Matrix[], threshold: number): TopPair[] {
  const out: TopPair[] = [];
  for (const m of matrices) {
    for (let i = 0; i < m.rowLabels.length; i++) {
      const startJ = m.kind === "cross" ? 0 : i + 1;
      for (let j = startJ; j < m.colLabels.length; j++) {
        const v = m.scores[i][j];
        if (v < threshold) continue;
        out.push({ kind: m.kind, row: m.rowLabels[i], col: m.colLabels[j], score: v });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function topPairsToCsv(pairs: TopPair[], meta: ExportMeta, k: number, threshold: number): string {
  const rows = pairs.slice(0, k);
  return [
    `# Top ${rows.length} pairs (min score ${threshold})`,
    `# folder: ${meta.folder}`,
    `# generated: ${meta.generatedAt}`,
    `# scoring: ${JSON.stringify(meta.scoring)}`,
    "",
    ["rank", "kind", "row", "col", "score"].join(","),
    ...rows.map((p, i) => [i + 1, p.kind, esc(p.row), esc(p.col), p.score].join(",")),
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────
// Matrix table (heatmap)
// ────────────────────────────────────────────────────────────────

function MatrixTable({
  m, onCell, rowAxisLabel, colAxisLabel, threshold,
}: {
  m: Matrix;
  onCell?: (i: number, j: number) => void;
  rowAxisLabel: string;
  colAxisLabel: string;
  threshold: number;
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
              <th key={l} className="border-b border-border bg-card p-2 text-center whitespace-nowrap max-w-[10rem] truncate" title={l}>
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
              <th className="sticky left-0 z-10 border-b border-border/40 bg-card p-2 text-left max-w-[18rem] truncate" title={row}>
                {row.split("/").pop()}
              </th>
              {m.colLabels.map((col, j) => {
                const v = m.scores[i][j];
                const self = m.kind !== "cross" && i === j;
                const below = !self && v < threshold;
                return (
                  <td
                    key={j}
                    onClick={() => !self && !below && onCell?.(i, j)}
                    style={heatStyle(v, self, below)}
                    className={`border border-background/40 p-2 text-center ${self || below ? "" : "cursor-pointer hover:outline hover:outline-2 hover:outline-primary"}`}
                    title={self ? "self" : below ? `${row} vs ${col}: ${v} (below threshold)` : `${row} vs ${col}: ${v}`}
                  >
                    {self ? "—" : below ? "·" : v}
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
// Pair inspection modal
// ────────────────────────────────────────────────────────────────

type DetailSel =
  | { kind: "inp"; i: number; j: number }
  | { kind: "rpt"; i: number; j: number }
  | { kind: "cross"; i: number; j: number }
  | { kind: "error"; message: string };

function PairModal({
  sel, inps, rpts, onClose,
}: {
  sel: DetailSel;
  inps: InpEntry[];
  rpts: RptEntry[];
  onClose: () => void;
}) {
  const body = useMemo(() => {
    if (sel.kind === "error") {
      return { title: "Error", node: <pre className="whitespace-pre-wrap text-xs">{sel.message}</pre>, actions: null };
    }
    try {
      if (sel.kind === "inp") {
        const a = inps[sel.i], b = inps[sel.j];
        const rep = scoreModels(a.parsed, b.parsed);
        const det = buildComponentDetails(a.parsed, b.parsed);
        const kinds: (keyof typeof det)[] = ["junctions", "conduits", "subcatchments", "outfalls"];
        const top = rep.deductions.slice().sort((x, y) => y.amount - x.amount).slice(0, 8);
        return {
          title: `${a.name}  vs  ${b.name}`,
          node: (
            <div className="space-y-4 text-xs font-mono">
              <div className="text-sm">Score <span className="font-bold text-primary">{rep.overall}</span> / 1000</div>
              <div>
                <div className="mb-1 uppercase tracking-widest text-muted-foreground">Category scores</div>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {Object.entries(rep.categoryScores).map(([k, v]) => (
                    <li key={k} className="flex justify-between"><span>{k}</span><span>{v}</span></li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 uppercase tracking-widest text-muted-foreground">Per-kind breakdown</div>
                <table className="w-full">
                  <thead className="text-muted-foreground">
                    <tr><th className="text-left">kind</th><th>elements</th><th>matched props</th><th>differed props</th></tr>
                  </thead>
                  <tbody>
                    {kinds.map((k) => {
                      const els = det[k];
                      const m = els.reduce((s, e) => s + e.matched, 0);
                      const d = els.reduce((s, e) => s + e.differed, 0);
                      return (
                        <tr key={k}><td>{k}</td><td className="text-center">{els.length}</td><td className="text-center">{m}</td><td className="text-center">{d}</td></tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="mb-1 uppercase tracking-widest text-muted-foreground">Top deductions</div>
                <ol className="space-y-0.5">
                  {top.map((d, idx) => (
                    <li key={idx}>−{d.amount.toFixed(1)} [{d.category}] {d.label}{d.detail ? ` — ${d.detail}` : ""}</li>
                  ))}
                </ol>
              </div>
            </div>
          ),
          actions: (
            <>
              <button
                type="button"
                onClick={() => download(inpPairToCsv(a.name, b.name, rep, det), `${a.name.replace(/[/\\]/g, "_")}--vs--${b.name.replace(/[/\\]/g, "_")}.csv`, "text/csv;charset=utf-8")}
                className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20"
              >↓ Element CSV</button>
              <button
                type="button"
                onClick={() => download(inpPairToJson(a.name, b.name, rep, det), `${a.name.replace(/[/\\]/g, "_")}--vs--${b.name.replace(/[/\\]/g, "_")}.json`, "application/json")}
                className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20"
              >↓ Element JSON</button>
            </>
          ),
        };
      }
      if (sel.kind === "rpt") {
        const a = rpts[sel.i], b = rpts[sel.j];
        const r = compareOutputs(a.parsed, b.parsed);
        return {
          title: `${a.name}  vs  ${b.name}`,
          node: (
            <div className="space-y-4 text-xs font-mono">
              <div className="text-sm">Output score <span className="font-bold text-primary">{r.overall}</span> / 1000</div>
              <div>
                <div className="mb-1 uppercase tracking-widest text-muted-foreground">Categories</div>
                <table className="w-full">
                  <thead className="text-muted-foreground"><tr><th className="text-left">label</th><th>score</th><th>rms rel err %</th><th>n</th></tr></thead>
                  <tbody>
                    {r.categories.map((c) => (
                      <tr key={c.label}><td>{c.label}</td><td className="text-center">{c.score}</td><td className="text-center">{c.rmsePct.toFixed(2)}</td><td className="text-center">{c.count}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="mb-1 uppercase tracking-widest text-muted-foreground">Continuity Δ</div>
                <div>runoff: {r.continuity.deltaRunoffPct?.toFixed(3) ?? "—"} %  ·  flow: {r.continuity.deltaFlowPct?.toFixed(3) ?? "—"} %</div>
              </div>
              <div>
                <div className="mb-1 uppercase tracking-widest text-muted-foreground">Element rollup</div>
                <div>nodes: {r.elements.nodes.length}  ·  links: {r.elements.links.length}  ·  subs: {r.elements.subcatchments.length}</div>
              </div>
            </div>
          ),
          actions: (
            <button
              type="button"
              onClick={() => download(outputReportToCsv(r, DEFAULT_OUTPUT_TOLERANCES), `${a.name.replace(/[/\\]/g, "_")}--vs--${b.name.replace(/[/\\]/g, "_")}.output.csv`, "text/csv;charset=utf-8")}
              className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20"
            >↓ Output CSV</button>
          ),
        };
      }
      // cross
      const inp = inps[sel.i], rpt = rpts[sel.j];
      const c = coverage(inp.parsed, rpt.parsed);
      return {
        title: `${inp.name}  ↔  ${rpt.name}`,
        node: (
          <div className="space-y-3 text-xs font-mono">
            <div className="text-sm">Coverage <span className="font-bold text-primary">{c.score}</span> / 1000</div>
            <div>Nodes: {c.nodes.overlap} / {c.nodes.rptCount} matched</div>
            <div>Links: {c.links.overlap} / {c.links.rptCount} matched</div>
            <div>Subs:  {c.subs.overlap} / {c.subs.rptCount} matched</div>
            {c.missing.nodes.length > 0 && <div className="text-muted-foreground">Missing nodes (first {c.missing.nodes.length}): {c.missing.nodes.join(", ")}</div>}
            {c.missing.links.length > 0 && <div className="text-muted-foreground">Missing links (first {c.missing.links.length}): {c.missing.links.join(", ")}</div>}
            {c.missing.subs.length > 0 && <div className="text-muted-foreground">Missing subs (first {c.missing.subs.length}): {c.missing.subs.join(", ")}</div>}
          </div>
        ),
        actions: (
          <button
            type="button"
            onClick={() => download(JSON.stringify({ a: inp.name, b: rpt.name, ...c }, null, 2), `${inp.name.replace(/[/\\]/g, "_")}--x--${rpt.name.replace(/[/\\]/g, "_")}.coverage.json`, "application/json")}
            className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20"
          >↓ Coverage JSON</button>
        ),
      };
    } catch (e) {
      return { title: "Error", node: <pre className="whitespace-pre-wrap text-xs">{e instanceof Error ? e.message : String(e)}</pre>, actions: null };
    }
  }, [sel, inps, rpts]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="truncate text-xs font-mono uppercase tracking-widest text-muted-foreground" title={body.title}>
            {body.title}
          </div>
          <div className="flex items-center gap-2">
            {body.actions}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-2 py-1 text-xs font-mono hover:bg-secondary"
            >close</button>
          </div>
        </div>
        {body.node}
      </div>
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
  const [sel, setSel] = useState<DetailSel | null>(null);
  const [threshold, setThreshold] = useState<number>(0);
  const [topK, setTopK] = useState<number>(20);
  const [cacheHit, setCacheHit] = useState<boolean>(false);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setSel(null);
    setCacheHit(false);
    const okInp: InpEntry[] = [];
    const okRpt: RptEntry[] = [];
    const bad: FailEntry[] = [];

    const first = files[0] as File & { webkitRelativePath?: string };
    const root = first.webkitRelativePath?.split("/")[0] ?? "(files)";
    setFolderName(root);

    for (const f of Array.from(files)) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const sig: FileSig = { name: rel, size: f.size, lastModified: f.lastModified };
      try {
        if (isInp(rel)) {
          const text = await f.text();
          const parsed = parseAny(text);
          okInp.push({ name: rel, parsed: parsed.parsed, format: parsed.format, sig });
        } else if (isRpt(rel)) {
          const text = await f.text();
          const parsed = parseAnyRpt(text);
          okRpt.push({ name: rel, parsed: parsed.parsed, format: parsed.format, sig });
        }
      } catch (e) {
        bad.push({ name: rel, kind: isInp(rel) ? "inp" : "rpt", error: e instanceof Error ? e.message : String(e) });
      }
    }

    setInps(okInp); setRpts(okRpt); setFailed(bad); setBusy(false);
  }, []);

  // Compute (or restore from cache) all three matrices.
  const { inpMatrix, rptMatrix, crossMatrix } = useMemo(() => {
    const cached = readCache(folderName);
    const useCache = cached
      && sigsEq(cached.inpSigs, inps.map((e) => e.sig))
      && sigsEq(cached.rptSigs, rpts.map((e) => e.sig));

    const im = buildInpMatrix(inps, useCache ? cached!.inpScores : undefined);
    const rm = buildRptMatrix(rpts, useCache ? cached!.rptScores : undefined);
    const cm = buildCrossMatrix(inps, rpts, useCache ? cached!.crossScores : undefined);

    if (!useCache && folderName && (inps.length || rpts.length)) {
      writeCache(folderName, {
        version: APP_VERSION,
        weightsKey: weightsKey(),
        inpSigs: inps.map((e) => e.sig),
        rptSigs: rpts.map((e) => e.sig),
        inpScores: im.scores,
        rptScores: rm.scores,
        crossScores: cm.scores,
      });
    }
    setTimeout(() => setCacheHit(!!useCache), 0);
    return { inpMatrix: im, rptMatrix: rm, crossMatrix: cm };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inps, rpts, folderName]);

  const exportMeta = useMemo(() => meta(folderName || "batch", threshold), [folderName, threshold]);
  const allPairs = useMemo(() => collectPairs([inpMatrix, rptMatrix, crossMatrix], threshold), [inpMatrix, rptMatrix, crossMatrix, threshold]);

  useEffect(() => { if (!inps.length && !rpts.length) setSel(null); }, [inps.length, rpts.length]);

  const exportButtons = (m: Matrix, base: string, title: string) => (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => download(matrixToCsv(m, exportMeta, title, threshold), `${folderName || "batch"}-${base}.csv`, "text/csv;charset=utf-8")}
        className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20"
      >↓ CSV</button>
      <button
        type="button"
        onClick={() => download(matrixToJson(m, exportMeta, threshold), `${folderName || "batch"}-${base}.json`, "application/json")}
        className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20"
      >↓ JSON</button>
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
              {cacheHit && <span className="ml-2 text-primary">· cache hit</span>}
            </span>
          )}
          {folderName && (
            <button
              type="button"
              onClick={() => { try { localStorage.removeItem(`${CACHE_KEY}:${folderName}`); setCacheHit(false); } catch { /* noop */ } }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-mono hover:bg-secondary"
            >clear cache</button>
          )}
        </div>
        {busy && <div className="mt-3 text-sm text-muted-foreground">Parsing and scoring…</div>}
      </div>

      {(inps.length > 0 || rpts.length > 0) && (
        <div className="mt-6 flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card/50 p-4">
          <label className="flex flex-col gap-1 text-xs font-mono">
            <span className="uppercase tracking-widest text-muted-foreground">Min score filter: {threshold}</span>
            <input
              type="range" min={0} max={1000} step={10}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-64"
            />
            <span className="text-muted-foreground">Cells below this are dimmed and excluded from exports.</span>
          </label>
          <label className="flex flex-col gap-1 text-xs font-mono">
            <span className="uppercase tracking-widest text-muted-foreground">Top-K</span>
            <input
              type="number" min={1} max={500}
              value={topK}
              onChange={(e) => setTopK(Math.max(1, Number(e.target.value) || 1))}
              className="w-24 rounded-md border border-border bg-background px-2 py-1"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => download(topPairsToCsv(allPairs, exportMeta, topK, threshold), `${folderName || "batch"}-top${topK}-pairs.csv`, "text/csv;charset=utf-8")}
              disabled={allPairs.length === 0}
              className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20 disabled:opacity-40"
            >↓ Top-{topK} pairs CSV</button>
            <button
              type="button"
              onClick={() => download(JSON.stringify({ ...exportMeta, filter: { minScore: threshold, topK }, pairs: allPairs.slice(0, topK) }, null, 2), `${folderName || "batch"}-top${topK}-pairs.json`, "application/json")}
              disabled={allPairs.length === 0}
              className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20 disabled:opacity-40"
            >↓ Top-{topK} pairs JSON</button>
            <span className="self-center text-xs font-mono text-muted-foreground">
              {allPairs.length} pair{allPairs.length === 1 ? "" : "s"} above threshold
            </span>
          </div>
        </div>
      )}

      {inps.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-semibold">Input models (.inp) — {inps.length}×{inps.length}</h2>
              <p className="text-sm text-muted-foreground">Heatmap · click any cell for the pair breakdown.</p>
            </div>
            {exportButtons(inpMatrix, "inp-similarity", "Input similarity matrix (0-1000)")}
          </div>
          <MatrixTable m={inpMatrix} onCell={(i, j) => setSel({ kind: "inp", i, j })} rowAxisLabel="inp" colAxisLabel="inp" threshold={threshold} />
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
          <MatrixTable m={rptMatrix} onCell={(i, j) => setSel({ kind: "rpt", i, j })} rowAxisLabel="rpt" colAxisLabel="rpt" threshold={threshold} />
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
          <MatrixTable m={crossMatrix} onCell={(i, j) => setSel({ kind: "cross", i, j })} rowAxisLabel="inp" colAxisLabel="rpt" threshold={threshold} />
          <RankingList m={crossMatrix} />
        </section>
      )}

      {sel && <PairModal sel={sel} inps={inps} rpts={rpts} onClose={() => setSel(null)} />}

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
