import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  assertOperationalOccurrenceIdentityRegistry,
  deterministicOperationalOccurrenceId,
  loadOperationalOccurrenceIdentityRegistry,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-identity";
import {
  migrateOperationalOccurrenceIdentityV1Operations,
  loadOperationalOccurrenceIdentityRegistryV2,
  parseOperationalOccurrenceIdentityOperation,
  replayOperationalOccurrenceIdentityOperations,
  resolveOperationalOccurrenceIdentityV2,
  type OperationalOccurrenceIdentityOperation,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-identity-operations";

const issuedAt = "2026-07-28T00:00:00.000Z";

function establish(eventId: string): OperationalOccurrenceIdentityOperation {
  const foundingKey = `event:${eventId}`;
  return {
    schema_version: 1,
    operation_id: `establish:${eventId}`,
    kind: "establish",
    issued_at: issuedAt,
    reviewer: "fixture-reviewer",
    decision_id: `decision:${eventId}`,
    rationale: "Fixture establishes one reviewed real-world episode.",
    affected_founding_event_record_ids: [eventId],
    occurrence_id: deterministicOperationalOccurrenceId(foundingKey),
    founding_key: foundingKey,
    founding_event_record_ids: [eventId],
    resolution_cluster_id: null,
  };
}

function operationBase(operationId: string) {
  return {
    schema_version: 1 as const,
    operation_id: operationId,
    issued_at: "2026-07-28T00:00:01.000Z",
    reviewer: "fixture-reviewer",
    decision_id: `decision:${operationId}`,
    rationale: "Fixture lineage decision with exact reviewed membership.",
    affected_founding_event_record_ids: [],
  };
}

describe("operational occurrence identity registry v2", () => {
  it("losslessly preserves all 135 v1 ids and founding keys", () => {
    const v1Bytes = readFileSync(
      join(repoRoot, "data/operational-occurrence-identities/registry.jsonl"),
      "utf8",
    );
    const v1 = loadOperationalOccurrenceIdentityRegistry();
    expect(v1).toHaveLength(135);
    expect(assertOperationalOccurrenceIdentityRegistry(v1)).toEqual(v1);
    const v2 = replayOperationalOccurrenceIdentityOperations(
      migrateOperationalOccurrenceIdentityV1Operations(v1),
    );
    expect(v2).toHaveLength(135);
    expect(v2.map((entry) => entry.occurrence_id)).toEqual(
      v1.map((entry) => entry.occurrence_id),
    );
    expect(v2.map((entry) => entry.current_founding_key)).toEqual(
      v1.map((entry) => entry.founding_key),
    );
    expect(v1Bytes).toContain("occurrence:");
  });

  it("keeps ids dependent only on the immutable founding key", () => {
    const foundingKey = "event:event_fixture";
    const expected = deterministicOperationalOccurrenceId(foundingKey);
    for (const ignoredEnrichment of [
      "route_x1",
      "treatment_a",
      "2026-07-28",
      "changed label",
      "different evidence",
    ]) {
      expect(deterministicOperationalOccurrenceId(foundingKey)).toBe(expected);
      expect(deterministicOperationalOccurrenceId(`${foundingKey}:${ignoredEnrichment}`)).not.toBe(expected);
    }
  });

  it("replays an existing-survivor merge and resolves retired ids as redirects", () => {
    const left = establish("event_left");
    const right = establish("event_right");
    const merge: OperationalOccurrenceIdentityOperation = {
      ...operationBase("merge:left-right"),
      kind: "merge",
      predecessor_occurrence_ids: [left.occurrence_id, right.occurrence_id],
      survivor_occurrence_id: left.occurrence_id,
      supersedes_non_coreference_decision_ids: [],
    };
    const registry = replayOperationalOccurrenceIdentityOperations([merge, right, left]);
    expect(resolveOperationalOccurrenceIdentityV2(left.occurrence_id, registry)).toMatchObject({
      state: "active",
      occurrence_id: left.occurrence_id,
    });
    expect(resolveOperationalOccurrenceIdentityV2(right.occurrence_id, registry)).toEqual({
      state: "redirect",
      requested_ref: { kind: "occurrence_id", value: right.occurrence_id },
      occurrence_id: left.occurrence_id,
      lineage: [right.occurrence_id, left.occurrence_id],
    });
  });

  it("replays a split, correction, alias, and old founding-key redirect", () => {
    const predecessor = establish("event_predecessor");
    const first = establish("event_successor_a");
    const second = establish("event_successor_b");
    const split: OperationalOccurrenceIdentityOperation = {
      ...operationBase("split:predecessor"),
      kind: "split",
      predecessor_occurrence_id: predecessor.occurrence_id,
      successor_occurrence_ids: [first.occurrence_id, second.occurrence_id],
    };
    const correction: OperationalOccurrenceIdentityOperation = {
      ...operationBase("correct:a"),
      issued_at: "2026-07-28T00:00:02.000Z",
      kind: "correct_founding_membership",
      occurrence_id: first.occurrence_id,
      current_founding_key: "event:event_successor_a_corrected",
      current_founding_event_record_ids: ["event_successor_a_corrected"],
    };
    const alias: OperationalOccurrenceIdentityOperation = {
      ...operationBase("alias:a"),
      issued_at: "2026-07-28T00:00:03.000Z",
      kind: "add_alias",
      occurrence_id: first.occurrence_id,
      alias: "legacy-occurrence-a",
    };
    const registry = replayOperationalOccurrenceIdentityOperations([
      alias,
      split,
      correction,
      second,
      first,
      predecessor,
    ]);
    expect(resolveOperationalOccurrenceIdentityV2(predecessor.occurrence_id, registry)).toMatchObject({
      state: "retired",
      successors: [first.occurrence_id, second.occurrence_id].sort(),
    });
    expect(resolveOperationalOccurrenceIdentityV2("event:event_successor_a", registry)).toMatchObject({
      state: "redirect",
      requested_ref: { kind: "founding_key" },
      occurrence_id: first.occurrence_id,
    });
    expect(resolveOperationalOccurrenceIdentityV2("legacy-occurrence-a", registry)).toMatchObject({
      state: "redirect",
      requested_ref: { kind: "alias" },
      occurrence_id: first.occurrence_id,
    });
  });

  it("rejects duplicate founding ownership, missing dependencies, and non-coreference conflicts", () => {
    const first = establish("event_same");
    const duplicate = {
      ...establish("event_other"),
      founding_event_record_ids: ["event_same"],
      affected_founding_event_record_ids: ["event_same"],
    };
    expect(() =>
      replayOperationalOccurrenceIdentityOperations([first, duplicate])
    ).toThrow("already actively owned");
    const missingSplit: OperationalOccurrenceIdentityOperation = {
      ...operationBase("split:missing"),
      kind: "split",
      predecessor_occurrence_id: first.occurrence_id,
      successor_occurrence_ids: [
        deterministicOperationalOccurrenceId("event:missing-a"),
        deterministicOperationalOccurrenceId("event:missing-b"),
      ],
    };
    expect(() =>
      replayOperationalOccurrenceIdentityOperations([first, missingSplit])
    ).toThrow("references missing occurrence identity");

    const second = establish("event_second");
    const nonCoreference: OperationalOccurrenceIdentityOperation = {
      ...operationBase("non-coreference"),
      kind: "record_non_coreference",
      occurrence_ids: [first.occurrence_id, second.occurrence_id],
    };
    const merge: OperationalOccurrenceIdentityOperation = {
      ...operationBase("merge:conflict"),
      issued_at: "2026-07-28T00:00:02.000Z",
      kind: "merge",
      predecessor_occurrence_ids: [first.occurrence_id, second.occurrence_id],
      survivor_occurrence_id: first.occurrence_id,
      supersedes_non_coreference_decision_ids: [],
    };
    expect(() =>
      replayOperationalOccurrenceIdentityOperations([merge, nonCoreference, second, first])
    ).toThrow("conflicts with non-coreference decision");
  });

  it("strictly rejects unknown operation fields and alias/id conflicts", () => {
    expect(() =>
      parseOperationalOccurrenceIdentityOperation({
        ...establish("event_extra"),
        unexpected: true,
      })
    ).toThrow("unknown field");
    const first = establish("event_alias_owner");
    const second = establish("event_alias_target");
    const alias: OperationalOccurrenceIdentityOperation = {
      ...operationBase("alias:conflict"),
      kind: "add_alias",
      occurrence_id: first.occurrence_id,
      alias: second.occurrence_id,
    };
    expect(() =>
      replayOperationalOccurrenceIdentityOperations([alias, second, first])
    ).toThrow("conflicts with an identity");
  });

  it("requires production registry-v2 inputs but permits explicit optional fixtures", () => {
    expect(loadOperationalOccurrenceIdentityRegistryV2(repoRoot)).toHaveLength(135);
    const root = mkdtempSync(join(tmpdir(), "mta-occurrence-identity-v2-"));
    try {
      expect(() =>
        loadOperationalOccurrenceIdentityRegistryV2(root)
      ).toThrow("required operational occurrence identity registry-v2 inputs are missing");
      expect(
        loadOperationalOccurrenceIdentityRegistryV2(root, {
          optionalFixture: true,
        }),
      ).toEqual([]);
      expect(() =>
        loadOperationalOccurrenceIdentityRegistry(join(root, "missing.jsonl"))
      ).toThrow("required operational occurrence identity registry is missing");
      expect(
        loadOperationalOccurrenceIdentityRegistry(
          join(root, "missing.jsonl"),
          { optionalFixture: true },
        ),
      ).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
