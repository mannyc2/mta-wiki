import {
  runPlan052PositiveIntegration,
  type Plan052PositiveIntegrationConfig,
} from "./lib/plan052-positive-integration";

const config: Plan052PositiveIntegrationConfig = {
  integration_id: "corridor-positive-heads",
  accepted_at: "2026-07-30T20:00:00.000Z",
  issued_at_prefix: "2026-07-30T19:59:",
  positives: [
    {
      batch_id: "w2-corridor-pending-01",
      candidate_id: "candidate:1f9ec8221329e8dc1c2b050d",
      event_id: "event_2018-cropsey-ave-project",
      event_evidence_id: "bay_pkwy_cropsey_ave_jan2025#p015_c0002",
      onset: { date: "2018", precision: "year" },
      applications: [
        {
          route_record_id: "route_b6-2015-sbk-corridor",
          gtfs_route_id: "B6",
          route_evidence_id: "bay_pkwy_cropsey_ave_cb12_jun2025#p004_c0002",
          treatment_record_id: "treatment_bus-boarding-island-cropsey",
          treatment_evidence_id: "bay_pkwy_cropsey_ave_jan2025#p015_c0002",
        },
        {
          route_record_id: "route_b82-sbs",
          gtfs_route_id: "B82+",
          route_evidence_id: "bay_pkwy_cropsey_ave_jan2025#p004_c0002",
          treatment_record_id: "treatment_bus-boarding-island-cropsey",
          treatment_evidence_id: "bay_pkwy_cropsey_ave_jan2025#p015_c0002",
        },
      ],
      rationale:
        "Blind adjudication proves one 2018 Cropsey boarding island exhaustively serving the B6 and B82 SBS layover. Two explicit applications preserve the stated incidence without extending the treatment to other corridor routes.",
    },
    {
      batch_id: "w2-corridor-pending-01",
      candidate_id: "candidate:3493b460514dbc2bf51b5049",
      event_id: "event_dekalb-lafayette-summer2024-temp-lanes",
      event_evidence_id: "dekalb_lafayette_cb2_dec2024#p026_c0002",
      onset: { date: "2024-summer", precision: "season" },
      applications: [{
        route_record_id: "route_b38",
        gtfs_route_id: "B38",
        route_evidence_id: "dekalb_lafayette_cb2_dec2024#p026_c0002",
        treatment_record_id: "treatment_temp-bus-lanes-summer2024",
        treatment_evidence_id: "dekalb_lafayette_cb2_dec2024#p026_c0002",
      }],
      rationale:
        "The same retrospective evidence block proves Summer 2024 temporary lanes and their B38 service benefit. No shuttle or other route is inferred.",
    },
    {
      batch_id: "w2-corridor-pending-01",
      candidate_id: "candidate:38ce9289f7e4b98ecd1f3caf",
      event_id: "event_able-implementation-nov18-2022",
      event_evidence_id: "fordham_rd_inwood_cb7_jun2023#p023_c0002",
      onset: { date: "2022-11-18", precision: "day" },
      applications: [{
        route_record_id: "route_bx12-plus",
        gtfs_route_id: "BX12+",
        route_evidence_id: "fordham_rd_inwood_cb7_jun2023#p004_c0002",
        treatment_record_id: "treatment_able-enforcement",
        treatment_evidence_id: "fordham_rd_inwood_cb5_jun2023#p023_c0002",
      }],
      rationale:
        "Blind adjudication proves ABLE implementation on all Bx12 SBS buses on November 18, 2022. The summons start is not substituted for implementation onset and no other Fordham route is added.",
    },
    {
      batch_id: "w2-corridor-pending-02",
      candidate_id: "candidate:bfbdd7c7a4367ca16b504a89",
      event_id: "event_implement-fulton-atlantic-jul-dec2019",
      event_evidence_id: "malcolm_x_blvd_utica_ave_mar2020#p016_c0002",
      onset: { date: "2019-12", precision: "month" },
      applications: [{
        route_record_id: "route_utica-ave-sbs",
        gtfs_route_id: "B46+",
        route_evidence_id: "malcolm_x_blvd_utica_ave_mar2020#p004_c0002",
        treatment_record_id: "treatment_fulton-atlantic-bus-lane-mar2020",
        treatment_evidence_id: "malcolm_x_blvd_utica_ave_mar2020#p009_c0002",
      }],
      rationale:
        "The retrospective timeline proves the Fulton-to-Atlantic phase through December 2019 and exactly joins B46 SBS to the one-block southbound bus lane. The later proposed phase is excluded.",
    },
    {
      batch_id: "w2-corridor-pending-02",
      candidate_id: "candidate:c40d519ef3425be71f964ec3",
      event_id: "event_flatbush-av-phase1-installed-fall2025",
      event_evidence_id: "flatbush_ave_bus_priority_mtp_briefing_apr2026#p004_c0002",
      onset: { date: "2025-fall", precision: "season" },
      applications: [
        {
          route_record_id: "route_b41-ace",
          gtfs_route_id: "B41",
          route_evidence_id: "flatbush_ave_bus_priority_mtp_briefing_apr2026#p012_c0003",
          treatment_record_id: "treatment_center-running-bus-lanes-flatbush-av",
          treatment_evidence_id: "flatbush_ave_bus_priority_mtp_briefing_apr2026#p007_c0002",
        },
        {
          route_record_id: "route_b67-flatbush-ave-apr2026",
          gtfs_route_id: "B67",
          route_evidence_id: "flatbush_ave_bus_priority_mtp_briefing_apr2026#p012_c0003",
          treatment_record_id: "treatment_center-running-bus-lanes-flatbush-av",
          treatment_evidence_id: "flatbush_ave_bus_priority_mtp_briefing_apr2026#p007_c0002",
        },
      ],
      rationale:
        "The April 2026 retrospective briefing proves Fall 2025 center-running lanes and explicitly identifies B41 and B67 in them. Two applications preserve that incidence and exclude the later phase and other routes.",
    },
    {
      batch_id: "w2-corridor-pending-02",
      candidate_id: "candidate:ed8d52ac76d7f5fe9b485500",
      event_id: "event_queue-jump-implementation-fall2024",
      event_evidence_id: "tremont_ave_bus_priority_cb5_nov2024#p013_c0002",
      onset: { date: "2024-fall", precision: "season" },
      applications: [{
        route_record_id: "route_bx36",
        gtfs_route_id: "BX36",
        route_evidence_id: "tremont_ave_bus_priority_cb5_nov2024#p004_c0002",
        treatment_record_id: "treatment_queue-jump-grand-concourse",
        treatment_evidence_id: "tremont_ave_bus_priority_cb5_nov2024#p013_c0002",
      }],
      rationale:
        "Blind adjudication proves the Fall 2024 Grand Concourse queue-jump installation for Bx36. Other studied locations and routes are excluded.",
    },
  ],
  aliases: [{
    batch_id: "w2-corridor-pending-02",
    candidate_id: "candidate:df486c89a8c124d164f1abad",
    canonical_candidate_id: "candidate:374fb39566efdd50f59642e3",
    rationale:
      "Cross-batch reconciliation proves this year-level M79 launch observation co-refers to the already-published M79 canonical head. Its six listed project features remain documentary evidence, but publishing a second episode would duplicate the same launch identity.",
  }],
  insufficient: [{
    batch_id: "w2-corridor-pending-01",
    candidate_id: "candidate:63eee0dc5fb645c9a4e177c3",
    rationale:
      "The frozen evidence proves a January 2020 B46 SBS articulated-bus upgrade, but the frozen canonical corpus has no eligible B46-specific articulated-bus treatment record. Plan 052 cannot serialize exact route × treatment incidence without inventing or editing canonical documentary data.",
    known_facts: [
      "B46 SBS was upgraded to articulated buses in January 2020.",
      "The B46 SBS route identity is canonical.",
      "The absent treatment identity is a serialization/evidence gap, not a rejection of the source event.",
    ],
    prohibited_inferences: [
      "Do not substitute an unrelated articulated-bus treatment record.",
      "Do not create or edit a canonical treatment observation from a review receipt.",
      "Do not publish until an evidence-bound canonical treatment identity exists in a future versioned cohort.",
    ],
  }],
};

const mode = process.argv[2];
if (
  (mode !== "--write" &&
    mode !== "--check" &&
    mode !== "--repair-unaccepted") ||
  process.argv.length !== 3
) {
  throw new Error(
    "usage: bun scripts/integrate-plan052-corridor-positive-heads.ts --write|--check|--repair-unaccepted",
  );
}
runPlan052PositiveIntegration(config, mode);
console.log(
  `Plan 052 corridor positive heads ${
    mode === "--write"
      ? "applied"
      : mode === "--repair-unaccepted"
      ? "repaired before acceptance"
      : "verified"
  }: ` +
    "6 published, 1 duplicate alias, 1 insufficient evidence, 8 applications.",
);
