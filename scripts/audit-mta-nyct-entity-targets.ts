import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaSubmissionEntry } from "../packages/db/src/types";
import { retiredSubmissionIds, submissionRetirementsPath } from "../packages/pipeline/src/records/submission-overrides";
import { readSubmissionEntries } from "../packages/pipeline/src/records/submissions";
import { sourceBlockById } from "../packages/pipeline/src/sources/source-prep";

const TARGET_RECORD_ID = "entity_mta-nyct";
const OUTPUT_PATH = join(
  repoRoot,
  "data/quality/relationship-integrity/entity-identity/mta-nyct-target-review-inventory.json",
);

type ReviewBucket = "explicit_nyct_name" | "explicit_umbrella_name" | "mta_only";

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path: string): string {
  return sha256(readFileSync(path));
}

function identifyingText(entry: MtaSubmissionEntry): string {
  const input = entry.tool_args;
  const payload = input.payload ?? {};
  return [
    input.label,
    input.raw_text,
    payload.entity_name,
    payload.name,
    payload.agency_name,
    payload.operator,
    payload.owner,
    payload.publisher,
    payload.acronym,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" \n");
}

function reviewBucket(entry: MtaSubmissionEntry): ReviewBucket {
  const value = identifyingText(entry);
  if (/new york city transit|nyc transit|\bnyct\b/iu.test(value)) return "explicit_nyct_name";
  if (/metropolitan transportation authority/iu.test(value)) return "explicit_umbrella_name";
  return "mta_only";
}

function evidenceText(entry: MtaSubmissionEntry) {
  return entry.tool_args.evidence_refs.map((ref) => {
    const blockId = ref.block_id ?? ref.evidence_id?.split("#", 2)[1];
    if (!blockId) {
      return {
        evidence_id: ref.evidence_id ?? null,
        text_sha256: ref.text_sha256 ?? null,
        retrieval_status: "missing_block_id",
        raw_text: null,
      };
    }
    try {
      const block = sourceBlockById(ref.source_id, blockId);
      return {
        evidence_id: ref.evidence_id ?? `${ref.source_id}#${blockId}`,
        text_sha256: block.raw_text_sha256,
        retrieval_status: "staged_block_retrieved",
        raw_text: block.raw_text,
      };
    } catch {
      return {
        evidence_id: ref.evidence_id ?? `${ref.source_id}#${blockId}`,
        text_sha256: ref.text_sha256 ?? null,
        retrieval_status: "staged_block_unavailable",
        raw_text: null,
      };
    }
  });
}

function activeAcceptedEntries(): MtaSubmissionEntry[] {
  const retired = retiredSubmissionIds();
  return readSubmissionEntries()
    .filter((entry) => entry.validation.state === "accepted" && !retired.has(entry.submission_id))
    .sort((left, right) => left.submission_id.localeCompare(right.submission_id));
}

function activeTargetEntries(entries: MtaSubmissionEntry[]): MtaSubmissionEntry[] {
  return entries.filter((entry) =>
    entry.tool_args.observation_kind === "entity" &&
    entry.tool_args.target_record_id === TARGET_RECORD_ID);
}

function downstreamLocalRelations(entries: MtaSubmissionEntry[], entity: MtaSubmissionEntry) {
  const sourceId = entity.tool_args.source_id;
  const localId = entity.tool_args.local_observation_id;
  return entries
    .filter((entry) => entry.tool_args.observation_kind === "relation" && entry.tool_args.source_id === sourceId)
    .flatMap((entry) => {
      const payload = entry.tool_args.payload ?? {};
      const roles = [
        payload.subject_local_observation_id === localId ? "subject" : undefined,
        payload.object_local_observation_id === localId ? "object" : undefined,
      ].filter((role): role is string => Boolean(role));
      if (roles.length === 0) return [];
      return [{
        submission_id: entry.submission_id,
        local_observation_id: entry.tool_args.local_observation_id,
        relation_kind: payload.relation_kind ?? null,
        relation_family: payload.relation_family ?? null,
        endpoint_roles: roles,
        subject_local_observation_id: payload.subject_local_observation_id ?? null,
        object_local_observation_id: payload.object_local_observation_id ?? null,
        evidence_ids: entry.tool_args.evidence_refs.map((ref) => ref.evidence_id ?? `${ref.source_id}#${ref.block_id ?? ""}`),
      }];
    });
}

export function buildMtaNyctTargetReviewInventory() {
  const acceptedEntries = activeAcceptedEntries();
  const entries = activeTargetEntries(acceptedEntries);
  const buckets = Object.fromEntries(
    (["explicit_nyct_name", "explicit_umbrella_name", "mta_only"] as const).map((bucket) => [
      bucket,
      entries.filter((entry) => reviewBucket(entry) === bucket).length,
    ]),
  );
  const suspicious = entries
    .filter((entry) => reviewBucket(entry) !== "explicit_nyct_name")
    .map((entry) => ({
      submission_id: entry.submission_id,
      source_id: entry.tool_args.source_id,
      local_observation_id: entry.tool_args.local_observation_id,
      current_target_record_id: entry.tool_args.target_record_id,
      lexical_review_bucket: reviewBucket(entry),
      identifying_text: identifyingText(entry),
      label: entry.tool_args.label ?? null,
      raw_text: entry.tool_args.raw_text ?? null,
      payload: entry.tool_args.payload ?? {},
      evidence: evidenceText(entry),
      downstream_local_relations: downstreamLocalRelations(acceptedEntries, entry),
      review_status: "requires_authoritative_evidence_review",
      permitted_decisions: [
        "retain_nyct_target",
        "retarget_umbrella_mta",
        "retire_evidence_unsupported_observation",
      ],
    }));
  const activeIds = entries.map((entry) => entry.submission_id);
  const suspiciousIds = suspicious.map((entry) => entry.submission_id);
  const downstreamRelationIds = [...new Set(suspicious.flatMap((row) =>
    row.downstream_local_relations.map((relation) => relation.submission_id)))].sort();
  const retirementPath = submissionRetirementsPath();
  return {
    schema_version: 1,
    inventory_id: "mta-nyct-target-identity-review-v1",
    generated_at: "2026-07-16T00:00:00.000Z",
    current_target_record_id: TARGET_RECORD_ID,
    statement: "Lexical buckets identify review candidates only. No row is retargeted without exact staged authoritative evidence review.",
    decision_policy: {
      umbrella_target_record_id: "entity_mta-entity-update-2025",
      nyct_target_record_id: TARGET_RECORD_ID,
      mta_only_requires_evidence_review: true,
      unsupported_entity_assertion_must_be_retired: true,
      downstream_local_endpoint_relations_follow_the_reviewed_local_identity: true,
    },
    pinned_inputs: {
      submission_directory: "data/submissions",
      active_target_submission_ids_sha256: sha256(stableJson(activeIds as unknown as JsonValue)),
      retirement_path: relative(repoRoot, retirementPath),
      retirement_sha256: fileSha256(retirementPath),
    },
    counts: {
      active_target_submissions: entries.length,
      ...buckets,
      requires_review: suspicious.length,
      downstream_local_relation_submissions: downstreamRelationIds.length,
    },
    suspicious_submission_ids_sha256: sha256(stableJson(suspiciousIds as unknown as JsonValue)),
    downstream_local_relation_submission_ids_sha256: sha256(stableJson(downstreamRelationIds as unknown as JsonValue)),
    rows: suspicious,
  };
}

if (import.meta.main) {
  const expected = `${JSON.stringify(buildMtaNyctTargetReviewInventory(), null, 2)}\n`;
  if (process.argv.includes("--apply")) {
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, expected, "utf8");
  } else if (!existsSync(OUTPUT_PATH) || readFileSync(OUTPUT_PATH, "utf8") !== expected) {
    throw new Error(`MTA/NYCT target review inventory is stale; run bun ${relative(repoRoot, import.meta.path)} --apply`);
  }
  process.stdout.write(`${JSON.stringify({
    output: relative(repoRoot, OUTPUT_PATH),
    sha256: sha256(expected),
    counts: buildMtaNyctTargetReviewInventory().counts,
    mode: process.argv.includes("--apply") ? "apply" : "check",
  })}\n`);
}
