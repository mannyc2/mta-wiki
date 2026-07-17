import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { stableJson } from "../../../../../packages/db/src/stable-json.ts";
import type { JsonValue, MtaCanonicalRecord } from "../../../../../packages/db/src/types.ts";
import {
  computeRouteAnchors,
  readGtfsRoutesFromDb,
  routeAnchorsJsonl,
  type ReviewedNonGtfsRouteDispositionKind,
  type ReviewedNonGtfsRouteDispositions,
  type RouteAnchorOverrides,
} from "../../../../../packages/pipeline/src/materialize/route-anchors.ts";

const root = process.cwd();
const reviewedAt = "2026-07-15";
const decisionRoot = "data/relationship-integrity/dispositions/v1/routes/review.json";
const reviewPath = join(root, decisionRoot);
const qualityRoot = join(root, "data/quality/relationship-integrity/route-identity");
const canonicalRoutesPath = join(root, "data/canonical/routes.jsonl");
const legacyAnchorPath = join(root, "data/exports/releases/v1-rc20/route_anchors.jsonl");
const gtfsRoutesPath = join(root, "data/reference/gtfs/routes.txt");

const EXPECTED_INPUT_SHA256 = {
  canonical_routes: "8ea0278c7acae7585cbe0c85e3fa9407d8ca49b1ca12327b60318b676122a5c0",
  legacy_route_anchors: "517b8f74a89e70ec4791d0bf327da6224bb9a6b2ea44eaf8162d704721659239",
  gtfs_routes: "7b04d611eee9ad689eda88556e6934fe36c699342cf489c61dcdfef2c2670097",
} as const;

function sha256Bytes(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonl(path: string, rows: unknown[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((row) => stableJson(row as JsonValue)).join("\n") + (rows.length > 0 ? "\n" : ""), "utf8");
}

for (const [name, expected] of Object.entries(EXPECTED_INPUT_SHA256)) {
  const path = name === "canonical_routes" ? canonicalRoutesPath : name === "legacy_route_anchors" ? legacyAnchorPath : gtfsRoutesPath;
  const actual = sha256File(path);
  if (actual !== expected) throw new Error(`route-disposition-v1 input drift for ${name}: expected ${expected}, found ${actual}`);
}

const records = readJsonl<MtaCanonicalRecord>(canonicalRoutesPath).sort((a, b) => a.record_id.localeCompare(b.record_id));
const recordsById = new Map(records.map((record) => [record.record_id, record]));
const legacyRows = readJsonl<{
  canonical_route_record_id: string | null;
  variant_record_ids: string[];
}>(legacyAnchorPath);
const legacyCovered = new Set(
  legacyRows.flatMap((row) => [row.canonical_route_record_id, ...row.variant_record_ids]).filter((id): id is string => Boolean(id)),
);
const omitted = records.filter((record) => !legacyCovered.has(record.record_id));
if (records.length !== 395 || omitted.length !== 109) {
  throw new Error(`route-disposition-v1 baseline drift: expected 395 routes/109 absent from rc20, found ${records.length}/${omitted.length}`);
}

const sbsSuccessorBindings: Record<string, string> = {
  "route_125th-laguardia-sbs": "M60+",
  "route_23rd-st-sbs": "M23+",
  "route_m23-local-cb4-apr2016": "M23+",
  "route_m34-local-2011": "M34+",
  "route_m34-sbs": "M34+",
  "route_m34a-sbs": "M34A+",
  "route_m79-local-cb8-oct2016": "M79+",
  "route_m79-sbs": "M79+",
  "route_m86-local": "M86+",
  "route_q44-cb12-2011": "Q44+",
  "route_q52-ltd-woodhaven-2014": "Q52+",
  "route_q53-ltd-woodhaven-2014": "Q53+",
  "route_s79-hylan-2010": "S79+",
};

const reviewedVariantBindings: Record<string, string> = {
  "route_bx6-local": "BX6",
};

const postRc20ExactGtfsBindings = [
  "route_b54",
  "route_bx15-ace",
  "route_bx29",
  "route_bx4",
  "route_s57",
  "route_sim1",
  "route_sim15",
  "route_sim2",
  "route_sim32",
  "route_sim33c",
  "route_sim34",
  "route_sim35",
  "route_sim3c",
  "route_sim5",
  "route_sim7",
  "route_sim9",
] as const;

const aggregateLabels = [
  "route_15-express-bus-battery-pl",
  "route_bx18a-b",
  "route_bx40-bx42-tremont-cb5-2024",
  "route_express-routes-madison-ave-may2025",
  "route_m14-ad-sbs",
  "route_q52-q53-sbs-proposed-2015-05",
  "route_si-express-bus-routes",
  "route_x28-x38-bay-pkwy",
] as const;

const proposals = [
  "route_b103-ltd-proposed-draft",
  "route_b110-brooklyn",
  "route_bx55-lga-2012",
  "route_hylan-richmond-av-sbs-proposed",
  "route_proposed-bronx-sbs-lga-2012",
  "route_proposed-queens-sbs-lga-2012",
  "route_q105-lga-2012",
  "route_q53-lga-2012",
  "route_q73-proposed-queens-redesign",
  "route_q78-queens",
  "route_sbs-to-laguardia-2012",
] as const;

const externalBusServices = [
  "route_bee-line-60",
  "route_bee-line-61-fordham-rd-workshop",
  "route_bee-line-62",
] as const;

const temporaryServices = ["route_b98v-meeting-doc-33236", "route_q98v-meeting-doc-33236"] as const;

const historicalServiceIdentities = [
  "route_b103e-express-cb18-jun2017",
  "route_b82e-express-cb18-jun2017",
  "route_qm1a-201110-qbb",
  "route_qm2a-201110-qbb",
  "route_x51-201110-qbb",
  "route_x63-201110-qbb",
  "route_x64-201110-qbb",
  "route_x68-201110-qbb",
] as const;

const nonBusServices = [
  "route_5-subway-flatbush",
  "route_b-subway-nyct-2025",
  "route_c-subway-nyct-2025",
  "route_e-nyct-2025",
  "route_f-nyct-2025",
  "route_irt-flushing-line-7-208006",
  "route_lirr-atlantic-branch-2023",
  "route_lirr-babylon-branch-2023",
  "route_lirr-far-rockaway-branch-2023",
  "route_lirr-hempstead-branch-2023",
  "route_lirr-huntington-branch-2023",
  "route_lirr-long-beach-branch-2023",
  "route_lirr-montauk-branch-2023",
  "route_lirr-port-jefferson-branch-2023",
  "route_lirr-port-washington-branch-2023",
  "route_lirr-ronkonkoma-branch-2023",
  "route_lirr-west-hempstead-branch-2023",
  "route_m-nyct-2025",
  "route_m186726-danbury-branch",
  "route_m186726-new-canaan-branch",
  "route_m186726-wassaic-branch",
  "route_m186726-waterbury-branch",
  "route_meeting-doc-106021-harlem-line",
  "route_meeting-doc-106021-hudson-line",
  "route_meeting-doc-106021-new-haven-line",
  "route_meeting-doc-115256-g-subway",
  "route_meeting-doc-115256-j-subway",
  "route_meeting-doc-135451-a-line",
  "route_meeting-doc-152171-42-st-shuttle",
  "route_meeting-doc-152171-l-subway",
  "route_meeting-doc-160136-newburgh-beacon-ferry",
  "route_meeting-doc-160271-s-shuttle",
  "route_meeting-doc-160311-haverstraw-ossining-ferry",
  "route_meeting-doc-164866-greenport-branch",
  "route_meeting-doc-196866-2-line",
  "route_meeting-doc-196866-3-line",
  "route_meeting-doc-196866-4-line",
  "route_meeting-doc-42866-n-subway",
  "route_meeting-doc-42866-w-subway",
  "route_pascack-valley-line-2023-ridership",
  "route_penn-station-access-line-160111",
  "route_port-jervis-line-2023-ridership",
  "route_q-subway-nyct-2025",
  "route_r-nyct-2025",
] as const;

const specialEvidence: Record<string, string> = {
  "route_b103-ltd-proposed-draft": "brooklyn_bus_network_draft_plan_without_route_profiles#p041_c0003",
  "route_b98v-meeting-doc-33236": "meeting_doc_33236#p041_c0003",
  "route_bx55-2012": "2012_11_sbs_webster_cac4_summary#p001_c0008",
  "route_m16-mentioned": "201110_brt_34th_open_house_slides#p028_c0002",
  "route_hylan-richmond-av-sbs-proposed": "201106_hylan_slides#p022_c0007",
  "route_q15a-historical-2025": "mta_queens_bus_network_redesign_service_changes#p001_b0018",
  "route_q20-2014-10-07-flushing-jamaica": "mta_queens_bus_network_redesign_service_changes#p001_b0024",
  "route_q20b-cb12-2011": "mta_queens_bus_network_redesign_service_changes#p001_b0025",
  "route_q21-local-woodhaven-2014": "mta_queens_bus_network_redesign_service_changes#p001_b0026",
  "route_q34-queens": "mta_queens_bus_network_redesign_service_changes#p001_b0039",
  "route_q48-serves-lga-2011": "mta_queens_bus_network_redesign_service_changes#p001_b0053",
  "route_q98v-meeting-doc-33236": "meeting_doc_33236#p041_c0003",
  "route_qm3-201110-qbb": "mta_queens_bus_network_redesign_service_changes#p001_b0104",
};

function record(recordId: string): MtaCanonicalRecord {
  const value = recordsById.get(recordId);
  if (!value) throw new Error(`route-disposition-v1 references missing record ${recordId}`);
  return value;
}

function evidenceId(recordId: string): string {
  const value = record(recordId);
  const chosen = specialEvidence[recordId] ?? value.evidence_refs[0]?.evidence_id;
  if (!chosen || !value.evidence_refs.some((ref) => ref.evidence_id === chosen)) {
    throw new Error(`route-disposition-v1 has no bound evidence for ${recordId}: ${chosen ?? "<missing>"}`);
  }
  return chosen;
}

function routeId(recordId: string): string | null {
  const value = record(recordId).payload.route_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type DispositionSpec = {
  disposition: ReviewedNonGtfsRouteDispositionKind;
  reason: string;
  reviewedAt?: string;
};

const dispositionSpecs = new Map<string, DispositionSpec>();
function addDisposition(
  recordId: string,
  disposition: ReviewedNonGtfsRouteDispositionKind,
  reason: string,
  dispositionReviewedAt?: string,
): void {
  if (dispositionSpecs.has(recordId)) throw new Error(`duplicate route-disposition-v1 classification for ${recordId}`);
  dispositionSpecs.set(recordId, {
    disposition,
    reason,
    ...(dispositionReviewedAt ? { reviewedAt: dispositionReviewedAt } : {}),
  });
}

const legacyDispositionSpecs: Record<string, DispositionSpec> = {
  "route_34th-st-sbs": {
    disposition: "sbs_corridor_service_label",
    reason: "Official route-index evidence names a 34th Street SBS corridor/service label but supplies no single GTFS route id; the label must not compete with M34+ or M34A+.",
  },
  "route_b3-draft-plan": {
    disposition: "proposal",
    reason: "The official Brooklyn draft-plan evidence describes a proposed B3 planning record rather than an adopted current operating-route identity.",
  },
  "route_fordham-pelham-pkwy-sbs": {
    disposition: "sbs_corridor_service_label",
    reason: "Official route-index evidence names a Fordham/Pelham Parkway SBS corridor/service label without a single GTFS route id.",
  },
  "route_hudson-rail-link": {
    disposition: "external_bus_service",
    reason: "Source evidence identifies the Hudson Rail Link as a Metro-North feeder service outside the pinned MTA NYCT/MTABC bus GTFS route universe.",
  },
  "route_hylan-blvd-sbs": {
    disposition: "sbs_corridor_service_label",
    reason: "Official route-index evidence names a Hylan Boulevard SBS corridor/service label without a single GTFS route id.",
  },
  "route_lirr-oyster-bay-branch-2023": {
    disposition: "non_bus_service",
    reason: "Official evidence identifies an LIRR rail branch, outside the MTA bus GTFS route class.",
  },
  "route_meeting-doc-160311-newburgh-beacon-ferry": {
    disposition: "non_bus_service",
    reason: "Official evidence identifies a commuter-ferry service, outside the MTA bus GTFS route class.",
  },
  "route_q15a-historical-2025": {
    disposition: "historical_retired",
    reason: "Official Queens redesign evidence states that Q15A service ended June 29, 2025; this historical identity must not compete for a current anchor.",
  },
  "route_q20-2014-10-07-flushing-jamaica": {
    disposition: "historical_retired",
    reason: "Official Queens redesign evidence states that Q20A service ended June 29, 2025 and was replaced by the distinct current Q20 identity.",
  },
  "route_q20b-cb12-2011": {
    disposition: "historical_retired",
    reason: "Official Queens redesign evidence states that Q20B service ended June 27, 2025.",
  },
  "route_q21-local-woodhaven-2014": {
    disposition: "historical_retired",
    reason: "Official Queens redesign evidence states that Q21 service ended August 31, 2025.",
  },
  "route_q34-queens": {
    disposition: "historical_retired",
    reason: "Official Queens redesign evidence states that Q34 service ended June 27, 2025.",
  },
  "route_q48-serves-lga-2011": {
    disposition: "historical_retired",
    reason: "Official Queens redesign evidence distinguishes the discontinued historical LaGuardia Q48 from the current Glen Oaks Q48 number reuse.",
  },
  "route_qm3-201110-qbb": {
    disposition: "historical_retired",
    reason: "Official Queens redesign evidence states that QM3 service ended June 27, 2025.",
  },
  "route_rockaway-shuttle-167241": {
    disposition: "non_bus_service",
    reason: "Official evidence identifies a subway shuttle, outside the MTA bus GTFS route class.",
  },
  "route_sim23-sim24-express-bus": {
    disposition: "aggregate_label",
    reason: "Source evidence uses a combined SIM23/SIM24 route-list label rather than one physical operating-route identity.",
  },
  "route_woodhaven-crossbay-sbs": {
    disposition: "sbs_corridor_service_label",
    reason: "Official route-index evidence names a Woodhaven/Cross Bay SBS corridor/service label without a single GTFS route id.",
  },
};

for (const [recordId, spec] of Object.entries(legacyDispositionSpecs)) addDisposition(recordId, spec.disposition, spec.reason);
for (const recordId of aggregateLabels) {
  addDisposition(recordId, "aggregate_label", `Source evidence uses ${JSON.stringify(routeId(recordId))} as an aggregate label spanning multiple services; it cannot identify one current GTFS route.`);
}
for (const recordId of proposals) {
  addDisposition(recordId, "proposal", `Source evidence describes ${record(recordId).display_name} as a proposal, draft-plan row, or participant-suggested concept rather than an adopted current MTA bus route.`);
}
for (const recordId of externalBusServices) {
  addDisposition(recordId, "external_bus_service", `Source evidence identifies ${record(recordId).display_name} as Bee-Line service outside the pinned MTA NYCT/MTABC bus GTFS route universe.`);
}
for (const recordId of temporaryServices) {
  addDisposition(recordId, "temporary_service", `Official 2021 evidence identifies ${record(recordId).display_name} as a temporary vaccination-shuttle pilot; it is not a current study-projectable route identity.`);
}
for (const recordId of historicalServiceIdentities) {
  addDisposition(recordId, "historical_service_identity", `Dated official evidence establishes ${record(recordId).display_name} as a service identity at source time, but the pinned 2026-03-19 MTA bus GTFS has no exact id and repository evidence does not prove a current canonical alias.`);
}
addDisposition(
  "route_bx55-2012",
  "historical_retired",
  "Official Webster Avenue SBS evidence states that Bx55 Limited would be renamed Bx15 Limited; the Bx55 predecessor identity must not compete for a current GTFS anchor.",
);
addDisposition(
  "route_m14-brt-phase2",
  "corridor_service_label",
  "The source uses generic M14 as a pre-SBS 14th Street corridor/service label; current GTFS has distinct M14A+ and M14D+ branches, so the generic record cannot bind to one route.",
);
addDisposition(
  "route_m16-mentioned",
  "historical_retired",
  "Official NYC DOT evidence states that the SBS start date was November 13, 2011 and M16 would be renamed M34A SBS while service levels and the route remained the same; the M16 predecessor identity must not compete for a current GTFS anchor.",
  "2026-07-17",
);
for (const recordId of nonBusServices) {
  const type = record(recordId).payload.route_type_normalized ?? record(recordId).payload.route_type ?? "non-bus service";
  addDisposition(recordId, "non_bus_service", `Source evidence identifies ${record(recordId).display_name} as ${String(type)}, outside the MTA bus GTFS route class.`);
}

const startingPartition = [
  ...Object.keys(sbsSuccessorBindings),
  ...Object.keys(reviewedVariantBindings),
  ...postRc20ExactGtfsBindings,
  ...[...dispositionSpecs.keys()].filter((recordId) => omitted.some((record) => record.record_id === recordId)),
];
if (new Set(startingPartition).size !== 109 || omitted.some((record) => !startingPartition.includes(record.record_id))) {
  throw new Error("route-disposition-v1 starting 109-row partition is not exhaustive and exclusive");
}
if (dispositionSpecs.size !== 96) throw new Error(`route-disposition-v1 expected 96 dispositions, found ${dispositionSpecs.size}`);

const dispositions: ReviewedNonGtfsRouteDispositions = Object.fromEntries(
  [...dispositionSpecs.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([recordId, spec]) => [
    recordId,
    {
      decision_id: `route-disposition-v1:${recordId}`,
      evidence_ids: [evidenceId(recordId)],
      reviewed_at: spec.reviewedAt ?? reviewedAt,
      review_state: "approved" as const,
      disposition: spec.disposition,
      reason: spec.reason,
      expected_route_id: routeId(recordId),
      study_projectable: false as const,
    },
  ]),
);

const overrides: RouteAnchorOverrides = {
  BX6: {
    decision_id: "route-anchor-override-v1:BX6-local-variant",
    evidence_ids: [evidenceId("route_bx6-sbs"), evidenceId("route_bx6-local")],
    reviewed_at: reviewedAt,
    review_state: "approved",
    canonical_route_record_id: "route_bx6-sbs",
    additional_variant_record_ids: ["route_bx6-local"],
    expected_route_ids: { "route_bx6-local": "Bx6 Local", "route_bx6-sbs": "Bx6" },
    reason: "Official evidence identifies Bx6 Local and Bx6 SBS as service variants under the current BX6 GTFS route; retain the existing SBS anchor and add the local record as a reviewed variant.",
  },
  Q48: {
    decision_id: "route-anchor-override-v1:Q48-current-number-reuse",
    evidence_ids: [evidenceId("route_q48-glen-oaks-2025")],
    reviewed_at: reviewedAt,
    review_state: "approved",
    canonical_route_record_id: "route_q48-glen-oaks-2025",
    additional_variant_record_ids: [],
    expected_route_ids: { "route_q48-glen-oaks-2025": "Q48" },
    reason: "Official Queens redesign evidence proves that the current Q48 is the Glen Oaks service; the separately disposed LaGuardia record is historical number reuse.",
  },
};

const review = {
  _doc: "Immutable reviewed route-anchor decisions for the route-identity-dispositions-v1 migration. Every non-projectable disposition is evidence-linked and sets study_projectable=false. The pinned GTFS absence is classification context, never proof of a fabricated alias.",
  schema_version: 1,
  contract_id: "route-identity-dispositions-v1",
  gtfs_feed: {
    feed_date: "2026-03-19_mta_bus_all",
    route_count: 386,
    routes_sha256: EXPECTED_INPUT_SHA256.gtfs_routes,
  },
  sbs_plus_successor_rule: {
    rule_id: "unique-sbs-plus-successor-v1",
    description: "Only when a canonical route has no exact GTFS id/short-name match, bind its source-literal route_id to the sole current terminal-+ GTFS id that becomes identical after removing only +. Do not strip Local/LTD/E, split branch labels, punctuation, or arbitrary SBS text.",
  },
  overrides,
  non_gtfs_dispositions: dispositions,
};
writeJson(reviewPath, review);

const gtfsRoutes = readGtfsRoutesFromDb();
const rows = computeRouteAnchors(records, gtfsRoutes, overrides, dispositions);
const accounting = new Map<string, { accounting: "canonical_anchor" | "non_projectable_disposition" | "variant"; gtfs_route_id: string | null; disposition: string }>();
for (const row of rows) {
  if (row.canonical_route_record_id) {
    accounting.set(row.canonical_route_record_id, {
      accounting: row.gtfs_route_id ? "canonical_anchor" : "non_projectable_disposition",
      gtfs_route_id: row.gtfs_route_id,
      disposition: row.disposition,
    });
  }
  for (const recordId of row.variant_record_ids) {
    accounting.set(recordId, { accounting: "variant", gtfs_route_id: row.gtfs_route_id, disposition: row.disposition });
  }
}
if (accounting.size !== 395) throw new Error(`route-disposition-v1 after accounting expected 395 records, found ${accounting.size}`);

const beforeRows = omitted.map((value) => ({
  record_id: value.record_id,
  display_name: value.display_name,
  route_id: routeId(value.record_id),
  route_record_scope: typeof value.payload.route_record_scope === "string" ? value.payload.route_record_scope : null,
  route_type_normalized: typeof value.payload.route_type_normalized === "string" ? value.payload.route_type_normalized : null,
  evidence_ids: value.evidence_refs.map((ref) => ref.evidence_id).filter((id): id is string => Boolean(id)).sort(),
  exclusive_primary_disposition: "unaccounted_route_anchor_fallthrough",
}));

const investigationRows = omitted.map((value) => {
  const sbsTarget = sbsSuccessorBindings[value.record_id];
  if (sbsTarget) {
    return {
      record_id: value.record_id,
      exclusive_primary_disposition: "canonical_gtfs_binding_added",
      non_exclusive_reasons: ["legacy_base_id_to_unique_current_sbs_plus_successor"],
      binding_method: "unique-sbs-plus-successor-v1",
      gtfs_route_id: sbsTarget,
      evidence_ids: [evidenceId(value.record_id)],
      source_decision: `${decisionRoot}#sbs_plus_successor_rule`,
    };
  }
  const reviewedTarget = reviewedVariantBindings[value.record_id];
  if (reviewedTarget) {
    return {
      record_id: value.record_id,
      exclusive_primary_disposition: "canonical_gtfs_binding_added",
      non_exclusive_reasons: ["source_literal_requires_reviewed_variant_binding"],
      binding_method: "reviewed_override",
      gtfs_route_id: reviewedTarget,
      evidence_ids: [evidenceId(value.record_id)],
      source_decision: `${decisionRoot}#overrides.${reviewedTarget}`,
    };
  }
  if ((postRc20ExactGtfsBindings as readonly string[]).includes(value.record_id)) {
    const result = accounting.get(value.record_id);
    if (!result?.gtfs_route_id) throw new Error(`missing exact current GTFS accounting for ${value.record_id}`);
    return {
      record_id: value.record_id,
      exclusive_primary_disposition: "canonical_gtfs_binding_added",
      non_exclusive_reasons: ["post_rc20_canonical_route", "exact_current_gtfs_identity"],
      binding_method: "exact-route-id-v1",
      gtfs_route_id: result.gtfs_route_id,
      evidence_ids: [evidenceId(value.record_id)],
      source_decision: `${decisionRoot}#gtfs_feed`,
    };
  }
  const decision = dispositions[value.record_id];
  if (!decision) throw new Error(`missing generated disposition for ${value.record_id}`);
  return {
    record_id: value.record_id,
    exclusive_primary_disposition: "reviewed_non_projectable_disposition",
    non_exclusive_reasons: [decision.disposition, "not_in_pinned_current_mta_bus_gtfs"],
    binding_method: null,
    gtfs_route_id: null,
    evidence_ids: decision.evidence_ids,
    source_decision: `${decisionRoot}#non_gtfs_dispositions.${value.record_id}`,
  };
});

const afterRows = records.map((value) => {
  const result = accounting.get(value.record_id);
  if (!result) throw new Error(`missing after accounting for ${value.record_id}`);
  const disposition = dispositions[value.record_id];
  return {
    record_id: value.record_id,
    exclusive_primary_disposition: result.accounting,
    gtfs_route_id: result.gtfs_route_id,
    route_anchor_disposition: result.disposition,
    reviewed_non_projectable_disposition: disposition?.disposition ?? null,
    study_projectable: disposition ? false : null,
    source_decision: disposition ? `${decisionRoot}#non_gtfs_dispositions.${value.record_id}` : null,
  };
});

const countBy = (values: string[]) =>
  Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]),
  );
const mappedRows = rows.filter((row) => row.gtfs_route_id !== null && row.canonical_route_record_id !== null);
const summary = {
  schema_version: 1,
  contract_id: "route-identity-dispositions-v1",
  inputs: {
    canonical_route_count: records.length,
    gtfs_route_count: gtfsRoutes.length,
    legacy_route_anchor_row_count: legacyRows.length,
    canonical_routes_sha256: EXPECTED_INPUT_SHA256.canonical_routes,
    legacy_route_anchors_sha256: EXPECTED_INPUT_SHA256.legacy_route_anchors,
    gtfs_routes_sha256: EXPECTED_INPUT_SHA256.gtfs_routes,
  },
  before: { unaccounted_route_records: omitted.length },
  remediation: {
    unique_sbs_plus_successor_bindings: Object.keys(sbsSuccessorBindings).length,
    reviewed_variant_bindings: Object.keys(reviewedVariantBindings).length,
    post_rc20_exact_gtfs_bindings: postRc20ExactGtfsBindings.length,
    reviewed_non_projectable_dispositions:
      omitted.length -
      Object.keys(sbsSuccessorBindings).length -
      Object.keys(reviewedVariantBindings).length -
      postRc20ExactGtfsBindings.length,
    disposition_counts: countBy(omitted.map((value) => dispositions[value.record_id]?.disposition).filter((value): value is string => Boolean(value))),
  },
  after: {
    unaccounted_route_records: 0,
    canonical_route_records_accounted: accounting.size,
    gtfs_bound_route_records: [...accounting.values()].filter((value) => value.gtfs_route_id !== null).length,
    reviewed_non_projectable_route_records: Object.keys(dispositions).length,
    route_anchor_rows: rows.length,
    gtfs_rows_with_wiki_coverage: mappedRows.length,
    gtfs_rows_without_wiki_coverage: rows.filter((row) => row.gtfs_route_id !== null && row.canonical_route_record_id === null).length,
    variant_route_records: rows.reduce((count, row) => count + row.variant_record_ids.length, 0),
    all_disposition_counts: countBy(Object.values(dispositions).map((value) => value.disposition)),
  },
};

mkdirSync(qualityRoot, { recursive: true });
writeJsonl(join(qualityRoot, "before-unaccounted.jsonl"), beforeRows);
writeJsonl(join(qualityRoot, "investigations.jsonl"), investigationRows);
writeJsonl(join(qualityRoot, "after-accounting.jsonl"), afterRows);
writeJson(join(qualityRoot, "summary.json"), summary);

const report = `# Route identity exhaustiveness migration v1

This audit closes the silent route-anchor fall-through against the immutable v1-rc20 baseline without editing any existing release.

## Exact reconciliation

- Canonical route records: ${records.length}
- Records absent from the immutable rc20 route-anchor accounting: ${omitted.length} (90 legacy gaps plus 19 post-rc20 route records)
- Deterministic unique SBS \`+\` successor bindings: ${Object.keys(sbsSuccessorBindings).length} (11 legacy gaps plus 2 post-rc20 historical Limited records)
- Evidence-reviewed variant bindings: 1
- Exact current-GTFS bindings for post-rc20 route records: ${postRc20ExactGtfsBindings.length}
- Reviewed non-projectable dispositions added for the combined backlog: ${summary.remediation.reviewed_non_projectable_dispositions}
- Ending unaccounted records: 0
- Total evidence-linked non-projectable dispositions: ${Object.keys(dispositions).length}
- Resulting route-anchor rows for a future release: ${rows.length} (386 GTFS rows plus ${Object.keys(dispositions).length} disposition rows)
- Existing v1-rc20 \`route_anchors.jsonl\` remains byte-identical at ${EXPECTED_INPUT_SHA256.legacy_route_anchors}

The v1 successor rule removes only a terminal \`+\` from a sole current GTFS candidate, and only when the record has no exact GTFS id or short-name match. It never strips Local/LTD/E, splits an aggregate A/B label, or infers a route from arbitrary SBS text. All other non-exact identities require an evidence-linked reviewed override or a non-projectable disposition.

## Reproduction

\`\`\`bash
bun ${relative(root, import.meta.path)}
bun test packages/pipeline/test/materialize/route-anchors.test.ts --timeout 900000
bun run --cwd packages/pipeline typecheck
sha256sum data/exports/releases/v1-rc20/route_anchors.jsonl
cat data/exports/releases/LATEST
\`\`\`

The generator fails if canonical routes, the pinned GTFS routes, or the rc20 anchor baseline drift. It also fails unless all ${omitted.length} rc20-unaccounted current rows receive exactly one primary outcome and all ${records.length} canonical records appear exactly once in the computed future accounting.
`;
writeFileSync(join(qualityRoot, "report.md"), report, "utf8");

const generatedFiles = [
  "before-unaccounted.jsonl",
  "investigations.jsonl",
  "after-accounting.jsonl",
  "summary.json",
  "report.md",
];
const manifest = {
  schema_version: 1,
  contract_id: "route-identity-dispositions-v1",
  generator: relative(root, import.meta.path),
  review_artifact: {
    path: decisionRoot,
    bytes: readFileSync(reviewPath).byteLength,
    sha256: sha256File(reviewPath),
  },
  files: Object.fromEntries(
    generatedFiles.map((filename) => {
      const path = join(qualityRoot, filename);
      const bytes = readFileSync(path);
      return [filename, { bytes: bytes.byteLength, sha256: sha256Bytes(bytes) }];
    }),
  ),
  route_anchor_projection_sha256: sha256Bytes(routeAnchorsJsonl(rows)),
};
writeJson(join(qualityRoot, "manifest.json"), manifest);

console.log(JSON.stringify(summary, null, 2));
