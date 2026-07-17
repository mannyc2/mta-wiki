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
  StagedSourceBlock,
} from "../packages/db/src/types";
import { entriesToRecords } from "../packages/pipeline/src/materialize/materialize";
import { createSubmissionEntry } from "../packages/pipeline/src/records/submissions";
import {
  readSubmissionRetirements,
  submissionRetirementsPath,
  type SubmissionRetirementEntry,
} from "../packages/pipeline/src/records/submission-overrides";

const SOURCE_ID = "better_buses_action_plan_2019";
const RUN_ID = "2026-07-16T01-30-00-000Z_staten-island-evidence-reblocking-remediation";
const REVIEWED_AT = "2026-07-16T01:30:00.000Z";
const ORIGINAL_RUN_ID = "2026-07-15T21-00-00-000Z_staten-island-acquisition-linkage-remediation";
const ORIGINAL_JOURNAL_PATH = join(repoRoot, "data", "submissions", `${ORIGINAL_RUN_ID}.jsonl`);
const ORIGINAL_JOURNAL_SHA256 = "9e0ade44c8f28f6684bbe6b57d496730d0ce360a4a84e6d9fc541ef8b0458a4b";
const SOURCE_BLOCKS_PATH = join(repoRoot, "raw", "sources", SOURCE_ID, "blocks.jsonl");
const SOURCE_BLOCKS_SHA256 = "487b4b779b210ed48c836b10a647567cc20f4ea18c95a58abc4334744e262a28";
const SOURCE_PDF_PATH = join(repoRoot, "raw", "sources", SOURCE_ID, "source.pdf");
const SOURCE_PDF_SHA256 = "68ac9e1aaf17a033577688e241e586ac101581ef0e2ba0cc3854196f9323f1c1";
const PRIOR_SOURCE_VERIFICATION_PATH = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
  "shards",
  "staten-island",
  "linkage-remediation",
  "source-verification.json",
);
const PRIOR_SOURCE_VERIFICATION_SHA256 = "f021df74d570b644fb6c6a43529adf79d87db8a24d3bdcd20788eff34c7df272";
const OUTPUT_JOURNAL_PATH = join(repoRoot, "data", "submissions", `${RUN_ID}.jsonl`);
const OUTPUT_ROOT = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
  "shards",
  "staten-island",
  "linkage-remediation",
  "evidence-reblocking",
);
const REMEDIATION_PATH = join(OUTPUT_ROOT, "remediation.json");
const REPORT_PATH = join(OUTPUT_ROOT, "report.md");
const MANIFEST_PATH = join(OUTPUT_ROOT, "manifest.json");
const RETIREMENTS_PATH = submissionRetirementsPath();
const SOURCE_DECISION_PREFIX = `${relative(repoRoot, REMEDIATION_PATH)}#`;

const BLOCK_MAPPING: Readonly<Record<string, string>> = {
  p026_p0001: "p026_c0001",
  p026_p0011: "p026_c0005",
  p026_p0020: "p026_c0005",
  p026_p0021: "p026_c0005",
  p026_p0022: "p026_c0006",
  p028_p0003: "p028_c0001",
  p028_p0037: "p028_c0007",
  p028_p0038: "p028_c0007",
  p028_p0039: "p028_c0007",
  p028_p0040: "p028_c0007",
  p028_p0043: "p028_c0007",
};

type Output = {
  path: string;
  content: string;
};

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function contentSha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function assertPinnedFile(path: string, expectedSha256: string): void {
  if (!existsSync(path)) throw new Error(`missing pinned input ${relative(repoRoot, path)}`);
  const actual = fileSha256(path);
  if (actual !== expectedSha256) {
    throw new Error(
      `${relative(repoRoot, path)} drifted: expected ${expectedSha256}, found ${actual}`,
    );
  }
}

function blockMap(): Map<string, StagedSourceBlock> {
  assertPinnedFile(SOURCE_BLOCKS_PATH, SOURCE_BLOCKS_SHA256);
  const blocks = readJsonl<StagedSourceBlock>(SOURCE_BLOCKS_PATH);
  const byId = new Map(blocks.map((block) => [block.block_id, block]));
  for (const blockId of new Set(Object.values(BLOCK_MAPPING))) {
    const block = byId.get(blockId);
    if (!block || block.source_id !== SOURCE_ID || block.source_surface !== "chandra_ocr") {
      throw new Error(`mapped primary evidence block is missing or wrong-surface: ${blockId}`);
    }
  }
  return byId;
}

function replacementEvidence(
  originalRefs: readonly MtaEvidenceSubmissionRef[],
  blocksById: Map<string, StagedSourceBlock>,
): MtaEvidenceSubmissionRef[] {
  const replacements = new Map<string, MtaEvidenceSubmissionRef>();
  for (const original of originalRefs) {
    if (original.source_id !== SOURCE_ID || !original.block_id) {
      throw new Error(`unexpected non-${SOURCE_ID} evidence in an affected submission`);
    }
    const replacementBlockId = BLOCK_MAPPING[original.block_id];
    if (!replacementBlockId) throw new Error(`unreviewed evidence block mapping ${original.block_id}`);
    const block = blocksById.get(replacementBlockId);
    if (!block) throw new Error(`missing mapped evidence block ${replacementBlockId}`);
    const role = original.role?.trim() || "source_support";
    const key = `${replacementBlockId}\0${role}`;
    replacements.set(key, {
      source_id: SOURCE_ID,
      evidence_id: `${SOURCE_ID}#${replacementBlockId}`,
      source_path: relative(repoRoot, SOURCE_BLOCKS_PATH),
      page_number: block.page_number,
      block_id: replacementBlockId,
      text_sha256: block.raw_text_sha256,
      text_source: "raw_text",
      role,
      source_quote: block.raw_text,
    });
  }
  return [...replacements.values()].sort((left, right) =>
    String(left.block_id).localeCompare(String(right.block_id))
    || String(left.role).localeCompare(String(right.role)));
}

function replacementEntry(
  original: MtaSubmissionEntry,
  blocksById: Map<string, StagedSourceBlock>,
): MtaSubmissionEntry {
  if (original.validation.state !== "accepted") {
    throw new Error(`affected original submission is not accepted: ${original.submission_id}`);
  }
  const input: MtaSubmitObservationInput = {
    ...original.tool_args,
    evidence_refs: replacementEvidence(original.tool_args.evidence_refs ?? [], blocksById),
  };
  const replacement = createSubmissionEntry(RUN_ID, input, REVIEWED_AT);
  if (replacement.validation.state !== "accepted") {
    throw new Error(
      `evidence-reblocked replacement for ${original.submission_id} rejected: ` +
        replacement.validation.issues.join("; "),
    );
  }
  if (replacement.submission_id === original.submission_id) {
    throw new Error(`evidence reblocking did not change submission identity ${original.submission_id}`);
  }
  return replacement;
}

function buildRetirements(
  pairs: ReadonlyArray<{ original: MtaSubmissionEntry; replacement: MtaSubmissionEntry }>,
): { content: string; campaign: SubmissionRetirementEntry[]; baseCount: number } {
  const current = readSubmissionRetirements();
  const firstCampaignIndex = current.retired.findIndex((entry) =>
    entry.source_decision.startsWith(SOURCE_DECISION_PREFIX));
  const base = (
    firstCampaignIndex >= 0 ? current.retired.slice(0, firstCampaignIndex) : current.retired
  ).filter((entry) => !entry.source_decision.startsWith(SOURCE_DECISION_PREFIX));
  const otherRetirements =
    current.retired.filter((entry) => !entry.source_decision.startsWith(SOURCE_DECISION_PREFIX));
  const baseIds = new Set(otherRetirements.map((entry) => entry.submission_id));
  const campaign = pairs
    .map(({ original, replacement }) => {
      if (baseIds.has(original.submission_id)) {
        throw new Error(`affected submission was already retired by another decision: ${original.submission_id}`);
      }
      return {
        submission_id: original.submission_id,
        reason:
          `The staged official PDF bytes are unchanged, but its authoritative source packet was reblocked from the ` +
          `superseded cached-pdf-text block surface to current Chandra primary blocks. Replace this row with ` +
          `${replacement.submission_id}; its claim and canonical identity are unchanged, and its exact evidence ` +
          `now resolves to the current content-addressed block registry.`,
        source_decision: `${SOURCE_DECISION_PREFIX}${original.submission_id}`,
        reviewed_at: REVIEWED_AT,
      };
    })
    .sort((left, right) => left.submission_id.localeCompare(right.submission_id));
  const retired: SubmissionRetirementEntry[] = [];
  let insertedCampaign = false;
  for (const entry of current.retired) {
    if (entry.source_decision.startsWith(SOURCE_DECISION_PREFIX)) {
      if (!insertedCampaign) {
        retired.push(...campaign);
        insertedCampaign = true;
      }
      continue;
    }
    retired.push(entry);
  }
  if (!insertedCampaign) retired.push(...campaign);
  return {
    content: `${JSON.stringify({ version: 1, retired }, null, 2).replaceAll("✓", "\\u2713")}\n`,
    campaign,
    baseCount: base.length,
  };
}

function outputPin(output: Output) {
  return {
    path: relative(repoRoot, output.path),
    bytes: Buffer.byteLength(output.content),
    sha256: contentSha256(output.content),
  };
}

function buildCampaign(): {
  outputs: Output[];
  retirementContent: string;
  summary: JsonObject;
} {
  assertPinnedFile(ORIGINAL_JOURNAL_PATH, ORIGINAL_JOURNAL_SHA256);
  assertPinnedFile(SOURCE_PDF_PATH, SOURCE_PDF_SHA256);
  assertPinnedFile(PRIOR_SOURCE_VERIFICATION_PATH, PRIOR_SOURCE_VERIFICATION_SHA256);
  const blocksById = blockMap();
  const originalEntries = readJsonl<MtaSubmissionEntry>(ORIGINAL_JOURNAL_PATH);
  const affected = originalEntries
    .filter((entry) => (entry.tool_args.evidence_refs ?? []).some((ref) => ref.source_id === SOURCE_ID))
    .sort((left, right) => left.submission_id.localeCompare(right.submission_id));
  if (affected.length !== 20) throw new Error(`expected 20 affected submissions, found ${affected.length}`);
  if (affected.some((entry) =>
    entry.tool_args.evidence_refs?.some((ref) => !ref.block_id || !BLOCK_MAPPING[ref.block_id]))) {
    throw new Error("affected submission set contains an unreviewed legacy block");
  }

  const pairs = affected.map((original) => ({
    original,
    replacement: replacementEntry(original, blocksById),
  }));
  const replacementIds = pairs.map(({ replacement }) => replacement.submission_id);
  if (new Set(replacementIds).size !== pairs.length) throw new Error("replacement submission IDs are not unique");
  const replacements = pairs.map(({ replacement }) => replacement)
    .sort((left, right) => left.submission_id.localeCompare(right.submission_id));
  const unaffected = originalEntries.filter((entry) => !affected.includes(entry));
  const projected = entriesToRecords([...unaffected, ...replacements]);
  if (projected.length !== 27) {
    throw new Error(`reblocked Staten Island journal must project 27 records, found ${projected.length}`);
  }
  const projectedKinds = Object.fromEntries(
    [...new Set(projected.map((record) => record.record_kind))]
      .sort()
      .map((kind) => [kind, projected.filter((record) => record.record_kind === kind).length]),
  );
  if (
    projectedKinds.source !== 1
    || projectedKinds.route !== 12
    || projectedKinds.relation !== 14
  ) {
    throw new Error(`unexpected reblocked projection by kind: ${stableJson(projectedKinds as JsonObject)}`);
  }

  const retirements = buildRetirements(pairs);
  const decisions = pairs.map(({ original, replacement }) => ({
    original_submission_id: original.submission_id,
    replacement_submission_id: replacement.submission_id,
    observation_kind: original.tool_args.observation_kind,
    local_observation_id: original.tool_args.local_observation_id,
    canonical_claim_identity_sha256: stableHash({
      source_id: original.tool_args.source_id,
      observation_kind: original.tool_args.observation_kind,
      local_observation_id: original.tool_args.local_observation_id,
      target_record_id: original.tool_args.target_record_id ?? null,
      create_new: original.tool_args.create_new ?? null,
      label: original.tool_args.label ?? null,
      raw_text: original.tool_args.raw_text ?? null,
      payload: original.tool_args.payload,
    } as unknown as JsonObject),
    old_evidence_ids: (original.tool_args.evidence_refs ?? []).map((ref) => ref.evidence_id).sort(),
    new_evidence_ids: (replacement.tool_args.evidence_refs ?? []).map((ref) => ref.evidence_id).sort(),
    source_decision: `${SOURCE_DECISION_PREFIX}${original.submission_id}`,
  }));
  const summary = {
    affected_submission_count: pairs.length,
    replacement_submission_count: replacements.length,
    retired_original_submission_count: retirements.campaign.length,
    affected_observation_kind_counts: {
      route: affected.filter((entry) => entry.tool_args.observation_kind === "route").length,
      relation: affected.filter((entry) => entry.tool_args.observation_kind === "relation").length,
    },
    legacy_block_id_count: new Set(affected.flatMap((entry) =>
      (entry.tool_args.evidence_refs ?? []).map((ref) => ref.block_id!))).size,
    current_block_id_count: new Set(replacements.flatMap((entry) =>
      (entry.tool_args.evidence_refs ?? []).map((ref) => ref.block_id!))).size,
    projected_record_count: projected.length,
    projected_record_kind_counts: projectedKinds,
    original_submission_ids_sha256: stableHash(affected.map((entry) => entry.submission_id)),
    replacement_submission_ids_sha256: stableHash(replacementIds.sort()),
    projected_record_ids_sha256: stableHash(projected.map((record) => record.record_id).sort()),
    unresolved_reblocked_submission_count: 0,
  } satisfies JsonObject;
  const journalContent = replacements.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  const remediation = {
    schema_version: 1,
    remediation_id: "staten-island-evidence-reblocking-remediation-v1",
    status: "applied",
    reviewed_at: REVIEWED_AT,
    reviewed_by: "Codex canonical relationship-integrity campaign",
    statement:
      "The official source PDF is byte-identical to the acquisition receipt. Only the staged block surface changed. " +
      "The prior accepted rows are retired and replaced append-only with exact current primary-block evidence; no " +
      "route, project, treatment, corridor, date, phase, status, or operational claim was added.",
    pinned_inputs: {
      original_journal_path: relative(repoRoot, ORIGINAL_JOURNAL_PATH),
      original_journal_sha256: ORIGINAL_JOURNAL_SHA256,
      prior_source_verification_path: relative(repoRoot, PRIOR_SOURCE_VERIFICATION_PATH),
      prior_source_verification_sha256: PRIOR_SOURCE_VERIFICATION_SHA256,
      official_source_pdf_path: relative(repoRoot, SOURCE_PDF_PATH),
      official_source_pdf_sha256: SOURCE_PDF_SHA256,
      current_primary_blocks_path: relative(repoRoot, SOURCE_BLOCKS_PATH),
      current_primary_blocks_sha256: SOURCE_BLOCKS_SHA256,
      base_retirement_count: retirements.baseCount,
    },
    block_mapping: Object.entries(BLOCK_MAPPING)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([legacy_block_id, current_block_id]) => ({
        legacy_block_id,
        current_block_id,
        current_text_sha256: blocksById.get(current_block_id)!.raw_text_sha256,
      })),
    summary,
    decisions,
    outputs: {
      replacement_journal_path: relative(repoRoot, OUTPUT_JOURNAL_PATH),
      retirement_override_path: relative(repoRoot, RETIREMENTS_PATH),
    },
    reproduction_commands: [
      "bun scripts/remediate-staten-island-evidence-reblocking.ts --check",
      "bun test packages/pipeline/test/records/staten-island-acquisition-linkage-remediation.test.ts",
    ],
  };
  const remediationContent = `${JSON.stringify(remediation, null, 2)}\n`;
  const reportContent = [
    "# Staten Island acquisition evidence reblocking remediation",
    "",
    `The official \`${SOURCE_ID}\` PDF remains byte-identical at \`${SOURCE_PDF_SHA256}\`.`,
    "",
    "Its staged evidence packet was replaced by a Chandra primary-block packet after the original linkage journal was written. This campaign retires the 20 rows that cited the superseded cached-PDF-text blocks and replaces them append-only with current exact block identities and hashes. Claim payloads and canonical relationship identities are unchanged.",
    "",
    `- Retired/replaced submissions: ${pairs.length}`,
    `- Routes: ${summary.affected_observation_kind_counts.route}`,
    `- Relations: ${summary.affected_observation_kind_counts.relation}`,
    `- Legacy block ids: ${summary.legacy_block_id_count}`,
    `- Current primary block ids: ${summary.current_block_id_count}`,
    `- Reconciled projection: ${summary.projected_record_count} records (1 source, 12 routes, 14 relations)`,
    `- Unresolved reblocking rows: ${summary.unresolved_reblocked_submission_count}`,
    "",
    "No candidate occurrence, segment, phase, onset, or operational-status claim was created by this evidence-only migration.",
    "",
  ].join("\n");
  const initialOutputs: Output[] = [
    { path: OUTPUT_JOURNAL_PATH, content: journalContent },
    { path: REMEDIATION_PATH, content: remediationContent },
    { path: REPORT_PATH, content: reportContent },
  ];
  const manifest = {
    schema_version: 1,
    remediation_id: remediation.remediation_id,
    outputs: initialOutputs.map(outputPin),
    campaign_retirement_entry_count: retirements.campaign.length,
    campaign_retirement_entries_sha256: stableHash(retirements.campaign as unknown as JsonValue),
    manifest_payload_sha256: stableHash({
      remediation_id: remediation.remediation_id,
      outputs: initialOutputs.map(outputPin),
      campaign_retirement_entry_count: retirements.campaign.length,
      campaign_retirement_entries_sha256: stableHash(retirements.campaign as unknown as JsonValue),
    } as unknown as JsonObject),
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  return {
    outputs: [...initialOutputs, { path: MANIFEST_PATH, content: manifestContent }],
    retirementContent: retirements.content,
    summary,
  };
}

function assertExact(path: string, expected: string): void {
  if (!existsSync(path)) throw new Error(`missing generated output ${relative(repoRoot, path)}`);
  const actual = readFileSync(path, "utf8");
  if (actual !== expected) throw new Error(`generated output drifted: ${relative(repoRoot, path)}`);
}

function main(): void {
  const check = process.argv.includes("--check");
  const campaign = buildCampaign();
  if (check) {
    for (const output of campaign.outputs) assertExact(output.path, output.content);
    assertExact(RETIREMENTS_PATH, campaign.retirementContent);
  } else {
    for (const output of campaign.outputs) {
      mkdirSync(dirname(output.path), { recursive: true });
      writeFileSync(output.path, output.content);
    }
    mkdirSync(dirname(RETIREMENTS_PATH), { recursive: true });
    writeFileSync(RETIREMENTS_PATH, campaign.retirementContent);
  }
  process.stdout.write(`${stableJson({
    mode: check ? "check" : "write",
    journal_path: relative(repoRoot, OUTPUT_JOURNAL_PATH),
    journal_sha256: fileSha256(OUTPUT_JOURNAL_PATH),
    artifact_path: relative(repoRoot, REMEDIATION_PATH),
    artifact_sha256: fileSha256(REMEDIATION_PATH),
    summary: campaign.summary,
  } as unknown as JsonValue)}\n`);
}

if (import.meta.main) main();
