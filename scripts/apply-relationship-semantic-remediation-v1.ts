import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableHash, stableJson } from "../packages/db/src/stable-json";
import type {
  JsonObject,
  JsonValue,
  MtaCanonicalRecord,
  MtaEvidenceRef,
  MtaSubmissionEntry,
  MtaSubmitObservationInput,
} from "../packages/db/src/types";
import { entriesToRecords } from "../packages/pipeline/src/materialize/materialize";
import {
  readSemanticCorrections,
  readSemanticCorrectionSupersessions,
  type SemanticCorrectionEntry,
  type SemanticCorrectionSupersession,
  withSemanticCorrections,
} from "../packages/pipeline/src/records/semantic-corrections";
import {
  readSubmissionRetirements,
  type SubmissionRetirementEntry,
} from "../packages/pipeline/src/records/submission-overrides";
import {
  createSubmissionEntry,
  readSubmissionEntries,
} from "../packages/pipeline/src/records/submissions";
import {
  danglingReferences,
  derivedRelationCoverage,
} from "../packages/pipeline/src/records/derived-relations";

const REVIEWED_AT = "2026-07-16T03:00:00.000Z";
const RUN_ID = "2026-07-16T03-00-00-000Z_relationship-semantic-remediation-v1";
const CAMPAIGN_ID = "relationship-semantic-remediation-v1";
const CORRECTION_PREFIX = "zz-relationship-semantic-v1-";
const SOURCE_DECISION_PREFIX =
  "data/quality/relationship-integrity/semantic-remediation/ledger.jsonl#";

const SHARD_DIR = join(
  repoRoot,
  "data/contracts/relationships/v1/semantic-remediation-shards",
);
const SEMANTIC_REVIEW_DIR = join(
  repoRoot,
  "data/contracts/relationships/v1/semantic-review-shards",
);
const CORRECTIONS_PATH = join(
  repoRoot,
  "data/semantic-corrections/corrections.jsonl",
);
const SUPERSESSIONS_PATH = join(
  repoRoot,
  "data/semantic-corrections/supersessions-v1.json",
);
const RETIREMENTS_PATH = join(
  repoRoot,
  "data/submission-overrides/retired.json",
);
const IDENTITY_MERGES_PATH = join(
  repoRoot,
  "data/identity-overrides/merges.json",
);
const JOURNAL_PATH = join(repoRoot, "data/submissions", `${RUN_ID}.jsonl`);
const QUALITY_ROOT = join(
  repoRoot,
  "data/quality/relationship-integrity/semantic-remediation",
);
const LEDGER_PATH = join(QUALITY_ROOT, "ledger.jsonl");
const SUMMARY_PATH = join(QUALITY_ROOT, "summary.json");
const REPORT_PATH = join(QUALITY_ROOT, "report.md");
const PROJECTED_RELATIONS_PATH = join(
  QUALITY_ROOT,
  "projected-relations.jsonl",
);
const PROJECTED_TUPLES_PATH = join(
  QUALITY_ROOT,
  "projected-tuples.json",
);
const SUBMISSION_MAP_PATH = join(
  QUALITY_ROOT,
  "replacement-submission-map.json",
);
const STATEN_REBLOCKING_JOURNAL_PATH = join(
  repoRoot,
  "data/submissions/2026-07-16T01-30-00-000Z_staten-island-evidence-reblocking-remediation.jsonl",
);
const EXPECTED_STATEN_REBLOCKING_JOURNAL_SHA256 =
  "7c91ba7c95ec523cf200179239c1f25aea5a4b317439be4a3b9d7fa81f5c36f2";
const PAYLOAD_REFERENCE_REMEDIATION_LEDGER_PATH = join(
  repoRoot,
  "data/quality/relationship-integrity/payload-references/remediation-ledger.jsonl",
);
const EXPECTED_PAYLOAD_REFERENCE_REMEDIATION_LEDGER_SHA256 =
  "db2a04b5a54f6e7982849fa101c0c72338000ef06d493f40565b2b168f5b6de1";
const PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_PATH = join(
  repoRoot,
  "data/submissions/2026-07-16T04-00-00-000Z_relationship-payload-reference-remediation-v1.jsonl",
);
const EXPECTED_PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_SHA256 =
  "35a6d36b5e0b922b59a076d2b477b76ce4c292d5c49f8216ed36e8128b20b9a4";
const PAYLOAD_REFERENCE_REVIEW_DECISIONS_PATH = join(
  repoRoot,
  "data/contracts/relationship-references/v1/review-decisions.jsonl",
);
const EXPECTED_PAYLOAD_REFERENCE_REVIEW_DECISIONS_SHA256 =
  "c3f3545ced15c8f637469097eeb08db1ff8cd9c52a1c897d3b0ff8aadfa5f102";
const EXPECTED_PAYLOAD_REFERENCE_REMEDIATION_COUNT = 81;
const PAYLOAD_REFERENCE_REVIEW_DECISIONS_RELATIVE_PATH = relative(
  repoRoot,
  PAYLOAD_REFERENCE_REVIEW_DECISIONS_PATH,
);

const NATIVE_DERIVATION_SUPERSESSIONS = [
  {
    correction_id:
      "core-coverage-q20-historical-corridor-share-scope-20260713",
    decision_id:
      "relationship-reference-review-v1:692f49d5dbd6992a71ee23f4",
    reason:
      "The exact reviewed Q20 temporal-identity non-edge decision is now enforced before native metric-route derivation. The invalid current-Q20 to 2014 corridor-share edge is no longer created, so the earlier retract-after-derivation correction is obsolete.",
  },
  {
    correction_id:
      "core-coverage-q20-historical-peak-frequency-scope-20260713",
    decision_id:
      "relationship-reference-review-v1:692f49d5dbd6992a71ee23f4",
    reason:
      "The exact reviewed Q20 temporal-identity non-edge decision is now enforced before native metric-route derivation. The invalid current-Q20 to 2014 peak-frequency edge is no longer created, so the earlier retract-after-derivation correction is obsolete.",
  },
  {
    correction_id:
      "core-coverage-q20-historical-ridership-scope-20260713",
    decision_id:
      "relationship-reference-review-v1:692f49d5dbd6992a71ee23f4",
    reason:
      "The exact reviewed Q20 temporal-identity non-edge decision is now enforced before native metric-route derivation. The invalid current-Q20 to 2014 ridership edge is no longer created, so the earlier retract-after-derivation correction is obsolete.",
  },
  {
    correction_id:
      "core-coverage-q20-historical-weekday-ridership-scope-20260713",
    decision_id:
      "relationship-reference-review-v1:692f49d5dbd6992a71ee23f4",
    reason:
      "The exact reviewed Q20 temporal-identity non-edge decision is now enforced before native metric-route derivation. The invalid current-Q20 to 2014 weekday-ridership edge is no longer created, so the earlier retract-after-derivation correction is obsolete.",
  },
  {
    correction_id:
      "relationship-integrity-legacy-0215-relation-part-of-program-project-fuel-hedge-program-2022-project-fuel-hedge-program-2022-2362d3ba6a",
    decision_id:
      "relationship-reference-review-v1:dc62818001cdceef68cf5cd5",
    reason:
      "The exact reviewed Fuel Hedge Program self-reference decision is now enforced by native project-program derivation before edge creation. The forbidden project self-edge is no longer created, so the earlier retract-after-derivation correction is obsolete.",
  },
  {
    correction_id: "semqa-000032",
    decision_id:
      "relationship-reference-review-v1:b8744acf4521b57f274f56df",
    reason:
      "The exact reviewed East Side Access self-reference decision is now enforced by native project-program derivation before edge creation. The forbidden project self-edge is absent, making the earlier quarantine correction obsolete.",
  },
  {
    correction_id: "zz-relationship-semantic-v1-9de3c3338e693d9f",
    decision_id:
      "relationship-reference-review-v1:b8744acf4521b57f274f56df",
    reason:
      "The exact reviewed East Side Access self-reference decision is now enforced by native project-program derivation before edge creation. The forbidden project self-edge is no longer created, so the later retract-after-derivation correction is obsolete.",
  },
] as const;
const NATIVE_DERIVATION_SUPERSESSION_IDS = new Set<string>(
  NATIVE_DERIVATION_SUPERSESSIONS.map(
    (entry) => entry.correction_id,
  ),
);
const EAST_SIDE_ACCESS_NATIVE_NON_EDGE_RELATION_ID =
  "relation_part-of-program-project-annual-2021-east-side-access-project-annual-2021-east-side-access_7abcbc950c";
const EAST_SIDE_ACCESS_NATIVE_NON_EDGE_CORRECTION_ID =
  "zz-relationship-semantic-v1-9de3c3338e693d9f";

const ROUTE_IDENTITY_MERGE_SPLITS: Record<string, string> = {
  "route_bx15-ace": "route_bx15-ltd-webster-2012",
  "route_m16-mentioned": "route_m34a-sbs",
  "route_q52-ltd-woodhaven-2014": "route_q52-sbs-queens",
  "route_q53-ltd-woodhaven-2014": "route_q53-sbs-ace",
};
const ROUTE_IDENTITY_RELATION_IDS = [
  "relation_bx15-local-replaces-bx55",
  "relation_bx15-ltd-replaces-bx55",
  "relation_bx55-renamed-bx15-ltd",
  "relation_bx55-renamed-to-bx15-limited-2012",
  "relation_m16-related-to-m34a-sbs",
  "relation_m16-renamed-to-m34a",
  "relation_q52-sbs-replaces-ltd",
  "relation_q53-sbs-replaces-ltd",
] as const;
const BX15_MISTARGETED_SUBMISSION_ID = "sub_b3fd1d768f00f286";
const BX15_REPLACEMENT_SUBMISSION_ID = "sub_a4ca1983bfb6ce83";
const BX15_REPLACEMENT_TOOL_ARGS_SHA256 =
  "sha256:a4ca1983bfb6ce83935af447e76626f1612fbf2753a684c45b8eff9610e230a3";
const ROUTE_IDENTITY_RETIREMENT_SOURCE_DECISION =
  `${SOURCE_DECISION_PREFIX}route-identity/${BX15_MISTARGETED_SUBMISSION_ID}`;
const EXPECTED_BASE_RETIREMENT_COUNT = 353;
const EXPECTED_BASE_CORRECTION_COUNT = 433;
const IDENTITY_WARNING_REVIEW_NOTE_PATH = join(
  repoRoot,
  "data/review_notes/codex-relationship-identity-warning-remediation-2026-07-17.json",
);
const IDENTITY_WARNING_REVIEW_NOTE_RELATIVE_PATH = relative(
  repoRoot,
  IDENTITY_WARNING_REVIEW_NOTE_PATH,
);
const EXPECTED_IDENTITY_WARNING_REVIEW_NOTE_SHA256 =
  "9934e8cab6b92c84feadfaab352edd22344ffdd04ba00dfb0c043871ec05408f";
const IDENTITY_WARNING_REVIEW_ID =
  "codex-relationship-identity-warning-remediation-2026-07-17";
const M16_PREDECESSOR_CORRECTION_ID =
  "zz-relationship-identity-m16-predecessor-payload-20260717";
const FAMILY_WARNING_REVIEW_NOTE_PATH = join(
  repoRoot,
  "data/review_notes/codex-relationship-family-warning-review-2026-07-17.json",
);
const FAMILY_WARNING_REVIEW_NOTE_RELATIVE_PATH = relative(
  repoRoot,
  FAMILY_WARNING_REVIEW_NOTE_PATH,
);
const EXPECTED_FAMILY_WARNING_REVIEW_NOTE_SHA256 =
  "3ff8f9c9d35ce8f1928c2e3d7ea03d0b6bdece1f25065171799d696f7d12d56f";
const FAMILY_WARNING_REVIEW_ID =
  "codex-relationship-family-warning-review-2026-07-17";
const MOODYS_RATING_EVENT_CORRECTION_ID =
  "zz-relationship-family-moodys-rating-event-20260717";
const BT_DUPLICATE_RETIRED_SUBMISSION_ID = "sub_e3708564e75e6501";
const BT_DUPLICATE_RETAINED_SUBMISSION_ID = "sub_86a5676ccd28c686";
const BT_DUPLICATE_ORIGINAL_RUN_ID =
  "2026-06-21T21-06-02-003Z_3137823-9d18eae6_ingest_meeting-doc-196841";
const BT_DUPLICATE_RETIRED_TOOL_ARGS_SHA256 =
  "sha256:e3708564e75e6501840e1464c84b0362c9064f7ebef4d6fa6f2d255611e874ab";
const BT_DUPLICATE_RETAINED_TOOL_ARGS_SHA256 =
  "sha256:86a5676ccd28c686c5af0b136273459f3ef60151599532da4cec922dfa18275b";
const BT_DUPLICATE_RETAINED_CORRECTION_IDS = [
  "semqa-000007",
  "zz-relationship-semantic-v1-7c940c700fbbaf65",
] as const;

const POST_CAMPAIGN_RETIREMENT_PINS: Record<
  string,
  { decision_id: string; row_sha256: string }
> = {
  sub_7ef8e80454f1c62e: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "f8cbee800e27775086aaae4f2d8ad778985e0031f6e6f25e42ae768bc1e43641",
  },
  sub_f817f1b21e000302: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "4933a0b5c5c6677c0d33fea36afa22e814a206ffe280f1f55a19730c0aa125a0",
  },
  sub_80d3ab843a8e37ba: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "f73da28d33c392c956ce4a4434e27f086764f2dee45b41679ba6412164bc8799",
  },
  sub_ebd19ab73e34c996: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "5b8a71369b6bb34dca37b6b7cd2d37e0d508277a9df95b29577ea14ba415fdc5",
  },
  sub_80c3f9672781b046: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "254ef882d759ed91212d273eb0612fdd541fcf28f02d30e3bbf1cea1e15fdde9",
  },
  sub_960d576071061a64: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "856a0410f7030ec2ec169ea01229581d3eecf3566b21393379056a6b18b321ce",
  },
  sub_524bbe1a2aabb4f3: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "6d3c30b45521a4fd93b38ecf32f0abd907a9eb8b6c36b119d9d8b88abedbdabd",
  },
  sub_af84f73845b39d74: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "c0c149c8f4ba8760a4aee53ff40618a5878e7ff2a6e2553226b19178c834e453",
  },
  sub_c43a00963ed7bf72: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "9b6e5253434515c1bc977f6b2c0cf5f16a2b439d5bd17daec82404dda67d21f3",
  },
  sub_6a3b87e89d6f8dbd: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "bf4934f82dd9012c3c4a6300da3aff2c91a8ddee4ddcd5a97ea40887fc1c3c5e",
  },
  sub_b4eb4618080b6ddb: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "418d5221095bdc1d5df310423d99fbd25709b4a7e0228e63f8a734826592efe4",
  },
  sub_29951b4ef8398128: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "0fd6c47874daa9ea7e9628ad09cc3a3b113903f62cd17a62de5e4a520a2cf1f4",
  },
  sub_f4770bc4ce071a6c: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "936eb430d0b30b9dd79eda33f95560f922a8c8ffef03ba9cf153aa67f495fc2b",
  },
  sub_98da12bdb65c632d: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "c9a3aad5b68f6f5753b382c36ee00ea9800ded4769e1d833fd23e1b89df4fb82",
  },
  sub_8f9321a81e180367: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "0c85c44987739bea3fe88bef5e0d1d852d2e82e59d5b616dc51f6b088c7029c0",
  },
  sub_441d731c782b5350: {
    decision_id: "embedded-report-pseudo-sources",
    row_sha256: "794ed9fbac4a474720d829bb719d99d25e00b841aef4de22a7b13ef92969cd82",
  },
  sub_d256b1825a9130cb: {
    decision_id: "queens-semantic-remediation-duplicate",
    row_sha256: "76f9b661c6b65f6291fd3a8b08f5dd091cdbc27364e4ce736cde91114fd5ae48",
  },
  sub_4136d1aadb36264b: {
    decision_id: "queens-semantic-remediation-duplicate",
    row_sha256: "e3e99685306d90ee637277ed6cb85d59cb862813b225a8f31e62f73a7b60043d",
  },
  sub_e3708564e75e6501: {
    decision_id: "bt-distributable-income-exact-duplicate",
    row_sha256: "747b23ca935667009a4fbe1c2c5317540756eef2ff591c3152dd349e821d8416",
  },
};

const ROUTE_IDENTITY_SUBMISSION_PINS: Record<
  string,
  {
    tool_args_sha256: string;
    target_record_id?: string;
  }
> = {
  sub_049a143a7b11aef3: {
    tool_args_sha256:
      "sha256:049a143a7b11aef31c6ffc04949d2ff7699596468bbdd806e97e0eb3fc08f414",
    target_record_id: "route_q53-sbs-ace",
  },
  sub_10ebd6a95a3990e3: {
    tool_args_sha256:
      "sha256:10ebd6a95a3990e3f46faea13951424b201d836caf5afc261ac88fa23369030b",
    target_record_id: "route_bx15-ace",
  },
  sub_26863e165aee7983: {
    tool_args_sha256:
      "sha256:26863e165aee79838e8b95a13b04a5cdf3452460e6caebdedd9d5778da597011",
    target_record_id: "route_q53-ltd-woodhaven-2014",
  },
  sub_44c16acea6c24460: {
    tool_args_sha256:
      "sha256:44c16acea6c24460fce1109a91dde04326cd03a74caa371f4048d92f9ba85687",
    target_record_id: "route_m16-mentioned",
  },
  sub_4fbff44709754ce0: {
    tool_args_sha256:
      "sha256:4fbff44709754ce052dd89a27f505df5adfe3140b61c4fe85adc95e16bcaf993",
    target_record_id: "route_bx15-ace",
  },
  sub_6bace2a398e15571: {
    tool_args_sha256:
      "sha256:6bace2a398e15571605c0d5f9a0d78f655cf4c96fd9a55f83df150ca256a5133",
    target_record_id: "route_q52-sbs-queens",
  },
  sub_83a3fae7f354f2ef: {
    tool_args_sha256:
      "sha256:83a3fae7f354f2ef2acf75fdddf675aad4882d1ea2429c3acb63b4d4029e7765",
    target_record_id: "route_bx15-ace",
  },
  sub_89fafdd61d0a5cf4: {
    tool_args_sha256:
      "sha256:89fafdd61d0a5cf41fba1efc8fa00518fcda253db1d9e11b915760da26c0c6ed",
    target_record_id: "route_m34a-sbs",
  },
  sub_b3fd1d768f00f286: {
    tool_args_sha256:
      "sha256:b3fd1d768f00f286fa93ee0e50ed16aede3687e22aba4b5dd535052e1ea8321a",
    target_record_id: "route_bx15-ace",
  },
  sub_d381702a0310030d: {
    tool_args_sha256:
      "sha256:d381702a0310030db5ca21c85f27c8e474fec29a4cac43dad97fa69d0a2030f2",
    target_record_id: "route_q52-ltd-woodhaven-2014",
  },
  sub_db600f92a7823098: {
    tool_args_sha256:
      "sha256:db600f92a7823098f8eb96fbac4de112ce3079328a0dd1a4fe9a79803729164f",
    target_record_id: "route_m16-mentioned",
  },
  sub_f43682b2b609e0e8: {
    tool_args_sha256:
      "sha256:f43682b2b609e0e83e2be99b3bac8353454de9538ec44bd4c8fcf300660a94ad",
    target_record_id: "route_m34a-sbs",
  },
  sub_f54c705e885bb4e7: {
    tool_args_sha256:
      "sha256:f54c705e885bb4e71ffafa2d8e9f06beffe66e32fc941d3bbf13fdc1150404c0",
  },
  sub_fae5bd03b76c12cb: {
    tool_args_sha256:
      "sha256:fae5bd03b76c12cbfe970c852460c787cbccc91b375e02639a9857e08e3b867f",
    target_record_id: "route_bx15-ltd-webster-2012",
  },
};

const EXPECTED_SHARDS = [
  {
    index: 0,
    fileSha256:
      "fa2a6b2b8232666cabf12b36454d5465cfb76bdaf6a448090e4cad58d72c9e8e",
    logicalSha256:
      "6c8fdadb33a80df7047e5d9447ae96005add24769712e40390b396688455cde2",
    relationCount: 100,
  },
  {
    index: 1,
    fileSha256:
      "2daac538b4c85ed393e8854666ec3237a8d877f6c550f31eb3ccf395caf9df08",
    logicalSha256:
      "b2563d8ab10f3660e99ae4e7db267c1ababbcc8f2d6deb0a7955a35cc1716215",
    relationCount: 128,
  },
  {
    index: 2,
    fileSha256:
      "bf11ae036b3defee609d6eb23ccf103f0c9616e61cf55154584c4270a9206046",
    logicalSha256:
      "876d906eff431484a95e07f9cf06f984aa91d9a53ef1ca3db4c1108b3a0582d0",
    relationCount: 171,
  },
] as const;

const EXPECTED_ACTION_COUNTS: Record<string, number> = {
  patch_relation: 106,
  replace_endpoint: 83,
  replace_with_submissions: 58,
  resolved_by_generator_fix: 33,
  resolved_by_identity_campaign: 16,
  retract_unsupported: 103,
};

const LIVE_DERIVATION_RULE_FIXES = new Set([
  "derived-operated-by-requires-exact-operator-v1",
  "entity-publisher",
]);

const ALLOWED_PRE_REPLAY_ISSUES = new Set([
  "relationship-integrity-legacy-0051-relation-mta-has-open-data-program",
  "semqa-000014",
  "semqa-000015",
  "semqa-000031",
  "semqa-000036",
  "semqa-000037",
]);

const ROUTE_IDENTITY_QUARANTINE_SUPERSESSIONS = [
  {
    correction_id: "semqa-000014",
    relation_id: "relation_m16-related-to-m34a-sbs",
    old_guard: {
      relation_kind: "related_route",
      subject_id: "route_m34a-sbs",
      object_id: "route_m34a-sbs",
    },
  },
  {
    correction_id: "semqa-000015",
    relation_id: "relation_m16-renamed-to-m34a",
    old_guard: {
      relation_kind: "related_route",
      subject_id: "route_m34a-sbs",
      object_id: "route_m34a-sbs",
    },
  },
  {
    correction_id: "semqa-000036",
    relation_id: "relation_q52-sbs-replaces-ltd",
    old_guard: {
      relation_kind: "related_route",
      subject_id: "route_q52-sbs-queens",
      object_id: "route_q52-sbs-queens",
    },
  },
  {
    correction_id: "semqa-000037",
    relation_id: "relation_q53-sbs-replaces-ltd",
    old_guard: {
      relation_kind: "related_route",
      subject_id: "route_q53-sbs-ace",
      object_id: "route_q53-sbs-ace",
    },
  },
] as const;

const ROUTE_IDENTITY_PRE_REISSUE_TUPLES: Record<
  string,
  {
    pre_tuple: {
      relation_family: string;
      relation_kind: string;
      subject_id: string;
      object_id: string;
    };
    post_tuple: {
      relation_family: string;
      relation_kind: string;
      subject_id: string;
      object_id: string;
    };
    retired_submission_id: string;
    replacement_submission_id: string;
    evidence_bindings_sha256: string;
  }
> = {
  "relation_bx55-renamed-to-bx15-limited-2012": {
    pre_tuple: {
      relation_family: "route_scope",
      relation_kind: "related_route",
      subject_id: "route_bx55-2012",
      object_id: "route_bx15-ace",
    },
    post_tuple: {
      relation_family: "route_scope",
      relation_kind: "related_route",
      subject_id: "route_bx55-2012",
      object_id: "route_bx15-ltd-webster-2012",
    },
    retired_submission_id: BX15_MISTARGETED_SUBMISSION_ID,
    replacement_submission_id: BX15_REPLACEMENT_SUBMISSION_ID,
    evidence_bindings_sha256:
      "24d2d94012b9e14759582c83ceae391bdc4f021f157b1dbf175a2fa3376466f5",
  },
};

type JsonRecord = Record<string, JsonValue>;

type ShardDecision = {
  relation_id: string;
  tuple_indices: number[];
  current_snapshot: JsonRecord;
  terminal_action: string;
  rationale: string;
  supported_claims: string[];
  unsupported_claims: string[];
  action: JsonRecord;
};

type RemediationShard = {
  schema_version: number;
  contract_id: string;
  shard_id: string;
  review_status: string;
  pinned_inputs: JsonRecord;
  summary: JsonRecord;
  decisions: ShardDecision[];
};

type SemanticReviewDecision = {
  tuple_index: number;
  relation_kind: string;
  relation_family: string;
  subject_kind: string;
  object_kind: string;
  decision: string;
};

type SemanticReviewShard = {
  schema_version: number;
  shard_id: string;
  review_status: string;
  decisions: SemanticReviewDecision[];
};

type LoadedDecision = ShardDecision & {
  shard_index: number;
  decision_id: string;
};

type ProjectedRelationRow = {
  relation_id: string;
  relation_family: string;
  relation_kind: string;
  subject_id: string;
  subject_kind: string;
  object_id: string;
  object_kind: string;
  evidence_ids: string[];
  evidence_bindings_sha256: string;
  semantic_review_decision_ids: string[];
  semantic_remediation_decision_ids: string[];
  mapping_status: "mapped";
};

type PayloadReferenceRemediationLedgerRow = {
  schema_version: 1;
  contract_id: "relationship-reference-contract-v1";
  remediation_id: string;
  proposal_id: string;
  relationship_reference_decision_ids: string[];
  submission_id: string;
  relation_record_id: string;
  rule_id: string;
  field: string;
  source_literal: string;
  origin_record_id: string;
  relation_kind: string;
  subject_id: string;
  object_id: string;
  evidence_ids: string[];
  evidence_bindings_sha256: string;
  journal_path: string;
  status: "materialized";
};

type PayloadReferenceRemediationProvenance = {
  rows: PayloadReferenceRemediationLedgerRow[];
  decisionIdsBySubmissionId: Map<string, string[]>;
  ledgerSha256: string;
  journalSha256: string;
  reviewDecisionsSha256: string;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path: string): string {
  return sha256(readFileSync(path));
}

function logicalSha256(value: JsonValue): string {
  return sha256(stableJson(value));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asRecord(value: JsonValue | undefined, label: string): JsonRecord {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  return value as JsonRecord;
}

function stringField(
  record: JsonRecord,
  field: string,
  label: string,
): string {
  const value = record[field];
  assert(
    typeof value === "string" && value.trim().length > 0,
    `${label}.${field} must be a non-empty string`,
  );
  return value;
}

function stringArray(
  value: JsonValue | undefined,
  label: string,
): string[] {
  assert(
    Array.isArray(value) &&
      value.every((entry) => typeof entry === "string"),
    `${label} must be a string array`,
  );
  return value as string[];
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function jsonl(values: readonly unknown[]): string {
  return values.length > 0
    ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n`
    : "";
}

function tupleKey(
  relationFamily: string,
  relationKind: string,
  subjectKind: string,
  objectKind: string,
): string {
  return [relationFamily, relationKind, subjectKind, objectKind].join("\0");
}

function relationFields(record: MtaCanonicalRecord) {
  assert(record.record_kind === "relation", `${record.record_id} is not a relation`);
  const relationFamily = record.payload.relation_family;
  const relationKind = record.payload.relation_kind;
  const subjectId = record.payload.subject_id;
  const objectId = record.payload.object_id;
  assert(
    typeof relationFamily === "string" && relationFamily.trim(),
    `${record.record_id} has no relation_family`,
  );
  assert(
    typeof relationKind === "string" && relationKind.trim(),
    `${record.record_id} has no relation_kind`,
  );
  assert(
    typeof subjectId === "string" && subjectId.trim(),
    `${record.record_id} has no subject_id`,
  );
  assert(
    typeof objectId === "string" && objectId.trim(),
    `${record.record_id} has no object_id`,
  );
  return {
    relation_family: relationFamily,
    relation_kind: relationKind,
    subject_id: subjectId,
    object_id: objectId,
  };
}

function decisionGuards(decision: LoadedDecision): JsonObject {
  const snapshot = decision.current_snapshot;
  return {
    relation_family:
      typeof snapshot.relation_family === "string"
        ? snapshot.relation_family
        : stringField(snapshot, "family", decision.decision_id),
    relation_kind:
      typeof snapshot.relation_kind === "string"
        ? snapshot.relation_kind
        : stringField(snapshot, "kind", decision.decision_id),
    subject_id: stringField(snapshot, "subject_id", decision.decision_id),
    object_id: stringField(snapshot, "object_id", decision.decision_id),
  };
}

function correctionId(decisionId: string): string {
  return `${CORRECTION_PREFIX}${stableHash({ decision_id: decisionId }).slice(0, 16)}`;
}

export function isReviewedNativeDerivationAbsentSemanticDecision(
  decision: {
    relation_id: string;
    terminal_action: string;
    decision_id: string;
  },
): boolean {
  return (
    decision.relation_id ===
      EAST_SIDE_ACCESS_NATIVE_NON_EDGE_RELATION_ID &&
    decision.terminal_action === "retract_unsupported" &&
    correctionId(decision.decision_id) ===
      EAST_SIDE_ACCESS_NATIVE_NON_EDGE_CORRECTION_ID &&
    NATIVE_DERIVATION_SUPERSESSION_IDS.has(
      EAST_SIDE_ACCESS_NATIVE_NON_EDGE_CORRECTION_ID,
    )
  );
}

function sourceDecision(decision: LoadedDecision): string {
  return `${SOURCE_DECISION_PREFIX}${decision.decision_id}`;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadIdentityWarningReview() {
  assert(
    fileSha256(IDENTITY_WARNING_REVIEW_NOTE_PATH) ===
      EXPECTED_IDENTITY_WARNING_REVIEW_NOTE_SHA256,
    `${IDENTITY_WARNING_REVIEW_NOTE_RELATIVE_PATH} byte hash drifted`,
  );
  const review = readJson<{
    schema_version: number;
    review_id: string;
    created_at: string;
    decisions: JsonRecord[];
  }>(IDENTITY_WARNING_REVIEW_NOTE_PATH);
  assert(
    review.schema_version === 1 &&
      review.review_id === IDENTITY_WARNING_REVIEW_ID &&
      review.created_at === "2026-07-17T00:00:00.000Z",
    `${IDENTITY_WARNING_REVIEW_NOTE_RELATIVE_PATH} identity/version drifted`,
  );
  const byDecisionId = new Map(
    review.decisions.map((decision) => [
      stringField(decision, "decision_id", "identity warning review decision"),
      decision,
    ]),
  );
  const expectedDecisionIds = [
    "embedded-report-pseudo-sources",
    "queens-semantic-remediation-duplicate",
    "bt-distributable-income-exact-duplicate",
    "m16-predecessor-payload-correction-proposal",
  ].sort();
  assert(
    stableJson([...byDecisionId.keys()].sort() as unknown as JsonValue) ===
      stableJson(expectedDecisionIds as unknown as JsonValue),
    "identity warning review decision inventory drifted",
  );

  const embedded = byDecisionId.get("embedded-report-pseudo-sources")!;
  const queens = byDecisionId.get("queens-semantic-remediation-duplicate")!;
  const bt = byDecisionId.get("bt-distributable-income-exact-duplicate")!;
  const m16 = byDecisionId.get("m16-predecessor-payload-correction-proposal")!;
  const observedRetirementIdsByDecision = new Map<string, string[]>([
    [
      "embedded-report-pseudo-sources",
      sortedUnique([
        ...stringArray(
          embedded.retired_pseudo_source_submission_ids,
          "embedded-report-pseudo-sources.retired_pseudo_source_submission_ids",
        ),
        ...stringArray(
          embedded.retired_dependent_relation_submission_ids,
          "embedded-report-pseudo-sources.retired_dependent_relation_submission_ids",
        ),
      ]),
    ],
    [
      "queens-semantic-remediation-duplicate",
      sortedUnique(
        stringArray(
          queens.retired_submission_ids,
          "queens-semantic-remediation-duplicate.retired_submission_ids",
        ),
      ),
    ],
    [
      "bt-distributable-income-exact-duplicate",
      [
        stringField(
          bt,
          "retired_submission_id",
          "bt-distributable-income-exact-duplicate",
        ),
      ],
    ],
  ]);
  const expectedRetirementIdsByDecision = new Map<string, string[]>();
  for (const [submissionId, pin] of Object.entries(
    POST_CAMPAIGN_RETIREMENT_PINS,
  )) {
    const ids = expectedRetirementIdsByDecision.get(pin.decision_id) ?? [];
    ids.push(submissionId);
    expectedRetirementIdsByDecision.set(pin.decision_id, ids);
  }
  for (const [decisionId, expectedIds] of expectedRetirementIdsByDecision) {
    const observedIds = observedRetirementIdsByDecision.get(decisionId);
    assert(
      observedIds &&
        stableJson(observedIds.sort() as unknown as JsonValue) ===
          stableJson(expectedIds.sort() as unknown as JsonValue),
      `${decisionId} reviewed retirement identities drifted`,
    );
  }
  assert(
    Object.keys(POST_CAMPAIGN_RETIREMENT_PINS).length === 19 &&
      [...observedRetirementIdsByDecision.values()].flat().length === 19,
    "identity warning review must pin exactly 19 post-campaign retirements",
  );
  const btRetainedSubmissionId = stringField(
    bt,
    "retained_submission_id",
    "bt-distributable-income-exact-duplicate",
  );
  const btRetainedCorrectionIds = stringArray(
    bt.retained_correction_ids,
    "bt-distributable-income-exact-duplicate.retained_correction_ids",
  );
  assert(
    btRetainedSubmissionId === BT_DUPLICATE_RETAINED_SUBMISSION_ID &&
      stableJson(btRetainedCorrectionIds.sort() as unknown as JsonValue) ===
        stableJson(
          [...BT_DUPLICATE_RETAINED_CORRECTION_IDS].sort() as unknown as JsonValue,
        ),
    "B&T duplicate review no longer pins the retained submission and correction targets",
  );

  assert(
    stringField(m16, "record_id", "m16 predecessor review") ===
      "route_m16-mentioned" &&
      stringField(m16, "must_remain_distinct_from", "m16 predecessor review") ===
        "route_m34a-sbs" &&
      m16.do_not_merge === true,
    "M16 predecessor review no longer preserves distinct M16/M34A identities",
  );
  const proposedCorrection = asRecord(
    m16.proposed_correction,
    "m16-predecessor-payload-correction-proposal.proposed_correction",
  ) as unknown as SemanticCorrectionEntry;
  assert(
    proposedCorrection.correction_id === M16_PREDECESSOR_CORRECTION_ID &&
      proposedCorrection.op === "patch_payload" &&
      proposedCorrection.record_id === "route_m16-mentioned" &&
      proposedCorrection.source_decision ===
        `${IDENTITY_WARNING_REVIEW_NOTE_RELATIVE_PATH}#m16-predecessor-payload-correction-proposal`,
    "M16 predecessor semantic correction proposal identity drifted",
  );

  return {
    note_sha256: EXPECTED_IDENTITY_WARNING_REVIEW_NOTE_SHA256,
    reviewed_at: review.created_at,
    proposed_correction: proposedCorrection,
    bt_duplicate: {
      retired_submission_id: BT_DUPLICATE_RETIRED_SUBMISSION_ID,
      retained_submission_id: BT_DUPLICATE_RETAINED_SUBMISSION_ID,
      retained_correction_ids: [...BT_DUPLICATE_RETAINED_CORRECTION_IDS],
    },
    retirement_pins: Object.entries(POST_CAMPAIGN_RETIREMENT_PINS)
      .map(([submissionId, pin]) => ({
        submission_id: submissionId,
        ...pin,
      }))
      .sort((left, right) => left.submission_id.localeCompare(right.submission_id)),
  };
}

function loadFamilyWarningReview() {
  assert(
    fileSha256(FAMILY_WARNING_REVIEW_NOTE_PATH) ===
      EXPECTED_FAMILY_WARNING_REVIEW_NOTE_SHA256,
    `${FAMILY_WARNING_REVIEW_NOTE_RELATIVE_PATH} byte hash drifted`,
  );
  const review = readJson<{
    schema_version: number;
    review_id: string;
    contract_id: string;
    reviewed_at: string;
    decisions: JsonRecord[];
    summary: JsonRecord;
  }>(FAMILY_WARNING_REVIEW_NOTE_PATH);
  assert(
    review.schema_version === 1 &&
      review.review_id === FAMILY_WARNING_REVIEW_ID &&
      review.contract_id === "relationship-contract-v1" &&
      review.reviewed_at === "2026-07-17T00:00:00.000Z",
    `${FAMILY_WARNING_REVIEW_NOTE_RELATIVE_PATH} identity/version drifted`,
  );
  const byDecisionId = new Map(
    review.decisions.map((decision) => [
      stringField(decision, "decision_id", "family warning review decision"),
      decision,
    ]),
  );
  const expectedDecisionIds = [
    "m86-route-succession-narrow-shape",
    "mets-willets-physical-rail-line-shape",
    "mta-launches-data-analytics-blog",
    "moodys-rating-event-precision",
  ].sort();
  assert(
    stableJson([...byDecisionId.keys()].sort() as unknown as JsonValue) ===
      stableJson(expectedDecisionIds as unknown as JsonValue) &&
      review.summary.reviewed_valid_narrow_shape_count === 3 &&
      review.summary.remediation_required_count === 1 &&
      review.summary.silent_exception_count === 0 &&
      review.summary.non_enforcement_policy_changed === false,
    "family warning review decision inventory or zero-exception summary drifted",
  );
  const reviewedValidDecisions = review.decisions.filter((decision) =>
    String(decision.primary_disposition).startsWith("reviewed_valid_"),
  );
  assert(
    reviewedValidDecisions.length === 3,
    "family warning review must retain exactly three explicitly reviewed-valid narrow shapes",
  );
  const moodys = byDecisionId.get("moodys-rating-event-precision")!;
  assert(
    moodys.record_id === "relation_moodys-upgraded-mta-trb" &&
      moodys.primary_disposition ===
        "endpoint_precision_remediation_required" &&
      moodys.relation_kind_before === "assigned_rating" &&
      moodys.relation_family_before === "metric_context" &&
      moodys.subject_id === "entity_meeting-doc-131661-moodys" &&
      moodys.object_id_before === "entity_mta-entity-update-2025" &&
      moodys.object_id_after === "event_moodys-upgrade-jun2025" &&
      moodys.relation_kind_after === "performed" &&
      moodys.relation_family_after === "timeline_context" &&
      stableJson(moodys.evidence_ids as JsonValue) ===
        stableJson(["meeting_doc_176491#p012_c0008"] as unknown as JsonValue) &&
      moodys.evidence_text_sha256 ===
        "sha256:d51ff514407287e55c93fd00fd80ccfb588a58c645c0a872466b337b5a5bc9cd" &&
      moodys.precedent_relation_id === "relation_fitch-upgraded-mta-trb",
    "Moody's rating-event precision review drifted",
  );
  const correction: SemanticCorrectionEntry = {
    correction_id: MOODYS_RATING_EVENT_CORRECTION_ID,
    op: "patch_payload",
    record_id: "relation_moodys-upgraded-mta-trb",
    guards: {
      payload: {
        relation_kind: "assigned_rating",
        relation_family: "metric_context",
        subject_id: "entity_meeting-doc-131661-moodys",
        subject_local_observation_id: "entity_meeting_doc_176491_moodys",
        object_id: "entity_mta-entity-update-2025",
        object_local_observation_id: "entity_meeting_doc_176491_mta",
        assertion_status: "unknown",
        as_of_date: "2025-06-23",
      },
    },
    patch: {
      set: {
        relation_kind: "performed",
        relation_family: "timeline_context",
        object_id: "event_moodys-upgrade-jun2025",
        object_local_observation_id: "event_moodys_upgrade_jun2025",
        description:
          "Moody's Ratings performed the June 13, 2025 Transportation Revenue Bonds rating upgrade.",
      },
    },
    cascade: [],
    reason: stringField(moodys, "reason", "moodys-rating-event-precision"),
    source_decision:
      `${FAMILY_WARNING_REVIEW_NOTE_RELATIVE_PATH}#moodys-rating-event-precision`,
    reviewed_at: review.reviewed_at,
    provenance: "human",
  };
  return {
    note_sha256: EXPECTED_FAMILY_WARNING_REVIEW_NOTE_SHA256,
    reviewed_at: review.reviewed_at,
    correction,
    reviewed_valid_decision_ids: reviewedValidDecisions
      .map((decision) => String(decision.decision_id))
      .sort(),
    silent_exception_count: 0,
  };
}

function buildRouteIdentityMergeOutput() {
  const current = readJson<{
    version: number;
    aliases: Record<string, Record<string, string>>;
  }>(IDENTITY_MERGES_PATH);
  assert(
    current.version === 1 && current.aliases.route,
    "identity merge overrides are missing route aliases",
  );
  const routeAliases = { ...current.aliases.route };
  const observedBefore: Record<string, string> = {};
  for (const [alias, expectedTarget] of Object.entries(
    ROUTE_IDENTITY_MERGE_SPLITS,
  )) {
    const currentTarget = routeAliases[alias];
    if (currentTarget !== undefined) {
      assert(
        currentTarget === expectedTarget,
        `route identity alias ${alias} expected ${expectedTarget}, found ${currentTarget}`,
      );
      observedBefore[alias] = currentTarget;
      delete routeAliases[alias];
    }
  }
  const output = {
    ...current,
    aliases: {
      ...current.aliases,
      route: routeAliases,
    },
  };
  return {
    currentContent: readFileSync(IDENTITY_MERGES_PATH, "utf8"),
    output,
    outputContent: `${JSON.stringify(output, null, 2)}\n`,
    observedBefore,
  };
}

function withTemporaryIdentityMerges<T>(
  desiredContent: string,
  operation: () => T,
): T {
  const original = readFileSync(IDENTITY_MERGES_PATH, "utf8");
  const changed = original !== desiredContent;
  if (changed) writeFileSync(IDENTITY_MERGES_PATH, desiredContent, "utf8");
  try {
    return operation();
  } finally {
    if (changed) writeFileSync(IDENTITY_MERGES_PATH, original, "utf8");
  }
}

function validateRouteIdentityInputs(
  decisions: LoadedDecision[],
  baseEntries: MtaSubmissionEntry[],
) {
  const routeDecisions = decisions
    .filter((decision) =>
      (ROUTE_IDENTITY_RELATION_IDS as readonly string[]).includes(
        decision.relation_id,
      ),
    )
    .sort((left, right) =>
      left.relation_id.localeCompare(right.relation_id),
    );
  assert(
    routeDecisions.length === ROUTE_IDENTITY_RELATION_IDS.length &&
      stableJson(
        routeDecisions.map((decision) => decision.relation_id) as JsonValue,
      ) ===
        stableJson(
          [...ROUTE_IDENTITY_RELATION_IDS].sort() as unknown as JsonValue,
        ),
    "route identity remediation relation partition drifted",
  );
  assert(
    routeDecisions.every(
      (decision) =>
        decision.terminal_action === "resolved_by_identity_campaign",
    ),
    "route identity remediation decisions must use resolved_by_identity_campaign",
  );

  const reviewedSubmissionIds = sortedUnique(
    routeDecisions.flatMap((decision) =>
      stringArray(
        decision.action.identity_submission_ids,
        `${decision.decision_id}.action.identity_submission_ids`,
      ),
    ),
  );
  const expectedSubmissionIds = Object.keys(
    ROUTE_IDENTITY_SUBMISSION_PINS,
  ).sort();
  assert(
    stableJson(reviewedSubmissionIds as unknown as JsonValue) ===
      stableJson(expectedSubmissionIds as unknown as JsonValue),
    `route identity submission partition drifted: ${reviewedSubmissionIds.join(", ")}`,
  );

  const byId = new Map(
    baseEntries.map((entry) => [entry.submission_id, entry]),
  );
  const submissionPins = expectedSubmissionIds.map((submissionId) => {
    const pin = ROUTE_IDENTITY_SUBMISSION_PINS[submissionId]!;
    const entry = byId.get(submissionId);
    assert(entry, `route identity submission ${submissionId} is absent`);
    assert(
      entry.validation.state === "accepted" &&
        entry.tool_args.observation_kind === "route",
      `route identity submission ${submissionId} is not an accepted route observation`,
    );
    assert(
      entry.tool_args_sha256 === pin.tool_args_sha256,
      `route identity submission ${submissionId} tool-args hash drifted`,
    );
    assert(
      entry.tool_args.target_record_id === pin.target_record_id,
      `route identity submission ${submissionId} target drifted: expected ${String(pin.target_record_id)}, found ${String(entry.tool_args.target_record_id)}`,
    );
    return {
      submission_id: submissionId,
      tool_args_sha256: pin.tool_args_sha256,
      source_id: entry.tool_args.source_id,
      local_observation_id: entry.tool_args.local_observation_id,
      target_record_id: pin.target_record_id,
    };
  });

  return {
    relation_ids: routeDecisions.map((decision) => decision.relation_id),
    submission_pins: submissionPins,
    submission_ids_sha256: stableHash(
      expectedSubmissionIds as unknown as JsonValue,
    ),
  };
}

function buildRetirementOutput(
  bx15ReplacementSubmissionId: string,
  identityWarningReview: ReturnType<typeof loadIdentityWarningReview>,
) {
  assert(
    bx15ReplacementSubmissionId === BX15_REPLACEMENT_SUBMISSION_ID,
    `expected Bx15 replacement ${BX15_REPLACEMENT_SUBMISSION_ID}, found ${bx15ReplacementSubmissionId}`,
  );
  const current = readSubmissionRetirements();
  assert(current.version === 1, "submission retirement version must be 1");
  const reviewedIds = new Set(
    identityWarningReview.retirement_pins.map((pin) => pin.submission_id),
  );
  const base = current.retired.filter(
    (entry) =>
      entry.source_decision !== ROUTE_IDENTITY_RETIREMENT_SOURCE_DECISION &&
      !reviewedIds.has(entry.submission_id),
  );
  assert(
    base.length === EXPECTED_BASE_RETIREMENT_COUNT,
    `expected ${EXPECTED_BASE_RETIREMENT_COUNT} baseline retirements, found ${base.length}`,
  );
  assert(
    !base.some(
      (entry) => entry.submission_id === BX15_MISTARGETED_SUBMISSION_ID,
    ),
    `${BX15_MISTARGETED_SUBMISSION_ID} was already retired by another decision`,
  );
  const reviewed = current.retired.filter((entry) =>
    reviewedIds.has(entry.submission_id),
  );
  assert(
    reviewed.length === identityWarningReview.retirement_pins.length,
    `expected ${identityWarningReview.retirement_pins.length} explicitly reviewed post-campaign retirements, found ${reviewed.length}`,
  );
  const reviewedById = new Map(
    reviewed.map((entry) => [entry.submission_id, entry]),
  );
  for (const pin of identityWarningReview.retirement_pins) {
    const entry = reviewedById.get(pin.submission_id);
    assert(entry, `reviewed retirement ${pin.submission_id} is absent`);
    assert(
      entry.source_decision ===
        `${IDENTITY_WARNING_REVIEW_NOTE_RELATIVE_PATH}#${pin.decision_id}/${pin.submission_id}` &&
        entry.reviewed_at === identityWarningReview.reviewed_at &&
        stableHash(entry as unknown as JsonValue) === pin.row_sha256,
      `reviewed retirement ${pin.submission_id} drifted from ${pin.decision_id}`,
    );
  }
  const existingRouteIdentityRetirements = current.retired.filter(
    (entry) =>
      entry.source_decision === ROUTE_IDENTITY_RETIREMENT_SOURCE_DECISION,
  );
  assert(
    existingRouteIdentityRetirements.length === 1 &&
      existingRouteIdentityRetirements[0]!.submission_id ===
        BX15_MISTARGETED_SUBMISSION_ID &&
      base.length + reviewed.length + existingRouteIdentityRetirements.length ===
        current.retired.length,
    "submission retirements do not partition into baseline, campaign, and explicitly reviewed post-campaign rows",
  );
  const addition: SubmissionRetirementEntry = {
    submission_id: BX15_MISTARGETED_SUBMISSION_ID,
    reason:
      `The reviewed route-identity split preserves distinct Bx15 Local and Bx15 Limited physical route records. Replace this limited-stop observation, which was incorrectly targeted to the Bx15 Local identity, with ${bx15ReplacementSubmissionId}; the replacement changes only the canonical target and preserves the exact source-backed payload and evidence.`,
    source_decision: ROUTE_IDENTITY_RETIREMENT_SOURCE_DECISION,
    reviewed_at: REVIEWED_AT,
  };
  assert(
    stableJson(
      existingRouteIdentityRetirements[0] as unknown as JsonValue,
    ) === stableJson(addition as unknown as JsonValue),
    "reviewed Bx15 campaign retirement drifted",
  );
  const output = {
    version: 1 as const,
    retired: [...base, addition, ...reviewed],
  };
  assert(
    stableJson(output as unknown as JsonValue) ===
      stableJson(current as unknown as JsonValue),
    "deterministic retirement replay would alter the explicitly reviewed override set",
  );
  return {
    base,
    addition,
    reviewed,
    output,
    outputContent: `${JSON.stringify(output, null, 2)}\n`,
  };
}

function remediationShardPath(index: number): string {
  return join(SHARD_DIR, `part-${index}.json`);
}

function semanticReviewPath(index: number): string {
  return join(SEMANTIC_REVIEW_DIR, `part-${index}.json`);
}

function directPinnedFileChecks(
  shard: RemediationShard,
): Array<{
  path: string;
  expected_file_sha256?: string;
  expected_logical_sha256?: string;
  actual_file_sha256?: string;
  actual_logical_sha256?: string;
  status: "direct_match" | "historical_projection_pin";
}> {
  const checks: Array<{
    path: string;
    expected_file_sha256?: string;
    expected_logical_sha256?: string;
    actual_file_sha256?: string;
    actual_logical_sha256?: string;
    status: "direct_match" | "historical_projection_pin";
  }> = [];

  function visit(value: JsonValue, inheritedPath?: string): void {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, inheritedPath);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const record = value as JsonRecord;
    const path =
      typeof record.path === "string" ? record.path : inheritedPath;
    const expectedFile =
      typeof record.file_sha256 === "string"
        ? record.file_sha256
        : typeof record.sha256 === "string"
          ? record.sha256
          : undefined;
    const expectedLogical =
      typeof record.logical_sha256 === "string"
        ? record.logical_sha256
        : undefined;

    if (path && (expectedFile || expectedLogical)) {
      const absolute = join(repoRoot, path);
      const directStableInput =
        path.includes("/semantic-review-shards/") ||
        path.includes("/semantic-remediation-shards/") ||
        path.endsWith(
          "mta-nyct-target-reviewed-decisions.json",
        );
      if (directStableInput && existsSync(absolute)) {
        const parsed = expectedLogical
          ? (readJson<JsonValue>(absolute) as JsonValue)
          : undefined;
        const actualFile = expectedFile ? fileSha256(absolute) : undefined;
        const actualLogical =
          expectedLogical && parsed !== undefined
            ? logicalSha256(parsed)
            : undefined;
        assert(
          !expectedFile || actualFile === expectedFile,
          `${path} byte hash drifted: expected ${expectedFile}, found ${actualFile}`,
        );
        assert(
          !expectedLogical || actualLogical === expectedLogical,
          `${path} logical hash drifted: expected ${expectedLogical}, found ${actualLogical}`,
        );
        checks.push({
          path,
          expected_file_sha256: expectedFile,
          expected_logical_sha256: expectedLogical,
          actual_file_sha256: actualFile,
          actual_logical_sha256: actualLogical,
          status: "direct_match",
        });
      } else {
        checks.push({
          path,
          expected_file_sha256: expectedFile,
          expected_logical_sha256: expectedLogical,
          status: "historical_projection_pin",
        });
      }
    }

    for (const [key, child] of Object.entries(record)) {
      if (
        key === "path" ||
        key === "sha256" ||
        key === "file_sha256" ||
        key === "logical_sha256"
      ) {
        continue;
      }
      visit(child as JsonValue, path);
    }
  }

  visit(shard.pinned_inputs as unknown as JsonValue);
  return checks;
}

function loadShards() {
  const decisions: LoadedDecision[] = [];
  const shards: RemediationShard[] = [];
  const pinChecks: ReturnType<typeof directPinnedFileChecks> = [];

  for (const expected of EXPECTED_SHARDS) {
    const path = remediationShardPath(expected.index);
    assert(
      fileSha256(path) === expected.fileSha256,
      `${relative(repoRoot, path)} byte hash drifted`,
    );
    const shard = readJson<RemediationShard>(path);
    assert(
      logicalSha256(shard as unknown as JsonValue) ===
        expected.logicalSha256,
      `${relative(repoRoot, path)} logical hash drifted`,
    );
    assert(
      shard.schema_version === 1 &&
        shard.contract_id === CAMPAIGN_ID &&
        shard.review_status === "complete",
      `${relative(repoRoot, path)} is not a complete ${CAMPAIGN_ID} shard`,
    );
    assert(
      shard.decisions.length === expected.relationCount,
      `${relative(repoRoot, path)} expected ${expected.relationCount} decisions, found ${shard.decisions.length}`,
    );
    const relationIds = shard.decisions
      .map((decision) => decision.relation_id)
      .sort();
    assert(
      stableHash(relationIds) === shard.summary.relation_ids_sha256,
      `${relative(repoRoot, path)} relation ID hash drifted`,
    );
    pinChecks.push(...directPinnedFileChecks(shard));
    shards.push(shard);
    decisions.push(
      ...shard.decisions.map((decision) => ({
        ...decision,
        shard_index: expected.index,
        decision_id: `${CAMPAIGN_ID}/part-${expected.index}/${decision.relation_id}`,
      })),
    );
  }

  const relationIds = decisions.map((decision) => decision.relation_id);
  assert(
    relationIds.length === 399 &&
      new Set(relationIds).size === relationIds.length,
    `semantic remediation partition must contain 399 unique relation IDs; found ${relationIds.length}/${new Set(relationIds).size}`,
  );
  const actionCounts: Record<string, number> = {};
  for (const decision of decisions) {
    actionCounts[decision.terminal_action] =
      (actionCounts[decision.terminal_action] ?? 0) + 1;
  }
  assert(
    stableJson(actionCounts as unknown as JsonValue) ===
      stableJson(EXPECTED_ACTION_COUNTS as unknown as JsonValue),
    `semantic remediation action counts drifted: ${stableJson(actionCounts as unknown as JsonValue)}`,
  );
  return {
    shards,
    decisions: decisions.sort((left, right) =>
      left.relation_id.localeCompare(right.relation_id),
    ),
    pinChecks,
  };
}

function loadSemanticReviewTupleMap() {
  const byTuple = new Map<
    string,
    {
      decision_id: string;
      decision: string;
    }
  >();
  for (const expected of EXPECTED_SHARDS) {
    const path = semanticReviewPath(expected.index);
    const review = readJson<SemanticReviewShard>(path);
    assert(
      review.schema_version === 1 &&
        review.review_status === "completed_with_remediation_required",
      `${relative(repoRoot, path)} is incomplete`,
    );
    for (const decision of review.decisions) {
      const key = tupleKey(
        decision.relation_family,
        decision.relation_kind,
        decision.subject_kind,
        decision.object_kind,
      );
      assert(!byTuple.has(key), `duplicate semantic review tuple ${key}`);
      byTuple.set(key, {
        decision_id: `relationship-contract-v1/semantic-review/part-${expected.index}/tuple-${decision.tuple_index}`,
        decision: decision.decision,
      });
    }
  }
  assert(
    byTuple.size === 1136,
    `expected 1,136 reviewed baseline tuples, found ${byTuple.size}`,
  );
  return byTuple;
}

function part0EvidenceBindings(record: MtaCanonicalRecord): JsonObject[] {
  return record.evidence_refs
    .map((ref) => {
      assert(
        ref.evidence_id &&
          ref.block_id &&
          ref.source_path &&
          ref.text_sha256,
        `${record.record_id} has an incomplete evidence binding`,
      );
      return {
        evidence_id: ref.evidence_id,
        source_id: ref.source_id,
        source_path: ref.source_path,
        block_id: ref.block_id,
        ...(ref.block_range ? { block_range: ref.block_range } : {}),
        ...(ref.page_number !== undefined
          ? { page_number: ref.page_number }
          : {}),
        text_sha256: ref.text_sha256,
        text_source: ref.text_source ?? "raw_text",
      };
    })
    .sort((left, right) =>
      String(left.evidence_id).localeCompare(String(right.evidence_id)),
    );
}

function part1EvidenceBindings(record: MtaCanonicalRecord): MtaEvidenceRef[] {
  return record.evidence_refs
    .map((ref) => JSON.parse(JSON.stringify(ref)) as MtaEvidenceRef)
    .sort((left, right) =>
      stableJson(left as unknown as JsonValue).localeCompare(
        stableJson(right as unknown as JsonValue),
      ),
    );
}

function loadPayloadReferenceRemediationProvenance(
  submissionEntries: MtaSubmissionEntry[],
  records: MtaCanonicalRecord[],
): PayloadReferenceRemediationProvenance {
  const pinnedFiles = [
    [
      PAYLOAD_REFERENCE_REMEDIATION_LEDGER_PATH,
      EXPECTED_PAYLOAD_REFERENCE_REMEDIATION_LEDGER_SHA256,
      "payload-reference remediation ledger",
    ],
    [
      PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_PATH,
      EXPECTED_PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_SHA256,
      "payload-reference remediation journal",
    ],
    [
      PAYLOAD_REFERENCE_REVIEW_DECISIONS_PATH,
      EXPECTED_PAYLOAD_REFERENCE_REVIEW_DECISIONS_SHA256,
      "payload-reference review decisions",
    ],
  ] as const;
  for (const [path, expectedSha256, label] of pinnedFiles) {
    assert(existsSync(path), `${label} is missing`);
    assert(
      fileSha256(path) === expectedSha256,
      `${label} drifted from reviewed SHA-256 ${expectedSha256}`,
    );
  }

  const rows = readFileSync(
    PAYLOAD_REFERENCE_REMEDIATION_LEDGER_PATH,
    "utf8",
  )
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map(
      (line) =>
        JSON.parse(line) as PayloadReferenceRemediationLedgerRow,
    );
  assert(
    rows.length === EXPECTED_PAYLOAD_REFERENCE_REMEDIATION_COUNT,
    `expected ${EXPECTED_PAYLOAD_REFERENCE_REMEDIATION_COUNT} payload-reference remediation rows, found ${rows.length}`,
  );

  const entriesById = new Map(
    submissionEntries.map((entry) => [entry.submission_id, entry]),
  );
  const recordsById = new Map(
    records.map((record) => [record.record_id, record]),
  );
  const reviewedDecisionIds = new Set(
    readFileSync(PAYLOAD_REFERENCE_REVIEW_DECISIONS_PATH, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line) => {
        const value = JSON.parse(line) as { decision_id?: unknown };
        return typeof value.decision_id === "string"
          ? value.decision_id
          : "";
      })
      .filter(Boolean),
  );
  const seenSubmissions = new Set<string>();
  const seenRelations = new Set<string>();
  const seenRemediations = new Set<string>();
  const seenProposals = new Set<string>();
  const decisionIdsBySubmissionId = new Map<string, string[]>();
  const expectedJournalPath = relative(
    repoRoot,
    PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_PATH,
  );

  for (const [index, row] of rows.entries()) {
    const label = `payload-reference remediation row ${index}`;
    assert(
      row.schema_version === 1 &&
        row.contract_id === "relationship-reference-contract-v1" &&
        row.status === "materialized" &&
        row.journal_path === expectedJournalPath,
      `${label} has an invalid contract, status, or journal path`,
    );
    for (const [field, value] of Object.entries({
      remediation_id: row.remediation_id,
      proposal_id: row.proposal_id,
      submission_id: row.submission_id,
      relation_record_id: row.relation_record_id,
      rule_id: row.rule_id,
      field: row.field,
      source_literal: row.source_literal,
      origin_record_id: row.origin_record_id,
      relation_kind: row.relation_kind,
      subject_id: row.subject_id,
      object_id: row.object_id,
      evidence_bindings_sha256: row.evidence_bindings_sha256,
    })) {
      assert(
        typeof value === "string" && value.trim(),
        `${label}.${field} must be a non-empty string`,
      );
    }
    assert(
      row.remediation_id.startsWith(
        "relationship-reference-remediation-v1:",
      ) &&
        row.proposal_id.startsWith(
          "relationship-reference-proposal-v1:",
        ) &&
        /^[a-f0-9]{64}$/u.test(row.evidence_bindings_sha256),
      `${label} has an invalid remediation/proposal/hash identity`,
    );
    assert(
      Array.isArray(row.relationship_reference_decision_ids) &&
        row.relationship_reference_decision_ids.length > 0 &&
        stableJson(
          sortedUnique(
            row.relationship_reference_decision_ids,
          ) as unknown as JsonValue,
        ) ===
          stableJson(
            row.relationship_reference_decision_ids as unknown as JsonValue,
          ) &&
        row.relationship_reference_decision_ids.every(
          (decisionId) =>
            reviewedDecisionIds.has(decisionId) ||
            decisionId === row.proposal_id,
        ),
      `${label} has invalid or unpinned relationship-reference decisions`,
    );
    assert(
      Array.isArray(row.evidence_ids) &&
        row.evidence_ids.length > 0 &&
        stableJson(
          sortedUnique(row.evidence_ids) as unknown as JsonValue,
        ) === stableJson(row.evidence_ids as unknown as JsonValue),
      `${label} has invalid evidence IDs`,
    );
    assert(
      !seenSubmissions.has(row.submission_id) &&
        !seenRelations.has(row.relation_record_id) &&
        !seenRemediations.has(row.remediation_id) &&
        !seenProposals.has(row.proposal_id),
      `${label} duplicates a submission, relation, remediation, or proposal identity`,
    );
    seenSubmissions.add(row.submission_id);
    seenRelations.add(row.relation_record_id);
    seenRemediations.add(row.remediation_id);
    seenProposals.add(row.proposal_id);

    const submission = entriesById.get(row.submission_id);
    assert(
      submission?.run_id ===
        "2026-07-16T04-00-00-000Z_relationship-payload-reference-remediation-v1" &&
        submission.validation.state === "accepted" &&
        submission.tool_args.observation_kind === "relation",
      `${label} does not resolve to an accepted payload-reference relation submission`,
    );
    const submissionPayload = submission.tool_args.payload;
    assert(
      submissionPayload.relation_kind === row.relation_kind &&
        submissionPayload.subject_id === row.subject_id &&
        submissionPayload.object_id === row.object_id,
      `${label} tuple differs from its accepted submission`,
    );
    const extraFields = submissionPayload.extra_fields;
    assert(
      extraFields !== null &&
        typeof extraFields === "object" &&
        !Array.isArray(extraFields) &&
        extraFields.relationship_reference_proposal_id ===
          row.proposal_id &&
        stableJson(
          extraFields.relationship_reference_review_decision_ids as JsonValue,
        ) ===
          stableJson(
            row.relationship_reference_decision_ids as unknown as JsonValue,
          ),
      `${label} provenance differs from its accepted submission`,
    );

    const relation = recordsById.get(row.relation_record_id);
    assert(
      relation?.record_kind === "relation" &&
        relation.submission_ids.includes(row.submission_id),
      `${label} does not resolve to its canonical relation`,
    );
    const fields = relationFields(relation);
    const evidenceRefs = part1EvidenceBindings(relation);
    const evidenceIds = sortedUnique(
      evidenceRefs
        .map((ref) => ref.evidence_id)
        .filter((id): id is string => typeof id === "string"),
    );
    assert(
      fields.relation_kind === row.relation_kind &&
        fields.subject_id === row.subject_id &&
        fields.object_id === row.object_id &&
        stableJson(evidenceIds as unknown as JsonValue) ===
          stableJson(row.evidence_ids as unknown as JsonValue) &&
        logicalSha256(evidenceIds as unknown as JsonValue) ===
          row.evidence_bindings_sha256,
      `${label} canonical tuple/evidence differs from its remediation ledger`,
    );
    decisionIdsBySubmissionId.set(
      row.submission_id,
      sortedUnique([
        row.remediation_id,
        ...row.relationship_reference_decision_ids,
      ]),
    );
  }

  return {
    rows,
    decisionIdsBySubmissionId,
    ledgerSha256:
      EXPECTED_PAYLOAD_REFERENCE_REMEDIATION_LEDGER_SHA256,
    journalSha256:
      EXPECTED_PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_SHA256,
    reviewDecisionsSha256:
      EXPECTED_PAYLOAD_REFERENCE_REVIEW_DECISIONS_SHA256,
  };
}

function mergeSubmissionDecisionMaps(
  ...maps: Array<Map<string, string[]>>
): Map<string, string[]> {
  const merged = new Map<string, string[]>();
  for (const map of maps) {
    for (const [submissionId, decisionIds] of map) {
      merged.set(
        submissionId,
        sortedUnique([
          ...(merged.get(submissionId) ?? []),
          ...decisionIds,
        ]),
      );
    }
  }
  return merged;
}

function snapshotEvidence(record: MtaCanonicalRecord, shardIndex: number) {
  if (shardIndex === 0) {
    const refs = part0EvidenceBindings(record);
    return {
      evidence_ids: refs.map((ref) => String(ref.evidence_id)),
      evidence_bindings_sha256: logicalSha256(
        refs as unknown as JsonValue,
      ),
    };
  }
  if (shardIndex === 1) {
    const refs = part1EvidenceBindings(record);
    return {
      evidence_ids: sortedUnique(
        refs
          .map((ref) => ref.evidence_id)
          .filter((id): id is string => typeof id === "string"),
      ),
      evidence_bindings_sha256: logicalSha256(
        refs as unknown as JsonValue,
      ),
    };
  }
  const refs = record.evidence_refs.map((ref) => ({ ...ref }));
  return {
    evidence_ids: [...refs]
      .sort((left, right) =>
        String(left.evidence_id).localeCompare(String(right.evidence_id)),
      )
      .map((ref) => String(ref.evidence_id)),
    evidence_bindings_sha256: logicalSha256(
      refs as unknown as JsonValue,
    ),
  };
}

function verifySnapshot(
  decision: LoadedDecision,
  record: MtaCanonicalRecord,
): void {
  const fields = relationFields(record);
  const expected = decisionGuards(decision);
  assert(
    fields.relation_family === expected.relation_family &&
      fields.relation_kind === expected.relation_kind &&
      fields.subject_id === expected.subject_id &&
      fields.object_id === expected.object_id,
    `${decision.relation_id} current tuple drifted`,
  );
  assert(
    logicalSha256(record.payload as unknown as JsonValue) ===
      decision.current_snapshot.payload_sha256,
    `${decision.relation_id} payload hash drifted`,
  );
  const evidence = snapshotEvidence(record, decision.shard_index);
  assert(
    stableJson(evidence.evidence_ids as unknown as JsonValue) ===
      stableJson(
        stringArray(
          decision.current_snapshot.evidence_ids,
          `${decision.decision_id}.current_snapshot.evidence_ids`,
        ) as unknown as JsonValue,
      ),
    `${decision.relation_id} evidence ID inventory drifted`,
  );
  assert(
    evidence.evidence_bindings_sha256 ===
      decision.current_snapshot.evidence_bindings_sha256,
    `${decision.relation_id} evidence binding hash drifted`,
  );
}

function verifySnapshotEvidence(
  decision: LoadedDecision,
  record: MtaCanonicalRecord,
): void {
  const evidence = snapshotEvidence(record, decision.shard_index);
  assert(
    stableJson(evidence.evidence_ids as unknown as JsonValue) ===
      stableJson(
        stringArray(
          decision.current_snapshot.evidence_ids,
          `${decision.decision_id}.current_snapshot.evidence_ids`,
        ) as unknown as JsonValue,
      ),
    `${decision.relation_id} evidence ID inventory drifted`,
  );
  assert(
    evidence.evidence_bindings_sha256 ===
      decision.current_snapshot.evidence_bindings_sha256,
    `${decision.relation_id} evidence binding hash drifted`,
  );
}

function decisionAlreadySatisfied(
  decision: LoadedDecision,
  record: MtaCanonicalRecord | undefined,
): boolean {
  if (!record) return false;
  if (decision.terminal_action === "patch_relation") {
    const set = asRecord(
      decision.action.set,
      `${decision.decision_id}.action.set`,
    );
    return [
      "relation_family",
      "relation_kind",
      "subject_id",
      "object_id",
    ].every((field) => record.payload[field] === set[field]);
  }
  if (decision.terminal_action === "replace_endpoint") {
    const field = stringField(
      decision.action,
      "field",
      `${decision.decision_id}.action`,
    );
    return (
      record.payload[field] ===
      stringField(
        decision.action,
        "to_record_id",
        `${decision.decision_id}.action`,
      )
    );
  }
  if (decision.terminal_action === "resolved_by_identity_campaign") {
    return (
      record.payload.subject_id === decision.action.expected_subject_id &&
      record.payload.object_id === decision.action.expected_object_id
    );
  }
  return false;
}

function buildReplacementSubmissions(
  decisions: LoadedDecision[],
  baseEntries: MtaSubmissionEntry[],
) {
  const entriesById = new Map<
    string,
    {
      entry: MtaSubmissionEntry;
      decisionIds: Set<string>;
    }
  >();

  for (const decision of decisions) {
    if (decision.terminal_action !== "replace_with_submissions") continue;
    const submissions = decision.action.submissions;
    assert(
      Array.isArray(submissions) && submissions.length > 0,
      `${decision.decision_id} has no replacement submissions`,
    );
    for (const [index, value] of submissions.entries()) {
      const input = value as unknown as MtaSubmitObservationInput;
      const entry = createSubmissionEntry(RUN_ID, input, REVIEWED_AT);
      assert(
        entry.validation.state === "accepted",
        `${decision.decision_id} replacement ${index} rejected: ${entry.validation.issues.join("; ")}`,
      );
      const existing = entriesById.get(entry.submission_id);
      if (existing) {
        assert(
          stableJson(existing.entry.tool_args as unknown as JsonValue) ===
            stableJson(entry.tool_args as unknown as JsonValue),
          `replacement submission ID collision ${entry.submission_id}`,
        );
        existing.decisionIds.add(decision.decision_id);
      } else {
        entriesById.set(entry.submission_id, {
          entry,
          decisionIds: new Set([decision.decision_id]),
        });
      }
    }
  }

  const bx15Original = baseEntries.find(
    (entry) => entry.submission_id === BX15_MISTARGETED_SUBMISSION_ID,
  );
  assert(
    bx15Original &&
      bx15Original.validation.state === "accepted" &&
      bx15Original.tool_args.observation_kind === "route" &&
      bx15Original.tool_args.target_record_id === "route_bx15-ace" &&
      bx15Original.tool_args.payload?.service_variant === "limited_stop",
    `route identity split expected accepted limited-stop submission ${BX15_MISTARGETED_SUBMISSION_ID} targeting route_bx15-ace`,
  );
  const bx15Replacement = createSubmissionEntry(
    RUN_ID,
    {
      ...bx15Original.tool_args,
      target_record_id: "route_bx15-ltd-webster-2012",
      create_new: undefined,
    },
    REVIEWED_AT,
  );
  assert(
    bx15Replacement.validation.state === "accepted" &&
      bx15Replacement.submission_id ===
        BX15_REPLACEMENT_SUBMISSION_ID &&
      bx15Replacement.tool_args_sha256 ===
        BX15_REPLACEMENT_TOOL_ARGS_SHA256,
    `Bx15 identity replacement rejected: ${bx15Replacement.validation.issues.join("; ")}`,
  );
  assert(
    bx15Replacement.tool_args.target_record_id ===
      "route_bx15-ltd-webster-2012" &&
      stableJson(
        bx15Replacement.tool_args.payload as unknown as JsonValue,
      ) ===
        stableJson(
          bx15Original.tool_args.payload as unknown as JsonValue,
        ) &&
      stableJson(
        bx15Replacement.tool_args.evidence_refs as unknown as JsonValue,
      ) ===
        stableJson(
          bx15Original.tool_args.evidence_refs as unknown as JsonValue,
        ),
    "Bx15 route identity replacement must change only the canonical target while preserving payload and evidence",
  );
  const bx15DecisionIds = decisions
    .filter((decision) =>
      decision.relation_id.startsWith("relation_bx15") ||
      decision.relation_id.startsWith("relation_bx55"),
    )
    .map((decision) => decision.decision_id)
    .sort();
  assert(
    bx15DecisionIds.length === 4,
    `expected four Bx15/Bx55 identity decisions, found ${bx15DecisionIds.length}`,
  );
  assert(
    !entriesById.has(bx15Replacement.submission_id),
    `Bx15 route identity replacement collides with semantic bundle submission ${bx15Replacement.submission_id}`,
  );
  entriesById.set(bx15Replacement.submission_id, {
    entry: bx15Replacement,
    decisionIds: new Set(bx15DecisionIds),
  });

  return {
    entries: [...entriesById.values()]
      .map((value) => value.entry)
      .sort((left, right) =>
        left.submission_id.localeCompare(right.submission_id),
      ),
    decisionIdsBySubmissionId: new Map(
      [...entriesById.entries()].map(([submissionId, value]) => [
        submissionId,
        [...value.decisionIds].sort(),
      ]),
    ),
    bx15ReplacementSubmissionId: bx15Replacement.submission_id,
  };
}

function campaignCorrection(
  decision: LoadedDecision,
  currentRecord?: MtaCanonicalRecord,
): SemanticCorrectionEntry | undefined {
  if (decisionAlreadySatisfied(decision, currentRecord)) return undefined;
  const guards = { payload: decisionGuards(decision) };
  const common = {
    correction_id: correctionId(decision.decision_id),
    record_id: decision.relation_id,
    guards,
    cascade: [] as string[],
    reason: decision.rationale,
    source_decision: sourceDecision(decision),
    reviewed_at: REVIEWED_AT,
    provenance: "human" as const,
  };

  switch (decision.terminal_action) {
    case "patch_relation": {
      const set = asRecord(
        decision.action.set,
        `${decision.decision_id}.action.set`,
      );
      return {
        ...common,
        op: "patch_payload",
        patch: { set },
      };
    }
    case "replace_endpoint": {
      const field = stringField(
        decision.action,
        "field",
        `${decision.decision_id}.action`,
      );
      assert(
        field === "subject_id" || field === "object_id",
        `${decision.decision_id} has invalid endpoint field ${field}`,
      );
      return {
        ...common,
        op: "replace_endpoint",
        patch: {
          field,
          to: stringField(
            decision.action,
            "to_record_id",
            `${decision.decision_id}.action`,
          ),
        },
      };
    }
    case "replace_with_submissions":
    case "retract_unsupported":
      return { ...common, op: "retract_record", patch: {} };
    case "resolved_by_generator_fix": {
      const ruleId = stringField(
        decision.action,
        "rule_id",
        `${decision.decision_id}.action`,
      );
      if (LIVE_DERIVATION_RULE_FIXES.has(ruleId)) return undefined;
      return { ...common, op: "retract_record", patch: {} };
    }
    case "resolved_by_identity_campaign":
      return undefined;
    default:
      throw new Error(
        `${decision.decision_id} has unknown terminal action ${decision.terminal_action}`,
      );
  }
}

function buildCorrections(
  decisions: LoadedDecision[],
  baseCorrections: SemanticCorrectionEntry[],
  preRecords: Map<string, MtaCanonicalRecord>,
) {
  const campaignCorrections = decisions
    .map((decision) =>
      campaignCorrection(decision, preRecords.get(decision.relation_id)),
    )
    .filter(
      (entry): entry is SemanticCorrectionEntry => entry !== undefined,
    );
  const followthroughId = `${CAMPAIGN_ID}/identity-followthrough/relation_mta-has-open-data-program`;
  const followthroughCorrection: SemanticCorrectionEntry = {
    correction_id: correctionId(followthroughId),
    op: "patch_payload",
    record_id: "relation_mta-has-open-data-program",
    guards: {
      payload: {
        relation_kind: "has_program",
        relation_family: "program_project_scope",
        subject_id: "entity_mta-entity-update-2025",
        object_id: "source_open-data-program",
      },
    },
    patch: { set: { relation_family: "publication_role" } },
    cascade: [],
    reason:
      "The reviewed MTA/NYCT identity remediation retargeted the subject to umbrella MTA; preserve the earlier reviewed family correction with a guard that matches the canonical identity.",
    source_decision: `${SOURCE_DECISION_PREFIX}${followthroughId}`,
    reviewed_at: REVIEWED_AT,
    provenance: "human",
  };
  campaignCorrections.push(followthroughCorrection);

  const routeIdentityFollowthroughCorrections =
    ROUTE_IDENTITY_QUARANTINE_SUPERSESSIONS.map((entry) => {
      const oldCorrection = baseCorrections.find(
        (correction) =>
          correction.correction_id === entry.correction_id,
      );
      assert(
        oldCorrection &&
          oldCorrection.op === "set_review_state" &&
          oldCorrection.record_id === entry.relation_id &&
          stableJson(
            oldCorrection.guards.payload as unknown as JsonValue,
          ) ===
            stableJson(entry.old_guard as unknown as JsonValue) &&
          oldCorrection.patch.review_state === "quarantined",
        `${entry.correction_id} no longer matches the exact reviewed self-loop quarantine guard`,
      );
      const decision = decisions.find(
        (candidate) =>
          candidate.relation_id === entry.relation_id &&
          candidate.terminal_action ===
            "resolved_by_identity_campaign",
      );
      assert(
        decision,
        `${entry.relation_id} is missing its reviewed identity decision`,
      );
      const record = preRecords.get(entry.relation_id);
      assert(
        record?.record_kind === "relation" &&
          record.review_state === "unreviewed" &&
          record.payload.relation_kind ===
            decision.current_snapshot.relation_kind &&
          record.payload.relation_family ===
            decision.current_snapshot.relation_family &&
          record.payload.subject_id ===
            decision.action.expected_subject_id &&
          record.payload.object_id ===
            decision.action.expected_object_id,
        `${entry.relation_id} does not match the reviewed post-split identity tuple`,
      );
      const correction: SemanticCorrectionEntry = {
        correction_id: correctionId(decision.decision_id),
        op: "set_review_state",
        record_id: entry.relation_id,
        guards: {
          payload: {
            relation_family: String(record.payload.relation_family),
            relation_kind: String(record.payload.relation_kind),
            subject_id: String(record.payload.subject_id),
            object_id: String(record.payload.object_id),
          },
        },
        patch: { review_state: "unreviewed" },
        cascade: [],
        reason:
          `The reviewed physical route split makes ${entry.correction_id}'s exact collapsed self-loop guard obsolete. Preserve the source-stated relation on its distinct canonical route endpoints and remove only the obsolete quarantine state.`,
        source_decision: sourceDecision(decision),
        reviewed_at: REVIEWED_AT,
        provenance: "human",
      };
      return correction;
    });
  campaignCorrections.push(
    ...routeIdentityFollowthroughCorrections,
  );
  campaignCorrections.sort((left, right) =>
    left.correction_id.localeCompare(right.correction_id),
  );
  assert(
    campaignCorrections.length >= 360 &&
      campaignCorrections.length <= 373,
    `campaign correction count fell outside the reviewed range: ${campaignCorrections.length}`,
  );
  const ids = campaignCorrections.map((entry) => entry.correction_id);
  assert(
    new Set(ids).size === ids.length,
    "campaign correction IDs are not unique",
  );
  return {
    campaignCorrections,
    corrections: [...baseCorrections, ...campaignCorrections],
    followthroughCorrection,
    routeIdentityFollowthroughCorrections,
  };
}

function buildSupersessions(
  baseSupersessions: SemanticCorrectionSupersession[],
  nativeDerivationSupersessions: SemanticCorrectionSupersession[],
  decisions: LoadedDecision[],
  followthroughCorrection: SemanticCorrectionEntry,
  routeIdentityFollowthroughCorrections: SemanticCorrectionEntry[],
): SemanticCorrectionSupersession[] {
  const boardBooks = decisions.find(
    (decision) =>
      decision.relation_id ===
      "relation_open-data-program-publishes-board-books",
  );
  assert(boardBooks, "missing Board Books semantic remediation decision");
  const additions: SemanticCorrectionSupersession[] = [
    {
      correction_id: "semqa-000031",
      superseded_by: [correctionId(boardBooks.decision_id)],
      reason:
        "The complete semantic review retracts the malformed Board Books self-loop, replacing the earlier quarantine-only correction after the MTA identity remediation.",
    },
    {
      correction_id:
        "relationship-integrity-legacy-0051-relation-mta-has-open-data-program",
      superseded_by: [followthroughCorrection.correction_id],
      reason:
        "The MTA/NYCT identity remediation changed the canonical subject from NYCT to umbrella MTA; the replacement correction preserves the reviewed publication_role family with an exact current-identity guard.",
    },
    ...ROUTE_IDENTITY_QUARANTINE_SUPERSESSIONS.map((entry) => {
      const replacement =
        routeIdentityFollowthroughCorrections.find(
          (correction) =>
            correction.record_id === entry.relation_id,
        );
      assert(
        replacement,
        `${entry.correction_id} is missing its exact route identity followthrough correction`,
      );
      return {
        correction_id: entry.correction_id,
        superseded_by: [replacement.correction_id],
        reason:
          `The reviewed route identity split replaces the exact old ${entry.old_guard.subject_id} -> ${entry.old_guard.object_id} self-loop guard with distinct physical route endpoints, so the deterministic quarantine is obsolete.`,
      };
    }),
  ];
  return [
    ...baseSupersessions,
    ...nativeDerivationSupersessions,
    ...additions,
  ].sort((left, right) =>
    left.correction_id.localeCompare(right.correction_id),
  );
}

function buildNativeDerivationSupersessions(): SemanticCorrectionSupersession[] {
  assert(
    existsSync(PAYLOAD_REFERENCE_REVIEW_DECISIONS_PATH) &&
      fileSha256(PAYLOAD_REFERENCE_REVIEW_DECISIONS_PATH) ===
        EXPECTED_PAYLOAD_REFERENCE_REVIEW_DECISIONS_SHA256,
    "Native derivation supersessions require the exact reviewed payload-reference decision contract",
  );
  return NATIVE_DERIVATION_SUPERSESSIONS.map((entry) => ({
    correction_id: entry.correction_id,
    superseded_by: [],
    superseded_by_decisions: [{
      decision_id: entry.decision_id,
      source_path: PAYLOAD_REFERENCE_REVIEW_DECISIONS_RELATIVE_PATH,
      source_sha256:
        EXPECTED_PAYLOAD_REFERENCE_REVIEW_DECISIONS_SHA256,
    }],
    reason: entry.reason,
  })).sort((left, right) =>
    left.correction_id.localeCompare(right.correction_id),
  );
}

function relationCountByKind(records: readonly MtaCanonicalRecord[]) {
  const counts: Record<string, number> = {};
  for (const record of records) {
    counts[record.record_kind] = (counts[record.record_kind] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function derivedReferenceDiagnostics(records: MtaCanonicalRecord[]) {
  const coverage = derivedRelationCoverage(records);
  const dangling = danglingReferences(records);
  const totals = coverage.reduce(
    (result, row) => ({
      records_with_field:
        result.records_with_field + row.records_with_field,
      value_count: result.value_count + row.value_count,
      derived_count: result.derived_count + row.derived_count,
      already_present_count:
        result.already_present_count + row.already_present_count,
      unresolved_count:
        result.unresolved_count + row.unresolved_count,
      ambiguous_count:
        result.ambiguous_count + row.ambiguous_count,
      skipped_self_count:
        result.skipped_self_count + row.skipped_self_count,
    }),
    {
      records_with_field: 0,
      value_count: 0,
      derived_count: 0,
      already_present_count: 0,
      unresolved_count: 0,
      ambiguous_count: 0,
      skipped_self_count: 0,
    },
  );
  assert(
    totals.unresolved_count + totals.ambiguous_count ===
      dangling.length,
    "derived coverage and dangling-reference totals do not reconcile",
  );

  const grouped = new Map<
    string,
    {
      origin_kind: string;
      field: string;
      relation_kind: string;
      reason: "ambiguous" | "unresolved";
      count: number;
      origin_record_ids: string[];
      values: string[];
    }
  >();
  for (const row of dangling) {
    const key = [
      row.origin_kind,
      row.field,
      row.relation_kind,
      row.reason,
    ].join("\0");
    const group = grouped.get(key) ?? {
      origin_kind: row.origin_kind,
      field: row.field,
      relation_kind: row.relation_kind,
      reason: row.reason,
      count: 0,
      origin_record_ids: [],
      values: [],
    };
    group.count += 1;
    group.origin_record_ids.push(row.origin_record_id);
    group.values.push(row.value);
    grouped.set(key, group);
  }
  const groups = [...grouped.values()]
    .map((group) => ({
      origin_kind: group.origin_kind,
      field: group.field,
      relation_kind: group.relation_kind,
      reason: group.reason,
      count: group.count,
      distinct_origin_record_count: new Set(
        group.origin_record_ids,
      ).size,
      distinct_value_count: new Set(group.values).size,
      origin_record_ids_sha256: stableHash(
        sortedUnique(group.origin_record_ids) as unknown as JsonValue,
      ),
      values_sha256: stableHash(
        sortedUnique(group.values) as unknown as JsonValue,
      ),
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.origin_kind.localeCompare(right.origin_kind) ||
        left.field.localeCompare(right.field) ||
        left.relation_kind.localeCompare(right.relation_kind) ||
        left.reason.localeCompare(right.reason),
    );
  const coverageRows = [...coverage].sort(
    (left, right) =>
      right.unresolved_count +
        right.ambiguous_count -
        (left.unresolved_count + left.ambiguous_count) ||
      left.rule_id.localeCompare(right.rule_id) ||
      left.field.localeCompare(right.field),
  );
  return {
    rule_field_count: coverage.length,
    totals: {
      ...totals,
      dangling_reference_count: dangling.length,
    },
    top_dangling_groups: groups.slice(0, 25),
    coverage: coverageRows,
  };
}

function statenReblockingOverlap(
  baseEntries: MtaSubmissionEntry[],
  preRecords: MtaCanonicalRecord[],
  postRecords: MtaCanonicalRecord[],
  decisions: LoadedDecision[],
) {
  assert(
    fileSha256(STATEN_REBLOCKING_JOURNAL_PATH) ===
      EXPECTED_STATEN_REBLOCKING_JOURNAL_SHA256,
    "Staten Island evidence-reblocking journal hash drifted",
  );
  const journalEntries = readFileSync(
    STATEN_REBLOCKING_JOURNAL_PATH,
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MtaSubmissionEntry);
  assert(
    journalEntries.length === 20 &&
      journalEntries.every(
        (entry) => entry.validation.state === "accepted",
      ),
    `expected 20 accepted Staten Island evidence-reblocking entries, found ${journalEntries.length}`,
  );
  const baseById = new Map(
    baseEntries.map((entry) => [entry.submission_id, entry]),
  );
  for (const entry of journalEntries) {
    const replayEntry = baseById.get(entry.submission_id);
    assert(
      replayEntry &&
        stableJson(replayEntry as unknown as JsonValue) ===
          stableJson(entry as unknown as JsonValue),
      `Staten Island evidence-reblocking submission ${entry.submission_id} is absent or drifted in the replay`,
    );
  }
  const submissionIds = new Set(
    journalEntries.map((entry) => entry.submission_id),
  );
  const relationIds = (records: MtaCanonicalRecord[]) =>
    records
      .filter(
        (record) =>
          record.record_kind === "relation" &&
          record.submission_ids.some((submissionId) =>
            submissionIds.has(submissionId),
          ),
      )
      .map((record) => record.record_id)
      .sort();
  const preRelationIds = relationIds(preRecords);
  const postRelationIds = relationIds(postRecords);
  const reviewedRelationIds = new Set(
    decisions.map((decision) => decision.relation_id),
  );
  const overlapRelationIds = postRelationIds.filter((relationId) =>
    reviewedRelationIds.has(relationId),
  );
  return {
    journal_path: relative(repoRoot, STATEN_REBLOCKING_JOURNAL_PATH),
    journal_sha256: EXPECTED_STATEN_REBLOCKING_JOURNAL_SHA256,
    accepted_submission_count: journalEntries.length,
    accepted_submission_ids_sha256: stableHash(
      [...submissionIds].sort() as unknown as JsonValue,
    ),
    pre_remediation_relation_count: preRelationIds.length,
    pre_remediation_relation_ids_sha256: stableHash(
      preRelationIds as unknown as JsonValue,
    ),
    post_remediation_relation_count: postRelationIds.length,
    post_remediation_relation_ids_sha256: stableHash(
      postRelationIds as unknown as JsonValue,
    ),
    semantic_remediation_overlap_count: overlapRelationIds.length,
    semantic_remediation_overlap_relation_ids:
      overlapRelationIds,
  };
}

function verifyCorrectionTargets(
  corrections: SemanticCorrectionEntry[],
  records: MtaCanonicalRecord[],
): void {
  const byId = new Map(records.map((record) => [record.record_id, record]));
  for (const correction of corrections) {
    if (!correction.correction_id.startsWith(CORRECTION_PREFIX)) continue;
    if (
      NATIVE_DERIVATION_SUPERSESSION_IDS.has(
        correction.correction_id,
      )
    ) {
      assert(
        correction.op === "retract_record" &&
          correction.correction_id ===
            EAST_SIDE_ACCESS_NATIVE_NON_EDGE_CORRECTION_ID,
        `unexpected campaign correction claimed a native-derivation supersession: ${correction.correction_id}`,
      );
      continue;
    }
    const target = byId.get(correction.record_id);
    assert(target, `campaign correction target ${correction.record_id} is absent`);
    if (correction.op === "replace_endpoint") {
      const to = correction.patch.to;
      assert(
        typeof to === "string" && byId.has(to),
        `${correction.correction_id} replacement target ${String(to)} is absent`,
      );
    }
    if (correction.op === "patch_payload") {
      const set = correction.patch.set;
      if (set && typeof set === "object" && !Array.isArray(set)) {
        for (const field of ["subject_id", "object_id"] as const) {
          const endpoint = (set as JsonObject)[field];
          if (typeof endpoint === "string") {
            assert(
              byId.has(endpoint),
              `${correction.correction_id} patch endpoint ${endpoint} is absent`,
            );
          }
        }
      }
    }
    if (correction.op === "retract_record") {
      const referrers = records.filter(
        (record) =>
          record.record_kind === "relation" &&
          (record.payload.subject_id === correction.record_id ||
            record.payload.object_id === correction.record_id),
      );
      assert(
        referrers.length === 0,
        `${correction.correction_id} would retract a relation referenced by ${referrers.map((record) => record.record_id).join(", ")}`,
      );
    }
  }
}

function verifyDecisionOutcomes(
  decisions: LoadedDecision[],
  preRecords: Map<string, MtaCanonicalRecord>,
  postRecords: Map<string, MtaCanonicalRecord>,
  decisionIdsBySubmissionId: Map<string, string[]>,
  correctionIdsByDecisionId: Map<string, string>,
  reviewedRetirementPinsBySubmissionId: Map<
    string,
    { decision_id: string; row_sha256: string }
  >,
  replacementObservationKindsBySubmissionId: Map<string, string>,
) {
  const rows: JsonObject[] = [];
  for (const decision of decisions) {
    const pre = preRecords.get(decision.relation_id);
    const post = postRecords.get(decision.relation_id);
    const action = decision.terminal_action;
    const generatorRule =
      action === "resolved_by_generator_fix"
        ? stringField(
            decision.action,
            "rule_id",
            `${decision.decision_id}.action`,
          )
        : undefined;
    const intentionallyAbsentBefore =
      generatorRule !== undefined &&
      LIVE_DERIVATION_RULE_FIXES.has(generatorRule);
    const absentByReviewedNativeDerivation =
      isReviewedNativeDerivationAbsentSemanticDecision(decision);
    assert(
      pre ||
        intentionallyAbsentBefore ||
        absentByReviewedNativeDerivation,
      `${decision.relation_id} is absent before remediation`,
    );
    const alreadySatisfied = decisionAlreadySatisfied(decision, pre);
    const reviewedPreReissueTuple =
      ROUTE_IDENTITY_PRE_REISSUE_TUPLES[decision.relation_id];
    const matchesReviewedPreReissueTuple =
      pre !== undefined &&
      reviewedPreReissueTuple !== undefined &&
      Object.entries(reviewedPreReissueTuple.pre_tuple).every(
        ([field, value]) => pre.payload[field] === value,
      ) &&
      reviewedPreReissueTuple.retired_submission_id ===
        BX15_MISTARGETED_SUBMISSION_ID &&
      reviewedPreReissueTuple.replacement_submission_id ===
        BX15_REPLACEMENT_SUBMISSION_ID &&
      snapshotEvidence(pre, decision.shard_index)
        .evidence_bindings_sha256 ===
        reviewedPreReissueTuple.evidence_bindings_sha256 &&
      decisionIdsBySubmissionId
        .get(reviewedPreReissueTuple.replacement_submission_id)
        ?.includes(decision.decision_id) === true;
    if (pre) {
      if (
        alreadySatisfied ||
        matchesReviewedPreReissueTuple
      ) {
        verifySnapshotEvidence(decision, pre);
      }
      else verifySnapshot(decision, pre);
    }

    const shouldSurvive =
      action === "patch_relation" ||
      action === "replace_endpoint" ||
      action === "resolved_by_identity_campaign";
    assert(
      shouldSurvive ? Boolean(post) : !post,
      `${decision.relation_id} terminal action ${action} produced the wrong presence state`,
    );

    if (post && action === "patch_relation") {
      const set = asRecord(
        decision.action.set,
        `${decision.decision_id}.action.set`,
      );
      for (const field of [
        "relation_family",
        "relation_kind",
        "subject_id",
        "object_id",
      ] as const) {
        assert(
          post.payload[field] === set[field],
          `${decision.relation_id} patch did not set ${field}`,
        );
      }
    }
    if (post && action === "replace_endpoint") {
      const field = stringField(
        decision.action,
        "field",
        `${decision.decision_id}.action`,
      );
      const target = stringField(
        decision.action,
        "to_record_id",
        `${decision.decision_id}.action`,
      );
      assert(
        post.payload[field] === target,
        `${decision.relation_id} endpoint replacement did not set ${field}`,
      );
    }
    if (post && action === "resolved_by_identity_campaign") {
      assert(
        post.payload.subject_id === decision.action.expected_subject_id &&
          post.payload.object_id === decision.action.expected_object_id,
        `${decision.relation_id} identity campaign endpoints do not match the reviewed decision`,
      );
    }
    if (post && reviewedPreReissueTuple) {
      assert(
        Object.entries(reviewedPreReissueTuple.post_tuple).every(
          ([field, value]) => post.payload[field] === value,
        ) &&
          snapshotEvidence(post, decision.shard_index)
            .evidence_bindings_sha256 ===
            reviewedPreReissueTuple.evidence_bindings_sha256,
        `${decision.relation_id} does not match the exact reviewed post-reissue tuple and evidence hash`,
      );
    }
    if (post && pre) {
      assert(
        snapshotEvidence(post, decision.shard_index)
          .evidence_bindings_sha256 ===
          snapshotEvidence(pre, decision.shard_index)
            .evidence_bindings_sha256,
        `${decision.relation_id} changed evidence while applying a tuple-only remediation`,
      );
    }

    const replacementSubmissionIds = sortedUnique(
      [...decisionIdsBySubmissionId.entries()]
        .filter(([, decisionIds]) =>
          decisionIds.includes(decision.decision_id),
        )
        .map(([submissionId]) => submissionId),
    );
    const replacementRelationSubmissionIds =
      replacementSubmissionIds.filter(
        (submissionId) =>
          replacementObservationKindsBySubmissionId.get(submissionId) ===
          "relation",
      );
    const reviewedRetiredReplacementRelationIds =
      replacementRelationSubmissionIds.filter((submissionId) =>
        reviewedRetirementPinsBySubmissionId.has(submissionId),
      );
    const allReplacementRelationsReviewedRetired =
      action === "replace_with_submissions" &&
      replacementRelationSubmissionIds.length > 0 &&
      reviewedRetiredReplacementRelationIds.length ===
        replacementRelationSubmissionIds.length;
    const resultingRelationIds =
      action === "replace_with_submissions"
        ? sortedUnique(
            [...postRecords.values()]
              .filter(
                (record) =>
                  record.record_kind === "relation" &&
                  record.submission_ids.some((submissionId) =>
                    (
                      decisionIdsBySubmissionId.get(submissionId) ?? []
                    ).includes(decision.decision_id),
                  ),
              )
              .map((record) => record.record_id),
          )
        : post
          ? [post.record_id]
          : [];
    if (action === "replace_with_submissions") {
      assert(
        resultingRelationIds.length > 0 ||
          allReplacementRelationsReviewedRetired,
        `${decision.relation_id} replacement bundle produced no relation without an exact reviewed retirement for every relation submission`,
      );
    }
    rows.push({
      decision_id: decision.decision_id,
      shard_index: decision.shard_index,
      relation_id: decision.relation_id,
      terminal_action: action,
      pre_present: Boolean(pre),
      pre_absence_reason: intentionallyAbsentBefore
        ? "live_derivation_rule_removed"
        : absentByReviewedNativeDerivation
          ? "reviewed_native_derivation_non_edge"
        : undefined,
      pre_state: alreadySatisfied
        ? "already_satisfied_by_reviewed_concurrent_remediation"
        : matchesReviewedPreReissueTuple
          ? "matches_reviewed_pre_reissue_route_identity_tuple"
        : pre
          ? "matches_reviewed_snapshot"
          : absentByReviewedNativeDerivation
            ? "removed_by_reviewed_native_derivation"
            : "removed_by_live_generator_fix",
      post_present: Boolean(post),
      post_absence_reason:
        resultingRelationIds.length === 0 &&
        allReplacementRelationsReviewedRetired
          ? "reviewed_post_campaign_relation_submission_retirement"
          : undefined,
      resulting_relation_ids: resultingRelationIds,
      correction_id: absentByReviewedNativeDerivation
        ? undefined
        : correctionIdsByDecisionId.get(decision.decision_id),
      native_superseded_correction_id:
        absentByReviewedNativeDerivation
          ? EAST_SIDE_ACCESS_NATIVE_NON_EDGE_CORRECTION_ID
          : undefined,
      native_superseding_decision_ids:
        absentByReviewedNativeDerivation
          ? [
              "relationship-reference-review-v1:b8744acf4521b57f274f56df",
            ]
          : undefined,
      replacement_submission_ids: replacementSubmissionIds,
      reviewed_retired_relation_submission_ids:
        reviewedRetiredReplacementRelationIds,
      reviewed_retirement_decision_ids: sortedUnique(
        reviewedRetiredReplacementRelationIds.map(
          (submissionId) =>
            reviewedRetirementPinsBySubmissionId.get(submissionId)!
              .decision_id,
        ),
      ),
      status: "reconciled",
    });
  }
  return rows;
}

function projectedRelationInventory(
  records: MtaCanonicalRecord[],
  tupleReviews: ReturnType<typeof loadSemanticReviewTupleMap>,
  decisions: LoadedDecision[],
  decisionIdsBySubmissionId: Map<string, string[]>,
  corrections: SemanticCorrectionEntry[],
  supersessions: SemanticCorrectionSupersession[],
): ProjectedRelationRow[] {
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const remediationByRelationId = new Map(
    decisions
      .filter((decision) =>
        [
          "patch_relation",
          "replace_endpoint",
          "resolved_by_identity_campaign",
        ].includes(decision.terminal_action),
      )
      .map((decision) => [decision.relation_id, decision.decision_id]),
  );
  const supersededCorrectionIds = new Set(
    supersessions.map((entry) => entry.correction_id),
  );
  const activeCorrectionIdsByRecordId = new Map<string, string[]>();
  for (const correction of corrections) {
    if (
      supersededCorrectionIds.has(correction.correction_id) ||
      !byId.has(correction.record_id)
    ) {
      continue;
    }
    const ids =
      activeCorrectionIdsByRecordId.get(correction.record_id) ?? [];
    ids.push(`semantic-correction/${correction.correction_id}`);
    activeCorrectionIdsByRecordId.set(
      correction.record_id,
      sortedUnique(ids),
    );
  }
  const rows: ProjectedRelationRow[] = [];
  const unmapped: string[] = [];

  for (const relation of records.filter(
    (record) => record.record_kind === "relation",
  )) {
    const fields = relationFields(relation);
    const subject = byId.get(fields.subject_id);
    const object = byId.get(fields.object_id);
    assert(
      subject && object,
      `${relation.record_id} has unresolved projected endpoints`,
    );
    const tupleReview = tupleReviews.get(
      tupleKey(
        fields.relation_family,
        fields.relation_kind,
        subject.record_kind,
        object.record_kind,
      ),
    );
    const remediationDecisionIds = sortedUnique([
      ...(remediationByRelationId.has(relation.record_id)
        ? [remediationByRelationId.get(relation.record_id)!]
        : []),
      ...relation.submission_ids.flatMap(
        (submissionId) =>
          decisionIdsBySubmissionId.get(submissionId) ?? [],
      ),
      ...(activeCorrectionIdsByRecordId.get(
        relation.record_id,
      ) ?? []),
    ]);
    const semanticReviewIds = tupleReview
      ? [tupleReview.decision_id]
      : [];
    if (
      semanticReviewIds.length === 0 &&
      remediationDecisionIds.length === 0
    ) {
      unmapped.push(relation.record_id);
    }
    const evidenceRefs = part1EvidenceBindings(relation);
    rows.push({
      relation_id: relation.record_id,
      relation_family: fields.relation_family,
      relation_kind: fields.relation_kind,
      subject_id: fields.subject_id,
      subject_kind: subject.record_kind,
      object_id: fields.object_id,
      object_kind: object.record_kind,
      evidence_ids: sortedUnique(
        evidenceRefs
          .map((ref) => ref.evidence_id)
          .filter((id): id is string => typeof id === "string"),
      ),
      evidence_bindings_sha256: logicalSha256(
        evidenceRefs as unknown as JsonValue,
      ),
      semantic_review_decision_ids: semanticReviewIds,
      semantic_remediation_decision_ids: remediationDecisionIds,
      mapping_status: "mapped",
    });
  }
  assert(
    unmapped.length === 0,
    `projected relation inventory has unmapped rows: ${unmapped.slice(0, 20).join(", ")}`,
  );
  return rows.sort((left, right) =>
    left.relation_id.localeCompare(right.relation_id),
  );
}

function projectedTupleInventory(rows: ProjectedRelationRow[]) {
  const groups = new Map<
    string,
    {
      relation_family: string;
      relation_kind: string;
      subject_kind: string;
      object_kind: string;
      relation_ids: string[];
      semantic_review_decision_ids: string[];
      semantic_remediation_decision_ids: string[];
    }
  >();
  for (const row of rows) {
    const key = tupleKey(
      row.relation_family,
      row.relation_kind,
      row.subject_kind,
      row.object_kind,
    );
    const group = groups.get(key) ?? {
      relation_family: row.relation_family,
      relation_kind: row.relation_kind,
      subject_kind: row.subject_kind,
      object_kind: row.object_kind,
      relation_ids: [],
      semantic_review_decision_ids: [],
      semantic_remediation_decision_ids: [],
    };
    group.relation_ids.push(row.relation_id);
    group.semantic_review_decision_ids.push(
      ...row.semantic_review_decision_ids,
    );
    group.semantic_remediation_decision_ids.push(
      ...row.semantic_remediation_decision_ids,
    );
    groups.set(key, group);
  }
  const tuples = [...groups.values()]
    .map((group) => ({
      relation_family: group.relation_family,
      relation_kind: group.relation_kind,
      subject_kind: group.subject_kind,
      object_kind: group.object_kind,
      relation_count: group.relation_ids.length,
      relation_ids_sha256: stableHash(group.relation_ids.sort()),
      semantic_review_decision_ids: sortedUnique(
        group.semantic_review_decision_ids,
      ),
      semantic_remediation_decision_ids: sortedUnique(
        group.semantic_remediation_decision_ids,
      ),
    }))
    .sort(
      (left, right) =>
        left.relation_kind.localeCompare(right.relation_kind) ||
        left.relation_family.localeCompare(right.relation_family) ||
        left.subject_kind.localeCompare(right.subject_kind) ||
        left.object_kind.localeCompare(right.object_kind),
    );
  return {
    schema_version: 1,
    inventory_id: `${CAMPAIGN_ID}-projected-tuples`,
    generated_at: REVIEWED_AT,
    relation_count: rows.length,
    tuple_count: tuples.length,
    relation_ids_sha256: stableHash(
      rows.map((row) => row.relation_id),
    ),
    tuples_sha256: stableHash(tuples as unknown as JsonValue),
    unmapped_relation_count: 0,
    tuples,
  };
}

function baseCorrectionsFromCurrent(): SemanticCorrectionEntry[] {
  return readSemanticCorrections().filter(
    (entry) => !entry.correction_id.startsWith(CORRECTION_PREFIX),
  );
}

function assertIdentityWarningCorrection(
  baseCorrections: SemanticCorrectionEntry[],
  identityWarningReview: ReturnType<typeof loadIdentityWarningReview>,
): SemanticCorrectionEntry {
  const matches = baseCorrections.filter(
    (entry) => entry.correction_id === M16_PREDECESSOR_CORRECTION_ID,
  );
  assert(
    matches.length === 1 &&
      stableJson(matches[0] as unknown as JsonValue) ===
        stableJson(
          identityWarningReview.proposed_correction as unknown as JsonValue,
        ),
    "M16 predecessor correction must exactly match the guarded review-note proposal",
  );
  return matches[0]!;
}

function assertFamilyWarningCorrection(
  baseCorrections: SemanticCorrectionEntry[],
  familyWarningReview: ReturnType<typeof loadFamilyWarningReview>,
): SemanticCorrectionEntry {
  const matches = baseCorrections.filter(
    (entry) => entry.correction_id === MOODYS_RATING_EVENT_CORRECTION_ID,
  );
  assert(
    matches.length === 1 &&
      stableJson(matches[0] as unknown as JsonValue) ===
        stableJson(familyWarningReview.correction as unknown as JsonValue),
    "Moody's rating-event correction must exactly match the content-pinned family review",
  );
  return matches[0]!;
}

function baseSupersessionsFromCurrent(): SemanticCorrectionSupersession[] {
  return readSemanticCorrectionSupersessions().filter(
    (entry) =>
      !NATIVE_DERIVATION_SUPERSESSION_IDS.has(
        entry.correction_id,
      ) &&
      !entry.superseded_by.some((correctionId) =>
        correctionId.startsWith(CORRECTION_PREFIX),
      ),
  );
}

function buildOutputs() {
  const { decisions, pinChecks } = loadShards();
  const identityWarningReview = loadIdentityWarningReview();
  const familyWarningReview = loadFamilyWarningReview();
  const tupleReviews = loadSemanticReviewTupleMap();
  const allEntries = readSubmissionEntries();
  const baseEntries = allEntries.filter(
    (entry) => entry.run_id !== RUN_ID,
  );
  const routeIdentityInputs = validateRouteIdentityInputs(
    decisions,
    baseEntries,
  );
  const routeIdentity = buildRouteIdentityMergeOutput();
  const replacement = buildReplacementSubmissions(
    decisions,
    baseEntries,
  );
  const retirement = buildRetirementOutput(
    replacement.bx15ReplacementSubmissionId,
    identityWarningReview,
  );
  const existingSubmissionIds = new Set(
    baseEntries.map((entry) => entry.submission_id),
  );
  const collisions = replacement.entries.filter((entry) =>
    existingSubmissionIds.has(entry.submission_id),
  );
  assert(
    collisions.length === 0,
    `replacement journal collides with existing submission IDs: ${collisions.map((entry) => entry.submission_id).join(", ")}`,
  );

  return withTemporaryIdentityMerges(
    routeIdentity.outputContent,
    () => {
	  const baseCorrections = baseCorrectionsFromCurrent();
	  const baseSupersessions = baseSupersessionsFromCurrent();
	  const nativeDerivationSupersessions =
	    buildNativeDerivationSupersessions();
  const m16PredecessorCorrection = assertIdentityWarningCorrection(
    baseCorrections,
    identityWarningReview,
  );
  const moodysRatingEventCorrection = assertFamilyWarningCorrection(
    baseCorrections,
    familyWarningReview,
  );
  assert(
    baseCorrections.length === EXPECTED_BASE_CORRECTION_COUNT,
    `expected ${EXPECTED_BASE_CORRECTION_COUNT} baseline corrections, found ${baseCorrections.length}`,
  );
  assert(
    baseSupersessions.length === 13,
    `expected 13 baseline correction supersessions, found ${baseSupersessions.length}`,
  );

  const preRetiredIds = new Set(
    retirement.base.map((entry) => entry.submission_id),
  );
	  const preMechanical = entriesToRecords(baseEntries, {
	    retiredSubmissionIds: preRetiredIds,
	  });
	  const baseCorrectionIds = new Set(
	    baseCorrections.map((entry) => entry.correction_id),
	  );
	  const preNativeDerivationSupersessions =
	    nativeDerivationSupersessions.filter((entry) =>
	      baseCorrectionIds.has(entry.correction_id),
	    );
	  const preReplay = withSemanticCorrections(
	    preMechanical,
	    baseCorrections,
	    [
	      ...baseSupersessions,
	      ...preNativeDerivationSupersessions,
	    ],
	  );
  const unexpectedPreIssues = preReplay.issues.filter((issue) => {
    const correctionId =
      /semantic correction ([^ ]+) skipped/u.exec(issue.message)?.[1];
    return !correctionId || !ALLOWED_PRE_REPLAY_ISSUES.has(correctionId);
  });
  assert(
    unexpectedPreIssues.length === 0 &&
      preReplay.issues.length ===
        ALLOWED_PRE_REPLAY_ISSUES.size,
    `pre-remediation replay issues drifted: ${preReplay.issues.map((issue) => issue.message).join("; ")}`,
  );
  const preById = new Map(
    preReplay.records.map((record) => [record.record_id, record]),
  );
  const correctionBuild = buildCorrections(
    decisions,
    baseCorrections,
    preById,
  );
	  const supersessions = buildSupersessions(
	    baseSupersessions,
	    nativeDerivationSupersessions,
	    decisions,
    correctionBuild.followthroughCorrection,
    correctionBuild.routeIdentityFollowthroughCorrections,
  );

  const postEntries = [...baseEntries, ...replacement.entries];
  const replacementEntriesById = new Map(
    replacement.entries.map((entry) => [entry.submission_id, entry]),
  );
  const postEntriesById = new Map(
    postEntries.map((entry) => [entry.submission_id, entry]),
  );
  let reviewedGeneratedRetirementCount = 0;
  for (const pin of identityWarningReview.retirement_pins) {
    const entry = postEntriesById.get(pin.submission_id);
    assert(
      entry?.validation.state === "accepted",
      `reviewed post-campaign retirement ${pin.submission_id} does not target an accepted submission`,
    );
    if (pin.submission_id === BT_DUPLICATE_RETIRED_SUBMISSION_ID) {
      assert(
        entry.run_id === BT_DUPLICATE_ORIGINAL_RUN_ID &&
          entry.tool_args_sha256 === BT_DUPLICATE_RETIRED_TOOL_ARGS_SHA256 &&
          entry.tool_args.observation_kind === "relation" &&
          !replacementEntriesById.has(pin.submission_id),
        "retired B&T duplicate must remain pinned to its original meeting-doc-196841 ingest submission",
      );
      continue;
    }
    assert(
      replacementEntriesById.get(pin.submission_id) === entry &&
        entry.run_id === RUN_ID,
      `reviewed generated retirement ${pin.submission_id} is not in the deterministic semantic journal`,
    );
    reviewedGeneratedRetirementCount += 1;
  }
  assert(
    reviewedGeneratedRetirementCount === 18,
    `expected 18 reviewed generated-submission retirements, found ${reviewedGeneratedRetirementCount}`,
  );
  const btRetainedSubmission = postEntriesById.get(
    identityWarningReview.bt_duplicate.retained_submission_id,
  );
  assert(
    btRetainedSubmission?.validation.state === "accepted" &&
      btRetainedSubmission.run_id === BT_DUPLICATE_ORIGINAL_RUN_ID &&
      btRetainedSubmission.tool_args_sha256 ===
        BT_DUPLICATE_RETAINED_TOOL_ARGS_SHA256 &&
      btRetainedSubmission.tool_args.observation_kind === "relation",
    "retained B&T edge must remain pinned to its original accepted meeting-doc-196841 submission",
  );
  const btRetainedCorrections = identityWarningReview.bt_duplicate.retained_correction_ids
    .map((correctionId) =>
      correctionBuild.corrections.find(
        (correction) => correction.correction_id === correctionId,
      ),
    );
  assert(
    btRetainedCorrections.every(
      (correction) => correction?.record_id === "relation_bt-distributes-to-mta",
    ) &&
      btRetainedCorrections.some(
        (correction) =>
          correction?.op === "replace_endpoint" &&
          correction.patch.field === "object_id" &&
          correction.patch.to === "entity_mta-entity-update-2025",
      ),
    "B&T duplicate review retained-correction target drifted",
  );
  const postRetiredIds = new Set(
    retirement.output.retired.map((entry) => entry.submission_id),
  );
  const postMechanical = entriesToRecords(postEntries, {
    retiredSubmissionIds: postRetiredIds,
  });
  verifyCorrectionTargets(
    correctionBuild.campaignCorrections,
    postMechanical,
  );
  const postReplay = withSemanticCorrections(
    postMechanical,
    correctionBuild.corrections,
    supersessions,
  );
	  assert(
	    postReplay.summary.skipped === 0 &&
      postReplay.issues.length === 0,
	    `post-remediation replay must have zero skipped corrections/issues: ${postReplay.issues.map((issue) => issue.message).join("; ")}`,
	  );
	  const payloadReferenceRemediation =
	    loadPayloadReferenceRemediationProvenance(
	      allEntries,
	      postReplay.records,
	    );
	  const projectedDecisionIdsBySubmissionId =
	    mergeSubmissionDecisionMaps(
	      replacement.decisionIdsBySubmissionId,
	      payloadReferenceRemediation.decisionIdsBySubmissionId,
	    );

  const postById = new Map(
    postReplay.records.map((record) => [record.record_id, record]),
  );
  const moodysRelation = postById.get("relation_moodys-upgraded-mta-trb");
  const moodysEvent = postById.get("event_moodys-upgrade-jun2025");
  const fitchPrecedent = postById.get("relation_fitch-upgraded-mta-trb");
  assert(
    moodysRatingEventCorrection.record_id === moodysRelation?.record_id &&
      moodysRelation.record_kind === "relation" &&
      moodysRelation.payload.relation_kind === "performed" &&
      moodysRelation.payload.relation_family === "timeline_context" &&
      moodysRelation.payload.subject_id ===
        "entity_meeting-doc-131661-moodys" &&
      moodysRelation.payload.subject_local_observation_id ===
        "entity_meeting_doc_176491_moodys" &&
      moodysRelation.payload.object_id === "event_moodys-upgrade-jun2025" &&
      moodysRelation.payload.object_local_observation_id ===
        "event_moodys_upgrade_jun2025" &&
      moodysRelation.payload.assertion_status === "unknown" &&
      moodysRelation.payload.as_of_date === "2025-06-23" &&
      moodysRelation.evidence_refs.length === 1 &&
      moodysRelation.evidence_refs[0]!.evidence_id ===
        "meeting_doc_176491#p012_c0008" &&
      moodysRelation.evidence_refs[0]!.text_sha256 ===
        "sha256:d51ff514407287e55c93fd00fd80ccfb588a58c645c0a872466b337b5a5bc9cd" &&
      moodysEvent?.record_kind === "event" &&
      moodysEvent.local_observation_id === "event_moodys_upgrade_jun2025" &&
      moodysEvent.payload.event_kind === "rating_action" &&
      moodysEvent.payload.date_normalized === "2025-06-13" &&
      fitchPrecedent?.record_kind === "relation" &&
      fitchPrecedent.payload.relation_kind === "performed" &&
      fitchPrecedent.payload.relation_family === "timeline_context" &&
      typeof fitchPrecedent.payload.object_id === "string" &&
      fitchPrecedent.payload.object_id.startsWith("event_"),
    "Moody's rating relation must preserve evidence/status/date while matching the reviewed entity-to-rating-event precision pattern",
  );
  const m16 = postById.get("route_m16-mentioned");
  const m34a = postById.get("route_m34a-sbs");
  const preM34a = preById.get("route_m34a-sbs");
  const m16Patch = asRecord(
    m16PredecessorCorrection.patch.set,
    `${M16_PREDECESSOR_CORRECTION_ID}.patch.set`,
  );
  assert(
    m16?.record_kind === "route" &&
      m34a?.record_kind === "route" &&
      m16.record_id !== m34a.record_id &&
      m16.payload.route_id === "M16" &&
      m16.payload.route_label === "M16" &&
      Object.entries(m16Patch).every(
        ([field, value]) =>
          stableJson(m16.payload[field] as JsonValue) === stableJson(value),
      ) &&
      preM34a?.record_kind === "route" &&
      stableJson(preM34a.payload as unknown as JsonValue) ===
        stableJson(m34a.payload as unknown as JsonValue),
    "reviewed M16 predecessor correction must preserve distinct M16 and M34A successor payloads",
  );
  const m16TransitionRelations = [
    "relation_m16-related-to-m34a-sbs",
    "relation_m16-renamed-to-m34a",
  ].map((recordId) => postById.get(recordId));
  assert(
    m16TransitionRelations.every(
      (record) =>
        record?.record_kind === "relation" &&
        record.payload.subject_id === "route_m16-mentioned" &&
        record.payload.object_id === "route_m34a-sbs" &&
        record.payload.subject_id !== record.payload.object_id,
    ),
    "reviewed M16/M34A transition relations must retain distinct predecessor/successor endpoints",
  );
  const bx15Local = postById.get("route_bx15-ace");
  const bx15Limited = postById.get(
    "route_bx15-ltd-webster-2012",
  );
  assert(
    bx15Local?.record_kind === "route" &&
      bx15Limited?.record_kind === "route" &&
      !bx15Local.submission_ids.includes(
        BX15_MISTARGETED_SUBMISSION_ID,
      ) &&
      bx15Limited.submission_ids.includes(
        replacement.bx15ReplacementSubmissionId,
      ),
    "Bx15 route identity split did not isolate the retired limited-stop observation on the reviewed limited route",
  );
  const correctionIdsByDecisionId = new Map(
    decisions.flatMap((decision) => {
      const correction = correctionBuild.campaignCorrections.find(
        (entry) =>
          entry.source_decision === sourceDecision(decision),
      );
      return correction
        ? [[decision.decision_id, correction.correction_id] as const]
        : [];
    }),
  );
  const ledger = verifyDecisionOutcomes(
    decisions,
    preById,
    postById,
    replacement.decisionIdsBySubmissionId,
    correctionIdsByDecisionId,
    new Map(
      identityWarningReview.retirement_pins.map((pin) => [
        pin.submission_id,
        { decision_id: pin.decision_id, row_sha256: pin.row_sha256 },
      ]),
    ),
    new Map(
      replacement.entries.map((entry) => [
        entry.submission_id,
        entry.tool_args.observation_kind,
      ]),
    ),
  );
  const reviewedRetirementOutcomeDecisionIds = ledger
    .filter(
      (row) =>
        row.post_absence_reason ===
        "reviewed_post_campaign_relation_submission_retirement",
    )
    .map((row) => String(row.decision_id))
    .sort();
  assert(
    reviewedRetirementOutcomeDecisionIds.length === 9,
    `expected nine semantic replacement decisions reconciled by exact reviewed retirements, found ${reviewedRetirementOutcomeDecisionIds.length}`,
  );
	  const projectedRelations = projectedRelationInventory(
	    postReplay.records,
	    tupleReviews,
	    decisions,
	    projectedDecisionIdsBySubmissionId,
    correctionBuild.corrections,
    supersessions,
  );
  const projectedTuples = projectedTupleInventory(projectedRelations);
  const derivedDiagnostics = derivedReferenceDiagnostics(
    postReplay.records,
  );
  const statenOverlap = statenReblockingOverlap(
    baseEntries,
    preReplay.records,
    postReplay.records,
    decisions,
  );
  const submissionMap = {
    schema_version: 1,
    campaign_id: CAMPAIGN_ID,
    journal_path: relative(repoRoot, JOURNAL_PATH),
    submission_count: replacement.entries.length,
    submission_ids_sha256: stableHash(
      replacement.entries.map((entry) => entry.submission_id),
    ),
    entries: replacement.entries.map((entry) => ({
      submission_id: entry.submission_id,
      source_id: entry.tool_args.source_id,
      observation_kind: entry.tool_args.observation_kind,
      local_observation_id: entry.tool_args.local_observation_id,
      decision_ids:
        replacement.decisionIdsBySubmissionId.get(
          entry.submission_id,
        ) ?? [],
    })),
  };
  const correctionsContent = jsonl(correctionBuild.corrections);
  const supersessionsContract = {
    schema_version: 1,
    contract_id: "semantic-correction-supersessions-v1",
    reviewed_at: "2026-07-16",
    reviewed_by: "codex-relationship-integrity-campaign",
    source_decision: relative(repoRoot, LEDGER_PATH),
    entries: supersessions,
  };
  const journalContent = jsonl(replacement.entries);
  const ledgerContent = jsonl(ledger);
  const projectedRelationsContent = jsonl(projectedRelations);
  const projectedTuplesContent = `${JSON.stringify(projectedTuples, null, 2)}\n`;
  const submissionMapContent = `${JSON.stringify(submissionMap, null, 2)}\n`;
  const supersessionsContent = `${JSON.stringify(supersessionsContract, null, 2)}\n`;

  const summary = {
    schema_version: 1,
    campaign_id: CAMPAIGN_ID,
    status: "applied",
    reviewed_at: REVIEWED_AT,
    reviewed_by: "Codex relationship-integrity campaign",
    inputs: {
      remediation_shards: EXPECTED_SHARDS.map((entry) => ({
        path: relative(repoRoot, remediationShardPath(entry.index)),
        file_sha256: entry.fileSha256,
        logical_sha256: entry.logicalSha256,
        relation_count: entry.relationCount,
      })),
      validated_shard_pins: pinChecks,
      current_retirement_path:
        "data/submission-overrides/retired.json",
      baseline_retirement_count: retirement.base.length,
      baseline_retirements_logical_sha256: stableHash(
        retirement.base as unknown as JsonValue,
      ),
      post_campaign_identity_warning_review: {
        path: IDENTITY_WARNING_REVIEW_NOTE_RELATIVE_PATH,
        sha256: identityWarningReview.note_sha256,
        reviewed_at: identityWarningReview.reviewed_at,
        retirement_count: retirement.reviewed.length,
        generated_semantic_journal_retirement_count:
          reviewedGeneratedRetirementCount,
        original_ingest_retirement_count: 1,
        retirement_submission_ids_sha256: stableHash(
          retirement.reviewed
            .map((entry) => entry.submission_id)
            .sort() as unknown as JsonValue,
        ),
        retirement_pins: identityWarningReview.retirement_pins,
        m16_predecessor_correction_id:
          m16PredecessorCorrection.correction_id,
        m16_predecessor_correction_sha256: stableHash(
          m16PredecessorCorrection as unknown as JsonValue,
        ),
        bt_duplicate_original_ingest_pin: {
          run_id: BT_DUPLICATE_ORIGINAL_RUN_ID,
          retired_submission_id: BT_DUPLICATE_RETIRED_SUBMISSION_ID,
          retired_tool_args_sha256:
            BT_DUPLICATE_RETIRED_TOOL_ARGS_SHA256,
          retained_submission_id: BT_DUPLICATE_RETAINED_SUBMISSION_ID,
          retained_tool_args_sha256:
            BT_DUPLICATE_RETAINED_TOOL_ARGS_SHA256,
          retained_correction_ids:
            identityWarningReview.bt_duplicate.retained_correction_ids,
          retained_record_id: "relation_bt-distributes-to-mta",
          corrected_object_id: "entity_mta-entity-update-2025",
        },
      },
      family_warning_review: {
        path: FAMILY_WARNING_REVIEW_NOTE_RELATIVE_PATH,
        sha256: familyWarningReview.note_sha256,
        reviewed_at: familyWarningReview.reviewed_at,
        reviewed_valid_narrow_shape_count:
          familyWarningReview.reviewed_valid_decision_ids.length,
        reviewed_valid_decision_ids:
          familyWarningReview.reviewed_valid_decision_ids,
        remediation_correction_id:
          moodysRatingEventCorrection.correction_id,
        remediation_correction_sha256: stableHash(
          moodysRatingEventCorrection as unknown as JsonValue,
        ),
        silent_exception_count:
          familyWarningReview.silent_exception_count,
      },
      baseline_submission_count: baseEntries.length,
      baseline_correction_count: baseCorrections.length,
      baseline_supersession_count: baseSupersessions.length,
      staten_island_evidence_reblocking: statenOverlap,
      payload_reference_remediation: {
        ledger_path: relative(
          repoRoot,
          PAYLOAD_REFERENCE_REMEDIATION_LEDGER_PATH,
        ),
        ledger_sha256:
          payloadReferenceRemediation.ledgerSha256,
        journal_path: relative(
          repoRoot,
          PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_PATH,
        ),
        journal_sha256:
          payloadReferenceRemediation.journalSha256,
        review_decisions_path:
          PAYLOAD_REFERENCE_REVIEW_DECISIONS_RELATIVE_PATH,
        review_decisions_sha256:
          payloadReferenceRemediation.reviewDecisionsSha256,
        relation_count:
          payloadReferenceRemediation.rows.length,
        unique_submission_count:
          payloadReferenceRemediation
            .decisionIdsBySubmissionId.size,
        decision_link_count: [
          ...payloadReferenceRemediation
            .decisionIdsBySubmissionId.values(),
        ].reduce((sum, ids) => sum + ids.length, 0),
      },
    },
    route_identity_split: {
      status: "applied",
      removed_merge_alias_count: Object.keys(
        ROUTE_IDENTITY_MERGE_SPLITS,
      ).length,
      reviewed_merge_aliases_before:
        ROUTE_IDENTITY_MERGE_SPLITS,
      merge_aliases_after: {},
      affected_relation_count: routeIdentityInputs.relation_ids.length,
      affected_relation_ids: routeIdentityInputs.relation_ids,
      pinned_identity_submission_count:
        routeIdentityInputs.submission_pins.length,
      pinned_identity_submission_ids_sha256:
        routeIdentityInputs.submission_ids_sha256,
      pinned_identity_submissions:
        routeIdentityInputs.submission_pins,
      retired_submission_id:
        BX15_MISTARGETED_SUBMISSION_ID,
      replacement_submission_id:
        replacement.bx15ReplacementSubmissionId,
      replacement_tool_args_sha256:
        BX15_REPLACEMENT_TOOL_ARGS_SHA256,
      retirement_source_decision:
        ROUTE_IDENTITY_RETIREMENT_SOURCE_DECISION,
      reviewed_pre_reissue_transitions:
        ROUTE_IDENTITY_PRE_REISSUE_TUPLES,
      m16_predecessor_correction_id:
        m16PredecessorCorrection.correction_id,
      m16_predecessor_record_id: m16!.record_id,
      m34a_successor_record_id: m34a!.record_id,
      m16_m34a_transition_relation_count:
        m16TransitionRelations.length,
      m16_m34a_transition_self_loop_count: 0,
    },
    action_reconciliation: {
      reviewed_relation_count: decisions.length,
      terminal_action_counts: EXPECTED_ACTION_COUNTS,
      reconciled_decision_count: ledger.length,
      unreconciled_decision_count: 0,
      live_derived_relation_rule_removal_count: 15,
      accepted_relation_exact_retraction_count: 18,
      guarded_semantic_correction_count:
        correctionBuild.campaignCorrections.length,
      replacement_submission_count: replacement.entries.length,
      replacement_submission_decision_link_count: [
        ...replacement.decisionIdsBySubmissionId.values(),
      ].reduce((sum, ids) => sum + ids.length, 0),
      submission_retirement_count: 1,
      preserved_post_campaign_retirement_count:
        retirement.reviewed.length,
      total_submission_retirement_count:
        retirement.output.retired.length,
      reviewed_m16_predecessor_correction_count: 1,
      reviewed_family_precision_correction_count: 1,
      reviewed_retirement_outcome_decision_count:
        reviewedRetirementOutcomeDecisionIds.length,
      reviewed_retirement_outcome_decision_ids:
        reviewedRetirementOutcomeDecisionIds,
      native_derivation_supersession_count:
        nativeDerivationSupersessions.length,
      payload_reference_remediation_relation_count:
        payloadReferenceRemediation.rows.length,
    },
    before: {
      mechanical_record_count: preMechanical.length,
      post_correction_record_count: preReplay.records.length,
      record_kind_counts: relationCountByKind(preReplay.records),
      relation_count: preReplay.records.filter(
        (record) => record.record_kind === "relation",
      ).length,
      correction_apply_summary: preReplay.summary,
      replay_issue_count: preReplay.issues.length,
      replay_issue_correction_ids: [
        ...ALLOWED_PRE_REPLAY_ISSUES,
      ].sort(),
    },
    after: {
      mechanical_record_count: postMechanical.length,
      post_correction_record_count: postReplay.records.length,
      record_kind_counts: relationCountByKind(postReplay.records),
      relation_count: projectedRelations.length,
      tuple_count: projectedTuples.tuple_count,
      correction_apply_summary: postReplay.summary,
      replay_issue_count: 0,
      skipped_correction_count: 0,
      unmapped_relation_count: 0,
      derived_reference_diagnostics: derivedDiagnostics,
    },
    outputs: {
      identity_merges_path: relative(
        repoRoot,
        IDENTITY_MERGES_PATH,
      ),
      identity_merges_sha256: sha256(
        routeIdentity.outputContent,
      ),
      retirement_path: relative(repoRoot, RETIREMENTS_PATH),
      retirement_sha256: sha256(
        retirement.outputContent,
      ),
      retirement_logical_sha256: stableHash(
        retirement.output as unknown as JsonValue,
      ),
      journal_path: relative(repoRoot, JOURNAL_PATH),
      journal_sha256: sha256(journalContent),
      correction_path: relative(repoRoot, CORRECTIONS_PATH),
      corrections_sha256: sha256(correctionsContent),
      supersessions_path: relative(repoRoot, SUPERSESSIONS_PATH),
      supersessions_sha256: sha256(supersessionsContent),
      ledger_path: relative(repoRoot, LEDGER_PATH),
      ledger_sha256: sha256(ledgerContent),
      replacement_submission_map_path: relative(
        repoRoot,
        SUBMISSION_MAP_PATH,
      ),
      replacement_submission_map_sha256: sha256(
        submissionMapContent,
      ),
      projected_relations_path: relative(
        repoRoot,
        PROJECTED_RELATIONS_PATH,
      ),
      projected_relations_sha256: sha256(
        projectedRelationsContent,
      ),
      projected_relations_logical_sha256: stableHash(
        projectedRelations as unknown as JsonValue,
      ),
      projected_tuples_path: relative(
        repoRoot,
        PROJECTED_TUPLES_PATH,
      ),
      projected_tuples_sha256: sha256(projectedTuplesContent),
      projected_tuples_logical_sha256: stableHash(
        projectedTuples as unknown as JsonValue,
      ),
    },
  };
  const summaryContent = `${JSON.stringify(summary, null, 2)}\n`;
  const reportContent = `# Relationship semantic remediation v1

Status: applied and fully reconciled.

- Reviewed relation decisions: ${decisions.length}
- Guarded semantic corrections added: ${correctionBuild.campaignCorrections.length}
- Replacement submissions: ${replacement.entries.length}
- Payload-reference remediation relations reconciled: ${payloadReferenceRemediation.rows.length}
- Native-derivation correction supersessions: ${nativeDerivationSupersessions.length}
- Route identity merge aliases split: ${Object.keys(ROUTE_IDENTITY_MERGE_SPLITS).length}
- Evidence-preserving route submissions retired/reissued: 1
- Explicitly pinned post-campaign identity retirements preserved: ${retirement.reviewed.length}
- Generated semantic-journal retirements in that set: ${reviewedGeneratedRetirementCount}
- Original meeting-doc ingest retirements in that set: 1
- Semantic replacement decisions reconciled by exact reviewed retirements: ${reviewedRetirementOutcomeDecisionIds.length}
- Reviewed M16 predecessor payload corrections: 1
- Reviewed Moody's rating-event precision corrections: 1
- Explicit reviewed-valid family warning shapes: ${familyWarningReview.reviewed_valid_decision_ids.length}
- Silent family-warning exceptions: ${familyWarningReview.silent_exception_count}
- Total semantic corrections replayed: ${correctionBuild.corrections.length}
- Total submission retirements replayed: ${retirement.output.retired.length}
- Live invalid derivations removed: 15
- Accepted invalid relation observations retracted exactly: 18
- Post-remediation canonical relations: ${projectedRelations.length}
- Post-remediation endpoint tuples: ${projectedTuples.tuple_count}
- Derived reference values audited: ${derivedDiagnostics.totals.value_count}
- Unresolved derived references: ${derivedDiagnostics.totals.unresolved_count}
- Ambiguous derived references: ${derivedDiagnostics.totals.ambiguous_count}
- Staten Island reblocking relations: ${statenOverlap.post_remediation_relation_count}
- Staten Island / semantic remediation overlap: ${statenOverlap.semantic_remediation_overlap_count}
- Skipped corrections: 0
- Replay issues: 0
- Unmapped projected relations: 0

## Route identity split

The four reviewed alias collapses were removed exactly, preserving distinct
Bx15 Local/Limited, M16/M34A SBS, Q52 LTD/SBS, and Q53 LTD/SBS physical route
records. Submission \`${BX15_MISTARGETED_SUBMISSION_ID}\` was retired and
reissued as \`${replacement.bx15ReplacementSubmissionId}\` with identical
payload and evidence and only the canonical target changed.

The exact review-note correction \`${m16PredecessorCorrection.correction_id}\`
restores the historical M16 payload while retaining M16 and M34A SBS as
distinct predecessor/successor route records. The two reviewed transition
relations remain non-self-loop M16-to-M34A edges.

The exact family-review correction \`${moodysRatingEventCorrection.correction_id}\`
repoints the imprecise umbrella-MTA rating edge to the canonical June 13, 2025
Moody's rating-action event while preserving the source, subject, status, date,
and evidence binding. The three other family warnings remain explicit reviewed
narrow shapes; no silent exception is admitted.

## Derived reference diagnostics

The post-remediation replay contains
${derivedDiagnostics.totals.dangling_reference_count} unresolved or ambiguous
relationship-like references (${derivedDiagnostics.totals.unresolved_count}
unresolved; ${derivedDiagnostics.totals.ambiguous_count} ambiguous). Exact
coverage rows and the top 25 deterministic groups are embedded in
\`${relative(repoRoot, SUMMARY_PATH)}\`.

## Reproduction

\`\`\`bash
bun scripts/apply-relationship-semantic-remediation-v1.ts --check
bun test packages/pipeline/test/records/derived-relations-semantic-integrity.test.ts
\`\`\`

The projected tuple inventory is \`${relative(repoRoot, PROJECTED_TUPLES_PATH)}\`
(SHA-256 \`${sha256(projectedTuplesContent)}\`). The relation-level inventory is
\`${relative(repoRoot, PROJECTED_RELATIONS_PATH)}\` (SHA-256
\`${sha256(projectedRelationsContent)}\`). Every projected relation maps to a
baseline semantic-review tuple decision, an exact remediation decision, or both.
`;

  return new Map<string, string>([
    [IDENTITY_MERGES_PATH, routeIdentity.outputContent],
    [RETIREMENTS_PATH, retirement.outputContent],
    [JOURNAL_PATH, journalContent],
    [CORRECTIONS_PATH, correctionsContent],
    [SUPERSESSIONS_PATH, supersessionsContent],
    [LEDGER_PATH, ledgerContent],
    [SUMMARY_PATH, summaryContent],
    [REPORT_PATH, reportContent],
    [PROJECTED_RELATIONS_PATH, projectedRelationsContent],
    [PROJECTED_TUPLES_PATH, projectedTuplesContent],
    [SUBMISSION_MAP_PATH, submissionMapContent],
  ]);
    },
  );
}

function writeOrCheck(
  outputs: Map<string, string>,
  mode: "apply" | "check",
): void {
  const mismatches: string[] = [];
  for (const [path, expected] of outputs) {
    if (mode === "apply") {
      if (
        existsSync(path) &&
        readFileSync(path, "utf8") === expected
      ) {
        continue;
      }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, expected, "utf8");
      continue;
    }
    if (!existsSync(path)) {
      mismatches.push(`${relative(repoRoot, path)} is missing`);
      continue;
    }
    const actual = readFileSync(path, "utf8");
    if (actual !== expected) {
      mismatches.push(
        `${relative(repoRoot, path)} differs (expected ${sha256(expected)}, found ${sha256(actual)})`,
      );
    }
  }
  assert(
    mismatches.length === 0,
    `semantic remediation outputs are not deterministic:\n${mismatches.join("\n")}`,
  );
}

export function applyRelationshipSemanticRemediationV1(
  mode: "apply" | "check",
): void {
  const outputs = buildOutputs();
  writeOrCheck(outputs, mode);
  const summary = JSON.parse(outputs.get(SUMMARY_PATH)!) as {
    after: {
      relation_count: number;
      tuple_count: number;
      record_kind_counts: Record<string, number>;
      correction_apply_summary: { total: number };
    };
    action_reconciliation: {
      total_submission_retirement_count: number;
    };
    outputs: {
      corrections_sha256: string;
      retirement_sha256: string;
      projected_relations_sha256: string;
      projected_tuples_sha256: string;
    };
  };
  console.log(
    JSON.stringify(
      {
        mode,
        campaign_id: CAMPAIGN_ID,
        relation_count: summary.after.relation_count,
        tuple_count: summary.after.tuple_count,
        record_kind_counts: summary.after.record_kind_counts,
        semantic_correction_count:
          summary.after.correction_apply_summary.total,
        submission_retirement_count:
          summary.action_reconciliation.total_submission_retirement_count,
        corrections_sha256: summary.outputs.corrections_sha256,
        retirement_sha256: summary.outputs.retirement_sha256,
        projected_relations_sha256:
          summary.outputs.projected_relations_sha256,
        projected_tuples_sha256:
          summary.outputs.projected_tuples_sha256,
        skipped_correction_count: 0,
        unmapped_relation_count: 0,
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) {
  const apply = process.argv.includes("--apply");
  const check = process.argv.includes("--check");
  assert(apply !== check, "Choose exactly one of --apply or --check");
  applyRelationshipSemanticRemediationV1(apply ? "apply" : "check");
}
