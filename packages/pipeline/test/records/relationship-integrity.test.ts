import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  loadRelationshipContract,
  type LoadedRelationshipContract,
} from "@mta-wiki/db/relationship-contract";
import type { JsonObject, MtaCanonicalRecord, MtaObservationKind } from "@mta-wiki/db/types";
import type { EvidenceBlockIndex } from "@mta-wiki/pipeline/sources/evidence-block-index";
import {
  loadRelationshipFamilyReviewLedger,
  parseRelationshipFamilyReviewLedger,
  RELATIONSHIP_FAMILY_REVIEW_RELATIVE_PATH,
  RELATIONSHIP_FAMILY_REVIEW_SHA256,
} from "@mta-wiki/pipeline/records/relationship-family-review";
import {
  auditRelationshipGraph,
  type RelationshipFindingCode,
} from "@mta-wiki/pipeline/records/relationship-integrity";
import type { SemanticCorrectionEntry } from "@mta-wiki/pipeline/records/semantic-corrections";

const SOURCE_ID = "src";
const BLOCK_ID = "p001_c0001";
const BLOCK_HASH = "sha256:fixture";

function record(
  recordId: string,
  kind: MtaObservationKind,
  payload: JsonObject = {},
  extra: Partial<MtaCanonicalRecord> = {},
): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: kind,
    source_id: SOURCE_ID,
    source_ids: [SOURCE_ID],
    local_observation_id: `${recordId}_local`,
    local_observation_ids: [`${recordId}_local`],
    display_name: recordId,
    payload,
    evidence_refs: kind === "relation"
      ? [{
          source_id: SOURCE_ID,
          evidence_id: `${SOURCE_ID}#${BLOCK_ID}`,
          source_path: `raw/sources/${SOURCE_ID}/blocks.jsonl`,
          page_number: 1,
          block_id: BLOCK_ID,
          text_sha256: BLOCK_HASH,
        }]
      : [],
    submission_ids: [`sub_${recordId}`],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-15T00:00:00.000Z",
    ...extra,
  };
}

function source(): MtaCanonicalRecord {
  return record("source_src", "source", { source_id: SOURCE_ID }, {
    local_observation_id: "source_src",
    local_observation_ids: ["source_src"],
  });
}

function project(): MtaCanonicalRecord {
  return record("project_alpha", "project", { project_name: "Alpha" });
}

function route(recordId = "route_a"): MtaCanonicalRecord {
  return record(recordId, "route", { route_id: "A" });
}

function relation(
  recordId: string,
  subjectId: string,
  objectId: string,
  extra: Partial<MtaCanonicalRecord> = {},
): MtaCanonicalRecord {
  return record(recordId, "relation", {
    relation_kind: "serves_route",
    relation_family: "route_scope",
    subject_id: subjectId,
    subject_local_observation_id: `${subjectId}_local`,
    object_id: objectId,
    object_local_observation_id: `${objectId}_local`,
    assertion_status: "delivered",
    as_of_date: "2026-01-01",
  }, extra);
}

function evidenceIndex(blockId = BLOCK_ID): EvidenceBlockIndex {
  return {
    sourceIds: new Set([SOURCE_ID]),
    byRef: new Map([[`${SOURCE_ID}\0${blockId}`, {
      source_id: SOURCE_ID,
      block_id: blockId,
      resolved_block_id: blockId,
      page_number: 1,
      source_path: `raw/sources/${SOURCE_ID}/blocks.jsonl`,
      raw_text_sha256: BLOCK_HASH,
    }]]),
  };
}

function hardenedContract(): LoadedRelationshipContract {
  const loaded = loadRelationshipContract();
  return {
    ...loaded,
    contract: {
      ...loaded.contract,
      finding_codes: {
        ...loaded.contract.finding_codes,
        REL_FAMILY_TYPE_SUSPECT: {
          default_severity: "warning",
          enforcement_eligible: true,
        },
        REL_FAMILY_TYPE_SUSPECT_REVIEWED: {
          default_severity: "warning",
          enforcement_eligible: false,
        },
      },
    },
  };
}

function audit(
  records: MtaCanonicalRecord[],
  options: { corrections?: SemanticCorrectionEntry[]; index?: EvidenceBlockIndex; mode?: "warn" | "enforce" } = {},
) {
  return auditRelationshipGraph(records, {
    mode: options.mode ?? "warn",
    contract: hardenedContract(),
    evidenceIndex: options.index ?? evidenceIndex(),
    semanticCorrections: options.corrections ?? [],
    includeOrphans: false,
  });
}

function codes(result: ReturnType<typeof audit>): RelationshipFindingCode[] {
  return result.findings.map((finding) => finding.code);
}

function supersede(oldId: string, survivorId: string): SemanticCorrectionEntry {
  return {
    correction_id: "test-supersession",
    op: "supersede_record",
    record_id: oldId,
    guards: { payload: {} },
    patch: { survivor_record_id: survivorId },
    cascade: [],
    reason: "fixture",
    source_decision: "fixture",
    reviewed_at: "2026-07-15T00:00:00Z",
    provenance: "human",
  };
}

const M86_SOURCE_ID = "m86_sbs_progress_report_2017";
const M86_LAUNCH_EVIDENCE_ID = `${M86_SOURCE_ID}#p006_c0005`;
const M86_PREVIOUS_SERVICE_EVIDENCE_ID = `${M86_SOURCE_ID}#p008_c0008`;
const M86_LAUNCH_HASH =
  "sha256:57fac219b06bcddd3aaf8f124a17eeb88bef33ee30911325ac25e85c781663b6";
const M86_PREVIOUS_SERVICE_HASH =
  "sha256:ceb0835506f88894e52e69f0ec8f5fc1fb37348ddc68b17ac1756e91b0a8db3e";

function sourceFor(sourceId: string): MtaCanonicalRecord {
  return record(`source_${sourceId}`, "source", { source_id: sourceId }, {
    source_id: sourceId,
    source_ids: [sourceId],
    local_observation_id: `source_${sourceId}`,
    local_observation_ids: [`source_${sourceId}`],
  });
}

function reviewedM86Fixture(
  launchHash = M86_LAUNCH_HASH,
): {
  records: MtaCanonicalRecord[];
  index: EvidenceBlockIndex;
} {
  const previous = record("route_m86-local", "route", {
    route_name: "M86 Local",
  }, {
    source_id: M86_SOURCE_ID,
    source_ids: [M86_SOURCE_ID],
    local_observation_id: "route_m86_local_2017",
    local_observation_ids: ["route_m86_local_2017"],
  });
  const successor = record("route_m86-sbs", "route", {
    route_name: "M86 SBS",
  }, {
    source_id: M86_SOURCE_ID,
    source_ids: [M86_SOURCE_ID],
    local_observation_id: "route_m86_sbs_2017",
    local_observation_ids: ["route_m86_sbs_2017"],
  });
  const reviewedRelation = record(
    "relation_rel-m86-local-replaced-by-m86-sbs",
    "relation",
    {
      relation_kind: "replaced_by",
      relation_family: "timeline_context",
      subject_id: previous.record_id,
      subject_local_observation_id: previous.local_observation_id,
      object_id: successor.record_id,
      object_local_observation_id: successor.local_observation_id,
      assertion_status: "unknown",
      as_of_date: "2017",
    },
    {
      source_id: M86_SOURCE_ID,
      source_ids: [M86_SOURCE_ID],
      local_observation_id: "rel_m86_local_replaced_by_m86_sbs",
      local_observation_ids: ["rel_m86_local_replaced_by_m86_sbs"],
      evidence_refs: [
        {
          source_id: M86_SOURCE_ID,
          evidence_id: M86_LAUNCH_EVIDENCE_ID,
          source_path: `raw/sources/${M86_SOURCE_ID}/blocks.jsonl`,
          page_number: 6,
          block_id: "p006_c0005",
          text_sha256: launchHash,
        },
        {
          source_id: M86_SOURCE_ID,
          evidence_id: M86_PREVIOUS_SERVICE_EVIDENCE_ID,
          source_path: `raw/sources/${M86_SOURCE_ID}/blocks.jsonl`,
          page_number: 8,
          block_id: "p008_c0008",
          text_sha256: M86_PREVIOUS_SERVICE_HASH,
        },
      ],
    },
  );
  return {
    records: [sourceFor(M86_SOURCE_ID), previous, successor, reviewedRelation],
    index: {
      sourceIds: new Set([M86_SOURCE_ID]),
      byRef: new Map([
        [`${M86_SOURCE_ID}\0p006_c0005`, {
          source_id: M86_SOURCE_ID,
          block_id: "p006_c0005",
          resolved_block_id: "p006_c0005",
          page_number: 6,
          source_path: `raw/sources/${M86_SOURCE_ID}/blocks.jsonl`,
          raw_text_sha256: launchHash,
        }],
        [`${M86_SOURCE_ID}\0p008_c0008`, {
          source_id: M86_SOURCE_ID,
          block_id: "p008_c0008",
          resolved_block_id: "p008_c0008",
          page_number: 8,
          source_path: `raw/sources/${M86_SOURCE_ID}/blocks.jsonl`,
          raw_text_sha256: M86_PREVIOUS_SERVICE_HASH,
        }],
      ]),
    },
  };
}

describe("relationship integrity contract", () => {
  it("accepts a canonical, typed, evidence-backed edge", () => {
    const result = audit([source(), project(), route(), relation("relation_valid", "project_alpha", "route_a")]);
    expect(result.summary.contract_covered_relation_count).toBe(1);
    expect(codes(result)).toEqual([]);
    expect(result.summary.findings_by_code).toMatchObject({
      REL_ENDPOINT_DANGLING: 0,
      REL_ENDPOINT_LOCAL_ONLY: 0,
      REL_ENDPOINT_SUPERSEDED: 0,
      REL_ENDPOINT_TYPE_INVALID: 0,
      REL_EVIDENCE_MISSING: 0,
      REL_EVIDENCE_UNRESOLVED: 0,
      REL_DUPLICATE_IDENTITY: 0,
      REL_CONFLICTING_EDGE: 0,
    });
  });

  it("distinguishes dangling, local-only, superseded, and ambiguous endpoints", () => {
    const dangling = audit([source(), project(), relation("relation_dangling", "project_alpha", "route_missing")]);
    expect(codes(dangling)).toContain("REL_ENDPOINT_DANGLING");

    const localTarget = route("route_local_target");
    const localOnly = relation("relation_local_only", "project_alpha", "route_missing", {
      payload: {
        relation_kind: "serves_route",
        relation_family: "route_scope",
        subject_id: "project_alpha",
        subject_local_observation_id: "project_alpha_local",
        object_id: "route_missing",
        object_local_observation_id: "route_local_target_local",
      },
    });
    expect(codes(audit([source(), project(), localTarget, localOnly]))).toContain("REL_ENDPOINT_LOCAL_ONLY");

    const survivor = route("route_survivor");
    const superseded = audit(
      [source(), project(), survivor, relation("relation_superseded", "project_alpha", "route_old")],
      { corrections: [supersede("route_old", "route_survivor")] },
    );
    expect(codes(superseded)).toContain("REL_ENDPOINT_SUPERSEDED");

    const first = route("route_first");
    first.record_aliases = ["route_shared"];
    const second = route("route_second");
    second.record_aliases = ["route_shared"];
    const ambiguous = audit([source(), project(), first, second, relation("relation_ambiguous", "project_alpha", "route_shared")]);
    expect(codes(ambiguous)).toContain("REL_ALIAS_AMBIGUOUS");
  });

  it("flags wrong types, evidence-free edges, broad spans, local mismatches, and duplicates", () => {
    const wrongType = relation("relation_wrong_type", "project_alpha", "project_beta");
    const typeResult = audit([source(), project(), record("project_beta", "project", {}), wrongType]);
    expect(codes(typeResult)).toContain("REL_ENDPOINT_TYPE_INVALID");

    const wrongFamily = relation("relation_wrong_family", "project_alpha", "route_a", {
      payload: {
        relation_kind: "serves_route",
        relation_family: "publication_role",
        subject_id: "project_alpha",
        subject_local_observation_id: "project_alpha_local",
        object_id: "route_a",
        object_local_observation_id: "route_a_local",
      },
    });
    expect(codes(audit([source(), project(), route(), wrongFamily]))).toContain("REL_ENDPOINT_TYPE_INVALID");

    const noEvidence = relation("relation_no_evidence", "project_alpha", "route_a", { evidence_refs: [] });
    expect(codes(audit([source(), project(), route(), noEvidence]))).toContain("REL_EVIDENCE_MISSING");

    const broadId = "p001_c0001..p001_c0005";
    const broad = relation("relation_broad", "project_alpha", "route_a", {
      evidence_refs: [{
        source_id: SOURCE_ID,
        evidence_id: `${SOURCE_ID}#${broadId}`,
        source_path: `raw/sources/${SOURCE_ID}/blocks.jsonl`,
        page_number: 1,
        block_id: broadId,
        text_sha256: BLOCK_HASH,
      }],
    });
    expect(codes(audit([source(), project(), route(), broad], { index: evidenceIndex(broadId) }))).toContain("REL_EVIDENCE_OVERBROAD");

    const mismatch = relation("relation_mismatch", "project_alpha", "route_a", {
      payload: {
        relation_kind: "serves_route",
        relation_family: "route_scope",
        subject_id: "project_alpha",
        subject_local_observation_id: "route_a_local",
        object_id: "route_a",
        object_local_observation_id: "route_a_local",
      },
    });
    expect(codes(audit([source(), project(), route(), mismatch]))).toContain("REL_ENDPOINT_LOCAL_MISMATCH");

    const duplicateA = relation("relation_duplicate_a", "project_alpha", "route_a");
    const duplicateB = relation("relation_duplicate_b", "project_alpha", "route_a");
    const duplicateResult = audit([source(), project(), route(), duplicateA, duplicateB]);
    expect(duplicateResult.summary.exact_duplicate_groups).toBe(1);
    expect(duplicateResult.summary.findings_by_code.REL_DUPLICATE_IDENTITY).toBe(2);
  });

  it("keeps reviewed relationship variants distinct without hiding true duplicate or lifecycle conflicts", () => {
    const variantA = relation("relation_variant_a", "project_alpha", "route_a");
    variantA.payload.relationship_variant_key = "service_phase:predecessor";
    const variantB = relation("relation_variant_b", "project_alpha", "route_a");
    variantB.payload.relationship_variant_key = "service_phase:successor";
    variantB.payload.assertion_status = "proposed";
    const distinct = audit([source(), project(), route(), variantA, variantB]);
    expect(distinct.summary.findings_by_code.REL_DUPLICATE_IDENTITY).toBe(0);
    expect(distinct.summary.findings_by_code.REL_CONFLICTING_EDGE).toBe(0);

    const conflict = relation("relation_conflict", "project_alpha", "route_a");
    conflict.payload.relationship_variant_key = "service_phase:predecessor";
    conflict.payload.assertion_status = "proposed";
    const conflicting = audit([source(), project(), route(), variantA, conflict]);
    expect(conflicting.summary.findings_by_code.REL_CONFLICTING_EDGE).toBe(2);

    const duplicate = relation("relation_duplicate_variant", "project_alpha", "route_a");
    duplicate.payload.relationship_variant_key = "service_phase:predecessor";
    const duplicated = audit([source(), project(), route(), variantA, duplicate]);
    expect(duplicated.summary.findings_by_code.REL_DUPLICATE_IDENTITY).toBe(2);
  });

  it("keeps finding identities stable across warning and enforcement modes", () => {
    const fixture = [source(), project(), route(), relation("relation_no_evidence", "project_alpha", "route_a", { evidence_refs: [] })];
    const warn = audit(fixture, { mode: "warn" });
    const enforce = audit(fixture, { mode: "enforce" });
    expect(warn.findings.map((finding) => finding.finding_id)).toEqual(enforce.findings.map((finding) => finding.finding_id));
    expect(warn.findings.find((finding) => finding.code === "REL_EVIDENCE_MISSING")?.severity).toBe("error");
    expect(enforce.findings.find((finding) => finding.code === "REL_EVIDENCE_MISSING")?.severity).toBe("error");
  });

  it("loads only the byte-pinned family review ledger", () => {
    const loaded = loadRelationshipFamilyReviewLedger();
    expect(loaded.ledger_sha256).toBe(RELATIONSHIP_FAMILY_REVIEW_SHA256);
    expect([...loaded.reviewed_by_record_id.keys()].sort()).toEqual([
      "relation_mets-willets-on-flushing-line-208006",
      "relation_rel-m86-local-replaced-by-m86-sbs",
      "relation_rel-mta-launches-data-analytics-blog",
    ]);

    const raw = readFileSync(
      join(repoRoot, RELATIONSHIP_FAMILY_REVIEW_RELATIVE_PATH),
      "utf8",
    );
    expect(() => parseRelationshipFamilyReviewLedger(`${raw}\n`)).toThrow(
      "relationship family review ledger hash mismatch",
    );

    const duplicate = JSON.parse(raw) as {
      decisions: Array<Record<string, unknown>>;
    };
    duplicate.decisions[1]!.decision_id =
      duplicate.decisions[0]!.decision_id;
    expect(() =>
      parseRelationshipFamilyReviewLedger(JSON.stringify(duplicate))
    ).toThrow("duplicate decision ids");

    const unknown = JSON.parse(raw) as {
      decisions: Array<Record<string, unknown>>;
    };
    unknown.decisions[0]!.record_id = "relation_unknown";
    expect(() =>
      parseRelationshipFamilyReviewLedger(JSON.stringify(unknown))
    ).toThrow("unknown reviewed relation");

    const evidenceDrift = JSON.parse(raw) as {
      decisions: Array<Record<string, unknown>>;
    };
    evidenceDrift.decisions[0]!.evidence_ids = [
      "m86_sbs_progress_report_2017#p006_c0005",
    ];
    expect(() =>
      parseRelationshipFamilyReviewLedger(JSON.stringify(evidenceDrift))
    ).toThrow("drifted from its pinned adjudication");

    const semanticDrift = JSON.parse(raw) as {
      decisions: Array<Record<string, unknown>>;
    };
    semanticDrift.decisions[0]!.semantic_decision_id =
      "relationship-tuple-review-v1:wrong";
    expect(() =>
      parseRelationshipFamilyReviewLedger(JSON.stringify(semanticDrift))
    ).toThrow("drifted from its pinned adjudication");
  });

  it("downgrades only an exact reviewed family tuple with exact evidence", () => {
    const fixture = reviewedM86Fixture();
    const result = audit(fixture.records, {
      index: fixture.index,
      mode: "enforce",
    });
    const reviewed = result.findings.find(
      (finding) => finding.code === "REL_FAMILY_TYPE_SUSPECT_REVIEWED",
    );

    expect(reviewed?.severity).toBe("warning");
    expect(reviewed?.semantic_decision_ids).toEqual([
      "relationship-tuple-review-v1:0938",
    ]);
    expect(reviewed?.review_provenance).toMatchObject({
      review_id: "codex-relationship-family-warning-review-2026-07-17",
      decision_id: "m86-route-succession-narrow-shape",
      ledger_path: RELATIONSHIP_FAMILY_REVIEW_RELATIVE_PATH,
      ledger_sha256: RELATIONSHIP_FAMILY_REVIEW_SHA256,
      evidence_ids: [
        M86_LAUNCH_EVIDENCE_ID,
        M86_PREVIOUS_SERVICE_EVIDENCE_ID,
      ],
    });
    expect(
      result.findings.some(
        (finding) => finding.code === "REL_FAMILY_TYPE_SUSPECT",
      ),
    ).toBe(false);
    expect(result.relation_rows).toEqual([
      expect.objectContaining({
        record_id: "relation_rel-m86-local-replaced-by-m86-sbs",
        primary_disposition: "reviewed_family_type_advisory",
      }),
    ]);
  });

  it("rejects a reviewed relation when its evidence hash drifts", () => {
    const fixture = reviewedM86Fixture("sha256:changed-but-resolvable");
    const result = audit(fixture.records, {
      index: fixture.index,
      mode: "enforce",
    });
    const unreviewed = result.findings.find(
      (finding) => finding.code === "REL_FAMILY_TYPE_SUSPECT",
    );

    expect(unreviewed?.severity).toBe("error");
    expect(unreviewed?.reasons).toContain(
      "reviewed_family_evidence_hash_mismatch",
    );
    expect(
      result.findings.some(
        (finding) => finding.code === "REL_FAMILY_TYPE_SUSPECT_REVIEWED",
      ),
    ).toBe(false);
    expect(
      result.findings.some(
        (finding) => finding.code === "REL_EVIDENCE_UNRESOLVED",
      ),
    ).toBe(false);
  });

  it("keeps an unreviewed lookalike enforcement-eligible", () => {
    const fixture = reviewedM86Fixture();
    const lookalike = {
      ...fixture.records.find(
        (candidate) => candidate.record_kind === "relation",
      )!,
      record_id: "relation_unreviewed-route-succession",
      local_observation_id: "rel_unreviewed_route_succession",
      local_observation_ids: ["rel_unreviewed_route_succession"],
      submission_ids: ["sub_relation_unreviewed-route-succession"],
    } satisfies MtaCanonicalRecord;
    const result = audit(
      fixture.records
        .filter((candidate) => candidate.record_kind !== "relation")
        .concat(lookalike),
      { index: fixture.index, mode: "enforce" },
    );
    const unreviewed = result.findings.find(
      (finding) => finding.code === "REL_FAMILY_TYPE_SUSPECT",
    );

    expect(unreviewed?.severity).toBe("error");
    expect(unreviewed?.reasons).toContain(
      "family_shape_has_no_exact_review_decision",
    );
    expect(
      result.findings.some(
        (finding) => finding.code === "REL_FAMILY_TYPE_SUSPECT_REVIEWED",
      ),
    ).toBe(false);
  });

  it("does not let the Moody remediation decision authorize an advisory", () => {
    const sourceId = "meeting_doc_176491";
    const evidenceId = `${sourceId}#p012_c0008`;
    const evidenceHash =
      "sha256:d51ff514407287e55c93fd00fd80ccfb588a58c645c0a872466b337b5a5bc9cd";
    const moodys = record(
      "entity_meeting-doc-131661-moodys",
      "entity",
      { entity_name: "Moody's" },
      {
        source_id: sourceId,
        source_ids: [sourceId],
        local_observation_id: "entity_meeting_doc_176491_moodys",
        local_observation_ids: ["entity_meeting_doc_176491_moodys"],
      },
    );
    const ratingEvent = record(
      "event_moodys-upgrade-jun2025",
      "event",
      { event_name: "Moody's upgrade" },
      {
        source_id: sourceId,
        source_ids: [sourceId],
        local_observation_id: "event_moodys_upgrade_jun2025",
        local_observation_ids: ["event_moodys_upgrade_jun2025"],
      },
    );
    const remediated = record(
      "relation_moodys-upgraded-mta-trb",
      "relation",
      {
        relation_kind: "performed",
        relation_family: "timeline_context",
        subject_id: moodys.record_id,
        subject_local_observation_id: moodys.local_observation_id,
        object_id: ratingEvent.record_id,
        object_local_observation_id: ratingEvent.local_observation_id,
        assertion_status: "delivered",
        as_of_date: "2025-06",
      },
      {
        source_id: sourceId,
        source_ids: [sourceId],
        local_observation_id: "rel_moodys_upgraded_mta_trb",
        local_observation_ids: ["rel_moodys_upgraded_mta_trb"],
        evidence_refs: [{
          source_id: sourceId,
          evidence_id: evidenceId,
          source_path: `raw/sources/${sourceId}/blocks.jsonl`,
          page_number: 12,
          block_id: "p012_c0008",
          text_sha256: evidenceHash,
        }],
      },
    );
    const index: EvidenceBlockIndex = {
      sourceIds: new Set([sourceId]),
      byRef: new Map([[`${sourceId}\0p012_c0008`, {
        source_id: sourceId,
        block_id: "p012_c0008",
        resolved_block_id: "p012_c0008",
        page_number: 12,
        source_path: `raw/sources/${sourceId}/blocks.jsonl`,
        raw_text_sha256: evidenceHash,
      }]]),
    };
    const result = audit(
      [sourceFor(sourceId), moodys, ratingEvent, remediated],
      { index, mode: "enforce" },
    );

    expect(
      result.findings.some((finding) =>
        finding.code === "REL_FAMILY_TYPE_SUSPECT" ||
        finding.code === "REL_FAMILY_TYPE_SUSPECT_REVIEWED"
      ),
    ).toBe(false);
  });
});
