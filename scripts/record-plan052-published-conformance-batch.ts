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

const campaign = "data/operational-episode-resolution/campaigns/plan-052";
const resolvedApplicationsRelative =
  "data/resolved-transit/operator/v1/interventions/applications.jsonl";
const allowedBatches = new Set([
  "w2-qbnr-published-01",
  "w2-qbnr-published-02",
  "w2-qbnr-published-03",
]);

type Finding = Record<string, unknown> & {
  candidate_id: string;
  candidate_key: string;
  occurrence_id: string;
  routes: string[];
  treatments: string[];
  phases: string[];
};

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}

function sha256(value: string | Buffer): string {
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
  return Array.isArray(value)
    ? value.flatMap((entry) =>
      typeof entry === "string" && entry.trim() ? [entry.trim()] : []
    )
    : [];
}

function exactStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right)
  );
}

function findings(
  relativePath: string,
  batchId: string,
  role: "primary" | "independent",
  manifest: { path: string; sha256: string },
): Map<string, Finding> {
  const receipt = object(
    JSON.parse(readFileSync(absolute(relativePath), "utf8")) as unknown,
    relativePath,
  );
  const embeddedManifest = receipt.manifest === undefined
    ? null
    : object(receipt.manifest, `${relativePath}.manifest`);
  const provider = object(
    receipt.provider_usage,
    `${relativePath}.provider_usage`,
  );
  const arithmetic = receipt.arithmetic === undefined
    ? null
    : object(receipt.arithmetic, `${relativePath}.arithmetic`);
  const providerCalled =
    provider.provider_called ??
      ((provider.provider === "none" ||
          (provider.model === null && provider.profile === null))
        ? false
        : undefined);
  const findingContainer = Array.isArray(receipt.findings)
    ? receipt.findings
    : object(
      receipt.findings,
      `${relativePath}.findings`,
    ).candidate_findings;
  if (
    receipt.schema_version !== 1 ||
    receipt.contract_id !== "plan-052-semantic-review-receipt-v1" ||
    receipt.batch_id !== batchId ||
    (receipt.review_role ?? receipt.role) !== role ||
    (receipt.manifest_path ?? embeddedManifest?.path) !== manifest.path ||
    (receipt.manifest_sha256 ?? embeddedManifest?.sha256) !== manifest.sha256 ||
    (receipt.review_complete ?? arithmetic?.arithmetic_ok) !== true ||
    providerCalled !== false ||
    (provider.request_count ?? provider.provider_requests) !== 0 ||
    provider.input_tokens !== 0 ||
    provider.output_tokens !== 0 ||
    (provider.estimated_cost_usd ?? provider.committed_cost_usd ?? 0) !== 0 ||
    provider.actual_cost_usd !== 0 ||
    !Array.isArray(findingContainer)
  ) {
    throw new Error(`${relativePath} is incomplete, stale, or not no-cost`);
  }
  const result = new Map<string, Finding>();
  for (const [index, value] of findingContainer.entries()) {
    const row = object(value, `${relativePath}.findings[${index}]`);
    if (typeof row.candidate_id !== "string") continue;
    const disposition = row.recommended_disposition ?? row.semantic_outcome;
    const applications = Array.isArray(row.applications)
      ? row.applications.map((application, applicationIndex) =>
        object(
          application,
          `${relativePath}.findings[${index}].applications[${applicationIndex}]`,
        )
      )
      : [];
    const routeFromIncidence =
      typeof row.incidence_route === "string" &&
        row.incidence_route.includes("|")
        ? [row.incidence_route.split("|").at(-1)!]
        : [];
    const routes = exactStrings([
      ...strings(row.route_record_ids),
      ...strings(row.route_ids),
      ...applications.map((application) =>
        String(application.route_record_id ?? "")
      ).filter(Boolean),
      ...routeFromIncidence,
    ]);
    const treatments = exactStrings([
      ...strings(row.treatment_record_ids),
      ...strings(row.treatment_ids),
      ...strings(row.incidence_treatments),
      ...applications.map((application) =>
        String(application.treatment_record_id ?? "")
      ).filter(Boolean),
    ]);
    const phases = exactStrings([
      ...strings(row.phase_record_ids),
      ...(typeof row.incidence_phase === "string"
        ? [row.incidence_phase]
        : []),
      ...applications.map((application) =>
        typeof application.phase_record_id === "string"
          ? application.phase_record_id
          : ""
      ).filter(Boolean),
      ...strings(row.observation_event_record_ids),
      ...strings(row.observation_ids),
    ]);
    const occurrenceId = String(
      row.published_occurrence_id ??
        applications[0]?.published_occurrence_id ??
        applications[0]?.occurrence_id ??
        "",
    );
    if (
      disposition !== "published" ||
      !occurrenceId.startsWith("occurrence:") ||
      routes.length !== 1 ||
      treatments.length === 0 ||
      phases.length !== 1
    ) {
      throw new Error(
        `${relativePath}.findings[${index}] is not exact published conformance`,
      );
    }
    const finding: Finding = {
      ...row,
      candidate_id: String(row.candidate_id),
      candidate_key: String(row.candidate_key),
      occurrence_id: occurrenceId,
      routes,
      treatments,
      phases,
    };
    if (result.has(finding.candidate_id)) {
      throw new Error(`${relativePath} repeats ${finding.candidate_id}`);
    }
    result.set(finding.candidate_id, finding);
  }
  return result;
}

function expected(batchId: string): string {
  const manifestRelative = `${campaign}/batches/${batchId}.json`;
  const manifestPointer = pointer(manifestRelative);
  const manifest = object(
    JSON.parse(readFileSync(absolute(manifestRelative), "utf8")) as unknown,
    manifestRelative,
  );
  const candidateIds = strings(manifest.candidate_ids).sort();
  const expectedArithmetic = object(
    manifest.expected_arithmetic,
    `${manifestRelative}.expected_arithmetic`,
  );
  const primaryRelative =
    `${campaign}/proposed-review-receipts/${batchId}/primary.json`;
  const independentRelative =
    `${campaign}/proposed-review-receipts/${batchId}/independent.json`;
  const primary = findings(
    primaryRelative,
    batchId,
    "primary",
    manifestPointer,
  );
  const independent = findings(
    independentRelative,
    batchId,
    "independent",
    manifestPointer,
  );
  if (
    [...primary.keys()].sort().join("\n") !== candidateIds.join("\n") ||
    [...independent.keys()].sort().join("\n") !== candidateIds.join("\n")
  ) {
    throw new Error(`${batchId} review membership is not exact`);
  }
  const resolvedApplications = readFileSync(
    absolute(resolvedApplicationsRelative),
    "utf8",
  ).split(/\r?\n/u).filter(Boolean).map((line) =>
    JSON.parse(line) as {
      occurrence_id: string;
      route_record_id: string;
      treatment_record_id: string;
      phase_record_id: string;
    }
  );
  const artifacts = candidateIds.map((candidateId) => {
    const first = primary.get(candidateId)!;
    const second = independent.get(candidateId)!;
    const firstIncidence = first.routes.flatMap((route) =>
      first.treatments.flatMap((treatment) =>
        first.phases.map((phase) => `${route}|${treatment}|${phase}`)
      )
    ).sort();
    const secondIncidence = second.routes.flatMap((route) =>
      second.treatments.flatMap((treatment) =>
        second.phases.map((phase) => `${route}|${treatment}|${phase}`)
      )
    ).sort();
    const currentIncidence = resolvedApplications
      .filter((row) => row.occurrence_id === first.occurrence_id)
      .map((row) =>
        `${row.route_record_id}|${row.treatment_record_id}|${row.phase_record_id}`
      )
      .sort();
    if (
      first.candidate_key !== second.candidate_key ||
      first.occurrence_id !== second.occurrence_id ||
      firstIncidence.join("\n") !== secondIncidence.join("\n") ||
      firstIncidence.join("\n") !== currentIncidence.join("\n")
    ) {
      throw new Error(`${candidateId} published conformance drifted`);
    }
    return {
      candidate_id: candidateId,
      candidate_key: first.candidate_key,
      occurrence_id: first.occurrence_id,
      exact_route_treatment_incidence: firstIncidence,
    };
  });
  return json({
    schema_version: 1,
    contract_id: "plan-052-published-conformance-integration-v2",
    plan_id: "plan-052",
    batch_id: batchId,
    recorded_at: "2026-07-30T20:00:00.000Z",
    integrator: "plan-052-single-frontier-integrator",
    manifest: manifestPointer,
    primary_receipt: pointer(primaryRelative),
    independent_receipt: pointer(independentRelative),
    resolved_applications: pointer(resolvedApplicationsRelative),
    candidate_count: artifacts.length,
    observation_count: Number(
      expectedArithmetic.required_accounted_observation_count,
    ),
    exact_application_count: artifacts.reduce(
      (sum, artifact) =>
        sum + artifact.exact_route_treatment_incidence.length,
      0,
    ),
    artifacts,
    canonical_observations_changed: false,
    current_decisions_changed: false,
    publication_or_release_authorized: false,
  });
}

const batchId = process.argv[2];
const mode = process.argv[3];
if (
  !batchId ||
  !allowedBatches.has(batchId) ||
  (mode !== "--write" && mode !== "--check") ||
  process.argv.length !== 4
) {
  throw new Error(
    "usage: bun scripts/record-plan052-published-conformance-batch.ts <w2-qbnr-published-01|02|03> --write|--check",
  );
}
  const output =
  `${campaign}/integration-receipts/${batchId}-published-conformance-v2.json`;
const bytes = expected(batchId);
if (mode === "--write") {
  if (existsSync(absolute(output))) {
    throw new Error(`published conformance receipt already exists: ${output}`);
  }
  mkdirSync(dirname(absolute(output)), { recursive: true });
  writeFileSync(absolute(output), bytes, "utf8");
} else if (
  !existsSync(absolute(output)) ||
  readFileSync(absolute(output), "utf8") !== bytes
) {
  throw new Error(`${batchId} published conformance receipt drifted`);
}
console.log(
  `Plan 052 ${batchId} published conformance ${
    mode === "--write" ? "recorded" : "verified"
  }: exact frozen identity and application incidence preserved.`,
);
