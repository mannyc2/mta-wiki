import { afterAll, describe, expect, it } from "bun:test";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  buildRelationshipEnforcementOutputs,
  assertRelationshipEnforcementRefreshPins,
  assertReleaseRecordIdsUniqueAndSorted,
  compareReleaseRecordIds,
  deriveDeterminismConsumerSummary,
  materializationInventoryText,
  repositoryStateEvidenceText,
  RELATIONSHIP_ENFORCEMENT_GATE_SOURCES,
  snapshotCommandContractText,
  snapshotCommandSpecifications,
  trackerStateEvidenceText,
} from "../../../scripts/generate-relationship-enforcement-proof-v1.ts";
import {
  CANONICAL_DB_VERSION,
} from "../src/canonical-db.js";
import { SCHEMA_DDL } from "../src/schema-ddl.js";
import {
  RELATIONSHIP_COMPLETENESS_REQUIRED_WARNING_CODES,
} from "../src/relationship-completeness-contract.js";
import {
  assertRelationshipEnforcementProof,
  loadRelationshipContract,
  RELATIONSHIP_CONTRACT_POLICY_V1,
  RELATIONSHIP_ENFORCEMENT_GATE_IDS,
  RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES,
  relationshipEnforcementTransitionFingerprint,
  type RelationshipContract,
  type RelationshipEnforcementTransitionReceipt,
  type RelationshipFinalEndpointMatrix,
} from "../src/relationship-contract.js";
import { sha256, stableHash, stableJson } from "../src/stable-json.js";
import type { JsonValue } from "../src/types.js";
import { FILE_BY_KIND } from "../../pipeline/src/materialize/canonical-read.ts";

const work = mkdtempSync(
  join(tmpdir(), "relationship-enforcement-generator-"),
);
afterAll(() => rmSync(work, { recursive: true, force: true }));

const digest = "a".repeat(64);
const rc20Manifest = readFileSync(
  join(repoRoot, "data/exports/releases/v1-rc20/manifest.json"),
);

function byteSha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function runGit(root: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${String(result.stderr).trim()}`,
    );
  }
  return result.stdout.trim();
}

function writeSealedFixtureDatabase(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    for (const statement of SCHEMA_DDL) db.exec(statement);
    db.exec(`PRAGMA user_version = ${CANONICAL_DB_VERSION};`);
    db.run(
      "INSERT INTO canonical_db_state (state_key, sealed) VALUES ('canonical', 0)",
    );
    db.run(
      "UPDATE canonical_db_state SET sealed = 1 WHERE state_key = 'canonical'",
    );
  } finally {
    db.close();
  }
}

function commitFixtureRepo(root: string): string {
  runGit(root, ["init", "--quiet"]);
  runGit(root, ["config", "user.email", "fixture@example.test"]);
  runGit(root, ["config", "user.name", "Fixture"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "--quiet", "-m", "fixture"]);
  return runGit(root, ["rev-parse", "HEAD"]);
}

function makeCurrentRepoFixture(
  name = "current-repo",
  databaseKind: "sealed" | "text" = "sealed",
): { root: string; head: string } {
  const root = join(work, name);
  for (const path of [
    "data/canonical/.gitkeep",
    "data/materialized/.gitkeep",
    "wiki/.gitkeep",
  ]) {
    write(join(root, path), "");
  }
  write(
    join(
      root,
      "scripts/generate-relationship-enforcement-proof-v1.ts",
    ),
    readFileSync(
      join(
        repoRoot,
        "scripts/generate-relationship-enforcement-proof-v1.ts",
      ),
    ),
  );
  if (databaseKind === "sealed") {
    writeSealedFixtureDatabase(join(root, "data/canonical.db"));
  } else {
    write(join(root, "data/canonical.db"), "not a sqlite database\n");
  }
  return { root, head: commitFixtureRepo(root) };
}

function makeTrackerRepoFixture(
  name = "tracker-repo",
  untrackedFile?: { path: string; content: string },
): string {
  const root = join(work, name);
  write(
    join(
      root,
      "tools/pipeline-v2/src/lib/mta-wiki-operational-occurrences.ts",
    ),
    [
      "const MANIFEST_VERSION = 3;",
      "const OPERATIONAL_ANCHOR_CONTRACT_VERSION = 1;",
      "const OPERATIONAL_ANCHOR_REVIEW_CONTRACT_VERSION = 1;",
      "const OPERATIONAL_OCCURRENCE_CONTRACT_VERSION = 1;",
      "const OPERATIONAL_OCCURRENCE_REVIEW_CONTRACT_VERSION = 1;",
      "",
    ].join("\n"),
  );
  commitFixtureRepo(root);
  if (untrackedFile) {
    write(join(root, untrackedFile.path), untrackedFile.content);
  }
  return root;
}

const currentRepoFixture = makeCurrentRepoFixture();
const trackerRepoFixture = makeTrackerRepoFixture();
const determinismValidationOptions = {
  currentRepoRoot: currentRepoFixture.root,
  trackerRoot: trackerRepoFixture,
};

it("validates canonical release ids in exporter localeCompare order", () => {
  const exporterOrdered = [
    "treatment_2017-bus-boarding-islands_2",
    "treatment_2017-bus-boarding-islands-12-stops",
  ];
  expect(
    exporterOrdered[0]!.localeCompare(exporterOrdered[1]!),
  ).toBeLessThan(0);
  expect([...exporterOrdered].sort()).not.toEqual(exporterOrdered);
  expect([...exporterOrdered].sort(compareReleaseRecordIds)).toEqual(
    exporterOrdered,
  );
  expect(() =>
    assertReleaseRecordIdsUniqueAndSorted(
      exporterOrdered,
      "fixture/treatment_components.jsonl",
    )
  ).not.toThrow();
  expect(() =>
    assertReleaseRecordIdsUniqueAndSorted(
      [...exporterOrdered].reverse(),
      "fixture/treatment_components.jsonl",
    )
  ).toThrow("record ids must be unique and sorted");
  expect(() =>
    assertReleaseRecordIdsUniqueAndSorted(
      [exporterOrdered[0]!, exporterOrdered[0]!],
      "fixture/treatment_components.jsonl",
    )
  ).toThrow("record ids must be unique and sorted");
});

function fixtureMatrix(): RelationshipFinalEndpointMatrix {
  return {
    schema_version: 1,
    matrix_id: "relationship-contract-v1-post-remediation-final",
    contract_id: "relationship-contract-v1",
    review_status: "reviewed_post_remediation",
    obsolete_baseline_tuple_policy: "reject",
    generated_from: {
      projected_relations_path: "fixture/projected-relations.jsonl",
      projected_relations_sha256: digest,
      projected_relations_logical_sha256: digest,
      projected_tuples_path: "fixture/projected-tuples.json",
      projected_tuples_sha256: digest,
      projected_tuples_logical_sha256: digest,
      semantic_remediation_summary_path: "fixture/summary.json",
      semantic_remediation_summary_sha256: digest,
      campaign_id: "relationship-semantic-remediation-v1",
      skipped_correction_count: 0,
      unmapped_relation_count: 0,
    },
    relation_kind_rule_count: 1,
    covered_relation_count: 1,
    allowed_family_shape_count: 1,
    relation_ids_sha256: digest,
    tuple_set_sha256: digest,
    rules: [{
      relation_kind: "serves_route",
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
        relation_count: 1,
        relation_ids_sha256: digest,
      }],
      review_basis: "reviewed_post_remediation",
    }],
  };
}

function fixtureContract(
  matrix: RelationshipFinalEndpointMatrix,
): RelationshipContract {
  return {
    ...loadRelationshipContract().contract,
    contract_status: "warning_first",
    reviewed_at: "2026-07-16T07:00:00.000Z",
    reviewed_by: "fixture-enforcement-reviewer",
    endpoint_matrix: {
      path: "fixture/final-matrix.json",
      sha256: stableHash(matrix as unknown as JsonValue),
      matrix_kind: "post_remediation_reviewed",
      relation_count: matrix.covered_relation_count,
      tuple_count: matrix.allowed_family_shape_count,
      relation_ids_sha256: matrix.relation_ids_sha256,
      tuple_set_sha256: matrix.tuple_set_sha256,
      obsolete_baseline_tuple_policy: "reject",
      unlisted_relation_policy: "error",
      new_shape_policy: "error",
    },
    enforcement_proof: undefined,
  };
}

const migration = {
  bus_lane_treatment_completeness_ready: true,
  eligible_occurrence_core_roles_ready: true,
  hard_mode_ready: true,
  operational_event_completeness_ready: true,
  phase_contract_ready: true,
  physical_scope_contract_ready: true,
  route_identity_completeness_ready: true,
  treatment_physicality_contract_ready: true,
  treatment_physicality_final_release_guard_ready: true,
};

function sourceValues(
  matrix: RelationshipFinalEndpointMatrix,
): Record<string, Record<string, Record<string, unknown>>> {
  const graphCodes = Object.keys(
    RELATIONSHIP_CONTRACT_POLICY_V1.finding_codes,
  )
    .filter((code) => !code.startsWith("REL_REQUIRED_"))
    .sort();
  const warningCounts = Object.fromEntries(
    RELATIONSHIP_COMPLETENESS_REQUIRED_WARNING_CODES.map((code) => [
      code,
      0,
    ]),
  );
  return {
    bus_lane_acquisition_linkage: {
      acquisition_summary: {
        schema_version: 1,
        campaign_id: "registry-only-bus-lane-acquisition-v1",
        candidate_set_id: "candidate-set-v2:24080902f508b55a0033df32",
        candidate_set_sha256:
          "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba",
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
        campaign_id:
          "bus-lane-supported-linkage-materialization-v1",
        supported_candidate_count: 54,
        materialized_candidate_count: 54,
        unmaterialized_candidate_count: 0,
        materialized_relation_count: 54,
        endpoint_violation_count: 0,
        type_violation_count: 0,
        evidence_violation_count: 0,
        record_hash_violation_count: 0,
        materialization_status_violation_count: 0,
        reconciliation_identity_violation_count: 0,
        canonical_projection_violation_count: 0,
        violation_count: 0,
        record_hash_contract:
          "sha256_raw_canonical_jsonl_line_without_newline",
        canonical_relations_path: "fixture/relations.jsonl",
        canonical_relations_sha256: digest,
        reconciliation_path: "fixture/reconciliation.jsonl",
        reconciliation_sha256: digest,
        materialized_relation_ids_sha256: digest,
      },
      linkage_reconciliation_summary: {
        schema_version: 2,
        campaign_id:
          "bus-lane-supported-linkage-reconciliation-v1",
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
        proof_id:
          "relationship-integrity-determinism-consumer-proof-v1",
        contract_id: "relationship-contract-v1",
        git_head: "b".repeat(40),
        release_id: "v1-rc21",
        input_snapshots: [
          {
            snapshot_id: "fixture-a",
            captured_at: "2026-07-16T08:00:00.000Z",
            manifest_sha256: digest,
          },
          {
            snapshot_id: "fixture-b",
            captured_at: "2026-07-16T09:00:00.000Z",
            manifest_sha256: digest,
          },
        ],
        latest_before: "v1-rc5",
        latest_after: "v1-rc5",
        rc20_manifest_sha256_before:
          "a2e9147fbb3db3b27a48df27f9550a8b31ab28bc85e30b7166d75b46b54e1a08",
        rc20_manifest_sha256_after:
          "a2e9147fbb3db3b27a48df27f9550a8b31ab28bc85e30b7166d75b46b54e1a08",
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
          output_sha256: digest,
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
      graph_audit_findings: {},
      graph_audit_manifest: {},
      graph_audit_summary: {
        canonical_relation_count: matrix.covered_relation_count,
        contract_covered_relation_count:
          matrix.covered_relation_count,
        finding_count: 0,
        findings_by_code: Object.fromEntries(
          graphCodes.map((code) => [code, 0]),
        ),
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
        enforcement_mode: "warning",
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
        enforcement_migration: migration,
        warning_definitions:
          RELATIONSHIP_COMPLETENESS_REQUIRED_WARNING_CODES.map(
            (code) => ({ code }),
          ),
        warning_instances_by_code: warningCounts,
        occurrences: {
          eligible_event_ids_outside_operational_denominator: 0,
        },
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
          exact_evidence_bound_count: 669,
          physical_scope_satisfied_count: 163,
          reviewed_non_projectable_count: 506,
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

function fixtureSourceTexts(
  matrix: RelationshipFinalEndpointMatrix,
): Map<string, string> {
  const values = sourceValues(matrix);
  const result = new Map<string, string>();
  const graphSources = Object.fromEntries(
    RELATIONSHIP_ENFORCEMENT_GATE_SOURCES
      .referential_type_evidence_integrity.map((source) => [
        source.role,
        source.path,
      ]),
  );
  for (const gateId of RELATIONSHIP_ENFORCEMENT_GATE_IDS) {
    for (const source of RELATIONSHIP_ENFORCEMENT_GATE_SOURCES[
      gateId
    ]) {
      if (
        source.role === "graph_audit_findings" ||
        source.role === "graph_audit_manifest" ||
        source.role === "sql_integrity_summary"
      ) {
        continue;
      }
      result.set(
        source.path,
        `${stableJson(values[gateId]![source.role]! as unknown as JsonValue)}\n`,
      );
    }
  }
  const graphFindingsText = "";
  const graphSummaryText = result.get(graphSources.graph_audit_summary!)!;
  const graphManifestInputs = {
    contract_sha256: digest,
    endpoint_matrix_sha256: stableHash(
      matrix as unknown as JsonValue,
    ),
    canonical_relations_sha256: digest,
  };
  const graphManifestText = `${stableJson({
    schema_version: 1,
    contract_id: "relationship-contract-v1",
    ...graphManifestInputs,
    input_fingerprint: sha256(
      stableJson(graphManifestInputs as unknown as JsonValue),
    ),
    mode: "warn",
    artifacts: [
      {
        path: "findings.jsonl",
        sha256: sha256(graphFindingsText),
        rows: 0,
      },
      {
        path: "summary.json",
        sha256: sha256(graphSummaryText),
      },
    ],
    reproduction_commands: [],
  } as unknown as JsonValue)}\n`;
  result.set(graphSources.graph_audit_findings!, graphFindingsText);
  result.set(graphSources.graph_audit_manifest!, graphManifestText);
  const sql = values.referential_type_evidence_integrity!
    .sql_integrity_summary!;
  Object.assign(sql, {
    graph_findings_path: graphSources.graph_audit_findings,
    graph_findings_sha256: sha256(graphFindingsText),
    graph_manifest_path: graphSources.graph_audit_manifest,
    graph_manifest_sha256: sha256(graphManifestText),
    graph_summary_path: graphSources.graph_audit_summary,
    graph_summary_sha256: sha256(graphSummaryText),
  });
  result.set(
    graphSources.sql_integrity_summary!,
    `${stableJson(sql as unknown as JsonValue)}\n`,
  );
  return result;
}

function write(path: string, content: Buffer | string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function writeReleaseFixture(
  snapshotRoot: string,
  generatorCommit: string,
): string {
  const releaseRoot = join(
    snapshotRoot,
    "release-root/data/exports/releases/v1-rc21",
  );
  mkdirSync(releaseRoot, { recursive: true });
  const jsonlFiles = [
    ...FILE_BY_KIND.values(),
    "operational_anchors.jsonl",
    "operational_occurrences.jsonl",
    "route_anchors.jsonl",
  ];
  const jsonFiles = [
    "operational_anchors_summary.json",
    "operational_anchor_review_decisions.json",
    "operational_occurrences_summary.json",
    "operational_occurrence_review_decisions.json",
    "taxonomy.json",
  ];
  for (const name of jsonlFiles) write(join(releaseRoot, name), "");
  for (const name of jsonFiles) write(join(releaseRoot, name), "{}\n");
  const files = Object.fromEntries(
    [...jsonlFiles, ...jsonFiles].sort().map((name) => {
      const bytes = readFileSync(join(releaseRoot, name));
      return [
        name,
        { bytes: bytes.length, sha256: byteSha256(bytes) },
      ];
    }),
  );
  const manifest = {
    manifest_version: 3,
    release_id: "v1-rc21",
    generator_commit: generatorCommit,
    contract_versions: {
      operational_anchors: 1,
      operational_anchor_review_decisions: 1,
      operational_occurrences: 2,
      operational_occurrence_review_decisions: 1,
    },
    record_counts: Object.fromEntries(
      [...FILE_BY_KIND.keys()].sort().map((kind) => [kind, 0]),
    ),
    files,
    pointers: {
      operational_anchors: "operational_anchors.jsonl",
      operational_anchor_summary:
        "operational_anchors_summary.json",
      operational_anchor_review_decisions:
        "operational_anchor_review_decisions.json",
      operational_occurrences: "operational_occurrences.jsonl",
      operational_occurrence_summary:
        "operational_occurrences_summary.json",
      operational_occurrence_review_decisions:
        "operational_occurrence_review_decisions.json",
      route_anchors: "route_anchors.jsonl",
      taxonomy: "taxonomy.json",
      quality_report: null,
    },
  };
  const relativePath =
    "release-root/data/exports/releases/v1-rc21/manifest.json";
  write(
    join(snapshotRoot, relativePath),
    `${stableJson(manifest as unknown as JsonValue)}\n`,
  );
  return relativePath;
}

function makeSnapshot(
  name: string,
  capturedAt: string,
  options: {
    repo?: { root: string; head: string };
    trackerRoot?: string;
  } = {},
): string {
  const currentRepo = options.repo ?? currentRepoFixture;
  const trackerRoot = options.trackerRoot ?? trackerRepoFixture;
  const root = join(work, name);
  mkdirSync(root, { recursive: true });
  const repositoryState = repositoryStateEvidenceText(
    currentRepo.root,
    "v1-rc21",
  );
  const trackerState = trackerStateEvidenceText(
    trackerRoot,
  );
  const files: Record<string, Buffer | string> = {
    "immutability/LATEST.before": "v1-rc5\n",
    "immutability/LATEST.after": "v1-rc5\n",
    "immutability/rc20.before.json": rc20Manifest,
    "immutability/rc20.after.json": rc20Manifest,
    "immutability/tracker.before.json": trackerState,
    "immutability/tracker.after.json": trackerState,
    "provenance/repository.before.json": repositoryState,
    "provenance/repository.after.json": repositoryState,
    "provenance/generator.ts": readFileSync(
      join(currentRepo.root, "scripts/generate-relationship-enforcement-proof-v1.ts"),
    ),
    "provenance/command-spec.json": snapshotCommandContractText(
      "v1-rc21",
    ),
    "materialization.json": materializationInventoryText(
      currentRepo.root,
    ),
    "warning.json": "[]\n",
    "enforcement.json": "[]\n",
  };
  for (const [path, content] of Object.entries(files)) {
    write(join(root, path), content);
  }
  copyFileSync(
    join(currentRepo.root, "data/canonical.db"),
    join(root, "canonical.db"),
  );
  const releaseManifestPath = writeReleaseFixture(
    root,
    currentRepo.head,
  );
  const pin = (path: string) => {
    const bytes = readFileSync(join(root, path));
    return { path, bytes: bytes.length, sha256: byteSha256(bytes) };
  };
  const artifacts = {
    command_spec: pin("provenance/command-spec.json"),
    enforcement_finding_identities: pin("enforcement.json"),
    generator_source: pin("provenance/generator.ts"),
    latest_after: pin("immutability/LATEST.after"),
    latest_before: pin("immutability/LATEST.before"),
    materialization: pin("materialization.json"),
    rc20_manifest_after: pin("immutability/rc20.after.json"),
    rc20_manifest_before: pin("immutability/rc20.before.json"),
    release: pin(releaseManifestPath),
    repository_state_after: pin("provenance/repository.after.json"),
    repository_state_before: pin("provenance/repository.before.json"),
    sqlite: pin("canonical.db"),
    tracker_state_after: pin("immutability/tracker.after.json"),
    tracker_state_before: pin("immutability/tracker.before.json"),
    warning_finding_identities: pin("warning.json"),
  };
  const command_results = snapshotCommandSpecifications(root, "v1-rc21")
    .map(({ commandId: command_id, executable, args }) => {
      const path = `commands/${command_id}.log`;
      write(join(root, path), `${name}:${command_id}\n`);
      const argv = [executable, ...args];
      return {
        command_id,
        command: argv.join(" "),
        argv,
        exit_code: 0,
        output: pin(path),
      };
    });
  write(
    join(root, "manifest.json"),
    `${stableJson({
      schema_version: 1,
      snapshot_id: `snapshot:${name}`,
      captured_at: capturedAt,
      git_head: currentRepo.head,
      release_id: "v1-rc21",
      tracker_mutation_count: 0,
      artifacts,
      command_results,
    } as unknown as JsonValue)}\n`,
  );
  return root;
}

function installInternallyPinnedRelationMismatch(
  snapshotRoot: string,
): void {
  const releaseManifestPath = join(
    snapshotRoot,
    "release-root/data/exports/releases/v1-rc21/manifest.json",
  );
  const releaseDir = dirname(releaseManifestPath);
  const relationText = `${stableJson({
    record_id: "relation_fabricated",
    record_kind: "relation",
  } as unknown as JsonValue)}\n`;
  write(join(releaseDir, "relations.jsonl"), relationText);
  const releaseManifest = JSON.parse(
    readFileSync(releaseManifestPath, "utf8"),
  ) as {
    record_counts: Record<string, number>;
    files: Record<string, { bytes: number; sha256: string }>;
  };
  releaseManifest.record_counts.relation = 1;
  releaseManifest.files["relations.jsonl"] = {
    bytes: Buffer.byteLength(relationText),
    sha256: byteSha256(relationText),
  };
  const releaseManifestText = `${stableJson(
    releaseManifest as unknown as JsonValue,
  )}\n`;
  write(releaseManifestPath, releaseManifestText);

  const snapshotManifestPath = join(snapshotRoot, "manifest.json");
  const snapshotManifest = JSON.parse(
    readFileSync(snapshotManifestPath, "utf8"),
  ) as {
    artifacts: Record<
      string,
      { path: string; bytes: number; sha256: string }
    >;
  };
  snapshotManifest.artifacts.release = {
    ...snapshotManifest.artifacts.release!,
    bytes: Buffer.byteLength(releaseManifestText),
    sha256: byteSha256(releaseManifestText),
  };
  write(
    snapshotManifestPath,
    `${stableJson(snapshotManifest as unknown as JsonValue)}\n`,
  );
}

describe("relationship enforcement proof generator", () => {
  it("inventories current materialization roots when the retired data/materialized directory is absent", () => {
    const root = join(work, "materialization-with-retired-root-absent");
    write(join(root, "data/canonical/routes.jsonl"), "{}\n");
    write(join(root, "wiki/index.md"), "# Fixture\n");

    const inventory = JSON.parse(materializationInventoryText(root)) as {
      roots: string[];
      retired_roots: Array<{ path: string; status: string; replacement: string }>;
      file_count: number;
      files: Array<{ path: string }>;
    };
    expect(inventory.roots).toEqual(["data/canonical", "wiki"]);
    expect(inventory.retired_roots).toEqual([{
      path: "data/materialized",
      status: "retired",
      replacement: "data/canonical.db plus direct generated-wiki root scan",
    }]);
    expect(inventory.file_count).toBe(2);
    expect(inventory.files.map((file) => file.path)).toEqual([
      "data/canonical/routes.jsonl",
      "wiki/index.md",
    ]);
  });

  it("deterministically derives all seven parsed gates and refuses a count-attested backlog", () => {
    const matrix = fixtureMatrix();
    const contract = fixtureContract(matrix);
    const sourceTexts = fixtureSourceTexts(matrix);
    const first = buildRelationshipEnforcementOutputs({
      contract,
      matrix,
      sourceTexts,
    });
    const second = buildRelationshipEnforcementOutputs({
      contract,
      matrix,
      sourceTexts,
    });
    expect(first.proof.gate_count).toBe(7);
    expect(first.contents.size).toBe(8);
    expect([...first.contents]).toEqual([...second.contents]);
    expect(first.proofArtifactPaths.length).toBe(20);

    const stale = new Map(sourceTexts);
    const materialization =
      RELATIONSHIP_ENFORCEMENT_GATE_SOURCES
        .bus_lane_acquisition_linkage.find(
          (source) =>
            source.role === "linkage_materialization_summary",
        )!;
    const parsed = JSON.parse(stale.get(materialization.path)!) as {
      materialized_relation_count: number;
    };
    parsed.materialized_relation_count = 53;
    stale.set(
      materialization.path,
      `${stableJson(parsed as unknown as JsonValue)}\n`,
    );
    expect(() =>
      buildRelationshipEnforcementOutputs({
        contract,
        matrix,
        sourceTexts: stale,
      })
    ).toThrow("not exact, complete, and zero-violation");

    const fabricatedCompatibility = new Map(sourceTexts);
    const determinismSource =
      RELATIONSHIP_ENFORCEMENT_GATE_SOURCES
        .determinism_and_consumer_proof[0]!;
    const determinismSummary = JSON.parse(
      fabricatedCompatibility.get(determinismSource.path)!,
    ) as Record<string, unknown>;
    determinismSummary.tracker_unsupported_version_pairs = [];
    fabricatedCompatibility.set(
      determinismSource.path,
      `${stableJson(determinismSummary as unknown as JsonValue)}\n`,
    );
    expect(() =>
      buildRelationshipEnforcementOutputs({
        contract,
        matrix,
        sourceTexts: fabricatedCompatibility,
      })
    ).toThrow("reviewed schema-v2 incompatibility");

    const shrunkCompleteness = new Map(sourceTexts);
    const completenessSource =
      RELATIONSHIP_ENFORCEMENT_GATE_SOURCES
        .relationship_completeness[0]!;
    const completenessSummary = JSON.parse(
      shrunkCompleteness.get(completenessSource.path)!,
    ) as {
      bus_lane_treatments: {
        denominator_count: number;
        audited_treatment_count: number;
        materialized_treatment_count: number;
        exact_evidence_bound_count: number;
        physical_scope_satisfied_count: number;
        reviewed_non_projectable_count: number;
        counts_by_primary_disposition: {
          reviewed_non_projectable_physical_scope_unproven: number;
        };
      };
    };
    const treatments = completenessSummary.bus_lane_treatments;
    treatments.denominator_count = 668;
    treatments.audited_treatment_count = 668;
    treatments.materialized_treatment_count = 668;
    treatments.exact_evidence_bound_count = 668;
    treatments.reviewed_non_projectable_count = 505;
    treatments.counts_by_primary_disposition
      .reviewed_non_projectable_physical_scope_unproven = 336;
    shrunkCompleteness.set(
      completenessSource.path,
      `${stableJson(
        completenessSummary as unknown as JsonValue,
      )}\n`,
    );
    expect(() =>
      buildRelationshipEnforcementOutputs({
        contract,
        matrix,
        sourceTexts: shrunkCompleteness,
      })
    ).toThrow(
      "source backlog is not zero: relationship_completeness",
    );
  });

  it("rejects a content-addressed gate that substitutes a noncanonical source path", () => {
    const matrix = fixtureMatrix();
    const contract = fixtureContract(matrix);
    const sourceTexts = fixtureSourceTexts(matrix);
    const built = buildRelationshipEnforcementOutputs({
      contract,
      matrix,
      sourceTexts,
    });
    const proof = structuredClone(built.proof);
    const gate = proof.gates.find(
      (entry) =>
        entry.gate_id === "referential_type_evidence_integrity",
    )!;
    const gateText = built.contents.get(gate.artifact_path)!;
    const artifact = JSON.parse(gateText) as {
      source_artifacts: Array<{
        role: string;
        path: string;
        sha256: string;
      }>;
    };
    artifact.source_artifacts.find(
      (source) => source.role === "graph_audit_summary",
    )!.path =
      "data/quality/relationship-integrity/graph-audit/self-attested-summary.json";
    const substitutedGateText = `${stableJson(
      artifact as unknown as JsonValue,
    )}\n`;
    gate.artifact_sha256 = sha256(substitutedGateText);

    expect(() =>
      assertRelationshipEnforcementProof(
        proof,
        matrix,
        contract.endpoint_matrix,
        RELATIONSHIP_ENFORCEMENT_GATE_IDS,
        (path) => {
          if (path === gate.artifact_path) return substitutedGateText;
          const generated = built.contents.get(path);
          if (generated !== undefined) return generated;
          const source = sourceTexts.get(path);
          if (source !== undefined) return source;
          throw new Error(`missing fixture artifact ${path}`);
        },
      )
    ).toThrow("source set is invalid");
  });

  it("permits only the graph/SQL/DB mode refresh while corpus, release, matrix, and determinism stay pinned", () => {
    const matrix = fixtureMatrix();
    const sourceTexts = fixtureSourceTexts(matrix);
    const refreshRoles = new Set<string>(
      RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES,
    );
    const prePromotionSources = Object.values(
      RELATIONSHIP_ENFORCEMENT_GATE_SOURCES,
    )
      .flat()
      .map((source) => {
        const text = sourceTexts.get(source.path)!;
        return {
          role: source.role,
          path: source.path,
          sha256: sha256(text),
          archive_path: `fixture/archive/${source.role}.json`,
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
    const invariantArtifacts = [
      { role: "canonical_relations", path: "fixture/relations.jsonl", sha256: digest },
      { role: "determinism_consumer_summary", path: "fixture/determinism.json", sha256: digest },
      { role: "final_endpoint_matrix", path: "fixture/matrix.json", sha256: digest },
      { role: "reviewed_release_manifest", path: "fixture/release.json", sha256: digest },
    ];
    const receipt = {
      invariant_artifacts: invariantArtifacts,
      pre_promotion_sources: prePromotionSources,
      refresh_artifacts: [
        { role: "canonical_db", path: "fixture/canonical.db", sha256: digest },
        ...prePromotionSources.filter((source) =>
          refreshRoles.has(source.role)
        ),
      ].sort((left, right) => left.role.localeCompare(right.role)),
    } as RelationshipEnforcementTransitionReceipt;
    const invariantSha256ByRole = new Map(
      invariantArtifacts.map((pin) => [pin.role, pin.sha256]),
    );
    const refreshed = new Map(sourceTexts);
    const graphManifestSource =
      RELATIONSHIP_ENFORCEMENT_GATE_SOURCES
        .referential_type_evidence_integrity.find(
          (source) => source.role === "graph_audit_manifest",
        )!;
    const graphManifest = JSON.parse(
      refreshed.get(graphManifestSource.path)!,
    ) as Record<string, unknown>;
    graphManifest.mode = "enforce";
    refreshed.set(
      graphManifestSource.path,
      `${stableJson(graphManifest as unknown as JsonValue)}\n`,
    );
    const sqlSource =
      RELATIONSHIP_ENFORCEMENT_GATE_SOURCES
        .referential_type_evidence_integrity.find(
          (source) => source.role === "sql_integrity_summary",
        )!;
    const sql = JSON.parse(
      refreshed.get(sqlSource.path)!,
    ) as Record<string, unknown>;
    sql.enforcement_mode = "enforce";
    refreshed.set(
      sqlSource.path,
      `${stableJson(sql as unknown as JsonValue)}\n`,
    );
    expect(() =>
      assertRelationshipEnforcementRefreshPins({
        receipt,
        sourceTexts: refreshed,
        invariantSha256ByRole,
        canonicalDbSha256: "b".repeat(64),
      })
    ).not.toThrow();

    const immutableDrift = new Map(refreshed);
    const determinism =
      RELATIONSHIP_ENFORCEMENT_GATE_SOURCES
        .determinism_and_consumer_proof[0]!;
    immutableDrift.set(
      determinism.path,
      `${immutableDrift.get(determinism.path)!} `,
    );
    expect(() =>
      assertRelationshipEnforcementRefreshPins({
        receipt,
        sourceTexts: immutableDrift,
        invariantSha256ByRole,
        canonicalDbSha256: "b".repeat(64),
      })
    ).toThrow("changed forbidden source artifact");

    const graphDrift = new Map(refreshed);
    const graphSummarySource =
      RELATIONSHIP_ENFORCEMENT_GATE_SOURCES
        .referential_type_evidence_integrity.find(
          (source) => source.role === "graph_audit_summary",
        )!;
    const graphSummary = JSON.parse(
      graphDrift.get(graphSummarySource.path)!,
    ) as Record<string, unknown>;
    graphSummary.contract_covered_relation_count = 2;
    graphDrift.set(
      graphSummarySource.path,
      `${stableJson(graphSummary as unknown as JsonValue)}\n`,
    );
    expect(() =>
      assertRelationshipEnforcementRefreshPins({
        receipt,
        sourceTexts: graphDrift,
        invariantSha256ByRole,
        canonicalDbSha256: "b".repeat(64),
      })
    ).toThrow("changed non-mode source content");

    const driftedInvariants = new Map(invariantSha256ByRole);
    driftedInvariants.set("reviewed_release_manifest", "c".repeat(64));
    expect(() =>
      assertRelationshipEnforcementRefreshPins({
        receipt,
        sourceTexts: refreshed,
        invariantSha256ByRole: driftedInvariants,
        canonicalDbSha256: "b".repeat(64),
      })
    ).toThrow("immutable corpus/release/matrix/determinism");
    expect(() =>
      assertRelationshipEnforcementRefreshPins({
        receipt,
        sourceTexts: refreshed,
        invariantSha256ByRole,
        canonicalDbSha256: digest,
      })
    ).toThrow("did not rebuild the canonical DB");
  });

  it("rejects an enforcement-eligible graph row even when every summary and hash pin self-attests readiness", () => {
    const matrix = fixtureMatrix();
    const contract = fixtureContract(matrix);
    const sourceTexts = fixtureSourceTexts(matrix);
    const graphSources = Object.fromEntries(
      RELATIONSHIP_ENFORCEMENT_GATE_SOURCES
        .referential_type_evidence_integrity.map((source) => [
          source.role,
          source.path,
        ]),
    );
    const findingsText = `${stableJson({
      schema_version: 1,
      contract_id: "relationship-contract-v1",
      finding_id: "relationship-finding:fixture-dangling",
      code: "REL_ENDPOINT_DANGLING",
      severity: "error",
      record_id: "relation_fixture",
    } as unknown as JsonValue)}\n`;
    sourceTexts.set(graphSources.graph_audit_findings!, findingsText);

    const summary = JSON.parse(
      sourceTexts.get(graphSources.graph_audit_summary!)!,
    ) as {
      finding_count: number;
      findings_by_code: Record<string, number>;
      findings_by_severity: Record<string, number>;
    };
    summary.finding_count = 1;
    summary.findings_by_code.REL_ENDPOINT_DANGLING = 1;
    summary.findings_by_severity = { error: 1 };
    const summaryText = `${stableJson(
      summary as unknown as JsonValue,
    )}\n`;
    sourceTexts.set(graphSources.graph_audit_summary!, summaryText);

    const manifest = JSON.parse(
      sourceTexts.get(graphSources.graph_audit_manifest!)!,
    ) as {
      artifacts: Array<{
        path: string;
        sha256: string;
        rows?: number;
      }>;
    };
    const findingsPin = manifest.artifacts.find(
      (entry) => entry.path === "findings.jsonl",
    )!;
    findingsPin.sha256 = sha256(findingsText);
    findingsPin.rows = 1;
    manifest.artifacts.find(
      (entry) => entry.path === "summary.json",
    )!.sha256 = sha256(summaryText);
    const manifestText = `${stableJson(
      manifest as unknown as JsonValue,
    )}\n`;
    sourceTexts.set(graphSources.graph_audit_manifest!, manifestText);

    const sql = JSON.parse(
      sourceTexts.get(graphSources.sql_integrity_summary!)!,
    ) as Record<string, unknown>;
    Object.assign(sql, {
      graph_findings_sha256: sha256(findingsText),
      graph_manifest_sha256: sha256(manifestText),
      graph_summary_sha256: sha256(summaryText),
      repository_finding_count: 1,
      sql_finding_count: 1,
      graph_enforcement_eligible_finding_count: 0,
    });
    sourceTexts.set(
      graphSources.sql_integrity_summary!,
      `${stableJson(sql as unknown as JsonValue)}\n`,
    );

    expect(() =>
      buildRelationshipEnforcementOutputs({
        contract,
        matrix,
        sourceTexts,
      })
    ).toThrow("graph_integrity_summary");
  });

  it("derives consumer proof only from two distinct, fully pinned snapshots", () => {
    const a = makeSnapshot("a", "2026-07-16T08:00:00.000Z");
    const b = makeSnapshot("b", "2026-07-16T09:00:00.000Z");
    const summary = deriveDeterminismConsumerSummary(
      a,
      b,
      determinismValidationOptions,
    );
    expect(summary).toMatchObject({
      latest_before: "v1-rc5",
      latest_after: "v1-rc5",
      tracker_mutation_count: 0,
      failed_command_count: 0,
      violation_count: 0,
      tracker_compatibility_status:
        "incompatible_operational_occurrence_schema_v2",
      tracker_replay_status: "not_run_incompatible_schema_v2",
      tracker_unsupported_version_pairs: [{
        contract: "operational_occurrences",
        release_version: 2,
        supported_version: 1,
      }],
      tracker_replay_attempted: false,
      tracker_write_command_count: 0,
    });
    expect(() =>
      deriveDeterminismConsumerSummary(
        a,
        a,
        determinismValidationOptions,
      )
    ).toThrow(
      "independently captured",
    );

    const manifestPath = join(b, "manifest.json");
    const originalManifest = readFileSync(manifestPath, "utf8");
    const substituted = JSON.parse(originalManifest) as {
      command_results: Array<{
        command_id: string;
        command: string;
        argv: string[];
      }>;
    };
    const validateResult = substituted.command_results.find(
      (result) => result.command_id === "validate",
    )!;
    validateResult.argv = ["bun", "run", "test"];
    validateResult.command = validateResult.argv.join(" ");
    write(
      manifestPath,
      `${stableJson(substituted as unknown as JsonValue)}\n`,
    );
    expect(() =>
      deriveDeterminismConsumerSummary(
        a,
        b,
        determinismValidationOptions,
      )
    ).toThrow(
      "command result is invalid",
    );

    write(manifestPath, originalManifest);
    write(join(b, "commands/validate.log"), "tampered\n");
    expect(() =>
      deriveDeterminismConsumerSummary(
        a,
        b,
        determinismValidationOptions,
      )
    ).toThrow(
      "content address does not match",
    );
  });

  it("rejects text masquerading as a current clean sealed SQLite snapshot", () => {
    const textRepo = makeCurrentRepoFixture(
      "text-database-repo",
      "text",
    );
    const a = makeSnapshot(
      "text-db-a",
      "2026-07-16T10:00:00.000Z",
      { repo: textRepo },
    );
    const b = makeSnapshot(
      "text-db-b",
      "2026-07-16T11:00:00.000Z",
      { repo: textRepo },
    );

    expect(() =>
      deriveDeterminismConsumerSummary(a, b, {
        currentRepoRoot: textRepo.root,
        trackerRoot: trackerRepoFixture,
      })
    ).toThrow("is not a real sealed canonical.db v8");
  });

  it("rejects an internally re-pinned release whose record identities diverge from SQLite", () => {
    const a = makeSnapshot(
      "release-mismatch-a",
      "2026-07-16T12:00:00.000Z",
    );
    const b = makeSnapshot(
      "release-mismatch-b",
      "2026-07-16T13:00:00.000Z",
    );
    installInternallyPinnedRelationMismatch(b);

    expect(() =>
      deriveDeterminismConsumerSummary(
        a,
        b,
        determinismValidationOptions,
      )
    ).toThrow("do not match canonical.db");
  });

  it("rejects a re-pinned substituted command specification", () => {
    const a = makeSnapshot(
      "command-spec-a",
      "2026-07-16T13:10:00.000Z",
    );
    const b = makeSnapshot(
      "command-spec-b",
      "2026-07-16T13:20:00.000Z",
    );
    const substituted = "[]\n";
    const commandSpecPath = join(
      b,
      "provenance/command-spec.json",
    );
    write(commandSpecPath, substituted);
    const manifestPath = join(b, "manifest.json");
    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as {
      artifacts: Record<
        string,
        { path: string; bytes: number; sha256: string }
      >;
    };
    manifest.artifacts.command_spec = {
      ...manifest.artifacts.command_spec!,
      bytes: Buffer.byteLength(substituted),
      sha256: byteSha256(substituted),
    };
    write(
      manifestPath,
      `${stableJson(manifest as unknown as JsonValue)}\n`,
    );

    expect(() =>
      deriveDeterminismConsumerSummary(
        a,
        b,
        determinismValidationOptions,
      )
    ).toThrow("command specification is stale or substituted");
  });

  it("detects same-path Tracker untracked-content mutation even when porcelain names are unchanged", () => {
    const tracker = makeTrackerRepoFixture(
      "tracker-with-untracked",
      { path: "scratch/state.txt", content: "before\n" },
    );
    const a = makeSnapshot(
      "tracker-content-a",
      "2026-07-16T14:00:00.000Z",
      { trackerRoot: tracker },
    );
    const b = makeSnapshot(
      "tracker-content-b",
      "2026-07-16T15:00:00.000Z",
      { trackerRoot: tracker },
    );
    const trackerOptions = {
      currentRepoRoot: currentRepoFixture.root,
      trackerRoot: tracker,
    };
    expect(() =>
      deriveDeterminismConsumerSummary(a, b, trackerOptions)
    ).not.toThrow();

    write(join(tracker, "scratch/state.txt"), "after\n");
    expect(() =>
      deriveDeterminismConsumerSummary(a, b, trackerOptions)
    ).toThrow("exact current protected Tracker state");
  });

  it("parses and pins the real Tracker importer contract when the read-only checkout is available", () => {
    const realTrackerRoot =
      "/mnt/models/dev/bus-reliability-tracker";
    if (!existsSync(realTrackerRoot)) return;

    const state = JSON.parse(
      trackerStateEvidenceText(realTrackerRoot),
    ) as {
      write_command_count: number;
      accessed_files: Array<{ path: string; sha256: string }>;
      importer_support: Record<string, number>;
    };
    expect(state.write_command_count).toBe(0);
    expect(state.accessed_files).toEqual([
      {
        path: "tools/pipeline-v2/src/lib/mta-wiki-operational-occurrences.ts",
        bytes: expect.any(Number),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
    ]);
    expect(state.importer_support).toEqual({
      manifest_version: 3,
      operational_anchors: 1,
      operational_anchor_review_decisions: 1,
      operational_occurrences: 1,
      operational_occurrence_review_decisions: 1,
    });
  });

  it("rejects a snapshot as soon as the current MTA Wiki worktree becomes dirty", () => {
    const a = makeSnapshot(
      "dirty-repo-a",
      "2026-07-16T16:00:00.000Z",
    );
    const b = makeSnapshot(
      "dirty-repo-b",
      "2026-07-16T17:00:00.000Z",
    );
    const dirtyPath = join(currentRepoFixture.root, "untracked.txt");
    write(dirtyPath, "dirty\n");
    try {
      expect(() =>
        deriveDeterminismConsumerSummary(
          a,
          b,
          determinismValidationOptions,
        )
      ).toThrow("exact current clean MTA Wiki");
    } finally {
      rmSync(dirtyPath, { force: true });
    }
  });
});
