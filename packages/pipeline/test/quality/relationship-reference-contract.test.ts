import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "bun:test";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  RELATIONSHIP_REFERENCE_RULES_V1,
  loadRelationshipReferenceContract,
  parseRelationshipReferenceReviewDecision,
  type RelationshipReferenceContract,
  type RelationshipReferenceReviewDecision,
} from "@mta-wiki/pipeline/quality/relationship-reference-contract";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function decision(): RelationshipReferenceReviewDecision {
  return {
    schema_version: 1,
    ledger_id: "relationship-reference-review-v1",
    decision_id: "relationship-reference-review-v1:test",
    rule_id: "metric-route-has-metric",
    field: "route",
    normalized_value: "m60",
    native_resolution: "unresolved",
    primary_disposition: "reviewed_unresolved_reference_claim",
    proposed_target_record_id: null,
    reviewed_at: "2026-07-16",
    reviewed_by: "fixture",
    reason: "No exact canonical route variant is proved.",
    reason_codes: ["canonical_target_unresolved", "no_identity_invention"],
    origin_record_ids: ["metric_test"],
    source_ids_checked: ["source_test"],
    evidence_ids_checked: ["source_test#p001_c0001"],
    canonical_candidate_ids_checked: [],
    exact_supported_claims: ["relationship_like_reference_claim"],
    exact_unsupported_claims: ["canonical_relationship_endpoint"],
  };
}

function fixtureRoot(options: { mutateRules?: boolean; wrongHash?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "mta-wiki-relref-"));
  const ledgerPath = join(root, "data/contracts/relationship-references/v1/review-decisions.jsonl");
  const contractPath = join(root, "data/contracts/relationship-references/v1/contract.json");
  mkdirSync(dirname(ledgerPath), { recursive: true });
  const ledger = `${stableJson(decision() as unknown as JsonValue)}\n`;
  writeFileSync(ledgerPath, ledger, "utf8");
  const rules = RELATIONSHIP_REFERENCE_RULES_V1.map((rule) => ({
    ...rule,
    fields: [...rule.fields],
    context_literal_fields: [...rule.context_literal_fields],
    target_kinds: [...rule.target_kinds],
  }));
  if (options.mutateRules) rules[0]!.fields = ["route"];
  const contract: RelationshipReferenceContract = {
    schema_version: 1,
    contract_id: "relationship-reference-contract-v1",
    contract_status: "warning",
    description: "fixture",
    rules,
    review_ledger: {
      path: "data/contracts/relationship-references/v1/review-decisions.jsonl",
      sha256: options.wrongHash ? "0".repeat(64) : sha256(ledger),
      row_count: 1,
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
  mkdirSync(dirname(contractPath), { recursive: true });
  writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  return root;
}

describe("relationship reference contract v1", () => {
  it("loads an immutable SHA-pinned, evidence-linked review ledger", () => {
    const loaded = loadRelationshipReferenceContract(fixtureRoot());
    expect(loaded.decisions).toHaveLength(1);
    expect(loaded.decisions_by_key.get("metric-route-has-metric\0route\0m60\0unresolved")?.decision_id)
      .toBe("relationship-reference-review-v1:test");
  });

  it("rejects ledger mutation and unversioned generator-field policy drift", () => {
    expect(() => loadRelationshipReferenceContract(fixtureRoot({ wrongHash: true })))
      .toThrow("SHA-256 mismatch");
    expect(() => loadRelationshipReferenceContract(fixtureRoot({ mutateRules: true })))
      .toThrow("do not match the reviewed v1 generator-field inventory");
  });

  it("requires a supportable-target decision to name exactly one proposed target", () => {
    expect(() => parseRelationshipReferenceReviewDecision({
      ...decision(),
      primary_disposition: "reviewed_supportable_canonical_target",
      proposed_target_record_id: null,
    }, "fixture")).toThrow("proposed_target_record_id is required");
  });

  it("does not let resolved self or temporal exclusions borrow a generic review disposition", () => {
    expect(() => parseRelationshipReferenceReviewDecision({
      ...decision(),
      native_resolution: "resolved_self_reference",
      primary_disposition: "reviewed_non_authoritative_context_literal",
    }, "fixture")).toThrow("requires the reviewed self-reference disposition");
    expect(() => parseRelationshipReferenceReviewDecision({
      ...decision(),
      native_resolution: "resolved_temporal_scope_mismatch",
      primary_disposition: "reviewed_non_authoritative_context_literal",
    }, "fixture")).toThrow("requires the reviewed temporal-scope disposition");
  });
});
