import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";

type PlainEvidence = {
  record_id: string;
  source_id: string;
  evidence_id: string;
};
type Finding = Record<string, unknown> & {
  candidate_id: string;
  candidate_key: string;
  recommended_disposition: string;
};
type FrozenCandidate = {
  candidate_id: string;
  candidate_key: string;
  disposition: string;
  observation_event_record_ids: string[];
  observation_relation_record_ids: string[];
  evidence_bindings: PlainEvidence[];
};
type FrozenObservation = {
  event_record_id: string;
  candidate_ids: string[];
};

const campaign =
  "data/operational-episode-resolution/campaigns/plan-052";
const frozenCandidatesRelative =
  `${campaign}/frozen-frontier/candidate_ledger.jsonl`;
const frozenObservationsRelative =
  `${campaign}/frozen-frontier/observation_ledger.jsonl`;
const decisionDir =
  "data/operational-episode-resolution/decisions/accepted-current";
const mappingDir =
  "data/operational-episode-resolution/adapters/accepted-current";
const acceptedTerminal = new Set([
  "insufficient_evidence",
  "outside_domain",
  "rejected",
]);
const integratedAt = "2026-07-30T13:00:00.000Z";

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}
function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}
function pointer(relativePath: string): { path: string; sha256: string } {
  return {
    path: relativePath,
    sha256: sha256(readFileSync(absolute(relativePath))),
  };
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}
function strings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) =>
      typeof entry === "string" && entry.trim() ? [entry.trim()] : []
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, entry]) =>
      `${key}: ${
        typeof entry === "string" ? entry : stableJson(entry as JsonValue)
      }`
    );
  }
  return [];
}
function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort((left, right) =>
    left.localeCompare(right)
  );
}
function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(absolute(relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function review(
  relativePath: string,
  batchId: string,
  manifest: { path: string; sha256: string },
  role: "primary" | "independent" | "independent_adjudication",
): Map<string, Finding> {
  const input = object(
    JSON.parse(readFileSync(absolute(relativePath), "utf8")) as unknown,
    relativePath,
  );
  const provider = object(
    input.provider_usage,
    `${relativePath}.provider_usage`,
  );
  const embeddedManifest = input.manifest === undefined
    ? null
    : object(input.manifest, `${relativePath}.manifest`);
  const arithmetic = input.arithmetic === undefined
    ? null
    : object(input.arithmetic, `${relativePath}.arithmetic`);
  const providerCalled =
    provider.provider_called ??
      ((provider.provider === "none" ||
          (provider.model === null && provider.profile === null))
        ? false
        : undefined);
  const requestCount = provider.request_count ?? provider.provider_requests;
  const estimatedCost =
    provider.estimated_cost_usd ?? provider.committed_cost_usd;
  const findingContainer = Array.isArray(input.findings)
    ? input.findings
    : object(input.findings, `${relativePath}.findings`).candidate_findings;
  if (
    input.schema_version !== 1 ||
    input.contract_id !== "plan-052-semantic-review-receipt-v1" ||
    input.batch_id !== batchId ||
    (input.review_role ?? input.role) !== role ||
    (input.manifest_path ?? embeddedManifest?.path) !== manifest.path ||
    (input.manifest_sha256 ?? embeddedManifest?.sha256) !== manifest.sha256 ||
    (input.review_complete ?? arithmetic?.arithmetic_ok) !== true ||
    providerCalled !== false ||
    requestCount !== 0 ||
    provider.input_tokens !== 0 ||
    provider.output_tokens !== 0 ||
    estimatedCost !== 0 ||
    provider.actual_cost_usd !== 0 ||
    !Array.isArray(findingContainer)
  ) {
    throw new Error(`${relativePath} is incomplete, stale, or not no-cost`);
  }
  const findings = new Map<string, Finding>();
  for (const [index, value] of findingContainer.entries()) {
    const row = object(value, `${relativePath}.findings[${index}]`);
    if (typeof row.candidate_id !== "string") continue;
    const candidateId = String(row.candidate_id);
    const finding = {
      ...row,
      candidate_id: candidateId,
      candidate_key: String(row.candidate_key),
      recommended_disposition: String(
        row.recommended_disposition ?? row.semantic_outcome,
      ),
    };
    if (findings.has(candidateId)) {
      throw new Error(`${relativePath} has duplicate candidate ${candidateId}`);
    }
    findings.set(candidateId, finding);
  }
  return findings;
}

function expectedFiles(
  batchId: string,
  adjudicated: boolean,
): Map<string, string> {
  const manifestRelative = `${campaign}/batches/${batchId}.json`;
  const primaryRelative =
    `${campaign}/proposed-review-receipts/${batchId}/primary.json`;
  const cleanIndependentRelative =
    `${campaign}/proposed-review-receipts/${batchId}/independent-clean.json`;
  const independentRelative = existsSync(absolute(cleanIndependentRelative))
    ? cleanIndependentRelative
    : `${campaign}/proposed-review-receipts/${batchId}/independent.json`;
  const adjudicationRelative =
    `${campaign}/proposed-review-receipts/${batchId}/adjudication-independent.json`;
  const manifestPointer = pointer(manifestRelative);
  const manifest = object(
    JSON.parse(readFileSync(absolute(manifestRelative), "utf8")) as unknown,
    manifestRelative,
  );
  if (
    manifest.schema_version !== 1 ||
    manifest.contract_id !==
      "plan-052-operational-episode-batch-manifest-v1" ||
    manifest.batch_id !== batchId ||
    !Array.isArray(manifest.candidate_ids)
  ) {
    throw new Error(`${manifestRelative} is not a frozen Plan 052 manifest`);
  }
  const manifestCandidateIds = (manifest.candidate_ids as unknown[])
    .map(String)
    .sort();
  const primary = review(
    primaryRelative,
    batchId,
    manifestPointer,
    "primary",
  );
  const independent = review(
    independentRelative,
    batchId,
    manifestPointer,
    "independent",
  );
  const adjudication = adjudicated
    ? review(
        adjudicationRelative,
        batchId,
        manifestPointer,
        "independent_adjudication",
      )
    : null;
  if (
    [...primary.keys()].sort().join("\n") !== manifestCandidateIds.join("\n") ||
    [...independent.keys()].sort().join("\n") !==
      manifestCandidateIds.join("\n")
  ) {
    throw new Error(`${batchId} reviewer candidate partitions are incomplete`);
  }
  const candidates = new Map(
    readJsonl<FrozenCandidate>(frozenCandidatesRelative).map((row) => [
      row.candidate_id,
      row,
    ]),
  );
  const observations = new Map(
    readJsonl<FrozenObservation>(frozenObservationsRelative).map((row) => [
      row.event_record_id,
      row,
    ]),
  );
  if (
    adjudication &&
    [...adjudication.keys()].some((candidateId) =>
      !manifestCandidateIds.includes(candidateId)
    )
  ) {
    throw new Error(`${batchId} adjudication escapes the frozen manifest`);
  }
  const adjudicatedIds = new Set(adjudication?.keys() ?? []);
  const agreed = manifestCandidateIds.flatMap((candidateId) => {
    const first = primary.get(candidateId)!;
    const second = independent.get(candidateId)!;
    const third = adjudication?.get(candidateId);
    if (adjudicated) {
      if (!third) return [];
      if (first.recommended_disposition === second.recommended_disposition) {
        throw new Error(
          `${batchId} adjudication includes non-disagreement ${candidateId}`,
        );
      }
      return acceptedTerminal.has(third.recommended_disposition)
        ? [{ first, second, third, finalDisposition: third.recommended_disposition }]
        : [];
    }
    return first.recommended_disposition === second.recommended_disposition &&
        acceptedTerminal.has(first.recommended_disposition)
      ? [{
          first,
          second,
          third: null,
          finalDisposition: first.recommended_disposition,
        }]
      : [];
  });
  if (agreed.length === 0) {
    throw new Error(`${batchId} has no agreed terminal partition`);
  }
  const files = new Map<string, string>();
  const artifacts: Array<Record<string, unknown>> = [];
  for (const { first, second, third, finalDisposition } of agreed) {
    const row = candidates.get(first.candidate_id);
    if (
      !row ||
      row.disposition !== "pending_review" ||
      row.candidate_key !== first.candidate_key ||
      row.candidate_key !== second.candidate_key ||
      row.evidence_bindings.length === 0
    ) {
      throw new Error(`${first.candidate_id} frozen membership drifted`);
    }
    for (const eventId of row.observation_event_record_ids) {
      const observation = observations.get(eventId);
      if (
        !observation ||
        observation.candidate_ids.length !== 1 ||
        observation.candidate_ids[0] !== row.candidate_id
      ) {
        throw new Error(
          `${first.candidate_id} is not an independently owned observation component`,
        );
      }
    }
    const suffix = first.candidate_id.replace("candidate:", "");
    const decisionId =
      `plan-052-${batchId}-${adjudicated ? "adjudicated-" : ""}terminal-${suffix}`;
    const mappingId =
      `plan-052-${batchId}-${adjudicated ? "adjudicated-" : ""}mapping-${suffix}`;
    let evidenceGap:
      | { path: string; sha256: string }
      | null = null;
    if (finalDisposition === "insufficient_evidence") {
      const knownFacts = unique([
        ...strings(first.known_facts),
        ...strings(second.known_facts),
        ...strings(third?.known_facts),
        `Primary assessment: ${String(first.assessment)}`,
        `Independent assessment: ${String(second.assessment)}`,
        ...(third
          ? [`Blind adjudication assessment: ${String(third.assessment)}`]
          : []),
      ]);
      const prohibitedInferences = unique([
        ...strings(first.prohibited_inferences),
        ...strings(second.prohibited_inferences),
        ...strings(third?.prohibited_inferences),
        "Do not publish an exact route × treatment occurrence from this frozen evidence.",
      ]);
      const gapRelative =
        `${campaign}/evidence-gap-receipts/${batchId}/${suffix}.json`;
      const gapBytes = json({
        schema_version: 1,
        contract_id: "plan-052-evidence-gap-receipt-v1",
        plan_id: "plan-052",
        batch_id: batchId,
        candidate_id: row.candidate_id,
        candidate_key: row.candidate_key,
        disposition: "insufficient_evidence",
        evidence_bindings: row.evidence_bindings,
        known_facts: knownFacts,
        prohibited_inferences: prohibitedInferences,
        manifest: manifestPointer,
        review_receipts: [
          pointer(primaryRelative),
          pointer(independentRelative),
          ...(adjudicated ? [pointer(adjudicationRelative)] : []),
        ],
        recorded_at: integratedAt,
      });
      files.set(gapRelative, gapBytes);
      evidenceGap = { path: gapRelative, sha256: sha256(gapBytes) };
    }
    const decisionRelative = `${decisionDir}/${decisionId}.json`;
    const decisionBytes = json({
      schema_version: 1,
      decision_id: decisionId,
      candidate_key: row.candidate_key,
      disposition: finalDisposition,
      canonical_candidate_key: null,
      successor_occurrence_ids: [],
      reviewer:
        `plan-052-${batchId}-${adjudicated ? "blind-adjudication" : "reconciled-dual-review"}`,
      decided_at: integratedAt,
      rationale:
        adjudicated
          ? `Blind third adjudication resolves the original ${first.recommended_disposition}/${second.recommended_disposition} disagreement as ${finalDisposition}. Adjudication: ${String(third?.assessment)}`
          : `Primary and independent Plan 052 reviews agree on ${finalDisposition}. Primary: ${String(first.assessment)} Independent: ${String(second.assessment)}`,
      evidence_bindings: row.evidence_bindings,
      ...(evidenceGap
        ? {
            evidence_gap_receipt_path: evidenceGap.path,
            evidence_gap_receipt_sha256: evidenceGap.sha256,
          }
        : {}),
    });
    files.set(decisionRelative, decisionBytes);
    const mappingRelative = `${mappingDir}/${mappingId}.json`;
    const mappingBytes = json({
      schema_version: 1,
      mapping_id: mappingId,
      adapter_id: "accepted_mapping_v1",
      observation_event_record_ids: row.observation_event_record_ids,
      observation_relation_record_ids: row.observation_relation_record_ids,
      candidate_keys: [row.candidate_key],
      occurrence_id: null,
      evidence_bindings: row.evidence_bindings,
      decision_id: decisionId,
      reviewer: "plan-052-single-frontier-integrator",
      reviewed_at: integratedAt,
      rationale:
        `Exact frozen observation membership is terminally accounted for as ${finalDisposition}; no occurrence identity or route incidence is inferred.`,
    });
    files.set(mappingRelative, mappingBytes);
    artifacts.push({
      candidate_id: row.candidate_id,
      disposition: finalDisposition,
      decision: { path: decisionRelative, sha256: sha256(decisionBytes) },
      evidence_gap: evidenceGap,
      mapping: { path: mappingRelative, sha256: sha256(mappingBytes) },
    });
  }
  const disagreements = manifestCandidateIds.filter((candidateId) => {
    const first = primary.get(candidateId)!;
    const second = independent.get(candidateId)!;
    return first.recommended_disposition !== second.recommended_disposition ||
      first.canonical_candidate_id !== second.canonical_candidate_id;
  });
  const withheldAgreements = manifestCandidateIds.filter((candidateId) =>
    !agreed.some(({ first }) => first.candidate_id === candidateId) &&
    !disagreements.includes(candidateId)
  );
  const counts = Object.fromEntries(
    [...acceptedTerminal].map((disposition) => [
      disposition,
      artifacts.filter((row) => row.disposition === disposition).length,
    ]),
  );
  const integrationRelative =
    `${campaign}/integration-receipts/${batchId}-${
      adjudicated ? "adjudicated" : "agreed"
    }-terminal.json`;
  files.set(integrationRelative, json({
    schema_version: 1,
    contract_id: "plan-052-wave-integration-receipt-v1",
    plan_id: "plan-052",
    batch_id: batchId,
    partition: adjudicated
      ? "blind_adjudicated_terminal_nonpublication"
      : "agreed_terminal_nonpublication",
    integrated_at: integratedAt,
    integrator: "plan-052-single-frontier-integrator",
    manifest: manifestPointer,
    review_receipts: [
      pointer(primaryRelative),
      pointer(independentRelative),
      ...(adjudicated ? [pointer(adjudicationRelative)] : []),
    ],
    accepted_artifacts: artifacts,
    terminal_arithmetic: {
      accepted_candidate_count: artifacts.length,
      ...counts,
    },
    disagreement_candidate_ids: adjudicated
      ? disagreements.filter((candidateId) => !adjudicatedIds.has(candidateId))
      : disagreements,
    withheld_agreed_nonterminal_candidate_ids: withheldAgreements,
    provider_usage: {
      request_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
    },
  }));
  if (adjudicated) {
    const reconciliationRelative =
      `${campaign}/reconciliation-receipts/${batchId}-blind-adjudication.json`;
    files.set(reconciliationRelative, json({
      schema_version: 1,
      contract_id: "plan-052-review-reconciliation-receipt-v1",
      plan_id: "plan-052",
      batch_id: batchId,
      reconciled_at: integratedAt,
      reconciler: "plan-052-single-frontier-integrator",
      manifest: manifestPointer,
      primary_receipt: pointer(primaryRelative),
      independent_receipt: pointer(independentRelative),
      blind_adjudication_receipt: pointer(adjudicationRelative),
      outcomes: artifacts.map((artifact) => ({
        candidate_id: artifact.candidate_id,
        final_disposition: artifact.disposition,
      })),
      exact_arithmetic: {
        reconciled_candidate_count: artifacts.length,
        reconciled_observation_count: artifacts.length,
        pending_units_before: 1130,
        pending_units_after: 1130 - artifacts.length * 2,
      },
      provider_usage: {
        request_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: 0,
        actual_cost_usd: 0,
      },
    }));
  }
  return files;
}

function writeOrCheck(
  mode: "--write" | "--check" | "--repair-unaccepted",
  batchId: string,
  files: Map<string, string>,
): void {
  if (mode === "--repair-unaccepted") {
    const auditRelative =
      `${campaign}/integration-receipts/${batchId}-unaccepted-integration-repair.json`;
    if (existsSync(absolute(auditRelative))) {
      throw new Error(`Plan 052 repair audit already exists: ${auditRelative}`);
    }
    const changed = [...files].flatMap(([relativePath, content]) => {
      if (!existsSync(absolute(relativePath))) {
        throw new Error(
          `Plan 052 unaccepted repair target is missing: ${relativePath}`,
        );
      }
      const previous = readFileSync(absolute(relativePath));
      return sha256(previous) === sha256(content)
        ? []
        : [{
            path: relativePath,
            previous_sha256: sha256(previous),
            replacement_sha256: sha256(content),
          }];
    });
    if (changed.length === 0) {
      throw new Error(`${batchId} has no unaccepted integration drift to repair`);
    }
    mkdirSync(dirname(absolute(auditRelative)), { recursive: true });
    writeFileSync(absolute(auditRelative), json({
      schema_version: 1,
      contract_id: "plan-052-unaccepted-integration-repair-v1",
      plan_id: "plan-052",
      batch_id: batchId,
      repaired_at: "2026-07-30T14:15:00.000Z",
      integrator: "plan-052-single-frontier-integrator",
      reason:
        "The integrator wrote this batch before the worker finalized its proposed receipt. The first deterministic frontier replay rejected the stale pinned receipt hash, so no accepted checkpoint existed. This receipt preserves every replaced byte hash while the files are regenerated from the finalized immutable reviewer receipts.",
      changed_files: changed,
    }), "utf8");
  }
  for (const [relativePath, content] of files) {
    const target = absolute(relativePath);
    if (mode === "--write") {
      if (existsSync(target)) {
        throw new Error(
          `Plan 052 batch artifact already exists: ${relativePath}`,
        );
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    } else if (mode === "--repair-unaccepted") {
      writeFileSync(target, content, "utf8");
    } else if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      throw new Error(`Plan 052 batch artifact is stale: ${relativePath}`);
    }
  }
}

const batchId = process.argv[2];
const mode = process.argv[3];
const adjudicated = process.argv[4] === "--adjudicated";
if (
  !batchId ||
  !/^w2-[a-z0-9-]+$/u.test(batchId) ||
  (mode !== "--write" &&
    mode !== "--check" &&
    mode !== "--repair-unaccepted") ||
  (process.argv.length !== 4 && process.argv.length !== 5) ||
  (process.argv.length === 5 && !adjudicated)
) {
  throw new Error(
    "usage: bun scripts/integrate-plan052-agreed-terminal-batch.ts <w2-batch-id> --write|--check|--repair-unaccepted [--adjudicated]",
  );
}
const files = expectedFiles(batchId, adjudicated);
writeOrCheck(mode, batchId, files);
console.log(
  `Plan 052 ${batchId} agreed terminal partition ${
    mode === "--write"
      ? "applied"
      : mode === "--repair-unaccepted"
      ? "repaired before acceptance"
      : "verified"
  }: ${[...files.keys()].filter((path) => path.startsWith(decisionDir)).length} candidates.`,
);
