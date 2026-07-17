import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "../../../../../../../packages/core/src/paths";
import { stableJson } from "../../../../../../../packages/db/src/stable-json";
import { entriesToRecords } from "../../../../../../../packages/pipeline/src/materialize/materialize";
import {
  B54_CORRIDOR_ID,
  B54_ROUTE_ID,
  BROOKLYN_LINKAGE_CAMPAIGN_ID,
  BROOKLYN_LINKAGE_RUN_ID,
  buildBrooklynLinkageCampaign,
} from "./reconcile";

const ARTIFACT_DIR = import.meta.dir;
const JOURNAL_PATH = join(repoRoot, "data", "submissions", `${BROOKLYN_LINKAGE_RUN_ID}.jsonl`);

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("Brooklyn/null supported-linkage reconciliation v1", () => {
  it("implements or proves every one of the eight evidence-supported candidates", () => {
    const campaign = buildBrooklynLinkageCampaign();
    expect(campaign.decisions).toHaveLength(8);
    expect(new Set(campaign.decisions.map((decision) => decision.candidate_id)).size).toBe(8);
    expect(campaign.decisions.every((decision) => decision.campaign_id === BROOKLYN_LINKAGE_CAMPAIGN_ID)).toBe(true);
    expect(campaign.decisions.every((decision) => decision.implemented_or_verified)).toBe(true);
    expect(campaign.decisions.filter((decision) => decision.exclusive_action === "verified_existing_canonical")).toHaveLength(7);
    expect(campaign.decisions.filter((decision) => decision.exclusive_action === "implemented_by_accepted_submission")).toHaveLength(1);

    const relationProofs = campaign.decisions.flatMap((decision) => decision.relation_proofs);
    expect(relationProofs).toHaveLength(9);
    expect(relationProofs.filter((proof) => proof.record_status === "canonical_existing")).toHaveLength(8);
    expect(relationProofs.filter((proof) => proof.record_status === "accepted_pending_submission")).toHaveLength(1);
    expect(relationProofs.every((proof) =>
      proof.endpoint_records_resolve
      && proof.endpoint_type_valid
      && proof.evidence_valid
      && !proof.local_observation_only_endpoint
      && proof.evidence_refs.length > 0
    )).toBe(true);
    const authoritativeEvidence = campaign.decisions.flatMap((decision) => decision.authoritative_linkage_evidence);
    expect(authoritativeEvidence).toHaveLength(8);
    expect(authoritativeEvidence.every((item) =>
      item.source_url.startsWith("https://")
      && item.source_sha256.length === 64
      && item.official_routes.length > 0
      && item.supported_claim.length > 0
    )).toBe(true);
  });

  it("remediates only the proved B54 route-to-corridor gap through accepted submissions", () => {
    const campaign = buildBrooklynLinkageCampaign();
    expect(campaign.journal).toHaveLength(3);
    expect(campaign.journal.every((entry) => entry.validation.state === "accepted")).toBe(true);
    expect(campaign.journal.map((entry) => entry.tool_args.observation_kind)).toEqual(["source", "route", "relation"]);
    expect(entriesToRecords(campaign.journal)).toHaveLength(3);

    const route = campaign.journal.find((entry) => entry.tool_args.observation_kind === "route")!;
    expect(route.tool_args.local_observation_id).toBe(B54_ROUTE_ID);
    expect(route.tool_args.payload.route_id).toBe("B54");
    expect(route.tool_args.payload.route_record_scope).toBe("true_route");

    const relation = campaign.journal.find((entry) => entry.tool_args.observation_kind === "relation")!;
    expect(relation.tool_args.payload).toMatchObject({
      relation_kind: "operates_on_corridor",
      relation_family: "corridor_scope",
      subject_id: B54_ROUTE_ID,
      object_id: B54_CORRIDOR_ID,
      as_of_date: "2021-03-02",
    });
    expect(campaign.summary.projected_b54_gtfs_anchor).toEqual({
      aliases: ["B54"],
      anchor_reason: "label_matches_gtfs_short_name",
      canonical_route_record_id: B54_ROUTE_ID,
      disposition: "true_route",
      gtfs_route_id: "B54",
      variant_record_ids: [],
    });
  });

  it("does not promote registry-only date, phase, segment, or occurrence precision", () => {
    const campaign = buildBrooklynLinkageCampaign();
    expect(campaign.decisions.every((decision) =>
      !decision.registry_candidate_day_inherited
      && !decision.candidate_date_and_phase_proved
      && !decision.phase_created
      && !decision.canonical_operational_occurrence_identity_proved
      && !decision.operational_occurrence_added_or_updated
      && !decision.study_projection_eligible
      && decision.registry_projection_excluded
      && decision.still_unresolved
    )).toBe(true);
    expect(campaign.decisions.filter((decision) => decision.exact_candidate_segment_binding_proved)).toHaveLength(1);

    const journal = readFileSync(JOURNAL_PATH, "utf8");
    expect(journal).not.toContain("2020-08-31");
    expect(journal).not.toContain('"observation_kind":"event"');
    expect(journal).not.toContain('"observation_kind":"phase"');
    expect(journal).not.toContain("operational_occurrence");
  });

  it("pins reacquired source drift and the exact surviving authoritative claim", () => {
    const campaign = buildBrooklynLinkageCampaign();
    expect(campaign.sourceVerification).toMatchObject({
      previous_shard_source_sha256: "58bbda016aca84ff021d11620a50876b03dbf6c817f30ae7efef4cbe3003e8f7",
      current_source_html_sha256: "a5140a5eb87deff5b4a72a892e7bf3600c413bf114c063c34867d5faa8db2c6f",
      source_content_changed_since_shard_acquisition: true,
      exact_supported_claim_persists: true,
      route_corridor_evidence: {
        block_id: "p001_b0016",
        text_sha256: "sha256:e7463df53ebc2c7410e746d21920537d7ce085bed0b19fe15be1855222f04f06",
      },
    });
    expect((campaign.sourceVerification.unsupported_claims as string[])).toHaveLength(4);
  });

  it("reproduces every generated artifact and manifest hash byte-for-byte", () => {
    const campaign = buildBrooklynLinkageCampaign();
    const summary = readJson<Record<string, unknown>>(join(ARTIFACT_DIR, "summary.json"));
    const manifest = readJson<{
      manifest_payload_sha256: string;
      artifacts: Array<{ path: string; sha256: string; bytes: number }>;
      [key: string]: unknown;
    }>(join(ARTIFACT_DIR, "manifest.json"));
    expect(summary).toEqual(campaign.summary);
    expect(summary).toMatchObject({
      supported_candidate_count: 8,
      implemented_or_verified_candidate_count: 8,
      authoritative_linkage_evidence_count: 8,
      existing_canonical_relation_count: 8,
      accepted_pending_route_count: 1,
      accepted_pending_relation_count: 1,
      registry_day_inherited_count: 0,
      phase_addition_count: 0,
      operational_occurrence_addition_or_update_count: 0,
      study_projection_eligible_count: 0,
    });

    const { manifest_payload_sha256: payloadHash, ...payload } = manifest;
    expect(sha256(stableJson(payload as never))).toBe(payloadHash);
    for (const artifact of manifest.artifacts) {
      const bytes = readFileSync(join(ARTIFACT_DIR, artifact.path));
      expect(bytes.byteLength, artifact.path).toBe(artifact.bytes);
      expect(sha256(bytes), artifact.path).toBe(artifact.sha256);
    }
  });
});
