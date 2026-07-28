import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { ApplicationPlacementTransition } from "./application-placement-transitions.js";
import type { InterventionPlacementRegistryEntry } from "./intervention-placements.js";
import type {
  ResolvedInterventionApplication,
} from "./resolved-intervention-applications.js";
import type { ResolvedInterventionEpisode } from "./resolved-interventions.js";

export const INTERVENTION_LIFECYCLE_SCHEMA_VERSION = 1 as const;
export const INTERVENTION_LIFECYCLE_STATES = [
  "planned", "active", "suspended", "ended", "cancelled", "superseded", "unknown",
] as const;

export type InterventionLifecycleAssertion = {
  schema_version: 1;
  assertion_id: string;
  subject:
    | { kind: "placement"; placement_id: string }
    | { kind: "episode"; occurrence_id: string }
    | { kind: "application"; application_id: string };
  state: (typeof INTERVENTION_LIFECYCLE_STATES)[number];
  valid_time: {
    coverage_kind: "point" | "bounded_interval" | "explicit_open_interval";
    start_earliest: string | null;
    start_latest: string | null;
    end_earliest: string | null;
    end_latest: string | null;
    precision: "day" | "month" | "year" | "range" | "unknown";
  };
  document_time: {
    source_published_at: string | null;
    source_retrieved_at: string | null;
    assertion_as_of: string | null;
  };
  evidence_bindings: Array<{
    record_id: string;
    source_id: string;
    evidence_id: string;
  }>;
  truth_status: string;
  review_state: "accepted" | "pending" | "conflicted" | "rejected";
  supersedes_assertion_ids: string[];
  decision_id: string | null;
};

const fields = new Set([
  "assertion_id", "decision_id", "document_time", "evidence_bindings",
  "review_state", "schema_version", "state", "subject",
  "supersedes_assertion_ids", "truth_status", "valid_time",
]);
const subjectPlacementFields = new Set(["kind", "placement_id"]);
const subjectEpisodeFields = new Set(["kind", "occurrence_id"]);
const subjectApplicationFields = new Set(["application_id", "kind"]);
const validFields = new Set([
  "coverage_kind", "end_earliest", "end_latest", "precision",
  "start_earliest", "start_latest",
]);
const documentFields = new Set(["assertion_as_of", "source_published_at", "source_retrieved_at"]);
const evidenceFields = new Set(["evidence_id", "record_id", "source_id"]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, expected: ReadonlySet<string>, path: string): void {
  const extras = Object.keys(value).filter((field) => !expected.has(field)).sort();
  const missing = [...expected].filter((field) => !(field in value)).sort();
  if (extras.length || missing.length) throw new Error(`${path}: exact fields required; unknown=${extras}; missing=${missing}`);
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}
function nullable(value: unknown, path: string): string | null {
  return value === null ? null : string(value, path);
}
function date(value: unknown, path: string): string | null {
  const result = nullable(value, path);
  if (result !== null) {
    const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/u.exec(result);
    const year = Number(match?.[1]);
    const month = match?.[2] ? Number(match[2]) : null;
    const day = match?.[3] ? Number(match[3]) : null;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (!match || (month !== null && (month < 1 || month > 12)) ||
        (day !== null && (month === null || day < 1 || day > days[month - 1]!))) {
      throw new Error(`${path} must be a real ISO day, month, or year`);
    }
  }
  return result;
}
function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const result = value.map((entry, index) => string(entry, `${path}[${index}]`));
  if (new Set(result).size !== result.length || result.join("\n") !== [...result].sort().join("\n")) {
    throw new Error(`${path} must be sorted and unique`);
  }
  return result;
}

export function parseInterventionLifecycleAssertion(
  value: unknown,
  path = "intervention lifecycle assertion",
): InterventionLifecycleAssertion {
  const input = object(value, path);
  exact(input, fields, path);
  if (input.schema_version !== 1) throw new Error(`${path}.schema_version must be 1`);
  const subjectInput = object(input.subject, `${path}.subject`);
  const kind = string(subjectInput.kind, `${path}.subject.kind`);
  let subject: InterventionLifecycleAssertion["subject"];
  if (kind === "placement") {
    exact(subjectInput, subjectPlacementFields, `${path}.subject`);
    subject = { kind, placement_id: string(subjectInput.placement_id, `${path}.subject.placement_id`) };
  } else if (kind === "episode") {
    exact(subjectInput, subjectEpisodeFields, `${path}.subject`);
    subject = { kind, occurrence_id: string(subjectInput.occurrence_id, `${path}.subject.occurrence_id`) };
  } else if (kind === "application") {
    exact(subjectInput, subjectApplicationFields, `${path}.subject`);
    subject = { kind, application_id: string(subjectInput.application_id, `${path}.subject.application_id`) };
  } else throw new Error(`${path}.subject.kind is invalid`);
  const state = string(input.state, `${path}.state`);
  if (!INTERVENTION_LIFECYCLE_STATES.includes(state as InterventionLifecycleAssertion["state"])) {
    throw new Error(`${path}.state is invalid`);
  }
  const validInput = object(input.valid_time, `${path}.valid_time`);
  exact(validInput, validFields, `${path}.valid_time`);
  const coverage = string(validInput.coverage_kind, `${path}.valid_time.coverage_kind`);
  if (!["point", "bounded_interval", "explicit_open_interval"].includes(coverage)) {
    throw new Error(`${path}.valid_time.coverage_kind is invalid`);
  }
  const precision = string(validInput.precision, `${path}.valid_time.precision`);
  if (!["day", "month", "year", "range", "unknown"].includes(precision)) {
    throw new Error(`${path}.valid_time.precision is invalid`);
  }
  const validTime = {
    coverage_kind: coverage as InterventionLifecycleAssertion["valid_time"]["coverage_kind"],
    start_earliest: date(validInput.start_earliest, `${path}.valid_time.start_earliest`),
    start_latest: date(validInput.start_latest, `${path}.valid_time.start_latest`),
    end_earliest: date(validInput.end_earliest, `${path}.valid_time.end_earliest`),
    end_latest: date(validInput.end_latest, `${path}.valid_time.end_latest`),
    precision: precision as InterventionLifecycleAssertion["valid_time"]["precision"],
  };
  if (validTime.start_earliest && validTime.start_latest &&
      validTime.start_earliest > validTime.start_latest) throw new Error(`${path}: start bounds reversed`);
  if (validTime.end_earliest && validTime.end_latest &&
      validTime.end_earliest > validTime.end_latest) throw new Error(`${path}: end bounds reversed`);
  if (validTime.start_latest && validTime.end_earliest &&
      validTime.start_latest > validTime.end_earliest) throw new Error(`${path}: interval is reversed`);
  if (validTime.coverage_kind === "point" &&
      (validTime.end_earliest !== null || validTime.end_latest !== null ||
       validTime.start_earliest === null || validTime.start_latest === null)) {
    throw new Error(`${path}: point requires start bounds and no end`);
  }
  if (validTime.coverage_kind === "bounded_interval" &&
      [validTime.start_earliest, validTime.start_latest, validTime.end_earliest, validTime.end_latest]
        .some((part) => part === null)) throw new Error(`${path}: bounded interval requires all bounds`);
  if (validTime.coverage_kind === "explicit_open_interval" &&
      validTime.start_latest === null && validTime.end_earliest === null) {
    throw new Error(`${path}: open interval requires an explicit start or end boundary`);
  }
  const documentInput = object(input.document_time, `${path}.document_time`);
  exact(documentInput, documentFields, `${path}.document_time`);
  if (!Array.isArray(input.evidence_bindings) || input.evidence_bindings.length === 0) {
    throw new Error(`${path}.evidence_bindings must be non-empty`);
  }
  const bindings = input.evidence_bindings.map((entry, index) => {
    const row = object(entry, `${path}.evidence_bindings[${index}]`);
    exact(row, evidenceFields, `${path}.evidence_bindings[${index}]`);
    return {
      record_id: string(row.record_id, `${path}.evidence_bindings[${index}].record_id`),
      source_id: string(row.source_id, `${path}.evidence_bindings[${index}].source_id`),
      evidence_id: string(row.evidence_id, `${path}.evidence_bindings[${index}].evidence_id`),
    };
  }).sort((a, b) =>
    `${a.record_id}|${a.source_id}|${a.evidence_id}`.localeCompare(
      `${b.record_id}|${b.source_id}|${b.evidence_id}`,
    )
  );
  if (new Set(bindings.map((row) => `${row.record_id}|${row.source_id}|${row.evidence_id}`)).size !== bindings.length) {
    throw new Error(`${path}.evidence_bindings must be unique`);
  }
  const reviewState = string(input.review_state, `${path}.review_state`);
  if (!["accepted", "pending", "conflicted", "rejected"].includes(reviewState)) {
    throw new Error(`${path}.review_state is invalid`);
  }
  const assertion: InterventionLifecycleAssertion = {
    schema_version: 1,
    assertion_id: string(input.assertion_id, `${path}.assertion_id`),
    subject,
    state: state as InterventionLifecycleAssertion["state"],
    valid_time: validTime,
    document_time: {
      source_published_at: date(documentInput.source_published_at, `${path}.document_time.source_published_at`),
      source_retrieved_at: date(documentInput.source_retrieved_at, `${path}.document_time.source_retrieved_at`),
      assertion_as_of: date(documentInput.assertion_as_of, `${path}.document_time.assertion_as_of`),
    },
    evidence_bindings: bindings,
    truth_status: string(input.truth_status, `${path}.truth_status`),
    review_state: reviewState as InterventionLifecycleAssertion["review_state"],
    supersedes_assertion_ids: strings(input.supersedes_assertion_ids, `${path}.supersedes_assertion_ids`),
    decision_id: input.decision_id === null ? null : string(input.decision_id, `${path}.decision_id`),
  };
  const expectedId = `assertion:${createHash("sha256").update(stableJson({
    subject: assertion.subject,
    state: assertion.state,
    valid_time: assertion.valid_time,
    evidence_bindings: assertion.evidence_bindings,
    decision_id: assertion.decision_id,
  } as JsonValue)).digest("hex").slice(0, 24)}`;
  if (assertion.assertion_id !== expectedId) throw new Error(`${path}.assertion_id is stale`);
  return assertion;
}

function pointBounds(dateValue: string, precision: "day" | "month"): {
  earliest: string;
  latest: string;
  precision: "day" | "month";
} {
  if (precision === "day") return { earliest: dateValue, latest: dateValue, precision };
  const [year, month] = dateValue.split("-").map(Number);
  const last = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return {
    earliest: `${dateValue}-01`,
    latest: `${dateValue}-${String(last).padStart(2, "0")}`,
    precision,
  };
}

function transitionState(action: ApplicationPlacementTransition["action"]): InterventionLifecycleAssertion["state"] {
  if (action === "remove") return "ended";
  if (action === "suspend") return "suspended";
  if (action === "unknown") return "unknown";
  return "active";
}

export function buildTransitionLifecycleAssertions(input: {
  transitions: readonly ApplicationPlacementTransition[];
  applications: readonly ResolvedInterventionApplication[];
  episodes: readonly ResolvedInterventionEpisode[];
  registry: readonly InterventionPlacementRegistryEntry[];
  canonical_records: readonly MtaCanonicalRecord[];
}): InterventionLifecycleAssertion[] {
  const applications = new Map(input.applications.map((row) => [row.application_id, row]));
  const episodes = new Map(input.episodes.map((row) => [row.occurrence_id, row]));
  const placements = new Set(input.registry.map((row) => row.placement_id));
  const records = new Map(input.canonical_records.map((row) => [row.record_id, row]));
  const assertions: InterventionLifecycleAssertion[] = [];
  for (const transition of input.transitions) {
    if (transition.action === "unknown") continue;
    const application = applications.get(transition.application_id);
    if (!application) throw new Error(`${transition.transition_id}: missing application`);
    const episode = episodes.get(application.occurrence_id);
    if (!episode) throw new Error(`${transition.transition_id}: missing episode`);
    const affected = transition.action === "remove" || transition.action === "suspend"
      ? transition.target_placement_ids
      : transition.result_placement_ids;
    const bounds = pointBounds(episode.resolved_onset.date, episode.resolved_onset.precision);
    const evidenceBindings = transition.evidence_bindings.map((binding) => ({
      record_id: binding.record_id,
      source_id: binding.source_id,
      evidence_id: binding.evidence_id,
    }));
    for (const binding of evidenceBindings) {
      const record = records.get(binding.record_id);
      if (!record || record.truth_status !== "source_stated" || record.review_state === "quarantined" ||
          !record.evidence_refs.some((ref) =>
            ref.source_id === binding.source_id && ref.evidence_id === binding.evidence_id
          )) throw new Error(`${transition.transition_id}: lifecycle evidence is not canonical`);
    }
    for (const placementId of affected) {
      if (!placements.has(placementId)) throw new Error(`${transition.transition_id}: missing placement`);
      const partial = {
        subject: { kind: "placement" as const, placement_id: placementId },
        state: transitionState(transition.action),
        valid_time: {
          coverage_kind: "point" as const,
          start_earliest: bounds.earliest,
          start_latest: bounds.latest,
          end_earliest: null,
          end_latest: null,
          precision: bounds.precision,
        },
        evidence_bindings: evidenceBindings.sort((a, b) =>
          `${a.record_id}|${a.source_id}|${a.evidence_id}`.localeCompare(
            `${b.record_id}|${b.source_id}|${b.evidence_id}`,
          )
        ),
        decision_id: transition.decision_id,
      };
      const assertionId = `assertion:${createHash("sha256").update(stableJson(partial as JsonValue)).digest("hex").slice(0, 24)}`;
      assertions.push(parseInterventionLifecycleAssertion({
        schema_version: 1,
        assertion_id: assertionId,
        ...partial,
        document_time: {
          source_published_at: null,
          source_retrieved_at: null,
          assertion_as_of: null,
        },
        truth_status: "source_stated",
        review_state: "accepted",
        supersedes_assertion_ids: [],
      }, `transition ${transition.transition_id} assertion ${placementId}`));
    }
  }
  return assertions.sort((a, b) => a.assertion_id.localeCompare(b.assertion_id));
}

export function loadAcceptedInterventionLifecycleAssertions(dir: string): InterventionLifecycleAssertion[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".json")).sort().map((name) =>
    parseInterventionLifecycleAssertion(
      JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown,
      join(dir, name),
    )
  );
}

export function validateAcceptedInterventionLifecycleAssertions(
  values: readonly InterventionLifecycleAssertion[],
  input: {
    placements: readonly InterventionPlacementRegistryEntry[];
    episodes: readonly ResolvedInterventionEpisode[];
    applications: readonly ResolvedInterventionApplication[];
    canonical_records: readonly MtaCanonicalRecord[];
  },
): InterventionLifecycleAssertion[] {
  const assertions = values.map((value, index) =>
    parseInterventionLifecycleAssertion(value, `accepted lifecycle assertion[${index}]`)
  ).sort((a, b) => a.assertion_id.localeCompare(b.assertion_id));
  if (new Set(assertions.map((row) => row.assertion_id)).size !== assertions.length) {
    throw new Error("duplicate lifecycle assertion id");
  }
  const placements = new Set(input.placements.map((row) => row.placement_id));
  const episodes = new Set(input.episodes.map((row) => row.occurrence_id));
  const applications = new Set(input.applications.map((row) => row.application_id));
  const records = new Map(input.canonical_records.map((row) => [row.record_id, row]));
  const ids = new Set(assertions.map((row) => row.assertion_id));
  for (const assertion of assertions) {
    if (assertion.subject.kind === "placement" && !placements.has(assertion.subject.placement_id)) {
      throw new Error(`${assertion.assertion_id}: unbound placement assertion`);
    }
    if (assertion.subject.kind === "episode" && !episodes.has(assertion.subject.occurrence_id)) {
      throw new Error(`${assertion.assertion_id}: unbound episode assertion`);
    }
    if (assertion.subject.kind === "application" && !applications.has(assertion.subject.application_id)) {
      throw new Error(`${assertion.assertion_id}: unbound application assertion`);
    }
    if (assertion.review_state === "accepted" && assertion.decision_id === null) {
      throw new Error(`${assertion.assertion_id}: accepted assertion requires an explicit decision`);
    }
    for (const binding of assertion.evidence_bindings) {
      const record = records.get(binding.record_id);
      if (!record || record.truth_status !== "source_stated" || record.review_state === "quarantined" ||
          !record.evidence_refs.some((ref) =>
            ref.source_id === binding.source_id && ref.evidence_id === binding.evidence_id
          )) throw new Error(`${assertion.assertion_id}: evidence is not canonical`);
    }
    for (const superseded of assertion.supersedes_assertion_ids) {
      if (!ids.has(superseded)) throw new Error(`${assertion.assertion_id}: missing superseded assertion`);
    }
  }
  return assertions;
}
