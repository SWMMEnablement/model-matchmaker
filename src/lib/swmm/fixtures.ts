// Sample fixtures preloaded on /compare. Three SWMM5 models exercise the
// engine end-to-end; EPANET and ICM samples are previews only (the v1
// parser is SWMM5-only and the UI will surface that when selected).

export interface Fixture {
  key: string;
  name: string;
  format: "SWMM5" | "EPANET" | "ICM";
  description: string;
  text: string;
  supported: boolean;
}

const BASELINE = "[TITLE]\nSample Drainage Network -- Baseline\n\n[OPTIONS]\nFLOW_UNITS           CMS\nINFILTRATION         HORTON\nFLOW_ROUTING         DYNWAVE\nSTART_DATE           01/01/2024\nEND_DATE             01/02/2024\nREPORT_STEP          00:05:00\nROUTING_STEP         0:00:30\n\n[RAINGAGES]\nRG1  INTENSITY  0:05  1.0  TIMESERIES  TS1\n\n[SUBCATCHMENTS]\nS1  RG1  J1  2.50  35  120  0.5  0\nS2  RG1  J2  1.80  55  100  0.8  0\nS3  RG1  J3  3.10  40  150  0.4  0\n\n[SUBAREAS]\nS1  0.013  0.10  0.05  5  25\nS2  0.013  0.10  0.05  5  25\nS3  0.013  0.10  0.05  5  25\n\n[INFILTRATION]\nS1  3.0  0.5  4  7  0\nS2  3.0  0.5  4  7  0\nS3  3.0  0.5  4  7  0\n\n[JUNCTIONS]\nJ1  100.0  2.0  0  0  0\nJ2   98.5  2.0  0  0  0\nJ3   97.0  2.0  0  0  0\nJ4   95.5  2.5  0  0  0\n\n[OUTFALLS]\nO1   94.0  FREE  0\n\n[CONDUITS]\nC1  J1  J2  120  0.013  0  0\nC2  J2  J3  140  0.013  0  0\nC3  J3  J4  110  0.013  0  0\nC4  J4  O1   80  0.013  0  0\n\n[XSECTIONS]\nC1  CIRCULAR  0.60  0  0  0  1\nC2  CIRCULAR  0.60  0  0  0  1\nC3  CIRCULAR  0.75  0  0  0  1\nC4  CIRCULAR  0.90  0  0  0  1\n\n[COORDINATES]\nJ1  100  500\nJ2  220  490\nJ3  340  470\nJ4  460  450\nO1  580  430\n";
const EDITED = "[TITLE]\nSample Drainage Network -- Calibrated\n\n[OPTIONS]\nFLOW_UNITS           CMS\nINFILTRATION         HORTON\nFLOW_ROUTING         DYNWAVE\nSTART_DATE           01/01/2024\nEND_DATE             01/02/2024\nREPORT_STEP          00:05:00\nROUTING_STEP         0:00:30\n\n[RAINGAGES]\nRG1  INTENSITY  0:05  1.0  TIMESERIES  TS1\n\n[SUBCATCHMENTS]\nS1  RG1  J1  2.50  42  120  0.5  0\nS2  RG1  J2  1.80  60  105  0.8  0\nS3  RG1  J3  3.20  45  150  0.4  0\n\n[SUBAREAS]\nS1  0.015  0.12  0.05  5  25\nS2  0.015  0.12  0.05  5  25\nS3  0.015  0.12  0.05  5  25\n\n[INFILTRATION]\nS1  3.0  0.5  4  7  0\nS2  3.0  0.5  4  7  0\nS3  3.0  0.5  4  7  0\n\n[JUNCTIONS]\nJ1  100.0  2.0  0  0  0\nJ2   98.4  2.0  0  0  0\nJ3   97.0  2.2  0  0  0\nJ4   95.5  2.5  0  0  0\n\n[OUTFALLS]\nO1   94.0  FREE  0\n\n[CONDUITS]\nC1  J1  J2  125  0.014  0  0\nC2  J2  J3  140  0.014  0  0\nC3  J3  J4  110  0.014  0  0\nC4  J4  O1   82  0.014  0  0\n\n[XSECTIONS]\nC1  CIRCULAR  0.60  0  0  0  1\nC2  CIRCULAR  0.60  0  0  0  1\nC3  CIRCULAR  0.75  0  0  0  1\nC4  CIRCULAR  0.90  0  0  0  1\n\n[COORDINATES]\nJ1  100  500\nJ2  220  490\nJ3  340  470\nJ4  460  450\nO1  580  430\n";
const REDESIGN = "[TITLE]\nSample Drainage Network -- Redesign with detention\n\n[OPTIONS]\nFLOW_UNITS           CFS\nINFILTRATION         GREEN_AMPT\nFLOW_ROUTING         DYNWAVE\nSTART_DATE           01/01/2024\nEND_DATE             01/02/2024\nREPORT_STEP          00:05:00\nROUTING_STEP         0:00:15\n\n[RAINGAGES]\nRG1  INTENSITY  0:05  1.0  TIMESERIES  TS1\n\n[SUBCATCHMENTS]\nS1  RG1  J1  2.50  50  130  0.5  0\nS2  RG1  J2  1.80  70  110  0.8  0\nS3  RG1  J3  3.10  55  150  0.4  0\nS4  RG1  J5  1.20  30   90  0.6  0\n\n[SUBAREAS]\nS1  0.020  0.15  0.05  5  25\nS2  0.020  0.15  0.05  5  25\nS3  0.020  0.15  0.05  5  25\nS4  0.020  0.15  0.05  5  25\n\n[INFILTRATION]\nS1  3.5  0.5  0.25  7  0\nS2  3.5  0.5  0.25  7  0\nS3  3.5  0.5  0.25  7  0\nS4  3.5  0.5  0.25  7  0\n\n[JUNCTIONS]\nJ1  100.0  3.0  0  0  0\nJ2   98.0  3.0  0  0  0\nJ3   96.5  3.0  0  0  0\nJ4   95.0  3.5  0  0  0\nJ5   97.5  2.5  0  0  0\n\n[OUTFALLS]\nO1   93.0  FIXED  92.5\n\n[CONDUITS]\nC1  J1  J2  140  0.020  0  0\nC2  J2  J3  150  0.020  0  0\nC3  J3  J4  120  0.020  0  0\nC4  J4  O1   90  0.020  0  0\nC5  J5  J3   70  0.020  0  0\n\n[XSECTIONS]\nC1  CIRCULAR    0.90  0  0  0  1\nC2  CIRCULAR    0.90  0  0  0  1\nC3  RECT_OPEN   1.20  1.5  0  0  1\nC4  RECT_OPEN   1.50  1.5  0  0  1\nC5  CIRCULAR    0.45  0  0  0  1\n\n[COORDINATES]\nJ1  100  500\nJ2  220  490\nJ3  340  470\nJ4  460  450\nJ5  330  570\nO1  580  430\n";
const EPANET = "; Sample EPANET INP -- preview only (parser is SWMM5-only)\n[TITLE]\nTiny pressure network\n\n[JUNCTIONS]\n;ID     Elev    Demand\n J1     100      0\n J2      95     50\n J3      90     30\n\n[RESERVOIRS]\n;ID     Head\n R1     150\n\n[PIPES]\n;ID     Node1   Node2   Length  Diam    Rough\n P1     R1      J1      1000    300     130\n P2     J1      J2       800    250     130\n P3     J2      J3       600    200     130\n";
const ICM = "! Sample InfoWorks ICM CSV-style export -- preview only (no parser yet)\nTABLE,hw_node\nID,Type,GroundLevel,ChamberArea\nJ1,Manhole,102.5,1.0\nJ2,Manhole,100.0,1.0\nJ3,Outfall,98.0,1.0\n\nTABLE,hw_conduit\nID,UsNode,DsNode,Length,Shape,Width,Height,Roughness_n\nC1,J1,J2,120,Circular,0.6,0.6,0.013\nC2,J2,J3,140,Circular,0.6,0.6,0.013\n";

export const FIXTURES: Fixture[] = [
  {
    key: "swmm-baseline",
    name: "SWMM5 — Baseline drainage network",
    format: "SWMM5",
    description: "3 subcatchments, 4 junctions, 4 conduits to an outfall.",
    text: BASELINE,
    supported: true,
  },
  {
    key: "swmm-edited",
    name: "SWMM5 — Calibrated variant",
    format: "SWMM5",
    description: "Same network with tweaked %imperv, Manning's n, and lengths.",
    text: EDITED,
    supported: true,
  },
  {
    key: "swmm-redesign",
    name: "SWMM5 — Redesign with extra branch",
    format: "SWMM5",
    description: "Added subcatchment + conduit, units swapped to CFS, new xsection shapes.",
    text: REDESIGN,
    supported: true,
  },
  {
    key: "epanet-sample",
    name: "EPANET — Tiny pressure network",
    format: "EPANET",
    description: "1 reservoir, 3 junctions, 3 pipes — parsed into the shared schema.",
    text: EPANET,
    supported: true,
  },
  {
    key: "icm-sample",
    name: "ICM — InfoWorks export",
    format: "ICM",
    description: "hw_node + hw_conduit tables mapped into junctions/conduits.",
    text: ICM,
    supported: true,
  },
];
