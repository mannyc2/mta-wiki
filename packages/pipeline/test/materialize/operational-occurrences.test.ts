import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { OperationalAnchorReviewDecision } from "@mta-wiki/pipeline/materialize/operational-anchor-review";
import {
  deterministicOperationalOccurrenceId,
  newOperationalOccurrenceIdentityEntry,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-identity";
import type { OperationalOccurrenceAcceptedDecision } from "@mta-wiki/pipeline/materialize/operational-occurrence-review";
import {
  assertOperationalOccurrenceReviewDecisions,
  operationalOccurrenceReviewDecisions,
  parseOperationalOccurrenceReviewSnapshot,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-review";
import {
  computeOperationalOccurrences,
  operationalOccurrencesJsonl,
  parseOperationalOccurrencesJsonl,
  parseOperationalOccurrenceSummary,
  summarizeOperationalOccurrences,
} from "@mta-wiki/pipeline/materialize/operational-occurrences";
import { parseReleaseManifest } from "@mta-wiki/pipeline/materialize/export-release";
import type { RouteAnchorRow } from "@mta-wiki/pipeline/materialize/route-anchors";

const sourceId = "official_fixture";
const evidenceId = `${sourceId}#b1`;

function record(id: string, kind: MtaCanonicalRecord["record_kind"], payload: JsonObject = {}): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: sourceId,
    local_observation_id: id,
    display_name: id,
    payload,
    evidence_refs: [{ source_id: sourceId, evidence_id: evidenceId, block_id: "b1" }],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-12T00:00:00.000Z",
  };
}

function relation(id: string, kind: string, objectId: string): MtaCanonicalRecord {
  return record(id, "relation", {
    relation_kind: kind,
    subject_id: "project_fixture",
    object_id: objectId,
    assertion_status: "delivered",
    as_of_date: "2026-06-07",
  });
}

function fixture() {
  const records = [
    record("source_official_fixture", "source", {
      publisher: "MTA",
      retrieved_at: "2026-06-07T14:12:00.000Z",
      retrieved_date_normalized: "2026-06-07",
    }),
    record("project_fixture", "project"),
    record("event_fixture", "event", {
      event_family: "implementation",
      lifecycle_phase: "modified",
      date_text: "August 31, 2025",
      date_normalized: "2025-08-31",
      date_precision: "day",
    }),
    record("route_x1", "route", { route_id: "X1" }),
    record("route_x2", "route", { route_id: "X2" }),
    record("treatment_a", "treatment_component", { treatment_family: "service_pattern" }),
    record("treatment_b", "treatment_component", { treatment_family: "service_pattern" }),
    relation("relation_timeline", "has_timeline_event", "event_fixture"),
    relation("relation_route_x1", "affects_route", "route_x1"),
    relation("relation_route_x2", "affects_route", "route_x2"),
    relation("relation_treatment_a", "has_treatment", "treatment_a"),
    relation("relation_treatment_b", "has_treatment", "treatment_b"),
  ];
  const routeAnchors: RouteAnchorRow[] = [
    {
      gtfs_route_id: "X1",
      canonical_route_record_id: "route_x1",
      variant_record_ids: [],
      aliases: [],
      disposition: "true_route",
      anchor_reason: "fixture",
    },
    {
      gtfs_route_id: "X2",
      canonical_route_record_id: "route_x2",
      variant_record_ids: [],
      aliases: [],
      disposition: "true_route",
      anchor_reason: "fixture",
    },
  ];
  const foundingKey = "event:event_fixture";
  const identity = newOperationalOccurrenceIdentityEntry({
    foundingKey,
    foundingEventRecordIds: ["event_fixture"],
    issuedAt: "2026-07-12T00:00:00.000Z",
  });
  return { records, routeAnchors, foundingKey, identity };
}

function binding(role: OperationalAnchorReviewDecision["evidence_bindings"][number]["role"], recordId: string) {
  return { role, record_id: recordId, source_id: sourceId, evidence_id: evidenceId };
}

function anchorDecision(input: {
  id: string;
  routeId: "route_x1" | "route_x2";
  treatmentId: "treatment_a" | "treatment_b";
}): OperationalAnchorReviewDecision {
  const routeRelation = input.routeId === "route_x1" ? "relation_route_x1" : "relation_route_x2";
  const treatmentRelation = input.treatmentId === "treatment_a" ? "relation_treatment_a" : "relation_treatment_b";
  return {
    schema_version: 1,
    decision_id: input.id,
    review_state: "accepted",
    accepted_at: "2026-07-12T00:00:00.000Z",
    reviewer: "fixture-reviewer",
    rationale: "Fixture review with exact source bindings.",
    source_id: sourceId,
    event_record_id: "event_fixture",
    timeline_relation_record_id: "relation_timeline",
    route_record_id: input.routeId,
    route_scope_relation_record_id: routeRelation,
    treatment_record_id: input.treatmentId,
    treatment_scope_relation_record_id: treatmentRelation,
    treatment_family: "service_pattern",
    expected_operational_date: "2025-08-31",
    expected_date_precision: "day",
    evidence_bindings: [
      binding("event_date", "event_fixture"),
      binding("timeline_relation", "relation_timeline"),
      binding("route_identity", input.routeId),
      binding("route_scope", routeRelation),
      binding("treatment_definition", input.treatmentId),
      binding("treatment_scope", treatmentRelation),
      binding("route_treatment_event_bridge", "event_fixture"),
    ],
  };
}

function explicitBundleDecision(): OperationalOccurrenceAcceptedDecision {
  return {
    schema_version: 1,
    decision_id: "fixture-bundle-review",
    review_state: "approved",
    accepted_at: "2026-07-12T00:00:00.000Z",
    reviewer: "fixture-reviewer",
    rationale: "Two source-stated service-pattern members form one reviewed route-redesign bundle.",
    occurrence_id: deterministicOperationalOccurrenceId("event:event_fixture"),
    founding_key: "event:event_fixture",
    observation_event_record_ids: ["event_fixture"],
    observation_relation_record_ids: [
      "relation_route_x1",
      "relation_timeline",
      "relation_treatment_a",
      "relation_treatment_b",
    ],
    resolved_status: "realized",
    resolved_onset: {
      date: "2025-08-31",
      precision: "day",
      evidence_bindings: [
        { ...binding("event_date", "event_fixture") },
        { ...binding("timeline_relation", "relation_timeline") },
      ],
    },
    routes: [
      {
        route_record_id: "route_x1",
        gtfs_route_id: "X1",
        evidence_bindings: [
          { ...binding("route_identity", "route_x1") },
          { ...binding("route_scope", "relation_route_x1") },
        ],
      },
    ],
    treatment_scope_kind: "bundle",
    treatment: {
      kind: "bundle",
      analysis_family: "route_redesign",
      analysis_family_evidence_bindings: [
        {
          role: "bundle_analysis_family",
          record_id: "project_fixture",
          source_id: sourceId,
          evidence_id: evidenceId,
        },
      ],
      members: [
        {
          treatment_record_id: "treatment_a",
          treatment_family: "service_pattern",
          evidence_bindings: [
            { ...binding("treatment_definition", "treatment_a") },
            { ...binding("treatment_scope", "relation_treatment_a") },
          ],
        },
        {
          treatment_record_id: "treatment_b",
          treatment_family: "service_pattern",
          evidence_bindings: [
            { ...binding("treatment_definition", "treatment_b") },
            { ...binding("treatment_scope", "relation_treatment_b") },
          ],
        },
      ],
    },
  };
}

describe("operational occurrences v1", () => {
  it("strict-decodes the manifest-v3 migration fixture and verifies every addressed byte", () => {
    const dir = join(repoRoot, "data", "contract-fixtures", "operational-occurrences-v1");
    const manifest = parseReleaseManifest(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as unknown);
    expect(manifest.manifest_version).toBe(3);
    for (const [name, metadata] of Object.entries(manifest.files)) {
      const bytes = readFileSync(join(dir, name));
      expect(bytes.length).toBe(metadata.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(metadata.sha256);
    }
    const rows = parseOperationalOccurrencesJsonl(readFileSync(join(dir, manifest.pointers.operational_occurrences!), "utf8"));
    const summary = parseOperationalOccurrenceSummary(
      JSON.parse(readFileSync(join(dir, manifest.pointers.operational_occurrence_summary!), "utf8")) as unknown,
    );
    const review = parseOperationalOccurrenceReviewSnapshot(
      JSON.parse(readFileSync(join(dir, manifest.pointers.operational_occurrence_review_decisions!), "utf8")) as unknown,
    );
    expect(rows).toHaveLength(4);
    expect(summary.candidate_projection_count).toBe(6);
    expect(review.decision_count).toBe(rows.length);
  });

  it("groups accepted atomic anchor reviews into one stable plural-route occurrence", () => {
    const input = fixture();
    const first = anchorDecision({ id: "x1-a", routeId: "route_x1", treatmentId: "treatment_a" });
    const second = anchorDecision({ id: "x2-a", routeId: "route_x2", treatmentId: "treatment_a" });
    const oneRoute = computeOperationalOccurrences(input.records, input.routeAnchors, {
      reviewDecisions: [first],
      identityRegistry: [input.identity],
    });
    const twoRoutes = computeOperationalOccurrences(input.records, input.routeAnchors, {
      reviewDecisions: [second, first],
      identityRegistry: [input.identity],
    });
    const reordered = computeOperationalOccurrences(input.records, [...input.routeAnchors].reverse(), {
      reviewDecisions: [first, second],
      identityRegistry: [input.identity],
    });

    expect(twoRoutes).toHaveLength(1);
    expect(twoRoutes[0]?.occurrence_id).toBe(oneRoute[0]?.occurrence_id);
    expect(twoRoutes[0]?.routes.map((route) => route.route_record_id)).toEqual(["route_x1", "route_x2"]);
    expect(twoRoutes[0]?.treatment.kind).toBe("atomic");
    expect(summarizeOperationalOccurrences(twoRoutes).candidate_projection_count).toBe(2);
    expect(operationalOccurrencesJsonl(twoRoutes)).toBe(operationalOccurrencesJsonl(reordered));
    expect(parseOperationalOccurrencesJsonl(operationalOccurrencesJsonl(twoRoutes))).toEqual(twoRoutes);

    const unofficialRecords = structuredClone(input.records);
    unofficialRecords.find((record) => record.record_id === "source_official_fixture")!.payload.publisher = "Private blog";
    expect(() =>
      computeOperationalOccurrences(unofficialRecords, input.routeAnchors, {
        reviewDecisions: [first, second],
        identityRegistry: [input.identity],
      }),
    ).toThrow(/official|untrusted/u);
  });

  it("retains a multi-member migrated review as one excluded bundle instead of coercing an atomic family", () => {
    const input = fixture();
    const rows = computeOperationalOccurrences(input.records, input.routeAnchors, {
      reviewDecisions: [
        anchorDecision({ id: "x1-a", routeId: "route_x1", treatmentId: "treatment_a" }),
        anchorDecision({ id: "x1-b", routeId: "route_x1", treatmentId: "treatment_b" }),
      ],
      identityRegistry: [input.identity],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.treatment).toMatchObject({
      kind: "bundle",
      bundle_family: null,
      members: [
        { treatment_record_id: "treatment_a", treatment_family: "service_pattern" },
        { treatment_record_id: "treatment_b", treatment_family: "service_pattern" },
      ],
    });
    expect(rows[0]?.exclusion_reasons).toEqual(["unsupported_bundle_analysis_family"]);
    expect(rows[0]?.study_projection_eligible).toBe(false);
    expect(summarizeOperationalOccurrences(rows).candidate_projection_count).toBe(0);
  });

  it("admits an explicitly reviewed bundle while preserving authority, ownership, and temporal provenance", () => {
    const input = fixture();
    const decision = explicitBundleDecision();
    const explicitIdentity = { ...input.identity, decision_id: decision.decision_id };
    const rows = computeOperationalOccurrences(input.records, input.routeAnchors, {
      reviewDecisions: [],
      occurrenceReviewDecisions: [decision],
      identityRegistry: [explicitIdentity],
    });
    const row = rows[0]!;

    expect(row.treatment).toMatchObject({ kind: "bundle", bundle_family: "route_redesign" });
    expect(row.treatment.kind === "bundle" ? row.treatment.members.map((member) => member.treatment_record_id) : []).toEqual([
      "treatment_a",
      "treatment_b",
    ]);
    expect(row.study_projection_eligible).toBe(true);
    expect(row.resolved_onset.publication_dates).toEqual([]);
    expect(row.resolved_onset.retrieval_dates).toEqual(["2026-06-07"]);
    expect(row.observations[0]?.document_time_dates[0]?.raw).toBe("August 31, 2025");
    expect(row.observations[0]?.status_as_of_dates).toEqual(["2026-06-07"]);
    const topLedger = new Set(row.evidence_bindings.map((entry) => JSON.stringify(entry)));
    expect(
      row.treatment.kind === "bundle" &&
        row.treatment.bundle_family_evidence_bindings.every((entry) => topLedger.has(JSON.stringify(entry))),
    ).toBe(true);

    const wrongRouteOwner = structuredClone(decision);
    wrongRouteOwner.routes[0]!.evidence_bindings[0]!.record_id = "project_fixture";
    expect(() =>
      computeOperationalOccurrences(input.records, input.routeAnchors, {
        reviewDecisions: [],
        occurrenceReviewDecisions: [wrongRouteOwner],
        identityRegistry: [explicitIdentity],
      }),
    ).toThrow("route_identity must bind route_x1");

    const wrongTreatmentOwner = structuredClone(decision);
    if (wrongTreatmentOwner.treatment.kind !== "bundle") throw new Error("fixture drift");
    wrongTreatmentOwner.treatment.members[0]!.evidence_bindings[0]!.record_id = "treatment_b";
    expect(() =>
      computeOperationalOccurrences(input.records, input.routeAnchors, {
        reviewDecisions: [],
        occurrenceReviewDecisions: [wrongTreatmentOwner],
        identityRegistry: [explicitIdentity],
      }),
    ).toThrow("treatment_definition must bind treatment_a");

    const wrongBundleContext = structuredClone(decision);
    if (wrongBundleContext.treatment.kind !== "bundle") throw new Error("fixture drift");
    wrongBundleContext.treatment.analysis_family_evidence_bindings[0]!.record_id = "treatment_a";
    expect(() =>
      computeOperationalOccurrences(input.records, input.routeAnchors, {
        reviewDecisions: [],
        occurrenceReviewDecisions: [wrongBundleContext],
        identityRegistry: [explicitIdentity],
      }),
    ).toThrow("bundle_analysis_family must bind event/project/source context");

    const unofficialRecords = structuredClone(input.records);
    unofficialRecords.find((record) => record.record_id === "source_official_fixture")!.payload.publisher = "Community blog";
    expect(() =>
      computeOperationalOccurrences(unofficialRecords, input.routeAnchors, {
        reviewDecisions: [],
        occurrenceReviewDecisions: [decision],
        identityRegistry: [explicitIdentity],
      }),
    ).toThrow("not resolved to an official public-agency publisher");

    expect(() =>
      computeOperationalOccurrences(input.records, input.routeAnchors, {
        reviewDecisions: [],
        occurrenceReviewDecisions: [decision],
        identityRegistry: [input.identity],
      }),
    ).toThrow("does not match registry decision_id null");

    const reviews = operationalOccurrenceReviewDecisions(rows, [], [decision]);
    expect(() => assertOperationalOccurrenceReviewDecisions(reviews, rows)).not.toThrow();
    const staleCases = [
      (review: (typeof reviews)[number]) => {
        review.resolved_onset.evidence_bindings[0]!.evidence_id = `${sourceId}#tampered-onset`;
      },
      (review: (typeof reviews)[number]) => {
        review.routes[0]!.evidence_bindings[0]!.evidence_id = `${sourceId}#tampered-route`;
      },
      (review: (typeof reviews)[number]) => {
        if (review.treatment.kind !== "bundle") throw new Error("fixture drift");
        review.treatment.members[0]!.evidence_bindings[0]!.evidence_id = `${sourceId}#tampered-member`;
      },
      (review: (typeof reviews)[number]) => {
        if (review.treatment.kind !== "bundle") throw new Error("fixture drift");
        review.treatment.bundle_family_evidence_bindings[0]!.evidence_id = `${sourceId}#tampered-family`;
      },
    ];
    for (const tamper of staleCases) {
      const stale = structuredClone(reviews);
      tamper(stale[0]!);
      expect(() => assertOperationalOccurrenceReviewDecisions(stale, rows)).toThrow("is stale");
    }
    const tamperedRow = structuredClone(rows);
    tamperedRow[0]!.resolved_onset.evidence_bindings[0]!.evidence_id = `${sourceId}#tampered-row-onset`;
    expect(() => assertOperationalOccurrenceReviewDecisions(reviews, tamperedRow)).toThrow(/stale|missing from the top-level evidence ledger/u);
  });
});
