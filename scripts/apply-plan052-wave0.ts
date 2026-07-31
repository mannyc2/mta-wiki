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
import {
  operationalOccurrenceCurrentReviewMembershipFingerprint,
  parseOperationalOccurrenceAcceptedDecisionV3,
  type OperationalOccurrenceAcceptedDecisionV3,
} from "../packages/pipeline/src/materialize/operational-occurrence-resolution";
import {
  resolvedInterventionDurableApplicationIdentity,
} from "../packages/pipeline/src/materialize/resolved-intervention-applications";
import {
  parseOperationalOccurrencesJsonl,
  type OperationalOccurrenceEvidenceBinding,
} from "../packages/pipeline/src/materialize/operational-occurrences";

const batchId = "w0-unresolved-identities";
const manifestRelative =
  `data/operational-episode-resolution/campaigns/plan-052/batches/${batchId}.json`;
const primaryReceiptRelative =
  `data/operational-episode-resolution/campaigns/plan-052/review-receipts/${batchId}/primary.json`;
const independentReceiptRelative =
  `data/operational-episode-resolution/campaigns/plan-052/review-receipts/${batchId}/independent.json`;
const currentReviewRelative =
  "data/operational-occurrence-review/accepted-current/decisions/plan-052-flatbush-phase1-current-resolution.json";
const currentCandidateDecisionDir =
  "data/operational-episode-resolution/decisions/accepted-current";
const releaseOccurrencesRelative =
  "data/exports/releases/v1-rc28/operational_occurrences.jsonl";
const legacyFlatbushRelative =
  "data/operational-occurrence-review/accepted/decisions/flatbush-phase1-center-running-bus-lanes-2025-09.json";
const frozenCandidateLedgerRelative =
  "data/operational-episode-resolution/campaigns/plan-052/frozen-frontier/candidate_ledger.jsonl";

const primaryReviewer = "plan-052-primary-unresolved-identities";
const independentReviewer = "plan-052-independent-unresolved-identities";
const flatbushOccurrenceId = "occurrence:8c987704152b459014217d44";
const openingPhaseId = "event_flatbush-phase1-operational-opening-2025-10-02";

const retirementSpecs = [
  {
    route: "q6",
    occurrence_id: "occurrence:ddb7be06c9eb2b6292ef86c9",
    candidate_key: "event:event_q6-qbnr-service-change-2025-08-31",
    retirement_id: "q6-q06-current-ineligible-2026-07-18",
    receipt:
      "data/route-identity/operational-projection-retirements/v1/q6-q06-current-ineligible-2026-07-18.json",
  },
  {
    route: "q7",
    occurrence_id: "occurrence:c5e9aba290ca2be1be6fb38e",
    candidate_key: "event:event_q7-route-redesign-effective-2025-08-31",
    retirement_id: "q7-q07-current-ineligible-2026-07-18",
    receipt:
      "data/route-identity/operational-projection-retirements/v1/q7-q07-current-ineligible-2026-07-18.json",
  },
  {
    route: "q8",
    occurrence_id: "occurrence:934b8066ac790c3820f764d1",
    candidate_key: "event:event_q8-route-redesign-effective-2025-08-31",
    retirement_id: "q8-q08-current-ineligible-2026-07-18",
    receipt:
      "data/route-identity/operational-projection-retirements/v1/q8-q08-current-ineligible-2026-07-18.json",
  },
  {
    route: "q9",
    occurrence_id: "occurrence:9d9f23af3933cda5d4dc1abd",
    candidate_key: "event:event_q9-qbnr-service-change-2025-08-31",
    retirement_id: "q9-q09-current-ineligible-2026-07-18",
    receipt:
      "data/route-identity/operational-projection-retirements/v1/q9-q09-current-ineligible-2026-07-18.json",
  },
] as const;

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function verifyReviewReceipt(
  relativePath: string,
  reviewer: string,
  manifestSha256: string,
): void {
  if (!existsSync(absolute(relativePath))) {
    throw new Error(`Wave 0 review receipt is missing: ${relativePath}`);
  }
  const input = object(
    JSON.parse(readFileSync(absolute(relativePath), "utf8")) as unknown,
    relativePath,
  );
  if (
    input.schema_version !== 1 ||
    input.contract_id !== "plan-052-semantic-review-receipt-v1" ||
    input.batch_id !== batchId ||
    input.manifest_path !== manifestRelative ||
    input.manifest_sha256 !== manifestSha256 ||
    input.reviewer !== reviewer ||
    input.provider_called !== false ||
    input.provider_request_count !== 0 ||
    input.provider_input_tokens !== 0 ||
    input.provider_output_tokens !== 0 ||
    input.provider_cost_usd !== 0 ||
    input.review_complete !== true ||
    input.disagreement_count !== 0
  ) {
    throw new Error(`${relativePath} is stale or does not record complete no-cost agreement`);
  }
  if (!Array.isArray(input.findings) || input.findings.length !== 5) {
    throw new Error(`${relativePath}.findings must cover all five Wave 0 candidates`);
  }
  const actions = new Map(input.findings.map((finding, index) => {
    const row = object(finding, `${relativePath}.findings[${index}]`);
    return [String(row.occurrence_id), String(row.accepted_action)];
  }));
  if (actions.get(flatbushOccurrenceId) !== "establish_current_resolution") {
    throw new Error(`${relativePath} does not accept the Flatbush current resolution`);
  }
  for (const spec of retirementSpecs) {
    if (
      actions.get(spec.occurrence_id) !==
        "terminal_projection_retired_candidate"
    ) {
      throw new Error(
        `${relativePath} does not accept ${spec.route.toUpperCase()} projection retirement`,
      );
    }
  }
}

function sortedEvidence(
  values: readonly OperationalOccurrenceEvidenceBinding[],
): OperationalOccurrenceEvidenceBinding[] {
  return [...new Map(values.map((binding) => [
    [
      binding.role,
      binding.record_id,
      binding.source_id,
      binding.evidence_id,
    ].join("|"),
    binding,
  ])).values()].sort((left, right) =>
    [
      left.role,
      left.record_id,
      left.source_id,
      left.evidence_id,
    ].join("|").localeCompare([
      right.role,
      right.record_id,
      right.source_id,
      right.evidence_id,
    ].join("|"))
  );
}

function flatbushDecision(): OperationalOccurrenceAcceptedDecisionV3 {
  const row = parseOperationalOccurrencesJsonl(
    readFileSync(absolute(releaseOccurrencesRelative), "utf8"),
  ).find((entry) => entry.occurrence_id === flatbushOccurrenceId);
  if (!row) throw new Error("released Flatbush occurrence is missing");
  const legacy = object(
    JSON.parse(readFileSync(absolute(legacyFlatbushRelative), "utf8")) as unknown,
    legacyFlatbushRelative,
  );
  if (
    row.phase_record_ids.join("\n") !== [
      "event_flatbush-phase1-installation-start-sep2025",
      openingPhaseId,
    ].sort().join("\n") ||
    row.routes.map((route) => route.gtfs_route_id).sort().join("\n") !==
      ["B41", "B67"].join("\n") ||
    row.treatment.kind !== "atomic"
  ) {
    throw new Error("Flatbush exact incidence inputs drifted");
  }
  const treatment = row.treatment.member;
  const applications = row.routes.map((route) => {
    const evidence = sortedEvidence([
      ...route.evidence_bindings,
      ...treatment.evidence_bindings,
      ...row.phase_relation_evidence_bindings,
      ...row.physical_scope_evidence_bindings,
    ]);
    return {
      application_id: resolvedInterventionDurableApplicationIdentity({
        occurrence_id: row.occurrence_id,
        route_record_id: route.route_record_id,
        treatment_record_id: treatment.treatment_record_id,
        phase_record_id: openingPhaseId,
      }),
      route_record_id: route.route_record_id,
      gtfs_route_id: route.gtfs_route_id,
      treatment_record_id: treatment.treatment_record_id,
      phase_record_id: openingPhaseId,
      action: "unknown" as const,
      physical_scope_record_ids: [...row.physical_scope_record_ids].sort(),
      extent: {
        kind: "bounded_segment" as const,
        record_ids: [...row.physical_scope_record_ids].sort(),
        description:
          "Center-running bus-lane segment on Flatbush Avenue from Livingston Street to State Street.",
      },
      evidence_bindings: evidence,
    };
  }).sort((left, right) =>
    left.route_record_id.localeCompare(right.route_record_id)
  );
  if (applications.length !== 2) {
    throw new Error("Flatbush review must produce two exact route incidences");
  }
  const withoutFingerprint = {
    schema_version: 3 as const,
    decision_id: "plan-052-flatbush-phase1-current-resolution",
    review_state: "approved" as const,
    occurrence_id: row.occurrence_id,
    founding_key: row.founding_key,
    anchor_review_decision_ids: [...row.provenance.anchor_review_decision_ids].sort(),
    observation_event_record_ids: row.observations.map((observation) =>
      observation.event_record_id
    ).sort(),
    observation_relation_record_ids: [...row.provenance.relation_record_ids].sort(),
    resolution_cluster_id: row.resolution_cluster_id,
    phase_record_ids: [...row.phase_record_ids].sort(),
    phase_relation_record_ids: [...row.phase_relation_record_ids].sort(),
    physical_scope_record_ids: [...row.physical_scope_record_ids].sort(),
    physical_scope_relation_record_ids:
      [...row.physical_scope_relation_record_ids].sort(),
    resolved_onset: legacy.resolved_onset,
    routes: [...row.routes].sort((left, right) =>
      left.route_record_id.localeCompare(right.route_record_id)
    ),
    treatment: row.treatment,
    applications,
    evidence_bindings: sortedEvidence(row.evidence_bindings),
    reviewers: [independentReviewer, primaryReviewer].sort(),
    accepted_at: "2026-07-30T00:00:00.000Z",
    rationale:
      "Two independent Plan 052 reviews agree that the September installation commencement and October 2 operational opening are related phases of one bounded Flatbush Phase 1 episode. The exact current application incidence is B41 and B67, each paired once with the single center-running bus-lane treatment and the October 2 opening phase. This is two applications, never a route-by-phase cross-product. Action remains unknown for Plan 053.",
    operation: "establish_current_resolution" as const,
    supersedes_decision_id: null,
    supersedes_membership_fingerprint: null,
    review_scope: "full_episode_application" as const,
  };
  return parseOperationalOccurrenceAcceptedDecisionV3({
    ...withoutFingerprint,
    membership_fingerprint:
      operationalOccurrenceCurrentReviewMembershipFingerprint(withoutFingerprint),
  });
}

function expectedFiles(): Map<string, string> {
  const manifestBytes = readFileSync(absolute(manifestRelative));
  const manifestSha = sha256(manifestBytes);
  verifyReviewReceipt(primaryReceiptRelative, primaryReviewer, manifestSha);
  verifyReviewReceipt(
    independentReceiptRelative,
    independentReviewer,
    manifestSha,
  );
  const candidateRows = readFileSync(
    absolute(frozenCandidateLedgerRelative),
    "utf8",
  ).split(/\r?\n/u).filter(Boolean).map((line) =>
    JSON.parse(line) as {
      candidate_key: string;
      unresolved_active_occurrence_ids: string[];
      evidence_bindings: Array<{
        record_id: string;
        source_id: string;
        evidence_id: string;
      }>;
    }
  );
  const rowsByKey = new Map(candidateRows.map((row) => [
    row.candidate_key,
    row,
  ]));
  const files = new Map<string, string>();
  for (const spec of retirementSpecs) {
    const row = rowsByKey.get(spec.candidate_key);
    if (
      !row ||
      row.unresolved_active_occurrence_ids.join("\n") !== spec.occurrence_id
    ) {
      throw new Error(
        `${spec.route.toUpperCase()} frozen candidate identity membership drifted`,
      );
    }
    const retirementBytes = readFileSync(absolute(spec.receipt));
    const retirement = object(
      JSON.parse(retirementBytes.toString("utf8")) as unknown,
      spec.receipt,
    );
    if (
      retirement.retirement_id !== spec.retirement_id ||
      retirement.state !== "accepted"
    ) {
      throw new Error(`${spec.receipt} is not the expected accepted authority`);
    }
    const decisionId = `plan-052-wave0-retire-projection-${spec.route}`;
    files.set(
      `${currentCandidateDecisionDir}/${decisionId}.json`,
      json({
        schema_version: 1,
        decision_id: decisionId,
        candidate_key: spec.candidate_key,
        disposition: "retired",
        canonical_candidate_key: null,
        successor_occurrence_ids: [],
        reviewer: "plan-052-wave0-dual-review",
        decided_at: "2026-07-30T00:00:00.000Z",
        rationale:
          `Two independent Plan 052 reviews accept ${spec.route.toUpperCase()} as terminally nonpublishable for the pinned route snapshot under the owner-accepted projection-retirement authority. The durable occurrence identity remains active; this decision neither denies the service event nor retires its identity.`,
        evidence_bindings: row.evidence_bindings,
        projection_retirement_id: spec.retirement_id,
        projection_retirement_sha256: sha256(retirementBytes),
      }),
    );
  }
  files.set(currentReviewRelative, json(flatbushDecision()));
  return files;
}

function writeOrCheck(mode: "--write" | "--check", files: Map<string, string>): void {
  for (const [path, content] of files) {
    const target = absolute(path);
    if (mode === "--write") {
      if (existsSync(target)) {
        throw new Error(`Wave 0 semantic artifact already exists: ${path}`);
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    } else if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      throw new Error(`Wave 0 semantic artifact is stale: ${path}`);
    }
  }
}

const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check") {
  throw new Error("usage: bun scripts/apply-plan052-wave0.ts --write|--check");
}
if (process.argv.length !== 3) throw new Error("unknown Wave 0 arguments");
const files = expectedFiles();
writeOrCheck(mode, files);
console.log(
  `Plan 052 Wave 0 ${mode === "--write" ? "applied" : "verified"}: ` +
    "one current resolution, four projection-retired candidates, zero identity retirements.",
);
