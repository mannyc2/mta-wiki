import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { canonicalRecordIdForInput } from "../packages/db/src/identity";
import { stableHash, stableJson } from "../packages/db/src/stable-json";
import type {
  JsonObject,
  JsonValue,
  MtaCanonicalRecord,
  MtaEvidenceRef,
  MtaSubmissionEntry,
  MtaSubmitObservationInput,
} from "../packages/db/src/types";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import {
  readSemanticCorrections,
  semanticCorrectionsPath,
  withSemanticCorrections,
  type SemanticCorrectionEntry,
} from "../packages/pipeline/src/records/semantic-corrections";

const REVIEWED_AT = "2026-07-15T12:00:00.000Z";
const RUN_ID = "2026-07-15T12-00-00-000Z_legacy-relationship-integrity-remediation";
const SOURCE_DECISION = "data/quality/relationship-integrity/legacy-remediation/ledger.jsonl";
const DEFAULT_RAW_ROOT = "/mnt/models/dev/mta-wiki/raw/sources";
const JOURNAL_PATH = join(repoRoot, "data", "submissions", `${RUN_ID}.jsonl`);
const ARTIFACT_ROOT = join(repoRoot, "data", "quality", "relationship-integrity", "legacy-remediation");
const EAST_RIVER_CORRIDOR_LOCAL_ID = "corridor_east_river_tunnels_meeting_doc_171496";
const EAST_RIVER_CORRIDOR_ID = "corridor_east-river-tunnels-meeting-doc-171496";
const FLATBUSH_PHASE1_CORRIDOR_LOCAL_ID = "corridor_flatbush_phase1_livingston_state";
const FLATBUSH_PHASE1_CORRIDOR_ID = "corridor_flatbush-phase1-livingston-state";
const FLATBUSH_PHASE1_PROJECT_ID = "project_flatbush-phase1-center-running-bus-lanes-livingston-state";
const FLATBUSH_PHASE1_TREATMENT_ID = "treatment_flatbush-phase1-center-running-bus-lanes-livingston-state";
const FLATBUSH_PROJECT_CORRIDOR_RELATION_LOCAL_ID = "relation_flatbush_phase1_uses_bounded_corridor_livingston_state_20260715";
const FLATBUSH_PROJECT_CORRIDOR_RELATION_ID = "relation_flatbush-phase1-uses-bounded-corridor-livingston-state-20260715";
const FLATBUSH_TREATMENT_CORRIDOR_RELATION_LOCAL_ID = "relation_flatbush_phase1_treatment_on_bounded_corridor_livingston_state_20260715";
const FLATBUSH_TREATMENT_CORRIDOR_RELATION_ID = "relation_flatbush-phase1-treatment-on-bounded-corridor-livingston-state-20260715";
const MODELING_GAP_RELATION_IDS = new Set([
  "relation_crichlow-department-head",
  "relation_meeting-doc-128921-open-stroller-buses",
  "relation_ossining-event-location",
  "relation_paratransit-ev-pilot",
  "relation_ptm-second-queens-facility",
  "relation_rel-jamaica-bus-depot-in-queens",
  "relation_sharp-dos-program",
  "relation_webster-bridge-on-port-washington-branch",
]);
const MODELING_GAP_ADDITION_LOCAL_IDS = new Set([
  "entity_ossining_station_2024",
  "project_paratransit_ev_bus_pilot_2024",
  "project_ptm_second_queens_facility_2025",
  "entity_queens_borough",
  "project_dos_sharp_safety_hazards_risk_prevention",
  "corridor_lirr_port_washington_branch",
  "relation_ossining_event_located_at_station_20260715",
  "relation_paratransit_department_has_ev_bus_pilot_20260715",
  "relation_ptm_has_second_queens_facility_project_20260715",
  "relation_jamaica_bus_depot_located_in_queens_20260715",
  "relation_sharp_program_part_of_department_of_subways_20260715",
  "relation_webster_bridge_located_on_port_washington_branch_20260715",
]);
const MODELING_GAP_ADDITIONS_BY_RELATION: Record<string, Array<{ local_id: string; record_id: string }>> = {
  "relation_ossining-event-location": [
    { local_id: "entity_ossining_station_2024", record_id: "entity_ossining-station-2024" },
    { local_id: "relation_ossining_event_located_at_station_20260715", record_id: "relation_ossining-event-located-at-station-20260715" },
  ],
  "relation_paratransit-ev-pilot": [
    { local_id: "project_paratransit_ev_bus_pilot_2024", record_id: "project_paratransit-ev-bus-pilot-2024" },
    { local_id: "relation_paratransit_department_has_ev_bus_pilot_20260715", record_id: "relation_paratransit-department-has-ev-bus-pilot-20260715" },
  ],
  "relation_ptm-second-queens-facility": [
    { local_id: "project_ptm_second_queens_facility_2025", record_id: "project_ptm-second-queens-facility-2025" },
    { local_id: "relation_ptm_has_second_queens_facility_project_20260715", record_id: "relation_ptm-has-second-queens-facility-project-20260715" },
  ],
  "relation_rel-jamaica-bus-depot-in-queens": [
    { local_id: "entity_queens_borough", record_id: "entity_queens-borough" },
    { local_id: "relation_jamaica_bus_depot_located_in_queens_20260715", record_id: "relation_jamaica-bus-depot-located-in-queens-20260715" },
  ],
  "relation_sharp-dos-program": [
    { local_id: "project_dos_sharp_safety_hazards_risk_prevention", record_id: "project_dos-sharp-safety-hazards-risk-prevention" },
    { local_id: "relation_sharp_program_part_of_department_of_subways_20260715", record_id: "relation_sharp-program-part-of-department-of-subways-20260715" },
  ],
  "relation_webster-bridge-on-port-washington-branch": [
    { local_id: "corridor_lirr_port_washington_branch", record_id: "corridor_lirr-port-washington-branch" },
    { local_id: "relation_webster_bridge_located_on_port_washington_branch_20260715", record_id: "relation_webster-bridge-located-on-port-washington-branch-20260715" },
  ],
};

const PINNED_FILES: Record<string, string> = {
  "data/canonical/relations.jsonl": "c2480fb9da78b339a9381ff6e5756f6496f87791f79b5cf3f2bc8e2f6b99bbf7",
  "data/canonical/sources.jsonl": "9866592b0e6c0d713c2f62c362d50d33ca43d4e56d631126a335d075771c2ca0",
  "data/canonical/claims.jsonl": "55b0784ffc4eb08204e79ce6ac9ea4755a1253a202f15fd50a6b51e9cd541d22",
  "data/canonical/metric_claims.jsonl": "433649f5a1cea1e80d4feb1264d1d76fef688444c0546048ea8f920569da3c2a",
};

const PINNED_RAW_FILES: Record<string, { metadata: string; blocks: string }> = {
  jamaica: {
    metadata: "bb5e1a905794402630d1ff44e0ccedb5ff73e5e4cf785430a09da111380a72b1",
    blocks: "608fde933fca3418cf0575d2d243595e00ba835c272e12cf561d0ac790572ca3",
  },
  mta_automated_camera_enforcement: {
    metadata: "949c2ebd77140c5bca22bfe178317330a040cdb15a30b73c21e41c7cf7a8a977",
    blocks: "52beef546cf3e92e3c1414ce0b28daf836dc4d14813a96cb0efbcee80f06fb9f",
  },
  open_data_lessons_2026: {
    metadata: "614981a2fe1f4a97bfb08c2e805e92a212f20c8c1c0759497184aa3fb960f32c",
    blocks: "507c72ffd33b8652ab63bd60a344b0c7e668a7e29f1174bf1ade0b9e1279335f",
  },
  queens_proposed_final_plan_addendum_2024: {
    metadata: "1be1a7a556a74e2bc315376209189be79da376f14681d3ff051c8d98482871b3",
    blocks: "4804ae1366c5e9844f3e16f2cad0d21d52f607f9de632da654c30fa00a110e84",
  },
  queens_service_change_board_item_2025: {
    metadata: "9e043d37ed94957f236d2b2c27edcc3643d7bd39a3ab7a9c38a3ce68b7f38e76",
    blocks: "022c76a02a0d740b481d1dde6b06798f8df4363e4a3d2f8196a346c06a9ff7b8",
  },
  meeting_doc_205566: {
    metadata: "32b896b70400d34d980ec32c387dec35c0c809a2999027fe88fb515b109c1962",
    blocks: "a7ed37a0ca470e3b1f1529786cf889e717e237791e47d0028ac60263d5e11eda",
  },
  meeting_doc_179691: {
    metadata: "1c30e14444c409e4db297dac3d606af8193986df06e1e7e31b76018dfb76548b",
    blocks: "aa3c9b82b01966157ca6132f27cf94575db603e444d81e3e7ead8f31852ea27a",
  },
  brt_m79_cb7_mar2017: {
    metadata: "4776d75b1893332673b35c557356eb1333fa5df80e05ac331cc613e81e1e1e32",
    blocks: "f62ad2594a9631380e96aede80dfd583c50effdff9b48c850692f1c134768a2d",
  },
  meeting_doc_201561: {
    metadata: "799bfcd2a1c093483f8e60a8950199d6c04110cc4e060db18c1c9fe633d74007",
    blocks: "f6a0ff3d9ab0a4244253e95260f3b983cd26549a2f6fb08ce0d3913438369ac5",
  },
  meeting_doc_33681: {
    metadata: "72494d98c47da6b178f90643516bda2b3553160027515e914796a631fa705a53",
    blocks: "92ed00349d5a3710f24474930d6996280f6e4aeed156e6ad880bd20cb9894661",
  },
  meeting_doc_131646: {
    metadata: "d520033e844dd5f54fcde17829b60a77d26c9df915f38d97906f4100badc0567",
    blocks: "019b42127d06341fa6bef10e05b9d841393730f8fa05312fe0c2ffe81f090eb4",
  },
  meeting_doc_171496: {
    metadata: "14f7d7ea9ff6ef71e671b8e9306d62a41a0e1e9eccd084b66f1b7a488c1cc1d1",
    blocks: "350080537b0b70bda52ce83033abf23d98082448330f64df3d24f8d286f12ee8",
  },
  flatbush_ave_bus_priority_mtp_briefing_apr2026: {
    metadata: "7de89144dcb896ad64ae3b14f29df6d8ae4fe29ca530ebfa8615cfd2f1d456a7",
    blocks: "4a13c7a218c0f16f7ceb483a1117a5703caaee83c64b8e6b315d32a3312072b6",
  },
  meeting_doc_102841: {
    metadata: "d5af9e7904a848bb20fc29f6e10e7334154c5e87099e21014433600dcf22014c",
    blocks: "ede14deacf8cc34427ad4b47bbf63e71fb22859206a0d752ff41f3959c3de51f",
  },
  meeting_doc_128921: {
    metadata: "32f1c3bad7707bdb72bb9358914df7e4eac5a762637de9c833027c31caf9e4e1",
    blocks: "28b00a43af5fdbf44d7290b728fc710aef6ee4c690ca1903c516bdb8962cb99e",
  },
  meeting_doc_140421: {
    metadata: "3163e3de9e0ff5233655b804639f01630c51b5f29bcb1d1b662d1191e632053a",
    blocks: "11efff07ea19ce23d99be562648764b7c07e746ea790e479a811d451dfc5cc89",
  },
  meeting_doc_164966: {
    metadata: "c0b58e41f20f006a37d9aa67495576c784e5082fee89b09f274c6d5c10f2a32c",
    blocks: "877611d33091fdb7979929a465620b9e434ca4a2a5563895e4eb1fdb115e7dee",
  },
  nyct_key_performance_metrics_june2025: {
    metadata: "aa4280f87295631afaccafe78d9f613ee86da6add51f9d35a742fbc6f1492fd9",
    blocks: "05c367fed2e36a6c07f5d97517315a402731d1932f7bbf85aff9a922ed150e99",
  },
  meeting_doc_199181: {
    metadata: "15af615a3868ad83b7954c7d938ff4fa1fedfb0307b038967fa0f0d8cbfcd2ba",
    blocks: "44a3219b1028e93cfe1bb542e34535f2eff072b94a4d97120814bcb12c064391",
  },
  meeting_doc_205596: {
    metadata: "06b26ca0e55d43ff268d9dc5641ad9aaeaee6f5f803d24f45e33bb034a5ddb7f",
    blocks: "b05b255e59c81573f90f879aada6421838d778d3f9e4e826ca7353cca584e4c6",
  },
};

type RawBlock = {
  source_id: string;
  block_id: string;
  page_number: number;
  raw_text: string;
  raw_text_sha256: string;
};

type LedgerEntry = {
  item_id: string;
  category: string;
  primary_disposition: string;
  reasons: string[];
  record_ids: string[];
  evidence_ids: string[];
  evidence_bindings?: Array<{ evidence_id: string; text_sha256: string }>;
  correction_ids: string[];
  submission_ids?: string[];
  investigation: string;
};

type Campaign = {
  corrections: SemanticCorrectionEntry[];
  submissions: MtaSubmissionEntry[];
  ledger: LedgerEntry[];
  summary: JsonObject;
};

const DUPLICATE_MERGES = new Map<string, string>([
  ["relation_batch012-meeting-doc-199126-mnr-agreement5-duplicate-timeline-event", "relation_batch012-meeting-doc-199126-agreement5-mnr-timeline-event"],
  ["relation_meeting-doc-199051-forest-hills-implemented-by-mtacd", "relation_meeting-doc-199051-forest-hills-lirr-mtacd"],
  ["relation_meeting-doc-199051-mnr-station-improv-westchester", "relation_meeting-doc-199051-mnr-station-improvements-county-westchester"],
  ["relation_meeting-doc-199051-pav-phase1-implemented-by", "relation_meeting-doc-199051-park-ave-mtacd-mnr"],
  ["relation_mta-parent-lirr-subsidiary", "relation_mta-subsidiary-lirr"],
  ["relation_rel-project-m86-sbs-launch-event", "relation_rel-project-has-launch-event"],
  ["relation_source-published-by-mta-v2", "relation_source-published-by-mta_14"],
  ["relation_meeting-doc-98321-kawasaki-r211-base", "relation_meeting-doc-98321-kawasaki-r211"],
]);

const SOURCE_DUPLICATE_MERGES = new Map<string, string>([
  ["source_meeting-doc-160631_2", "source_meeting-doc-160631"],
  ["source_meeting-doc-170871_2", "source_meeting-doc-170871"],
  ["source_meeting-doc-205331_2", "source_meeting-doc-205331"],
  ["source_meeting-doc-29966_2", "source_meeting-doc-29966"],
]);

const RELATIONSHIP_VARIANTS: Record<string, string> = {
  "relation_meeting-doc-174096-hq-cubic-ai": "contract_feature:customer_website_ai_chatbot",
  "relation_meeting-doc-174096-hq-cubic-pos": "contract_feature:customer_service_point_of_sale_terminals",
  "relation_mta-hq-giro-crew-dispatch": "contract_scope:crew_dispatch_management",
  "relation_mta-hq-giro-hastus": "contract_scope:hastus_scheduling_upgrade",
  "relation_s79-route-operates-on-richmond-platinum-corridor": "physical_segment:richmond_platinum_to_forest_hill",
  "relation_s79-route-operates-on-richmond-shirley-corridor": "physical_segment:richmond_shirley_to_hylan",
  "relation_b6-operates-bay-pkwy": "physical_scope:bay_parkway",
  "relation_b6-operates-cropsey-ave": "physical_scope:cropsey_avenue",
  "relation_q20-operates-on-main-st": "route_variant:q20",
  "relation_q20ab-operates-on-main-st-v2": "route_variant:q20a_q20b",
  "relation_b46-limited-operates-on-utica-corridor_2": "service_phase:limited_stop_predecessor",
  "relation_b46-sbs-operates-on-utica-corridor": "service_phase:select_bus_service_successor",
  "relation_route-ltd-corridor-utica": "service_phase:limited_stop_predecessor",
  "relation_route-sbs-corridor-utica": "service_phase:select_bus_service_successor",
  "relation_x28-operates-bay-pkwy": "physical_scope:bay_parkway",
  "relation_x28-operates-cropsey-ave": "physical_scope:cropsey_avenue",
  "relation_project-serves-b46-limited_2": "route_phase_role:limited_stop_predecessor",
  "relation_project-serves-b46-sbs_2": "route_phase_role:select_bus_service_successor",
  "relation_project-uses-corridor-bay-pkwy": "physical_scope:bay_parkway",
  "relation_project-uses-corridor-cropsey": "physical_scope:cropsey_avenue",
  "relation_project-uses-bay-pkwy-corridor": "physical_scope:bay_parkway",
  "relation_project-uses-cropsey-corridor": "physical_scope:cropsey_avenue",
  "relation_project-uses-corridor-bay-pkwy_2": "physical_scope:bay_parkway",
  "relation_project-uses-corridor-cropsey_2": "physical_scope:cropsey_avenue",
  "relation_project-uses-corridor-bay-pkwy-cb12-jun2025": "physical_scope:bay_parkway",
  "relation_project-uses-corridor-cropsey-cb12-jun2025": "physical_scope:cropsey_avenue",
};

const PHASE_VARIANTS: Record<string, string> = {
  "relation_b46-limited-on-corridor": "limited_stop_predecessor",
  "relation_b46-sbs-on-corridor": "select_bus_service_successor",
  "relation_limited-operates-on-corridor": "limited_stop_predecessor",
  "relation_sbs-operates-on-corridor": "select_bus_service_successor",
};

const FAMILY_RETRACTIONS = new Set([
  "relation_rel-ace-routes-expansion",
  "relation_rel-f-m-swap-improves-subway-reliability",
  "relation_meeting-doc-133361-penn-station-access-bronx",
  "relation_rel-jamaica-terminal-old-new-locations",
  "relation_rel-interim-terminal-serves-mta-nice-routes",
]);

const EAST_RIVER_OPERATOR_RELATIONS = new Set([
  "relation_meeting-doc-171496-amtrak-operator",
  "relation_meeting-doc-171496-lirr-operator",
  "relation_meeting-doc-171496-njtransit-operator",
]);

const VALID_FAMILY_SHAPE_EXCEPTIONS = new Set([
  "relation_rel-mta-launches-data-analytics-blog",
  "relation_rel-m86-local-replaced-by-m86-sbs",
  "relation_moodys-upgraded-mta-trb",
  "relation_mdoc164971-fitch-trb-rating",
  "relation_mdoc164971-kbra-rating",
  "relation_mdoc164971-moodys-rating",
  "relation_mdoc164971-sp-rating",
  "relation_mets-willets-on-flushing-line-208006",
  "relation_psa-bruckner-blvd-property",
]);

const BROAD_EVIDENCE_RELATIONS = [
  "relation_cctv-april-meeting",
  "relation_mta-published-by",
  "relation_part-of-program-project-fuel-hedge-program-2022-project-fuel-hedge-program-2022_2362d3ba6a",
  "relation_project-has-treatment-w81-columbus",
  "relation_security-grant-july-meeting",
  "relation_spruce-up-2025-event",
  "relation_ulsd-hedges-claim-budget",
  "relation_ulsd-hedges-metrics",
] as const;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertPinned(path: string, expected: string): void {
  const actual = sha256File(path);
  if (actual !== expected) throw new Error(`input hash mismatch for ${path}: expected ${expected}, found ${actual}`);
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function rawBlocks(rawRoot: string, sourceId: string): Map<string, RawBlock> {
  return new Map(readJsonl<RawBlock>(join(rawRoot, sourceId, "blocks.jsonl")).map((block) => [block.block_id, block]));
}

export function evidenceRefFromBlock(block: RawBlock, role?: string, sourceQuote?: string): MtaEvidenceRef {
  return {
    source_id: block.source_id,
    evidence_id: `${block.source_id}#${block.block_id}`,
    source_path: `raw/sources/${block.source_id}/blocks.jsonl`,
    page_number: block.page_number,
    block_id: block.block_id,
    text_sha256: block.raw_text_sha256,
    text_source: "raw_text",
    ...(role ? { role } : {}),
    ...(sourceQuote ? { source_quote: sourceQuote } : {}),
  };
}

function refs(rawRoot: string, sourceId: string, specs: Array<[string, string?, string?]>): MtaEvidenceRef[] {
  const blocks = rawBlocks(rawRoot, sourceId);
  return specs.map(([blockId, role, sourceQuote]) => {
    const block = blocks.get(blockId);
    if (!block) throw new Error(`missing pinned block ${sourceId}#${blockId}`);
    if (sourceQuote && !block.raw_text.replace(/\s+/gu, " ").includes(sourceQuote.replace(/\s+/gu, " "))) {
      throw new Error(`source quote is not present in ${sourceId}#${blockId}`);
    }
    return evidenceRefFromBlock(block, role, sourceQuote);
  });
}

function relationShape(record: MtaCanonicalRecord, kinds: Map<string, string>): string {
  return `${kinds.get(String(record.payload.subject_id)) ?? "missing"}->${kinds.get(String(record.payload.object_id)) ?? "missing"}`;
}

export function isAssignedFamilyShapeSuspect(record: MtaCanonicalRecord, kinds: Map<string, string>): boolean {
  if (record.record_kind !== "relation") return false;
  const kind = String(record.payload.relation_kind ?? "");
  const family = String(record.payload.relation_family ?? "");
  const shape = relationShape(record, kinds);
  return (
    (kind === "presented_to" && family === "claim_context") ||
    (kind === "has_agenda_topic" && family === "claim_context" && shape === "event->entity") ||
    (kind === "in_development_for" && family === "timeline_context" && shape === "project->route") ||
    (kind === "launches" && family === "timeline_context" && shape === "entity->entity") ||
    (kind === "replaced_by" && family === "timeline_context" && shape === "route->route") ||
    (kind === "has_initiative" && family === "program_project_scope" && shape === "entity->claim") ||
    (kind === "operates_program" && family === "program_project_scope" && shape === "entity->claim") ||
    (kind === "has_program" && family === "program_project_scope" && ["entity->claim", "entity->source"].includes(shape)) ||
    (["complementary_program", "contributes_to"].includes(kind) && family === "program_project_scope" && shape === "entity->metric_claim") ||
    (["has_project_feature", "has_project_scope", "joint_program"].includes(kind) && family === "program_project_scope" && shape === "entity->entity") ||
    (kind === "part_of" && family === "organization_hierarchy" && ["entity->source", "event->source", "project->entity", "project->project", "project->claim", "source->entity", "claim->entity", "event->project"].includes(shape)) ||
    (kind === "belongs_to" && family === "organization_hierarchy" && shape === "entity->source") ||
    (kind === "has_agency" && family === "organization_hierarchy" && shape === "project->entity") ||
    (kind === "has_component" && family === "organization_hierarchy" && shape === "project->event") ||
    (kind === "department_head" && family === "organization_hierarchy" && shape === "entity->project") ||
    (kind === "has_member" && family === "organization_hierarchy" && shape === "entity->claim") ||
    (kind === "serves_location" && family === "location_scope" && shape === "route->project") ||
    (kind === "located_in" && family === "location_scope" && shape === "project->project") ||
    (kind === "located_at" && family === "location_scope" && shape === "event->claim") ||
    (kind === "relocated_from" && family === "location_scope" && shape === "project->project") ||
    (kind === "assigned_rating_to" && family === "metric_context" && shape === "entity->entity") ||
    (kind === "assigned_rating" && family === "metric_context" && shape === "entity->entity") ||
    (kind === "exhibits_property" && family === "metric_context" && shape === "event->claim") ||
    (kind === "has_priority" && family === "metric_context" && shape === "entity->claim") ||
    (kind === "improves" && family === "metric_context" && shape === "project->project") ||
    (kind === "operates_on" && family === "corridor_scope" && ["entity->project", "project->entity"].includes(shape)) ||
    (kind === "located_on" && family === "corridor_scope" && ["project->entity", "project->route"].includes(shape)) ||
    (kind === "has_tsp" && family === "treatment_context" && shape === "route->route") ||
    (kind === "reports_on" && family === "agency_role" && shape === "source->project") ||
    (kind === "presents" && family === "agency_role" && shape === "event->source") ||
    (kind === "applies_to" && family === "route_scope" && shape === "entity->entity") ||
    (kind === "serves" && family === "route_scope" && shape === "entity->entity") ||
    (kind === "has_real_estate_action" && family === "ownership_role" && shape === "corridor->project")
  );
}

export function correctedFamily(record: MtaCanonicalRecord, kinds: Map<string, string>): string | undefined {
  const kind = String(record.payload.relation_kind ?? "");
  const shape = relationShape(record, kinds);
  if (kind === "presented_to") return "partnership_engagement";
  if (kind === "has_agenda_topic" && shape === "event->entity") return "agency_role";
  if (kind === "in_development_for" && shape === "project->route") return "route_scope";
  if (["has_initiative", "operates_program"].includes(kind) && shape === "entity->claim") return "claim_context";
  if (kind === "has_program" && shape === "entity->claim") return "claim_context";
  if (kind === "has_program" && shape === "entity->source") return "publication_role";
  if (["complementary_program", "contributes_to"].includes(kind) && shape === "entity->metric_claim") return "metric_context";
  if (kind === "joint_program" && shape === "entity->entity") return "partnership_engagement";
  if (kind === "part_of") {
    if (["entity->source", "event->source", "source->entity"].includes(shape)) return "publication_role";
    if (shape === "project->entity") return "agency_role";
    if (shape === "project->project") return "program_project_scope";
    if (shape === "project->claim") return "claim_context";
    if (shape === "event->project") return "timeline_context";
  }
  if (kind === "belongs_to" && shape === "entity->source") return "publication_role";
  if (kind === "has_agency" && shape === "project->entity") return "agency_role";
  if (kind === "has_component" && shape === "project->event") return "timeline_context";
  if (kind === "has_member" && shape === "entity->claim") return "claim_context";
  if (kind === "exhibits_property" && shape === "event->claim") return "claim_context";
  if (kind === "has_priority" && shape === "entity->claim") return "claim_context";
  if (kind === "reports_on" && shape === "source->project") return "data_reporting";
  if (kind === "presents" && shape === "event->source") return "publication_role";
  return undefined;
}

export function exactSemanticKey(record: MtaCanonicalRecord, includeVariant = false): string {
  const evidence = record.evidence_refs.map((ref) => ref.evidence_id).sort();
  const values: JsonValue[] = [
    String(record.payload.relation_kind ?? ""),
    String(record.payload.subject_id ?? ""),
    String(record.payload.object_id ?? ""),
    String(record.payload.assertion_status ?? ""),
    String(record.payload.as_of_date ?? ""),
    evidence,
  ];
  if (includeVariant) values.push(String(record.payload.relationship_variant_key ?? ""));
  return stableJson(values);
}

export function deterministicSubmissionEntry(input: MtaSubmitObservationInput): MtaSubmissionEntry {
  const toolArgs = input as unknown as JsonObject;
  const hash = stableHash(toolArgs);
  return {
    submission_id: `sub_${hash.slice(0, 16)}`,
    run_id: RUN_ID,
    submitted_at: REVIEWED_AT,
    tool_args_sha256: `sha256:${hash}`,
    schema_version: 2,
    tool_args: input,
    validation: { state: "accepted", issues: [] },
  };
}

function buildSubmissions(rawRoot: string): MtaSubmissionEntry[] {
  const sourceInputs: MtaSubmitObservationInput[] = [
    {
      source_id: "jamaica",
      observation_kind: "source",
      local_observation_id: "source_jamaica",
      create_new: true,
      label: "NYC DOT Jamaica Bus Priority",
      payload: {
        title: "NYC DOT Jamaica Bus Priority",
        publisher: "NYC DOT",
        content_type: "web page",
        source_url: "https://www.nyc.gov/html/brt/html/other/jamaica.shtml",
        description: "Official NYC DOT Jamaica Bus Improvement Study page.",
      },
      evidence_refs: refs(rawRoot, "jamaica", [["p001_b0001", "document_body", "Jamaica Bus Improvement Study Goals"]]),
    },
    {
      source_id: "mta_automated_camera_enforcement",
      observation_kind: "source",
      local_observation_id: "source_mta_automated_camera_enforcement",
      create_new: true,
      label: "MTA Automated Camera Enforcement",
      payload: {
        title: "MTA Automated Camera Enforcement",
        publisher: "MTA",
        content_type: "web page",
        source_url: "https://www.mta.info/agency/new-york-city-transit/automated-camera-enforcement",
        date_text: "May 15, 2026",
        published_date_normalized: "2026-05-15",
        published_date_precision: "day",
      },
      evidence_refs: refs(rawRoot, "mta_automated_camera_enforcement", [["p001_b0001", "document_header", "Updated May 15, 2026 Automated Camera Enforcement"]]),
    },
    {
      source_id: "open_data_lessons_2026",
      observation_kind: "source",
      local_observation_id: "source_open_data_lessons_2026",
      create_new: true,
      label: "MTA Lessons Learned in Managing the Open Data Program",
      payload: {
        title: "MTA Lessons Learned in Managing the Open Data Program",
        publisher: "MTA",
        content_type: "web article",
        source_url: "https://www.mta.info/article/lessons-learned-managing-mtas-open-data-program",
        date_text: "March 10, 2026",
        published_date_normalized: "2026-03-10",
        published_date_precision: "day",
      },
      evidence_refs: refs(rawRoot, "open_data_lessons_2026", [["p001_b0001", "document_header", "Lessons learned in managing the MTA’s Open Data program MTA Updated March 10, 2026"]]),
    },
    {
      source_id: "queens_proposed_final_plan_addendum_2024",
      observation_kind: "source",
      local_observation_id: "source_queens_proposed_final_plan_addendum_2024",
      create_new: true,
      label: "Queens Bus Network Redesign Proposed Final Plan Addendum",
      payload: {
        title: "Queens Bus Network Redesign Proposed Final Plan Addendum",
        publisher: "MTA",
        content_type: "plan addendum",
        source_url: "https://www.mta.info/document/160976",
        date_text: "December 2024",
        published_date_normalized: "2024-12",
        published_date_precision: "month",
      },
      evidence_refs: refs(rawRoot, "queens_proposed_final_plan_addendum_2024", [
        ["p001_c0002", "title"],
        ["p001_c0003", "subtitle"],
        ["p001_c0004", "publication_date"],
      ]),
    },
    {
      source_id: "queens_service_change_board_item_2025",
      observation_kind: "source",
      local_observation_id: "source_queens_service_change_board_item_2025",
      create_new: true,
      label: "Queens Bus Network Redesign Service Change Board Item",
      payload: {
        title: "Queens Bus Network Redesign Service Change Board Item",
        publisher: "MTA",
        content_type: "board item",
        source_url: "https://www.mta.info/document/163136",
        date_text: "January 17, 2025",
        published_date_normalized: "2025-01-17",
        published_date_precision: "day",
        authority_tier: "board_material",
      },
      evidence_refs: refs(rawRoot, "queens_service_change_board_item_2025", [
        ["p001_c0002", "title"],
        ["p002_c0004", "staff_summary"],
        ["p002_c0005", "document_date", "Date January 17, 2025"],
      ]),
    },
  ];

  const splitRelation: MtaSubmitObservationInput = {
    source_id: "meeting_doc_131646",
    observation_kind: "relation",
    local_observation_id: "relation_meeting_doc_131646_nyct_bus_procurement_metric_split_20260715",
    create_new: true,
    label: "NYC Transit - Bus Procurement Metric",
    payload: {
      relation_kind: "has_metric",
      relation_family: "metric_context",
      subject_local_observation_id: "entity_meeting_doc_131646_nyct",
      object_local_observation_id: "metric_meeting_doc_131646_nyct_bus_procurement_2917m",
      subject_id: "entity_mta-nyct",
      object_id: "metric_meeting-doc-131646-nyct-bus-procurement-2917m",
    },
    evidence_refs: refs(rawRoot, "meeting_doc_131646", [[
      "p003_c0005",
      "metric_binding",
      "procurement of 224 low-floor 60-foot diesel buses with an option for 21 buses for $291.7 million",
    ]]),
  };

  const eastRiverCorridor: MtaSubmitObservationInput = {
    source_id: "meeting_doc_171496",
    observation_kind: "corridor",
    local_observation_id: EAST_RIVER_CORRIDOR_LOCAL_ID,
    create_new: true,
    label: "East River Tunnels",
    raw_text: "LIRR, Amtrak, and NJ Transit operate trains through Penn Station and the East River Tunnels",
    payload: {
      corridor_name: "East River Tunnels",
      corridor_type: "rail tunnel",
      description: "East River Tunnels through which LIRR, Amtrak, and NJ Transit operate trains.",
    },
    evidence_refs: refs(rawRoot, "meeting_doc_171496", [[
      "p002_c0001",
      "physical_corridor_identity",
      "LIRR, Amtrak, and NJ Transit operate trains through Penn Station and the East River Tunnels",
    ]]),
  };

  const flatbushEvidence = refs(rawRoot, "flatbush_ave_bus_priority_mtp_briefing_apr2026", [[
    "p004_c0002",
    "delivered_bounded_physical_scope",
    "Last fall, DOT installed center-running bus lanes between Livingston St and State St",
  ]]);
  const flatbushCorridor: MtaSubmitObservationInput = {
    source_id: "flatbush_ave_bus_priority_mtp_briefing_apr2026",
    observation_kind: "corridor",
    local_observation_id: FLATBUSH_PHASE1_CORRIDOR_LOCAL_ID,
    create_new: true,
    label: "Flatbush Avenue, Livingston Street to State Street",
    raw_text: "Last fall, DOT installed center-running bus lanes between Livingston St and State St",
    payload: {
      corridor_name: "Flatbush Avenue between Livingston Street and State Street",
      corridor_type: "street segment",
      street: "Flatbush Avenue",
      borough: "Brooklyn",
      limits: "Livingston Street to State Street",
      description: "Bounded two-block Flatbush Avenue segment between Livingston Street and State Street.",
    },
    evidence_refs: flatbushEvidence,
  };
  const flatbushProjectCorridorRelation: MtaSubmitObservationInput = {
    source_id: "flatbush_ave_bus_priority_mtp_briefing_apr2026",
    observation_kind: "relation",
    local_observation_id: FLATBUSH_PROJECT_CORRIDOR_RELATION_LOCAL_ID,
    create_new: true,
    label: "Flatbush Phase 1 uses the Livingston Street-to-State Street segment",
    raw_text: "Last fall, DOT installed center-running bus lanes between Livingston St and State St",
    payload: {
      relation_kind: "uses_corridor",
      relation_family: "corridor_scope",
      subject_local_observation_id: "project_flatbush_phase1_center_running_bus_lanes_livingston_state",
      object_local_observation_id: FLATBUSH_PHASE1_CORRIDOR_LOCAL_ID,
      subject_id: FLATBUSH_PHASE1_PROJECT_ID,
      assertion_status: "delivered",
      as_of_date: "2026-04",
      description: "The bounded Flatbush Avenue Phase 1 project uses the physical segment between Livingston Street and State Street.",
    },
    evidence_refs: flatbushEvidence,
  };
  const flatbushTreatmentCorridorRelation: MtaSubmitObservationInput = {
    source_id: "flatbush_ave_bus_priority_mtp_briefing_apr2026",
    observation_kind: "relation",
    local_observation_id: FLATBUSH_TREATMENT_CORRIDOR_RELATION_LOCAL_ID,
    create_new: true,
    label: "Flatbush Phase 1 center-running bus lanes are on the Livingston Street-to-State Street segment",
    raw_text: "Last fall, DOT installed center-running bus lanes between Livingston St and State St",
    payload: {
      relation_kind: "located_on_corridor",
      relation_family: "corridor_scope",
      subject_local_observation_id: "treatment_flatbush_phase1_center_running_bus_lanes_livingston_state",
      object_local_observation_id: FLATBUSH_PHASE1_CORRIDOR_LOCAL_ID,
      subject_id: FLATBUSH_PHASE1_TREATMENT_ID,
      assertion_status: "delivered",
      as_of_date: "2026-04",
      description: "The delivered Phase 1 center-running bus-lane treatment is bounded to Flatbush Avenue between Livingston Street and State Street.",
    },
    evidence_refs: flatbushEvidence,
  };

  const ossiningEvidence = refs(rawRoot, "meeting_doc_140421", [
    ["p002_c0004", "station_identity", "OSSINING STATION"],
    ["p002_c0008", "exact_location", "LOCATION: Ossining Station"],
    ["p002_c0010", "event_location", "annual Earth Day event on Saturday, April 20, 2024"],
  ]);
  const ossiningStation: MtaSubmitObservationInput = {
    source_id: "meeting_doc_140421",
    observation_kind: "entity",
    local_observation_id: "entity_ossining_station_2024",
    create_new: true,
    label: "Ossining Station",
    payload: {
      entity_name: "Ossining Station",
      entity_type: "rail station",
      location: "Town of Ossining, Westchester County, New York",
      operator: "MTA Metro-North Railroad",
    },
    evidence_refs: ossiningEvidence.slice(0, 2),
  };
  const ossiningEventLocationRelation: MtaSubmitObservationInput = {
    source_id: "meeting_doc_140421",
    observation_kind: "relation",
    local_observation_id: "relation_ossining_event_located_at_station_20260715",
    create_new: true,
    label: "Ossining Earth Day event at Ossining Station",
    payload: {
      relation_kind: "located_at",
      relation_family: "location_scope",
      subject_id: "event_ossining-earth-day-2024",
      subject_local_observation_id: "event_ossining_earth_day_2024",
      object_local_observation_id: "entity_ossining_station_2024",
      as_of_date: "2024-04-20",
      assertion_status: "realized",
      description: "The Town of Ossining's annual Earth Day event used parking lots 14a and 14b at Ossining Station.",
    },
    evidence_refs: ossiningEvidence,
  };

  const paratransitEvEvidence = refs(rawRoot, "meeting_doc_164966", [[
    "p010_c0005",
    "program_identity_and_scope",
    "Paratransit is currently piloting 15 EV paratransit buses",
  ]]);
  const paratransitEvPilot: MtaSubmitObservationInput = {
    source_id: "meeting_doc_164966",
    observation_kind: "project",
    local_observation_id: "project_paratransit_ev_bus_pilot_2024",
    create_new: true,
    label: "Paratransit 15-EV Bus Pilot",
    payload: {
      project_name: "Paratransit 15-EV Bus Pilot",
      project_type: "vehicle pilot",
      project_family: "fleet_or_vehicle",
      status: "in progress",
      description: "Department of Paratransit pilot of 15 electric paratransit buses, documented with the April 2024 primary-carrier charging-station contract modification.",
      document_time_status: "in_progress",
      date_text: "April 2024",
      date_precision: "month",
    },
    evidence_refs: paratransitEvEvidence,
  };
  const paratransitEvRelation: MtaSubmitObservationInput = {
    source_id: "meeting_doc_164966",
    observation_kind: "relation",
    local_observation_id: "relation_paratransit_department_has_ev_bus_pilot_20260715",
    create_new: true,
    label: "Department of Paratransit has 15-EV bus pilot",
    payload: {
      relation_kind: "has_project",
      relation_family: "program_project_scope",
      subject_id: "entity_department-of-paratransit",
      subject_local_observation_id: "entity_dept_of_paratransit_164966",
      object_local_observation_id: "project_paratransit_ev_bus_pilot_2024",
      as_of_date: "2025-02-20",
      assertion_status: "in_progress",
      description: "Department of Paratransit was piloting 15 electric paratransit buses at document time.",
    },
    evidence_refs: paratransitEvEvidence,
  };

  const ptmFacilityEvidence = refs(rawRoot, "meeting_doc_164966", [
    ["p009_c0005", "project_identity", "PTM’s contract amendment will also include the addition of a second facility in Queens"],
    ["p010_c0006", "facility_scope", "up to 200 at its second Queens facility"],
  ]);
  const ptmFacilityProject: MtaSubmitObservationInput = {
    source_id: "meeting_doc_164966",
    observation_kind: "project",
    local_observation_id: "project_ptm_second_queens_facility_2025",
    create_new: true,
    label: "PTM Second Queens Facility",
    payload: {
      project_name: "PTM Second Queens Facility",
      project_type: "paratransit operating facility",
      project_family: "capital_or_infrastructure",
      status: "planned",
      location: "Queens",
      description: "A second Queens operating facility included in PTM's Access-A-Ride primary-carrier contract amendment, with capacity for up to 200 vehicles.",
      document_time_status: "planned",
      date_text: "2025",
      date_precision: "year",
    },
    evidence_refs: ptmFacilityEvidence,
  };
  const ptmFacilityRelation: MtaSubmitObservationInput = {
    source_id: "meeting_doc_164966",
    observation_kind: "relation",
    local_observation_id: "relation_ptm_has_second_queens_facility_project_20260715",
    create_new: true,
    label: "PTM has second Queens facility project",
    payload: {
      relation_kind: "has_project",
      relation_family: "program_project_scope",
      subject_id: "entity_ptm-management-corp",
      subject_local_observation_id: "entity_ptm_management_corp_164966",
      object_local_observation_id: "project_ptm_second_queens_facility_2025",
      as_of_date: "2025-02-20",
      assertion_status: "planned",
      description: "PTM's contract amendment includes a second operating facility in Queens.",
    },
    evidence_refs: ptmFacilityEvidence,
  };

  const queensLocationEvidence = refs(rawRoot, "nyct_key_performance_metrics_june2025", [[
    "p024_c0003",
    "exact_borough_location",
    "rebuilding and expanding the Jamaica Bus Depot in Queens",
  ]]);
  const queensBorough: MtaSubmitObservationInput = {
    source_id: "nyct_key_performance_metrics_june2025",
    observation_kind: "entity",
    local_observation_id: "entity_queens_borough",
    create_new: true,
    label: "Queens",
    payload: {
      entity_name: "Queens",
      entity_type: "borough",
      description: "New York City borough named as the physical location of the Jamaica Bus Depot rebuild.",
    },
    evidence_refs: queensLocationEvidence,
  };
  const jamaicaDepotLocationRelation: MtaSubmitObservationInput = {
    source_id: "nyct_key_performance_metrics_june2025",
    observation_kind: "relation",
    local_observation_id: "relation_jamaica_bus_depot_located_in_queens_20260715",
    create_new: true,
    label: "Jamaica Bus Depot reconstruction is located in Queens",
    payload: {
      relation_kind: "located_in",
      relation_family: "location_scope",
      subject_id: "project_jamaica-bus-depot-reconstruction",
      subject_local_observation_id: "project_jamaica_bus_depot_rebuild",
      object_local_observation_id: "entity_queens_borough",
      as_of_date: "2025-06",
      assertion_status: "in_progress",
      description: "The official project report places the Jamaica Bus Depot rebuild and expansion in Queens.",
    },
    evidence_refs: queensLocationEvidence,
  };

  const sharpEvidence = refs(rawRoot, "meeting_doc_199181", [
    ["p001_c0001", "department_plan_identity", "NYCT 2025 DOS AGENCY SAFETY PLAN"],
    ["p001_c0005", "program_identity", "DOS Safety, Safety Hazards and Risk Prevention program (SHARP)"],
  ]);
  const sharpProject: MtaSubmitObservationInput = {
    source_id: "meeting_doc_199181",
    observation_kind: "project",
    local_observation_id: "project_dos_sharp_safety_hazards_risk_prevention",
    create_new: true,
    label: "Department of Subways Safety Hazards and Risk Prevention Program (SHARP)",
    payload: {
      project_name: "Safety Hazards and Risk Prevention Program (SHARP)",
      project_type: "safety risk prevention program",
      project_family: "safety_program",
      status: "active",
      implementing_agency: "NYCT Department of Subways",
      description: "A proactive Department of Subways program using employee referrals, field observations, audits, and injury data to identify and address potential safety trends.",
      document_time_status: "active",
      date_text: "2025",
      date_precision: "year",
    },
    evidence_refs: sharpEvidence,
  };
  const sharpDepartmentRelation: MtaSubmitObservationInput = {
    source_id: "meeting_doc_199181",
    observation_kind: "relation",
    local_observation_id: "relation_sharp_program_part_of_department_of_subways_20260715",
    create_new: true,
    label: "SHARP is a Department of Subways safety program",
    payload: {
      relation_kind: "managed_by_department",
      relation_family: "agency_role",
      subject_local_observation_id: "project_dos_sharp_safety_hazards_risk_prevention",
      object_id: "entity_dept-of-subways-crichlow",
      object_local_observation_id: "entity_dos_dos_asp",
      as_of_date: "2025",
      assertion_status: "active",
      description: "The Safety Hazards and Risk Prevention Program is identified by the official plan as a Department of Subways program.",
    },
    evidence_refs: sharpEvidence,
  };

  const portWashingtonEvidence = refs(rawRoot, "meeting_doc_205596", [[
    "p004_c0001",
    "physical_corridor_identity",
    "Webster Avenue roadway bridge, located over the LIRR's Port Washington Branch in Manhasset",
  ]]);
  const portWashingtonCorridor: MtaSubmitObservationInput = {
    source_id: "meeting_doc_205596",
    observation_kind: "corridor",
    local_observation_id: "corridor_lirr_port_washington_branch",
    create_new: true,
    label: "LIRR Port Washington Branch",
    payload: {
      corridor_name: "LIRR Port Washington Branch",
      corridor_type: "commuter rail branch",
      operator: "Long Island Rail Road",
      description: "Physical Long Island Rail Road Port Washington Branch beneath the Webster Avenue roadway bridge in Manhasset.",
    },
    evidence_refs: portWashingtonEvidence,
  };
  const websterBridgeCorridorRelation: MtaSubmitObservationInput = {
    source_id: "meeting_doc_205596",
    observation_kind: "relation",
    local_observation_id: "relation_webster_bridge_located_on_port_washington_branch_20260715",
    create_new: true,
    label: "Webster Avenue Bridge is located over the Port Washington Branch",
    payload: {
      relation_kind: "located_on",
      relation_family: "corridor_scope",
      subject_id: "project_webster-ave-bridge-replacement",
      subject_local_observation_id: "project_webster_ave_bridge_replacement_2025",
      object_local_observation_id: "corridor_lirr_port_washington_branch",
      assertion_status: "implemented",
      description: "The replaced Webster Avenue roadway bridge spans the LIRR Port Washington Branch in Manhasset.",
    },
    evidence_refs: portWashingtonEvidence,
  };

  const modelingGapAdditions = [
    ossiningStation,
    ossiningEventLocationRelation,
    paratransitEvPilot,
    paratransitEvRelation,
    ptmFacilityProject,
    ptmFacilityRelation,
    queensBorough,
    jamaicaDepotLocationRelation,
    sharpProject,
    sharpDepartmentRelation,
    portWashingtonCorridor,
    websterBridgeCorridorRelation,
  ];
  const additions = [
    eastRiverCorridor,
    flatbushCorridor,
    flatbushProjectCorridorRelation,
    flatbushTreatmentCorridorRelation,
    ...modelingGapAdditions,
  ];
  for (const [input, expectedId] of [
    [eastRiverCorridor, EAST_RIVER_CORRIDOR_ID],
    [flatbushCorridor, FLATBUSH_PHASE1_CORRIDOR_ID],
    [flatbushProjectCorridorRelation, FLATBUSH_PROJECT_CORRIDOR_RELATION_ID],
    [flatbushTreatmentCorridorRelation, FLATBUSH_TREATMENT_CORRIDOR_RELATION_ID],
    [ossiningStation, "entity_ossining-station-2024"],
    [ossiningEventLocationRelation, "relation_ossining-event-located-at-station-20260715"],
    [paratransitEvPilot, "project_paratransit-ev-bus-pilot-2024"],
    [paratransitEvRelation, "relation_paratransit-department-has-ev-bus-pilot-20260715"],
    [ptmFacilityProject, "project_ptm-second-queens-facility-2025"],
    [ptmFacilityRelation, "relation_ptm-has-second-queens-facility-project-20260715"],
    [queensBorough, "entity_queens-borough"],
    [jamaicaDepotLocationRelation, "relation_jamaica-bus-depot-located-in-queens-20260715"],
    [sharpProject, "project_dos-sharp-safety-hazards-risk-prevention"],
    [sharpDepartmentRelation, "relation_sharp-program-part-of-department-of-subways-20260715"],
    [portWashingtonCorridor, "corridor_lirr-port-washington-branch"],
    [websterBridgeCorridorRelation, "relation_webster-bridge-located-on-port-washington-branch-20260715"],
  ] as const) {
    const actualId = canonicalRecordIdForInput(input);
    if (actualId !== expectedId) throw new Error(`canonical identity drifted for ${input.local_observation_id}: expected ${expectedId}, found ${actualId}`);
  }

  return [...sourceInputs, splitRelation, ...additions].map(deterministicSubmissionEntry);
}

function correctionBuilder(records: Map<string, MtaCanonicalRecord>) {
  const corrections: SemanticCorrectionEntry[] = [];
  let sequence = 0;
  const add = (
    op: SemanticCorrectionEntry["op"],
    recordId: string,
    patch: JsonObject,
    reason: string,
    guardFields: string[] = [],
    cascade: string[] = [],
  ) => {
    const record = records.get(recordId);
    if (!record) throw new Error(`missing correction target ${recordId}`);
    const payload: JsonObject = {};
    for (const field of guardFields) payload[field] = (record.payload[field] ?? null) as JsonValue;
    sequence += 1;
    corrections.push({
      correction_id: `relationship-integrity-legacy-${String(sequence).padStart(4, "0")}-${recordId.replace(/[^a-z0-9]+/giu, "-")}`,
      op,
      record_id: recordId,
      guards: { payload },
      patch,
      cascade,
      reason,
      source_decision: SOURCE_DECISION,
      reviewed_at: REVIEWED_AT,
      provenance: "human",
    });
  };
  return { corrections, add };
}

function buildCorrections(records: MtaCanonicalRecord[], rawRoot: string): SemanticCorrectionEntry[] {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const kinds = new Map(records.map((record) => [record.record_id, record.record_kind]));
  const { corrections, add } = correctionBuilder(recordsById);
  const suspects = records.filter((record) => isAssignedFamilyShapeSuspect(record, kinds)).sort((a, b) => a.record_id.localeCompare(b.record_id));
  if (suspects.length !== 172) throw new Error(`assigned family-shape inventory drifted: expected 172, found ${suspects.length}`);

  for (const record of suspects) {
    const target = correctedFamily(record, kinds);
    if (!target) continue;
    add(
      "patch_payload",
      record.record_id,
      { set: { relation_family: target } },
      `Endpoint semantics and authoritative relation wording place ${String(record.payload.relation_kind)} in ${target}; the prior family was a shape-incompatible broad bucket.`,
      ["relation_kind", "relation_family", "subject_id", "object_id"],
    );
  }

  const lgaRelations = [
    "relation_rel-lga-served-by-m60",
    "relation_rel-lga-served-by-q33",
    "relation_rel-lga-served-by-q47",
    "relation_rel-lga-served-by-q48",
    "relation_rel-lga-served-by-q72",
  ];
  for (const id of lgaRelations) {
    add("replace_endpoint", id, { field: "object_id", to: "entity_laguardia-airport-2025" }, "The cited source says the route serves LaGuardia Airport; the analysis project was an accidental surrogate endpoint and a canonical airport entity exists.", ["relation_kind", "object_id"]);
    add("patch_payload", id, { set: { object_local_observation_id: "entity_laguardia_airport_2025" } }, "Align local endpoint provenance with the canonical LaGuardia Airport endpoint.", ["object_local_observation_id"]);
  }

  for (const id of [
    "relation_rel-s79-sbs-tsp-route",
    "relation_rel-b44-sbs-tsp-route",
    "relation_rel-m15-sbs-tsp-route",
    "relation_rel-b46-sbs-tsp-route",
    "relation_rel-bx41-sbs-tsp-route",
  ]) {
    add("replace_endpoint", id, { field: "object_id", to: "treatment_tsp" }, "The authoritative TSP report proves that the route had Transit Signal Priority; replace the route self-loop with the canonical TSP treatment component.", ["relation_kind", "object_id"]);
    add("patch_payload", id, { set: { object_local_observation_id: "treatment_component_tsp" } }, "Align local endpoint provenance with the canonical Transit Signal Priority component.", ["object_local_observation_id"]);
  }

  for (const id of FAMILY_RETRACTIONS) {
    add("retract_record", id, {}, "The edge is a canonical self-loop created by endpoint collapse and does not encode the source-backed subject/object roles; its underlying fact remains on the cited canonical record pending a correctly typed counterpart.", ["relation_kind", "subject_id", "object_id"]);
  }

  add("replace_endpoint", "relation_lirr-part-of-mta", { field: "subject_id", to: "entity_annual-report-2021-lirr" }, "The cited relation's local subject and description identify LIRR; canonical entity collapse incorrectly rewrote it to MTA and created a self-loop.", ["relation_kind", "subject_id", "object_id"]);
  add("set_review_state", "relation_lirr-part-of-mta", { review_state: "unreviewed", truth_status: "source_stated" }, "The endpoint repair removes the quarantined self-loop while retaining exact source evidence.", ["relation_kind"]);
  add("replace_endpoint", "relation_metro-north-part-of-mta_4", { field: "subject_id", to: "entity_meeting-doc-124881-mnr" }, "The cited relation's local subject and description identify Metro-North; canonical entity collapse incorrectly rewrote it to MTA and created a self-loop.", ["relation_kind", "subject_id", "object_id"]);
  add("set_review_state", "relation_metro-north-part-of-mta_4", { review_state: "unreviewed", truth_status: "source_stated" }, "The endpoint repair removes the quarantined self-loop while retaining exact source evidence.", ["relation_kind"]);

  add("patch_payload", "relation_meeting-doc-199051-mnr-station-improvements-county-westchester", { set: { relation_kind: "coordinates_with" } }, "The source says early coordination with Westchester County, not an established partnership.", ["relation_kind", "relation_family"]);
  add("patch_payload", "relation_meeting-doc-98321-kawasaki-r211", { set: { description: "Kawasaki Rail Car, Inc. is the manufacturer under Contract R34211 for R211 subway cars, including Option 1." } }, "Preserve the more precise surviving description before folding the duplicate contract edge.", ["description"]);
  add("replace_endpoint", "relation_source-published-by-mta_14", { field: "object_id", to: "entity_mta-metropolitan-transportation-authority" }, "The document header and source metadata name Metropolitan Transportation Authority, not MTA Bus Company, as publisher.", ["relation_kind", "object_id"]);
  add("patch_payload", "relation_source-published-by-mta_14", { set: { object_local_observation_id: "entity_mta_overall" } }, "Align local endpoint provenance with the canonical Metropolitan Transportation Authority publisher.", ["object_local_observation_id"]);

  for (const [removed, survivor] of [...DUPLICATE_MERGES].sort(([a], [b]) => a.localeCompare(b))) {
    add("supersede_record", removed, { survivor_record_id: survivor }, "The two edges encode the same source-backed semantic assertion. Fold all evidence, submissions, source IDs, and local identities into the stable survivor.", ["relation_kind", "subject_id", "object_id"]);
  }

  for (const [id, variant] of Object.entries(RELATIONSHIP_VARIANTS).sort(([a], [b]) => a.localeCompare(b))) {
    add("patch_payload", id, { set: { relationship_variant_key: variant } }, "The shared canonical endpoints hide a distinct source-literal contract, phase, route variant, or physical subsegment; preserve it as an explicit relationship variant rather than merging provenance.", ["relation_kind", "subject_id", "object_id"]);
  }
  for (const [id, phase] of Object.entries(PHASE_VARIANTS).sort(([a], [b]) => a.localeCompare(b))) {
    add("patch_payload", id, { set: { relationship_variant_key: `service_phase:${phase}`, service_phase: phase } }, "The same-date delivered/proposed statuses refer to predecessor Limited and successor SBS phases, not conflicting truth claims.", ["relation_kind", "assertion_status", "as_of_date"]);
  }

  const preciseEvidence: Record<string, MtaEvidenceRef[]> = {
    "relation_cctv-april-meeting": refs(rawRoot, "meeting_doc_205566", [
      ["p001_c0012", "meeting_month"], ["p001_c0013", "agenda_item"], ["p002_c0013", "program_name"], ["p002_c0014", "scheduled_update"],
    ]),
    "relation_mta-published-by": refs(rawRoot, "meeting_doc_179691", [["p001_c0002", "publisher"], ["p001_c0005", "document_title"]]),
    "relation_project-has-treatment-w81-columbus": refs(rawRoot, "brt_m79_cb7_mar2017", [["p020_c0001", "location"], ["p020_c0002", "street_reconfiguration"]]),
    "relation_security-grant-july-meeting": refs(rawRoot, "meeting_doc_205566", [
      ["p001_c0015", "meeting_month"], ["p001_c0016", "agenda_item"], ["p002_c0018", "program_name"], ["p002_c0019", "scheduled_update"],
    ]),
    "relation_spruce-up-2025-event": refs(rawRoot, "meeting_doc_201561", [["p001_c0001", "program_title"], ["p007_c0002", "event_heading"]]),
    "relation_ulsd-hedges-metrics": refs(rawRoot, "meeting_doc_33681", [["p001_b0010", "metric_row"]]),
  };
  for (const [id, evidenceRefs] of Object.entries(preciseEvidence).sort(([a], [b]) => a.localeCompare(b))) {
    add("recite_evidence", id, { evidence_refs: evidenceRefs as unknown as JsonValue }, "Replace a broad page/table span with the exact atomic blocks that support this relationship at its claimed precision.", ["relation_kind", "subject_id", "object_id"]);
  }
  add("retract_record", "relation_part-of-program-project-fuel-hedge-program-2022-project-fuel-hedge-program-2022_2362d3ba6a", {}, "The derived program relation is a project self-loop produced by an exact canonical match; it adds no valid relationship and carries an unnecessarily broad merged evidence set.", ["relation_kind", "subject_id", "object_id"]);

  add("patch_payload", "relation_meeting-doc-131646-nyct-bus-procurement", { set: { _merged_field_values: null } }, "A new uniquely identified has_metric relation preserves the second edge; clear only the stale incompatible merged-edge marker from the original has_claim relation.", ["relation_kind", "object_id", "_merged_field_values"]);

  add("patch_payload", "source_meeting-doc-160631", { set: { description: "MTA Board meeting action items book for December 18, 2024 meeting. Includes meeting agenda, minutes from November 2024 meeting, procurement actions, capital project updates, budget adoption, finance items, and real estate transactions." } }, "Preserve the richer source description before folding the duplicate source identity.", ["description"]);
  add("patch_payload", "source_meeting-doc-170871", { set: { description: "Committee book for the MTA Bridges and Tunnels Committee meeting held April 28, 2025 at 2 Broadway, 23rd Floor, New York, NY 10004" } }, "Preserve the source-backed meeting description before folding the duplicate source identity.", ["title", "date_text"]);
  add("patch_payload", "source_meeting-doc-29966", { set: { description: "All Agencies – Non-Reimbursable Overtime Variance, Reimbursable Overtime Variance, and Total Overtime Variance for January 2021 and Adopted Budget vs. variance" } }, "Preserve the richer source description before folding the duplicate source identity.", ["title", "source_url"]);
  for (const [removed, survivor] of [...SOURCE_DUPLICATE_MERGES].sort(([a], [b]) => a.localeCompare(b))) {
    add("supersede_record", removed, { survivor_record_id: survivor }, "Both source records cite the same staged source ID and authoritative document. Fold provenance into the stable unsuffixed identity.", ["title"]);
  }
  add("retract_record", "source_meeting-doc-85841_2", {}, "This is a literal test submission with payload title/content_type 'test', not a second source document; retain the authoritative unsuffixed source record.", ["title", "content_type"]);

  for (const id of [...EAST_RIVER_OPERATOR_RELATIONS].sort()) {
    add(
      "replace_endpoint",
      id,
      { field: "object_id", to: EAST_RIVER_CORRIDOR_ID },
      "The exact cited block states that the named operator runs trains through the physical East River Tunnels. Replace the construction-project surrogate with the new evidence-backed canonical tunnel corridor.",
      ["relation_kind", "object_id"],
    );
    add(
      "patch_payload",
      id,
      { set: { object_local_observation_id: EAST_RIVER_CORRIDOR_LOCAL_ID } },
      "Align local endpoint provenance with the canonical East River Tunnels corridor observation.",
      ["object_local_observation_id"],
    );
  }
  for (const id of [...EAST_RIVER_OPERATOR_RELATIONS].sort()) {
    add(
      "patch_payload",
      id,
      { set: { relation_kind: "operates_on_corridor", relation_family: "corridor_scope" } },
      "The versioned relationship contract's reviewed entity-to-corridor rule is operates_on_corridor. Use that exact semantic kind instead of relaxing the matrix for the legacy operates_on label.",
      ["relation_kind", "relation_family"],
    );
  }

  add(
    "replace_endpoint",
    "relation_crichlow-department-head",
    { field: "object_id", to: "entity_dept-of-subways-crichlow" },
    "The exact staff-summary table identifies Demetrius Crichlow as Department Head of Subways, not as head of the station-booth proposal. Replace the project surrogate with the canonical Department of Subways entity.",
    ["relation_kind", "object_id"],
  );
  add(
    "patch_payload",
    "relation_crichlow-department-head",
    { set: { object_local_observation_id: null, description: "Demetrius Crichlow is identified as Department Head of Subways in the staff summary." } },
    "Remove the false source-local project reference while preserving the exact source-backed person-to-department role.",
    ["object_local_observation_id", "description"],
  );
  for (const id of [...MODELING_GAP_RELATION_IDS].filter((id) => id !== "relation_crichlow-department-head").sort()) {
    add(
      "retract_record",
      id,
      {},
      id === "relation_meeting-doc-128921-open-stroller-buses"
        ? "The cited block proves fleet and route-count scope but does not make NYC Transit a physical corridor endpoint. Retract the malformed edge; the project and exact source claim remain canonical."
        : "The legacy edge used a claim, agency, project, or route surrogate for a missing typed physical/program/location counterpart. A new source-backed canonical counterpart and relation replace it through the submission journal.",
      ["relation_kind", "subject_id", "object_id"],
    );
  }

  return corrections;
}

function correctionIdsByRecord(corrections: SemanticCorrectionEntry[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const correction of corrections) {
    const ids = result.get(correction.record_id) ?? [];
    ids.push(correction.correction_id);
    result.set(correction.record_id, ids);
  }
  return result;
}

function evidenceIds(records: MtaCanonicalRecord[]): string[] {
  return [...new Set(records.flatMap((record) => record.evidence_refs.map((ref) => ref.evidence_id)))].sort();
}

function evidenceBindings(records: MtaCanonicalRecord[]): Array<{ evidence_id: string; text_sha256: string }> {
  const bindings = new Map<string, string>();
  for (const record of records) {
    for (const ref of record.evidence_refs) bindings.set(ref.evidence_id, ref.text_sha256);
  }
  return [...bindings].map(([evidence_id, text_sha256]) => ({ evidence_id, text_sha256 })).sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
}

function syntheticCorridorRecords(submissions: MtaSubmissionEntry[]): MtaCanonicalRecord[] {
  return submissions
    .filter((entry) => entry.tool_args.observation_kind === "corridor")
    .map((entry) => {
      const input = entry.tool_args;
      return {
        record_id: canonicalRecordIdForInput(input),
        record_kind: "corridor",
        source_id: input.source_id,
        source_ids: [input.source_id],
        local_observation_id: input.local_observation_id,
        local_observation_ids: [input.local_observation_id],
        display_name: input.label ?? input.local_observation_id,
        ...(input.raw_text ? { raw_text: input.raw_text } : {}),
        payload: input.payload,
        evidence_refs: input.evidence_refs ?? [],
        submission_ids: [entry.submission_id],
        truth_status: "source_stated",
        review_state: "unreviewed",
        generated_at: REVIEWED_AT,
      } satisfies MtaCanonicalRecord;
    });
}

function buildLedger(records: MtaCanonicalRecord[], corrections: SemanticCorrectionEntry[], submissions: MtaSubmissionEntry[]): LedgerEntry[] {
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const kinds = new Map(records.map((record) => [record.record_id, record.record_kind]));
  const correctionIds = correctionIdsByRecord(corrections);
  const relationRecords = records.filter((record) => record.record_kind === "relation");
  const suspects = relationRecords.filter((record) => isAssignedFamilyShapeSuspect(record, kinds)).sort((a, b) => a.record_id.localeCompare(b.record_id));
  const eastRiverSubmission = submissions.find((entry) => entry.tool_args.local_observation_id === EAST_RIVER_CORRIDOR_LOCAL_ID);
  if (!eastRiverSubmission) throw new Error("missing East River Tunnels corridor submission");
  const splitRelationSubmission = submissions.find((entry) => entry.tool_args.local_observation_id === "relation_meeting_doc_131646_nyct_bus_procurement_metric_split_20260715");
  if (!splitRelationSubmission) throw new Error("missing split procurement metric relation submission");
  const eastRiverRecord = syntheticCorridorRecords([eastRiverSubmission])[0]!;
  const ledger: LedgerEntry[] = [];

  for (const record of suspects) {
    const targetFamily = correctedFamily(record, kinds);
    const correctedEndpoint = [
      "relation_rel-lga-served-by-m60", "relation_rel-lga-served-by-q33", "relation_rel-lga-served-by-q47", "relation_rel-lga-served-by-q48", "relation_rel-lga-served-by-q72",
      "relation_rel-s79-sbs-tsp-route", "relation_rel-b44-sbs-tsp-route", "relation_rel-m15-sbs-tsp-route", "relation_rel-b46-sbs-tsp-route", "relation_rel-bx41-sbs-tsp-route",
    ].includes(record.record_id) || EAST_RIVER_OPERATOR_RELATIONS.has(record.record_id);
    const eastRiverRepair = EAST_RIVER_OPERATOR_RELATIONS.has(record.record_id);
    const modelingGapRemediation = MODELING_GAP_RELATION_IDS.has(record.record_id);
    const modelingAdditions = MODELING_GAP_ADDITIONS_BY_RELATION[record.record_id] ?? [];
    const modelingSubmissions = modelingAdditions.map(({ local_id }) => {
      const entry = submissions.find((candidate) => candidate.tool_args.local_observation_id === local_id);
      if (!entry) throw new Error(`missing typed counterpart submission ${local_id} for ${record.record_id}`);
      return entry;
    });
    const modelingEvidenceBindings = [...new Map([
      ...record.evidence_refs.map((ref) => [ref.evidence_id, ref.text_sha256] as const),
      ...modelingSubmissions.flatMap((entry) => (entry.tool_args.evidence_refs ?? []).map((ref) => [ref.evidence_id, ref.text_sha256] as const)),
    ]).entries()].map(([evidence_id, text_sha256]) => ({ evidence_id, text_sha256 })).sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
    const primary = modelingGapRemediation
      ? record.record_id === "relation_meeting-doc-128921-open-stroller-buses"
        ? "retracted_evidence_invalid_relation"
        : record.record_id === "relation_crichlow-department-head"
          ? "corrected_canonical_endpoint"
          : "modeled_typed_counterpart"
      : targetFamily
      ? "corrected_relation_family"
      : correctedEndpoint
        ? "corrected_canonical_endpoint"
        : FAMILY_RETRACTIONS.has(record.record_id)
          ? "retracted_malformed_self_loop"
          : VALID_FAMILY_SHAPE_EXCEPTIONS.has(record.record_id)
            ? "retained_semantically_valid_family"
            : "investigated_endpoint_modeling_gap";
    ledger.push({
      item_id: `family-shape:${record.record_id}`,
      category: "provisional_family_shape_suspect",
      primary_disposition: primary,
      reasons: modelingGapRemediation
        ? record.record_id === "relation_meeting-doc-128921-open-stroller-buses"
          ? ["exact_evidence_does_not_support_existing_endpoint_or_family", "underlying_project_claim_preserved"]
          : record.record_id === "relation_crichlow-department-head"
            ? ["proved_existing_department_endpoint", "false_project_surrogate_removed"]
            : ["authoritative_typed_counterpart_modeled", "legacy_surrogate_edge_replaced"]
        : targetFamily
        ? ["source_semantics_support_family_change"]
        : correctedEndpoint
          ? eastRiverRepair
            ? ["authoritative_physical_corridor_modeled", "existing_exact_operates_on_corridor_rule"]
            : ["proved_existing_canonical_endpoint"]
          : FAMILY_RETRACTIONS.has(record.record_id)
            ? ["canonical_collapse_created_self_loop"]
            : VALID_FAMILY_SHAPE_EXCEPTIONS.has(record.record_id)
              ? ["family_semantics_valid_despite_endpoint_shape"]
              : ["required_counterpart_record_not_canonically_modeled"],
      record_ids: modelingGapRemediation
        ? [record.record_id, ...modelingAdditions.map(({ record_id }) => record_id)].sort()
        : eastRiverRepair
          ? [record.record_id, EAST_RIVER_CORRIDOR_ID]
          : [record.record_id],
      evidence_ids: modelingGapRemediation
        ? modelingEvidenceBindings.map((binding) => binding.evidence_id)
        : evidenceIds(eastRiverRepair ? [record, eastRiverRecord] : [record]),
      ...(modelingGapRemediation
        ? { evidence_bindings: modelingEvidenceBindings }
        : eastRiverRepair
          ? { evidence_bindings: evidenceBindings([record, eastRiverRecord]) }
          : {}),
      correction_ids: correctionIds.get(record.record_id) ?? [],
      ...(modelingGapRemediation && modelingSubmissions.length > 0
        ? { submission_ids: modelingSubmissions.map((entry) => entry.submission_id).sort() }
        : eastRiverRepair
          ? { submission_ids: [eastRiverSubmission.submission_id] }
          : {}),
      investigation: modelingGapRemediation
        ? record.record_id === "relation_meeting-doc-128921-open-stroller-buses"
          ? "The official paragraph was read at exact block precision. It supports expansion to more than 1,000 buses across 57 routes, but it does not make NYC Transit a corridor or physical endpoint; the malformed edge is retracted without manufacturing 57 route bindings."
          : record.record_id === "relation_crichlow-department-head"
            ? "The official staff-summary table explicitly pairs Department Subways with Department Head Demetrius Crichlow. The canonical Department of Subways already exists, so the project surrogate is replaced and the source-local project reference is removed."
            : "The exact official block and neighboring identity block were inspected. A dedicated typed physical, location, or program record and a new evidence-bound relation replace the legacy surrogate edge; no route, geographic extent, or operational status is inferred beyond the source literal."
        : targetFamily
        ? `Relation wording and endpoint roles support ${targetFamily}; no endpoint identity was inferred from proximity or names.`
        : correctedEndpoint
          ? eastRiverRepair
            ? "The exact official block identifies the physical East River Tunnels and the named train operator. A dedicated corridor observation is added, then both canonical and local object endpoints are replaced without inferring extent, routes, or geography."
            : "The exact cited claim resolves to an already canonical airport or TSP endpoint; both record and local endpoint references are corrected."
          : FAMILY_RETRACTIONS.has(record.record_id)
            ? "The edge points from a record to itself after canonical collapse and cannot preserve the source's distinct roles. The underlying source-backed fields remain on the canonical record."
            : VALID_FAMILY_SHAPE_EXCEPTIONS.has(record.record_id)
              ? "The family describes the relation semantics; endpoint type alone is not evidence of a family error."
              : "Source and canonical records were inspected, but the required physical/location/claim/organization counterpart is not represented as a provably identical canonical record. No surrogate endpoint was invented.",
    });
  }

  const exactGroups = new Map<string, MtaCanonicalRecord[]>();
  for (const record of relationRecords) {
    const key = exactSemanticKey(record);
    const group = exactGroups.get(key) ?? [];
    group.push(record);
    exactGroups.set(key, group);
  }
  const duplicateGroups = [...exactGroups.values()].filter((group) => group.length > 1).sort((a, b) => a[0]!.record_id.localeCompare(b[0]!.record_id));
  if (duplicateGroups.length !== 22 || duplicateGroups.some((group) => group.length !== 2)) {
    throw new Error(`exact semantic duplicate inventory drifted: expected 22 pairs, found ${duplicateGroups.length} groups`);
  }
  for (const group of duplicateGroups) {
    const ids = group.map((record) => record.record_id).sort();
    const removed = ids.find((id) => DUPLICATE_MERGES.has(id));
    const agencyCollapse = ids.includes("relation_lirr-part-of-mta") && ids.includes("relation_metro-north-part-of-mta_4");
    ledger.push({
      item_id: `exact-semantic:${ids.join("+")}`,
      category: "exact_semantic_duplicate_group",
      primary_disposition: removed ? "merged_duplicate_identity" : agencyCollapse ? "repaired_collapsed_agency_endpoints" : "retained_explicit_distinct_variants",
      reasons: [removed ? "same_assertion_same_evidence" : agencyCollapse ? "different_agencies_collapsed_to_mta" : "source_literal_phase_scope_or_contract_differs"],
      record_ids: ids,
      evidence_ids: evidenceIds(group),
      correction_ids: ids.flatMap((id) => correctionIds.get(id) ?? []).sort(),
      investigation: removed
        ? `The duplicate is folded into ${DUPLICATE_MERGES.get(removed)} with provenance-preserving supersession.`
        : agencyCollapse
          ? "The descriptions and local identities prove distinct LIRR and Metro-North subjects; both self-loops are repaired to canonical agency endpoints."
          : "The common canonical endpoints hide a different contract feature, service phase, route surface, or bounded physical subsegment. A machine-readable relationship_variant_key preserves the distinction.",
    });
  }

  for (const [index, ids] of [
    ["relation_b46-limited-on-corridor", "relation_b46-sbs-on-corridor"],
    ["relation_limited-operates-on-corridor", "relation_sbs-operates-on-corridor"],
  ].entries()) {
    const group = ids.map((id) => byId.get(id)!);
    ledger.push({
      item_id: `same-date-lifecycle:${index + 1}`,
      category: "same_date_lifecycle_status_group",
      primary_disposition: "retained_phase_parallel_assertions",
      reasons: ["predecessor_limited_delivered", "successor_sbs_proposed"],
      record_ids: [...ids],
      evidence_ids: evidenceIds(group),
      correction_ids: ids.flatMap((id) => correctionIds.get(id) ?? []).sort(),
      investigation: "The same-day official presentation describes currently delivered B46 Limited service and separately proposed B46 SBS service. Explicit service_phase keys make the distinction enforceable.",
    });
  }

  const merged = byId.get("relation_meeting-doc-131646-nyct-bus-procurement")!;
  ledger.push({
    item_id: "merged-edge:relation_meeting-doc-131646-nyct-bus-procurement",
    category: "merged_edge_conflict",
    primary_disposition: "split_into_two_canonical_edges",
    reasons: ["has_claim_and_has_metric_are_distinct_edges", "unique_local_identity_prevents_remerge"],
    record_ids: [merged.record_id, "relation_meeting_doc_131646_nyct_bus_procurement_metric_split_20260715"],
    evidence_ids: evidenceIds([merged]),
    correction_ids: correctionIds.get(merged.record_id) ?? [],
    investigation: `The original has_claim edge remains. Submission ${splitRelationSubmission.submission_id} adds the missing has_metric edge with a unique local identity; only stale conflict metadata is cleared.`,
  });

  const mismatch = byId.get("relation_mta-parent-lirr-subsidiary")!;
  ledger.push({
    item_id: "local-endpoint:relation_mta-parent-lirr-subsidiary",
    category: "local_endpoint_membership_mismatch",
    primary_disposition: "merged_into_correct_local_identity_survivor",
    reasons: ["duplicate_edge", "subject_local_belongs_to_survivor"],
    record_ids: [mismatch.record_id, "relation_mta-subsidiary-lirr"],
    evidence_ids: evidenceIds([mismatch]),
    correction_ids: correctionIds.get(mismatch.record_id) ?? [],
    investigation: "The malformed duplicate used a source local ID as its relation subject. Supersession preserves its evidence while the survivor carries the canonical MTA entity local ID.",
  });

  for (const id of BROAD_EVIDENCE_RELATIONS) {
    const record = byId.get(id)!;
    const primary = id === "relation_ulsd-hedges-claim-budget"
      ? "retained_necessary_multirow_evidence"
      : id.includes("part-of-program-project-fuel-hedge")
        ? "retracted_invalid_derived_self_loop"
        : "recited_to_exact_atomic_blocks";
    ledger.push({
      item_id: `broad-evidence:${id}`,
      category: "broad_evidence_span_review",
      primary_disposition: primary,
      reasons: [primary === "retained_necessary_multirow_evidence" ? "claim_compares_full_23_row_time_series" : primary === "retracted_invalid_derived_self_loop" ? "derived_exact_match_self_loop" : "exact_supporting_blocks_identified"],
      record_ids: [id],
      evidence_ids: evidenceIds([record]),
      correction_ids: correctionIds.get(id) ?? [],
      investigation: primary === "retained_necessary_multirow_evidence"
        ? "The claim explicitly compares forecast prices across all 23 monthly rows; the range is broad but not over-broad."
        : primary === "retracted_invalid_derived_self_loop"
          ? "The edge is a derived project-to-itself relation, so citation narrowing would preserve an invalid assertion."
          : "The raw staged source was inspected and the relation is recited to only the title/date/agenda/metric blocks needed for its exact assertion.",
    });
  }

  for (const entry of submissions.slice(0, 5)) {
    ledger.push({
      item_id: `missing-source:${entry.tool_args.source_id}`,
      category: "missing_source_registry_identity",
      primary_disposition: "backfilled_authoritative_source_observation",
      reasons: ["staged_metadata_and_blocks_pinned", "existing_records_and_evidence_reference_source"],
      record_ids: [`source_${entry.tool_args.source_id.replace(/_/gu, "-")}`],
      evidence_ids: entry.tool_args.evidence_refs?.map((ref) => String(ref.evidence_id)).sort() ?? [],
      correction_ids: [],
      investigation: `The staged official source metadata and exact title/date blocks support a valid source observation in submission ${entry.submission_id}.`,
    });
  }

  for (const [removed, survivor] of [...SOURCE_DUPLICATE_MERGES, ["source_meeting-doc-85841_2", "source_meeting-doc-85841"] as const].sort(([a], [b]) => a.localeCompare(b))) {
    const record = byId.get(removed)!;
    const junk = removed.endsWith("85841_2");
    ledger.push({
      item_id: `duplicate-source:${removed}`,
      category: "duplicate_source_registry_identity",
      primary_disposition: junk ? "retracted_test_submission" : "merged_same_document_identity",
      reasons: [junk ? "literal_test_payload" : "same_source_id_same_document"],
      record_ids: [removed, survivor],
      evidence_ids: evidenceIds([record]),
      correction_ids: correctionIds.get(removed) ?? [],
      investigation: junk
        ? "The suffixed row contains only raw_text/title/content_type 'test'; the authoritative source row remains."
        : "Titles, source IDs, dates, publishers, and cited document blocks match. Richer payload fields are copied to the stable base before provenance-preserving supersession.",
    });
  }

  return ledger.sort((a, b) => a.item_id.localeCompare(b.item_id));
}

function dispositionCounts(ledger: LedgerEntry[]): JsonObject {
  const result: Record<string, number> = {};
  for (const entry of ledger) result[entry.primary_disposition] = (result[entry.primary_disposition] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function buildCampaign(rawRoot: string): Campaign {
  for (const [relativePath, hash] of Object.entries(PINNED_FILES)) assertPinned(join(repoRoot, relativePath), hash);
  for (const [sourceId, hashes] of Object.entries(PINNED_RAW_FILES)) {
    assertPinned(join(rawRoot, sourceId, "metadata.json"), hashes.metadata);
    assertPinned(join(rawRoot, sourceId, "blocks.jsonl"), hashes.blocks);
  }
  const records = readCanonicalRecordsFromJsonl();
  const submissions = buildSubmissions(rawRoot);
  const corrections = buildCorrections(records, rawRoot);
  const submittedCorridors = syntheticCorridorRecords(submissions);
  const baselineIds = new Set(records.map((record) => record.record_id));
  for (const corridor of submittedCorridors) {
    if (baselineIds.has(corridor.record_id)) throw new Error(`new corridor observation collides with baseline canonical record ${corridor.record_id}`);
  }
  const simulation = withSemanticCorrections([...records, ...submittedCorridors], corrections);
  if (simulation.summary.skipped !== 0 || simulation.issues.length !== 0) {
    throw new Error(`correction simulation skipped ${simulation.summary.skipped}: ${simulation.issues.map((issue) => issue.message).join("; ")}`);
  }
  const ledger = buildLedger(records, corrections, submissions);
  if (ledger.length !== 216) throw new Error(`exclusive ledger drifted: expected 216 items, found ${ledger.length}`);
  const relationCountBefore = records.filter((record) => record.record_kind === "relation").length;
  const sourceCountBefore = records.filter((record) => record.record_kind === "source").length;
  const corridorCountBefore = records.filter((record) => record.record_kind === "corridor").length;
  const relationCountAfterCorrections = simulation.records.filter((record) => record.record_kind === "relation").length;
  const sourceCountAfterCorrections = simulation.records.filter((record) => record.record_kind === "source").length;
  const additionEntries = submissions.filter((entry) => [
    EAST_RIVER_CORRIDOR_LOCAL_ID,
    FLATBUSH_PHASE1_CORRIDOR_LOCAL_ID,
    FLATBUSH_PROJECT_CORRIDOR_RELATION_LOCAL_ID,
    FLATBUSH_TREATMENT_CORRIDOR_RELATION_LOCAL_ID,
  ].includes(entry.tool_args.local_observation_id) || MODELING_GAP_ADDITION_LOCAL_IDS.has(entry.tool_args.local_observation_id));
  const canonicalAdditionIdsByLocalId = new Map(additionEntries.map((entry) => [
    entry.tool_args.local_observation_id,
    canonicalRecordIdForInput(entry.tool_args),
  ]));
  const canonicalAdditions = additionEntries.map((entry) => ({
    record_id: canonicalRecordIdForInput(entry.tool_args),
    record_kind: entry.tool_args.observation_kind,
    submission_id: entry.submission_id,
    evidence_bindings: (entry.tool_args.evidence_refs ?? []).map((ref) => ({ evidence_id: ref.evidence_id, text_sha256: ref.text_sha256 })),
    ...(entry.tool_args.observation_kind === "relation" ? {
      relation_kind: entry.tool_args.payload.relation_kind,
      relation_family: entry.tool_args.payload.relation_family,
      subject_id: entry.tool_args.payload.subject_id ??
        canonicalAdditionIdsByLocalId.get(String(entry.tool_args.payload.subject_local_observation_id ?? "")) ?? null,
      object_id: entry.tool_args.payload.object_id ??
        canonicalAdditionIdsByLocalId.get(String(entry.tool_args.payload.object_local_observation_id ?? "")) ?? null,
    } : {}),
  }));
  const relationSubmissionCount = submissions.filter((entry) => entry.tool_args.observation_kind === "relation").length;
  const corridorSubmissionCount = submissions.filter((entry) => entry.tool_args.observation_kind === "corridor").length;
  const projectSubmissionCount = submissions.filter((entry) => entry.tool_args.observation_kind === "project").length;
  const entitySubmissionCount = submissions.filter((entry) => entry.tool_args.observation_kind === "entity").length;
  const summary: JsonObject = {
    schema_version: 1,
    reviewed_at: REVIEWED_AT,
    pinned_corpus: PINNED_FILES,
    pinned_raw_sources: PINNED_RAW_FILES as unknown as JsonValue,
    inventory: {
      ledger_items: ledger.length,
      provisional_family_shape_suspects: 172,
      exact_semantic_duplicate_groups: 22,
      same_date_lifecycle_groups: 2,
      merged_edge_conflicts: 1,
      local_endpoint_membership_mismatches: 1,
      broad_evidence_span_reviews: 8,
      missing_source_registry_identities: 5,
      duplicate_source_registry_identities: 5,
    },
    remediation: {
      semantic_corrections: corrections.length,
      submission_entries: submissions.length,
      source_backfills: 5,
      split_relation_additions: 1,
      physical_corridor_additions: corridorSubmissionCount,
      physical_scope_relation_additions: submissions.filter((entry) =>
        entry.tool_args.observation_kind === "relation" && entry.tool_args.payload.relation_family === "corridor_scope").length,
      typed_modeling_gap_record_additions: corridorSubmissionCount + projectSubmissionCount + entitySubmissionCount - 2,
      typed_modeling_gap_relation_additions: 6,
      correction_apply_summary: simulation.summary as unknown as JsonValue,
      disposition_counts: dispositionCounts(ledger),
      canonical_additions: canonicalAdditions as unknown as JsonValue,
    },
    projected_materialized_counts: {
      relation_records_before: relationCountBefore,
      relation_records_after_corrections: relationCountAfterCorrections,
      relation_records_after_split_submission: relationCountAfterCorrections + 1,
      relation_records_after_all_submissions: relationCountAfterCorrections + relationSubmissionCount,
      source_records_before: sourceCountBefore,
      source_records_after_corrections: sourceCountAfterCorrections,
      source_records_after_backfills: sourceCountAfterCorrections + 5,
      corridor_records_before: corridorCountBefore,
      corridor_records_after_additions: corridorCountBefore + corridorSubmissionCount,
      project_records_after_additions: records.filter((record) => record.record_kind === "project").length + projectSubmissionCount,
      entity_records_after_additions: records.filter((record) => record.record_kind === "entity").length + entitySubmissionCount,
      missing_source_registry_identities_after: 0,
      duplicate_source_registry_identities_after: 0,
    },
  };
  return { corrections, submissions, ledger, summary };
}

function markdownReport(campaign: Campaign): string {
  const inventory = campaign.summary.inventory as JsonObject;
  const projected = campaign.summary.projected_materialized_counts as JsonObject;
  const remediation = campaign.summary.remediation as JsonObject;
  const dispositions = remediation.disposition_counts as JsonObject;
  const additions = remediation.canonical_additions as JsonObject[];
  const unresolved = Number(dispositions.investigated_endpoint_modeling_gap ?? 0);
  return [
    "# Legacy relationship integrity remediation",
    "",
    `Pinned review time: \`${REVIEWED_AT}\``,
    "",
    "This campaign actively investigated every assigned legacy item. The JSONL ledger gives one exclusive primary disposition per item and non-exclusive reason codes. Source-backed distinctions are preserved; no street-name similarity, proximity, or unsupported route inference is used.",
    "",
    "## Inventory",
    "",
    ...Object.entries(inventory).map(([key, value]) => `- ${key}: ${String(value)}`),
    "",
    "## Primary dispositions",
    "",
    ...Object.entries(dispositions).map(([key, value]) => `- ${key}: ${String(value)}`),
    "",
    "## Projected materialized counts",
    "",
    ...Object.entries(projected).map(([key, value]) => `- ${key}: ${String(value)}`),
    "",
    "## Evidence-backed canonical additions",
    "",
    ...additions.map((addition) => `- ${String(addition.record_kind)} \`${String(addition.record_id)}\` via \`${String(addition.submission_id)}\``),
    "",
    "## Reproduction",
    "",
    "```bash",
    "bun scripts/remediate-legacy-relationship-integrity.ts --check",
    "bun scripts/remediate-legacy-relationship-integrity.ts --apply",
    "bun run materialize",
    "bun test packages/pipeline/test/records/legacy-relationship-remediation.test.ts",
    "bun run validate",
    "```",
    "",
    unresolved === 0
      ? "All assigned family-shape modeling gaps are closed through an existing proved endpoint, a newly modeled typed counterpart, or retraction of an evidence-invalid relation. No unresolved surrogate endpoints remain in this ledger."
      : `${unresolved} unresolved family-shape dispositions remain. Each exact source assertion was investigated, but a required counterpart record was not canonically modeled. Those rows receive no fabricated surrogate endpoint and remain visible in the ledger for the enforcement migration.`,
    "",
  ].join("\n");
}

function writeExact(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const current = readFileSync(path, "utf8");
    if (current === content) return;
  }
  writeFileSync(path, content, "utf8");
}

function applyCampaign(campaign: Campaign): void {
  const existing = readSemanticCorrections();
  const existingById = new Map(existing.map((entry) => [entry.correction_id, entry]));
  const additions: SemanticCorrectionEntry[] = [];
  for (const correction of campaign.corrections) {
    const prior = existingById.get(correction.correction_id);
    if (prior && stableJson(prior as unknown as JsonValue) !== stableJson(correction as unknown as JsonValue)) {
      throw new Error(`existing correction ${correction.correction_id} differs from deterministic campaign output`);
    }
    if (!prior) additions.push(correction);
  }
  if (additions.length > 0) {
    const current = readFileSync(semanticCorrectionsPath(), "utf8");
    const suffix = additions.map((entry) => JSON.stringify(entry)).join("\n");
    writeExact(semanticCorrectionsPath(), `${current.replace(/\s*$/u, "")}\n${suffix}\n`);
  }
  writeExact(JOURNAL_PATH, `${campaign.submissions.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  writeExact(join(ARTIFACT_ROOT, "ledger.jsonl"), `${campaign.ledger.map((entry) => stableJson(entry as unknown as JsonValue)).join("\n")}\n`);
  writeExact(join(ARTIFACT_ROOT, "summary.json"), `${JSON.stringify(campaign.summary, null, 2)}\n`);
  writeExact(join(ARTIFACT_ROOT, "README.md"), markdownReport(campaign));
}

export function buildLegacyRelationshipCampaign(rawRoot = DEFAULT_RAW_ROOT): Campaign {
  return buildCampaign(rawRoot);
}

if (import.meta.main) {
  const apply = process.argv.includes("--apply");
  const rawRootArg = process.argv.find((arg) => arg.startsWith("--raw-root="));
  const rawRoot = rawRootArg?.slice("--raw-root=".length) || DEFAULT_RAW_ROOT;
  const campaign = buildCampaign(rawRoot);
  if (apply) applyCampaign(campaign);
  process.stdout.write(`${JSON.stringify({ mode: apply ? "apply" : "check", corrections: campaign.corrections.length, submissions: campaign.submissions.length, ledger_items: campaign.ledger.length, summary: campaign.summary.projected_materialized_counts }, null, 2)}\n`);
}
