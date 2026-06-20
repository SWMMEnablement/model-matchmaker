// Sample output fixtures preloaded on /compare. Mix of SWMM5 .rpt, ICM CSV
// result exports, and EPANET .rpt so users can run cross-format output diffs
// (SWMM↔SWMM, SWMM↔ICM, SWMM↔EPANET).

export interface RptFixture {
  key: string;
  name: string;
  format: "SWMM5" | "ICM" | "EPANET";
  description: string;
  text: string;
}

const BASELINE_RPT = `
  EPA STORM WATER MANAGEMENT MODEL - VERSION 5.2

  *********************
  Runoff Quantity Continuity                       Volume          Depth
  *********************                           hectare-m             mm
  Total Precipitation ......................         0.180          25.000
  Surface Runoff ...........................         0.092          12.800
  Continuity Error (%) .....................         -0.142

  **************************
  Flow Routing Continuity                          Volume         Volume
  **************************                     hectare-m       10^6 ltr
  Continuity Error (%) .....................         0.310

  ******************
  Node Depth Summary
  ******************

  ---------------------------------------------------------------------------------
                                 Average  Maximum  Maximum  Time of Max    Reported
                                   Depth    Depth      HGL   Occurrence   Max Depth
  Node                 Type        Meters   Meters   Meters  days hr:min     Meters
  ---------------------------------------------------------------------------------
  J1                   JUNCTION    0.42     1.10   101.10    0  03:15       1.08
  J2                   JUNCTION    0.55     1.35    99.85    0  03:20       1.33
  J3                   JUNCTION    0.62     1.48    98.48    0  03:25       1.45
  J4                   JUNCTION    0.71     1.62    97.12    0  03:30       1.60
  O1                   OUTFALL     0.40     0.95    94.95    0  03:35       0.92

  *********************
  Node Flooding Summary
  *********************
  No nodes were flooded.

  *****************
  Link Flow Summary
  *****************

  ---------------------------------------------------------------------------
                                 Maximum  Time of Max   Maximum    Max/    Max/
                                |Flow|   Occurrence   |Veloc|    Full    Full
  Link                 Type     CMS      days hr:min   m/sec     Flow   Depth
  ---------------------------------------------------------------------------
  C1                   CONDUIT  0.220    0  03:15      1.85      0.58    0.62
  C2                   CONDUIT  0.310    0  03:20      1.95      0.62    0.66
  C3                   CONDUIT  0.420    0  03:25      2.10      0.55    0.61
  C4                   CONDUIT  0.560    0  03:30      2.35      0.51    0.58

  ***************************
  Subcatchment Runoff Summary
  ***************************

  ---------------------------------------------------------------------------------
                            Total    Total    Total    Total    Total    Total    Peak  Runoff
                           Precip   Run-on     Evap   Infil   Runoff  Runoff  Runoff   Coeff
  Subcatchment                 mm       mm       mm      mm       mm   10^6L     CMS
  ---------------------------------------------------------------------------------
  S1                        25.00     0.00     0.10   10.50    14.40     0.36    0.180   0.576
  S2                        25.00     0.00     0.10    8.30    16.60     0.30    0.205   0.664
  S3                        25.00     0.00     0.10   12.20    12.70     0.39    0.155   0.508
`;

const EDITED_RPT = `
  EPA STORM WATER MANAGEMENT MODEL - VERSION 5.2

  *********************
  Runoff Quantity Continuity                       Volume          Depth
  *********************                           hectare-m             mm
  Total Precipitation ......................         0.180          25.000
  Surface Runoff ...........................         0.101          14.050
  Continuity Error (%) .....................         -0.180

  **************************
  Flow Routing Continuity                          Volume         Volume
  **************************                     hectare-m       10^6 ltr
  Continuity Error (%) .....................         0.480

  ******************
  Node Depth Summary
  ******************

  ---------------------------------------------------------------------------------
                                 Average  Maximum  Maximum  Time of Max    Reported
                                   Depth    Depth      HGL   Occurrence   Max Depth
  Node                 Type        Meters   Meters   Meters  days hr:min     Meters
  ---------------------------------------------------------------------------------
  J1                   JUNCTION    0.45     1.18   101.18    0  03:15       1.16
  J2                   JUNCTION    0.58     1.42    99.82    0  03:20       1.40
  J3                   JUNCTION    0.65     1.56    98.56    0  03:25       1.53
  J4                   JUNCTION    0.74     1.71    97.21    0  03:30       1.69
  O1                   OUTFALL     0.42     1.00    95.00    0  03:35       0.98

  *********************
  Node Flooding Summary
  *********************

  ---------------------------------------------------------------------------
                                    Hours        Maximum
                                  Flooded           Rate   Day  Hr:Min   Volume
  Node                              hours            CMS                10^6 ltr
  ---------------------------------------------------------------------------
  J3                                 0.25           0.08     0  03:25      0.012

  *****************
  Link Flow Summary
  *****************

  ---------------------------------------------------------------------------
                                 Maximum  Time of Max   Maximum    Max/    Max/
                                |Flow|   Occurrence   |Veloc|    Full    Full
  Link                 Type     CMS      days hr:min   m/sec     Flow   Depth
  ---------------------------------------------------------------------------
  C1                   CONDUIT  0.245    0  03:15      1.92      0.64    0.68
  C2                   CONDUIT  0.335    0  03:20      2.02      0.67    0.71
  C3                   CONDUIT  0.455    0  03:25      2.20      0.60    0.66
  C4                   CONDUIT  0.605    0  03:30      2.45      0.55    0.63

  ***************************
  Subcatchment Runoff Summary
  ***************************

  ---------------------------------------------------------------------------------
                            Total    Total    Total    Total    Total    Total    Peak  Runoff
                           Precip   Run-on     Evap   Infil   Runoff  Runoff  Runoff   Coeff
  Subcatchment                 mm       mm       mm      mm       mm   10^6L     CMS
  ---------------------------------------------------------------------------------
  S1                        25.00     0.00     0.10    9.40    15.50     0.39    0.198   0.620
  S2                        25.00     0.00     0.10    7.50    17.40     0.31    0.222   0.696
  S3                        25.00     0.00     0.10   11.10    13.80     0.44    0.171   0.552
`;

const ICM_EDITED = `! InfoWorks ICM CSV results export
TABLE,sim_node
ID,MaxDepth,AvgDepth,MaxHGL,FloodVolume,HoursFlooded
J1,1.16,0.44,101.16,0,0
J2,1.40,0.57,99.82,0,0
J3,1.55,0.64,98.55,0.011,0.22
J4,1.70,0.73,97.20,0,0
O1,0.99,0.41,94.99,0,0

TABLE,sim_link
ID,MaxFlow,MaxVelocity,MaxDepthFull
C1,0.248,1.94,0.68
C2,0.338,2.04,0.71
C3,0.458,2.22,0.66
C4,0.608,2.46,0.63

TABLE,sim_subcatchment
ID,TotalRunoffVolume,PeakRunoff,TotalInfil,RunoffCoeff
S1,0.395,0.200,9.20,0.628
S2,0.315,0.225,7.30,0.704
S3,0.448,0.173,10.90,0.560

TABLE,sim_continuity
Runoff,FlowRouting
-0.16,0.50
`;

const EPANET_A = `  EPANET 2.2 - Pressure Network Results

  Node Results at 0:00:00 Hrs:
  ----------------------------------------------------------
  Node            Demand     Head    Pressure   Quality
  ----------------------------------------------------------
  J1              0.00       150.00  50.00      0.00
  J2              50.00      145.00  45.00      0.00
  J3              30.00      140.00  40.00      0.00

  Link Results at 0:00:00 Hrs:
  ----------------------------------------------------------
  Link            Flow       Velocity   Headloss
  ----------------------------------------------------------
  P1              80.00      1.80       5.00
  P2              50.00      1.40       3.00
  P3              30.00      1.10       2.00
`;

const EPANET_B = `  EPANET 2.2 - Pressure Network Results

  Node Results at 0:00:00 Hrs:
  ----------------------------------------------------------
  Node            Demand     Head    Pressure   Quality
  ----------------------------------------------------------
  J1              0.00       150.00  50.50      0.00
  J2              50.00      144.00  44.20      0.00
  J3              30.00      138.50  38.80      0.00

  Link Results at 0:00:00 Hrs:
  ----------------------------------------------------------
  Link            Flow       Velocity   Headloss
  ----------------------------------------------------------
  P1              82.00      1.84       5.20
  P2              52.00      1.46       3.20
  P3              31.50      1.16       2.10
`;

export const RPT_FIXTURES: RptFixture[] = [
  {
    key: "rpt-baseline",
    name: "SWMM5 — Baseline run.rpt",
    format: "SWMM5",
    description: "Output of the baseline network for a 25 mm storm.",
    text: BASELINE_RPT,
  },
  {
    key: "rpt-edited",
    name: "SWMM5 — Calibrated run.rpt",
    format: "SWMM5",
    description: "Same storm, calibrated parameters → slightly higher peaks and a flooded node.",
    text: EDITED_RPT,
  },
  {
    key: "icm-edited",
    name: "ICM — Calibrated CSV export",
    format: "ICM",
    description: "Same network, ICM-format results. Pair with a SWMM .rpt to diff cross-platform.",
    text: ICM_EDITED,
  },
  {
    key: "epanet-a",
    name: "EPANET — Run A.rpt",
    format: "EPANET",
    description: "Pressure-network snapshot. Node 'depth' columns map to pressure.",
    text: EPANET_A,
  },
  {
    key: "epanet-b",
    name: "EPANET — Run B.rpt",
    format: "EPANET",
    description: "Same network, slightly different demand pattern.",
    text: EPANET_B,
  },
];
