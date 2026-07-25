import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  buildBusLaneIdentityVerdicts,
  parseBusLaneIdentityVerdicts,
} from "../packages/pipeline/src/quality/bus-lane-identity-companion";
import {
  parseBusLaneIdentityLedger,
} from "../packages/pipeline/src/quality/bus-lane-identity";
import {
  buildMemberGrainCompanion,
  memberExtentProjectionSha256,
  memberGrainKey,
  parseMemberGrainCompanion,
} from "../packages/pipeline/src/quality/member-grain-companion";
import {
  loadMemberGrainDecisions,
} from "../packages/pipeline/src/quality/member-grain-decisions";
import type { MemberGrainLedgerRow } from "../packages/pipeline/src/quality/member-extent-ledger";
import type { MemberExtentRow } from "../packages/pipeline/src/quality/study-readiness-v1";
import { writeStudyReadinessV2 } from "../packages/pipeline/src/quality/study-readiness-v2";

const sha256 = (bytes: string | Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");
const jsonl = <T>(path: string): T[] =>
  readFileSync(path, "utf8").split(/\r?\n/u).flatMap((line) =>
    line ? [JSON.parse(line) as T] : []
  );
const write = (path: string, bytes: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
};
const stableLines = (rows: readonly unknown[]): string =>
  rows.map((row) => stableJson(row as JsonValue)).join("\n") + "\n";

const identityRoot = join(
  repoRoot,
  "data/contracts/bus-lane-identity-verdicts-v1",
);
const identityRows = buildBusLaneIdentityVerdicts(
  parseBusLaneIdentityLedger(
    readFileSync(
      join(
        repoRoot,
        "data/quality/operational-reference/bus-lane-identity-ledger.jsonl",
      ),
      "utf8",
    ),
  ),
);
const identityBytes = stableLines(identityRows);
parseBusLaneIdentityVerdicts(
  identityBytes,
  "bus_lane_identity_verdicts.jsonl",
  identityRows.map((row) => row.candidate_id),
);
write(join(identityRoot, "bus_lane_identity_verdicts.jsonl"), identityBytes);
const identityFixture = `${stableJson(identityRows[0] as unknown as JsonValue)}\n`;
write(join(identityRoot, "fixture.jsonl"), identityFixture);
write(
  join(identityRoot, "contract.json"),
  `${stableJson({
    schema_version: 1,
    contract_id: "bus-lane-identity-verdict-v1",
    contract_status: "enforced",
    denominator: {
      source: "bus-lane-identity-ledger.jsonl",
      candidate_count: identityRows.length,
      key: "candidate_id",
      sorted_unique: true,
    },
    exact_positive_requirement: true,
    binding_absent_after_search_semantics:
      "candidate_specific_binding_search_exhausted_not_onset_absence_or_refutation",
    authorizes_study: false,
    authorizes_cross_product: false,
  } as JsonValue)}\n`,
);
write(
  join(identityRoot, "manifest.json"),
  `${stableJson({
    schema_version: 1,
    contract_id: "bus-lane-identity-verdict-manifest-v1",
    candidate_count: identityRows.length,
    verdict_histogram: Object.fromEntries(
      [...new Set(identityRows.map((row) => row.verdict))].sort().map((verdict) => [
        verdict,
        identityRows.filter((row) => row.verdict === verdict).length,
      ]),
    ),
    projection: {
      path: "bus_lane_identity_verdicts.jsonl",
      bytes: Buffer.byteLength(identityBytes),
      sha256: sha256(identityBytes),
    },
    fixture: {
      path: "fixture.jsonl",
      bytes: Buffer.byteLength(identityFixture),
      sha256: sha256(identityFixture),
    },
    authorizes_study: false,
    authorizes_cross_product: false,
  } as JsonValue)}\n`,
);

const extentPath = join(
  repoRoot,
  "data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl",
);
const extentBytes = readFileSync(extentPath);
const extentRows = jsonl<MemberExtentRow>(extentPath);
const grainLedger = jsonl<MemberGrainLedgerRow>(
  join(
    repoRoot,
    "data/quality/operational-reference/member-grain-ledger.jsonl",
  ),
);
const decisions = loadMemberGrainDecisions([
  join(
    repoRoot,
    "data/quality/operational-reference/member-grain-decisions",
  ),
]);
const decisionIds = new Map(decisions.map((decision) => [
  memberGrainKey(decision),
  decision.decision_id,
]));
const grainRows = buildMemberGrainCompanion({
  ledgerRows: grainLedger,
  extentRows,
  decisionIdsByKey: decisionIds,
});
const grainBytes = stableLines(grainRows);
const extentSha = memberExtentProjectionSha256(extentBytes);
parseMemberGrainCompanion(
  grainBytes,
  extentSha,
  extentSha,
  "operational_occurrence_member_grain.jsonl",
  extentRows,
);
const grainRoot = join(
  repoRoot,
  "data/contracts/operational-occurrence-member-grain/v1",
);
write(join(grainRoot, "operational_occurrence_member_grain.jsonl"), grainBytes);
const grainFixture = `${stableJson(
  grainRows.find((row) => row.terminal_disposition === "resolved") as unknown as JsonValue,
)}\n`;
write(join(grainRoot, "fixture.jsonl"), grainFixture);
write(
  join(grainRoot, "contract.json"),
  `${stableJson({
    schema_version: 1,
    contract_id: "operational-occurrence-member-grain-v1",
    contract_status: "enforced",
    denominator: {
      source:
        "data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl",
      member_count: grainRows.length,
      key: "occurrence_id+route_record_id+treatment_record_id",
      sorted_unique: true,
      member_extent_sha256: extentSha,
    },
    terminal_dispositions: [
      "absent_in_source",
      "blocked_upstream",
      "not_applicable",
      "resolved",
    ],
    exact_positive_requirement: true,
    historical_full_stop_and_stop_id_equivalence_prerequisite_preserved: true,
    authorizes_study: false,
    authorizes_cross_product: false,
  } as JsonValue)}\n`,
);
write(
  join(grainRoot, "manifest.json"),
  `${stableJson({
    schema_version: 1,
    contract_id: "operational-occurrence-member-grain-manifest-v1",
    member_count: grainRows.length,
    terminal_disposition_histogram: Object.fromEntries(
      [...new Set(grainRows.map((row) => row.terminal_disposition))].sort()
        .map((verdict) => [
          verdict,
          grainRows.filter((row) => row.terminal_disposition === verdict).length,
        ]),
    ),
    member_extent_projection: {
      path:
        "data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl",
      bytes: extentBytes.length,
      sha256: extentSha,
    },
    projection: {
      path: "operational_occurrence_member_grain.jsonl",
      bytes: Buffer.byteLength(grainBytes),
      sha256: sha256(grainBytes),
    },
    fixture: {
      path: "fixture.jsonl",
      bytes: Buffer.byteLength(grainFixture),
      sha256: sha256(grainFixture),
    },
    authorizes_study: false,
    authorizes_cross_product: false,
  } as JsonValue)}\n`,
);

const v2 = writeStudyReadinessV2();
console.log(
  `Generated study-readiness v2: identity=${identityRows.length}, ` +
    `member-grain=${grainRows.length}, bridge=${v2.rows.length}, ` +
    `manifest=${v2.manifestSha256}.`,
);
