import { afterAll, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { buildRelationshipFinalEndpointMatrix } from "../../../scripts/finalize-relationship-contract-v1.ts";
import {
  openCanonicalDb,
  rebuildCanonicalDb,
  type CanonicalRelationshipCompletenessMirror,
} from "../src/canonical-db.js";
import {
  RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS,
  RELATIONSHIP_COMPLETENESS_REQUIRED_WARNING_CODES,
  RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID,
} from "../src/relationship-completeness-contract.js";
import {
  assertRelationshipEnforcementProof,
  assertRelationshipFinalMatrixProjection,
  assertRelationshipTupleProvenance,
  loadRelationshipContract,
  RELATIONSHIP_CONTRACT_POLICY_V1,
  RELATIONSHIP_ENFORCEMENT_GATE_IDS,
  RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS,
  RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES,
  relationshipEnforcementTransitionFingerprint,
  relationshipContractValidationMode,
  type RelationshipContract,
  type RelationshipEndpointMatrixPointer,
  type RelationshipEnforcementProof,
  type RelationshipEnforcementTransitionReceipt,
  type RelationshipFinalEndpointMatrix,
  type RelationshipProjectedRelation,
  type RelationshipProjectedTupleInventory,
} from "../src/relationship-contract.js";
import { schemaDdlStatements } from "../src/schema-ddl.js";
import { sha256, stableJson } from "../src/stable-json.js";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaObservationKind } from "../src/types.js";

const work = mkdtempSync(join(tmpdir(), "relationship-contract-db-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const hash = `sha256:${"a".repeat(64)}`;
const zeroGraphFindingCounts = Object.fromEntries(
  Object.keys(RELATIONSHIP_CONTRACT_POLICY_V1.finding_codes)
    .filter((code) => !code.startsWith("REL_REQUIRED_"))
    .map((code) => [code, 0]),
);
const zeroCompletenessWarningCounts = Object.fromEntries(
  RELATIONSHIP_COMPLETENESS_REQUIRED_WARNING_CODES.map((code) => [
    code,
    0,
  ]),
);
const completenessWarningDefinitions =
  RELATIONSHIP_COMPLETENESS_REQUIRED_WARNING_CODES.map((code) => ({
    code,
  }));
const fixtureEvidenceRegistry = {
  provenance: "test_fixture",
  entries: [{
    source_id: "fixture_source",
    block_id: "p001_b0001",
    resolved_block_id: "p001_b0001",
    page_number: 1,
    source_path: "raw/sources/fixture_source/blocks.jsonl",
    raw_text_sha256: hash,
  }],
} as const;

function rebuild(
  records: MtaCanonicalRecord[],
  options: NonNullable<Parameters<typeof rebuildCanonicalDb>[1]> = {},
) {
  return rebuildCanonicalDb(records, {
    ...options,
    evidenceRegistry: options.evidenceRegistry ?? fixtureEvidenceRegistry,
  });
}

function unsealedDb(label: string): Database {
  const path = join(work, `${label}.db`);
  rmSync(path, { force: true });
  const db = new Database(path, { create: true });
  db.exec("PRAGMA foreign_keys = ON;");
  for (const statement of schemaDdlStatements()) db.exec(statement);
  db.run(
    "INSERT INTO canonical_db_state (state_key, sealed) VALUES ('canonical', 0)",
  );
  return db;
}

function insertRawRecord(
  db: Database,
  recordId: string,
  recordKind: MtaObservationKind,
  payload: JsonObject,
): void {
  db.query(
    `INSERT INTO records
      (record_id, record_kind, display_name, raw_text, local_observation_id,
       primary_source_id, payload, truth_status, review_state, generated_at)
     VALUES (?, ?, ?, NULL, ?, 'fixture_source', ?, 'source_stated', 'reviewed',
             '2026-07-16T00:00:00.000Z')`,
  ).run(
    recordId,
    recordKind,
    recordId,
    `local_${recordId}`,
    stableJson(payload),
  );
}

function insertRawEvidenceRegistry(db: Database): void {
  const entry = fixtureEvidenceRegistry.entries[0];
  db.query(
    `INSERT INTO evidence_block_registry
      (source_id, block_id, resolved_block_id, page_number, evidence_id,
       source_path, raw_text_sha256)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.source_id,
    entry.block_id,
    entry.resolved_block_id,
    entry.page_number,
    `${entry.source_id}#${entry.block_id}`,
    entry.source_path,
    entry.raw_text_sha256,
  );
}

function insertRawEvidenceRef(
  db: Database,
  recordId: string,
  refJson: JsonValue,
): void {
  const entry = fixtureEvidenceRegistry.entries[0];
  db.query(
    `INSERT INTO evidence_refs
      (record_id, ordinal, ref_json, source_id, block_id, resolved_block_id,
       page_number, evidence_id, source_path, text_sha256, role)
     VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'fixture')`,
  ).run(
    recordId,
    stableJson(refJson),
    entry.source_id,
    entry.block_id,
    entry.resolved_block_id,
    entry.page_number,
    `${entry.source_id}#${entry.block_id}`,
    entry.source_path,
    entry.raw_text_sha256,
  );
}

function record(recordId: string, kind: MtaObservationKind, payload: JsonObject = {}): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: kind,
    source_id: "fixture_source",
    source_ids: ["fixture_source"],
    local_observation_id: `local_${recordId}`,
    local_observation_ids: [`local_${recordId}`],
    display_name: recordId,
    payload,
    evidence_refs: [{
      source_id: "fixture_source",
      evidence_id: "fixture_source#p001_b0001",
      source_path: "raw/sources/fixture_source/blocks.jsonl",
      page_number: 1,
      block_id: "p001_b0001",
      text_sha256: hash,
      role: "fixture",
    }],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "reviewed",
    generated_at: "2026-07-15T00:00:00Z",
  };
}

function edge(subjectKind: MtaObservationKind = "project", evidence = true): MtaCanonicalRecord[] {
  const subject = record("subject", subjectKind);
  const object = record("object", "route", { route_id: "Q1" });
  const relation = record("relation_fixture", "relation", {
    relation_kind: "affects_route",
    relation_family: "route_scope",
    subject_id: subject.record_id,
    object_id: object.record_id,
  });
  if (!evidence) relation.evidence_refs = [];
  return [subject, object, relation];
}

function completenessMirror(
  overrides: Partial<CanonicalRelationshipCompletenessMirror> = {},
): CanonicalRelationshipCompletenessMirror {
  const subject = {
    contractId: "relationship-completeness-v1",
    selector: "eligible_operational_occurrence",
    subjectId: "occurrence_fixture",
    subjectKind: "operational_occurrence" as const,
    canonicalRecordId: null,
    primaryDisposition: "contract_roles_complete",
    studyProjectable: true,
    warningCodes: [],
    roles: [{ role: "route_scope", status: "satisfied" as const, bindingCount: 1, recordIds: ["object"] }],
    detailJson: { occurrence_id: "occurrence_fixture" },
  };
  return {
    dispositions: [],
    subjects: [subject],
    findings: [],
    selectorContracts: RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS.map((selector) => ({
      contractId: RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID,
      selector,
      selectorClass: "fixture",
      expectedCount: selector === "eligible_operational_occurrence" ? 1 : 0,
      actualCount: selector === "eligible_operational_occurrence" ? 1 : 0,
      enforcementEligible: true,
      promotionCriterion: "fixture roles are complete",
    })),
    enforcement: {
      contractId: "relationship-completeness-v1",
      mode: "warning",
      hardModeReady: true,
      inputFingerprint: "fixture",
      criteriaJson: { fixture: true },
    },
    ...overrides,
  };
}

const fixtureSha256 = "a".repeat(64);

function finalMatrixFixture(): {
  relations: RelationshipProjectedRelation[];
  inventory: RelationshipProjectedTupleInventory;
  matrix: RelationshipFinalEndpointMatrix;
} {
  const relation: RelationshipProjectedRelation = {
    relation_id: "relation_fixture",
    relation_family: "route_scope",
    relation_kind: "affects_route",
    subject_id: "project_fixture",
    subject_kind: "project",
    object_id: "route_fixture",
    object_kind: "route",
    evidence_ids: ["fixture_source#p001_b0001"],
    evidence_bindings_sha256: fixtureSha256,
    semantic_review_decision_ids: ["semantic-review-fixture"],
    semantic_remediation_decision_ids: [
      "semantic-remediation-fixture",
    ],
    mapping_status: "mapped",
  };
  const relationIdsSha256 = sha256(
    stableJson([relation.relation_id]),
  );
  const tuple = {
    relation_family: relation.relation_family,
    relation_kind: relation.relation_kind,
    subject_kind: relation.subject_kind,
    object_kind: relation.object_kind,
    relation_count: 1,
    relation_ids_sha256: relationIdsSha256,
    semantic_review_decision_ids: ["semantic-review-fixture"],
    semantic_remediation_decision_ids: [
      "semantic-remediation-fixture",
    ],
  } satisfies RelationshipProjectedTupleInventory["tuples"][number];
  const inventory: RelationshipProjectedTupleInventory = {
    schema_version: 1,
    inventory_id: "projected-tuples-fixture",
    generated_at: "2026-07-16T03:00:00.000Z",
    relation_count: 1,
    tuple_count: 1,
    relation_ids_sha256: relationIdsSha256,
    tuples_sha256: sha256(stableJson([tuple])),
    unmapped_relation_count: 0,
    tuples: [tuple],
  };
  const matrix = buildRelationshipFinalEndpointMatrix(
    [relation],
    inventory,
    {
      projected_relations_path: "fixture/projected-relations.jsonl",
      projected_relations_sha256: fixtureSha256,
      projected_relations_logical_sha256: fixtureSha256,
      projected_tuples_path: "fixture/projected-tuples.json",
      projected_tuples_sha256: fixtureSha256,
      projected_tuples_logical_sha256: fixtureSha256,
      semantic_remediation_summary_path: "fixture/summary.json",
      semantic_remediation_summary_sha256: fixtureSha256,
      campaign_id: "relationship-semantic-remediation-v1",
      skipped_correction_count: 0,
      unmapped_relation_count: 0,
    },
  );
  return { relations: [relation], inventory, matrix };
}

function finalMatrixPointer(
  path: string,
  matrix: RelationshipFinalEndpointMatrix,
): RelationshipEndpointMatrixPointer {
  return {
    path,
    sha256: sha256(stableJson(matrix)),
    matrix_kind: "post_remediation_reviewed",
    relation_count: matrix.covered_relation_count,
    tuple_count: matrix.allowed_family_shape_count,
    relation_ids_sha256: matrix.relation_ids_sha256,
    tuple_set_sha256: matrix.tuple_set_sha256,
    obsolete_baseline_tuple_policy: "reject",
    unlisted_relation_policy: "error",
    new_shape_policy: "error",
  };
}

function enforcementGateFixtures(
  matrix: RelationshipFinalEndpointMatrix,
  mode: "warn" | "enforce" = "enforce",
): {
  gates: RelationshipEnforcementProof["gates"];
  artifactText: (path: string) => string;
  artifactTexts: Map<string, string>;
} {
  const graphAuditSummary = {
    canonical_relation_count: matrix.covered_relation_count,
    contract_covered_relation_count: matrix.covered_relation_count,
    finding_count: 0,
    findings_by_code: zeroGraphFindingCounts,
    findings_by_severity: { error: 0, info: 0, warning: 0 },
  };
  const graphAuditFindingsText = "";
  const graphAuditSummaryText = `${stableJson(graphAuditSummary as unknown as JsonValue)}\n`;
  const graphContractSha256 = fixtureSha256;
  const graphCanonicalRelationsSha256 = fixtureSha256;
  const graphEndpointMatrixSha256 = sha256(
    stableJson(matrix as unknown as JsonValue),
  );
  const graphAuditManifest = {
    schema_version: 1,
    contract_id: "relationship-contract-v1",
    contract_sha256: graphContractSha256,
    endpoint_matrix_sha256: graphEndpointMatrixSha256,
    canonical_relations_sha256: graphCanonicalRelationsSha256,
    input_fingerprint: sha256(stableJson({
      canonical_relations_sha256: graphCanonicalRelationsSha256,
      contract_sha256: graphContractSha256,
      endpoint_matrix_sha256: graphEndpointMatrixSha256,
    } as unknown as JsonValue)),
    mode,
    artifacts: [
      {
        path: "findings.jsonl",
        rows: 0,
        sha256: sha256(graphAuditFindingsText),
      },
      {
        path: "summary.json",
        sha256: sha256(graphAuditSummaryText),
      },
    ],
  };
  const graphAuditManifestText = `${stableJson(graphAuditManifest as unknown as JsonValue)}\n`;
  const referentialSources = RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS
    .referential_type_evidence_integrity;
  const referentialPath = (role: string): string => {
    const source = referentialSources.find((entry) => entry.role === role);
    if (!source) throw new Error(`Missing referential fixture source role ${role}`);
    return source.path;
  };
  const sourceValues: Record<
    string,
    Record<string, Record<string, unknown> | string>
  > = {
    bus_lane_acquisition_linkage: {
      acquisition_summary: {
        schema_version: 1,
        campaign_id: "registry-only-bus-lane-acquisition-v1",
        candidate_set_id: "candidate-set-v2:24080902f508b55a0033df32",
        candidate_set_sha256: "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba",
        coverage_assertions: {
          all_assertions_passed: true,
          campaign_candidate_count: 321,
          four_channel_receipt_count: 321,
          partition_union_count: 321,
          partition_without_exclusion_count: 0,
          partition_without_receipt_count: 0,
          missing_backlog_candidate_count: 0,
          extra_shard_candidate_count: 0,
          candidate_identity_collision_count: 0,
          cross_shard_candidate_collision_count: 0,
        },
        totals: {
          researched: 321,
          source_acquired: 321,
          explicitly_excluded: 321,
          still_unresolved: 321,
        },
      },
      linkage_materialization_summary: {
        schema_version: 1,
        campaign_id: "bus-lane-supported-linkage-materialization-v1",
        supported_candidate_count: 54,
        materialized_candidate_count: 54,
        unmaterialized_candidate_count: 0,
        materialized_relation_count: 54,
        endpoint_violation_count: 0,
        evidence_violation_count: 0,
        violation_count: 0,
      },
      linkage_reconciliation_summary: {
        schema_version: 2,
        campaign_id: "bus-lane-supported-linkage-reconciliation-v1",
        supported_candidate_count: 54,
        reconciled_candidate_count: 54,
        unreconciled_candidate_count: 0,
        endpoint_resolved_count: 54,
        endpoint_type_valid_count: 54,
        exact_authoritative_evidence_count: 54,
        relation_evidence_hash_valid_count: 54,
        selected_relation_count: 54,
        obsolete_relation_evidence_reference_count: 0,
        pending_materialization: {
          active_submission_materialization_failure_count: 0,
        },
        study_projection_eligible_count: 0,
      },
    },
    determinism_and_consumer_proof: {
      determinism_consumer_summary: {
        schema_version: 1,
        proof_id: "relationship-integrity-determinism-consumer-proof-v1",
        contract_id: "relationship-contract-v1",
        git_head: "b".repeat(40),
        release_id: "v1-rc21",
        latest_before: "v1-rc5",
        latest_after: "v1-rc5",
        rc20_manifest_sha256_before: "a2e9147fbb3db3b27a48df27f9550a8b31ab28bc85e30b7166d75b46b54e1a08",
        rc20_manifest_sha256_after: "a2e9147fbb3db3b27a48df27f9550a8b31ab28bc85e30b7166d75b46b54e1a08",
        tracker_mutation_count: 0,
        tracker_state_hashes: [fixtureSha256, fixtureSha256],
        repository_state_hashes: [fixtureSha256, fixtureSha256],
        generator_source_sha256: fixtureSha256,
        command_spec_sha256: fixtureSha256,
        tracker_compatibility_status:
          "incompatible_operational_occurrence_schema_v2",
        tracker_replay_status: "not_run_incompatible_schema_v2",
        tracker_replay_attempted: false,
        tracker_write_command_count: 0,
        tracker_importer_source: {
          path: "tools/pipeline-v2/src/lib/mta-wiki-operational-occurrences.ts",
          sha256: fixtureSha256,
        },
        tracker_release_contract_versions: {
          manifest_version: 3,
          operational_anchors: 1,
          operational_anchor_review_decisions: 1,
          operational_occurrences: 2,
          operational_occurrence_review_decisions: 1,
        },
        tracker_supported_contract_versions: {
          manifest_version: 3,
          operational_anchors: 1,
          operational_anchor_review_decisions: 1,
          operational_occurrences: 1,
          operational_occurrence_review_decisions: 1,
        },
        tracker_unsupported_version_pairs: [{
          contract: "operational_occurrences",
          release_version: 2,
          supported_version: 1,
        }],
        canonical_record_count: 0,
        canonical_relation_count: 0,
        graph_finding_identity_count: 0,
        warning_enforcement_finding_identity_match: true,
        failed_command_count: 0,
        violation_count: 0,
        materialization_hashes: [fixtureSha256, fixtureSha256],
        sqlite_hashes: [fixtureSha256, fixtureSha256],
        release_hashes: [fixtureSha256, fixtureSha256],
        command_results: [
          "architecture",
          "export",
          "materialize",
          "quality",
          "schema",
          "test",
          "typecheck",
          "validate",
        ].map((command_id) => ({
          command_id,
          exit_code: 0,
          output_sha256: fixtureSha256,
        })),
      },
    },
    occurrence_treatment_physicality: {
      occurrence_treatment_physicality_summary: {
        schema_version: 1,
        review_stage: "final_post_semantic_release",
        review_ledger_complete: true,
        physical_scope_complete: true,
        hard_mode_ready: true,
        final_post_semantic_release_guard_ready: true,
        finding_counts: {},
      },
      phase_review_summary: {
        schema_version: 1,
        occurrence_count: 1,
        reviewed_occurrence_count: 1,
        review_complete: true,
        unresolved_phase_count: 0,
        missing_evidence_count: 0,
        ambiguous_phase_count: 0,
        violation_count: 0,
      },
    },
    payload_reference_integrity: {
      payload_reference_summary: {
        schema_version: 1,
        contract_id: "relationship-reference-contract-v1",
        enforcement: {
          hard_failure_count: 0,
          supportable_missing_edge_count: 0,
          invalid_value_count: 0,
          unreviewed_self_reference_count: 0,
          unreviewed_unresolved_count: 0,
          unreviewed_ambiguous_count: 0,
          policy_rule_drift_count: 0,
          native_coverage_mismatch_count: 0,
          stale_review_decision_count: 0,
        },
      },
    },
    referential_type_evidence_integrity: {
      graph_audit_findings: graphAuditFindingsText,
      graph_audit_manifest: graphAuditManifest,
      graph_audit_summary: graphAuditSummary,
      sql_integrity_summary: {
        schema_version: 1,
        contract_id: "relationship-contract-v1",
        repository_sql_finding_identity_match: true,
        repository_sql_finding_code_counts_match: true,
        graph_summary_finding_counts_match: true,
        graph_enforcement_eligible_finding_count: 0,
        graph_manifest_path: referentialPath("graph_audit_manifest"),
        graph_manifest_sha256: sha256(graphAuditManifestText),
        graph_summary_path: referentialPath("graph_audit_summary"),
        graph_summary_sha256: sha256(graphAuditSummaryText),
        graph_findings_path: referentialPath("graph_audit_findings"),
        graph_findings_sha256: sha256(graphAuditFindingsText),
        repository_finding_count: 0,
        sql_finding_count: 0,
        normalized_payload_parity: true,
        normalized_evidence_parity: true,
        readonly_sealed: true,
        foreign_key_violation_count: 0,
        endpoint_violation_count: 0,
        type_violation_count: 0,
        evidence_violation_count: 0,
        completeness_selector_violation_count: 0,
        waiver_scope_violation_count: 0,
        enforcement_mode:
          mode === "warn" ? "warning" : "enforce",
        violation_count: 0,
      },
    },
    relationship_completeness: {
      relationship_completeness_summary: {
        schema_version: 1,
        enforcement_migration: {
          bus_lane_treatment_completeness_ready: true,
          eligible_occurrence_core_roles_ready: true,
          hard_mode_ready: true,
          operational_event_completeness_ready: true,
          phase_contract_ready: true,
          physical_scope_contract_ready: true,
          route_identity_completeness_ready: true,
          treatment_physicality_contract_ready: true,
          treatment_physicality_final_release_guard_ready: true,
        },
        warning_definitions: completenessWarningDefinitions,
        warning_instances_by_code:
          zeroCompletenessWarningCounts,
        occurrences: {
          eligible_event_ids_outside_operational_denominator: 0,
        },
        bus_lane_treatments: {
          denominator_count: 663,
          audited_treatment_count: 663,
          materialized_treatment_count: 663,
          accepted_pending_addition_count: 0,
          physical_scope_satisfied_count: 156,
          reviewed_non_projectable_count: 507,
          exact_evidence_bound_count: 663,
          omitted_treatment_count: 0,
          warning_treatment_count: 0,
          review_complete: true,
        },
      },
    },
    semantic_remediation: {
      semantic_remediation_summary: {
        schema_version: 1,
        campaign_id: "relationship-semantic-remediation-v1",
        status: "applied",
        action_reconciliation: {
          reviewed_relation_count: 1,
          reconciled_decision_count: 1,
          unreconciled_decision_count: 0,
        },
        after: {
          relation_count: matrix.covered_relation_count,
          tuple_count: matrix.allowed_family_shape_count,
          skipped_correction_count: 0,
          unmapped_relation_count: 0,
        },
      },
    },
  };
  const artifactTextByPath = new Map<string, string>();
  const gates = RELATIONSHIP_ENFORCEMENT_GATE_IDS.map((gateId) => {
    const sourceDir = join(work, "enforcement-gates", gateId);
    mkdirSync(sourceDir, { recursive: true });
    const sources = RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS[gateId]
      .map(({ role, path }) => {
        const value = sourceValues[gateId]![role];
        if (value === undefined) {
          throw new Error(`Missing enforcement fixture source ${gateId}/${role}`);
        }
        const text = typeof value === "string"
          ? value
          : `${stableJson(value as unknown as JsonValue)}\n`;
        artifactTextByPath.set(path, text);
        return { role, path, sha256: sha256(text) };
      })
      .sort((left, right) =>
        left.role.localeCompare(right.role) ||
        left.path.localeCompare(right.path));
    const artifact = {
      schema_version: 1,
      artifact_id: `relationship-contract-v1-enforcement-gate:${gateId}`,
      contract_id: "relationship-contract-v1",
      gate_id: gateId,
      reviewed_at: "2026-07-16T03:00:00.000Z",
      reviewed_by: "fixture-reviewer",
      source_count: sources.length,
      source_artifacts: sources,
      derived_violation_count: 0,
    };
    const artifactPath = join(sourceDir, "gate.json");
    const text = `${stableJson(artifact as unknown as JsonValue)}\n`;
    writeFileSync(artifactPath, text);
    artifactTextByPath.set(artifactPath, text);
    return {
      gate_id: gateId,
      status: "ready",
      violation_count: 0,
      artifact_path: artifactPath,
      artifact_sha256: sha256(text),
      criteria: ["fixture gate is derived from parsed source artifacts"],
    };
  });
  return {
    gates,
    artifactTexts: artifactTextByPath,
    artifactText: (path) => {
      const text = artifactTextByPath.get(path);
      if (text === undefined) throw new Error(`Missing fixture artifact ${path}`);
      return text;
    },
  };
}

describe("relationship-contract-v1 SQLite mirror", () => {
  it("versions the reviewed-final pointer and enforcement proof in the machine-readable schema", () => {
    const schema = JSON.parse(
      readFileSync(join(repoRoot, "schemas/relationship-contract-v1.schema.json"), "utf8"),
    ) as {
      properties: {
        endpoint_matrix: { properties: Record<string, unknown> };
        enforcement_proof?: { properties?: { required_gate_ids?: { minItems?: number; maxItems?: number } } };
      };
    };
    expect(Object.keys(schema.properties.endpoint_matrix.properties)).toContain("matrix_kind");
    expect(Object.keys(schema.properties.endpoint_matrix.properties)).toContain("relation_ids_sha256");
    expect(schema.properties.enforcement_proof?.properties?.required_gate_ids).toMatchObject({
      minItems: RELATIONSHIP_ENFORCEMENT_GATE_IDS.length,
      maxItems: RELATIONSHIP_ENFORCEMENT_GATE_IDS.length,
    });
  });

  it("allows the reviewed post-remediation matrix basis in the SQL mirror", () => {
    const ddl = schemaDdlStatements().join("\n");
    expect(ddl).toContain(
      "review_basis IN ('existing_exact_rule','frozen_observed_shape','reviewed_post_remediation')",
    );
  });

  it("loads an exact provenance-reconciled legacy or reviewed-final matrix", () => {
    const loaded = loadRelationshipContract();
    const tuples = loaded.matrix.rules.flatMap((rule) => rule.allowed_family_shapes);
    if ("matrix_id" in loaded.matrix) {
      expect(loaded.matrix.review_status).toBe(
        "reviewed_post_remediation",
      );
      expect(loaded.matrix.obsolete_baseline_tuple_policy).toBe(
        "reject",
      );
      expect(loaded.matrix.covered_relation_count).toBe(21_422);
      expect(loaded.matrix.allowed_family_shape_count).toBe(1_008);
      expect(tuples).toHaveLength(1_008);
      expect(
        tuples.every(
          (tuple) =>
            tuple.provenance === "reviewed_post_remediation" &&
            tuple.review_decision_ids.length > 0,
        ),
      ).toBe(true);
      expect(loaded.baselineTupleReviewInventory).toBeUndefined();
      expect(loaded.reviewedTupleExpansionLedger).toBeUndefined();
    } else {
      const baseline = loaded.baselineTupleReviewInventory;
      const expansion = loaded.reviewedTupleExpansionLedger;
      if (!baseline || !expansion) {
        throw new Error("Legacy matrix provenance was not loaded");
      }
      const affectedRecordIds = expansion.expansions.flatMap(
        (item) =>
          item.affected_relations.map(
            (affected) => affected.record_id,
          ),
      );
      const correctionIds = expansion.expansions.flatMap(
        (item) =>
          item.affected_relations.flatMap(
            (affected) => affected.correction_ids,
          ),
      );
      expect(tuples).toHaveLength(1_165);
      expect(
        tuples.filter(
          (tuple) =>
            tuple.provenance === "frozen_observed_baseline",
        ),
      ).toHaveLength(1_136);
      expect(
        tuples.filter(
          (tuple) => tuple.provenance === "reviewed_expansion",
        ),
      ).toHaveLength(29);
      expect(baseline.semantically_reviewed_tuple_count).toBe(0);
      expect(baseline.relation_assignment_count).toBe(21_247);
      expect(affectedRecordIds).toHaveLength(142);
      expect(new Set(affectedRecordIds).size).toBe(142);
      expect(new Set(correctionIds).size).toBe(147);
    }
    expect(loaded.contract.completeness_roles.non_projectable_record).toBeUndefined();
    expect(Object.keys(loaded.contract.completeness_roles).filter((key) => key.startsWith("non_projectable_")).sort()).toEqual([
      "non_projectable_bus_lane_treatment_selector",
      "non_projectable_operational_event_selector",
      "non_projectable_route_identity_selector",
    ]);
  });

  it("rejects unreviewed tuple insertion and false semantic approval in provenance metadata", () => {
    const loaded = loadRelationshipContract();
    if ("matrix_id" in loaded.matrix) {
      const { relations, inventory, matrix } =
        finalMatrixFixture();
      const unreviewed = structuredClone(matrix);
      unreviewed.rules[0]!.allowed_family_shapes[0]!
        .review_decision_ids = [];
      expect(() =>
        assertRelationshipFinalMatrixProjection(
          unreviewed,
          relations,
          inventory,
        )
      ).toThrow("Invalid or unreviewed");
      return;
    }
    const baseline = loaded.baselineTupleReviewInventory;
    const expansion = loaded.reviewedTupleExpansionLedger;
    if (!baseline || !expansion) {
      throw new Error("Legacy matrix provenance was not loaded");
    }
    const legacyMatrix = loaded.matrix;
    const automatic = structuredClone(legacyMatrix);
    automatic.rules[0]!.allowed_family_shapes.push({
      relation_family: "unreviewed_automatic_family",
      subject_kind: "project",
      object_kind: "route",
      provenance: "frozen_observed_baseline",
      review_decision_ids: [],
    });
    automatic.allowed_family_shape_count += 1;
    expect(() => assertRelationshipTupleProvenance(
      automatic,
      baseline,
      expansion,
    )).toThrow("do not reconcile with the baseline inventory");

    const falseReview = structuredClone(baseline);
    falseReview.semantically_reviewed_tuple_count = 1 as 0;
    expect(() => assertRelationshipTupleProvenance(
      legacyMatrix,
      falseReview,
      expansion,
    )).toThrow("must not be represented as semantically reviewed");
  });

  it("does not allow a status-only flip to bypass enforcement proof", () => {
    const warning = {
      contract: { contract_status: "warning_first" },
    } as Parameters<typeof relationshipContractValidationMode>[0];
    const unprovedEnforcement = {
      contract: { contract_status: "enforced" },
    } as Parameters<typeof relationshipContractValidationMode>[0];
    expect(relationshipContractValidationMode(warning)).toBe("warn");
    expect(() =>
      relationshipContractValidationMode(unprovedEnforcement)
    ).toThrow("without a loaded final matrix, transition receipt, and staged enforcement proof");
  });

  it("keeps unreviewed family/type suspicion enforcement-eligible and reviewed suspicion advisory", () => {
    expect(
      RELATIONSHIP_CONTRACT_POLICY_V1.finding_codes.REL_FAMILY_TYPE_SUSPECT,
    ).toEqual({
      default_severity: "warning",
      enforcement_eligible: true,
    });
    expect(
      RELATIONSHIP_CONTRACT_POLICY_V1.finding_codes
        .REL_FAMILY_TYPE_SUSPECT_REVIEWED,
    ).toEqual({
      default_severity: "warning",
      enforcement_eligible: false,
    });
  });

  it("rejects fail-open identity, evidence, finding-code, completeness, or migration policy drift", () => {
    const loaded = loadRelationshipContract();
    const cases: Array<[string, (contract: RelationshipContract) => void]> = [
      ["identity_policy", (contract) => {
        contract.identity_policy.canonical_endpoint_required = false as true;
      }],
      ["evidence_policy", (contract) => {
        contract.evidence_policy.block_identity_required = false as true;
      }],
      ["finding_codes", (contract) => {
        contract.finding_codes.REL_ENDPOINT_DANGLING = {
          default_severity: "info",
          enforcement_eligible: false,
        };
      }],
      ["completeness_roles", (contract) => {
        contract.completeness_roles.study_projectable_operational_occurrence!
          .required_roles = [];
      }],
      ["migration_criteria", (contract) => {
        contract.migration_criteria.referential_and_evidence = [];
      }],
    ];
    for (const [field, mutate] of cases) {
      const contract = structuredClone(loaded.contract);
      mutate(contract);
      const path = join(work, `fail-open-${field}.json`);
      writeFileSync(path, `${JSON.stringify(contract)}\n`);
      expect(() => loadRelationshipContract(path)).toThrow(
        `${field} drifted from its fail-closed versioned policy`,
      );
    }
  });

  it("reconciles every final tuple and relation to semantic decisions and rejects obsolete tuples", () => {
    const { relations, inventory, matrix } =
      finalMatrixFixture();
    expect(() =>
      assertRelationshipFinalMatrixProjection(
        matrix,
        relations,
        inventory,
      )
    ).not.toThrow();

    const obsolete = structuredClone(matrix);
    obsolete.rules.push({
      relation_kind: "obsolete_baseline_relation",
      relation_families: ["obsolete_family"],
      allowed_shapes: [
        { subject_kind: "project", object_kind: "route" },
      ],
      allowed_family_shapes: [{
        relation_family: "obsolete_family",
        subject_kind: "project",
        object_kind: "route",
        provenance: "reviewed_post_remediation",
        review_decision_ids: ["obsolete-review"],
        relation_count: 1,
        relation_ids_sha256: fixtureSha256,
      }],
      review_basis: "reviewed_post_remediation",
    });
    obsolete.relation_kind_rule_count += 1;
    obsolete.allowed_family_shape_count += 1;
    obsolete.covered_relation_count += 1;
    expect(() =>
      assertRelationshipFinalMatrixProjection(
        obsolete,
        relations,
        inventory,
      )
    ).toThrow("retains obsolete tuples");

    const noRelationDecision = structuredClone(relations);
    noRelationDecision[0]!.semantic_review_decision_ids = [];
    noRelationDecision[0]!.semantic_remediation_decision_ids = [];
    expect(() =>
      assertRelationshipFinalMatrixProjection(
        matrix,
        noRelationDecision,
        inventory,
      )
    ).toThrow("lacks semantic provenance");
  });

  it("loads only the staged warning -> refresh-required -> enforced-ready proof chain", () => {
    const { matrix } = finalMatrixFixture();
    const matrixPath = join(work, "final-matrix.json");
    const contractPath = join(work, "final-contract.json");
    const proofPath = join(work, "enforcement-proof.json");
    writeFileSync(matrixPath, `${JSON.stringify(matrix)}\n`);
    const pointer = finalMatrixPointer(matrixPath, matrix);
    const warningContract: RelationshipContract = {
      ...loadRelationshipContract().contract,
      contract_status: "warning_first",
      endpoint_matrix: pointer,
      enforcement_proof: undefined,
    };
    writeFileSync(
      contractPath,
      `${JSON.stringify(warningContract)}\n`,
    );
    const warningLoaded = loadRelationshipContract(contractPath);
    expect(relationshipContractValidationMode(warningLoaded)).toBe(
      "warn",
    );

    const statusOnly = {
      ...warningContract,
      contract_status: "enforced" as const,
    };
    writeFileSync(contractPath, `${JSON.stringify(statusOnly)}\n`);
    expect(() => loadRelationshipContract(contractPath)).toThrow(
      "requires a reviewed post-remediation matrix, transition receipt, and explicit refresh state",
    );

    const warningGateFixtures = enforcementGateFixtures(
      matrix,
      "warn",
    );
    const warningProof: RelationshipEnforcementProof = {
      schema_version: 2,
      proof_id: "relationship-contract-v1-enforcement-proof",
      contract_id: "relationship-contract-v1",
      proof_status: "ready",
      proof_stage: "pre_promotion_warning",
      validation_mode: "warn",
      reviewed_at: "2026-07-16T03:00:00.000Z",
      reviewed_by: "fixture-reviewer",
      final_matrix: {
        path: pointer.path,
        sha256: pointer.sha256,
        relation_count: matrix.covered_relation_count,
        tuple_count: matrix.allowed_family_shape_count,
        relation_ids_sha256: matrix.relation_ids_sha256,
        tuple_set_sha256: matrix.tuple_set_sha256,
      },
      gate_count: RELATIONSHIP_ENFORCEMENT_GATE_IDS.length,
      all_gates_ready: true,
      total_violation_count: 0,
      gates: warningGateFixtures.gates,
    };
    writeFileSync(proofPath, `${stableJson(warningProof as unknown as JsonValue)}\n`);
    const warningReadyContract: RelationshipContract = {
      ...warningContract,
      enforcement_state: "warning_ready",
      enforcement_proof: {
        path: proofPath,
        sha256: sha256(stableJson(warningProof)),
        required_gate_ids: [
          ...RELATIONSHIP_ENFORCEMENT_GATE_IDS,
        ],
      },
    };
    writeFileSync(
      contractPath,
      `${JSON.stringify(warningReadyContract)}\n`,
    );
    expect(
      relationshipContractValidationMode(
        loadRelationshipContract(
          contractPath,
          warningGateFixtures.artifactText,
        ),
      ),
    ).toBe("warn");

    const archivedProofPath = join(
      work,
      "archived-warning-proof.json",
    );
    writeFileSync(
      archivedProofPath,
      `${stableJson(warningProof as unknown as JsonValue)}\n`,
    );
    warningGateFixtures.artifactTexts.set(
      archivedProofPath,
      readFileSync(archivedProofPath, "utf8"),
    );
    const previousGates = warningProof.gates.map((gate) => {
      const archivedPath = join(
        work,
        "archived-gates",
        `${gate.gate_id}.json`,
      );
      mkdirSync(join(work, "archived-gates"), { recursive: true });
      const text = warningGateFixtures.artifactTexts.get(
        gate.artifact_path,
      )!;
      writeFileSync(archivedPath, text);
      warningGateFixtures.artifactTexts.set(archivedPath, text);
      return {
        gate_id: gate.gate_id,
        path: archivedPath,
        sha256: gate.artifact_sha256,
      };
    });
    const refreshRoleSet = new Set<string>(
      RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES,
    );
    const prePromotionSources = warningProof.gates
      .flatMap((gate) => {
        const artifact = JSON.parse(
          warningGateFixtures.artifactTexts.get(
            gate.artifact_path,
          )!,
        ) as {
          source_artifacts: Array<{
            role: string;
            path: string;
            sha256: string;
          }>;
        };
        return artifact.source_artifacts.map((source) => {
          const sourceText =
            warningGateFixtures.artifactTexts.get(source.path)!;
          const archivePath = join(
            work,
            "archived-sources",
            `${source.role}${source.path.endsWith(".jsonl") ? ".jsonl" : ".json"}`,
          );
          mkdirSync(join(work, "archived-sources"), {
            recursive: true,
          });
          writeFileSync(archivePath, sourceText);
          warningGateFixtures.artifactTexts.set(
            archivePath,
            sourceText,
          );
          return {
            ...source,
            archive_path: archivePath,
            ...(refreshRoleSet.has(source.role)
              ? {
                  transition_fingerprint:
                    relationshipEnforcementTransitionFingerprint(
                      source.role,
                      sourceText,
                    ),
                }
              : {}),
          };
        });
      })
      .sort((left, right) =>
        left.role.localeCompare(right.role) ||
        left.path.localeCompare(right.path));
    const receipt: RelationshipEnforcementTransitionReceipt = {
      schema_version: 1,
      receipt_id:
        "relationship-contract-v1-enforcement-transition",
      contract_id: "relationship-contract-v1",
      transition: {
        from_state: "warning_ready",
        to_state: "enforced_refresh_required",
      },
      promoted_at: "2026-07-16T04:00:00.000Z",
      promoted_by: "fixture-reviewer",
      previous_proof: {
        path: archivedProofPath,
        sha256: sha256(stableJson(warningProof)),
        proof_stage: "pre_promotion_warning",
      },
      final_matrix: {
        path: pointer.path,
        sha256: pointer.sha256,
        relation_count: matrix.covered_relation_count,
        tuple_count: matrix.allowed_family_shape_count,
        relation_ids_sha256: matrix.relation_ids_sha256,
        tuple_set_sha256: matrix.tuple_set_sha256,
      },
      previous_gates: previousGates,
      pre_promotion_sources: prePromotionSources,
      invariant_artifacts: [
        { role: "canonical_relations", path: "fixture/relations.jsonl", sha256: fixtureSha256 },
        { role: "determinism_consumer_summary", path: "fixture/determinism.json", sha256: fixtureSha256 },
        { role: "final_endpoint_matrix", path: pointer.path, sha256: pointer.sha256 },
        { role: "reviewed_release_manifest", path: "fixture/release.json", sha256: fixtureSha256 },
      ],
      refresh_artifacts: [
        { role: "canonical_db", path: "fixture/canonical.db", sha256: fixtureSha256 },
        ...prePromotionSources.filter((source) =>
          refreshRoleSet.has(source.role)
        ),
      ].sort((left, right) => left.role.localeCompare(right.role)),
    };
    const receiptPath = join(work, "transition-receipt.json");
    writeFileSync(
      receiptPath,
      `${stableJson(receipt as unknown as JsonValue)}\n`,
    );
    const transitionContract: RelationshipContract = {
      ...warningReadyContract,
      contract_status: "enforced",
      enforcement_state: "enforced_refresh_required",
      enforcement_proof: {
        ...warningReadyContract.enforcement_proof!,
        transition_receipt: {
          path: receiptPath,
          sha256: sha256(stableJson(receipt)),
        },
      },
    };
    writeFileSync(
      contractPath,
      `${stableJson(transitionContract as unknown as JsonValue)}\n`,
    );
    const transitionLoaded = loadRelationshipContract(
      contractPath,
      warningGateFixtures.artifactText,
    );
    expect(relationshipContractValidationMode(transitionLoaded)).toBe(
      "enforce",
    );
    const archivedGraphManifest = receipt.pre_promotion_sources.find(
      (source) => source.role === "graph_audit_manifest",
    )!;
    const archivedGraphManifestText =
      warningGateFixtures.artifactTexts.get(
        archivedGraphManifest.archive_path!,
      )!;
    warningGateFixtures.artifactTexts.set(
      archivedGraphManifest.archive_path!,
      `${archivedGraphManifestText} `,
    );
    expect(() =>
      loadRelationshipContract(
        contractPath,
        warningGateFixtures.artifactText,
      )
    ).toThrow("source archive hash/fingerprint mismatch");
    warningGateFixtures.artifactTexts.set(
      archivedGraphManifest.archive_path!,
      archivedGraphManifestText,
    );

    const enforcedGateFixtures = enforcementGateFixtures(
      matrix,
      "enforce",
    );
    for (const [path, text] of warningGateFixtures.artifactTexts) {
      if (!enforcedGateFixtures.artifactTexts.has(path)) {
        enforcedGateFixtures.artifactTexts.set(path, text);
      }
    }
    // Promotion deliberately leaves the live warning proof pinned while the
    // authoritative graph/SQL/DB artifacts are rebuilt in enforce mode. The
    // refresh-required loader must recover from that stale live proof by
    // validating the archived proof tree recorded in the receipt.
    expect(
      relationshipContractValidationMode(
        loadRelationshipContract(
          contractPath,
          enforcedGateFixtures.artifactText,
        ),
      ),
    ).toBe("enforce");
    const proof: RelationshipEnforcementProof = {
      ...warningProof,
      proof_stage: "post_promotion_enforced",
      validation_mode: "enforce",
      previous_proof: receipt.previous_proof,
      transition_receipt:
        transitionContract.enforcement_proof!.transition_receipt!,
      gates: enforcedGateFixtures.gates,
    };
    writeFileSync(
      proofPath,
      `${stableJson(proof as unknown as JsonValue)}\n`,
    );
    const enforcedContract: RelationshipContract = {
      ...transitionContract,
      enforcement_state: "enforced_ready",
      enforcement_proof: {
        ...transitionContract.enforcement_proof!,
        sha256: sha256(stableJson(proof)),
      },
    };
    writeFileSync(
      contractPath,
      `${stableJson(enforcedContract as unknown as JsonValue)}\n`,
    );
    const enforcedLoaded = loadRelationshipContract(
      contractPath,
      enforcedGateFixtures.artifactText,
    );
    expect(relationshipContractValidationMode(enforcedLoaded)).toBe(
      "enforce",
    );

    const shrunkGateSet: RelationshipContract = {
      ...enforcedContract,
      enforcement_proof: {
        ...enforcedContract.enforcement_proof!,
        required_gate_ids: [
          RELATIONSHIP_ENFORCEMENT_GATE_IDS[0],
        ],
      },
    };
    writeFileSync(
      contractPath,
      `${JSON.stringify(shrunkGateSet)}\n`,
    );
    expect(() => loadRelationshipContract(contractPath)).toThrow(
      "complete immutable gate set",
    );

    const nonzero = structuredClone(proof);
    nonzero.gates[0]!.violation_count = 1 as 0;
    expect(() =>
      assertRelationshipEnforcementProof(
        nonzero,
        matrix,
        pointer,
        RELATIONSHIP_ENFORCEMENT_GATE_IDS,
      )
    ).toThrow("not ready and zero");
    expect(() =>
      assertRelationshipEnforcementProof(
        proof,
        matrix,
        pointer,
        RELATIONSHIP_ENFORCEMENT_GATE_IDS,
        () => fixtureSha256,
      )
    ).toThrow("artifact hash mismatch");

    const arbitraryArtifact = join(
      work,
      "arbitrary-enforcement-gate.json",
    );
    const arbitraryText = "{\"totally_arbitrary\":true}\n";
    writeFileSync(arbitraryArtifact, arbitraryText);
    const selfAttested = structuredClone(proof);
    selfAttested.gates[0]!.artifact_path = arbitraryArtifact;
    selfAttested.gates[0]!.artifact_sha256 =
      sha256(arbitraryText);
    expect(() =>
      assertRelationshipEnforcementProof(
        selfAttested,
        matrix,
        pointer,
        RELATIONSHIP_ENFORCEMENT_GATE_IDS,
      )
    ).toThrow("gate artifact header is invalid");

    const relabeledWarning = structuredClone(warningProof);
    relabeledWarning.proof_stage = "post_promotion_enforced";
    relabeledWarning.validation_mode = "enforce";
    expect(() =>
      assertRelationshipEnforcementProof(
        relabeledWarning,
        matrix,
        pointer,
        RELATIONSHIP_ENFORCEMENT_GATE_IDS,
        warningGateFixtures.artifactText,
      )
    ).toThrow("valid reviewed stage");
  });

  it("accepts a typed, evidence-bound edge and exposes zero hard diagnostic rows", () => {
    const path = join(work, "valid.db");
    rebuild(edge(), { path });
    const db = openCanonicalDb(path, { readonly: true });
    try {
      expect((db.query("SELECT count(*) AS n FROM relationship_contract_rules").get() as { n: number }).n).toBeGreaterThan(700);
      expect(db.query("SELECT * FROM relationship_endpoint_violations").all()).toEqual([]);
      expect(db.query("SELECT * FROM relationship_type_violations").all()).toEqual([]);
      expect(db.query("SELECT * FROM relationship_evidence_violations").all()).toEqual([]);
      expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("normalizes the complete checked-in content-addressed evidence registry by default", () => {
    const path = join(work, "authoritative-evidence-registry.db");
    rebuildCanonicalDb([], { path });
    const expectedCount = readFileSync(
      join(repoRoot, "data", "evidence-block-index.jsonl"),
      "utf8",
    ).split(/\r?\n/u).filter((line) => line.trim().length > 0).length;
    const db = openCanonicalDb(path);
    try {
      expect((db.query(
        "SELECT COUNT(*) AS count FROM evidence_block_registry",
      ).get() as { count: number }).count).toBe(expectedCount);
      expect(expectedCount).toBeGreaterThan(50_000);
    } finally {
      db.close();
    }
  });

  it("fails closed on a wrong endpoint type", () => {
    expect(() => rebuild(edge("route"), { path: join(work, "wrong-type.db") })).toThrow("REL_ENDPOINT_TYPE_INVALID");
  });

  it("fails closed on an evidence-free relation", () => {
    expect(() => rebuild(edge("project", false), { path: join(work, "no-evidence.db") })).toThrow("REL_EVIDENCE_UNRESOLVED");
  });

  it("fails closed when block, hash, path, page, or registry coverage is fabricated", () => {
    const cases: Array<[string, (records: MtaCanonicalRecord[]) => void]> = [
      ["block", (records) => { records[2]!.evidence_refs[0]!.block_id = "p001_b9999"; }],
      ["resolved-block", (records) => {
        (records[2]!.evidence_refs[0]! as typeof records[2]["evidence_refs"][number] & {
          resolved_block_id: string;
        }).resolved_block_id = "p001_b9999";
      }],
      ["hash", (records) => { records[2]!.evidence_refs[0]!.text_sha256 = `sha256:${"b".repeat(64)}`; }],
      ["path", (records) => { records[2]!.evidence_refs[0]!.source_path = "raw/sources/fixture_source/fake.jsonl"; }],
      ["page", (records) => { records[2]!.evidence_refs[0]!.page_number = 999; }],
    ];
    for (const [label, mutate] of cases) {
      const records = edge();
      mutate(records);
      expect(() => rebuild(records, {
        path: join(work, `fake-evidence-${label}.db`),
      })).toThrow("EVIDENCE_REGISTRY_MISMATCH");
    }
    expect(() => rebuildCanonicalDb(edge(), {
      path: join(work, "missing-evidence-registry-coverage.db"),
      evidenceRegistry: { provenance: "authoritative", entries: [] },
    })).toThrow("EVIDENCE_REGISTRY_MISMATCH");
  });

  it("stores the registry-resolved block identity and rejects extra fake relation evidence", () => {
    const records = edge();
    for (const item of records) {
      item.evidence_refs[0]!.block_id = "p001_b0001_alias";
      item.evidence_refs[0]!.evidence_id = "fixture_source#p001_b0001_alias";
    }
    const path = join(work, "resolved-evidence-identity.db");
    rebuild(records, {
      path,
      evidenceRegistry: {
        provenance: "test_fixture",
        entries: [{
          ...fixtureEvidenceRegistry.entries[0],
          block_id: "p001_b0001_alias",
          resolved_block_id: "p001_b0001",
        }],
      },
    });
    const db = openCanonicalDb(path, { readonly: false });
    try {
      expect(db.query(
        "SELECT block_id, resolved_block_id FROM evidence_refs WHERE record_id = 'relation_fixture'",
      ).get()).toEqual({
        block_id: "p001_b0001_alias",
        resolved_block_id: "p001_b0001",
      });
      expect(() => db.run(
        `INSERT INTO evidence_refs
          (record_id, ordinal, ref_json, source_id, block_id, resolved_block_id, page_number,
           evidence_id, source_path, text_sha256, role)
         VALUES ('relation_fixture', 1, '{}', 'fixture_source', 'fake', 'fake', 1,
           'fixture_source#fake', 'raw/sources/fixture_source/blocks.jsonl',
           'sha256:${"b".repeat(64)}', 'fake')`,
      )).toThrow("CANONICAL_DB_SEALED:evidence_refs");
    } finally {
      db.close();
    }
  });

  it("rejects ref_json identity fields that disagree with normalized evidence columns", () => {
    const db = unsealedDb("evidence-ref-json-parity");
    try {
      insertRawRecord(db, "evidence_subject", "project", {});
      insertRawEvidenceRegistry(db);
      const exactRef = record("unused", "project").evidence_refs[0]!;
      expect(() => insertRawEvidenceRef(db, "evidence_subject", {
        ...exactRef,
        source_id: "forged_source",
      })).toThrow("EVIDENCE_REF_JSON_MISMATCH");

      insertRawEvidenceRef(db, "evidence_subject", exactRef as unknown as JsonValue);
      expect(() => db.run(
        `UPDATE evidence_refs
         SET ref_json = json_set(ref_json, '$.evidence_id', 'fixture_source#forged')
         WHERE record_id = 'evidence_subject'`,
      )).toThrow("EVIDENCE_REF_JSON_MISMATCH");
      expect(() => db.run(
        "UPDATE canonical_db_state SET sealed = 1 WHERE state_key = 'canonical'",
      )).not.toThrow();
    } finally {
      db.close();
    }
  });

  it("rejects normalized relation edges that disagree with records.payload", () => {
    const db = unsealedDb("relation-payload-parity");
    try {
      insertRawRecord(db, "payload_subject", "project", {});
      insertRawRecord(db, "payload_object", "route", { route_id: "Q1" });
      insertRawRecord(db, "forged_object", "route", { route_id: "Q2" });
      insertRawRecord(db, "payload_relation", "relation", {
        relation_kind: "affects_route",
        relation_family: "route_scope",
        subject_id: "payload_subject",
        object_id: "payload_object",
      });
      insertRawEvidenceRegistry(db);
      insertRawEvidenceRef(
        db,
        "payload_relation",
        record("unused", "project").evidence_refs[0]! as unknown as JsonValue,
      );
      db.run(
        `INSERT INTO relationship_contract_rules
          (contract_id, relation_kind, relation_family, subject_kind, object_kind, review_basis)
         VALUES ('relationship-contract-v1', 'affects_route', 'route_scope',
                 'project', 'route', 'reviewed_post_remediation')`,
      );
      const insertRelation = db.query(
        `INSERT INTO relations
          (record_id, relation_kind, raw_relation_kind, relation_family, subject_id, object_id,
           provenance, derivation_rule, canonicalize_decision_id, assertion_status, as_of_date)
         VALUES ('payload_relation', 'affects_route', NULL, 'route_scope', 'payload_subject', ?,
                 'authored', NULL, NULL, 'unknown', NULL)`,
      );
      expect(() => insertRelation.run("forged_object"))
        .toThrow("REL_PAYLOAD_EDGE_MISMATCH");
      expect(() => insertRelation.run("payload_object")).not.toThrow();
      expect(() => db.run(
        `UPDATE records
         SET payload = json_set(payload, '$.object_id', 'forged_object')
         WHERE record_id = 'payload_relation'`,
      )).toThrow("REL_PAYLOAD_EDGE_MISMATCH");
      expect(() => db.run(
        "UPDATE canonical_db_state SET sealed = 1 WHERE state_key = 'canonical'",
      )).not.toThrow();
    } finally {
      db.close();
    }
  });

  it("opens readonly by default and requires an explicit writable opt-in", () => {
    const path = join(work, "readonly-default.db");
    rebuild(edge(), { path });
    const db = openCanonicalDb(path);
    try {
      expect(db.query("SELECT sealed FROM canonical_db_state").get()).toEqual({ sealed: 1 });
      expect(() => db.run(
        "UPDATE relations SET relation_family = 'other' WHERE record_id = 'relation_fixture'",
      )).toThrow();
    } finally {
      db.close();
    }
  });

  it("rejects INSERT, UPDATE, and DELETE across every sealed enforcement mirror", () => {
    const mirror = completenessMirror({
      dispositions: [{
        decisionId: "route-disposition-v1:object",
        contractId: "route-identity-dispositions-v1",
        selector: "route_identity",
        recordId: "object",
        recordKind: "route",
        primaryDisposition: "proposal",
        studyProjectable: false,
        waiver: true,
        reviewedAt: "2026-07-15",
        reviewedBy: "fixture",
        reason: "Fixture proposal is not a current operating-route identity.",
        evidenceIds: ["fixture_source#p001_b0001"],
        decisionJson: {
          disposition: "proposal",
          required_roles_missing: ["route_identity_evidence"],
        },
      }],
      findings: [{
        findingId: "completeness_finding_fixture",
        contractId: "relationship-completeness-v1",
        code: "RC_FIXTURE_WARNING",
        severity: "warning",
        selector: "eligible_operational_occurrence",
        subjectId: "occurrence_fixture",
        detailJson: { fixture: true },
      }],
    });
    mirror.enforcement.hardModeReady = false;
    const path = join(work, "all-sealed-mirrors.db");
    rebuild(edge(), {
      path,
      relationshipCompleteness: mirror,
      relationshipFindings: [{
        finding_id: "relationship_finding_fixture",
        contract_id: "relationship-contract-v1",
        code: "REL_FIXTURE_WARNING",
        severity: "warning",
        record_id: "relation_fixture",
        detail: "fixture",
      }],
    });
    const db = openCanonicalDb(path, { readonly: false });
    const tables = [
      ["records", "record_id"],
      ["relations", "record_id"],
      ["evidence_block_registry", "source_id"],
      ["evidence_refs", "record_id"],
      ["relationship_contract_rules", "contract_id"],
      ["canonical_identities", "identity_class"],
      ["relationship_validation_findings", "finding_id"],
      ["relationship_dispositions", "decision_id"],
      ["relationship_disposition_evidence", "decision_id"],
      ["relationship_completeness_waivers", "decision_id"],
      ["relationship_completeness_subjects", "contract_id"],
      ["relationship_completeness_roles", "contract_id"],
      ["relationship_completeness_findings", "finding_id"],
      ["relationship_selector_contracts", "contract_id"],
      ["relationship_enforcement_state", "contract_id"],
    ] as const;
    try {
      for (const [table, column] of tables) {
        expect((db.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count).toBeGreaterThan(0);
        expect(() => db.run(
          `INSERT INTO ${table} SELECT * FROM ${table} LIMIT 1`,
        )).toThrow(`CANONICAL_DB_SEALED:${table}`);
        expect(() => db.run(
          `UPDATE ${table} SET ${column} = ${column} WHERE rowid = (SELECT rowid FROM ${table} LIMIT 1)`,
        )).toThrow(`CANONICAL_DB_SEALED:${table}`);
        expect(() => db.run(
          `DELETE FROM ${table} WHERE rowid = (SELECT rowid FROM ${table} LIMIT 1)`,
        )).toThrow(`CANONICAL_DB_SEALED:${table}`);
      }
      expect(() => db.run("UPDATE canonical_db_state SET sealed = 0 WHERE state_key = 'canonical'"))
        .toThrow("CANONICAL_DB_STATE_IMMUTABLE");
      expect(() => db.run("DELETE FROM canonical_db_state WHERE state_key = 'canonical'"))
        .toThrow("CANONICAL_DB_STATE_IMMUTABLE");
      expect(() => db.run("INSERT INTO canonical_db_state (state_key, sealed) VALUES ('canonical', 0)"))
        .toThrow("CANONICAL_DB_STATE_INVALID");
    } finally {
      db.close();
    }
  });

  it("seals typed edges, exact evidence, and contract rules against writable bypasses", () => {
    const path = join(work, "mutation-guards.db");
    rebuild(edge(), { path });
    const db = openCanonicalDb(path, { readonly: false });
    try {
      expect(() => db.run(
        "UPDATE relations SET relation_family = 'other' WHERE record_id = 'relation_fixture'",
      )).toThrow("CANONICAL_DB_SEALED:relations");
      expect(() => db.run(
        "UPDATE evidence_refs SET text_sha256 = NULL WHERE record_id = 'relation_fixture'",
      )).toThrow("CANONICAL_DB_SEALED:evidence_refs");
      expect(() => db.run(
        "DELETE FROM evidence_refs WHERE record_id = 'relation_fixture'",
      )).toThrow("CANONICAL_DB_SEALED:evidence_refs");
      expect(() => db.run(
        "UPDATE relationship_contract_rules SET review_basis = 'frozen_observed_shape' WHERE relation_kind = 'affects_route'",
      )).toThrow("CANONICAL_DB_SEALED:relationship_contract_rules");
    } finally {
      db.close();
    }
  });

  it("fails loudly instead of skipping a dangling relation projection", () => {
    const records = edge();
    records[2]!.payload.object_id = "missing_route";
    expect(() => rebuild(records, { path: join(work, "dangling.db") })).toThrow("cannot project relation relation_fixture");
  });

  it("mirrors ambiguous aliases and semantic supersessions without using either as physical endpoints", () => {
    const first = record("route_first", "route", { route_id: "Q48" });
    const second = record("route_second", "route", { route_id: "Q48" });
    first.record_aliases = ["route_q48"];
    second.record_aliases = ["route_q48"];
    const path = join(work, "identity.db");
    rebuild([first, second], {
      path,
      identitySupersessions: [{ identity: "route_retired", canonicalRecordId: "route_first" }],
    });
    const db = openCanonicalDb(path, { readonly: true });
    try {
      expect((db.query("SELECT target_count FROM relationship_identity_ambiguities WHERE identity_value = 'route_q48'").get() as { target_count: number }).target_count).toBe(2);
      expect(db.query("SELECT canonical_record_id, resolution_status FROM canonical_identities WHERE identity_class = 'superseded'").get()).toEqual({
        canonical_record_id: "route_first",
        resolution_status: "superseded",
      });
    } finally {
      db.close();
    }
  });

  it("mirrors a complete warning-mode subject with zero SQL completeness diagnostics", () => {
    const path = join(work, "completeness-valid-warning.db");
    rebuild(edge(), { path, relationshipCompleteness: completenessMirror() });
    const db = openCanonicalDb(path, { readonly: true });
    try {
      expect(db.query("SELECT * FROM relationship_completeness_role_violations").all()).toEqual([]);
      expect(db.query("SELECT * FROM relationship_completeness_selector_violations").all()).toEqual([]);
      expect(db.query("SELECT * FROM relationship_completeness_sql_diagnostics").all()).toEqual([]);
      expect(db.query("SELECT mode, hard_mode_ready FROM relationship_enforcement_state").get()).toEqual({
        mode: "warning",
        hard_mode_ready: 1,
      });
    } finally {
      db.close();
    }
  });

  it("mirrors the exact eligible-occurrence treatment physicality selector and rejects its retired upper-bound alias", () => {
    const treatment = record("treatment_fixture", "treatment_component", {
      treatment_family: "service_pattern",
      treatment_kind: "route change",
    });
    const mirror = completenessMirror({
      subjects: [{
        contractId: "relationship-completeness-v1",
        selector: "eligible_occurrence_treatment_physicality",
        subjectId: treatment.record_id,
        subjectKind: "treatment_component",
        canonicalRecordId: treatment.record_id,
        primaryDisposition: "reviewed_nonphysical",
        studyProjectable: false,
        warningCodes: [],
        roles: [{
          role: "immutable_treatment_physicality_decision",
          status: "satisfied",
          bindingCount: 1,
          recordIds: [treatment.record_id],
        }],
        detailJson: {
          treatment_record_id: treatment.record_id,
          classification: "nonphysical_service_operations_policy_control",
          study_projectable: false,
        },
      }],
      selectorContracts: [{
        contractId: "relationship-completeness-v1",
        selector: "eligible_occurrence_treatment_physicality",
        selectorClass: "reviewed_full_denominator",
        expectedCount: 1,
        actualCount: 1,
        enforcementEligible: false,
        promotionCriterion: "Immutable physicality review and final release guard are complete.",
      }],
      enforcement: {
        contractId: "relationship-completeness-v1",
        mode: "warning",
        hardModeReady: false,
        inputFingerprint: "physicality-fixture",
        criteriaJson: {
          occurrence_treatment_physicality: {
            denominator_count: 1,
            review_ledger_complete: true,
            final_post_semantic_release_guard_status: "pending",
          },
        },
      },
    });
    const path = join(work, "completeness-treatment-physicality.db");
    rebuild([...edge(), treatment], { path, relationshipCompleteness: mirror });
    const db = openCanonicalDb(path, { readonly: true });
    try {
      expect(db.query(
        `SELECT selector, subject_kind, canonical_record_id, study_projectable
         FROM relationship_completeness_subjects`,
      ).all()).toEqual([{
        selector: "eligible_occurrence_treatment_physicality",
        subject_kind: "treatment_component",
        canonical_record_id: treatment.record_id,
        study_projectable: 0,
      }]);
      expect(db.query(
        `SELECT selector, expected_count, actual_count, enforcement_eligible
         FROM relationship_selector_contracts`,
      ).all()).toEqual([{
        selector: "eligible_occurrence_treatment_physicality",
        expected_count: 1,
        actual_count: 1,
        enforcement_eligible: 0,
      }]);
      expect(db.query("SELECT * FROM relationship_completeness_sql_diagnostics").all()).toEqual([]);
    } finally {
      db.close();
    }

    const retired = structuredClone(mirror);
    retired.subjects[0]!.selector = "bus_lane_family_upper_bound";
    retired.selectorContracts[0]!.selector = "bus_lane_family_upper_bound";
    expect(() => rebuild([...edge(), treatment], {
      path: join(work, "completeness-retired-bus-lane-upper-bound.db"),
      relationshipCompleteness: retired,
    })).toThrow("RC_COMPLETENESS_SUBJECT_INVALID");
  });

  it("mirrors route-identity subjects and evidence-linked typed non-projectable dispositions", () => {
    const mirror = completenessMirror({
      dispositions: [{
        decisionId: "route-disposition-v1:object",
        contractId: "route-identity-dispositions-v1",
        selector: "route_identity",
        recordId: "object",
        recordKind: "route",
        primaryDisposition: "proposal",
        studyProjectable: false,
        waiver: true,
        reviewedAt: "2026-07-15",
        reviewedBy: "fixture",
        reason: "Fixture proposal is not a current operating-route identity.",
        evidenceIds: ["fixture_source#p001_b0001"],
        decisionJson: { disposition: "proposal" },
      }],
      subjects: [{
        contractId: "relationship-completeness-v1",
        selector: "route_identity",
        subjectId: "object",
        subjectKind: "route",
        canonicalRecordId: "object",
        primaryDisposition: "reviewed_non_projectable_disposition",
        studyProjectable: false,
        warningCodes: [],
        roles: [{
          role: "canonical_gtfs_anchor_or_typed_nonprojectable_disposition",
          status: "satisfied",
          bindingCount: 1,
          recordIds: ["object"],
        }],
        detailJson: { route_record_id: "object" },
      }],
      selectorContracts: [{
        contractId: "relationship-completeness-v1",
        selector: "route_identity",
        selectorClass: "reviewed_full_denominator",
        expectedCount: 1,
        actualCount: 1,
        enforcementEligible: true,
        promotionCriterion: "Every route is GTFS-backed or explicitly disposed.",
      }],
    });
    const path = join(work, "completeness-route.db");
    rebuild(edge(), { path, relationshipCompleteness: mirror });
    const db = openCanonicalDb(path, { readonly: false });
    try {
      expect(db.query(
        "SELECT selector, subject_kind, canonical_record_id FROM relationship_completeness_subjects",
      ).all()).toEqual([{ selector: "route_identity", subject_kind: "route", canonical_record_id: "object" }]);
      expect(db.query(
        "SELECT selector, record_kind, primary_disposition, study_projectable, waiver FROM relationship_dispositions",
      ).all()).toEqual([{
        selector: "route_identity",
        record_kind: "route",
        primary_disposition: "proposal",
        study_projectable: 0,
        waiver: 1,
      }]);
      expect(db.query("SELECT * FROM relationship_completeness_sql_diagnostics").all()).toEqual([]);
      expect(() => db.run(
        `INSERT INTO relationship_completeness_subjects
          (contract_id, selector, subject_id, subject_kind, canonical_record_id, primary_disposition,
           study_projectable, warning_codes_json, detail_json)
         VALUES ('fixture', 'operational_event_family', 'object', 'route', 'object', 'fixture', 0, '[]', '{}')`,
      )).toThrow("CANONICAL_DB_SEALED:relationship_completeness_subjects");
      expect(() => db.run(
        `INSERT INTO relationship_dispositions
          (decision_id, contract_id, selector, record_id, record_kind, primary_disposition,
           study_projectable, waiver, reviewed_at, reviewed_by, reason, decision_json)
         VALUES ('invalid-route-selector', 'fixture', 'operational_event', 'object', 'route', 'proposal',
           0, 1, '2026-07-15', 'fixture', 'fixture', '{}')`,
      )).toThrow("CANONICAL_DB_SEALED:relationship_dispositions");
    } finally {
      db.close();
    }
  });

  it("scopes non-projectable waivers to the exact contract, selector, record, and missing role", () => {
    const event = record("event_fixture", "event", { event_kind: "implementation" });
    const mirror = completenessMirror({
      dispositions: [{
        decisionId: "relationship-disposition-v1:event_fixture",
        contractId: "relationship-dispositions-v1",
        selector: "operational_event",
        recordId: event.record_id,
        recordKind: "event",
        primaryDisposition: "reviewed_non_projectable_required_roles_unproven",
        studyProjectable: false,
        waiver: true,
        reviewedAt: "2026-07-16",
        reviewedBy: "fixture",
        reason: "The fixture review permits only the explicitly named missing role.",
        evidenceIds: ["fixture_source#p001_b0001"],
        decisionJson: { required_roles_missing: ["route_scope"] },
      }],
      subjects: [{
        contractId: RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID,
        selector: "operational_event_family",
        subjectId: event.record_id,
        subjectKind: "event",
        canonicalRecordId: event.record_id,
        primaryDisposition: "reviewed_non_projectable_required_roles_unproven",
        studyProjectable: false,
        warningCodes: [],
        roles: [{
          role: "treatment_scope",
          status: "missing",
          bindingCount: 0,
          recordIds: [],
        }],
        detailJson: { event_record_id: event.record_id },
      }],
      selectorContracts: [{
        contractId: RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID,
        selector: "operational_event_family",
        selectorClass: "fixture",
        expectedCount: 1,
        actualCount: 1,
        enforcementEligible: false,
        promotionCriterion: "fixture warning mode",
      }],
      enforcement: {
        contractId: RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID,
        mode: "warning",
        hardModeReady: false,
        inputFingerprint: "role-scoped-waiver-fixture",
        criteriaJson: { fixture: true },
      },
    });
    const wrongRolePath = join(work, "completeness-waiver-wrong-role.db");
    rebuild([...edge(), event], {
      path: wrongRolePath,
      relationshipCompleteness: mirror,
    });
    const wrongRoleDb = openCanonicalDb(wrongRolePath);
    try {
      expect(wrongRoleDb.query(
        `SELECT contract_id, selector, record_id, role
         FROM relationship_completeness_waivers`,
      ).all()).toEqual([{
        contract_id: RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID,
        selector: "operational_event_family",
        record_id: event.record_id,
        role: "route_scope",
      }]);
      expect(wrongRoleDb.query(
        "SELECT role FROM relationship_completeness_role_violations",
      ).all()).toEqual([{ role: "treatment_scope" }]);
    } finally {
      wrongRoleDb.close();
    }

    const exactRole = structuredClone(mirror);
    exactRole.dispositions[0]!.decisionJson = {
      required_roles_missing: ["treatment_scope"],
    };
    const exactRolePath = join(work, "completeness-waiver-exact-role.db");
    rebuild([...edge(), event], {
      path: exactRolePath,
      relationshipCompleteness: exactRole,
    });
    const exactRoleDb = openCanonicalDb(exactRolePath);
    try {
      expect(exactRoleDb.query(
        "SELECT * FROM relationship_completeness_role_violations",
      ).all()).toEqual([]);
    } finally {
      exactRoleDb.close();
    }
  });

  it("exposes a missing mandatory role as a warning-mode SQL diagnostic", () => {
    const mirror = completenessMirror();
    mirror.subjects[0]!.roles = [{ role: "treatment_scope", status: "missing", bindingCount: 0, recordIds: [] }];
    mirror.subjects[0]!.warningCodes = ["RC_OCCURRENCE_TREATMENT_SCOPE_EVIDENCE_MISSING"];
    mirror.findings = [{
      findingId: "finding_missing_treatment",
      contractId: "relationship-completeness-v1",
      code: "RC_OCCURRENCE_TREATMENT_SCOPE_EVIDENCE_MISSING",
      severity: "warning",
      selector: "eligible_operational_occurrence",
      subjectId: "occurrence_fixture",
      detailJson: { role: "treatment_scope" },
    }];
    mirror.enforcement.hardModeReady = false;
    const path = join(work, "completeness-missing-role.db");
    rebuild(edge(), { path, relationshipCompleteness: mirror });
    const db = openCanonicalDb(path, { readonly: true });
    try {
      expect(db.query("SELECT role FROM relationship_completeness_role_violations").all()).toEqual([
        { role: "treatment_scope" },
      ]);
      expect((db.query("SELECT count(*) AS n FROM relationship_completeness_sql_diagnostics").get() as { n: number }).n).toBe(2);
    } finally {
      db.close();
    }
  });

  it("rejects completeness roles whose claimed canonical bindings do not resolve", () => {
    const mirror = completenessMirror();
    mirror.subjects[0]!.roles = [{
      role: "route_membership",
      status: "satisfied",
      bindingCount: 1,
      recordIds: ["route_missing"],
    }];
    expect(() => rebuild(edge(), {
      path: join(work, "completeness-role-record-missing.db"),
      relationshipCompleteness: mirror,
    })).toThrow("RC_ROLE_RECORD_UNRESOLVED");
  });

  it("requires each role binding count to equal its distinct canonical record ids", () => {
    const invalidMirror = completenessMirror();
    invalidMirror.subjects[0]!.roles = [{
      role: "route_membership",
      status: "satisfied",
      bindingCount: 2,
      recordIds: ["object"],
    }];
    expect(() => rebuild(edge(), {
      path: join(work, "completeness-role-cardinality-builder.db"),
      relationshipCompleteness: invalidMirror,
    })).toThrow("does not match 1 distinct canonical record id");

    const path = join(work, "completeness-role-cardinality-trigger.db");
    rebuild(edge(), { path, relationshipCompleteness: completenessMirror() });
    const db = openCanonicalDb(path, { readonly: false });
    try {
      expect(() => db.query(
        `INSERT INTO relationship_completeness_roles
         (contract_id, selector, subject_id, role, role_status, binding_count, record_ids_json)
         VALUES ('relationship-completeness-v1', 'eligible_operational_occurrence',
                 'occurrence_fixture', 'treatment_scope', 'satisfied', 2, '["object"]')`,
      ).run()).toThrow("CANONICAL_DB_SEALED:relationship_completeness_roles");
    } finally {
      db.close();
    }
  });

  it("rejects disposition evidence that is absent from the exact target record", () => {
    const mirror = completenessMirror({
      dispositions: [{
        decisionId: "decision_fixture",
        contractId: "relationship-completeness-v1",
        selector: "bus_lane_family_treatment",
        recordId: "subject",
        recordKind: "project",
        primaryDisposition: "reviewed_non_projectable",
        studyProjectable: false,
        waiver: true,
        reviewedAt: "2026-07-15T00:00:00Z",
        reviewedBy: "fixture",
        reason: "fixture",
        evidenceIds: ["fixture_source#missing"],
        decisionJson: { decision_id: "decision_fixture" },
      }],
    });
    expect(() => rebuild(edge(), {
      path: join(work, "completeness-bad-disposition-evidence.db"),
      relationshipCompleteness: mirror,
    })).toThrow("RC_DISPOSITION_SELECTOR_INVALID");

    mirror.dispositions[0]!.recordId = "treatment_fixture";
    mirror.dispositions[0]!.recordKind = "treatment_component";
    expect(() => rebuild([...edge(), record("treatment_fixture", "treatment_component", { treatment_kind: "bus_lane" })], {
      path: join(work, "completeness-unresolved-disposition-evidence.db"),
      relationshipCompleteness: mirror,
    })).toThrow("RC_DISPOSITION_EVIDENCE_UNRESOLVED");
  });

  it("allows enforce mode only when readiness is true and the SQL backlog is empty", () => {
    const valid = completenessMirror();
    valid.enforcement.mode = "enforce";
    rebuild(edge(), {
      path: join(work, "completeness-enforce-valid.db"),
      relationshipCompleteness: valid,
    });

    const notReady = completenessMirror();
    notReady.enforcement.mode = "enforce";
    notReady.enforcement.hardModeReady = false;
    expect(() => rebuild(edge(), {
      path: join(work, "completeness-enforce-not-ready.db"),
      relationshipCompleteness: notReady,
    })).toThrow("RC_ENFORCEMENT_CRITERIA_NOT_READY");

    const missingSelector = completenessMirror();
    missingSelector.enforcement.mode = "enforce";
    missingSelector.selectorContracts = missingSelector.selectorContracts.slice(0, -1);
    expect(() => rebuild(edge(), {
      path: join(work, "completeness-enforce-missing-selector.db"),
      relationshipCompleteness: missingSelector,
    })).toThrow("RC_ENFORCEMENT_SELECTOR_SET_INVALID");

    const ineligibleSelector = completenessMirror();
    ineligibleSelector.enforcement.mode = "enforce";
    ineligibleSelector.selectorContracts[0]!.enforcementEligible = false;
    expect(() => rebuild(edge(), {
      path: join(work, "completeness-enforce-ineligible-selector.db"),
      relationshipCompleteness: ineligibleSelector,
    })).toThrow("RC_ENFORCEMENT_SELECTOR_NOT_ELIGIBLE");

    const backlog = completenessMirror();
    backlog.enforcement.mode = "enforce";
    backlog.subjects[0]!.roles = [{ role: "operational_onset", status: "missing", bindingCount: 0, recordIds: [] }];
    expect(() => rebuild(edge(), {
      path: join(work, "completeness-enforce-backlog.db"),
      relationshipCompleteness: backlog,
    })).toThrow("RC_ENFORCEMENT_BACKLOG_NONZERO");

    const repositoryFinding = completenessMirror();
    repositoryFinding.enforcement.mode = "enforce";
    expect(() => rebuild(edge(), {
      path: join(work, "completeness-enforce-graph-finding.db"),
      relationshipCompleteness: repositoryFinding,
      relationshipFindings: [{
        finding_id: "relationship_finding_enforcement_backlog",
        contract_id: "relationship-contract-v1",
        code: "REL_DUPLICATE_IDENTITY",
        severity: "warning",
        record_id: "relation_fixture",
        detail: "A warning-first duplicate remains promotion-blocking.",
      }],
    })).toThrow("RC_ENFORCEMENT_GRAPH_BACKLOG_NONZERO");

    const firstAlias = record("route_alias_first", "route", {
      route_id: "Q48",
    });
    const secondAlias = record("route_alias_second", "route", {
      route_id: "Q48",
    });
    firstAlias.record_aliases = ["route_q48_ambiguous"];
    secondAlias.record_aliases = ["route_q48_ambiguous"];
    const nativeDiagnostic = completenessMirror();
    nativeDiagnostic.enforcement.mode = "enforce";
    expect(() => rebuild(
      [...edge(), firstAlias, secondAlias],
      {
        path: join(work, "completeness-enforce-native-graph-diagnostic.db"),
        relationshipCompleteness: nativeDiagnostic,
      },
    )).toThrow("RC_ENFORCEMENT_GRAPH_BACKLOG_NONZERO");
  });

  it("rechecks graph backlog on enforcement-state update and canonical seal", () => {
    const insertSelectors = (db: Database): void => {
      for (const selector of RELATIONSHIP_COMPLETENESS_REQUIRED_SELECTORS) {
        db.query(
          `INSERT INTO relationship_selector_contracts
           (contract_id, selector, selector_class, expected_count, actual_count,
            enforcement_eligible, promotion_criterion)
           VALUES (?, ?, 'fixture', 0, 0, 1, 'zero backlog')`,
        ).run(RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID, selector);
      }
    };
    const insertGraphFinding = (db: Database, findingId: string): void => {
      db.query(
        `INSERT INTO relationship_validation_findings
         (finding_id, contract_id, code, severity, record_id, detail, finding_json)
         VALUES (?, 'relationship-contract-v1', 'REL_ALIAS_AMBIGUOUS',
                 'warning', NULL, 'ambiguous fixture alias', '{}')`,
      ).run(findingId);
    };

    const updateDb = unsealedDb("enforcement-update-graph-backlog");
    try {
      insertSelectors(updateDb);
      updateDb.query(
        `INSERT INTO relationship_enforcement_state
         (contract_id, mode, hard_mode_ready, input_fingerprint, criteria_json)
         VALUES (?, 'warning', 1, 'fixture', '{}')`,
      ).run(RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID);
      insertGraphFinding(updateDb, "finding_update_backlog");
      expect(() => updateDb.query(
        "UPDATE relationship_enforcement_state SET mode = 'enforce'",
      ).run()).toThrow("RC_ENFORCEMENT_GRAPH_BACKLOG_NONZERO");
    } finally {
      updateDb.close();
    }

    const sealDb = unsealedDb("enforcement-seal-graph-backlog");
    try {
      insertSelectors(sealDb);
      sealDb.query(
        `INSERT INTO relationship_enforcement_state
         (contract_id, mode, hard_mode_ready, input_fingerprint, criteria_json)
         VALUES (?, 'enforce', 1, 'fixture', '{}')`,
      ).run(RELATIONSHIP_COMPLETENESS_SQL_CONTRACT_ID);
      insertGraphFinding(sealDb, "finding_seal_backlog");
      expect(() => sealDb.query(
        "UPDATE canonical_db_state SET sealed = 1 WHERE state_key = 'canonical'",
      ).run()).toThrow("RC_ENFORCEMENT_STATE_INVALID_AT_SEAL");
    } finally {
      sealDb.close();
    }
  });
});
