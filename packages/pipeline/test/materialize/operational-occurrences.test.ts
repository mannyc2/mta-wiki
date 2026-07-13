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
    const expectedCandidates = JSON.parse(
      readFileSync(join(dir, "expected_route_candidates.json"), "utf8"),
    ) as {
      candidate_count: number;
      candidates: Array<{
        occurrence_id: string;
        route_id: string;
        treatment_kind: string;
        analysis_family: string | null;
        member_treatment_families: string[];
      }>;
    };
    expect(rows).toHaveLength(126);
    expect(summary).toEqual({
      schema_version: 1,
      occurrence_count: 126,
      study_projection_eligible_count: 125,
      atomic_count: 41,
      bundle_count: 85,
      multi_route_count: 3,
      candidate_projection_count: 140,
      counts_by_exclusion_reason: { unsupported_bundle_analysis_family: 1 },
    });
    expect(review.decision_count).toBe(rows.length);
    expect(expectedCandidates.candidate_count).toBe(expectedCandidates.candidates.length);
    const q48Occurrence = rows.find(
      (row) => row.occurrence_id === "occurrence:29fc4436c22b58d52f231964",
    );
    expect(q48Occurrence).toMatchObject({
      founding_key: "event:event_q48-new-service-start-2025-06-30",
      routes: [
        {
          route_record_id: "route_q48-glen-oaks-2025",
          gtfs_route_id: "Q48",
        },
      ],
      provenance: {
        event_record_ids: ["event_q48-new-service-start-2025-06-30"],
        route_record_ids: ["route_q48-glen-oaks-2025"],
        treatment_record_ids: [
          "treatment_q48-glen-oaks-branch-2025",
          "treatment_q48-limited-stops-2025",
        ],
      },
    });
    const expectedFareFreeRoutes = ["B60", "BX18A", "BX18B", "M116", "Q4", "S46", "S96"];
    for (const [occurrenceId, onset, treatmentRecordId] of [
      ["occurrence:7a2f12e7e5c483d946eea9f4", "2023-09-24", "treatment_fare-free-fare-collection"],
      ["occurrence:89db405827ea6e206146708c", "2024-09-01", "treatment_fare-collection-resumption-2024"],
    ] as const) {
      const occurrence = rows.find((row) => row.occurrence_id === occurrenceId);
      expect(occurrence).toMatchObject({
        resolved_status: "realized",
        resolved_onset: { date: onset, precision: "day" },
        study_projection_eligible: true,
        treatment: {
          kind: "atomic",
          member: {
            treatment_record_id: treatmentRecordId,
            treatment_family: "fare_collection",
          },
        },
      });
      expect(occurrence?.routes.map((route) => route.gtfs_route_id)).toEqual(expectedFareFreeRoutes);
    }
    expect(JSON.stringify(q48Occurrence)).not.toContain("historical");
    expect(
      expectedCandidates.candidates.filter(
        (candidate) => candidate.occurrence_id === "occurrence:29fc4436c22b58d52f231964",
      ),
    ).toEqual([
      {
        occurrence_id: "occurrence:29fc4436c22b58d52f231964",
        route_id: "Q48",
        treatment_kind: "bundle",
        analysis_family: "route_redesign",
        member_treatment_families: ["service_pattern", "bus_stop_or_boarding"],
      },
    ]);
    expect(expectedCandidates.candidates.filter((candidate) => candidate.route_id === "Q110")).toEqual([
      {
        occurrence_id: "occurrence:6a6f8f8e85979d872ba2bdd7",
        route_id: "Q110",
        treatment_kind: "bundle",
        analysis_family: "route_redesign",
        member_treatment_families: ["service_pattern", "route_redesign", "bus_stop_or_boarding"],
      },
    ]);
    expect(expectedCandidates.candidates.filter((candidate) => candidate.route_id === "Q1")).toEqual([
      {
        occurrence_id: "occurrence:da2c48455650dbf4288cbd62",
        route_id: "Q1",
        treatment_kind: "bundle",
        analysis_family: "route_redesign",
        member_treatment_families: ["service_pattern", "bus_stop_or_boarding", "service_pattern"],
      },
    ]);
    expect(expectedCandidates.candidates.filter((candidate) => candidate.route_id === "Q3")).toEqual([
      {
        occurrence_id: "occurrence:2223ede249d4fd7b352c8a40",
        route_id: "Q3",
        treatment_kind: "atomic",
        analysis_family: "bus_stop_or_boarding",
        member_treatment_families: ["bus_stop_or_boarding"],
      },
    ]);
    expect(expectedCandidates.candidates.filter((candidate) => candidate.route_id === "Q8")).toEqual([
      {
        occurrence_id: "occurrence:934b8066ac790c3820f764d1",
        route_id: "Q8",
        treatment_kind: "atomic",
        analysis_family: "bus_stop_or_boarding",
        member_treatment_families: ["bus_stop_or_boarding"],
      },
    ]);
    for (const [routeId, occurrenceId] of [
      ["Q19", "occurrence:efd16a2af21563a6b38bebb2"],
      ["Q29", "occurrence:b5911e36c6aa226658a53bb3"],
      ["Q50", "occurrence:771f5f9c06cb706d0a867ecc"],
      ["Q54", "occurrence:6b643d9b210e25c1c39ca6d3"],
      ["Q59", "occurrence:654f57cceeb6697c2220a4be"],
      ["Q72", "occurrence:adf7db270c885b91a00425fb"],
    ] as const) {
      expect(expectedCandidates.candidates.filter((candidate) => candidate.occurrence_id === occurrenceId)).toEqual([
        {
          occurrence_id: occurrenceId,
          route_id: routeId,
          treatment_kind: "atomic",
          analysis_family: "bus_stop_or_boarding",
          member_treatment_families: ["bus_stop_or_boarding"],
        },
      ]);
    }
    for (const [routeId, occurrenceId, family] of [
      ["Q28", "occurrence:945379d2517d60e675fdad6f", "bus_stop_or_boarding"],
      ["Q66", "occurrence:edd2e984c259a68b769207cf", "bus_stop_or_boarding"],
      ["Q84", "occurrence:9550bacedc3391a3365a6e95", "bus_stop_or_boarding"],
      ["Q100", "occurrence:e62c82167eb4e9fac21cea9c", "bus_stop_or_boarding"],
      ["B57", "occurrence:00027f5ec1ea65794a3ae5cf", "bus_stop_or_boarding"],
      ["QM1", "occurrence:4a6debe0dddd0a7beab0950e", "bus_stop_or_boarding"],
      ["QM7", "occurrence:f07d48437c42bfd026f8f3db", "bus_stop_or_boarding"],
      ["QM16", "occurrence:172bd6cf2ba95fb530efe1ea", "service_pattern"],
      ["QM17", "occurrence:bfd2a93891d015e91bc93b81", "service_pattern"],
      ["QM18", "occurrence:1552e655aae6eb184e5bf069", "bus_stop_or_boarding"],
    ] as const) {
      expect(expectedCandidates.candidates.filter((candidate) => candidate.route_id === routeId)).toEqual([
        {
          occurrence_id: occurrenceId,
          route_id: routeId,
          treatment_kind: "atomic",
          analysis_family: family,
          member_treatment_families: [family],
        },
      ]);
    }
    for (const [routeId, occurrenceId, memberFamilies] of [
      ["Q4", "occurrence:f4781bf6f18f46b8c24e8578", ["service_pattern", "bus_stop_or_boarding"]],
      ["Q6", "occurrence:ddb7be06c9eb2b6292ef86c9", ["service_pattern", "bus_stop_or_boarding"]],
      ["Q10", "occurrence:347b3c72a4ae99cf931fff3f", ["service_pattern", "bus_stop_or_boarding"]],
      ["Q17", "occurrence:86a96bd18ca50921cbfb07bf", ["service_pattern", "bus_stop_or_boarding"]],
      ["Q58", "occurrence:5a5d5bfd5584cafa14b96d50", ["service_pattern", "bus_stop_or_boarding"]],
      ["Q32", "occurrence:18aebfff2a26e1be82b30d92", ["service_pattern", "bus_stop_or_boarding"]],
      ["Q33", "occurrence:861f40e9854e6efb535671d2", ["service_pattern", "bus_stop_or_boarding"]],
      ["Q60", "occurrence:e48912d67516283b48a05867", ["service_pattern", "bus_stop_or_boarding"]],
      ["Q69", "occurrence:0362fbd73e6243c009bd0cde", ["service_pattern", "bus_stop_or_boarding"]],
      ["Q103", "occurrence:c52f5ae327c2f0f315749440", ["service_pattern", "bus_stop_or_boarding"]],
      ["QM2", "occurrence:5abd35486a8f37bf2873fd9d", ["service_pattern", "bus_stop_or_boarding"]],
      ["QM4", "occurrence:a00bff657f5fddaaa323b4c7", ["service_pattern", "bus_stop_or_boarding"]],
      ["QM10", "occurrence:55158c93238b243e5707e43a", ["service_pattern", "bus_stop_or_boarding"]],
      ["QM15", "occurrence:287b7cae95debf96f5ee0ca8", ["service_pattern", "bus_stop_or_boarding"]],
      ["QM21", "occurrence:4750a23a8904d74dfd492589", ["service_pattern", "bus_stop_or_boarding"]],
      ["QM24", "occurrence:894538e84dd38a83e6811bcf", ["service_pattern", "bus_stop_or_boarding"]],
      ["QM34", "occurrence:934c000394ad0200c1c110a0", ["service_pattern", "bus_stop_or_boarding"]],
    ] as const) {
      expect(expectedCandidates.candidates.filter((candidate) => candidate.occurrence_id === occurrenceId)).toEqual([
        {
          occurrence_id: occurrenceId,
          route_id: routeId,
          treatment_kind: "bundle",
          analysis_family: "route_redesign",
          member_treatment_families: memberFamilies,
        },
      ]);
    }
    for (const [routeId, occurrenceId, memberFamilies] of [
      ["Q5", "occurrence:88e85e2d2475090abec9877a", ["service_pattern", "service_pattern"]],
      ["Q11", "occurrence:28e219b4524b102cdd9dd1d0", ["service_pattern", "service_pattern", "bus_stop_or_boarding"]],
      ["Q13", "occurrence:de25867eefd234ee717d5477", ["bus_stop_or_boarding", "service_pattern"]],
      ["Q22", "occurrence:348b29a03ef80cb34b909b32", ["service_pattern", "service_pattern", "service_pattern", "bus_stop_or_boarding"]],
      ["Q23", "occurrence:267aaa5473dee60fb3a4141d", ["service_pattern", "service_pattern", "service_pattern", "service_pattern", "bus_stop_or_boarding"]],
      ["Q26", "occurrence:9cc235d476d6671abef6061f", ["service_pattern", "service_pattern", "service_pattern", "service_pattern", "bus_stop_or_boarding"]],
      ["Q27", "occurrence:012a7db8f83a7369d830cfbe", ["service_pattern", "service_pattern", "bus_stop_or_boarding", "bus_stop_or_boarding"]],
      ["Q35", "occurrence:1837c6c5074899a254d2f432", ["bus_stop_or_boarding", "service_pattern", "service_pattern"]],
      ["Q38", "occurrence:ba2df83e40caa33e0414df00", ["service_pattern", "service_pattern", "bus_stop_or_boarding"]],
      ["Q43", "occurrence:c88a94143d770aa926bd2457", ["service_pattern", "bus_stop_or_boarding", "bus_stop_or_boarding"]],
      ["Q47", "occurrence:8fe6a36ee85ea925934f0090", ["service_pattern", "bus_stop_or_boarding", "service_pattern", "service_pattern"]],
      ["Q65", "occurrence:e3e892497a55c312fb79e181", ["service_pattern", "service_pattern", "service_pattern", "service_pattern", "service_pattern", "bus_stop_or_boarding"]],
      ["Q76", "occurrence:11142a33a2e70c97f1f4bc37", ["service_pattern", "service_pattern", "bus_stop_or_boarding"]],
      ["Q77", "occurrence:6e77fd301c480a7727683f26", ["bus_stop_or_boarding", "service_pattern", "bus_stop_or_boarding"]],
      ["Q85", "occurrence:7a4cb90846e515964b1d7198", ["service_pattern", "service_pattern", "bus_stop_or_boarding"]],
      ["Q101", "occurrence:17599e5e02011a49dbf3a39e", ["service_pattern", "service_pattern", "bus_stop_or_boarding"]],
      ["Q102", "occurrence:6db5b36a1964f9acbc9a8c28", ["service_pattern", "service_pattern"]],
      ["Q111", "occurrence:b882f54df6c24c9a1b7b89f6", ["bus_stop_or_boarding", "bus_stop_or_boarding"]],
      ["B62", "occurrence:18bf68576411afed0305dfed", ["service_pattern", "service_pattern"]],
      ["QM12", "occurrence:59ecd060600071fd96d07ab4", ["service_pattern", "service_pattern", "bus_stop_or_boarding"]],
      ["QM25", "occurrence:9170c983a3c76974673a0ce6", ["service_pattern", "bus_stop_or_boarding"]],
    ] as const) {
      expect(expectedCandidates.candidates.filter((candidate) => candidate.occurrence_id === occurrenceId)).toEqual([
        {
          occurrence_id: occurrenceId,
          route_id: routeId,
          treatment_kind: "bundle",
          analysis_family: "route_redesign",
          member_treatment_families: memberFamilies,
        },
      ]);
    }
    for (const [routeId, occurrenceId] of [
      ["Q14", "occurrence:b0386b3cb7a23934798f0a21"],
      ["Q51", "occurrence:ce5829e0060fb3a0834fc99b"],
      ["Q115", "occurrence:f738d53af84e374b3b108739"],
      ["QM65", "occurrence:7497bde52fc4c2d6bedb0ec9"],
    ] as const) {
      expect(expectedCandidates.candidates.filter((candidate) => candidate.occurrence_id === occurrenceId)).toEqual([
        {
          occurrence_id: occurrenceId,
          route_id: routeId,
          treatment_kind: "atomic",
          analysis_family: "service_pattern",
          member_treatment_families: ["service_pattern"],
        },
      ]);
    }
    for (const [routeId, occurrenceId, memberFamilies] of [
      ["Q61", "occurrence:5d51147fc80a669bfb81da45", ["service_pattern", "service_pattern", "service_pattern"]],
      ["Q80", "occurrence:8ceb4179de2ab8a2852347df", ["service_pattern", "service_pattern"]],
      ["Q82", "occurrence:136f3d32a53a62f096f8f44e", ["service_pattern", "bus_stop_or_boarding", "service_pattern", "service_pattern"]],
      ["Q89", "occurrence:2748598653b74d33fcdce3d1", ["bus_stop_or_boarding", "service_pattern"]],
    ] as const) {
      expect(expectedCandidates.candidates.filter((candidate) => candidate.occurrence_id === occurrenceId)).toEqual([
        {
          occurrence_id: occurrenceId,
          route_id: routeId,
          treatment_kind: "bundle",
          analysis_family: "route_redesign",
          member_treatment_families: memberFamilies,
        },
      ]);
    }
    expect(
      expectedCandidates.candidates.filter(
        (candidate) => candidate.occurrence_id === "occurrence:4a1a43f2512f477e5c68f917",
      ),
    ).toEqual([
      {
        occurrence_id: "occurrence:4a1a43f2512f477e5c68f917",
        route_id: "Q25",
        treatment_kind: "bundle",
        analysis_family: "route_redesign",
        member_treatment_families: ["service_pattern", "bus_stop_or_boarding"],
      },
    ]);
    const finalPromotionRoutes = [
      "Q2", "Q9", "Q12", "Q15", "Q16", "Q18", "Q20", "Q24", "Q30", "Q31", "Q36", "Q37", "Q39",
      "Q40", "Q41", "Q42", "Q45", "Q46", "Q49", "Q52+", "Q55", "Q56", "Q63", "Q64", "Q67", "Q74",
      "Q75", "Q83", "Q86", "Q87", "Q88", "Q90", "Q98", "Q104", "Q112", "Q113", "Q114", "QM5", "QM6",
      "QM8", "QM11", "QM20", "QM31", "QM32", "QM35", "QM36", "QM40", "QM42", "QM44", "QM63", "QM64",
      "QM68",
    ];
    for (const routeId of finalPromotionRoutes) {
      expect(expectedCandidates.candidates.filter((candidate) => candidate.route_id === routeId)).toHaveLength(1);
    }
    expect(expectedCandidates.candidates.filter((candidate) => candidate.route_id === "Q52+")).toEqual([
      {
        occurrence_id: "occurrence:70956fca3524ebf56de16ef4",
        route_id: "Q52+",
        treatment_kind: "bundle",
        analysis_family: "route_redesign",
        member_treatment_families: ["service_pattern", "fare_collection"],
      },
    ]);
    for (const forbiddenRouteId of ["Q15A", "Q20A", "Q20B", "Q21", "Q34", "QM3"]) {
      expect(expectedCandidates.candidates.some((candidate) => candidate.route_id === forbiddenRouteId)).toBe(false);
    }
    expect(expectedCandidates.candidates.some((candidate) => /limited/iu.test(candidate.route_id))).toBe(false);
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
