import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  RELATIONSHIP_COMPLETENESS_BUS_LANE_INVENTORY_V1,
  RELATIONSHIP_COMPLETENESS_REQUIRED_WARNING_CODES,
} from "./relationship-completeness-contract.js";
import { sha256, stableJson } from "./stable-json.js";
import type { JsonValue, MtaObservationKind } from "./types.js";

export const RELATIONSHIP_CONTRACT_ID = "relationship-contract-v1" as const;
export const RELATIONSHIP_ENFORCEMENT_PROOF_SCHEMA_VERSION = 2 as const;
export const RELATIONSHIP_ENFORCEMENT_TRANSITION_RECEIPT_SCHEMA_VERSION = 1 as const;
export const RELATIONSHIP_ENFORCEMENT_TRANSITION_RECEIPT_ID =
  "relationship-contract-v1-enforcement-transition" as const;
export const RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES = [
  "canonical_db",
  "graph_audit_findings",
  "graph_audit_manifest",
  "graph_audit_summary",
  "linkage_materialization_summary",
  "sql_integrity_summary",
] as const;
export const RELATIONSHIP_ENFORCEMENT_INVARIANT_ROLES = [
  "canonical_relations",
  "determinism_consumer_summary",
  "final_endpoint_matrix",
  "reviewed_release_manifest",
] as const;
export const RELATIONSHIP_ENFORCEMENT_GATE_IDS = [
  "bus_lane_acquisition_linkage",
  "determinism_and_consumer_proof",
  "occurrence_treatment_physicality",
  "payload_reference_integrity",
  "referential_type_evidence_integrity",
  "relationship_completeness",
  "semantic_remediation",
] as const;

export type RelationshipFindingSeverity = "info" | "warning" | "error";
export type RelationshipValidationMode = "warn" | "enforce";
export type RelationshipEnforcementState =
  | "warning_ready"
  | "enforced_refresh_required"
  | "enforced_ready";
export type RelationshipEnforcementProofStage =
  | "pre_promotion_warning"
  | "post_promotion_enforced";

export type RelationshipEndpointShape = {
  subject_kind: MtaObservationKind;
  object_kind: MtaObservationKind;
};

export type RelationshipEndpointTupleProvenance =
  | "frozen_observed_baseline"
  | "reviewed_expansion"
  | "reviewed_post_remediation";

export type RelationshipEndpointFamilyShape = RelationshipEndpointShape & {
  relation_family: string;
  provenance: RelationshipEndpointTupleProvenance;
  review_decision_ids: string[];
};

export type RelationshipEndpointRule = {
  relation_kind: string;
  relation_families: string[];
  allowed_shapes: RelationshipEndpointShape[];
  allowed_family_shapes: RelationshipEndpointFamilyShape[];
  review_basis:
    | "existing_exact_rule"
    | "frozen_observed_shape"
    | "reviewed_post_remediation";
};

export type RelationshipEndpointMatrix = {
  schema_version: 1;
  contract_id: typeof RELATIONSHIP_CONTRACT_ID;
  generated_from: {
    canonical_relations_path: string;
    canonical_relations_sha256: string;
    canonical_record_count: number;
    canonical_relation_count: number;
  };
  relation_kind_rule_count: number;
  covered_relation_count: number;
  allowed_family_shape_count: number;
  tuple_provenance: {
    baseline_inventory: {
      path: string;
      sha256: string;
      tuple_count: number;
      relation_assignment_count: number;
      semantic_review_status: "frozen_observed_not_semantically_reviewed";
    };
    reviewed_expansion_ledger: {
      path: string;
      sha256: string;
      tuple_count: number;
      affected_relation_count: number;
      review_status: "approved";
    };
  };
  rules: RelationshipEndpointRule[];
};

export type RelationshipFinalEndpointFamilyShape =
  RelationshipEndpointShape & {
    relation_family: string;
    provenance: "reviewed_post_remediation";
    review_decision_ids: string[];
    relation_count: number;
    relation_ids_sha256: string;
  };

export type RelationshipFinalEndpointRule = {
  relation_kind: string;
  relation_families: string[];
  allowed_shapes: RelationshipEndpointShape[];
  allowed_family_shapes: RelationshipFinalEndpointFamilyShape[];
  review_basis: "reviewed_post_remediation";
};

export type RelationshipFinalEndpointMatrix = {
  schema_version: 1;
  matrix_id: "relationship-contract-v1-post-remediation-final";
  contract_id: typeof RELATIONSHIP_CONTRACT_ID;
  review_status: "reviewed_post_remediation";
  obsolete_baseline_tuple_policy: "reject";
  generated_from: {
    projected_relations_path: string;
    projected_relations_sha256: string;
    projected_relations_logical_sha256: string;
    projected_tuples_path: string;
    projected_tuples_sha256: string;
    projected_tuples_logical_sha256: string;
    semantic_remediation_summary_path: string;
    semantic_remediation_summary_sha256: string;
    campaign_id: "relationship-semantic-remediation-v1";
    skipped_correction_count: 0;
    unmapped_relation_count: 0;
  };
  relation_kind_rule_count: number;
  covered_relation_count: number;
  allowed_family_shape_count: number;
  relation_ids_sha256: string;
  tuple_set_sha256: string;
  rules: RelationshipFinalEndpointRule[];
};

export type RelationshipProjectedRelation = {
  relation_id: string;
  relation_family: string;
  relation_kind: string;
  subject_id: string;
  subject_kind: MtaObservationKind;
  object_id: string;
  object_kind: MtaObservationKind;
  evidence_ids: string[];
  evidence_bindings_sha256: string;
  semantic_review_decision_ids: string[];
  semantic_remediation_decision_ids: string[];
  mapping_status: "mapped";
};

export type RelationshipProjectedTuple = RelationshipEndpointShape & {
  relation_family: string;
  relation_kind: string;
  relation_count: number;
  relation_ids_sha256: string;
  semantic_review_decision_ids: string[];
  semantic_remediation_decision_ids: string[];
};

export type RelationshipProjectedTupleInventory = {
  schema_version: 1;
  inventory_id: string;
  generated_at: string;
  relation_count: number;
  tuple_count: number;
  relation_ids_sha256: string;
  tuples_sha256: string;
  unmapped_relation_count: 0;
  tuples: RelationshipProjectedTuple[];
};

export type RelationshipBaselineTupleReviewInventory = {
  schema_version: 1;
  inventory_id: string;
  contract_id: typeof RELATIONSHIP_CONTRACT_ID;
  review_status: "frozen_observed_not_semantically_reviewed";
  statement: string;
  created_at: string;
  generated_from: {
    canonical_relations_path: string;
    canonical_relations_sha256: string;
    endpoint_matrix_stable_sha256: string;
  };
  tuple_count: number;
  relation_assignment_count: number;
  semantically_reviewed_tuple_count: 0;
  rule_basis_counts: {
    existing_exact_rule_tuples: number;
    frozen_observed_shape_tuples: number;
  };
  tuples: Array<RelationshipEndpointShape & {
    relation_kind: string;
    relation_family: string;
    rule_review_basis: "existing_exact_rule" | "frozen_observed_shape";
    observed_relation_count: number;
    observed_relation_record_ids_sha256: string;
    review_status: "frozen_observed_not_semantically_reviewed";
  }>;
};

export type RelationshipReviewedTupleExpansionLedger = {
  schema_version: 1;
  ledger_id: string;
  contract_id: typeof RELATIONSHIP_CONTRACT_ID;
  review_status: "approved";
  reviewed_at: string;
  reviewed_by: string;
  approval_scope: string;
  pinned_sources: Record<string, JsonValue>;
  expansion_tuple_count: number;
  affected_relation_count: number;
  selected_correction_count: number;
  expansions: Array<RelationshipEndpointShape & {
    decision_id: string;
    relation_kind: string;
    relation_family: string;
    affected_relation_count: number;
    rationales: string[];
    affected_relations: Array<{
      record_id: string;
      correction_ids: string[];
      legacy_ledger_item_ids: string[];
      evidence_ids: string[];
      correction_reasons: string[];
      legacy_investigations: string[];
      legacy_reasons: string[];
    }>;
  }>;
};

export type RelationshipFindingCodeConfig = {
  default_severity: RelationshipFindingSeverity;
  enforcement_eligible: boolean;
};

export type RelationshipEndpointMatrixPointer = {
  path: string;
  sha256: string;
  matrix_kind?:
    | "legacy_warning_baseline"
    | "post_remediation_reviewed";
  relation_count?: number;
  tuple_count?: number;
  relation_ids_sha256?: string;
  tuple_set_sha256?: string;
  obsolete_baseline_tuple_policy?: "reject";
  unlisted_relation_policy: "error";
  new_shape_policy: "error";
};

export type RelationshipEnforcementProofGate = {
  gate_id: string;
  status: "ready";
  violation_count: 0;
  artifact_path: string;
  artifact_sha256: string;
  criteria: string[];
};

export type RelationshipContentAddressedArtifact = {
  path: string;
  sha256: string;
};

export type RelationshipEnforcementProofReference =
  RelationshipContentAddressedArtifact & {
    proof_stage: RelationshipEnforcementProofStage;
  };

export type RelationshipEnforcementTransitionReceiptReference =
  RelationshipContentAddressedArtifact;

export type RelationshipEnforcementTransitionArtifactPin =
  RelationshipContentAddressedArtifact & {
    role: string;
    archive_path?: string;
    transition_fingerprint?: string;
  };

export type RelationshipEnforcementTransitionGatePin =
  RelationshipContentAddressedArtifact & {
    gate_id: string;
  };

export type RelationshipEnforcementTransitionReceipt = {
  schema_version: typeof RELATIONSHIP_ENFORCEMENT_TRANSITION_RECEIPT_SCHEMA_VERSION;
  receipt_id: typeof RELATIONSHIP_ENFORCEMENT_TRANSITION_RECEIPT_ID;
  contract_id: typeof RELATIONSHIP_CONTRACT_ID;
  transition: {
    from_state: "warning_ready";
    to_state: "enforced_refresh_required";
  };
  promoted_at: string;
  promoted_by: string;
  previous_proof: RelationshipEnforcementProofReference;
  final_matrix: RelationshipContentAddressedArtifact & {
    relation_count: number;
    tuple_count: number;
    relation_ids_sha256: string;
    tuple_set_sha256: string;
  };
  previous_gates: RelationshipEnforcementTransitionGatePin[];
  pre_promotion_sources: RelationshipEnforcementTransitionArtifactPin[];
  invariant_artifacts: RelationshipEnforcementTransitionArtifactPin[];
  refresh_artifacts: RelationshipEnforcementTransitionArtifactPin[];
};

export type RelationshipEnforcementProof = {
  schema_version: typeof RELATIONSHIP_ENFORCEMENT_PROOF_SCHEMA_VERSION;
  proof_id: "relationship-contract-v1-enforcement-proof";
  contract_id: typeof RELATIONSHIP_CONTRACT_ID;
  proof_status: "ready";
  proof_stage: RelationshipEnforcementProofStage;
  validation_mode: RelationshipValidationMode;
  reviewed_at: string;
  reviewed_by: string;
  previous_proof?: RelationshipEnforcementProofReference;
  transition_receipt?: RelationshipEnforcementTransitionReceiptReference;
  final_matrix: {
    path: string;
    sha256: string;
    relation_count: number;
    tuple_count: number;
    relation_ids_sha256: string;
    tuple_set_sha256: string;
  };
  gate_count: number;
  all_gates_ready: true;
  total_violation_count: 0;
  gates: RelationshipEnforcementProofGate[];
};

export type RelationshipEnforcementGateArtifact = {
  schema_version: 1;
  artifact_id: string;
  contract_id: typeof RELATIONSHIP_CONTRACT_ID;
  gate_id: string;
  reviewed_at: string;
  reviewed_by: string;
  source_count: number;
  source_artifacts: Array<{
    role: string;
    path: string;
    sha256: string;
  }>;
  derived_violation_count: 0;
};

export type RelationshipContract = {
  schema_version: 1;
  contract_id: typeof RELATIONSHIP_CONTRACT_ID;
  contract_status: "warning_first" | "enforced";
  enforcement_state?: RelationshipEnforcementState;
  reviewed_at: string;
  reviewed_by: string;
  endpoint_matrix: RelationshipEndpointMatrixPointer;
  enforcement_proof?: {
    path: string;
    sha256: string;
    required_gate_ids: string[];
    transition_receipt?: RelationshipEnforcementTransitionReceiptReference;
  };
  identity_policy: {
    canonical_endpoint_required: true;
    ambiguous_alias_resolution: "reject";
    superseded_endpoint_resolution: "rewrite_to_survivor";
    local_id_scope: "source";
  };
  evidence_policy: {
    minimum_refs_per_relation: number;
    block_identity_required: true;
    hash_required: true;
    broad_same_page_block_threshold: number;
  };
  finding_codes: Record<string, RelationshipFindingCodeConfig>;
  completeness_roles: Record<string, { required_roles: string[]; disposition_allowed: boolean }>;
  migration_criteria: Record<string, string[]>;
};

export const RELATIONSHIP_CONTRACT_POLICY_V1: Pick<
  RelationshipContract,
  | "identity_policy"
  | "evidence_policy"
  | "finding_codes"
  | "completeness_roles"
  | "migration_criteria"
> = {
  identity_policy: {
    canonical_endpoint_required: true,
    ambiguous_alias_resolution: "reject",
    superseded_endpoint_resolution: "rewrite_to_survivor",
    local_id_scope: "source",
  },
  evidence_policy: {
    minimum_refs_per_relation: 1,
    block_identity_required: true,
    hash_required: true,
    broad_same_page_block_threshold: 5,
  },
  finding_codes: {
    REL_ENDPOINT_DANGLING: {
      default_severity: "error",
      enforcement_eligible: true,
    },
    REL_ENDPOINT_LOCAL_ONLY: {
      default_severity: "error",
      enforcement_eligible: true,
    },
    REL_ENDPOINT_LOCAL_MISMATCH: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_ENDPOINT_SUPERSEDED: {
      default_severity: "error",
      enforcement_eligible: true,
    },
    REL_ALIAS_AMBIGUOUS: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_CONTRACT_RULE_MISSING: {
      default_severity: "error",
      enforcement_eligible: true,
    },
    REL_ENDPOINT_TYPE_INVALID: {
      default_severity: "error",
      enforcement_eligible: true,
    },
    REL_FAMILY_TYPE_SUSPECT: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_FAMILY_TYPE_SUSPECT_REVIEWED: {
      default_severity: "warning",
      enforcement_eligible: false,
    },
    REL_DERIVATION_DANGLING: {
      default_severity: "error",
      enforcement_eligible: true,
    },
    REL_EVIDENCE_MISSING: {
      default_severity: "error",
      enforcement_eligible: true,
    },
    REL_EVIDENCE_UNRESOLVED: {
      default_severity: "error",
      enforcement_eligible: true,
    },
    REL_EVIDENCE_OVERBROAD: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_DUPLICATE_IDENTITY: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_CONFLICTING_EDGE: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_MERGED_EDGE_CONFLICT: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_SOURCE_ID_MISSING: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_SOURCE_ID_AMBIGUOUS: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_ORPHAN_RECORD: {
      default_severity: "info",
      enforcement_eligible: false,
    },
    REL_REQUIRED_ROUTE_MISSING: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_REQUIRED_TREATMENT_MISSING: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_REQUIRED_SEGMENT_MISSING: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_REQUIRED_ONSET_MISSING: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_REQUIRED_PHASE_MISSING: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
    REL_REQUIRED_DISPOSITION_MISSING: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
  },
  completeness_roles: {
    study_projectable_operational_occurrence: {
      required_roles: [
        "occurrence_identity",
        "treatment_scope",
        "route_scope",
        "operational_onset",
        "phase_identity",
        "physical_scope_when_supported",
      ],
      disposition_allowed: true,
    },
    physical_bus_lane_treatment: {
      required_roles: [
        "corridor_or_bounded_segment",
        "official_extent_when_available",
        "authoritative_route_scope_only",
      ],
      disposition_allowed: true,
    },
    non_projectable_route_identity_selector: {
      required_roles: [
        "typed_route_identity_disposition",
        "evidence_binding",
      ],
      disposition_allowed: true,
    },
    non_projectable_operational_event_selector: {
      required_roles: [
        "typed_operational_event_disposition",
        "evidence_binding",
      ],
      disposition_allowed: true,
    },
    non_projectable_bus_lane_treatment_selector: {
      required_roles: [
        "typed_bus_lane_treatment_disposition",
        "evidence_binding",
      ],
      disposition_allowed: true,
    },
  },
  migration_criteria: {
    referential_and_evidence: [
      "endpoint, canonical-identity, exact-matrix type, and evidence violations are zero",
      "every observed relation kind has a frozen exact endpoint rule",
      "repository and SQLite finding identities reconcile exactly",
      "no contract rule was relaxed to reduce a finding count",
      "every frozen-observed baseline endpoint tuple has an explicit semantic review decision before endpoint-type enforcement is declared complete",
    ],
    completeness: [
      "every in-scope record satisfies every required role or has an immutable evidence-bound reviewed non-projectable disposition",
      "a disposition always sets study_projection_eligible=false",
      "required-route, treatment, segment, onset, and phase warning counts reconcile to the disposition ledger",
    ],
    candidate_acquisition: [
      "all 321 pinned registry-only bus-lane candidates have completed acquisition receipts",
      "every evidence-supported canonical link is materialized",
      "unsupported registry projections have explicit exclusion artifacts",
      "unresolved candidates are not labeled permanently nonfixable solely because prior evidence was absent",
    ],
    determinism: [
      "warning and enforcement modes emit the same ordered finding identities",
      "two clean authoritative materializations and two public-clone SQLite rebuilds reproduce hashes",
      "all repository, schema, architecture, quality, validation, and export tests pass",
    ],
  },
};

export type LoadedRelationshipContract = {
  contract: RelationshipContract;
  matrix:
    | RelationshipEndpointMatrix
    | RelationshipFinalEndpointMatrix;
  baselineTupleReviewInventory?:
    | RelationshipBaselineTupleReviewInventory
    | undefined;
  reviewedTupleExpansionLedger?:
    | RelationshipReviewedTupleExpansionLedger
    | undefined;
  enforcementProof?: RelationshipEnforcementProof | undefined;
  enforcementTransitionReceipt?:
    | RelationshipEnforcementTransitionReceipt
    | undefined;
  rulesByKind: Map<
    string,
    RelationshipEndpointRule | RelationshipFinalEndpointRule
  >;
};

export function relationshipContractPath(): string {
  return join(repoRoot, "data", "contracts", "relationships", "v1", "contract.json");
}

function parseJsonFile<T>(path: string, label: string): T {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function referencedPath(path: string): string {
  return isAbsolute(path) ? path : join(repoRoot, path);
}

function isSha256(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{64}$/u.test(value)
  );
}

export function assertRelationshipContractPolicyV1(
  contract: RelationshipContract,
): void {
  if (contract.schema_version !== 1 || contract.contract_id !== RELATIONSHIP_CONTRACT_ID) {
    throw new Error(`Unsupported relationship contract ${String(contract.contract_id)} schema ${String(contract.schema_version)}`);
  }
  if (
    typeof contract.reviewed_at !== "string" ||
    !contract.reviewed_at.trim() ||
    contract.reviewed_at !== contract.reviewed_at.trim() ||
    typeof contract.reviewed_by !== "string" ||
    !contract.reviewed_by.trim() ||
    contract.reviewed_by !== contract.reviewed_by.trim()
  ) {
    throw new Error(
      "Relationship contract requires immutable reviewed_at and reviewed_by provenance",
    );
  }
  const legacyFamilyCodes: Record<
    string,
    RelationshipFindingCodeConfig
  > = {
    ...RELATIONSHIP_CONTRACT_POLICY_V1.finding_codes,
    REL_FAMILY_TYPE_SUSPECT: {
      default_severity: "warning" as const,
      enforcement_eligible: false,
    },
  };
  delete legacyFamilyCodes.REL_FAMILY_TYPE_SUSPECT_REVIEWED;
  if (
    stableJson(contract.finding_codes as unknown as JsonValue) ===
    stableJson(legacyFamilyCodes as unknown as JsonValue)
  ) {
    // Read-only compatibility for the warning-first artifact that predates the
    // reviewed-advisory split. Runtime policy is upgraded in memory to the
    // strictly stronger fail-closed version; arbitrary drift is still rejected.
    contract.finding_codes = structuredClone(
      RELATIONSHIP_CONTRACT_POLICY_V1.finding_codes,
    );
  }
  for (const field of [
    "identity_policy",
    "evidence_policy",
    "finding_codes",
    "completeness_roles",
    "migration_criteria",
  ] as const) {
    if (
      stableJson(contract[field] as unknown as JsonValue) !==
      stableJson(
        RELATIONSHIP_CONTRACT_POLICY_V1[field] as unknown as JsonValue,
      )
    ) {
      throw new Error(
        `Relationship contract v1 ${field} drifted from its fail-closed versioned policy`,
      );
    }
  }
  if (contract.endpoint_matrix.unlisted_relation_policy !== "error" || contract.endpoint_matrix.new_shape_policy !== "error") {
    throw new Error("Relationship contract must fail closed for unlisted relation kinds and endpoint shapes");
  }
  if (
    contract.contract_status !== "warning_first" &&
    contract.contract_status !== "enforced"
  ) {
    throw new Error(
      `Unsupported relationship contract status ${String(contract.contract_status)}`,
    );
  }
  const pointer = contract.endpoint_matrix;
  if (
    pointer.matrix_kind === "post_remediation_reviewed" &&
    (pointer.obsolete_baseline_tuple_policy !== "reject" ||
      pointer.relation_count === undefined ||
      pointer.tuple_count === undefined ||
      !isSha256(pointer.relation_ids_sha256) ||
      !isSha256(pointer.tuple_set_sha256))
  ) {
    throw new Error(
      "Post-remediation relationship matrix pointer must pin counts, hashes, and reject obsolete baseline tuples",
    );
  }
  if (contract.enforcement_proof) {
    const gateIds = contract.enforcement_proof.required_gate_ids;
    const expectedGateIds = [
      ...RELATIONSHIP_ENFORCEMENT_GATE_IDS,
    ].sort();
    const configuredGateIds = [...gateIds].sort();
    if (
      typeof contract.enforcement_proof.path !== "string" ||
      !contract.enforcement_proof.path.trim() ||
      !isSha256(contract.enforcement_proof.sha256) ||
      new Set(gateIds).size !== gateIds.length ||
      gateIds.some((gateId) => !gateId.trim()) ||
      configuredGateIds.length !== expectedGateIds.length ||
      configuredGateIds.some(
        (gateId, index) => gateId !== expectedGateIds[index],
      )
    ) {
      throw new Error(
        "Relationship enforcement proof pointer is not content-addressed with the complete immutable gate set",
      );
    }
    const receipt = contract.enforcement_proof.transition_receipt;
    if (
      receipt &&
      (typeof receipt.path !== "string" ||
        !receipt.path.trim() ||
        !isSha256(receipt.sha256))
    ) {
      throw new Error(
        "Relationship enforcement transition receipt pointer is not content-addressed",
      );
    }
  }
  if (
    contract.enforcement_state !== undefined &&
    contract.enforcement_state !== "warning_ready" &&
    contract.enforcement_state !== "enforced_refresh_required" &&
    contract.enforcement_state !== "enforced_ready"
  ) {
    throw new Error(
      `Unsupported relationship enforcement state ${String(contract.enforcement_state)}`,
    );
  }
  if (
    contract.contract_status === "warning_first" &&
    (contract.enforcement_state === "enforced_refresh_required" ||
      contract.enforcement_state === "enforced_ready")
  ) {
    throw new Error(
      "Warning-first relationship contract cannot claim an enforced transition state",
    );
  }
  if (
    contract.enforcement_state === "warning_ready" &&
    (!contract.enforcement_proof ||
      contract.enforcement_proof.transition_receipt)
  ) {
    throw new Error(
      "warning_ready requires a pre-promotion proof and forbids a transition receipt",
    );
  }
  if (
    contract.contract_status === "warning_first" &&
    contract.enforcement_proof &&
    contract.enforcement_state !== "warning_ready"
  ) {
    throw new Error(
      "A warning-first proof pointer is valid only in warning_ready state",
    );
  }
  if (
    contract.contract_status === "enforced" &&
    (!contract.enforcement_proof ||
      !contract.enforcement_proof.transition_receipt ||
      pointer.matrix_kind !== "post_remediation_reviewed" ||
      (contract.enforcement_state !== "enforced_refresh_required" &&
        contract.enforcement_state !== "enforced_ready"))
  ) {
    throw new Error(
      "Enforced relationship contract requires a reviewed post-remediation matrix, transition receipt, and explicit refresh state",
    );
  }
  if (contract.evidence_policy.minimum_refs_per_relation < 1) {
    throw new Error("Relationship contract must require at least one evidence ref per relation");
  }
}

function assertContractShape(contract: RelationshipContract): void {
  assertRelationshipContractPolicyV1(contract);
}

function familyShapeKey(
  relationKind: string,
  relationFamily: string,
  subjectKind: MtaObservationKind,
  objectKind: MtaObservationKind,
): string {
  return `${relationKind}\0${relationFamily}\0${subjectKind}\0${objectKind}`;
}

function assertMatrixShape(matrix: RelationshipEndpointMatrix): void {
  if (matrix.schema_version !== 1 || matrix.contract_id !== RELATIONSHIP_CONTRACT_ID) {
    throw new Error(`Unsupported relationship endpoint matrix ${String(matrix.contract_id)} schema ${String(matrix.schema_version)}`);
  }
  if (matrix.relation_kind_rule_count !== matrix.rules.length) {
    throw new Error(`Relationship endpoint matrix rule count ${matrix.relation_kind_rule_count} does not match ${matrix.rules.length}`);
  }
  if (!matrix.tuple_provenance) throw new Error("Relationship endpoint matrix tuple provenance is missing");
  const kinds = new Set<string>();
  let tupleCount = 0;
  for (const rule of matrix.rules) {
    if (kinds.has(rule.relation_kind)) throw new Error(`Duplicate relationship endpoint rule: ${rule.relation_kind}`);
    kinds.add(rule.relation_kind);
    if (rule.allowed_shapes.length === 0) throw new Error(`Relationship endpoint rule has no allowed shapes: ${rule.relation_kind}`);
    if (rule.allowed_family_shapes.length === 0) {
      throw new Error(`Relationship endpoint rule has no allowed family/shape tuples: ${rule.relation_kind}`);
    }
    const tuples = new Set<string>();
    for (const tuple of rule.allowed_family_shapes) {
      tupleCount += 1;
      if (!rule.relation_families.includes(tuple.relation_family)) {
        throw new Error(`Relationship endpoint tuple has unlisted family ${rule.relation_kind}/${tuple.relation_family}`);
      }
      if (!rule.allowed_shapes.some((shape) =>
        shape.subject_kind === tuple.subject_kind && shape.object_kind === tuple.object_kind)) {
        throw new Error(
          `Relationship endpoint tuple has unlisted shape ${rule.relation_kind}/${tuple.subject_kind}->${tuple.object_kind}`,
        );
      }
      const key = `${tuple.relation_family}\0${tuple.subject_kind}\0${tuple.object_kind}`;
      if (tuples.has(key)) throw new Error(`Duplicate relationship endpoint tuple: ${rule.relation_kind}/${key}`);
      tuples.add(key);
      if (tuple.provenance === "frozen_observed_baseline") {
        if (tuple.review_decision_ids.length !== 0) {
          throw new Error(`Frozen-observed tuple must not imply semantic approval: ${rule.relation_kind}/${key}`);
        }
      } else if (tuple.provenance === "reviewed_expansion") {
        if (tuple.review_decision_ids.length !== 1 || !tuple.review_decision_ids[0]?.trim()) {
          throw new Error(`Reviewed expansion tuple must cite exactly one decision: ${rule.relation_kind}/${key}`);
        }
      } else {
        throw new Error(`Unsupported relationship endpoint tuple provenance: ${rule.relation_kind}/${key}`);
      }
    }
  }
  if (matrix.allowed_family_shape_count !== tupleCount) {
    throw new Error(
      `Relationship endpoint matrix tuple count ${matrix.allowed_family_shape_count} does not match ${tupleCount}`,
    );
  }
}

function finalTupleKey(
  relationKind: string,
  relationFamily: string,
  subjectKind: MtaObservationKind,
  objectKind: MtaObservationKind,
): string {
  return [
    relationKind,
    relationFamily,
    subjectKind,
    objectKind,
  ].join("\0");
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function assertRelationshipFinalEndpointMatrix(
  matrix: RelationshipFinalEndpointMatrix,
): void {
  if (
    matrix.schema_version !== 1 ||
    matrix.contract_id !== RELATIONSHIP_CONTRACT_ID ||
    matrix.matrix_id !==
      "relationship-contract-v1-post-remediation-final" ||
    matrix.review_status !== "reviewed_post_remediation" ||
    matrix.obsolete_baseline_tuple_policy !== "reject"
  ) {
    throw new Error(
      "Unsupported or unreviewed post-remediation relationship endpoint matrix",
    );
  }
  if (
    matrix.generated_from.campaign_id !==
      "relationship-semantic-remediation-v1" ||
    matrix.generated_from.skipped_correction_count !== 0 ||
    matrix.generated_from.unmapped_relation_count !== 0
  ) {
    throw new Error(
      "Post-remediation relationship matrix source gates are not zero",
    );
  }
  for (const value of [
    matrix.generated_from.projected_relations_sha256,
    matrix.generated_from.projected_relations_logical_sha256,
    matrix.generated_from.projected_tuples_sha256,
    matrix.generated_from.projected_tuples_logical_sha256,
    matrix.generated_from.semantic_remediation_summary_sha256,
    matrix.relation_ids_sha256,
    matrix.tuple_set_sha256,
  ]) {
    if (!isSha256(value)) {
      throw new Error(
        "Post-remediation relationship matrix contains an invalid SHA-256 pin",
      );
    }
  }
  if (matrix.relation_kind_rule_count !== matrix.rules.length) {
    throw new Error(
      "Post-remediation relationship matrix rule count does not reconcile",
    );
  }

  const relationKinds = new Set<string>();
  const tuples = new Set<string>();
  let tupleCount = 0;
  let relationCount = 0;
  for (const rule of matrix.rules) {
    const listedFamilies = sortedUnique(
      rule.relation_families,
    );
    const listedShapeKeys = rule.allowed_shapes.map((shape) =>
      finalTupleKey(
        rule.relation_kind,
        "",
        shape.subject_kind,
        shape.object_kind,
      )
    );
    if (
      !rule.relation_kind.trim() ||
      relationKinds.has(rule.relation_kind) ||
      rule.review_basis !== "reviewed_post_remediation" ||
      listedFamilies.length !== rule.relation_families.length ||
      listedFamilies.some((family) => !family.trim()) ||
      stableJson(
        listedFamilies as unknown as JsonValue,
      ) !==
        stableJson(
          rule.relation_families as unknown as JsonValue,
        ) ||
      rule.allowed_shapes.length === 0 ||
      new Set(listedShapeKeys).size !== listedShapeKeys.length ||
      rule.allowed_family_shapes.length === 0
    ) {
      throw new Error(
        `Invalid post-remediation relationship rule ${rule.relation_kind}`,
      );
    }
    relationKinds.add(rule.relation_kind);
    const tupleFamilies = new Set<string>();
    const tupleShapeKeys = new Set<string>();
    for (const tuple of rule.allowed_family_shapes) {
      const key = finalTupleKey(
        rule.relation_kind,
        tuple.relation_family,
        tuple.subject_kind,
        tuple.object_kind,
      );
      if (
        tuples.has(key) ||
        tuple.provenance !== "reviewed_post_remediation" ||
        tuple.review_decision_ids.length === 0 ||
        tuple.review_decision_ids.some(
          (decisionId) => !decisionId.trim(),
        ) ||
        stableJson(
          sortedUnique(
            tuple.review_decision_ids,
          ) as unknown as JsonValue,
        ) !==
          stableJson(
            tuple.review_decision_ids as unknown as JsonValue,
          ) ||
        tuple.relation_count < 1 ||
        !isSha256(tuple.relation_ids_sha256) ||
        !rule.relation_families.includes(tuple.relation_family) ||
        !rule.allowed_shapes.some(
          (shape) =>
            shape.subject_kind === tuple.subject_kind &&
            shape.object_kind === tuple.object_kind,
        )
      ) {
        throw new Error(
          `Invalid or unreviewed post-remediation relationship tuple ${key}`,
        );
      }
      tuples.add(key);
      tupleFamilies.add(tuple.relation_family);
      tupleShapeKeys.add(
        finalTupleKey(
          rule.relation_kind,
          "",
          tuple.subject_kind,
          tuple.object_kind,
        ),
      );
      tupleCount += 1;
      relationCount += tuple.relation_count;
    }
    if (
      tupleFamilies.size !== listedFamilies.length ||
      listedFamilies.some((family) => !tupleFamilies.has(family)) ||
      tupleShapeKeys.size !== listedShapeKeys.length ||
      listedShapeKeys.some((shape) => !tupleShapeKeys.has(shape))
    ) {
      throw new Error(
        `Post-remediation relationship rule retains unprojected family/shape metadata: ${rule.relation_kind}`,
      );
    }
  }
  if (
    tupleCount !== matrix.allowed_family_shape_count ||
    relationCount !== matrix.covered_relation_count
  ) {
    throw new Error(
      "Post-remediation relationship matrix tuple/relation counts do not reconcile",
    );
  }
}

export function assertRelationshipFinalMatrixProjection(
  matrix: RelationshipFinalEndpointMatrix,
  relations: RelationshipProjectedRelation[],
  inventory: RelationshipProjectedTupleInventory,
): void {
  assertRelationshipFinalEndpointMatrix(matrix);
  if (
    inventory.schema_version !== 1 ||
    inventory.unmapped_relation_count !== 0 ||
    inventory.relation_count !== relations.length ||
    inventory.tuple_count !== inventory.tuples.length
  ) {
    throw new Error(
      "Projected relationship tuple inventory header does not reconcile",
    );
  }

  const relationIds = relations
    .map((relation) => relation.relation_id)
    .sort((left, right) => left.localeCompare(right));
  if (
    new Set(relationIds).size !== relationIds.length ||
    sha256(stableJson(relationIds as unknown as JsonValue)) !==
      inventory.relation_ids_sha256 ||
    sha256(
      stableJson(inventory.tuples as unknown as JsonValue),
    ) !== inventory.tuples_sha256
  ) {
    throw new Error(
      "Projected relationship relation/tuple hashes do not reconcile",
    );
  }

  const relationGroups = new Map<
    string,
    {
      relationIds: string[];
      reviewDecisionIds: string[];
      remediationDecisionIds: string[];
    }
  >();
  for (const relation of relations) {
    const allDecisionIds = sortedUnique([
      ...relation.semantic_review_decision_ids,
      ...relation.semantic_remediation_decision_ids,
    ]);
    if (
      relation.mapping_status !== "mapped" ||
      allDecisionIds.length === 0
    ) {
      throw new Error(
        `Projected relationship lacks semantic provenance: ${relation.relation_id}`,
      );
    }
    const key = finalTupleKey(
      relation.relation_kind,
      relation.relation_family,
      relation.subject_kind,
      relation.object_kind,
    );
    const group = relationGroups.get(key) ?? {
      relationIds: [],
      reviewDecisionIds: [],
      remediationDecisionIds: [],
    };
    group.relationIds.push(relation.relation_id);
    group.reviewDecisionIds.push(
      ...relation.semantic_review_decision_ids,
    );
    group.remediationDecisionIds.push(
      ...relation.semantic_remediation_decision_ids,
    );
    relationGroups.set(key, group);
  }

  const inventoryByTuple = new Map<string, RelationshipProjectedTuple>();
  for (const tuple of inventory.tuples) {
    const key = finalTupleKey(
      tuple.relation_kind,
      tuple.relation_family,
      tuple.subject_kind,
      tuple.object_kind,
    );
    const group = relationGroups.get(key);
    const decisionIds = sortedUnique([
      ...tuple.semantic_review_decision_ids,
      ...tuple.semantic_remediation_decision_ids,
    ]);
    if (
      inventoryByTuple.has(key) ||
      !group ||
      decisionIds.length === 0 ||
      tuple.relation_count !== group.relationIds.length ||
      tuple.relation_ids_sha256 !==
        sha256(
          stableJson(
            group.relationIds.sort() as unknown as JsonValue,
          ),
        ) ||
      stableJson(
        sortedUnique(group.reviewDecisionIds) as unknown as JsonValue,
      ) !==
        stableJson(
          tuple.semantic_review_decision_ids as unknown as JsonValue,
        ) ||
      stableJson(
        sortedUnique(
          group.remediationDecisionIds,
        ) as unknown as JsonValue,
      ) !==
        stableJson(
          tuple.semantic_remediation_decision_ids as unknown as JsonValue,
        )
    ) {
      throw new Error(
        `Projected relationship tuple does not reconcile exactly: ${key}`,
      );
    }
    inventoryByTuple.set(key, tuple);
  }
  if (
    inventoryByTuple.size !== relationGroups.size ||
    matrix.allowed_family_shape_count !== inventoryByTuple.size ||
    matrix.covered_relation_count !== relations.length ||
    matrix.relation_ids_sha256 !== inventory.relation_ids_sha256 ||
    matrix.tuple_set_sha256 !== inventory.tuples_sha256
  ) {
    throw new Error(
      "Final relationship matrix retains obsolete tuples or omits projected tuples",
    );
  }

  const matrixByTuple = new Map<
    string,
    RelationshipFinalEndpointFamilyShape
  >();
  for (const rule of matrix.rules) {
    for (const tuple of rule.allowed_family_shapes) {
      matrixByTuple.set(
        finalTupleKey(
          rule.relation_kind,
          tuple.relation_family,
          tuple.subject_kind,
          tuple.object_kind,
        ),
        tuple,
      );
    }
  }
  for (const [key, projected] of inventoryByTuple) {
    const tuple = matrixByTuple.get(key);
    const expectedDecisionIds = sortedUnique([
      ...projected.semantic_review_decision_ids,
      ...projected.semantic_remediation_decision_ids,
    ]);
    if (
      !tuple ||
      tuple.relation_count !== projected.relation_count ||
      tuple.relation_ids_sha256 !==
        projected.relation_ids_sha256 ||
      stableJson(
        tuple.review_decision_ids as unknown as JsonValue,
      ) !==
        stableJson(expectedDecisionIds as unknown as JsonValue)
    ) {
      throw new Error(
        `Final relationship matrix tuple differs from reviewed projection: ${key}`,
      );
    }
  }
}

export function assertRelationshipTupleProvenance(
  matrix: RelationshipEndpointMatrix,
  baseline: RelationshipBaselineTupleReviewInventory,
  expansionLedger: RelationshipReviewedTupleExpansionLedger,
): void {
  if (baseline.schema_version !== 1 || baseline.contract_id !== RELATIONSHIP_CONTRACT_ID) {
    throw new Error("Unsupported relationship baseline tuple inventory");
  }
  if (baseline.review_status !== "frozen_observed_not_semantically_reviewed" ||
      baseline.semantically_reviewed_tuple_count !== 0) {
    throw new Error("Frozen relationship baseline must not be represented as semantically reviewed");
  }
  if (baseline.tuple_count !== baseline.tuples.length) {
    throw new Error(`Relationship baseline tuple count ${baseline.tuple_count} does not match ${baseline.tuples.length}`);
  }
  const baselineKeys = new Set<string>();
  let baselineAssignments = 0;
  let baselineExactRuleTuples = 0;
  let baselineFrozenRuleTuples = 0;
  for (const tuple of baseline.tuples) {
    const key = familyShapeKey(
      tuple.relation_kind,
      tuple.relation_family,
      tuple.subject_kind,
      tuple.object_kind,
    );
    if (baselineKeys.has(key)) throw new Error(`Duplicate relationship baseline tuple: ${key}`);
    baselineKeys.add(key);
    if (tuple.review_status !== "frozen_observed_not_semantically_reviewed") {
      throw new Error(`Relationship baseline tuple falsely claims review: ${key}`);
    }
    if (tuple.observed_relation_count < 1 || !/^[a-f0-9]{64}$/.test(tuple.observed_relation_record_ids_sha256)) {
      throw new Error(`Relationship baseline tuple observation inventory is invalid: ${key}`);
    }
    baselineAssignments += tuple.observed_relation_count;
    if (tuple.rule_review_basis === "existing_exact_rule") baselineExactRuleTuples += 1;
    else if (tuple.rule_review_basis === "frozen_observed_shape") baselineFrozenRuleTuples += 1;
    else throw new Error(`Unsupported relationship baseline rule basis: ${key}`);
  }
  if (baseline.relation_assignment_count !== baselineAssignments) {
    throw new Error(
      `Relationship baseline assignment count ${baseline.relation_assignment_count} does not match ${baselineAssignments}`,
    );
  }
  if (baseline.rule_basis_counts.existing_exact_rule_tuples !== baselineExactRuleTuples ||
      baseline.rule_basis_counts.frozen_observed_shape_tuples !== baselineFrozenRuleTuples) {
    throw new Error("Relationship baseline rule-basis counts do not reconcile with its tuple inventory");
  }

  if (expansionLedger.schema_version !== 1 || expansionLedger.contract_id !== RELATIONSHIP_CONTRACT_ID ||
      expansionLedger.review_status !== "approved") {
    throw new Error("Unsupported or unapproved relationship tuple expansion ledger");
  }
  if (expansionLedger.expansion_tuple_count !== expansionLedger.expansions.length) {
    throw new Error(
      `Relationship expansion tuple count ${expansionLedger.expansion_tuple_count} does not match ${expansionLedger.expansions.length}`,
    );
  }
  const expansionByKey = new Map<string, string>();
  const expansionDecisionIds = new Set<string>();
  const affectedRecordIds = new Set<string>();
  const correctionIds = new Set<string>();
  for (const expansion of expansionLedger.expansions) {
    const key = familyShapeKey(
      expansion.relation_kind,
      expansion.relation_family,
      expansion.subject_kind,
      expansion.object_kind,
    );
    if (expansionByKey.has(key)) throw new Error(`Duplicate reviewed relationship expansion tuple: ${key}`);
    if (expansionDecisionIds.has(expansion.decision_id)) {
      throw new Error(`Duplicate relationship expansion decision id: ${expansion.decision_id}`);
    }
    expansionByKey.set(key, expansion.decision_id);
    expansionDecisionIds.add(expansion.decision_id);
    if (expansion.affected_relation_count !== expansion.affected_relations.length || expansion.affected_relations.length === 0) {
      throw new Error(`Relationship expansion affected count is invalid: ${expansion.decision_id}`);
    }
    for (const affected of expansion.affected_relations) {
      if (affectedRecordIds.has(affected.record_id)) {
        throw new Error(`Relationship expansion relation is assigned more than once: ${affected.record_id}`);
      }
      if (affected.correction_ids.length === 0 || affected.legacy_ledger_item_ids.length === 0 ||
          affected.evidence_ids.length === 0 || affected.correction_reasons.length === 0 ||
          affected.legacy_investigations.length === 0 || affected.legacy_reasons.length === 0) {
        throw new Error(`Relationship expansion lacks review provenance: ${affected.record_id}`);
      }
      affectedRecordIds.add(affected.record_id);
      for (const correctionId of affected.correction_ids) correctionIds.add(correctionId);
    }
  }
  if (expansionLedger.affected_relation_count !== affectedRecordIds.size) {
    throw new Error(
      `Relationship expansion affected count ${expansionLedger.affected_relation_count} does not match ${affectedRecordIds.size}`,
    );
  }
  if (expansionLedger.selected_correction_count !== correctionIds.size) {
    throw new Error(
      `Relationship expansion correction count ${expansionLedger.selected_correction_count} does not match ${correctionIds.size}`,
    );
  }

  const matrixBaselineKeys = new Set<string>();
  const matrixExpansionByKey = new Map<string, string>();
  for (const rule of matrix.rules) {
    for (const tuple of rule.allowed_family_shapes) {
      const key = familyShapeKey(rule.relation_kind, tuple.relation_family, tuple.subject_kind, tuple.object_kind);
      if (tuple.provenance === "frozen_observed_baseline") matrixBaselineKeys.add(key);
      else matrixExpansionByKey.set(key, tuple.review_decision_ids[0]!);
    }
  }
  const sameSet = (left: Set<string>, right: Set<string>): boolean =>
    left.size === right.size && [...left].every((key) => right.has(key));
  if (!sameSet(matrixBaselineKeys, baselineKeys)) {
    throw new Error("Relationship matrix frozen tuples do not reconcile with the baseline inventory");
  }
  if (matrixExpansionByKey.size !== expansionByKey.size ||
      [...expansionByKey].some(([key, decisionId]) => matrixExpansionByKey.get(key) !== decisionId)) {
    throw new Error("Relationship matrix reviewed tuples do not reconcile with the expansion ledger");
  }
  if (matrix.tuple_provenance.baseline_inventory.tuple_count !== baseline.tuple_count ||
      matrix.tuple_provenance.baseline_inventory.relation_assignment_count !== baseline.relation_assignment_count ||
      matrix.tuple_provenance.baseline_inventory.semantic_review_status !== baseline.review_status) {
    throw new Error("Relationship matrix baseline provenance metadata does not reconcile");
  }
  if (matrix.tuple_provenance.reviewed_expansion_ledger.tuple_count !== expansionLedger.expansion_tuple_count ||
      matrix.tuple_provenance.reviewed_expansion_ledger.affected_relation_count !== expansionLedger.affected_relation_count ||
      matrix.tuple_provenance.reviewed_expansion_ledger.review_status !== expansionLedger.review_status) {
    throw new Error("Relationship matrix expansion provenance metadata does not reconcile");
  }
}

export const RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS: Record<
  (typeof RELATIONSHIP_ENFORCEMENT_GATE_IDS)[number],
  readonly { role: string; path: string }[]
> = {
  bus_lane_acquisition_linkage: [
    {
      role: "acquisition_summary",
      path: "data/quality/relationship-integrity/bus-lane-acquisition/summary.json",
    },
    {
      role: "linkage_materialization_summary",
      path: "data/quality/relationship-integrity/bus-lane-acquisition/linkage-materialization/summary.json",
    },
    {
      role: "linkage_reconciliation_summary",
      path: "data/quality/relationship-integrity/bus-lane-acquisition/linkage-reconciliation/summary.json",
    },
  ],
  determinism_and_consumer_proof: [
    {
      role: "determinism_consumer_summary",
      path: "data/quality/relationship-integrity/determinism-consumer/summary.json",
    },
  ],
  occurrence_treatment_physicality: [
    {
      role: "occurrence_treatment_physicality_summary",
      path: "data/quality/relationship-integrity/occurrence-treatment-physicality/summary.json",
    },
    {
      role: "phase_review_summary",
      path: "data/quality/relationship-integrity/operational-occurrence-phases/summary.json",
    },
  ],
  payload_reference_integrity: [
    {
      role: "payload_reference_summary",
      path: "data/quality/relationship-integrity/payload-references/summary.json",
    },
  ],
  referential_type_evidence_integrity: [
    {
      role: "graph_audit_findings",
      path: "data/quality/relationship-integrity/graph-audit/findings.jsonl",
    },
    {
      role: "graph_audit_manifest",
      path: "data/quality/relationship-integrity/graph-audit/manifest.json",
    },
    {
      role: "graph_audit_summary",
      path: "data/quality/relationship-integrity/graph-audit/summary.json",
    },
    {
      role: "sql_integrity_summary",
      path: "data/quality/relationship-integrity/sql-integrity/summary.json",
    },
  ],
  relationship_completeness: [
    {
      role: "relationship_completeness_summary",
      path: "data/quality/relationship-integrity/completeness/summary.json",
    },
  ],
  semantic_remediation: [
    {
      role: "semantic_remediation_summary",
      path: "data/quality/relationship-integrity/semantic-remediation/summary.json",
    },
  ],
};

function enforcementObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      `Relationship enforcement ${label} must be an object`,
    );
  }
  return value as Record<string, unknown>;
}

function enforcementNested(
  value: Record<string, unknown>,
  ...path: string[]
): unknown {
  let current: unknown = value;
  for (const segment of path) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function numericRecordTotal(value: unknown): number | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }
  let total = 0;
  for (const entry of Object.values(
    value as Record<string, unknown>,
  )) {
    if (
      typeof entry !== "number" ||
      !Number.isInteger(entry) ||
      entry < 0
    ) {
      return null;
    }
    total += entry;
  }
  return total;
}

function equalDigestPair(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((entry) => isSha256(entry)) &&
    value[0] === value[1]
  );
}

function readEnforcementSource(
  role: string,
  path: string,
  expectedSha256: string,
  artifactText: (path: string) => string,
): string {
  let text: string;
  try {
    text = artifactText(path);
  } catch (error) {
    throw new Error(
      `Relationship enforcement source artifact is missing: ${role}/${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (sha256(text) !== expectedSha256) {
    throw new Error(
      `Relationship enforcement source artifact hash mismatch: ${role}/${path}`,
    );
  }
  return text;
}

function parseEnforcementJsonSource(
  role: string,
  path: string,
  text: string,
): Record<string, unknown> {
  try {
    return enforcementObject(
      JSON.parse(text) as unknown,
      `source ${role}`,
    );
  } catch (error) {
    throw new Error(
      `Relationship enforcement source artifact is invalid JSON: ${role}/${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseEnforcementJsonlSource(
  role: string,
  path: string,
  text: string,
): Record<string, unknown>[] {
  return text
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return enforcementObject(
          JSON.parse(line) as unknown,
          `source ${role} row ${index + 1}`,
        );
      } catch (error) {
        throw new Error(
          `Relationship enforcement source artifact is invalid JSONL: ${role}/${path}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
}

function assertRelationshipEnforcementGateArtifact(
  gateId: string,
  artifactContents: string,
  matrix: RelationshipFinalEndpointMatrix,
  artifactText: (path: string) => string,
): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(artifactContents) as unknown;
  } catch (error) {
    throw new Error(
      `Relationship enforcement gate artifact is invalid JSON: ${gateId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const artifact = enforcementObject(
    parsed,
    `gate ${gateId}`,
  );
  const allowedArtifactKeys = [
    "schema_version",
    "artifact_id",
    "contract_id",
    "gate_id",
    "reviewed_at",
    "reviewed_by",
    "source_count",
    "source_artifacts",
    "derived_violation_count",
  ];
  const unexpectedArtifactKeys = Object.keys(artifact).filter(
    (key) => !allowedArtifactKeys.includes(key),
  );
  if (
    unexpectedArtifactKeys.length > 0 ||
    artifact.schema_version !== 1 ||
    artifact.artifact_id !==
      `relationship-contract-v1-enforcement-gate:${gateId}` ||
    artifact.contract_id !== RELATIONSHIP_CONTRACT_ID ||
    artifact.gate_id !== gateId ||
    typeof artifact.reviewed_at !== "string" ||
    !artifact.reviewed_at.trim() ||
    typeof artifact.reviewed_by !== "string" ||
    !artifact.reviewed_by.trim() ||
    artifact.derived_violation_count !== 0 ||
    !Array.isArray(artifact.source_artifacts) ||
    artifact.source_count !== artifact.source_artifacts.length
  ) {
    throw new Error(
      `Relationship enforcement gate artifact header is invalid: ${gateId}`,
    );
  }
  const requiredSources = (
    RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS as Record<
      string,
      readonly { role: string; path: string }[]
    >
  )[gateId];
  if (!requiredSources) {
    throw new Error(
      `Relationship enforcement gate has no versioned source contract: ${gateId}`,
    );
  }
  const sources = artifact.source_artifacts.map(
    (sourceValue, index) => {
      const source = enforcementObject(
        sourceValue,
        `gate ${gateId} source ${index}`,
      );
      const unexpected = Object.keys(source).filter(
        (key) =>
          !["role", "path", "sha256"].includes(key),
      );
      if (
        unexpected.length > 0 ||
        typeof source.role !== "string" ||
        !source.role.trim() ||
        typeof source.path !== "string" ||
        !source.path.trim() ||
        !isSha256(source.sha256)
      ) {
        throw new Error(
          `Relationship enforcement gate source pin is invalid: ${gateId}/${index}`,
        );
      }
      return {
        role: source.role,
        path: source.path,
        sha256: source.sha256,
      };
    },
  );
  const sortedSources = [...sources].sort(
    (left, right) =>
      left.role.localeCompare(right.role) ||
      left.path.localeCompare(right.path),
  );
  const observedRoles = sources.map((source) => source.role);
  const observedSourcePaths = sources.map(({ role, path }) => ({
    role,
    path,
  }));
  const expectedSourcePaths = [...requiredSources].sort(
    (left, right) =>
      left.role.localeCompare(right.role) ||
      left.path.localeCompare(right.path),
  );
  if (
    stableJson(sources as unknown as JsonValue) !==
      stableJson(sortedSources as unknown as JsonValue) ||
    new Set(observedRoles).size !== observedRoles.length ||
    new Set(sources.map((source) => source.path)).size !==
      sources.length ||
    stableJson(observedSourcePaths as unknown as JsonValue) !==
      stableJson(expectedSourcePaths as unknown as JsonValue)
  ) {
    throw new Error(
      `Relationship enforcement gate source set is invalid: ${gateId}`,
    );
  }
  const sourceTextByRole = new Map(
    sources.map((source) => [
      source.role,
      readEnforcementSource(
        source.role,
        source.path,
        source.sha256,
        artifactText,
      ),
    ]),
  );
  const sourceByRole = new Map(
    sources
      .filter((source) => source.role !== "graph_audit_findings")
      .map((source) => [
        source.role,
        parseEnforcementJsonSource(
          source.role,
          source.path,
          sourceTextByRole.get(source.role)!,
        ),
      ]),
  );
  const violations: string[] = [];
  const check = (condition: unknown, code: string): void => {
    if (!condition) violations.push(code);
  };

  if (gateId === "bus_lane_acquisition_linkage") {
    const acquisition = sourceByRole.get(
      "acquisition_summary",
    )!;
    const coverage = enforcementObject(
      acquisition.coverage_assertions,
      "bus-lane acquisition coverage_assertions",
    );
    const totals = enforcementObject(
      acquisition.totals,
      "bus-lane acquisition totals",
    );
    check(
      acquisition.schema_version === 1 &&
        acquisition.campaign_id ===
          "registry-only-bus-lane-acquisition-v1" &&
        acquisition.candidate_set_id ===
          "candidate-set-v2:24080902f508b55a0033df32" &&
        acquisition.candidate_set_sha256 ===
          "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba",
      "acquisition_identity",
    );
    check(
      coverage.all_assertions_passed === true &&
        coverage.campaign_candidate_count === 321 &&
        coverage.four_channel_receipt_count === 321 &&
        coverage.partition_union_count === 321 &&
        coverage.partition_without_exclusion_count === 0 &&
        coverage.partition_without_receipt_count === 0 &&
        coverage.missing_backlog_candidate_count === 0 &&
        coverage.extra_shard_candidate_count === 0 &&
        coverage.candidate_identity_collision_count === 0 &&
        coverage.cross_shard_candidate_collision_count === 0,
      "acquisition_coverage",
    );
    check(
      totals.researched === 321 &&
        totals.source_acquired === 321 &&
        totals.explicitly_excluded === 321 &&
        totals.still_unresolved === 321,
      "acquisition_receipts",
    );
    const reconciliation = sourceByRole.get(
      "linkage_reconciliation_summary",
    )!;
    check(
      reconciliation.schema_version === 2 &&
        reconciliation.campaign_id ===
          "bus-lane-supported-linkage-reconciliation-v1" &&
        reconciliation.supported_candidate_count === 54 &&
        reconciliation.reconciled_candidate_count === 54 &&
        reconciliation.unreconciled_candidate_count === 0 &&
        reconciliation.endpoint_resolved_count === 54 &&
        reconciliation.endpoint_type_valid_count === 54 &&
        reconciliation.exact_authoritative_evidence_count === 54 &&
        reconciliation.relation_evidence_hash_valid_count === 54 &&
        reconciliation.selected_relation_count === 54 &&
        reconciliation.obsolete_relation_evidence_reference_count ===
          0 &&
        enforcementNested(
          reconciliation,
          "pending_materialization",
          "active_submission_materialization_failure_count",
        ) === 0 &&
        reconciliation.study_projection_eligible_count === 0,
      "linkage_reconciliation",
    );
    const materialization = sourceByRole.get(
      "linkage_materialization_summary",
    )!;
    check(
      materialization.schema_version === 1 &&
        materialization.campaign_id ===
          "bus-lane-supported-linkage-materialization-v1" &&
        materialization.supported_candidate_count === 54 &&
        materialization.materialized_candidate_count === 54 &&
        materialization.unmaterialized_candidate_count === 0 &&
        materialization.materialized_relation_count === 54 &&
        materialization.endpoint_violation_count === 0 &&
        materialization.evidence_violation_count === 0 &&
        materialization.violation_count === 0,
      "linkage_materialization",
    );
  } else if (
    gateId === "determinism_and_consumer_proof"
  ) {
    const summary = sourceByRole.get(
      "determinism_consumer_summary",
    )!;
    const commandResults = summary.command_results;
    const trackerImporterSource = enforcementObject(
      summary.tracker_importer_source,
      "Tracker importer source",
    );
    const trackerReleaseVersions = enforcementObject(
      summary.tracker_release_contract_versions,
      "Tracker release contract versions",
    );
    const trackerSupportedVersions = enforcementObject(
      summary.tracker_supported_contract_versions,
      "Tracker supported contract versions",
    );
    const requiredCommands = [
      "architecture",
      "export",
      "materialize",
      "quality",
      "schema",
      "test",
      "typecheck",
      "validate",
    ];
    check(
      summary.schema_version === 1 &&
        summary.proof_id ===
          "relationship-integrity-determinism-consumer-proof-v1" &&
        summary.contract_id === RELATIONSHIP_CONTRACT_ID &&
        summary.release_id === "v1-rc21" &&
        typeof summary.git_head === "string" &&
        /^[a-f0-9]{40}$/u.test(summary.git_head) &&
        summary.latest_before === "v1-rc5" &&
        summary.latest_after === "v1-rc5" &&
        summary.rc20_manifest_sha256_before ===
          "a2e9147fbb3db3b27a48df27f9550a8b31ab28bc85e30b7166d75b46b54e1a08" &&
        summary.rc20_manifest_sha256_after ===
          summary.rc20_manifest_sha256_before &&
        summary.tracker_mutation_count === 0 &&
        summary.tracker_compatibility_status ===
          "incompatible_operational_occurrence_schema_v2" &&
        summary.tracker_replay_status ===
          "not_run_incompatible_schema_v2" &&
        summary.tracker_replay_attempted === false &&
        summary.tracker_write_command_count === 0 &&
        summary.warning_enforcement_finding_identity_match ===
          true &&
        typeof summary.canonical_record_count === "number" &&
        Number.isInteger(summary.canonical_record_count) &&
        summary.canonical_record_count >= 0 &&
        typeof summary.canonical_relation_count === "number" &&
        Number.isInteger(summary.canonical_relation_count) &&
        summary.canonical_relation_count >= 0 &&
        typeof summary.graph_finding_identity_count === "number" &&
        Number.isInteger(summary.graph_finding_identity_count) &&
        summary.graph_finding_identity_count >= 0 &&
        summary.failed_command_count === 0 &&
        summary.violation_count === 0,
      "determinism_identity",
    );
    check(
      equalDigestPair(summary.materialization_hashes) &&
        equalDigestPair(summary.sqlite_hashes) &&
        equalDigestPair(summary.release_hashes) &&
        equalDigestPair(summary.repository_state_hashes) &&
        equalDigestPair(summary.tracker_state_hashes) &&
        isSha256(summary.generator_source_sha256) &&
        isSha256(summary.command_spec_sha256),
      "determinism_hash_pairs",
    );
    check(
      trackerImporterSource.path ===
          "tools/pipeline-v2/src/lib/mta-wiki-operational-occurrences.ts" &&
        isSha256(trackerImporterSource.sha256) &&
        trackerReleaseVersions.manifest_version === 3 &&
        trackerReleaseVersions.operational_anchors === 1 &&
        trackerReleaseVersions.operational_anchor_review_decisions === 1 &&
        trackerReleaseVersions.operational_occurrences === 2 &&
        trackerReleaseVersions.operational_occurrence_review_decisions === 1 &&
        trackerSupportedVersions.manifest_version === 3 &&
        trackerSupportedVersions.operational_anchors === 1 &&
        trackerSupportedVersions.operational_anchor_review_decisions === 1 &&
        trackerSupportedVersions.operational_occurrences === 1 &&
        trackerSupportedVersions.operational_occurrence_review_decisions === 1 &&
        Array.isArray(summary.tracker_unsupported_version_pairs) &&
        stableJson(
          summary.tracker_unsupported_version_pairs as JsonValue,
        ) ===
          stableJson([{
            contract: "operational_occurrences",
            release_version: 2,
            supported_version: 1,
          }] as unknown as JsonValue),
      "determinism_tracker_compatibility",
    );
    check(
      Array.isArray(commandResults) &&
        stableJson(
          commandResults
            .map((entry) =>
              enforcementObject(entry, "command result"),
            )
            .map((entry) => entry.command_id)
            .sort() as unknown as JsonValue,
        ) ===
          stableJson(requiredCommands as unknown as JsonValue) &&
        commandResults.every((entry) => {
          const result = enforcementObject(
            entry,
            "command result",
          );
          return (
            result.exit_code === 0 &&
            isSha256(result.output_sha256)
          );
        }),
      "determinism_commands",
    );
  } else if (
    gateId === "occurrence_treatment_physicality"
  ) {
    const physicality = sourceByRole.get(
      "occurrence_treatment_physicality_summary",
    )!;
    check(
      physicality.schema_version === 1 &&
        physicality.review_stage ===
          "final_post_semantic_release" &&
        physicality.review_ledger_complete === true &&
        physicality.physical_scope_complete === true &&
        physicality.hard_mode_ready === true &&
        physicality.final_post_semantic_release_guard_ready ===
          true &&
        numericRecordTotal(physicality.finding_counts) === 0,
      "physicality_summary",
    );
    const phase = sourceByRole.get("phase_review_summary")!;
    check(
      phase.schema_version === 1 &&
        phase.review_complete === true &&
        phase.reviewed_occurrence_count ===
          phase.occurrence_count &&
        phase.unresolved_phase_count === 0 &&
        phase.missing_evidence_count === 0 &&
        phase.ambiguous_phase_count === 0 &&
        phase.violation_count === 0,
      "phase_review",
    );
  } else if (gateId === "payload_reference_integrity") {
    const summary = sourceByRole.get(
      "payload_reference_summary",
    )!;
    const enforcement = enforcementObject(
      summary.enforcement,
      "payload enforcement summary",
    );
    check(
      summary.schema_version === 1 &&
        summary.contract_id ===
          "relationship-reference-contract-v1" &&
        enforcement.hard_failure_count === 0 &&
        enforcement.supportable_missing_edge_count === 0 &&
        enforcement.invalid_value_count === 0 &&
        enforcement.unreviewed_self_reference_count === 0 &&
        enforcement.unreviewed_unresolved_count === 0 &&
        enforcement.unreviewed_ambiguous_count === 0 &&
        enforcement.policy_rule_drift_count === 0 &&
        enforcement.native_coverage_mismatch_count === 0 &&
        enforcement.stale_review_decision_count === 0,
      "payload_reference_summary",
    );
  } else if (
    gateId === "referential_type_evidence_integrity"
  ) {
    const graph = sourceByRole.get("graph_audit_summary")!;
    const graphManifest = sourceByRole.get("graph_audit_manifest")!;
    const graphSummaryText = sourceTextByRole.get(
      "graph_audit_summary",
    )!;
    const graphManifestText = sourceTextByRole.get(
      "graph_audit_manifest",
    )!;
    const graphFindingsText = sourceTextByRole.get(
      "graph_audit_findings",
    )!;
    const graphFindings = parseEnforcementJsonlSource(
      "graph_audit_findings",
      RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS
        .referential_type_evidence_integrity.find(
          (source) => source.role === "graph_audit_findings",
        )!.path,
      graphFindingsText,
    );
    const findingCounts = enforcementObject(
      graph.findings_by_code,
      "graph finding counts",
    );
    const knownGraphFindingCodes = Object.keys(
      RELATIONSHIP_CONTRACT_POLICY_V1.finding_codes,
    )
      .filter((code) => !code.startsWith("REL_REQUIRED_"))
      .sort();
    const knownGraphFindingCodeSet = new Set(
      knownGraphFindingCodes,
    );
    const observedGraphFindingCodes = Object.keys(
      findingCounts,
    ).sort();
    const summaryFindingCountsValid =
      observedGraphFindingCodes.every((code) => {
        const count = findingCounts[code];
        return (
          knownGraphFindingCodeSet.has(code) &&
          typeof count === "number" &&
          Number.isInteger(count) &&
          count >= 0
        );
      });
    const ledgerFindingCounts = new Map<string, number>();
    const ledgerFindingIds = new Set<string>();
    let graphLedgerValid = true;
    let enforcementEligibleLedgerCount = 0;
    for (const finding of graphFindings) {
      const code = finding.code;
      const findingId = finding.finding_id;
      if (
        typeof code !== "string" ||
        !knownGraphFindingCodeSet.has(code) ||
        code === "REL_ORPHAN_RECORD" ||
        typeof findingId !== "string" ||
        !findingId.trim() ||
        ledgerFindingIds.has(findingId) ||
        finding.contract_id !== RELATIONSHIP_CONTRACT_ID
      ) {
        graphLedgerValid = false;
        continue;
      }
      ledgerFindingIds.add(findingId);
      ledgerFindingCounts.set(
        code,
        (ledgerFindingCounts.get(code) ?? 0) + 1,
      );
      if (
        RELATIONSHIP_CONTRACT_POLICY_V1.finding_codes[code]
          ?.enforcement_eligible
      ) {
        enforcementEligibleLedgerCount += 1;
      }
    }
    const comparableGraphFindingCodes =
      knownGraphFindingCodes.filter(
        (code) => code !== "REL_ORPHAN_RECORD",
      );
    const graphSummaryLedgerCountsMatch =
      summaryFindingCountsValid &&
      comparableGraphFindingCodes.every(
        (code) =>
          (findingCounts[code] ?? 0) ===
          (ledgerFindingCounts.get(code) ?? 0),
      );
    const orphanCount = findingCounts.REL_ORPHAN_RECORD ?? 0;
    const graphFindingTotalReconciles =
      typeof orphanCount === "number" &&
      Number.isInteger(orphanCount) &&
      orphanCount >= 0 &&
      graph.finding_count === graphFindings.length + orphanCount &&
      numericRecordTotal(graph.findings_by_severity) ===
        graph.finding_count;
    const manifestArtifacts = Array.isArray(
        graphManifest.artifacts,
      )
      ? graphManifest.artifacts.map((entry, index) =>
          enforcementObject(
            entry,
            `graph manifest artifact ${index}`,
          ),
        )
      : [];
    const manifestArtifactPaths = manifestArtifacts.map(
      (entry) => entry.path,
    );
    const graphSummaryPin = manifestArtifacts.find(
      (entry) => entry.path === "summary.json",
    );
    const graphFindingsPin = manifestArtifacts.find(
      (entry) => entry.path === "findings.jsonl",
    );
    const expectedGraphInputFingerprint = sha256(
      stableJson({
        contract_sha256: graphManifest.contract_sha256,
        endpoint_matrix_sha256:
          graphManifest.endpoint_matrix_sha256,
        canonical_relations_sha256:
          graphManifest.canonical_relations_sha256,
      } as unknown as JsonValue),
    );
    const graphManifestPinsValid =
      graphManifest.schema_version === 1 &&
      graphManifest.contract_id === RELATIONSHIP_CONTRACT_ID &&
      isSha256(graphManifest.contract_sha256) &&
      graphManifest.endpoint_matrix_sha256 ===
        sha256(stableJson(matrix as unknown as JsonValue)) &&
      isSha256(graphManifest.canonical_relations_sha256) &&
      graphManifest.input_fingerprint ===
        expectedGraphInputFingerprint &&
      (graphManifest.mode === "warn" ||
        graphManifest.mode === "enforce") &&
      manifestArtifacts.length > 0 &&
      new Set(manifestArtifactPaths).size ===
        manifestArtifactPaths.length &&
      graphSummaryPin?.sha256 === sha256(graphSummaryText) &&
      graphFindingsPin?.sha256 === sha256(graphFindingsText) &&
      graphFindingsPin.rows === graphFindings.length;
    check(
      graph.canonical_relation_count ===
        matrix.covered_relation_count &&
        graph.contract_covered_relation_count ===
          matrix.covered_relation_count &&
        graphLedgerValid &&
        graphSummaryLedgerCountsMatch &&
        graphFindingTotalReconciles &&
        graphManifestPinsValid &&
        enforcementEligibleLedgerCount === 0,
      "graph_integrity_summary",
    );
    const sql = sourceByRole.get("sql_integrity_summary")!;
    check(
      sql.schema_version === 1 &&
        sql.contract_id === RELATIONSHIP_CONTRACT_ID &&
        sql.repository_sql_finding_identity_match === true &&
        sql.repository_sql_finding_code_counts_match === true &&
        sql.graph_summary_finding_counts_match === true &&
        sql.graph_enforcement_eligible_finding_count === 0 &&
        sql.graph_manifest_path ===
          RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS
            .referential_type_evidence_integrity.find(
              (source) => source.role === "graph_audit_manifest",
            )!.path &&
        sql.graph_manifest_sha256 === sha256(graphManifestText) &&
        sql.graph_summary_path ===
          RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS
            .referential_type_evidence_integrity.find(
              (source) => source.role === "graph_audit_summary",
            )!.path &&
        sql.graph_summary_sha256 === sha256(graphSummaryText) &&
        sql.graph_findings_path ===
          RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS
            .referential_type_evidence_integrity.find(
              (source) => source.role === "graph_audit_findings",
            )!.path &&
        sql.graph_findings_sha256 === sha256(graphFindingsText) &&
        sql.repository_finding_count === graphFindings.length &&
        sql.sql_finding_count === graphFindings.length &&
        sql.normalized_payload_parity === true &&
        sql.normalized_evidence_parity === true &&
        sql.readonly_sealed === true &&
        sql.foreign_key_violation_count === 0 &&
        sql.endpoint_violation_count === 0 &&
        sql.type_violation_count === 0 &&
        sql.evidence_violation_count === 0 &&
        sql.completeness_selector_violation_count === 0 &&
        sql.waiver_scope_violation_count === 0 &&
        sql.violation_count === 0,
      "sql_integrity_summary",
    );
  } else if (gateId === "relationship_completeness") {
    const summary = sourceByRole.get(
      "relationship_completeness_summary",
    )!;
    const migration = enforcementObject(
      summary.enforcement_migration,
      "completeness enforcement migration",
    );
    const occurrences = enforcementObject(
      summary.occurrences,
      "completeness occurrences",
    );
    const busLaneTreatments = enforcementObject(
      summary.bus_lane_treatments,
      "completeness bus-lane treatments",
    );
    const busLaneTreatmentDispositionCounts = enforcementObject(
      busLaneTreatments.counts_by_primary_disposition,
      "completeness bus-lane treatment dispositions",
    );
    const completenessInputPins = Array.isArray(
        summary.input_pins,
      )
      ? summary.input_pins.map((entry, index) =>
          enforcementObject(
            entry,
            `completeness input pin ${index}`,
          ),
        )
      : [];
    const busLaneDecisionPins = completenessInputPins.filter(
      (pin) =>
        pin.path ===
        RELATIONSHIP_COMPLETENESS_BUS_LANE_INVENTORY_V1.decisions
          .path,
    );
    const busLaneDecisionPin = busLaneDecisionPins[0];
    const requiredMigrationKeys = [
      "bus_lane_treatment_completeness_ready",
      "eligible_occurrence_core_roles_ready",
      "hard_mode_ready",
      "operational_event_completeness_ready",
      "phase_contract_ready",
      "physical_scope_contract_ready",
      "route_identity_completeness_ready",
      "treatment_physicality_contract_ready",
      "treatment_physicality_final_release_guard_ready",
    ];
    const migrationKeys = Object.keys(migration).sort();
    const warningCounts = enforcementObject(
      summary.warning_instances_by_code,
      "completeness warning instances",
    );
    const warningDefinitions = Array.isArray(
        summary.warning_definitions,
      )
      ? summary.warning_definitions.map((entry) =>
          enforcementObject(
            entry,
            "completeness warning definition",
          ),
        )
      : [];
    const definedWarningCodes = warningDefinitions
      .map((definition) => definition.code)
      .filter(
        (code): code is string =>
          typeof code === "string" && code.trim().length > 0,
      )
      .sort();
    const countedWarningCodes = Object.keys(warningCounts).sort();
    const warningInventoryComplete =
      warningDefinitions.length > 0 &&
      definedWarningCodes.length === warningDefinitions.length &&
      new Set(definedWarningCodes).size ===
        definedWarningCodes.length &&
      stableJson(
        definedWarningCodes as unknown as JsonValue,
      ) ===
        stableJson(
          [
            ...RELATIONSHIP_COMPLETENESS_REQUIRED_WARNING_CODES,
          ] as unknown as JsonValue,
        ) &&
      stableJson(
        definedWarningCodes as unknown as JsonValue,
      ) ===
        stableJson(
          countedWarningCodes as unknown as JsonValue,
        ) &&
      countedWarningCodes.every((code) => {
        const count = warningCounts[code];
        return (
          typeof count === "number" &&
          Number.isInteger(count) &&
          count === 0
        );
      });
    check(
      summary.schema_version === 1 &&
        stableJson(migrationKeys as unknown as JsonValue) ===
          stableJson(
            requiredMigrationKeys as unknown as JsonValue,
          ) &&
        migration.hard_mode_ready === true &&
        Object.values(migration).every(
          (value) => value === true,
        ) &&
        warningInventoryComplete &&
        occurrences.eligible_event_ids_outside_operational_denominator ===
          0 &&
        busLaneTreatments.review_complete === true &&
        busLaneTreatments.denominator_count ===
          RELATIONSHIP_COMPLETENESS_BUS_LANE_INVENTORY_V1
            .decisions.row_count &&
        busLaneDecisionPins.length === 1 &&
        busLaneDecisionPin?.row_count ===
          RELATIONSHIP_COMPLETENESS_BUS_LANE_INVENTORY_V1
            .decisions.row_count &&
        busLaneDecisionPin?.sha256 ===
          RELATIONSHIP_COMPLETENESS_BUS_LANE_INVENTORY_V1
            .decisions.sha256 &&
        stableJson(
          busLaneTreatmentDispositionCounts as JsonValue,
        ) ===
          stableJson(
            RELATIONSHIP_COMPLETENESS_BUS_LANE_INVENTORY_V1
              .counts_by_primary_disposition as JsonValue,
          ) &&
        busLaneTreatments.denominator_count ===
          busLaneTreatments.audited_treatment_count &&
        busLaneTreatments.denominator_count ===
          busLaneTreatments.exact_evidence_bound_count &&
        busLaneTreatments.denominator_count ===
          busLaneTreatments.materialized_treatment_count &&
        busLaneTreatments.accepted_pending_addition_count === 0 &&
        typeof busLaneTreatments.physical_scope_satisfied_count ===
          "number" &&
        Number.isInteger(
          busLaneTreatments.physical_scope_satisfied_count,
        ) &&
        typeof busLaneTreatments.reviewed_non_projectable_count ===
          "number" &&
        Number.isInteger(
          busLaneTreatments.reviewed_non_projectable_count,
        ) &&
        busLaneTreatments.denominator_count ===
          busLaneTreatments.physical_scope_satisfied_count +
            busLaneTreatments.reviewed_non_projectable_count &&
        busLaneTreatments.omitted_treatment_count === 0 &&
        busLaneTreatments.warning_treatment_count === 0,
      "relationship_completeness_summary",
    );
  } else if (gateId === "semantic_remediation") {
    const summary = sourceByRole.get(
      "semantic_remediation_summary",
    )!;
    const reconciliation = enforcementObject(
      summary.action_reconciliation,
      "semantic action reconciliation",
    );
    const after = enforcementObject(
      summary.after,
      "semantic after summary",
    );
    check(
      summary.schema_version === 1 &&
        summary.campaign_id ===
          "relationship-semantic-remediation-v1" &&
        summary.status === "applied" &&
        reconciliation.reconciled_decision_count ===
          reconciliation.reviewed_relation_count &&
        reconciliation.unreconciled_decision_count === 0 &&
        after.relation_count === matrix.covered_relation_count &&
        after.tuple_count ===
          matrix.allowed_family_shape_count &&
        after.skipped_correction_count === 0 &&
        after.unmapped_relation_count === 0,
      "semantic_remediation_summary",
    );
  }
  if (violations.length > 0) {
    throw new Error(
      `Relationship enforcement gate source backlog is not zero: ${gateId}: ${violations.join(", ")}`,
    );
  }
  return sources.map((source) => source.path);
}

export function assertRelationshipEnforcementProofEnvelope(
  proof: RelationshipEnforcementProof,
  matrix: RelationshipFinalEndpointMatrix,
  matrixPointer: RelationshipEndpointMatrixPointer,
): void {
  assertRelationshipFinalEndpointMatrix(matrix);
  const allowedProofKeys = new Set([
    "schema_version",
    "proof_id",
    "contract_id",
    "proof_status",
    "proof_stage",
    "validation_mode",
    "reviewed_at",
    "reviewed_by",
    "previous_proof",
    "transition_receipt",
    "final_matrix",
    "gate_count",
    "all_gates_ready",
    "total_violation_count",
    "gates",
  ]);
  const prePromotion =
    proof.proof_stage === "pre_promotion_warning" &&
    proof.validation_mode === "warn" &&
    proof.previous_proof === undefined &&
    proof.transition_receipt === undefined;
  const previous = proof.previous_proof;
  const receipt = proof.transition_receipt;
  const postPromotion =
    proof.proof_stage === "post_promotion_enforced" &&
    proof.validation_mode === "enforce" &&
    previous?.proof_stage === "pre_promotion_warning" &&
    typeof previous.path === "string" &&
    previous.path.trim().length > 0 &&
    isSha256(previous.sha256) &&
    typeof receipt?.path === "string" &&
    receipt.path.trim().length > 0 &&
    isSha256(receipt.sha256);
  if (
    proof.schema_version !==
      RELATIONSHIP_ENFORCEMENT_PROOF_SCHEMA_VERSION ||
    proof.proof_id !==
      "relationship-contract-v1-enforcement-proof" ||
    proof.contract_id !== RELATIONSHIP_CONTRACT_ID ||
    proof.proof_status !== "ready" ||
    (!prePromotion && !postPromotion) ||
    typeof proof.reviewed_at !== "string" ||
    !proof.reviewed_at.trim() ||
    typeof proof.reviewed_by !== "string" ||
    !proof.reviewed_by.trim() ||
    proof.all_gates_ready !== true ||
    proof.total_violation_count !== 0 ||
    !Array.isArray(proof.gates) ||
    Object.keys(proof).some((key) => !allowedProofKeys.has(key))
  ) {
    throw new Error(
      "Relationship enforcement proof is not a valid reviewed stage, mode, and zero-violation envelope",
    );
  }
  if (
    proof.final_matrix.path !== matrixPointer.path ||
    proof.final_matrix.sha256 !== matrixPointer.sha256 ||
    proof.final_matrix.relation_count !==
      matrix.covered_relation_count ||
    proof.final_matrix.tuple_count !==
      matrix.allowed_family_shape_count ||
    proof.final_matrix.relation_ids_sha256 !==
      matrix.relation_ids_sha256 ||
    proof.final_matrix.tuple_set_sha256 !==
      matrix.tuple_set_sha256
  ) {
    throw new Error(
      "Relationship enforcement proof does not pin the loaded final matrix",
    );
  }
}

function transitionJsonObject(
  text: string,
  label: string,
): Record<string, unknown> {
  try {
    return enforcementObject(JSON.parse(text) as unknown, label);
  } catch (error) {
    throw new Error(
      `Relationship enforcement transition ${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function relationshipEnforcementTransitionFingerprint(
  role: string,
  text: string,
): string {
  if (role === "canonical_db") {
    throw new Error(
      "Canonical DB bytes have no drift-normalized transition fingerprint",
    );
  }
  if (role === "graph_audit_findings") {
    const rows = text
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line, index) => {
        const row = transitionJsonObject(
          line,
          `graph finding row ${index + 1}`,
        );
        const { severity: _severity, ...stable } = row;
        return stable;
      });
    return sha256(stableJson(rows as unknown as JsonValue));
  }
  const value = transitionJsonObject(text, role);
  if (role === "graph_audit_manifest") {
    delete value.contract_sha256;
    delete value.input_fingerprint;
    delete value.mode;
    delete value.reproduction_commands;
    if (Array.isArray(value.artifacts)) {
      value.artifacts = value.artifacts.map((entry, index) => {
        const artifact = enforcementObject(
          entry,
          `graph manifest artifact ${index}`,
        );
        const { sha256: _sha256, ...stable } = artifact;
        return stable;
      });
    }
  } else if (role === "graph_audit_summary") {
    delete value.mode;
    delete value.findings_by_severity;
  } else if (role === "sql_integrity_summary") {
    delete value.canonical_db_sha256;
    delete value.graph_findings_sha256;
    delete value.graph_manifest_sha256;
    delete value.graph_summary_sha256;
    delete value.enforcement_mode;
  } else if (role === "linkage_materialization_summary") {
    delete value.canonical_db_sha256;
  } else {
    throw new Error(
      `Unsupported relationship enforcement refresh role ${role}`,
    );
  }
  return sha256(stableJson(value as unknown as JsonValue));
}

function assertTransitionArtifactPins(
  pins: readonly RelationshipEnforcementTransitionArtifactPin[],
  label: string,
): void {
  const sorted = [...pins].sort(
    (left, right) =>
      left.role.localeCompare(right.role) ||
      left.path.localeCompare(right.path),
  );
  if (
    stableJson(pins as unknown as JsonValue) !==
      stableJson(sorted as unknown as JsonValue) ||
    new Set(pins.map((pin) => pin.role)).size !== pins.length ||
    new Set(pins.map((pin) => pin.path)).size !== pins.length ||
    pins.some(
      (pin) =>
        Object.keys(pin).some(
          (key) =>
            ![
              "role",
              "path",
              "sha256",
              "archive_path",
              "transition_fingerprint",
            ].includes(key),
        ) ||
        !pin.role.trim() ||
        !pin.path.trim() ||
        (pin.archive_path !== undefined &&
          !pin.archive_path.trim()) ||
        !isSha256(pin.sha256) ||
        (pin.transition_fingerprint !== undefined &&
          !isSha256(pin.transition_fingerprint)),
    )
  ) {
    throw new Error(
      `Relationship enforcement transition ${label} pins are not sorted, unique, and content-addressed`,
    );
  }
}

function archivedGateSources(
  gateId: string,
  text: string,
): RelationshipEnforcementTransitionArtifactPin[] {
  const artifact = transitionJsonObject(text, `archived gate ${gateId}`);
  if (
    artifact.schema_version !== 1 ||
    artifact.artifact_id !==
      `relationship-contract-v1-enforcement-gate:${gateId}` ||
    artifact.contract_id !== RELATIONSHIP_CONTRACT_ID ||
    artifact.gate_id !== gateId ||
    artifact.derived_violation_count !== 0 ||
    !Array.isArray(artifact.source_artifacts) ||
    artifact.source_count !== artifact.source_artifacts.length
  ) {
    throw new Error(
      `Relationship enforcement transition archived gate is invalid: ${gateId}`,
    );
  }
  const expected = (
    RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS as Record<
      string,
      readonly { role: string; path: string }[]
    >
  )[gateId];
  const sources = artifact.source_artifacts.map((entry, index) => {
    const source = enforcementObject(
      entry,
      `archived gate ${gateId} source ${index}`,
    );
    if (
      typeof source.role !== "string" ||
      typeof source.path !== "string" ||
      !isSha256(source.sha256)
    ) {
      throw new Error(
        `Relationship enforcement transition archived gate source is invalid: ${gateId}/${index}`,
      );
    }
    return {
      role: source.role,
      path: source.path,
      sha256: source.sha256,
    };
  }).sort(
    (left, right) =>
      left.role.localeCompare(right.role) ||
      left.path.localeCompare(right.path),
  );
  if (
    !expected ||
    stableJson(
      sources.map(({ role, path }) => ({ role, path })) as unknown as JsonValue,
    ) !==
      stableJson(
        [...expected].sort(
          (left, right) =>
            left.role.localeCompare(right.role) ||
            left.path.localeCompare(right.path),
        ) as unknown as JsonValue,
      )
  ) {
    throw new Error(
      `Relationship enforcement transition archived gate source set is invalid: ${gateId}`,
    );
  }
  return sources;
}

export function assertRelationshipEnforcementTransitionReceipt(
  receipt: RelationshipEnforcementTransitionReceipt,
  matrix: RelationshipFinalEndpointMatrix,
  matrixPointer: RelationshipEndpointMatrixPointer,
  artifactText: (path: string) => string = (path) =>
    readFileSync(referencedPath(path), "utf8"),
): RelationshipEnforcementProof {
  const allowedReceiptKeys = new Set([
    "schema_version",
    "receipt_id",
    "contract_id",
    "transition",
    "promoted_at",
    "promoted_by",
    "previous_proof",
    "final_matrix",
    "previous_gates",
    "pre_promotion_sources",
    "invariant_artifacts",
    "refresh_artifacts",
  ]);
  if (
    receipt.schema_version !==
      RELATIONSHIP_ENFORCEMENT_TRANSITION_RECEIPT_SCHEMA_VERSION ||
    receipt.receipt_id !==
      RELATIONSHIP_ENFORCEMENT_TRANSITION_RECEIPT_ID ||
    receipt.contract_id !== RELATIONSHIP_CONTRACT_ID ||
    receipt.transition?.from_state !== "warning_ready" ||
    receipt.transition?.to_state !== "enforced_refresh_required" ||
    typeof receipt.promoted_at !== "string" ||
    !receipt.promoted_at.trim() ||
    typeof receipt.promoted_by !== "string" ||
    !receipt.promoted_by.trim() ||
    receipt.previous_proof?.proof_stage !==
      "pre_promotion_warning" ||
    !receipt.previous_proof.path?.trim() ||
    !isSha256(receipt.previous_proof.sha256) ||
    Object.keys(receipt).some((key) => !allowedReceiptKeys.has(key)) ||
    Object.keys(receipt.transition).some(
      (key) => !["from_state", "to_state"].includes(key),
    )
  ) {
    throw new Error(
      "Relationship enforcement transition receipt header is invalid",
    );
  }
  if (
    receipt.final_matrix.path !== matrixPointer.path ||
    receipt.final_matrix.sha256 !== matrixPointer.sha256 ||
    receipt.final_matrix.relation_count !==
      matrix.covered_relation_count ||
    receipt.final_matrix.tuple_count !==
      matrix.allowed_family_shape_count ||
    receipt.final_matrix.relation_ids_sha256 !==
      matrix.relation_ids_sha256 ||
    receipt.final_matrix.tuple_set_sha256 !== matrix.tuple_set_sha256
  ) {
    throw new Error(
      "Relationship enforcement transition receipt matrix pin drifted",
    );
  }
  assertTransitionArtifactPins(
    receipt.pre_promotion_sources,
    "pre-promotion source",
  );
  assertTransitionArtifactPins(
    receipt.invariant_artifacts,
    "invariant artifact",
  );
  assertTransitionArtifactPins(
    receipt.refresh_artifacts,
    "refresh artifact",
  );
  const invariantRoles = receipt.invariant_artifacts.map((pin) => pin.role);
  const refreshRoles = receipt.refresh_artifacts.map((pin) => pin.role);
  const refreshRoleSet = new Set<string>(
    RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES,
  );
  if (
    stableJson(invariantRoles as unknown as JsonValue) !==
      stableJson([...RELATIONSHIP_ENFORCEMENT_INVARIANT_ROLES] as unknown as JsonValue) ||
    stableJson(refreshRoles as unknown as JsonValue) !==
      stableJson([...RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES] as unknown as JsonValue) ||
    receipt.refresh_artifacts.some(
      (pin) =>
        pin.role !== "canonical_db" &&
        !isSha256(pin.transition_fingerprint),
    ) ||
    receipt.refresh_artifacts.some(
      (pin) =>
        pin.role === "canonical_db" &&
        pin.transition_fingerprint !== undefined,
    ) ||
    receipt.pre_promotion_sources.some(
      (pin) =>
        !pin.archive_path ||
        (refreshRoleSet.has(pin.role) !==
          isSha256(pin.transition_fingerprint)),
    )
  ) {
    throw new Error(
      "Relationship enforcement transition receipt does not define the exact immutable and refresh role sets",
    );
  }
  const previousProofText = artifactText(receipt.previous_proof.path);
  const previousProof = JSON.parse(previousProofText) as RelationshipEnforcementProof;
  if (
    sha256(stableJson(previousProof as unknown as JsonValue)) !==
    receipt.previous_proof.sha256
  ) {
    throw new Error(
      "Relationship enforcement transition archived proof hash mismatch",
    );
  }
  assertRelationshipEnforcementProofEnvelope(
    previousProof,
    matrix,
    matrixPointer,
  );
  if (previousProof.proof_stage !== "pre_promotion_warning") {
    throw new Error(
      "Relationship enforcement transition previous proof is not pre-promotion warning mode",
    );
  }
  const gates = [...receipt.previous_gates].sort((left, right) =>
    left.gate_id.localeCompare(right.gate_id)
  );
  const expectedGateIds = [...RELATIONSHIP_ENFORCEMENT_GATE_IDS].sort();
  if (
    stableJson(gates.map((gate) => gate.gate_id) as unknown as JsonValue) !==
      stableJson(expectedGateIds as unknown as JsonValue) ||
    gates.some((gate) => !gate.path.trim() || !isSha256(gate.sha256))
  ) {
    throw new Error(
      "Relationship enforcement transition archived gate set is invalid",
    );
  }
  const archivedSources: RelationshipEnforcementTransitionArtifactPin[] = [];
  const archivedArtifactText = new Map<string, string>();
  for (const gate of gates) {
    const proofGate = previousProof.gates.find(
      (candidate) => candidate.gate_id === gate.gate_id,
    );
    const gateText = artifactText(gate.path);
    if (
      !proofGate ||
      gate.sha256 !== proofGate.artifact_sha256 ||
      sha256(gateText) !== gate.sha256
    ) {
      throw new Error(
        `Relationship enforcement transition archived gate hash mismatch: ${gate.gate_id}`,
      );
    }
    archivedArtifactText.set(proofGate.artifact_path, gateText);
    archivedSources.push(...archivedGateSources(gate.gate_id, gateText));
  }
  archivedSources.sort(
    (left, right) =>
      left.role.localeCompare(right.role) ||
      left.path.localeCompare(right.path),
  );
  const receiptSources = receipt.pre_promotion_sources.map(
    ({ role, path, sha256: hash }) => ({ role, path, sha256: hash }),
  );
  if (
    stableJson(archivedSources as unknown as JsonValue) !==
      stableJson(receiptSources as unknown as JsonValue)
  ) {
    throw new Error(
      "Relationship enforcement transition archived gates do not reconcile with pre-promotion source pins",
    );
  }
  for (const pin of receipt.pre_promotion_sources) {
    if (!pin.archive_path) {
      throw new Error(
        `Relationship enforcement transition source archive is missing: ${pin.role}`,
      );
    }
    const text = artifactText(pin.archive_path);
    if (
      sha256(text) !== pin.sha256 ||
      (pin.transition_fingerprint !== undefined &&
        relationshipEnforcementTransitionFingerprint(
          pin.role,
          text,
        ) !== pin.transition_fingerprint)
    ) {
      throw new Error(
        `Relationship enforcement transition source archive hash/fingerprint mismatch: ${pin.role}`,
      );
    }
    archivedArtifactText.set(pin.path, text);
  }
  assertRelationshipEnforcementProof(
    previousProof,
    matrix,
    matrixPointer,
    RELATIONSHIP_ENFORCEMENT_GATE_IDS,
    (path) => {
      const text = archivedArtifactText.get(path);
      if (text === undefined) {
        throw new Error(
          `Relationship enforcement transition archived proof dependency is missing: ${path}`,
        );
      }
      return text;
    },
  );
  return previousProof;
}

export function assertRelationshipEnforcementProof(
  proof: RelationshipEnforcementProof,
  matrix: RelationshipFinalEndpointMatrix,
  matrixPointer: RelationshipEndpointMatrixPointer,
  requiredGateIds: readonly string[],
  artifactText: (path: string) => string = (path) =>
    readFileSync(referencedPath(path), "utf8"),
): { artifact_paths: string[] } {
  assertRelationshipEnforcementProofEnvelope(
    proof,
    matrix,
    matrixPointer,
  );
  const required = [...requiredGateIds].sort();
  const gates = [...proof.gates].sort((left, right) =>
    left.gate_id.localeCompare(right.gate_id),
  );
  const observedGateIds = gates.map((gate) => gate.gate_id);
  if (
    proof.gate_count !== gates.length ||
    new Set(observedGateIds).size !== gates.length ||
    new Set(gates.map((gate) => gate.artifact_path)).size !==
      gates.length ||
    stableJson(observedGateIds as unknown as JsonValue) !==
      stableJson(required as unknown as JsonValue)
  ) {
    throw new Error(
      "Relationship enforcement proof gates do not match the required gate set",
    );
  }
  const artifactPaths = new Set<string>();
  for (const gate of gates) {
    if (
      gate.status !== "ready" ||
      gate.violation_count !== 0 ||
      gate.criteria.length === 0 ||
      gate.criteria.some((criterion) => !criterion.trim()) ||
      !gate.artifact_path.trim() ||
      !isSha256(gate.artifact_sha256)
    ) {
      throw new Error(
        `Relationship enforcement gate is not ready and zero: ${gate.gate_id}`,
      );
    }
    let artifactContents: string;
    try {
      artifactContents = artifactText(gate.artifact_path);
    } catch (error) {
      throw new Error(
        `Relationship enforcement gate artifact is missing: ${gate.gate_id}/${gate.artifact_path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const actual = sha256(artifactContents);
    if (actual !== gate.artifact_sha256) {
      throw new Error(
        `Relationship enforcement gate artifact hash mismatch: ${gate.gate_id}`,
      );
    }
    artifactPaths.add(gate.artifact_path);
    const sourcePaths = assertRelationshipEnforcementGateArtifact(
      gate.gate_id,
      artifactContents,
      matrix,
      artifactText,
    );
    for (const path of sourcePaths) artifactPaths.add(path);
  }
  const graphManifestPath =
    RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS
      .referential_type_evidence_integrity.find(
        (source) => source.role === "graph_audit_manifest",
      )!.path;
  const sqlSummaryPath =
    RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS
      .referential_type_evidence_integrity.find(
        (source) => source.role === "sql_integrity_summary",
      )!.path;
  const graphManifest = transitionJsonObject(
    artifactText(graphManifestPath),
    "proof graph manifest",
  );
  const sqlSummary = transitionJsonObject(
    artifactText(sqlSummaryPath),
    "proof SQL summary",
  );
  if (
    graphManifest.mode !== proof.validation_mode ||
    sqlSummary.enforcement_mode !==
      (proof.validation_mode === "warn" ? "warning" : "enforce")
  ) {
    throw new Error(
      `Relationship enforcement proof stage ${proof.proof_stage} does not match live graph/SQL validation mode`,
    );
  }
  return { artifact_paths: [...artifactPaths].sort() };
}

function isFinalEndpointMatrix(
  value: RelationshipEndpointMatrix | RelationshipFinalEndpointMatrix,
): value is RelationshipFinalEndpointMatrix {
  return (
    "matrix_id" in value &&
    value.matrix_id ===
      "relationship-contract-v1-post-remediation-final"
  );
}

export function loadRelationshipContract(
  path = relationshipContractPath(),
  artifactText: (path: string) => string = (artifactPath) =>
    readFileSync(referencedPath(artifactPath), "utf8"),
): LoadedRelationshipContract {
  const contract = parseJsonFile<RelationshipContract>(path, "relationship contract");
  assertContractShape(contract);
  const matrixPath = referencedPath(contract.endpoint_matrix.path);
  const matrix = parseJsonFile<
    RelationshipEndpointMatrix | RelationshipFinalEndpointMatrix
  >(matrixPath, "relationship endpoint matrix");
  const actualSha256 = sha256(
    stableJson(matrix as unknown as JsonValue),
  );
  if (actualSha256 !== contract.endpoint_matrix.sha256) {
    throw new Error(`Relationship endpoint matrix hash mismatch: expected ${contract.endpoint_matrix.sha256}, found ${actualSha256}`);
  }

  let baseline: RelationshipBaselineTupleReviewInventory | undefined;
  let expansionLedger:
    | RelationshipReviewedTupleExpansionLedger
    | undefined;
  if (isFinalEndpointMatrix(matrix)) {
    if (
      contract.endpoint_matrix.matrix_kind !==
        "post_remediation_reviewed"
    ) {
      throw new Error(
        "Final relationship endpoint matrix requires an explicit post-remediation matrix pointer",
      );
    }
    assertRelationshipFinalEndpointMatrix(matrix);
    if (
      contract.endpoint_matrix.relation_count !==
        matrix.covered_relation_count ||
      contract.endpoint_matrix.tuple_count !==
        matrix.allowed_family_shape_count ||
      contract.endpoint_matrix.relation_ids_sha256 !==
        matrix.relation_ids_sha256 ||
      contract.endpoint_matrix.tuple_set_sha256 !==
        matrix.tuple_set_sha256 ||
      contract.endpoint_matrix.obsolete_baseline_tuple_policy !==
        "reject"
    ) {
      throw new Error(
        "Final relationship endpoint matrix pointer does not reconcile with its content",
      );
    }
  } else {
    if (
      contract.endpoint_matrix.matrix_kind ===
      "post_remediation_reviewed"
    ) {
      throw new Error(
        "Post-remediation relationship matrix pointer resolved to a legacy matrix",
      );
    }
    assertMatrixShape(matrix);
    const baselinePath = referencedPath(
      matrix.tuple_provenance.baseline_inventory.path,
    );
    baseline = parseJsonFile<RelationshipBaselineTupleReviewInventory>(
      baselinePath,
      "relationship baseline tuple inventory",
    );
    const baselineSha256 = sha256(
      stableJson(baseline as unknown as JsonValue),
    );
    if (
      baselineSha256 !==
      matrix.tuple_provenance.baseline_inventory.sha256
    ) {
      throw new Error(
        `Relationship baseline tuple inventory hash mismatch: expected ${matrix.tuple_provenance.baseline_inventory.sha256}, found ${baselineSha256}`,
      );
    }
    const expansionPath = referencedPath(
      matrix.tuple_provenance.reviewed_expansion_ledger.path,
    );
    expansionLedger =
      parseJsonFile<RelationshipReviewedTupleExpansionLedger>(
        expansionPath,
        "relationship reviewed expansion ledger",
      );
    const expansionSha256 = sha256(
      stableJson(expansionLedger as unknown as JsonValue),
    );
    if (
      expansionSha256 !==
      matrix.tuple_provenance.reviewed_expansion_ledger.sha256
    ) {
      throw new Error(
        `Relationship reviewed expansion ledger hash mismatch: expected ${matrix.tuple_provenance.reviewed_expansion_ledger.sha256}, found ${expansionSha256}`,
      );
    }
    assertRelationshipTupleProvenance(
      matrix,
      baseline,
      expansionLedger,
    );
  }

  let enforcementProof: RelationshipEnforcementProof | undefined;
  let enforcementTransitionReceipt:
    | RelationshipEnforcementTransitionReceipt
    | undefined;
  if (contract.enforcement_proof) {
    const proofPath = referencedPath(
      contract.enforcement_proof.path,
    );
    enforcementProof =
      parseJsonFile<RelationshipEnforcementProof>(
        proofPath,
        "relationship enforcement proof",
      );
    const proofSha256 = sha256(
      stableJson(enforcementProof as unknown as JsonValue),
    );
    if (proofSha256 !== contract.enforcement_proof.sha256) {
      throw new Error(
        `Relationship enforcement proof hash mismatch: expected ${contract.enforcement_proof.sha256}, found ${proofSha256}`,
      );
    }
    if (!isFinalEndpointMatrix(matrix)) {
      throw new Error(
        "Relationship enforcement proof cannot target a legacy endpoint matrix",
      );
    }
    const receiptPointer =
      contract.enforcement_proof.transition_receipt;
    if (receiptPointer) {
      const receiptPath = referencedPath(receiptPointer.path);
      enforcementTransitionReceipt =
        parseJsonFile<RelationshipEnforcementTransitionReceipt>(
          receiptPath,
          "relationship enforcement transition receipt",
        );
      const receiptSha256 = sha256(
        stableJson(
          enforcementTransitionReceipt as unknown as JsonValue,
        ),
      );
      if (receiptSha256 !== receiptPointer.sha256) {
        throw new Error(
          `Relationship enforcement transition receipt hash mismatch: expected ${receiptPointer.sha256}, found ${receiptSha256}`,
        );
      }
    }
    if (contract.enforcement_state === "enforced_refresh_required") {
      if (
        enforcementProof.proof_stage !== "pre_promotion_warning" ||
        !enforcementTransitionReceipt ||
        contract.enforcement_proof.sha256 !==
          enforcementTransitionReceipt.previous_proof.sha256
      ) {
        throw new Error(
          "enforced_refresh_required must retain the exact pre-promotion warning proof and transition receipt chain",
        );
      }
      assertRelationshipEnforcementProofEnvelope(
        enforcementProof,
        matrix,
        contract.endpoint_matrix,
      );
      assertRelationshipEnforcementTransitionReceipt(
        enforcementTransitionReceipt,
        matrix,
        contract.endpoint_matrix,
        artifactText,
      );
    } else {
      assertRelationshipEnforcementProof(
        enforcementProof,
        matrix,
        contract.endpoint_matrix,
        RELATIONSHIP_ENFORCEMENT_GATE_IDS,
        artifactText,
      );
      if (
        contract.enforcement_state === "warning_ready" &&
        enforcementProof.proof_stage !== "pre_promotion_warning"
      ) {
        throw new Error(
          "warning_ready requires a pre-promotion warning proof",
        );
      }
      if (contract.enforcement_state === "enforced_ready") {
        if (
          enforcementProof.proof_stage !==
            "post_promotion_enforced" ||
          !enforcementTransitionReceipt
        ) {
          throw new Error(
            "enforced_ready requires a post-promotion enforced proof and transition receipt",
          );
        }
        const previous =
          assertRelationshipEnforcementTransitionReceipt(
            enforcementTransitionReceipt,
            matrix,
            contract.endpoint_matrix,
            artifactText,
          );
        if (
          enforcementProof.previous_proof?.path !==
            enforcementTransitionReceipt.previous_proof.path ||
          enforcementProof.previous_proof?.sha256 !==
            enforcementTransitionReceipt.previous_proof.sha256 ||
          enforcementProof.previous_proof?.sha256 !==
            sha256(stableJson(previous as unknown as JsonValue)) ||
          enforcementProof.transition_receipt?.path !==
            receiptPointer?.path ||
          enforcementProof.transition_receipt?.sha256 !==
            receiptPointer?.sha256
        ) {
          throw new Error(
            "Post-promotion enforcement proof chain does not match the transition receipt",
          );
        }
      }
    }
  }
  if (
    contract.contract_status === "enforced" &&
    !enforcementProof
  ) {
    throw new Error(
      "Enforced relationship contract is missing its content-addressed enforcement proof",
    );
  }
  return {
    contract,
    matrix,
    baselineTupleReviewInventory: baseline,
    reviewedTupleExpansionLedger: expansionLedger,
    enforcementProof,
    enforcementTransitionReceipt,
    rulesByKind: new Map(
      matrix.rules.map(
        (rule) => [rule.relation_kind, rule] as const,
      ),
    ),
  };
}

export function relationshipFindingSeverity(
  contract: RelationshipContract,
  code: string,
  mode: RelationshipValidationMode,
): RelationshipFindingSeverity {
  const configured = contract.finding_codes[code];
  if (!configured) return mode === "enforce" ? "error" : "warning";
  if (mode === "enforce" && configured.enforcement_eligible && configured.default_severity === "warning") return "error";
  return configured.default_severity;
}

export function relationshipContractValidationMode(
  loaded: LoadedRelationshipContract,
): RelationshipValidationMode {
  if (loaded.contract.contract_status !== "enforced") return "warn";
  if (
    !loaded.enforcementProof ||
    !loaded.enforcementTransitionReceipt ||
    !isFinalEndpointMatrix(loaded.matrix) ||
    (loaded.contract.enforcement_state !==
      "enforced_refresh_required" &&
      loaded.contract.enforcement_state !== "enforced_ready")
  ) {
    throw new Error(
      "Relationship contract cannot enter enforce mode without a loaded final matrix, transition receipt, and staged enforcement proof",
    );
  }
  return "enforce";
}
