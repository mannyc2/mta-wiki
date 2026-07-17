import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { sha256, stableHash, stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import {
  auditOccurrenceTreatmentPhysicality,
  buildOccurrenceTreatmentPhysicalityReview,
  OCCURRENCE_TREATMENT_PHYSICALITY_CONTRACT_ID,
  OCCURRENCE_TREATMENT_PHYSICALITY_POLICY_V1,
  OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION,
  type OccurrenceTreatmentPhysicalityDecision,
  type OccurrenceTreatmentPhysicalityInput,
} from "../packages/pipeline/src/quality/occurrence-treatment-physicality";

const DEFAULT_RELEASE_DIR = join(repoRoot, "data", "exports", "releases", "v1-rc20");
const DEFAULT_COMPLETENESS_DIR = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "completeness",
);
const CONTRACT_DIR = join(
  repoRoot,
  "data",
  "contracts",
  "occurrence-treatment-physicality",
  "v1",
);
const QUALITY_DIR = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "occurrence-treatment-physicality",
);
const REVIEW_LEDGER_PATH = join(CONTRACT_DIR, "review-ledger.jsonl");
const RC20_MANIFEST_SHA256 =
  "a2e9147fbb3db3b27a48df27f9550a8b31ab28bc85e30b7166d75b46b54e1a08";

type Stage = "provisional_rc20" | "final_post_semantic_release";

type FilePin = {
  path: string;
  bytes: number;
  sha256: string;
  row_count?: number | undefined;
};

type ReleaseManifest = {
  manifest_version: number;
  release_id: string;
  files: Record<string, { bytes: number; sha256: string }>;
};

type CompletenessManifest = {
  schema_version: number;
  mode: string;
  release_id: string;
  files: Record<string, FilePin>;
};

type CompletenessOccurrenceRow = {
  selector: string;
  occurrence_id: string;
  treatment_record_ids: string[];
};

type Arguments = {
  check: boolean;
  stage: Stage;
  releaseDir: string;
  completenessDir: string;
};

function parseArguments(argv: readonly string[]): Arguments {
  let check = false;
  let stage: Stage = "provisional_rc20";
  let releaseDir = DEFAULT_RELEASE_DIR;
  let completenessDir = DEFAULT_COMPLETENESS_DIR;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--check") {
      check = true;
      continue;
    }
    if (arg === "--stage") {
      const value = argv[index + 1];
      if (value !== "provisional_rc20" && value !== "final_post_semantic_release") {
        throw new Error(`Invalid --stage ${value ?? "<missing>"}`);
      }
      stage = value;
      index += 1;
      continue;
    }
    if (arg === "--release-dir") {
      const value = argv[index + 1];
      if (!value) throw new Error("--release-dir requires a path");
      releaseDir = isAbsolute(value) ? value : resolve(repoRoot, value);
      index += 1;
      continue;
    }
    if (arg === "--completeness-dir") {
      const value = argv[index + 1];
      if (!value) throw new Error("--completeness-dir requires a path");
      completenessDir = isAbsolute(value) ? value : resolve(repoRoot, value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { check, stage, releaseDir, completenessDir };
}

function fileSha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function lineCount(content: string): number {
  return content.trim() ? content.trimEnd().split(/\r?\n/u).length : 0;
}

function pin(path: string, content?: string): FilePin {
  const value = content ?? readFileSync(path, "utf8");
  const result: FilePin = {
    path: relative(repoRoot, path),
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  };
  if (path.endsWith(".jsonl")) result.row_count = lineCount(value);
  return result;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonl<T>(rows: readonly T[]): string {
  return rows.map((row) => stableJson(row as unknown as JsonValue)).join("\n") +
    (rows.length > 0 ? "\n" : "");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8").split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line) as T];
    } catch (error) {
      throw new Error(`${path}:${index + 1}: invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`);
    }
  });
}

function assertReleaseFile(
  releaseDir: string,
  manifest: ReleaseManifest,
  fileName: string,
): string {
  const path = join(releaseDir, fileName);
  if (!existsSync(path)) throw new Error(`Release input is missing: ${path}`);
  const expected = manifest.files[fileName];
  if (!expected) throw new Error(`Release manifest does not pin ${fileName}`);
  const content = readFileSync(path, "utf8");
  if (expected.bytes !== Buffer.byteLength(content) || expected.sha256 !== sha256(content)) {
    throw new Error(`${path}: release manifest pin mismatch`);
  }
  return content;
}

function occurrenceMembers(
  occurrence: OccurrenceTreatmentPhysicalityInput,
): Array<{ treatment_record_id: string; treatment_family: string }> {
  const raw = occurrence.treatment?.kind === "atomic"
    ? occurrence.treatment.member ? [occurrence.treatment.member] : []
    : occurrence.treatment?.members ?? [];
  return raw.map((member) => ({
    treatment_record_id: member.treatment_record_id ?? "",
    treatment_family: member.treatment_family ?? "",
  }));
}

function assertCompletenessReconciliation(input: {
  occurrences: readonly OccurrenceTreatmentPhysicalityInput[];
  completenessRows: readonly CompletenessOccurrenceRow[];
}): void {
  const expected = new Map(
    input.occurrences
      .filter((occurrence) => occurrence.study_projection_eligible === true)
      .map((occurrence) => [
        occurrence.occurrence_id ?? "",
        [...new Set(occurrenceMembers(occurrence).map((member) => member.treatment_record_id))]
          .sort(),
      ]),
  );
  const actual = new Map(
    input.completenessRows
      .filter((row) => row.selector === "eligible_operational_occurrence")
      .map((row) => [row.occurrence_id, [...new Set(row.treatment_record_ids)].sort()]),
  );
  if (expected.size !== actual.size) {
    throw new Error(
      `Completeness occurrence denominator mismatch: release=${expected.size}, completeness=${actual.size}`,
    );
  }
  for (const [occurrenceId, treatmentIds] of expected) {
    const row = actual.get(occurrenceId);
    if (
      !row ||
      stableJson(row as unknown as JsonValue) !== stableJson(treatmentIds as unknown as JsonValue)
    ) {
      throw new Error(`Completeness treatment membership mismatch for ${occurrenceId}`);
    }
  }
}

function assertImmutableFinalLedger(
  candidate: readonly OccurrenceTreatmentPhysicalityDecision[],
): void {
  if (!existsSync(REVIEW_LEDGER_PATH)) {
    throw new Error(
      "Final post-semantic verification requires the checked-in provisional immutable review ledger",
    );
  }
  const existing = readJsonl<OccurrenceTreatmentPhysicalityDecision>(REVIEW_LEDGER_PATH);
  const expectedContent = jsonl(candidate);
  const existingContent = jsonl(existing);
  if (existingContent !== expectedContent) {
    const existingById = new Map(existing.map((row) => [row.treatment_record_id, row]));
    const candidateById = new Map(candidate.map((row) => [row.treatment_record_id, row]));
    const drift = [...new Set([...existingById.keys(), ...candidateById.keys()])]
      .filter((id) =>
        stableJson(existingById.get(id) as unknown as JsonValue) !==
        stableJson(candidateById.get(id) as unknown as JsonValue))
      .sort();
    throw new Error(
      `Final release changed ${drift.length} immutable treatment review row(s); explicit re-review required: ${
        drift.slice(0, 20).join(", ")
      }`,
    );
  }
}

function compareOrWrite(path: string, content: string, check: boolean): void {
  if (check) {
    if (!existsSync(path)) throw new Error(`Generated artifact is missing: ${path}`);
    const actual = readFileSync(path, "utf8");
    if (actual !== content) throw new Error(`Generated artifact is stale: ${path}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function byFamily(decisions: readonly OccurrenceTreatmentPhysicalityDecision[]) {
  const counts = new Map<string, {
    unique_treatment_count: number;
    occurrence_membership_count: number;
    classifications: Record<string, number>;
  }>();
  for (const decision of decisions) {
    const family = decision.treatment_family ?? "<missing>";
    const group = counts.get(family) ?? {
      unique_treatment_count: 0,
      occurrence_membership_count: 0,
      classifications: {},
    };
    group.unique_treatment_count += 1;
    group.occurrence_membership_count += decision.occurrence_ids.length;
    group.classifications[decision.classification] =
      (group.classifications[decision.classification] ?? 0) + 1;
    counts.set(family, group);
  }
  return Object.fromEntries(
    [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([family, value]) => [
        family,
        {
          ...value,
          classifications: Object.fromEntries(
            Object.entries(value.classifications)
              .sort(([left], [right]) => left.localeCompare(right)),
          ),
        },
      ]),
  );
}

function report(summary: {
  release_id: string;
  review_stage: Stage;
  eligible_occurrence_count: number;
  unique_treatment_count: number;
  treatment_membership_count: number;
  classification_counts: Record<string, number>;
  occurrence_disposition_counts: Record<string, number>;
  finding_counts: Record<string, number>;
  review_ledger_complete: boolean;
  physical_scope_complete: boolean;
  final_post_semantic_release_guard_ready: boolean;
  hard_mode_ready: boolean;
  by_treatment_family: Record<string, unknown>;
}): string {
  const familyLines = Object.entries(summary.by_treatment_family)
    .map(([family, value]) => `- \`${family}\`: ${JSON.stringify(value)}.`)
    .join("\n");
  const findingLines = Object.entries(summary.finding_counts)
    .map(([code, count]) => `- \`${code}\`: ${count}.`)
    .join("\n") || "- None.";
  return `# Eligible occurrence treatment physicality review

- Release snapshot: \`${summary.release_id}\` (\`${summary.review_stage}\`).
- Eligible operational occurrences: ${summary.eligible_occurrence_count}.
- Unique reviewed treatment records: ${summary.unique_treatment_count}.
- Treatment memberships: ${summary.treatment_membership_count}.
- Classification counts: ${JSON.stringify(summary.classification_counts)}.
- Occurrence scope dispositions: ${JSON.stringify(summary.occurrence_disposition_counts)}.
- Immutable review ledger complete: ${summary.review_ledger_complete}.
- Physical-scope role complete: ${summary.physical_scope_complete}.
- Final post-semantic release guard ready: ${summary.final_post_semantic_release_guard_ready}.
- Hard-mode ready: ${summary.hard_mode_ready}.

## Exact family inventory

${familyLines}

## Findings

${findingLines}

## Interpretation

The policy reviews exact treatment family/kind pairs and exact treatment evidence. It does not infer
physicality from a family name, location literal, proximity, or street-name similarity. A
nonphysical decision only makes the physical-scope role not applicable; it is not a waiver and does
not independently make an occurrence study-eligible.

The provisional rc20 snapshot is not an enforcement migration. Final verification must run against
the post-semantic immutable release and its matching completeness bundle. The final run refuses any
change to treatment identity, exact evidence, classification, or eligible occurrence membership
without an explicit reviewed ledger migration.
`;
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  const manifestPath = join(args.releaseDir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Release manifest is missing: ${manifestPath}`);
  const manifestContent = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestContent) as ReleaseManifest;
  if (args.stage === "provisional_rc20") {
    if (manifest.release_id !== "v1-rc20" || sha256(manifestContent) !== RC20_MANIFEST_SHA256) {
      throw new Error("Provisional physicality review must use the exact pinned v1-rc20 release");
    }
  } else if (manifest.release_id === "v1-rc20") {
    throw new Error("Final post-semantic physicality verification cannot reuse v1-rc20");
  }

  const occurrenceContent = assertReleaseFile(
    args.releaseDir,
    manifest,
    "operational_occurrences.jsonl",
  );
  const treatmentContent = assertReleaseFile(
    args.releaseDir,
    manifest,
    "treatment_components.jsonl",
  );
  const relationContent = assertReleaseFile(args.releaseDir, manifest, "relations.jsonl");
  const corridorContent = assertReleaseFile(args.releaseDir, manifest, "corridors.jsonl");
  const occurrences = occurrenceContent.split(/\r?\n/u).flatMap((line) =>
    line.trim() ? [JSON.parse(line) as OccurrenceTreatmentPhysicalityInput] : []);
  const treatments = treatmentContent.split(/\r?\n/u).flatMap((line) =>
    line.trim() ? [JSON.parse(line) as MtaCanonicalRecord] : []);
  const relations = relationContent.split(/\r?\n/u).flatMap((line) =>
    line.trim() ? [JSON.parse(line) as MtaCanonicalRecord] : []);
  const corridors = corridorContent.split(/\r?\n/u).flatMap((line) =>
    line.trim() ? [JSON.parse(line) as MtaCanonicalRecord] : []);

  const completenessManifestPath = join(args.completenessDir, "manifest.json");
  const completenessOccurrencePath = join(
    args.completenessDir,
    "occurrence-completeness.jsonl",
  );
  const completenessManifest = readJson<CompletenessManifest>(completenessManifestPath);
  const completenessRows = readJsonl<CompletenessOccurrenceRow>(completenessOccurrencePath);
  if (completenessManifest.release_id !== manifest.release_id) {
    throw new Error(
      `Completeness release ${completenessManifest.release_id} does not match ${manifest.release_id}`,
    );
  }
  const completenessPin = completenessManifest.files["occurrence-completeness.jsonl"];
  if (
    !completenessPin ||
    completenessPin.sha256 !== fileSha(completenessOccurrencePath) ||
    completenessPin.row_count !== completenessRows.length
  ) {
    throw new Error("Completeness occurrence artifact does not match its manifest pin");
  }
  assertCompletenessReconciliation({ occurrences, completenessRows });

  const review = buildOccurrenceTreatmentPhysicalityReview({ occurrences, treatments });
  if (review.findings.length > 0) {
    throw new Error(
      `Exact treatment review has ${review.findings.length} fail-closed finding(s): ${
        [...new Set(review.findings.map((finding) => finding.code))].sort().join(", ")
      }`,
    );
  }
  if (args.stage === "final_post_semantic_release") {
    assertImmutableFinalLedger(review.decisions);
  }
  const audit = auditOccurrenceTreatmentPhysicality({
    occurrences,
    treatments,
    relations,
    corridors,
    decisions: review.decisions,
  });

  const policyContent = json(OCCURRENCE_TREATMENT_PHYSICALITY_POLICY_V1);
  const reviewLedgerContent = jsonl(review.decisions);
  const policyPath = join(CONTRACT_DIR, "policy.json");
  const contractPath = join(CONTRACT_DIR, "contract.json");
  const releasePins = [
    pin(manifestPath, manifestContent),
    pin(join(args.releaseDir, "operational_occurrences.jsonl"), occurrenceContent),
    pin(join(args.releaseDir, "treatment_components.jsonl"), treatmentContent),
    pin(join(args.releaseDir, "relations.jsonl"), relationContent),
    pin(join(args.releaseDir, "corridors.jsonl"), corridorContent),
  ];
  // Completeness is a mandatory reconciliation input, but it must not be content-addressed by the
  // physicality contract: completeness itself pins this contract. Keeping those pins in the
  // separate quality manifest preserves provenance without creating an unsatisfiable hash cycle.
  const completenessPins = [
    pin(completenessManifestPath),
    pin(completenessOccurrencePath),
  ];
  const finalGuardReady =
    args.stage === "final_post_semantic_release" &&
    audit.findings.length === 0 &&
    audit.summary.review_ledger_complete &&
    audit.summary.physical_scope_complete;
  const contract = {
    schema_version: OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION,
    contract_id: OCCURRENCE_TREATMENT_PHYSICALITY_CONTRACT_ID,
    contract_status: finalGuardReady ? "reviewed_final" : "warning_first",
    reviewed_at: OCCURRENCE_TREATMENT_PHYSICALITY_POLICY_V1.reviewed_at,
    reviewed_by: OCCURRENCE_TREATMENT_PHYSICALITY_POLICY_V1.reviewed_by,
    statement:
      "Every treatment member of every study-projectable operational occurrence has one exact evidence-bound physicality decision. These decisions do not create study eligibility.",
    policy: pin(policyPath, policyContent),
    review_ledger: {
      ...pin(REVIEW_LEDGER_PATH, reviewLedgerContent),
      logical_sha256: stableHash(review.decisions as unknown as JsonValue),
      ledger_id: "occurrence-treatment-physicality-review-v1",
      immutable_after_review: true,
    },
    review_snapshot: {
      stage: args.stage,
      release_id: manifest.release_id,
      release_dir: relative(repoRoot, args.releaseDir),
      input_pins: releasePins,
      eligible_occurrence_count: audit.summary.eligible_occurrence_count,
      unique_treatment_count: audit.summary.unique_treatment_count,
      treatment_membership_count: audit.summary.treatment_membership_count,
      completeness_occurrence_membership_reconciled: true,
      completeness_bundle_content_addressing:
        "quality_manifest_only_to_avoid_contract_completeness_hash_cycle",
    },
    fail_closed_policy: {
      unseen_treatment_record_id: "review_required",
      unseen_treatment_family_or_kind: "review_required",
      missing_or_drifted_exact_evidence: "review_required",
      conflicting_occurrence_membership: "review_required",
      physical_scope_inference_from_family_or_location_literal: "forbidden",
      nonphysical_decision_creates_study_eligibility: false,
      waiver_semantics: "none",
    },
    final_post_semantic_release_guard: {
      required: true,
      status: finalGuardReady ? "verified" : "pending",
      immutable_review_ledger_must_remain_byte_identical: true,
      matching_release_and_completeness_bundle_required: true,
      zero_review_findings_required: true,
      zero_physical_scope_findings_required: true,
      new_release_required: true,
    },
  };
  const contractContent = json(contract);

  const treatmentAuditContent = jsonl(audit.treatmentRows);
  const occurrenceAuditContent = jsonl(audit.occurrenceRows);
  const findingContent = jsonl(audit.findings);
  const summary = {
    ...audit.summary,
    release_id: manifest.release_id,
    review_stage: args.stage,
    release_manifest_sha256: sha256(manifestContent),
    review_ledger_sha256: sha256(reviewLedgerContent),
    policy_sha256: sha256(policyContent),
    contract_sha256: sha256(contractContent),
    by_treatment_family: byFamily(review.decisions),
    final_post_semantic_release_guard_ready: finalGuardReady,
    hard_mode_ready: finalGuardReady && audit.summary.hard_mode_ready,
  };
  const summaryContent = json(summary);
  const reportContent = report(summary);
  const qualityFiles = {
    "findings.jsonl": pin(join(QUALITY_DIR, "findings.jsonl"), findingContent),
    "occurrence-audit.jsonl": pin(
      join(QUALITY_DIR, "occurrence-audit.jsonl"),
      occurrenceAuditContent,
    ),
    "report.md": pin(join(QUALITY_DIR, "report.md"), reportContent),
    "summary.json": pin(join(QUALITY_DIR, "summary.json"), summaryContent),
    "treatment-audit.jsonl": pin(
      join(QUALITY_DIR, "treatment-audit.jsonl"),
      treatmentAuditContent,
    ),
  };
  const qualityManifest = {
    schema_version: OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION,
    contract_id: OCCURRENCE_TREATMENT_PHYSICALITY_CONTRACT_ID,
    release_id: manifest.release_id,
    review_stage: args.stage,
    input_pins: [
      ...releasePins,
      ...completenessPins,
      pin(policyPath, policyContent),
      pin(REVIEW_LEDGER_PATH, reviewLedgerContent),
      pin(contractPath, contractContent),
    ],
    files: qualityFiles,
    audit_fingerprint: stableHash({
      schema_version: OCCURRENCE_TREATMENT_PHYSICALITY_SCHEMA_VERSION,
      release_id: manifest.release_id,
      review_stage: args.stage,
      input_pins: [
        ...releasePins,
        ...completenessPins,
        pin(policyPath, policyContent),
        pin(REVIEW_LEDGER_PATH, reviewLedgerContent),
        pin(contractPath, contractContent),
      ],
      files: qualityFiles,
    } as unknown as JsonValue),
  };

  const outputs = new Map<string, string>([
    [policyPath, policyContent],
    [REVIEW_LEDGER_PATH, reviewLedgerContent],
    [contractPath, contractContent],
    [join(QUALITY_DIR, "treatment-audit.jsonl"), treatmentAuditContent],
    [join(QUALITY_DIR, "occurrence-audit.jsonl"), occurrenceAuditContent],
    [join(QUALITY_DIR, "findings.jsonl"), findingContent],
    [join(QUALITY_DIR, "summary.json"), summaryContent],
    [join(QUALITY_DIR, "report.md"), reportContent],
    [join(QUALITY_DIR, "manifest.json"), json(qualityManifest)],
  ]);
  for (const [path, content] of outputs) compareOrWrite(path, content, args.check);

  process.stdout.write(
    `${args.check ? "Verified" : "Wrote"} occurrence treatment physicality v1: ` +
    `${audit.summary.eligible_occurrence_count} occurrences, ` +
    `${audit.summary.unique_treatment_count} treatments, ` +
    `${audit.findings.length} scope finding(s), final_guard=${String(finalGuardReady)}\n`,
  );
}

main();
