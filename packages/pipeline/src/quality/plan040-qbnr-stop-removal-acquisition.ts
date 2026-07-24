import { createHash } from "node:crypto";
import type { JsonValue } from "@mta-wiki/db/types";
import { stableJson } from "@mta-wiki/db/stable-json";
import { extentDecisionKey } from "./study-readiness-v1.js";

export const PLAN040_QBNR_STOP_REMOVAL_ACQUISITION_CONTRACT =
  "plan-040-qbnr-stop-removal-acquisition-v1" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE =
  "plan-040-qbnr-generic-stop-removal-risk-v1" as const;

const SOURCE_ID = "mta_queens_bus_network_redesign_service_changes";
const SOURCE_URL = "https://www.mta.info/project/queens-bus-network-redesign/service-changes";
const TARGET_RAW_TEXT = new Set([
  "Some stops have been removed.",
  "Some stops have been removed from this route.",
]);
const DATE_MAP = new Map([
  ["June 29, 2025", { implementation_date: "2025-06-29", implementation_phase: "phase_1" }],
  ["June 30, 2025", { implementation_date: "2025-06-30", implementation_phase: "phase_1" }],
  ["August 31, 2025", { implementation_date: "2025-08-31", implementation_phase: "phase_2" }],
  ["September 2, 2025", { implementation_date: "2025-09-02", implementation_phase: "phase_2" }],
] as const);

type JsonObject = Record<string, unknown>;

export type Plan040AcquisitionCandidate = {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  gtfs_route_id: string;
  implementation_date: string;
  implementation_phase: "phase_1" | "phase_2";
  required_feed_family: "queens" | "busco";
  service_change_evidence_id: string;
  service_change_block_sha256: string;
  official_stop_list_url: string;
  captured_stop_statement: string;
  exact_bindings: {
    route_table_row: string;
    stop_list_anchor_text: "View the full list of stops.";
    treatment_record_id: string;
  };
  requires_candidate_specific_stop_id_equivalence: true;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

export type Plan040InventoryRequirement =
  | {
    implementation_phase: "phase_1";
    feed_family: "queens" | "busco";
    candidate_count: number;
    pre_source_id: string;
    post_source_id: string;
    acquisition_status: "accepted_reused";
  }
  | {
    implementation_phase: "phase_2";
    feed_family: "busco";
    candidate_count: 12;
    pre_role: "authoritative_busco_full_stop_inventory_immediately_before_2025-08-31";
    post_role: "authoritative_busco_full_stop_inventory_effective_2025-08-31";
    acquisition_status: "required_not_yet_accepted";
  };

export type Plan040QbnrStopRemovalAcquisitionManifest = {
  schema_version: 1;
  contract_id: typeof PLAN040_QBNR_STOP_REMOVAL_ACQUISITION_CONTRACT;
  package_id: typeof PLAN040_QBNR_STOP_REMOVAL_PACKAGE;
  source_capture: {
    source_id: typeof SOURCE_ID;
    source_url: typeof SOURCE_URL;
    source_html_sha256: string;
  };
  derivation_inputs: {
    member_extent_ledger_sha256: string;
    treatment_registry_sha256: string;
    route_treatment_scopes_sha256: string;
    source_blocks_registry_sha256: string;
  };
  candidate_count: 37;
  key_count: 37;
  candidate_key_sha256: string;
  raw_text_distribution: {
    "Some stops have been removed.": number;
    "Some stops have been removed from this route.": number;
  };
  phase_feed_distribution: {
    phase_1: { busco: number; queens: number };
    phase_2: { busco: number; queens: number };
  };
  inventory_requirements: Plan040InventoryRequirement[];
  candidates: Plan040AcquisitionCandidate[];
  decision_count: 0;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

function object(value: unknown, path: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  return value as JsonObject;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path}: expected non-empty string`);
  }
  return value.trim();
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonl(value: string, path: string): JsonObject[] {
  return value.split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    return [object(JSON.parse(line) as unknown, `${path}:${index + 1}`)];
  });
}

function drupalRows(sourceHtml: string): Map<string, JsonObject> {
  const match = sourceHtml.match(
    /<script\b[^>]*data-drupal-selector=["']drupal-settings-json["'][^>]*>([\s\S]*?)<\/script>/iu,
  );
  if (!match?.[1]) throw new Error("source HTML lacks the Drupal settings JSON");
  const settings = object(JSON.parse(match[1]) as unknown, "drupal settings");
  const tables = object(settings.mtaDatatable, "drupal settings.mtaDatatable");
  const output = new Map<string, JsonObject>();
  for (const [tableId, tableValue] of Object.entries(tables)) {
    const table = object(tableValue, `mtaDatatable.${tableId}`);
    const csvData = object(table.csvData, `mtaDatatable.${tableId}.csvData`);
    if (!Array.isArray(csvData.data)) throw new Error(`mtaDatatable.${tableId}.csvData.data: expected array`);
    for (const [index, rowValue] of csvData.data.entries()) {
      const row = object(rowValue, `mtaDatatable.${tableId}.csvData.data[${index}]`);
      const route = object(row.Route, `route row ${index}.Route`);
      const routeId = string(route.value, `route row ${index}.Route.value`).toUpperCase();
      if (output.has(routeId)) throw new Error(`duplicate Drupal route row ${routeId}`);
      output.set(routeId, row);
    }
  }
  return output;
}

function cellValues(row: JsonObject): string[] {
  return Object.entries(row)
    .filter(([key]) => key !== "Route")
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .flatMap(([, value], index) => {
      const raw = object(value, `cell ${index}`).value;
      return typeof raw === "string" && raw.trim().length > 0 ? [raw.trim()] : [];
    });
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&#039;/gu, "'")
    .replace(/&quot;/gu, "\"")
    .replace(/\s+/gu, " ")
    .trim();
}

function exactStopListUrl(routeId: string, cells: readonly string[]): string {
  const matches = cells.flatMap((cell) => [...cell.matchAll(
    /<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>\s*View the full list of stops\.\s*<\/a>/giu,
  )].map((match) => match[1]!));
  if (matches.length !== 1) {
    throw new Error(`${routeId}: expected exactly one official full-stop-list URL, received ${matches.length}`);
  }
  const url = matches[0]!.replace(/^http:\/\/mta\.info\//u, "https://www.mta.info/");
  if (!/^https:\/\/(?:www\.)?mta\.info\/document\/\d+$/u.test(url)) {
    throw new Error(`${routeId}: stop-list URL is not an exact first-party MTA document URL`);
  }
  return url;
}

function implementation(routeId: string, cells: readonly string[]) {
  const text = cells.map(plainText).join(" | ");
  const matches = [...DATE_MAP.keys()].filter((date) => text.includes(date));
  if (matches.length !== 1) {
    throw new Error(`${routeId}: expected one supported implementation date, received ${matches.length}`);
  }
  return DATE_MAP.get(matches[0]!)!;
}

function sourceBlockId(evidenceId: string): string {
  const prefix = `${SOURCE_ID}#`;
  if (!evidenceId.startsWith(prefix)) throw new Error(`${evidenceId}: wrong source evidence`);
  return evidenceId.slice(prefix.length);
}

function feedFamily(scope: JsonObject, treatmentId: string): "queens" | "busco" {
  const identity = object(scope.route_identity, `${treatmentId}.route_identity`);
  const dataset = string(identity.dataset_id, `${treatmentId}.route_identity.dataset_id`);
  if (dataset === "mta-nyct-bus") return "queens";
  if (dataset === "mta-bus-company") return "busco";
  throw new Error(`${treatmentId}: unsupported route dataset ${dataset}`);
}

export function buildPlan040QbnrStopRemovalAcquisitionManifest(input: {
  ledgerJsonl: string;
  treatmentJsonl: string;
  routeTreatmentScopesJsonl: string;
  sourceBlocksJsonl: string;
  sourceHtml: string;
  sourceMetadata: unknown;
}): Plan040QbnrStopRemovalAcquisitionManifest {
  const ledger = jsonl(input.ledgerJsonl, "member extent ledger");
  const treatments = new Map(
    jsonl(input.treatmentJsonl, "treatments").map((record) => [
      string(record.record_id, "treatment.record_id"),
      record,
    ]),
  );
  const scopes = new Map(
    jsonl(input.routeTreatmentScopesJsonl, "route treatment scopes").map((record) => [
      string(record.treatment_record_id, "scope.treatment_record_id"),
      record,
    ]),
  );
  const blocks = new Map(
    jsonl(input.sourceBlocksJsonl, "source blocks").map((record) => [
      string(record.block_id, "block.block_id"),
      record,
    ]),
  );
  const metadata = object(input.sourceMetadata, "source metadata");
  if (metadata.sourceId !== SOURCE_ID || metadata.sourceUrl !== SOURCE_URL) {
    throw new Error("source metadata does not identify the frozen QBNR service-change page");
  }
  const expectedSourceHash = string(metadata.sha256, "source metadata.sha256").replace(/^sha256:/u, "");
  const actualSourceHash = sha256(input.sourceHtml);
  if (actualSourceHash !== expectedSourceHash) throw new Error("source HTML hash does not match metadata");
  const rows = drupalRows(input.sourceHtml);

  const candidates = ledger.flatMap((ledgerRow): Plan040AcquisitionCandidate[] => {
    if (ledgerRow.verdict !== "unreviewed") return [];
    const treatmentId = string(ledgerRow.treatment_record_id, "ledger.treatment_record_id");
    const treatment = treatments.get(treatmentId);
    if (!treatment || treatment.source_id !== SOURCE_ID || !TARGET_RAW_TEXT.has(treatment.raw_text as string)) {
      return [];
    }
    const routeId = string(ledgerRow.gtfs_route_id, `${treatmentId}.gtfs_route_id`).toUpperCase();
    const row = rows.get(routeId);
    if (!row) throw new Error(`${routeId}: missing Drupal route row`);
    const cells = cellValues(row);
    const treatmentRawText = string(treatment.raw_text, `${treatmentId}.raw_text`);
    if (!cells.map(plainText).some((cell) => cell.includes(treatmentRawText))) {
      throw new Error(`${treatmentId}: captured route row does not contain the exact treatment statement`);
    }
    if (!Array.isArray(treatment.evidence_refs) || treatment.evidence_refs.length !== 1) {
      throw new Error(`${treatmentId}: expected one exact service-change evidence binding`);
    }
    const evidence = object(treatment.evidence_refs[0], `${treatmentId}.evidence_refs[0]`);
    const evidenceId = string(evidence.evidence_id, `${treatmentId}.evidence_id`);
    const block = blocks.get(sourceBlockId(evidenceId));
    if (!block) throw new Error(`${treatmentId}: evidence block is absent`);
    const blockText = string(block.raw_text, `${treatmentId}.block.raw_text`);
    if (!blockText.includes(routeId) || !blockText.includes(treatmentRawText)) {
      throw new Error(`${treatmentId}: evidence block does not bind the route and treatment statement`);
    }
    const scope = scopes.get(treatmentId);
    if (!scope) throw new Error(`${treatmentId}: exact route-treatment scope is absent`);
    const exactKey = {
      occurrence_id: string(ledgerRow.occurrence_id, `${treatmentId}.occurrence_id`),
      route_record_id: string(ledgerRow.route_record_id, `${treatmentId}.route_record_id`),
      treatment_record_id: treatmentId,
    };
    const timing = implementation(routeId, cells);
    return [{
      ...exactKey,
      gtfs_route_id: routeId,
      ...timing,
      required_feed_family: feedFamily(scope, treatmentId),
      service_change_evidence_id: evidenceId,
      service_change_block_sha256: string(block.raw_text_sha256, `${treatmentId}.block.raw_text_sha256`)
        .replace(/^sha256:/u, ""),
      official_stop_list_url: exactStopListUrl(routeId, cells),
      captured_stop_statement: treatmentRawText,
      exact_bindings: {
        route_table_row: routeId,
        stop_list_anchor_text: "View the full list of stops.",
        treatment_record_id: treatmentId,
      },
      requires_candidate_specific_stop_id_equivalence: true,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    }];
  }).sort((left, right) => extentDecisionKey(left)
    .localeCompare(extentDecisionKey(right)));

  const keys = candidates.map((candidate) => extentDecisionKey(candidate));
  if (candidates.length !== 37 || new Set(keys).size !== 37) {
    throw new Error(`expected exact 37-key package, received candidates=${candidates.length}, keys=${new Set(keys).size}`);
  }
  if (new Set(candidates.map((candidate) => candidate.gtfs_route_id)).size !== 37) {
    throw new Error("expected one exact candidate per route");
  }

  const count = (phase: "phase_1" | "phase_2", feed: "queens" | "busco") =>
    candidates.filter((candidate) =>
      candidate.implementation_phase === phase && candidate.required_feed_family === feed).length;
  const rawCount = (raw: string) =>
    candidates.filter((candidate) => candidate.captured_stop_statement === raw).length;
  const phaseFeedDistribution = {
    phase_1: { busco: count("phase_1", "busco"), queens: count("phase_1", "queens") },
    phase_2: { busco: count("phase_2", "busco"), queens: count("phase_2", "queens") },
  };
  const inventoryRequirements: Plan040InventoryRequirement[] = [];
  if (phaseFeedDistribution.phase_1.busco > 0) {
    inventoryRequirements.push({
      implementation_phase: "phase_1",
      feed_family: "busco",
      candidate_count: phaseFeedDistribution.phase_1.busco,
      pre_source_id: "gtfs_static_20250625_busco_pre_qbnr",
      post_source_id: "gtfs_static_20250626_busco_post_qbnr",
      acquisition_status: "accepted_reused",
    });
  }
  if (phaseFeedDistribution.phase_1.queens > 0) {
    inventoryRequirements.push({
      implementation_phase: "phase_1",
      feed_family: "queens",
      candidate_count: phaseFeedDistribution.phase_1.queens,
      pre_source_id: "gtfs_static_20250615_queens_pre_qbnr",
      post_source_id: "gtfs_static_20250626_queens_post_qbnr",
      acquisition_status: "accepted_reused",
    });
  }
  if (phaseFeedDistribution.phase_2.busco > 0) {
    if (phaseFeedDistribution.phase_2.busco !== 12) {
      throw new Error("phase-2 BusCo inventory requirement drifted from the frozen 12-candidate cell");
    }
    inventoryRequirements.push({
      implementation_phase: "phase_2",
      feed_family: "busco",
      candidate_count: 12,
      pre_role: "authoritative_busco_full_stop_inventory_immediately_before_2025-08-31",
      post_role: "authoritative_busco_full_stop_inventory_effective_2025-08-31",
      acquisition_status: "required_not_yet_accepted",
    });
  }
  if (phaseFeedDistribution.phase_2.queens > 0) {
    throw new Error("phase-2 Queens candidates require a separately specified inventory acquisition");
  }
  const manifest: Plan040QbnrStopRemovalAcquisitionManifest = {
    schema_version: 1,
    contract_id: PLAN040_QBNR_STOP_REMOVAL_ACQUISITION_CONTRACT,
    package_id: PLAN040_QBNR_STOP_REMOVAL_PACKAGE,
    source_capture: {
      source_id: SOURCE_ID,
      source_url: SOURCE_URL,
      source_html_sha256: actualSourceHash,
    },
    derivation_inputs: {
      member_extent_ledger_sha256: sha256(input.ledgerJsonl),
      treatment_registry_sha256: sha256(input.treatmentJsonl),
      route_treatment_scopes_sha256: sha256(input.routeTreatmentScopesJsonl),
      source_blocks_registry_sha256: sha256(input.sourceBlocksJsonl),
    },
    candidate_count: 37,
    key_count: 37,
    candidate_key_sha256: sha256(`${keys.join("\n")}\n`),
    raw_text_distribution: {
      "Some stops have been removed.": rawCount("Some stops have been removed."),
      "Some stops have been removed from this route.":
        rawCount("Some stops have been removed from this route."),
    },
    phase_feed_distribution: phaseFeedDistribution,
    inventory_requirements: inventoryRequirements,
    candidates,
    decision_count: 0,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  JSON.parse(stableJson(manifest as unknown as JsonValue));
  return manifest;
}

export function plan040QbnrAcquisitionReplayHash(
  manifest: Plan040QbnrStopRemovalAcquisitionManifest,
): string {
  return sha256(`${stableJson(manifest as unknown as JsonValue)}\n`);
}
