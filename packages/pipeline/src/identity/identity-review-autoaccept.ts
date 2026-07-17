import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { identityKeysForRecord, isGlobalRecordKind, type GlobalMtaRecordKind } from "@mta-wiki/db/identity";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import { writeJsonFile } from "@mta-wiki/pipeline/identity/identity-override-writes";
import type { JsonObject, JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";

// Structural auto-accept gate for identity-review LLM suggestions, implementing the
// "Auto-accept policy" section of docs/identity-merge-canon.md. Model-reported confidence is
// deliberately ignored; every check below is derived from the records and the deterministic
// identity machinery. Anything that does not pass every check is quarantined for human review.

type ReviewDoNotMerge = { record_ids: [string, string]; reason: string };

export type AutoAcceptRejection = {
  action: "merge" | "do_not_merge";
  detail: string;
  reason: string;
};

export type AutoAcceptEvaluation = {
  accepted_merge_groups: string[][];
  accepted_do_not_merge: ReviewDoNotMerge[];
  rejections: AutoAcceptRejection[];
  ambiguous_record_ids: string[];
};

const DNM_STRONG_FIELD_KEYWORDS = [
  "service_variant",
  "variant",
  "borough",
  "limits",
  "entity_type",
  "authority",
  "subsidiary",
  "person",
  "agency",
  "title",
  "scope",
  "parent",
];

function payloadString(record: MtaCanonicalRecord, ...fields: string[]) {
  for (const field of fields) {
    const value = record.payload?.[field];
    if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  }
  return undefined;
}

// A contradicting strong identity field between two records forces do-not-merge (canon test 1)
// and therefore blocks auto-accepting any merge that spans it.
function strongFieldContradiction(kind: GlobalMtaRecordKind, a: MtaCanonicalRecord, b: MtaCanonicalRecord): string | undefined {
  const compare = (label: string, left: string | undefined, right: string | undefined) =>
    left && right && left !== right ? `${label} ${left} vs ${right}` : undefined;

  if (kind === "route") {
    return compare("service_variant", payloadString(a, "service_variant", "route_type_normalized"), payloadString(b, "service_variant", "route_type_normalized"));
  }
  if (kind === "corridor") {
    return (
      compare("borough", payloadString(a, "borough_normalized", "borough"), payloadString(b, "borough_normalized", "borough")) ??
      compare("limits", payloadString(a, "limits", "from"), payloadString(b, "limits", "from")) ??
      compare("limits", payloadString(a, "to"), payloadString(b, "to"))
    );
  }
  if (kind === "entity") {
    return compare("entity_type", payloadString(a, "entity_type"), payloadString(b, "entity_type"));
  }
  return compare("borough", payloadString(a, "borough_normalized", "borough"), payloadString(b, "borough_normalized", "borough"));
}

function sharedIdentityKey(a: MtaCanonicalRecord, b: MtaCanonicalRecord) {
  const keys = new Set(identityKeysForRecord(a));
  return identityKeysForRecord(b).find((key) => keys.has(key));
}

function kindForRecordId(recordId: string) {
  const prefix = recordId.split("_", 1)[0] ?? "";
  return isGlobalRecordKind(prefix) ? prefix : undefined;
}

// Verify a do-not-merge decision per kind. Wrong merges corrupt the graph; wrong do-not-merge
// only preserves a split, so verification is required only where the field is structurally
// comparable (route variants, corridor geography). Entity authority/subsidiary and person/agency
// splits are accepted on citation: both sides legitimately share entity_type values.
function doNotMergeVerification(kind: GlobalMtaRecordKind, a: MtaCanonicalRecord, b: MtaCanonicalRecord): string | undefined {
  if (kind === "route") {
    const left = payloadString(a, "service_variant", "route_type_normalized");
    const right = payloadString(b, "service_variant", "route_type_normalized");
    if (left && right && left === right) return `both records have service_variant ${left}`;
  }
  if (kind === "corridor") {
    const leftBorough = payloadString(a, "borough_normalized", "borough");
    const rightBorough = payloadString(b, "borough_normalized", "borough");
    const leftLimits = payloadString(a, "limits", "from");
    const rightLimits = payloadString(b, "limits", "from");
    if (leftBorough && rightBorough && leftBorough === rightBorough && leftLimits && rightLimits && leftLimits === rightLimits) {
      return `borough and limits both match (${leftBorough})`;
    }
  }
  return undefined;
}

export function evaluateSuggestionForAutoAccept(
  kind: GlobalMtaRecordKind,
  suggestion: JsonObject,
  recordsById: Map<string, MtaCanonicalRecord>,
): AutoAcceptEvaluation {
  const rejections: AutoAcceptRejection[] = [];
  const ambiguousRecordIds = new Set<string>();
  const ambiguous = Array.isArray(suggestion.ambiguous) ? suggestion.ambiguous : [];
  for (const entry of ambiguous) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const ids = (entry as JsonObject).record_ids;
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id === "string") ambiguousRecordIds.add(id);
    }
  }

  const acceptedMergeGroups: string[][] = [];
  const mergeGroups = Array.isArray(suggestion.merge_groups) ? suggestion.merge_groups : [];
  for (const group of mergeGroups) {
    if (!Array.isArray(group) || group.length < 2 || !group.every((id) => typeof id === "string")) continue;
    const ids = group as string[];
    const detail = ids.join(" + ");
    const reject = (reason: string) => rejections.push({ action: "merge", detail, reason });

    if (ids.some((id) => kindForRecordId(id) !== kind)) {
      reject(`record id kind prefix does not match cluster kind ${kind}`);
      continue;
    }
    if (ids.some((id) => ambiguousRecordIds.has(id))) {
      reject("touches a record the suggestion itself marks ambiguous");
      continue;
    }
    const missing = ids.find((id) => !recordsById.has(id));
    if (missing) {
      reject(`record ${missing} is not in the current canonical corpus`);
      continue;
    }

    let failed = false;
    for (let i = 0; i < ids.length && !failed; i += 1) {
      for (let j = i + 1; j < ids.length && !failed; j += 1) {
        const a = recordsById.get(ids[i]!)!;
        const b = recordsById.get(ids[j]!)!;
        const contradiction = strongFieldContradiction(kind, a, b);
        if (contradiction) {
          reject(`contradicting strong identity field between ${ids[i]} and ${ids[j]}: ${contradiction}`);
          failed = true;
          break;
        }
        if (!sharedIdentityKey(a, b)) {
          reject(`${ids[i]} and ${ids[j]} share no strong identity key (canon test 2 shape not met)`);
          failed = true;
        }
      }
    }
    if (!failed) acceptedMergeGroups.push(ids);
  }

  const acceptedDoNotMerge: ReviewDoNotMerge[] = [];
  const doNotMerge = Array.isArray(suggestion.do_not_merge) ? suggestion.do_not_merge : [];
  for (const entry of doNotMerge) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const object = entry as JsonObject;
    const ids = Array.isArray(object.record_ids) ? object.record_ids : [];
    const reason = typeof object.reason === "string" ? object.reason : "";
    if (ids.length !== 2 || !ids.every((id) => typeof id === "string")) continue;
    const pair: [string, string] = [ids[0] as string, ids[1] as string];
    const detail = pair.join(" <> ");
    const reject = (why: string) => rejections.push({ action: "do_not_merge", detail, reason: why });

    if (pair.some((id) => kindForRecordId(id) !== kind)) {
      reject(`record id kind prefix does not match cluster kind ${kind}`);
      continue;
    }
    const lowered = reason.toLowerCase();
    if (!DNM_STRONG_FIELD_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
      reject("reason does not cite a strong identity field");
      continue;
    }
    const left = recordsById.get(pair[0]);
    const right = recordsById.get(pair[1]);
    if (!left || !right) {
      reject(`record ${left ? pair[1] : pair[0]} is not in the current canonical corpus`);
      continue;
    }
    const verification = doNotMergeVerification(kind, left, right);
    if (verification) {
      reject(`cited distinction not supported by the records: ${verification}`);
      continue;
    }
    acceptedDoNotMerge.push({ record_ids: pair, reason });
  }

  return {
    accepted_merge_groups: acceptedMergeGroups,
    accepted_do_not_merge: acceptedDoNotMerge,
    rejections,
    ambiguous_record_ids: [...ambiguousRecordIds].sort(),
  };
}

type ReviewClusterLine = {
  cluster_id: string;
  kind: string;
  packet_path: string;
  record_ids: string[];
};

export type AutoAcceptClusterResult = {
  cluster_id: string;
  kind: GlobalMtaRecordKind;
  status: "auto_accepted" | "quarantined" | "split" | "already_staged" | "no_suggestion" | "parse_error";
  accepted_merge_group_count: number;
  accepted_do_not_merge_count: number;
  rejection_count: number;
  ambiguous_count: number;
  decision_path?: string | undefined;
  quarantine_path?: string | undefined;
  blocker?: string | undefined;
};

export type AutoAcceptReport = {
  dry_run: boolean;
  results: AutoAcceptClusterResult[];
  written_decisions: number;
  written_quarantines: number;
};

export type AutoAcceptOptions = {
  force?: boolean | undefined;
  include?: string | undefined;
  exclude?: string | undefined;
  limit?: number | undefined;
};

function identityReviewDir() {
  return join(repoRoot, "data", "identity-review");
}

function relativePath(path: string) {
  return relative(repoRoot, path);
}

function readJson(path: string): JsonObject | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as JsonValue;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function blockerSummary(evaluation: AutoAcceptEvaluation) {
  const parts: string[] = [];
  if (evaluation.ambiguous_record_ids.length > 0) {
    parts.push(`suggestion marks ambiguous: ${evaluation.ambiguous_record_ids.join(", ")}`);
  }
  for (const rejection of evaluation.rejections.slice(0, 6)) {
    parts.push(`${rejection.action} ${rejection.detail}: ${rejection.reason}`);
  }
  if (evaluation.rejections.length > 6) parts.push(`(+${evaluation.rejections.length - 6} more rejections)`);
  return parts.join(" | ") || "no auto-acceptable actions in suggestion";
}

export function autoAcceptIdentityReview(options: AutoAcceptOptions = {}): AutoAcceptReport {
  const dryRun = !options.force;
  const include = options.include ? new RegExp(options.include, "iu") : undefined;
  const exclude = options.exclude ? new RegExp(options.exclude, "iu") : undefined;

  const clustersPath = join(identityReviewDir(), "clusters.jsonl");
  if (!existsSync(clustersPath)) {
    throw new Error("Identity review clusters are missing. Run `identity-review` first.");
  }
  let clusters = readFileSync(clustersPath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ReviewClusterLine)
    .filter((cluster) => {
      const haystack = [cluster.cluster_id, cluster.kind, ...cluster.record_ids].join("\n");
      if (include && !include.test(haystack)) return false;
      if (exclude && exclude.test(haystack)) return false;
      return true;
    });
  if (options.limit) clusters = clusters.slice(0, options.limit);

  const recordsById = new Map(readCanonicalRecords().map((record) => [record.record_id, record]));
  const decisionsDir = join(identityReviewDir(), "accepted", "decisions");
  const quarantineDir = join(identityReviewDir(), "accepted", "quarantine");
  const manifestPath = join(identityReviewDir(), "accepted", "manifest.json");
  const now = new Date().toISOString();

  const results: AutoAcceptClusterResult[] = [];
  const manifestAccepted: JsonObject[] = [];
  const manifestQuarantined: JsonObject[] = [];
  let writtenDecisions = 0;
  let writtenQuarantines = 0;

  for (const cluster of clusters) {
    if (!isGlobalRecordKind(cluster.kind)) continue;
    const kind = cluster.kind;
    const base = (status: AutoAcceptClusterResult["status"]): AutoAcceptClusterResult => ({
      cluster_id: cluster.cluster_id,
      kind,
      status,
      accepted_merge_group_count: 0,
      accepted_do_not_merge_count: 0,
      rejection_count: 0,
      ambiguous_count: 0,
    });

    const decisionPath = join(decisionsDir, `${cluster.cluster_id}.json`);
    const quarantinePath = join(quarantineDir, `${cluster.cluster_id}.json`);
    if (existsSync(decisionPath) || existsSync(quarantinePath)) {
      results.push(base("already_staged"));
      continue;
    }

    const suggestionPath = join(identityReviewDir(), "llm-suggestions", `${cluster.cluster_id}.json`);
    if (!existsSync(suggestionPath)) {
      results.push(base("no_suggestion"));
      continue;
    }
    const envelope = readJson(suggestionPath);
    const suggestion = envelope?.suggestion;
    if (!envelope || envelope.parse_error || !suggestion || typeof suggestion !== "object" || Array.isArray(suggestion)) {
      results.push(base("parse_error"));
      continue;
    }

    const evaluation = evaluateSuggestionForAutoAccept(kind, suggestion, recordsById);
    const hasAccepted = evaluation.accepted_merge_groups.length > 0 || evaluation.accepted_do_not_merge.length > 0;
    const hasRemainder = evaluation.rejections.length > 0 || evaluation.ambiguous_record_ids.length > 0;
    const status: AutoAcceptClusterResult["status"] = hasAccepted ? (hasRemainder ? "split" : "auto_accepted") : "quarantined";

    const common = {
      version: 1,
      accepted_at: now,
      reviewer: "auto-accept-gate",
      source: "auto_accept_canon",
      cluster_id: cluster.cluster_id,
      kind,
      packet_path: cluster.packet_path,
      suggestion_path: relativePath(suggestionPath),
      source_review_run_id: typeof envelope.review_run_id === "string" ? envelope.review_run_id : undefined,
      model: typeof envelope.provider === "string" && typeof envelope.model === "string" ? `${envelope.provider}/${envelope.model}` : undefined,
    };

    const result = base(status);
    result.accepted_merge_group_count = evaluation.accepted_merge_groups.length;
    result.accepted_do_not_merge_count = evaluation.accepted_do_not_merge.length;
    result.rejection_count = evaluation.rejections.length;
    result.ambiguous_count = evaluation.ambiguous_record_ids.length;

    if (hasAccepted) {
      const rationale = typeof suggestion.rationale === "string" ? suggestion.rationale : "";
      const decision = {
        ...common,
        review_state: "accepted",
        action_summary: {
          merge_group_count: evaluation.accepted_merge_groups.length,
          do_not_merge_count: evaluation.accepted_do_not_merge.length,
          weak_alias_count: 0,
          missing_field_count: 0,
          ambiguous_count: 0,
          confidence: typeof suggestion.confidence === "string" ? suggestion.confidence : "unscored",
        },
        merge_groups: evaluation.accepted_merge_groups,
        do_not_merge: evaluation.accepted_do_not_merge,
        weak_aliases: [],
        missing_fields: [],
        ambiguous: [],
        suggested_rules: Array.isArray(suggestion.suggested_rules) ? suggestion.suggested_rules : [],
        rationale: `${rationale} [auto-accepted structurally per docs/identity-merge-canon.md; model confidence ignored]`.trim(),
      };
      result.decision_path = relativePath(decisionPath);
      if (!dryRun) {
        writeJsonFile(decisionPath, decision);
        manifestAccepted.push({
          cluster_id: cluster.cluster_id,
          kind,
          review_state: "accepted",
          path: relativePath(decisionPath),
          action_summary: decision.action_summary,
        });
        writtenDecisions += 1;
      }
    }

    if (hasRemainder) {
      const blocker = blockerSummary(evaluation);
      const rejectedMergeGroups = (Array.isArray(suggestion.merge_groups) ? (suggestion.merge_groups as string[][]) : []).filter(
        (group) => !evaluation.accepted_merge_groups.includes(group),
      );
      const acceptedPairs = new Set(evaluation.accepted_do_not_merge.map((entry) => entry.record_ids.join("<>")));
      const rejectedDoNotMerge = (Array.isArray(suggestion.do_not_merge) ? suggestion.do_not_merge : []).filter((entry) => {
        const ids = (entry as JsonObject)?.record_ids;
        return !(Array.isArray(ids) && acceptedPairs.has(ids.join("<>")));
      });
      const quarantine = {
        ...common,
        review_state: "quarantined",
        quarantine: {
          blocker,
          note: hasAccepted ? "Partial: structurally clean actions were auto-accepted in the decisions file with the same cluster_id." : undefined,
        },
        original_merge_groups: rejectedMergeGroups,
        original_do_not_merge: rejectedDoNotMerge,
      };
      result.quarantine_path = relativePath(quarantinePath);
      result.blocker = blocker;
      if (!dryRun) {
        writeJsonFile(quarantinePath, quarantine);
        manifestQuarantined.push({
          cluster_id: cluster.cluster_id,
          kind,
          review_state: "quarantined",
          path: relativePath(quarantinePath),
          blocker,
        });
        writtenQuarantines += 1;
      }
    }

    results.push(result);
  }

  if (!dryRun && (manifestAccepted.length > 0 || manifestQuarantined.length > 0)) {
    const manifest: JsonObject = readJson(manifestPath) ?? { version: 1, counts: { accepted: 0, corrected: 0, quarantined: 0, total: 0 }, accepted: [], quarantined: [] };
    const counts = (manifest.counts ?? {}) as JsonObject;
    manifest.accepted = [...(Array.isArray(manifest.accepted) ? manifest.accepted : []), ...manifestAccepted];
    manifest.quarantined = [...(Array.isArray(manifest.quarantined) ? manifest.quarantined : []), ...manifestQuarantined];
    counts.accepted = Number(counts.accepted ?? 0) + manifestAccepted.length;
    counts.quarantined = Number(counts.quarantined ?? 0) + manifestQuarantined.length;
    counts.total = Number(counts.total ?? 0) + manifestAccepted.length + manifestQuarantined.length;
    manifest.counts = counts;
    manifest.updated_at = now;
    writeJsonFile(manifestPath, manifest);
  }

  return { dry_run: dryRun, results, written_decisions: writtenDecisions, written_quarantines: writtenQuarantines };
}
