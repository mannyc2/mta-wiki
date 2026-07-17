import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type {
  JsonValue,
  MtaCanonicalRecord,
  MtaEvidenceSubmissionRef,
  MtaSubmissionEntry,
  MtaSubmitObservationInput,
  StagedSourceBlock,
} from "../packages/db/src/types";
import { entriesToRecords } from "../packages/pipeline/src/materialize/materialize";
import type {
  RelationshipReferenceAuditRow,
  RelationshipReferenceProposedRemediation,
} from "../packages/pipeline/src/quality/relationship-reference-audit";
import {
  readSemanticCorrections,
  readSemanticCorrectionSupersessions,
} from "../packages/pipeline/src/records/semantic-corrections";
import { retiredSubmissionIds } from "../packages/pipeline/src/records/submission-overrides";
import {
  createSubmissionEntry,
  readSubmissionEntries,
} from "../packages/pipeline/src/records/submissions";
import {
  readStagedSourceBlocks,
  sourceBlockById,
  sourceBlocksRelativePath,
} from "../packages/pipeline/src/sources/source-prep";

export const PAYLOAD_REFERENCE_REMEDIATION_RUN_ID =
  "2026-07-16T04-00-00-000Z_relationship-payload-reference-remediation-v1";
export const PAYLOAD_REFERENCE_REMEDIATION_SUBMITTED_AT = "2026-07-16T04:00:00.000Z";
export const PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_PATH = join(
  repoRoot,
  "data/submissions",
  `${PAYLOAD_REFERENCE_REMEDIATION_RUN_ID}.jsonl`,
);
export const PAYLOAD_REFERENCE_REMEDIATION_LEDGER_PATH = join(
  repoRoot,
  "data/quality/relationship-integrity/payload-references/remediation-ledger.jsonl",
);
export const PAYLOAD_REFERENCE_REMEDIATION_SUMMARY_PATH = join(
  repoRoot,
  "data/quality/relationship-integrity/payload-references/remediation-summary.json",
);
export const PAYLOAD_REFERENCE_ACCEPTED_PROPOSALS_PATH = join(
  repoRoot,
  "data/contracts/relationship-references/v1/accepted-remediation-proposals.jsonl",
);

const CURRENT_PROPOSALS_PATH = join(
  repoRoot,
  "data/quality/relationship-integrity/payload-references/proposed-remediations.jsonl",
);
const AUDIT_PATH = join(
  repoRoot,
  "data/quality/relationship-integrity/payload-references/reference-audit.jsonl",
);
const CONTRACT_ID = "relationship-reference-contract-v1" as const;
const EXPECTED_PROPOSAL_COUNT = 81;

export type PayloadReferenceRemediationLedgerRow = {
  schema_version: 1;
  contract_id: typeof CONTRACT_ID;
  remediation_id: string;
  proposal_id: string;
  relationship_reference_decision_ids: string[];
  submission_id: string;
  relation_record_id: string;
  rule_id: string;
  field: string;
  source_literal: string;
  origin_record_id: string;
  relation_kind: string;
  subject_id: string;
  object_id: string;
  evidence_ids: string[];
  evidence_bindings_sha256: string;
  journal_path: string;
  status: "materialized";
};

type GeneratedArtifact = { path: string; content: string };

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function repoPath(path: string): string {
  return relative(repoRoot, path).split("\\").join("/");
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8").split(/\r?\n/u).flatMap((line) =>
    line.trim() ? [JSON.parse(line) as T] : []
  );
}

function jsonl(values: readonly JsonValue[]): string {
  return values.length > 0 ? `${values.map((value) => stableJson(value)).join("\n")}\n` : "";
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function evidenceId(ref: MtaEvidenceSubmissionRef): string {
  if (ref.evidence_id?.trim()) return ref.evidence_id.trim();
  if (ref.source_id && ref.block_id) return `${ref.source_id}#${ref.block_id}`;
  throw new Error("relationship-reference remediation evidence lacks an exact evidence id");
}

function evidenceFromBlock(
  sourceId: string,
  block: StagedSourceBlock,
  role: string,
): MtaEvidenceSubmissionRef {
  return {
    source_id: sourceId,
    evidence_id: `${sourceId}#${block.block_id}`,
    source_path: sourceBlocksRelativePath(sourceId),
    page_number: block.page_number,
    block_id: block.block_id,
    text_sha256: block.raw_text_sha256,
    text_source: "raw_text",
    role,
  };
}

function exactOriginEvidence(
  proposal: RelationshipReferenceProposedRemediation,
  predicate: (text: string) => boolean,
  role: string,
): MtaEvidenceSubmissionRef[] {
  return proposal.origin_evidence_refs.flatMap((ref) => {
    if (!ref.source_id || !ref.block_id) return [];
    const block = sourceBlockById(ref.source_id, ref.block_id);
    return predicate(block.raw_text ?? "") ? [evidenceFromBlock(ref.source_id, block, role)] : [];
  });
}

function targetIdentityPattern(targetRecordId: string): RegExp {
  if (targetRecordId === "entity_nyc-dot") {
    return /NEW\s+YORK\s+CITY\s+(?:NYC\s+)?DOT|NYC\s*DOT|NYCDOT|New York City Department of Transportation|Department of Transportation\s*\(DOT\)/iu;
  }
  if (targetRecordId === "entity_meeting-doc-124881-mnr") {
    return /Metro[- ]North Railroad|MTA\s+MNR|\bMNR(?:'s|\b)/iu;
  }
  if (targetRecordId === "entity_first-mutual-transportation-assurance") {
    return /First Mutual Transportation Assurance|\bFMTAC\b/iu;
  }
  if (targetRecordId === "entity_mta-bridges-and-tunnels") {
    return /Triborough Bridge and Tunnel Authority|MTA Bridges and Tunnels|\bTBTA\b/iu;
  }
  if (targetRecordId === "entity_meeting-doc-163216-metlife") {
    return /Metropolitan Life Insurance Company|\bMetLife\b/iu;
  }
  throw new Error(`no evidence selector exists for reviewed target ${targetRecordId}`);
}

function firstSourceIdentityEvidence(sourceId: string, targetRecordId: string): MtaEvidenceSubmissionRef {
  const pattern = targetIdentityPattern(targetRecordId);
  const block = readStagedSourceBlocks(sourceId).find((candidate) => pattern.test(candidate.raw_text ?? ""));
  if (!block) {
    throw new Error(`source ${sourceId} has no exact identity block for ${targetRecordId}`);
  }
  return evidenceFromBlock(sourceId, block, "establishes_relationship_endpoint");
}

function selectedEvidence(
  proposal: RelationshipReferenceProposedRemediation,
): MtaEvidenceSubmissionRef[] {
  const sourceIds = sortedUnique(proposal.origin_evidence_refs.map((ref) => ref.source_id));
  if (sourceIds.length === 0) throw new Error(`${proposal.proposal_id} has no source evidence`);
  let selected: MtaEvidenceSubmissionRef[];

  if (proposal.rule_id === "source-publisher") {
    if (sourceIds.length !== 1) throw new Error(`${proposal.proposal_id} source publisher spans multiple sources`);
    selected = [firstSourceIdentityEvidence(sourceIds[0]!, proposal.target_record_id)];
  } else if (proposal.rule_id === "metric-source-system-has-metric") {
    selected = proposal.origin_evidence_refs.map((ref) => {
      if (!ref.source_id || !ref.block_id) throw new Error(`${proposal.proposal_id} has non-atomic metric evidence`);
      return evidenceFromBlock(ref.source_id, sourceBlockById(ref.source_id, ref.block_id), "metric_claim");
    });
    if (proposal.target_record_id === "entity_meeting-doc-124881-mnr") {
      selected.push(evidenceFromBlock(
        "meeting_doc_138246",
        sourceBlockById("meeting_doc_138246", "p002_c0003"),
        "establishes_relationship_endpoint",
      ));
    }
  } else if (proposal.rule_id === "project-owner") {
    selected = exactOriginEvidence(
      proposal,
      (text) => targetIdentityPattern(proposal.target_record_id).test(text) && /Harmon|maintenance facility|rolling stock/iu.test(text),
      "establishes_owner_scope",
    ).slice(0, 1);
  } else if (proposal.rule_id === "entity-organization") {
    selected = exactOriginEvidence(
      proposal,
      (text) => /Queens Borough Commissioner'?s Office|DOT Queens Borough/iu.test(text),
      "establishes_child_organization",
    ).slice(0, 1);
    const sourceId = selected[0]?.source_id ?? sourceIds[0]!;
    selected.push(firstSourceIdentityEvidence(sourceId, proposal.target_record_id));
  } else {
    throw new Error(`${proposal.proposal_id} has unsupported remediation rule ${proposal.rule_id}`);
  }

  const deduped = [
    ...new Map(selected.map((ref) => [evidenceId(ref), ref])).values(),
  ].sort((left, right) => evidenceId(left).localeCompare(evidenceId(right)));
  if (deduped.length === 0) throw new Error(`${proposal.proposal_id} has no claim-specific evidence`);
  const selectedSourceIds = sortedUnique(deduped.map((ref) => ref.source_id));
  if (selectedSourceIds.length !== 1) {
    throw new Error(`${proposal.proposal_id} selected evidence spans multiple submission sources`);
  }
  return deduped;
}

function buildInput(
  proposal: RelationshipReferenceProposedRemediation,
  row: RelationshipReferenceAuditRow,
): MtaSubmitObservationInput {
  if (!row.value) throw new Error(`${proposal.proposal_id} has no preserved source literal`);
  const evidenceRefs = selectedEvidence(proposal);
  const decisionIds = sortedUnique(row.review_decision_id ? [row.review_decision_id] : [proposal.proposal_id]);
  const suffix = proposal.proposal_id.split(":").at(-1);
  if (!suffix) throw new Error(`${proposal.proposal_id} has no stable suffix`);
  return {
    source_id: evidenceRefs[0]!.source_id,
    observation_kind: "relation",
    local_observation_id: `relation_payload_reference_remediation_${suffix}`,
    create_new: true,
    label: `${proposal.subject_id} ${proposal.relation_kind} ${proposal.object_id}`,
    raw_text: row.value,
    payload: {
      relation_kind: proposal.relation_kind,
      subject_id: proposal.subject_id,
      object_id: proposal.object_id,
      description: `The source-stated ${row.field} literal ${JSON.stringify(row.value)} supports this canonical ${proposal.relation_kind} relationship.`,
      extra_fields: {
        relationship_reference_contract_id: CONTRACT_ID,
        relationship_reference_proposal_id: proposal.proposal_id,
        relationship_reference_review_decision_ids: decisionIds,
        relationship_reference_rule_id: proposal.rule_id,
        relationship_reference_payload_field: row.field,
        relationship_reference_origin_record_id: row.origin_record_id,
        relationship_reference_source_literal: row.value,
      },
    },
    evidence_refs: evidenceRefs,
  };
}

function projectedRecordsWith(entries: readonly MtaSubmissionEntry[]): MtaCanonicalRecord[] {
  const existing = readSubmissionEntries().filter((entry) => entry.run_id !== PAYLOAD_REFERENCE_REMEDIATION_RUN_ID);
  return entriesToRecords([...existing, ...entries], {
    retiredSubmissionIds: retiredSubmissionIds(),
  });
}

function canonicalTuple(record: MtaCanonicalRecord): string {
  return [record.payload.relation_kind, record.payload.subject_id, record.payload.object_id].join("\0");
}

export function generatePayloadReferenceRemediationArtifacts(): {
  artifacts: GeneratedArtifact[];
  entries: MtaSubmissionEntry[];
  ledger: PayloadReferenceRemediationLedgerRow[];
} {
  const proposalSourcePath = existsSync(PAYLOAD_REFERENCE_ACCEPTED_PROPOSALS_PATH)
    ? PAYLOAD_REFERENCE_ACCEPTED_PROPOSALS_PATH
    : CURRENT_PROPOSALS_PATH;
  const proposals = readJsonl<RelationshipReferenceProposedRemediation>(proposalSourcePath);
  const auditRows = readJsonl<RelationshipReferenceAuditRow>(AUDIT_PATH);
  if (proposals.length !== EXPECTED_PROPOSAL_COUNT) {
    throw new Error(`expected ${EXPECTED_PROPOSAL_COUNT} reviewed payload-reference proposals, found ${proposals.length}`);
  }
  const rowsById = new Map(auditRows.map((row) => [row.reference_id, row]));
  const tupleKeys = new Set<string>();
  const proposalIds = new Set<string>();
  const entryByProposal = new Map<string, MtaSubmissionEntry>();
  for (const proposal of proposals) {
    if (proposalIds.has(proposal.proposal_id)) throw new Error(`duplicate proposal ${proposal.proposal_id}`);
    proposalIds.add(proposal.proposal_id);
    if (proposal.subject_id === proposal.object_id) throw new Error(`${proposal.proposal_id} is a self-edge`);
    if (proposal.subject_id.includes("q20-qbnr-2025") || proposal.object_id.includes("q20-qbnr-2025")) {
      throw new Error(`${proposal.proposal_id} attempts the reviewed Q20 temporal mismatch`);
    }
    const tuple = [proposal.relation_kind, proposal.subject_id, proposal.object_id].join("\0");
    if (tupleKeys.has(tuple)) throw new Error(`${proposal.proposal_id} duplicates tuple ${tuple}`);
    tupleKeys.add(tuple);
    if (proposal.supporting_reference_ids.length !== 1) {
      throw new Error(`${proposal.proposal_id} must map one exact payload-reference row`);
    }
    const row = rowsById.get(proposal.supporting_reference_ids[0]!);
    if (!row) throw new Error(`${proposal.proposal_id} references a missing audit row`);
    if (row.origin_record_id !== proposal.origin_record_ids[0]) {
      throw new Error(`${proposal.proposal_id} origin does not match its audited reference`);
    }
    const entry = createSubmissionEntry(
      PAYLOAD_REFERENCE_REMEDIATION_RUN_ID,
      buildInput(proposal, row),
      PAYLOAD_REFERENCE_REMEDIATION_SUBMITTED_AT,
    );
    if (entry.validation.state !== "accepted" || entry.validation.issues.length > 0) {
      throw new Error(`${proposal.proposal_id} generated a rejected submission: ${entry.validation.issues.join("; ")}`);
    }
    entryByProposal.set(proposal.proposal_id, entry);
  }
  const entries = [...entryByProposal.values()].sort((left, right) =>
    left.tool_args.local_observation_id.localeCompare(right.tool_args.local_observation_id)
  );
  const projected = projectedRecordsWith(entries);
  const projectedBySubmission = new Map<string, MtaCanonicalRecord>();
  for (const record of projected) {
    for (const submissionId of record.submission_ids) {
      if (entries.some((entry) => entry.submission_id === submissionId)) {
        if (projectedBySubmission.has(submissionId)) {
          throw new Error(`submission ${submissionId} materializes to multiple records`);
        }
        projectedBySubmission.set(submissionId, record);
      }
    }
  }
  const supersededCorrectionIds = new Set(
    readSemanticCorrectionSupersessions().map((entry) => entry.correction_id),
  );
  const activelyCorrectedRecordIds = new Set(
    readSemanticCorrections()
      .filter((correction) => !supersededCorrectionIds.has(correction.correction_id))
      .map((correction) => correction.record_id),
  );
  for (const record of projectedBySubmission.values()) {
    if (activelyCorrectedRecordIds.has(record.record_id)) {
      throw new Error(`generated payload-reference relation ${record.record_id} has an active semantic correction`);
    }
  }
  const ledger = proposals.map((proposal) => {
    const entry = entryByProposal.get(proposal.proposal_id)!;
    const record = projectedBySubmission.get(entry.submission_id);
    if (!record || record.record_kind !== "relation") {
      throw new Error(`${proposal.proposal_id} did not materialize one canonical relation`);
    }
    const proposalTuple = [proposal.relation_kind, proposal.subject_id, proposal.object_id].join("\0");
    if (canonicalTuple(record) !== proposalTuple) {
      throw new Error(`${proposal.proposal_id} materialized the wrong canonical tuple`);
    }
    const extra = entry.tool_args.payload?.extra_fields;
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) {
      throw new Error(`${proposal.proposal_id} lost relationship-reference provenance`);
    }
    const decisionIds = extra.relationship_reference_review_decision_ids;
    if (!Array.isArray(decisionIds) || decisionIds.some((value) => typeof value !== "string")) {
      throw new Error(`${proposal.proposal_id} has invalid decision provenance`);
    }
    const evidenceIds = sortedUnique((entry.tool_args.evidence_refs ?? []).map(evidenceId));
    const originId = proposal.origin_record_ids[0]!;
    const row = rowsById.get(proposal.supporting_reference_ids[0]!)!;
    return {
      schema_version: 1,
      contract_id: CONTRACT_ID,
      remediation_id: `relationship-reference-remediation-v1:${proposal.proposal_id.split(":").at(-1)}`,
      proposal_id: proposal.proposal_id,
      relationship_reference_decision_ids: sortedUnique(decisionIds as string[]),
      submission_id: entry.submission_id,
      relation_record_id: record.record_id,
      rule_id: proposal.rule_id,
      field: proposal.field,
      source_literal: row.value!,
      origin_record_id: originId,
      relation_kind: proposal.relation_kind,
      subject_id: proposal.subject_id,
      object_id: proposal.object_id,
      evidence_ids: evidenceIds,
      evidence_bindings_sha256: sha256(stableJson(evidenceIds as unknown as JsonValue)),
      journal_path: repoPath(PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_PATH),
      status: "materialized",
    } satisfies PayloadReferenceRemediationLedgerRow;
  }).sort((left, right) => left.proposal_id.localeCompare(right.proposal_id));

  const journalContent = jsonl(entries as unknown as JsonValue[]);
  const ledgerContent = jsonl(ledger as unknown as JsonValue[]);
  const acceptedProposalsContent = jsonl(proposals as unknown as JsonValue[]);
  const summary = {
    schema_version: 1,
    contract_id: CONTRACT_ID,
    generated_at: PAYLOAD_REFERENCE_REMEDIATION_SUBMITTED_AT,
    run_id: PAYLOAD_REFERENCE_REMEDIATION_RUN_ID,
    proposal_count: proposals.length,
    accepted_submission_count: entries.length,
    materialized_relation_count: ledger.length,
    unique_tuple_count: new Set(ledger.map((row) => [row.relation_kind, row.subject_id, row.object_id].join("\0"))).size,
    accepted_proposals_path: repoPath(PAYLOAD_REFERENCE_ACCEPTED_PROPOSALS_PATH),
    accepted_proposals_sha256: sha256(acceptedProposalsContent),
    journal_path: repoPath(PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_PATH),
    journal_sha256: sha256(journalContent),
    ledger_path: repoPath(PAYLOAD_REFERENCE_REMEDIATION_LEDGER_PATH),
    ledger_sha256: sha256(ledgerContent),
    evidence_binding_count: ledger.reduce((sum, row) => sum + row.evidence_ids.length, 0),
    by_rule: Object.fromEntries([...new Set(ledger.map((row) => row.rule_id))].sort().map((ruleId) => [
      ruleId,
      ledger.filter((row) => row.rule_id === ruleId).length,
    ])),
    by_target: Object.fromEntries([...new Set(ledger.map((row) => row.object_id))].sort().map((targetId) => [
      targetId,
      ledger.filter((row) => row.object_id === targetId).length,
    ])),
    reproduction_commands: [
      "bun scripts/remediate-relationship-payload-references-v1.ts --check",
      "bun test packages/pipeline/test/quality/relationship-reference-remediation.test.ts",
      "bun scripts/audit-relationship-payload-references-v1.ts --check",
    ],
  };
  return {
    entries,
    ledger,
    artifacts: [
      { path: PAYLOAD_REFERENCE_ACCEPTED_PROPOSALS_PATH, content: acceptedProposalsContent },
      { path: PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_PATH, content: journalContent },
      { path: PAYLOAD_REFERENCE_REMEDIATION_LEDGER_PATH, content: ledgerContent },
      { path: PAYLOAD_REFERENCE_REMEDIATION_SUMMARY_PATH, content: `${JSON.stringify(summary, null, 2)}\n` },
    ],
  };
}

function writeArtifacts(artifacts: readonly GeneratedArtifact[]): void {
  for (const artifact of artifacts) {
    mkdirSync(dirname(artifact.path), { recursive: true });
    writeFileSync(artifact.path, artifact.content, "utf8");
  }
}

function checkArtifacts(artifacts: readonly GeneratedArtifact[]): void {
  const mismatches = artifacts.flatMap((artifact) => {
    if (!existsSync(artifact.path)) return [`${repoPath(artifact.path)} is missing`];
    const actual = readFileSync(artifact.path, "utf8");
    return actual === artifact.content
      ? []
      : [`${repoPath(artifact.path)} expected ${sha256(artifact.content)}, found ${sha256(actual)}`];
  });
  if (mismatches.length > 0) {
    throw new Error(`payload-reference remediation artifacts are stale:\n${mismatches.join("\n")}`);
  }
}

function main(): void {
  const check = process.argv.includes("--check");
  const generated = generatePayloadReferenceRemediationArtifacts();
  if (check) checkArtifacts(generated.artifacts);
  else writeArtifacts(generated.artifacts);
  console.log([
    `accepted submissions: ${generated.entries.length}`,
    `materialized relations: ${generated.ledger.length}`,
    `journal: ${repoPath(PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_PATH)}`,
    `ledger: ${repoPath(PAYLOAD_REFERENCE_REMEDIATION_LEDGER_PATH)}`,
    check ? "artifacts: deterministic" : "artifacts: written",
  ].join("\n"));
}

if (import.meta.main) main();
