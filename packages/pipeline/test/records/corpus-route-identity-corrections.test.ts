import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { identityPairKey, readIdentityDoNotMergeOverrides } from "@mta-wiki/db/identity";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  derivedRelationCoverage,
  withDerivedRelations,
} from "@mta-wiki/pipeline/records/derived-relations";
import {
  readSemanticCorrections,
  withSemanticCorrections,
  type SemanticCorrectionEntry,
} from "@mta-wiki/pipeline/records/semantic-corrections";

type SourceEvidence = {
  evidence_id: string;
  source_block_sha256: string;
};

type Q20Receipt = {
  source: {
    source_id: string;
    retrieved_at: string;
    artifact_sha256: string;
  };
  reviews: {
    q15a_vs_q15: { evidence: SourceEvidence[] };
    q20a_vs_q20b_and_q20: {
      evidence: SourceEvidence[];
      canonical_inventory: {
        q20a_record_id: string;
        q20a_primary_route_id: string;
        q20a_display_name: string;
        q20a_pre_review_scope: string;
        q20a_pre_review_scope_reason: string;
        q20b_record_id: string;
        q20b_primary_route_id: string;
        q20b_scope: string;
      };
      scope_decision: {
        record_id: string;
        route_record_scope: string;
        route_record_scope_reason: string;
        semantic_correction_id: string;
      };
    };
  };
};

type Q52Receipt = {
  canonical_inventory: {
    record_id: string;
    record_aliases: string[];
    submission_count: number;
    source_count: number;
    submission_ids: string[];
    source_ids: string[];
    slash_surface_observations: Array<{
      submission_id: string;
      source_id: string;
      evidence: Array<{ evidence_id: string; evidence_sha256: string }>;
    }>;
    primary_payload_before_review: JsonObject;
    merged_identity_literals: Record<string, string[]>;
  };
  current_gtfs: {
    feed_date: string;
    manifest_path: string;
    routes_path: string;
    routes_sha256: string;
    q52_matching_route_count: number;
    q52_route: Record<string, string>;
    q53_matching_route_count: number;
    q53_route: Record<string, string>;
  };
  current_route_anchor_release: {
    release_id: string;
    path: string;
    sha256: string;
    q52_anchor_before_review: JsonObject;
    q53_preservation_anchor: JsonObject;
  };
  official_current_identity_evidence: {
    source_id: string;
    retrieved_at: string;
    artifact_sha256: string;
    evidence_id: string;
    raw_text_sha256: string;
    normalized_text_sha256: string;
  };
  official_lifecycle_evidence: Array<{
    source_id: string;
    retrieved_at: string;
    artifact_sha256: string;
    evidence_id: string;
    evidence_sha256: string;
  }>;
  separate_q53_identity: {
    canonical_record_id: string;
    record_aliases: string[];
    submission_count: number;
    source_count: number;
    primary_route_id: string;
    primary_route_label: string;
    route_record_scope: string;
    route_record_scope_reason: string;
  };
  identity_decision: {
    canonical_record_id: string;
    canonical_route_id: string;
    source_route_surface: string;
    gtfs_route_id: string;
    route_record_scope: string;
    route_record_scope_reason: string;
    semantic_correction_id: string;
  };
};

type Q20MetricScopeReceipt = {
  historical_evidence: SourceEvidence[];
  current_lifecycle_evidence: SourceEvidence;
  decision: {
    current_route_record_id: string;
    metric_record_ids: string[];
    derived_relation_record_ids: string[];
    semantic_correction_ids: string[];
  };
};

type SourceBlock = {
  source_id: string;
  block_id: string;
  raw_text_sha256: string;
  normalized_text_sha256: string;
};

const Q20_RECEIPT_PATH = "data/quality/acquisition/receipts/q15a-q20a-terminal-route-identity-2025.json";
const Q20_METRIC_SCOPE_RECEIPT_PATH = "data/quality/acquisition/receipts/q20-historical-metric-scope-2014-2025.json";
const Q52_RECEIPT_PATH = "data/quality/acquisition/receipts/q52-route-scope-2025-08-31.json";

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as T;
}

function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(join(repoRoot, relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function recordById(records: readonly MtaCanonicalRecord[], recordId: string): MtaCanonicalRecord {
  const record = records.find((candidate) => candidate.record_id === recordId);
  if (!record) throw new Error(`missing canonical record ${recordId}`);
  return record;
}

function correctionById(corrections: readonly SemanticCorrectionEntry[], correctionId: string): SemanticCorrectionEntry {
  const correction = corrections.find((candidate) => candidate.correction_id === correctionId);
  if (!correction) throw new Error(`missing semantic correction ${correctionId}`);
  return correction;
}

function reconstructedGuardedRecord(record: MtaCanonicalRecord, correction: SemanticCorrectionEntry): MtaCanonicalRecord {
  return {
    ...structuredClone(record),
    payload: {
      ...structuredClone(record.payload),
      ...structuredClone(correction.guards.payload ?? {}),
    },
  };
}

function withoutPayloadFields(record: MtaCanonicalRecord, fields: readonly string[]): MtaCanonicalRecord {
  const clone = structuredClone(record);
  for (const field of fields) delete clone.payload[field];
  return clone;
}

function selectedPayload(payload: JsonObject, fields: readonly string[]): JsonObject {
  return Object.fromEntries(fields.map((field) => [field, payload[field] ?? null]));
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function unionStrings(...values: ReadonlyArray<readonly string[]>): string[] {
  return [...new Set(values.flat())].sort();
}

function payloadLiterals(record: MtaCanonicalRecord, field: string): string[] {
  const merged = (record.payload._merged_field_values as JsonObject | undefined)?.[field];
  const direct = record.payload[field];
  return unionStrings(
    Array.isArray(merged) ? merged.filter((value): value is string => typeof value === "string") : [],
    Array.isArray(direct)
      ? direct.filter((value): value is string => typeof value === "string")
      : typeof direct === "string"
        ? [direct]
        : [],
  );
}

function expectSubset(expectedSubset: readonly string[], actual: readonly string[]): void {
  const actualSet = new Set(actual);
  expect(expectedSubset.filter((value) => !actualSet.has(value))).toEqual([]);
}

function sha256File(relativePath: string): string {
  return createHash("sha256").update(readFileSync(join(repoRoot, relativePath))).digest("hex");
}

function sourceArtifactPath(sourceId: string): string {
  for (const name of ["source.pdf", "source.html", "source.json", "source.txt"]) {
    const path = `raw/sources/${sourceId}/${name}`;
    if (existsSync(join(repoRoot, path))) return path;
  }
  throw new Error(`missing staged source artifact for ${sourceId}`);
}

function expectSourceArtifact(source: {
  source_id: string;
  retrieved_at: string;
  artifact_sha256: string;
}): void {
  const metadata = readJson<{ sourceId: string; retrievedAt: string; sha256: string }>(
    `raw/sources/${source.source_id}/metadata.json`,
  );
  expect(metadata.sourceId).toBe(source.source_id);
  expect(metadata.retrievedAt).toBe(source.retrieved_at);
  expect(metadata.sha256).toBe(source.artifact_sha256);
  expect(`sha256:${sha256File(sourceArtifactPath(source.source_id))}`).toBe(source.artifact_sha256);
}

const blockCache = new Map<string, Map<string, SourceBlock>>();

function sourceBlock(evidenceId: string): SourceBlock {
  const separator = evidenceId.lastIndexOf("#");
  if (separator < 1) throw new Error(`invalid evidence id ${evidenceId}`);
  const sourceId = evidenceId.slice(0, separator);
  const blockId = evidenceId.slice(separator + 1);
  let blocks = blockCache.get(sourceId);
  if (!blocks) {
    blocks = new Map(
      readJsonl<SourceBlock>(`raw/sources/${sourceId}/blocks.jsonl`).map((block) => [block.block_id, block]),
    );
    blockCache.set(sourceId, blocks);
  }
  const block = blocks.get(blockId);
  if (!block) throw new Error(`missing source block ${evidenceId}`);
  expect(block.source_id).toBe(sourceId);
  return block;
}

function expectEvidenceHash(evidenceId: string, expectedHash: string): void {
  const block = sourceBlock(evidenceId);
  expect(block.raw_text_sha256).toBe(expectedHash);
  expect(block.normalized_text_sha256).toBe(expectedHash);
}

function parseGtfsRows(relativePath: string): Array<Record<string, string>> {
  const [headerLine, ...rows] = readFileSync(join(repoRoot, relativePath), "utf8").trim().split(/\r?\n/u);
  if (!headerLine) throw new Error(`missing GTFS header in ${relativePath}`);
  const header = headerLine.split(",");
  return rows.map((row) => Object.fromEntries(row.split(",").map((value, index) => [header[index]!, value])));
}

describe("reviewed Q20A and Q52 route-identity corrections", () => {
  it("patches only the reviewed payload fields and preserves every legacy canonical input", () => {
    const routes = readJsonl<MtaCanonicalRecord>("data/canonical/routes.jsonl");
    const corrections = readSemanticCorrections();
    const q20Receipt = readJson<Q20Receipt>(Q20_RECEIPT_PATH);
    const q52Receipt = readJson<Q52Receipt>(Q52_RECEIPT_PATH);
    const q20Correction = correctionById(
      corrections,
      q20Receipt.reviews.q20a_vs_q20b_and_q20.scope_decision.semantic_correction_id,
    );
    const q52Correction = correctionById(corrections, q52Receipt.identity_decision.semantic_correction_id);
    const q20Current = recordById(routes, q20Correction.record_id);
    const q52Current = recordById(routes, q52Correction.record_id);
    const q52LimitedCurrent = recordById(routes, "route_q52-ltd-woodhaven-2014");
    const q53Current = recordById(routes, q52Receipt.separate_q53_identity.canonical_record_id);
    const q20Before = reconstructedGuardedRecord(q20Current, q20Correction);
    const q52Before = reconstructedGuardedRecord(q52Current, q52Correction);

    expect(q20Correction.source_decision).toBe(Q20_RECEIPT_PATH);
    expect(q52Correction.source_decision).toBe(Q52_RECEIPT_PATH);
    expect(q20Correction.patch.set).toEqual({
      route_record_scope: q20Receipt.reviews.q20a_vs_q20b_and_q20.scope_decision.route_record_scope,
      route_record_scope_reason: q20Receipt.reviews.q20a_vs_q20b_and_q20.scope_decision.route_record_scope_reason,
    });
    expect(q52Correction.patch.set).toEqual({
      route_id: q52Receipt.identity_decision.canonical_route_id,
      routes: [q52Receipt.identity_decision.source_route_surface],
      route_record_scope: q52Receipt.identity_decision.route_record_scope,
      route_record_scope_reason: q52Receipt.identity_decision.route_record_scope_reason,
    });

    const result = withSemanticCorrections(
      [q20Before, q52Before, q53Current],
      [q20Correction, q52Correction],
    );
    expect(result.issues).toEqual([]);
    expect(result.summary.applied).toBe(2);
    const q20After = recordById(result.records, q20Correction.record_id);
    const q52After = recordById(result.records, q52Correction.record_id);
    const q53After = recordById(result.records, q53Current.record_id);

    const q20Fields = Object.keys(q20Correction.patch.set as JsonObject).sort();
    const q52Fields = Object.keys(q52Correction.patch.set as JsonObject).sort();
    expect(q20Fields).toEqual(["route_record_scope", "route_record_scope_reason"]);
    expect(q52Fields).toEqual(["route_id", "route_record_scope", "route_record_scope_reason", "routes"]);
    expect(withoutPayloadFields(q20After, q20Fields)).toEqual(withoutPayloadFields(q20Before, q20Fields));
    expect(withoutPayloadFields(q52After, q52Fields)).toEqual(withoutPayloadFields(q52Before, q52Fields));
    expect(q53After).toEqual(q53Current);

    expect(q20After.submission_ids).toEqual(q20Before.submission_ids);
    expect(q20After.source_ids).toEqual(q20Before.source_ids);
    expect(q20After.evidence_refs).toEqual(q20Before.evidence_refs);
    expect(q20After.payload._merged_field_values).toEqual(q20Before.payload._merged_field_values);
    expect(q52After.submission_ids).toEqual(q52Before.submission_ids);
    expect(q52After.source_ids).toEqual(q52Before.source_ids);
    expect(q52After.evidence_refs).toEqual(q52Before.evidence_refs);
    expect(q52After.payload._merged_field_values).toEqual(q52Before.payload._merged_field_values);

    for (const [field, literals] of Object.entries(q52Receipt.canonical_inventory.merged_identity_literals)) {
      const preservedAcrossPhysicalRoutes = unionStrings(
        payloadLiterals(q52After, field),
        payloadLiterals(q52LimitedCurrent, field),
      );
      expectSubset(literals, preservedAcrossPhysicalRoutes);
    }

    // The checked-in canonical file may be immediately before or after materialization,
    // but no third payload state is allowed while the correction is pending/applied.
    for (const [current, before, after, fields] of [
      [q20Current, q20Before, q20After, q20Fields],
      [q52Current, q52Before, q52After, q52Fields],
    ] as const) {
      const state = selectedPayload(current.payload, fields);
      expect([
        selectedPayload(before.payload, fields),
        selectedPayload(after.payload, fields),
      ]).toContainEqual(state);
    }
  });

  it("keeps receipt inventories, Q53 separation, and immutable rc7 anchors exact", () => {
    const routes = readJsonl<MtaCanonicalRecord>("data/canonical/routes.jsonl");
    const q20Receipt = readJson<Q20Receipt>(Q20_RECEIPT_PATH);
    const q52Receipt = readJson<Q52Receipt>(Q52_RECEIPT_PATH);
    const q20Inventory = q20Receipt.reviews.q20a_vs_q20b_and_q20.canonical_inventory;
    const q20 = recordById(routes, q20Inventory.q20a_record_id);
    const q20b = recordById(routes, q20Inventory.q20b_record_id);
    const q52 = recordById(routes, q52Receipt.canonical_inventory.record_id);
    const q52Limited = recordById(routes, "route_q52-ltd-woodhaven-2014");
    const q53 = recordById(routes, q52Receipt.separate_q53_identity.canonical_record_id);
    const q53Limited = recordById(routes, "route_q53-ltd-woodhaven-2014");

    expect(q20.display_name).toBe(q20Inventory.q20a_display_name);
    expect(q20.payload.route_id).toBe(q20Inventory.q20a_primary_route_id);
    expect(q20b.payload.route_id).toBe(q20Inventory.q20b_primary_route_id);
    expect(q20b.payload.route_record_scope).toBe(q20Inventory.q20b_scope);
    expect([q20Inventory.q20a_pre_review_scope, q20Receipt.reviews.q20a_vs_q20b_and_q20.scope_decision.route_record_scope])
      .toContain(q20.payload.route_record_scope);

    expectSubset(
      q52Receipt.canonical_inventory.submission_ids,
      unionStrings(q52.submission_ids, q52Limited.submission_ids),
    );
    expectSubset(
      q52Receipt.canonical_inventory.source_ids,
      unionStrings(q52.source_ids, q52Limited.source_ids),
    );
    expect(q52Receipt.canonical_inventory.submission_ids).toHaveLength(q52Receipt.canonical_inventory.submission_count);
    expect(q52Receipt.canonical_inventory.source_ids).toHaveLength(q52Receipt.canonical_inventory.source_count);
    expect(sorted(q52.record_aliases ?? [])).toEqual(
      sorted(q52Receipt.canonical_inventory.record_aliases.filter((recordId) => recordId !== q52Limited.record_id)),
    );
    expect(q52Limited.payload).toMatchObject({
      route_id: "Q52",
      route_type_normalized: "limited_stop",
      service_variant: "limited_stop",
      route_record_scope: "true_route",
    });
    expect(q52.record_aliases ?? []).not.toContain(q52Limited.record_id);
    const q52PhysicalRouteRecords = [q52, q52Limited];
    for (const slashObservation of q52Receipt.canonical_inventory.slash_surface_observations) {
      expect(q52PhysicalRouteRecords.some((record) => record.submission_ids.includes(slashObservation.submission_id))).toBe(true);
      expect(q52PhysicalRouteRecords.some((record) => record.source_ids.includes(slashObservation.source_id))).toBe(true);
      for (const evidence of slashObservation.evidence) {
        expectEvidenceHash(evidence.evidence_id, evidence.evidence_sha256);
        expect(q52PhysicalRouteRecords.some((record) =>
          record.evidence_refs.some((ref) =>
            ref.evidence_id === evidence.evidence_id && ref.text_sha256 === evidence.evidence_sha256
          )
        )).toBe(true);
      }
    }

    const q53Inventory = q52Receipt.separate_q53_identity;
    expect(q53.record_id).toBe(q53Inventory.canonical_record_id);
    expect(sorted(q53.record_aliases ?? [])).toEqual(
      sorted(q53Inventory.record_aliases.filter((recordId) => recordId !== q53Limited.record_id)),
    );
    expect(unionStrings(q53.submission_ids, q53Limited.submission_ids)).toHaveLength(q53Inventory.submission_count);
    expect(unionStrings(q53.source_ids, q53Limited.source_ids)).toHaveLength(q53Inventory.source_count);
    expect(q53.payload.route_id).toBe(q53Inventory.primary_route_id);
    expect(q53.payload.route_label).toBe(q53Inventory.primary_route_label);
    expect(q53.payload.route_record_scope).toBe("true_route");
    expect(q53.payload.route_record_scope_reason).toBe("default_true_route");
    expect(q53Limited.payload).toMatchObject({
      route_id: "Q53",
      route_type_normalized: "limited_stop",
      service_variant: "limited_stop",
      route_record_scope: "true_route",
    });
    expect(q53.record_aliases ?? []).not.toContain(q53Limited.record_id);

    const release = q52Receipt.current_route_anchor_release;
    expect(release.release_id).toBe("v1-rc7");
    expect(sha256File(release.path)).toBe(release.sha256);
    const anchors = readJsonl<JsonObject>(release.path);
    expect(anchors.find((anchor) => anchor.gtfs_route_id === "Q52+")).toEqual(release.q52_anchor_before_review);
    expect(anchors.find((anchor) => anchor.gtfs_route_id === "Q53+")).toEqual(release.q53_preservation_anchor);

    const routePairs = new Map(
      (readIdentityDoNotMergeOverrides().pairs?.route ?? []).map((entry) => [
        identityPairKey(entry.record_ids?.[0] ?? "", entry.record_ids?.[1] ?? ""),
        entry,
      ]),
    );
    for (const pair of [
      ["route_q15a-historical-2025", "route_q15-qbnr-2025"],
      [q20.record_id, q20b.record_id],
      [q20.record_id, "route_q20-qbnr-2025"],
    ] as const) {
      const entry = routePairs.get(identityPairKey(...pair));
      expect(entry?.source_decision).toStartWith(`${Q20_RECEIPT_PATH}#`);
    }
  });

  it("keeps 2014 Q20A/B metrics off the distinct current Q20 lifecycle", () => {
    const receipt = readJson<Q20MetricScopeReceipt>(Q20_METRIC_SCOPE_RECEIPT_PATH);
    const corrections = readSemanticCorrections();
    const routes = readJsonl<MtaCanonicalRecord>("data/canonical/routes.jsonl");
    const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
    const treatments = readJsonl<MtaCanonicalRecord>("data/canonical/treatment_components.jsonl");
    const metrics = readJsonl<MtaCanonicalRecord>("data/canonical/metric_claims.jsonl");
    const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");

    const currentRoute = recordById(routes, receipt.decision.current_route_record_id);
    const metricRecords = receipt.decision.metric_record_ids.map((recordId) => recordById(metrics, recordId));
    const scopedCorrections = receipt.decision.semantic_correction_ids.map((correctionId) => correctionById(corrections, correctionId));
    expect(scopedCorrections).toHaveLength(4);
    expect(new Set(scopedCorrections.map((correction) => correction.op))).toEqual(new Set(["retract_record"]));
    expect(scopedCorrections.map((correction) => correction.record_id).sort()).toEqual(
      [...receipt.decision.derived_relation_record_ids].sort(),
    );
    for (const correction of scopedCorrections) {
      expect(correction.source_decision).toBe(Q20_METRIC_SCOPE_RECEIPT_PATH);
      expect(correction.guards.payload).toMatchObject({
        relation_kind: "has_metric",
        derived_relation: true,
        derivation_rule: "metric-route-has-metric",
        derived_from_payload_field: "route",
        derived_from_payload_value: "Q20",
        subject_id: receipt.decision.current_route_record_id,
      });
    }

    const mechanicallyDerived = withDerivedRelations([currentRoute, ...metricRecords]);
    for (const relationId of receipt.decision.derived_relation_record_ids) {
      expect(mechanicallyDerived.some((record) => record.record_id === relationId)).toBe(false);
      expect(relations.some((record) => record.record_id === relationId)).toBe(false);
    }
    const routeCoverage = derivedRelationCoverage([currentRoute, ...metricRecords]).find((row) =>
      row.rule_id === "metric-route-has-metric" && row.field === "route"
    );
    expect(routeCoverage).toMatchObject({
      value_count: 4,
      derived_count: 0,
      already_present_count: 0,
      skipped_reviewed_non_edge_count: 4,
    });
    for (const metric of metricRecords) {
      expect(recordById(mechanicallyDerived, metric.record_id).payload.route).toBe("Q20");
    }

    expect(recordById(events, "event_q20-qbnr-start-2025-06-29").payload.date_normalized).toBe("2025-06-29");
    for (const treatmentId of [
      "treatment_q20-college-point-jamaica-connection-2025",
      "treatment_q20-jamaica-avenue-approach-2025",
      "treatment_q20-q20b-replacement-2025",
    ]) {
      expect(recordById(treatments, treatmentId).payload.treatment_family).toBe("service_pattern");
    }
    for (const relationId of [
      "relation_qbnr-2025-affects-q20",
      "relation_qbnr-has-q20-start-2025-06-29",
      "relation_qbnr-2025-has-q20-college-point-jamaica-connection",
      "relation_qbnr-2025-has-q20-jamaica-avenue-approach",
      "relation_qbnr-2025-has-q20-q20b-replacement",
    ]) {
      expect(recordById(relations, relationId).record_kind).toBe("relation");
    }

    for (const evidence of [...receipt.historical_evidence, receipt.current_lifecycle_evidence]) {
      expectEvidenceHash(evidence.evidence_id, evidence.source_block_sha256);
    }
  });

  it("verifies every receipt-backed artifact, GTFS row, and cited block hash", () => {
    const q20Receipt = readJson<Q20Receipt>(Q20_RECEIPT_PATH);
    const q52Receipt = readJson<Q52Receipt>(Q52_RECEIPT_PATH);

    expectSourceArtifact(q20Receipt.source);
    expectSourceArtifact(q52Receipt.official_current_identity_evidence);
    for (const evidence of [
      ...q20Receipt.reviews.q15a_vs_q15.evidence,
      ...q20Receipt.reviews.q20a_vs_q20b_and_q20.evidence,
    ]) {
      expectEvidenceHash(evidence.evidence_id, evidence.source_block_sha256);
    }
    const currentEvidence = q52Receipt.official_current_identity_evidence;
    expectEvidenceHash(currentEvidence.evidence_id, currentEvidence.raw_text_sha256);
    expect(currentEvidence.normalized_text_sha256).toBe(currentEvidence.raw_text_sha256);

    const verifiedArtifacts = new Set<string>();
    for (const evidence of q52Receipt.official_lifecycle_evidence) {
      if (!verifiedArtifacts.has(evidence.source_id)) {
        expectSourceArtifact(evidence);
        verifiedArtifacts.add(evidence.source_id);
      }
      expectEvidenceHash(evidence.evidence_id, evidence.evidence_sha256);
    }

    const gtfs = q52Receipt.current_gtfs;
    expect(sha256File(gtfs.routes_path)).toBe(gtfs.routes_sha256);
    const manifest = readJson<{ feed_date: string; files: { "routes.txt": { sha256: string } } }>(gtfs.manifest_path);
    expect(manifest.feed_date).toBe(gtfs.feed_date);
    expect(manifest.files["routes.txt"].sha256).toBe(gtfs.routes_sha256);
    const gtfsRows = parseGtfsRows(gtfs.routes_path);
    const q52Rows = gtfsRows.filter((row) => row.route_id === q52Receipt.identity_decision.gtfs_route_id);
    const q53Rows = gtfsRows.filter((row) => row.route_id === "Q53+");
    expect(q52Rows).toHaveLength(gtfs.q52_matching_route_count);
    expect(q53Rows).toHaveLength(gtfs.q53_matching_route_count);
    expect(q52Rows[0]).toMatchObject(gtfs.q52_route);
    expect(q53Rows[0]).toMatchObject(gtfs.q53_route);
  });
});
