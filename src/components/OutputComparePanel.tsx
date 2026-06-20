import { useCallback, useMemo, useState } from "react";
import type { ParsedRpt } from "@/lib/swmm/parseRpt";
import { parseAnyRpt, type RptFormat } from "@/lib/swmm/parseAnyRpt";
import {
  compareOutputs,
  DEFAULT_OUTPUT_TOLERANCES,
  type OutputReport,
  type OutputTolerances,
  type OutputElementDiff,
} from "@/lib/swmm/outputCompare";
import { RPT_FIXTURES, type RptFixture } from "@/lib/swmm/rptFixtures";

interface LoadedRpt { name: string; parsed: ParsedRpt; format: RptFormat; }

function loadFixture(fx: RptFixture): LoadedRpt {
  const { parsed, format } = parseAnyRpt(fx.text, fx.format);
  return { name: fx.name, parsed, format };
}

const STATUS_TONE: Record<string, string> = {
  match: "text-success",
  differ: "text-warning",
  "only-a": "text-destructive",
  "only-b": "text-destructive",
};

function ElementRows({ rows }: { rows: OutputElementDiff[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) {
    return <div className="py-3 text-center text-xs text-muted-foreground">No elements reported.</div>;
  }
  return (
    <ul className="divide-y divide-border/40">
      {rows.map((r) => {
        const isOpen = open === r.id;
        const tone =
          r.status === "only-a" || r.status === "only-b" ? "text-destructive" :
          r.differs === 0 ? "text-success" : "text-warning";
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : r.id)}
              className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-secondary/40 px-2 rounded cursor-pointer"
            >
              <span className="font-mono text-xs text-primary w-24 truncate">{r.id}</span>
              <span className={`text-xs font-mono ${tone}`}>
                {r.matched} match · {r.differs} differ
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                worst {(r.worstPct * 100).toFixed(1)}%
              </span>
              <span className="ml-auto text-xs text-muted-foreground">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="px-2 pb-3">
                <table className="w-full font-mono text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left py-1">Output</th>
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
                        <td className={`py-1 pr-2 ${STATUS_TONE[p.status]}`}>{p.delta}</td>
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

function RptSlot({
  label, file, onPick, onPickFixture,
}: {
  label: string;
  file: LoadedRpt | null;
  onPick: (f: File) => void;
  onPickFixture: (k: string) => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-4">
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      {file ? (
        <div className="mt-1">
          <div className="truncate font-mono text-sm">{file.name}</div>
          <div className="text-xs text-muted-foreground">
            {file.parsed.nodeDepth.length} nodes · {file.parsed.linkFlow.length} links ·{" "}
            {file.parsed.subRunoff.length} subs
          </div>
        </div>
      ) : (
        <div className="mt-1 text-sm text-muted-foreground">Upload a .rpt file or load a sample run.</div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-mono hover:bg-secondary/80">
          Upload .rpt
          <input
            type="file" accept=".rpt,.txt,text/plain" className="hidden"
            onChange={async (e) => {
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
          <option value="">Load sample run…</option>
          {RPT_FIXTURES.map((fx) => (
            <option key={fx.key} value={fx.key}>{fx.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

const TOL_FIELDS: Array<{ key: keyof OutputTolerances; label: string; unit: string }> = [
  { key: "depthPct",      label: "Node depth Δ",   unit: "%" },
  { key: "flowPct",       label: "Link flow Δ",    unit: "%" },
  { key: "runoffPct",     label: "Sub runoff Δ",   unit: "%" },
  { key: "continuityPct", label: "Continuity Δ",   unit: "% abs" },
];

const OUTPUT_TABS: Array<{ key: "nodes" | "links" | "subcatchments"; label: string }> = [
  { key: "nodes", label: "Nodes" },
  { key: "links", label: "Links" },
  { key: "subcatchments", label: "Subcatchments" },
];

function ScoreBadge({ value }: { value: number }) {
  const tone =
    value >= 900 ? "text-success border-success/40 bg-success/10" :
    value >= 700 ? "text-primary border-primary/40 bg-primary/10" :
    value >= 500 ? "text-warning border-warning/40 bg-warning/10" :
                   "text-destructive border-destructive/40 bg-destructive/10";
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg border p-6 ${tone}`}>
      <div className="text-[10px] uppercase tracking-widest opacity-80">Output Similarity</div>
      <div className="font-mono text-5xl font-bold">{value}</div>
      <div className="font-mono text-xs opacity-80">/ 1000</div>
    </div>
  );
}

export function OutputComparePanel() {
  const [a, setA] = useState<LoadedRpt | null>(null);
  const [b, setB] = useState<LoadedRpt | null>(null);
  const [tol, setTol] = useState<OutputTolerances>({ ...DEFAULT_OUTPUT_TOLERANCES });
  const [tab, setTab] = useState<"nodes" | "links" | "subcatchments">("nodes");
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback((side: "a" | "b") => async (f: File) => {
    try {
      setError(null);
      const text = await f.text();
      const { parsed, format } = parseAnyRpt(text);
      (side === "a" ? setA : setB)({ name: f.name, parsed, format });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read .rpt file");
    }
  }, []);

  const pickFx = useCallback((side: "a" | "b") => (k: string) => {
    const fx = RPT_FIXTURES.find((f) => f.key === k);
    if (!fx) return;
    (side === "a" ? setA : setB)(loadFixture(fx));
  }, []);

  const loadDemo = useCallback(() => {
    setA(loadFixture(RPT_FIXTURES[0]));
    setB(loadFixture(RPT_FIXTURES[1]));
  }, []);

  const report = useMemo<OutputReport | null>(() => {
    if (!a || !b) return null;
    try { return compareOutputs(a.parsed, b.parsed, tol); }
    catch (e) { setError(e instanceof Error ? e.message : "Output compare failed"); return null; }
  }, [a, b, tol]);

  return (
    <section className="mt-10 rounded-lg border border-border bg-card/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Output comparison (.rpt)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pair the simulation reports produced by each model. We diff node depths/HGL, link flows,
            subcatchment runoff, and continuity errors — independent of the input similarity above.
          </p>
        </div>
        <button
          type="button"
          onClick={loadDemo}
          className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary hover:bg-primary/20 cursor-pointer"
        >
          ▶ Load demo run pair
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <RptSlot label="Run A .rpt" file={a} onPick={pick("a")} onPickFixture={pickFx("a")} />
        <RptSlot label="Run B .rpt" file={b} onPick={pick("b")} onPickFixture={pickFx("b")} />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-background/40 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Output tolerances
          </div>
          <button
            type="button"
            onClick={() => setTol({ ...DEFAULT_OUTPUT_TOLERANCES })}
            className="rounded-md border border-border px-2 py-1 text-xs font-mono hover:bg-secondary cursor-pointer"
          >
            Reset
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TOL_FIELDS.map((f) => (
            <label key={f.key} className="block rounded-md border border-border/60 bg-background/40 p-2">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs">{f.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{f.unit}</span>
              </div>
              <input
                type="number" min={0} step={0.5}
                value={tol[f.key]}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setTol({ ...tol, [f.key]: Number.isFinite(v) ? v : 0 });
                }}
                className="mt-1 w-full rounded-md border border-border bg-input px-2 py-1 font-mono text-sm"
              />
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {report && (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_2fr]">
            <ScoreBadge value={report.overall} />
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Output category scores
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1 text-left">Category</th>
                    <th className="py-1 text-right">Score</th>
                    <th className="py-1 text-right">RMS rel. err</th>
                    <th className="py-1 text-right">Elements</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {report.categories.map((c) => (
                    <tr key={c.label} className="border-b border-border/40">
                      <td className="py-1">{c.label}</td>
                      <td className={`py-1 text-right ${c.score >= 900 ? "text-success" : c.score >= 700 ? "text-primary" : c.score >= 500 ? "text-warning" : "text-destructive"}`}>
                        {c.score}
                      </td>
                      <td className="py-1 text-right text-muted-foreground">{c.rmsePct.toFixed(2)}%</td>
                      <td className="py-1 text-right text-muted-foreground">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="rounded border border-border/60 p-2">
                  <div className="text-muted-foreground">Runoff continuity Δ</div>
                  <div>{report.continuity.deltaRunoffPct?.toFixed(3) ?? "—"} %</div>
                </div>
                <div className="rounded border border-border/60 p-2">
                  <div className="text-muted-foreground">Flow routing continuity Δ</div>
                  <div>{report.continuity.deltaFlowPct?.toFixed(3) ?? "—"} %</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Per-element output diff
              </div>
              <div className="flex gap-1 rounded-md border border-border p-1">
                {OUTPUT_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`rounded px-3 py-1 text-xs font-mono cursor-pointer ${
                      tab === t.key ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {t.label} ({report.elements[t.key].length})
                  </button>
                ))}
              </div>
            </div>
            <ElementRows rows={report.elements[tab]} />
          </div>
        </>
      )}
    </section>
  );
}
