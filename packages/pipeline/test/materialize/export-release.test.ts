import { afterAll, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { RELATIONSHIP_COMPLETENESS_REQUIRED_WARNING_CODES } from "@mta-wiki/db/relationship-completeness-contract";
import { stableJson } from "@mta-wiki/db/stable-json";
import {
  RELATIONSHIP_CONTRACT_POLICY_V1,
  RELATIONSHIP_ENFORCEMENT_GATE_IDS,
  RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS,
  RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES,
  relationshipEnforcementTransitionFingerprint,
  type RelationshipFinalEndpointMatrix,
} from "@mta-wiki/db/relationship-contract";
import {
  exportRelease,
  parseReleaseManifest,
  type ReleaseExportOptions,
  type ReleaseManifest,
} from "@mta-wiki/pipeline/materialize/export-release";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";

const work = mkdtempSync(join(tmpdir(), "export-release-test-"));
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
const emptyReviewDecisionDir = join(work, "empty-operational-anchor-review-decisions");
mkdirSync(emptyReviewDecisionDir, { recursive: true });
afterAll(() => rmSync(work, { recursive: true, force: true }));

function exportTestRelease(releaseId: string, opts: ReleaseExportOptions) {
  // Synthetic release records do not use the repository GTFS database. Mirror
  // each fixture route into a minimal GTFS fixture so fail-closed route
  // accounting is exercised without weakening production export behavior.
  const gtfsRoutes = opts.gtfsRoutes ?? opts.records?.flatMap((fixtureRecord) => {
    if (fixtureRecord.record_kind !== "route") return [];
    const routeId = fixtureRecord.payload.route_id;
    if (typeof routeId !== "string" || !routeId.trim()) return [];
    return [{ route_id: routeId, short_name: routeId }];
  });
  return exportRelease(releaseId, {
    routeAnchorOverrides: {},
    reviewedNonGtfsRouteDispositions: {},
    ...opts,
    ...(gtfsRoutes ? { gtfsRoutes } : {}),
    operationalAnchorReviewDecisionDir: emptyReviewDecisionDir,
  });
}

function record(id: string, kind: MtaCanonicalRecord["record_kind"]): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: "source_test",
    local_observation_id: id,
    display_name: id,
    payload: kind === "route" ? { route_id: id.replace(/^route_/u, "").toUpperCase() } : {},
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-03T00:00:00.000Z",
  };
}

function releaseDir(root: string, id: string) {
  return join(root, "data", "exports", "releases", id);
}

function readManifest(root: string, id: string): ReleaseManifest {
  return JSON.parse(readFileSync(join(releaseDir(root, id), "manifest.json"), "utf8")) as ReleaseManifest;
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const relationshipBundleRoles = [
  "bus_lane_acquisition_summary",
  "endpoint_type_matrix",
  "enforcement_proof",
  "graph_audit_findings",
  "graph_audit_manifest",
  "graph_audit_summary",
  "occurrence_treatment_physicality_contract",
  "occurrence_treatment_physicality_review_ledger",
  "occurrence_treatment_physicality_summary",
  "operational_occurrence_phase_contract",
  "operational_occurrence_phase_review_ledger",
  "payload_reference_contract",
  "payload_reference_review_ledger",
  "payload_reference_summary",
  "relationship_completeness_manifest",
  "relationship_completeness_summary",
  "relationship_contract",
  "relationship_enforcement_gate_schema",
  "semantic_remediation_ledger",
  "semantic_remediation_summary",
] as const;

const gateSourcePathByRole = new Map(
  Object.values(RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS)
    .flat()
    .map((source) => [source.role, source.path]),
);

const canonicalGateSourceRoleByBundleRole: Partial<
  Record<(typeof relationshipBundleRoles)[number], string>
> = {
  bus_lane_acquisition_summary: "acquisition_summary",
  graph_audit_findings: "graph_audit_findings",
  graph_audit_manifest: "graph_audit_manifest",
  graph_audit_summary: "graph_audit_summary",
  occurrence_treatment_physicality_summary:
    "occurrence_treatment_physicality_summary",
  payload_reference_summary: "payload_reference_summary",
  relationship_completeness_summary:
    "relationship_completeness_summary",
  semantic_remediation_summary: "semantic_remediation_summary",
};

function relationshipGateSourceValues(
  matrix: RelationshipFinalEndpointMatrix,
): Record<string, Record<string, Record<string, unknown>>> {
  const digest = "a".repeat(64);
  return {
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
        totals: { researched: 321, source_acquired: 321, explicitly_excluded: 321, still_unresolved: 321 },
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
        pending_materialization: { active_submission_materialization_failure_count: 0 },
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
        tracker_state_hashes: [digest, digest],
        repository_state_hashes: [digest, digest],
        generator_source_sha256: digest,
        command_spec_sha256: digest,
        tracker_compatibility_status:
          "incompatible_operational_occurrence_schema_v2",
        tracker_replay_status: "not_run_incompatible_schema_v2",
        tracker_replay_attempted: false,
        tracker_write_command_count: 0,
        tracker_importer_source: {
          path: "tools/pipeline-v2/src/lib/mta-wiki-operational-occurrences.ts",
          sha256: digest,
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
        materialization_hashes: [digest, digest],
        sqlite_hashes: [digest, digest],
        release_hashes: [digest, digest],
        command_results: [
          "architecture", "export", "materialize", "quality",
          "schema", "test", "typecheck", "validate",
        ].map((command_id) => ({ command_id, exit_code: 0, output_sha256: digest })),
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
      graph_audit_findings: {},
      graph_audit_manifest: {},
      graph_audit_summary: {
        canonical_relation_count: matrix.covered_relation_count,
        contract_covered_relation_count: matrix.covered_relation_count,
        finding_count: 0,
        findings_by_code: zeroGraphFindingCounts,
        findings_by_severity: {},
      },
      sql_integrity_summary: {
        schema_version: 1,
        summary_id: "relationship-integrity-sql-v1",
        contract_id: "relationship-contract-v1",
        repository_sql_finding_identity_match: true,
        repository_sql_finding_code_counts_match: true,
        graph_summary_finding_counts_match: true,
        graph_enforcement_eligible_finding_count: 0,
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
        required_selector_set_match: true,
        hard_mode_ready: true,
        violation_count: 0,
      },
    },
    relationship_completeness: {
      relationship_completeness_summary: {
        schema_version: 1,
        input_pins: [{
          path:
            "data/relationship-integrity/dispositions/v1/bus-lane-treatments/decisions.jsonl",
          row_count: 669,
          sha256:
            "6d9e8a5d16bc2066434411e96051400cdbee1617c110266e0b3fbfa22b794439",
        }],
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
        occurrences: { eligible_event_ids_outside_operational_denominator: 0 },
        bus_lane_treatments: {
          denominator_count: 669,
          audited_treatment_count: 669,
          materialized_treatment_count: 669,
          accepted_pending_addition_count: 0,
          counts_by_primary_disposition: {
            aggregate_or_unbounded_treatment: 110,
            non_lane_supporting_feature: 17,
            non_physical_enforcement_or_control: 42,
            physical_scope_satisfied: 163,
            review_required: 0,
            reviewed_non_projectable_physical_scope_unproven: 337,
          },
          physical_scope_satisfied_count: 163,
          reviewed_non_projectable_count: 506,
          exact_evidence_bound_count: 669,
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
}

function writeRelationshipBundleFixture(
  root: string,
  releaseId: string,
  relationIds: string[] = ["relation_fixture"],
) {
  const sortedRelationIds = [...relationIds].sort((left, right) =>
    left.localeCompare(right)
  );
  const artifacts: Array<{
    role: string;
    source_path: string;
    bytes: number;
    sha256: string;
  }> = relationshipBundleRoles.map((role) => {
    const canonicalSourceRole =
      canonicalGateSourceRoleByBundleRole[role];
    const sourcePath = canonicalSourceRole
      ? gateSourcePathByRole.get(canonicalSourceRole)!
      : `data/contracts/test/${role}.json`;
    const path = join(root, sourcePath);
    mkdirSync(dirname(path), { recursive: true });
    const value = { role };
    writeFileSync(path, `${stableJson(value as unknown as JsonValue)}\n`, "utf8");
    return {
      role,
      source_path: sourcePath,
      bytes: readFileSync(path).length,
      sha256: sha256(path),
    };
  });
  const endpoint = artifacts.find((entry) => entry.role === "endpoint_type_matrix");
  const proof = artifacts.find((entry) => entry.role === "enforcement_proof");
  const contract = artifacts.find((entry) => entry.role === "relationship_contract");
  const graphManifest = artifacts.find((entry) => entry.role === "graph_audit_manifest");
  const completenessManifest = artifacts.find(
    (entry) => entry.role === "relationship_completeness_manifest",
  );
  if (
    !endpoint ||
    !proof ||
    !contract ||
    !graphManifest ||
    !completenessManifest
  ) {
    throw new Error("incomplete relationship bundle fixture");
  }
  const relationIdsSha256 = createHash("sha256")
    .update(stableJson(sortedRelationIds as unknown as JsonValue))
    .digest("hex");
  const tupleSetSha256 = createHash("sha256")
    .update(stableJson(["fixture_tuple"] as unknown as JsonValue))
    .digest("hex");
  const projectedRelationsPath =
    "data/contracts/test/projected-relations.jsonl";
  const projectedRelationsFile = join(root, projectedRelationsPath);
  const projectedRelations = sortedRelationIds.map((relationId) => ({
    relation_id: relationId,
    relation_family: "route_scope",
    relation_kind: "affects_route",
    subject_id: "project_fixture",
    subject_kind: "project",
    object_id: "route_fixture",
    object_kind: "route",
    evidence_ids: [],
    evidence_bindings_sha256: "f".repeat(64),
    semantic_review_decision_ids: ["fixture-review"],
    semantic_remediation_decision_ids: [],
    mapping_status: "mapped",
  }));
  writeFileSync(
    projectedRelationsFile,
    `${projectedRelations.map((relation) =>
      stableJson(relation as unknown as JsonValue)
    ).join("\n")}\n`,
    "utf8",
  );
  const projectedRelationsBytes = readFileSync(
    projectedRelationsFile,
  );
  artifacts.push({
    role: "semantic_projected_relations",
    source_path: projectedRelationsPath,
    bytes: projectedRelationsBytes.length,
    sha256: sha256(projectedRelationsFile),
  });
  const endpointMatrix: RelationshipFinalEndpointMatrix = {
    schema_version: 1,
    matrix_id: "relationship-contract-v1-post-remediation-final",
    contract_id: "relationship-contract-v1",
    review_status: "reviewed_post_remediation",
    obsolete_baseline_tuple_policy: "reject",
    generated_from: {
      projected_relations_path: projectedRelationsPath,
      projected_relations_sha256: sha256(projectedRelationsFile),
      projected_relations_logical_sha256: createHash("sha256")
        .update(
          stableJson(
            projectedRelations as unknown as JsonValue,
          ),
        )
        .digest("hex"),
      projected_tuples_path: "data/quality/relationship-integrity/semantic-remediation/projected-tuples.json",
      projected_tuples_sha256: "c".repeat(64),
      projected_tuples_logical_sha256: "d".repeat(64),
      semantic_remediation_summary_path: "data/quality/relationship-integrity/semantic-remediation/summary.json",
      semantic_remediation_summary_sha256: "e".repeat(64),
      campaign_id: "relationship-semantic-remediation-v1",
      skipped_correction_count: 0,
      unmapped_relation_count: 0,
    },
    relation_kind_rule_count: 1,
    covered_relation_count: sortedRelationIds.length,
    allowed_family_shape_count: 1,
    relation_ids_sha256: relationIdsSha256,
    tuple_set_sha256: tupleSetSha256,
    rules: [{
      relation_kind: "affects_route",
      relation_families: ["route_scope"],
      allowed_shapes: [{
        subject_kind: "project",
        object_kind: "route",
      }],
      allowed_family_shapes: [{
        relation_family: "route_scope",
        subject_kind: "project",
        object_kind: "route",
        provenance: "reviewed_post_remediation",
        review_decision_ids: ["fixture-review"],
        relation_count: sortedRelationIds.length,
        relation_ids_sha256: relationIdsSha256,
      }],
      review_basis: "reviewed_post_remediation",
    }],
  };
  const endpointPath = join(root, endpoint.source_path);
  writeFileSync(
    endpointPath,
    `${stableJson(endpointMatrix as unknown as JsonValue)}\n`,
    "utf8",
  );
  endpoint.bytes = readFileSync(endpointPath).length;
  endpoint.sha256 = sha256(endpointPath);
  const graphManifestPath = join(root, graphManifest.source_path);
  const releaseRelationBytes = `${sortedRelationIds.map((relationId) =>
    stableJson(
      record(relationId, "relation") as unknown as JsonValue,
    )
  ).join("\n")}\n`;
  writeFileSync(
    graphManifestPath,
    `${stableJson({
      schema_version: 1,
      contract_id: "relationship-contract-v1",
      canonical_relations_sha256: createHash("sha256")
        .update(releaseRelationBytes)
        .digest("hex"),
    } as unknown as JsonValue)}\n`,
    "utf8",
  );
  graphManifest.bytes = readFileSync(graphManifestPath).length;
  graphManifest.sha256 = sha256(graphManifestPath);
  const emptySha256 = createHash("sha256").update("").digest("hex");
  const completenessManifestPath = join(
    root,
    completenessManifest.source_path,
  );
  writeFileSync(
    completenessManifestPath,
    `${stableJson({
      schema_version: 1,
      release_id: releaseId,
      input_pins: [
        "claims.jsonl",
        "corridors.jsonl",
        "entities.jsonl",
        "events.jsonl",
        "metric_claims.jsonl",
        "operational_occurrences.jsonl",
        "projects.jsonl",
        "route_anchors.jsonl",
        "routes.jsonl",
        "source_gaps.jsonl",
        "sources.jsonl",
        "tables.jsonl",
        "treatment_components.jsonl",
      ].map((name) => ({
        path: `data/exports/releases/${releaseId}/${name}`,
        bytes: 0,
        sha256: emptySha256,
      })).concat([{
        path: `data/exports/releases/${releaseId}/relations.jsonl`,
        bytes: Buffer.byteLength(releaseRelationBytes),
        sha256: createHash("sha256")
          .update(releaseRelationBytes)
          .digest("hex"),
      }]),
    } as unknown as JsonValue)}\n`,
    "utf8",
  );
  completenessManifest.bytes = readFileSync(
    completenessManifestPath,
  ).length;
  completenessManifest.sha256 = sha256(
    completenessManifestPath,
  );
  const endpointLogicalSha256 = createHash("sha256")
    .update(stableJson(endpointMatrix as unknown as JsonValue))
    .digest("hex");
  const gateSourceValues =
    relationshipGateSourceValues(endpointMatrix);
  const graphGateSources = Object.fromEntries(
    RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS
      .referential_type_evidence_integrity.map((source) => [
        source.role,
        source.path,
      ]),
  );
  const graphSourceValues =
    gateSourceValues.referential_type_evidence_integrity!;
  const graphFindingsText = "";
  const graphSummaryText = `${stableJson(
    graphSourceValues.graph_audit_summary! as unknown as JsonValue,
  )}\n`;
  const graphManifestInputs = {
    contract_sha256: "a".repeat(64),
    endpoint_matrix_sha256: endpointLogicalSha256,
    canonical_relations_sha256: createHash("sha256")
      .update(releaseRelationBytes)
      .digest("hex"),
  };
  graphSourceValues.graph_audit_manifest = {
    schema_version: 1,
    contract_id: "relationship-contract-v1",
    ...graphManifestInputs,
    input_fingerprint: createHash("sha256")
      .update(
        stableJson(graphManifestInputs as unknown as JsonValue),
      )
      .digest("hex"),
    mode: "enforce",
    artifacts: [
      {
        path: "findings.jsonl",
        sha256: createHash("sha256")
          .update(graphFindingsText)
          .digest("hex"),
        rows: 0,
      },
      {
        path: "summary.json",
        sha256: createHash("sha256")
          .update(graphSummaryText)
          .digest("hex"),
      },
    ],
    reproduction_commands: [],
  };
  const graphManifestText = `${stableJson(
    graphSourceValues.graph_audit_manifest as unknown as JsonValue,
  )}\n`;
  Object.assign(graphSourceValues.sql_integrity_summary!, {
    enforcement_mode: "enforce",
    graph_findings_path: graphGateSources.graph_audit_findings,
    graph_findings_sha256: createHash("sha256")
      .update(graphFindingsText)
      .digest("hex"),
    graph_manifest_path: graphGateSources.graph_audit_manifest,
    graph_manifest_sha256: createHash("sha256")
      .update(graphManifestText)
      .digest("hex"),
    graph_summary_path: graphGateSources.graph_audit_summary,
    graph_summary_sha256: createHash("sha256")
      .update(graphSummaryText)
      .digest("hex"),
  });
  const gates = RELATIONSHIP_ENFORCEMENT_GATE_IDS.map((gateId) => {
    const gateDir =
      `data/contracts/test/enforcement-gates/${gateId}`;
    mkdirSync(join(root, gateDir), { recursive: true });
    const sourceArtifacts =
      RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS[gateId]
      .map(({ role, path: sourcePath }) => {
        const value = gateSourceValues[gateId]![role];
        if (!value) {
          throw new Error(
            `missing relationship gate fixture source ${gateId}/${role}`,
          );
        }
        const path = join(root, sourcePath);
        mkdirSync(dirname(path), { recursive: true });
        const text = role === "graph_audit_findings"
          ? graphFindingsText
          : role === "graph_audit_manifest"
          ? graphManifestText
          : role === "graph_audit_summary"
          ? graphSummaryText
          : `${stableJson(value as unknown as JsonValue)}\n`;
        writeFileSync(path, text, "utf8");
        let entry = artifacts.find(
          (artifact) => artifact.source_path === sourcePath,
        );
        if (!entry) {
          entry = {
            role: `enforcement_gate_source:${gateId}:${role}`,
            source_path: sourcePath,
            bytes: 0,
            sha256: "",
          };
          artifacts.push(entry);
        }
        entry.bytes = Buffer.byteLength(text);
        entry.sha256 = sha256(path);
        return {
          role,
          path: sourcePath,
          sha256: entry.sha256,
        };
      })
      .sort((left, right) =>
        left.role.localeCompare(right.role) ||
        left.path.localeCompare(right.path));
    const sourcePath = `${gateDir}/gate.json`;
    const path = join(root, sourcePath);
    const gateArtifact = {
      schema_version: 1,
      artifact_id:
        `relationship-contract-v1-enforcement-gate:${gateId}`,
      contract_id: "relationship-contract-v1",
      gate_id: gateId,
      reviewed_at: "2026-07-16T03:00:00.000Z",
      reviewed_by: "fixture-reviewer",
      source_count: sourceArtifacts.length,
      source_artifacts: sourceArtifacts,
      derived_violation_count: 0,
    };
    const gateText = `${stableJson(
      gateArtifact as unknown as JsonValue,
    )}\n`;
    writeFileSync(path, gateText, "utf8");
    artifacts.push({
      role: `enforcement_gate:${gateId}`,
      source_path: sourcePath,
      bytes: Buffer.byteLength(gateText),
      sha256: sha256(path),
    });
    return {
      gate_id: gateId,
      status: "ready" as const,
      violation_count: 0 as const,
      artifact_path: sourcePath,
      artifact_sha256: sha256(path),
      criteria: [
        `${gateId} fixture is derived from parsed source artifacts`,
      ],
    };
  });
  const refreshRoles = new Set<string>(
    RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES,
  );
  const liveSources = gates.flatMap((gate) => {
    const gateArtifact = JSON.parse(
      readFileSync(join(root, gate.artifact_path), "utf8"),
    ) as {
      source_artifacts: Array<{
        role: string;
        path: string;
        sha256: string;
      }>;
    };
    return gateArtifact.source_artifacts;
  });
  const preSourceText = new Map(
    liveSources.map((source) => [
      source.path,
      readFileSync(join(root, source.path), "utf8"),
    ]),
  );
  const preGraphManifest = JSON.parse(
    preSourceText.get(graphGateSources.graph_audit_manifest!)!,
  ) as Record<string, unknown>;
  preGraphManifest.mode = "warn";
  const preGraphManifestText = `${stableJson(
    preGraphManifest as unknown as JsonValue,
  )}\n`;
  preSourceText.set(
    graphGateSources.graph_audit_manifest!,
    preGraphManifestText,
  );
  const preSql = JSON.parse(
    preSourceText.get(graphGateSources.sql_integrity_summary!)!,
  ) as Record<string, unknown>;
  preSql.enforcement_mode = "warning";
  preSql.graph_manifest_sha256 = createHash("sha256")
    .update(preGraphManifestText)
    .digest("hex");
  preSourceText.set(
    graphGateSources.sql_integrity_summary!,
    `${stableJson(preSql as unknown as JsonValue)}\n`,
  );
  const prePromotionSources = liveSources
    .map((source) => {
      const text = preSourceText.get(source.path)!;
      const archivePath =
        `data/contracts/test/enforcement-archive/sources/${source.role}${source.path.endsWith(".jsonl") ? ".jsonl" : ".json"}`;
      const path = join(root, archivePath);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text, "utf8");
      artifacts.push({
        role: `enforcement_transition_source:${source.role}`,
        source_path: archivePath,
        bytes: Buffer.byteLength(text),
        sha256: sha256(path),
      });
      return {
        role: source.role,
        path: source.path,
        sha256: sha256(path),
        archive_path: archivePath,
        ...(refreshRoles.has(source.role)
          ? {
              transition_fingerprint:
                relationshipEnforcementTransitionFingerprint(
                  source.role,
                  text,
                ),
            }
          : {}),
      };
    })
    .sort((left, right) =>
      left.role.localeCompare(right.role) ||
      left.path.localeCompare(right.path));
  const preSourceByRole = new Map(
    prePromotionSources.map((source) => [source.role, source]),
  );
  const previousGates = gates.map((gate) => {
    const liveGate = JSON.parse(
      readFileSync(join(root, gate.artifact_path), "utf8"),
    ) as {
      source_artifacts: Array<{
        role: string;
        path: string;
        sha256: string;
      }>;
    } & Record<string, unknown>;
    liveGate.source_artifacts = liveGate.source_artifacts.map(
      (source) => {
        const pin = preSourceByRole.get(source.role)!;
        return {
          role: pin.role,
          path: pin.path,
          sha256: pin.sha256,
        };
      },
    );
    const text = `${stableJson(liveGate as unknown as JsonValue)}\n`;
    const archivePath =
      `data/contracts/test/enforcement-archive/gates/${gate.gate_id}.json`;
    const path = join(root, archivePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
    artifacts.push({
      role: `enforcement_transition_gate:${gate.gate_id}`,
      source_path: archivePath,
      bytes: Buffer.byteLength(text),
      sha256: sha256(path),
    });
    return {
      gate_id: gate.gate_id,
      archive_path: archivePath,
      artifact_path: gate.artifact_path,
      artifact_sha256: sha256(path),
    };
  });
  const previousProofValue = {
    schema_version: 2,
    proof_id: "relationship-contract-v1-enforcement-proof",
    contract_id: "relationship-contract-v1",
    proof_status: "ready",
    proof_stage: "pre_promotion_warning",
    validation_mode: "warn",
    reviewed_at: "2026-07-16T03:00:00.000Z",
    reviewed_by: "fixture-reviewer",
    final_matrix: {
      path: endpoint.source_path,
      sha256: endpointLogicalSha256,
      relation_count: sortedRelationIds.length,
      tuple_count: 1,
      relation_ids_sha256: relationIdsSha256,
      tuple_set_sha256: tupleSetSha256,
    },
    gate_count: RELATIONSHIP_ENFORCEMENT_GATE_IDS.length,
    all_gates_ready: true,
    total_violation_count: 0,
    gates: gates.map((gate) => {
      const archived = previousGates.find(
        (candidate) => candidate.gate_id === gate.gate_id,
      )!;
      return {
        ...gate,
        artifact_sha256: archived.artifact_sha256,
      };
    }),
  };
  const previousProofPath =
    "data/contracts/test/enforcement-archive/proof.json";
  const previousProofFile = join(root, previousProofPath);
  const previousProofText = `${stableJson(
    previousProofValue as unknown as JsonValue,
  )}\n`;
  mkdirSync(dirname(previousProofFile), { recursive: true });
  writeFileSync(previousProofFile, previousProofText, "utf8");
  artifacts.push({
    role: "enforcement_transition_previous_proof",
    source_path: previousProofPath,
    bytes: Buffer.byteLength(previousProofText),
    sha256: sha256(previousProofFile),
  });
  const previousProofLogicalSha256 = createHash("sha256")
    .update(stableJson(previousProofValue as unknown as JsonValue))
    .digest("hex");
  const receiptValue = {
    schema_version: 1,
    receipt_id: "relationship-contract-v1-enforcement-transition",
    contract_id: "relationship-contract-v1",
    transition: {
      from_state: "warning_ready",
      to_state: "enforced_refresh_required",
    },
    promoted_at: "2026-07-16T04:00:00.000Z",
    promoted_by: "fixture-reviewer",
    previous_proof: {
      path: previousProofPath,
      sha256: previousProofLogicalSha256,
      proof_stage: "pre_promotion_warning",
    },
    final_matrix: previousProofValue.final_matrix,
    previous_gates: previousGates.map((gate) => ({
      gate_id: gate.gate_id,
      path: gate.archive_path,
      sha256: gate.artifact_sha256,
    })),
    pre_promotion_sources: prePromotionSources,
    invariant_artifacts: [
      { role: "canonical_relations", path: "fixture/relations.jsonl", sha256: "a".repeat(64) },
      { role: "determinism_consumer_summary", path: "fixture/determinism.json", sha256: "a".repeat(64) },
      { role: "final_endpoint_matrix", path: endpoint.source_path, sha256: endpointLogicalSha256 },
      { role: "reviewed_release_manifest", path: "fixture/release.json", sha256: "a".repeat(64) },
    ],
    refresh_artifacts: [
      { role: "canonical_db", path: "fixture/canonical.db", sha256: "a".repeat(64) },
      ...prePromotionSources.filter((source) =>
        refreshRoles.has(source.role)
      ),
    ].sort((left, right) => left.role.localeCompare(right.role)),
  };
  const receiptSourcePath =
    "data/contracts/test/enforcement-transition-receipt.json";
  const receiptPath = join(root, receiptSourcePath);
  const receiptText = `${stableJson(
    receiptValue as unknown as JsonValue,
  )}\n`;
  writeFileSync(receiptPath, receiptText, "utf8");
  artifacts.push({
    role: "enforcement_transition_receipt",
    source_path: receiptSourcePath,
    bytes: Buffer.byteLength(receiptText),
    sha256: sha256(receiptPath),
  });
  const receiptLogicalSha256 = createHash("sha256")
    .update(stableJson(receiptValue as unknown as JsonValue))
    .digest("hex");
  const proofPath = join(root, proof.source_path);
  const proofValue = {
    schema_version: 2,
    proof_id: "relationship-contract-v1-enforcement-proof",
    contract_id: "relationship-contract-v1",
    proof_status: "ready",
    proof_stage: "post_promotion_enforced",
    validation_mode: "enforce",
    previous_proof: receiptValue.previous_proof,
    transition_receipt: {
      path: receiptSourcePath,
      sha256: receiptLogicalSha256,
    },
    reviewed_at: "2026-07-16T03:00:00.000Z",
    reviewed_by: "fixture-reviewer",
    final_matrix: {
      path: endpoint.source_path,
      sha256: endpointLogicalSha256,
      relation_count: sortedRelationIds.length,
      tuple_count: 1,
      relation_ids_sha256: relationIdsSha256,
      tuple_set_sha256: tupleSetSha256,
    },
    gate_count: RELATIONSHIP_ENFORCEMENT_GATE_IDS.length,
    all_gates_ready: true,
    total_violation_count: 0,
    gates,
  };
  writeFileSync(
    proofPath,
    `${stableJson(proofValue as unknown as JsonValue)}\n`,
    "utf8",
  );
  proof.bytes = readFileSync(proofPath).length;
  proof.sha256 = sha256(proofPath);
  const proofLogicalSha256 = createHash("sha256")
    .update(stableJson(proofValue as unknown as JsonValue))
    .digest("hex");
  const contractPath = join(root, contract.source_path);
  writeFileSync(
    contractPath,
    `${stableJson({
      schema_version: 1,
      contract_id: "relationship-contract-v1",
      contract_status: "enforced",
      enforcement_state: "enforced_ready",
      reviewed_at: "2026-07-16T03:00:00.000Z",
      reviewed_by: "fixture-reviewer",
      endpoint_matrix: {
        path: endpoint.source_path,
        sha256: endpointLogicalSha256,
        matrix_kind: "post_remediation_reviewed",
        relation_count: sortedRelationIds.length,
        tuple_count: 1,
        relation_ids_sha256: relationIdsSha256,
        tuple_set_sha256: tupleSetSha256,
        obsolete_baseline_tuple_policy: "reject",
        unlisted_relation_policy: "error",
        new_shape_policy: "error",
      },
      enforcement_proof: {
        path: proof.source_path,
        sha256: proofLogicalSha256,
        required_gate_ids: [...RELATIONSHIP_ENFORCEMENT_GATE_IDS],
        transition_receipt: {
          path: receiptSourcePath,
          sha256: receiptLogicalSha256,
        },
      },
      ...RELATIONSHIP_CONTRACT_POLICY_V1,
    } as unknown as JsonValue)}\n`,
    "utf8",
  );
  contract.bytes = readFileSync(contractPath).length;
  contract.sha256 = sha256(contractPath);
  artifacts.sort(
    (left, right) =>
      left.role.localeCompare(right.role) ||
      left.source_path.localeCompare(right.source_path),
  );
  const descriptorPath = join(
    root,
    "data",
    "contracts",
    "relationships",
    "v1",
    "release-bundle-sources.json",
  );
  mkdirSync(join(root, "data", "contracts", "relationships", "v1"), { recursive: true });
  writeFileSync(
    descriptorPath,
    `${stableJson({
      schema_version: 1,
      bundle_id: "relationship-integrity-v1",
      contract_id: "relationship-contract-v1",
      validation_mode: "enforce",
      artifacts,
    } as unknown as JsonValue)}\n`,
    "utf8",
  );
  return { artifacts, descriptorPath };
}

function fileTree(root: string) {
  const files: Record<string, string> = {};
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else files[relative(root, path)] = readFileSync(path, "utf8");
    }
  };
  visit(root);
  return files;
}

describe("exportRelease", () => {
  it("writes plural filenames and manifest counts/hashes without promoting by default", () => {
    const root = join(work, "happy");
    const result = exportTestRelease("v-test", {
      rootDir: root,
      records: [record("route_b1", "route"), record("source_a", "source")],
    });
    expect(result.recordCount).toBe(2);
    expect(result.files).toBe(20);

    const dir = releaseDir(root, "v-test");
    expect(readFileSync(join(dir, "routes.jsonl"), "utf8")).toBe(`${stableJson(record("route_b1", "route") as unknown as JsonValue)}\n`);
    expect(readFileSync(join(dir, "sources.jsonl"), "utf8")).toBe(`${stableJson(record("source_a", "source") as unknown as JsonValue)}\n`);
    expect(existsSync(join(root, "data", "exports", "releases", "LATEST"))).toBe(false);

    const manifest = readManifest(root, "v-test");
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.release_id).toBe("v-test");
    expect(manifest.contract_versions.operational_anchors).toBe(1);
    expect(manifest.contract_versions.operational_anchor_review_decisions).toBe(1);
    expect(manifest.contract_versions.operational_occurrences).toBe(2);
    expect(manifest.contract_versions.operational_occurrence_review_decisions).toBe(1);
    expect(manifest.record_counts.route).toBe(1);
    expect(manifest.record_counts.source).toBe(1);
    expect(manifest.record_counts.table).toBe(0);
    expect(manifest.pointers).toEqual({
      operational_anchors: "operational_anchors.jsonl",
      operational_anchor_summary: "operational_anchors_summary.json",
      operational_anchor_review_decisions: "operational_anchor_review_decisions.json",
      operational_occurrences: "operational_occurrences.jsonl",
      operational_occurrence_summary: "operational_occurrences_summary.json",
      operational_occurrence_review_decisions: "operational_occurrence_review_decisions.json",
      route_anchors: "route_anchors.jsonl",
      taxonomy: "taxonomy.json",
      quality_report: null,
    });
    expect(manifest.files["routes.jsonl"]?.sha256).toBe(sha256(join(dir, "routes.jsonl")));
    expect(manifest.files["sources.jsonl"]?.bytes).toBe(Buffer.byteLength(readFileSync(join(dir, "sources.jsonl"))));
    expect(manifest.files["tables.jsonl"]?.bytes).toBe(0);
    expect(manifest.files["route_anchors.jsonl"]?.bytes).toBeGreaterThan(0);
    expect(JSON.parse(readFileSync(join(dir, "route_anchors.jsonl"), "utf8").trim())).toMatchObject({
      gtfs_route_id: "B1",
      canonical_route_record_id: "route_b1",
      variant_record_ids: [],
    });
    expect(manifest.files["operational_anchors.jsonl"]?.bytes).toBe(0);
    expect(manifest.files["operational_anchors_summary.json"]?.bytes).toBeGreaterThan(0);
    expect(manifest.files["operational_anchor_review_decisions.json"]?.sha256).toBe(
      sha256(join(dir, "operational_anchor_review_decisions.json")),
    );
    expect(manifest.files["operational_occurrences.jsonl"]?.bytes).toBe(0);
    expect(manifest.files["operational_occurrences_summary.json"]?.sha256).toBe(
      sha256(join(dir, "operational_occurrences_summary.json")),
    );
    expect(manifest.files["operational_occurrence_review_decisions.json"]?.sha256).toBe(
      sha256(join(dir, "operational_occurrence_review_decisions.json")),
    );
    expect(JSON.parse(readFileSync(join(dir, "operational_anchor_review_decisions.json"), "utf8"))).toEqual({
      snapshot_version: 1,
      decision_schema_version: 1,
      decision_count: 0,
      decisions: [],
    });
    expect(JSON.parse(readFileSync(join(dir, "operational_occurrences_summary.json"), "utf8"))).toEqual({
      schema_version: 2,
      occurrence_count: 0,
      study_projection_eligible_count: 0,
      atomic_count: 0,
      bundle_count: 0,
      multi_route_count: 0,
      candidate_projection_count: 0,
      counts_by_exclusion_reason: {},
    });
    expect(JSON.parse(readFileSync(join(dir, "operational_occurrence_review_decisions.json"), "utf8"))).toEqual({
      snapshot_version: 1,
      decision_schema_version: 1,
      decision_count: 0,
      decisions: [],
    });
    expect(() => parseReleaseManifest(manifest)).not.toThrow();
    expect(manifest.files["taxonomy.json"]?.bytes).toBeGreaterThan(0);
    expect(manifest.files["manifest.json"]).toBeUndefined();
  });

  it("leaves an existing public pointer untouched unless promotion is explicit", () => {
    const root = join(work, "promotion");
    const releases = join(root, "data", "exports", "releases");
    const latest = join(releases, "LATEST");
    mkdirSync(releases, { recursive: true });
    writeFileSync(latest, "v-public\n", "utf8");

    exportTestRelease("v-draft", { rootDir: root, records: [] });
    expect(readFileSync(latest, "utf8")).toBe("v-public\n");

    exportTestRelease("v-promoted", { rootDir: root, records: [], setLatest: true });
    expect(readFileSync(latest, "utf8")).toBe("v-promoted\n");
  });

  it("cuts manifest v4 with a content-addressed relationship-integrity bundle", () => {
    const root = join(work, "relationship-bundle");
    const fixture = writeRelationshipBundleFixture(root, "v4-bundle");
    const result = exportTestRelease("v4-bundle", {
      rootDir: root,
      records: [record("relation_fixture", "relation")],
    });
    const dir = releaseDir(root, "v4-bundle");
    const manifest = readManifest(root, "v4-bundle");

    expect(manifest.manifest_version).toBe(4);
    expect(manifest.contract_versions.relationship_integrity_bundle).toBe(1);
    expect(manifest.pointers.relationship_integrity_bundle).toBe("relationship_integrity_bundle.json");
    expect(result.files).toBe(20 + fixture.artifacts.length + 1);
    expect(manifest.files["relationship_integrity_bundle.json"]?.sha256).toBe(
      sha256(join(dir, "relationship_integrity_bundle.json")),
    );
    const bundle = JSON.parse(readFileSync(join(dir, "relationship_integrity_bundle.json"), "utf8")) as {
      artifact_count: number;
      validation_mode: string;
      artifacts: Array<{ role: string; source_path: string; release_path: string; sha256: string }>;
    };
    expect(bundle.validation_mode).toBe("enforce");
    expect(bundle.artifact_count).toBe(fixture.artifacts.length);
    expect(bundle.artifacts.map((entry) => entry.role)).toEqual(
      fixture.artifacts.map((entry) => entry.role),
    );
    for (const entry of bundle.artifacts) {
      expect(entry.release_path).toBe(`relationship-integrity/${entry.source_path}`);
      expect(manifest.files[entry.release_path]?.sha256).toBe(entry.sha256);
      expect(existsSync(join(dir, entry.release_path))).toBe(true);
    }
    expect(() => parseReleaseManifest(manifest)).not.toThrow();
  });

  it("binds the final matrix relation hash in exporter localeCompare order", () => {
    const root = join(work, "relationship-bundle-locale-order");
    const relationIds = [
      "relation_b44-sbs-operates-on-corridor-201011",
      "relation_b44-sbs-operates-on-corridor_2",
    ];
    const exporterOrder = [...relationIds].sort((left, right) =>
      left.localeCompare(right)
    );
    expect([...relationIds].sort()).not.toEqual(exporterOrder);
    writeRelationshipBundleFixture(root, "v4-locale-order", relationIds);

    exportTestRelease("v4-locale-order", {
      rootDir: root,
      records: relationIds.map((relationId) =>
        record(relationId, "relation")
      ),
    });

    const exportedIds = readFileSync(
      join(
        releaseDir(root, "v4-locale-order"),
        "relations.jsonl",
      ),
      "utf8",
    )
      .trimEnd()
      .split(/\r?\n/u)
      .map((line) =>
        (JSON.parse(line) as { record_id: string }).record_id
      );
    expect(exportedIds).toEqual(exporterOrder);
  });

  it("forbids an enforcement bundle while post-promotion refresh is still required", () => {
    const root = join(work, "relationship-bundle-refresh-required");
    const fixture = writeRelationshipBundleFixture(root, "refresh-required");
    const contractEntry = fixture.artifacts.find(
      (entry) => entry.role === "relationship_contract",
    )!;
    const contractPath = join(root, contractEntry.source_path);
    const contract = JSON.parse(
      readFileSync(contractPath, "utf8"),
    ) as Record<string, unknown>;
    contract.enforcement_state = "enforced_refresh_required";
    writeFileSync(
      contractPath,
      `${stableJson(contract as unknown as JsonValue)}\n`,
      "utf8",
    );
    contractEntry.bytes = readFileSync(contractPath).length;
    contractEntry.sha256 = sha256(contractPath);
    const descriptor = JSON.parse(
      readFileSync(fixture.descriptorPath, "utf8"),
    ) as Record<string, unknown>;
    descriptor.artifacts = fixture.artifacts;
    writeFileSync(
      fixture.descriptorPath,
      `${stableJson(descriptor as unknown as JsonValue)}\n`,
      "utf8",
    );
    expect(() =>
      exportTestRelease("refresh-required", {
        rootDir: root,
        records: [record("relation_fixture", "relation")],
      })
    ).toThrow("requires enforced_ready");
    expect(
      existsSync(releaseDir(root, "refresh-required")),
    ).toBe(false);
  });

  it("fails a release cut when a pinned relationship-integrity artifact changes", () => {
    const root = join(work, "relationship-bundle-tamper");
    const fixture = writeRelationshipBundleFixture(root, "tampered");
    const artifact = fixture.artifacts.find((entry) => entry.role === "graph_audit_summary");
    if (!artifact) throw new Error("missing fixture artifact");
    writeFileSync(join(root, artifact.source_path), "{\"changed\":true}\n", "utf8");

    expect(() => exportTestRelease("tampered", {
      rootDir: root,
      records: [record("relation_fixture", "relation")],
    })).toThrow(
      "Relationship enforcement source artifact hash mismatch",
    );
    expect(existsSync(releaseDir(root, "tampered"))).toBe(false);
  });

  it("rejects an enforcement bundle whose matrix belongs to another relation snapshot", () => {
    const root = join(work, "relationship-bundle-snapshot-mismatch");
    writeRelationshipBundleFixture(root, "snapshot-mismatch");
    expect(() =>
      exportTestRelease("snapshot-mismatch", {
        rootDir: root,
        records: [],
      })
    ).toThrow(
      "final matrix does not match the exported relation snapshot",
    );
    expect(existsSync(releaseDir(root, "snapshot-mismatch"))).toBe(
      false,
    );
  });

  it("requires every enforcement gate artifact to be included in the release bundle", () => {
    const root = join(work, "relationship-bundle-gate-closure");
    const fixture = writeRelationshipBundleFixture(root, "missing-gate");
    const descriptor = JSON.parse(
      readFileSync(fixture.descriptorPath, "utf8"),
    ) as { artifacts: Array<{ role: string }> };
    descriptor.artifacts = descriptor.artifacts.filter(
      (entry) =>
        entry.role !==
        `enforcement_gate:${RELATIONSHIP_ENFORCEMENT_GATE_IDS[0]}`,
    );
    writeFileSync(
      fixture.descriptorPath,
      `${stableJson(descriptor as unknown as JsonValue)}\n`,
      "utf8",
    );
    expect(() =>
      exportTestRelease("missing-gate", {
        rootDir: root,
        records: [record("relation_fixture", "relation")],
      })
    ).toThrow("must include the content-addressed");
    expect(existsSync(releaseDir(root, "missing-gate"))).toBe(false);
  });

  it("requires the graph findings ledger as a first-class release artifact", () => {
    const root = join(work, "relationship-bundle-graph-findings");
    const fixture = writeRelationshipBundleFixture(root, "missing-graph-findings");
    const descriptor = JSON.parse(
      readFileSync(fixture.descriptorPath, "utf8"),
    ) as { artifacts: Array<{ role: string }> };
    descriptor.artifacts = descriptor.artifacts.filter(
      (entry) => entry.role !== "graph_audit_findings",
    );
    writeFileSync(
      fixture.descriptorPath,
      `${stableJson(descriptor as unknown as JsonValue)}\n`,
      "utf8",
    );

    expect(() =>
      exportTestRelease("missing-graph-findings", {
        rootDir: root,
        records: [record("relation_fixture", "relation")],
      })
    ).toThrow("missing required roles graph_audit_findings");
    expect(
      existsSync(releaseDir(root, "missing-graph-findings")),
    ).toBe(false);
  });

  it("rejects relationship bundle artifacts that resolve through symlinks", () => {
    const root = join(work, "relationship-bundle-symlink");
    const fixture = writeRelationshipBundleFixture(root, "symlinked");
    const graph = fixture.artifacts.find(
      (entry) => entry.role === "graph_audit_summary",
    );
    if (!graph) throw new Error("missing graph fixture");
    const outside = join(work, "outside-relationship-artifact.json");
    writeFileSync(outside, "{\"outside\":true}\n", "utf8");
    rmSync(join(root, graph.source_path));
    symlinkSync(outside, join(root, graph.source_path));
    expect(() =>
      exportTestRelease("symlinked", {
        rootDir: root,
        records: [record("relation_fixture", "relation")],
      })
    ).toThrow("regular non-symlink file");
    expect(existsSync(releaseDir(root, "symlinked"))).toBe(false);
  });

  it("does not downgrade an enforced contract to manifest v3 when the bundle is disabled", () => {
    const root = join(work, "relationship-bundle-downgrade");
    const fixture = writeRelationshipBundleFixture(root, "downgraded");
    const contract = fixture.artifacts.find(
      (entry) => entry.role === "relationship_contract",
    );
    if (!contract) throw new Error("missing contract fixture");
    writeFileSync(
      join(
        root,
        "data",
        "contracts",
        "relationships",
        "v1",
        "contract.json",
      ),
      readFileSync(join(root, contract.source_path)),
    );
    expect(() =>
      exportTestRelease("downgraded", {
        rootDir: root,
        records: [],
        relationshipIntegrityBundleDescriptor: null,
      })
    ).toThrow(
      "An enforced relationship contract requires a manifest-v4",
    );
    expect(existsSync(releaseDir(root, "downgraded"))).toBe(false);

    const stagingRoot = join(
      root,
      "data",
      "exports",
      "releases",
      ".downgraded-staging-test",
    );
    const staged = exportTestRelease("downgraded", {
      rootDir: root,
      records: [],
      outputRoot: stagingRoot,
      relationshipIntegrityBundleDescriptor: null,
      relationshipCompletenessStaging: true,
    });
    expect(staged.dir).toBe(join(stagingRoot, "downgraded"));
    expect(
      JSON.parse(readFileSync(join(staged.dir, "manifest.json"), "utf8")),
    ).toMatchObject({ release_id: "downgraded", manifest_version: 3 });
  });

  it("does not promote a release whose export fails", () => {
    const root = join(work, "failed-promotion");
    const releases = join(root, "data", "exports", "releases");
    const latest = join(releases, "LATEST");
    const badReviewDecisionDir = join(root, "bad-review-decisions");
    mkdirSync(releases, { recursive: true });
    mkdirSync(badReviewDecisionDir, { recursive: true });
    writeFileSync(latest, "v-public\n", "utf8");
    writeFileSync(join(badReviewDecisionDir, "invalid.json"), "{\n", "utf8");

    expect(() =>
      exportRelease("v-broken", {
        rootDir: root,
        records: [],
        operationalAnchorReviewDecisionDir: badReviewDecisionDir,
        setLatest: true,
      }),
    ).toThrow();
    expect(readFileSync(latest, "utf8")).toBe("v-public\n");
    expect(existsSync(releaseDir(root, "v-broken"))).toBe(false);
    expect(readdirSync(releases).some((name) => name.startsWith(".v-broken.tmp-"))).toBe(false);
  });

  it("normalizes legacy manifests while keeping operational anchors unavailable", () => {
    const manifest = parseReleaseManifest({
      release_id: "v1-legacy",
      generator_commit: "abc123",
      record_counts: { event: 1 },
      files: { "events.jsonl": { bytes: 10, sha256: "a".repeat(64) } },
      pointers: { route_anchors: null, taxonomy: null, quality_report: null },
    });

    expect(manifest.manifest_version).toBe(1);
    expect(manifest.contract_versions).toEqual({});
    expect(manifest.pointers.operational_anchors).toBeNull();
    expect(manifest.pointers.operational_anchor_review_decisions).toBeNull();
    expect(manifest.pointers.operational_occurrences).toBeNull();
    expect(manifest.pointers.operational_occurrence_review_decisions).toBeNull();
  });

  it("parses a strict legacy manifest v2 without occurrence resources", () => {
    const manifest = parseReleaseManifest({
      manifest_version: 2,
      release_id: "v2-legacy",
      generator_commit: "abc123",
      contract_versions: { operational_anchors: 1, operational_anchor_review_decisions: 1 },
      record_counts: {},
      files: { "operational_anchor_review_decisions.json": { bytes: 10, sha256: "a".repeat(64) } },
      pointers: {
        operational_anchors: "operational_anchors.jsonl",
        operational_anchor_summary: "operational_anchors_summary.json",
        operational_anchor_review_decisions: "operational_anchor_review_decisions.json",
        route_anchors: null,
        taxonomy: null,
        quality_report: null,
      },
    });
    expect(manifest.manifest_version).toBe(2);
    expect(manifest.pointers.operational_occurrences).toBeNull();
    expect(manifest.contract_versions.operational_occurrences).toBeUndefined();
  });

  it("rejects malformed or unsupported release manifests", () => {
    expect(() =>
      parseReleaseManifest({
        manifest_version: 2,
        release_id: "v-bad",
        generator_commit: "abc123",
        contract_versions: { operational_anchors: 1, operational_anchor_review_decisions: 1 },
        record_counts: {},
        files: { "operational_anchors.jsonl": { bytes: 0, sha256: "not-a-digest" } },
        pointers: {
          operational_anchors: "operational_anchors.jsonl",
          operational_anchor_summary: "operational_anchors_summary.json",
          operational_anchor_review_decisions: "operational_anchor_review_decisions.json",
          route_anchors: null,
          taxonomy: null,
          quality_report: null,
        },
      }),
    ).toThrow("expected SHA-256 hex");

    const manifest = {
      manifest_version: 2,
      release_id: "v-addressed",
      generator_commit: "abc123",
      contract_versions: { operational_anchors: 1, operational_anchor_review_decisions: 1 },
      record_counts: {},
      files: { "operational_anchor_review_decisions.json": { bytes: 0, sha256: "a".repeat(64) } },
      pointers: {
        operational_anchors: null,
        operational_anchor_summary: null,
        operational_anchor_review_decisions: "missing-review-snapshot.json",
        route_anchors: null,
        taxonomy: null,
        quality_report: null,
      },
    };
    expect(() => parseReleaseManifest(manifest)).toThrow("no file metadata for missing-review-snapshot.json");

    const missingPointer = structuredClone(manifest);
    delete (missingPointer.pointers as Partial<typeof missingPointer.pointers>).operational_anchor_review_decisions;
    expect(() => parseReleaseManifest(missingPointer)).toThrow("pointers.operational_anchor_review_decisions");
    expect(() => parseReleaseManifest({ manifest_version: 6 })).toThrow("expected 1, 2, 3, 4, or 5");
  });

  it("requires all manifest-v3 occurrence pointers to be addressed", () => {
    const root = join(work, "v3-addressed");
    exportTestRelease("v3-addressed", { rootDir: root, records: [] });
    const manifest = readManifest(root, "v3-addressed");

    const missingPointer = structuredClone(manifest);
    delete (missingPointer.pointers as Partial<typeof missingPointer.pointers>).operational_occurrence_summary;
    expect(() => parseReleaseManifest(missingPointer)).toThrow("pointers.operational_occurrence_summary");

    const danglingPointer = structuredClone(manifest);
    danglingPointer.pointers.operational_occurrences = "missing-occurrences.jsonl";
    expect(() => parseReleaseManifest(danglingPointer)).toThrow("no file metadata for missing-occurrences.jsonl");

    const missingMetadata = structuredClone(manifest);
    delete missingMetadata.files["operational_occurrence_review_decisions.json"];
    expect(() => parseReleaseManifest(missingMetadata)).toThrow(
      "no file metadata for operational_occurrence_review_decisions.json",
    );

    const nullLegacyRows = structuredClone(manifest);
    nullLegacyRows.pointers.operational_anchors = null;
    expect(() => parseReleaseManifest(nullLegacyRows)).toThrow("pointers.operational_anchors");

    const nullLegacySummary = structuredClone(manifest);
    nullLegacySummary.pointers.operational_anchor_summary = null;
    expect(() => parseReleaseManifest(nullLegacySummary)).toThrow("pointers.operational_anchor_summary");

    const missingLegacyMetadata = structuredClone(manifest);
    delete missingLegacyMetadata.files["operational_anchors_summary.json"];
    expect(() => parseReleaseManifest(missingLegacyMetadata)).toThrow(
      "no file metadata for operational_anchors_summary.json",
    );
  });

  it("rejects unsafe manifest file keys and pointer paths", () => {
    const root = join(work, "unsafe-manifest-paths");
    exportTestRelease("safe", { rootDir: root, records: [] });
    const manifest = readManifest(root, "safe");

    for (const unsafe of ["../outside.json", "/absolute.json", "C:\\outside.json", "C:outside.json", "nested//empty.json", "./dot.json"]) {
      const badKey = structuredClone(manifest);
      badKey.files[unsafe] = { bytes: 0, sha256: "a".repeat(64) };
      expect(() => parseReleaseManifest(badKey)).toThrow("safe release-relative path");

      const badPointer = structuredClone(manifest);
      badPointer.pointers.operational_occurrences = unsafe;
      expect(() => parseReleaseManifest(badPointer)).toThrow("safe release-relative path");
    }
  });

  it("exports byte-identically for the same id and records", () => {
    const records = [record("route_b2", "route"), record("route_b1", "route"), record("event_a", "event")];
    const rootA = join(work, "det-a");
    const rootB = join(work, "det-b");
    exportTestRelease("same-id", { rootDir: rootA, records });
    exportTestRelease("same-id", { rootDir: rootB, records: [...records].reverse() });
    expect(fileTree(releaseDir(rootA, "same-id"))).toEqual(fileTree(releaseDir(rootB, "same-id")));
  });

  it("writes replay output under output-root without touching repository releases or LATEST", () => {
    const root = join(work, "output-root-source");
    const outputRoot = join(work, "output-root-destination");
    mkdirSync(join(root, "data", "exports", "releases"), { recursive: true });
    writeFileSync(join(root, "data", "exports", "releases", "LATEST"), "v1-rc5\n", "utf8");
    exportTestRelease("replay", { rootDir: root, outputRoot, records: [] });
    expect(existsSync(join(outputRoot, "replay", "manifest.json"))).toBe(true);
    expect(existsSync(releaseDir(root, "replay"))).toBe(false);
    expect(readFileSync(join(root, "data", "exports", "releases", "LATEST"), "utf8")).toBe("v1-rc5\n");
    expect(() => exportTestRelease("replay", { rootDir: root, outputRoot, records: [] })).toThrow("already exists");
    expect(() => exportTestRelease("promote", { rootDir: root, outputRoot, setLatest: true, records: [] })).toThrow("cannot update LATEST");
    expect(existsSync(join(outputRoot, "promote"))).toBe(false);
  });

  it("keeps releases immutable and rejects force replacement", () => {
    const root = join(work, "immutable");
    exportTestRelease("once", { rootDir: root, records: [record("route_b1", "route")] });
    const before = fileTree(releaseDir(root, "once"));
    expect(() => exportTestRelease("once", { rootDir: root, records: [record("route_b2", "route")] })).toThrow("already exists");
    expect(() => exportTestRelease("once", { rootDir: root, force: true, records: [record("route_b2", "route")] })).toThrow("Force replacement");
    expect(fileTree(releaseDir(root, "once"))).toEqual(before);
  });

  it("rejects unsafe release ids before any join, removal, or write", () => {
    const root = join(work, "unsafe-release-id");
    const releases = join(root, "data", "exports", "releases");
    const victim = join(root, "data", "exports", "victim");
    mkdirSync(victim, { recursive: true });
    writeFileSync(join(victim, "marker"), "preserve\n", "utf8");

    for (const releaseId of ["", ".", "..", "../victim", "nested/release", "nested\\release", "/tmp/release", " release "]) {
      expect(() => exportTestRelease(releaseId, { rootDir: root, force: true, records: [] })).toThrow(
        "safe single path segment",
      );
    }
    expect(readFileSync(join(victim, "marker"), "utf8")).toBe("preserve\n");
    expect(existsSync(releases)).toBe(false);
  });

  it("rejects force before touching a prior cut", () => {
    const root = join(work, "atomic-force-failure");
    exportTestRelease("stable", { rootDir: root, records: [record("route_b1", "route")] });
    const before = fileTree(releaseDir(root, "stable"));
    expect(() => exportTestRelease("stable", { rootDir: root, force: true, records: [record("route_b2", "route")] })).toThrow("Force replacement");
    expect(fileTree(releaseDir(root, "stable"))).toEqual(before);
    expect(readdirSync(join(root, "data", "exports", "releases")).some((name) => name.startsWith(".stable.tmp-") || name.includes(".previous-"))).toBe(false);
  });

  it("can fill the quality report manifest pointer", () => {
    const root = join(work, "quality-pointer");
    exportTestRelease("with-quality", {
      rootDir: root,
      records: [record("route_b1", "route")],
      qualityReport: "data/quality/with-quality/report.md",
    });

    const manifest = readManifest(root, "with-quality");
    expect(manifest.pointers.quality_report).toBe("data/quality/with-quality/report.md");
  });

  it("throws on unknown record kinds before writing a manifest", () => {
    const root = join(work, "unknown-kind");
    const bad = record("mystery_a", "route");
    bad.record_kind = "mystery" as MtaCanonicalRecord["record_kind"];
    expect(() => exportTestRelease("bad", { rootDir: root, records: [bad] })).toThrow(/No canonical release filename/u);
    expect(existsSync(join(releaseDir(root, "bad"), "manifest.json"))).toBe(false);
  });

  it("fails before creating release output when the review decision directory is missing", () => {
    const root = join(work, "missing-review-decisions");
    expect(() => exportRelease("missing-review", { rootDir: root, records: [record("route_b1", "route")] })).toThrow(
      "Operational-anchor review decision directory is required for release export",
    );
    expect(existsSync(releaseDir(root, "missing-review"))).toBe(false);
  });
});
