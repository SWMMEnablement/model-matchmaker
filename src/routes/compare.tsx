import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { parseInp, type ParsedInp } from "@/lib/swmm/parseInp";
import { scoreModels, type SimilarityReport } from "@/lib/swmm/score";
import { CATEGORIES } from "@/lib/swmm/weights";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare two SWMM5 models — SWMM5 Similarity Index" },
      { name: "description", content: "Upload two SWMM5 .inp files and get an instant similarity score with per-category breakdown." },
    ],
  }),
  component: ComparePage,
});

interface LoadedFile { name: string; text: string; parsed: ParsedInp; }

function ScoreDial({ value }: { value: number }) {
  const tone =
    value >= 900 ? "text-success" :
    value >= 700 ? "text-primary" :
    value >= 500 ? "text-warning" : "text-destructive";
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-8">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">Similarity Index</div>
      <div className={`font-mono text-7xl font-bold ${tone}`}>{value}</div>
      <div className="font-mono text-sm text-muted-foreground">/ 1000</div>
    </div>
  );
}

async function loadFile(f: File): Promise<LoadedFile> {
  const text = await f.text();
  return { name: f.name, text, parsed: parseInp(text) };
}

function FileSlot({
  label, file, onPick,
}: { label: string; file: LoadedFile | null; onPick: (f: File) => void }) {
  return (
    <label className="flex cursor-pointer flex-col gap-2 rounded-lg border border-dashed border-border bg-card p-5 transition-colors hover:border-primary/60">
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      {file ? (
        <>
          <div className="truncate font-mono text-sm text-foreground">{file.name}</div>
          <div className="text-xs text-muted-foreground">
            {file.parsed.junctions.length} junctions · {file.parsed.conduits.length} conduits ·{" "}
            {file.parsed.subcatchments.length} subcatchments
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Click to choose a .inp file</div>
      )}
      <input
        type="file"
        accept=".inp,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
    </label>
  );
}

function downloadJson(report: SimilarityReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `swmm-similarity-${report.overall}.json`; a.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(report: SimilarityReport) {
  const rows = [
    ["category", "deduction", "label", "detail"],
    ...report.deductions.map((d) => [d.category, d.amount.toFixed(2), d.label, d.detail ?? ""]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `swmm-similarity-${report.overall}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function ComparePage() {
  const [a, setA] = useState<LoadedFile | null>(null);
  const [b, setB] = useState<LoadedFile | null>(null);
  const [tol, setTol] = useState(5);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback((side: "a" | "b") => async (f: File) => {
    try {
      setError(null);
      const loaded = await loadFile(f);
      (side === "a" ? setA : setB)(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    }
  }, []);

  const report = useMemo<SimilarityReport | null>(() => {
    if (!a || !b) return null;
    try {
      return scoreModels(a.parsed, b.parsed, { spatialToleranceMeters: tol });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scoring failed.");
      return null;
    }
  }, [a, b, tol]);

  const radarData = useMemo(() => {
    if (!report) return [];
    return CATEGORIES.map((c) => ({ category: c, score: report.categoryScores[c] }));
  }, [report]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Compare two SWMM5 models</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Both files stay on your machine — parsing and scoring run in the browser.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <FileSlot label="Model A" file={a} onPick={pick("a")} />
        <FileSlot label="Model B" file={b} onPick={pick("b")} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
        <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Spatial match tolerance
        </label>
        <input
          type="number" min={0} step={0.5} value={tol}
          onChange={(e) => setTol(parseFloat(e.target.value) || 0)}
          className="w-24 rounded-md border border-border bg-input px-2 py-1 font-mono text-sm"
        />
        <span className="text-xs text-muted-foreground">map units (typically meters/feet of the model)</span>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {report && a && b && (
        <>
          <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_2fr]">
            <ScoreDial value={report.overall} />
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                Category scores
              </div>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <RadarChart data={radarData} outerRadius="75%">
                    <PolarGrid stroke="var(--color-border)" />
                    <PolarAngleAxis
                      dataKey="category"
                      tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                    />
                    <PolarRadiusAxis
                      domain={[0, 1000]} tickCount={5}
                      tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
                      stroke="var(--color-border)"
                    />
                    <Radar
                      dataKey="score"
                      stroke="var(--color-primary)"
                      fill="var(--color-primary)"
                      fillOpacity={0.35}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 6,
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-2">
            {[["Model A", report.summary.a, a.name], ["Model B", report.summary.b, b.name]].map(
              ([label, s, name]) => {
                const sum = s as typeof report.summary.a;
                return (
                  <div key={label as string} className="rounded-lg border border-border bg-card p-4 text-sm">
                    <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{label as string}</div>
                    <div className="mt-1 truncate font-mono">{name as string}</div>
                    <div className="mt-1 text-muted-foreground italic truncate">{sum.title}</div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
                      <dt className="text-muted-foreground">Units</dt><dd>{sum.flowUnits}</dd>
                      <dt className="text-muted-foreground">Routing</dt><dd>{sum.routing}</dd>
                      <dt className="text-muted-foreground">Junctions</dt><dd>{sum.junctions}</dd>
                      <dt className="text-muted-foreground">Conduits</dt><dd>{sum.conduits}</dd>
                      <dt className="text-muted-foreground">Subcatch.</dt><dd>{sum.subcatchments}</dd>
                      <dt className="text-muted-foreground">Outfalls</dt><dd>{sum.outfalls}</dd>
                      <dt className="text-muted-foreground">Σ length</dt><dd>{sum.totalConduitLength.toFixed(0)}</dd>
                      <dt className="text-muted-foreground">Σ area</dt><dd>{sum.totalSubcatchArea.toFixed(2)}</dd>
                    </dl>
                  </div>
                );
              },
            )}
          </section>

          <section className="mt-6 rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                  Top deductions
                </div>
                <div className="text-sm text-muted-foreground">
                  Largest contributors to the gap from 1000.
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadJson(report)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-mono hover:bg-secondary"
                >
                  ↓ JSON
                </button>
                <button
                  onClick={() => downloadCsv(report)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-mono hover:bg-secondary"
                >
                  ↓ CSV
                </button>
              </div>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2">Category</th>
                  <th className="py-2">Reason</th>
                  <th className="py-2 text-right">−Points</th>
                </tr>
              </thead>
              <tbody>
                {report.deductions.slice(0, 20).map((d, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="py-2 font-mono text-xs text-primary">{d.category}</td>
                    <td className="py-2">
                      <div>{d.label}</div>
                      {d.detail && <div className="text-xs text-muted-foreground">{d.detail}</div>}
                    </td>
                    <td className="py-2 text-right font-mono">−{d.amount.toFixed(1)}</td>
                  </tr>
                ))}
                {report.deductions.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">
                    No differences detected — the models scored a perfect 1000.
                  </td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="mt-6 rounded-lg border border-border bg-card p-4">
            <div className="mb-3 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Element matching
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 text-left">Element</th>
                  <th className="py-2 text-right">Matched</th>
                  <th className="py-2 text-right">Only in A</th>
                  <th className="py-2 text-right">Only in B</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {(["junctions", "conduits", "subcatchments", "outfalls"] as const).map((k) => (
                  <tr key={k} className="border-b border-border/40">
                    <td className="py-2 capitalize">{k}</td>
                    <td className="py-2 text-right text-success">{report.matchStats[k].matched}</td>
                    <td className="py-2 text-right text-warning">{report.matchStats[k].onlyA}</td>
                    <td className="py-2 text-right text-warning">{report.matchStats[k].onlyB}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
