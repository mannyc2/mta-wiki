import { describe, expect, it } from "bun:test";
import type { JsonObject, MtaCanonicalRecord, MtaObservationKind } from "@mta-wiki/db/types";
import {
  auditRelationshipPayloadReferences,
  reviewRelationshipReferenceGroups,
} from "@mta-wiki/pipeline/quality/relationship-reference-audit";
import {
  RELATIONSHIP_REFERENCE_RULES_V1,
  type LoadedRelationshipReferenceContract,
  type RelationshipReferenceContract,
  type RelationshipReferenceReviewDecision,
  type RelationshipReferenceRule,
} from "@mta-wiki/pipeline/quality/relationship-reference-contract";
import type { EvidenceBlockIndex } from "@mta-wiki/pipeline/sources/evidence-block-index";

function record(
  recordId: string,
  recordKind: MtaObservationKind,
  payload: JsonObject,
  options: Partial<MtaCanonicalRecord> = {},
): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: recordKind,
    source_id: options.source_id ?? "source_fixture",
    source_ids: options.source_ids ?? [options.source_id ?? "source_fixture"],
    local_observation_id: options.local_observation_id ?? recordId,
    local_observation_ids: options.local_observation_ids ?? [options.local_observation_id ?? recordId],
    display_name: options.display_name ?? recordId,
    payload,
    evidence_refs: options.evidence_refs ?? [{
      source_id: options.source_id ?? "source_fixture",
      evidence_id: `${options.source_id ?? "source_fixture"}#p001_c0001`,
      source_path: `raw/sources/${options.source_id ?? "source_fixture"}/blocks.jsonl`,
      page_number: 1,
      block_id: "p001_c0001",
      text_sha256: "a".repeat(64),
      text_source: "raw_text",
    }],
    submission_ids: options.submission_ids ?? [`submission_${recordId}`],
    truth_status: options.truth_status ?? "source_stated",
    review_state: options.review_state ?? "reviewed",
    generated_at: options.generated_at ?? "2026-07-16T00:00:00.000Z",
    ...(options.record_aliases ? { record_aliases: options.record_aliases } : {}),
  };
}

function contract(
  rules: readonly RelationshipReferenceRule[],
  decisions: readonly RelationshipReferenceReviewDecision[] = [],
): LoadedRelationshipReferenceContract {
  const contractValue: RelationshipReferenceContract = {
    schema_version: 1,
    contract_id: "relationship-reference-contract-v1",
    contract_status: "warning",
    description: "fixture",
    rules: rules.map((rule) => ({
      ...rule,
      fields: [...rule.fields],
      context_literal_fields: [...rule.context_literal_fields],
      target_kinds: [...rule.target_kinds],
    })),
    review_ledger: {
      path: "fixture.jsonl",
      sha256: "0".repeat(64),
      row_count: decisions.length,
    },
    enforcement_criteria: {
      unreviewed_reference_count: 0,
      invalid_value_count: 0,
      evidence_invalid_count: 0,
      supportable_resolution_pending_count: 0,
      policy_rule_drift_count: 0,
      native_coverage_mismatch_count: 0,
    },
  };
  return {
    contract: contractValue,
    decisions: [...decisions],
    decisions_by_key: new Map(decisions.map((decision) => [
      `${decision.rule_id}\0${decision.field}\0${decision.normalized_value}\0${decision.native_resolution}`,
      decision,
    ])),
    rules_by_id: new Map(contractValue.rules.map((rule) => [rule.rule_id, rule])),
    contract_path: "fixture-contract.json",
    review_ledger_path: "fixture-review.jsonl",
  };
}

function rule(ruleId: string): RelationshipReferenceRule {
  const found = RELATIONSHIP_REFERENCE_RULES_V1.find((candidate) => candidate.rule_id === ruleId);
  if (!found) throw new Error(`missing fixture rule ${ruleId}`);
  return {
    ...found,
    fields: [...found.fields],
    context_literal_fields: [...found.context_literal_fields],
    target_kinds: [...found.target_kinds],
  };
}

function reviewed(
  records: MtaCanonicalRecord[],
  rules: RelationshipReferenceRule[],
): LoadedRelationshipReferenceContract {
  const bootstrap = auditRelationshipPayloadReferences(records, contract(rules), {
    mode: "warn",
    checkNativeCoverage: false,
  });
  return contract(rules, reviewRelationshipReferenceGroups(bootstrap.groups));
}

describe("relationship payload-reference integrity v1", () => {
  it("distinguishes an origin-attributed derived edge from an already-present edge", () => {
    const route = record("route_m15", "route", { route_id: "M15" }, { display_name: "M15" });
    const metric = record("metric_m15", "metric_claim", { route: "M15", metric_name: "speed" });
    const derived = record("relation_m15_metric", "relation", {
      relation_kind: "has_metric",
      subject_id: route.record_id,
      object_id: metric.record_id,
      derived_relation: true,
      derived_from_record_id: metric.record_id,
      derived_from_payload_field: "route",
      derived_from_payload_value: "M15",
    });
    const audit = auditRelationshipPayloadReferences(
      [derived, metric, route],
      contract([rule("metric-route-has-metric")]),
      { checkNativeCoverage: false },
    );
    const routeRow = audit.rows.find((row) => row.field === "route");
    expect(routeRow?.primary_disposition).toBe("exact_resolved_derived_edge");
    expect(routeRow?.matching_relation_ids).toEqual(["relation_m15_metric"]);

    derived.payload = {
      relation_kind: "has_metric",
      subject_id: route.record_id,
      object_id: metric.record_id,
    };
    const authored = auditRelationshipPayloadReferences(
      [derived, metric, route],
      contract([rule("metric-route-has-metric")]),
      { checkNativeCoverage: false },
    );
    expect(authored.rows.find((row) => row.field === "route")?.primary_disposition)
      .toBe("already_present_edge");
  });

  it("preserves generic route-variant ambiguity and never guesses local versus SBS", () => {
    const local = record("route_b46-local", "route", {
      route_id: "B46",
      service_variant: "local",
    }, { display_name: "B46 Local" });
    const sbs = record("route_b46-sbs", "route", {
      route_id: "B46 SBS",
      service_variant: "sbs",
    }, { display_name: "B46 SBS" });
    const metric = record("metric_b46", "metric_claim", { route: "B46" });
    const records = [local, metric, sbs];
    const loaded = reviewed(records, [rule("metric-route-has-metric")]);
    const audit = auditRelationshipPayloadReferences(records, loaded, {
      mode: "enforce",
      checkNativeCoverage: false,
    });
    const row = audit.rows.find((candidate) => candidate.origin_record_id === metric.record_id);
    expect(row?.primary_disposition).toBe("reviewed_ambiguous_reference");
    expect(row?.candidate_record_ids).toEqual(["route_b46-local", "route_b46-sbs"]);
    expect(audit.findings.find((finding) => finding.code === "RELREF_REVIEWED_AMBIGUOUS")?.severity)
      .toBe("warning");
  });

  it("reviews unresolved source-system text as non-authoritative context, not an invented entity edge", () => {
    const metric = record("metric_camera", "metric_claim", {
      source_system: "DOT stationary cameras",
    });
    const records = [metric];
    const loaded = reviewed(records, [rule("metric-source-system-has-metric")]);
    const audit = auditRelationshipPayloadReferences(records, loaded, {
      mode: "enforce",
      checkNativeCoverage: false,
    });
    const row = audit.rows.find((candidate) => candidate.field === "source_system");
    expect(row?.primary_disposition).toBe("reviewed_non_authoritative_context_literal");
    expect(row?.target_record_id).toBeNull();
    expect(audit.findings.find((finding) => finding.code === "RELREF_REVIEWED_CONTEXT_LITERAL")?.severity)
      .toBe("warning");
  });

  it("surfaces a long-name/acronym concordance as a pending proposal without auto-applying it", () => {
    const publisher = record("entity_nyc-dot", "entity", {
      entity_name: "New York City Department of Transportation",
      acronym: "NYC DOT",
    }, {
      display_name: "New York City Department of Transportation",
      record_aliases: ["NYC DOT"],
    });
    const source = record("source_report", "source", {
      publisher: "New York City Department of Transportation (NYC DOT)",
      title: "Report",
    });
    const records = [publisher, source];
    const loaded = reviewed(records, [rule("source-publisher")]);
    const audit = auditRelationshipPayloadReferences(records, loaded, {
      mode: "enforce",
      checkNativeCoverage: false,
    });
    const row = audit.rows.find((candidate) => candidate.origin_record_id === source.record_id);
    expect(row?.primary_disposition).toBe("reviewed_supportable_resolution");
    expect(row?.target_record_id).toBe("entity_nyc-dot");
    expect(audit.proposed_remediations).toHaveLength(1);
    expect(audit.proposed_remediations[0]?.apply_automatically).toBe(false);
    expect(audit.findings.find((finding) => finding.code === "RELREF_SUPPORTABLE_RESOLUTION_PENDING")?.severity)
      .toBe("error");

    const existingRelation = record("relation_report_publisher", "relation", {
      relation_kind: "published_by",
      subject_id: source.record_id,
      object_id: publisher.record_id,
    });
    const existing = auditRelationshipPayloadReferences([...records, existingRelation], loaded, {
      mode: "enforce",
      checkNativeCoverage: false,
    });
    expect(existing.rows.find((candidate) => candidate.origin_record_id === source.record_id)?.primary_disposition)
      .toBe("reviewed_supportable_existing_edge");
    expect(existing.proposed_remediations).toEqual([]);
    expect(existing.findings.some((finding) => finding.code === "RELREF_SUPPORTABLE_RESOLUTION_PENDING"))
      .toBe(false);
  });

  it("requires an exact reviewed decision for a resolved project-program self reference", () => {
    const project = record("project_fixture", "project", {
      project_name: "Fixture Program",
      program: "Fixture Program",
    }, { display_name: "Fixture Program" });
    const rules = [rule("project-program")];
    const bootstrap = auditRelationshipPayloadReferences([project], contract(rules), {
      mode: "enforce",
      checkNativeCoverage: false,
    });
    const group = bootstrap.groups[0]!;
    expect(group.native_resolution).toBe("resolved_self_reference");
    expect(bootstrap.rows[0]?.primary_disposition).toBe("unreviewed_self_reference");
    expect(bootstrap.findings.find((finding) => finding.code === "RELREF_UNREVIEWED_SELF_REFERENCE")?.severity)
      .toBe("error");
    expect(reviewRelationshipReferenceGroups(bootstrap.groups)).toEqual([]);

    const decision: RelationshipReferenceReviewDecision = {
      schema_version: 1,
      ledger_id: "relationship-reference-review-v1",
      decision_id: "relationship-reference-review-v1:self-fixture",
      rule_id: group.rule_id,
      field: group.field,
      normalized_value: group.normalized_value,
      native_resolution: "resolved_self_reference",
      primary_disposition: "reviewed_non_authoritative_self_reference",
      proposed_target_record_id: null,
      reviewed_at: "2026-07-16",
      reviewed_by: "fixture",
      reason: "The source literal describes the project and proves no containing program.",
      reason_codes: ["canonical_self_loop_forbidden"],
      origin_record_ids: group.origin_record_ids,
      source_ids_checked: group.source_ids_checked,
      evidence_ids_checked: group.evidence_ids_checked,
      canonical_candidate_ids_checked: group.canonical_candidate_ids_checked,
      exact_supported_claims: ["source_literal_preserved"],
      exact_unsupported_claims: ["part_of_program:self"],
    };
    const reviewedAudit = auditRelationshipPayloadReferences([project], contract(rules, [decision]), {
      mode: "enforce",
      checkNativeCoverage: false,
    });
    expect(reviewedAudit.rows[0]?.primary_disposition).toBe("reviewed_non_authoritative_self_reference");
    expect(reviewedAudit.proposed_remediations).toEqual([]);
    expect(reviewedAudit.findings.find((finding) => finding.code === "RELREF_REVIEWED_SELF_REFERENCE")?.severity)
      .toBe("warning");

    const unseen = record("project_unseen", "project", {
      project_name: "Unseen Program",
      program: "Unseen Program",
    }, { display_name: "Unseen Program" });
    const unseenAudit = auditRelationshipPayloadReferences([project, unseen], contract(rules, [decision]), {
      mode: "enforce",
      checkNativeCoverage: false,
    });
    expect(unseenAudit.findings.some((finding) =>
      finding.code === "RELREF_UNREVIEWED_SELF_REFERENCE" && finding.origin_record_id === unseen.record_id
    )).toBe(true);
  });

  it("preserves a reviewed historical metric literal without linking it to a later route lifecycle", () => {
    const route = record("route_q20-qbnr-2025", "route", { route_id: "Q20" }, { display_name: "Q20" });
    const metric = record("metric_q20-2014", "metric_claim", { route: "Q20", metric_name: "ridership" });
    const rules = [rule("metric-route-has-metric")];
    const bootstrap = auditRelationshipPayloadReferences([metric, route], contract(rules), {
      mode: "warn",
      checkNativeCoverage: false,
    });
    const exact = bootstrap.rows[0]!;
    const decision: RelationshipReferenceReviewDecision = {
      schema_version: 1,
      ledger_id: "relationship-reference-review-v1",
      decision_id: "relationship-reference-review-v1:q20-temporal-fixture",
      rule_id: exact.rule_id,
      field: exact.field,
      normalized_value: exact.normalized_value!,
      native_resolution: "resolved_temporal_scope_mismatch",
      primary_disposition: "reviewed_temporal_scope_mismatch",
      proposed_target_record_id: null,
      reviewed_at: "2026-07-16",
      reviewed_by: "fixture",
      reason: "The metric predates the distinct current route lifecycle.",
      reason_codes: ["temporal_identity_mismatch"],
      origin_record_ids: [metric.record_id],
      source_ids_checked: ["source_fixture"],
      evidence_ids_checked: ["source_fixture#p001_c0001"],
      canonical_candidate_ids_checked: [route.record_id],
      exact_supported_claims: ["historical_metric_literal"],
      exact_unsupported_claims: [`has_metric:${route.record_id}->${metric.record_id}`],
    };
    const audit = auditRelationshipPayloadReferences([metric, route], contract(rules, [decision]), {
      mode: "enforce",
      checkNativeCoverage: false,
    });
    expect(audit.rows[0]?.primary_disposition).toBe("reviewed_temporal_scope_mismatch");
    expect(audit.proposed_remediations).toEqual([]);
    expect(audit.findings.find((finding) => finding.code === "RELREF_REVIEWED_TEMPORAL_SCOPE_MISMATCH")?.severity)
      .toBe("warning");
  });

  it("fails closed when a new row silently tries to inherit an existing normalized-value review", () => {
    const first = record("metric_m60_1", "metric_claim", { route: "M60" });
    const rules = [rule("metric-route-has-metric")];
    const loaded = reviewed([first], rules);
    const second = record("metric_m60_2", "metric_claim", { route: "M60" });
    const audit = auditRelationshipPayloadReferences([first, second], loaded, {
      mode: "enforce",
      checkNativeCoverage: false,
    });
    expect(audit.findings.some((finding) =>
      finding.code === "RELREF_REVIEW_DECISION_STALE" && finding.severity === "error"
    )).toBe(true);

    const unseen = record("metric_q999", "metric_claim", { route: "Q999" });
    const unseenAudit = auditRelationshipPayloadReferences([first, unseen], loaded, {
      mode: "enforce",
      checkNativeCoverage: false,
    });
    expect(unseenAudit.findings.some((finding) =>
      finding.code === "RELREF_UNREVIEWED_UNRESOLVED" && finding.severity === "error"
    )).toBe(true);
  });

  it("makes invalid field types and non-exact evidence hard failures in enforcement mode", () => {
    const metric = record("metric_invalid", "metric_claim", {
      route: { label: "M15" },
    });
    const index: EvidenceBlockIndex = {
      byRef: new Map([[
        "source_fixture\0p001_c0001",
        {
          source_id: "source_fixture",
          block_id: "p001_c0001",
          resolved_block_id: "p001_c0001",
          page_number: 2,
          source_path: "raw/sources/source_fixture/blocks.jsonl",
          raw_text_sha256: "b".repeat(64),
        },
      ]]),
      sourceIds: new Set(["source_fixture"]),
    };
    const audit = auditRelationshipPayloadReferences(
      [metric],
      contract([rule("metric-route-has-metric")]),
      {
        mode: "enforce",
        checkNativeCoverage: false,
        evidenceIndex: index,
      },
    );
    expect(audit.summary.invalid_value_count).toBe(1);
    expect(audit.findings.some((finding) =>
      finding.code === "RELREF_INVALID_VALUE" && finding.severity === "error"
    )).toBe(true);
    expect(audit.findings.some((finding) =>
      finding.code === "RELREF_EVIDENCE_UNRESOLVED" && finding.severity === "error"
    )).toBe(true);
  });

  it("keeps the versioned 15-rule/26-field inventory reconciled with the native generator", () => {
    const audit = auditRelationshipPayloadReferences(
      [],
      contract(RELATIONSHIP_REFERENCE_RULES_V1),
      { mode: "enforce", checkNativeCoverage: true },
    );
    expect(audit.summary.policy_rule_count).toBe(15);
    expect(audit.summary.policy_field_count).toBe(26);
    expect(audit.summary.policy_rule_drift_count).toBe(0);
    expect(audit.summary.native_coverage_mismatch_count).toBe(0);
  });
});
