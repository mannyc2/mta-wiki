import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  assertOperationalOccurrenceReviewDecisionsV2,
  migrateOperationalOccurrenceReviewDecisionV2,
  operationalOccurrenceReviewMembershipFingerprint,
  operationalOccurrenceReviewSnapshotV3Json,
  parseOperationalOccurrenceAcceptedDecisionV2,
  parseOperationalOccurrenceReviewSnapshot,
  parseOperationalOccurrenceReviewSnapshotV3,
  type OperationalOccurrenceAcceptedDecisionV2,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-review";
import {
  parseOperationalOccurrencesJsonl,
} from "@mta-wiki/pipeline/materialize/operational-occurrences";

function releaseFixture() {
  const releaseDir = join(repoRoot, "data/exports/releases/v1-rc28");
  const rows = parseOperationalOccurrencesJsonl(
    readFileSync(join(releaseDir, "operational_occurrences.jsonl"), "utf8"),
  );
  const legacy = parseOperationalOccurrenceReviewSnapshot(
    JSON.parse(
      readFileSync(
        join(releaseDir, "operational_occurrence_review_decisions.json"),
        "utf8",
      ),
    ) as unknown,
  ).decisions;
  const legacyByOccurrence = new Map(
    legacy.map((decision) => [decision.occurrence_id, decision]),
  );
  const decisions: OperationalOccurrenceAcceptedDecisionV2[] = [];
  const unresolvedRows = [];
  for (const row of rows) {
    try {
      decisions.push(
        migrateOperationalOccurrenceReviewDecisionV2(
          row,
          legacyByOccurrence.get(row.occurrence_id)!,
        ),
      );
    } catch (error) {
      if (!String(error).includes("requires explicit phase application review")) throw error;
      unresolvedRows.push(row);
    }
  }
  return {
    rows,
    legacy,
    decisions,
    unresolvedRows,
    migratedRows: rows.filter((row) =>
      decisions.some((decision) => decision.occurrence_id === row.occurrence_id)
    ),
  };
}

function repin(
  decision: OperationalOccurrenceAcceptedDecisionV2,
): OperationalOccurrenceAcceptedDecisionV2 {
  const { membership_fingerprint: _ignored, ...withoutFingerprint } = decision;
  return {
    ...withoutFingerprint,
    membership_fingerprint:
      operationalOccurrenceReviewMembershipFingerprint(withoutFingerprint),
  };
}

describe("operational occurrence exact review v2", () => {
  it("migrates 130 lossless rc28 reviews and withholds the one ambiguous phase application", () => {
    const { rows, legacy, decisions, migratedRows, unresolvedRows } = releaseFixture();
    expect(rows).toHaveLength(131);
    expect(legacy).toHaveLength(131);
    expect(decisions).toHaveLength(130);
    expect(unresolvedRows.map((row) => row.occurrence_id)).toEqual([
      "occurrence:8c987704152b459014217d44",
    ]);
    expect(decisions.every((decision) =>
      decision.review_scope === "lossless_v1_migration"
    )).toBeTrue();
    expect(decisions.every((decision) =>
      decision.applications.every((application) => application.action === "unknown")
    )).toBeTrue();
    expect(assertOperationalOccurrenceReviewDecisionsV2(decisions, migratedRows)).toEqual(
      [...decisions].sort((left, right) =>
        left.decision_id.localeCompare(right.decision_id)
      ),
    );
  });

  it("stales event, relation, phase, physical-scope, and application membership changes", () => {
    const { migratedRows, decisions } = releaseFixture();
    const original = structuredClone(decisions[0]!);
    const mutations: OperationalOccurrenceAcceptedDecisionV2[] = [
      repin({
        ...structuredClone(original),
        observation_event_record_ids: ["event_semantic_swap"],
      }),
      repin({
        ...structuredClone(original),
        observation_relation_record_ids: ["relation_semantic_swap"],
      }),
      repin({
        ...structuredClone(original),
        phase_record_ids: ["event_phase_swap"],
      }),
      repin({
        ...structuredClone(original),
        physical_scope_record_ids: ["corridor_scope_swap"],
      }),
      repin({
        ...structuredClone(original),
        applications: [{
          ...structuredClone(original.applications[0]!),
          treatment_record_id: "treatment_semantic_swap",
        }],
      }),
    ];
    for (const mutation of mutations) {
      expect(() =>
        assertOperationalOccurrenceReviewDecisionsV2(
          [mutation, ...decisions.slice(1)],
          migratedRows,
        )
      ).toThrow("stale for exact episode membership");
    }
  });

  it("canonicalizes ordering-only changes without staling membership", () => {
    const { migratedRows, decisions } = releaseFixture();
    const target = structuredClone(
      decisions.find((decision) => decision.applications.length > 1)!,
    );
    target.applications.reverse();
    target.evidence_bindings.reverse();
    target.observation_relation_record_ids.reverse();
    target.membership_fingerprint = decisions.find(
      (decision) => decision.decision_id === target.decision_id,
    )!.membership_fingerprint;
    const parsed = parseOperationalOccurrenceAcceptedDecisionV2(target);
    expect(parsed).toEqual(
      decisions.find((decision) => decision.decision_id === target.decision_id),
    );
    expect(() =>
      assertOperationalOccurrenceReviewDecisionsV2(
        decisions.map((decision) =>
          decision.decision_id === parsed.decision_id ? parsed : decision
        ),
        migratedRows,
      )
    ).not.toThrow();
  });

  it("strict-decodes snapshot v3 while legacy snapshot v1/v2 remains unchanged", () => {
    const { decisions } = releaseFixture();
    const text = operationalOccurrenceReviewSnapshotV3Json(decisions);
    const snapshot = parseOperationalOccurrenceReviewSnapshotV3(
      JSON.parse(text) as unknown,
    );
    expect(snapshot.snapshot_version).toBe(3);
    expect(snapshot.decision_schema_version).toBe(2);
    expect(snapshot.decision_count).toBe(130);
    expect(() =>
      parseOperationalOccurrenceReviewSnapshot({
        ...snapshot,
        snapshot_version: 2,
      })
    ).toThrow();
    expect(() =>
      parseOperationalOccurrenceReviewSnapshotV3({
        ...snapshot,
        unexpected: true,
      })
    ).toThrow("unknown field");
  });

  it("rejects an ambiguous plural-route by plural-treatment migration", () => {
    const { migratedRows, legacy } = releaseFixture();
    const row = structuredClone(migratedRows[0]!);
    const otherRoute = structuredClone(row.routes[0]!);
    otherRoute.route_record_id = "route_ambiguous";
    otherRoute.gtfs_route_id = "AMB";
    row.routes.push(otherRoute);
    if (row.treatment.kind === "atomic") {
      row.treatment = {
        kind: "bundle",
        bundle_family: "route_redesign",
        bundle_family_evidence_bindings: [],
        members: [
          row.treatment.member,
          {
            ...structuredClone(row.treatment.member),
            treatment_record_id: "treatment_ambiguous",
          },
        ],
      };
    }
    expect(() =>
      migrateOperationalOccurrenceReviewDecisionV2(
        row,
        legacy.find((decision) => decision.occurrence_id === row.occurrence_id)!,
      )
    ).toThrow("requires explicit route-treatment application review");
  });
});
