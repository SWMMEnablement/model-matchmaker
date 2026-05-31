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
