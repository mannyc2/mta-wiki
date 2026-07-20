import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import {
  assertTreatmentVocabularyReconciled,
  collectTreatmentVocabulary,
  parseTreatmentSemanticDisposition,
  treatmentSemanticContractBytes,
  type TreatmentSemanticContract,
  type TreatmentSemanticDisposition,
} from "../packages/pipeline/src/materialize/treatment-semantics";

const RELEASE_ID = "v1-rc24";
const RELEASE_MANIFEST_SHA256 =
  "fb068fbd7cb72afab26cadf79526ed00edfc348e680f2289b2616e5cc0f37b2d";
const RELEASE_DIR = join(repoRoot, "data", "exports", "releases", RELEASE_ID);
const CONTRACT_DIR = join(repoRoot, "data", "contracts", "treatments", "v1");
const CONTRACT_PATH = join(CONTRACT_DIR, "contract.json");
const DECISIONS_PATH = join(CONTRACT_DIR, "decisions.jsonl");
const INVENTORY_PATH = join(CONTRACT_DIR, "inventory.jsonl");
const SUMMARY_PATH = join(CONTRACT_DIR, "summary.json");

const EXPECTED_RECORD_COUNT = 2_938;
const EXPECTED_LITERAL_COUNT = 1_038;
const EXPECTED_LITERAL_LF_TERMINATED_SHA256 =
  "e825336ba8b7bff606ac9cfa3ae3fbf0b7c0dccf8c1e54d8cbed4f1109cecc4a";
const EXPECTED_LITERAL_LF_UNTERMINATED_SHA256 =
  "3e43cc1f07227af243a80b597a6932ad3774f8299c6ae41a220e7dc36e38cee5";

type ReleaseManifest = {
  files?: Record<string, { bytes?: number; sha256?: string }>;
  release_id?: string;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonl(rows: readonly unknown[]): string {
  return rows.length === 0
    ? ""
    : `${rows.map((row) => stableJson(row as JsonValue)).join("\n")}\n`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readJsonl(path: string): unknown[] {
  if (!existsSync(path)) throw new Error(`Missing required artifact: ${relative(repoRoot, path)}`);
  const text = readFileSync(path, "utf8");
  if (text.length > 0 && (!text.endsWith("\n") || text.includes("\r") || text.includes("\n\n"))) {
    throw new Error(`${relative(repoRoot, path)}: expected canonical LF-terminated JSONL`);
  }
  return text.length === 0
    ? []
    : text.slice(0, -1).split("\n").map((line, index) => {
        try {
          return JSON.parse(line) as unknown;
        } catch (error) {
          throw new Error(`${relative(repoRoot, path)}:${index + 1}: ${String(error)}`);
        }
      });
}

function verifiedReleaseRecords(): MtaCanonicalRecord[] {
  const manifestPath = join(RELEASE_DIR, "manifest.json");
  const treatmentPath = join(RELEASE_DIR, "treatment_components.jsonl");
  const manifestBytes = readFileSync(manifestPath);
  const manifestHash = sha256(manifestBytes);
  if (manifestHash !== RELEASE_MANIFEST_SHA256) {
    throw new Error(
      `Immutable ${RELEASE_ID} manifest hash mismatch: expected ${RELEASE_MANIFEST_SHA256}, found ${manifestHash}`,
    );
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as ReleaseManifest;
  if (manifest.release_id !== RELEASE_ID) throw new Error(`Expected release_id ${RELEASE_ID}`);
  const pin = manifest.files?.["treatment_components.jsonl"];
  if (pin?.sha256 === undefined || pin.bytes === undefined) {
    throw new Error(`${RELEASE_ID} manifest is missing treatment_components.jsonl pin`);
  }
  const treatmentBytes = readFileSync(treatmentPath);
  if (treatmentBytes.byteLength !== pin.bytes || sha256(treatmentBytes) !== pin.sha256) {
    throw new Error(`${RELEASE_ID}/treatment_components.jsonl does not match its manifest pin`);
  }
  const rows = readJsonl(treatmentPath) as MtaCanonicalRecord[];
  if (rows.length !== EXPECTED_RECORD_COUNT) {
    throw new Error(`Expected ${EXPECTED_RECORD_COUNT} treatment rows, found ${rows.length}`);
  }
  return rows;
}

function reviewedDecisions(): TreatmentSemanticDisposition[] {
  const decisions = readJsonl(DECISIONS_PATH).map((row, index) =>
    parseTreatmentSemanticDisposition(row, `decisions.jsonl:${index + 1}`));
  const sorted = [...decisions].sort((left, right) => {
    const literal = compareText(left.raw_treatment_kind, right.raw_treatment_kind);
    if (literal !== 0) return literal;
    return compareText(left.record_ids.join("\0"), right.record_ids.join("\0"));
  });
  if (jsonl(decisions) !== jsonl(sorted)) {
    throw new Error("decisions.jsonl must be codepoint-sorted by literal and record scope");
  }
  return decisions;
}

function compareOrWrite(path: string, content: string, write: boolean): void {
  if (write) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
    return;
  }
  if (!existsSync(path)) throw new Error(`Missing generated artifact: ${relative(repoRoot, path)}`);
  if (readFileSync(path, "utf8") !== content) {
    throw new Error(`Stale generated artifact: ${relative(repoRoot, path)}`);
  }
}

function dispositionCounts(decisions: readonly TreatmentSemanticDisposition[]) {
  return {
    atomic: decisions.filter((decision) => decision.disposition === "atomic").length,
    bundle: decisions.filter((decision) => decision.disposition === "bundle").length,
    unresolved: decisions.filter((decision) => decision.disposition === "unresolved").length,
  };
}

function recordScopeCounts(decisions: readonly TreatmentSemanticDisposition[]) {
  return {
    atomic: decisions
      .filter((decision) => decision.disposition === "atomic")
      .reduce((count, decision) => count + decision.record_ids.length, 0),
    bundle: decisions
      .filter((decision) => decision.disposition === "bundle")
      .reduce((count, decision) => count + decision.record_ids.length, 0),
    unresolved: decisions
      .filter((decision) => decision.disposition === "unresolved")
      .reduce((count, decision) => count + decision.record_ids.length, 0),
  };
}

function unresolvedReasonCounts(decisions: readonly TreatmentSemanticDisposition[]) {
  const counts = new Map<string, number>();
  for (const decision of decisions) {
    if (decision.disposition !== "unresolved") continue;
    counts.set(decision.review_reason, (counts.get(decision.review_reason) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => compareText(left, right)));
}

export function runTreatmentSemanticsContractV1(write: boolean): void {
  const records = verifiedReleaseRecords();
  const inventory = collectTreatmentVocabulary(records);
  if (inventory.invalid_records.length > 0) {
    throw new Error(`Treatment inventory has invalid records: ${stableJson(inventory.invalid_records as JsonValue)}`);
  }
  if (inventory.record_count !== EXPECTED_RECORD_COUNT || inventory.literal_count !== EXPECTED_LITERAL_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_RECORD_COUNT}/${EXPECTED_LITERAL_COUNT} treatment records/literals, ` +
        `found ${inventory.record_count}/${inventory.literal_count}`,
    );
  }
  if (inventory.sorted_union_sha256 !== EXPECTED_LITERAL_LF_TERMINATED_SHA256) {
    throw new Error(
      `Exact LF-terminated treatment vocabulary hash changed: ${inventory.sorted_union_sha256}`,
    );
  }
  const lfUnterminated = inventory.entries.map((entry) => entry.raw_treatment_kind).join("\n");
  if (sha256(lfUnterminated) !== EXPECTED_LITERAL_LF_UNTERMINATED_SHA256) {
    throw new Error(`Exact LF-unterminated treatment vocabulary hash changed: ${sha256(lfUnterminated)}`);
  }

  const decisions = reviewedDecisions();
  const contract: TreatmentSemanticContract = { schema_version: 1, dispositions: decisions };
  const reconciliation = assertTreatmentVocabularyReconciled(inventory, contract);
  const contractContent = treatmentSemanticContractBytes(contract);
  const decisionsContent = jsonl(decisions);
  const inventoryContent = jsonl(inventory.entries);
  const counts = dispositionCounts(decisions);
  const scopes = recordScopeCounts(decisions);
  const summary = {
    contract_id: "mta-wiki-treatment-semantics-v1",
    schema_version: 1,
    source_release: {
      release_id: RELEASE_ID,
      manifest_sha256: RELEASE_MANIFEST_SHA256,
      record_path: "treatment_components.jsonl",
      record_count: inventory.record_count,
    },
    vocabulary: {
      exact_literal_count: inventory.literal_count,
      serialization: "unique exact UTF-8 literals sorted by codepoint with an LF after every literal",
      lf_terminated_sha256: inventory.sorted_union_sha256,
      lf_unterminated_sha256: EXPECTED_LITERAL_LF_UNTERMINATED_SHA256,
      source_count: inventory.source_count,
    },
    reconciliation: {
      exact: reconciliation.exact,
      disposition_count: reconciliation.disposition_count,
      atomic_count: counts.atomic,
      bundle_count: counts.bundle,
      unresolved_count: counts.unresolved,
      record_scope_counts: scopes,
      unresolved_reason_counts: unresolvedReasonCounts(decisions),
      missing_literal_count: reconciliation.missing.length,
      stale_disposition_count: reconciliation.stale.length,
      missing_record_scope_count: reconciliation.missing_record_ids.length,
      stale_record_scope_count: reconciliation.stale_record_ids.length,
      duplicate_record_scope_count: reconciliation.duplicates.length,
    },
    safety: {
      raw_literal_preserved: true,
      new_or_removed_literals_fail_closed: true,
      arbitrary_prose_never_becomes_a_semantic_kind: true,
      bundle_members_require_manual_source_bound_review: true,
      unresolved_is_not_an_atomic_other_bucket: true,
    },
    downstream_reconciliation: {
      asserted_sorted_union_literal_count: 681,
      asserted_sorted_union_sha256: "ac2e8bf069d2d4aed9bc483499a290da52e11446dc02f290c39a5e26ac5d255e",
      status: "downstream_assertion_not_reproduced_from_full_input_set_here",
      explanation:
        "The downstream sorted union also includes Tracker reviewed-corpus custom treatments and trusted local-registry literals. It is not the full producer treatment-component vocabulary.",
      reproduced_rc24_route_evidence: {
        intervention_row_count: 35_817,
        title_equals_treatment_kind_count: 35_817,
        unique_treatment_kind_count: 497,
        exact_literal_lf_terminated_sha256:
          "de01151be14beba80379550c17294f1f711f645a353aae43b44ac10300e63f75",
        exact_literal_lf_unterminated_sha256:
          "5e662b40d050a841029618fa75b5cd27dfb0cb54ffae9b86ee1de7b30294e437",
        tracker_route_input_sha256:
          "8fa238d0b5d813244ef1fcf64ade28051d11eb4b3e8c55fec9500ce0a614e56f",
      },
    },
    artifacts: {
      contract: {
        path: "data/contracts/treatments/v1/contract.json",
        bytes: Buffer.byteLength(contractContent),
        sha256: sha256(contractContent),
      },
      decisions: {
        path: "data/contracts/treatments/v1/decisions.jsonl",
        rows: decisions.length,
        bytes: Buffer.byteLength(decisionsContent),
        sha256: sha256(decisionsContent),
      },
      inventory: {
        path: "data/contracts/treatments/v1/inventory.jsonl",
        rows: inventory.entries.length,
        bytes: Buffer.byteLength(inventoryContent),
        sha256: sha256(inventoryContent),
      },
    },
  };

  compareOrWrite(CONTRACT_PATH, contractContent, write);
  compareOrWrite(INVENTORY_PATH, inventoryContent, write);
  compareOrWrite(SUMMARY_PATH, json(summary), write);
  if (readFileSync(DECISIONS_PATH, "utf8") !== decisionsContent) {
    throw new Error("decisions.jsonl is not canonical JSONL or normalized to its strict schema");
  }
  console.log(
    `${write ? "Wrote" : "Verified"} treatment semantics v1: ${inventory.record_count} records, ` +
      `${inventory.literal_count} literals, ${JSON.stringify(counts)}`,
  );
}

const args = new Set(process.argv.slice(2));
if ([...args].some((arg) => arg !== "--write" && arg !== "--check")) {
  throw new Error(`Unknown argument(s): ${[...args].join(", ")}`);
}
if (args.has("--write") && args.has("--check")) throw new Error("Choose --write or --check");
runTreatmentSemanticsContractV1(args.has("--write"));
