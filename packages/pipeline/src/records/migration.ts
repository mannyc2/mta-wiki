import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  readSubmissionRetirements,
  submissionRetirementsPath,
  writeSubmissionRetirements,
  type SubmissionRetirementEntry,
  type SubmissionRetirementOverrides,
} from "@mta-wiki/pipeline/records/submission-overrides";
import { createSubmissionEntry, readSubmissionEntries, submissionPath } from "@mta-wiki/pipeline/records/submissions";
import type { MtaEvidenceSubmissionRef, MtaSubmitObservationInput, MtaSubmissionEntry, MtaValidationIssue } from "@mta-wiki/db/types";

type IdentityOverrideFile = {
  version?: number | undefined;
  aliases?: {
    corridor?: Record<string, string> | undefined;
    entity?: Record<string, string> | undefined;
    project?: Record<string, string> | undefined;
    route?: Record<string, string> | undefined;
  } | undefined;
};

type IdentityDoNotMergeEntry = {
  record_ids?: string[] | undefined;
  reason?: string | undefined;
  source_decision?: string | undefined;
  reviewed_at?: string | undefined;
};

type IdentityDoNotMergeFile = {
  version?: number | undefined;
  pairs?: {
    corridor?: IdentityDoNotMergeEntry[] | undefined;
    entity?: IdentityDoNotMergeEntry[] | undefined;
    project?: IdentityDoNotMergeEntry[] | undefined;
    route?: IdentityDoNotMergeEntry[] | undefined;
  } | undefined;
};

type MigrationAliasKind = "corridor" | "entity" | "project" | "route";

export type MigrationAliasPlan = {
  kind: MigrationAliasKind;
  alias: string;
  target: string;
  source_decision: string;
};

export type MigrationAliasRemovalPlan = {
  kind: MigrationAliasKind;
  alias: string;
  existing_target?: string | undefined;
  source_decision: string;
};

export type MigrationDoNotMergePlan = {
  kind: MigrationAliasKind;
  record_ids: [string, string];
  reason: string;
  source_decision: string;
};

export type MigrationDoNotMergeRemovalPlan = {
  kind: MigrationAliasKind;
  record_ids: [string, string];
  source_decision: string;
};

export type MigrationConflict = {
  kind: MigrationAliasKind;
  alias: string;
  existing_target: string;
  proposed_target: string;
};

export type MigrationBatchReport = {
  generated_at: string;
  dry_run: boolean;
  wrote: boolean;
  run_id: string;
  paths: {
    submissions_path: string;
    retirements_path: string;
    identity_merges_path: string;
    identity_do_not_merge_path: string;
  };
  planned_submission_count: number;
  submission_additions: MtaSubmissionEntry[];
  submissions_already_present: MtaSubmissionEntry[];
  retirement_additions: SubmissionRetirementEntry[];
  retirements_already_present: SubmissionRetirementEntry[];
  alias_additions: MigrationAliasPlan[];
  aliases_already_present: MigrationAliasPlan[];
  alias_removals: MigrationAliasRemovalPlan[];
  aliases_already_absent: MigrationAliasRemovalPlan[];
  do_not_merge_additions: MigrationDoNotMergePlan[];
  do_not_merges_already_present: MigrationDoNotMergePlan[];
  do_not_merge_removals: MigrationDoNotMergeRemovalPlan[];
  do_not_merges_already_absent: MigrationDoNotMergeRemovalPlan[];
  conflicts: MigrationConflict[];
  validation_issues: MtaValidationIssue[];
};

export type FirstMigrationBatchReport = MigrationBatchReport;
export type RemainingMigrationBatchReport = MigrationBatchReport;

export type MigrationBatchOptions = {
  dryRun?: boolean | undefined;
  force?: boolean | undefined;
};

export type FirstMigrationBatchOptions = MigrationBatchOptions;
export type RemainingMigrationBatchOptions = MigrationBatchOptions;

type MigrationBatchPlan = {
  runId: string;
  aliases: MigrationAliasPlan[];
  aliasRemovals?: MigrationAliasRemovalPlan[] | undefined;
  doNotMerges?: MigrationDoNotMergePlan[] | undefined;
  doNotMergeRemovals?: MigrationDoNotMergeRemovalPlan[] | undefined;
  retirements: Array<Pick<SubmissionRetirementEntry, "submission_id" | "reason">>;
  inputs: () => MtaSubmitObservationInput[];
};

const BATCH1_RUN_ID = "2026-06-09_migration_batch1";
const BATCH2_RUN_ID = "2026-06-09_migration_batch2";
const REVIEWED_AT = "2026-06-09T00:00:00.000Z";
const SOURCE_DECISION = "docs/migration-decision-matrix.md";

const BATCH1_ALIASES: MigrationAliasPlan[] = [
  {
    kind: "project",
    alias: "project_better-buses-plan-nycdot-2018",
    target: "project_better-buses-action-plan",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "project",
    alias: "project_nycdot-better-buses-plan",
    target: "project_better-buses-action-plan",
    source_decision: SOURCE_DECISION,
  },
];

const BATCH1_RETIREMENTS: Array<Pick<SubmissionRetirementEntry, "submission_id" | "reason">> = [
  {
    submission_id: "sub_fdb128c62c2f304e",
    reason: "Reviewed batch 1 retypes the Lexington Avenue surface from route to corridor.",
  },
  {
    submission_id: "sub_a8ed12323e94c4a6",
    reason: "Reviewed batch 1 replaces the Lexington relation with a project-to-corridor uses_corridor relation.",
  },
  {
    submission_id: "sub_2551d2d3eb65e056",
    reason: "Reviewed batch 1 splits the composite Q10/Q80 ACE route surface into separate route records.",
  },
  {
    submission_id: "sub_cdc51b4a9858505c",
    reason: "Reviewed batch 1 replaces the composite Q10/Q80 ACE relation with separate route relations.",
  },
  {
    submission_id: "sub_e1a22d5484b9abac",
    reason: "Reviewed batch 1 retypes the Jay Street Better Buses endpoint from entity to project/program.",
  },
  {
    submission_id: "sub_c0c4227185a192da",
    reason: "Reviewed batch 1 retargets the Jay Street program relation to Better Buses Restart.",
  },
];

const BATCH2_ALIASES: MigrationAliasPlan[] = [
  {
    kind: "route",
    alias: "route_b44-draft-plan",
    target: "route_b44-local",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_bx6-local-addendum-update",
    target: "route_bx6-local",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_bx6-tsp-2017",
    target: "route_bx6-local",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_b82-tsp-2017",
    target: "route_b82-local",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_southern-brooklyn-sbs",
    target: "route_b82-sbs",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_b82-sbs-ace",
    target: "route_b82-sbs",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_m86-local-2017",
    target: "route_m86-local",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_m86",
    target: "route_m86-sbs",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_able-m15-sbs",
    target: "route_m15-sbs",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_first-second-ave-sbs",
    target: "route_m15-sbs",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_m15-plus",
    target: "route_m15-sbs",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_m15-sbs-ace",
    target: "route_m15-sbs",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_m15-sbs-reference",
    target: "route_m15-sbs",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_m15-sbs-tsp-2017",
    target: "route_m15-sbs",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_m15-reference",
    target: "route_m15-local-limited",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_m15-segment-speed-reference",
    target: "route_m15-local-limited",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_m101-ace",
    target: "route_m101",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_q10-queens",
    target: "route_q10",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_q80-queens",
    target: "route_q80",
    source_decision: SOURCE_DECISION,
  },
];

const BATCH2_ALIAS_REMOVALS: MigrationAliasRemovalPlan[] = [
  {
    kind: "route",
    alias: "route_first-second-ave-sbs",
    existing_target: "route_able-m15-sbs",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    alias: "route_m15-plus",
    existing_target: "route_able-m15-sbs",
    source_decision: SOURCE_DECISION,
  },
];

const BATCH2_DO_NOT_MERGES: MigrationDoNotMergePlan[] = [
  {
    kind: "route",
    record_ids: ["route_b82-local", "route_b82-sbs"],
    reason:
      "Distinct service variants on the same B82 corridor. route_b82-local is the local/TSP-development B82 record, while route_b82-sbs is the B82 SBS record. The shared base route label identifies related corridor context, not same-route identity.",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    record_ids: ["route_bx6-local", "route_bx6-sbs"],
    reason:
      "Distinct route variants: Bx6 Local vs Bx6 SBS. The source text explicitly distinguishes them, including Bx6 Local schedule changes being postponed until Bx6 SBS realignment is implemented. Shared base route Bx6 is insufficient to merge different service variants.",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    record_ids: ["route_m15-local-limited", "route_m15-sbs"],
    reason:
      "Distinct service variants on the M15 corridor. route_m15-sbs is the Select Bus Service record, while route_m15-local-limited is the local/limited M15 record/reference. The source distinguishes the pair as M15/M15 SBS; the shared base route label is corridor context, not same-route identity.",
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    record_ids: ["route_m86-local", "route_m86-sbs"],
    reason:
      "Distinct service variants on the M86 corridor. route_m86-local preserves the historical/pre-SBS local route record, while route_m86-sbs is the Select Bus Service route record. The replacement relationship is lifecycle context, not same-route identity.",
    source_decision: SOURCE_DECISION,
  },
];

const BATCH2_DO_NOT_MERGE_REMOVALS: MigrationDoNotMergeRemovalPlan[] = [
  {
    kind: "route",
    record_ids: ["route_able-m15-sbs", "route_m15-reference"],
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    record_ids: ["route_b82-tsp-2017", "route_southern-brooklyn-sbs"],
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    record_ids: ["route_bx6-local-addendum-update", "route_bx6-sbs"],
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    record_ids: ["route_bx6-local-addendum-update", "route_bx6-sbs-addendum-update"],
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    record_ids: ["route_lexington-ave-corridor", "route_m101-ace"],
    source_decision: SOURCE_DECISION,
  },
  {
    kind: "route",
    record_ids: ["route_q10-ace", "route_q10-queens"],
    source_decision: SOURCE_DECISION,
  },
];

const BATCH2_RETIREMENTS: Array<Pick<SubmissionRetirementEntry, "submission_id" | "reason">> = [
  {
    submission_id: "sub_bcf0ee0ff8bd10e3",
    reason: "Reviewed batch 2 retargets the B44 draft-plan local proposal from B44 Limited to B44 Local.",
  },
  {
    submission_id: "sub_1025ac039bce4d2c",
    reason: "Reviewed batch 2 splits Bx6 SBS postponement text out of the durable Bx6 SBS route identity.",
  },
  {
    submission_id: "sub_f5017acf7e5d88a1",
    reason: "Reviewed batch 2 replaces the Bx6 Local addendum suffix route with a durable Bx6 Local route plus lifecycle event.",
  },
  {
    submission_id: "sub_1403fd8fe157af0f",
    reason: "Reviewed batch 2 normalizes the Bx6 TSP development route-state id to the durable Bx6 Local route.",
  },
  {
    submission_id: "sub_18e5172cc0c99b2a",
    reason: "Reviewed batch 2 normalizes the B82 TSP development route-state id to the durable B82 Local route.",
  },
  {
    submission_id: "sub_948f5370843055b4",
    reason: "Reviewed batch 2 moves Southern Brooklyn SBS to the route_b82-sbs canonical route id.",
  },
  {
    submission_id: "sub_194ce95de6779630",
    reason: "Reviewed batch 2 moves the ACE B82-SBS route surface to the route_b82-sbs canonical route id.",
  },
  {
    submission_id: "sub_537500ee9d1cccb1",
    reason: "Reviewed batch 2 removes the year suffix from the historical M86 Local route identity.",
  },
  {
    submission_id: "sub_86875f64af742f8e",
    reason: "Reviewed batch 2 moves the M15 local/limited reference to route_m15-local-limited.",
  },
  {
    submission_id: "sub_d376a3603bfcec81",
    reason: "Reviewed batch 2 moves the generic M15 segment-speed reference away from M15 SBS to local/limited context.",
  },
  {
    submission_id: "sub_994381ba030a44b3",
    reason: "Reviewed batch 2 removes the ACE suffix from the durable M101 route identity.",
  },
];

function relativePath(path: string) {
  return relative(repoRoot, path).split("/").join("/");
}

function evidence(sourceId: string, blockId: string, sourceQuote?: string): MtaEvidenceSubmissionRef {
  return {
    source_id: sourceId,
    block_id: blockId,
    ...(sourceQuote ? { source_quote: sourceQuote } : {}),
  };
}

function migrationRetirement(entry: Pick<SubmissionRetirementEntry, "submission_id" | "reason">): SubmissionRetirementEntry {
  return {
    ...entry,
    source_decision: SOURCE_DECISION,
    reviewed_at: REVIEWED_AT,
  };
}

function batch1MigrationInputs(): MtaSubmitObservationInput[] {
  return [
    {
      source_id: "life_in_slow_lane_2025",
      observation_kind: "project",
      local_observation_id: "project_better_buses_action_plan",
      target_record_id: "project_better-buses-action-plan",
      label: "Better Buses Action Plan",
      payload: {
        project_name: "Better Buses Action Plan",
        project_type: "action_plan",
        status: "target_abandoned",
        document_time_status: "retrospective",
        description:
          "The source identifies the 2018 NYC DOT Better Buses plan's citywide 25 percent bus-speed target and says that target has since been abandoned.",
      },
      evidence_refs: [evidence("life_in_slow_lane_2025", "p005_c0003", "That target has since been abandoned")],
    },
    {
      source_id: "life_in_slow_lane_2025",
      observation_kind: "claim",
      local_observation_id: "claim_better_buses_speed_target_abandoned",
      label: "Better Buses 25 percent speed target abandoned",
      payload: {
        claim_text: "The Better Buses bus-speed target has since been abandoned.",
        claim_kind: "target_status",
        subject: "Better Buses Action Plan",
        status_observation: "abandoned_target",
      },
      evidence_refs: [evidence("life_in_slow_lane_2025", "p005_c0003", "That target has since been abandoned")],
    },
    {
      source_id: "life_in_slow_lane_2025",
      observation_kind: "relation",
      local_observation_id: "rel_better_buses_action_plan_abandoned_target_claim",
      label: "Better Buses Action Plan has abandoned target claim",
      payload: {
        relation_kind: "has_claim",
        subject_local_observation_id: "project_better_buses_action_plan",
        object_local_observation_id: "claim_better_buses_speed_target_abandoned",
      },
      evidence_refs: [evidence("life_in_slow_lane_2025", "p005_c0003", "That target has since been abandoned")],
    },
    {
      source_id: "better_buses",
      observation_kind: "project",
      local_observation_id: "project_better_buses",
      target_record_id: "project_better-buses",
      label: "Better Buses Program",
      payload: {
        project_name: "Better Buses Program",
        project_type: "bus_priority_program",
        description: "Umbrella program/page for NYC DOT bus-priority work.",
        document_time_status: "program_context",
      },
      evidence_refs: [evidence("better_buses", "p001_b0001")],
    },
    {
      source_id: "better_buses",
      observation_kind: "relation",
      local_observation_id: "rel_better_buses_action_plan_part_of_program",
      label: "Better Buses Action Plan part of Better Buses Program",
      payload: {
        relation_kind: "part_of_program",
        subject_local_observation_id: "project_better_buses_action_plan",
        object_local_observation_id: "project_better_buses",
      },
      evidence_refs: [evidence("better_buses", "p001_b0001")],
    },
    {
      source_id: "behind_schedule_2025",
      observation_kind: "project",
      local_observation_id: "project_better_buses",
      target_record_id: "project_better-buses",
      label: "Better Buses",
      payload: {
        project_name: "Better Buses",
        project_type: "bus_priority_program",
        description: "Better Buses program context for DOT bus-priority initiatives.",
        document_time_status: "program_context",
      },
      evidence_refs: [evidence("behind_schedule_2025", "p004_c0005", "Fast Forward, Better Buses, and NYC Streets Plan initiatives")],
    },
    {
      source_id: "behind_schedule_2025",
      observation_kind: "relation",
      local_observation_id: "rel_better_buses_restart_part_of_program",
      label: "Better Buses Restart part of Better Buses Program",
      payload: {
        relation_kind: "part_of_program",
        subject_local_observation_id: "project_better_buses_restart_2021",
        object_local_observation_id: "project_better_buses",
      },
      evidence_refs: [evidence("behind_schedule_2025", "p023_c0003", "In 2021, NYC DOT launched its Better Buses Restart initiative")],
    },
    {
      source_id: "jay_street_pilot_overview",
      observation_kind: "project",
      local_observation_id: "project_better_buses_restart_2021",
      target_record_id: "project_better-buses-restart-2021",
      label: "Better Buses Restart",
      payload: {
        project_name: "Better Buses Restart",
        project_type: "bus improvement initiative",
        description: "Better Buses Restart context for the Jay Street Busway Pilot.",
        document_time_status: "program_context",
      },
      evidence_refs: [evidence("jay_street_pilot_overview", "p001_c0009", "The Jay Street Busway Pilot is part of Better Buses Restart")],
    },
    {
      source_id: "jay_street_pilot_overview",
      observation_kind: "relation",
      local_observation_id: "rel_project_better_buses_restart",
      label: "Jay Street Busway Pilot part of Better Buses Restart",
      payload: {
        relation_kind: "part_of_program",
        subject_local_observation_id: "project_jay_street_busway_pilot",
        object_local_observation_id: "project_better_buses_restart_2021",
      },
      evidence_refs: [evidence("jay_street_pilot_overview", "p001_c0009", "The Jay Street Busway Pilot is part of Better Buses Restart")],
    },
    {
      source_id: "tsp_status_2017",
      observation_kind: "project",
      local_observation_id: "project_tsp_program_2017",
      target_record_id: "project_tsp-program-2017",
      label: "Transit Signal Priority Program",
      payload: {
        project_name: "Transit Signal Priority Program",
        project_type: "transit_signal_priority_program",
        description: "Transit Signal Priority program context for the 2017 expansion status report.",
        document_time_status: "program_context",
      },
      evidence_refs: [evidence("tsp_status_2017", "p001_b0001", "Transit Signal Priority")],
    },
    {
      source_id: "tsp_status_2017",
      observation_kind: "relation",
      local_observation_id: "rel_tsp_expansion_part_of_program",
      label: "TSP expansion part of Transit Signal Priority Program",
      payload: {
        relation_kind: "part_of_program",
        subject_local_observation_id: "project_tsp_expansion_2017",
        object_local_observation_id: "project_tsp_program_2017",
      },
      evidence_refs: [evidence("tsp_status_2017", "p001_b0001", "Transit Signal Priority")],
    },
    {
      source_id: "better_buses_action_plan_2019",
      observation_kind: "corridor",
      local_observation_id: "corridor_lexington_ave_96th_to_60th",
      label: "Lexington Ave, 96th St to 60th St",
      payload: {
        corridor_name: "Lexington Ave, 96th St to 60th St",
        street: "Lexington Ave",
        limits: "96th St to 60th St",
        borough: "Manhattan",
        routes: ["M98", "M101", "M102", "M103"],
        corridor_length_miles: 1.8,
        description: "Bus Forward corridor identified in 2017 due to slow bus speeds.",
      },
      evidence_refs: [
        evidence("better_buses_action_plan_2019", "p024_c0001"),
        evidence("better_buses_action_plan_2019", "p024_c0007"),
        evidence("better_buses_action_plan_2019", "p024_c0008"),
      ],
    },
    {
      source_id: "better_buses_action_plan_2019",
      observation_kind: "relation",
      local_observation_id: "relation_lexington_project_to_corridor_reviewed",
      label: "Lexington project uses Lexington Avenue corridor",
      payload: {
        relation_kind: "uses_corridor",
        subject_local_observation_id: "project_01_lexington_ave",
        object_local_observation_id: "corridor_lexington_ave_96th_to_60th",
      },
      evidence_refs: [
        evidence("better_buses_action_plan_2019", "p024_c0001"),
        evidence("better_buses_action_plan_2019", "p024_c0007"),
        evidence("better_buses_action_plan_2019", "p024_c0012"),
      ],
    },
    {
      source_id: "mta_automated_camera_enforcement",
      observation_kind: "route",
      local_observation_id: "route_q10_ace",
      target_record_id: "route_q10-queens",
      label: "Q10",
      payload: {
        route_id: "Q10",
        route_label: "Q10",
        borough: "Queens",
        streets: "Lefferts Blvd",
        source_route_surface: "ACE",
        note: "Listed in ACE route surface with Q80 on Lefferts Blvd during 60-day warning period.",
        borough_normalized: "queens",
      },
      evidence_refs: [evidence("mta_automated_camera_enforcement", "p001_b0001", "Q10/Q80, Lefferts Blvd (in 60-day warning period)")],
    },
    {
      source_id: "mta_automated_camera_enforcement",
      observation_kind: "route",
      local_observation_id: "route_q80_ace",
      target_record_id: "route_q80-queens",
      label: "Q80",
      payload: {
        route_id: "Q80",
        route_label: "Q80",
        borough: "Queens",
        streets: "Lefferts Blvd",
        source_route_surface: "ACE",
        note: "Listed in ACE route surface with Q10 on Lefferts Blvd during 60-day warning period.",
        borough_normalized: "queens",
      },
      evidence_refs: [evidence("mta_automated_camera_enforcement", "p001_b0001", "Q10/Q80, Lefferts Blvd (in 60-day warning period)")],
    },
    {
      source_id: "mta_automated_camera_enforcement",
      observation_kind: "relation",
      local_observation_id: "rel_ace_serves_q10",
      label: "ACE serves Q10",
      payload: {
        relation_kind: "serves_route",
        subject_local_observation_id: "project_ace_automated_camera_enforcement",
        object_local_observation_id: "route_q10_ace",
      },
      evidence_refs: [evidence("mta_automated_camera_enforcement", "p001_b0001", "ACE is in operation on these bus routes.")],
    },
    {
      source_id: "mta_automated_camera_enforcement",
      observation_kind: "relation",
      local_observation_id: "rel_ace_serves_q80",
      label: "ACE serves Q80",
      payload: {
        relation_kind: "serves_route",
        subject_local_observation_id: "project_ace_automated_camera_enforcement",
        object_local_observation_id: "route_q80_ace",
      },
      evidence_refs: [evidence("mta_automated_camera_enforcement", "p001_b0001", "ACE is in operation on these bus routes.")],
    },
  ];
}

function batch2MigrationInputs(): MtaSubmitObservationInput[] {
  return [
    {
      source_id: "brooklyn_bus_network_draft_plan_with_route_profiles",
      observation_kind: "route",
      local_observation_id: "route_b44_draft_plan",
      target_record_id: "route_b44-local",
      label: "Proposed B44 Local - Nostrand/Rogers Avenues",
      raw_text:
        "The proposed B44 would maintain its existing southbound routing. As a Local route, stops would be spaced slightly farther apart than existing to speed up buses and improve reliability. Weekday frequencies would be increased.",
      payload: {
        route_id: "B44",
        route_label: "B44",
        route_name: "Nostrand/Rogers Avenues",
        route_type_proposed: "Local",
        service_variant: "local",
        document_time_status: "draft_plan_proposed",
        service_description: "Service between Bedford-Stuyvesant and Sheepshead Bay",
        related_existing_routes: ["B44", "B44 SBS", "B49"],
        proposed_route_length_miles: 8.5,
        existing_route_length_miles: 8.6,
        proposed_stop_spacing_feet: 939,
        existing_stop_spacing_feet: 725,
        proposed_turns_per_mile: 0.4,
        existing_turns_per_mile: 0.5,
      },
      evidence_refs: [
        evidence("brooklyn_bus_network_draft_plan_with_route_profiles", "p062_c0014"),
        evidence("brooklyn_bus_network_draft_plan_with_route_profiles", "p062_c0015"),
        evidence("brooklyn_bus_network_draft_plan_with_route_profiles", "p062_c0024"),
      ],
    },
    {
      source_id: "bronx_bus_network_final_plan_addendum_2021",
      observation_kind: "route",
      local_observation_id: "route_bx6_sbs_addendum_update",
      target_record_id: "route_bx6-sbs",
      label: "Bx6 SBS",
      payload: {
        route_id: "Bx6 SBS",
        route_name: "Bx6 SBS",
        route_label: "Bx6 SBS",
        route_type: "Select Bus Service",
        service_variant: "sbs",
        borough: "Bronx",
        description: "Bx6 SBS route identity referenced by the Bronx addendum; implementation timing is captured separately as lifecycle records.",
      },
      evidence_refs: [
        evidence("bronx_bus_network_final_plan_addendum_2021", "p003_c0003"),
        evidence("bronx_bus_network_final_plan_addendum_2021", "p007_c0009"),
      ],
    },
    {
      source_id: "bronx_bus_network_final_plan_addendum_2021",
      observation_kind: "route",
      local_observation_id: "route_bx6_local_addendum_update",
      target_record_id: "route_bx6-local",
      label: "Bx6 Local",
      payload: {
        route_id: "Bx6 Local",
        route_name: "Bx6 Local",
        route_label: "Bx6 Local",
        route_type: "local_bus",
        service_variant: "local",
        borough: "Bronx",
        description: "Bx6 Local route identity referenced by the Bronx addendum; schedule-change timing is captured separately as lifecycle records.",
      },
      evidence_refs: [
        evidence("bronx_bus_network_final_plan_addendum_2021", "p003_c0003"),
        evidence("bronx_bus_network_final_plan_addendum_2021", "p003_c0004"),
        evidence("bronx_bus_network_final_plan_addendum_2021", "p007_c0010"),
      ],
    },
    {
      source_id: "bronx_bus_network_final_plan_addendum_2021",
      observation_kind: "event",
      local_observation_id: "event_bx6_local_schedule_changes_postponed_2023",
      label: "Bx6 Local schedule changes postponed until 2023",
      payload: {
        event_name: "Bx6 Local schedule changes postponed until 2023",
        event_kind: "postponement",
        route: "Bx6 Local",
        date_text: "until 2023",
        description: "The source says the associated changes to the Bx5 and Bx6 Local schedules would be postponed until 2023 when the Bx6 SBS realignment is implemented.",
      },
      evidence_refs: [
        evidence("bronx_bus_network_final_plan_addendum_2021", "p003_c0004"),
        evidence("bronx_bus_network_final_plan_addendum_2021", "p007_c0010"),
      ],
    },
    {
      source_id: "bronx_bus_network_final_plan_addendum_2021",
      observation_kind: "relation",
      local_observation_id: "rel_bx6_local_has_2023_postponement",
      label: "Bx6 Local has 2023 schedule-change postponement",
      payload: {
        relation_kind: "has_timeline_event",
        subject_local_observation_id: "route_bx6_local_addendum_update",
        object_local_observation_id: "event_bx6_local_schedule_changes_postponed_2023",
      },
      evidence_refs: [evidence("bronx_bus_network_final_plan_addendum_2021", "p003_c0004")],
    },
    {
      source_id: "bronx_bus_network_final_plan_addendum_2021",
      observation_kind: "relation",
      local_observation_id: "rel_bx6_local_postponement_depends_on_sbs_realignment",
      label: "Bx6 Local postponement depends on Bx6 SBS realignment",
      payload: {
        relation_kind: "depends_on_realignment_of",
        subject_local_observation_id: "event_bx6_local_schedule_changes_postponed_2023",
        object_local_observation_id: "route_bx6_sbs_addendum_update",
      },
      evidence_refs: [evidence("bronx_bus_network_final_plan_addendum_2021", "p003_c0004")],
    },
    {
      source_id: "bronx_bus_network_final_plan_addendum_2021",
      observation_kind: "relation",
      local_observation_id: "rel_bx6_sbs_has_2023_delay",
      label: "Bx6 SBS has 2023 implementation delay",
      payload: {
        relation_kind: "has_timeline_event",
        subject_local_observation_id: "route_bx6_sbs_addendum_update",
        object_local_observation_id: "event_bx6_sbs_2023_delay",
      },
      evidence_refs: [evidence("bronx_bus_network_final_plan_addendum_2021", "p003_c0004")],
    },
    {
      source_id: "tsp_status_2017",
      observation_kind: "route",
      local_observation_id: "route_bx6_tsp_2017",
      target_record_id: "route_bx6-local",
      label: "Bx6 in the South Bronx",
      payload: {
        route_id: "Bx6",
        route_label: "Bx6",
        route_name: "Bx6 in the South Bronx",
        borough: "Bronx",
        program: "Transit Signal Priority",
        document_time_status: "tsp_in_development",
        description: "Bx6 route listed in the 2017 TSP status report as in development for Transit Signal Priority.",
      },
      evidence_refs: [evidence("tsp_status_2017", "p001_b0001")],
    },
    {
      source_id: "tsp_status_2017",
      observation_kind: "route",
      local_observation_id: "route_b82_tsp_2017",
      target_record_id: "route_b82-local",
      label: "B82 in Southern Brooklyn",
      payload: {
        route_id: "B82",
        route_label: "B82",
        route_name: "B82 in Southern Brooklyn",
        borough: "Brooklyn",
        program: "Transit Signal Priority",
        document_time_status: "tsp_in_development",
        description: "B82 route listed in the 2017 TSP status report as in development for Transit Signal Priority.",
      },
      evidence_refs: [evidence("tsp_status_2017", "p001_b0001")],
    },
    {
      source_id: "brt_route_index",
      observation_kind: "route",
      local_observation_id: "route_southern_brooklyn_sbs",
      target_record_id: "route_b82-sbs",
      label: "Southern Brooklyn Select Bus Service",
      raw_text:
        "Southern Brooklyn Select Bus Service began service on October 1, 2018 on the B82 route in southern Brooklyn, benefiting the 28,000 B82 passengers daily.",
      payload: {
        route_id: "B82",
        route_label: "B82 SBS",
        route_name: "Southern Brooklyn Select Bus Service",
        route_type: "Select Bus Service",
        service_variant: "sbs",
        borough: "Brooklyn",
        source_label: "Southern Brooklyn Select Bus Service",
        description: "Southern Brooklyn Select Bus Service on the B82 route in southern Brooklyn.",
      },
      evidence_refs: [evidence("brt_route_index", "p001_b0001")],
    },
    {
      source_id: "mta_automated_camera_enforcement",
      observation_kind: "route",
      local_observation_id: "route_b82_sbs_ace",
      target_record_id: "route_b82-sbs",
      label: "B82-SBS",
      payload: {
        route_id: "B82-SBS",
        route_label: "B82-SBS",
        route_type: "Select Bus Service",
        service_variant: "sbs",
        borough: "Brooklyn",
        streets: "Bay Pkwy / Kings Hwy / Flatlands Av",
        source_route_surface: "ACE",
      },
      evidence_refs: [evidence("mta_automated_camera_enforcement", "p001_b0001")],
    },
    {
      source_id: "m86_sbs_progress_report_2017",
      observation_kind: "route",
      local_observation_id: "route_m86_local_2017",
      target_record_id: "route_m86-local",
      label: "M86 Local",
      payload: {
        route_id: "M86",
        route_label: "M86 Local",
        route_name: "M86 Local",
        route_type: "local_bus",
        service_variant: "local",
        borough: "Manhattan",
        historical_status: "pre_sbs_service",
        description: "Former M86 Local service used as the before condition for M86 SBS speed, ridership, and reliability comparisons.",
      },
      evidence_refs: [
        evidence("m86_sbs_progress_report_2017", "p006_c0012"),
        evidence("m86_sbs_progress_report_2017", "p007_c0012"),
        evidence("m86_sbs_progress_report_2017", "p008_c0008"),
      ],
    },
    {
      source_id: "m86_sbs_progress_report_2017",
      observation_kind: "relation",
      local_observation_id: "rel_m86_local_replaced_by_m86_sbs",
      label: "M86 Local replaced by M86 SBS",
      payload: {
        relation_kind: "replaced_by",
        subject_local_observation_id: "route_m86_local_2017",
        object_local_observation_id: "route_m86_sbs_2017",
      },
      evidence_refs: [
        evidence("m86_sbs_progress_report_2017", "p006_c0005"),
        evidence("m86_sbs_progress_report_2017", "p008_c0008"),
      ],
    },
    {
      source_id: "speeding_up_slowly_2025",
      observation_kind: "route",
      local_observation_id: "route_m15_reference",
      target_record_id: "route_m15-local-limited",
      label: "M15",
      payload: {
        route_id: "M15",
        route_label: "M15",
        source_route_type_phrase: "Local/Limited",
        description: "M15 Local/Limited route reference paired with M15 SBS in the 2023 ridership discussion.",
      },
      evidence_refs: [evidence("speeding_up_slowly_2025", "p005_c0009")],
    },
    {
      source_id: "segment_speed_methodology_2024",
      observation_kind: "route",
      local_observation_id: "route_m15_segment_speed_reference",
      target_record_id: "route_m15-local-limited",
      label: "M15",
      payload: {
        route_id: "M15",
        route_name: "M15",
        route_label: "M15",
        source_route_surface: "generic_m15_reference",
        description: "Generic M15 route mention in the bus segment speed methodology article.",
      },
      evidence_refs: [evidence("segment_speed_methodology_2024", "p001_b0001")],
    },
    {
      source_id: "mta_automated_camera_enforcement",
      observation_kind: "route",
      local_observation_id: "route_m101_ace",
      target_record_id: "route_m101",
      label: "M101",
      payload: {
        route_id: "M101",
        route_label: "M101",
        borough: "Manhattan",
        streets: "3 Av / Lexington Av",
        source_route_surface: "ACE",
      },
      evidence_refs: [evidence("mta_automated_camera_enforcement", "p001_b0001")],
    },
  ];
}

const BATCH1_PLAN: MigrationBatchPlan = {
  runId: BATCH1_RUN_ID,
  aliases: BATCH1_ALIASES,
  retirements: BATCH1_RETIREMENTS,
  inputs: batch1MigrationInputs,
};

const BATCH2_PLAN: MigrationBatchPlan = {
  runId: BATCH2_RUN_ID,
  aliases: BATCH2_ALIASES,
  aliasRemovals: BATCH2_ALIAS_REMOVALS,
  doNotMerges: BATCH2_DO_NOT_MERGES,
  doNotMergeRemovals: BATCH2_DO_NOT_MERGE_REMOVALS,
  retirements: BATCH2_RETIREMENTS,
  inputs: batch2MigrationInputs,
};

function plannedEntries(plan: MigrationBatchPlan) {
  return plan.inputs().map((input) => createSubmissionEntry(plan.runId, input, REVIEWED_AT));
}

function identityMergesPath() {
  return join(repoRoot, "data", "identity-overrides", "merges.json");
}

function identityDoNotMergePath() {
  return join(repoRoot, "data", "identity-overrides", "do-not-merge.json");
}

function readIdentityMerges(): IdentityOverrideFile {
  const path = identityMergesPath();
  if (!existsSync(path)) return { version: 1, aliases: { corridor: {}, entity: {}, project: {}, route: {} } };
  return JSON.parse(readFileSync(path, "utf8")) as IdentityOverrideFile;
}

function readIdentityDoNotMerges(): IdentityDoNotMergeFile {
  const path = identityDoNotMergePath();
  if (!existsSync(path)) return { version: 1, pairs: { corridor: [], entity: [], project: [], route: [] } };
  return JSON.parse(readFileSync(path, "utf8")) as IdentityDoNotMergeFile;
}

const ALIAS_KINDS: MigrationAliasKind[] = ["corridor", "entity", "project", "route"];

function sortedRecord(record: Record<string, string>) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function identityPairKey(recordIds: [string, string]) {
  return [...recordIds].sort().join("<>");
}

function sortedPair(recordIds: [string, string]): [string, string] {
  return [...recordIds].sort() as [string, string];
}

function cloneAliasMaps(aliases: IdentityOverrideFile["aliases"]) {
  const result: NonNullable<IdentityOverrideFile["aliases"]> = {};
  for (const kind of ALIAS_KINDS) {
    result[kind] = { ...(aliases?.[kind] ?? {}) };
  }
  return result;
}

function sortedAliasMaps(aliases: NonNullable<IdentityOverrideFile["aliases"]>) {
  const result: NonNullable<IdentityOverrideFile["aliases"]> = {};
  for (const kind of ALIAS_KINDS) {
    const map = aliases[kind] ?? {};
    if (Object.keys(map).length > 0) result[kind] = sortedRecord(map);
  }
  return result;
}

function cloneDoNotMergePairs(pairs: IdentityDoNotMergeFile["pairs"]) {
  const result: NonNullable<IdentityDoNotMergeFile["pairs"]> = {};
  for (const kind of ALIAS_KINDS) {
    result[kind] = [...(pairs?.[kind] ?? [])];
  }
  return result;
}

function sortedDoNotMergePairs(pairs: NonNullable<IdentityDoNotMergeFile["pairs"]>) {
  const result: NonNullable<IdentityDoNotMergeFile["pairs"]> = {};

  for (const kind of ALIAS_KINDS) {
    const byPair = new Map<string, IdentityDoNotMergeEntry>();
    for (const entry of pairs[kind] ?? []) {
      const ids = entry.record_ids;
      if (!Array.isArray(ids) || ids.length !== 2 || typeof ids[0] !== "string" || typeof ids[1] !== "string") continue;
      const recordIds = sortedPair([ids[0], ids[1]]);
      byPair.set(identityPairKey(recordIds), {
        record_ids: recordIds,
        ...(entry.reason ? { reason: entry.reason } : {}),
        ...(entry.source_decision ? { source_decision: entry.source_decision } : {}),
        ...(entry.reviewed_at ? { reviewed_at: entry.reviewed_at } : {}),
      });
    }

    const entries = [...byPair.values()].sort((left, right) => {
      const leftIds = left.record_ids ?? [];
      const rightIds = right.record_ids ?? [];
      return `${leftIds[0] ?? ""}\0${leftIds[1] ?? ""}`.localeCompare(`${rightIds[0] ?? ""}\0${rightIds[1] ?? ""}`);
    });
    if (entries.length > 0) result[kind] = entries;
  }

  return result;
}

function doNotMergeEntry(plan: MigrationDoNotMergePlan): IdentityDoNotMergeEntry {
  return {
    record_ids: sortedPair(plan.record_ids),
    reason: plan.reason,
    source_decision: plan.source_decision,
    reviewed_at: REVIEWED_AT,
  };
}

function appendMissingSubmissions(runId: string, entries: MtaSubmissionEntry[]) {
  if (entries.length === 0) return;
  const path = submissionPath(runId);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n", "utf8");
}

function validationIssuesForEntries(entries: MtaSubmissionEntry[], path: string): MtaValidationIssue[] {
  return entries.flatMap((entry) =>
    entry.validation.issues.map((message) => ({
      code: "migration_batch_submission_validation",
      message: `Planned submission ${entry.submission_id}: ${message}`,
      path: relativePath(path),
    })),
  );
}

function applyMigrationBatch(plan: MigrationBatchPlan, options: MigrationBatchOptions = {}): MigrationBatchReport {
  const dryRun = options.dryRun ?? !options.force;
  const submissionsPath = submissionPath(plan.runId);
  const retirementPath = submissionRetirementsPath();
  const mergesPath = identityMergesPath();
  const doNotMergePath = identityDoNotMergePath();
  const entries = plannedEntries(plan);
  const existingSubmissions = readSubmissionEntries();
  const existingSubmissionIds = new Set(existingSubmissions.map((entry) => entry.submission_id));
  const missingRetirementTargets = plan.retirements.filter((entry) => !existingSubmissionIds.has(entry.submission_id));

  const validationIssues = [
    ...validationIssuesForEntries(entries, submissionsPath),
    ...missingRetirementTargets.map((entry) => ({
      code: "migration_batch_missing_retirement_target",
      message: `Planned retirement target ${entry.submission_id} does not exist in submissions.`,
      path: relativePath(retirementPath),
    })),
  ];

  const submissionAdditions = entries.filter((entry) => !existingSubmissionIds.has(entry.submission_id));
  const submissionsAlreadyPresent = entries.filter((entry) => existingSubmissionIds.has(entry.submission_id));

  const existingRetirements = readSubmissionRetirements();
  const existingRetirementById = new Map(existingRetirements.retired.map((entry) => [entry.submission_id, entry]));
  const retirementEntries = plan.retirements.map(migrationRetirement);
  const retirementAdditions = retirementEntries.filter((entry) => !existingRetirementById.has(entry.submission_id));
  const retirementsAlreadyPresent = retirementEntries
    .map((entry) => existingRetirementById.get(entry.submission_id))
    .filter((entry): entry is SubmissionRetirementEntry => Boolean(entry));

  const identityMerges = readIdentityMerges();
  const projectedAliases = cloneAliasMaps(identityMerges.aliases);
  const aliasRemovals: MigrationAliasRemovalPlan[] = [];
  const aliasesAlreadyAbsent: MigrationAliasRemovalPlan[] = [];
  const conflicts: MigrationConflict[] = [];

  for (const removal of plan.aliasRemovals ?? []) {
    const existing = projectedAliases[removal.kind]?.[removal.alias];
    if (!existing) {
      aliasesAlreadyAbsent.push(removal);
      continue;
    }

    if (removal.existing_target && existing !== removal.existing_target) {
      const plannedTarget = plan.aliases.find((aliasPlan) => aliasPlan.kind === removal.kind && aliasPlan.alias === removal.alias)?.target;
      if (plannedTarget && existing === plannedTarget) {
        aliasesAlreadyAbsent.push(removal);
        continue;
      }

      conflicts.push({
        kind: removal.kind,
        alias: removal.alias,
        existing_target: existing,
        proposed_target: removal.existing_target,
      });
      continue;
    }

    aliasRemovals.push(removal);
    delete projectedAliases[removal.kind]?.[removal.alias];
  }

  const aliasAdditions: MigrationAliasPlan[] = [];
  const aliasesAlreadyPresent: MigrationAliasPlan[] = [];
  for (const aliasPlan of plan.aliases) {
    const existing = projectedAliases[aliasPlan.kind]?.[aliasPlan.alias];
    if (existing && existing !== aliasPlan.target) {
      conflicts.push({
        kind: aliasPlan.kind,
        alias: aliasPlan.alias,
        existing_target: existing,
        proposed_target: aliasPlan.target,
      });
      continue;
    }

    if (existing === aliasPlan.target) {
      aliasesAlreadyPresent.push(aliasPlan);
      continue;
    }

    aliasAdditions.push(aliasPlan);
    projectedAliases[aliasPlan.kind] = projectedAliases[aliasPlan.kind] ?? {};
    projectedAliases[aliasPlan.kind]![aliasPlan.alias] = aliasPlan.target;
  }

  const identityDoNotMerges = readIdentityDoNotMerges();
  const projectedDoNotMerges = cloneDoNotMergePairs(identityDoNotMerges.pairs);
  const doNotMergeRemovals: MigrationDoNotMergeRemovalPlan[] = [];
  const doNotMergesAlreadyAbsent: MigrationDoNotMergeRemovalPlan[] = [];

  for (const removal of plan.doNotMergeRemovals ?? []) {
    const key = identityPairKey(removal.record_ids);
    const entriesForKind = projectedDoNotMerges[removal.kind] ?? [];
    const index = entriesForKind.findIndex((entry) => {
      const ids = entry.record_ids;
      return Array.isArray(ids) && ids.length === 2 && typeof ids[0] === "string" && typeof ids[1] === "string" && identityPairKey([ids[0], ids[1]]) === key;
    });

    if (index < 0) {
      doNotMergesAlreadyAbsent.push(removal);
      continue;
    }

    entriesForKind.splice(index, 1);
    projectedDoNotMerges[removal.kind] = entriesForKind;
    doNotMergeRemovals.push(removal);
  }

  const doNotMergeAdditions: MigrationDoNotMergePlan[] = [];
  const doNotMergesAlreadyPresent: MigrationDoNotMergePlan[] = [];
  for (const doNotMergePlan of plan.doNotMerges ?? []) {
    const key = identityPairKey(doNotMergePlan.record_ids);
    const entriesForKind = projectedDoNotMerges[doNotMergePlan.kind] ?? [];
    const existing = entriesForKind.some((entry) => {
      const ids = entry.record_ids;
      return Array.isArray(ids) && ids.length === 2 && typeof ids[0] === "string" && typeof ids[1] === "string" && identityPairKey([ids[0], ids[1]]) === key;
    });

    if (existing) {
      doNotMergesAlreadyPresent.push(doNotMergePlan);
      continue;
    }

    doNotMergeAdditions.push(doNotMergePlan);
    entriesForKind.push(doNotMergeEntry(doNotMergePlan));
    projectedDoNotMerges[doNotMergePlan.kind] = entriesForKind;
  }

  const hasChanges =
    submissionAdditions.length > 0 ||
    retirementAdditions.length > 0 ||
    aliasAdditions.length > 0 ||
    aliasRemovals.length > 0 ||
    doNotMergeAdditions.length > 0 ||
    doNotMergeRemovals.length > 0;
  const wrote = !dryRun && hasChanges && validationIssues.length === 0 && conflicts.length === 0;
  if (wrote) {
    appendMissingSubmissions(plan.runId, submissionAdditions);

    if (retirementAdditions.length > 0) {
      const nextRetirements: SubmissionRetirementOverrides = {
        version: 1,
        retired: [...existingRetirements.retired, ...retirementAdditions].sort((left, right) => left.submission_id.localeCompare(right.submission_id)),
      };
      writeSubmissionRetirements(nextRetirements);
    }

    if (aliasAdditions.length > 0 || aliasRemovals.length > 0) {
      const nextAliases = cloneAliasMaps(identityMerges.aliases);
      for (const removal of aliasRemovals) {
        delete nextAliases[removal.kind]?.[removal.alias];
      }
      for (const aliasPlan of aliasAdditions) {
        nextAliases[aliasPlan.kind] = nextAliases[aliasPlan.kind] ?? {};
        nextAliases[aliasPlan.kind]![aliasPlan.alias] = aliasPlan.target;
      }

      const nextMerges: IdentityOverrideFile = {
        ...identityMerges,
        version: 1,
        aliases: sortedAliasMaps(nextAliases),
      };
      mkdirSync(dirname(mergesPath), { recursive: true });
      writeFileSync(mergesPath, `${JSON.stringify(nextMerges, null, 2)}\n`, "utf8");
    }

    if (doNotMergeAdditions.length > 0 || doNotMergeRemovals.length > 0) {
      const nextDoNotMerges: IdentityDoNotMergeFile = {
        ...identityDoNotMerges,
        version: 1,
        pairs: sortedDoNotMergePairs(projectedDoNotMerges),
      };
      mkdirSync(dirname(doNotMergePath), { recursive: true });
      writeFileSync(doNotMergePath, `${JSON.stringify(nextDoNotMerges, null, 2)}\n`, "utf8");
    }
  }

  return {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    wrote,
    run_id: plan.runId,
    paths: {
      submissions_path: relativePath(submissionsPath),
      retirements_path: relativePath(retirementPath),
      identity_merges_path: relativePath(mergesPath),
      identity_do_not_merge_path: relativePath(doNotMergePath),
    },
    planned_submission_count: entries.length,
    submission_additions: submissionAdditions,
    submissions_already_present: submissionsAlreadyPresent,
    retirement_additions: retirementAdditions,
    retirements_already_present: retirementsAlreadyPresent,
    alias_additions: aliasAdditions,
    aliases_already_present: aliasesAlreadyPresent,
    alias_removals: aliasRemovals,
    aliases_already_absent: aliasesAlreadyAbsent,
    do_not_merge_additions: doNotMergeAdditions,
    do_not_merges_already_present: doNotMergesAlreadyPresent,
    do_not_merge_removals: doNotMergeRemovals,
    do_not_merges_already_absent: doNotMergesAlreadyAbsent,
    conflicts,
    validation_issues: validationIssues,
  };
}

export function applyFirstMigrationBatch(options: FirstMigrationBatchOptions = {}): FirstMigrationBatchReport {
  return applyMigrationBatch(BATCH1_PLAN, options);
}

export function applyRemainingMigrationBatch(options: RemainingMigrationBatchOptions = {}): RemainingMigrationBatchReport {
  return applyMigrationBatch(BATCH2_PLAN, options);
}
