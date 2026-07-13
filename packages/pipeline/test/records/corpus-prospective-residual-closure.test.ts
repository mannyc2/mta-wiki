import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import { loadOperationalOccurrenceIdentityRegistry } from "@mta-wiki/pipeline/materialize/operational-occurrence-identity";
import { loadOperationalOccurrenceAcceptedDecisions } from "@mta-wiki/pipeline/materialize/operational-occurrence-review";

type LifecycleDecision = {
  sequence: number;
  correction_id: string;
  record_id: string;
  prior_lifecycle_phase: "other" | "launched";
  incoming_relation: {
    record_id: string;
    assertion_status: "planned" | "proposed";
  } | null;
};

type LifecycleReceipt = {
  receipt_id: string;
  scope: {
    correction_count: number;
    prior_lifecycle_counts: { other: number; launched: number };
    corrected_lifecycle_phase: string;
    relation_backed_count: number;
    direct_prospective_evidence_count: number;
    event_inventory_sha256: string;
    excluded_event_record_ids: string[];
  };
  lifecycle_decisions: LifecycleDecision[];
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

type QueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: string;
  status: string;
  verdict: string;
  decision_ids: string[];
  resolved_occurrence_ids: string[];
};

type LedgerDecision = {
  decision_id: string;
  gap_id: string;
  prior_verdict: string;
  verdict: string;
};

const receiptPath =
  "data/quality/acquisition/receipts/prospective-residual-lifecycle-review-2023-2026.json";
const decisionDir = "data/operational-anchor-review/ledger-decisions/decisions";
const decisionPrefix = "prospective-residual-";
const queueJumpEventId = "event_queue-jump-implementation-fall2024";
const queueJumpGapId = "operational-coverage:e2a8d437c3dab6ad27820394";
const queueJumpDecisionId =
  "tremont-queue-jump-fall-2024-exact-onset-absent";
const fullDimensions = [
  "date_precision",
  "delivered_status",
  "route",
  "treatment",
] as const;
const alreadyPlannedEventIds = [
  "event_planned-implementation-fall2023",
  "event_planned-implementation-fall2023_2",
  "event_planned-implementation-fall2023_3",
  "event_planned-implementation-fall2023_4",
  "event_planned-implementation-summer-2025",
  "event_planned-implementation-summer2025",
] as const;

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as T;
}

function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(join(repoRoot, relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function slug(eventId: string): string {
  return eventId
    .replace(/^event_/u, "")
    .replaceAll("_", "-")
    .replace(/[^a-zA-Z0-9-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
}

function expectedLedgerDecisionId(eventId: string, dimension: string): string {
  return `${decisionPrefix}${slug(eventId)}-${dimension.replaceAll("_", "-")}-not-applicable`;
}

describe("applied prospective residual closure", () => {
  it("keeps the 26-event lifecycle work order and its exact 104-gap closure occurrence-free", () => {
    const receipt = readJson<LifecycleReceipt>(receiptPath);
    expect(receipt.receipt_id).toBe(
      "prospective-residual-lifecycle-review-2023-2026",
    );
    expect(receipt.scope).toMatchObject({
      correction_count: 26,
      prior_lifecycle_counts: { other: 24, launched: 2 },
      corrected_lifecycle_phase: "planned",
      relation_backed_count: 18,
      direct_prospective_evidence_count: 8,
      event_inventory_sha256:
        "f0a612503c77437a8ef3736c383ac4a05e456afcccf9287e04e6ad0202e3f838",
      excluded_event_record_ids: [queueJumpEventId],
    });
    expect(receipt.lifecycle_decisions).toHaveLength(26);
    expect(
      receipt.lifecycle_decisions.filter(
        (decision) => decision.prior_lifecycle_phase === "other",
      ),
    ).toHaveLength(24);
    expect(
      receipt.lifecycle_decisions.filter(
        (decision) => decision.prior_lifecycle_phase === "launched",
      ),
    ).toHaveLength(2);

    const corrections = readJsonl<SemanticCorrection>(
      "data/semantic-corrections/corrections.jsonl",
    );
    const scopedCorrections = corrections.filter(
      (correction) => correction.source_decision === receiptPath,
    );
    expect(scopedCorrections).toHaveLength(26);
    const correctionsById = new Map(
      scopedCorrections.map((correction) => [
        correction.correction_id,
        correction,
      ]),
    );
    const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
    const eventsById = new Map(events.map((event) => [event.record_id, event]));

    for (const [index, decision] of receipt.lifecycle_decisions.entries()) {
      const expectedCorrectionId = `core-coverage-prospective-residual-${String(index + 1).padStart(2, "0")}-${slug(decision.record_id)}-planned-20260713`;
      expect(decision.sequence).toBe(index + 1);
      expect(decision.correction_id).toBe(expectedCorrectionId);
      expect(correctionsById.get(expectedCorrectionId)).toMatchObject({
        op: "patch_payload",
        record_id: decision.record_id,
        guards: {
          payload: { lifecycle_phase: decision.prior_lifecycle_phase },
        },
        patch: { set: { lifecycle_phase: "planned" } },
        cascade: [],
        source_decision: receiptPath,
      });
      expect(correctionsById.get(expectedCorrectionId)?.patch.set).toEqual({
        lifecycle_phase: "planned",
      });
      expect(eventsById.get(decision.record_id)?.payload.lifecycle_phase).toBe(
        "planned",
      );
    }

    const correctedEventIds = receipt.lifecycle_decisions.map(
      (decision) => decision.record_id,
    );
    const targetEventIds = new Set([
      ...correctedEventIds,
      ...alreadyPlannedEventIds,
    ]);
    expect(targetEventIds.size).toBe(32);
    for (const eventId of alreadyPlannedEventIds) {
      expect(correctedEventIds).not.toContain(eventId);
      expect(eventsById.get(eventId)?.payload.lifecycle_phase).toBe("planned");
    }

    const queue = readJsonl<QueueRow>(
      "data/quality/operational-coverage/priority-queue.jsonl",
    );
    expect(queue).toHaveLength(488);
    expect(queue.filter((row) => row.status === "open")).toHaveLength(0);
    expect(queue.filter((row) => row.status === "terminal")).toHaveLength(488);

    const queueJumpRow = queue.find((row) => row.gap_id === queueJumpGapId);
    expect(queueJumpRow).toMatchObject({
      gap_id: queueJumpGapId,
      event_record_id: queueJumpEventId,
      dimension: "date_precision",
      status: "terminal",
      verdict: "absent_in_source",
      decision_ids: [queueJumpDecisionId],
      resolved_occurrence_ids: [],
    });
    expect(
      receipt.lifecycle_decisions.some(
        (decision) => decision.record_id === queueJumpEventId,
      ),
    ).toBe(false);
    expect(
      scopedCorrections.some(
        (correction) => correction.record_id === queueJumpEventId,
      ),
    ).toBe(false);
    expect(eventsById.get(queueJumpEventId)?.payload.lifecycle_phase).toBe(
      "installed",
    );

    const targetRows = queue.filter((row) =>
      targetEventIds.has(row.event_record_id),
    );
    expect(targetRows).toHaveLength(104);
    expect(new Set(targetRows.map((row) => row.event_record_id))).toEqual(
      targetEventIds,
    );
    const directEvidenceEventIds = new Set(
      receipt.lifecycle_decisions
        .filter((decision) => decision.incoming_relation === null)
        .map((decision) => decision.record_id),
    );
    for (const eventId of targetEventIds) {
      const expectedDimensions = directEvidenceEventIds.has(eventId)
        ? ["timeline_subject"]
        : fullDimensions;
      expect(
        targetRows
          .filter((row) => row.event_record_id === eventId)
          .map((row) => row.dimension)
          .sort(),
      ).toEqual([...expectedDimensions].sort());
    }

    const expectedDecisionIds = targetRows.map((row) =>
      expectedLedgerDecisionId(row.event_record_id, row.dimension),
    );
    for (const [index, row] of targetRows.entries()) {
      expect(row).toMatchObject({
        status: "terminal",
        verdict: "not_applicable",
        decision_ids: [expectedDecisionIds[index]],
        resolved_occurrence_ids: [],
      });
    }

    const decisionFiles = readdirSync(join(repoRoot, decisionDir))
      .filter(
        (name) => name.startsWith(decisionPrefix) && name.endsWith(".json"),
      )
      .sort();
    expect(decisionFiles).toHaveLength(104);
    const ledgerDecisions = decisionFiles.map((name) => ({
      name,
      decision: readJson<LedgerDecision>(`${decisionDir}/${name}`),
    }));
    expect(
      ledgerDecisions.map(({ decision }) => decision.decision_id).sort(),
    ).toEqual(expectedDecisionIds.sort());
    const targetRowsByGap = new Map(targetRows.map((row) => [row.gap_id, row]));
    for (const { name, decision } of ledgerDecisions) {
      const row = targetRowsByGap.get(decision.gap_id);
      expect(name).toBe(`${decision.decision_id}.json`);
      expect(row?.decision_ids).toEqual([decision.decision_id]);
      expect(decision).toMatchObject({
        prior_verdict: "unreviewed",
        verdict: "not_applicable",
      });
    }

    const acceptedOccurrences = loadOperationalOccurrenceAcceptedDecisions();
    expect(
      acceptedOccurrences.filter((decision) =>
        decision.observation_event_record_ids.some((eventId) =>
          targetEventIds.has(eventId),
        ),
      ),
    ).toEqual([]);
    const occurrenceIdentities = loadOperationalOccurrenceIdentityRegistry();
    expect(
      occurrenceIdentities.filter((identity) =>
        identity.founding_event_record_ids.some((eventId) =>
          targetEventIds.has(eventId),
        ),
      ),
    ).toEqual([]);
  });
});
