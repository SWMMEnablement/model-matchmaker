import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, Tooltip,
} from "recharts";
import type { ParsedInp } from "@/lib/swmm/parseInp";
import { parseAny, type ModelFormat } from "@/lib/swmm/parseAny";
import { scoreModels, type SimilarityReport } from "@/lib/swmm/score";
import { CATEGORIES } from "@/lib/swmm/weights";
import { DEFAULT_TOLERANCES, type NumericTolerances } from "@/lib/swmm/tolerances";
import { buildComponentDetails, type ComponentDetails, type ComponentDiff } from "@/lib/swmm/details";
import { FIXTURES, type Fixture } from "@/lib/swmm/fixtures";
import { generatePdfReport } from "@/lib/swmm/pdfReport";
import { OutputComparePanel } from "@/components/OutputComparePanel";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare two SWMM5 models — SWMM5 Similarity Index" },
      { name: "description", content: "Upload or preload two SWMM5/EPANET/ICM models and get an instant similarity score, per-category breakdown, per-component diffs, and a downloadable PDF report." },
    ],
  }),
  component: ComparePage,
});

interface LoadedFile { name: string; text: string; parsed: ParsedInp; format: ModelFormat; }

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
  const { parsed, format } = parseAny(text);
  return { name: f.name, text, parsed, format };
}

function loadFixture(fx: Fixture): LoadedFile {
  const { parsed, format } = parseAny(fx.text, fx.format);
  return { name: fx.name, text: fx.text, parsed, format };
}

function FileSlot({
  label, file, onPick, onPickFixture,
}: {
  label: string;
  file: LoadedFile | null;
  onPick: (f: File) => void;
  onPickFixture: (key: string) => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
        {file && (
          <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
            {file.format}
          </span>
        )}
      </div>
      {file ? (
        <div className="mt-1">
          <div className="truncate font-mono text-sm text-foreground">{file.name}</div>
          <div className="text-xs text-muted-foreground">
            {file.parsed.junctions.length} junctions · {file.parsed.conduits.length} conduits ·{" "}
            {file.parsed.subcatchments.length} subcatchments
          </div>
        </div>
      ) : (
        <div className="mt-1 text-sm text-muted-foreground">Choose a .inp / .csv file or load a sample.</div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-mono hover:bg-secondary/80">
          Upload file
          <input
            type="file"
            accept=".inp,.csv,.txt,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
            }}
          />
        </label>
        <select
          value=""
          onChange={(e) => { if (e.target.value) onPickFixture(e.target.value); }}
          className="rounded-md border border-border bg-input px-2 py-1.5 text-xs font-mono cursor-pointer"
        >
          <option value="">Load sample…</option>
          {FIXTURES.map((fx) => (
            <option key={fx.key} value={fx.key}>
              [{fx.format}] {fx.name}
            </option>
          ))}
        </select>
      </div>
    </div>
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

const STATUS_TONE: Record<string, string> = {
  match: "text-success",
  differ: "text-warning",
  "only-a": "text-destructive",
  "only-b": "text-destructive",
};

function ComponentList({ rows }: { rows: ComponentDiff[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) {
    return <div className="py-4 text-center text-xs text-muted-foreground">No elements of this type.</div>;
  }
  return (
    <ul className="divide-y divide-border/40">
      {rows.map((r) => {
        const isOpen = open === r.id;
        const tone =
          r.matchedBy === "unmatched" ? "text-destructive" :
          r.differed === 0 ? "text-success" :
          r.differed <= 2 ? "text-warning" : "text-warning";
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : r.id)}
              className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-secondary/40 px-2 rounded cursor-pointer"
            >
              <span className="font-mono text-xs text-primary w-20 truncate">{r.id}</span>
              <span className={`text-xs font-mono ${tone}`}>
                {r.matchedBy === "unmatched"
                  ? "UNMATCHED"
                  : `${r.matched} match · ${r.differed} differ`}
              </span>
              {r.matchedBy === "spatial" && r.distance !== undefined && (
                <span className="text-xs font-mono text-muted-foreground">
                  spatial · {r.distance.toFixed(1)}u
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="px-2 pb-3">
                <table className="w-full font-mono text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left py-1">Property</th>
                      <th className="text-left py-1">A</th>
                      <th className="text-left py-1">B</th>
                      <th className="text-left py-1">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.props.map((p) => (
                      <tr key={p.name} className="border-t border-border/30">
                        <td className="py-1 pr-2">{p.name}</td>
                        <td className="py-1 pr-2">{p.a ?? "—"}</td>
                        <td className="py-1 pr-2">{p.b ?? "—"}</td>
                        <td className={`py-1 pr-2 ${STATUS_TONE[p.status]}`}>{p.delta ?? (p.status === "match" ? "ok" : p.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const TABS: Array<{ key: keyof ComponentDetails; label: string }> = [
  { key: "junctions", label: "Junctions" },
  { key: "conduits", label: "Conduits" },
  { key: "subcatchments", label: "Subcatchments" },
  { key: "outfalls", label: "Outfalls" },
];

const TOL_FIELDS: Array<{
  key: keyof NumericTolerances; label: string; step: number; unit: string; hint: string;
}> = [
  { key: "spatialDistance",  label: "Spatial distance cutoff", step: 0.5,    unit: "map units", hint: "Max distance to pair unmatched IDs by coordinates." },
  { key: "invertElev",       label: "Invert elevation Δ",      step: 0.001,  unit: "ft / m",    hint: "Junction invert diffs below this are ignored." },
  { key: "conduitLengthPct", label: "Conduit length Δ",        step: 0.5,    unit: "%",         hint: "Length diffs within this % are ignored." },
  { key: "roughness",        label: "Roughness Δ (n)",         step: 0.0005, unit: "abs",       hint: "Manning's n / HW C diffs below this are ignored." },
  { key: "areaPct",          label: "Subcatchment area Δ",     step: 0.5,    unit: "%",         hint: "Area diffs within this % are ignored." },
  { key: "imperviousPct",    label: "% impervious Δ",          step: 0.5,    unit: "pp",        hint: "Imperv diffs within this many points are ignored." },
];

function TolerancesPanel({
  tolerances, setTolerances,
}: {
  tolerances: NumericTolerances;
  setTolerances: (t: NumericTolerances) => void;
}) {
  const update = (k: keyof NumericTolerances, v: number) =>
    setTolerances({ ...tolerances, [k]: Number.isFinite(v) ? v : 0 });
  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Matching tolerances
          </div>
          <div className="text-xs text-muted-foreground">
            Edits re-run the score and per-component diff instantly. Deltas at or below each
            threshold count as "match" and are excluded from deductions.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTolerances({ ...DEFAULT_TOLERANCES })}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-mono hover:bg-secondary cursor-pointer"
        >
          Reset defaults
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOL_FIELDS.map((f) => (
          <label key={f.key} className="block rounded-md border border-border/60 bg-background/40 p-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs text-foreground">{f.label}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{f.unit}</span>
            </div>
            <input
              type="number" min={0} step={f.step}
              value={tolerances[f.key]}
              onChange={(e) => update(f.key, parseFloat(e.target.value))}
              className="mt-1 w-full rounded-md border border-border bg-input px-2 py-1 font-mono text-sm"
            />
            <div className="mt-1 text-[11px] text-muted-foreground">{f.hint}</div>
          </label>
        ))}
      </div>
    </div>
  );
}

function ComparePage() {
  const [a, setA] = useState<LoadedFile | null>(null);
  const [b, setB] = useState<LoadedFile | null>(null);
  const [tolerances, setTolerances] = useState<NumericTolerances>({ ...DEFAULT_TOLERANCES });
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<keyof ComponentDetails>("conduits");
  const [downloading, setDownloading] = useState(false);
  const chartRef = useRef<HTMLDivElement | null>(null);

  const pick = useCallback((side: "a" | "b") => async (f: File) => {
    try {
      setError(null);
      const loaded = await loadFile(f);
      (side === "a" ? setA : setB)(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    }
  }, []);

  const pickFixture = useCallback((side: "a" | "b") => (key: string) => {
    const fx = FIXTURES.find((f) => f.key === key);
    if (!fx) return;
    setError(null);
    (side === "a" ? setA : setB)(loadFixture(fx));
  }, []);

  const loadDemoPair = useCallback(() => {
    const baseline = FIXTURES.find((f) => f.key === "swmm-baseline");
    const edited = FIXTURES.find((f) => f.key === "swmm-edited");
    if (baseline && edited) {
      setError(null);
      setA(loadFixture(baseline));
      setB(loadFixture(edited));
    }
  }, []);

  const report = useMemo<SimilarityReport | null>(() => {
    if (!a || !b) return null;
    try {
      return scoreModels(a.parsed, b.parsed, { tolerances });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scoring failed.");
      return null;
    }
  }, [a, b, tolerances]);

  const details = useMemo<ComponentDetails | null>(() => {
    if (!a || !b) return null;
    return buildComponentDetails(a.parsed, b.parsed, tolerances);
  }, [a, b, tolerances]);

  const radarData = useMemo(() => {
    if (!report) return [];
    return CATEGORIES.map((c) => ({ category: c, score: report.categoryScores[c] }));
  }, [report]);

  const downloadPdf = useCallback(async () => {
    if (!report || !a || !b) return;
    setDownloading(true);
    try {
      await generatePdfReport({
        report,
        details,
        nameA: a.name,
        nameB: b.name,
        chartEl: chartRef.current,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF generation failed.");
    } finally {
      setDownloading(false);
    }
  }, [report, details, a, b]);

  const formatMix = a && b && a.format !== b.format
    ? `${a.format} vs ${b.format} — comparing across formats; engineering interpretation is approximate.`
    : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Compare two hydraulic models</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        SWMM5, EPANET, and InfoWorks ICM files all parse into the same schema and score against
        the same 1000-point index. Everything stays on your machine.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={loadDemoPair}
          className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20 cursor-pointer"
        >
          ▶ Load demo pair (Baseline vs Calibrated)
        </button>
        <span className="text-xs text-muted-foreground">
          or pick a sample / upload your own .inp / .csv below
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FileSlot label="Model A" file={a} onPick={pick("a")} onPickFixture={pickFixture("a")} />
        <FileSlot label="Model B" file={b} onPick={pick("b")} onPickFixture={pickFixture("b")} />
      </div>

      {formatMix && (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          {formatMix}
        </div>
      )}

      <TolerancesPanel tolerances={tolerances} setTolerances={setTolerances} />


      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {report && a && b && details && (
        <>
          <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_2fr]">
            <ScoreDial value={report.overall} />
            <div ref={chartRef} className="rounded-lg border border-border bg-card p-4">
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

          <section className="mt-6 rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                  Per-component diff
                </div>
                <div className="text-sm text-muted-foreground">
                  Which properties on each matched element are identical, off, or only present on one side.
                </div>
              </div>
              <div className="flex gap-1 rounded-md border border-border p-1">
                {TABS.map((t) => {
                  const count = details[t.key].length;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTab(t.key)}
                      className={`rounded px-3 py-1 text-xs font-mono cursor-pointer ${
                        tab === t.key ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {t.label} <span className="opacity-70">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <ComponentList rows={details[tab]} />
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
                  onClick={downloadPdf}
                  disabled={downloading}
                  className="rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20 disabled:opacity-50 cursor-pointer"
                >
                  {downloading ? "Generating…" : "↓ PDF report"}
                </button>
                <button
                  onClick={() => downloadJson(report)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-mono hover:bg-secondary cursor-pointer"
                >
                  ↓ JSON
                </button>
                <button
                  onClick={() => downloadCsv(report)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-mono hover:bg-secondary cursor-pointer"
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
                {report.deductions.map((d, i) => (
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

      <OutputComparePanel />
    </main>
  );
}
