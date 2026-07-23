import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_WEIGHTS } from "@/lib/swmm/weights";
import { FORMAT_SUPPORT, LEVEL_TONE } from "@/lib/swmm/support";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology — SWMM5 Similarity Index" },
      { name: "description", content: "How the SWMM5 Similarity Index works: matching strategy, categories, deductions, and caps." },
    ],
  }),
  component: MethodologyPage,
});

const ROWS: Array<{ cat: string; attr: string; deduction: string }> = [
  { cat: "Topology", attr: "Junction / conduit / subcatchment / outfall / storage / special-link counts", deduction: "perPct × Δ%" },
  { cat: "Topology", attr: "Orphan elements (unmatched after ID + spatial pass)", deduction: `${DEFAULT_WEIGHTS.orphanElementPenalty} pt per orphan` },
  { cat: "Geometry", attr: "Conduit length", deduction: `${DEFAULT_WEIGHTS.conduitLengthPerPct} × Δ%` },
  { cat: "Geometry", attr: "Conduit slope (from invert offsets / length)", deduction: `${DEFAULT_WEIGHTS.conduitSlopePer001} per 0.001` },
  { cat: "Geometry", attr: "Junction invert elevation", deduction: `${DEFAULT_WEIGHTS.junctionInvertPerM} per unit` },
  { cat: "Geometry", attr: "Junction max-depth", deduction: `${DEFAULT_WEIGHTS.junctionMaxDepthPerPct} × Δ%` },
  { cat: "Geometry", attr: "Coordinate offset (spatial matches only)", deduction: `${DEFAULT_WEIGHTS.coordOffsetPerMeter} per unit, capped at ${DEFAULT_WEIGHTS.coordOffsetCapPerElement}` },
  { cat: "Hydraulics", attr: "Manning's n on conduits", deduction: `${DEFAULT_WEIGHTS.roughnessPer001} per 0.001` },
  { cat: "Hydraulics", attr: "Cross-section shape mismatch", deduction: `${DEFAULT_WEIGHTS.xsectionShapeMismatch} per pair` },
  { cat: "Hydraulics", attr: "Cross-section geom1 (size)", deduction: `${DEFAULT_WEIGHTS.xsectionGeom1PerPct} × Δ%` },
  { cat: "Subcatchments", attr: "Area", deduction: `${DEFAULT_WEIGHTS.areaPerPct} × Δ%` },
  { cat: "Subcatchments", attr: "% Impervious", deduction: `${DEFAULT_WEIGHTS.imperviousPerPct} per absolute %` },
  { cat: "Subcatchments", attr: "Width", deduction: `${DEFAULT_WEIGHTS.widthPerPct} × Δ%` },
  { cat: "Subcatchments", attr: "Slope", deduction: `${DEFAULT_WEIGHTS.subcatchSlopePerPct} × Δ%` },
  { cat: "Hydrology", attr: "Raingage assignment", deduction: `${DEFAULT_WEIGHTS.raingageMismatch} per mismatched subcatchment` },
  { cat: "Hydrology", attr: "INFILTRATION method", deduction: `${DEFAULT_WEIGHTS.infiltrationMethodMismatch}` },
  { cat: "Boundary", attr: "Outfall type", deduction: `${DEFAULT_WEIGHTS.outfallTypeMismatch} per pair` },
  { cat: "Simulation", attr: "FLOW_UNITS mismatch", deduction: `${DEFAULT_WEIGHTS.flowUnitsMismatch}` },
  { cat: "Simulation", attr: "FLOW_ROUTING mismatch", deduction: `${DEFAULT_WEIGHTS.routingModelMismatch}` },
  { cat: "Simulation", attr: "ROUTING_STEP mismatch", deduction: `${DEFAULT_WEIGHTS.timestepMismatch}` },
];

function MethodologyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">Methodology</h1>
      <p className="mt-3 text-muted-foreground">
        Modeled directly on Bill James's Hall of Fame Similarity Scores: every
        comparison starts at <span className="font-mono text-foreground">1000</span>, and we
        subtract for each attribute difference. The total deduction in any one
        category is capped at <span className="font-mono text-foreground">{DEFAULT_WEIGHTS.capPerCategory}</span>{" "}
        so a single bad section can't dominate.
      </p>

      <h2 className="mt-10 font-display text-xl font-semibold">Element matching (hybrid)</h2>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Pair elements with the same <span className="font-mono text-foreground">ID</span>.</li>
        <li>For the leftovers, pair by nearest <span className="font-mono text-foreground">[COORDINATES]</span> within your tolerance (default 5 units).</li>
        <li>Anything still unpaired counts as an <em>orphan</em> and adds a topology penalty.</li>
      </ol>

      <h2 className="mt-10 font-display text-xl font-semibold">Deduction table</h2>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card text-xs font-mono uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Attribute</th>
              <th className="px-3 py-2 text-left">Deduction</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr key={i} className="border-t border-border/40">
                <td className="px-3 py-2 font-mono text-xs text-primary">{r.cat}</td>
                <td className="px-3 py-2">{r.attr}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.deduction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-display text-xl font-semibold">Score bands</h2>
      <ul className="mt-3 space-y-2 text-sm">
        <li><span className="font-mono text-success">1000</span> — no detected differences within the currently-scored attributes and tolerances. Not a proof of engineering equivalence.</li>
        <li><span className="font-mono text-primary">900–999</span> — same model with minor edits or different IDs.</li>
        <li><span className="font-mono text-warning">700–899</span> — same study area, different scenario or version.</li>
        <li><span className="font-mono text-warning">500–699</span> — related but materially different.</li>
        <li><span className="font-mono text-destructive">&lt;500</span> — essentially different models.</li>
      </ul>

      <h2 className="mt-10 font-display text-xl font-semibold">P0 correctness — how the math is kept honest</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          <strong className="text-foreground">Symmetric percentage difference.</strong>{" "}
          Every relative-diff deduction uses{" "}
          <code className="text-foreground">200·|a − b| / (|a| + |b|)</code> so
          <code> score(A, B)</code> equals <code>score(B, A)</code>. The older{" "}
          <code>|Δ|/max</code> form biased toward whichever file happened to be uploaded as "A".
        </li>
        <li>
          <strong className="text-foreground">Unit normalization to SI.</strong>{" "}
          When <code>FLOW_UNITS</code> declares a US system (CFS/GPM/MGD), lengths, elevations,
          depths, coordinates, cross-section geometry, and subcatchment areas are converted
          to meters and m² before any comparison. A correctly-converted CFS-vs-CMS pair scores
          as identical instead of losing a flat 20-point unit penalty.
        </li>
        <li>
          <strong className="text-foreground">Symmetric matching.</strong>{" "}
          The hybrid ID-then-spatial matcher enumerates every candidate pair within
          tolerance, orders by distance and then by the sorted ID pair, and greedily
          accepts mutually-available pairs. The result no longer depends on which file is A.
        </li>
        <li>
          <strong className="text-foreground">Warnings vs. deductions.</strong>{" "}
          Changes that flip engineering meaning (routing model, infiltration method,
          outfall added/removed, conduit endpoint rewiring, un-normalizable units)
          are raised as <em>warnings</em> alongside their deduction so a capped category
          score can't hide them.
        </li>
      </ul>

      <h2 className="mt-10 font-display text-xl font-semibold">Format support</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        This is the single source of truth for what the app actually implements today.
        Everything else on the site defers to this table.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card text-xs font-mono uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Format / pairing</th>
              <th className="px-3 py-2 text-left">Support level</th>
              <th className="px-3 py-2 text-left">Scope</th>
            </tr>
          </thead>
          <tbody>
            {FORMAT_SUPPORT.map((r) => (
              <tr key={r.format} className="border-t border-border/40 align-top">
                <td className="px-3 py-2 font-mono text-xs">{r.format}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded border px-2 py-0.5 font-mono text-[10px] ${LEVEL_TONE[r.level]}`}>
                    {r.level}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.scope}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
