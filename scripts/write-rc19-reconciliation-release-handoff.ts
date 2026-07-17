import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { stableJson } from "../packages/db/src/stable-json.js";
import type { JsonValue } from "../packages/db/src/types.js";
import { RC19_RECONCILIATION_PINS } from "../packages/pipeline/src/quality/rc19-reject-reconciliation.js";

const EXPECTED_LATEST = "v1-rc5";
const EXPECTED_RC20_RELEASE_ID = "v1-rc20";

type JsonObject = Record<string, unknown>;

export type Rc19ReconciliationReleaseHandoffOptions = {
  rc19ManifestPath: string;
  rc20ManifestPath: string;
  latestPath: string;
  expectedRc20GeneratorCommit: string;
  outputPath: string;
};

export type Rc19ReconciliationReleaseHandoffExpectations = {
  rc19ManifestSha256: string;
  rc19GeneratorCommit: string;
  rc20ReleaseId: string;
  latest: string;
};

const DEFAULT_EXPECTATIONS: Rc19ReconciliationReleaseHandoffExpectations = {
  rc19ManifestSha256: RC19_RECONCILIATION_PINS.rc19_manifest_sha256,
  rc19GeneratorCommit: RC19_RECONCILIATION_PINS.rc19_generator_commit,
  rc20ReleaseId: EXPECTED_RC20_RELEASE_ID,
  latest: EXPECTED_LATEST,
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, label: string): JsonObject {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

function string(value: unknown, label: string): string {
  assert(typeof value === "string", `${label} must be a string`);
  return value;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readManifest(path: string, label: string): { bytes: Buffer; manifest: JsonObject; sha256: string } {
  const bytes = readFileSync(path);
  return {
    bytes,
    manifest: object(JSON.parse(bytes.toString("utf8")), label),
    sha256: sha256(bytes),
  };
}

function manifestFileSha(manifest: JsonObject, file: string, label: string): string {
  const files = object(manifest.files, `${label}.files`);
  return string(object(files[file], `${label}.files.${file}`).sha256, `${label}.files.${file}.sha256`);
}

export function writeRc19ReconciliationReleaseHandoff(
  options: Rc19ReconciliationReleaseHandoffOptions,
  expectations: Rc19ReconciliationReleaseHandoffExpectations = DEFAULT_EXPECTATIONS,
): { outputPath: string; outputSha256: string; rc20ManifestSha256: string } {
  assert(/^[0-9a-f]{40}$/u.test(options.expectedRc20GeneratorCommit), "Expected rc20 generator commit must be a full lowercase 40-character Git SHA");
  assert(basename(dirname(options.rc19ManifestPath)) === "v1-rc19", "rc19 manifest path must be under a v1-rc19 directory");
  assert(basename(dirname(options.rc20ManifestPath)) === expectations.rc20ReleaseId, `rc20 manifest path must be under a ${expectations.rc20ReleaseId} directory`);

  const rc19 = readManifest(options.rc19ManifestPath, "rc19 manifest");
  assert(rc19.sha256 === expectations.rc19ManifestSha256, `rc19 manifest SHA-256 mismatch: expected ${expectations.rc19ManifestSha256}, got ${rc19.sha256}`);
  assert(rc19.manifest.release_id === "v1-rc19", "Pinned before manifest is not v1-rc19");
  assert(rc19.manifest.generator_commit === expectations.rc19GeneratorCommit, "Pinned rc19 generator commit changed");

  const rc20 = readManifest(options.rc20ManifestPath, "rc20 manifest");
  assert(rc20.manifest.release_id === expectations.rc20ReleaseId, `After manifest is not ${expectations.rc20ReleaseId}`);
  assert(rc20.manifest.generator_commit === options.expectedRc20GeneratorCommit, `rc20 generator commit mismatch: expected ${options.expectedRc20GeneratorCommit}, got ${String(rc20.manifest.generator_commit)}`);
  assert(rc20.sha256 !== rc19.sha256, "rc20 manifest unexpectedly has the same content hash as rc19");

  const latestRaw = readFileSync(options.latestPath, "utf8");
  const latest = latestRaw.trim();
  assert(latest === expectations.latest, `LATEST changed: expected ${expectations.latest}, got ${latest || "<empty>"}`);

  const handoff = {
    schema_version: 1,
    artifact_kind: "mta_wiki_rc19_reject_reconciliation_release_handoff",
    authorization: "non_authorizing_operator_handoff_only",
    pinned_tracker_inputs: {
      tracker_audit_commit: RC19_RECONCILIATION_PINS.tracker_audit_commit,
      candidate_set_id: RC19_RECONCILIATION_PINS.candidate_set_id,
      candidate_set_sha256: RC19_RECONCILIATION_PINS.candidate_set_sha256,
      reconciliation_sha256: RC19_RECONCILIATION_PINS.reconciliation_sha256,
    },
    before_release: {
      release_id: "v1-rc19",
      manifest_sha256: rc19.sha256,
      generator_commit: expectations.rc19GeneratorCommit,
      operational_occurrences_sha256: manifestFileSha(rc19.manifest, "operational_occurrences.jsonl", "rc19 manifest"),
      immutable_and_unchanged: true,
    },
    after_release: {
      release_id: expectations.rc20ReleaseId,
      manifest_sha256: rc20.sha256,
      generator_commit: options.expectedRc20GeneratorCommit,
      operational_occurrences_sha256: manifestFileSha(rc20.manifest, "operational_occurrences.jsonl", "rc20 manifest"),
      immutable_candidate_created: true,
    },
    release_boundary: {
      latest_observed: latest,
      latest_expected: expectations.latest,
      latest_mutated: false,
      promoted: false,
      deployed: false,
      pushed: false,
      published: false,
    },
    source_changes: {
      scope_repaired_candidate_count: 2,
      fully_source_fixed_candidate_count: 0,
      standard_occurrence_projection_change_count: 0,
      candidate_ids: [
        "study-event-v2:06559cef3f03e1672b7dd685",
        "study-event-v2:8759b24539a59fc715b1dff3",
      ],
      repaired_dimensions: ["authoritative_source_snapshot", "exact_route_binding", "exact_treatment_binding", "bounded_treatment_segment", "exact_completion_phase_date"],
      completion_phase_date: "2023-10-31",
      first_operational_onset: null,
      unresolved_dimensions: ["phase_preserving_standard_occurrence_projection_contract", "exact_treated_lane_overlap_outcome_spine", "candidate_set_bound_human_approval"],
    },
    remaining_exclusive_primary_dispositions: {
      mta_route_or_treatment_scope_binding_gap: 321,
      mta_date_phase_occurrence_identity_gap: 2,
      tracker_exact_lane_overlap_spine_gap: 2,
      intentionally_invalid_or_duplicate_phase: 20,
      overlap_confounder_causal_design_rejection: 8,
      tracker_route_pattern_grouping_gap: 112,
      outcome_window_time_bound_gap: 8,
    },
    anticipated_tracker_effect: {
      status: "inference_pending_pinned_tracker_replay",
      expected_reject_recommendation_change: 0,
      reason: "Scope and the completion-phase date are authoritative, but the producer cannot preserve completion versus first-operation semantics and no exact treated-lane overlap outcome spine exists. A pinned Tracker replay and candidate-set-bound human approval remain required.",
    },
    operator_boundary: "Do not consume LATEST. Pin the rc20 manifest hash explicitly, use a temporary Tracker output root, preserve all Tracker artifacts and publication state, and require human approval for any candidate reconsideration.",
  };
  const output = `${stableJson(handoff as unknown as JsonValue)}\n`;
  if (existsSync(options.outputPath)) {
    const existing = readFileSync(options.outputPath, "utf8");
    assert(existing === output, `${options.outputPath} already exists with different content`);
  } else {
    writeFileSync(options.outputPath, output, { encoding: "utf8", flag: "wx" });
  }
  return { outputPath: options.outputPath, outputSha256: sha256(output), rc20ManifestSha256: rc20.sha256 };
}

const optionNames = {
  "--rc19-manifest": "rc19ManifestPath",
  "--rc20-manifest": "rc20ManifestPath",
  "--latest": "latestPath",
  "--expected-rc20-generator-commit": "expectedRc20GeneratorCommit",
  "--output": "outputPath",
} as const;

function usage(): never {
  throw new Error([
    "Usage: bun scripts/write-rc19-reconciliation-release-handoff.ts \\",
    "  --rc19-manifest data/exports/releases/v1-rc19/manifest.json \\",
    "  --rc20-manifest data/exports/releases/v1-rc20/manifest.json \\",
    "  --latest data/exports/releases/LATEST \\",
    "  --expected-rc20-generator-commit <full-40-character-sha> \\",
    "  --output data/quality/rc19-reject-reconciliation/release-handoff.json",
    "",
    "The command fails closed unless rc19 is unchanged, rc20 has the exact id and generator commit, and LATEST remains v1-rc5.",
  ].join("\n"));
}

function parseArgs(args: readonly string[]): Rc19ReconciliationReleaseHandoffOptions {
  if (args.includes("--help") || args.includes("-h") || args.length !== Object.keys(optionNames).length * 2) usage();
  const parsed: Partial<Rc19ReconciliationReleaseHandoffOptions> = {};
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!option || !value || !(option in optionNames)) usage();
    const key = optionNames[option as keyof typeof optionNames];
    assert(parsed[key] === undefined, `Duplicate option ${option}`);
    parsed[key] = key === "expectedRc20GeneratorCommit" ? value : resolve(value);
  }
  assert(parsed.rc19ManifestPath && parsed.rc20ManifestPath && parsed.latestPath && parsed.expectedRc20GeneratorCommit && parsed.outputPath, "All options are required");
  return parsed as Rc19ReconciliationReleaseHandoffOptions;
}

if (import.meta.main) {
  const result = writeRc19ReconciliationReleaseHandoff(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
