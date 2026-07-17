import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { canonicalizeDir } from "@mta-wiki/pipeline/records/canonicalize-shared";
import { readCanonicalizeDecisions, readCanonicalizeVerdicts, type CanonicalizeVerdict } from "@mta-wiki/pipeline/records/canonicalize-shared";
import type { CanonicalizeDecision } from "@mta-wiki/pipeline/records/canonicalize-packets";
import { identityOverrideTarget, isGlobalRecordKind, readIdentityOverrides, type GlobalMtaRecordKind } from "@mta-wiki/db/identity";
import {
  doNotMergePath,
  existingDoNotMergePair,
  mergesPath,
  sortedAliasesWithAdditions,
  sortedDoNotMergeWithAdditions,
  writeJsonFile,
  type AliasAddition,
  type DoNotMergeAddition,
} from "@mta-wiki/pipeline/identity/identity-override-writes";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import { materializeWiki } from "@mta-wiki/pipeline/materialize/materialize";
import { createSubmissionEntry, submissionPath } from "@mta-wiki/pipeline/records/submissions";
import type { JsonObject, MtaCanonicalRecord, MtaSubmissionEntry, MtaSubmitObservationInput } from "@mta-wiki/db/types";

// Auto-apply for reviewer-passed canonicalize decisions. link+pass becomes one
// alias entry in merges.json; relate+pass becomes canonicalizer-authored
// relation submissions in data/submissions/<run_id>_canonicalize.jsonl;
// fail adds a do-not-merge pair; everything else is quarantined for humans.

export type CanonicalizeApplyOptions = {
  dryRun?: boolean | undefined;
  force?: boolean | undefined;
  /** Re-apply a run whose apply-report already records wrote=true (normally skipped for idempotency). */
  reapply?: boolean | undefined;
};

export type CanonicalizeApplyConflict = {
  decision_id: string;
  kind: string;
  reason: string;
};

export type CanonicalizeApplyReport = {
  run_id: string;
  generated_at: string;
  dry_run: boolean;
  wrote: boolean;
  skipped_already_applied?: boolean | undefined;
  decision_count: number;
  reviewed_count: number;
  alias_additions: Array<AliasAddition & { decision_id: string }>;
  aliases_already_present: Array<AliasAddition & { decision_id: string }>;
  do_not_merge_additions: DoNotMergeAddition[];
  relation_submissions: number;
  quarantined: number;
  conflicts: CanonicalizeApplyConflict[];
  paths: {
    merges: string;
    do_not_merge: string;
    relation_submissions_jsonl: string;
    quarantine_jsonl: string;
    apply_report: string;
  };
};

function relativePath(path: string) {
  return relative(repoRoot, path).split("/").join("/");
}

function baseIdCollision(baseRecordId: string, recordsById: Map<string, MtaCanonicalRecord>) {
  // assignRecordIds suffixes `_N` when several identities share a base id; an
  // alias on the bare base id would merge them all. Refuse in that case.
  for (let suffix = 2; suffix <= 9; suffix += 1) {
    if (recordsById.has(`${baseRecordId}_${suffix}`)) return true;
  }
  return false;
}

function relationSubmissionInputs(decision: CanonicalizeDecision, recordsById: Map<string, MtaCanonicalRecord>, existingKeys: Set<string>) {
  const inputs: MtaSubmitObservationInput[] = [];
  for (const [index, relation] of decision.proposed_relations.entries()) {
    const key = `${relation.relation_kind}\0${relation.subject_id}\0${relation.object_id}`;
    if (existingKeys.has(key)) continue;
    const subject = recordsById.get(relation.subject_id);
    const object = recordsById.get(relation.object_id);
    // Both endpoints must resolve to existing canonical records, and the relation must carry the
    // subject/object local_observation_id (validate requires them, exactly like ingest relations).
    // A relation referencing a non-existent endpoint would dangle — skip it rather than emit a
    // broken edge.
    if (!subject || !object) continue;
    existingKeys.add(key);
    inputs.push({
      source_id: decision.source_id,
      observation_kind: "relation",
      local_observation_id: `canon_${decision.decision_id}_${index + 1}`,
      label: `${subject.display_name ?? relation.subject_id} ${relation.relation_kind} ${object.display_name ?? relation.object_id}`,
      payload: {
        relation_kind: relation.relation_kind,
        subject_id: relation.subject_id,
        object_id: relation.object_id,
        subject_local_observation_id: subject.local_observation_id,
        object_local_observation_id: object.local_observation_id,
        ...(relation.description ? { description: relation.description } : {}),
        canonicalizer_authored: true,
        canonicalize_decision_id: decision.decision_id,
      },
      evidence_refs: relation.evidence_refs.map((ref) => ({ source_id: ref.source_id, block_id: ref.block_id, source_quote: ref.source_quote })),
    });
  }
  return inputs;
}

export function applyCanonicalizeDecisions(runId: string, options: CanonicalizeApplyOptions = {}): CanonicalizeApplyReport {
  // Idempotency guard: a run whose apply-report records a real write is skipped so campaign waves
  // can be re-run safely (alias/do-not-merge writes are idempotent, but relation submissions are
  // appended and would duplicate). Pass reapply to override deliberately.
  const priorReportPath = join(canonicalizeDir(runId), "apply-report.json");
  if (!options.reapply && existsSync(priorReportPath)) {
    const prior = JSON.parse(readFileSync(priorReportPath, "utf8")) as CanonicalizeApplyReport;
    if (prior.wrote) {
      return { ...prior, dry_run: options.dryRun || !options.force, wrote: false, skipped_already_applied: true };
    }
  }

  const decisions = readCanonicalizeDecisions(runId);
  const verdicts = new Map<string, CanonicalizeVerdict>(readCanonicalizeVerdicts(runId).map((verdict) => [verdict.decision_id, verdict]));
  const records = readCanonicalRecords();
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const currentAliases = readIdentityOverrides().aliases ?? {};
  const dryRun = options.dryRun || !options.force;

  const aliasAdditions: Array<AliasAddition & { decision_id: string }> = [];
  const aliasesAlreadyPresent: Array<AliasAddition & { decision_id: string }> = [];
  const doNotMergeAdditions: DoNotMergeAddition[] = [];
  const conflicts: CanonicalizeApplyConflict[] = [];
  const quarantine: JsonObject[] = [];
  const relationEntries: MtaSubmissionEntry[] = [];
  const existingRelationKeys = new Set<string>();
  for (const record of records) {
    if (record.record_kind !== "relation") continue;
    const relationKind = record.payload.relation_kind;
    const subjectId = record.payload.subject_id;
    const objectId = record.payload.object_id;
    if (typeof relationKind === "string" && typeof subjectId === "string" && typeof objectId === "string") {
      existingRelationKeys.add(`${relationKind}\0${subjectId}\0${objectId}`);
    }
  }

  const canonicalizeRunId = `${runId}_canonicalize`;
  const decisionPath = relativePath(join(canonicalizeDir(runId), "decisions.jsonl"));

  for (const decision of decisions) {
    const verdict = verdicts.get(decision.decision_id);

    if (decision.decision === "new" || decision.decision === "skip") continue;
    if (decision.decision === "uncertain" || !verdict || verdict.verdict === "unsure") {
      quarantine.push({
        ...(decision as unknown as JsonObject),
        quarantine: {
          blocker: decision.decision === "uncertain" ? "canonicalizer_uncertain" : verdict ? "reviewer_unsure" : "missing_reviewer_verdict",
          note: verdict?.failure_reason,
        },
      });
      continue;
    }

    if (verdict.verdict === "fail") {
      if (decision.decision === "link" && decision.target_record_id && isGlobalRecordKind(decision.kind)) {
        const pair = [decision.base_record_id, decision.target_record_id].sort() as [string, string];
        if (!existingDoNotMergePair(decision.kind, pair[0], pair[1])) {
          doNotMergeAdditions.push({
            kind: decision.kind,
            record_ids: pair,
            reason: verdict.failure_reason ?? "canonicalize reviewer failed this link",
            source_decision: `${decisionPath}#${decision.decision_id}`,
            reviewed_at: new Date().toISOString(),
          });
        }
      } else {
        quarantine.push({ ...(decision as unknown as JsonObject), quarantine: { blocker: "reviewer_failed", note: verdict.failure_reason } });
      }
      continue;
    }

    // verdict === "pass"
    if (decision.decision === "link") {
      if (!isGlobalRecordKind(decision.kind) || !decision.target_record_id) {
        conflicts.push({ decision_id: decision.decision_id, kind: decision.kind, reason: "link decision on a non-global kind or without target" });
        continue;
      }
      const kind: GlobalMtaRecordKind = decision.kind;
      const alias = decision.base_record_id;
      const target = identityOverrideTarget(kind, decision.target_record_id) ?? decision.target_record_id;
      if (alias === target) {
        aliasesAlreadyPresent.push({ kind, alias, target, decision_id: decision.decision_id });
        continue;
      }
      if (baseIdCollision(alias, recordsById)) {
        conflicts.push({
          decision_id: decision.decision_id,
          kind,
          reason: `base record id ${alias} maps to multiple materialized identities; refusing alias`,
        });
        continue;
      }
      const existingTarget = currentAliases[kind]?.[alias];
      if (existingTarget === target || identityOverrideTarget(kind, alias) === target) {
        aliasesAlreadyPresent.push({ kind, alias, target, decision_id: decision.decision_id });
        continue;
      }
      if (existingTarget && existingTarget !== target) {
        conflicts.push({
          decision_id: decision.decision_id,
          kind,
          reason: `alias ${alias} already points to ${existingTarget}, decision proposes ${target}`,
        });
        continue;
      }
      if (aliasAdditions.some((addition) => addition.kind === kind && addition.alias === alias && addition.target !== target)) {
        conflicts.push({ decision_id: decision.decision_id, kind, reason: `conflicting alias targets proposed for ${alias} within this run` });
        continue;
      }
      if (!aliasAdditions.some((addition) => addition.kind === kind && addition.alias === alias)) {
        aliasAdditions.push({ kind, alias, target, decision_id: decision.decision_id });
      }
    }

    for (const input of relationSubmissionInputs(decision, recordsById, existingRelationKeys)) {
      relationEntries.push(createSubmissionEntry(canonicalizeRunId, input));
    }
  }

  const rejectedRelations = relationEntries.filter((entry) => entry.validation.state === "rejected");
  for (const entry of rejectedRelations) {
    quarantine.push({
      submission_id: entry.submission_id,
      local_observation_id: entry.tool_args.local_observation_id,
      quarantine: { blocker: "relation_submission_rejected", note: entry.validation.issues.join("; ") },
    });
  }
  const acceptedRelations = relationEntries.filter((entry) => entry.validation.state === "accepted");

  const quarantinePath = join(canonicalizeDir(runId), "apply-quarantine.jsonl");
  const applyReportPath = join(canonicalizeDir(runId), "apply-report.json");
  const relationSubmissionsPath = submissionPath(canonicalizeRunId);

  let wrote = false;
  if (!dryRun && conflicts.length === 0) {
    writeJsonFile(mergesPath(), sortedAliasesWithAdditions(aliasAdditions));
    writeJsonFile(doNotMergePath(), sortedDoNotMergeWithAdditions(doNotMergeAdditions));
    if (acceptedRelations.length > 0) {
      mkdirSync(dirname(relationSubmissionsPath), { recursive: true });
      appendFileSync(relationSubmissionsPath, `${acceptedRelations.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
    }
    materializeWiki();
    wrote = true;
  }

  mkdirSync(dirname(quarantinePath), { recursive: true });
  writeFileSync(quarantinePath, quarantine.length ? `${quarantine.map((row) => JSON.stringify(row)).join("\n")}\n` : "", "utf8");

  const report: CanonicalizeApplyReport = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    wrote,
    decision_count: decisions.length,
    reviewed_count: verdicts.size,
    alias_additions: aliasAdditions,
    aliases_already_present: aliasesAlreadyPresent,
    do_not_merge_additions: doNotMergeAdditions,
    relation_submissions: acceptedRelations.length,
    quarantined: quarantine.length,
    conflicts,
    paths: {
      merges: relativePath(mergesPath()),
      do_not_merge: relativePath(doNotMergePath()),
      relation_submissions_jsonl: relativePath(relationSubmissionsPath),
      quarantine_jsonl: relativePath(quarantinePath),
      apply_report: relativePath(applyReportPath),
    },
  };
  writeJsonFile(applyReportPath, report);
  return report;
}
