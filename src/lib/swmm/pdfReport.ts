// PDF export for /compare. Uses jsPDF + jspdf-autotable for typeset
// tables, and html2canvas to rasterise the radar chart element passed in
// from the React tree. Runs entirely in the browser — nothing leaves the
// machine.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import type { SimilarityReport } from "./score";
import type { ComponentDetails } from "./details";
import { CATEGORIES } from "./weights";

export interface PdfReportInput {
  report: SimilarityReport;
  details: ComponentDetails | null;
  nameA: string;
  nameB: string;
  chartEl: HTMLElement | null;
}

function scoreTone(value: number): [number, number, number] {
  if (value >= 900) return [90, 200, 130];   // success
  if (value >= 700) return [80, 200, 230];   // primary
  if (value >= 500) return [240, 190, 80];   // warning
  return [220, 90, 70];                       // destructive
}

export async function generatePdfReport(input: PdfReportInput): Promise<void> {
  const { report, details, nameA, nameB, chartEl } = input;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // ── Header ─────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("SWMM5 Similarity Report", margin, y);
  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, y);
  y += 18;
  doc.setTextColor(40);
  doc.setFontSize(11);
  doc.text(`Model A: ${nameA}`, margin, y); y += 14;
  doc.text(`Model B: ${nameB}`, margin, y); y += 22;

  // ── Score block ────────────────────────────────────────────────
  const [r, g, bl] = scoreTone(report.overall);
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, y, 160, 90, 6, 6, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("SIMILARITY INDEX", margin + 12, y + 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  doc.setTextColor(r, g, bl);
  doc.text(String(report.overall), margin + 12, y + 58);
  doc.setFontSize(11);
  doc.setTextColor(110);
  doc.text("/ 1000", margin + 12, y + 78);

  // Inline category scores beside it
  doc.setTextColor(40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let cy = y + 14;
  for (const c of CATEGORIES) {
    const v = report.categoryScores[c];
    doc.text(`${c}`, margin + 190, cy);
    doc.setFont("helvetica", "bold");
    doc.text(String(v), margin + 320, cy, { align: "right" });
    doc.setFont("helvetica", "normal");
    cy += 11;
  }
  y += 110;

  // ── Radar chart screenshot ─────────────────────────────────────
  if (chartEl) {
    try {
      const canvas = await html2canvas(chartEl, {
        backgroundColor: "#1a2030",
        scale: 2,
        logging: false,
        useCORS: true,
      });
      const img = canvas.toDataURL("image/png");
      const ratio = canvas.height / canvas.width;
      const w = pageW - margin * 2;
      const h = w * ratio;
      if (y + h > 800) { doc.addPage(); y = margin; }
      doc.addImage(img, "PNG", margin, y, w, h);
      y += h + 16;
    } catch {
      // chart capture is best-effort; continue without it
    }
  }

  // ── Match summary ──────────────────────────────────────────────
  if (y > 700) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(40);
  doc.text("Element matching", margin, y);
  y += 6;
  autoTable(doc, {
    startY: y + 4,
    head: [["Element", "Matched", "Only in A", "Only in B"]],
    body: (["junctions", "conduits", "subcatchments", "outfalls"] as const).map((k) => [
      k,
      String(report.matchStats[k].matched),
      String(report.matchStats[k].onlyA),
      String(report.matchStats[k].onlyB),
    ]),
    styles: { fontSize: 9, font: "helvetica" },
    headStyles: { fillColor: [40, 60, 90], textColor: 255 },
    margin: { left: margin, right: margin },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // ── Full deductions table ──────────────────────────────────────
  if (y > 720) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`All deductions (${report.deductions.length})`, margin, y);
  autoTable(doc, {
    startY: y + 6,
    head: [["Category", "Reason", "Detail", "−Points"]],
    body: report.deductions.map((d) => [
      d.category,
      d.label,
      d.detail ?? "",
      d.amount.toFixed(2),
    ]),
    styles: { fontSize: 8, font: "helvetica", cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [40, 60, 90], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 150 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 50, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // ── Per-component diff appendices ──────────────────────────────
  if (details) {
    const sections: Array<[string, typeof details.junctions]> = [
      ["Junctions", details.junctions],
      ["Conduits", details.conduits],
      ["Subcatchments", details.subcatchments],
      ["Outfalls", details.outfalls],
    ];
    for (const [label, rows] of sections) {
      if (rows.length === 0) continue;
      doc.addPage();
      y = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`Per-component diff — ${label}`, margin, y);
      y += 8;
      autoTable(doc, {
        startY: y + 6,
        head: [["ID", "Match", "Property", "A", "B", "Δ / status"]],
        body: rows.flatMap((r) =>
          r.props.map((p, i) => [
            i === 0 ? r.id : "",
            i === 0
              ? (r.matchedBy === "unmatched"
                  ? "unmatched"
                  : `${r.matchedBy}${r.distance !== undefined ? ` ${r.distance.toFixed(1)}u` : ""}`)
              : "",
            p.name,
            p.a === null ? "—" : String(p.a),
            p.b === null ? "—" : String(p.b),
            p.delta ?? (p.status === "match" ? "ok" : p.status),
          ]),
        ),
        styles: { fontSize: 8, font: "helvetica", cellPadding: 3 },
        headStyles: { fillColor: [40, 60, 90], textColor: 255 },
        margin: { left: margin, right: margin },
      });
    }
  }

  doc.save(`swmm-similarity-${report.overall}.pdf`);
}
