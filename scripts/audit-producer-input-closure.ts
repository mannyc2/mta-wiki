import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { inspectLocalCorpusContract } from "../packages/pipeline/test/support/corpus-contract";

const OUTPUT_PATH = join(repoRoot, "data/test-contracts/producer-input-closure-v1.json");
type Profile = "public-snapshot" | "authoring";

type InputPin = {
  path: string;
  bytes: number;
  sha256: string;
};

type Product = {
  product_id: string;
  profile: Profile;
  mode:
    | "public_snapshot_replayable"
    | "authoring_replay_declared"
    | "sealed_tracked_input";
  inputs: InputPin[];
  input_tree_sha256: string;
  command: string;
  claimed_output: string;
  transitive_input_contracts?: string[];
};

function slash(value: string) {
  return value.replaceAll("\\", "/");
}

function pin(path: string): InputPin {
  const absolute = join(repoRoot, path);
  const bytes = readFileSync(absolute);
  return {
    path,
    bytes: statSync(absolute).size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function filesBelow(path: string, suffix?: string): string[] {
  const absolute = join(repoRoot, path);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute)
    .filter((name) => !suffix || name.endsWith(suffix))
    .sort()
    .map((name) => slash(relative(repoRoot, join(absolute, name))));
}

function treeHash(inputs: readonly InputPin[]): string {
  const framing = inputs
    .map((input) => `${input.path}\0${input.bytes}\0${input.sha256}\n`)
    .join("");
  return createHash("sha256").update(framing).digest("hex");
}

function product(
  productId: string,
  profile: Profile,
  mode: Product["mode"],
  paths: string[],
  command: string,
  claimedOutput: string,
  transitiveInputContracts: string[] = [],
): Product {
  const inputs = paths.map(pin).sort((left, right) => left.path.localeCompare(right.path));
  return {
    product_id: productId,
    profile,
    mode,
    inputs,
    input_tree_sha256: treeHash(inputs),
    command,
    claimed_output: claimedOutput,
    ...(transitiveInputContracts.length > 0
      ? {
          transitive_input_contracts:
            [...transitiveInputContracts].sort(),
        }
      : {}),
  };
}

function buildContract() {
  const canonicalPaths = filesBelow("data/canonical", ".jsonl");
  const submissionPaths = filesBelow("data/submissions", ".jsonl");
  const products: Product[] = [
    product(
      "canonical-sqlite-public-projection",
      "public-snapshot",
      "public_snapshot_replayable",
      [
        ...canonicalPaths,
        "packages/db/src/relationship-contract.ts",
        "packages/pipeline/src/quality/relationship-completeness.ts",
        "schemas/relationship-enforcement-source-refresh-receipt-v1.schema.json",
      ],
      "bun run materialize",
      "data/canonical.db",
      [
        "The active relationship contract, completeness bundle, enforcement proof, source-refresh receipt, and release-bundle descriptor are one strict content-addressed chain.",
        "Refreshable active-chain bytes are deliberately resolved through that chain instead of copied into this stable closure declaration, avoiding a receipt self-reference cycle.",
      ],
    ),
    product(
      "forecast-realization-public-snapshot",
      "public-snapshot",
      "public_snapshot_replayable",
      [
        ...canonicalPaths,
        "data/quality/operational-coverage/manifest.json",
        "data/quality/operational-coverage/priority-queue.jsonl",
        "data/quality/acquisition/target-list.json",
        "data/quality/acquisition/reviews/v1/manifest.json",
        "data/quality/acquisition/reviews/v1/reviewed-overlay.jsonl",
      ],
      "bun run test -- corpus-forecast-realization",
      "data/quality/acquisition",
    ),
    product(
      "v1-rc28-sealed-release",
      "public-snapshot",
      "sealed_tracked_input",
      ["data/exports/releases/v1-rc28/manifest.json"],
      "bun packages/cli/src/cli.ts verify-release v1-rc28",
      "data/exports/releases/v1-rc28",
    ),
    product(
      "submission-to-canonical-authoring-replay",
      "authoring",
      "authoring_replay_declared",
      [
        ...submissionPaths,
        "data/semantic-corrections/corrections.jsonl",
        "data/test-contracts/local-corpus-manifest-v1.json",
      ],
      "bun run test:authoring",
      "data/canonical",
    ),
  ].sort((left, right) => left.product_id.localeCompare(right.product_id));
  return {
    contract_id: "producer-input-closure-v1",
    schema_version: 1,
    baseline_commit: "6a713a74b40841635bbce98cc96340feeeb80bda",
    products,
  };
}

function usage(): never {
  throw new Error(
    "usage: bun scripts/audit-producer-input-closure.ts --write | --check --profile public-snapshot|authoring",
  );
}

const mode = process.argv[2];
if (mode === "--write") {
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(buildContract(), null, 2)}\n`);
  console.log(`Wrote ${slash(relative(repoRoot, OUTPUT_PATH))}`);
} else if (mode === "--check") {
  if (process.argv[3] !== "--profile") usage();
  const profile = process.argv[4] as Profile | undefined;
  if (profile !== "public-snapshot" && profile !== "authoring") usage();
  if (!existsSync(OUTPUT_PATH)) throw new Error("producer input closure contract is missing");
  const expected = `${JSON.stringify(buildContract(), null, 2)}\n`;
  if (readFileSync(OUTPUT_PATH, "utf8") !== expected) {
    throw new Error("producer input closure contract is stale; run with --write");
  }
  const contract = JSON.parse(expected) as ReturnType<typeof buildContract>;
  const products = contract.products.filter((entry) => entry.profile === profile);
  if (products.length === 0) throw new Error(`no products declared for ${profile}`);
  if (profile === "authoring") {
    const inspection = inspectLocalCorpusContract(repoRoot);
    const status =
      inspection.missing.length > 0
        ? "not_run_missing_local_corpus"
        : inspection.mismatched.length > 0
          ? "nonreproducible"
          : "authoring_replay_declared";
    if (status === "nonreproducible") throw new Error("present local authoring corpus does not match its pins");
    console.log(`Producer input closure verified (${profile}; ${status}; ${products.length} product)`);
  } else {
    console.log(`Producer input closure verified (${profile}; ${products.length} products)`);
  }
} else {
  usage();
}
