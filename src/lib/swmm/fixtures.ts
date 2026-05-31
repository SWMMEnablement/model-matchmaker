// Sample SWMM5 .inp fixtures preloaded on /compare so users can try the
// workflow without hunting for their own files.
//
// EPANET / ICM note: the v1 parser is SWMM5-only. EPANET and ICM samples
// are included as previews so users can see what those formats look like;
// they are not yet run through the scoring engine.

export interface Fixture {
  key: string;
  name: string;
  format: "SWMM5" | "EPANET" | "ICM";
  description: string;
  text: string;
  supported: boolean;
}

const baseline = [
  "[TITLE]",
  "Sample Drainage Network -- Baseline",
  "",
  "[OPTIONS]",
  "FLOW_UNITS           CMS",
  "INFILTRATION         HORTON",
  "FLOW_ROUTING         DYNWAVE",
  "START_DATE           01/01/2024",
  "END_DATE             01/02/2024",
  "REPORT_STEP          00:05:00",
  "ROUTING_STEP         0:00:30",
  "",
  "[RAINGAGES]",
  "RG1  INTENSITY  0:05  1.0  TIMESERIES  TS1",
  "",
  "[SUBCATCHMENTS]",
  "S1  RG1  J1  2.50  35  120  0.5  0",
  "S2  RG1  J2  1.80  55  100  0.8  0",
  "S3  RG1  J3  3.10  40  150  0.4  0",
  "",
  "[SUBAREAS]",
  "S1  0.013  0.10  0.05  5  25",
  "S2  0.013  0.10  0.05  5  25",
  "S3  0.013  0.10  0.05  5  25",
  "",
  "[INFILTRATION]",
  "S1  3.0  0.5  4  7  0",
  "S2  3.0  0.5  4  7  0",
  "S3  3.0  0.5  4  7  0",
  "",
  "[JUNCTIONS]",
  "J1  100.0  2.0  0  0  0",
  "J2   98.5  2.0  0  0  0",
  "J3   97.0  2.0  0  0  0",
  "J4   