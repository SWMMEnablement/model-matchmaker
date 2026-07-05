import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { parseAny, type ModelFormat } from "@/lib/swmm/parseAny";
import type { ParsedInp } from "@/lib/swmm/parseInp";
import { scoreModels } from "@/lib/swmm/score";
import { parseAnyRpt, type RptFormat } from "@/lib/swmm/parseAnyRpt";
import type { ParsedRpt } from "@/lib/swmm/parseRpt";
import { compareOutputs } from "@/lib/swmm/outputCompare";

export const Route = createFileRoute("/batch")({
  head: () => ({
    meta: [
      { title: "Batch similarity — SWMM5 Similarity Index" },
      { name: "description", content: "Pick a folder of .inp or .rpt files and get an N×N similarity matrix scoring every pair against every other." },
    ],
  }),
  component: BatchPage,
});

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

interface InpEntry  { name: string; parsed: ParsedInp; format: ModelFormat; error?: string; }
interface RptEntry  { name: string; parsed: ParsedRpt; format: RptFormat;   error?: string; }
interface FailEntry { name: string; kind: "inp" | "rpt"; error: string; }

interface Matrix {
  labels: string[];
  scores: number[][];   // NxN, diagonal = 1000
  avgOthers: number[];  // mean similarity of row i vs all others
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

const isInp = (n: string) => /\.inp$/i.test(n);
const isRpt = (n: string) => /\.(rpt|csv|txt)$/i.test(n);

function toneClass(score: number): string {
  if (score >= 900) return "bg-success/20 text-success";
  if (score >= 700) return "bg-primary/20 text-primary";
  if (score >= 500) return "bg-warning/20 text-warning";
  return "bg-destructive/20 text-destructive";
}

function buildInpMatrix(entries: InpEntry[]): Matrix {
  const n = entries.length;
  const scores: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    scores[i][i] = 1000;
    for (let j = i + 1; j < n; j++) {
      try {
        const r = scoreModels(entries[i].parsed, entries[j].parsed);
        scores[i][j] = r.overall;
        scores[j][i] = r.overall;
      } catch {
        scores[i][j] = 0; scores[j][i] = 0;
      }
    }
  }
  return {
    labels: entries.map((e) => e.name),
    scores,
    avgOthers: scores.map((row, i) =>
      n > 1 ? Math.round(row.reduce((s, v, j) => (i === j ? s : s + v), 0) / (n - 1)) : 1000,
    ),
  };
}

function buildRptMatrix(entries: RptEntry[]): Matrix {
  const n = entries.length;
  const scores: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    scores[i][i] = 1000;
    for (let j = i + 1; j < n; j++) {
      try {
        const r = compareOutputs(entries[i].parsed, entries[j].parsed);
        scores[i][j] = r.overall;
        scores[j][i] = r.overall;
      } catch {
        scores[i][j] = 0; scores[j][i] = 0;
      }
    }
  }
  return {
    labels: entries.map((e) => e.name),
    scores,
    avgOthers: scores.map((row, i) =>
      n > 1 ? Math.round(row.reduce((s, v, j) => (i === j ? s : s + v), 0) / (n - 1)) : 1000,
    ),
  };
}

const esc = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function matrixToCsv(kind: string, m: Matrix): string {
  const header = ["file", ...m.labels, "avg_vs_others"];
  const rows = [header, ...m.labels.map((l, i) => [l, ...m.scores[i].map(String), String(m.avgOthers[i])])];
  return `# ${kind} similarity matrix (0-1000)\n` + rows.map((r) => r.map(esc).join(",")).join("\n");
}

function download(text: string, filename: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────────────────────
// Matrix table
// ────────────────────────────────────────────────────────────────

function MatrixTable({
  m, onCell,
}: { m: Matrix; onCell?: (i: number, j: number) => void }) {
  if (m.labels.length === 0) return null;
  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse font-mono text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-border bg-card p-2 text-left">file</th>
            {m.labels.map((l) => (
              <th key={l} className="border-b border-border bg-card p-2 text-center whitespace-nowrap max-w-[10rem] truncate" title={l}>
                {l}
              </th>
            ))}
            <th className="border-b border-border bg-card p-2 text-center">avg</th>
          </tr>
        </thead>
        <tbody>
          {m.labels.map((row, i) => (
            <tr key={row}>
              <th className="sticky left-0 z-10 border-b border-border/40 bg-card p-2 text-left max-w-[16rem] truncate" title={row}>
                {row}
              </th>
              {m.labels.map((_, j) => {
                const v = m.scores[i][j];
                const self = i === j;
                return (
                  <td
                    key={j}
                    onClick={() => !self && onCell?.(i, j)}
                    className={`border-b border-border/40 p-2 text-center ${self ? "text-muted-foreground" : `cursor-pointer ${toneClass(v)}`}`}
                    title={self ? "self" : `${m.labels[i]} vs ${m.labels[j]}: ${v}`}
                  >
                    {self ? "—" : v}
                  </td>
                );
              })}
              <td className={`border-b border-border/40 p-2 text-center font-bold ${toneClass(m.avgOthers[i])}`}>
                {m.avgOthers[i]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const [detail, setDetail] = useState<{ kind: "inp" | "rpt"; i: number; j: number; text: string } | null>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setDetail(null);
    const okInp: InpEntry[] = [];
    const okRpt: RptEntry[] = [];
    const bad: FailEntry[] = [];

    // Root folder name (from webkitRelativePath first segment).
    const first = files[0] as File & { webkitRelativePath?: string };
    const root = first.webkitRelativePath?.split("/")[0] ?? "(files)";
    setFolderName(root);

    for (const f of Array.from(files)) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      try {
        if (isInp(rel)) {
          const text = await f.text();
          const parsed = parseAny(text);
          okInp.push({ name: rel, parsed: parsed.inp, format: parsed.format });
        } else if (isRpt(rel)) {
          const text = await f.text();
          const parsed = parseAnyRpt(text);
          okRpt.push({ name: rel, parsed: parsed.parsed, format: parsed.format });
        }
      } catch (e) {
        bad.push({
          name: rel,
          kind: isInp(rel) ? "inp" : "rpt",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    setInps(okInp);
    setRpts(okRpt);
    setFailed(bad);
    setBusy(false);
  }, []);

  const inpMatrix = useMemo(() => buildInpMatrix(inps), [inps]);
  const rptMatrix = useMemo(() => buildRptMatrix(rpts), [rpts]);

  const openInpDetail = useCallback((i: number, j: number) => {
    try {
      const r = scoreModels(inps[i].parsed, inps[j].parsed);
      const top = r.deductions.slice().sort((a, b) => b.amount - a.amount).slice(0, 8);
      const lines = [
        `${inps[i].name}  vs  ${inps[j].name}`,
        `Score: ${r.overall} / 1000`,
        "",
        "Top deductions:",
        ...top.map((d) => `  −${d.amount.toFixed(1)}  [${d.category}]  ${d.label}${d.detail ? " — " + d.detail : ""}`),
      ];
      setDetail({ kind: "inp", i, j, text: lines.join("\n") });
    } catch (e) {
      setDetail({ kind: "inp", i, j, text: `Error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }, [inps]);

  const openRptDetail = useCallback((i: number, j: number) => {
    try {
      const r = compareOutputs(rpts[i].parsed, rpts[j].parsed);
      const lines = [
        `${rpts[i].name}  vs  ${rpts[j].name}`,
        `Output score: ${r.overall} / 1000`,
        "",
        "Categories:",
        ...r.categories.map((c) => `  ${c.label.padEnd(14)}  ${c.score}  (rms rel err ${c.rmsePct.toFixed(2)}%, n=${c.count})`),
        "",
        `Continuity Δ runoff: ${r.continuity.deltaRunoffPct?.toFixed(3) ?? "—"} %`,
        `Continuity Δ flow  : ${r.continuity.deltaFlowPct?.toFixed(3) ?? "—"} %`,
      ];
      setDetail({ kind: "rpt", i, j, text: lines.join("\n") });
    } catch (e) {
      setDetail({ kind: "rpt", i, j, text: `Error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }, [rpts]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Batch similarity across a folder</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Pick a folder of hydraulic model files. Every <code className="font-mono text-xs">.inp</code> is scored
        against every other <code className="font-mono text-xs">.inp</code> using the input similarity engine, and
        every <code className="font-mono text-xs">.rpt</code> / <code className="font-mono text-xs">.csv</code> result
        file is scored against every other using the output comparison engine. Everything runs in the browser —
        no files leave your machine.
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
              <p className="text-sm text-muted-foreground">Click any cell for the top deductions between that pair.</p>
            </div>
            <button
              type="button"
              onClick={() => download(matrixToCsv("Input", inpMatrix), `${folderName || "batch"}-inp-similarity.csv`)}
              className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20 cursor-pointer"
            >
              ↓ Export matrix CSV
            </button>
          </div>
          <MatrixTable m={inpMatrix} onCell={openInpDetail} />
        </section>
      )}

      {rpts.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-semibold">Simulation reports (.rpt / .csv) — {rpts.length}×{rpts.length}</h2>
              <p className="text-sm text-muted-foreground">Click any cell for the category-level output breakdown.</p>
            </div>
            <button
              type="button"
              onClick={() => download(matrixToCsv("Output", rptMatrix), `${folderName || "batch"}-rpt-similarity.csv`)}
              className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20 cursor-pointer"
            >
              ↓ Export matrix CSV
            </button>
          </div>
          <MatrixTable m={rptMatrix} onCell={openRptDetail} />
        </section>
      )}

      {detail && (
        <section className="mt-6 rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Pair detail — {detail.kind === "inp" ? "input model" : "simulation output"}
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
