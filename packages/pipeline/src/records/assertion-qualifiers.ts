// S2.4 / C3 assertion qualifiers (docs/step-2-implementation-plan.md §S2.4 item 4).
//
// A materialize-time fold that writes `assertion_status` and `as_of_date` into every relation
// record's payload — derived AND authored — which canonical-db.ts then projects into the relations
// table columns added in S2.1. Deterministic over the records (+ their citing source's
// published_date_normalized from S2.2); never a journal write.
//
//   assertion_status: an explicit relation payload status wins; otherwise it is normalized from the
//     status-bearing fields on the relation and its endpoints (document_time_status, lifecycle_phase,
//     status) toward the bounded vocabulary; default `unknown`.
//   as_of_date: an explicit relation payload date wins; otherwise the citing source's
//     published_date_normalized.

import { normalizeDateText } from "@mta-wiki/pipeline/ontology/normalizers";
import type { JsonObject, JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";

export const ASSERTION_STATUSES = [
  "delivered",
  "in_progress",
  "proposed",
  "planned",
  "excluded",
  "deferred",
  "cancelled",
  "unknown",
] as const;

function token(value: JsonValue | undefined): string {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]+/gu, "_") : "";
}

/** Map a single status-bearing literal toward the assertion vocabulary, or undefined if no signal. */
function statusFromToken(key: string): string | undefined {
  if (!key) return undefined;
  if (key.includes("cancel") || key.includes("abandon") || key.includes("terminat")) return "cancelled";
  if (key.includes("exclud")) return "excluded";
  if (key.includes("defer") || key.includes("suspend") || key.includes("paused") || key.includes("stalled")) return "deferred";
  if (
    key.includes("deliver") ||
    key.includes("implemented") ||
    key.includes("complete") ||
    key.includes("operational") ||
    key.includes("permanent") ||
    key.includes("launched") ||
    key.includes("installed") ||
    key.includes("opened") ||
    key.includes("active") ||
    key.includes("monitoring") ||
    key.includes("expanded")
  ) {
    return "delivered";
  }
  if (key.includes("construction") || key.includes("in_progress") || key.includes("ongoing") || key.includes("rollout") || key.includes("underway")) return "in_progress";
  if (key.includes("propose") || key.includes("draft") || key.includes("concept")) return "proposed";
  if (key.includes("planned") || key.includes("plan") || key.includes("study") || key.includes("studied") || key.includes("approved") || key.includes("funded") || key.includes("scheduled") || key.includes("pilot")) {
    return "planned";
  }
  return undefined;
}

const STATUS_FIELDS = ["assertion_status", "status", "delivery_status", "document_time_status", "lifecycle_phase", "phase"] as const;

function statusFromPayload(payload: JsonObject): string | undefined {
  // Explicit assertion_status first (already-vocabulary), then the other status-bearing fields.
  for (const field of STATUS_FIELDS) {
    const status = statusFromToken(token(payload[field]));
    if (status) return status;
  }
  return undefined;
}

function hasAnyToken(key: string, needles: readonly string[]): boolean {
  return needles.some((needle) => key.includes(needle));
}

function hasExactToken(key: string, needle: string): boolean {
  return new RegExp(`(^|_)${needle}(_|$)`, "u").test(key);
}

function hasAnyExactToken(key: string, needles: readonly string[]): boolean {
  return needles.some((needle) => hasExactToken(key, needle));
}

function hasTokenPattern(key: string, pattern: string): boolean {
  return new RegExp(`(^|_)${pattern}(_|$)`, "u").test(key);
}

function isTrueRouteScope(record: MtaCanonicalRecord | undefined): boolean {
  return record?.record_kind === "route" && record.payload.route_record_scope === "true_route";
}

function isSubwayRoute(record: MtaCanonicalRecord | undefined): boolean {
  if (record?.record_kind !== "route") return false;
  return [record.payload.route_type, record.payload.route_type_normalized, record.payload.mode, record.payload.service_type].some((value) => {
    const key = token(value);
    return hasExactToken(key, "subway") || hasExactToken(key, "subway_route");
  });
}

function routeDescriptorTextKey(record: MtaCanonicalRecord | undefined): string {
  return token(
    [
      typeof record?.display_name === "string" ? record.display_name : "",
      typeof record?.payload.route_id === "string" ? record.payload.route_id : "",
      typeof record?.payload.route_type === "string" ? record.payload.route_type : "",
      typeof record?.payload.route_type_normalized === "string" ? record.payload.route_type_normalized : "",
      typeof record?.payload.mode === "string" ? record.payload.mode : "",
      typeof record?.payload.service_type === "string" ? record.payload.service_type : "",
    ].join(" "),
  );
}

function routeDescriptorHasRailSignal(key: string): boolean {
  return hasAnyExactToken(key, ["subway", "rail", "railroad", "commuter", "metro", "lirr", "mnr", "train", "trains"]) || hasAnyToken(key, ["metro_north"]);
}

function sourceTextHasBusPrioritySignal(key: string): boolean {
  return hasAnyExactToken(key, ["bus", "buses", "sbs"]) || hasAnyToken(key, ["bus_priority", "busway", "select_bus_service"]);
}

function isTrueBusRouteScope(record: MtaCanonicalRecord | undefined): boolean {
  if (!isTrueRouteScope(record)) return false;
  if (isSubwayRoute(record)) return false;

  const key = routeDescriptorTextKey(record);
  if (!key) return false;
  if (routeDescriptorHasRailSignal(key)) return false;
  return hasAnyExactToken(key, ["bus", "sbs"]) || hasAnyToken(key, ["select_bus_service", "limited_stop_bus", "local_bus", "express_bus"]);
}

function hasDirectRouteCorridorOperationPhrase(description: string): boolean {
  return (
    hasTokenPattern(description, "operates_(?:along|on|through|via)") ||
    hasTokenPattern(description, "runs_(?:along|on|through|via)") ||
    hasTokenPattern(description, "running_(?:along|on|through|via)")
  );
}

function hasExtendedRouteCorridorServicePhrase(description: string): boolean {
  return (
    hasTokenPattern(description, "travels?_(?:along|on|via)") ||
    hasTokenPattern(description, "serves(?:_[a-z0-9]+){0,10}_corridor") ||
    hasTokenPattern(description, "utilizes(?:_[a-z0-9]+){0,10}_corridor") ||
    hasTokenPattern(description, "uses(?:_[a-z0-9]+){0,10}_corridor") ||
    hasTokenPattern(description, "(?:primary|secondary)_route_on") ||
    hasTokenPattern(description, "bus(?:es)?_operate_on") ||
    hasTokenPattern(description, "operates_(?:northbound|southbound|eastbound|westbound)(?:_[a-z0-9]+){0,6}_on") ||
    hasTokenPattern(description, "route_running(?:_[a-z0-9]+){0,6}_along") ||
    hasTokenPattern(description, "currently_served_by")
  );
}

function relationPayloadAndEvidenceTextKey(record: MtaCanonicalRecord, payload: JsonObject): string {
  return token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
    ].join(" "),
  );
}

function routeCorridorOperationLifecycleStatus(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_kind !== "operates_on_corridor") return undefined;
  if (payload.relation_family !== "corridor_scope") return undefined;
  if (payload.derived_relation === true) return undefined;
  if (!isTrueRouteScope(subject) || object?.record_kind !== "corridor") return undefined;
  if (isSubwayRoute(subject)) return undefined;

  const key = relationPayloadAndEvidenceTextKey(record, payload);
  if (!key) return undefined;

  const proposedRouteOperation =
    hasTokenPattern(key, "proposed(?:_[a-z0-9]+){0,8}_(?:route|sbs|select_bus_service)(?:_[a-z0-9]+){0,8}_(?:operates|operate|would_operate|runs|run|travels|travel|serves|serve|follows|follow)") ||
    hasTokenPattern(key, "route_shown_following(?:_[a-z0-9]+){0,10}_proposed_route_map") ||
    (hasAnyToken(key, ["proposed_service_plan"]) && hasTokenPattern(key, "will_(?:operate|travel|provide|serve|use|run)"));

  const currentOperation =
    hasTokenPattern(key, "currently_(?:operates|runs|travels|serves)") ||
    hasTokenPattern(key, "currently_served_by") ||
    hasTokenPattern(key, "(?:operates|runs|travels|serves)_(?:along|on|through|via)(?:_[a-z0-9]+){0,12}_(?:where_sbs_stations_are_proposed|bus_only_signal_planned)");
  if (currentOperation && !proposedRouteOperation) return "delivered";

  if (proposedRouteOperation) return "proposed";

  const plannedOperation =
    hasTokenPattern(key, "will_(?:operate|travel|provide|serve|use|run)") ||
    hasTokenPattern(key, "will_continue_to_(?:serve|make|stop)") ||
    hasTokenPattern(key, "new_bus_lanes(?:_[a-z0-9]+){0,8}_will_serve") ||
    hasTokenPattern(key, "(?:sbs|route)(?:_[a-z0-9]+){0,6}_planned_(?:along|on|for)");
  if (plannedOperation && !hasAnyExactToken(key, ["proposed", "draft", "candidate", "potential"])) return "planned";

  return undefined;
}

function routeCorridorContextTextKey(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
  source: MtaCanonicalRecord | undefined,
): string {
  return token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof record.raw_text === "string" ? record.raw_text : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
      typeof subject?.display_name === "string" ? subject.display_name : "",
      typeof subject?.payload.route_id === "string" ? subject.payload.route_id : "",
      typeof subject?.payload.route_label === "string" ? subject.payload.route_label : "",
      typeof subject?.payload.route_name === "string" ? subject.payload.route_name : "",
      typeof object?.display_name === "string" ? object.display_name : "",
      typeof object?.payload.corridor_name === "string" ? object.payload.corridor_name : "",
      typeof source?.display_name === "string" ? source.display_name : "",
      textFromPayloadField(source?.payload ?? {}, "title"),
      textFromPayloadField(source?.payload ?? {}, "content_type"),
    ].join(" "),
  );
}

function routeCorridorContextHasPlanningRejection(key: string): boolean {
  return (
    hasAnyExactToken(key, ["proposed", "proposal", "draft", "future", "would", "could", "may", "candidate", "potential", "planned", "will"]) ||
    hasAnyToken(key, ["to_be", "will_be", "draft_plan", "final_plan", "service_plan", "redesign_final_plan"])
  );
}

function deliveredStatusFromRouteCorridorSourceContextRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
  citingSource: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_kind !== "operates_on_corridor") return undefined;
  if (payload.relation_family !== "corridor_scope") return undefined;
  if (subject?.record_kind !== "route" || object?.record_kind !== "corridor") return undefined;
  if (!citingSource) return undefined;

  const sourceKey = sourceRecordTextKey(citingSource);
  const routeKey = routeDescriptorTextKey(subject);
  const isBusRouteSubject =
    isTrueBusRouteScope(subject) ||
    (isTrueRouteScope(subject) && !isSubwayRoute(subject) && !routeDescriptorHasRailSignal(routeKey) && sourceTextHasBusPrioritySignal(sourceKey));
  if (!isBusRouteSubject) return undefined;

  const key = routeCorridorContextTextKey(record, payload, subject, object, citingSource);
  if (!key) return undefined;
  if (routeCorridorContextHasPlanningRejection(key)) return undefined;
  if (!hasAnyExactToken(key, ["bus", "buses", "sbs", "corridor", "route", "routes"]) && !sourceTextHasBusPrioritySignal(sourceKey)) return undefined;
  return "delivered";
}

function deliveredStatusFromRelationShape(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_kind !== "operates_on_corridor") return undefined;
  if (payload.relation_family !== "corridor_scope") return undefined;
  if (subject?.record_kind !== "route" || object?.record_kind !== "corridor") return undefined;
  if (isSubwayRoute(subject)) return undefined;

  const description = token(payload.description);
  if (!description) return undefined;
  if (
    hasAnyExactToken(description, [
      "will",
      "planned",
      "proposed",
      "future",
      "upcoming",
      "anticipated",
      "expected",
      "scheduled",
      "would",
      "could",
      "may",
      "candidate",
      "potential",
    ]) ||
    hasAnyToken(description, ["to_be", "will_be"])
  ) {
    return undefined;
  }
  if (hasDirectRouteCorridorOperationPhrase(description)) return "delivered";
  if (isTrueRouteScope(subject) && hasExtendedRouteCorridorServicePhrase(description)) return "delivered";
  return undefined;
}

function treatmentRelationTextKey(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string {
  return token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof subject?.display_name === "string" ? subject.display_name : "",
      typeof subject?.payload.description === "string" ? subject.payload.description : "",
      typeof subject?.payload.treatment_name === "string" ? subject.payload.treatment_name : "",
      typeof object?.display_name === "string" ? object.display_name : "",
      typeof object?.payload.description === "string" ? object.payload.description : "",
      typeof object?.payload.treatment_name === "string" ? object.payload.treatment_name : "",
    ].join(" "),
  );
}

function hasTreatmentFutureOrMixedLifecycleToken(key: string): boolean {
  return hasAnyExactToken(key, ["will", "future", "pilot", "projected", "expected", "upcoming"]) || hasAnyToken(key, ["to_be", "will_be"]);
}

function plannedStatusFromTreatmentFutureEvidence(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "treatment_context") return undefined;
  if (payload.relation_kind !== "has_treatment") return undefined;
  if ((subject?.record_kind !== "corridor" && subject?.record_kind !== "route") || object?.record_kind !== "treatment_component") return undefined;

  const key = token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof object.display_name === "string" ? object.display_name : "",
      typeof object.payload.description === "string" ? object.payload.description : "",
      typeof object.payload.treatment_name === "string" ? object.payload.treatment_name : "",
      typeof object.payload.treatment_kind === "string" ? object.payload.treatment_kind : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
    ].join(" "),
  );
  if (!key) return undefined;
  if (hasAnyExactToken(key, ["proposed", "proposal", "draft", "concept", "candidate", "potential", "installed", "completed", "implemented", "activated", "active", "currently", "permanent"])) return undefined;

  if (
    hasTokenPattern(key, "(?:dot|nyc_dot)_will_implement(?:_[a-z0-9]+){0,8}_(?:bus_lanes?|offset_bus_lanes?|improvements?|treatments?)") ||
    hasTokenPattern(key, "(?:bus_lanes?|lanes?)_will_be_in_effect") ||
    hasTokenPattern(key, "(?:sidewalks?|bus_bulbs?)(?:_[a-z0-9]+){0,6}_will_extend(?:_[a-z0-9]+){0,6}_bus_lane") ||
    hasTokenPattern(key, "buses_will_get(?:_[a-z0-9]+){0,6}_extended_green")
  ) {
    return "planned";
  }

  return undefined;
}

function treatmentStatusFromRelationDescription(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "treatment_context") return undefined;

  const description = treatmentRelationTextKey(payload, subject, object);
  if (!description) return undefined;

  if (payload.relation_kind === "has_treatment") {
    if ((subject?.record_kind !== "corridor" && subject?.record_kind !== "route") || object?.record_kind !== "treatment_component") return undefined;

    if (
      hasAnyToken(description, [
        "to_be_installed",
        "to_be_implemented",
        "will_be_installed",
        "will_be_implemented",
        "to_be_extended",
        "will_be_extended",
        "planned_bus_lane_extension",
        "planned_extension",
      ]) ||
      hasExactToken(description, "planned")
    ) {
      return "planned";
    }

    const hasDelivered = hasAnyExactToken(description, ["installed", "completed", "implemented", "added", "activated", "permanent", "active", "currently"]) || hasAnyToken(description, ["has_wind_deflectors_installed"]);
    const hasProposed = hasAnyExactToken(description, ["proposed", "proposal", "draft", "concept"]) || hasAnyToken(description, ["draft_plan", "proposed_bus"]);
    if (hasProposed && !hasDelivered) return "proposed";
    if (hasDelivered && !hasProposed && !hasTreatmentFutureOrMixedLifecycleToken(description)) return "delivered";
    return undefined;
  }

  if (payload.relation_kind === "implements_treatment") {
    if (subject?.record_kind !== "entity" || object?.record_kind !== "treatment_component") return undefined;
    const hasDelivered = hasAnyExactToken(description, ["installed", "completed", "deployed"]) || hasAnyToken(description, ["conduct_overnight_tests", "flood_doors_installed"]);
    const hasRejectedTiming =
      hasTreatmentFutureOrMixedLifecycleToken(description) ||
      hasAnyExactToken(description, ["planned", "proposed"]) ||
      hasAnyToken(description, ["award_imminent"]) ||
      /(^|_)by_q[1-4](_|$)/u.test(description) ||
      /(^|_)by_20[0-9]{2}(_|$)/u.test(description);
    if (hasDelivered && !hasRejectedTiming) return "delivered";
  }

  return undefined;
}

function deliveredStatusFromAgencyTreatmentActionRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "agency_role") return undefined;
  if (payload.relation_kind === "enforced_by") {
    if (subject?.record_kind !== "treatment_component" || object?.record_kind !== "entity") return undefined;
    const key = token(
      [
        typeof payload.description === "string" ? payload.description : "",
        typeof payload.source_quote === "string" ? payload.source_quote : "",
        typeof payload.notes === "string" ? payload.notes : "",
        typeof subject.display_name === "string" ? subject.display_name : "",
        typeof subject.payload.description === "string" ? subject.payload.description : "",
        typeof subject.payload.treatment_name === "string" ? subject.payload.treatment_name : "",
      ].join(" "),
    );
    if (!hasAnyExactToken(key, ["enforced", "enforces", "enforcement", "summons", "violations", "issued"])) return undefined;
    if (hasAnyExactToken(key, ["will", "planned", "proposed", "future", "expected", "pilot"]) || hasAnyToken(key, ["to_be", "will_be"])) return undefined;
    return "delivered";
  }

  if (payload.relation_kind === "implements") {
    if (subject?.record_kind !== "entity" || object?.record_kind !== "treatment_component") return undefined;
    const key = treatmentRelationTextKey(payload, undefined, object);
    const objectKey = treatmentRelationTextKey({}, undefined, object);
    if (!(hasAnyExactToken(key, ["installed", "deployed"]) || hasExactToken(objectKey, "active"))) return undefined;
    if (hasAnyExactToken(key, ["will", "pilot", "explore", "upcoming", "projected", "expected"]) || hasAnyToken(key, ["to_be", "will_be"])) return undefined;
    return "delivered";
  }

  return undefined;
}

function deliveredStatusFromOperatedByRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_kind !== "operated_by") return undefined;
  if (payload.relation_family !== "agency_role") return undefined;
  if (!isTrueRouteScope(subject) || object?.record_kind !== "entity") return undefined;
  if (hasTemporalOrUncertainRelationText(payload, subject, object)) return undefined;
  return "delivered";
}

function deliveredStatusFromAgencyOperatesRouteRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_kind !== "operates") return undefined;
  if (payload.relation_family !== "agency_role") return undefined;
  if (subject?.record_kind !== "entity" || !isTrueRouteScope(object)) return undefined;
  if (hasTemporalOrUncertainRelationText(payload, subject, object)) return undefined;
  return "delivered";
}

function deliveredStatusFromPublishedBySourceRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_kind !== "published_by") return undefined;
  if (payload.relation_family !== "publication_role") return undefined;
  if (subject?.record_kind !== "source" || object?.record_kind !== "entity") return undefined;
  return "delivered";
}

function deliveredStatusFromSourceAuthorshipRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "publication_role") return undefined;
  if (payload.relation_kind !== "prepared_by" && payload.relation_kind !== "authored_by") return undefined;
  if (subject?.record_kind !== "source" || object?.record_kind !== "entity") return undefined;

  const description = token(payload.description);
  if (
    description &&
    (hasAnyExactToken(description, [
      "will",
      "planned",
      "proposed",
      "future",
      "upcoming",
      "anticipated",
      "expected",
      "scheduled",
      "would",
      "could",
      "may",
      "candidate",
      "potential",
    ]) ||
      hasAnyToken(description, ["to_be", "will_be"]))
  ) {
    return undefined;
  }

  return "delivered";
}

function deliveredStatusFromEntitySourceCreationRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "publication_role") return undefined;
  if (payload.relation_kind !== "authored_by" && payload.relation_kind !== "prepared") return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "source") return undefined;
  if (!relationCitesSourceEndpoint(record, object)) return undefined;
  if (hasTemporalOrUncertainRelationText(payload, subject, object)) return undefined;
  return "delivered";
}

function deliveredStatusFromSourceSubjectPublicationRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "publication_role") return undefined;
  if (typeof payload.relation_kind !== "string" || !SOURCE_SUBJECT_PUBLICATION_RELATION_KINDS.has(payload.relation_kind)) return undefined;
  if (subject?.record_kind !== "source" || object?.record_kind !== "entity") return undefined;
  if (!relationCitesSourceEndpoint(record, subject)) return undefined;
  return "delivered";
}

const SOURCE_SUBJECT_PUBLICATION_RELATION_KINDS = new Set([
  "about",
  "about_entity",
  "about_subject",
  "addresses",
  "addresses_entity",
  "covers",
  "covers_entity",
  "covers_mode",
  "covers_system",
  "describes_entity",
  "description_about",
  "has_subject",
  "is_about",
  "pertains_to",
  "relates_to",
  "report_subject",
]);

const SOURCE_AUDIENCE_PUBLICATION_RELATION_KINDS = new Set([
  "committee_work_plan_of",
  "is_work_plan_of",
  "prepared_for",
  "published_for",
  "received_by",
  "reported_to",
]);

const SOURCE_ATTRIBUTION_PUBLICATION_RELATION_KINDS = new Set(["drafted_by", "has_author", "sourced_from", "sponsored_by"]);

const ENTITY_SOURCE_PUBLICATION_DOCUMENT_RELATION_KINDS = new Set(["publishes", "releases", "subject_of", "is_subject_of", "has_work_plan", "has_workplan", "receives_report", "included_in"]);
const EVENT_SOURCE_PUBLICATION_DOCUMENT_RELATION_KINDS = new Set(["has_source", "has_document"]);
const SOURCE_CLAIM_PUBLICATION_DOCUMENT_RELATION_KINDS = new Set(["includes_section"]);
const CLAIM_SOURCE_PUBLICATION_DOCUMENT_RELATION_KINDS = new Set(["is_part_of"]);

function deliveredStatusFromSourcePublicationAudienceOrAttributionRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "publication_role") return undefined;
  if (typeof payload.relation_kind !== "string") return undefined;
  if (!SOURCE_AUDIENCE_PUBLICATION_RELATION_KINDS.has(payload.relation_kind) && !SOURCE_ATTRIBUTION_PUBLICATION_RELATION_KINDS.has(payload.relation_kind)) return undefined;
  if (subject?.record_kind !== "source" || object?.record_kind !== "entity") return undefined;
  if (!relationCitesSourceEndpoint(record, subject)) return undefined;
  if (hasTemporalOrUncertainRelationText(payload, subject, object)) return undefined;
  return "delivered";
}

function deliveredStatusFromPublicationDocumentLinkRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "publication_role") return undefined;
  if (typeof payload.relation_kind !== "string") return undefined;
  if (hasTemporalOrUncertainRelationText(payload, subject, object)) return undefined;

  if (subject?.record_kind === "entity" && object?.record_kind === "source" && ENTITY_SOURCE_PUBLICATION_DOCUMENT_RELATION_KINDS.has(payload.relation_kind)) return "delivered";
  if (subject?.record_kind === "entity" && object?.record_kind === "event" && object.payload.event_family === "publication" && (payload.relation_kind === "publishes" || payload.relation_kind === "releases")) return "delivered";
  if (subject?.record_kind === "event" && object?.record_kind === "source" && EVENT_SOURCE_PUBLICATION_DOCUMENT_RELATION_KINDS.has(payload.relation_kind)) return "delivered";
  if (subject?.record_kind === "source" && object?.record_kind === "claim" && SOURCE_CLAIM_PUBLICATION_DOCUMENT_RELATION_KINDS.has(payload.relation_kind)) return "delivered";
  if (subject?.record_kind === "claim" && object?.record_kind === "source" && CLAIM_SOURCE_PUBLICATION_DOCUMENT_RELATION_KINDS.has(payload.relation_kind)) return "delivered";

  return undefined;
}

function deliveredStatusFromPublicationDeliveryRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "publication_role") return undefined;
  if (payload.relation_kind !== "delivered_report") return undefined;
  if (subject?.record_kind !== "entity") return undefined;
  if (!object || !["source", "event", "claim", "entity"].includes(object.record_kind)) return undefined;
  if (subject.record_id === object.record_id) return undefined;

  const key = token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof record.raw_text === "string" ? record.raw_text : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
      typeof subject.display_name === "string" ? subject.display_name : "",
      typeof object.display_name === "string" ? object.display_name : "",
    ].join(" "),
  );
  if (hasAnyExactToken(key, TEMPORAL_OR_UNCERTAIN_RELATION_TOKENS) || hasAnyToken(key, ["to_be", "will_be"])) return undefined;
  return "delivered";
}

function deliveredStatusFromSourceSubmittedByRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "agency_role") return undefined;
  if (payload.relation_kind !== "submitted_by") return undefined;
  if (subject?.record_kind !== "source" || object?.record_kind !== "entity") return undefined;
  if (!relationCitesSourceEndpoint(record, subject)) return undefined;
  const key = token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof record.raw_text === "string" ? record.raw_text : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
    ].join(" "),
  );
  if (hasAnyExactToken(key, TEMPORAL_OR_UNCERTAIN_RELATION_TOKENS) || hasAnyToken(key, ["to_be", "will_be"])) return undefined;
  return "delivered";
}

function deliveredStatusFromSourcePresentedByRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "agency_role") return undefined;
  if (payload.relation_kind !== "presented_by") return undefined;
  if (subject?.record_kind !== "source" || object?.record_kind !== "entity") return undefined;
  if (!relationCitesSourceEndpoint(record, subject)) return undefined;
  const key = token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof record.raw_text === "string" ? record.raw_text : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
    ].join(" "),
  );
  if (hasAnyExactToken(key, TEMPORAL_OR_UNCERTAIN_RELATION_TOKENS) || hasAnyToken(key, ["to_be", "will_be"])) return undefined;
  return "delivered";
}

function plannedStatusFromScheduledTimelineRelation(payload: JsonObject): string | undefined {
  if (payload.relation_family !== "timeline_context") return undefined;
  if (payload.relation_kind !== "has_timeline_event" && payload.relation_kind !== "has_agenda_item") return undefined;

  const description = token(payload.description);
  if (!description || !hasExactToken(description, "scheduled")) return undefined;
  if (hasAnyToken(description, ["no_items", "no_meetings_held", "no_meeting_scheduled"])) return undefined;
  return "planned";
}

const WORK_PLAN_TIMELINE_EVENT_KINDS = new Set(["committee_meeting_agenda", "committee_meeting", "committee_presentation"]);
const ENTITY_WORK_PLAN_TIMELINE_EVENT_KINDS = new Set(["committee_meeting", "committee_agenda_item", "committee_information_item", "presentation", "committee_action"]);
const WORK_PLAN_AGENDA_ITEM_EVENT_KINDS = new Set(["agenda_item", "committee_agenda_item", "committee_meeting_agenda", "meeting"]);
const ROUTE_IMPLEMENTATION_TIMELINE_EVENT_KINDS = new Set(["implementation", "service_implementation", "capital_improvements_start"]);
const PLANNED_ENTITY_IMPLEMENTATION_TIMELINE_EVENT_KINDS = new Set(["holiday_service", "holiday_service_program", "special_service", "timetable_change", "service_change"]);
const DELIVERED_ENTITY_IMPLEMENTATION_TIMELINE_EVENT_KINDS = new Set([
  "implementation",
  "program_implementation",
  "policy_effective_date",
  "infrastructure_replacement",
  "operation",
  "trackwork",
  "timetable_change",
  "service_change",
]);
const ENTITY_APPROVAL_TIMELINE_EVENT_KINDS = new Set([
  "ratification",
  "board_adoption",
  "board_authorization",
  "charter_adoption",
  "charter_adoption_amendment",
  "charter_adoption_approval",
  "adoption",
  "resolution_adoption",
]);

function sourceRecordTextKey(source: MtaCanonicalRecord | undefined): string {
  return token(
    [
      typeof source?.display_name === "string" ? source.display_name : "",
      typeof source?.payload.title === "string" ? source.payload.title : "",
      typeof source?.payload.content_type === "string" ? source.payload.content_type : "",
      typeof source?.payload.document_kind === "string" ? source.payload.document_kind : "",
      typeof source?.payload.document_type === "string" ? source.payload.document_type : "",
      typeof source?.payload.description === "string" ? source.payload.description : "",
    ].join(" "),
  );
}

function workPlanTimelineTextKey(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string {
  return token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof subject?.display_name === "string" ? subject.display_name : "",
      typeof subject?.payload.title === "string" ? subject.payload.title : "",
      typeof subject?.payload.content_type === "string" ? subject.payload.content_type : "",
      typeof subject?.payload.document_kind === "string" ? subject.payload.document_kind : "",
      typeof subject?.payload.description === "string" ? subject.payload.description : "",
      typeof object?.display_name === "string" ? object.display_name : "",
      typeof object?.payload.event_name === "string" ? object.payload.event_name : "",
      typeof object?.payload.description === "string" ? object.payload.description : "",
    ].join(" "),
  );
}

function plannedStatusFromWorkPlanTimelineRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "timeline_context") return undefined;
  if (payload.relation_kind !== "has_agenda_event" && payload.relation_kind !== "has_timeline_event") return undefined;
  if (subject?.record_kind !== "source" || object?.record_kind !== "event") return undefined;

  const key = workPlanTimelineTextKey(payload, subject, object);
  if (!key || (!hasAnyToken(key, ["work_plan", "workplan"]))) return undefined;
  if (hasAnyToken(key, ["no_item", "no_items", "no_meeting", "no_meetings", "no_meetings_held"])) return undefined;
  if (typeof object.payload.date_normalized !== "string" || !object.payload.date_normalized.trim()) return undefined;
  if (!WORK_PLAN_TIMELINE_EVENT_KINDS.has(token(object.payload.event_kind))) return undefined;
  return "planned";
}

function plannedStatusFromEntityWorkPlanTimelineRelation(
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
  citingSource: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "timeline_context") return undefined;
  if (payload.relation_kind !== "has_timeline_event") return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "event") return undefined;

  const sourceKey = sourceRecordTextKey(citingSource);
  if (!sourceKey || !hasAnyToken(sourceKey, ["work_plan", "workplan"])) return undefined;
  if (typeof object.payload.date_normalized !== "string" || !object.payload.date_normalized.trim()) return undefined;
  if (!ENTITY_WORK_PLAN_TIMELINE_EVENT_KINDS.has(token(object.payload.event_kind))) return undefined;

  const key = token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof object.display_name === "string" ? object.display_name : "",
      typeof object.payload.event_name === "string" ? object.payload.event_name : "",
      typeof object.payload.description === "string" ? object.payload.description : "",
      sourceKey,
    ].join(" "),
  );
  if (hasAnyToken(key, ["no_item", "no_items", "no_meeting", "no_meetings", "postpon", "defer", "cancel"])) return undefined;
  return "planned";
}

function plannedStatusFromWorkPlanAgendaItemRelation(
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
  citingSource: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "timeline_context") return undefined;
  if (payload.relation_kind !== "has_agenda_item" && payload.relation_kind !== "subject_of_agenda_item") return undefined;

  const sourceKey = sourceRecordTextKey(citingSource);
  if (!sourceKey || !hasAnyToken(sourceKey, ["work_plan", "workplan"])) return undefined;

  const key = token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof subject?.display_name === "string" ? subject.display_name : "",
      typeof subject?.payload.event_name === "string" ? subject.payload.event_name : "",
      typeof object?.display_name === "string" ? object.display_name : "",
      typeof object?.payload.event_name === "string" ? object.payload.event_name : "",
      typeof object?.payload.description === "string" ? object.payload.description : "",
      sourceKey,
    ].join(" "),
  );
  if (hasAnyToken(key, ["no_item", "no_items", "no_meeting", "no_meetings", "no_meetings_held", "postpon", "defer", "cancel"])) return undefined;

  if (payload.relation_kind === "subject_of_agenda_item") {
    if (subject?.record_kind !== "entity" || object?.record_kind !== "event") return undefined;
    if (!WORK_PLAN_AGENDA_ITEM_EVENT_KINDS.has(token(object.payload.event_kind))) return undefined;
    if (typeof object.payload.date_normalized !== "string" || !object.payload.date_normalized.trim()) return undefined;
    return "planned";
  }

  if (subject?.record_kind === "event" && (object?.record_kind === "entity" || object?.record_kind === "claim" || object?.record_kind === "metric_claim")) {
    return "planned";
  }
  if (subject?.record_kind === "entity" && object?.record_kind === "event") {
    if (!WORK_PLAN_AGENDA_ITEM_EVENT_KINDS.has(token(object.payload.event_kind))) return undefined;
    if (typeof object.payload.date_normalized !== "string" || !object.payload.date_normalized.trim()) return undefined;
    return "planned";
  }
  return undefined;
}

function plannedStatusFromMeetingAgendaAuthorizationTimelineRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
  citingSource: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "timeline_context") return undefined;
  if (payload.relation_kind !== "has_timeline_event") return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "event") return undefined;
  if (token(object.payload.event_family) !== "approval" || token(object.payload.event_kind) !== "authorization") return undefined;
  if (typeof object.payload.date_normalized !== "string" || !object.payload.date_normalized.trim()) return undefined;

  const sourceKey = sourceRecordTextKey(citingSource);
  if (!sourceKey || hasAnyToken(sourceKey, ["work_plan", "workplan"])) return undefined;
  if (!hasAnyToken(sourceKey, ["meeting_agenda", "agenda_items", "staff_summary", "staff_summary_packet"])) return undefined;

  const key = token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof record.raw_text === "string" ? record.raw_text : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
      typeof object.display_name === "string" ? object.display_name : "",
      typeof object.payload.event_name === "string" ? object.payload.event_name : "",
      typeof object.payload.description === "string" ? object.payload.description : "",
    ].join(" "),
  );
  if (!hasAnyToken(key, ["authorization_for", "authorization_to_enter", "authorization_to_amend", "authorization_to_extend", "request_authorization", "requests_authorization", "hereby_requests_authorization"])) return undefined;
  if (hasAnyToken(key, ["no_items", "no_meeting", "postpon", "defer", "cancel", "withdraw", "denied", "lack_of_quorum"])) return undefined;
  if (hasAnyExactToken(key, ["approved", "adopted", "authorized", "ratified", "executed"])) return undefined;
  return "planned";
}

const HELD_PUBLIC_MEETING_EVENT_KINDS = new Set([
  "annual_board_meeting",
  "annual_meeting",
  "board_committee_meeting",
  "board_meeting",
  "committee_meeting",
  "committee_meeting_prior",
  "community_advisory_committee_meeting",
  "community_board_presentation",
  "community_meeting",
  "meeting",
  "public_meeting",
  "regular_meeting",
]);

function deliveredStatusFromHeldPublicMeetingTimelineRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
  citingSource: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "timeline_context") return undefined;
  if (payload.relation_kind !== "has_timeline_event") return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "event") return undefined;
  if (token(object.payload.event_family) !== "public_engagement") return undefined;
  if (!HELD_PUBLIC_MEETING_EVENT_KINDS.has(token(object.payload.event_kind))) return undefined;

  const sourceKey = sourceRecordTextKey(citingSource);
  if (!sourceKey || hasAnyToken(sourceKey, ["work_plan", "workplan"])) return undefined;

  const eventDate = comparableMonthOrDayDate(object.payload.date_normalized);
  const sourceDate = comparableMonthOrDayDate(citingSource?.payload.published_date_normalized);
  if (!eventDate || !sourceDate || eventDate > sourceDate) return undefined;

  const key = token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof record.raw_text === "string" ? record.raw_text : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
      typeof object.display_name === "string" ? object.display_name : "",
      typeof object.payload.event_name === "string" ? object.payload.event_name : "",
      typeof object.payload.description === "string" ? object.payload.description : "",
      typeof object.payload.event_kind === "string" ? object.payload.event_kind : "",
      sourceKey,
    ].join(" "),
  );
  if (!hasExactToken(key, "held") && !hasAnyToken(key, ["meeting_minutes", "minutes_of", "called_the_meeting_to_order"])) return undefined;
  if (hasAnyToken(key, ["no_meeting", "no_meetings", "no_items", "postpon", "defer", "cancel", "to_consider", "for_approval"]) || hasExactToken(key, "scheduled")) return undefined;
  return "delivered";
}

function statusFromDatedPublicMeetingTimelineRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
  citingSource: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "timeline_context") return undefined;
  if (payload.relation_kind !== "has_timeline_event") return undefined;
  if (!subject || !["corridor", "entity", "event", "source"].includes(subject.record_kind)) return undefined;
  if (object?.record_kind !== "event") return undefined;
  if (token(object.payload.event_family) !== "public_engagement") return undefined;
  if (!HELD_PUBLIC_MEETING_EVENT_KINDS.has(token(object.payload.event_kind))) return undefined;

  const sourceKey = sourceRecordTextKey(citingSource);
  if (!sourceKey || hasAnyToken(sourceKey, ["work_plan", "workplan"])) return undefined;

  const key = token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof record.raw_text === "string" ? record.raw_text : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
      typeof subject.display_name === "string" ? subject.display_name : "",
      typeof object.display_name === "string" ? object.display_name : "",
      typeof object.payload.event_name === "string" ? object.payload.event_name : "",
      typeof object.payload.description === "string" ? object.payload.description : "",
      typeof object.payload.event_kind === "string" ? object.payload.event_kind : "",
      sourceKey,
    ].join(" "),
  );
  if (hasAnyToken(key, ["no_meeting", "no_meetings", "no_items", "no_item", "postpon", "defer", "cancel", "lack_of_quorum"])) return undefined;

  const eventDate = comparableMonthOrDayDate(object.payload.date_normalized);
  const sourceDate = comparableMonthOrDayDate(citingSource?.payload.published_date_normalized);
  const hasFutureMeetingSignal =
    hasAnyExactToken(key, ["scheduled", "will", "would", "recommended", "recommends"]) ||
    hasAnyToken(key, ["to_approve", "to_adopt", "to_vote", "to_consider", "for_approval", "for_board_action", "board_action"]);
  if (eventDate && sourceDate && eventDate <= sourceDate) {
    if (hasFutureMeetingSignal) return undefined;
    return "delivered";
  }

  if (eventDate && sourceDate && eventDate > sourceDate && hasFutureMeetingSignal) return "planned";
  if (eventDate && sourceDate && eventDate > sourceDate) return undefined;

  if (hasExactToken(key, "held") || hasAnyToken(key, ["meeting_minutes", "minutes_of", "called_the_meeting_to_order"])) return "delivered";
  return undefined;
}

function comparableMonthOrDayDate(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const date = value.trim();
  if (!/^\d{4}-\d{2}(?:-\d{2})?$/u.test(date)) return undefined;
  return date;
}

function timelineImplementationTextKey(record: MtaCanonicalRecord, payload: JsonObject, event: MtaCanonicalRecord): string {
  return token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof record.raw_text === "string" ? record.raw_text : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
      typeof event.display_name === "string" ? event.display_name : "",
      typeof event.payload.event_name === "string" ? event.payload.event_name : "",
      typeof event.payload.description === "string" ? event.payload.description : "",
      typeof event.payload.event_kind === "string" ? event.payload.event_kind : "",
    ].join(" "),
  );
}

function statusFromEntityImplementationTimelineRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
  citingSource: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "timeline_context") return undefined;
  if (payload.relation_kind !== "has_timeline_event") return undefined;
  if (subject?.record_kind !== "entity" && subject?.record_kind !== "source") return undefined;
  if (object?.record_kind !== "event") return undefined;
  if (token(object.payload.event_family) !== "implementation") return undefined;

  const eventDate = comparableMonthOrDayDate(object.payload.date_normalized);
  const sourceDate = comparableMonthOrDayDate(citingSource?.payload.published_date_normalized);
  if (!eventDate || !sourceDate) return undefined;

  const key = timelineImplementationTextKey(record, payload, object);
  if (hasAnyToken(key, ["if_approved", "pending_approval", "subject_to_approval", "postpon", "defer", "cancel", "strike_is_over", "restore_service", "no_items", "no_meeting"])) return undefined;

  const eventKind = token(object.payload.event_kind);
  const eventAfterSource = eventDate > sourceDate;
  const hasFutureAction =
    hasAnyToken(key, ["will_operate", "will_be_operating", "will_be_on", "will_be_diverted", "plan_to_adjust", "adjust_schedules_beginning"]) ||
    hasTokenPattern(key, "will(?:_[a-z0-9]+){0,4}_(?:operate|operating|run|begin|start|divert|adjust|change)");
  if (eventAfterSource && PLANNED_ENTITY_IMPLEMENTATION_TIMELINE_EVENT_KINDS.has(eventKind) && hasFutureAction) return "planned";

  const hasCompletedAction = hasAnyExactToken(key, ["implemented", "began", "started", "coordinated", "effective"]) || hasAnyToken(key, ["coordinated_safe_passage", "policy_directive_effective"]);
  if (!eventAfterSource && DELIVERED_ENTITY_IMPLEMENTATION_TIMELINE_EVENT_KINDS.has(eventKind) && hasCompletedAction && !hasFutureAction) return "delivered";
  return undefined;
}

function deliveredStatusFromRouteImplementationTimelineRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "timeline_context") return undefined;
  if (payload.relation_kind !== "has_timeline_event") return undefined;
  if (!isTrueRouteScope(subject) || object?.record_kind !== "event") return undefined;
  if (object.payload.event_family !== "implementation") return undefined;
  if (typeof object.payload.date_normalized !== "string" || !object.payload.date_normalized.trim()) return undefined;
  if (!ROUTE_IMPLEMENTATION_TIMELINE_EVENT_KINDS.has(token(object.payload.event_kind))) return undefined;
  if (hasTemporalOrUncertainRelationText(payload, subject, object)) return undefined;

  const key = token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof object.display_name === "string" ? object.display_name : "",
      typeof object.payload.event_name === "string" ? object.payload.event_name : "",
      typeof object.payload.description === "string" ? object.payload.description : "",
    ].join(" "),
  );
  if (hasAnyToken(key, ["will_be", "to_be", "postpon", "defer", "cancel"])) return undefined;
  if (hasAnyExactToken(key, ["will", "would", "planned", "proposed", "future", "scheduled", "candidate", "potential"])) return undefined;
  if (hasAnyExactToken(key, ["implemented", "implementation", "began", "launched", "opened", "started"])) return "delivered";
  return undefined;
}

function deliveredStatusFromEntityApprovalTimelineRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "timeline_context") return undefined;
  if (payload.relation_kind !== "has_timeline_event") return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "event") return undefined;
  if (object.payload.event_family !== "approval") return undefined;
  if (typeof object.payload.date_normalized !== "string" || !object.payload.date_normalized.trim()) return undefined;
  if (!ENTITY_APPROVAL_TIMELINE_EVENT_KINDS.has(token(object.payload.event_kind))) return undefined;

  const key = token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof object.display_name === "string" ? object.display_name : "",
      typeof object.payload.event_name === "string" ? object.payload.event_name : "",
      typeof object.payload.description === "string" ? object.payload.description : "",
    ].join(" "),
  );
  if (!hasAnyExactToken(key, ["adopted", "approved", "authorized", "ratified", "executed"])) return undefined;
  if (hasAnyToken(key, ["no_items", "no_meeting", "postpon", "defer", "cancel", "suspend", "pause", "lack_of_quorum", "negative_declaration", "to_approve", "to_adopt", "to_consider", "for_approval", "approval_to"])) {
    return undefined;
  }
  if (hasAnyExactToken(key, ["will", "would", "could", "may", "future", "proposed", "planned", "expected", "scheduled", "upcoming", "recommendation", "recommended", "recommends", "pending"])) return undefined;
  return "delivered";
}

const STATIC_ORGANIZATION_HIERARCHY_RELATION_KINDS = new Set([
  "belongs_to",
  "part_of_agency",
  "part_of",
  "parent_organization",
  "has_subsidiary",
  "subsidiary_of",
  "parent_of",
  "parent_entity",
  "has_agency",
  "has_component",
  "includes_agency",
  "member_of",
  "parent_subsidiary",
]);

const STATIC_AGENCY_ROLE_RELATION_KINDS = new Set([
  "employed_by",
  "works_for",
  "employee_of",
  "works_at",
  "president_of",
  "is_president_of",
  "general_counsel_of",
  "department_head_of",
  "has_officer",
  "interim_president_of",
  "is_interim_president_of",
  "project_manager_of",
  "accountable_executive_for",
  "chief_safety_officer_for",
  "employs",
  "external_auditor",
  "financial_liaison_for",
  "has_employee",
  "has_leader",
  "has_personnel",
  "has_project_manager",
  "holds_position",
  "is_department_head_of",
  "is_executive_vice_president_of",
  "is_financial_liaison_for",
  "is_leader_of",
  "is_liaison_for",
  "is_officer_of",
  "leads",
  "leads_entity",
  "lead_by",
  "overseen_by",
  "oversees",
  "project_manager",
  "project_manager_for",
  "senior_vice_president_of",
  "serves_as",
  "transaction_manager_for",
  "under_direction_of",
  "vice_president_of",
]);

const STATIC_AGENCY_OFFICEHOLDER_RELATION_KINDS = new Set(["has_role", "chairs", "has_liaison", "leads_organization", "is_principal_of"]);
const STATIC_AGENCY_OFFICEHOLDER_ROLE_TOKENS = [
  "president",
  "chief",
  "officer",
  "liaison",
  "chair",
  "director",
  "secretary",
  "treasurer",
  "coordinator",
  "leader",
  "head",
  "signature",
  "principal",
] as const;

const STATIC_AGENCY_SERVICE_RELATION_KINDS = new Set(["operates", "operates_service", "provides_service_to", "provides_service_for"]);
const DELIVERED_FUNDING_AWARD_RELATION_KINDS = new Set(["transfers_funds_to", "makes_payment_to", "entered_agreement_with", "contracted_with", "contracted_by"]);
const DELIVERED_DIRECT_AGREEMENT_FUNDING_RELATION_KINDS = new Set(["grants_agreement", "leases", "licenses", "has_agreement_with", "has_licensee", "has_counterparty"]);
const PARTNERSHIP_EVENT_ROLE_RELATION_KINDS = new Set(["organized_by", "has_participant"]);
const PARTNERSHIP_EVENT_ROLE_FAMILIES = new Set(["public_engagement", "implementation", "approval", "milestone", "incident", "governance", "publication"]);

const TEMPORAL_OR_UNCERTAIN_RELATION_TOKENS = [
  "will",
  "planned",
  "proposed",
  "future",
  "upcoming",
  "anticipated",
  "expected",
  "scheduled",
  "would",
  "could",
  "may",
  "candidate",
  "potential",
  "former",
  "formerly",
  "previous",
  "previously",
  "retired",
  "resigned",
] as const;

function hasTemporalOrUncertainRelationText(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): boolean {
  const key = token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof subject?.display_name === "string" ? subject.display_name : "",
      typeof object?.display_name === "string" ? object.display_name : "",
    ].join(" "),
  );
  if (!key) return false;
  return hasAnyExactToken(key, TEMPORAL_OR_UNCERTAIN_RELATION_TOKENS) || hasAnyToken(key, ["to_be", "will_be"]);
}

function deliveredStatusFromStaticOrganizationHierarchyRelation(
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "organization_hierarchy") return undefined;
  if (typeof payload.relation_kind !== "string" || !STATIC_ORGANIZATION_HIERARCHY_RELATION_KINDS.has(payload.relation_kind)) return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "entity") return undefined;
  if (subject.record_id === object.record_id) return undefined;

  const description = token(payload.description);
  if (
    description &&
    (hasAnyExactToken(description, [
      "will",
      "planned",
      "proposed",
      "future",
      "upcoming",
      "anticipated",
      "expected",
      "scheduled",
      "would",
      "could",
      "may",
      "candidate",
      "potential",
      "former",
      "formerly",
      "previous",
      "previously",
    ]) ||
      hasAnyToken(description, ["to_be", "will_be"]))
  ) {
    return undefined;
  }

  return "delivered";
}

function deliveredStatusFromStaticAgencyRoleRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "agency_role") return undefined;
  if (typeof payload.relation_kind !== "string" || !STATIC_AGENCY_ROLE_RELATION_KINDS.has(payload.relation_kind)) return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "entity") return undefined;
  if (subject.record_id === object.record_id) return undefined;
  if (hasTemporalOrUncertainRelationText(payload, subject, object)) return undefined;
  return "delivered";
}

function deliveredStatusFromStaticAgencyOfficeholderRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "agency_role") return undefined;
  if (typeof payload.relation_kind !== "string" || !STATIC_AGENCY_OFFICEHOLDER_RELATION_KINDS.has(payload.relation_kind)) return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "entity") return undefined;
  if (subject.record_id === object.record_id) return undefined;

  const key = token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof record.raw_text === "string" ? record.raw_text : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
      typeof subject.display_name === "string" ? subject.display_name : "",
      typeof object.display_name === "string" ? object.display_name : "",
    ].join(" "),
  );
  if (hasAnyExactToken(key, TEMPORAL_OR_UNCERTAIN_RELATION_TOKENS) || hasAnyToken(key, ["to_be", "will_be"])) return undefined;
  if (
    hasAnyExactToken(key, STATIC_AGENCY_OFFICEHOLDER_ROLE_TOKENS) ||
    hasAnyToken(key, ["interim_president", "department_head", "project_manager", "financial_liaison", "inspector_general", "vice_president", "serves_as"])
  ) {
    return "delivered";
  }
  return undefined;
}

function deliveredStatusFromStaticAgencyServiceRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "agency_role") return undefined;
  if (typeof payload.relation_kind !== "string" || !STATIC_AGENCY_SERVICE_RELATION_KINDS.has(payload.relation_kind)) return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "entity") return undefined;
  if (subject.record_id === object.record_id) return undefined;
  if (hasTemporalOrUncertainRelationText(payload, subject, object)) return undefined;
  return "delivered";
}

function deliveredStatusFromActiveRouteOperatorRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "route_scope") return undefined;
  if (payload.relation_kind !== "operates_route") return undefined;
  if (subject?.record_kind !== "entity" || !isTrueRouteScope(object)) return undefined;
  if (hasTemporalOrUncertainRelationText(payload, subject, object)) return undefined;
  return "delivered";
}

function deliveredStatusFromStaticOwnershipRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "ownership_role") return undefined;
  if (payload.relation_kind !== "owned_by") return undefined;
  if (!subject || subject.record_kind === "source" || object?.record_kind !== "entity") return undefined;
  if (subject.record_id === object.record_id) return undefined;
  if (hasTemporalOrUncertainRelationText(payload, subject, object)) return undefined;
  return "delivered";
}

function deliveredStatusFromStaticLocationRelation(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "location_scope") return undefined;
  if (payload.relation_kind !== "located_at") return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "entity") return undefined;
  if (subject.record_id === object.record_id) return undefined;
  if (object.payload.entity_type !== "terminal") return undefined;
  if (hasTemporalOrUncertainRelationText(payload, subject, object)) return undefined;
  return "delivered";
}

function fundingAwardRelationTextKey(payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string {
  return token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof subject?.display_name === "string" ? subject.display_name : "",
      typeof subject?.payload.description === "string" ? subject.payload.description : "",
      typeof object?.display_name === "string" ? object.display_name : "",
      typeof object?.payload.description === "string" ? object.payload.description : "",
    ].join(" "),
  );
}

function hasFundingAwardFutureOrApprovalText(key: string): boolean {
  return (
    hasAnyExactToken(key, ["will", "would", "could", "may", "future", "planned", "proposed", "proposal", "proposes", "pending", "expected", "expects", "scheduled", "recommend", "recommended", "recommends"]) ||
    hasAnyToken(key, [
      "to_be",
      "will_be",
      "approval_to",
      "seeking_board_approval",
      "seeking_approval",
      "to_enter_into",
      "to_award",
      "to_approve",
      "authorization_to_enter",
      "authorization_to_award",
      "request_authorization",
      "requests_authorization",
    ])
  );
}

const PROPOSED_FUNDING_AWARD_RELATION_KINDS = new Set(["awarded_contract", "awards_contract_to", "contract_vendor"]);

function fundingAwardRelationOwnedTextKey(record: MtaCanonicalRecord, payload: JsonObject): string {
  return token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof record.raw_text === "string" ? record.raw_text : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
    ].join(" "),
  );
}

function proposedStatusFromFundingAwardProposalRelation(record: MtaCanonicalRecord, payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "funding_award") return undefined;
  if (typeof payload.relation_kind !== "string" || !PROPOSED_FUNDING_AWARD_RELATION_KINDS.has(payload.relation_kind)) return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "entity") return undefined;
  if (subject.record_id === object.record_id) return undefined;

  const key = fundingAwardRelationOwnedTextKey(record, payload);
  if (!key) return undefined;
  const hasProposalSignal = hasTokenPattern(key, "proposes?_to_award") || hasTokenPattern(key, "proposes?_award") || hasTokenPattern(key, "proposes?_non_competitive_procurement");
  if (!hasProposalSignal) return undefined;
  if (hasAnyExactToken(key, ["awarded", "executed", "approved", "authorized", "ratified", "ratification", "recommendation", "recommended"])) return undefined;
  return "proposed";
}

function deliveredStatusFromFundingAwardRelation(
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
  citingSource: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "funding_award") return undefined;
  if (typeof payload.relation_kind !== "string" || (!DELIVERED_FUNDING_AWARD_RELATION_KINDS.has(payload.relation_kind) && !DELIVERED_DIRECT_AGREEMENT_FUNDING_RELATION_KINDS.has(payload.relation_kind))) return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "entity") return undefined;
  if (subject.record_id === object.record_id) return undefined;

  const key = fundingAwardRelationTextKey(payload, subject, object);
  if (!key || hasFundingAwardFutureOrApprovalText(key)) return undefined;
  const sourceKey = sourceRecordTextKey(citingSource);

  if (DELIVERED_DIRECT_AGREEMENT_FUNDING_RELATION_KINDS.has(payload.relation_kind)) {
    if (hasAnyToken(sourceKey, ["agreements_entered_into_directly"])) return "delivered";
    return undefined;
  }

  if (payload.relation_kind === "transfers_funds_to") {
    if (hasAnyExactToken(key, ["transfer", "transfers", "transferred"]) || hasAnyToken(key, ["certifies_and_transfers", "certified_and_transferred", "operating_surplus_transfer"])) return "delivered";
  }
  if (payload.relation_kind === "makes_payment_to") {
    if (hasTokenPattern(key, "(?:makes|make|made)(?:_[a-z0-9]+){0,8}_payments") || hasAnyToken(key, ["required_to_make_mass_transportation_operating_assistance_payments"])) return "delivered";
  }
  if (payload.relation_kind === "entered_agreement_with") {
    if (hasAnyToken(key, ["license_agreement", "short_term_license", "short_term_permit"]) || hasAnyToken(sourceKey, ["agreements_entered_into_directly"])) return "delivered";
  }
  if (payload.relation_kind === "contracted_with" && hasExactToken(key, "executed")) return "delivered";
  if (payload.relation_kind === "contracted_by" && hasAnyToken(key, ["contracted_by"])) return "delivered";

  return undefined;
}

function comparableDateAfter(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (typeof left !== "string" || typeof right !== "string" || !left.trim() || !right.trim()) return false;
  return left > right;
}

function partnershipEventRoleTextKey(record: MtaCanonicalRecord, payload: JsonObject, event: MtaCanonicalRecord, includeEventText: boolean): string {
  return token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof record.raw_text === "string" ? record.raw_text : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
      includeEventText && typeof event.display_name === "string" ? event.display_name : "",
      includeEventText && typeof event.payload.event_name === "string" ? event.payload.event_name : "",
      includeEventText && typeof event.payload.description === "string" ? event.payload.description : "",
    ].join(" "),
  );
}

function partnershipEntityTextKey(record: MtaCanonicalRecord, payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string {
  return token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof record.raw_text === "string" ? record.raw_text : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
      typeof subject?.display_name === "string" ? subject.display_name : "",
      typeof subject?.payload.description === "string" ? subject.payload.description : "",
      typeof object?.display_name === "string" ? object.display_name : "",
      typeof object?.payload.description === "string" ? object.payload.description : "",
    ].join(" "),
  );
}

function hasPartnershipFutureOrPendingSignal(key: string): boolean {
  return hasAnyExactToken(key, ["will", "would", "could", "future", "upcoming", "anticipated", "expected", "scheduled", "proposed", "pending", "planned"]) || hasAnyToken(key, ["to_be", "will_be", "for_approval", "postpon", "defer", "cancel", "will_present", "will_provide", "will_operate"]);
}

function hasCompletedOrganizerSignal(key: string, sourceKey: string): boolean {
  return (
    hasAnyExactToken(key, ["held", "hosted", "organized", "issued", "closed", "convened", "launched", "led"]) ||
    hasAnyToken(key, ["co_organized", "hosted_by", "opened_the_meeting"]) ||
    hasAnyToken(sourceKey, ["meeting_summary", "meeting_minutes", "minutes_of"])
  );
}

function hasCompletedParticipantSignal(key: string): boolean {
  return hasAnyExactToken(key, ["attended", "participated", "joined", "delivered", "presented", "discussed", "provided", "submitted", "signed", "served", "spoke"]) || hasAnyToken(key, ["was_the_audience", "provided_an_overview", "respectfully_submitted"]);
}

function statusFromPartnershipEventRoleRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
  citingSource: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "partnership_engagement") return undefined;
  if (typeof payload.relation_kind !== "string" || !PARTNERSHIP_EVENT_ROLE_RELATION_KINDS.has(payload.relation_kind)) return undefined;

  const subjectIsEvent = subject?.record_kind === "event";
  const objectIsEvent = object?.record_kind === "event";
  const subjectIsEntity = subject?.record_kind === "entity";
  const objectIsEntity = object?.record_kind === "entity";
  if (!((subjectIsEvent && objectIsEntity) || (subjectIsEntity && objectIsEvent))) return undefined;

  const event = subjectIsEvent ? subject : object;
  if (!event || typeof event.payload.date_normalized !== "string" || !event.payload.date_normalized.trim()) return undefined;
  if (!PARTNERSHIP_EVENT_ROLE_FAMILIES.has(token(event.payload.event_family))) return undefined;

  const sourceKey = sourceRecordTextKey(citingSource);
  const isWorkPlanSource = hasAnyToken(sourceKey, ["work_plan", "workplan"]);
  const isAfterSource = comparableDateAfter(event.payload.date_normalized, citingSource?.payload.published_date_normalized);
  const key = partnershipEventRoleTextKey(record, payload, event, !isWorkPlanSource);
  const hasCompletedSignal = payload.relation_kind === "organized_by" ? hasCompletedOrganizerSignal(key, sourceKey) : hasCompletedParticipantSignal(key);

  if (!isWorkPlanSource && !isAfterSource && hasCompletedSignal && !hasPartnershipFutureOrPendingSignal(key)) return "delivered";
  if (isWorkPlanSource || isAfterSource || hasPartnershipFutureOrPendingSignal(key)) return "planned";
  return undefined;
}

function deliveredStatusFromFormalPartnershipArtifactRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "partnership_engagement") return undefined;
  if (payload.relation_kind !== "has_partner" && payload.relation_kind !== "collaborates_with") return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "entity") return undefined;
  if (subject.record_id === object.record_id) return undefined;

  const key = partnershipEntityTextKey(record, payload, subject, object);
  if (!key || hasPartnershipFutureOrPendingSignal(key)) return undefined;
  if (hasAnyToken(key, ["committed_to_working", "working_together", "collaborate_with", "partners_with"])) return undefined;
  if (
    hasAnyToken(key, [
      "entered_into_a_memorandum_of_understanding",
      "entered_into_an_mou",
      "entered_into_an_agreement",
      "executed_agreement",
      "convened_a_joint_task_force",
      "established_a_joint_task_force",
      "have_established_a_joint_task_force",
    ])
  ) {
    return "delivered";
  }
  return undefined;
}

function relationCitesSourceEndpoint(record: MtaCanonicalRecord, sourceEndpoint: MtaCanonicalRecord): boolean {
  if (sourceEndpoint.record_kind !== "source") return false;
  if (record.source_id === sourceEndpoint.source_id) return true;
  return (record.source_ids ?? []).includes(sourceEndpoint.source_id);
}

function recordHasEvidenceFromSource(record: MtaCanonicalRecord, sourceId: string): boolean {
  return record.evidence_refs.some((ref) => ref.source_id === sourceId);
}

function recordIncludesSource(record: MtaCanonicalRecord, sourceId: string): boolean {
  return record.source_id === sourceId || (record.source_ids ?? []).includes(sourceId);
}

function claimRelationTextKey(record: MtaCanonicalRecord, payload: JsonObject, claim: MtaCanonicalRecord): string {
  return token(
    [
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
      typeof claim.payload.claim_text === "string" ? claim.payload.claim_text : "",
      typeof claim.payload.description === "string" ? claim.payload.description : "",
      typeof claim.payload.statement === "string" ? claim.payload.statement : "",
      typeof claim.payload.subject === "string" ? claim.payload.subject : "",
      typeof claim.payload.existing === "string" ? claim.payload.existing : "",
      typeof claim.payload.proposed === "string" ? claim.payload.proposed : "",
    ].join(" "),
  );
}

function hasClaimEvidenceProvenance(record: MtaCanonicalRecord, claim: MtaCanonicalRecord): boolean {
  return recordIncludesSource(claim, record.source_id) && recordHasEvidenceFromSource(record, record.source_id) && recordHasEvidenceFromSource(claim, record.source_id);
}

function hasClaimRelationProvenance(record: MtaCanonicalRecord, claim: MtaCanonicalRecord): boolean {
  return recordIncludesSource(claim, record.source_id) && recordHasEvidenceFromSource(record, record.source_id);
}

function claimTextHasDeliveredSignal(key: string): boolean {
  return (
    hasAnyExactToken(key, ["implemented", "launched", "installed", "completed", "opened", "active", "currently", "existing", "declined", "increased", "decreased", "reduced", "improved", "faster", "slower", "stabilized"]) ||
    hasAnyToken(key, ["after_pre_payment", "is_now_active", "has_improved", "has_lost", "one_of_the_most_dangerous", "do_not_own_a_car", "commute_by_transit"])
  );
}

function claimTextHasDeliveredRejection(key: string): boolean {
  return hasAnyExactToken(key, ["will", "would", "could", "may", "planned", "proposed", "draft", "expected", "scheduled"]) || hasAnyToken(key, ["recommend", "work_plan", "agenda_item", "for_board_approval", "can_be", "being_implemented", "replacement_for_malformed"]);
}

function claimTextHasPlannedSignal(key: string): boolean {
  return (
    hasAnyToken(key, ["will_run", "will_operate", "will_travel", "will_serve", "will_be_implemented", "will_be_rerouted", "will_be_scheduled", "will_use", "will_provide"]) ||
    hasTokenPattern(key, "once(?:_[a-z0-9]+){0,8}_begins(?:_[a-z0-9]+){0,8}_will_make_it_possible")
  );
}

function claimTextHasPlannedRejection(key: string): boolean {
  return (
    hasAnyExactToken(key, ["would", "proposed", "draft", "expected", "currently", "existing", "active"]) ||
    hasAnyToken(key, ["as_proposed", "revisions_implemented", "remains_available", "work_plan", "agenda_item", "for_board_approval", "no_proposed_revisions", "not_be_implemented", "will_not_be_implemented"])
  );
}

function claimTextHasProposedSignal(key: string): boolean {
  return (
    hasAnyToken(key, ["we_propose_operating", "would_be_moved", "would_be_replaced", "would_create", "would_result"]) ||
    hasTokenPattern(key, "proposed(?:_[a-z0-9]+){0,8}_(?:route|service|schedule|bus|changes|bus_lanes)") ||
    hasTokenPattern(key, "(?:route|service|schedule|trip|trips)(?:_[a-z0-9]+){0,8}_proposed")
  );
}

function claimTextHasProposedRejection(key: string): boolean {
  return hasAnyToken(key, ["no_proposed_revisions", "not_be_implemented", "will_not_be_implemented", "as_proposed_in_draft_plan", "draft_plan_proposal_to_adjust", "work_plan", "agenda_item"]);
}

function claimChangeTypeKey(claim: MtaCanonicalRecord): string {
  const normalized = claim.payload.change_type_normalized;
  if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
    const normalizedValue = (normalized as JsonObject).normalized_value;
    if (typeof normalizedValue === "string") return token(normalizedValue);
  }
  return token(claim.payload.change_type);
}

function deliveredStatusFromClaimSourceContainmentRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "claim_context") return undefined;
  if (payload.relation_kind !== "has_claim") return undefined;
  if (subject?.record_kind !== "source" || object?.record_kind !== "claim") return undefined;
  if (!relationCitesSourceEndpoint(record, subject)) return undefined;
  if (!recordIncludesSource(object, subject.source_id)) return undefined;
  if (!recordHasEvidenceFromSource(record, subject.source_id)) return undefined;
  return "delivered";
}

function claimPresentedToAudienceKey(entity: MtaCanonicalRecord): string {
  return token(
    [
      typeof entity.display_name === "string" ? entity.display_name : "",
      textFromPayloadField(entity.payload, "entity_name"),
      textFromPayloadField(entity.payload, "entity_type"),
      textFromPayloadField(entity.payload, "description"),
      textFromPayloadField(entity.payload, "organization"),
      textFromPayloadField(entity.payload, "parent_organization"),
      textFromPayloadField(entity.payload, "parent_entity"),
      textFromPayloadField(entity.payload, "short_name"),
      textFromPayloadField(entity.payload, "role"),
    ].join(" "),
  );
}

function isClaimPresentationAudience(entity: MtaCanonicalRecord): boolean {
  const key = claimPresentedToAudienceKey(entity);
  return hasAnyExactToken(key, ["committee", "board"]) || hasAnyToken(key, ["community_board", "governing_body", "mta_board"]);
}

function sourcePresentedToAudienceTextKey(record: MtaCanonicalRecord, payload: JsonObject, source: MtaCanonicalRecord): string {
  return token(
    [
      typeof source.display_name === "string" ? source.display_name : "",
      textFromPayloadField(source.payload, "title"),
      textFromPayloadField(source.payload, "content_type"),
      textFromPayloadField(source.payload, "description"),
      textFromPayloadField(source.payload, "authority_tier"),
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
    ].join(" "),
  );
}

function sourcePresentedToAudienceHasDocumentSignal(key: string): boolean {
  return hasAnyExactToken(key, ["presentation", "presented", "report", "summary", "committee", "board"]) || hasAnyToken(key, ["staff_summary", "financial_performance_report", "report_to", "presentation_to"]);
}

function sourcePresentedToAudienceHasRejection(key: string): boolean {
  return (
    hasAnyExactToken(key, ["proposed", "proposal", "draft", "future", "tentative", "cancelled", "canceled", "postponed", "deferred", "would", "could"]) ||
    hasAnyToken(key, ["not_presented", "no_meeting", "no_meetings", "no_item", "no_items", "will_be_presented", "scheduled_to_be_presented", "to_be_presented", "planned_presentation", "will_present"])
  );
}

function claimPresentationRelationTextKey(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord,
  object: MtaCanonicalRecord,
  citingSource: MtaCanonicalRecord | undefined,
): string {
  return token(
    [
      typeof subject.display_name === "string" ? subject.display_name : "",
      textFromPayloadField(subject.payload, "event_name"),
      textFromPayloadField(subject.payload, "title"),
      textFromPayloadField(subject.payload, "description"),
      typeof object.display_name === "string" ? object.display_name : "",
      textFromPayloadField(object.payload, "entity_name"),
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
      sourceRecordTextKey(citingSource),
    ].join(" "),
  );
}

function claimPresentationRelationHasRejection(key: string): boolean {
  return (
    hasAnyExactToken(key, ["draft", "future", "tentative", "cancelled", "canceled", "postponed", "deferred", "would", "could"]) ||
    hasAnyToken(key, ["not_presented", "no_meeting", "no_meetings", "no_item", "no_items", "will_be_presented", "scheduled_to_be_presented", "to_be_presented", "planned_presentation", "will_present"])
  );
}

function deliveredStatusFromSourcePresentedToAudienceRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "claim_context") return undefined;
  if (payload.relation_kind !== "presented_to") return undefined;
  if (subject?.record_kind !== "source" || object?.record_kind !== "entity") return undefined;
  if (!relationCitesSourceEndpoint(record, subject)) return undefined;
  if (!isClaimPresentationAudience(object)) return undefined;

  const key = sourcePresentedToAudienceTextKey(record, payload, subject);
  if (!sourcePresentedToAudienceHasDocumentSignal(key)) return undefined;
  if (sourcePresentedToAudienceHasRejection(key)) return undefined;
  return "delivered";
}

function statusFromClaimPresentedToAudienceRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
  citingSource: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "claim_context") return undefined;
  if (payload.relation_kind !== "presented_to") return undefined;
  if (subject?.record_kind !== "entity" && subject?.record_kind !== "event") return undefined;
  if (object?.record_kind !== "entity" || !isClaimPresentationAudience(object)) return undefined;
  if (!recordHasEvidenceFromSource(record, record.source_id)) return undefined;

  const key = claimPresentationRelationTextKey(record, payload, subject, object, citingSource);
  if (!key || claimPresentationRelationHasRejection(key)) return undefined;
  if (hasAnyToken(key, ["will_be_provided", "provided_monthly", "is_provided_monthly"])) return "planned";
  if (
    hasAnyExactToken(key, ["presented", "presentation", "delivered", "provided"]) ||
    hasAnyToken(key, ["presented_to", "presentation_to", "report_to", "update_to_the_mta_board", "update_to_mta_board"])
  ) {
    return "delivered";
  }
  return undefined;
}

function statusFromClaimChangeTypeRelation(record: MtaCanonicalRecord, payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "claim_context") return undefined;
  if (payload.relation_kind !== "has_claim") return undefined;
  if (object?.record_kind !== "claim") return undefined;
  if (subject?.record_kind !== "entity" && subject?.record_kind !== "route" && subject?.record_kind !== "corridor") return undefined;
  if (!hasClaimEvidenceProvenance(record, object)) return undefined;

  const changeType = claimChangeTypeKey(object);
  if (!changeType) return undefined;

  const key = claimRelationTextKey(record, payload, object);
  if (hasAnyExactToken(changeType, ["decrease", "favorable", "favorable_vs_forecast", "unfavorable_vs_forecast"]) && !claimTextHasDeliveredRejection(key)) return "delivered";
  if (hasAnyExactToken(changeType, ["planned", "coming_soon"]) && !claimTextHasPlannedRejection(key)) return "planned";
  if (hasExactToken(changeType, "proposed") && !claimTextHasProposedRejection(key)) return "proposed";
  if (hasExactToken(changeType, "ongoing") && !hasAnyExactToken(key, ["ended", "completed", "complete", "cancelled", "canceled", "deferred", "suspended"])) return "in_progress";
  return undefined;
}

function statusFromScopedClaimRelation(record: MtaCanonicalRecord, payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "claim_context") return undefined;
  if (payload.relation_kind !== "has_claim") return undefined;
  if (object?.record_kind !== "claim") return undefined;
  if (!subject || !hasClaimEvidenceProvenance(record, object)) return undefined;

  const key = claimRelationTextKey(record, payload, object);
  if (!key) return undefined;

  if ((subject.record_kind === "route" || subject.record_kind === "corridor") && claimTextHasDeliveredSignal(key) && !claimTextHasDeliveredRejection(key)) return "delivered";
  if (subject.record_kind === "route" && claimTextHasPlannedSignal(key) && !claimTextHasPlannedRejection(key)) return "planned";
  if (subject.record_kind === "route" && claimTextHasProposedSignal(key) && !claimTextHasProposedRejection(key)) return "proposed";

  return undefined;
}

function plannedStatusFromRecurringAgendaItemClaimRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
  citingSource: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "claim_context") return undefined;
  if (payload.relation_kind !== "has_recurring_agenda_item") return undefined;
  if (subject?.record_kind !== "entity" || object?.record_kind !== "claim") return undefined;
  if (!hasClaimRelationProvenance(record, object)) return undefined;

  const sourceKey = sourceRecordTextKey(citingSource);
  const key = claimRelationTextKey(record, payload, object);
  if (!sourceKey || !hasAnyToken(sourceKey, ["work_plan", "workplan"])) return undefined;
  if (hasAnyToken(key, ["no_item", "no_items", "no_meeting", "no_meetings", "postpon", "defer", "cancel"])) return undefined;
  return "planned";
}

function statusFromSourceStatedSubjectClaimRelation(record: MtaCanonicalRecord, payload: JsonObject, subject: MtaCanonicalRecord | undefined, object: MtaCanonicalRecord | undefined): string | undefined {
  if (payload.relation_family !== "claim_context") return undefined;
  if (payload.relation_kind !== "has_claim") return undefined;
  if (object?.record_kind !== "claim") return undefined;
  if (!subject || !["corridor", "entity", "event", "project", "route", "treatment_component"].includes(subject.record_kind)) return undefined;
  if (!hasClaimRelationProvenance(record, object)) return undefined;

  const key = claimRelationTextKey(record, payload, object);
  if (!key) return undefined;
  if (hasAnyToken(key, ["no_proposed_revisions", "not_be_implemented", "will_not_be_implemented"])) return undefined;

  const changeType = claimChangeTypeKey(object);
  const hasDelivered = claimTextHasDeliveredSignal(key);
  const hasPlanned =
    claimTextHasPlannedSignal(key) ||
    (hasAnyExactToken(key, ["will", "expected", "scheduled"]) && !claimTextHasPlannedRejection(key));
  const hasProposed =
    claimTextHasProposedSignal(key) ||
    (hasAnyExactToken(key, ["would", "could", "may"]) && !claimTextHasProposedRejection(key));
  if (hasDelivered && (hasPlanned || hasProposed)) return undefined;

  if (hasAnyExactToken(changeType, ["decrease", "favorable", "favorable_vs_forecast", "unfavorable_vs_forecast"])) return "delivered";
  if (hasAnyExactToken(changeType, ["planned", "coming_soon"])) return "planned";
  if (hasExactToken(changeType, "proposed")) return "proposed";
  if (hasExactToken(changeType, "ongoing") && hasAnyExactToken(key, ["ended", "completed", "complete", "cancelled", "canceled", "deferred", "suspended"])) return undefined;
  if (hasExactToken(changeType, "ongoing")) return "in_progress";
  if (hasProposed) return "proposed";
  if (hasPlanned) return "planned";
  return "delivered";
}

function deliveredStatusFromMetricSourceContainmentRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "metric_context") return undefined;
  if (payload.relation_kind === "includes") {
    if (subject?.record_kind !== "source" || object?.record_kind !== "metric_claim") return undefined;
    if (!relationCitesSourceEndpoint(record, subject)) return undefined;
    return "delivered";
  }
  if (payload.relation_kind === "metric_of_source") {
    if (subject?.record_kind !== "metric_claim" || object?.record_kind !== "source") return undefined;
    if (!relationCitesSourceEndpoint(record, object)) return undefined;
    return "delivered";
  }
  return undefined;
}

const METRIC_LABEL_FIELDS = ["metric_name", "period", "time_period", "category", "scenario", "label", "date", "year"] as const;
const METRIC_TEXT_FIELDS = ["raw_text", "raw_value_text", "unit", "unit_normalized", "scope", "comparison", "change", "description"] as const;

function textFromPayloadField(payload: JsonObject, field: string): string {
  const value = payload[field];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function metricLabelTextKey(metric: MtaCanonicalRecord): string {
  return token([typeof metric.display_name === "string" ? metric.display_name : "", ...METRIC_LABEL_FIELDS.map((field) => textFromPayloadField(metric.payload, field))].join(" "));
}

function metricTextKey(metric: MtaCanonicalRecord, labelKey: string): string {
  return token([labelKey, ...METRIC_TEXT_FIELDS.map((field) => textFromPayloadField(metric.payload, field)), ...metric.evidence_refs.map((ref) => ref.source_quote ?? "")].join(" "));
}

function metricProposalRejectionKey(key: string): boolean {
  return hasAnyToken(key, ["savings_from_initial_proposal", "savings_vs_proposal", "reduction_from_proposal"]);
}

function metricHasProposedSignal(labelKey: string, metricNameKey: string): boolean {
  if (metricProposalRejectionKey(labelKey) || metricProposalRejectionKey(metricNameKey)) return false;
  return (
    hasAnyToken(labelKey, ["final_proposed_budget", "as_proposed"]) ||
    hasAnyExactToken(labelKey, ["proposed", "draft", "concept"]) ||
    hasAnyToken(metricNameKey, ["proposal_amount", "initial_proposal_amount", "original_proposal_amount"])
  );
}

function metricHasForecastComparisonLabel(key: string): boolean {
  return hasAnyToken(key, ["vs_forecast", "actual_vs_forecast", "forecast_vs_actual", "forecast_variance", "compared_to_forecast"]);
}

function metricHasBudgetComparisonLabel(key: string): boolean {
  return hasAnyToken(key, ["vs_budget", "budget_vs_actual", "actual_vs_budget", "budget_variance", "above_budget", "below_budget", "favorable_to_budget", "unfavorable_to_budget"]);
}

function metricHasGoalComparisonLabel(key: string): boolean {
  return hasAnyToken(key, ["above_goal", "below_goal", "exceeding_goal", "goal_at"]);
}

function metricHasPlannedSignal(labelKey: string, metricNameKey: string, displayKey: string): boolean {
  const forecastSignal =
    hasAnyExactToken(displayKey, ["forecast", "projected"]) ||
    hasAnyToken(metricNameKey, ["projected_"]) ||
    hasAnyToken(labelKey, ["mid_year_forecast", "november_forecast", "monthly_forecast", "ytd_forecast", "financial_plan"]);
  if (forecastSignal && !metricHasForecastComparisonLabel(labelKey)) return true;

  const budgetSignal = hasAnyToken(labelKey, ["adopted_budget"]) || hasExactToken(displayKey, "budget") || hasExactToken(metricNameKey, "budget") || hasExactToken(labelKey, "budget");
  if (budgetSignal && !metricHasBudgetComparisonLabel(labelKey)) return true;

  const goalSignal =
    hasAnyToken(labelKey, ["commitment_goal", "contract_diversity_goal", "savings_target", "target_investment_return", "target_return", "budget_savings_target"]) ||
    hasAnyExactToken(metricNameKey, ["goal", "target"]);
  if (goalSignal && !metricHasGoalComparisonLabel(labelKey)) return true;

  return false;
}

function metricHasBeforeAfterObservation(key: string): boolean {
  return (
    hasAnyExactToken(key, ["before", "after", "baseline", "pre", "post", "pre_pandemic", "post_pandemic", "compared_to"]) &&
    hasAnyExactToken(key, ["increased", "decreased", "reduced", "improved", "declined", "faster", "slower", "saved", "lost", "above", "below", "exceeding"])
  );
}

function metricHasDeliveredSignal(metricKey: string, labelKey: string): boolean {
  if (hasAnyExactToken(labelKey, ["will", "planned", "scheduled"]) || hasAnyToken(labelKey, ["to_be", "will_be"]) || metricHasGoalComparisonLabel(labelKey)) return false;
  return (
    hasAnyExactToken(metricKey, ["actual", "current", "existing", "observed", "reported", "completed", "implemented", "installed", "opened", "active", "achieved", "incurred", "spent", "favorable", "unfavorable", "ytd"]) ||
    hasAnyToken(metricKey, ["year_to_date", "as_of"]) ||
    hasTokenPattern(metricKey, "through_(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)") ||
    metricHasBeforeAfterObservation(metricKey)
  );
}

function metricUnitFamilyKey(metric: MtaCanonicalRecord): string {
  const unitNormalized = metric.payload.unit_normalized;
  if (unitNormalized && typeof unitNormalized === "object" && !Array.isArray(unitNormalized)) {
    const unitFamily = (unitNormalized as JsonObject).unit_family;
    if (typeof unitFamily === "string") return token(unitFamily);
  }
  if (typeof unitNormalized === "string") return token(unitNormalized);
  return token(metric.payload.unit_family);
}

function metricNormalizedUnitKey(metric: MtaCanonicalRecord): string {
  const unitNormalized = metric.payload.unit_normalized;
  if (unitNormalized && typeof unitNormalized === "object" && !Array.isArray(unitNormalized)) {
    const normalizedUnit = (unitNormalized as JsonObject).normalized_unit;
    if (typeof normalizedUnit === "string") return token(normalizedUnit);
  }
  if (typeof unitNormalized === "string") return token(unitNormalized);
  return token(metric.payload.unit);
}

function metricHasConcreteValue(metric: MtaCanonicalRecord): boolean {
  for (const field of ["value", "value_min", "value_max"] as const) {
    const value = metric.payload[field];
    if (typeof value === "number") return true;
    if (typeof value === "string" && /\d/u.test(value)) return true;
  }
  const rawValueText = metric.payload.raw_value_text;
  return typeof rawValueText === "string" && /\d/u.test(rawValueText);
}

function metricHasObservedPeriodAnchor(metric: MtaCanonicalRecord, metricKey: string): boolean {
  if (["year", "period", "time_period", "date"].some((field) => textFromPayloadField(metric.payload, field).trim())) return true;
  return hasAnyExactToken(metricKey, ["daily", "weekday", "weekend", "annual", "monthly", "quarterly", "quarter", "day", "week", "month", "year"]);
}

function metricRelationTextKey(record: MtaCanonicalRecord, payload: JsonObject, metric: MtaCanonicalRecord, labelKey: string): string {
  return token(
    [
      metricTextKey(metric, labelKey),
      typeof payload.description === "string" ? payload.description : "",
      typeof payload.source_quote === "string" ? payload.source_quote : "",
      typeof payload.notes === "string" ? payload.notes : "",
      typeof record.raw_text === "string" ? record.raw_text : "",
      ...record.evidence_refs.map((ref) => ref.source_quote ?? ""),
    ].join(" "),
  );
}

function metricReportedActualTextKey(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  metric: MtaCanonicalRecord,
  labelKey: string,
  source: MtaCanonicalRecord | undefined,
): string {
  return token(
    [
      metricRelationTextKey(record, payload, metric, labelKey),
      typeof source?.display_name === "string" ? source.display_name : "",
      textFromPayloadField(source?.payload ?? {}, "title"),
      textFromPayloadField(source?.payload ?? {}, "content_type"),
      textFromPayloadField(source?.payload ?? {}, "description"),
    ].join(" "),
  );
}

function metricObservedBusOrCorridorTextKey(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  metric: MtaCanonicalRecord,
  subject: MtaCanonicalRecord | undefined,
  labelKey: string,
  source: MtaCanonicalRecord | undefined,
): string {
  return token(
    [
      metricRelationTextKey(record, payload, metric, labelKey),
      typeof subject?.display_name === "string" ? subject.display_name : "",
      typeof source?.display_name === "string" ? source.display_name : "",
      textFromPayloadField(source?.payload ?? {}, "title"),
      textFromPayloadField(source?.payload ?? {}, "content_type"),
    ].join(" "),
  );
}

function metricSourceReportTextKey(source: MtaCanonicalRecord | undefined): string {
  if (!source) return "";
  return token(
    [
      typeof source.display_name === "string" ? source.display_name : "",
      textFromPayloadField(source.payload, "title"),
      textFromPayloadField(source.payload, "content_type"),
      textFromPayloadField(source.payload, "description"),
    ].join(" "),
  );
}

function metricHasObservedDocumentPeriodAnchor(sourceKey: string): boolean {
  return (
    hasAnyExactToken(sourceKey, ["annual", "monthly", "quarterly", "quarter", "year"]) ||
    hasAnyExactToken(sourceKey, ["jan", "january", "feb", "february", "mar", "march", "apr", "april", "may", "jun", "june", "jul", "july", "aug", "august", "sep", "sept", "september", "oct", "october", "nov", "november", "dec", "december"]) ||
    /(^|_)(?:fy)?20[0-9]{2}(_|$)/u.test(sourceKey) ||
    /(^|_)[1-4]q[0-9]{2}(_|$)/u.test(sourceKey) ||
    /(^|_)q[1-4](?:_[0-9]{2}|_20[0-9]{2})(_|$)/u.test(sourceKey)
  );
}

function metricHasObservedStatusRejection(key: string): boolean {
  if (
    hasAnyExactToken(key, [
      "will",
      "would",
      "could",
      "planned",
      "proposed",
      "proposal",
      "draft",
      "future",
      "expected",
      "forecast",
      "projected",
      "projection",
      "budget",
      "goal",
      "target",
      "option",
      "estimate",
      "estimated",
      "preliminary",
      "scenario",
      "alternative",
      "alternatives",
      "potential",
      "candidate",
      "scheduled",
    ]) ||
    hasAnyToken(key, ["to_be", "will_be", "as_proposed", "final_proposed_budget", "financial_plan", "capital_plan", "service_plan", "modeled", "modelled"])
  ) {
    return true;
  }
  return false;
}

function metricHasReportedActualDeliveredSignal(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  metric: MtaCanonicalRecord,
  labelKey: string,
  displayKey: string,
  citingSource: MtaCanonicalRecord | undefined,
): boolean {
  if (!citingSource) return false;
  if (!metricHasConcreteValue(metric)) return false;

  const sourceKey = metricSourceReportTextKey(citingSource);
  if (!sourceKey) return false;

  const key = metricReportedActualTextKey(record, payload, metric, labelKey, citingSource);
  if (!key) return false;
  if (metricHasObservedStatusRejection(key)) return false;
  if (hasAnyExactToken(key, ["feasibility"])) return false;

  return metricHasObservedPeriodAnchor(metric, key) || metricHasObservedCompactPeriodAnchor(metric, labelKey, displayKey) || metricHasObservedDocumentPeriodAnchor(sourceKey);
}

function metricHasObservedRidershipDeliveredSignal(record: MtaCanonicalRecord, payload: JsonObject, metric: MtaCanonicalRecord, labelKey: string): boolean {
  if (metricUnitFamilyKey(metric) !== "ridership") return false;
  if (!metricHasConcreteValue(metric)) return false;

  const key = metricRelationTextKey(record, payload, metric, labelKey);
  if (!metricHasObservedPeriodAnchor(metric, key)) return false;
  if (metricHasObservedStatusRejection(key)) return false;
  return true;
}

function metricHasObservedRidershipChangeDeliveredSignal(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  metric: MtaCanonicalRecord,
  labelKey: string,
  metricNameKey: string,
  displayKey: string,
): boolean {
  if (metricNameKey !== "ridership_change") return false;

  const unitFamily = metricUnitFamilyKey(metric);
  const normalizedUnit = metricNormalizedUnitKey(metric);
  const unitMatches =
    (unitFamily === "percentage" && normalizedUnit === "percent") ||
    unitFamily === "ridership" ||
    (unitFamily === "count" && hasAnyExactToken(normalizedUnit, ["trips", "riders", "boardings"]));
  if (!unitMatches) return false;
  if (!metricHasConcreteValue(metric)) return false;

  const key = metricRelationTextKey(record, payload, metric, labelKey);
  if (metricHasObservedStatusRejection(key)) return false;

  const comparisonKey = token(
    [
      labelKey,
      displayKey,
      key,
      textFromPayloadField(metric.payload, "comparison"),
      textFromPayloadField(metric.payload, "comparison_period"),
      textFromPayloadField(metric.payload, "direction"),
      textFromPayloadField(metric.payload, "change"),
    ].join(" "),
  );
  const hasObservedAnchor =
    metricHasObservedCompactPeriodAnchor(metric, comparisonKey, displayKey) ||
    hasAnyToken(comparisonKey, ["limited_to_sbs", "after_launch", "after_implementation", "since_service_began", "first_year", "first_11_months"]);
  if (!hasObservedAnchor) return false;

  return (
    hasAnyExactToken(comparisonKey, ["increase", "increased", "decrease", "decreased", "higher", "lower", "up", "down", "growth", "grew", "more", "less", "fewer", "doubled"]) ||
    hasAnyToken(comparisonKey, ["ridership_change"])
  );
}

const OBSERVED_WORKFORCE_UNITS = new Set(["employees", "positions", "full_time_equivalents", "headcount"]);

function metricHasObservedCompactPeriodAnchor(metric: MtaCanonicalRecord, labelKey: string, displayKey: string): boolean {
  if (metricHasObservedPeriodAnchor(metric, labelKey)) return true;
  const key = token([labelKey, displayKey, textFromPayloadField(metric.payload, "metric_name")].join(" "));
  return (
    hasAnyExactToken(key, ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"]) ||
    /(^|_)(?:fy)?20[0-9]{2}(_|$)/u.test(key) ||
    /(^|_)[1-4]q[0-9]{2}(_|$)/u.test(key) ||
    /(^|_)q[1-4](?:_[0-9]{2}|_20[0-9]{2})(_|$)/u.test(key) ||
    /(^|_)[a-z]{3,9}20[0-9]{2}(_|$)/u.test(key)
  );
}

function metricHasObservedWorkforcePeriodAnchor(metric: MtaCanonicalRecord, labelKey: string, displayKey: string): boolean {
  return metricHasObservedCompactPeriodAnchor(metric, labelKey, displayKey);
}

function metricHasObservedWorkforceRejection(metric: MtaCanonicalRecord, labelKey: string, metricNameKey: string, displayKey: string): boolean {
  const key = token(
    [
      labelKey,
      metricNameKey,
      displayKey,
      textFromPayloadField(metric.payload, "scenario"),
      textFromPayloadField(metric.payload, "comparison"),
      textFromPayloadField(metric.payload, "change"),
      textFromPayloadField(metric.payload, "status"),
    ].join(" "),
  );
  return hasAnyExactToken(key, ["will", "would", "could", "planned", "proposed", "proposal", "draft", "future", "expected", "forecast", "budget", "goal", "target", "option", "estimate", "estimated", "variance"]) || hasAnyToken(key, ["to_be", "will_be", "final_estimate", "final_proposed_budget", "financial_plan", "capital_plan", "service_plan"]);
}

function metricHasObservedWorkforceDeliveredSignal(
  metric: MtaCanonicalRecord,
  subject: MtaCanonicalRecord,
  labelKey: string,
  metricNameKey: string,
  displayKey: string,
): boolean {
  if (subject.record_kind !== "entity") return false;
  if (metricUnitFamilyKey(metric) !== "workforce") return false;
  if (!OBSERVED_WORKFORCE_UNITS.has(metricNormalizedUnitKey(metric))) return false;
  if (!metricHasConcreteValue(metric)) return false;
  if (!metricHasObservedWorkforcePeriodAnchor(metric, labelKey, displayKey)) return false;
  if (metricHasObservedWorkforceRejection(metric, labelKey, metricNameKey, displayKey)) return false;
  return true;
}

function metricNameHasComplaintOrLawsuitSignal(metricNameKey: string): boolean {
  return hasAnyExactToken(metricNameKey, ["complaint", "complaints", "lawsuit", "lawsuits"]);
}

function metricHasObservedComplaintOrLawsuitDeliveredSignal(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  metric: MtaCanonicalRecord,
  subject: MtaCanonicalRecord,
  labelKey: string,
  metricNameKey: string,
  displayKey: string,
): boolean {
  if (subject.record_kind !== "entity") return false;

  const nameSignalKey = token([metricNameKey, labelKey, displayKey].join(" "));
  if (!metricNameHasComplaintOrLawsuitSignal(nameSignalKey)) return false;

  const unitFamily = metricUnitFamilyKey(metric);
  const normalizedUnit = metricNormalizedUnitKey(metric);
  const unitMatches =
    (unitFamily === "count" && hasAnyExactToken(normalizedUnit, ["complaints", "lawsuits", "count"])) ||
    (!unitFamily && metricNameHasComplaintOrLawsuitSignal(metricNameKey));
  if (!unitMatches) return false;

  if (!metricHasConcreteValue(metric)) return false;
  if (!metricHasObservedCompactPeriodAnchor(metric, labelKey, displayKey)) return false;

  const key = metricRelationTextKey(record, payload, metric, labelKey);
  if (metricHasObservedStatusRejection(key)) return false;
  return true;
}

const OBSERVED_ON_TIME_PERFORMANCE_NAMES = new Set([
  "on_time_performance",
  "on_time_performance_by_line",
  "on_time_performance_by_branch",
  "weekday_on_time_performance",
  "subway_on_time_performance",
]);

const OBSERVED_SERVICE_DELIVERY_NAMES = new Set(["service_delivered", "service_delivered_rate", "service_delivery_rate"]);
const OBSERVED_TRAVEL_TIME_NAMES = new Set(["travel_time", "bus_travel_time"]);
const OBSERVED_ROUTE_SPEED_NAMES = new Set(["bus_speed", "travel_speed", "peak_period_bus_speed", "average_bus_speed"]);
const OBSERVED_MDBF_NAMES = new Set(["mean_distance_between_failures", "mean_distance_between_failure"]);
const OBSERVED_BUS_OR_CORRIDOR_METRIC_NAMES = new Set([
  "alighting_distribution",
  "alightings_distribution",
  "average_bus_speed",
  "average_speed",
  "average_transit_travel_time",
  "average_station_spacing",
  "bicyclist_crash_injuries",
  "boardings",
  "boardings_distribution",
  "bus_bunching_percentage",
  "bus_commuter_share",
  "bus_delay_bus_stops",
  "bus_delay_breakdown",
  "bus_delay_cause",
  "bus_delay_hours",
  "bus_delay_red_lights",
  "bus_delay_share",
  "bus_delay_source_percentage",
  "bus_in_motion_percentage",
  "bus_lane_length",
  "bus_passenger_delay",
  "bus_speed",
  "bus_speed_improvement",
  "bus_volume",
  "car_free_households",
  "car_free_households_percentage",
  "commute_mode_share",
  "corridor_length",
  "crash_concentration",
  "crash_injuries",
  "crash_total_injuries",
  "customer_satisfaction",
  "daily_boarding",
  "daily_bus_trips",
  "daily_ridership",
  "delay_source_share",
  "dwell_time_reduction",
  "fare_evasion_reduction",
  "fatalities",
  "households_without_car",
  "ksi_rate",
  "ksi_rate_per_mile",
  "late_bus_percentage",
  "mode_share",
  "motor_vehicle_occupant_crash_injuries",
  "pedestrian_crash_injuries",
  "pm_rush_hour_bus_volume",
  "population_within_catchment",
  "population_within_walk",
  "resident_population",
  "rider_destination_percentage",
  "ridership_share",
  "service_frequency",
  "service_hours",
  "severe_injuries",
  "share_of_boardings",
  "share_of_riders",
  "speed_change",
  "speed_improvement",
  "speeding_rate",
  "stop_spacing",
  "survey_share",
  "sustainable_commute_mode_share",
  "total_crashes",
  "traffic_injury_reduction",
  "transit_commute_percentage",
  "transit_commute_share",
  "transit_mode_share",
  "travel_speed",
  "travel_time",
  "travel_time_improvement",
  "travel_time_reduction",
  "travel_time_savings",
  "travel_time_savings_percentage",
]);
const OBSERVED_BUS_OR_CORRIDOR_UNIT_FAMILIES = new Set([
  "count",
  "count_rate",
  "distance",
  "duration",
  "engagement",
  "percentage",
  "population",
  "rating",
  "ridership",
  "safety",
  "safety_rate",
  "speed",
]);

function metricHasObservedPerformanceStatusRejection(key: string): boolean {
  return (
    hasAnyExactToken(key, [
      "will",
      "would",
      "could",
      "planned",
      "proposed",
      "proposal",
      "draft",
      "future",
      "expected",
      "forecast",
      "projected",
      "projection",
      "budget",
      "option",
      "estimate",
      "estimated",
      "preliminary",
      "scenario",
      "alternative",
      "alternatives",
      "potential",
      "candidate",
      "scheduled",
    ]) || hasAnyToken(key, ["to_be", "will_be", "as_proposed", "final_proposed_budget", "financial_plan", "capital_plan", "service_plan", "modeled", "modelled"])
  );
}

function metricHasObservedOnTimePerformanceDeliveredSignal(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  metric: MtaCanonicalRecord,
  labelKey: string,
  metricNameKey: string,
  displayKey: string,
): boolean {
  if (!OBSERVED_ON_TIME_PERFORMANCE_NAMES.has(metricNameKey)) return false;
  if (metricUnitFamilyKey(metric) !== "percentage") return false;
  if (metricNormalizedUnitKey(metric) !== "percent") return false;
  if (!metricHasConcreteValue(metric)) return false;
  if (!metricHasObservedCompactPeriodAnchor(metric, labelKey, displayKey)) return false;

  const key = metricRelationTextKey(record, payload, metric, labelKey);
  if (metricHasObservedPerformanceStatusRejection(key)) return false;
  return true;
}

function metricHasObservedServiceDeliveryDeliveredSignal(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  metric: MtaCanonicalRecord,
  labelKey: string,
  metricNameKey: string,
  displayKey: string,
): boolean {
  if (!OBSERVED_SERVICE_DELIVERY_NAMES.has(metricNameKey)) return false;
  if (metricUnitFamilyKey(metric) !== "percentage") return false;
  if (metricNormalizedUnitKey(metric) !== "percent") return false;
  if (!metricHasConcreteValue(metric)) return false;
  if (!metricHasObservedCompactPeriodAnchor(metric, labelKey, displayKey)) return false;

  const key = metricRelationTextKey(record, payload, metric, labelKey);
  if (metricHasObservedPerformanceStatusRejection(key)) return false;
  return true;
}

function metricHasExplicitMetricPeriodAnchor(metric: MtaCanonicalRecord): boolean {
  return ["period", "time_period", "date", "year", "comparison_period"].some((field) => textFromPayloadField(metric.payload, field).trim());
}

function metricHasObservedTravelTimeDeliveredSignal(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  metric: MtaCanonicalRecord,
  subject: MtaCanonicalRecord | undefined,
  labelKey: string,
  metricNameKey: string,
): boolean {
  if (!isTrueRouteScope(subject)) return false;
  if (!OBSERVED_TRAVEL_TIME_NAMES.has(metricNameKey)) return false;
  if (metricUnitFamilyKey(metric) !== "duration") return false;
  if (metricNormalizedUnitKey(metric) !== "minutes") return false;
  if (!metricHasConcreteValue(metric)) return false;
  if (!metricHasExplicitMetricPeriodAnchor(metric)) return false;

  const key = metricRelationTextKey(record, payload, metric, labelKey);
  if (metricHasObservedPerformanceStatusRejection(key)) return false;
  return true;
}

function metricHasObservedRouteSpeedDeliveredSignal(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  metric: MtaCanonicalRecord,
  subject: MtaCanonicalRecord | undefined,
  labelKey: string,
  metricNameKey: string,
): boolean {
  if (!isTrueRouteScope(subject)) return false;
  if (!OBSERVED_ROUTE_SPEED_NAMES.has(metricNameKey)) return false;
  if (metricUnitFamilyKey(metric) !== "speed") return false;
  if (metricNormalizedUnitKey(metric) !== "mph") return false;
  if (!metricHasConcreteValue(metric)) return false;
  if (!metricHasExplicitMetricPeriodAnchor(metric)) return false;

  const key = metricRelationTextKey(record, payload, metric, labelKey);
  if (metricHasObservedPerformanceStatusRejection(key)) return false;
  return true;
}

function metricHasObservedMeanDistanceBetweenFailuresDeliveredSignal(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  metric: MtaCanonicalRecord,
  subject: MtaCanonicalRecord | undefined,
  labelKey: string,
  metricNameKey: string,
): boolean {
  if (subject?.record_kind !== "entity") return false;
  if (!OBSERVED_MDBF_NAMES.has(metricNameKey)) return false;
  if (metricUnitFamilyKey(metric) !== "distance") return false;
  if (metricNormalizedUnitKey(metric) !== "miles") return false;
  if (!metricHasConcreteValue(metric)) return false;
  if (!metricHasExplicitMetricPeriodAnchor(metric)) return false;

  const key = metricRelationTextKey(record, payload, metric, labelKey);
  if (metricHasObservedPerformanceStatusRejection(key)) return false;
  return true;
}

function metricHasObservedBusOrCorridorMetricDeliveredSignal(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  metric: MtaCanonicalRecord,
  subject: MtaCanonicalRecord | undefined,
  labelKey: string,
  metricNameKey: string,
  displayKey: string,
  citingSource: MtaCanonicalRecord | undefined,
): boolean {
  if (!citingSource) return false;
  if (!OBSERVED_BUS_OR_CORRIDOR_METRIC_NAMES.has(metricNameKey)) return false;
  if (!OBSERVED_BUS_OR_CORRIDOR_UNIT_FAMILIES.has(metricUnitFamilyKey(metric))) return false;
  if (!metricHasConcreteValue(metric)) return false;

  const sourceKey = metricSourceReportTextKey(citingSource);
  const routeKey = routeDescriptorTextKey(subject);
  const isBusRouteSubject =
    isTrueBusRouteScope(subject) ||
    (isTrueRouteScope(subject) && !isSubwayRoute(subject) && !routeDescriptorHasRailSignal(routeKey) && sourceTextHasBusPrioritySignal(sourceKey));
  if (subject?.record_kind !== "corridor" && !isBusRouteSubject) return false;

  const key = metricObservedBusOrCorridorTextKey(record, payload, metric, subject, labelKey, citingSource);
  if (!key) return false;
  if (metricHasObservedStatusRejection(key)) return false;
  if (hasAnyExactToken(key, ["feasibility"]) || hasAnyToken(key, ["no_build", "build_scenario"])) return false;

  return (
    metricHasObservedPeriodAnchor(metric, key) ||
    metricHasObservedCompactPeriodAnchor(metric, labelKey, displayKey) ||
    metricHasObservedDocumentPeriodAnchor(sourceKey) ||
    hasAnyExactToken(key, [
      "achieved",
      "alightings",
      "boardings",
      "corridor",
      "crashes",
      "current",
      "customer",
      "customers",
      "daily",
      "delay",
      "eastbound",
      "existing",
      "fatalities",
      "households",
      "injuries",
      "northbound",
      "observed",
      "peak",
      "residents",
      "rider",
      "riders",
      "satisfaction",
      "southbound",
      "survey",
      "surveyed",
      "weekday",
      "weekend",
      "westbound",
    ]) ||
    hasAnyToken(key, [
      "after_implementation",
      "after_launch",
      "after_sbs",
      "average_speed",
      "bus_delay",
      "bus_speed",
      "do_not_own_a_car",
      "in_motion",
      "mode_share",
      "red_lights",
      "since_implementation",
      "source_of_delay",
      "sources_of_delay",
      "speed_of",
      "transit_commute",
      "travel_time",
      "within_1_4_mile",
      "within_a_10_minute_walk",
    ])
  );
}

function metricHasObservedEquipmentAvailabilityDeliveredSignal(record: MtaCanonicalRecord, payload: JsonObject, metric: MtaCanonicalRecord, labelKey: string): boolean {
  const metricNameKey = token(metric.payload.metric_name);
  if (metricNameKey !== "elevator_availability" && metricNameKey !== "escalator_availability") return false;
  if (metricUnitFamilyKey(metric) !== "percentage") return false;
  if (!metricHasConcreteValue(metric)) return false;

  const key = metricRelationTextKey(record, payload, metric, labelKey);
  if (!metricHasObservedPeriodAnchor(metric, key)) return false;
  if (metricHasObservedStatusRejection(key)) return false;
  return true;
}

function statusFromScopedMetricRelation(
  record: MtaCanonicalRecord,
  payload: JsonObject,
  subject: MtaCanonicalRecord | undefined,
  object: MtaCanonicalRecord | undefined,
  citingSource: MtaCanonicalRecord | undefined,
): string | undefined {
  if (payload.relation_family !== "metric_context") return undefined;
  if (payload.relation_kind !== "has_metric") return undefined;
  if (object?.record_kind !== "metric_claim") return undefined;
  if (subject?.record_kind !== "entity" && subject?.record_kind !== "route" && subject?.record_kind !== "corridor") return undefined;
  if (!recordIncludesSource(object, record.source_id)) return undefined;
  if (!recordHasEvidenceFromSource(record, record.source_id) || !recordHasEvidenceFromSource(object, record.source_id)) return undefined;

  const labelKey = metricLabelTextKey(object);
  const metricNameKey = token(object.payload.metric_name);
  const displayKey = token(object.display_name);
  const fullMetricKey = metricTextKey(object, labelKey);

  if (metricHasProposedSignal(labelKey, metricNameKey)) return "proposed";
  if (metricHasPlannedSignal(labelKey, metricNameKey, displayKey)) return "planned";
  if (metricHasObservedRidershipDeliveredSignal(record, payload, object, labelKey)) return "delivered";
  if (metricHasObservedRidershipChangeDeliveredSignal(record, payload, object, labelKey, metricNameKey, displayKey)) return "delivered";
  if (metricHasObservedEquipmentAvailabilityDeliveredSignal(record, payload, object, labelKey)) return "delivered";
  if (metricHasObservedWorkforceDeliveredSignal(object, subject, labelKey, metricNameKey, displayKey)) return "delivered";
  if (metricHasObservedComplaintOrLawsuitDeliveredSignal(record, payload, object, subject, labelKey, metricNameKey, displayKey)) return "delivered";
  if (metricHasObservedOnTimePerformanceDeliveredSignal(record, payload, object, labelKey, metricNameKey, displayKey)) return "delivered";
  if (metricHasObservedServiceDeliveryDeliveredSignal(record, payload, object, labelKey, metricNameKey, displayKey)) return "delivered";
  if (metricHasObservedTravelTimeDeliveredSignal(record, payload, object, subject, labelKey, metricNameKey)) return "delivered";
  if (metricHasObservedRouteSpeedDeliveredSignal(record, payload, object, subject, labelKey, metricNameKey)) return "delivered";
  if (metricHasObservedMeanDistanceBetweenFailuresDeliveredSignal(record, payload, object, subject, labelKey, metricNameKey)) return "delivered";
  if (metricHasObservedBusOrCorridorMetricDeliveredSignal(record, payload, object, subject, labelKey, metricNameKey, displayKey, citingSource)) return "delivered";
  if (metricHasReportedActualDeliveredSignal(record, payload, object, labelKey, displayKey, citingSource)) return "delivered";
  if (metricHasDeliveredSignal(fullMetricKey, labelKey)) return "delivered";
  return undefined;
}

const DATE_FIELDS = ["as_of_date", "date", "event_date", "date_text", "effective_date"] as const;

function dateFromPayload(payload: JsonObject): string | undefined {
  for (const field of DATE_FIELDS) {
    const value = payload[field];
    const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
    if (!text.trim()) continue;
    const normalized = normalizeDateText(text);
    if (typeof normalized.normalized_date === "string") return normalized.normalized_date;
  }
  return undefined;
}

/** Fold assertion_status + as_of_date into every relation record's payload, in place. */
export function withAssertionQualifiers(records: MtaCanonicalRecord[]): MtaCanonicalRecord[] {
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const sourceDateById = new Map<string, string>();
  const sourceBySourceId = new Map<string, MtaCanonicalRecord>();
  for (const record of records) {
    if (record.record_kind !== "source") continue;
    const date = record.payload.published_date_normalized;
    sourceBySourceId.set(record.source_id, record);
    if (typeof date === "string") sourceDateById.set(record.source_id, date);
  }

  for (const record of records) {
    if (record.record_kind !== "relation") continue;
    const payload = record.payload;
    const subject = typeof payload.subject_id === "string" ? byId.get(payload.subject_id) : undefined;
    const object = typeof payload.object_id === "string" ? byId.get(payload.object_id) : undefined;
    const citingSource = sourceBySourceId.get(record.source_id);

    const assertionStatus =
      statusFromPayload(payload) ??
      (subject ? statusFromPayload(subject.payload) : undefined) ??
      (object ? statusFromPayload(object.payload) : undefined) ??
      deliveredStatusFromPublishedBySourceRelation(payload, subject, object) ??
      deliveredStatusFromSourceAuthorshipRelation(payload, subject, object) ??
      deliveredStatusFromEntitySourceCreationRelation(record, payload, subject, object) ??
      deliveredStatusFromSourceSubjectPublicationRelation(record, payload, subject, object) ??
      deliveredStatusFromSourcePublicationAudienceOrAttributionRelation(record, payload, subject, object) ??
      deliveredStatusFromPublicationDocumentLinkRelation(payload, subject, object) ??
      deliveredStatusFromPublicationDeliveryRelation(record, payload, subject, object) ??
      plannedStatusFromScheduledTimelineRelation(payload) ??
      plannedStatusFromWorkPlanTimelineRelation(payload, subject, object) ??
      plannedStatusFromEntityWorkPlanTimelineRelation(payload, subject, object, citingSource) ??
      plannedStatusFromWorkPlanAgendaItemRelation(payload, subject, object, citingSource) ??
      plannedStatusFromMeetingAgendaAuthorizationTimelineRelation(record, payload, subject, object, citingSource) ??
      deliveredStatusFromHeldPublicMeetingTimelineRelation(record, payload, subject, object, citingSource) ??
      statusFromDatedPublicMeetingTimelineRelation(record, payload, subject, object, citingSource) ??
      statusFromEntityImplementationTimelineRelation(record, payload, subject, object, citingSource) ??
      deliveredStatusFromRouteImplementationTimelineRelation(payload, subject, object) ??
      deliveredStatusFromEntityApprovalTimelineRelation(payload, subject, object) ??
      deliveredStatusFromStaticOrganizationHierarchyRelation(payload, subject, object) ??
      deliveredStatusFromAgencyTreatmentActionRelation(payload, subject, object) ??
      deliveredStatusFromStaticAgencyRoleRelation(payload, subject, object) ??
      deliveredStatusFromStaticAgencyServiceRelation(payload, subject, object) ??
      deliveredStatusFromSourceSubmittedByRelation(record, payload, subject, object) ??
      deliveredStatusFromSourcePresentedByRelation(record, payload, subject, object) ??
      deliveredStatusFromActiveRouteOperatorRelation(payload, subject, object) ??
      deliveredStatusFromStaticOwnershipRelation(payload, subject, object) ??
      deliveredStatusFromStaticLocationRelation(payload, subject, object) ??
      proposedStatusFromFundingAwardProposalRelation(record, payload, subject, object) ??
      deliveredStatusFromFundingAwardRelation(payload, subject, object, citingSource) ??
      deliveredStatusFromStaticAgencyOfficeholderRelation(record, payload, subject, object) ??
      statusFromPartnershipEventRoleRelation(record, payload, subject, object, citingSource) ??
      deliveredStatusFromFormalPartnershipArtifactRelation(record, payload, subject, object) ??
      deliveredStatusFromClaimSourceContainmentRelation(record, payload, subject, object) ??
      deliveredStatusFromSourcePresentedToAudienceRelation(record, payload, subject, object) ??
      statusFromClaimPresentedToAudienceRelation(record, payload, subject, object, citingSource) ??
      statusFromClaimChangeTypeRelation(record, payload, subject, object) ??
      statusFromScopedClaimRelation(record, payload, subject, object) ??
      plannedStatusFromRecurringAgendaItemClaimRelation(record, payload, subject, object, citingSource) ??
      statusFromSourceStatedSubjectClaimRelation(record, payload, subject, object) ??
      deliveredStatusFromMetricSourceContainmentRelation(record, payload, subject, object) ??
      statusFromScopedMetricRelation(record, payload, subject, object, citingSource) ??
      deliveredStatusFromOperatedByRelation(payload, subject, object) ??
      deliveredStatusFromAgencyOperatesRouteRelation(payload, subject, object) ??
      routeCorridorOperationLifecycleStatus(record, payload, subject, object) ??
      deliveredStatusFromRouteCorridorSourceContextRelation(record, payload, subject, object, citingSource) ??
      deliveredStatusFromRelationShape(payload, subject, object) ??
      plannedStatusFromTreatmentFutureEvidence(record, payload, subject, object) ??
      treatmentStatusFromRelationDescription(payload, subject, object) ??
      "unknown";

    const asOfDate =
      dateFromPayload(payload) ??
      sourceDateById.get(record.source_id) ??
      (record.source_ids ?? []).map((id) => sourceDateById.get(id)).find((date): date is string => typeof date === "string");

    record.payload = { ...payload, assertion_status: assertionStatus, ...(asOfDate ? { as_of_date: asOfDate } : {}) };
  }
  return records;
}
