import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";

const MERGES_PATH = join(repoRoot, "data", "identity-overrides", "merges.json");
const REVIEW_PATH = join(
  repoRoot,
  "data",
  "relationship-integrity",
  "dispositions",
  "v1",
  "routes",
  "review.json",
);
const DO_NOT_MERGE_PATH = join(repoRoot, "data", "identity-overrides", "do-not-merge.json");
const CORRECTIONS_PATH = join(repoRoot, "data", "semantic-corrections", "corrections.jsonl");
const ALIAS = "route_q48";
const CURRENT = "route_q48-glen-oaks-2025";
const HISTORICAL = "route_q48-serves-lga-2011";
const CORRECTION_ID = "relationship-integrity-q48-historical-alias-owner-20260715";

type MergeFile = {
  version: number;
  aliases: Record<string, Record<string, string>>;
};

function sortedMap(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
}

function assertReviewedDecision(): void {
  const review = JSON.parse(readFileSync(REVIEW_PATH, "utf8")) as {
    contract_id?: string;
    overrides?: Record<string, { canonical_route_record_id?: string; decision_id?: string }>;
    non_gtfs_dispositions?: Record<string, { disposition?: string; study_projectable?: boolean; evidence_ids?: string[] }>;
  };
  if (
    review.contract_id !== "route-identity-dispositions-v1" ||
    review.overrides?.Q48?.canonical_route_record_id !== CURRENT ||
    review.overrides?.Q48?.decision_id !== "route-anchor-override-v1:Q48-current-number-reuse"
  ) {
    throw new Error("Q48 current-number alias lacks its pinned route-anchor decision");
  }
  const historical = review.non_gtfs_dispositions?.[HISTORICAL];
  if (
    historical?.disposition !== "historical_retired" ||
    historical.study_projectable !== false ||
    !historical.evidence_ids?.includes("mta_queens_bus_network_redesign_service_changes#p001_b0053")
  ) {
    throw new Error("Q48 historical identity lacks its evidence-linked non-projectable disposition");
  }
  const doNotMerge = readFileSync(DO_NOT_MERGE_PATH, "utf8");
  if (
    !doNotMerge.includes(`"${CURRENT}"`) ||
    !doNotMerge.includes(`"${HISTORICAL}"`) ||
    !doNotMerge.includes("codex-q48-lifecycle-split-identity-2026-07-13.json#q48-lifecycle-split-dnm")
  ) {
    throw new Error("Q48 alias resolution requires the pinned current/historical do-not-merge decision");
  }
}

function assertAliasCorrection(): void {
  const correction = readFileSync(CORRECTIONS_PATH, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .find((entry) => entry.correction_id === CORRECTION_ID);
  const guards = correction?.guards as Record<string, unknown> | undefined;
  const patch = correction?.patch as Record<string, unknown> | undefined;
  if (
    correction?.op !== "set_record_aliases" ||
    correction.record_id !== HISTORICAL ||
    JSON.stringify(guards?.record_aliases_one_of) !== JSON.stringify([[ALIAS], [ALIAS, CURRENT]]) ||
    JSON.stringify(patch?.record_aliases) !== JSON.stringify([]) ||
    correction.source_decision !== "data/relationship-integrity/dispositions/v1/routes/review.json#route-anchor-override-v1:Q48-current-number-reuse"
  ) {
    throw new Error("Q48 historical record lacks its guarded semantic alias removal");
  }
}

export function q48AliasMergeContent(): string {
  assertReviewedDecision();
  assertAliasCorrection();
  const parsed = JSON.parse(readFileSync(MERGES_PATH, "utf8")) as MergeFile;
  if (parsed.version !== 1 || !parsed.aliases.route) throw new Error("unsupported identity merge file");
  const existing = parsed.aliases.route[ALIAS];
  if (existing && existing !== CURRENT) {
    throw new Error(`${ALIAS} already resolves to ${existing}; refusing to replace it with ${CURRENT}`);
  }
  const aliases = Object.fromEntries(
    Object.entries(parsed.aliases).map(([kind, values]) => [
      kind,
      sortedMap(kind === "route" ? { ...values, [ALIAS]: CURRENT } : values),
    ]),
  );
  return `${JSON.stringify({ ...parsed, aliases }, null, 2)}\n`;
}

if (import.meta.main) {
  const expected = q48AliasMergeContent();
  const apply = process.argv.includes("--apply");
  if (apply) writeFileSync(MERGES_PATH, expected, "utf8");
  else if (!existsSync(MERGES_PATH) || readFileSync(MERGES_PATH, "utf8") !== expected) {
    throw new Error("Q48 alias resolution is not applied; run with --apply");
  }
  process.stdout.write(`${JSON.stringify({
    alias: ALIAS,
    target: CURRENT,
    historical_record_id: HISTORICAL,
    mode: apply ? "apply" : "check",
  })}\n`);
}
