import { identityKeysForRecord, isGlobalRecordKind, queryKeys, recordScorableValues, type GlobalMtaRecordKind } from "@mta-wiki/db/identity";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaObservationKind } from "@mta-wiki/db/types";
import { stableHash } from "@mta-wiki/db/stable-json";
import type { ExtractBoundaryResult, ExtractReviewEntry } from "@mta-wiki/pipeline/extract/boundary";

export type AnchorDoNotMergePair = {
  kind: GlobalMtaRecordKind;
  record_ids: [string, string];
  reason?: string | undefined;
};

export type AnchorMatchDecision = {
  status: "matched" | "new" | "ambiguous" | "dnm_blocked";
  kind: MtaObservationKind;
  input_id: string;
  output_id: string;
  candidates: string[];
  reason: string;
};

export type AnchorMatchResult = {
  extraction: ExtractBoundaryResult;
  decisions: AnchorMatchDecision[];
  review: ExtractReviewEntry[];
};

type AnchorIndex = {
  byId: Map<string, MtaCanonicalRecord>;
  surfaces: Map<GlobalMtaRecordKind, Map<string, Set<string>>>;
  doNotMerge: Set<string>;
};

const GLOBAL_KIND_VALUES: GlobalMtaRecordKind[] = ["entity", "project", "corridor", "route"];

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim().replace(/\s+/gu, " ");
}

function pairKey(kind: GlobalMtaRecordKind, a: string, b: string) {
  const [left, right] = [a, b].sort();
  return `${kind}|${left}|${right}`;
}

function stringsFromPayload(payload: JsonObject, fields: string[]) {
  const out: string[] = [];
  for (const field of fields) {
    const value = payload[field];
    if (typeof value === "string" && value.trim()) out.push(value);
    else if (Array.isArray(value)) out.push(...value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0));
  }
  return out;
}

function draftSurfaces(kind: GlobalMtaRecordKind, displayName: string, payload: JsonObject) {
  const fields =
    kind === "route"
      ? ["route_id", "route_name", "route_label", "name"]
      : kind === "project"
        ? ["project_name", "name"]
        : kind === "corridor"
          ? ["corridor_name", "street", "name"]
          : ["entity_name", "agency_name", "name", "short_name", "acronym"];
  return [...new Set([displayName, ...stringsFromPayload(payload, fields), ...queryKeys(kind, displayName)])].map(norm).filter(Boolean);
}

export function buildAnchorIndex(records: MtaCanonicalRecord[], pairs: AnchorDoNotMergePair[] = []): AnchorIndex {
  const surfaces = new Map<GlobalMtaRecordKind, Map<string, Set<string>>>();
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const add = (kind: GlobalMtaRecordKind, surface: string, id: string) => {
    const key = norm(surface);
    if (!key) return;
    const bySurface = surfaces.get(kind) ?? new Map<string, Set<string>>();
    const ids = bySurface.get(key) ?? new Set<string>();
    ids.add(id);
    bySurface.set(key, ids);
    surfaces.set(kind, bySurface);
  };

  for (const record of records) {
    if (!isGlobalRecordKind(record.record_kind)) continue;
    const kind = record.record_kind;
    add(kind, record.record_id, record.record_id);
    add(kind, record.display_name, record.record_id);
    for (const alias of record.record_aliases ?? []) add(kind, alias, record.record_id);
    for (const key of identityKeysForRecord(record)) add(kind, key, record.record_id);
    for (const value of recordScorableValues(record)) add(kind, value, record.record_id);
  }

  return {
    byId,
    surfaces,
    doNotMerge: new Set(pairs.map((pair) => pairKey(pair.kind, pair.record_ids[0], pair.record_ids[1]))),
  };
}

function review(sourceId: string, decision: AnchorMatchDecision): ExtractReviewEntry {
  return {
    source_id: sourceId,
    severity: decision.status === "matched" ? "warning" : "error",
    code: `anchor_${decision.status}`,
    message: decision.reason,
    record_kind: decision.kind,
    local_observation_id: decision.input_id,
    raw_record: decision as unknown as JsonValue,
  };
}

function newId(kind: MtaObservationKind, sourceId: string, inputId: string, payload: JsonObject) {
  return `${kind}_${stableHash({ source_id: sourceId, input_id: inputId, payload } as unknown as JsonValue).slice(0, 12)}`;
}

function resolveAnchor(
  index: AnchorIndex,
  kind: MtaObservationKind,
  inputId: string,
  displayName: string,
  payload: JsonObject,
  sourceId: string,
): AnchorMatchDecision {
  if (!isGlobalRecordKind(kind)) {
    return { status: "new", kind, input_id: inputId, output_id: inputId, candidates: [], reason: "Non-global record kind; no anchor match attempted." };
  }

  const explicit = typeof payload.target_record_id === "string" ? payload.target_record_id : inputId.startsWith(`${kind}_`) ? inputId : undefined;
  const candidateIds = new Set<string>();
  if (explicit && index.byId.get(explicit)?.record_kind === kind) candidateIds.add(explicit);
  for (const surface of draftSurfaces(kind, displayName, payload)) {
    for (const id of index.surfaces.get(kind)?.get(surface) ?? []) candidateIds.add(id);
  }
  const candidates = [...candidateIds].sort();
  if (candidates.length === 0) {
    const output = newId(kind, sourceId, inputId, payload);
    return { status: "new", kind, input_id: inputId, output_id: output, candidates: [], reason: "No exact id, alias, identity-key, or exact-name anchor matched; queued for review." };
  }

  if (candidates.length === 1) {
    return { status: "matched", kind, input_id: inputId, output_id: candidates[0]!, candidates, reason: `Matched ${inputId} to canonical ${candidates[0]}.` };
  }

  if (explicit && candidates.includes(explicit)) {
    const blocked = candidates.filter((candidate) => candidate !== explicit && index.doNotMerge.has(pairKey(kind, explicit, candidate)));
    if (blocked.length > 0) {
      return {
        status: "dnm_blocked",
        kind,
        input_id: inputId,
        output_id: newId(kind, sourceId, inputId, payload),
        candidates,
        reason: `Explicit candidate ${explicit} conflicts with do-not-merge anchors: ${blocked.join(", ")}.`,
      };
    }
    return { status: "matched", kind, input_id: inputId, output_id: explicit, candidates, reason: `Explicit target ${explicit} won among multiple exact anchors.` };
  }

  return {
    status: "ambiguous",
    kind,
    input_id: inputId,
    output_id: newId(kind, sourceId, inputId, payload),
    candidates,
    reason: `Multiple exact anchors matched: ${candidates.join(", ")}.`,
  };
}

function endpointKindFromPayload(payload: JsonObject, side: "subject" | "object") {
  for (const field of [`${side}_record_kind`, `${side}_kind`, `${side}_type`]) {
    const value = payload[field];
    if (typeof value === "string" && isGlobalRecordKind(value)) return value;
  }
  return undefined;
}

function endpointKindFromValue(value: string) {
  const prefix = value.trim().toLowerCase().split(/[_\-\s]+/u)[0];
  return isGlobalRecordKind(prefix) ? prefix : undefined;
}

function stripEndpointKindPrefix(kind: GlobalMtaRecordKind, value: string) {
  return value.replace(new RegExp(`^${kind}(?:[_\\-\\s]+)`, "iu"), "").trim();
}

function endpointSurfaceKeys(kind: GlobalMtaRecordKind, value: string) {
  const raw = value.trim();
  const kindless = stripEndpointKindPrefix(kind, raw);
  const variants = new Set<string>([
    raw,
    raw.replace(/[_-]+/gu, " "),
    kindless,
    kindless.replace(/[_-]+/gu, " "),
    ...queryKeys(kind, raw),
    ...queryKeys(kind, kindless),
  ]);
  return [...variants].map(norm).filter(Boolean);
}

function exactEndpointCandidate(index: AnchorIndex, kind: GlobalMtaRecordKind, value: string) {
  const candidateIds = new Set<string>();
  const bySurface = index.surfaces.get(kind);
  if (!bySurface) return undefined;
  for (const surface of endpointSurfaceKeys(kind, value)) {
    for (const id of bySurface.get(surface) ?? []) candidateIds.add(id);
  }
  const candidates = [...candidateIds].sort();
  return candidates.length === 1 ? candidates[0] : undefined;
}

function remapEndpoint(value: JsonValue | undefined, idMap: Map<string, string>, index: AnchorIndex, payload: JsonObject, side: "subject" | "object") {
  if (typeof value !== "string") return value;
  const local = idMap.get(value);
  if (local) return local;
  if (index.byId.has(value)) return value;

  const kind = endpointKindFromPayload(payload, side) ?? endpointKindFromValue(value);
  if (kind) return exactEndpointCandidate(index, kind, value) ?? value;

  const candidates = new Set<string>();
  for (const globalKind of GLOBAL_KIND_VALUES) {
    const candidate = exactEndpointCandidate(index, globalKind, value);
    if (candidate) candidates.add(candidate);
  }
  const sorted = [...candidates].sort();
  return sorted.length === 1 ? sorted[0] : value;
}

export function anchorMatchExtractResult(result: ExtractBoundaryResult, records: MtaCanonicalRecord[], pairs: AnchorDoNotMergePair[] = []): AnchorMatchResult {
  const index = buildAnchorIndex(records, pairs);
  const idMap = new Map<string, string>();
  const decisions: AnchorMatchDecision[] = [];
  const reviewEntries: ExtractReviewEntry[] = [];

  for (const record of result.records) {
    const inputId = record.v1_record_id ?? record.display_name;
    const decision = resolveAnchor(index, record.record_kind, inputId, record.display_name, record.payload, result.source_id);
    decisions.push(decision);
    idMap.set(inputId, decision.output_id);
    record.v1_record_id = decision.output_id;
    if (decision.status !== "matched" && isGlobalRecordKind(record.record_kind)) reviewEntries.push(review(result.source_id, decision));
  }

  for (const record of result.records) {
    if (record.record_kind !== "relation") continue;
    const payload = { ...record.payload };
    payload.subject_id = remapEndpoint(payload.subject_id, idMap, index, payload, "subject");
    payload.object_id = remapEndpoint(payload.object_id, idMap, index, payload, "object");
    record.payload = payload;
    record.relation = {
      subject_id: typeof payload.subject_id === "string" ? payload.subject_id : undefined,
      object_id: typeof payload.object_id === "string" ? payload.object_id : undefined,
      relation_family: typeof payload.relation_family === "string" ? payload.relation_family : undefined,
      relation_kind: typeof payload.relation_kind === "string" ? payload.relation_kind : undefined,
      assertion_status: typeof payload.assertion_status === "string" ? payload.assertion_status : undefined,
    };
  }

  const extraction: ExtractBoundaryResult = {
    ...result,
    review: [...result.review, ...reviewEntries],
    records: [...result.records].sort((a, b) => (a.record_kind.localeCompare(b.record_kind) || (a.v1_record_id ?? "").localeCompare(b.v1_record_id ?? ""))),
  };
  return { extraction, decisions, review: reviewEntries };
}
