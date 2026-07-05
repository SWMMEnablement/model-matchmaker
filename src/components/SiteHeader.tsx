import { Link } from "@tanstack/react-router";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="font-mono text-sm tracking-tight text-primary">SWMM5</span>
          <span className="font-display text-base font-semibold">Similarity Index</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/compare"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "rounded-md px-3 py-1.5 bg-secondary text-foreground" }}
          >
            Compare
          </Link>
          <Link
            to="/batch"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "rounded-md px-3 py-1.5 bg-secondary text-foreground" }}
          >
            Batch
          </Link>
          <Link
            to="/methodology"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "rounded-md px-3 py-1.5 bg-secondary text-foreground" }}
          >
            Methodology
          </Link>
        </nav>
      </div>
    </header>
  );
}
