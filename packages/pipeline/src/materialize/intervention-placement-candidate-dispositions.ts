import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type {
  PlacementCandidateDisposition,
  PlacementCandidateRow,
} from "./intervention-placement-frontier.js";
import {
  interventionApplicationFingerprint,
  type ApplicationPlacementTransition,
} from "./application-placement-transitions.js";
import type {
  InterventionPlacementIdentityOperation,
  InterventionPlacementRegistryEntry,
} from "./intervention-placements.js";
import type { ResolvedInterventionApplication } from "./resolved-intervention-applications.js";

export type AcceptedPlacementCandidateDisposition = {
  schema_version: 1;
  disposition_id: string;
  candidate_id: string;
  candidate_input_fingerprint: string;
  application_id: string | null;
  disposition: Exclude<PlacementCandidateDisposition, "pending_review" | "invalid">;
  placement_ids: string[];
  transition_ids: string[];
  transition_disposition:
    | "accepted_transition"
    | "accepted_negative_transition"
    | "not_applicable";
  decision_id: string;
  batch_id: string;
  manifest_sha256: string;
  primary_reviewer: string;
  independent_reviewer: string;
  review_outcome: "agreement" | "adjudicated";
  adjudicator: string | null;
  integrator_id: string;
  accepted_at: string;
  reason_code: string;
  rationale: string;
};

const fields = new Set([
  "accepted_at", "adjudicator", "application_id", "batch_id", "candidate_id",
  "candidate_input_fingerprint", "decision_id", "disposition", "disposition_id",
  "independent_reviewer", "integrator_id", "manifest_sha256", "placement_ids",
  "primary_reviewer", "rationale", "reason_code", "review_outcome", "schema_version",
  "transition_disposition", "transition_ids",
]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, path: string): void {
  const extras = Object.keys(value).filter((field) => !fields.has(field)).sort();
  const missing = [...fields].filter((field) => !(field in value)).sort();
  if (extras.length || missing.length) {
    throw new Error(`${path}: exact fields required; unknown=${extras}; missing=${missing}`);
  }
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const result = value.map((entry, index) => string(entry, `${path}[${index}]`));
  if (new Set(result).size !== result.length ||
      result.join("\n") !== [...result].sort((a, b) => a.localeCompare(b)).join("\n")) {
    throw new Error(`${path} must be sorted and unique`);
  }
  return result;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value as JsonValue)).digest("hex");
}

export function placementCandidateInputFingerprint(candidate: PlacementCandidateRow): string {
  return sha256({
    candidate_id: candidate.candidate_id,
    origin: candidate.origin,
    application_id: candidate.application_id,
    observation_record_ids: candidate.observation_record_ids,
  });
}

export function placementCandidateDispositionId(input: Omit<
  AcceptedPlacementCandidateDisposition,
  "disposition_id"
>): string {
  return `candidate-disposition:${sha256({
    candidate_id: input.candidate_id,
    candidate_input_fingerprint: input.candidate_input_fingerprint,
    disposition: input.disposition,
    placement_ids: input.placement_ids,
    transition_ids: input.transition_ids,
    transition_disposition: input.transition_disposition,
    decision_id: input.decision_id,
  }).slice(0, 24)}`;
}

export function parseAcceptedPlacementCandidateDisposition(
  value: unknown,
  path = "accepted placement candidate disposition",
): AcceptedPlacementCandidateDisposition {
  const input = object(value, path);
  exact(input, path);
  if (input.schema_version !== 1) throw new Error(`${path}.schema_version must be 1`);
  const disposition = string(input.disposition, `${path}.disposition`);
  if (!["resolved_placement", "duplicate_alias", "not_a_placement", "ambiguous"].includes(disposition)) {
    throw new Error(`${path}.disposition must be terminal`);
  }
  const transitionDisposition = string(
    input.transition_disposition,
    `${path}.transition_disposition`,
  );
  if (!["accepted_transition", "accepted_negative_transition", "not_applicable"]
    .includes(transitionDisposition)) {
    throw new Error(`${path}.transition_disposition is invalid`);
  }
  const reviewOutcome = string(input.review_outcome, `${path}.review_outcome`);
  if (!["agreement", "adjudicated"].includes(reviewOutcome)) {
    throw new Error(`${path}.review_outcome is invalid`);
  }
  const rowWithoutId = {
    schema_version: 1 as const,
    candidate_id: string(input.candidate_id, `${path}.candidate_id`),
    candidate_input_fingerprint: string(
      input.candidate_input_fingerprint,
      `${path}.candidate_input_fingerprint`,
    ),
    application_id: input.application_id === null
      ? null
      : string(input.application_id, `${path}.application_id`),
    disposition: disposition as AcceptedPlacementCandidateDisposition["disposition"],
    placement_ids: strings(input.placement_ids, `${path}.placement_ids`),
    transition_ids: strings(input.transition_ids, `${path}.transition_ids`),
    transition_disposition: transitionDisposition as AcceptedPlacementCandidateDisposition["transition_disposition"],
    decision_id: string(input.decision_id, `${path}.decision_id`),
    batch_id: string(input.batch_id, `${path}.batch_id`),
    manifest_sha256: string(input.manifest_sha256, `${path}.manifest_sha256`),
    primary_reviewer: string(input.primary_reviewer, `${path}.primary_reviewer`),
    independent_reviewer: string(input.independent_reviewer, `${path}.independent_reviewer`),
    review_outcome: reviewOutcome as AcceptedPlacementCandidateDisposition["review_outcome"],
    adjudicator: input.adjudicator === null
      ? null
      : string(input.adjudicator, `${path}.adjudicator`),
    integrator_id: string(input.integrator_id, `${path}.integrator_id`),
    accepted_at: string(input.accepted_at, `${path}.accepted_at`),
    reason_code: string(input.reason_code, `${path}.reason_code`),
    rationale: string(input.rationale, `${path}.rationale`),
  };
  if (!/^[a-f0-9]{64}$/u.test(rowWithoutId.candidate_input_fingerprint)) {
    throw new Error(`${path}.candidate_input_fingerprint must be sha256`);
  }
  if (!/^[a-f0-9]{64}$/u.test(rowWithoutId.manifest_sha256)) {
    throw new Error(`${path}.manifest_sha256 must be sha256`);
  }
  if (rowWithoutId.primary_reviewer === rowWithoutId.independent_reviewer) {
    throw new Error(`${path}: primary and independent reviewers must be distinct`);
  }
  if (rowWithoutId.review_outcome === "agreement" && rowWithoutId.adjudicator !== null) {
    throw new Error(`${path}: agreement must not name an adjudicator`);
  }
  if (rowWithoutId.review_outcome === "adjudicated" &&
      (rowWithoutId.adjudicator === null ||
       rowWithoutId.adjudicator === rowWithoutId.primary_reviewer ||
       rowWithoutId.adjudicator === rowWithoutId.independent_reviewer)) {
    throw new Error(`${path}: adjudication requires a distinct adjudicator`);
  }
  const row: AcceptedPlacementCandidateDisposition = {
    ...rowWithoutId,
    disposition_id: string(input.disposition_id, `${path}.disposition_id`),
  };
  if (row.disposition_id !== placementCandidateDispositionId(rowWithoutId)) {
    throw new Error(`${path}.disposition_id is stale`);
  }
  return row;
}

export function loadAcceptedPlacementCandidateDispositions(
  dir: string,
): AcceptedPlacementCandidateDisposition[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".json")).sort().map((name) => {
    const path = join(dir, name);
    const disposition = parseAcceptedPlacementCandidateDisposition(
      JSON.parse(readFileSync(path, "utf8")) as unknown,
      path,
    );
    if (`${disposition.decision_id}.json` !== basename(path)) {
      throw new Error(`${path}: decision_id must match file name`);
    }
    return disposition;
  });
}

export function validateAcceptedPlacementCandidateDispositionManifests(
  values: readonly AcceptedPlacementCandidateDisposition[],
  batchesDir: string,
  applications: readonly ResolvedInterventionApplication[] = [],
): AcceptedPlacementCandidateDisposition[] {
  const applicationsById = new Map(applications.map((row) => [row.application_id, row]));
  return values.map((value, index) => {
    const disposition = parseAcceptedPlacementCandidateDisposition(
      value,
      `accepted candidate disposition[${index}]`,
    );
    const path = join(batchesDir, `${disposition.batch_id}.json`);
    if (!existsSync(path)) throw new Error(`${disposition.disposition_id}: missing frozen batch manifest`);
    const content = readFileSync(path, "utf8");
    if (createHash("sha256").update(content).digest("hex") !== disposition.manifest_sha256) {
      throw new Error(`${disposition.disposition_id}: frozen batch manifest hash drifted`);
    }
    const manifest = object(JSON.parse(content) as unknown, path);
    const manifestCandidates = Array.isArray(manifest.candidates)
      ? manifest.candidates.filter((candidate) => {
          const row = object(candidate, `${path}.candidate`);
          return row.candidate_id === disposition.candidate_id &&
            row.application_id === disposition.application_id;
        })
      : [];
    if (manifest.batch_id !== disposition.batch_id || manifestCandidates.length !== 1) {
      throw new Error(`${disposition.disposition_id}: candidate is absent from frozen batch manifest`);
    }
    if (disposition.application_id !== null && applications.length) {
      const application = applicationsById.get(disposition.application_id);
      const manifestCandidate = object(manifestCandidates[0], `${path}.candidate`);
      if (!application || manifestCandidate.application_fingerprint !==
          interventionApplicationFingerprint(application)) {
        throw new Error(`${disposition.disposition_id}: application pin drifted from frozen manifest`);
      }
    }
    const assignments = object(manifest.reviewer_assignments, `${path}.reviewer_assignments`);
    if (assignments.primary_reviewer !== disposition.primary_reviewer ||
        assignments.required_independent_reviewer !== disposition.independent_reviewer ||
        assignments.single_writer_integrator !== disposition.integrator_id ||
        (disposition.review_outcome === "adjudicated" &&
         assignments.clean_room_adjudicator !== disposition.adjudicator)) {
      throw new Error(`${disposition.disposition_id}: reviewer assignment drifted from frozen manifest`);
    }
    return disposition;
  }).sort((a, b) => a.disposition_id.localeCompare(b.disposition_id));
}

function sameReviewReceipt(
  disposition: AcceptedPlacementCandidateDisposition,
  operation: InterventionPlacementIdentityOperation,
): boolean {
  return disposition.decision_id === operation.decision_id &&
    disposition.batch_id === operation.batch_id &&
    disposition.manifest_sha256 === operation.manifest_sha256 &&
    disposition.primary_reviewer === operation.primary_reviewer &&
    disposition.independent_reviewer === operation.independent_reviewer &&
    disposition.review_outcome === operation.review_outcome &&
    disposition.adjudicator === operation.adjudicator &&
    disposition.integrator_id === operation.integrator_id &&
    disposition.accepted_at === operation.issued_at;
}

/**
 * Closes the authorization gap between independently valid accepted journals.
 * Every identity mutation must be owned by a terminal candidate disposition
 * carrying the exact same review receipt, and every registry identity must be
 * accounted for by a disposition. Application actions that require a target
 * may only consume an identity established from different, no-later evidence.
 */
export function validatePlacementDecisionProvenance(input: {
  candidate_dispositions: readonly AcceptedPlacementCandidateDisposition[];
  candidate_ledger: readonly PlacementCandidateRow[];
  identity_operations: readonly InterventionPlacementIdentityOperation[];
  registry: readonly InterventionPlacementRegistryEntry[];
  transitions: readonly ApplicationPlacementTransition[];
}): void {
  const candidates = new Map(input.candidate_ledger.map((row) => [row.candidate_id, row]));
  const dispositions = new Map(input.candidate_dispositions.map((row) => [row.candidate_id, row]));
  const operations = new Map(input.identity_operations.map((row) => [row.operation_id, row]));
  const registry = new Map(input.registry.map((row) => [row.placement_id, row]));
  const dispositionPlacementIds = new Set(
    input.candidate_dispositions.flatMap((row) => row.placement_ids),
  );

  for (const operation of input.identity_operations) {
    const affectedPlacementIds = new Set(input.registry.flatMap((entry) =>
      entry.operation_ids.includes(operation.operation_id) ? [entry.placement_id] : []
    ));
    if (operation.operation === "retire") {
      operation.successor_placement_ids.forEach((id) => affectedPlacementIds.add(id));
    }
    for (const candidateId of operation.candidate_ids) {
      if (!candidates.has(candidateId)) {
        throw new Error(`${operation.operation_id}: identity operation references an unknown candidate`);
      }
      const disposition = dispositions.get(candidateId);
      if (!disposition) {
        throw new Error(`${operation.operation_id}: identity operation lacks a terminal candidate disposition`);
      }
      if (!sameReviewReceipt(disposition, operation)) {
        throw new Error(`${operation.operation_id}: identity review receipt is inconsistent`);
      }
      if ((disposition.disposition !== "resolved_placement" &&
           disposition.disposition !== "duplicate_alias") ||
          [...affectedPlacementIds].some((id) => !disposition.placement_ids.includes(id))) {
        throw new Error(`${operation.operation_id}: identity result is not balanced by its candidate disposition`);
      }
    }
  }

  for (const entry of input.registry) {
    const foundingOperation = operations.get(entry.operation_ids[0] ?? "");
    if (!foundingOperation || foundingOperation.candidate_ids.length === 0) {
      throw new Error(`${entry.placement_id}: placement lacks accepted identity provenance`);
    }
    if (!dispositionPlacementIds.has(entry.placement_id)) {
      throw new Error(`${entry.placement_id}: placement registry is not balanced by candidate dispositions`);
    }
  }

  for (const transition of input.transitions) {
    if (transition.target_placement_ids.length === 0) continue;
    const candidate = input.candidate_ledger.find((row) =>
      row.application_id === transition.application_id
    );
    if (!candidate) throw new Error(`${transition.transition_id}: missing application candidate provenance`);
    for (const targetId of transition.target_placement_ids) {
      const target = registry.get(targetId);
      const foundingOperation = target
        ? operations.get(target.operation_ids[0] ?? "")
        : undefined;
      if (!foundingOperation || foundingOperation.candidate_ids.includes(candidate.candidate_id) ||
          foundingOperation.issued_at > transition.accepted_at) {
        throw new Error(`${transition.transition_id}: target lacks independently pre-existing provenance`);
      }
    }
  }
}
