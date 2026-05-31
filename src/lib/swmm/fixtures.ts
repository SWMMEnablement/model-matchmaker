// Sample SWMM5 .inp fixtures preloaded on /compare so users can try the
// workflow without hunting for their own files. Three small models:
//  - baseline:  starting drainage network
//  - edited:    same network with minor calibration tweaks (n, %imperv, length)
//  - redesign:  added subcatchment + extra conduit + units change (large diff)
//
// EPANET / ICM note: the v1 parser is SWMM5-only. We include short EPANET
// and ICM sample snippets purely as previews so users can see what those
// formats look like; they are not run through the scoring engine yet.

export interface Fixture {
  key: string;
  name: string;
  format: "SWMM5" | "EPANET" | "ICM";
  description: string;
  text: string;
}

const baseline = `[TITLE]
Sample Drainage Network — Baseline

[OPTIONS]
FLOW_UNITS           CMS
INFILTRATION         HORTON
FLOW_ROUTING         DYNWAVE
START_DATE           01/01/2024
END_DATE             01/02/2024
REPORT_STEP          00:05:00
ROUTING_STEP         0:00:30

[RAINGAGES]
RG1  INTENSITY  0:05  1.0  TIMESERIES  TS1

[SUBCATCHMENTS]
S1  RG1  J1  2.50  35  120  0.5  0
S2  RG1  J2  1.80  55  100  0.8  0
S3  RG1  J3  3.10  40  150  0.4  0

[SUBAREAS]
S1  0.013  0.10  0.05  5  25
S2  0.013  0.10  0.05  5  25
S3  0.013  0.10  0.05  5  25

[INFILTRATION]
S1  3.0  0.5  4  7  0
S2  3.0  0.5  4  7  0
S3  3.0  0.5  4  7  0

[JUNCTIONS]
J1  100.0  2.0  0  0  0
J2   98.5  2.0  0  0  0
J3   97.0  2.0  0  0  0
J4   95.5  2.5  0  0  0

[OUTFALLS]
O1   94.0  FREE  0

[CONDUITS]
C1  J1  J2  120  0.013  0  0
C2  J2  J3  140  0.013  0  0
C3  J3  J4  110  0.013  0  0
C4  J4  O1   80  0.013  0  0

[XSECTIONS]
C1  CIRCULAR  0.60  0  0  0  1
C2  CIRCULAR  0.60  0  0  0  1
C3  CIRCULAR  0.75  0  0  0  1
C4  CIRCULAR  0.90  0  0  0  1

[COORDINATES]
J1  100  500
J2  220  490
J3  340  470
J4  460  450
O1  580  430

[SYMBOLS]
RG1  50  520
`;

const edited = `[TITLE]
Sample Drainage Network — Calibrated

[OPTIONS]
FLOW_UNITS           CMS
INFILTRATION         HORTON
FLOW_ROUTING         DYNWAVE
START_DATE           01/01/2024
END_DATE             01/02/2024
REPORT_STEP          00:05:00
ROUTING_STEP         0:00:30

[RAINGAGES]
RG1  INTENSITY  0:05  1.0  TIMESERIES  TS1

[SUBCATCHMENTS]
S1  RG1  J1  2.50  42  120  0.5  0
S2  RG1  J2  1.80  60  105  0.8  0
S3  RG1  J3  3.20  45  150  0.4  0

[SUBAREAS]
S1  0.015  0.12  0.05  5  25
S2  0.015  0.12  0.05  5  25
S3  0.015  0.12  0.05  5  25

[INFILTRATION]
S1  3.0  0.5  4  7  