import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableHash, stableJson } from "../packages/db/src/stable-json";
import type {
  JsonObject,
  JsonValue,
  MtaEvidenceSubmissionRef,
  MtaSubmissionEntry,
  MtaSubmitObservationInput,
} from "../packages/db/src/types";
import {
  createSubmissionEntry,
  readSubmissionEntries,
} from "../packages/pipeline/src/records/submissions";
import {
  readSubmissionRetirements,
  type SubmissionRetirementEntry,
} from "../packages/pipeline/src/records/submission-overrides";

const REVIEW_PATH = join(
  repoRoot,
  "data/quality/relationship-integrity/entity-identity/mta-nyct-target-reviewed-decisions.json",
);
const REVIEW_PATH_RELATIVE = relative(repoRoot, REVIEW_PATH);
const EXPECTED_REVIEW_FILE_SHA256 = "b83f8348937351d0870657d394dec4d41714428c4aa40dcce9de424c39448b6a";
const RUN_ID = "2026-07-16T01-00-00-000Z_mta-nyct-target-identity-remediation";
const REVIEWED_AT = "2026-07-16T01:00:00.000Z";
const SOURCE_DECISION_PREFIX = `${REVIEW_PATH_RELATIVE}#`;
export const MTA_NYCT_IDENTITY_REMEDIATION_JOURNAL_PATH = join(repoRoot, "data/submissions", `${RUN_ID}.jsonl`);
export const MTA_NYCT_IDENTITY_RETIREMENTS_PATH = join(repoRoot, "data/submission-overrides/retired.json");
export const MTA_NYCT_IDENTITY_REMEDIATION_ARTIFACT_PATH = join(
  repoRoot,
  "data/quality/relationship-integrity/entity-identity/mta-nyct-target-remediation.json",
);

type ReplacementEvidence = {
  evidence_id: string;
  source_id: string;
  source_path: string;
  block_id: string;
  page_number: number;
  text_sha256: string;
};

type DownstreamDecision = {
  relation_submission_id: string;
  relation_record_id: string;
  decision: string;
};

type IdentityDecision = {
  submission_id: string;
  source_id: string;
  local_observation_id: string;
  decision: string;
  identity_resolution:
    | "retain_nyct_with_exact_evidence"
    | "retarget_umbrella_mta"
    | "retire_evidence_unsupported_observation";
  reviewed_target_record_id: string | null;
  rationale: string;
  replacement_evidence_refs: ReplacementEvidence[];
  downstream_relation_decisions: DownstreamDecision[];
};

type ReviewArtifact = {
  schema_version: number;
  review_id: string;
  review_status: string;
  summary: JsonObject;
  decisions: IdentityDecision[];
};

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readReview(): ReviewArtifact {
  if (!existsSync(REVIEW_PATH)) throw new Error(`missing ${REVIEW_PATH_RELATIVE}`);
  const actualHash = fileSha256(REVIEW_PATH);
  if (actualHash !== EXPECTED_REVIEW_FILE_SHA256) {
    throw new Error(
      `${REVIEW_PATH_RELATIVE} byte hash drifted: expected ${EXPECTED_REVIEW_FILE_SHA256}, found ${actualHash}`,
    );
  }
  const review = JSON.parse(readFileSync(REVIEW_PATH, "utf8")) as ReviewArtifact;
  if (review.schema_version !== 1 || review.review_status !== "complete" || review.decisions.length !== 61) {
    throw new Error("MTA/NYCT identity review must be complete and contain exactly 61 decisions");
  }
  return review;
}

function replacementEvidence(ref: ReplacementEvidence): MtaEvidenceSubmissionRef {
  return {
    source_id: ref.source_id,
    evidence_id: ref.evidence_id,
    source_path: ref.source_path,
    page_number: ref.page_number,
    block_id: ref.block_id,
    text_sha256: ref.text_sha256,
    text_source: "raw_text",
  };
}

function buildReplacement(
  original: MtaSubmissionEntry,
  decision: IdentityDecision,
): MtaSubmissionEntry | undefined {
  if (decision.identity_resolution === "retire_evidence_unsupported_observation") {
    if (decision.reviewed_target_record_id !== null || decision.replacement_evidence_refs.length !== 0) {
      throw new Error(`unsupported decision ${decision.submission_id} must not carry a replacement`);
    }
    return undefined;
  }
  if (!decision.reviewed_target_record_id || decision.replacement_evidence_refs.length === 0) {
    throw new Error(`replacement decision ${decision.submission_id} lacks target or exact evidence`);
  }
  if (original.validation.state !== "accepted") {
    throw new Error(`identity decision references non-accepted submission ${decision.submission_id}`);
  }
  if (
    original.tool_args.source_id !== decision.source_id
    || original.tool_args.local_observation_id !== decision.local_observation_id
    || original.tool_args.observation_kind !== "entity"
  ) {
    throw new Error(`identity decision ${decision.submission_id} does not match its source observation`);
  }
  const input: MtaSubmitObservationInput = {
    ...original.tool_args,
    target_record_id: decision.reviewed_target_record_id,
    create_new: undefined,
    evidence_refs: decision.replacement_evidence_refs.map(replacementEvidence),
  };
  const replacement = createSubmissionEntry(RUN_ID, input, REVIEWED_AT);
  if (replacement.validation.state !== "accepted") {
    throw new Error(
      `replacement for ${decision.submission_id} rejected: ${replacement.validation.issues.join("; ")}`,
    );
  }
  return replacement;
}

export function buildMtaNyctIdentityRemediation() {
  const review = readReview();
  const allSubmissions = readSubmissionEntries();
  const submissionsById = new Map(allSubmissions.map((entry) => [entry.submission_id, entry]));
  const existingRetirements = readSubmissionRetirements();
  const firstCampaignIndex = existingRetirements.retired.findIndex((entry) =>
    entry.source_decision.startsWith(SOURCE_DECISION_PREFIX));
  const baseRetirements = (
    firstCampaignIndex >= 0
      ? existingRetirements.retired.slice(0, firstCampaignIndex)
      : existingRetirements.retired
  ).filter((entry) => !entry.source_decision.startsWith(SOURCE_DECISION_PREFIX));
  const otherRetirements = existingRetirements.retired
    .filter((entry) => !entry.source_decision.startsWith(SOURCE_DECISION_PREFIX));
  const baseRetiredIds = new Set(otherRetirements.map((entry) => entry.submission_id));

  const replacements: MtaSubmissionEntry[] = [];
  const campaignRetirements: SubmissionRetirementEntry[] = [];
  const remediationRows: JsonObject[] = [];
  const seenDecisionIds = new Set<string>();
  for (const decision of [...review.decisions].sort((left, right) => left.submission_id.localeCompare(right.submission_id))) {
    if (seenDecisionIds.has(decision.submission_id)) throw new Error(`duplicate decision ${decision.submission_id}`);
    seenDecisionIds.add(decision.submission_id);
    const original = submissionsById.get(decision.submission_id);
    if (!original) throw new Error(`missing reviewed submission ${decision.submission_id}`);
    if (baseRetiredIds.has(decision.submission_id)) {
      throw new Error(`reviewed submission was already retired outside this campaign: ${decision.submission_id}`);
    }
    const replacement = buildReplacement(original, decision);
    if (replacement) {
      const collision = submissionsById.get(replacement.submission_id);
      if (collision && collision.run_id !== RUN_ID) {
        throw new Error(`replacement submission id collision ${replacement.submission_id}`);
      }
      replacements.push(replacement);
    }
    const sourceDecision = `${SOURCE_DECISION_PREFIX}${decision.submission_id}`;
    campaignRetirements.push({
      submission_id: decision.submission_id,
      reason: replacement
        ? `Authoritative identity review ${review.review_id} replaces this local entity observation with ${replacement.submission_id}, targeting ${decision.reviewed_target_record_id} and citing exact reviewed identity evidence. ${decision.rationale}`
        : `Authoritative identity review ${review.review_id} retires this evidence-unsupported entity observation without replacement. ${decision.rationale}`,
      source_decision: sourceDecision,
      reviewed_at: REVIEWED_AT,
    });
    remediationRows.push({
      original_submission_id: decision.submission_id,
      source_id: decision.source_id,
      local_observation_id: decision.local_observation_id,
      review_decision: decision.decision,
      identity_resolution: decision.identity_resolution,
      reviewed_target_record_id: decision.reviewed_target_record_id,
      replacement_submission_id: replacement?.submission_id,
      replacement_evidence_ids: decision.replacement_evidence_refs.map((ref) => ref.evidence_id).sort(),
      downstream_relation_decisions: decision.downstream_relation_decisions as unknown as JsonValue,
      source_decision: sourceDecision,
    });
  }

  replacements.sort((left, right) => left.submission_id.localeCompare(right.submission_id));
  const replacementIds = replacements.map((entry) => entry.submission_id);
  if (new Set(replacementIds).size !== replacements.length) throw new Error("duplicate replacement submission IDs");
  if (campaignRetirements.length !== 61 || replacements.length !== 59) {
    throw new Error(`expected 61 retirements and 59 replacements; found ${campaignRetirements.length}/${replacements.length}`);
  }
  // Preserve both the historical prefix and any later campaigns byte-for-byte.
  // Replace this campaign at its existing position when rechecking after a
  // subsequent append-only campaign; append only on the initial application.
  const sortedCampaignRetirements =
    campaignRetirements.sort((left, right) => left.submission_id.localeCompare(right.submission_id));
  const retirements: SubmissionRetirementEntry[] = [];
  let insertedCampaign = false;
  for (const entry of existingRetirements.retired) {
    if (entry.source_decision.startsWith(SOURCE_DECISION_PREFIX)) {
      if (!insertedCampaign) {
        retirements.push(...sortedCampaignRetirements);
        insertedCampaign = true;
      }
      continue;
    }
    retirements.push(entry);
  }
  if (!insertedCampaign) retirements.push(...sortedCampaignRetirements);
  const targetCounts = Object.fromEntries(
    [...new Set(review.decisions.map((decision) => decision.reviewed_target_record_id ?? "retired_without_replacement"))]
      .sort()
      .map((target) => [target, review.decisions.filter((decision) => (decision.reviewed_target_record_id ?? "retired_without_replacement") === target).length]),
  );
  const actionCounts = Object.fromEntries(
    [...new Set(review.decisions.map((decision) => decision.identity_resolution))]
      .sort()
      .map((action) => [action, review.decisions.filter((decision) => decision.identity_resolution === action).length]),
  );
  const allReplacementEvidenceIds = remediationRows
    .flatMap((row) => row.replacement_evidence_ids as string[])
    .sort();
  const allDownstreamRelationSubmissionIds = review.decisions
    .flatMap((decision) => decision.downstream_relation_decisions.map((entry) => entry.relation_submission_id))
    .sort();
  const artifact = {
    schema_version: 1,
    remediation_id: "mta-nyct-target-identity-remediation-v1",
    review_id: review.review_id,
    status: "applied",
    reviewed_at: REVIEWED_AT,
    reviewed_by: "Codex canonical relationship-integrity campaign",
    pinned_inputs: {
      review_path: REVIEW_PATH_RELATIVE,
      review_file_sha256: EXPECTED_REVIEW_FILE_SHA256,
      review_logical_sha256: stableHash(review as unknown as JsonObject),
      base_retirement_count: baseRetirements.length,
      base_retirements_logical_sha256: stableHash(baseRetirements as unknown as JsonValue),
    },
    outputs: {
      journal_path: relative(repoRoot, MTA_NYCT_IDENTITY_REMEDIATION_JOURNAL_PATH),
      retirement_path: relative(repoRoot, MTA_NYCT_IDENTITY_RETIREMENTS_PATH),
    },
    summary: {
      reviewed_decision_count: review.decisions.length,
      retired_original_submission_count: campaignRetirements.length,
      replacement_submission_count: replacements.length,
      target_counts: targetCounts,
      action_counts: actionCounts,
      replacement_submission_ids_sha256: stableHash(replacementIds),
      retired_original_submission_ids_sha256: stableHash(
        campaignRetirements.map((entry) => entry.submission_id).sort(),
      ),
      replacement_evidence_id_count: new Set(allReplacementEvidenceIds).size,
      replacement_evidence_ids_sha256: stableHash([...new Set(allReplacementEvidenceIds)].sort()),
      downstream_relation_submission_count: new Set(allDownstreamRelationSubmissionIds).size,
      downstream_relation_submission_ids_sha256: stableHash(
        [...new Set(allDownstreamRelationSubmissionIds)].sort(),
      ),
      unreviewed_count: 0,
    },
    decisions: remediationRows,
    reproduction_commands: [
      "bun scripts/review-mta-nyct-target-identity.ts --check",
      "bun scripts/remediate-mta-nyct-target-identity.ts --check",
      "bun test packages/pipeline/test/quality/mta-nyct-target-reviewed-decisions.test.ts packages/pipeline/test/quality/mta-nyct-target-remediation.test.ts",
    ],
  };
  const journalContent = replacements.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  // Keep the two historical escaped check marks byte-stable while serializing
  // the appended campaign rows.
  const retirementContent = `${JSON.stringify({ version: 1, retired: retirements }, null, 2)}\n`;
  const artifactContent = `${JSON.stringify(artifact, null, 2)}\n`;
  return { journalContent, retirementContent, artifactContent, artifact };
}

function assertExact(path: string, expected: string): void {
  if (!existsSync(path)) throw new Error(`missing generated output ${relative(repoRoot, path)}`);
  const actual = readFileSync(path, "utf8");
  if (actual !== expected) throw new Error(`generated output drifted: ${relative(repoRoot, path)}`);
}

function main(): void {
  const check = process.argv.includes("--check");
  const campaign = buildMtaNyctIdentityRemediation();
  if (check) {
    assertExact(MTA_NYCT_IDENTITY_REMEDIATION_JOURNAL_PATH, campaign.journalContent);
    assertExact(MTA_NYCT_IDENTITY_RETIREMENTS_PATH, campaign.retirementContent);
    assertExact(MTA_NYCT_IDENTITY_REMEDIATION_ARTIFACT_PATH, campaign.artifactContent);
  } else {
    for (const path of [MTA_NYCT_IDENTITY_REMEDIATION_JOURNAL_PATH, MTA_NYCT_IDENTITY_RETIREMENTS_PATH, MTA_NYCT_IDENTITY_REMEDIATION_ARTIFACT_PATH]) mkdirSync(dirname(path), { recursive: true });
    writeFileSync(MTA_NYCT_IDENTITY_REMEDIATION_JOURNAL_PATH, campaign.journalContent);
    writeFileSync(MTA_NYCT_IDENTITY_RETIREMENTS_PATH, campaign.retirementContent);
    writeFileSync(MTA_NYCT_IDENTITY_REMEDIATION_ARTIFACT_PATH, campaign.artifactContent);
  }
  process.stdout.write(`${stableJson({
    mode: check ? "check" : "write",
    artifact: relative(repoRoot, MTA_NYCT_IDENTITY_REMEDIATION_ARTIFACT_PATH),
    artifact_sha256: createHash("sha256").update(campaign.artifactContent).digest("hex"),
    summary: campaign.artifact.summary,
  } as unknown as JsonValue)}\n`);
}

if (import.meta.main) main();
