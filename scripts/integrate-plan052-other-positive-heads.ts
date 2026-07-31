import {
  runPlan052PositiveIntegration,
  type Plan052PositiveIntegrationConfig,
} from "./lib/plan052-positive-integration";

const config: Plan052PositiveIntegrationConfig = {
  integration_id: "other-positive-heads",
  accepted_at: "2026-07-30T20:30:00.000Z",
  issued_at_prefix: "2026-07-30T20:29:",
  positives: [
    {
      batch_id: "w2-other-pending-01",
      candidate_id: "candidate:6f4acd2ef6c371f69722e4bc",
      event_id: "event_s79-sbs-launch-2012",
      event_evidence_id: "2014_hylan_blvd_final_report#p012_c0003",
      onset: { date: "2012-09-02", precision: "day" },
      applications: [{
        route_record_id: "route_able-s79-sbs",
        gtfs_route_id: "S79+",
        route_evidence_id: "2014_hylan_blvd_final_report#p002_c0002",
        treatment_record_id: "treatment_station-consolidation",
        treatment_evidence_id: "2014_hylan_blvd_final_report#p007_c0007",
      }],
      rationale:
        "Blind adjudication proves the September 2, 2012 S79 SBS launch and exactly one station-consolidation application. Later TSP and other individually unbound treatments are excluded.",
    },
    {
      batch_id: "w2-other-pending-01",
      candidate_id: "candidate:e29b3e010cd413d7fe68df3d",
      event_id: "event_ttp-implementation-fall2019",
      event_evidence_id:
        "14th_street_preliminary_report_fall_2019_corrected#p003_c0017",
      onset: { date: "2019-10-03", precision: "day" },
      applications: [{
        route_record_id: "route_m14-ad-sbs",
        gtfs_route_id: "M14+",
        route_evidence_id:
          "14th_street_preliminary_report_fall_2019_corrected#p002_c0006",
        treatment_record_id: "treatment_ttp-restrictions-fall2019",
        treatment_evidence_id:
          "14th_street_preliminary_report_fall_2019_corrected#p002_c0007",
      }],
      rationale:
        "Blind adjudication proves the October 3, 2019 Transit and Truck Priority restrictions for the durable M14 A/D SBS subject. Pedestrian-space and boarding-platform work are excluded and the shared route subject prevents an inferred A/D cross-product.",
    },
  ],
};

const mode = process.argv[2];
if ((mode !== "--write" && mode !== "--check") || process.argv.length !== 3) {
  throw new Error(
    "usage: bun scripts/integrate-plan052-other-positive-heads.ts --write|--check",
  );
}
runPlan052PositiveIntegration(config, mode);
console.log(
  `Plan 052 other positive heads ${
    mode === "--write" ? "applied" : "verified"
  }: 2 published, 2 applications.`,
);
