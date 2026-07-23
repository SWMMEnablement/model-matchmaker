import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SWMM5 Similarity Index — Bill James for hydraulic models" },
      { name: "description", content: "Upload two SWMM5 .inp files. Get a 0–1000 similarity score with per-category breakdown. Everything runs in your browser." },
      { property: "og:title", content: "SWMM5 Similarity Index" },
      { property: "og:description", content: "How alike are your two SWMM5 models — really? 1000 means identical." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-16">
      <section className="mb-20">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-mono text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          v1 · SWMM5 ↔ SWMM5
        </div>
        <h1 className="font-display text-5xl font-bold leading-tight tracking-tight md:text-6xl">
          How alike are your two<br />
          <span className="text-primary">SWMM5 models</span>, really?
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          A Bill James–style similarity index for stormwater models. Start at
          1000. Deduct points for every difference in topology, geometry,
          hydraulics, subcatchments, and simulation settings. A single number
          tells you whether two <code className="text-foreground">.inp</code> files are calibration siblings or
          strangers.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/compare"
            className="rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Compare two models →
          </Link>
          <Link
            to="/methodology"
            className="rounded-md border border-border px-5 py-3 font-medium text-foreground transition-colors hover:bg-secondary"
          >
            How the score works
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { score: "1000", label: "No detected differences (within scope & tolerance)", tone: "text-success" },
          { score: "900+", label: "Same model, light edits", tone: "text-primary" },
          { score: "<600", label: "Materially different models", tone: "text-destructive" },
        ].map((x) => (
          <div key={x.label} className="rounded-lg border border-border bg-card p-6">
            <div className={`font-mono text-3xl font-semibold ${x.tone}`}>{x.score}</div>
            <div className="mt-1 text-sm text-muted-foreground">{x.label}</div>
          </div>
        ))}
      </section>

      <section className="mt-10 rounded-lg border border-warning/30 bg-warning/5 p-5 text-sm">
        <div className="font-mono text-xs uppercase tracking-widest text-warning">Honest scope</div>
        <p className="mt-2 text-muted-foreground">
          <strong className="text-foreground">SWMM5 ↔ SWMM5 is the only fully-supported comparison.</strong>{" "}
          EPANET support is experimental (structural only — pressurized-pipe physics is not equivalent to
          drainage). InfoWorks ICM requires an export-profile adapter. See the{" "}
          <Link to="/methodology" className="text-primary underline">methodology page</Link> for the
          per-format support matrix.
        </p>
      </section>

      <section className="mt-20">
        <h2 className="font-display text-2xl font-semibold">The Bill James adaptation</h2>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          James's baseball Similarity Scores start at 1000 and subtract for
          differences across the stat line — hits, home runs, RBI, position.
          We do the same thing for SWMM5: every section of the <code>.inp</code> file
          becomes a category, and every attribute pair becomes a deduction.
        </p>
        <pre className="mt-6 overflow-x-auto rounded-lg border border-border bg-card p-5 font-mono text-sm text-foreground">
{`Score = 1000
      − Σ (deduction_per_unit × |attr_A − attr_B|)   // capped per attribute
      − categorical penalties                          // units, routing, etc.`}
        </pre>
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { t: "Hybrid matching", d: "Match elements by ID first; fall back to nearest-neighbor on COORDINATES within a tolerance you set." },
          { t: "7 categories", d: "Topology, Geometry, Hydraulics, Subcatchments, Hydrology, Boundary, Simulation — each capped." },
          { t: "Top-N drivers", d: "Largest deductions surfaced first so you see exactly why the models diverge." },
          { t: "Private by default", d: "Parsing & scoring runs entirely in your browser. No upload, no server." },
        ].map((f) => (
          <div key={f.t} className="rounded-lg border border-border bg-card p-5">
            <div className="font-semibold">{f.t}</div>
            <div className="mt-2 text-sm text-muted-foreground">{f.d}</div>
          </div>
        ))}
      </section>

      <footer className="mt-24 border-t border-border pt-6 text-xs text-muted-foreground">
        Inspired by Bill James's Hall of Fame Similarity Scores. SWMM5 is a public-domain
        hydraulic model by US EPA. Not affiliated with either.
      </footer>
    </main>
  );
}
