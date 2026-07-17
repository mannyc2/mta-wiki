import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { stableHash } from "../../../db/src/stable-json";
import type { JsonObject, MtaSubmissionEntry } from "../../../db/src/types";
import {
  buildMtaNyctIdentityRemediation,
  MTA_NYCT_IDENTITY_REMEDIATION_ARTIFACT_PATH,
  MTA_NYCT_IDENTITY_REMEDIATION_JOURNAL_PATH,
  MTA_NYCT_IDENTITY_RETIREMENTS_PATH,
} from "../../../../scripts/remediate-mta-nyct-target-identity";

describe("MTA/NYCT target identity remediation", () => {
  const campaign = buildMtaNyctIdentityRemediation();
  const artifact = campaign.artifact;
  const journal = campaign.journalContent.trim().split("\n").map((line) => JSON.parse(line) as MtaSubmissionEntry);
  const retirements = JSON.parse(campaign.retirementContent) as {
    version: number;
    retired: Array<{ submission_id: string; source_decision: string }>;
  };
  const campaignRetirements = retirements.retired.filter((entry) =>
    entry.source_decision.startsWith(
      "data/quality/relationship-integrity/entity-identity/mta-nyct-target-reviewed-decisions.json#",
    ));

  test("retires every reviewed identity row and writes only evidence-backed replacements", () => {
    expect(artifact.summary.reviewed_decision_count).toBe(61);
    expect(artifact.summary.unreviewed_count).toBe(0);
    expect(campaignRetirements).toHaveLength(61);
    expect(new Set(campaignRetirements.map((entry) => entry.submission_id)).size).toBe(61);
    expect(journal).toHaveLength(59);
    expect(journal.every((entry) => entry.validation.state === "accepted")).toBe(true);
    expect(journal.every((entry) => entry.tool_args.evidence_refs.length > 0)).toBe(true);
    expect(journal.every((entry) => entry.tool_args.observation_kind === "entity")).toBe(true);
  });

  test("uses content-addressed deterministic replacement submissions", () => {
    for (const entry of journal) {
      const hash = stableHash(entry.tool_args as unknown as JsonObject);
      expect(entry.submission_id).toBe(`sub_${hash.slice(0, 16)}`);
      expect(entry.tool_args_sha256).toBe(`sha256:${hash}`);
    }
    expect(artifact.summary.target_counts).toEqual({
      "entity_mta-entity-update-2025": 57,
      "entity_mta-nyct": 2,
      retired_without_replacement: 2,
    });
  });

  test("matches every generated output byte for byte", () => {
    expect(readFileSync(MTA_NYCT_IDENTITY_REMEDIATION_JOURNAL_PATH, "utf8")).toBe(campaign.journalContent);
    expect(readFileSync(MTA_NYCT_IDENTITY_RETIREMENTS_PATH, "utf8")).toBe(campaign.retirementContent);
    expect(readFileSync(MTA_NYCT_IDENTITY_REMEDIATION_ARTIFACT_PATH, "utf8")).toBe(campaign.artifactContent);
  });
});
