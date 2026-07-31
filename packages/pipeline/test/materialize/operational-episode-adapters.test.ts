import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  loadOperationalEpisodeAcceptedMappings,
  type OperationalEpisodeAcceptedMapping,
} from "@mta-wiki/pipeline/materialize/operational-episode-adapters";
import {
  buildOperationalEpisodeFrontier,
  loadOperationalEpisodeCandidateDecisions,
  type OperationalEpisodeFrozenDenominator,
} from "@mta-wiki/pipeline/materialize/operational-episode-frontier";

const reviewedAt = "2026-07-30T00:00:00.000Z";

function mapping(
  mappingId: string,
  eventId: string,
  candidateKey = `event:${eventId}`,
): OperationalEpisodeAcceptedMapping {
  return {
    schema_version: 1,
    mapping_id: mappingId,
    adapter_id: "accepted_mapping_v1",
    observation_event_record_ids: [eventId],
    observation_relation_record_ids: [],
    candidate_keys: [candidateKey],
    occurrence_id: null,
    evidence_bindings: [{
      record_id: eventId,
      source_id: "source_fixture",
      evidence_id: "source_fixture#p001_b0001",
    }],
    decision_id: `decision:${mappingId}`,
    reviewer: "fixture-reviewer",
    reviewed_at: reviewedAt,
    rationale: "Fixture maps one frozen observation without publication authority.",
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${stableJson(value as JsonValue)}\n`, "utf8");
}

function event(eventId: string): MtaCanonicalRecord {
  return {
    record_id: eventId,
    record_kind: "event",
    source_id: "source_fixture",
    source_ids: ["source_fixture"],
    local_observation_id: eventId,
    local_observation_ids: [eventId],
    display_name: eventId,
    payload: { event_family: "implementation", lifecycle_phase: "installed" },
    evidence_refs: [{
      source_id: "source_fixture",
      evidence_id: "source_fixture#p001_b0001",
      source_path: "raw/sources/source_fixture/blocks.jsonl",
      page_number: 1,
      block_id: "p001_b0001",
      text_sha256: "sha256:fixture",
      text_source: "raw_text",
    }],
    submission_ids: ["sub_fixture"],
    truth_status: "source_stated",
    review_state: "reviewed",
    generated_at: reviewedAt,
  } as unknown as MtaCanonicalRecord;
}

describe("Plan 052 append-only episode adapter boundary", () => {
  it("loads immutable historical mappings plus accepted-current additions", () => {
    const root = mkdtempSync(join(tmpdir(), "mta-plan052-mappings-"));
    try {
      const current = join(root, "accepted-current");
      mkdirSync(current);
      writeJson(join(root, "mapping:historical.json"), mapping(
        "mapping:historical",
        "event_historical",
      ));
      writeJson(join(current, "mapping:current.json"), mapping(
        "mapping:current",
        "event_current",
      ));
      expect(loadOperationalEpisodeAcceptedMappings(root).map((row) =>
        row.mapping_id
      ).sort()).toEqual(["mapping:current", "mapping:historical"]);

      writeJson(join(current, "mapping:overlap.json"), mapping(
        "mapping:overlap",
        "event_historical",
      ));
      expect(() => loadOperationalEpisodeAcceptedMappings(root)).toThrow(
        "is owned by mappings",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("loads append-only candidate decisions without mutating the historical index", () => {
    const root = mkdtempSync(join(tmpdir(), "mta-plan052-decisions-"));
    try {
      const registry = join(
        root,
        "data",
        "operational-episode-resolution",
        "decisions",
      );
      const indexPath = join(registry, "index.json");
      const current = join(registry, "accepted-current");
      const gapReceiptDir = join(
        root,
        "data",
        "operational-episode-resolution",
        "campaigns",
        "plan-052",
        "evidence-gap-receipts",
      );
      mkdirSync(current, { recursive: true });
      mkdirSync(gapReceiptDir, { recursive: true });
      writeJson(indexPath, { schema_version: 1, decisions: [] });
      const evidenceBindings = [{
        record_id: "event_fixture",
        source_id: "source_fixture",
        evidence_id: "source_fixture#p001_b0001",
      }];
      const gapReceiptRelative =
        "data/operational-episode-resolution/campaigns/plan-052/evidence-gap-receipts/fixture.json";
      const gapReceiptPath = join(root, gapReceiptRelative);
      const manifestRelative =
        "data/operational-episode-resolution/campaigns/plan-052/batches/fixture-batch.json";
      const primaryRelative =
        "data/operational-episode-resolution/campaigns/plan-052/proposed-review-receipts/fixture-batch/primary.json";
      const independentRelative =
        "data/operational-episode-resolution/campaigns/plan-052/proposed-review-receipts/fixture-batch/independent.json";
      mkdirSync(join(root, manifestRelative, ".."), { recursive: true });
      mkdirSync(join(root, primaryRelative, ".."), { recursive: true });
      writeJson(join(root, manifestRelative), { batch_id: "fixture-batch" });
      writeJson(join(root, primaryRelative), { review_role: "primary" });
      writeJson(join(root, independentRelative), {
        review_role: "independent",
      });
      const pinned = (path: string) => ({
        path,
        sha256: createHash("sha256")
          .update(readFileSync(join(root, path)))
          .digest("hex"),
      });
      writeJson(gapReceiptPath, {
        schema_version: 1,
        contract_id: "plan-052-evidence-gap-receipt-v1",
        plan_id: "plan-052",
        batch_id: "fixture-batch",
        candidate_id: `candidate:${
          createHash("sha256")
            .update("operational-episode-candidate-v1\0event:event_fixture")
            .digest("hex")
            .slice(0, 24)
        }`,
        candidate_key: "event:event_fixture",
        disposition: "insufficient_evidence",
        evidence_bindings: evidenceBindings,
        known_facts: ["The source establishes an installed treatment."],
        prohibited_inferences: ["Do not infer a route."],
        manifest: pinned(manifestRelative),
        review_receipts: [
          pinned(primaryRelative),
          pinned(independentRelative),
        ],
        recorded_at: reviewedAt,
      });
      const decision = {
        schema_version: 1,
        decision_id: "plan-052-fixture-terminal",
        candidate_key: "event:event_fixture",
        disposition: "insufficient_evidence",
        canonical_candidate_key: null,
        successor_occurrence_ids: [],
        reviewer: "fixture-dual-review",
        decided_at: reviewedAt,
        rationale: "The exact fixture evidence cannot establish route-treatment incidence.",
        evidence_bindings: evidenceBindings,
        evidence_gap_receipt_path: gapReceiptRelative,
        evidence_gap_receipt_sha256: createHash("sha256")
          .update(readFileSync(gapReceiptPath))
          .digest("hex"),
      };
      writeJson(join(current, `${decision.decision_id}.json`), decision);
      expect(loadOperationalEpisodeCandidateDecisions(indexPath)).toHaveLength(1);
      expect(readFileSync(indexPath, "utf8")).toBe(
        `${stableJson({ schema_version: 1, decisions: [] } as JsonValue)}\n`,
      );
      writeJson(join(current, "duplicate.json"), {
        ...decision,
        decision_id: "duplicate",
      });
      expect(() => loadOperationalEpisodeCandidateDecisions(indexPath)).toThrow(
        "multiple terminal decision owners",
      );
      rmSync(join(current, "duplicate.json"));
      writeJson(gapReceiptPath, {
        changed_after_acceptance: true,
      });
      expect(() => loadOperationalEpisodeCandidateDecisions(indexPath)).toThrow(
        "evidence-gap receipt hash drifted",
      );
      writeJson(join(current, `${decision.decision_id}.json`), {
        ...decision,
        evidence_gap_receipt_path: undefined,
        evidence_gap_receipt_sha256: undefined,
      });
      expect(() => loadOperationalEpisodeCandidateDecisions(indexPath)).toThrow(
        "insufficient_evidence requires one evidence-gap receipt",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects candidate-key drift against an independent frozen denominator", () => {
    const record = event("event_fixture");
    const baseline = buildOperationalEpisodeFrontier({
      canonical_records: [record],
      accepted_mappings: [mapping("mapping:fixture", record.record_id)],
      candidate_decisions: [],
      identity_registry: [],
      review_decisions: [],
      completeness_profile: "partial",
    });
    const denominator: OperationalEpisodeFrozenDenominator = {
      contract_id: "plan-052-operational-episode-denominator-v1",
      canonical_input_sha256: baseline.cohort.canonical_input_sha256,
      admitted_events_sha256: baseline.cohort.admitted_events_sha256,
      relevant_relations_sha256: baseline.cohort.relevant_relations_sha256,
      observation_event_record_ids: [record.record_id],
      candidate_keys: ["event:event_fixture"],
    };
    expect(buildOperationalEpisodeFrontier({
      canonical_records: [record],
      accepted_mappings: [mapping("mapping:fixture", record.record_id)],
      candidate_decisions: [],
      identity_registry: [],
      review_decisions: [],
      frozen_denominator: denominator,
      completeness_profile: "partial",
    }).candidate_ledger).toHaveLength(1);
    expect(() => buildOperationalEpisodeFrontier({
      canonical_records: [record],
      accepted_mappings: [mapping(
        "mapping:fixture",
        record.record_id,
        "event:event_changed",
      )],
      candidate_decisions: [],
      identity_registry: [],
      review_decisions: [],
      frozen_denominator: denominator,
      completeness_profile: "partial",
    })).toThrow("candidate denominator drift");
    expect(() => buildOperationalEpisodeFrontier({
      canonical_records: [record, event("event_new")],
      accepted_mappings: [mapping("mapping:fixture", record.record_id)],
      candidate_decisions: [],
      identity_registry: [],
      review_decisions: [],
      frozen_denominator: denominator,
      completeness_profile: "partial",
    })).toThrow("input fingerprint drift");
  });
});
