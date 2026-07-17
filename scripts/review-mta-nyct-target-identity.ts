import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";

const INVENTORY_PATH = join(
  repoRoot,
  "data/quality/relationship-integrity/entity-identity/mta-nyct-target-review-inventory.json",
);
export const MTA_NYCT_REVIEWED_DECISIONS_PATH = join(
  repoRoot,
  "data/quality/relationship-integrity/entity-identity/mta-nyct-target-reviewed-decisions.json",
);
const REVIEWED_AT = "2026-07-16T00:00:00.000Z";
const REVIEWED_BY = "Codex authoritative MTA/NYCT identity and downstream-relation review";
const UMBRELLA_TARGET = "entity_mta-entity-update-2025";
const NYCT_TARGET = "entity_mta-nyct";

type EvidenceRef = {
  evidence_id: string;
  text_sha256: string;
  retrieval_status?: string;
  raw_text?: string | null;
};

type InventoryRelation = {
  submission_id: string;
  local_observation_id: string;
  relation_kind: string;
  relation_family: string | null;
  endpoint_roles: string[];
  subject_local_observation_id: string | null;
  object_local_observation_id: string | null;
  evidence_ids: string[];
};

type InventoryRow = {
  submission_id: string;
  source_id: string;
  local_observation_id: string;
  current_target_record_id: string;
  lexical_review_bucket: "explicit_umbrella_name" | "mta_only";
  evidence: EvidenceRef[];
  downstream_local_relations: InventoryRelation[];
};

type Inventory = {
  schema_version: number;
  inventory_id: string;
  generated_at: string;
  current_target_record_id: string;
  decision_policy: {
    umbrella_target_record_id: string;
    nyct_target_record_id: string;
  };
  pinned_inputs: Record<string, JsonValue>;
  counts: Record<string, number>;
  suspicious_submission_ids_sha256: string;
  downstream_local_relation_submission_ids_sha256: string;
  rows: InventoryRow[];
};

type SourceBlock = {
  source_id: string;
  block_id: string;
  page_number?: number;
  raw_text?: string;
  raw_text_sha256: string;
};

type IdentityResolution =
  | "retain_nyct_with_exact_evidence"
  | "retarget_umbrella_mta"
  | "retire_evidence_unsupported_observation";

type RowDecision =
  | IdentityResolution
  | "needs_relation_specific_remediation";

type RelationRemediation = {
  disposition: string;
  action: string;
  rationale: string;
};

const RETAIN_NYCT_SUBMISSION_IDS = new Set([
  "sub_0c2727e40e4e0fdc",
  "sub_93432f9e83cec801",
]);

const RETIRE_ENTITY_SUBMISSION_IDS = new Set([
  "sub_19cf97947d32f35f",
  "sub_686ee217f7023e7b",
]);

const NEEDS_RELATION_REMEDIATION_SUBMISSION_IDS = new Set([
  "sub_197290ab432de0f3",
  "sub_331e52d4ced22596",
  "sub_392a96ce7a13e3c9",
  "sub_463e14c50f4ec9bc",
  "sub_635920d1a9d0f975",
  "sub_69b520c8259fa6dd",
  "sub_6f870616c839434b",
  "sub_8676f3a81492109f",
  "sub_93432f9e83cec801",
  "sub_95ac1db2b888b865",
  "sub_97e92df543f549b3",
  "sub_9e5ff4a0de15bc23",
  "sub_b6d2d31bcb930aea",
  "sub_e24faf1dd8ded4dd",
  "sub_e4ab40f09101ab71",
  "sub_fa43a8a5e4d7cd5b",
]);

const NYCT_REPLACEMENT_BLOCK_IDS = new Map<string, string[]>([
  ["sub_0c2727e40e4e0fdc", ["p006_c0005"]],
  ["sub_93432f9e83cec801", ["p008_c0003", "p035_c0003", "p036_c0003"]],
]);

const RELATION_REMEDIATION = new Map<string, RelationRemediation>([
  ["sub_472e4c99ad8a5087", {
    disposition: "evidence_does_not_prove_publication_role",
    action: "retire_relation_submission",
    rationale: "An MTA logo on the cover proves branding, not the exact legal publisher of the Bx6 update.",
  }],
  ["sub_9eabbf2f92024473", {
    disposition: "evidence_does_not_prove_implemented_by",
    action: "retire_relation_submission",
    rationale: "The cited title and logo do not prove implementation responsibility or realized status.",
  }],
  ["sub_6b3342274762b25f", {
    disposition: "evidence_does_not_prove_route_operator",
    action: "retire_relation_submission_and_rebuild_only_with_exact_operator_evidence",
    rationale: "A route map and MTA-branded bus illustration identify the B46 and the MTA brand, but do not name its legal operating agency.",
  }],
  ["sub_ab8dd398bd65a24d", {
    disposition: "evidence_does_not_prove_route_operator",
    action: "retire_relation_submission_and_rebuild_only_with_exact_operator_evidence",
    rationale: "The route map describes B46 Limited service but never identifies the legal operating agency.",
  }],
  ["sub_0a682863dbb8a3f7", {
    disposition: "relation_uses_claim_as_operated_system",
    action: "retire_and_rebuild_with_distinct_camera_program_or_claim_model",
    rationale: "The text supports that the City or MTA may operate cameras, but the current object is a narrative enforcement-method claim rather than a camera system or program.",
  }],
  ["sub_5ae17d62145d7e3d", {
    disposition: "evidence_does_not_prove_project_partnership",
    action: "retire_relation_submission",
    rationale: "Co-branding on a presentation cover does not by itself prove the stored has_partner relationship.",
  }],
  ["sub_64497e813e8b4583", {
    disposition: "planned_collaboration_miscast_as_realized_implementation",
    action: "guarded_predicate_and_status_patch_or_retire",
    rationale: "The newsletter says DOT and MTA worked together on a redesigned and phased implementation plan; it does not establish completed implementation by MTA at publication time.",
  }],
  ["sub_a7489def99990d67", {
    disposition: "evidence_does_not_prove_project_partnership",
    action: "retire_relation_submission",
    rationale: "A generic MTA logo and an unattributed Source: MTA label do not establish the exact has_partner role.",
  }],
  ["sub_06d5a8b4ec917364", {
    disposition: "evidence_does_not_prove_project_partnership",
    action: "retire_relation_submission",
    rationale: "The cited Jay Street block is only an MTA logo and does not support the stored partnership assertion.",
  }],
  ["sub_3a536a4767961544", {
    disposition: "monitoring_collaboration_miscast_as_implemented_by",
    action: "guarded_predicate_and_status_patch_or_retire",
    rationale: "The source supports continued DOT/MTA monitoring and engagement, not an unqualified realized implemented_by role.",
  }],
  ["sub_496011087d7aca4d", {
    disposition: "evidence_does_not_prove_implemented_by",
    action: "retire_relation_submission",
    rationale: "Better Buses and MTA branding do not prove that NYCT implemented the project.",
  }],
  ["sub_9161f23f40a2b853", {
    disposition: "evidence_does_not_prove_publication_role",
    action: "retire_relation_submission",
    rationale: "MTA and NYC DOT logos establish joint branding, not the exact publisher asserted by the edge.",
  }],
  ["sub_e9ac4b22d4afd11f", {
    disposition: "announcement_does_not_prove_partner_role",
    action: "guarded_predicate_patch_or_retire",
    rationale: "The source says the MTA chair joined the project-restart announcement, but it does not state the exact has_partner role.",
  }],
  ["sub_182b494a3d2bb5c2", {
    disposition: "operator_edge_targets_metric_instead_of_program",
    action: "retire_and_rebuild_with_distinct_congestion_relief_program_endpoint",
    rationale: "The source attributes an 11 percent metric to MTA's Congestion Relief Zone; a metric claim is not the program being operated.",
  }],
  ["sub_bdaa4afd2d492ca5", {
    disposition: "future_commitment_miscast_as_realized_implementation",
    action: "guarded_predicate_and_status_patch_or_retire",
    rationale: "The cited block describes a commitment and proposed 2017 implementation, not a realized implemented_by claim at the source date.",
  }],
  ["sub_dd733c59e40c5f8e", {
    disposition: "workshop_organization_miscast_as_project_implementation",
    action: "guarded_predicate_patch_to_workshop_role_or_retire",
    rationale: "The evidence says DOT and MTA held design workshops; it does not say the project had been implemented by MTA.",
  }],
  ["sub_81b4ed17a440bdad", {
    disposition: "future_plan_miscast_as_realized_implementation",
    action: "guarded_status_patch_to_planned_or_retire",
    rationale: "The source says DOT and MTA will implement improvements in 2017, so the unqualified realized edge overstates document-time status.",
  }],
  ["sub_0c8356fcc3dc307b", {
    disposition: "evidence_does_not_prove_route_operator",
    action: "retire_relation_submission_and_rebuild_only_with_exact_operator_evidence",
    rationale: "An M60 title, bus photograph, and generic MTA logo do not identify the legal route operator.",
  }],
  ["sub_46237cb61b5879d5", {
    disposition: "self_loop_conflates_mta_with_published_board_books",
    action: "retire_and_rebuild_with_distinct_board_books_or_dataset_endpoint",
    rationale: "The same local MTA observation occupies both endpoints; the source instead describes data released through Board and Committee books.",
  }],
  ["sub_6723fbc8525ef29a", {
    disposition: "source_page_used_as_open_data_program_endpoint",
    action: "retire_and_rebuild_with_distinct_open_data_program_record",
    rationale: "The relation points MTA has_program to a source page rather than to a canonical Open Data program identity.",
  }],
  ["sub_8f2787bda685c3be", {
    disposition: "umbrella_mta_observation_used_as_open_data_program_endpoint",
    action: "retire_and_rebuild_with_distinct_open_data_program_record",
    rationale: "After resolving this observation to umbrella MTA, it cannot also serve as the Open Data program managed by Data & Analytics.",
  }],
]);

const IDENTITY_PATTERNS = [
  "Metropolitan Transportation Authority",
  "Metropolitan Transit Authority",
  "New York City Transit",
  "NYC Transit",
  "NYCT",
  "MTA Bus",
  "MTA",
];
const IDENTITY_RE = /Metropolitan Transportation Authority|Metropolitan Transit Authority|New York City Transit|NYC Transit|\bNYCT\b|MTA Bus|\bMTA\b/iu;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableHash(value: unknown): string {
  return sha256(stableJson(value as JsonValue));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function parseBlocks(sourceId: string): { path: string; fileSha256: string; blocks: SourceBlock[] } {
  const path = join(repoRoot, "raw/sources", sourceId, "blocks.jsonl");
  const input = readFileSync(path, "utf8");
  const blocks = input.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as SourceBlock);
  return { path, fileSha256: sha256(input), blocks };
}

function blockRef(sourceId: string, block: SourceBlock) {
  return {
    evidence_id: `${sourceId}#${block.block_id}`,
    source_id: sourceId,
    source_path: `raw/sources/${sourceId}/blocks.jsonl`,
    block_id: block.block_id,
    page_number: block.page_number ?? null,
    text_sha256: block.raw_text_sha256,
    evidence_excerpt: (block.raw_text ?? "").replace(/[\r\n\t]+/gu, " ").slice(0, 320),
  };
}

function umbrellaEvidenceScore(block: SourceBlock): number {
  const value = block.raw_text ?? "";
  let score = 0;
  if (/Metropolitan Transportation Authority|Metropolitan Transit Authority/iu.test(value)) score += 100;
  if (/\bthe MTA\b|\bMTA (?:is|has|will|and|operates|publishes|plans|hosted|launched|committed)\b/iu.test(value)) score += 60;
  if (/MTA (?:Chair|Board|Open Data|Data & Analytics)/iu.test(value)) score += 50;
  if (/New York City Transit|NYC Transit|\bNYCT\b/iu.test(value)) score -= 40;
  if (/logo|photograph|bus with the MTA/iu.test(value)) score -= 30;
  return score;
}

function selectedIdentityRefs(
  row: InventoryRow,
  identityResolution: IdentityResolution,
  blocks: SourceBlock[],
) {
  const byId = new Map(blocks.map((block) => [block.block_id, block]));
  if (identityResolution === "retire_evidence_unsupported_observation") {
    return row.evidence.map((ref) => {
      const blockId = ref.evidence_id.split("#", 2)[1]!;
      const block = byId.get(blockId);
      if (!block) throw new Error(`Missing evidence block ${ref.evidence_id}`);
      return blockRef(row.source_id, block);
    });
  }
  if (identityResolution === "retain_nyct_with_exact_evidence") {
    const ids = NYCT_REPLACEMENT_BLOCK_IDS.get(row.submission_id);
    if (!ids?.length) throw new Error(`No NYCT evidence selection for ${row.submission_id}`);
    return ids.map((id) => {
      const block = byId.get(id);
      if (!block) throw new Error(`Missing NYCT replacement block ${row.source_id}#${id}`);
      if (!/New York City Transit|NYC Transit|\bNYCT\b/iu.test(block.raw_text ?? "")) {
        throw new Error(`NYCT replacement block lacks exact NYCT identity ${row.source_id}#${id}`);
      }
      return blockRef(row.source_id, block);
    });
  }
  const relevant = blocks.filter((block) => IDENTITY_RE.test(block.raw_text ?? ""));
  const currentBlockIds = row.evidence.map((ref) => ref.evidence_id.split("#", 2)[1]!);
  const ranked = [...relevant].sort((left, right) =>
    umbrellaEvidenceScore(right) - umbrellaEvidenceScore(left) || left.block_id.localeCompare(right.block_id));
  const chosenIds = uniqueSorted([...currentBlockIds, ...ranked.slice(0, 3).map((block) => block.block_id)]);
  if (chosenIds.length === 0) throw new Error(`No umbrella evidence selection for ${row.submission_id}`);
  return chosenIds.map((id) => {
    const block = byId.get(id);
    if (!block) throw new Error(`Missing umbrella evidence block ${row.source_id}#${id}`);
    return blockRef(row.source_id, block);
  });
}

function identityResolution(row: InventoryRow): IdentityResolution {
  if (RETIRE_ENTITY_SUBMISSION_IDS.has(row.submission_id)) return "retire_evidence_unsupported_observation";
  if (RETAIN_NYCT_SUBMISSION_IDS.has(row.submission_id)) return "retain_nyct_with_exact_evidence";
  return "retarget_umbrella_mta";
}

function rowDecision(row: InventoryRow, resolution: IdentityResolution): RowDecision {
  if (NEEDS_RELATION_REMEDIATION_SUBMISSION_IDS.has(row.submission_id)) return "needs_relation_specific_remediation";
  return resolution;
}

function identityRationale(row: InventoryRow, resolution: IdentityResolution, decision: RowDecision): string {
  if (row.submission_id === "sub_686ee217f7023e7b") {
    return "The complete staged ACE routes dictionary contains no MTA, Metropolitan Transportation Authority, NYCT, or New York City Transit identity assertion. Its cited blocks only describe a Route field, so the publisher entity was fabricated beyond evidence and must be retired.";
  }
  if (row.submission_id === "sub_19cf97947d32f35f") {
    return "The complete staged memorial-image source shows generic MTA branding at a subway setting but never identifies a legal entity or states that MTA organized the event. The agency observation and organizer description exceed the source and must be retired.";
  }
  if (resolution === "retain_nyct_with_exact_evidence") {
    const base = "Complete-source review found exact MTA NYCT attribution in the staged presentation, so this local observation belongs to New York City Transit rather than the parent authority.";
    return decision === "needs_relation_specific_remediation"
      ? `${base} Its downstream implementation/publication edges still exceed their cited branding evidence and require separate remediation.`
      : base;
  }
  const base = "The staged official source uses MTA/Metropolitan Transportation Authority as the parent institutional identity and does not identify this local observation as New York City Transit; the current NYCT target is therefore a parent/subsidiary identity error.";
  return decision === "needs_relation_specific_remediation"
    ? `${base} At least one downstream local relation cannot safely follow the retarget because its predicate, endpoint class, status, or exact role is not supported.`
    : base;
}

function exactRelationEvidence(row: InventoryRow, relation: InventoryRelation, blocks: SourceBlock[]) {
  const byId = new Map(blocks.map((block) => [block.block_id, block]));
  return uniqueSorted(relation.evidence_ids).map((evidenceId) => {
    const [sourceId, blockId] = evidenceId.split("#", 2);
    if (sourceId !== row.source_id || !blockId) throw new Error(`Invalid relation evidence id ${evidenceId}`);
    const block = byId.get(blockId);
    if (!block) throw new Error(`Missing relation evidence block ${evidenceId}`);
    return blockRef(row.source_id, block);
  });
}

function downstreamDecision(
  row: InventoryRow,
  relation: InventoryRelation,
  resolution: IdentityResolution,
  blocks: SourceBlock[],
) {
  const remediation = RELATION_REMEDIATION.get(relation.submission_id);
  const defaultDisposition = resolution === "retain_nyct_with_exact_evidence"
    ? "retain_relation_with_nyct_endpoint"
    : "retarget_relation_local_endpoint_to_umbrella_mta";
  const defaultAction = resolution === "retain_nyct_with_exact_evidence"
    ? "retain_endpoint_after_exact_nyct_evidence_repair"
    : "follow_reviewed_local_identity_retarget";
  return {
    relation_submission_id: relation.submission_id,
    local_observation_id: relation.local_observation_id,
    relation_kind: relation.relation_kind,
    relation_family: relation.relation_family,
    endpoint_roles: [...relation.endpoint_roles].sort(),
    subject_local_observation_id: relation.subject_local_observation_id,
    object_local_observation_id: relation.object_local_observation_id,
    evidence_refs: exactRelationEvidence(row, relation, blocks),
    disposition: remediation?.disposition ?? defaultDisposition,
    action: remediation?.action ?? defaultAction,
    reviewed_target_record_id: resolution === "retain_nyct_with_exact_evidence" ? NYCT_TARGET : UMBRELLA_TARGET,
    rationale: remediation?.rationale ?? "The exact cited relation evidence supports the stored role, and the local endpoint may follow the independently reviewed entity identity.",
  };
}

export function buildMtaNyctTargetReviewedDecisions() {
  const inventoryInput = readFileSync(INVENTORY_PATH, "utf8");
  const inventory = JSON.parse(inventoryInput) as Inventory;
  if (inventory.schema_version !== 1 || inventory.rows.length !== 61) {
    throw new Error("Unexpected MTA/NYCT target inventory schema or row count");
  }
  if (
    inventory.decision_policy.umbrella_target_record_id !== UMBRELLA_TARGET ||
    inventory.decision_policy.nyct_target_record_id !== NYCT_TARGET
  ) {
    throw new Error("Inventory target policy changed");
  }

  const sourceCache = new Map<string, ReturnType<typeof parseBlocks>>();
  const decisions = inventory.rows.map((row) => {
    const source = sourceCache.get(row.source_id) ?? parseBlocks(row.source_id);
    sourceCache.set(row.source_id, source);
    const sourceBlocksById = new Map(source.blocks.map((block) => [block.block_id, block]));
    for (const ref of row.evidence) {
      const [sourceId, blockId] = ref.evidence_id.split("#", 2);
      const block = sourceBlocksById.get(blockId ?? "");
      if (sourceId !== row.source_id || !block || block.raw_text_sha256 !== ref.text_sha256) {
        throw new Error(`Inventory evidence binding no longer matches staged source: ${ref.evidence_id}`);
      }
    }
    const relevantBlocks = source.blocks.filter((block) => IDENTITY_RE.test(block.raw_text ?? ""));
    const relevantBindings = relevantBlocks.map((block) => ({
      evidence_id: `${row.source_id}#${block.block_id}`,
      text_sha256: block.raw_text_sha256,
    }));
    const resolution = identityResolution(row);
    const decision = rowDecision(row, resolution);
    const reviewedRefs = selectedIdentityRefs(row, resolution, source.blocks);
    const downstream = row.downstream_local_relations.map((relation) =>
      downstreamDecision(row, relation, resolution, source.blocks));
    if (decision === "needs_relation_specific_remediation" && !downstream.some((entry) => RELATION_REMEDIATION.has(entry.relation_submission_id))) {
      throw new Error(`Needs-remediation row ${row.submission_id} has no relation-specific action`);
    }
    return {
      submission_id: row.submission_id,
      source_id: row.source_id,
      local_observation_id: row.local_observation_id,
      lexical_review_bucket: row.lexical_review_bucket,
      current_target_record_id: row.current_target_record_id,
      decision,
      identity_resolution: resolution,
      reviewed_target_record_id: resolution === "retain_nyct_with_exact_evidence"
        ? NYCT_TARGET
        : resolution === "retarget_umbrella_mta" ? UMBRELLA_TARGET : null,
      rationale: identityRationale(row, resolution, decision),
      current_evidence_refs: row.evidence.map((entry) => ({
        evidence_id: entry.evidence_id,
        text_sha256: entry.text_sha256,
        retrieval_status: entry.retrieval_status ?? null,
      })),
      replacement_evidence_refs: resolution === "retire_evidence_unsupported_observation" ? [] : reviewedRefs,
      reviewed_identity_evidence_refs: reviewedRefs,
      complete_staged_source_review: {
        blocks_path: relative(repoRoot, source.path),
        blocks_file_sha256: source.fileSha256,
        total_block_count: source.blocks.length,
        identity_search_patterns: IDENTITY_PATTERNS,
        relevant_identity_block_count: relevantBindings.length,
        relevant_identity_evidence_ids_sha256: stableHash(relevantBindings.map((entry) => entry.evidence_id).sort()),
        relevant_identity_evidence_bindings_sha256: stableHash(relevantBindings),
        review_method: "Every staged block was searched for parent-MTA, NYCT, NYC Transit, New York City Transit, and MTA Bus identity literals; all matches, current refs, and every downstream relation evidence block were inspected in source context.",
      },
      downstream_relation_decisions: downstream,
      review_status: "reviewed",
      reviewed_at: REVIEWED_AT,
      reviewed_by: REVIEWED_BY,
    };
  });

  const sourcePins = [...sourceCache.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([sourceId, source]) => ({
    source_id: sourceId,
    blocks_path: relative(repoRoot, source.path),
    blocks_file_sha256: source.fileSha256,
    block_count: source.blocks.length,
  }));
  const downstream = decisions.flatMap((decision) => decision.downstream_relation_decisions);
  const reviewedEvidenceIds = uniqueSorted(decisions.flatMap((decision) => [
    ...decision.reviewed_identity_evidence_refs.map((ref) => ref.evidence_id),
    ...decision.downstream_relation_decisions.flatMap((relation) => relation.evidence_refs.map((ref) => ref.evidence_id)),
  ]));
  const replacementEvidenceIds = uniqueSorted(decisions.flatMap((decision) =>
    decision.replacement_evidence_refs.map((ref) => ref.evidence_id)));
  const rowDecisionValues: RowDecision[] = [
    "retain_nyct_with_exact_evidence",
    "retarget_umbrella_mta",
    "retire_evidence_unsupported_observation",
    "needs_relation_specific_remediation",
  ];
  const identityResolutionValues: IdentityResolution[] = [
    "retain_nyct_with_exact_evidence",
    "retarget_umbrella_mta",
    "retire_evidence_unsupported_observation",
  ];

  return {
    schema_version: 1,
    review_id: "mta-nyct-target-reviewed-decisions-v1",
    inventory_id: inventory.inventory_id,
    review_status: "complete",
    reviewed_at: REVIEWED_AT,
    reviewed_by: REVIEWED_BY,
    decision_contract: {
      exclusive_row_decisions: rowDecisionValues,
      identity_resolutions: identityResolutionValues,
      no_lexical_bucket_is_self_executing: true,
      relation_specific_remediation_does_not_authorize_graph_mutation: true,
    },
    pinned_inputs: {
      inventory_path: relative(repoRoot, INVENTORY_PATH),
      inventory_file_sha256: sha256(inventoryInput),
      inventory_logical_sha256: stableHash(inventory),
      inventory_suspicious_submission_ids_sha256: inventory.suspicious_submission_ids_sha256,
      inventory_downstream_relation_submission_ids_sha256: inventory.downstream_local_relation_submission_ids_sha256,
      inventory_pinned_inputs: inventory.pinned_inputs,
      staged_source_count: sourcePins.length,
      staged_source_block_files_sha256: stableHash(sourcePins),
      staged_source_block_files: sourcePins,
    },
    summary: {
      reviewed_row_count: decisions.length,
      unreviewed_row_count: decisions.filter((decision) => decision.review_status !== "reviewed").length,
      row_decision_counts: Object.fromEntries(rowDecisionValues.map((value) => [value, decisions.filter((decision) => decision.decision === value).length])),
      identity_resolution_counts: Object.fromEntries(identityResolutionValues.map((value) => [value, decisions.filter((decision) => decision.identity_resolution === value).length])),
      explicit_umbrella_non_ace_retarget_count: decisions.filter((decision) =>
        decision.lexical_review_bucket === "explicit_umbrella_name" &&
        decision.submission_id !== "sub_686ee217f7023e7b" &&
        decision.identity_resolution === "retarget_umbrella_mta").length,
      mta_only_reviewed_count: decisions.filter((decision) => decision.lexical_review_bucket === "mta_only").length,
      downstream_relation_count: downstream.length,
      relation_specific_remediation_count: downstream.filter((entry) => RELATION_REMEDIATION.has(entry.relation_submission_id)).length,
      downstream_relation_submission_ids_sha256: stableHash(downstream.map((entry) => entry.relation_submission_id).sort()),
      reviewed_evidence_id_count: reviewedEvidenceIds.length,
      reviewed_evidence_ids_sha256: stableHash(reviewedEvidenceIds),
      replacement_evidence_id_count: replacementEvidenceIds.length,
      replacement_evidence_ids_sha256: stableHash(replacementEvidenceIds),
      reviewed_submission_ids_sha256: stableHash(decisions.map((decision) => decision.submission_id).sort()),
    },
    decisions,
  };
}

export function validateMtaNyctTargetReviewedDecisions(
  artifact: ReturnType<typeof buildMtaNyctTargetReviewedDecisions>,
): string[] {
  const issues: string[] = [];
  const inventory = JSON.parse(readFileSync(INVENTORY_PATH, "utf8")) as Inventory;
  const inventoryIds = inventory.rows.map((row) => row.submission_id).sort();
  const decisionIds = artifact.decisions.map((row) => row.submission_id).sort();
  if (stableJson(inventoryIds as JsonValue) !== stableJson(decisionIds as JsonValue)) issues.push("reviewed row ids do not exactly match inventory");
  if (new Set(decisionIds).size !== 61) issues.push("review must contain 61 unique rows");
  if (artifact.summary.unreviewed_row_count !== 0) issues.push("unreviewed rows remain");
  if (artifact.summary.explicit_umbrella_non_ace_retarget_count !== 49) issues.push("49 non-ACE explicit umbrella rows were not all independently retargeted");
  if (artifact.summary.mta_only_reviewed_count !== 11) issues.push("all 11 MTA-only rows were not reviewed");
  const inventoryRelations = inventory.rows.flatMap((row) => row.downstream_local_relations.map((relation) => relation.submission_id)).sort();
  const reviewedRelations = artifact.decisions.flatMap((row) => row.downstream_relation_decisions.map((relation) => relation.relation_submission_id)).sort();
  if (stableJson(inventoryRelations as JsonValue) !== stableJson(reviewedRelations as JsonValue)) issues.push("downstream relation decisions do not exactly match inventory");
  if (new Set(reviewedRelations).size !== 44) issues.push("review must contain 44 unique downstream relation decisions");
  for (const decision of artifact.decisions) {
    if (decision.review_status !== "reviewed") issues.push(`${decision.submission_id} is unreviewed`);
    if (decision.decision === "needs_relation_specific_remediation" && !decision.downstream_relation_decisions.some((relation) => RELATION_REMEDIATION.has(relation.relation_submission_id))) {
      issues.push(`${decision.submission_id} lacks a relation-specific action`);
    }
    for (const ref of [...decision.reviewed_identity_evidence_refs, ...decision.downstream_relation_decisions.flatMap((relation) => relation.evidence_refs)]) {
      if (!ref.evidence_id || !ref.text_sha256.startsWith("sha256:")) issues.push(`${decision.submission_id} has incomplete evidence binding`);
    }
  }
  return issues;
}

if (import.meta.main) {
  const artifact = buildMtaNyctTargetReviewedDecisions();
  const issues = validateMtaNyctTargetReviewedDecisions(artifact);
  if (issues.length > 0) throw new Error(`Invalid reviewed decisions: ${issues.join("; ")}`);
  const rendered = `${JSON.stringify(artifact, null, 2)}\n`;
  if (process.argv.includes("--apply")) {
    mkdirSync(dirname(MTA_NYCT_REVIEWED_DECISIONS_PATH), { recursive: true });
    writeFileSync(MTA_NYCT_REVIEWED_DECISIONS_PATH, rendered, "utf8");
  } else if (!existsSync(MTA_NYCT_REVIEWED_DECISIONS_PATH) || readFileSync(MTA_NYCT_REVIEWED_DECISIONS_PATH, "utf8") !== rendered) {
    throw new Error(`MTA/NYCT reviewed decisions are stale; run bun ${relative(repoRoot, import.meta.path)} --apply`);
  }
  process.stdout.write(`${JSON.stringify({
    output: relative(repoRoot, MTA_NYCT_REVIEWED_DECISIONS_PATH),
    sha256: sha256(rendered),
    summary: artifact.summary,
    mode: process.argv.includes("--apply") ? "apply" : "check",
  })}\n`);
}
