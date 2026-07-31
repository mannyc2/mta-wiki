import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";

type Evidence = {
  record_id: string;
  source_id: string;
  evidence_id: string;
};
type FrozenCandidate = {
  candidate_id: string;
  candidate_key: string;
  disposition: string;
  observation_event_record_ids: string[];
  observation_relation_record_ids: string[];
  evidence_bindings: Evidence[];
};
type Finding = Record<string, unknown> & {
  candidate_id: string;
  candidate_key: string;
  recommended_disposition: string;
};
type ExistingDecision = {
  candidate_key: string;
  disposition: string;
  canonical_candidate_key: string | null;
};

const campaign =
  "data/operational-episode-resolution/campaigns/plan-052";
const frozenCandidatesRelative =
  `${campaign}/frozen-frontier/candidate_ledger.jsonl`;
const decisionDir =
  "data/operational-episode-resolution/decisions/accepted-current";
const mappingDir =
  "data/operational-episode-resolution/adapters/accepted-current";
const integratedAt = "2026-07-30T14:00:00.000Z";

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
function canonicalTarget(finding: Finding): string | null {
  for (
    const field of [
      "canonical_candidate_id",
      "canonical_candidate_key",
      "target_candidate_id",
      "alias_target_candidate_id",
      "duplicate_target_candidate_id",
    ]
  ) {
    const value = finding[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
function review(
  relativePath: string,
  batchId: string,
  manifest: { path: string; sha256: string },
  role: "primary" | "independent",
): Map<string, Finding> {
  const input = object(
    JSON.parse(readFileSync(absolute(relativePath), "utf8")) as unknown,
    relativePath,
  );
  const provider = object(input.provider_usage, `${relativePath}.provider_usage`);
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
    const finding = {
      ...row,
      candidate_id: String(row.candidate_id),
      candidate_key: String(row.candidate_key),
      recommended_disposition: String(
        row.recommended_disposition ?? row.semantic_outcome,
      ),
    };
    if (findings.has(finding.candidate_id)) {
      throw new Error(`${relativePath} repeats ${finding.candidate_id}`);
    }
    findings.set(finding.candidate_id, finding);
  }
  return findings;
}
function existingAliasDecisions(): ExistingDecision[] {
  if (!existsSync(absolute(decisionDir))) return [];
  return readdirSync(absolute(decisionDir))
    .filter((name) => name.endsWith(".json"))
    .sort()
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
      throw new Error(`duplicate alias ${decision.candidate_key} lacks canonical target`);
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
      if (seen.has(cursor)) {
        throw new Error(`cyclic duplicate-alias chain at ${cursor}`);
      }
      seen.add(cursor);
      cursor = graph.get(cursor);
    }
  }
}

function expectedFiles(batchId: string): Map<string, string> {
  const manifestRelative = `${campaign}/batches/${batchId}.json`;
  const primaryRelative =
    `${campaign}/proposed-review-receipts/${batchId}/primary.json`;
  const cleanIndependentRelative =
    `${campaign}/proposed-review-receipts/${batchId}/independent-clean.json`;
  const independentRelative = existsSync(absolute(cleanIndependentRelative))
    ? cleanIndependentRelative
    : `${campaign}/proposed-review-receipts/${batchId}/independent.json`;
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
  if (
    [...primary.keys()].sort().join("\n") !== manifestCandidateIds.join("\n") ||
    [...independent.keys()].sort().join("\n") !==
      manifestCandidateIds.join("\n")
  ) {
    throw new Error(`${batchId} reviewer candidate partitions are incomplete`);
  }
  const candidates = readJsonl<FrozenCandidate>(frozenCandidatesRelative);
  const candidatesById = new Map(candidates.map((row) => [row.candidate_id, row]));
  const candidatesByKey = new Map(candidates.map((row) => [row.candidate_key, row]));
  const agreed = manifestCandidateIds.flatMap((candidateId) => {
    const first = primary.get(candidateId)!;
    const second = independent.get(candidateId)!;
    const firstTarget = canonicalTarget(first);
    const secondTarget = canonicalTarget(second);
    return first.recommended_disposition === "duplicate_alias" &&
        second.recommended_disposition === "duplicate_alias" &&
        firstTarget !== null &&
        firstTarget === secondTarget
      ? [{ first, second, target: firstTarget }]
      : [];
  });
  if (agreed.length === 0) {
    throw new Error(`${batchId} has no agreed duplicate-alias partition`);
  }
  const files = new Map<string, string>();
  const artifacts: Array<Record<string, unknown>> = [];
  const mappingArtifacts: Array<Record<string, unknown>> = [];
  const additions: ExistingDecision[] = [];
  for (const { first, second, target } of agreed) {
    const row = candidatesById.get(first.candidate_id);
    if (
      !row ||
      row.disposition !== "pending_review" ||
      row.candidate_key !== first.candidate_key ||
      row.candidate_key !== second.candidate_key ||
      row.evidence_bindings.length === 0
    ) {
      throw new Error(`${first.candidate_id} frozen membership drifted`);
    }
    const targetRow = target.startsWith("candidate:")
      ? candidatesById.get(target)
      : candidatesByKey.get(target);
    if (!targetRow || targetRow.candidate_key === row.candidate_key) {
      throw new Error(`${first.candidate_id} has invalid canonical target ${target}`);
    }
    const suffix = first.candidate_id.replace("candidate:", "");
    const decisionId = `plan-052-${batchId}-alias-${suffix}`;
    const decisionRelative = `${decisionDir}/${decisionId}.json`;
    const decisionBytes = json({
      schema_version: 1,
      decision_id: decisionId,
      candidate_key: row.candidate_key,
      disposition: "duplicate_alias",
      canonical_candidate_key: targetRow.candidate_key,
      successor_occurrence_ids: [],
      reviewer: `plan-052-${batchId}-reconciled-dual-review`,
      decided_at: integratedAt,
      rationale:
        `Primary and independent Plan 052 reviews agree this frozen candidate is a duplicate of ${targetRow.candidate_id}. Primary: ${String(first.assessment)} Independent: ${String(second.assessment)}`,
      evidence_bindings: row.evidence_bindings,
      projection_retirement_id: null,
      projection_retirement_sha256: null,
    });
    files.set(decisionRelative, decisionBytes);
    const mappingId = `plan-052-${batchId}-alias-mapping-${suffix}`;
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
        `The frozen observation component is exactly assigned to its reviewed duplicate-alias candidate; the alias decision preserves its canonical target without minting another occurrence.`,
    });
    files.set(mappingRelative, mappingBytes);
    mappingArtifacts.push({
      candidate_id: row.candidate_id,
      mapping: { path: mappingRelative, sha256: sha256(mappingBytes) },
    });
    additions.push({
      candidate_key: row.candidate_key,
      disposition: "duplicate_alias",
      canonical_candidate_key: targetRow.candidate_key,
    });
    artifacts.push({
      candidate_id: row.candidate_id,
      canonical_candidate_id: targetRow.candidate_id,
      decision: { path: decisionRelative, sha256: sha256(decisionBytes) },
    });
  }
  const additionKeys = new Set(additions.map((decision) => decision.candidate_key));
  assertAcyclic([
    ...existingAliasDecisions().filter((decision) =>
      !additionKeys.has(decision.candidate_key)
    ),
    ...additions,
  ]);
  const integrationRelative =
    `${campaign}/integration-receipts/${batchId}-agreed-alias.json`;
  const integrationBytes = json({
    schema_version: 1,
    contract_id: "plan-052-wave-integration-receipt-v1",
    plan_id: "plan-052",
    batch_id: batchId,
    partition: "agreed_duplicate_alias",
    integrated_at: integratedAt,
    integrator: "plan-052-single-frontier-integrator",
    manifest: manifestPointer,
    review_receipts: [
      pointer(primaryRelative),
      pointer(independentRelative),
    ],
    accepted_artifacts: artifacts,
    terminal_arithmetic: {
      accepted_candidate_count: artifacts.length,
      duplicate_alias: artifacts.length,
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
  const mappingIntegrationRelative =
    `${campaign}/integration-receipts/${batchId}-agreed-alias-observation-mappings.json`;
  files.set(mappingIntegrationRelative, json({
    schema_version: 1,
    contract_id: "plan-052-wave-integration-receipt-v1",
    plan_id: "plan-052",
    batch_id: batchId,
    partition: "agreed_duplicate_alias_observation_mappings",
    integrated_at: integratedAt,
    integrator: "plan-052-single-frontier-integrator",
    manifest: manifestPointer,
    alias_integration_receipt: {
      path: integrationRelative,
      sha256: sha256(integrationBytes),
    },
    accepted_artifacts: mappingArtifacts,
    exact_arithmetic: {
      mapped_candidate_count: mappingArtifacts.length,
      mapped_observation_count: mappingArtifacts.length,
    },
  }));
  return files;
}

function writeOrCheck(
  mode: "--write" | "--check" | "--augment-mappings",
  files: Map<string, string>,
): void {
  for (const [relativePath, content] of files) {
    const target = absolute(relativePath);
    if (mode === "--write") {
      if (existsSync(target)) {
        throw new Error(`Plan 052 batch artifact already exists: ${relativePath}`);
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    } else if (mode === "--augment-mappings") {
      const isAugmentation =
        relativePath.startsWith(`${mappingDir}/`) ||
        relativePath.endsWith("-agreed-alias-observation-mappings.json");
      if (isAugmentation) {
        if (existsSync(target)) {
          throw new Error(
            `Plan 052 alias mapping augmentation already exists: ${relativePath}`,
          );
        }
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content, "utf8");
      } else if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
        throw new Error(`Plan 052 prior alias artifact is stale: ${relativePath}`);
      }
    } else if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      throw new Error(`Plan 052 batch artifact is stale: ${relativePath}`);
    }
  }
}

const batchId = process.argv[2];
const mode = process.argv[3];
if (
  !batchId ||
  !/^w2-[a-z0-9-]+$/u.test(batchId) ||
  (mode !== "--write" && mode !== "--check" && mode !== "--augment-mappings") ||
  process.argv.length !== 4
) {
  throw new Error(
    "usage: bun scripts/integrate-plan052-agreed-alias-batch.ts <w2-batch-id> --write|--check|--augment-mappings",
  );
}
const files = expectedFiles(batchId);
writeOrCheck(mode, files);
console.log(
  `Plan 052 ${batchId} agreed alias partition ${
    mode === "--write"
      ? "applied"
      : mode === "--augment-mappings"
      ? "augmented with exact observation mappings"
      : "verified"
  }: ${[...files.keys()].filter((path) =>
    path.startsWith(`${decisionDir}/`) &&
    basename(path).startsWith(`plan-052-${batchId}-alias-`)
  ).length} candidates.`,
);
