import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { canonicalRecordIdForInput } from "../packages/db/src/identity";
import { PAYLOAD_SCHEMA_VERSION } from "../packages/db/src/kind-registry";
import { stableHash, stableJson } from "../packages/db/src/stable-json";
import type {
  JsonObject,
  MtaCanonicalRecord,
  MtaEvidenceRef,
  MtaSubmissionEntry,
  MtaSubmitObservationInput,
} from "../packages/db/src/types";
import {
  readSemanticCorrections,
  semanticCorrectionsPath,
  type SemanticCorrectionEntry,
} from "../packages/pipeline/src/records/semantic-corrections";
import { normalizeSubmitInput } from "../packages/pipeline/src/records/submissions";

export const BUS_LANE_SCOPE_CONTRACT_ID = "bus-lane-treatment-physical-scope-v1" as const;
export const BUS_LANE_SCOPE_METHOD_ID = "same-source-exact-facility-and-treatment-evidence-v1" as const;

const REVIEWED_AT = "2026-07-15T20:00:00.000Z";
const REVIEWED_BY = "codex-corpus-physical-scope-audit";
const RUN_ID = "2026-07-15T20-00-00-000Z_bus-lane-treatment-physical-scope-remediation";
const CAMPAIGN_LOCAL_PREFIX = "relation_bus_lane_treatment_scope_v1_";
const CAMPAIGN_RECORD_PREFIX = "relation_bus-lane-treatment-scope-v1-";
const JOURNAL_PATH = join(repoRoot, "data", "submissions", `${RUN_ID}.jsonl`);
const OUTPUT_DIR = join(
  repoRoot,
  "data",
  "relationship-integrity",
  "dispositions",
  "v1",
  "bus-lane-treatments",
);
const CONTRACT_PATH = join(OUTPUT_DIR, "contract.json");
const DECISIONS_PATH = join(OUTPUT_DIR, "decisions.jsonl");
const REVIEW_PATH = join(OUTPUT_DIR, "review.jsonl");
const REMEDIATIONS_PATH = join(OUTPUT_DIR, "remediation-links.jsonl");
const SUMMARY_PATH = join(OUTPUT_DIR, "summary.json");
const REPORT_PATH = join(OUTPUT_DIR, "report.md");
const MANIFEST_PATH = join(OUTPUT_DIR, "manifest.json");
const EVIDENCE_REVIEW_PATH = join(OUTPUT_DIR, "evidence-review.jsonl");

const CANONICAL_PATHS = {
  treatments: join(repoRoot, "data", "canonical", "treatment_components.jsonl"),
  corridors: join(repoRoot, "data", "canonical", "corridors.jsonl"),
  relations: join(repoRoot, "data", "canonical", "relations.jsonl"),
} as const;

const REVIEWED_PENDING_JOURNALS = [
  join(repoRoot, "data", "submissions", "2026-07-15T12-00-00-000Z_legacy-relationship-integrity-remediation.jsonl"),
  join(repoRoot, "data", "submissions", "2026-07-15T18-00-00-000Z_queens-acquisition-linkage-remediation.jsonl"),
] as const;

const REMEDIATION_EXCLUSIONS = new Map<string, string>([
  [
    "treatment_curbside-bus-lane-fulton-to-atlantic-may2019",
    "Fulton Street and Atlantic Avenue are the stated segment endpoints; the exact lane facility is not named in the treatment evidence, so Fulton Street is not promoted as the corridor.",
  ],
]);

const PRIOR_EVIDENCE_AUDIT = {
  journal_sha256: "c4ea1ac8afcdd31c2499f00df4fdd32a6ad5909fd37aabad78084ff1c2b50983",
  relation_count: 113,
  exact_current_evidence_count: 91,
  adjacent_cocitation_required_count: 21,
  reclassified_non_lane_count: 1,
} as const;

type ReviewedCoCitation = {
  corridor_id: string;
  source_id: string;
  blocks: ReadonlyArray<{
    block_id: string;
    role: "facility_extent" | "physical_lane_assertion" | "diagram_context";
  }>;
};

/** Human-reviewed additions from the exhaustive 113-edge block audit. Each row is deliberately
 * treatment/corridor/source specific: it is not an allowlist for similarly named facilities. */
const REVIEWED_CO_CITATIONS = new Map<string, ReviewedCoCitation>([
  ["treatment_165th-st-bus-lane", {
    corridor_id: "corridor_165th-st-bus-lanes",
    source_id: "201106_jamaica_cb12_slides",
    blocks: [
      { block_id: "p025_c0002", role: "physical_lane_assertion" },
      { block_id: "p025_c0003", role: "facility_extent" },
    ],
  }],
  ["treatment_165th-st-bus-lane_2", {
    corridor_id: "corridor_165th-st-bus-lanes",
    source_id: "201104_jamaica_cac2_slides",
    blocks: [
      { block_id: "p027_c0002", role: "physical_lane_assertion" },
      { block_id: "p027_c0003", role: "facility_extent" },
    ],
  }],
  ["treatment_bus-lane-86th-st-cpw", {
    corridor_id: "corridor_86th-street",
    source_id: "2015_02_10_brt_86thstreet_cb7_presentation",
    blocks: [{ block_id: "p004_c0005", role: "physical_lane_assertion" }],
  }],
  ["treatment_bus-lanes-165th-st", {
    corridor_id: "corridor_165th-st-bus-lanes",
    source_id: "20110517_jamaica_open_house_posters",
    blocks: [
      { block_id: "p007_c0001", role: "physical_lane_assertion" },
      { block_id: "p007_c0005", role: "diagram_context" },
    ],
  }],
  ["treatment_bus-lanes-hylan-various", {
    corridor_id: "corridor_hylan-boulevard-brt",
    source_id: "201106_hylan_slides",
    blocks: [
      { block_id: "p018_c0007", role: "physical_lane_assertion" },
      { block_id: "p018_c0010", role: "facility_extent" },
    ],
  }],
  ["treatment_bus-lanes-merrick-blvd", {
    corridor_id: "corridor_merrick-blvd-bus-lanes",
    source_id: "20110517_jamaica_open_house_posters",
    blocks: [
      { block_id: "p007_c0001", role: "physical_lane_assertion" },
      { block_id: "p007_c0003", role: "diagram_context" },
    ],
  }],
  ["treatment_concept1-offset-bus-lanes-rockaway-liberty", {
    corridor_id: "corridor_woodhaven-cross-bay-blvds",
    source_id: "2014_10_22_brt_woodhaven_cac2_discussionmaterials",
    blocks: [{ block_id: "p004_c0003", role: "physical_lane_assertion" }],
  }],
  ["treatment_concept2-main-road-bus-lanes-rockaway-liberty", {
    corridor_id: "corridor_woodhaven-cross-bay-blvds",
    source_id: "2014_10_22_brt_woodhaven_cac2_discussionmaterials",
    blocks: [{ block_id: "p005_c0003", role: "physical_lane_assertion" }],
  }],
  ["treatment_concept2-main-road-bus-lanes-woodhaven-metropolitan", {
    corridor_id: "corridor_woodhaven-boulevard",
    source_id: "2014_10_22_brt_woodhaven_cac2_discussionmaterials",
    blocks: [{ block_id: "p002_c0006", role: "physical_lane_assertion" }],
  }],
  ["treatment_main-road-bus-lanes-woodhaven", {
    corridor_id: "corridor_woodhaven-boulevard",
    source_id: "brt_woodhaven_faq",
    blocks: [{ block_id: "p010_c0008", role: "physical_lane_assertion" }],
  }],
  ["treatment_main-road-bus-lanes-woodhaven_2", {
    corridor_id: "corridor_woodhaven-boulevard",
    source_id: "2015_04_29_brt_woodhaven_dw3_presentation",
    blocks: [{ block_id: "p013_c0008", role: "physical_lane_assertion" }],
  }],
  ["treatment_main-road-bus-lanes-woodhaven_5", {
    corridor_id: "corridor_woodhaven-boulevard",
    source_id: "2015_04_30_brt_woodhaven_dw4_presentation",
    blocks: [{ block_id: "p013_c0008", role: "physical_lane_assertion" }],
  }],
  ["treatment_main-st-offset-bus-lanes", {
    corridor_id: "corridor_main-street-flushing-jamaica-2014",
    source_id: "2015_09_22_brt_flushing_jamaica_cb7_presentation",
    blocks: [{ block_id: "p009_c0003", role: "physical_lane_assertion" }],
  }],
  ["treatment_offset-bus-lane-116th-st-cb11-jun2025", {
    corridor_id: "corridor_116th-street",
    source_id: "116_st_morningside_ave_pleasant_ave_cb11_jun2025",
    blocks: [{ block_id: "p019_c0001", role: "physical_lane_assertion" }],
  }],
  ["treatment_offset-bus-lane-116th-st-cb11-may2025", {
    corridor_id: "corridor_116th-street",
    source_id: "116_st_morningside_ave_pleasant_ave_cb11_may2025",
    blocks: [{ block_id: "p017_c0001", role: "physical_lane_assertion" }],
  }],
  ["treatment_offset-bus-lane-4-blocks", {
    corridor_id: "corridor_116th-street",
    source_id: "116_st_morningside_ave_pleasant_ave_cb10_jun2025",
    blocks: [
      { block_id: "p022_c0001", role: "physical_lane_assertion" },
      { block_id: "p022_c0004", role: "diagram_context" },
    ],
  }],
  ["treatment_offset-bus-lanes-cross-bay_4", {
    corridor_id: "corridor_cross-bay-blvd-sbs-spring2015",
    source_id: "brt_woodhaven_faq",
    blocks: [{ block_id: "p010_c0008", role: "physical_lane_assertion" }],
  }],
  ["treatment_proposed-westbound-bus-lane-battery-pl", {
    corridor_id: "corridor_battery-pl-manhattan",
    source_id: "battery_pl_oct2019",
    blocks: [
      { block_id: "p009_c0002", role: "facility_extent" },
      { block_id: "p009_c0003", role: "diagram_context" },
      { block_id: "p009_c0006", role: "physical_lane_assertion" },
    ],
  }],
  ["treatment_university-north-tremont", {
    corridor_id: "corridor_university-ave",
    source_id: "bx_cb5_projects_dec032019",
    blocks: [{ block_id: "p016_c0006", role: "physical_lane_assertion" }],
  }],
  ["treatment_university-south-tremont", {
    corridor_id: "corridor_university-ave",
    source_id: "bx_cb5_projects_dec032019",
    blocks: [{ block_id: "p015_c0006", role: "physical_lane_assertion" }],
  }],
  ["treatment_woodhaven-myrtle-ave-2015-04", {
    corridor_id: "corridor_woodhaven-boulevard",
    source_id: "2015_04_23_brt_woodhaven_dw2_draftplans",
    blocks: [{ block_id: "p004_c0011", role: "physical_lane_assertion" }],
  }],
]);

const REVIEWED_RECLASSIFICATIONS = new Map([
  ["treatment_tremont-morris-grand-conc", {
    correction_id: "relationship-integrity-tremont-morris-grand-conc-bus-stop-reclassification-20260715",
    treatment_kind: "dedicated bus-stop area",
    treatment_family: "bus_stop_or_boarding",
    evidence_ids: [
      "bx_cb5_projects_dec032019#p010_c0002",
      "bx_cb5_projects_dec032019#p010_c0005",
    ],
  }],
] as const);

export type BusLaneScopeDecision =
  | "physical_scope_satisfied"
  | "non_physical_enforcement_or_control"
  | "non_lane_supporting_feature"
  | "aggregate_or_unbounded_treatment"
  | "reviewed_non_projectable_physical_scope_unproven";

export type BusLaneSemanticClass = "physical_lane" | "enforcement_or_control" | "supporting_feature" | "aggregate";

type InventoryRecord = {
  record: MtaCanonicalRecord;
  canonical_status: "materialized" | "accepted_pending_addition";
};

type ScopeBinding = {
  relation_id: string;
  relation_kind: string;
  corridor_id: string;
  status: "canonical_existing" | "accepted_pending" | "campaign_remediation";
  source_ids: string[];
  evidence_refs: MtaEvidenceRef[];
};

type ExactMatch = {
  treatment: InventoryRecord;
  corridor: InventoryRecord;
  source_id: string;
  evidence_refs: MtaEvidenceRef[];
  facility_evidence_refs: MtaEvidenceRef[];
  treatment_assertion_evidence_refs: MtaEvidenceRef[];
  reviewed_additional_evidence_refs: MtaEvidenceRef[];
  evidence_review_verdict: "exact_current_evidence" | "repaired_adjacent_cocitation";
  facility_literal: string;
};

type MatchInvestigation = {
  verified_matches: ExactMatch[];
  exclusion_reason: string | null;
};

type RemediationRow = {
  schema_version: 1;
  contract_id: typeof BUS_LANE_SCOPE_CONTRACT_ID;
  treatment_id: string;
  corridor_id: string;
  relation_id: string;
  source_id: string;
  method_id: typeof BUS_LANE_SCOPE_METHOD_ID;
  method_version: 1;
  decision: "submit_evidence_backed_physical_scope_relation";
  evidence_refs: Array<{
    evidence_id: string;
    block_id: string | null;
    text_sha256: string | null;
  }>;
  route_binding_added: false;
};

type EvidenceReviewRow = {
  schema_version: 1;
  contract_id: typeof BUS_LANE_SCOPE_CONTRACT_ID;
  review_method_id: typeof BUS_LANE_SCOPE_METHOD_ID;
  treatment_id: string;
  corridor_id: string | null;
  relation_id: string | null;
  source_id: string;
  verdict: "exact_current_evidence" | "repaired_adjacent_cocitation" | "reclassified_non_lane";
  facility_evidence_ids: string[];
  treatment_assertion_evidence_ids: string[];
  reviewed_additional_evidence_ids: string[];
  correction_id: string | null;
  reason: string;
};

type Campaign = {
  contract: JsonObject;
  decisions: JsonObject[];
  reviewDecisions: JsonObject[];
  remediationRows: RemediationRow[];
  evidenceReviewRows: EvidenceReviewRow[];
  submissions: MtaSubmissionEntry[];
  summary: JsonObject;
  report: string;
};

type RawSourceBlock = {
  source_id: string;
  block_id: string;
  page_number: number;
  raw_text: string;
  raw_text_sha256: string;
};

const sourceBlockCache = new Map<string, Map<string, RawSourceBlock>>();

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path: string): string {
  return sha256(readFileSync(path));
}

function stableJsonl(rows: unknown[]): string {
  return `${rows.map((row) => stableJson(row as never)).join("\n")}\n`;
}

function compactEvidence(ref: MtaEvidenceRef): JsonObject {
  return {
    source_id: ref.source_id,
    evidence_id: ref.evidence_id,
    source_path: ref.source_path,
    page_number: ref.page_number ?? null,
    block_id: ref.block_id ?? null,
    text_sha256: ref.text_sha256 ?? null,
    text_source: ref.text_source ?? null,
  };
}

function canonicalStrings(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/(\d+)\s+(st|nd|rd|th)\b/gu, "$1$2")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\bavenues?\b/gu, "ave")
    .replace(/\bboulevards?\b/gu, "blvd")
    .replace(/\bstreets?\b/gu, "st")
    .replace(/\broads?\b/gu, "rd")
    .replace(/\bplaces?\b/gu, "pl")
    .replace(/\bhighways?\b/gu, "hwy")
    .replace(/\bparkways?\b/gu, "pkwy")
    .replace(/\b(bus lanes?|busway|corridor|crosstown|sbs|manhattan|brooklyn|queens|bronx|staten island)\b/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function containsPhrase(text: string, phrase: string): boolean {
  return (` ${text} `).includes(` ${phrase} `);
}

function rawSourceBlock(sourceId: string, blockId: string): RawSourceBlock | null {
  if (blockId.includes("..")) return null;
  let byId = sourceBlockCache.get(sourceId);
  if (!byId) {
    const path = join(repoRoot, "raw", "sources", sourceId, "blocks.jsonl");
    if (!existsSync(path)) return null;
    byId = new Map(readJsonl<RawSourceBlock>(path).map((block) => [block.block_id, block]));
    sourceBlockCache.set(sourceId, byId);
  }
  return byId.get(blockId) ?? null;
}

function sourceBlock(ref: MtaEvidenceRef): { raw_text: string; hash_matches: boolean } | null {
  const blockId = ref.block_id;
  if (!blockId || blockId.includes("..")) return null;
  const block = rawSourceBlock(ref.source_id, blockId);
  if (!block) return null;
  return { raw_text: block.raw_text, hash_matches: block.raw_text_sha256 === ref.text_sha256 };
}

export function blockAssertsPhysicalBusLane(rawText: string): boolean {
  const text = rawText.replace(/\s+/gu, " ");
  return /(?:\bbus[- ]?only\b|\bbus\s*(?:&|and)\s*(?:truck|right turn)\s+only\b|\bbus lanes?\b|\bbus (?:and|&) right turn lane\b|\blanes?\b.{0,80}\b(?:for|used by)\b.{0,30}\bbuses?\b|\btransitway\b)/iu.test(text);
}

function reviewedEvidenceRef(
  sourceId: string,
  blockId: string,
  role: ReviewedCoCitation["blocks"][number]["role"],
): MtaEvidenceRef {
  const block = rawSourceBlock(sourceId, blockId);
  if (!block) throw new Error(`reviewed evidence block is missing: ${sourceId}#${blockId}`);
  if (block.source_id !== sourceId || block.block_id !== blockId) {
    throw new Error(`reviewed evidence block identity mismatch: ${sourceId}#${blockId}`);
  }
  return {
    source_id: sourceId,
    evidence_id: `${sourceId}#${blockId}`,
    source_path: `raw/sources/${sourceId}/blocks.jsonl`,
    page_number: block.page_number,
    block_id: blockId,
    text_sha256: block.raw_text_sha256,
    text_source: "raw_text",
    role,
  };
}

function uniqueEvidenceRefs(refs: readonly MtaEvidenceRef[]): MtaEvidenceRef[] {
  const byId = new Map<string, MtaEvidenceRef>();
  for (const ref of refs) {
    const id = ref.evidence_id ?? `${ref.source_id}#${ref.block_id ?? ""}`;
    const existing = byId.get(id);
    if (existing && stableJson(existing as unknown as JsonObject) !== stableJson(ref as unknown as JsonObject)) {
      // A reviewed role is additive metadata on the same immutable block. Preserve the reviewed
      // role while requiring every identity/hash field to agree.
      const withoutAnnotations = (value: MtaEvidenceRef): JsonObject => {
        const { role: _role, source_quote: _sourceQuote, ...rest } = value;
        return rest as JsonObject;
      };
      if (stableJson(withoutAnnotations(existing)) !== stableJson(withoutAnnotations(ref))) {
        throw new Error(`conflicting evidence metadata for ${id}`);
      }
      byId.set(id, {
        ...existing,
        role: ref.role ?? existing.role,
        source_quote: existing.source_quote === ref.source_quote ? existing.source_quote : undefined,
      });
      continue;
    }
    byId.set(id, ref);
  }
  return [...byId.values()].sort((left, right) =>
    (left.evidence_id ?? "").localeCompare(right.evidence_id ?? ""));
}

function guardMatchesPayload(payload: JsonObject, correction: SemanticCorrectionEntry): boolean {
  return Object.entries(correction.guards.payload ?? {}).every(([field, expected]) =>
    stableJson((payload[field] ?? null) as never) === stableJson((expected ?? null) as never));
}

function reviewedReclassification(
  record: MtaCanonicalRecord,
  correctionsById: ReadonlyMap<string, SemanticCorrectionEntry>,
): MtaCanonicalRecord {
  const expected = REVIEWED_RECLASSIFICATIONS.get(record.record_id);
  if (!expected) return record;
  const correction = correctionsById.get(expected.correction_id);
  if (!correction) throw new Error(`missing reviewed reclassification ${expected.correction_id}`);
  const set = correction.patch.set;
  if (!set || typeof set !== "object" || Array.isArray(set)) {
    throw new Error(`reviewed reclassification ${expected.correction_id} lacks patch.set`);
  }
  const patchedFields = new Set(Object.keys(set));
  const unchangedGuardsMatch = Object.entries(correction.guards.payload ?? {})
    .filter(([field]) => !patchedFields.has(field))
    .every(([field, value]) =>
      stableJson((record.payload[field] ?? null) as never) === stableJson((value ?? null) as never)
    );
  const patchAlreadyApplied = Object.entries(set).every(([field, value]) =>
    stableJson((record.payload[field] ?? null) as never) === stableJson((value ?? null) as never)
  );
  if (
    correction.op !== "patch_payload" ||
    correction.record_id !== record.record_id ||
    (!guardMatchesPayload(record.payload, correction) && !(unchangedGuardsMatch && patchAlreadyApplied))
  ) {
    throw new Error(`reviewed reclassification ${expected.correction_id} is not applicable to ${record.record_id}`);
  }
  if (set.treatment_kind !== expected.treatment_kind || set.treatment_family !== expected.treatment_family) {
    throw new Error(`reviewed reclassification ${expected.correction_id} does not match the reviewed target classification`);
  }
  return { ...record, payload: { ...record.payload, ...set } };
}

function normalizedKind(value: string): string {
  return value.toLowerCase().replace(/[_-]+/gu, " ").replace(/\s+/gu, " ").trim();
}

export function classifyBusLaneTreatmentKind(treatmentKind: string): BusLaneSemanticClass {
  const kind = normalizedKind(treatmentKind);
  if (
    /enforcement|camera|automated/iu.test(kind)
    || /^(?:hov )?bus lane operations?$/u.test(kind)
    || /lane hours|hours reduction|lane operating hours|lane operation|right turn from bus lane|lane removal/iu.test(kind)
  ) return "enforcement_or_control";

  if (/^center(?: running)? bus lane/iu.test(kind)) return "physical_lane";
  if (
    /bollard|qwi?k kurb|quick kurb|physical separation|physical protection|lane paint|painted bus lane|lane markings?|lane maintenance/iu.test(kind)
    || /repaving.*restri/iu.test(kind)
  ) return "supporting_feature";

  if (
    /improvement|upgrade|key design piece|signal improvements and targeted|sbs in bus lane|bus lane treatment/iu.test(kind)
    || kind === "bus priority"
    || treatmentKind.includes(",")
    || treatmentKind.includes("/")
  ) return "aggregate";
  return "physical_lane";
}

export function isUnboundedBusLaneTreatment(locationText: string | undefined): boolean {
  const location = canonicalStrings(locationText ?? "");
  if (!location) return true;
  return /^(?:portion of (?:the )?corridor|citywide|systemwide|all five boroughs|outer boroughs|various locations?|multiple locations?|m15 route|nine routes)/u.test(location);
}

function genericPrefixOnly(prefix: string): boolean {
  if (!prefix) return true;
  return prefix.split(" ").every((token) =>
    /^(?:(?:19|20)\d\d|alternative|alt|bus|lane|lanes|dedicated|offset|curbside|center|running|existing|new|proposed|eastbound|westbound|northbound|southbound|phase|treatment|design|improved|main|road|double|temporary|peak|period|extension|one|two|way|extra|travel|along|on|at|full|time|targeted|project|concept|mon|fri|am|pm|transitway|only|mile|miles)$/u.test(token));
}

function identitySupportsFacility(record: MtaCanonicalRecord, facility: string): boolean {
  const display = canonicalStrings(record.display_name);
  const location = canonicalStrings(String(record.payload.location_text ?? ""));
  const description = canonicalStrings(String(record.payload.description ?? ""));
  const index = display.indexOf(facility);
  if (index >= 0 && genericPrefixOnly(display.slice(0, index).trim())) return true;

  if (location === facility || location.startsWith(`${facility} `)) {
    const tail = location.slice(facility.length).trim();
    if (!tail.startsWith("to ") && (display.includes(facility) || description.includes(facility))) return true;
  }
  return description.includes(` on ${facility}`)
    || description.startsWith(`on ${facility}`)
    || description.includes(` along ${facility}`)
    || description.startsWith(`along ${facility}`);
}

function relationIsCampaign(record: MtaCanonicalRecord): boolean {
  return record.record_id.startsWith(CAMPAIGN_RECORD_PREFIX)
    || record.local_observation_id.startsWith(CAMPAIGN_LOCAL_PREFIX);
}

function inventoryRecordFromEntry(entry: MtaSubmissionEntry, recordId: string): InventoryRecord {
  return {
    canonical_status: "accepted_pending_addition",
    record: {
      record_id: recordId,
      record_kind: entry.tool_args.observation_kind,
      source_id: entry.tool_args.source_id,
      source_ids: [entry.tool_args.source_id],
      local_observation_id: entry.tool_args.local_observation_id,
      local_observation_ids: [entry.tool_args.local_observation_id],
      display_name: entry.tool_args.label ?? entry.tool_args.local_observation_id,
      payload: entry.tool_args.payload,
      evidence_refs: entry.tool_args.evidence_refs ?? [],
      submission_ids: [entry.submission_id],
      truth_status: "source_stated",
      review_state: "unreviewed",
      generated_at: REVIEWED_AT,
    },
  };
}

function endpointId(entry: MtaSubmissionEntry, side: "subject" | "object", localIds: Map<string, string>): string | null {
  const direct = entry.tool_args.payload[`${side}_id`];
  if (typeof direct === "string" && direct) return direct;
  const local = entry.tool_args.payload[`${side}_local_observation_id`];
  return typeof local === "string" ? localIds.get(local) ?? null : null;
}

function scopeBinding(
  relationId: string,
  relationKind: string,
  subjectId: string,
  objectId: string,
  treatmentIds: Set<string>,
  corridorIds: Set<string>,
  status: ScopeBinding["status"],
  sourceIds: string[],
  evidenceRefs: MtaEvidenceRef[],
): { treatmentId: string; binding: ScopeBinding } | null {
  if (relationKind === "located_on_corridor" && treatmentIds.has(subjectId) && corridorIds.has(objectId)) {
    return {
      treatmentId: subjectId,
      binding: { relation_id: relationId, relation_kind: relationKind, corridor_id: objectId, status, source_ids: sourceIds, evidence_refs: evidenceRefs },
    };
  }
  if (relationKind === "has_treatment" && corridorIds.has(subjectId) && treatmentIds.has(objectId)) {
    return {
      treatmentId: objectId,
      binding: { relation_id: relationId, relation_kind: relationKind, corridor_id: subjectId, status, source_ids: sourceIds, evidence_refs: evidenceRefs },
    };
  }
  return null;
}

function addBinding(byTreatment: Map<string, ScopeBinding[]>, treatmentId: string, binding: ScopeBinding): void {
  const existing = byTreatment.get(treatmentId) ?? [];
  if (!existing.some((candidate) => candidate.relation_id === binding.relation_id)) {
    byTreatment.set(treatmentId, [...existing, binding].sort((left, right) => left.relation_id.localeCompare(right.relation_id)));
  }
}

function deterministicEntry(raw: MtaSubmitObservationInput): MtaSubmissionEntry {
  const toolArgs = normalizeSubmitInput(raw);
  const hash = stableHash(toolArgs as unknown as JsonObject);
  return {
    submission_id: `sub_${hash.slice(0, 16)}`,
    run_id: RUN_ID,
    submitted_at: REVIEWED_AT,
    tool_args_sha256: `sha256:${hash}`,
    schema_version: PAYLOAD_SCHEMA_VERSION,
    tool_args: toolArgs,
    validation: { state: "accepted", issues: [] },
  };
}

function relationInput(match: ExactMatch): MtaSubmitObservationInput {
  const treatmentSuffix = match.treatment.record.record_id.replace(/^treatment_/u, "");
  const corridorSuffix = match.corridor.record.record_id.replace(/^corridor_/u, "");
  return {
    source_id: match.source_id,
    observation_kind: "relation",
    local_observation_id: `${CAMPAIGN_LOCAL_PREFIX}${treatmentSuffix}_on_${corridorSuffix}`,
    create_new: true,
    label: `${match.treatment.record.display_name} located on ${match.corridor.record.display_name}`,
    payload: {
      relation_kind: "located_on_corridor",
      relation_family: "corridor_scope",
      subject_id: match.treatment.record.record_id,
      object_id: match.corridor.record.record_id,
      assertion_status: "unknown",
      description: `The cited authoritative source places ${match.treatment.record.display_name} on ${match.corridor.record.display_name}. This relation does not assert a route binding.`,
    },
    evidence_refs: match.evidence_refs,
  };
}

function exactMatches(treatment: InventoryRecord, corridors: InventoryRecord[]): MatchInvestigation {
  const exclusionReason = REMEDIATION_EXCLUSIONS.get(treatment.record.record_id) ?? null;
  const reviewedCoCitation = REVIEWED_CO_CITATIONS.get(treatment.record.record_id);
  const matches: ExactMatch[] = [];
  for (const corridor of corridors) {
    const facility = canonicalStrings(String(corridor.record.payload.corridor_name ?? corridor.record.display_name));
    if (facility.length < 3 || !identitySupportsFacility(treatment.record, facility)) continue;
    const sharedSources = corridor.record.source_ids.filter((sourceId) => treatment.record.source_ids.includes(sourceId)).sort();
    for (const sourceId of sharedSources) {
      const facilityEvidenceRefs = treatment.record.evidence_refs.filter((ref) => {
        if (ref.source_id !== sourceId) return false;
        const block = sourceBlock(ref);
        return Boolean(block?.hash_matches && containsPhrase(canonicalStrings(block.raw_text), facility));
      });
      if (facilityEvidenceRefs.length === 0) continue;

      const facilityPages = new Set(facilityEvidenceRefs
        .map((ref) => ref.page_number)
        .filter((page): page is number => typeof page === "number"));
      const currentTreatmentAssertionRefs = treatment.record.evidence_refs.filter((ref) => {
        if (ref.source_id !== sourceId || !facilityPages.has(ref.page_number ?? -1)) return false;
        const block = sourceBlock(ref);
        return Boolean(block?.hash_matches && blockAssertsPhysicalBusLane(block.raw_text));
      });
      const reviewedAdditionalRefs = reviewedCoCitation
        && reviewedCoCitation.corridor_id === corridor.record.record_id
        && reviewedCoCitation.source_id === sourceId
        ? reviewedCoCitation.blocks.map((block) => reviewedEvidenceRef(sourceId, block.block_id, block.role))
        : [];
      if (reviewedAdditionalRefs.some((ref) => !facilityPages.has(ref.page_number ?? -1))) {
        throw new Error(
          `reviewed co-citation for ${treatment.record.record_id}/${corridor.record.record_id} is not on the exact facility-evidence page`,
        );
      }
      const reviewedTreatmentAssertionRefs = reviewedAdditionalRefs.filter((ref) => {
        const block = sourceBlock(ref);
        return Boolean(block?.hash_matches && blockAssertsPhysicalBusLane(block.raw_text));
      });
      const treatmentAssertionRefs = uniqueEvidenceRefs([
        ...currentTreatmentAssertionRefs,
        ...reviewedTreatmentAssertionRefs,
      ]);
      if (treatmentAssertionRefs.length === 0) continue;

      const evidenceRefs = uniqueEvidenceRefs([
        ...facilityEvidenceRefs,
        ...currentTreatmentAssertionRefs,
        ...reviewedAdditionalRefs,
      ]);
      if (evidenceRefs.some((ref) => !sourceBlock(ref)?.hash_matches)) {
        throw new Error(`non-resolving evidence entered exact match for ${treatment.record.record_id}`);
      }
      matches.push({
        treatment,
        corridor,
        source_id: sourceId,
        evidence_refs: evidenceRefs,
        facility_evidence_refs: uniqueEvidenceRefs(facilityEvidenceRefs),
        treatment_assertion_evidence_refs: treatmentAssertionRefs,
        reviewed_additional_evidence_refs: uniqueEvidenceRefs(reviewedAdditionalRefs),
        evidence_review_verdict: reviewedAdditionalRefs.length > 0
          ? "repaired_adjacent_cocitation"
          : "exact_current_evidence",
        facility_literal: facility,
      });
      break;
    }
  }
  const unique = new Map<string, ExactMatch>();
  for (const match of matches) unique.set(match.corridor.record.record_id, match);
  return { verified_matches: [...unique.values()].sort((left, right) => left.corridor.record.record_id.localeCompare(right.corridor.record.record_id)), exclusion_reason: exclusionReason };
}

function buildCampaign(): Campaign {
  const canonicalTreatments = readJsonl<MtaCanonicalRecord>(CANONICAL_PATHS.treatments);
  const canonicalCorridors = readJsonl<MtaCanonicalRecord>(CANONICAL_PATHS.corridors);
  const canonicalRelations = readJsonl<MtaCanonicalRecord>(CANONICAL_PATHS.relations);
  const semanticCorrections = readSemanticCorrections();
  const correctionsById = new Map(semanticCorrections.map((correction) => [correction.correction_id, correction]));
  const effectiveCanonicalTreatments = canonicalTreatments.map((record) =>
    reviewedReclassification(record, correctionsById));
  const reviewedReclassifiedTreatments = effectiveCanonicalTreatments.filter((record) => {
    return REVIEWED_RECLASSIFICATIONS.has(record.record_id) && record.payload.treatment_family !== "bus_lane";
  });
  const treatments = new Map<string, InventoryRecord>(
    effectiveCanonicalTreatments
      .filter((record) => record.payload.treatment_family === "bus_lane")
      .map((record) => [record.record_id, { record, canonical_status: "materialized" }]),
  );
  const corridors = new Map<string, InventoryRecord>(
    canonicalCorridors.map((record) => [record.record_id, { record, canonical_status: "materialized" }]),
  );
  const pendingEntriesByPath = new Map<string, MtaSubmissionEntry[]>();

  for (const journalPath of REVIEWED_PENDING_JOURNALS) {
    const entries = readJsonl<MtaSubmissionEntry>(journalPath).filter((entry) => entry.validation.state === "accepted");
    pendingEntriesByPath.set(journalPath, entries);
    for (const entry of entries) {
      if (entry.tool_args.target_record_id) continue;
      const recordId = canonicalRecordIdForInput(entry.tool_args);
      if (
        entry.tool_args.observation_kind === "treatment_component"
        && entry.tool_args.payload.treatment_family === "bus_lane"
        && !treatments.has(recordId)
      ) treatments.set(recordId, inventoryRecordFromEntry(entry, recordId));
      if (entry.tool_args.observation_kind === "corridor" && !corridors.has(recordId)) {
        corridors.set(recordId, inventoryRecordFromEntry(entry, recordId));
      }
    }
  }

  const treatmentIds = new Set(treatments.keys());
  const corridorIds = new Set(corridors.keys());
  const bindingsByTreatment = new Map<string, ScopeBinding[]>();
  const allCanonicalRelationIds = new Set(canonicalRelations.map((record) => record.record_id));

  for (const relation of canonicalRelations) {
    if (relationIsCampaign(relation)) continue;
    const subjectId = typeof relation.payload.subject_id === "string" ? relation.payload.subject_id : null;
    const objectId = typeof relation.payload.object_id === "string" ? relation.payload.object_id : null;
    const relationKind = typeof relation.payload.relation_kind === "string" ? relation.payload.relation_kind : "";
    if (!subjectId || !objectId) continue;
    const resolved = scopeBinding(
      relation.record_id,
      relationKind,
      subjectId,
      objectId,
      treatmentIds,
      corridorIds,
      "canonical_existing",
      relation.source_ids,
      relation.evidence_refs,
    );
    if (resolved) addBinding(bindingsByTreatment, resolved.treatmentId, resolved.binding);
  }

  for (const [journalPath, entries] of pendingEntriesByPath) {
    const localIds = new Map(entries.map((entry) => [
      entry.tool_args.local_observation_id,
      entry.tool_args.target_record_id ?? canonicalRecordIdForInput(entry.tool_args),
    ]));
    for (const entry of entries.filter((candidate) => candidate.tool_args.observation_kind === "relation")) {
      const relationId = canonicalRecordIdForInput(entry.tool_args);
      if (allCanonicalRelationIds.has(relationId)) continue;
      const subjectId = endpointId(entry, "subject", localIds);
      const objectId = endpointId(entry, "object", localIds);
      const relationKind = String(entry.tool_args.payload.relation_kind ?? "");
      if (!subjectId || !objectId) continue;
      const resolved = scopeBinding(
        relationId,
        relationKind,
        subjectId,
        objectId,
        treatmentIds,
        corridorIds,
        "accepted_pending",
        [entry.tool_args.source_id],
        entry.tool_args.evidence_refs ?? [],
      );
      if (resolved) addBinding(bindingsByTreatment, resolved.treatmentId, resolved.binding);
    }
    if (!existsSync(journalPath)) throw new Error(`reviewed pending journal disappeared: ${journalPath}`);
  }

  const investigations = new Map<string, MatchInvestigation>();
  const remediationMatches: ExactMatch[] = [];
  const sortedCorridors = [...corridors.values()].sort((left, right) => left.record.record_id.localeCompare(right.record.record_id));
  for (const treatment of [...treatments.values()].sort((left, right) => left.record.record_id.localeCompare(right.record.record_id))) {
    if (classifyBusLaneTreatmentKind(String(treatment.record.payload.treatment_kind ?? "")) !== "physical_lane") continue;
    if ((bindingsByTreatment.get(treatment.record.record_id) ?? []).length > 0) continue;
    const investigation = exactMatches(treatment, sortedCorridors);
    investigations.set(treatment.record.record_id, investigation);
    if (
      treatment.canonical_status === "materialized"
      && !investigation.exclusion_reason
      && investigation.verified_matches.length === 1
    ) remediationMatches.push(investigation.verified_matches[0]!);
  }

  remediationMatches.sort((left, right) => left.treatment.record.record_id.localeCompare(right.treatment.record.record_id));
  const repairedMatches = remediationMatches.filter((match) =>
    match.evidence_review_verdict === "repaired_adjacent_cocitation");
  const exactCurrentMatches = remediationMatches.filter((match) =>
    match.evidence_review_verdict === "exact_current_evidence");
  if (exactCurrentMatches.length !== PRIOR_EVIDENCE_AUDIT.exact_current_evidence_count) {
    throw new Error(
      `reviewed exact-current relation count drifted: expected ${PRIOR_EVIDENCE_AUDIT.exact_current_evidence_count}, ` +
        `found ${exactCurrentMatches.length}`,
    );
  }
  if (repairedMatches.length !== PRIOR_EVIDENCE_AUDIT.adjacent_cocitation_required_count) {
    throw new Error(
      `reviewed co-citation relation count drifted: expected ${PRIOR_EVIDENCE_AUDIT.adjacent_cocitation_required_count}, ` +
        `found ${repairedMatches.length}`,
    );
  }
  const repairedTreatmentIds = new Set(repairedMatches.map((match) => match.treatment.record.record_id));
  const missingReviewedRepairs = [...REVIEWED_CO_CITATIONS.keys()].filter((treatmentId) =>
    !repairedTreatmentIds.has(treatmentId));
  if (missingReviewedRepairs.length > 0) {
    throw new Error(`reviewed co-citations were not consumed: ${missingReviewedRepairs.join(", ")}`);
  }
  if (reviewedReclassifiedTreatments.length !== PRIOR_EVIDENCE_AUDIT.reclassified_non_lane_count) {
    throw new Error(
      `reviewed non-lane reclassification count drifted: expected ${PRIOR_EVIDENCE_AUDIT.reclassified_non_lane_count}, ` +
        `found ${reviewedReclassifiedTreatments.length}`,
    );
  }
  if (remediationMatches.length + reviewedReclassifiedTreatments.length !== PRIOR_EVIDENCE_AUDIT.relation_count) {
    throw new Error("reviewed 113-row evidence audit no longer reconciles to repaired relations plus reclassification");
  }
  const submissions = remediationMatches.map((match) => deterministicEntry(relationInput(match)));
  const remediationRows: RemediationRow[] = [];
  for (const [index, match] of remediationMatches.entries()) {
    const entry = submissions[index]!;
    const relationId = canonicalRecordIdForInput(entry.tool_args);
    const binding: ScopeBinding = {
      relation_id: relationId,
      relation_kind: "located_on_corridor",
      corridor_id: match.corridor.record.record_id,
      status: "campaign_remediation",
      source_ids: [match.source_id],
      evidence_refs: match.evidence_refs,
    };
    addBinding(bindingsByTreatment, match.treatment.record.record_id, binding);
    remediationRows.push({
      schema_version: 1,
      contract_id: BUS_LANE_SCOPE_CONTRACT_ID,
      treatment_id: match.treatment.record.record_id,
      corridor_id: match.corridor.record.record_id,
      relation_id: relationId,
      source_id: match.source_id,
      method_id: BUS_LANE_SCOPE_METHOD_ID,
      method_version: 1,
      decision: "submit_evidence_backed_physical_scope_relation",
      evidence_refs: match.evidence_refs.map((ref) => ({
        evidence_id: ref.evidence_id,
        block_id: ref.block_id ?? null,
        text_sha256: ref.text_sha256 ?? null,
      })),
      route_binding_added: false,
    });
  }

  const evidenceReviewRows: EvidenceReviewRow[] = remediationMatches.map((match, index) => ({
    schema_version: 1,
    contract_id: BUS_LANE_SCOPE_CONTRACT_ID,
    review_method_id: BUS_LANE_SCOPE_METHOD_ID,
    treatment_id: match.treatment.record.record_id,
    corridor_id: match.corridor.record.record_id,
    relation_id: canonicalRecordIdForInput(submissions[index]!.tool_args),
    source_id: match.source_id,
    verdict: match.evidence_review_verdict,
    facility_evidence_ids: match.facility_evidence_refs.map((ref) => String(ref.evidence_id)).sort(),
    treatment_assertion_evidence_ids: match.treatment_assertion_evidence_refs
      .map((ref) => String(ref.evidence_id)).sort(),
    reviewed_additional_evidence_ids: match.reviewed_additional_evidence_refs
      .map((ref) => String(ref.evidence_id)).sort(),
    correction_id: null,
    reason: match.evidence_review_verdict === "repaired_adjacent_cocitation"
      ? "The prior generated edge cited only facility/location context; the reviewed same-page authoritative blocks now co-cite the physical lane assertion."
      : "The same exact hash-verified block set asserts both the physical lane treatment and its canonical facility/location or extent.",
  }));
  for (const record of reviewedReclassifiedTreatments) {
    const expected = REVIEWED_RECLASSIFICATIONS.get(record.record_id)!;
    const evidenceIds = new Set(record.evidence_refs.map((ref) => ref.evidence_id));
    if (expected.evidence_ids.some((evidenceId) => !evidenceIds.has(evidenceId))) {
      throw new Error(`reviewed reclassification evidence is not attached to ${record.record_id}`);
    }
    evidenceReviewRows.push({
      schema_version: 1,
      contract_id: BUS_LANE_SCOPE_CONTRACT_ID,
      review_method_id: BUS_LANE_SCOPE_METHOD_ID,
      treatment_id: record.record_id,
      corridor_id: null,
      relation_id: null,
      source_id: record.source_id,
      verdict: "reclassified_non_lane",
      facility_evidence_ids: [expected.evidence_ids[0]!],
      treatment_assertion_evidence_ids: [],
      reviewed_additional_evidence_ids: [],
      correction_id: expected.correction_id,
      reason: "The official diagram shows a dedicated 13-foot bus-stop area and a 10-foot travel lane, not a physical bus lane; the guarded semantic correction reclassifies the treatment.",
    });
  }
  evidenceReviewRows.sort((left, right) => left.treatment_id.localeCompare(right.treatment_id));

  const decisions: JsonObject[] = [];
  for (const treatment of [...treatments.values()].sort((left, right) => left.record.record_id.localeCompare(right.record.record_id))) {
    const record = treatment.record;
    const semanticClass = classifyBusLaneTreatmentKind(String(record.payload.treatment_kind ?? ""));
    const bindings = bindingsByTreatment.get(record.record_id) ?? [];
    const investigation = investigations.get(record.record_id) ?? { verified_matches: [], exclusion_reason: null };
    let decision: BusLaneScopeDecision;
    let rule: string;
    let reason: string;
    if (semanticClass === "enforcement_or_control") {
      decision = "non_physical_enforcement_or_control";
      rule = "v1:kind-enforcement-or-control";
      reason = "The source-backed treatment kind describes enforcement, camera, hours, operations, or another lane-control policy rather than a physical bus-lane treatment row.";
    } else if (semanticClass === "supporting_feature") {
      decision = "non_lane_supporting_feature";
      rule = "v1:kind-supporting-feature";
      reason = "The source-backed treatment kind describes paint, markings, bollards, separation, maintenance, or another feature supporting a bus lane rather than the lane itself.";
    } else if (semanticClass === "aggregate") {
      decision = "aggregate_or_unbounded_treatment";
      rule = "v1:kind-aggregate-bundle";
      reason = "The record combines multiple lane improvements, an upgrade bundle, general bus-priority work, or another aggregate treatment that is not a single bounded physical lane component.";
    } else if (bindings.length > 0) {
      decision = "physical_scope_satisfied";
      rule = "v1:evidence-backed-canonical-corridor-binding";
      reason = `The physical lane component has ${bindings.length} evidence-backed canonical corridor binding${bindings.length === 1 ? "" : "s"}. Physical scope alone does not establish route, phase, date, operational status, or study eligibility.`;
    } else if (isUnboundedBusLaneTreatment(String(record.payload.location_text ?? ""))) {
      decision = "aggregate_or_unbounded_treatment";
      rule = "v1:no-bounded-location-or-scope-binding";
      reason = "The physical lane literal has neither a bounded canonical location nor an evidence-backed canonical corridor/segment relation at this record's precision.";
    } else {
      decision = "reviewed_non_projectable_physical_scope_unproven";
      rule = "v1:physical-scope-unproven-after-evidence-review";
      reason = investigation.exclusion_reason
        ?? (investigation.verified_matches.length > 1
          ? `Evidence review found ${investigation.verified_matches.length} possible same-source corridor identities and no unique exact physical scope.`
          : "Evidence and same-source canonical corridor records were reviewed, but no unique exact facility identity passed the versioned evidence rule.");
    }

    const satisfied = decision === "physical_scope_satisfied";
    decisions.push({
      schema_version: 1,
      contract_id: BUS_LANE_SCOPE_CONTRACT_ID,
      decision_id: `${BUS_LANE_SCOPE_CONTRACT_ID}:${record.record_id}`,
      treatment_id: record.record_id,
      canonical_status: treatment.canonical_status,
      treatment_family: "bus_lane",
      treatment_kind: String(record.payload.treatment_kind ?? ""),
      display_name: record.display_name,
      location_text: String(record.payload.location_text ?? ""),
      source_ids: record.source_ids,
      exclusive_decision: decision,
      disposition_rule: rule,
      physical_scope_requirement_satisfied: satisfied,
      study_eligible: satisfied ? null : false,
      study_eligibility_effect: satisfied
        ? "not_determined_by_physical_scope_contract"
        : "excluded_by_physical_scope_contract",
      reason,
      scope_bindings: bindings.map((binding) => ({
        relation_id: binding.relation_id,
        relation_kind: binding.relation_kind,
        corridor_id: binding.corridor_id,
        status: binding.status,
        source_ids: binding.source_ids,
        evidence_refs: binding.evidence_refs.map(compactEvidence),
      })),
      evidence_refs: record.evidence_refs.map(compactEvidence),
      evidence_investigation: {
        method_id: BUS_LANE_SCOPE_METHOD_ID,
        verified_candidate_corridor_ids: investigation.verified_matches.map((match) => match.corridor.record.record_id),
        explicit_exclusion_reason: investigation.exclusion_reason,
        exact_hash_verified_evidence_required: true,
        route_similarity_or_proximity_used: false,
      },
      review: {
        reviewed_by: REVIEWED_BY,
        review_method: "deterministic corpus audit plus exact evidence-block verification",
        method_version: 1,
        reviewed_at: REVIEWED_AT,
      },
      amendment_policy: "immutable_v1_decision; correction requires a superseding versioned decision",
    });
  }

  const decisionCounts = Object.fromEntries(
    [...new Set(decisions.map((decision) => String(decision.exclusive_decision)))]
      .sort()
      .map((decision) => [decision, decisions.filter((row) => row.exclusive_decision === decision).length]),
  );
  const canonicalPhysicalBefore = decisions.filter((decision) =>
    decision.scope_bindings instanceof Array
    && decision.scope_bindings.some((binding) => (binding as JsonObject).status === "canonical_existing")
    && classifyBusLaneTreatmentKind(String(decision.treatment_kind)) === "physical_lane").length;
  const acceptedPendingPhysical = decisions.filter((decision) =>
    decision.scope_bindings instanceof Array
    && !(decision.scope_bindings as JsonObject[]).some((binding) => binding.status === "canonical_existing")
    && (decision.scope_bindings as JsonObject[]).some((binding) => binding.status === "accepted_pending")
    && classifyBusLaneTreatmentKind(String(decision.treatment_kind)) === "physical_lane").length;
  const projectedSatisfied = decisions.filter((decision) => decision.exclusive_decision === "physical_scope_satisfied").length;
  const reviewDecisions = decisions.map((decision) => {
    const treatmentId = String(decision.treatment_id);
    const primaryDisposition = String(decision.exclusive_decision);
    const satisfied = primaryDisposition === "physical_scope_satisfied";
    const sourceIds = [...new Set((Array.isArray(decision.source_ids) ? decision.source_ids : [])
      .map(String)
      .filter(Boolean))].sort();
    const evidenceIds = [...new Set((Array.isArray(decision.evidence_refs) ? decision.evidence_refs as JsonObject[] : [])
      .map((ref) => String(ref.evidence_id ?? ""))
      .filter(Boolean))].sort();
    const bindings = Array.isArray(decision.scope_bindings) ? decision.scope_bindings as JsonObject[] : [];
    const relatedRecordIds = [...new Set(bindings.flatMap((binding) => [
      String(binding.corridor_id ?? ""),
      String(binding.relation_id ?? ""),
    ]).filter(Boolean))].sort();
    const graphRecordIds = [...new Set([treatmentId, ...relatedRecordIds])].sort();
    return {
      schema_version: 1,
      contract_id: "relationship-dispositions-v1",
      decision_id: `relationship-disposition-v1:${treatmentId}`,
      selector: "bus_lane_family_treatment",
      record_id: treatmentId,
      record_kind: "treatment_component",
      primary_disposition: primaryDisposition,
      // This ledger reviews the physical-scope role only. Even a satisfied row cannot acquire
      // study eligibility without route, phase, onset, status, and occurrence review elsewhere.
      study_projectable: false,
      // A reviewed non-projectable row is an explicit, evidence-linked waiver of the one
      // missing physical-scope role. It cannot confer study eligibility.
      waiver: !satisfied,
      reviewed_at: REVIEWED_AT.slice(0, 10),
      reviewed_by: REVIEWED_BY,
      reason: String(decision.reason),
      reason_codes: [String(decision.disposition_rule)],
      evidence_ids: evidenceIds,
      related_record_ids: relatedRecordIds,
      occurrence_ids: [],
      required_roles_satisfied: satisfied ? ["physical_scope"] : ["typed_non_projectable_disposition"],
      required_roles_missing: satisfied ? [] : ["physical_scope"],
      investigation: {
        method: "canonical_graph_and_bound_source_review",
        source_ids_checked: sourceIds,
        graph_record_ids_checked: graphRecordIds,
        gap_ids_checked: [],
        acquisition_receipt_ids: [],
        exact_supported_claims: satisfied
          ? ["physical_scope"]
          : ["typed_non_projectable_disposition"],
        exact_unsupported_claims: satisfied
          ? []
          : ["physical_scope"],
      },
    };
  });
  const canonicalBusLaneCount = [...treatments.values()].filter((item) => item.canonical_status === "materialized").length;
  const pendingAdditionCount = treatments.size - canonicalBusLaneCount;
  const journalContent = stableJsonl(submissions);

  const inputFiles = [
    ...Object.values(CANONICAL_PATHS),
    ...REVIEWED_PENDING_JOURNALS,
    semanticCorrectionsPath(),
  ].map((path) => ({
    path: relative(repoRoot, path),
    sha256: fileSha256(path),
    bytes: readFileSync(path).byteLength,
  }));
  const contract: JsonObject = {
    schema_version: 1,
    contract_id: BUS_LANE_SCOPE_CONTRACT_ID,
    contract_status: "reviewed_warning_migration_disposition",
    reviewed_at: REVIEWED_AT,
    reviewed_by: REVIEWED_BY,
    immutable_after_review: true,
    amendment_policy: "Publish a new version or a superseding decision; never mutate a reviewed row silently.",
    inventory_rule: "Every materialized treatment_component with effective payload.treatment_family=bus_lane after the explicitly pinned reviewed semantic reclassification, plus explicitly reviewed accepted pending additions required by coordinated materialization.",
    exclusive_decisions: {
      physical_scope_satisfied: "A physical lane component has an evidence-backed canonical corridor or bounded-segment relationship.",
      non_physical_enforcement_or_control: "Enforcement, camera, hours, operations, or designation-control record; never study-eligible as a physical lane treatment.",
      non_lane_supporting_feature: "Paint, markings, bollards, separation, maintenance, or another supporting feature rather than the physical lane row.",
      aggregate_or_unbounded_treatment: "Aggregate bundle or lane record lacking bounded physical scope at record precision.",
      reviewed_non_projectable_physical_scope_unproven: "Physical lane candidate reviewed without a unique exact authoritative scope identity.",
    },
    classification_precedence: [
      "non_physical_enforcement_or_control",
      "non_lane_supporting_feature",
      "aggregate_kind",
      "evidence_backed_scope_binding",
      "aggregate_or_unbounded_location",
      "reviewed_non_projectable_physical_scope_unproven",
    ],
    physical_scope_evidence_rule: {
      method_id: BUS_LANE_SCOPE_METHOD_ID,
      requirements: [
        "treatment and corridor share the authoritative source_id",
        "an exact facility/location or extent evidence block is available in the staged authoritative source",
        "an exact physical-lane treatment assertion is present on the same source page",
        "every cited evidence-block SHA-256 equals the staged authoritative block hash",
        "the normalized canonical corridor literal occurs in exact facility evidence",
        "the treatment identity text identifies that literal as the facility, not merely an endpoint",
        "reviewed adjacent co-citations are treatment/corridor/source specific and cannot generalize by name similarity",
        "exactly one canonical corridor identity passes all checks",
      ],
      prohibited_inferences: [
        "route binding from street-name similarity",
        "route binding from proximity or geometry",
        "physical scope from an ambiguous endpoint name",
      ],
    },
    study_policy: {
      non_satisfied_decisions_are_study_eligible: false,
      physical_scope_satisfied_does_not_imply_study_eligibility: true,
      waiver_policy: "A non-satisfied reviewed row waives only the missing physical-scope role and always remains non-projectable; a satisfied row creates no waiver.",
    },
    reviewed_pending_journals: REVIEWED_PENDING_JOURNALS.map((path) => relative(repoRoot, path)),
    inputs: inputFiles,
  };

  const summary: JsonObject = {
    schema_version: 1,
    contract_id: BUS_LANE_SCOPE_CONTRACT_ID,
    reviewed_at: REVIEWED_AT,
    prior_evidence_audit_journal_sha256: PRIOR_EVIDENCE_AUDIT.journal_sha256,
    prior_evidence_audit_relation_count: PRIOR_EVIDENCE_AUDIT.relation_count,
    prior_exact_current_evidence_relation_count: PRIOR_EVIDENCE_AUDIT.exact_current_evidence_count,
    repaired_adjacent_cocitation_relation_count: repairedMatches.length,
    reclassified_non_lane_treatment_count: reviewedReclassifiedTreatments.length,
    exact_evidence_relation_count_after_review: remediationMatches.length,
    evidence_review_row_count: evidenceReviewRows.length,
    canonical_bus_lane_treatment_count: canonicalBusLaneCount,
    accepted_pending_bus_lane_addition_count: pendingAdditionCount,
    decision_count: decisions.length,
    canonical_scope_edge_count_before: [...bindingsByTreatment.values()].flat().filter((binding) => binding.status === "canonical_existing").length,
    canonical_physical_scope_satisfied_count_before: canonicalPhysicalBefore,
    accepted_pending_physical_scope_satisfied_count: acceptedPendingPhysical,
    campaign_remediation_relation_count: remediationRows.length,
    projected_physical_scope_satisfied_count: projectedSatisfied,
    projected_physical_scope_gain: projectedSatisfied - canonicalPhysicalBefore,
    exclusive_decision_counts: decisionCounts,
    non_satisfied_decision_count: decisions.length - projectedSatisfied,
    study_eligible_false_count: decisions.filter((decision) => decision.study_eligible === false).length,
    study_eligibility_not_determined_count: decisions.filter((decision) => decision.study_eligible === null).length,
    evidence_linked_decision_count: decisions.filter((decision) => decision.evidence_refs instanceof Array && decision.evidence_refs.length > 0).length,
    manual_primary_facility_exclusion_count: REMEDIATION_EXCLUSIONS.size,
    route_relationship_additions: 0,
    operational_occurrence_additions: 0,
    remediation_journal_path: relative(repoRoot, JOURNAL_PATH),
    remediation_journal_sha256: sha256(journalContent),
    coordinated_materialization_required: remediationRows.length > 0,
  };

  if (Object.values(decisionCounts).reduce((sum, count) => sum + Number(count), 0) !== decisions.length) {
    throw new Error("exclusive disposition counts do not reconcile to decision inventory");
  }
  if (decisions.some((decision) => decision.exclusive_decision !== "physical_scope_satisfied" && decision.study_eligible !== false)) {
    throw new Error("non-satisfied physical-scope decision is not study_eligible=false");
  }
  if (decisions.some((decision) => !(decision.evidence_refs instanceof Array) || decision.evidence_refs.length === 0)) {
    throw new Error("bus-lane treatment decision lacks treatment evidence");
  }
  if (new Set(remediationRows.map((row) => row.relation_id)).size !== remediationRows.length) {
    throw new Error("duplicate remediation relation identity");
  }
  if (
    evidenceReviewRows.length !== PRIOR_EVIDENCE_AUDIT.relation_count ||
    evidenceReviewRows.filter((row) => row.verdict === "exact_current_evidence").length !==
      PRIOR_EVIDENCE_AUDIT.exact_current_evidence_count ||
    evidenceReviewRows.filter((row) => row.verdict === "repaired_adjacent_cocitation").length !==
      PRIOR_EVIDENCE_AUDIT.adjacent_cocitation_required_count ||
    evidenceReviewRows.filter((row) => row.verdict === "reclassified_non_lane").length !==
      PRIOR_EVIDENCE_AUDIT.reclassified_non_lane_count
  ) {
    throw new Error("evidence review rows do not reconcile to the exhaustive 113-row audit");
  }
  if (remediationMatches.some((match) =>
    match.facility_evidence_refs.length === 0 || match.treatment_assertion_evidence_refs.length === 0)) {
    throw new Error("physical-scope remediation lacks exact facility or treatment-assertion evidence");
  }

  const report = `# Bus-lane treatment physical-scope dispositions v1\n\n`
    + `Contract: \`${BUS_LANE_SCOPE_CONTRACT_ID}\`  \n`
    + `Reviewed: ${REVIEWED_AT} by \`${REVIEWED_BY}\`\n\n`
    + `## Inventory and outcome\n\n`
    + `- Canonical bus-lane-family treatments: **${canonicalBusLaneCount}**\n`
    + `- Reviewed accepted pending additions: **${pendingAdditionCount}**\n`
    + `- Exclusive decisions: **${decisions.length}**\n`
    + `- Physical scope satisfied before coordinated materialization: **${canonicalPhysicalBefore}**\n`
    + `- Additional treatments satisfied by reviewed pending journals: **${acceptedPendingPhysical}**\n`
    + `- Evidence-backed scope relations submitted by this campaign: **${remediationRows.length}**\n`
    + `- Prior exact evidence sets retained: **${exactCurrentMatches.length}**\n`
    + `- Location-only evidence sets repaired by reviewed adjacent co-citation: **${repairedMatches.length}**\n`
    + `- Bus-stop-only treatment reclassified and omitted: **${reviewedReclassifiedTreatments.length}**\n`
    + `- Projected physical-scope-satisfied treatments: **${projectedSatisfied}**\n`
    + `- Non-satisfied, explicitly study-ineligible decisions: **${decisions.length - projectedSatisfied}**\n\n`
    + `### Exclusive disposition counts\n\n`
    + Object.entries(decisionCounts).sort(([left], [right]) => left.localeCompare(right)).map(([decision, count]) => `- \`${decision}\`: **${count}**`).join("\n")
    + `\n\n## Evidence and inference boundary\n\n`
    + `Each decision retains the canonical treatment evidence references. New physical-scope links require a shared authoritative source, hash-matching exact facility evidence, a same-page physical-lane assertion, an unambiguous treatment-facility identity, and one matching corridor. The versioned evidence-review ledger records the 91 already-exact rows, 21 reviewed co-citation repairs, and one non-lane reclassification. No route relationship, occurrence, phase, onset, or date claim is added. Street-name similarity, geometry, and proximity never create route bindings.\n\n`
    + `All non-satisfied decisions are \`study_eligible=false\`. A satisfied physical-scope decision only clears this one role; it does not make a treatment or occurrence study-eligible.\n\n`
    + `## Coordinated materialization boundary\n\n`
    + `The accepted remediation journal is intentionally unmaterialized in this lane. After the root campaign performs its one coordinated materialization, rerun the generator in apply mode to refresh the canonical-before counts and input hashes, then run check mode.\n\n`
    + `## Reproduce\n\n`
    + "```bash\n"
    + `bun scripts/audit-bus-lane-treatment-scope-v1.ts --apply\n`
    + `bun scripts/audit-bus-lane-treatment-scope-v1.ts --check\n`
    + `bun test packages/pipeline/test/records/bus-lane-treatment-scope-dispositions.test.ts\n`
    + "```\n";

  return { contract, decisions, reviewDecisions, remediationRows, evidenceReviewRows, submissions, summary, report };
}

function campaignContents(campaign: Campaign): Record<string, string> {
  const base: Record<string, string> = {
    [CONTRACT_PATH]: `${JSON.stringify(campaign.contract, null, 2)}\n`,
    [DECISIONS_PATH]: stableJsonl(campaign.decisions),
    [REVIEW_PATH]: stableJsonl(campaign.reviewDecisions),
    [REMEDIATIONS_PATH]: stableJsonl(campaign.remediationRows),
    [EVIDENCE_REVIEW_PATH]: stableJsonl(campaign.evidenceReviewRows),
    [SUMMARY_PATH]: `${JSON.stringify(campaign.summary, null, 2)}\n`,
    [REPORT_PATH]: campaign.report,
    [JOURNAL_PATH]: stableJsonl(campaign.submissions),
  };
  const artifacts = [
    CONTRACT_PATH,
    DECISIONS_PATH,
    REVIEW_PATH,
    REMEDIATIONS_PATH,
    EVIDENCE_REVIEW_PATH,
    SUMMARY_PATH,
    REPORT_PATH,
  ].map((path) => ({
    path: relative(OUTPUT_DIR, path),
    sha256: sha256(base[path]!),
    bytes: Buffer.byteLength(base[path]!),
  }));
  base[MANIFEST_PATH] = `${JSON.stringify({
    schema_version: 1,
    contract_id: BUS_LANE_SCOPE_CONTRACT_ID,
    generated_at: REVIEWED_AT,
    artifacts,
    remediation_journal: {
      path: relative(repoRoot, JOURNAL_PATH),
      sha256: sha256(base[JOURNAL_PATH]!),
      bytes: Buffer.byteLength(base[JOURNAL_PATH]!),
    },
  }, null, 2)}\n`;
  return base;
}

function applyCampaign(campaign: Campaign): void {
  for (const [path, content] of Object.entries(campaignContents(campaign))) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) writeFileSync(path, content, "utf8");
  }
}

function checkCampaign(campaign: Campaign): void {
  for (const [path, expected] of Object.entries(campaignContents(campaign))) {
    if (!existsSync(path)) throw new Error(`missing generated artifact ${relative(repoRoot, path)}; run --apply`);
    const actual = readFileSync(path, "utf8");
    if (actual !== expected) throw new Error(`generated artifact differs: ${relative(repoRoot, path)}; run --apply`);
  }
}

export function buildBusLaneTreatmentScopeCampaign(): Campaign {
  return buildCampaign();
}

if (import.meta.main) {
  const campaign = buildCampaign();
  const apply = process.argv.includes("--apply");
  if (apply) applyCampaign(campaign);
  else checkCampaign(campaign);
  process.stdout.write(`${stableJson({
    mode: apply ? "apply" : "check",
    decisions: campaign.decisions.length,
    remediations: campaign.remediationRows.length,
    evidence_review_rows: campaign.evidenceReviewRows.length,
    repaired_adjacent_cocitations: campaign.summary.repaired_adjacent_cocitation_relation_count,
    reclassified_non_lane: campaign.summary.reclassified_non_lane_treatment_count,
    journal_sha256: campaign.summary.remediation_journal_sha256,
    exclusive_decision_counts: campaign.summary.exclusive_decision_counts,
  })}\n`);
}
