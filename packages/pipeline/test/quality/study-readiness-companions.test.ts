import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  parseBusLaneIdentityVerdicts,
} from "../../src/quality/bus-lane-identity-companion";
import {
  memberExtentProjectionSha256,
  parseMemberGrainCompanion,
} from "../../src/quality/member-grain-companion";
import type { MemberExtentRow } from "../../src/quality/study-readiness-v1";
import {
  parseStudyReadinessV2Rows,
} from "../../src/quality/study-readiness-v2";

const identityPath =
  `${repoRoot}/data/contracts/bus-lane-identity-verdicts-v1/bus_lane_identity_verdicts.jsonl`;
const grainPath =
  `${repoRoot}/data/contracts/operational-occurrence-member-grain/v1/operational_occurrence_member_grain.jsonl`;
const extentPath =
  `${repoRoot}/data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl`;
const bridgeV2Path =
  `${repoRoot}/data/quality/study-readiness/v2/bridge-ledger.jsonl`;
const lines = (path: string): string[] =>
  readFileSync(path, "utf8").trimEnd().split("\n");

describe("Plan 041 strict release companions", () => {
  test("identity companion covers exactly 321 candidates and rejects denominator/schema drift", () => {
    const source = lines(identityPath);
    const ids = source.map((line) =>
      (JSON.parse(line) as { candidate_id: string }).candidate_id
    );
    expect(parseBusLaneIdentityVerdicts(`${source.join("\n")}\n`, identityPath, ids))
      .toHaveLength(321);
    expect(() => parseBusLaneIdentityVerdicts(
      `${source.slice(1).join("\n")}\n`,
      identityPath,
      ids,
    )).toThrow("denominator mismatch");
    expect(() => parseBusLaneIdentityVerdicts(
      `${[source[0], ...source].join("\n")}\n`,
      identityPath,
    )).toThrow(/sorted.*unique/u);
    const unknown = JSON.parse(source[0]!) as Record<string, unknown>;
    unknown.verdict = "onset_absent_after_search";
    expect(() => parseBusLaneIdentityVerdicts(
      `${stableJson(unknown as JsonValue)}\n`,
      identityPath,
    )).toThrow(/header or verdict/u);
  });

  test("member-grain companion enforces projection, denominator, nested shape, lineage, and receipts", () => {
    const source = lines(grainPath);
    const extentBytes = readFileSync(extentPath);
    const extentSha = memberExtentProjectionSha256(extentBytes);
    const extents = lines(extentPath).map((line) =>
      JSON.parse(line) as MemberExtentRow
    );
    expect(parseMemberGrainCompanion(
      `${source.join("\n")}\n`,
      extentSha,
      extentSha,
      grainPath,
      extents,
    )).toHaveLength(308);
    expect(() => parseMemberGrainCompanion(
      `${source.join("\n")}\n`,
      "0".repeat(64),
      extentSha,
      grainPath,
      extents,
    )).toThrow("hash mismatch");
    expect(() => parseMemberGrainCompanion(
      `${source.slice(1).join("\n")}\n`,
      extentSha,
      extentSha,
      grainPath,
      extents,
    )).toThrow("denominator mismatch");
    expect(() => parseMemberGrainCompanion(
      `${[source[0], ...source].join("\n")}\n`,
      undefined,
      undefined,
      grainPath,
    )).toThrow(/sorted.*unique/u);

    const structuredIndex = source.findIndex((line) =>
      line.includes('"lineage_segments":[{')
    );
    const badLineage = JSON.parse(source[structuredIndex]!) as {
      lineage_segments: Array<Record<string, unknown>>;
    };
    badLineage.lineage_segments[0]!.predecessor_gtfs_route_id = "";
    expect(() => parseMemberGrainCompanion(
      `${stableJson(badLineage as unknown as JsonValue)}\n`,
      undefined,
      undefined,
      grainPath,
    )).toThrow("predecessor_gtfs_route_id");

    const blockedIndex = source.findIndex((line) =>
      line.includes('"terminal_disposition":"blocked_upstream"')
    );
    const unreceipted = JSON.parse(source[blockedIndex]!) as Record<string, unknown>;
    unreceipted.receipt_ids = [];
    expect(() => parseMemberGrainCompanion(
      `${stableJson(unreceipted as JsonValue)}\n`,
      undefined,
      undefined,
      grainPath,
    )).toThrow("unreceipted");

    const unknown = JSON.parse(source[0]!) as Record<string, unknown>;
    unknown.prose_scope = "forbidden";
    expect(() => parseMemberGrainCompanion(
      `${stableJson(unknown as JsonValue)}\n`,
      undefined,
      undefined,
      grainPath,
    )).toThrow("exact fields");

    const invalidReceipt = JSON.parse(source[blockedIndex]!) as Record<string, unknown>;
    invalidReceipt.receipt_ids = [1];
    expect(() => parseMemberGrainCompanion(
      `${stableJson(invalidReceipt as JsonValue)}\n`,
      undefined,
      undefined,
      grainPath,
    )).toThrow("non-empty strings");
  });

  test("v2 bridge is exact, non-authorizing, terminal, and closure-bound", () => {
    const source = lines(bridgeV2Path);
    expect(parseStudyReadinessV2Rows(
      `${source.join("\n")}\n`,
      bridgeV2Path,
    )).toHaveLength(484);

    const identityIndex = source.findIndex((line) =>
      line.includes('"identity_verdict":{"')
    );
    const badIdentity = JSON.parse(source[identityIndex]!) as {
      closing_artifacts: {
        identity_verdict: Record<string, unknown>;
      };
    };
    badIdentity.closing_artifacts.identity_verdict.receipt_ids = [];
    expect(() => parseStudyReadinessV2Rows(
      `${stableJson(badIdentity as unknown as JsonValue)}\n`,
      bridgeV2Path,
    )).toThrow("requires receipt provenance");

    const memberIndex = source.findIndex((line) =>
      line.includes('"member_extents":[{')
    );
    const badMember = JSON.parse(source[memberIndex]!) as Record<string, unknown>;
    badMember.downstream_disposition = "source_fixable_member_treatment_extent";
    expect(() => parseStudyReadinessV2Rows(
      `${stableJson(badMember as JsonValue)}\n`,
      bridgeV2Path,
    )).toThrow("invalid non-authorizing bridge row");

    const absenceIndex = source.findIndex((line) =>
      line.includes('"downstream_disposition":"extent_absent_in_source"')
    );
    const falseResolution = JSON.parse(source[absenceIndex]!) as Record<string, unknown>;
    falseResolution.downstream_disposition = "resolved_member_extent";
    expect(() => parseStudyReadinessV2Rows(
      `${stableJson(falseResolution as JsonValue)}\n`,
      bridgeV2Path,
    )).toThrow("closure/disposition mismatch");

    const authorized = JSON.parse(source[0]!) as Record<string, unknown>;
    authorized.authorizes_study = true;
    expect(() => parseStudyReadinessV2Rows(
      `${stableJson(authorized as JsonValue)}\n`,
      bridgeV2Path,
    )).toThrow("invalid non-authorizing bridge row");

    const wrongPrior = JSON.parse(source[identityIndex]!) as Record<string, unknown>;
    wrongPrior.prior_disposition = "tracker_owned_spine_or_pattern";
    expect(() => parseStudyReadinessV2Rows(
      `${stableJson(wrongPrior as JsonValue)}\n`,
      bridgeV2Path,
    )).toThrow("identity closure/disposition mismatch");
  });
});
