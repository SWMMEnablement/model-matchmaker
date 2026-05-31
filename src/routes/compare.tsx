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
