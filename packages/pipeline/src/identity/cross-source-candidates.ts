import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import type { JsonValue, MtaCanonicalRecord, MtaObservationKind } from "@mta-wiki/db/types";

// Cross-source mention candidates: record B's name appears verbatim in record
// A's text while no edge connects them and they share no source. These are
// advisory only — they feed the canonicalize relation-linker -> reviewer ->
// apply path; nothing is auto-created from this file.
//
// S2.3 finding (docs/step-2-implementation-plan.md §S2.3): the plan proposed replacing this
// record-surface scan with a blocks_fts query "once the FTS-backed set is a superset of the regex
// set". Measured on the frozen corpus it is NOT a superset — blocks_fts missed 17 candidates,
// because a record's mentionSurface (raw_text + payload description/claim_text) is constructed and is
// not a subset of its source's blocks. Per the plan's own superset-gated deletion rule, the scan is
// therefore RETAINED; blocks_fts ships as the full-text source index (records_fts carries the
// flagship superset-then-verify equivalence). The O(n²) is bounded by same-kind mentionables (~435
// today) and runs in well under a second; an inverted-index acceleration that preserves output is a
// future option if it ever matters.

const MENTION_KINDS = new Set<MtaObservationKind>(["entity", "project", "route", "corridor"]);
const MIN_NAME_LENGTH = 4;

export type CrossSourceRelationCandidate = {
  mentioning_record_id: string;
  mentioning_kind: MtaObservationKind;
  mentioned_record_id: string;
  mentioned_kind: MtaObservationKind;
  mentioned_name: string;
  mention_context: string;
  mentioning_source_ids: string[];
  mentioned_source_ids: string[];
};

function stringValue(value: JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sourceIds(record: MtaCanonicalRecord) {
  return [...new Set([record.source_id, ...(record.source_ids ?? [])])].sort();
}

function mentionSurface(record: MtaCanonicalRecord) {
  return [record.raw_text, stringValue(record.payload.description), stringValue(record.payload.claim_text)]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function nameVariants(record: MtaCanonicalRecord) {
  const names = new Set<string>();
  if (record.display_name.length >= MIN_NAME_LENGTH) names.add(record.display_name);
  for (const field of ["entity_name", "project_name", "corridor_name", "route_name", "route_label"]) {
    const value = stringValue(record.payload[field]);
    if (value && value.length >= MIN_NAME_LENGTH) names.add(value);
  }
  return [...names];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function mentionContext(haystack: string, match: RegExpExecArray) {
  const start = Math.max(0, match.index - 80);
  const end = Math.min(haystack.length, match.index + match[0].length + 80);
  return haystack.slice(start, end).replace(/\s+/gu, " ").trim();
}

function existingPairKeys(records: MtaCanonicalRecord[]) {
  const keys = new Set<string>();
  for (const record of records) {
    if (record.record_kind !== "relation") continue;
    const subjectId = stringValue(record.payload.subject_id);
    const objectId = stringValue(record.payload.object_id);
    if (subjectId && objectId) keys.add([subjectId, objectId].sort().join("\0"));
  }
  return keys;
}

function pushCandidate(
  out: CrossSourceRelationCandidate[],
  seen: Set<string>,
  existingPairs: Set<string>,
  mentioning: MtaCanonicalRecord,
  mentioned: MtaCanonicalRecord,
  name: string,
  haystack: string,
  match: RegExpExecArray,
) {
  const pairKey = [mentioning.record_id, mentioned.record_id].sort().join("\0");
  if (seen.has(pairKey) || existingPairs.has(pairKey)) return;
  seen.add(pairKey);
  out.push({
    mentioning_record_id: mentioning.record_id,
    mentioning_kind: mentioning.record_kind,
    mentioned_record_id: mentioned.record_id,
    mentioned_kind: mentioned.record_kind,
    mentioned_name: name,
    mention_context: mentionContext(haystack, match),
    mentioning_source_ids: sourceIds(mentioning),
    mentioned_source_ids: sourceIds(mentioned),
  });
}

function wordBoundaryMatch(name: string, haystack: string): RegExpExecArray | null {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(name)}(?![A-Za-z0-9])`, "iu").exec(haystack);
}

function sortCandidates(a: CrossSourceRelationCandidate, b: CrossSourceRelationCandidate): number {
  return a.mentioning_record_id.localeCompare(b.mentioning_record_id) || a.mentioned_record_id.localeCompare(b.mentioned_record_id);
}

export function generateCrossSourceRelationCandidates(records?: MtaCanonicalRecord[]): CrossSourceRelationCandidate[] {
  const all = records ?? readCanonicalRecords();
  const mentionables = all.filter((record) => MENTION_KINDS.has(record.record_kind));
  const existingPairs = existingPairKeys(all);
  const candidates: CrossSourceRelationCandidate[] = [];
  const seen = new Set<string>();

  for (const mentioning of mentionables) {
    const haystack = mentionSurface(mentioning);
    if (!haystack) continue;
    const mentioningSources = sourceIds(mentioning);

    for (const mentioned of mentionables) {
      if (mentioned.record_id === mentioning.record_id) continue;
      if (sourceIds(mentioned).some((id) => mentioningSources.includes(id))) continue;
      for (const name of nameVariants(mentioned)) {
        const match = wordBoundaryMatch(name, haystack);
        if (!match) continue;
        pushCandidate(candidates, seen, existingPairs, mentioning, mentioned, name, haystack, match);
        break;
      }
    }
  }

  return candidates.sort(sortCandidates);
}

export function writeCrossSourceRelationCandidates(candidates?: CrossSourceRelationCandidate[]) {
  const rows = candidates ?? generateCrossSourceRelationCandidates();
  const path = join(repoRoot, "data", "canonicalize", "cross-source-candidates.jsonl");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.length ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "", "utf8");
  return { path: relative(repoRoot, path).split("/").join("/"), count: rows.length };
}
