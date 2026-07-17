import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import {
  assertRelationshipEnforcementProof,
  assertRelationshipFinalEndpointMatrix,
  assertRelationshipFinalMatrixProjection,
  loadRelationshipContract,
  RELATIONSHIP_CONTRACT_ID,
  RELATIONSHIP_CONTRACT_POLICY_V1,
  RELATIONSHIP_ENFORCEMENT_GATE_IDS,
  RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS,
  RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES,
  RELATIONSHIP_ENFORCEMENT_TRANSITION_RECEIPT_ID,
  RELATIONSHIP_ENFORCEMENT_TRANSITION_RECEIPT_SCHEMA_VERSION,
  relationshipEnforcementTransitionFingerprint,
  type RelationshipContract,
  type RelationshipEnforcementProof,
  type RelationshipEnforcementTransitionArtifactPin,
  type RelationshipEnforcementTransitionReceipt,
  type RelationshipFinalEndpointMatrix,
  type RelationshipFinalEndpointRule,
  type RelationshipProjectedRelation,
  type RelationshipProjectedTupleInventory,
} from "../packages/db/src/relationship-contract";
import {
  sha256,
  stableJson,
} from "../packages/db/src/stable-json";
import type {
  JsonValue,
  MtaObservationKind,
} from "../packages/db/src/types";

const CONTRACT_ROOT = join(
  repoRoot,
  "data/contracts/relationships/v1",
);
const CONTRACT_PATH = join(CONTRACT_ROOT, "contract.json");
const FINAL_MATRIX_PATH = join(
  CONTRACT_ROOT,
  "post-remediation-endpoint-matrix.json",
);
const ENFORCEMENT_PROOF_PATH = join(
  CONTRACT_ROOT,
  "enforcement-proof.json",
);
const CANONICAL_RELATIONS_PATH = join(
  repoRoot,
  "data/canonical/relations.jsonl",
);
const CANONICAL_DB_PATH = join(repoRoot, "data/canonical.db");
const DETERMINISM_SUMMARY_PATH = join(
  repoRoot,
  "data/quality/relationship-integrity/determinism-consumer/summary.json",
);
const REVIEWED_RELEASE_MANIFEST_PATH = join(
  repoRoot,
  "data/exports/releases/v1-rc21/manifest.json",
);
const SEMANTIC_ROOT = join(
  repoRoot,
  "data/quality/relationship-integrity/semantic-remediation",
);
const PROJECTED_RELATIONS_PATH = join(
  SEMANTIC_ROOT,
  "projected-relations.jsonl",
);
const PROJECTED_TUPLES_PATH = join(
  SEMANTIC_ROOT,
  "projected-tuples.json",
);
const SEMANTIC_SUMMARY_PATH = join(SEMANTIC_ROOT, "summary.json");

const REVIEWED_AT = "2026-07-17T00:00:00.000Z";
const REVIEWED_BY = "codex-relationship-integrity-campaign";
const EXPECTED_RELATION_COUNT = 21_422;
const EXPECTED_TUPLE_COUNT = 1_008;
const EXPECTED_RELATION_KIND_COUNT = 704;
const EXPECTED_PROJECTED_RELATIONS_SHA256 =
  "f8d5d6088f03495e62b68f747484bf963bb985a9d3bdf50e8a18e1e0540d635e";
const EXPECTED_PROJECTED_RELATIONS_LOGICAL_SHA256 =
  "584e59d4b9359d4901e6061d3697f8b2fe5f0015037f286804d09568700e5715";
const EXPECTED_PROJECTED_TUPLES_SHA256 =
  "63ba1e301abdbfe23ee1d54a030fb71f4482e6248d01666673061f9381ff1701";
const EXPECTED_PROJECTED_TUPLES_LOGICAL_SHA256 =
  "9a5ba7e0fa811ec72fcc2eb6539f095c4df26c946e0854d34a18a25957253907";
const EXPECTED_SEMANTIC_SUMMARY_SHA256 =
  "f19cdd61c0c57049adab0d2abf08c5cf01d2e64b85d66a960b6816b1164a2b66";
const EXPECTED_RELATION_IDS_SHA256 =
  "39b313412f097585ae8359b9aa479212e184bb4d763c7cc06d78d4c7406139d1";
const EXPECTED_TUPLE_SET_SHA256 =
  "629f15b36de36b57c4724d6790b22acc24ff245ec7457ec9f9b3dbe002aab58f";
const EXPECTED_PAYLOAD_REMEDIATION_LEDGER_SHA256 =
  "db2a04b5a54f6e7982849fa101c0c72338000ef06d493f40565b2b168f5b6de1";
const EXPECTED_PAYLOAD_REMEDIATION_JOURNAL_SHA256 =
  "35a6d36b5e0b922b59a076d2b477b76ce4c292d5c49f8216ed36e8128b20b9a4";
const EXPECTED_PAYLOAD_REVIEW_DECISIONS_SHA256 =
  "c3f3545ced15c8f637469097eeb08db1ff8cd9c52a1c897d3b0ff8aadfa5f102";

export const REQUIRED_RELATIONSHIP_ENFORCEMENT_GATES =
  RELATIONSHIP_ENFORCEMENT_GATE_IDS;

type SemanticRemediationSummary = {
  schema_version: 1;
  campaign_id: "relationship-semantic-remediation-v1";
  status: "applied";
  action_reconciliation: {
    reviewed_relation_count: number;
    reconciled_decision_count: number;
    unreconciled_decision_count: number;
    native_derivation_supersession_count: number;
    payload_reference_remediation_relation_count: number;
  };
  inputs: {
    payload_reference_remediation: {
      ledger_sha256: string;
      journal_sha256: string;
      review_decisions_sha256: string;
      relation_count: number;
      unique_submission_count: number;
      decision_link_count: number;
    };
  };
  after: {
    relation_count: number;
    tuple_count: number;
    skipped_correction_count: number;
    unmapped_relation_count: number;
    correction_apply_summary: {
      total: number;
      applied: number;
      superseded: number;
      skipped: number;
    };
  };
  outputs: {
    projected_relations_path: string;
    projected_relations_sha256: string;
    projected_relations_logical_sha256: string;
    projected_tuples_path: string;
    projected_tuples_sha256: string;
    projected_tuples_logical_sha256: string;
  };
};

type FinalMatrixSourcePins =
  RelationshipFinalEndpointMatrix["generated_from"];

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

function fileSha256(path: string): string {
  return createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function writeJson(path: string, value: JsonValue): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const stat = lstatSync(path);
    assert(
      stat.isFile() && !stat.isSymbolicLink(),
      `Refusing to replace non-regular reviewed relationship artifact: ${relative(repoRoot, path)}`,
    );
  }
  const temporary = `${path}.tmp-${process.pid}`;
  rmSync(temporary, { force: true });
  writeFileSync(
    temporary,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  renameSync(temporary, path);
}

function writeContentAddressedArtifact(
  path: string,
  text: string,
): void {
  if (existsSync(path)) {
    const stat = lstatSync(path);
    assert(
      stat.isFile() && !stat.isSymbolicLink(),
      `Content-addressed enforcement archive is not a regular file: ${relative(repoRoot, path)}`,
    );
    assert(
      readFileSync(path, "utf8") === text,
      `Content-addressed enforcement archive collision: ${relative(repoRoot, path)}`,
    );
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  rmSync(temporary, { force: true });
  writeFileSync(temporary, text, "utf8");
  renameSync(temporary, path);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function shapeKey(
  subjectKind: MtaObservationKind,
  objectKind: MtaObservationKind,
): string {
  return `${subjectKind}\0${objectKind}`;
}

function tupleSort(
  left: RelationshipProjectedTupleInventory["tuples"][number],
  right: RelationshipProjectedTupleInventory["tuples"][number],
): number {
  return (
    left.relation_kind.localeCompare(right.relation_kind) ||
    left.relation_family.localeCompare(right.relation_family) ||
    left.subject_kind.localeCompare(right.subject_kind) ||
    left.object_kind.localeCompare(right.object_kind)
  );
}

export function buildRelationshipFinalEndpointMatrix(
  relations: RelationshipProjectedRelation[],
  inventory: RelationshipProjectedTupleInventory,
  sourcePins: FinalMatrixSourcePins,
): RelationshipFinalEndpointMatrix {
  const tuples = [...inventory.tuples].sort(tupleSort);
  const byKind = new Map<string, typeof tuples>();
  for (const tuple of tuples) {
    const decisionIds = sortedUnique([
      ...tuple.semantic_review_decision_ids,
      ...tuple.semantic_remediation_decision_ids,
    ]);
    assert(
      decisionIds.length > 0,
      `Reviewed projected tuple has no semantic decision: ${tuple.relation_kind}/${tuple.relation_family}/${tuple.subject_kind}/${tuple.object_kind}`,
    );
    const group = byKind.get(tuple.relation_kind) ?? [];
    group.push(tuple);
    byKind.set(tuple.relation_kind, group);
  }

  const rules: RelationshipFinalEndpointRule[] = [
    ...byKind.entries(),
  ]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relationKind, kindTuples]) => {
      const shapes = new Map<
        string,
        {
          subject_kind: MtaObservationKind;
          object_kind: MtaObservationKind;
        }
      >();
      for (const tuple of kindTuples) {
        shapes.set(
          shapeKey(tuple.subject_kind, tuple.object_kind),
          {
            subject_kind: tuple.subject_kind,
            object_kind: tuple.object_kind,
          },
        );
      }
      return {
        relation_kind: relationKind,
        relation_families: sortedUnique(
          kindTuples.map((tuple) => tuple.relation_family),
        ),
        allowed_shapes: [...shapes.values()].sort(
          (left, right) =>
            left.subject_kind.localeCompare(
              right.subject_kind,
            ) ||
            left.object_kind.localeCompare(right.object_kind),
        ),
        allowed_family_shapes: kindTuples.map((tuple) => ({
          relation_family: tuple.relation_family,
          subject_kind: tuple.subject_kind,
          object_kind: tuple.object_kind,
          provenance: "reviewed_post_remediation" as const,
          review_decision_ids: sortedUnique([
            ...tuple.semantic_review_decision_ids,
            ...tuple.semantic_remediation_decision_ids,
          ]),
          relation_count: tuple.relation_count,
          relation_ids_sha256: tuple.relation_ids_sha256,
        })),
        review_basis: "reviewed_post_remediation" as const,
      };
    });

  const matrix: RelationshipFinalEndpointMatrix = {
    schema_version: 1,
    matrix_id:
      "relationship-contract-v1-post-remediation-final",
    contract_id: RELATIONSHIP_CONTRACT_ID,
    review_status: "reviewed_post_remediation",
    obsolete_baseline_tuple_policy: "reject",
    generated_from: sourcePins,
    relation_kind_rule_count: rules.length,
    covered_relation_count: relations.length,
    allowed_family_shape_count: tuples.length,
    relation_ids_sha256: inventory.relation_ids_sha256,
    tuple_set_sha256: inventory.tuples_sha256,
    rules,
  };
  assertRelationshipFinalMatrixProjection(
    matrix,
    relations,
    inventory,
  );
  return matrix;
}

function loadPinnedProjection(): {
  relations: RelationshipProjectedRelation[];
  inventory: RelationshipProjectedTupleInventory;
  summary: SemanticRemediationSummary;
  sourcePins: FinalMatrixSourcePins;
} {
  for (const [path, expected] of [
    [
      PROJECTED_RELATIONS_PATH,
      EXPECTED_PROJECTED_RELATIONS_SHA256,
    ],
    [PROJECTED_TUPLES_PATH, EXPECTED_PROJECTED_TUPLES_SHA256],
    [SEMANTIC_SUMMARY_PATH, EXPECTED_SEMANTIC_SUMMARY_SHA256],
  ] as const) {
    assert(
      existsSync(path) && fileSha256(path) === expected,
      `${relative(repoRoot, path)} drifted from reviewed SHA-256 ${expected}`,
    );
  }

  const relations = readJsonl<RelationshipProjectedRelation>(
    PROJECTED_RELATIONS_PATH,
  );
  const inventory =
    readJson<RelationshipProjectedTupleInventory>(
      PROJECTED_TUPLES_PATH,
    );
  const summary = readJson<SemanticRemediationSummary>(
    SEMANTIC_SUMMARY_PATH,
  );
  const relationsLogicalSha256 = sha256(
    stableJson(relations as unknown as JsonValue),
  );
  const tuplesLogicalSha256 = sha256(
    stableJson(inventory as unknown as JsonValue),
  );

  assert(
    relations.length === EXPECTED_RELATION_COUNT &&
      inventory.relation_count === EXPECTED_RELATION_COUNT &&
      inventory.tuple_count === EXPECTED_TUPLE_COUNT &&
      inventory.tuples.length === EXPECTED_TUPLE_COUNT &&
      inventory.relation_ids_sha256 ===
        EXPECTED_RELATION_IDS_SHA256 &&
      inventory.tuples_sha256 === EXPECTED_TUPLE_SET_SHA256 &&
      inventory.unmapped_relation_count === 0,
    "Reviewed semantic projection count/hash pins drifted",
  );
  assert(
    relationsLogicalSha256 ===
      EXPECTED_PROJECTED_RELATIONS_LOGICAL_SHA256 &&
      tuplesLogicalSha256 ===
        EXPECTED_PROJECTED_TUPLES_LOGICAL_SHA256,
    "Reviewed semantic projection logical hashes drifted",
  );
  assert(
    summary.schema_version === 1 &&
      summary.campaign_id ===
        "relationship-semantic-remediation-v1" &&
      summary.status === "applied" &&
      summary.action_reconciliation.reviewed_relation_count ===
        399 &&
      summary.action_reconciliation.reconciled_decision_count ===
        399 &&
      summary.action_reconciliation.unreconciled_decision_count ===
        0 &&
      summary.action_reconciliation
        .native_derivation_supersession_count === 7 &&
      summary.action_reconciliation
        .payload_reference_remediation_relation_count === 81 &&
      summary.inputs.payload_reference_remediation.ledger_sha256 ===
        EXPECTED_PAYLOAD_REMEDIATION_LEDGER_SHA256 &&
      summary.inputs.payload_reference_remediation.journal_sha256 ===
        EXPECTED_PAYLOAD_REMEDIATION_JOURNAL_SHA256 &&
      summary.inputs.payload_reference_remediation
        .review_decisions_sha256 ===
        EXPECTED_PAYLOAD_REVIEW_DECISIONS_SHA256 &&
      summary.inputs.payload_reference_remediation.relation_count ===
        81 &&
      summary.inputs.payload_reference_remediation
        .unique_submission_count === 81 &&
      summary.inputs.payload_reference_remediation
        .decision_link_count === 162 &&
      summary.after.relation_count === EXPECTED_RELATION_COUNT &&
      summary.after.tuple_count === EXPECTED_TUPLE_COUNT &&
      summary.after.correction_apply_summary.total === 798 &&
      summary.after.correction_apply_summary.applied === 772 &&
      summary.after.correction_apply_summary.superseded === 26 &&
      summary.after.correction_apply_summary.skipped === 0 &&
      summary.after.skipped_correction_count === 0 &&
      summary.after.unmapped_relation_count === 0,
    "Semantic remediation summary is not a zero-backlog reviewed projection",
  );
  assert(
    summary.outputs.projected_relations_path ===
      relative(repoRoot, PROJECTED_RELATIONS_PATH) &&
      summary.outputs.projected_relations_sha256 ===
        EXPECTED_PROJECTED_RELATIONS_SHA256 &&
      summary.outputs.projected_relations_logical_sha256 ===
        EXPECTED_PROJECTED_RELATIONS_LOGICAL_SHA256 &&
      summary.outputs.projected_tuples_path ===
        relative(repoRoot, PROJECTED_TUPLES_PATH) &&
      summary.outputs.projected_tuples_sha256 ===
        EXPECTED_PROJECTED_TUPLES_SHA256 &&
      summary.outputs.projected_tuples_logical_sha256 ===
        EXPECTED_PROJECTED_TUPLES_LOGICAL_SHA256,
    "Semantic remediation summary output pins do not match the reviewed files",
  );

  return {
    relations,
    inventory,
    summary,
    sourcePins: {
      projected_relations_path: relative(
        repoRoot,
        PROJECTED_RELATIONS_PATH,
      ),
      projected_relations_sha256:
        EXPECTED_PROJECTED_RELATIONS_SHA256,
      projected_relations_logical_sha256:
        EXPECTED_PROJECTED_RELATIONS_LOGICAL_SHA256,
      projected_tuples_path: relative(
        repoRoot,
        PROJECTED_TUPLES_PATH,
      ),
      projected_tuples_sha256:
        EXPECTED_PROJECTED_TUPLES_SHA256,
      projected_tuples_logical_sha256:
        EXPECTED_PROJECTED_TUPLES_LOGICAL_SHA256,
      semantic_remediation_summary_path: relative(
        repoRoot,
        SEMANTIC_SUMMARY_PATH,
      ),
      semantic_remediation_summary_sha256:
        EXPECTED_SEMANTIC_SUMMARY_SHA256,
      campaign_id: "relationship-semantic-remediation-v1",
      skipped_correction_count: 0,
      unmapped_relation_count: 0,
    },
  };
}

function finalMatrixPointer(
  matrix: RelationshipFinalEndpointMatrix,
) {
  return {
    path: relative(repoRoot, FINAL_MATRIX_PATH),
    sha256: sha256(
      stableJson(matrix as unknown as JsonValue),
    ),
    matrix_kind: "post_remediation_reviewed" as const,
    relation_count: matrix.covered_relation_count,
    tuple_count: matrix.allowed_family_shape_count,
    relation_ids_sha256: matrix.relation_ids_sha256,
    tuple_set_sha256: matrix.tuple_set_sha256,
    obsolete_baseline_tuple_policy: "reject" as const,
    unlisted_relation_policy: "error" as const,
    new_shape_policy: "error" as const,
  };
}

function finalizedWarningContract(
  previous: RelationshipContract,
  matrix: RelationshipFinalEndpointMatrix,
): RelationshipContract {
  assert(
    previous.contract_status === "warning_first",
    "Final matrix installation must occur before enforcement promotion",
  );
  assert(
    !previous.enforcement_proof,
    "Final matrix installation refuses to discard an existing enforcement proof",
  );
  return {
    ...previous,
    ...structuredClone(RELATIONSHIP_CONTRACT_POLICY_V1),
    contract_status: "warning_first",
    reviewed_at: REVIEWED_AT,
    reviewed_by: REVIEWED_BY,
    endpoint_matrix: finalMatrixPointer(matrix),
  };
}

function assertInstalledMatrix(
  matrix: RelationshipFinalEndpointMatrix,
): RelationshipContract {
  assert(
    existsSync(FINAL_MATRIX_PATH),
    "Final relationship endpoint matrix is missing",
  );
  const stored =
    readJson<RelationshipFinalEndpointMatrix>(FINAL_MATRIX_PATH);
  assert(
    stableJson(stored as unknown as JsonValue) ===
      stableJson(matrix as unknown as JsonValue),
    "Final relationship endpoint matrix differs from the reviewed semantic projection",
  );
  const contract = readJson<RelationshipContract>(CONTRACT_PATH);
  const pointer = finalMatrixPointer(matrix);
  assert(
    stableJson(
      contract.endpoint_matrix as unknown as JsonValue,
    ) === stableJson(pointer as unknown as JsonValue),
    "Relationship contract does not point exactly to the final reviewed matrix",
  );
  return contract;
}

type PromotionArtifact = {
  path: string;
  text: string;
};

function promotionSourcePins(
  proof: RelationshipEnforcementProof,
): {
  gates: RelationshipEnforcementTransitionReceipt["previous_gates"];
  sources: RelationshipEnforcementTransitionArtifactPin[];
  artifacts: PromotionArtifact[];
} {
  const proofSha256 = sha256(
    stableJson(proof as unknown as JsonValue),
  );
  const archiveRoot = join(
    CONTRACT_ROOT,
    "enforcement-proofs",
    proofSha256,
  );
  const archivedProofPath = join(archiveRoot, "proof.json");
  const artifacts: PromotionArtifact[] = [{
    path: archivedProofPath,
    text: `${JSON.stringify(proof, null, 2)}\n`,
  }];
  const gates: RelationshipEnforcementTransitionReceipt["previous_gates"] = [];
  const sources: RelationshipEnforcementTransitionArtifactPin[] = [];
  for (const gate of [...proof.gates].sort((left, right) =>
    left.gate_id.localeCompare(right.gate_id)
  )) {
    const activePath = isAbsolute(gate.artifact_path)
      ? gate.artifact_path
      : join(repoRoot, gate.artifact_path);
    const text = readFileSync(activePath, "utf8");
    assert(
      sha256(text) === gate.artifact_sha256,
      `Cannot archive stale enforcement gate ${gate.gate_id}`,
    );
    const archivePath = join(
      archiveRoot,
      "gates",
      `${gate.gate_id}.json`,
    );
    artifacts.push({ path: archivePath, text });
    gates.push({
      gate_id: gate.gate_id,
      path: relative(repoRoot, archivePath),
      sha256: gate.artifact_sha256,
    });
    const artifact = JSON.parse(text) as {
      source_artifacts: Array<{
        role: string;
        path: string;
        sha256: string;
      }>;
    };
    for (const source of artifact.source_artifacts) {
      const expected = (
        RELATIONSHIP_ENFORCEMENT_GATE_SOURCE_PATHS as Record<
          string,
          readonly { role: string; path: string }[]
        >
      )[gate.gate_id]?.find(
        (candidate) =>
          candidate.role === source.role &&
          candidate.path === source.path,
      );
      assert(
        expected !== undefined,
        `Cannot archive unversioned enforcement source ${gate.gate_id}/${source.role}`,
      );
      const sourceText = readFileSync(join(repoRoot, source.path), "utf8");
      assert(
        sha256(sourceText) === source.sha256,
        `Cannot archive stale enforcement source ${source.role}`,
      );
      const sourceArchivePath = join(
        archiveRoot,
        "sources",
        `${source.role}${source.path.endsWith(".jsonl") ? ".jsonl" : ".json"}`,
      );
      artifacts.push({
        path: sourceArchivePath,
        text: sourceText,
      });
      sources.push({
        ...source,
        archive_path: relative(repoRoot, sourceArchivePath),
        ...((RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES as readonly string[])
          .includes(source.role)
          ? {
              transition_fingerprint:
                relationshipEnforcementTransitionFingerprint(
                  source.role,
                  sourceText,
                ),
            }
          : {}),
      });
    }
  }
  sources.sort(
    (left, right) =>
      left.role.localeCompare(right.role) ||
      left.path.localeCompare(right.path),
  );
  return { gates, sources, artifacts };
}

function promoteWithProof(
  matrix: RelationshipFinalEndpointMatrix,
): {
  contract: RelationshipContract;
  receipt: RelationshipEnforcementTransitionReceipt;
  receiptPath: string;
  artifacts: PromotionArtifact[];
} {
  const contract = assertInstalledMatrix(matrix);
  assert(
    contract.contract_status === "warning_first",
    "Only a warning-first relationship contract may be promoted",
  );
  assert(
    existsSync(ENFORCEMENT_PROOF_PATH),
    "Reviewed relationship enforcement proof is missing",
  );
  const proof = readJson<RelationshipEnforcementProof>(
    ENFORCEMENT_PROOF_PATH,
  );
  assertRelationshipEnforcementProof(
    proof,
    matrix,
    contract.endpoint_matrix,
    REQUIRED_RELATIONSHIP_ENFORCEMENT_GATES,
  );
  const proofSha256 = sha256(
    stableJson(proof as unknown as JsonValue),
  );
  assert(
    contract.enforcement_state === "warning_ready" &&
      contract.enforcement_proof?.path ===
        relative(repoRoot, ENFORCEMENT_PROOF_PATH) &&
      contract.enforcement_proof.sha256 === proofSha256 &&
      proof.proof_stage === "pre_promotion_warning" &&
      proof.validation_mode === "warn",
    "Promotion requires the exact warning_ready pre-promotion warning proof pointer",
  );
  const archived = promotionSourcePins(proof);
  const archiveRoot = join(
    CONTRACT_ROOT,
    "enforcement-proofs",
    proofSha256,
  );
  const previousProofPath = relative(
    repoRoot,
    join(archiveRoot, "proof.json"),
  );
  const refreshByRole = new Map(
    archived.sources
      .filter((pin) =>
        (RELATIONSHIP_ENFORCEMENT_REFRESH_ROLES as readonly string[])
          .includes(pin.role)
      )
      .map((pin) => [pin.role, pin] as const),
  );
  refreshByRole.set("canonical_db", {
    role: "canonical_db",
    path: relative(repoRoot, CANONICAL_DB_PATH),
    sha256: fileSha256(CANONICAL_DB_PATH),
  });
  const receipt: RelationshipEnforcementTransitionReceipt = {
    schema_version:
      RELATIONSHIP_ENFORCEMENT_TRANSITION_RECEIPT_SCHEMA_VERSION,
    receipt_id: RELATIONSHIP_ENFORCEMENT_TRANSITION_RECEIPT_ID,
    contract_id: RELATIONSHIP_CONTRACT_ID,
    transition: {
      from_state: "warning_ready",
      to_state: "enforced_refresh_required",
    },
    promoted_at: REVIEWED_AT,
    promoted_by: REVIEWED_BY,
    previous_proof: {
      path: previousProofPath,
      sha256: proofSha256,
      proof_stage: "pre_promotion_warning",
    },
    final_matrix: {
      path: contract.endpoint_matrix.path,
      sha256: contract.endpoint_matrix.sha256,
      relation_count: matrix.covered_relation_count,
      tuple_count: matrix.allowed_family_shape_count,
      relation_ids_sha256: matrix.relation_ids_sha256,
      tuple_set_sha256: matrix.tuple_set_sha256,
    },
    previous_gates: archived.gates,
    pre_promotion_sources: archived.sources,
    invariant_artifacts: [
      {
        role: "canonical_relations",
        path: relative(repoRoot, CANONICAL_RELATIONS_PATH),
        sha256: fileSha256(CANONICAL_RELATIONS_PATH),
      },
      {
        role: "determinism_consumer_summary",
        path: relative(repoRoot, DETERMINISM_SUMMARY_PATH),
        sha256: fileSha256(DETERMINISM_SUMMARY_PATH),
      },
      {
        role: "final_endpoint_matrix",
        path: contract.endpoint_matrix.path,
        sha256: contract.endpoint_matrix.sha256,
      },
      {
        role: "reviewed_release_manifest",
        path: relative(repoRoot, REVIEWED_RELEASE_MANIFEST_PATH),
        sha256: fileSha256(REVIEWED_RELEASE_MANIFEST_PATH),
      },
    ],
    refresh_artifacts: [...refreshByRole.values()].sort(
      (left, right) => left.role.localeCompare(right.role),
    ),
  };
  const receiptSha256 = sha256(
    stableJson(receipt as unknown as JsonValue),
  );
  const receiptPath = join(
    CONTRACT_ROOT,
    "enforcement-transition-receipts",
    `${receiptSha256}.json`,
  );
  return {
    contract: {
    ...contract,
    contract_status: "enforced",
    enforcement_state: "enforced_refresh_required",
    enforcement_proof: {
      path: relative(repoRoot, ENFORCEMENT_PROOF_PATH),
      sha256: proofSha256,
      required_gate_ids: [
        ...REQUIRED_RELATIONSHIP_ENFORCEMENT_GATES,
      ],
      transition_receipt: {
        path: relative(repoRoot, receiptPath),
        sha256: receiptSha256,
      },
    },
    },
    receipt,
    receiptPath,
    artifacts: archived.artifacts,
  };
}

export function finalizeRelationshipContractV1(
  mode:
    | "check"
    | "apply_warning_final"
    | "promote_enforced",
): void {
  const { relations, inventory, sourcePins } =
    loadPinnedProjection();
  const matrix = buildRelationshipFinalEndpointMatrix(
    relations,
    inventory,
    sourcePins,
  );
  assert(
    matrix.covered_relation_count === EXPECTED_RELATION_COUNT &&
      matrix.allowed_family_shape_count === EXPECTED_TUPLE_COUNT &&
      matrix.relation_kind_rule_count ===
        EXPECTED_RELATION_KIND_COUNT,
    "Final relationship matrix reviewed counts drifted",
  );

  if (mode === "apply_warning_final") {
    const previous = readJson<RelationshipContract>(CONTRACT_PATH);
    const contract = finalizedWarningContract(previous, matrix);
    writeJson(
      FINAL_MATRIX_PATH,
      matrix as unknown as JsonValue,
    );
    writeJson(CONTRACT_PATH, contract as unknown as JsonValue);
  } else if (mode === "promote_enforced") {
    const promotion = promoteWithProof(matrix);
    for (const artifact of promotion.artifacts) {
      writeContentAddressedArtifact(
        artifact.path,
        artifact.text,
      );
    }
    writeContentAddressedArtifact(
      promotion.receiptPath,
      `${JSON.stringify(promotion.receipt, null, 2)}\n`,
    );
    // The contract pointer is the commit record and is deliberately written
    // last. Any earlier failure leaves warning_ready intact and rerunnable.
    writeJson(
      CONTRACT_PATH,
      promotion.contract as unknown as JsonValue,
    );
  } else {
    assertInstalledMatrix(matrix);
  }

  const loaded = loadRelationshipContract(CONTRACT_PATH);
  assertRelationshipFinalEndpointMatrix(
    loaded.matrix as RelationshipFinalEndpointMatrix,
  );
  console.log(
    JSON.stringify(
      {
        contract_id: RELATIONSHIP_CONTRACT_ID,
        mode,
        contract_status: loaded.contract.contract_status,
        enforcement_state: loaded.contract.enforcement_state ?? null,
        relation_kind_rule_count:
          matrix.relation_kind_rule_count,
        relation_count: matrix.covered_relation_count,
        tuple_count: matrix.allowed_family_shape_count,
        relation_ids_sha256: matrix.relation_ids_sha256,
        tuple_set_sha256: matrix.tuple_set_sha256,
        final_matrix_sha256:
          loaded.contract.endpoint_matrix.sha256,
        enforcement_proof_loaded: Boolean(
          loaded.enforcementProof,
        ),
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) {
  const apply = process.argv.includes("--apply");
  const reviewedFinalization = process.argv.includes(
    "--reviewed-finalization",
  );
  const promote = process.argv.includes("--promote");
  const reviewedEnforcement = process.argv.includes(
    "--reviewed-enforcement",
  );
  const check = process.argv.includes("--check");
  assert(
    Number(apply) + Number(promote) + Number(check) === 1,
    "Choose exactly one of --check, --apply, or --promote",
  );
  if (apply) {
    assert(
      reviewedFinalization,
      "Final matrix installation requires --reviewed-finalization",
    );
    finalizeRelationshipContractV1("apply_warning_final");
  } else if (promote) {
    assert(
      reviewedEnforcement,
      "Enforcement promotion requires --reviewed-enforcement",
    );
    finalizeRelationshipContractV1("promote_enforced");
  } else {
    finalizeRelationshipContractV1("check");
  }
}
