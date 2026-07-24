import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type {
  MemberExtentLedgerRow,
  MemberGrainLedgerRow,
} from "./member-extent-ledger.js";
import type { Plan040Package8VersionSeparation } from "./plan040-qbnr-service-pattern-package8.js";

export const PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A =
  "plan-040-qbnr-service-pattern-package-10a-evidence-only-v1" as const;
export const PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256 =
  "868c628146a741f67e0438437d72154b03e0428a503bf704b22e7101f81a636a" as const;

export const PLAN040_PACKAGE_10A_CANDIDATES = [
  ["Q51", "treatment_q51-east-west-link-2025"],
  ["Q74", "treatment_q74-college-forest-hills-connection-2025"],
  ["Q115", "treatment_q115-all-day-frequent-service-2025"],
  ["QM65", "treatment_qm65-laurelton-downtown-connection-2025"],
] as const;

export type Plan040Package10aRouteId =
  (typeof PLAN040_PACKAGE_10A_CANDIDATES)[number][0];
export type Plan040Package10aTreatmentId =
  (typeof PLAN040_PACKAGE_10A_CANDIDATES)[number][1];

export const PLAN040_PACKAGE_10A_POST_P9_PINS = {
  extent_ledger:
    "0e0deeef8166f085ae1a68f4d1788facb6801775b8b134323fe8275a5b99543b",
  grain_ledger:
    "ad84dd5bcb7d526a2a275748f89a2ff8cbff8d51df87e01d97ba995732a5185f",
  bridge:
    "39b6749ba129bb78acd84117a08087fe409b1b000911914ee6419a13cb82c2f5",
  study_manifest:
    "889e79e4729e2159c187044bcdc47e44cdbd1f4b4b0f1b89c22d125abfdd0a7c",
  package_9: {
    evidence:
      "376a3e9f184a24530d344eea0f53842fabce2e83ab2eb12b21bc59fd7ee10a7c",
    draft:
      "a35e7baa10736e65ee432394313dde58a790c2184015920df613d573e8628481",
    gate:
      "84ff903ffdb6b4b69e5c03ebb7ed8cf6e53b284ebf635704007bcdef93d42907",
    acceptance:
      "13e5d18a32d6d658d08d34d1e3f30de2432abd7e47af23ea25e018e5badf5ae1",
    extent_decisions:
      "7cbd08441f40bf095a9ac9911b3429c40b52cd0c752c8f134ef7bdfdaec1fff7",
    grain_decisions:
      "e9ace85279043ad384651da4ecf15dc52c27d84df2978c5455e63600c6a5bbc9",
    absence_receipt:
      "3301f2d0e3c33199c59f6a7a3e5e93daa29ff16ff55e060cc43d2ba4a9ada3d8",
  },
  service_change_html:
    "4b5dc9ca398980a3803e076378acefd7ac3ec04343e0ac32db95a17c1d51226d",
  treatment_components:
    "a9b76c3b7121fc87d0f190a44fb00f182229d8d309968d3ba00a8c27a1492bae",
  main_schedule_source:
    "c592686da8a1cabdc8b559db4d4ae15d5a663adbe08f332e196215fd377be7c5",
  package_8_feed_identity_artifact:
    "3ee567af00c9eab1a50b823674cddc36f554a475b7e485f0fab3cd257858c192",
} as const;

export const PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS = {
  pre: {
    boundary: "pre",
    source_id: "gtfs_static_20250625_busco_pre_qbnr",
    receipt_path:
      "raw/sources/gtfs_static_20250625_busco_pre_qbnr/receipt.json",
    receipt_sha256:
      "de2d6e8c9a5cf700b0bee32e53634f1d2b984a8c3b8e41b51f84991cb3b7cae9",
    zip_sha1: "a52f278150cd9bc03082f76fccd57f1c8c331d3c",
    zip_sha256:
      "eb4fd60a8dfa63bac5e4cd3204e61b48420b474724cac708d115615e547ff3e1",
  },
  post: {
    boundary: "post",
    source_id: "gtfs_static_20250626_busco_post_qbnr",
    receipt_path:
      "raw/sources/gtfs_static_20250626_busco_post_qbnr/receipt.json",
    receipt_sha256:
      "3315b84e194d8fb6c0efeed5c9342d54113c19a0ea5fe0111c76e336d61a054d",
    zip_sha1: "54653b3fafb5fabc5ab1c941780b871343138440",
    zip_sha256:
      "7d0e5651d5cc5c3ac86973dc664e16a05e9245bea156f566c39e71506128670e",
  },
} as const;

export const PLAN040_PACKAGE_10A_EXACT_STATEMENTS = {
  "treatment_q51-east-west-link-2025": {
    evidence_id:
      "mta_queens_bus_network_redesign_service_changes#p001_b0056",
    block_id: "p001_b0056",
    block_sha256:
      "sha256:a38748bb0d65570b019bfe7e6e1b245e81964f59cfd9263be0f9a19ed8fcb9de",
    raw_text:
      "The Q51 will provide a new east-west link along Linden Blvd between Cambria Heights and Ozone Park.",
  },
  "treatment_q74-college-forest-hills-connection-2025": {
    evidence_id:
      "mta_queens_bus_network_redesign_service_changes#p001_b0074",
    block_id: "p001_b0074",
    block_sha256:
      "sha256:21769fdf067b083292505e1dfbcf26f9b78bb20c99b593821362afb9dad6267e",
    raw_text:
      "The new Q74 will connect Queensborough Community College to Forest Hills via Horace Harding Expwy and Jewel Av.",
  },
  "treatment_q115-all-day-frequent-service-2025": {
    evidence_id:
      "mta_queens_bus_network_redesign_service_changes#p001_b0099",
    block_id: "p001_b0099",
    block_sha256:
      "sha256:18b96215314925733e491dae6e4db6949ec2fd01425bda6e7133f112f9a46deb",
    raw_text:
      "The new Q115 will provide all-day frequent service along the Guy R. Brewer Blvd corridor between Jamaica and Springfield Gardens.",
  },
  "treatment_qm65-laurelton-downtown-connection-2025": {
    evidence_id:
      "mta_queens_bus_network_redesign_service_changes#p001_b0133",
    block_id: "p001_b0133",
    block_sha256:
      "sha256:c5f16ff3669873fefa3221ddf1e65dc3c0fe8d30f1680a1537bda42e13fba1d1",
    raw_text:
      "The new QM65 will connect Laurelton to Downtown Manhattan via Rochdale and South Jamaica.",
  },
} as const;

export const PLAN040_PACKAGE_10A_EXCLUSION_SCOPES = {
  risk_12: {
    treatment_ids: [
      "treatment_q82-belmont-jamaica-connection-2025",
      "treatment_q82-q110-hempstead-replacement-2025",
      "treatment_q82-q36-212-replacement-2025",
      "treatment_q39-northern-turnaround-2025",
      "treatment_q89-q85-green-acres-replacement-2025",
      "treatment_q58-limited-discontinuation-2025",
      "treatment_q14-segment-combination-2025",
      "treatment_q20-college-point-jamaica-connection-2025",
      "treatment_q20-jamaica-avenue-approach-2025",
      "treatment_q20-q20b-replacement-2025",
      "treatment_q90-q48-laguardia-replacement-2025",
      "treatment_q98-flushing-ridgewood-connection-2025",
    ],
    candidate_count: 12,
    candidate_key_sha256:
      "995231a16ac9e2b04575e94790fa30e990fe35431c3a50ca4753a5187f5e8ecb",
  },
  q67: {
    treatment_ids: ["treatment_q67-court-square-terminal-2025"],
    candidate_count: 1,
    candidate_key_sha256:
      "0839dcd8540add7e2065ff6027492dcc13f70442b149da5a0fae16ef7fb4ea24",
  },
  q48_q75: {
    treatment_ids: [
      "treatment_q48-glen-oaks-branch-2025",
      "treatment_q75-q30-short-trip-replacement-2025",
    ],
    candidate_count: 2,
    candidate_key_sha256:
      "9e9184a961b11ade5bc8ed1ce1f6d65818b2cad7fc9f62535012faa302f53b5c",
  },
} as const;

export type Plan040Package10aCalendarExpansion = {
  policy: "calendar_plus_calendar_dates";
  service_date: string;
  weekday: string;
  base_service_ids: string[];
  exception_added_service_ids: string[];
  exception_removed_service_ids: string[];
  active_service_ids: string[];
  active_service_id_sha256: string;
};

export type Plan040Package10aInventorySlice = {
  boundary: "pre" | "post";
  feed_family: "busco";
  source_id:
    | "gtfs_static_20250625_busco_pre_qbnr"
    | "gtfs_static_20250626_busco_post_qbnr";
  receipt_path: string;
  receipt_sha256: string;
  zip_sha1: string;
  source_zip_sha256: string;
  target_date: string;
  route_id: Plan040Package10aRouteId;
  route_row_count: number;
  all_route_trip_count: number;
  calendar_expansion: Plan040Package10aCalendarExpansion;
  active_route_trip_count: number;
  active_direction_counts: Record<string, number>;
  active_shape_ids: string[];
  active_shape_count: number;
  active_trip_id_sha256: string;
};

export type Plan040Package10aPostPattern = {
  pattern_id: string;
  direction_id: string;
  shape_ids: string[];
  trip_count: number;
  trip_id_sha256: string;
  stop_count: number;
  stop_ids: string[];
  stop_chain_sha256: string;
};

export type Plan040Package10aCandidateEvidence = {
  candidate_key: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: Plan040Package10aTreatmentId;
  treatment_family: "service_pattern";
  gtfs_route_id: Plan040Package10aRouteId;
  source_statement: {
    source_id: "mta_queens_bus_network_redesign_service_changes";
    evidence_id: string;
    block_id: string;
    block_sha256: string;
    raw_text: string;
    names_predecessor_route: false;
  };
  source_row: {
    source_html_sha256:
      typeof PLAN040_PACKAGE_10A_POST_P9_PINS.service_change_html;
    route_row: Plan040Package10aRouteId;
    row_sha256: string;
    implementation_statement: string;
    candidate_change_context: string[];
  };
  prior_ledger_state: {
    extent_row: MemberExtentLedgerRow;
    grain_row: MemberGrainLedgerRow;
  };
  accepted_launch_inventory: {
    pre: Plan040Package10aInventorySlice;
    post: Plan040Package10aInventorySlice;
    zero_active_pre_inventory: true;
    positive_active_post_inventory: true;
    post_only_presence_is_member_identity: false;
    post_only_presence_authorizes_occurrence: false;
    post_only_presence_authorizes_extent: false;
    predecessor_lineage_authorized: false;
  };
  post_full_stop_chains: {
    source_id: "gtfs_static_20250626_busco_post_qbnr";
    target_date: string;
    complete_active_trip_coverage: true;
    active_trip_count: number;
    covered_trip_count: number;
    patterns: Plan040Package10aPostPattern[];
    candidate_treatment_binding_authorized: false;
    post_chain_presence_authorizes_extent: false;
  };
  candidate_detail_source_gap: {
    exact_url: string;
    staged_metadata_matches: 0;
    status: "missing_exact_candidate_detail_source";
  };
  schedule_detail_gap: {
    source_id: "mta_bus_schedules_2025_candidate_windows";
    source_sha256:
      typeof PLAN040_PACKAGE_10A_POST_P9_PINS.main_schedule_source;
    route_row_count: number;
    launch_date_row_count: 0;
    status: "missing_exact_launch_date_schedule_binding";
    later_nonlaunch_rows_are_nonauthorizing: true;
  };
  exact_candidate_searches: string[];
  unresolved_gap_codes: string[];
  evidence_verdict: "receipt_terminal_unresolved";
  proposed_extent_decision: null;
  proposed_grain_decision: null;
  persisted_extent_decision: null;
  persisted_grain_decision: null;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package10aExclusion = {
  scope_id: "risk_12" | "q67" | "q48_q75";
  source_artifact: { path: string; sha256: string };
  candidate_count: number;
  candidate_keys: string[];
  candidate_key_sha256: string;
  overlap_count: 0;
};

export type Plan040Package10aDraft = {
  schema_version: 1;
  package_id: typeof PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A;
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 4;
  route_count: 4;
  candidate_key_sha256:
    typeof PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256;
  evidence_verdict_distribution: {
    receipt_terminal_unresolved: 4;
  };
  proposed_extent_distribution: { unresolved: 4 };
  proposed_grain_distribution: { unresolved: 4 };
  candidates: Plan040Package10aCandidateEvidence[];
  exclusions: Plan040Package10aExclusion[];
  prior_package_overlap_count: 0;
  post_p9_pins: typeof PLAN040_PACKAGE_10A_POST_P9_PINS;
  version_separation: Plan040Package8VersionSeparation;
  review_protocol: {
    review_mode: "one_independent_review_plus_automated_fail_closed_tests";
    independent_review_required: true;
    dual_independent_review_required: false;
    owner_gate_created: false;
    owner_acceptance_created: false;
    persistence_performed: false;
  };
  authorization_state:
    "evidence_draft_pending_one_independent_review_no_gate_no_acceptance_no_persistence";
  proposed_extent_decision_count: 0;
  proposed_grain_decision_count: 0;
  persisted_extent_decision_count: 0;
  persisted_grain_decision_count: 0;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedStringHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const orderedStringHash = (values: readonly string[]): string =>
  sha256(`${values.join("\n")}\n`);

export function plan040Package10aReplayHash(value: JsonValue): string {
  return sha256(`${stableJson(value)}\n`);
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left as JsonValue) === stableJson(right as JsonValue);
}

function validateVersionSeparation(
  versionSeparation: Plan040Package8VersionSeparation,
): void {
  if (
    versionSeparation.published_launch_diff.status !==
      "completed_from_accepted_initial_feed_bytes" ||
    versionSeparation.published_launch_diff.correction_bytes_used ||
    versionSeparation.corrected_first_week_diff.status !==
      "blocked_not_run" ||
    versionSeparation.corrected_first_week_diff.comparison_run ||
    versionSeparation.corrected_first_week_diff.corrected_diff_used ||
    versionSeparation.corrected_first_week_diff
      .published_launch_outcomes_reclassified
  ) {
    throw new Error(
      "Plan 040 Package 10A correction-version separation drifted",
    );
  }
}

function validatePriorLedger(
  candidate: Plan040Package10aCandidateEvidence,
): void {
  const extent = candidate.prior_ledger_state.extent_row;
  const grain = candidate.prior_ledger_state.grain_row;
  if (
    extent.contract_id !== "member-extent-ledger-v1" ||
    grain.contract_id !== "member-grain-ledger-v1" ||
    extent.occurrence_id !== candidate.occurrence_id ||
    grain.occurrence_id !== candidate.occurrence_id ||
    extent.route_record_id !== candidate.route_record_id ||
    grain.route_record_id !== candidate.route_record_id ||
    extent.treatment_record_id !== candidate.treatment_record_id ||
    grain.treatment_record_id !== candidate.treatment_record_id ||
    extent.current_extent_kind !== "unresolved" ||
    grain.current_extent_kind !== "unresolved" ||
    extent.verdict !== "unreviewed" ||
    grain.verdict !== "unreviewed" ||
    grain.spatial_verdict !== "unreviewed" ||
    extent.packet_id !== null ||
    grain.packet_id !== null ||
    grain.member_extent_decision_id !== null ||
    grain.service_scope !== null ||
    extent.receipt_ids.length !== 0 ||
    grain.receipt_ids.length !== 0 ||
    extent.authorizes_study ||
    extent.authorizes_cross_product ||
    grain.authorizes_study ||
    grain.authorizes_cross_product
  ) {
    throw new Error(
      `${candidate.treatment_record_id}: post-P9 prior ledger shape drifted`,
    );
  }
}

function validateInventory(
  candidate: Plan040Package10aCandidateEvidence,
): void {
  const inventory = candidate.accepted_launch_inventory;
  const pre = inventory.pre;
  const post = inventory.post;
  const expectedPre = PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.pre;
  const expectedPost = PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.post;
  const preDirectionTripCount = Object.values(
    pre.active_direction_counts,
  ).reduce((sum, count) => sum + count, 0);
  const postDirectionTripCount = Object.values(
    post.active_direction_counts,
  ).reduce((sum, count) => sum + count, 0);
  if (
    pre.boundary !== "pre" ||
    post.boundary !== "post" ||
    pre.route_id !== candidate.gtfs_route_id ||
    post.route_id !== candidate.gtfs_route_id ||
    pre.feed_family !== "busco" ||
    post.feed_family !== "busco" ||
    pre.source_id !== expectedPre.source_id ||
    pre.receipt_path !== expectedPre.receipt_path ||
    pre.receipt_sha256 !== expectedPre.receipt_sha256 ||
    pre.zip_sha1 !== expectedPre.zip_sha1 ||
    pre.source_zip_sha256 !== expectedPre.zip_sha256 ||
    post.source_id !== expectedPost.source_id ||
    post.receipt_path !== expectedPost.receipt_path ||
    post.receipt_sha256 !== expectedPost.receipt_sha256 ||
    post.zip_sha1 !== expectedPost.zip_sha1 ||
    post.source_zip_sha256 !== expectedPost.zip_sha256 ||
    pre.calendar_expansion.policy !== "calendar_plus_calendar_dates" ||
    post.calendar_expansion.policy !== "calendar_plus_calendar_dates" ||
    pre.calendar_expansion.service_date !== pre.target_date ||
    post.calendar_expansion.service_date !== post.target_date ||
    pre.calendar_expansion.active_service_id_sha256 !==
      sortedStringHash(pre.calendar_expansion.active_service_ids) ||
    post.calendar_expansion.active_service_id_sha256 !==
      sortedStringHash(post.calendar_expansion.active_service_ids) ||
    pre.route_row_count !== 1 ||
    post.route_row_count !== 1 ||
    pre.all_route_trip_count !== 0 ||
    pre.active_route_trip_count !== 0 ||
    pre.active_shape_count !== 0 ||
    pre.active_shape_ids.length !== 0 ||
    preDirectionTripCount !== pre.active_route_trip_count ||
    post.all_route_trip_count <= 0 ||
    post.active_route_trip_count <= 0 ||
    post.active_shape_count <= 0 ||
    post.active_shape_ids.length !== post.active_shape_count ||
    postDirectionTripCount !== post.active_route_trip_count ||
    !inventory.zero_active_pre_inventory ||
    !inventory.positive_active_post_inventory ||
    inventory.post_only_presence_is_member_identity ||
    inventory.post_only_presence_authorizes_occurrence ||
    inventory.post_only_presence_authorizes_extent ||
    inventory.predecessor_lineage_authorized
  ) {
    throw new Error(
      `${candidate.treatment_record_id}: post-only inventory or authority drifted`,
    );
  }
  const chain = candidate.post_full_stop_chains;
  const coveredTrips = chain.patterns.reduce(
    (sum, pattern) => sum + pattern.trip_count,
    0,
  );
  if (
    !chain.complete_active_trip_coverage ||
    chain.active_trip_count !== post.active_route_trip_count ||
    chain.covered_trip_count !== chain.active_trip_count ||
    coveredTrips !== chain.covered_trip_count ||
    chain.patterns.length === 0 ||
    new Set(chain.patterns.map((pattern) => pattern.pattern_id)).size !==
      chain.patterns.length ||
    chain.patterns.some((pattern) =>
      pattern.stop_count === 0 ||
      pattern.stop_ids.length !== pattern.stop_count ||
      pattern.stop_ids.some((stopId) => stopId.trim().length === 0) ||
      pattern.stop_chain_sha256 !== orderedStringHash(pattern.stop_ids) ||
      !pattern.pattern_id.endsWith(
        pattern.stop_chain_sha256.slice(0, 16),
      )) ||
    chain.candidate_treatment_binding_authorized ||
    chain.post_chain_presence_authorizes_extent
  ) {
    throw new Error(
      `${candidate.treatment_record_id}: complete post chain coverage drifted`,
    );
  }
}

export function buildPlan040Package10aDraft(input: {
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package10aCandidateEvidence[];
  exclusions: Plan040Package10aExclusion[];
  priorCandidateKeys: string[];
  versionSeparation: Plan040Package8VersionSeparation;
}): Plan040Package10aDraft {
  validateVersionSeparation(input.versionSeparation);
  const byTreatment = new Map(input.candidates.map((candidate) => [
    candidate.treatment_record_id,
    candidate,
  ]));
  if (input.candidates.length !== 4 || byTreatment.size !== 4) {
    throw new Error("Plan 040 Package 10A requires exact four-candidate parity");
  }
  const candidates = PLAN040_PACKAGE_10A_CANDIDATES.map(
    ([, treatmentId]) => byTreatment.get(treatmentId)!,
  );
  if (candidates.some((candidate) => !candidate)) {
    throw new Error("Plan 040 Package 10A candidate scope drifted");
  }
  const keys = candidates.map((candidate) => candidate.candidate_key).sort();
  if (
    new Set(keys).size !== 4 ||
    sha256(`${keys.join("\n")}\n`) !==
      PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256 ||
    input.priorCandidateKeys.some((key) => keys.includes(key))
  ) {
    throw new Error(
      "Plan 040 Package 10A candidate key or prior-package overlap drifted",
    );
  }
  for (const candidate of candidates) {
    const expected = PLAN040_PACKAGE_10A_CANDIDATES.find(
      ([, treatmentId]) =>
        treatmentId === candidate.treatment_record_id,
    )!;
    const expectedStatement =
      PLAN040_PACKAGE_10A_EXACT_STATEMENTS[candidate.treatment_record_id];
    validatePriorLedger(candidate);
    validateInventory(candidate);
    if (
      candidate.gtfs_route_id !== expected[0] ||
      candidate.treatment_family !== "service_pattern" ||
      candidate.source_statement.source_id !==
        "mta_queens_bus_network_redesign_service_changes" ||
      candidate.source_statement.evidence_id !==
        expectedStatement.evidence_id ||
      candidate.source_statement.block_id !== expectedStatement.block_id ||
      candidate.source_statement.block_sha256 !==
        expectedStatement.block_sha256 ||
      candidate.source_statement.raw_text !== expectedStatement.raw_text ||
      candidate.source_statement.names_predecessor_route ||
      candidate.source_row.route_row !== candidate.gtfs_route_id ||
      candidate.source_row.source_html_sha256 !==
        PLAN040_PACKAGE_10A_POST_P9_PINS.service_change_html ||
      candidate.candidate_detail_source_gap.staged_metadata_matches !== 0 ||
      candidate.schedule_detail_gap.source_sha256 !==
        PLAN040_PACKAGE_10A_POST_P9_PINS.main_schedule_source ||
      candidate.schedule_detail_gap.launch_date_row_count !== 0 ||
      !candidate.schedule_detail_gap.later_nonlaunch_rows_are_nonauthorizing ||
      candidate.exact_candidate_searches.length < 8 ||
      candidate.unresolved_gap_codes.length < 4 ||
      !candidate.unresolved_gap_codes.includes(
        "zero_active_pre_inventory_no_predecessor_lineage",
      ) ||
      !candidate.unresolved_gap_codes.includes(
        "post_only_inventory_is_nonauthorizing",
      ) ||
      !candidate.unresolved_gap_codes.includes(
        "candidate_detail_source_missing",
      ) ||
      !candidate.unresolved_gap_codes.includes(
        "exact_launch_date_schedule_binding_missing",
      ) ||
      candidate.evidence_verdict !== "receipt_terminal_unresolved" ||
      candidate.proposed_extent_decision !== null ||
      candidate.proposed_grain_decision !== null ||
      candidate.persisted_extent_decision !== null ||
      candidate.persisted_grain_decision !== null ||
      candidate.authorizes_occurrence ||
      candidate.authorizes_study ||
      candidate.authorizes_cross_product ||
      candidate.authorizes_decision_persistence
    ) {
      throw new Error(
        `${candidate.treatment_record_id}: fail-closed evidence or authority drifted`,
      );
    }
  }
  const exclusionIds = input.exclusions.map((row) => row.scope_id).sort();
  if (
    !sameJson(exclusionIds, ["q48_q75", "q67", "risk_12"]) ||
    input.exclusions.some((row) =>
      row.overlap_count !== 0 ||
      row.candidate_count !==
        PLAN040_PACKAGE_10A_EXCLUSION_SCOPES[row.scope_id].candidate_count ||
      row.candidate_keys.length !== row.candidate_count ||
      new Set(row.candidate_keys).size !== row.candidate_count ||
      row.candidate_keys.some((key) => keys.includes(key)) ||
      sha256(`${[...row.candidate_keys].sort().join("\n")}\n`) !==
        row.candidate_key_sha256 ||
      row.candidate_key_sha256 !==
        PLAN040_PACKAGE_10A_EXCLUSION_SCOPES[row.scope_id]
          .candidate_key_sha256)
  ) {
    throw new Error("Plan 040 Package 10A exclusion scope drifted");
  }
  return {
    schema_version: 1,
    package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A,
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 4,
    route_count: 4,
    candidate_key_sha256: PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256,
    evidence_verdict_distribution: { receipt_terminal_unresolved: 4 },
    proposed_extent_distribution: { unresolved: 4 },
    proposed_grain_distribution: { unresolved: 4 },
    candidates,
    exclusions: input.exclusions,
    prior_package_overlap_count: 0,
    post_p9_pins: PLAN040_PACKAGE_10A_POST_P9_PINS,
    version_separation: input.versionSeparation,
    review_protocol: {
      review_mode:
        "one_independent_review_plus_automated_fail_closed_tests",
      independent_review_required: true,
      dual_independent_review_required: false,
      owner_gate_created: false,
      owner_acceptance_created: false,
      persistence_performed: false,
    },
    authorization_state:
      "evidence_draft_pending_one_independent_review_no_gate_no_acceptance_no_persistence",
    proposed_extent_decision_count: 0,
    proposed_grain_decision_count: 0,
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}
