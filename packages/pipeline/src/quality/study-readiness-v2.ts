import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { BusLaneIdentityVerdictRow } from "./bus-lane-identity-companion.js";
import type { MemberExtentLedgerRow } from "./member-extent-ledger.js";
import { extentDecisionKey } from "./study-readiness-v1.js";

export const STUDY_READINESS_V2_SCHEMA_VERSION = 2 as const;
export const STUDY_READINESS_V2_CONTRACT_ID =
  "study-readiness-bridge-v2" as const;

export const STUDY_READINESS_V2_DISPOSITIONS = [
  "extent_absent_in_source",
  "extent_blocked_upstream",
  "identity_absent_in_source",
  "quarantined_later_ace_phase",
  "refuted_not_route_treatment",
  "resolved_identity_duplicate",
  "resolved_identity_out_of_window",
  "resolved_member_extent",
  "resolved_occurrence_identity",
  "resolved_prior_approval",
  "tracker_owned_outcome_calendar",
  "tracker_owned_spine_or_pattern",
] as const;

export type DownstreamDispositionV2 =
  typeof STUDY_READINESS_V2_DISPOSITIONS[number];

export type StudyReadinessV2Row = Record<string, unknown> & {
  schema_version: 2;
  ledger_id: typeof STUDY_READINESS_V2_CONTRACT_ID;
  candidate_id: string;
  prior_disposition: string;
  downstream_disposition: DownstreamDispositionV2;
  closing_artifacts: {
    identity_verdict: {
      verdict: BusLaneIdentityVerdictRow["verdict"];
      decision_id: string | null;
      occurrence_id: string | null;
      receipt_ids: string[];
    } | null;
    member_extents: {
      extent_id: string;
      verdict: string;
      decision_id: string | null;
      receipt_ids: string[];
    }[];
    prior_decision_or_release_id: string | null;
  };
};

function jsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8").split(/\r?\n/u).flatMap((line) =>
    line ? [JSON.parse(line) as T] : []
  );
}

function histogram(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  ));
}

function identityDisposition(
  verdict: BusLaneIdentityVerdictRow["verdict"],
): DownstreamDispositionV2 {
  switch (verdict) {
    case "occurrence_created": return "resolved_occurrence_identity";
    case "superseded_duplicate": return "resolved_identity_duplicate";
    case "confirmed_out_of_window": return "resolved_identity_out_of_window";
    case "refuted_no_traversal":
    case "refuted_wrong_route_attribution":
      return "refuted_not_route_treatment";
    case "binding_absent_after_search":
      return "identity_absent_in_source";
  }
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  return value as Record<string, unknown>;
}

function exactFields(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    stableJson(actual as JsonValue) !==
      stableJson(sortedExpected as JsonValue)
  ) {
    throw new Error(`${path}: exact fields required`);
  }
}

function strictStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  if (
    value.some((entry) => typeof entry !== "string" || entry.length === 0) ||
    new Set(value).size !== value.length ||
    stableJson(value as JsonValue) !==
      stableJson([...value].sort() as JsonValue)
  ) {
    throw new Error(`${path}: expected sorted unique non-empty strings`);
  }
  return value as string[];
}

export function parseStudyReadinessV2Rows(
  bytes: string,
  path = "study-readiness/v2/bridge-ledger.jsonl",
): StudyReadinessV2Row[] {
  const rows = bytes.split(/\r?\n/u).flatMap((line, index) => {
    if (!line) return [];
    const rowPath = `${path}:${index + 1}`;
    const raw = JSON.parse(line) as unknown;
    const row = object(raw, rowPath);
    if (stableJson(raw as JsonValue) !== line) {
      throw new Error(`${rowPath}: expected canonical stable JSON`);
    }
    if (
      row.schema_version !== 2 ||
      row.ledger_id !== STUDY_READINESS_V2_CONTRACT_ID ||
      typeof row.candidate_id !== "string" ||
      row.candidate_id.length === 0 ||
      typeof row.prior_disposition !== "string" ||
      !STUDY_READINESS_V2_DISPOSITIONS.includes(
        row.downstream_disposition as DownstreamDispositionV2,
      ) ||
      row.authorizes_study !== false ||
      row.authorizes_cross_product !== false
    ) {
      throw new Error(`${rowPath}: invalid non-authorizing bridge row`);
    }
    const closing = object(row.closing_artifacts, `${rowPath}.closing_artifacts`);
    exactFields(
      closing,
      ["identity_verdict", "member_extents", "prior_decision_or_release_id"],
      `${rowPath}.closing_artifacts`,
    );
    const memberExtents = closing.member_extents;
    if (!Array.isArray(memberExtents)) {
      throw new Error(`${rowPath}.closing_artifacts.member_extents: expected array`);
    }
    const parsedExtents = memberExtents.map((rawExtent, extentIndex) => {
      const extentPath = `${rowPath}.closing_artifacts.member_extents[${extentIndex}]`;
      const extent = object(rawExtent, extentPath);
      exactFields(
        extent,
        ["decision_id", "extent_id", "receipt_ids", "verdict"],
        extentPath,
      );
      if (
        typeof extent.extent_id !== "string" ||
        extent.extent_id.length === 0 ||
        typeof extent.verdict !== "string" ||
        extent.verdict.length === 0 ||
        (
          ![
            "resolved:bounded_segment", "resolved:mixed",
            "resolved:route_wide", "resolved:stop_set",
          ].includes(extent.verdict) &&
          extent.verdict !== "absent_in_source" &&
          !/^blocked_upstream:.+/u.test(extent.verdict)
        ) ||
        (
          extent.decision_id !== null &&
          (typeof extent.decision_id !== "string" ||
            extent.decision_id.length === 0)
        ) ||
        (
          extent.verdict.startsWith("resolved:") &&
          extent.decision_id === null
        )
      ) {
        throw new Error(`${extentPath}: invalid member-extent closure`);
      }
      const receiptIds = strictStringArray(
        extent.receipt_ids,
        `${extentPath}.receipt_ids`,
      );
      if (
        (extent.verdict === "absent_in_source" ||
          extent.verdict.startsWith("blocked_upstream:")) &&
        receiptIds.length === 0
      ) {
        throw new Error(`${extentPath}: absence/block requires receipt provenance`);
      }
      return {
        extent_id: extent.extent_id,
        verdict: extent.verdict,
        decision_id: extent.decision_id,
        receipt_ids: receiptIds,
      };
    });
    const extentIds = parsedExtents.map((extent) => extent.extent_id);
    if (
      new Set(extentIds).size !== extentIds.length ||
      stableJson(extentIds as JsonValue) !==
        stableJson([...extentIds].sort() as JsonValue)
    ) {
      throw new Error(`${rowPath}: member extents must be sorted and unique`);
    }

    const identity = closing.identity_verdict === null
      ? null
      : object(
          closing.identity_verdict,
          `${rowPath}.closing_artifacts.identity_verdict`,
        );
    if (identity) {
      exactFields(
        identity,
        ["decision_id", "occurrence_id", "receipt_ids", "verdict"],
        `${rowPath}.closing_artifacts.identity_verdict`,
      );
      if (
        ![
          "binding_absent_after_search", "confirmed_out_of_window",
          "occurrence_created", "refuted_no_traversal",
          "refuted_wrong_route_attribution", "superseded_duplicate",
        ].includes(String(identity.verdict)) ||
        typeof identity.decision_id !== "string" ||
        identity.decision_id.length === 0 ||
        (
          identity.occurrence_id !== null &&
          (typeof identity.occurrence_id !== "string" ||
            identity.occurrence_id.length === 0)
        )
      ) {
        throw new Error(`${rowPath}: invalid identity closure`);
      }
      const receiptIds = strictStringArray(
        identity.receipt_ids,
        `${rowPath}.closing_artifacts.identity_verdict.receipt_ids`,
      );
      if (receiptIds.length === 0) {
        throw new Error(`${rowPath}: identity closure requires receipt provenance`);
      }
      if (
        identityDisposition(
          identity.verdict as BusLaneIdentityVerdictRow["verdict"],
        ) !== row.downstream_disposition ||
        row.prior_disposition !==
          "source_fixable_bus_lane_occurrence_identity" ||
        parsedExtents.length > 0 ||
        closing.prior_decision_or_release_id !== null
      ) {
        throw new Error(`${rowPath}: identity closure/disposition mismatch`);
      }
    } else if (parsedExtents.length > 0) {
      const derivedDisposition: DownstreamDispositionV2 =
        parsedExtents.every((extent) => extent.verdict.startsWith("resolved:"))
          ? "resolved_member_extent"
          : parsedExtents.some((extent) =>
              extent.verdict.startsWith("blocked_upstream:")
            )
          ? "extent_blocked_upstream"
          : parsedExtents.some((extent) =>
              extent.verdict === "absent_in_source"
            )
          ? "extent_absent_in_source"
          : (() => {
              throw new Error(`${rowPath}: member extent is nonterminal`);
            })();
      if (
        row.downstream_disposition !== derivedDisposition ||
        row.prior_disposition !==
          "source_fixable_member_treatment_extent" ||
        closing.prior_decision_or_release_id !== null
      ) {
        throw new Error(`${rowPath}: member-extent closure/disposition mismatch`);
      }
      const treatmentExtent = object(
        row.treatment_extent,
        `${rowPath}.treatment_extent`,
      );
      if (!Array.isArray(treatmentExtent.members)) {
        throw new Error(`${rowPath}.treatment_extent.members: expected array`);
      }
      const sourceFrontierExtentIds = treatmentExtent.members.map(
        (rawMember, memberIndex) => {
          const member = object(
            rawMember,
            `${rowPath}.treatment_extent.members[${memberIndex}]`,
          );
          if (
            typeof member.extent_id !== "string" ||
            member.extent_id.length === 0
          ) {
            throw new Error(
              `${rowPath}.treatment_extent.members[${memberIndex}].extent_id: expected string`,
            );
          }
          return member.extent_id;
        },
      ).sort();
      if (
        stableJson(sourceFrontierExtentIds as JsonValue) !==
          stableJson([...extentIds].sort() as JsonValue)
      ) {
        throw new Error(`${rowPath}: member closure denominator mismatch`);
      }
    } else if (closing.prior_decision_or_release_id !== null) {
      if (
        typeof closing.prior_decision_or_release_id !== "string" ||
        closing.prior_decision_or_release_id.length === 0 ||
        row.downstream_disposition !== "resolved_prior_approval" ||
        row.prior_disposition !== "approved_rc26"
      ) {
        throw new Error(`${rowPath}: prior closure/disposition mismatch`);
      }
    } else if (
      ![
        "quarantined_later_ace_phase", "tracker_owned_outcome_calendar",
        "tracker_owned_spine_or_pattern",
      ].includes(String(row.downstream_disposition)) ||
      row.prior_disposition !== row.downstream_disposition
    ) {
      throw new Error(`${rowPath}: terminal disposition lacks closing artifact`);
    }
    return [row as StudyReadinessV2Row];
  });
  const candidateIds = rows.map((row) => row.candidate_id);
  if (
    new Set(candidateIds).size !== candidateIds.length ||
    stableJson(candidateIds as JsonValue) !==
      stableJson([...candidateIds].sort() as JsonValue)
  ) {
    throw new Error(`${path}: candidate denominator must be sorted and unique`);
  }
  return rows;
}

export function buildStudyReadinessV2(input: {
  v1Rows: readonly Record<string, unknown>[];
  identityRows: readonly BusLaneIdentityVerdictRow[];
  extentRows: readonly MemberExtentLedgerRow[];
}): StudyReadinessV2Row[] {
  const identities = new Map(input.identityRows.map((row) => [
    row.candidate_id,
    row,
  ]));
  const extents = new Map(input.extentRows.map((row) => [
    extentDecisionKey(row),
    row,
  ]));
  const rows = input.v1Rows.map((prior) => {
    const candidateId = String(prior.candidate_id);
    const priorDisposition = String(prior.downstream_disposition);
    let downstream: DownstreamDispositionV2;
    let identityVerdict: StudyReadinessV2Row["closing_artifacts"]["identity_verdict"] =
      null;
    let memberExtents: StudyReadinessV2Row["closing_artifacts"]["member_extents"] =
      [];
    let priorDecisionOrReleaseId: string | null = null;

    if (priorDisposition === "source_fixable_bus_lane_occurrence_identity") {
      const identity = identities.get(candidateId);
      if (!identity) {
        throw new Error(`${candidateId}: identity frontier row lacks terminal companion`);
      }
      downstream = identityDisposition(identity.verdict);
      identityVerdict = {
        verdict: identity.verdict,
        decision_id: identity.decision_id,
        occurrence_id: identity.occurrence_id,
        receipt_ids: identity.acquisition_receipt_ids,
      };
    } else if (priorDisposition === "source_fixable_member_treatment_extent") {
      const treatmentExtent = prior.treatment_extent as {
        members?: Array<{
          extent_id: string;
          occurrence_id: string;
          route_record_id: string;
          treatment_record_id: string;
        }>;
      };
      const members = treatmentExtent?.members ?? [];
      if (members.length === 0) {
        throw new Error(`${candidateId}: member frontier row has no denominator`);
      }
      memberExtents = members.map((member) => {
        const row = extents.get(extentDecisionKey(member));
        if (!row) throw new Error(`${candidateId}: missing extent ledger member ${member.extent_id}`);
        return {
          extent_id: member.extent_id,
          verdict: row.verdict,
          decision_id: row.verdict_basis?.match(/review:([^;]+)/u)?.[1] ?? null,
          receipt_ids: row.receipt_ids,
        };
      }).sort((left, right) => left.extent_id.localeCompare(right.extent_id));
      if (memberExtents.every((row) => row.verdict.startsWith("resolved:"))) {
        downstream = "resolved_member_extent";
      } else if (memberExtents.some((row) => row.verdict.startsWith("blocked_upstream:"))) {
        downstream = "extent_blocked_upstream";
      } else if (memberExtents.some((row) => row.verdict === "absent_in_source")) {
        downstream = "extent_absent_in_source";
      } else {
        throw new Error(`${candidateId}: member frontier still has a nonterminal row`);
      }
    } else if (priorDisposition === "approved_rc26") {
      downstream = "resolved_prior_approval";
      priorDecisionOrReleaseId = String(
        (prior as { decision_id?: unknown }).decision_id ?? "v1-rc26",
      );
    } else if (
      priorDisposition === "tracker_owned_spine_or_pattern" ||
      priorDisposition === "tracker_owned_outcome_calendar" ||
      priorDisposition === "quarantined_later_ace_phase"
    ) {
      downstream = priorDisposition;
    } else {
      throw new Error(`${candidateId}: unsupported v1 disposition ${priorDisposition}`);
    }
    return {
      ...prior,
      schema_version: 2,
      ledger_id: STUDY_READINESS_V2_CONTRACT_ID,
      prior_disposition: priorDisposition,
      downstream_disposition: downstream,
      closing_artifacts: {
        identity_verdict: identityVerdict,
        member_extents: memberExtents,
        prior_decision_or_release_id: priorDecisionOrReleaseId,
      },
    } as StudyReadinessV2Row;
  }).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  if (
    new Set(rows.map((row) => row.candidate_id)).size !== rows.length ||
    rows.some((row) => row.downstream_disposition.startsWith("source_fixable_"))
  ) {
    throw new Error("study-readiness v2 has duplicate or lingering source-fixable rows");
  }
  return rows;
}

export function writeStudyReadinessV2(options: {
  rootDir?: string;
  v1BridgePath?: string;
  identityPath?: string;
  extentLedgerPath?: string;
  outputDir?: string;
} = {}): { rows: StudyReadinessV2Row[]; manifestSha256: string } {
  const rootDir = resolve(options.rootDir ?? repoRoot);
  const v1Path = resolve(
    rootDir,
    options.v1BridgePath ?? "data/quality/study-readiness/v1/bridge-ledger.jsonl",
  );
  const identityPath = resolve(
    rootDir,
    options.identityPath ??
      "data/contracts/bus-lane-identity-verdicts-v1/bus_lane_identity_verdicts.jsonl",
  );
  const extentPath = resolve(
    rootDir,
    options.extentLedgerPath ??
      "data/quality/operational-reference/member-extent-ledger.jsonl",
  );
  const outputDir = resolve(
    rootDir,
    options.outputDir ?? "data/quality/study-readiness/v2",
  );
  const rows = buildStudyReadinessV2({
    v1Rows: jsonl(v1Path),
    identityRows: jsonl(identityPath),
    extentRows: jsonl(extentPath),
  });
  const ledgerBytes = rows.map((row) =>
    stableJson(row as unknown as JsonValue)
  ).join("\n") + "\n";
  const summary = {
    schema_version: 2,
    contract_id: STUDY_READINESS_V2_CONTRACT_ID,
    candidate_count: rows.length,
    disposition_histogram: histogram(rows.map((row) =>
      row.downstream_disposition
    )),
    source_fixable_count: 0,
    frontier_exception_count: 0,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  const summaryBytes = `${stableJson(summary as unknown as JsonValue)}\n`;
  const files = [
    {
      path: "bridge-ledger.jsonl",
      bytes: Buffer.byteLength(ledgerBytes),
      sha256: createHash("sha256").update(ledgerBytes).digest("hex"),
    },
    {
      path: "bridge-summary.json",
      bytes: Buffer.byteLength(summaryBytes),
      sha256: createHash("sha256").update(summaryBytes).digest("hex"),
    },
  ];
  const manifest = {
    schema_version: 2,
    contract_id: "study-readiness-v2-manifest",
    files,
    candidate_count: rows.length,
    source_fixable_count: 0,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  const manifestBytes = `${stableJson(manifest as unknown as JsonValue)}\n`;
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, "bridge-ledger.jsonl"), ledgerBytes);
  writeFileSync(resolve(outputDir, "bridge-summary.json"), summaryBytes);
  writeFileSync(resolve(outputDir, "manifest.json"), manifestBytes);
  return {
    rows,
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
  };
}
