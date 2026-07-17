import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { canonicalIdentityForInput } from "@mta-wiki/db/identity";
import { stableHash } from "@mta-wiki/db/stable-json";
import type { JsonObject, MtaCanonicalRecord, MtaSubmissionEntry } from "@mta-wiki/db/types";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import { materializeWiki, materializedRecordIdAssignments } from "@mta-wiki/pipeline/materialize/materialize";
import {
  loadOperationalCoverageRouteAnchorPin,
  loadPinnedOperationalCoverageArtifacts,
  sameOperationalCoverageRouteAnchorPin,
  writeOperationalCoverageArtifacts,
  type OperationalCoverageRouteAnchorPin,
} from "@mta-wiki/pipeline/quality/operational-coverage-artifacts";
import {
  buildOperationalRecoverySubmissionBatch,
  operationalRecoveryBlockResolver,
  operationalRecoveryProposalRoot,
  operationalRecoveryRunId,
  readOperationalRecoveryProposalArtifact,
  validateOperationalRecoveryJournal,
  validateOperationalRecoveryProposal,
  type OperationalRecoveryEntryFactory,
  type OperationalRecoveryProposal,
  type OperationalRecoveryProposalArtifact,
  type OperationalRecoveryResolvedBlock,
  type OperationalRecoverySubmissionBatch,
} from "@mta-wiki/pipeline/records/operational-recovery-proposals";

export { buildOperationalRecoverySubmissionBatch } from "@mta-wiki/pipeline/records/operational-recovery-proposals";
export type { OperationalRecoveryEntryFactory } from "@mta-wiki/pipeline/records/operational-recovery-proposals";

export type OperationalRecoveryApplyReport = {
  proposal_id: string;
  proposal_kind: OperationalRecoveryProposal["proposal_kind"];
  proposal_sha256: string;
  accepted_by: string;
  accepted_at: string;
  dry_run: boolean;
  wrote_journal: boolean;
  materialized: boolean;
  coverage_refreshed: boolean;
  moved_to_applied: boolean;
  skipped_already_applied: boolean;
  submission_count: number;
  journal_path: string;
  proposal_path: string;
  applied_proposal_path: string;
};

export type OperationalRecoveryApplyOptions = {
  force?: boolean | undefined;
  rootDir?: string | undefined;
  records?: readonly MtaCanonicalRecord[] | undefined;
  readRecords?: (() => readonly MtaCanonicalRecord[]) | undefined;
  materialize?: (() => unknown) | undefined;
  refreshCoverage?: ((routeAnchorPin?: OperationalCoverageRouteAnchorPin) => unknown) | undefined;
  createEntry?: OperationalRecoveryEntryFactory | undefined;
  resolveBlock?: ((sourceId: string, blockId: string) => OperationalRecoveryResolvedBlock | undefined) | undefined;
  currentCorpusFingerprint?: string | undefined;
  routeAnchorPin?: OperationalCoverageRouteAnchorPin | undefined;
  knownGapIds?: ReadonlySet<string> | undefined;
  recordIdAssignments?: ((entries: MtaSubmissionEntry[], retiredSubmissionIds: Set<string>) => Map<string, string>) | undefined;
};

function appliedProposalPath(rootDir: string, artifact: OperationalRecoveryProposalArtifact): string {
  const kindDir = artifact.proposal.proposal_kind === "relation" ? "relations" : "observations";
  return join(operationalRecoveryProposalRoot(rootDir), "applied", kindDir, `${artifact.proposal.proposal_id}.json`);
}

function relativePath(rootDir: string, path: string): string {
  return relative(rootDir, path).split("/").join("/");
}

function persistedRecoverySubmissionBatch(
  path: string,
  proposal: OperationalRecoveryProposal,
  records: readonly MtaCanonicalRecord[],
  createEntry?: OperationalRecoveryEntryFactory | undefined,
): OperationalRecoverySubmissionBatch {
  const content = readFileSync(path, "utf8");
  return validateOperationalRecoveryJournal(content, path, proposal, records, createEntry);
}

function assertNoJournalIdentityConflicts(
  rootDir: string,
  expectedJournalPath: string,
  proposalId: string,
  entries: readonly MtaSubmissionEntry[],
): void {
  const dir = join(rootDir, "data", "submissions");
  if (!existsSync(dir)) return;
  const expectedSubmissionIds = new Set(entries.map((entry) => entry.submission_id));
  for (const fileName of readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort()) {
    const path = join(dir, fileName);
    if (path === expectedJournalPath) continue;
    for (const [index, line] of readFileSync(path, "utf8").split(/\r?\n/u).entries()) {
      if (!line.trim()) continue;
      let entry: MtaSubmissionEntry;
      try {
        entry = JSON.parse(line) as MtaSubmissionEntry;
      } catch (error) {
        throw new Error(`${path}:${index + 1}: invalid submission JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (entry.recovery_provenance?.proposal_id === proposalId) {
        throw new Error(`Recovery proposal ${proposalId} is already bound to a different journal: ${path}`);
      }
      if (expectedSubmissionIds.has(entry.submission_id)) {
        throw new Error(`Recovery proposal ${proposalId} would duplicate submission ${entry.submission_id} from ${path}`);
      }
    }
  }
}

function readSubmissionEntriesFromRoot(rootDir: string): MtaSubmissionEntry[] {
  const dir = join(rootDir, "data", "submissions");
  if (!existsSync(dir)) return [];
  const entries: MtaSubmissionEntry[] = [];
  for (const fileName of readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort()) {
    const path = join(dir, fileName);
    for (const [index, line] of readFileSync(path, "utf8").split(/\r?\n/u).entries()) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as unknown;
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("entry must be a JSON object");
        entries.push(entry as MtaSubmissionEntry);
      } catch (error) {
        throw new Error(`${path}:${index + 1}: invalid submission JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return entries;
}

function retiredSubmissionIdsFromRoot(rootDir: string): Set<string> {
  const path = join(rootDir, "data", "submission-overrides", "retired.json");
  if (!existsSync(path)) return new Set<string>();
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !("retired" in parsed) || !Array.isArray(parsed.retired)) {
    throw new Error(`${path}: submission retirement overrides must contain a retired array`);
  }
  const ids = parsed.retired.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !("submission_id" in entry) || typeof entry.submission_id !== "string") {
      throw new Error(`${path}: retired[${index}].submission_id must be a string`);
    }
    return entry.submission_id;
  });
  return new Set(ids);
}

function materializedIdentityKey(entry: MtaSubmissionEntry): string {
  return stableHash(canonicalIdentityForInput(entry.tool_args) as unknown as JsonObject);
}

function assertStableMaterializedRecordIds(
  existingEntries: MtaSubmissionEntry[],
  batch: OperationalRecoverySubmissionBatch,
  proposal: OperationalRecoveryProposal,
  retiredSubmissionIds: Set<string>,
  recordIdAssignments: (entries: MtaSubmissionEntry[], retiredSubmissionIds: Set<string>) => Map<string, string> =
    (entries, retired) => materializedRecordIdAssignments(entries, { retiredSubmissionIds: retired }),
): void {
  const before = recordIdAssignments(existingEntries, retiredSubmissionIds);
  const after = recordIdAssignments([...existingEntries, ...batch.entries], retiredSubmissionIds);
  for (const [identity, recordId] of before.entries()) {
    if (after.get(identity) !== recordId) {
      throw new Error(
        `Recovery proposal ${proposal.proposal_id} would change an existing materialized record id ${recordId} through collision suffix ordering`,
      );
    }
  }
  if (proposal.proposal_kind !== "observation_bundle") return;
  const entryByLocalId = new Map(batch.entries.map((entry) => [entry.tool_args.local_observation_id, entry]));
  for (const observation of proposal.observations) {
    const entry = entryByLocalId.get(observation.local_observation_id);
    if (!entry) throw new Error(`Recovery proposal ${proposal.proposal_id} has no journal entry for ${observation.local_observation_id}`);
    const assigned = after.get(materializedIdentityKey(entry));
    if (assigned !== observation.expected_record_id) {
      throw new Error(
        `Recovery proposal ${proposal.proposal_id} expected ${observation.expected_record_id}, but the complete submission corpus assigns ${assigned ?? "no record id"}`,
      );
    }
  }
}

export function applyOperationalRecoveryProposal(
  proposalId: string,
  options: OperationalRecoveryApplyOptions = {},
): OperationalRecoveryApplyReport {
  const rootDir = options.rootDir ?? repoRoot;
  const artifact = readOperationalRecoveryProposalArtifact(proposalId, rootDir);
  const proposal = artifact.proposal;
  if (artifact.stage === "rejected" || proposal.review_state === "rejected") {
    throw new Error(`Proposal ${proposalId} was rejected and cannot be applied`);
  }
  if (proposal.review_state !== "accepted" || !proposal.accepted_by || !proposal.accepted_at) {
    throw new Error(`Proposal ${proposalId} requires accepted_by and accepted_at before apply`);
  }

  const runId = operationalRecoveryRunId(proposal);
  const journalPath = join(rootDir, "data", "submissions", `${runId}.jsonl`);
  const journalExists = existsSync(journalPath);
  if (artifact.stage === "applied" && !journalExists) {
    throw new Error(`Applied proposal ${proposalId} is missing its append-only recovery journal ${journalPath}`);
  }
  const records = options.records ?? options.readRecords?.() ?? readCanonicalRecords();
  const resolveBlock = options.resolveBlock ?? operationalRecoveryBlockResolver(rootDir);
  const validationStage = artifact.stage === "applied" ? "applied" : journalExists ? "resuming" : "pending";
  let currentCorpusFingerprint = options.currentCorpusFingerprint;
  let knownGapIds = options.knownGapIds;
  let currentRouteAnchorPin = options.routeAnchorPin;
  if (validationStage === "pending" && (currentCorpusFingerprint === undefined || knownGapIds === undefined)) {
    const coverage = loadPinnedOperationalCoverageArtifacts({ rootDir });
    currentCorpusFingerprint ??= coverage.build.matrix.corpus_fingerprint;
    knownGapIds ??= new Set(coverage.build.ledger.gaps.map((gap) => gap.gap_id));
    currentRouteAnchorPin ??= coverage.routeAnchorPin;
  }
  if (proposal.route_anchor_pin && !currentRouteAnchorPin) {
    currentRouteAnchorPin = loadOperationalCoverageRouteAnchorPin({ rootDir }).pin;
  }
  if (
    proposal.route_anchor_pin &&
    (!currentRouteAnchorPin || !sameOperationalCoverageRouteAnchorPin(proposal.route_anchor_pin, currentRouteAnchorPin))
  ) {
    throw new Error(
      `Operational recovery proposal ${proposalId} route-anchor pin disagrees with current coverage: ` +
        `proposal ${proposal.route_anchor_pin.path}@${proposal.route_anchor_pin.sha256}; ` +
        `current ${currentRouteAnchorPin?.path ?? "unavailable"}@${currentRouteAnchorPin?.sha256 ?? "unavailable"}`,
    );
  }
  const proposalReasons = validateOperationalRecoveryProposal(proposal, {
    records,
    stage: validationStage,
    ...(currentCorpusFingerprint ? { current_corpus_fingerprint: currentCorpusFingerprint } : {}),
    ...(currentRouteAnchorPin ? { current_route_anchor_pin: currentRouteAnchorPin } : {}),
    ...(knownGapIds ? { known_gap_ids: knownGapIds } : {}),
    resolve_block: resolveBlock,
  });
  if (proposalReasons.length > 0) {
    throw new Error(`Operational recovery proposal ${proposalId} is invalid: ${proposalReasons.join("; ")}`);
  }

  const batch = journalExists
    ? persistedRecoverySubmissionBatch(journalPath, proposal, records, options.createEntry)
    : buildOperationalRecoverySubmissionBatch(proposal, records, options.createEntry);
  assertNoJournalIdentityConflicts(rootDir, journalPath, proposal.proposal_id, batch.entries);
  assertStableMaterializedRecordIds(
    readSubmissionEntriesFromRoot(rootDir),
    batch,
    proposal,
    retiredSubmissionIdsFromRoot(rootDir),
    options.recordIdAssignments,
  );
  const appliedPath = appliedProposalPath(rootDir, artifact);
  const baseReport = {
    proposal_id: proposal.proposal_id,
    proposal_kind: proposal.proposal_kind,
    proposal_sha256: batch.proposal_sha256,
    accepted_by: proposal.accepted_by,
    accepted_at: proposal.accepted_at,
    submission_count: batch.entries.length,
    journal_path: relativePath(rootDir, journalPath),
    proposal_path: relativePath(rootDir, artifact.path),
    applied_proposal_path: relativePath(rootDir, appliedPath),
  };

  if (artifact.stage === "applied") {
    return {
      ...baseReport,
      dry_run: !options.force,
      wrote_journal: false,
      materialized: false,
      coverage_refreshed: false,
      moved_to_applied: false,
      skipped_already_applied: true,
    };
  }

  if (!options.force) {
    return {
      ...baseReport,
      dry_run: true,
      wrote_journal: false,
      materialized: false,
      coverage_refreshed: false,
      moved_to_applied: false,
      skipped_already_applied: false,
    };
  }

  let wroteJournal = false;
  if (!journalExists) {
    mkdirSync(dirname(journalPath), { recursive: true });
    writeFileSync(journalPath, batch.journal_content, { encoding: "utf8", flag: "wx" });
    wroteJournal = true;
  }

  (options.materialize ?? materializeWiki)();
  if (options.refreshCoverage) {
    options.refreshCoverage(currentRouteAnchorPin);
  } else {
    currentRouteAnchorPin ??= loadOperationalCoverageRouteAnchorPin({ rootDir }).pin;
    const refreshed = writeOperationalCoverageArtifacts({ rootDir, routeAnchorPath: currentRouteAnchorPin.path });
    const refreshedPin: OperationalCoverageRouteAnchorPin = {
      path: refreshed.manifest.route_anchor_path,
      release_id: refreshed.manifest.route_anchor_release_id,
      sha256: refreshed.manifest.route_anchor_sha256,
    };
    if (!sameOperationalCoverageRouteAnchorPin(currentRouteAnchorPin, refreshedPin)) {
      throw new Error(`Operational coverage refresh changed the route-anchor pin for proposal ${proposalId}`);
    }
  }
  const recordsAfter = options.readRecords?.() ?? readCanonicalRecords();
  const postApplyReasons = validateOperationalRecoveryProposal(proposal, {
    records: recordsAfter,
    stage: "applied",
    resolve_block: resolveBlock,
  });
  if (postApplyReasons.length > 0) {
    throw new Error(
      `Recovery journal was preserved, but materialized output did not satisfy proposal ${proposalId}: ${postApplyReasons.join("; ")}`,
    );
  }
  if (existsSync(appliedPath)) {
    throw new Error(`Refusing to overwrite an existing applied proposal artifact: ${appliedPath}`);
  }
  mkdirSync(dirname(appliedPath), { recursive: true });
  renameSync(artifact.path, appliedPath);
  return {
    ...baseReport,
    dry_run: false,
    wrote_journal: wroteJournal,
    materialized: true,
    coverage_refreshed: true,
    moved_to_applied: true,
    skipped_already_applied: false,
  };
}
