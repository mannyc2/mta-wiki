import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";

type Evidence = {
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
  evidence_bindings: Evidence[];
};
type FrozenObservation = {
  event_record_id: string;
  candidate_ids: string[];
};
type ExistingDecision = {
  candidate_key: string;
  disposition: string;
  canonical_candidate_key: string | null;
};

const campaign = "data/operational-episode-resolution/campaigns/plan-052";
const frozenCandidatesRelative =
  `${campaign}/frozen-frontier/candidate_ledger.jsonl`;
const frozenObservationsRelative =
  `${campaign}/frozen-frontier/observation_ledger.jsonl`;
const decisionDir =
  "data/operational-episode-resolution/decisions/accepted-current";
const mappingDir =
  "data/operational-episode-resolution/adapters/accepted-current";
const terminalDispositions = new Set([
  "insufficient_evidence",
  "outside_domain",
  "rejected",
]);
const integratedAt = "2026-07-30T18:00:00.000Z";

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
function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(absolute(relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
function strings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) =>
      typeof entry === "string" && entry.trim() ? [entry.trim()] : []
    );
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}
function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}
function findingRationale(finding: Finding): string {
  for (
    const value of [
      finding.assessment,
      finding.review_rationale,
      finding.rationale,
      finding.evidence_gap_reason,
      ...strings(finding.terminal_gaps),
      ...strings(finding.terminal_facts),
    ]
  ) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return `Blind adjudication selected ${finding.recommended_disposition}.`;
}
function targetOf(finding: Finding): string | null {
  const nestedTarget =
    finding.target && typeof finding.target === "object" && !Array.isArray(finding.target)
      ? finding.target as Record<string, unknown>
      : null;
  if (
    nestedTarget &&
    typeof nestedTarget.canonical_candidate_id === "string" &&
    nestedTarget.canonical_candidate_id.trim()
  ) {
    return nestedTarget.canonical_candidate_id.trim();
  }
  for (
    const field of [
      "canonical_candidate_id",
      "canonical_candidate_key",
      "target_candidate_id",
      "duplicate_target_candidate_id",
      "alias_target_candidate_id",
      "alias_of_candidate_id",
      "recommended_canonical_candidate_id",
    ]
  ) {
    const value = finding[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
function receipt(
  relativePath: string,
  batchId: string,
  manifest: { path: string; sha256: string },
  role: "primary" | "independent" | "independent_adjudication",
  requireFullPartition: readonly string[] | null,
): Map<string, Finding> {
  const value = object(
    JSON.parse(readFileSync(absolute(relativePath), "utf8")) as unknown,
    relativePath,
  );
  const provider = object(value.provider_usage, `${relativePath}.provider_usage`);
  const frozenManifest =
    value.frozen_manifest === undefined
      ? null
      : object(value.frozen_manifest, `${relativePath}.frozen_manifest`);
  const embeddedManifest =
    value.manifest === undefined
      ? null
      : object(value.manifest, `${relativePath}.manifest`);
  const manifestPin =
    value.manifest_pin === undefined
      ? null
      : object(value.manifest_pin, `${relativePath}.manifest_pin`);
  const inputPins =
    value.input_pins === undefined
      ? null
      : object(value.input_pins, `${relativePath}.input_pins`);
  const pinnedManifest =
    inputPins?.manifest === undefined
      ? null
      : object(inputPins.manifest, `${relativePath}.input_pins.manifest`);
  const arithmetic =
    value.arithmetic === undefined
      ? null
      : object(value.arithmetic, `${relativePath}.arithmetic`);
  const receiptManifestPath =
    value.manifest_path ??
      frozenManifest?.path ??
      embeddedManifest?.path ??
      manifestPin?.path ??
      pinnedManifest?.path;
  const receiptManifestSha256 =
    value.manifest_sha256 ??
      frozenManifest?.sha256 ??
      embeddedManifest?.sha256 ??
      manifestPin?.sha256 ??
      pinnedManifest?.sha256;
  const requestCount =
    provider.request_count ??
    provider.provider_requests ??
    provider.requests ??
    provider.provider_calls ??
    provider.model_calls;
  const estimatedCost =
    provider.estimated_cost_usd ?? provider.committed_cost_usd ?? 0;
  const providerCalled =
    provider.provider_called ??
      ((provider.provider === "none" ||
          (provider.model === null && provider.profile === null) ||
          (requestCount === 0 && estimatedCost === 0 &&
            provider.actual_cost_usd === 0))
        ? false
        : undefined);
  const reviewComplete =
    value.review_complete ??
      arithmetic?.arithmetic_ok ??
      (arithmetic?.final_pending_count === 0 &&
        arithmetic?.accounted_candidate_count ===
          arithmetic?.required_terminal_candidate_count);
  const findingContainer = Array.isArray(value.findings)
    ? value.findings
    : object(value.findings, `${relativePath}.findings`).candidate_findings;
  if (
    value.schema_version !== 1 ||
    (value.contract_id ?? value.contract) !==
      "plan-052-semantic-review-receipt-v1" ||
    value.batch_id !== batchId ||
    (value.review_role ?? value.role) !== role ||
    receiptManifestPath !== manifest.path ||
    receiptManifestSha256 !== manifest.sha256 ||
    reviewComplete !== true ||
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
  for (const [index, entry] of findingContainer.entries()) {
    const row = object(entry, `${relativePath}.findings[${index}]`);
    if (typeof row.candidate_id !== "string") continue;
    const finding = {
      ...row,
      candidate_id: String(row.candidate_id),
      candidate_key:
        typeof row.candidate_key === "string" ? row.candidate_key : "",
      recommended_disposition: String(
        row.recommended_disposition ?? row.semantic_outcome ?? row.disposition,
      ),
    };
    if (findings.has(finding.candidate_id)) {
      throw new Error(`${relativePath} repeats ${finding.candidate_id}`);
    }
    findings.set(finding.candidate_id, finding);
  }
  if (
    requireFullPartition &&
    [...findings.keys()].sort().join("\n") !==
      [...requireFullPartition].sort().join("\n")
  ) {
    throw new Error(`${relativePath} does not cover the full frozen batch`);
  }
  return findings;
}
function existingDecisions(): ExistingDecision[] {
  if (!existsSync(absolute(decisionDir))) return [];
  return readdirSync(absolute(decisionDir))
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const value = object(
        JSON.parse(readFileSync(join(absolute(decisionDir), name), "utf8")) as unknown,
        `${decisionDir}/${name}`,
      );
      return {
        candidate_key: String(value.candidate_key),
        disposition: String(value.disposition),
        canonical_candidate_key:
          value.canonical_candidate_key === null
            ? null
            : String(value.canonical_candidate_key),
      };
    });
}
function assertAcyclic(decisions: readonly ExistingDecision[]): void {
  const graph = new Map<string, string>();
  for (const decision of decisions) {
    if (decision.disposition !== "duplicate_alias") continue;
    if (!decision.canonical_candidate_key) {
      throw new Error(`duplicate alias ${decision.candidate_key} lacks target`);
    }
    if (graph.has(decision.candidate_key)) {
      throw new Error(`duplicate alias owner ${decision.candidate_key}`);
    }
    graph.set(decision.candidate_key, decision.canonical_candidate_key);
  }
  for (const start of graph.keys()) {
    const seen = new Set<string>();
    let cursor: string | undefined = start;
    while (cursor && graph.has(cursor)) {
      if (seen.has(cursor)) throw new Error(`cyclic alias chain at ${cursor}`);
      seen.add(cursor);
      cursor = graph.get(cursor);
    }
  }
}

function expectedFiles(
  batchId: string,
  focusedAliasHead = false,
): Map<string, string> {
  const manifestRelative = `${campaign}/batches/${batchId}.json`;
  const manifestPointer = pointer(manifestRelative);
  const manifest = object(
    JSON.parse(readFileSync(absolute(manifestRelative), "utf8")) as unknown,
    manifestRelative,
  );
  if (
    manifest.schema_version !== 1 ||
    manifest.contract_id !== "plan-052-operational-episode-batch-manifest-v1" ||
    manifest.batch_id !== batchId ||
    !Array.isArray(manifest.candidate_ids)
  ) {
    throw new Error(`${manifestRelative} is not a frozen Plan 052 manifest`);
  }
  const candidateIds = (manifest.candidate_ids as unknown[]).map(String).sort();
  const primaryRelative =
    `${campaign}/proposed-review-receipts/${batchId}/primary.json`;
  const cleanIndependentRelative =
    `${campaign}/proposed-review-receipts/${batchId}/independent-clean.json`;
  const independentRelative = existsSync(absolute(cleanIndependentRelative))
    ? cleanIndependentRelative
    : `${campaign}/proposed-review-receipts/${batchId}/independent.json`;
  const standardAdjudicationRelative =
    `${campaign}/proposed-review-receipts/${batchId}/adjudication-independent.json`;
  const alternateAdjudicationRelative =
    `${campaign}/proposed-review-receipts/${batchId}/blind-adjudication.json`;
  const adjudicationRelative = focusedAliasHead
    ? `${campaign}/proposed-review-receipts/${batchId}/alias-head-adjudication-independent.json`
    : existsSync(absolute(standardAdjudicationRelative))
    ? standardAdjudicationRelative
    : alternateAdjudicationRelative;
  const primary = receipt(
    primaryRelative,
    batchId,
    manifestPointer,
    "primary",
    candidateIds,
  );
  const independent = receipt(
    independentRelative,
    batchId,
    manifestPointer,
    "independent",
    candidateIds,
  );
  const adjudication = receipt(
    adjudicationRelative,
    batchId,
    manifestPointer,
    "independent_adjudication",
    null,
  );
  const candidates = readJsonl<FrozenCandidate>(frozenCandidatesRelative);
  const byId = new Map(candidates.map((row) => [row.candidate_id, row]));
  const byKey = new Map(candidates.map((row) => [row.candidate_key, row]));
  const observations = new Map(
    readJsonl<FrozenObservation>(frozenObservationsRelative).map((row) => [
      row.event_record_id,
      row,
    ]),
  );
  const accepted = [...adjudication.values()].filter((finding) =>
    terminalDispositions.has(finding.recommended_disposition) ||
    finding.recommended_disposition === "duplicate_alias"
  );
  if (accepted.length === 0) {
    throw new Error(`${batchId} adjudication has no nonpositive outcomes`);
  }
  const additions: ExistingDecision[] = [];
  const priorDecisions = existingDecisions();
  const priorAliasGraph = new Map(
    priorDecisions.flatMap((decision) =>
      decision.disposition === "duplicate_alias" &&
        decision.canonical_candidate_key
        ? [[decision.candidate_key, decision.canonical_candidate_key] as const]
        : []
    ),
  );
  const withheldAliasHeadCandidateIds: string[] = [];
  const files = new Map<string, string>();
  const artifacts: Array<Record<string, unknown>> = [];
  let observationCount = 0;
  for (const third of accepted.sort((left, right) =>
    left.candidate_id.localeCompare(right.candidate_id)
  )) {
    const row = byId.get(third.candidate_id);
    const first = primary.get(third.candidate_id);
    const second = independent.get(third.candidate_id);
    if (
      !row ||
      !first ||
      !second ||
      row.disposition !== "pending_review" ||
      (third.candidate_key !== "" &&
        row.candidate_key !== third.candidate_key) ||
      row.candidate_key !== first.candidate_key ||
      row.candidate_key !== second.candidate_key ||
      row.evidence_bindings.length === 0
    ) {
      throw new Error(`${third.candidate_id} frozen/reviewer membership drifted`);
    }
    for (const eventId of row.observation_event_record_ids) {
      const observation = observations.get(eventId);
      if (
        !observation ||
        observation.candidate_ids.length !== 1 ||
        observation.candidate_ids[0] !== row.candidate_id
      ) {
        throw new Error(
          `${third.candidate_id} does not independently own ${eventId}`,
        );
      }
    }
    observationCount += row.observation_event_record_ids.length;
    const suffix = third.candidate_id.replace("candidate:", "");
    const decisionId = `plan-052-${batchId}-adjudicated-${suffix}`;
    const mappingId = `plan-052-${batchId}-adjudicated-mapping-${suffix}`;
    let canonicalCandidateKey: string | null = null;
    let canonicalCandidateId: string | null = null;
    if (third.recommended_disposition === "duplicate_alias") {
      const target = targetOf(third);
      const targetRow = target?.startsWith("candidate:")
        ? byId.get(target)
        : target
        ? byKey.get(target)
        : undefined;
      if (!targetRow || targetRow.candidate_key === row.candidate_key) {
        throw new Error(`${third.candidate_id} has invalid alias target ${target}`);
      }
      const seen = new Set<string>();
      let resolvedTargetKey = targetRow.candidate_key;
      while (priorAliasGraph.has(resolvedTargetKey)) {
        if (seen.has(resolvedTargetKey)) {
          throw new Error(`prior alias graph cycles at ${resolvedTargetKey}`);
        }
        seen.add(resolvedTargetKey);
        resolvedTargetKey = priorAliasGraph.get(resolvedTargetKey)!;
      }
      if (resolvedTargetKey === row.candidate_key) {
        withheldAliasHeadCandidateIds.push(row.candidate_id);
        observationCount -= row.observation_event_record_ids.length;
        continue;
      }
      const resolvedTargetRow = byKey.get(resolvedTargetKey);
      if (!resolvedTargetRow) {
        throw new Error(
          `${third.candidate_id} alias target head ${resolvedTargetKey} is not frozen`,
        );
      }
      canonicalCandidateKey = resolvedTargetRow.candidate_key;
      canonicalCandidateId = resolvedTargetRow.candidate_id;
      additions.push({
        candidate_key: row.candidate_key,
        disposition: "duplicate_alias",
        canonical_candidate_key: canonicalCandidateKey,
      });
    }
    let evidenceGap: { path: string; sha256: string } | null = null;
    if (third.recommended_disposition === "insufficient_evidence") {
      const gapRelative =
        `${campaign}/evidence-gap-receipts/${batchId}/${suffix}-adjudicated.json`;
      const gapBytes = json({
        schema_version: 1,
        contract_id: "plan-052-evidence-gap-receipt-v1",
        plan_id: "plan-052",
        batch_id: batchId,
        candidate_id: row.candidate_id,
        candidate_key: row.candidate_key,
        disposition: "insufficient_evidence",
        evidence_bindings: row.evidence_bindings,
        known_facts: unique([
          ...strings(third.known_facts),
          ...strings(third.terminal_facts),
        ]),
        prohibited_inferences: unique([
          ...strings(third.prohibited_inferences),
          "Do not publish an exact route × treatment occurrence from this frozen evidence.",
        ]),
        manifest: manifestPointer,
        review_receipts: [
          pointer(primaryRelative),
          pointer(independentRelative),
          pointer(adjudicationRelative),
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
      disposition: third.recommended_disposition,
      canonical_candidate_key: canonicalCandidateKey,
      successor_occurrence_ids: [],
      reviewer: `plan-052-${batchId}-blind-adjudication`,
      decided_at: integratedAt,
      rationale: findingRationale(third),
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
        third.recommended_disposition === "duplicate_alias"
          ? `Blind adjudication maps this exact observation component to the reviewed alias target ${canonicalCandidateId}.`
          : `Blind adjudication terminally accounts for this exact observation component as ${third.recommended_disposition}.`,
    });
    files.set(mappingRelative, mappingBytes);
    artifacts.push({
      candidate_id: row.candidate_id,
      disposition: third.recommended_disposition,
      canonical_candidate_id: canonicalCandidateId,
      decision: { path: decisionRelative, sha256: sha256(decisionBytes) },
      evidence_gap: evidenceGap,
      mapping: { path: mappingRelative, sha256: sha256(mappingBytes) },
    });
  }
  const additionKeys = new Set(additions.map((row) => row.candidate_key));
  assertAcyclic([
    ...priorDecisions.filter((row) => !additionKeys.has(row.candidate_key)),
    ...additions,
  ]);
  const integrationRelative =
    `${campaign}/integration-receipts/${batchId}${
      focusedAliasHead ? "-alias-head" : ""
    }-adjudicated-nonpositive-v1.json`;
  const integrationBytes = json({
    schema_version: 1,
    contract_id: "plan-052-wave-integration-receipt-v1",
    plan_id: "plan-052",
    batch_id: batchId,
    partition: "blind_adjudicated_nonpositive",
    integrated_at: integratedAt,
    integrator: "plan-052-single-frontier-integrator",
    manifest: manifestPointer,
    primary_receipt: pointer(primaryRelative),
    independent_receipt: pointer(independentRelative),
    blind_adjudication_receipt: pointer(adjudicationRelative),
    accepted_artifacts: artifacts,
    exact_arithmetic: {
      candidate_count: artifacts.length,
      observation_count: observationCount,
      insufficient_evidence: artifacts.filter((row) =>
        row.disposition === "insufficient_evidence"
      ).length,
      outside_domain: artifacts.filter((row) =>
        row.disposition === "outside_domain"
      ).length,
      rejected: artifacts.filter((row) => row.disposition === "rejected").length,
      duplicate_alias: artifacts.filter((row) =>
        row.disposition === "duplicate_alias"
      ).length,
      published_withheld_for_positive_integrator:
        [...adjudication.values()].filter((row) =>
          row.recommended_disposition === "published"
        ).length,
      alias_head_candidates_withheld_for_positive_integrator:
        withheldAliasHeadCandidateIds.length,
    },
    provider_usage: {
      request_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
    },
  });
  files.set(integrationRelative, integrationBytes);
  files.set(
    `${campaign}/reconciliation-receipts/${batchId}${
      focusedAliasHead ? "-alias-head" : ""
    }-blind-adjudication-v2.json`,
    json({
      schema_version: 1,
      contract_id: "plan-052-review-reconciliation-receipt-v2",
      plan_id: "plan-052",
      batch_id: batchId,
      reconciled_at: integratedAt,
      reconciler: "plan-052-single-frontier-integrator",
      manifest: manifestPointer,
      primary_receipt: pointer(primaryRelative),
      independent_receipt: pointer(independentRelative),
      blind_adjudication_receipt: pointer(adjudicationRelative),
      accepted_nonpositive_integration_receipt: {
        path: integrationRelative,
        sha256: sha256(integrationBytes),
      },
      published_candidate_ids:
        [...adjudication.values()]
          .filter((row) => row.recommended_disposition === "published")
          .map((row) => row.candidate_id)
          .sort(),
      alias_head_candidate_ids:
        withheldAliasHeadCandidateIds.sort(),
    }),
  );
  return files;
}

function writeOrCheck(
  mode: "--write" | "--check" | "--repair-unaccepted",
  batchId: string,
  files: ReadonlyMap<string, string>,
): void {
  if (mode === "--repair-unaccepted") {
    let repairVersion = 1;
    let repairRelative =
      `${campaign}/integration-receipts/${batchId}-adjudicated-unaccepted-repair-v${repairVersion}.json`;
    while (existsSync(absolute(repairRelative))) {
      repairVersion += 1;
      repairRelative =
        `${campaign}/integration-receipts/${batchId}-adjudicated-unaccepted-repair-v${repairVersion}.json`;
    }
    const changed = [...files].flatMap(([relativePath, content]) => {
      if (!existsSync(absolute(relativePath))) {
        throw new Error(`unaccepted repair target is missing: ${relativePath}`);
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
      throw new Error(`${batchId} has no unaccepted integration drift`);
    }
    mkdirSync(dirname(absolute(repairRelative)), { recursive: true });
    writeFileSync(absolute(repairRelative), json({
      schema_version: 1,
      contract_id: "plan-052-unaccepted-integration-repair-v1",
      plan_id: "plan-052",
      batch_id: batchId,
      repaired_at: "2026-07-30T18:05:00.000Z",
      integrator: "plan-052-single-frontier-integrator",
      reason:
        "The first deterministic frontier replay rejected an empty rationale before any accepted checkpoint. This append-only receipt preserves every replaced byte hash while the rejected artifacts are regenerated from the same immutable reviewer authorities.",
      changed_files: changed,
    }), "utf8");
  }
  for (const [relativePath, content] of files) {
    const target = absolute(relativePath);
    if (mode === "--write") {
      if (existsSync(target)) {
        throw new Error(`Plan 052 artifact already exists: ${relativePath}`);
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    } else if (mode === "--repair-unaccepted") {
      writeFileSync(target, content, "utf8");
    } else if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      throw new Error(`Plan 052 artifact is stale: ${relativePath}`);
    }
  }
}

const batchId = process.argv[2];
const mode = process.argv[3];
const focusedAliasHead = process.argv[4] === "--focused-alias-head";
if (
  !batchId ||
  !/^w2-[a-z0-9-]+$/u.test(batchId) ||
  (mode !== "--write" &&
    mode !== "--check" &&
    mode !== "--repair-unaccepted") ||
  (process.argv.length !== 4 &&
    !(process.argv.length === 5 && focusedAliasHead))
) {
  throw new Error(
    "usage: bun scripts/integrate-plan052-adjudicated-nonpositive-batch.ts <w2-batch-id> --write|--check|--repair-unaccepted [--focused-alias-head]",
  );
}
const files = expectedFiles(batchId, focusedAliasHead);
writeOrCheck(mode, batchId, files);
console.log(
  `Plan 052 ${batchId} adjudicated nonpositive partition ${
    mode === "--write"
      ? "applied"
      : mode === "--repair-unaccepted"
      ? "repaired before acceptance"
      : "verified"
  }: ${[...files.keys()].filter((path) => path.startsWith(`${decisionDir}/`)).length} candidates.`,
);
