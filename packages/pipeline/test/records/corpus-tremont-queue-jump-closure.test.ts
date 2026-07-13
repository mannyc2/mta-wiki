import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import { loadOperationalAnchorReviewDecisions } from "@mta-wiki/pipeline/materialize/operational-anchor-review";
import { loadOperationalOccurrenceIdentityRegistry } from "@mta-wiki/pipeline/materialize/operational-occurrence-identity";
import { loadOperationalOccurrenceAcceptedDecisions } from "@mta-wiki/pipeline/materialize/operational-occurrence-review";

type SourceBlock = {
  block_id: string;
  raw_text: string;
  raw_text_sha256: string;
};

type SemanticCorrection = {
  correction_id: string;
  op: string;
  record_id: string;
  guards: { payload: Record<string, unknown> };
  patch: { set: Record<string, unknown> };
  cascade: unknown[];
  source_decision: string;
};

type CurationReceipt = {
  receipt_id: string;
  status: string;
  source: { source_id: string; document_date: string };
  decision: {
    project_record_id: string;
    event_record_id: string;
    treatment_record_id: string;
    route_record_id: string;
    gtfs_route_id: string;
    relation_observation_count: number;
    semantic_correction_id: string;
    corrected_lifecycle_phase: string;
    preserved_date_text: string;
    preserved_date_normalized: string;
    preserved_date_precision: string;
    projection_disposition: string;
  };
  ambiguity: {
    graph_subject_choice: string;
    date_boundary: string;
    anti_inference: string;
  };
};

type CoverageRow = {
  gap_id: string;
  event_record_id: string;
  dimension: string;
  status?: string;
  verdict: string;
  decision_ids: string[];
  search_receipt_ids: string[];
  resolved_occurrence_ids: string[];
  required_search_source_ids: string[];
  route_record_ids: string[];
  gtfs_route_ids: string[];
  treatment_record_ids: string[];
  treatment_families: string[];
};

type CoverageManifest = {
  corpus_fingerprint: string;
};

type SearchReceipt = {
  receipt_id: string;
  gap_id: string;
  corpus_fingerprint: string;
  rationale: string;
  source_searches: Array<{
    source_id: string;
    queries: string[];
    matching_block_ids: string[];
  }>;
  registry_search: {
    matched_source_ids: string[];
  };
};

type CoverageDecision = {
  schema_version: number;
  decision_id: string;
  gap_id: string;
  prior_verdict: string;
  verdict: string;
  proposal_ids: string[];
  evidence_refs: unknown[];
  search_receipt_ids: string[];
};

const sourceId = "tremont_ave_bus_priority_cb5_nov2024";
const projectId = "project_tremont-av-bus-priority";
const eventId = "event_queue-jump-implementation-fall2024";
const routeId = "route_bx36";
const treatmentId = "treatment_queue-jump-grand-concourse";
const routeTimelineId =
  "relation_bx36-has-fall2024-queue-jump-installation";
const treatmentTimelineId =
  "relation_queue-jump-signal-has-fall2024-installation";
const gapId = "operational-coverage:e2a8d437c3dab6ad27820394";
const decisionId = "tremont-queue-jump-fall-2024-exact-onset-absent";
const searchReceiptId =
  "tremont-queue-jump-fall-2024-exact-onset-search";
const curationReceiptPath =
  "data/quality/acquisition/receipts/tremont-queue-jump-fall-2024-curation.json";

const sourceArtifactPins = {
  "metadata.json":
    "1c016f83d36fbc4fc3a8261c4f27a204c74dd52a21e830641793b6421f044124",
  "source.pdf":
    "0f16201c3c442d289fbbbdb3bae4846eb74e1829c6bafff9a9111a85ffa6c5b8",
  "blocks.jsonl":
    "ff2b47fe400f12ae868c9c082a8b3bf71702aa0e3927215f09ed9913add48e59",
} as const;

const evidencePins = {
  p004_c0002:
    "sha256:fa3355ea01e96cf64ae231e0168e561c5fc7c7caac2a948f5abe31dc8917483e",
  p013_c0002:
    "sha256:89250d7256e1892cef2c0f1b1f565d889859e277a61dde9c56efd7a34c912f5f",
  p014_c0002:
    "sha256:0a4ec72360eebd23c2a834ffaa3db0af1de71fb2f58fa03265ca42c2feaf5bea",
} as const;

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as T;
}

function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(join(repoRoot, relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function sha256Hex(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(join(repoRoot, relativePath)))
    .digest("hex");
}

function byRecordId(
  records: readonly MtaCanonicalRecord[],
  recordId: string,
): MtaCanonicalRecord {
  const record = records.find((candidate) => candidate.record_id === recordId);
  if (!record) throw new Error(`missing canonical record ${recordId}`);
  return record;
}

describe("Fall 2024 Tremont and Grand Concourse Bx36 queue jump", () => {
  const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
  const relations = readJsonl<MtaCanonicalRecord>(
    "data/canonical/relations.jsonl",
  );
  const corrections = readJsonl<SemanticCorrection>(
    "data/semantic-corrections/corrections.jsonl",
  );
  const receipt = readJson<CurationReceipt>(curationReceiptPath);

  it("pins the official source and preserves its season-only onset", () => {
    for (const [filename, expected] of Object.entries(sourceArtifactPins)) {
      expect(sha256Hex(`raw/sources/${sourceId}/${filename}`)).toBe(expected);
    }
    const blocks = readJsonl<SourceBlock>(
      `raw/sources/${sourceId}/blocks.jsonl`,
    );
    for (const [blockId, expected] of Object.entries(evidencePins)) {
      expect(
        blocks.find((block) => block.block_id === blockId)?.raw_text_sha256,
      ).toBe(expected);
    }
    expect(
      blocks.find((block) => block.block_id === "p013_c0002")?.raw_text,
    ).toContain(
      "Fall 2024: Bus Queue Jump Signals at Tremont Av & Grand Concourse",
    );
    expect(
      blocks.find((block) => block.block_id === "p014_c0002")?.raw_text,
    ).toContain("Installed at Grand Concourse & Tremont Av");

    const event = byRecordId(events, eventId);
    expect(event.payload).toMatchObject({
      event_family: "implementation",
      lifecycle_phase: "installed",
      date_text: "Fall 2024",
      date_normalized: "2024-fall",
      date_precision: "season",
    });
    expect(JSON.stringify(event.payload)).not.toContain("2024-11-04");

    expect(receipt).toMatchObject({
      receipt_id: "tremont-queue-jump-fall-2024-curation",
      status: "reviewed_work_order_not_applied",
      source: { source_id: sourceId, document_date: "2024-11-04" },
      decision: {
        project_record_id: projectId,
        event_record_id: eventId,
        treatment_record_id: treatmentId,
        route_record_id: routeId,
        gtfs_route_id: "BX36",
        relation_observation_count: 5,
        semantic_correction_id:
          "core-coverage-tremont-queue-jump-fall2024-installed-20260713",
        corrected_lifecycle_phase: "installed",
        preserved_date_text: "Fall 2024",
        preserved_date_normalized: "2024-fall",
        preserved_date_precision: "season",
        projection_disposition: "realized_but_date_ineligible",
      },
    });
    expect(receipt.ambiguity.graph_subject_choice).toContain(
      "route-to-event and treatment-to-event",
    );
    expect(receipt.ambiguity.date_boundary).toContain(
      "does not establish an exact month or day",
    );
    expect(receipt.ambiguity.anti_inference).toContain(
      "Do not convert the document date",
    );

    expect(
      corrections.find(
        (correction) =>
          correction.correction_id ===
          "core-coverage-tremont-queue-jump-fall2024-installed-20260713",
      ),
    ).toMatchObject({
      op: "patch_payload",
      record_id: eventId,
      guards: {
        payload: {
          lifecycle_phase: "other",
          date_normalized: "2024-fall",
          date_precision: "season",
        },
      },
      patch: { set: { lifecycle_phase: "installed" } },
      cascade: [],
      source_decision: curationReceiptPath,
    });
  });

  it("uses direct delivered route and treatment timelines for bounded scope", () => {
    const expected = new Map([
      [routeTimelineId, routeId],
      [treatmentTimelineId, treatmentId],
    ]);
    for (const [relationId, subjectId] of expected) {
      const relation = byRecordId(relations, relationId);
      expect(relation.payload).toMatchObject({
        relation_kind: "has_timeline_event",
        subject_id: subjectId,
        object_id: eventId,
        assertion_status: "delivered",
        as_of_date: "2024-11-04",
      });
      expect(relation.source_ids).toEqual([sourceId]);
    }

    const routeTimeline = byRecordId(relations, routeTimelineId);
    expect(routeTimeline.evidence_refs.map((ref) => ref.evidence_id)).toEqual([
      `${sourceId}#p004_c0002`,
      `${sourceId}#p013_c0002`,
      `${sourceId}#p014_c0002`,
    ]);
    const treatmentTimeline = byRecordId(relations, treatmentTimelineId);
    expect(
      treatmentTimeline.evidence_refs.map((ref) => ref.evidence_id),
    ).toEqual([
      `${sourceId}#p013_c0002`,
      `${sourceId}#p014_c0002`,
    ]);
  });

  it("terminalizes only the exact-onset gap with an exhaustive corpus receipt", () => {
    const rows = readJsonl<CoverageRow>(
      "data/quality/operational-coverage/recoverability-ledger.jsonl",
    ).filter((row) => row.event_record_id === eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      gap_id: gapId,
      dimension: "date_precision",
      verdict: "absent_in_source",
      decision_ids: [decisionId],
      search_receipt_ids: [searchReceiptId],
      resolved_occurrence_ids: [],
      route_record_ids: [routeId],
      gtfs_route_ids: ["BX36"],
      treatment_record_ids: [treatmentId],
      treatment_families: ["signal_priority"],
    });
    const queueRow = readJsonl<CoverageRow>(
      "data/quality/operational-coverage/priority-queue.jsonl",
    ).find((row) => row.gap_id === gapId);
    expect(queueRow?.status).toBe("terminal");

    const decision = readJson<CoverageDecision>(
      `data/operational-anchor-review/ledger-decisions/decisions/${decisionId}.json`,
    );
    expect(decision).toMatchObject({
      schema_version: 1,
      decision_id: decisionId,
      gap_id: gapId,
      prior_verdict: "unreviewed",
      verdict: "absent_in_source",
      proposal_ids: [],
      evidence_refs: [],
      search_receipt_ids: [searchReceiptId],
    });

    const searchReceipt = readJson<SearchReceipt>(
      `data/operational-anchor-review/ledger-decisions/search-receipts/${searchReceiptId}.json`,
    );
    const manifest = readJson<CoverageManifest>(
      "data/quality/operational-coverage/manifest.json",
    );
    expect(searchReceipt).toMatchObject({
      receipt_id: searchReceiptId,
      gap_id: gapId,
      corpus_fingerprint: manifest.corpus_fingerprint,
    });
    expect(
      searchReceipt.source_searches.map((search) => search.source_id),
    ).toEqual(rows[0]!.required_search_source_ids);
    expect(
      searchReceipt.source_searches.every(
        (search) =>
          search.queries.length > 0 && search.matching_block_ids.length === 0,
      ),
    ).toBe(true);
    const searchedSourceIds = new Set(
      searchReceipt.source_searches.map((search) => search.source_id),
    );
    expect(
      searchReceipt.registry_search.matched_source_ids.every((matched) =>
        searchedSourceIds.has(matched),
      ),
    ).toBe(true);
    expect(searchReceipt.rationale).toMatch(/exact|month|day/iu);
  });

  it("does not approve a season-precision anchor or occurrence", () => {
    expect(
      loadOperationalAnchorReviewDecisions().some(
        (decision) => decision.event_record_id === eventId,
      ),
    ).toBe(false);
    expect(
      loadOperationalOccurrenceAcceptedDecisions().some((decision) =>
        decision.observation_event_record_ids.includes(eventId),
      ),
    ).toBe(false);
    expect(
      loadOperationalOccurrenceIdentityRegistry().some((identity) =>
        identity.founding_event_record_ids.includes(eventId),
      ),
    ).toBe(false);
    const occurrences = readJsonl<Record<string, unknown>>(
      "data/contract-fixtures/operational-occurrences-v1/operational_occurrences.jsonl",
    );
    expect(
      occurrences.some((occurrence) =>
        JSON.stringify(occurrence).includes(eventId),
      ),
    ).toBe(false);
  });
});
