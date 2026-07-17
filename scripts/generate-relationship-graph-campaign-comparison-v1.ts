import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";

const CAMPAIGN_ID = "relationship-integrity-completion-campaign-v1";
const BASELINE_SUMMARY_SHA256 =
  "2b136cbdd969c98b425c65e85b511bd492711b5c4fda4684ba87feca1870fc9a";
const BASELINE_MANIFEST_SHA256 =
  "13c882ddaaccee882926ca2e8d4d1e31ccec4b14873ad7391a60e05e6e341202";
const BASELINE_CANONICAL_RELATIONS_SHA256 =
  "c2480fb9da78b339a9381ff6e5756f6496f87791f79b5cf3f2bc8e2f6b99bbf7";
const BASELINE_COMPLETENESS_SUMMARY_SHA256 =
  "9047d7fb9202486f6c3e1d841f88be606e06805f2e83ed7a2ac99d1df52c5609";
const BASELINE_COMPLETENESS_MANIFEST_SHA256 =
  "3f29089f059e58ba4e738c8a85921bb86375f72bf9789937826eb4c86e856f7b";
const GRAPH_ROOT = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "graph-audit",
);
const OUTPUT_ROOT = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "campaign-comparison",
  "v1",
);
const BASELINE_ROOT = join(OUTPUT_ROOT, "pre-remediation-rc20");
const BASELINE_CAPTURE_PATH = join(BASELINE_ROOT, "capture.json");
const GRAPH_ARTIFACT_NAMES = [
  "findings.jsonl",
  "manifest.json",
  "orphan-records.jsonl",
  "relation-audit.jsonl",
  "report.md",
  "summary.json",
] as const;
const COMPLETENESS_ARTIFACT_NAMES = [
  "bus-lane-treatment-completeness.jsonl",
  "manifest.json",
  "occurrence-completeness.jsonl",
  "occurrence-treatment-physicality.jsonl",
  "operational-event-completeness.jsonl",
  "report.md",
  "route-identity-completeness.jsonl",
  "summary.json",
] as const;
const COMPLETENESS_ROOT = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "completeness",
);

type JsonRecord = Record<string, unknown>;

type FilePin = {
  path: string;
  bytes: number;
  sha256: string;
  rows?: number;
};

type BaselineCapture = {
  schema_version: 1;
  campaign_id: typeof CAMPAIGN_ID;
  baseline_id: "pre-remediation-rc20-graph-audit";
  canonical_relations_sha256: string;
  source_graph_manifest_sha256: string;
  source_graph_summary_sha256: string;
  source_completeness_manifest_sha256: string;
  source_completeness_summary_sha256: string;
  artifacts: FilePin[];
  verification_command: string;
};

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedRelative(path: string): string {
  return relative(repoRoot, path).split("\\").join("/");
}

function json(value: JsonValue): string {
  return `${stableJson(value)}\n`;
}

function parseJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    throw new Error(
      `${normalizedRelative(path)} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function rowsFor(name: string, bytes: Buffer): number | undefined {
  if (!name.endsWith(".jsonl")) return undefined;
  const text = bytes.toString("utf8");
  return text.length === 0
    ? 0
    : text.split(/\r?\n/u).filter((line) => line.length > 0).length;
}

function filePin(path: string, root = repoRoot): FilePin {
  const bytes = readFileSync(path);
  const name = path.slice(path.lastIndexOf("/") + 1);
  const rows = rowsFor(name, bytes);
  return {
    path: relative(root, path).split("\\").join("/"),
    bytes: bytes.length,
    sha256: sha256(bytes),
    ...(rows === undefined ? {} : { rows }),
  };
}

function compareOrWrite(path: string, content: Buffer | string, check: boolean): void {
  const expected = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (check) {
    if (!existsSync(path)) {
      throw new Error(`Generated campaign artifact is missing: ${normalizedRelative(path)}`);
    }
    const actual = readFileSync(path);
    if (!actual.equals(expected)) {
      throw new Error(`Generated campaign artifact is stale: ${normalizedRelative(path)}`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, expected);
}

function graphManifestArtifact(
  manifest: JsonRecord,
  path: string,
): { sha256: string; rows?: number } {
  const artifacts = manifest.artifacts;
  if (!Array.isArray(artifacts)) {
    throw new Error("Graph audit manifest has no artifact inventory");
  }
  const artifact = artifacts.find(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      (candidate as JsonRecord).path === path,
  ) as JsonRecord | undefined;
  if (!artifact || typeof artifact.sha256 !== "string") {
    throw new Error(`Graph audit manifest is missing ${path}`);
  }
  return {
    sha256: artifact.sha256,
    ...(typeof artifact.rows === "number" ? { rows: artifact.rows } : {}),
  };
}

function assertBaselineSource(): void {
  const summaryPath = join(GRAPH_ROOT, "summary.json");
  const manifestPath = join(GRAPH_ROOT, "manifest.json");
  const summaryHash = sha256(readFileSync(summaryPath));
  const manifestHash = sha256(readFileSync(manifestPath));
  if (summaryHash !== BASELINE_SUMMARY_SHA256) {
    throw new Error(
      `Refusing baseline capture from unexpected graph summary: ${summaryHash}`,
    );
  }
  if (manifestHash !== BASELINE_MANIFEST_SHA256) {
    throw new Error(
      `Refusing baseline capture from unexpected graph manifest: ${manifestHash}`,
    );
  }
  const manifest = parseJson<JsonRecord>(manifestPath);
  if (
    manifest.canonical_relations_sha256 !==
    BASELINE_CANONICAL_RELATIONS_SHA256
  ) {
    throw new Error("Baseline graph manifest does not pin the expected rc20 relation corpus");
  }
  for (const name of GRAPH_ARTIFACT_NAMES) {
    if (name === "manifest.json") continue;
    const bytes = readFileSync(join(GRAPH_ROOT, name));
    const expected = graphManifestArtifact(manifest, name);
    if (sha256(bytes) !== expected.sha256) {
      throw new Error(`Baseline graph artifact does not match its manifest: ${name}`);
    }
    const rows = rowsFor(name, bytes);
    if (expected.rows !== undefined && rows !== expected.rows) {
      throw new Error(`Baseline graph artifact row count does not match its manifest: ${name}`);
    }
  }
}

function assertBaselineCompletenessSource(): void {
  const summaryHash = sha256(readFileSync(join(COMPLETENESS_ROOT, "summary.json")));
  const manifestHash = sha256(readFileSync(join(COMPLETENESS_ROOT, "manifest.json")));
  if (
    summaryHash !== BASELINE_COMPLETENESS_SUMMARY_SHA256 ||
    manifestHash !== BASELINE_COMPLETENESS_MANIFEST_SHA256
  ) {
    throw new Error(
      `Refusing completeness baseline capture from unexpected artifacts: ${summaryHash}/${manifestHash}`,
    );
  }
  const manifest = parseJson<JsonRecord>(join(COMPLETENESS_ROOT, "manifest.json"));
  const files = manifest.files;
  if (typeof files !== "object" || files === null || Array.isArray(files)) {
    throw new Error("Completeness baseline manifest has no file inventory");
  }
  for (const name of COMPLETENESS_ARTIFACT_NAMES) {
    if (name === "manifest.json") continue;
    const pin = (files as JsonRecord)[name];
    if (typeof pin !== "object" || pin === null || Array.isArray(pin)) {
      throw new Error(`Completeness baseline manifest is missing ${name}`);
    }
    const bytes = readFileSync(join(COMPLETENESS_ROOT, name));
    const metadata = pin as JsonRecord;
    if (
      metadata.sha256 !== sha256(bytes) ||
      metadata.bytes !== bytes.length
    ) {
      throw new Error(`Completeness baseline artifact does not match its manifest: ${name}`);
    }
  }
}

function baselineArtifactPaths(): string[] {
  return [
    ...GRAPH_ARTIFACT_NAMES.map((name) => join(BASELINE_ROOT, name)),
    ...COMPLETENESS_ARTIFACT_NAMES.map((name) =>
      join(BASELINE_ROOT, "completeness", name)
    ),
  ];
}

function expectedBaselineCapture(): BaselineCapture {
  const artifacts = baselineArtifactPaths()
    .map((path) => filePin(path, BASELINE_ROOT))
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    schema_version: 1,
    campaign_id: CAMPAIGN_ID,
    baseline_id: "pre-remediation-rc20-graph-audit",
    canonical_relations_sha256: BASELINE_CANONICAL_RELATIONS_SHA256,
    source_graph_manifest_sha256: BASELINE_MANIFEST_SHA256,
    source_graph_summary_sha256: BASELINE_SUMMARY_SHA256,
    source_completeness_manifest_sha256:
      BASELINE_COMPLETENESS_MANIFEST_SHA256,
    source_completeness_summary_sha256:
      BASELINE_COMPLETENESS_SUMMARY_SHA256,
    artifacts,
    verification_command:
      "bun scripts/generate-relationship-graph-campaign-comparison-v1.ts --check-baseline",
  };
}

function captureBaseline(): void {
  assertBaselineSource();
  assertBaselineCompletenessSource();
  for (const name of GRAPH_ARTIFACT_NAMES) {
    compareOrWrite(
      join(BASELINE_ROOT, name),
      readFileSync(join(GRAPH_ROOT, name)),
      false,
    );
  }
  for (const name of COMPLETENESS_ARTIFACT_NAMES) {
    compareOrWrite(
      join(BASELINE_ROOT, "completeness", name),
      readFileSync(join(COMPLETENESS_ROOT, name)),
      false,
    );
  }
  compareOrWrite(
    BASELINE_CAPTURE_PATH,
    json(expectedBaselineCapture() as unknown as JsonValue),
    false,
  );
}

function validateBaseline(): BaselineCapture {
  const capture = parseJson<BaselineCapture>(BASELINE_CAPTURE_PATH);
  if (
    capture.schema_version !== 1 ||
    capture.campaign_id !== CAMPAIGN_ID ||
    capture.baseline_id !== "pre-remediation-rc20-graph-audit" ||
    capture.canonical_relations_sha256 !== BASELINE_CANONICAL_RELATIONS_SHA256 ||
    capture.source_graph_manifest_sha256 !== BASELINE_MANIFEST_SHA256 ||
    capture.source_graph_summary_sha256 !== BASELINE_SUMMARY_SHA256 ||
    capture.source_completeness_manifest_sha256 !==
      BASELINE_COMPLETENESS_MANIFEST_SHA256 ||
    capture.source_completeness_summary_sha256 !==
      BASELINE_COMPLETENESS_SUMMARY_SHA256
  ) {
    throw new Error("Pinned relationship graph baseline capture header is invalid");
  }
  const actualPins = baselineArtifactPaths()
    .map((path) => filePin(path, BASELINE_ROOT))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (
    stableJson(actualPins as unknown as JsonValue) !==
    stableJson(capture.artifacts as unknown as JsonValue)
  ) {
    throw new Error("Pinned relationship graph baseline artifact inventory is stale");
  }
  if (
    sha256(readFileSync(join(BASELINE_ROOT, "summary.json"))) !==
      BASELINE_SUMMARY_SHA256 ||
    sha256(readFileSync(join(BASELINE_ROOT, "manifest.json"))) !==
      BASELINE_MANIFEST_SHA256 ||
    sha256(readFileSync(join(BASELINE_ROOT, "completeness", "summary.json"))) !==
      BASELINE_COMPLETENESS_SUMMARY_SHA256 ||
    sha256(readFileSync(join(BASELINE_ROOT, "completeness", "manifest.json"))) !==
      BASELINE_COMPLETENESS_MANIFEST_SHA256
  ) {
    throw new Error("Pinned relationship graph baseline bytes do not match the reviewed hashes");
  }
  return capture;
}

function numericRecord(value: unknown, label: string): Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const entries = Object.entries(value as JsonRecord).map(([key, count]) => {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new Error(`${label}.${key} must be a non-negative integer`);
    }
    return [key, count] as const;
  });
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

function integerField(record: JsonRecord, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Graph summary.${field} must be a non-negative integer`);
  }
  return value;
}

function keyedDeltas(
  before: Record<string, number>,
  after: Record<string, number>,
): Record<string, { before: number; after: number; delta: number }> {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return Object.fromEntries(
    keys.map((key) => {
      const prior = before[key] ?? 0;
      const next = after[key] ?? 0;
      return [key, { before: prior, after: next, delta: next - prior }];
    }),
  );
}

function verifiedFinalInputs(): {
  summary: JsonRecord;
  manifest: JsonRecord;
  summaryPin: FilePin;
  manifestPin: FilePin;
} {
  const summaryPath = join(GRAPH_ROOT, "summary.json");
  const manifestPath = join(GRAPH_ROOT, "manifest.json");
  const summary = parseJson<JsonRecord>(summaryPath);
  const manifest = parseJson<JsonRecord>(manifestPath);
  const expectedSummary = graphManifestArtifact(manifest, "summary.json");
  const summaryPin = filePin(summaryPath);
  const manifestPin = filePin(manifestPath);
  if (summaryPin.sha256 !== expectedSummary.sha256) {
    throw new Error("Final graph summary does not match its graph manifest");
  }
  const canonicalPath = join(repoRoot, "data", "canonical", "relations.jsonl");
  const canonicalHash = sha256(readFileSync(canonicalPath));
  if (manifest.canonical_relations_sha256 !== canonicalHash) {
    throw new Error("Final graph manifest does not match authoritative canonical relations");
  }
  if (canonicalHash === BASELINE_CANONICAL_RELATIONS_SHA256) {
    throw new Error("Final comparison refuses the unchanged pre-remediation relation corpus");
  }
  return { summary, manifest, summaryPin, manifestPin };
}

function buildComparison(): {
  comparison: JsonRecord;
  report: string;
} {
  const baselineCapture = validateBaseline();
  const before = parseJson<JsonRecord>(join(BASELINE_ROOT, "summary.json"));
  const beforeManifest = parseJson<JsonRecord>(join(BASELINE_ROOT, "manifest.json"));
  const final = verifiedFinalInputs();
  const scalarFields = [
    "canonical_record_count",
    "canonical_relation_count",
    "distinct_relation_kind_count",
    "contract_rule_count",
    "contract_covered_relation_count",
    "finding_count",
    "duplicate_triple_groups",
    "duplicate_triple_records",
    "exact_duplicate_groups",
    "exact_duplicate_records",
    "ambiguous_aliases",
    "semantic_supersessions",
  ];
  const scalarDeltas = Object.fromEntries(
    scalarFields.map((field) => {
      const prior = integerField(before, field);
      const next = integerField(final.summary, field);
      return [field, { before: prior, after: next, delta: next - prior }];
    }),
  );
  const findingDeltas = keyedDeltas(
    numericRecord(before.findings_by_code, "baseline findings_by_code"),
    numericRecord(final.summary.findings_by_code, "final findings_by_code"),
  );
  const dispositionDeltas = keyedDeltas(
    numericRecord(before.primary_dispositions, "baseline primary_dispositions"),
    numericRecord(final.summary.primary_dispositions, "final primary_dispositions"),
  );
  const severityDeltas = keyedDeltas(
    numericRecord(before.findings_by_severity, "baseline findings_by_severity"),
    numericRecord(final.summary.findings_by_severity, "final findings_by_severity"),
  );
  const comparison: JsonRecord = {
    schema_version: 1,
    campaign_id: CAMPAIGN_ID,
    baseline: {
      capture: baselineCapture,
      graph_manifest_sha256: BASELINE_MANIFEST_SHA256,
      graph_summary_sha256: BASELINE_SUMMARY_SHA256,
      canonical_relations_sha256: BASELINE_CANONICAL_RELATIONS_SHA256,
      graph_summary: before,
    },
    final: {
      validation_mode: final.manifest.mode,
      graph_manifest: final.manifestPin,
      graph_summary: final.summaryPin,
      canonical_relations_sha256: final.manifest.canonical_relations_sha256,
      graph_summary_value: final.summary,
    },
    deltas: {
      scalar_counts: scalarDeltas,
      findings_by_code: findingDeltas,
      findings_by_severity: severityDeltas,
      primary_dispositions: dispositionDeltas,
    },
    reproduction_commands: [
      "bun scripts/generate-relationship-graph-campaign-comparison-v1.ts --check-baseline",
      "bun run relationship-integrity",
      "bun scripts/generate-relationship-graph-campaign-comparison-v1.ts --check",
    ],
    baseline_reproduction_context: {
      graph_manifest: beforeManifest,
      note:
        "The pre-remediation graph artifact tree is preserved byte-for-byte because the normal quality command writes the final audit to the same deterministic output path.",
    },
  };

  const findingRows = Object.entries(findingDeltas)
    .map(([code, value]) => `| ${code} | ${value.before} | ${value.after} | ${value.delta} |`)
    .join("\n");
  const dispositionRows = Object.entries(dispositionDeltas)
    .map(([code, value]) => `| ${code} | ${value.before} | ${value.after} | ${value.delta} |`)
    .join("\n");
  const report =
    `# Relationship integrity campaign comparison\n\n` +
    `Campaign: \`${CAMPAIGN_ID}\`\n\n` +
    `The baseline graph summary is pinned at \`${BASELINE_SUMMARY_SHA256}\`; ` +
    `the final graph summary is pinned at \`${final.summaryPin.sha256}\`. ` +
    `The normal graph-audit output is mutable working state, so the complete baseline artifact tree is retained byte-for-byte under \`pre-remediation-rc20/\`.\n\n` +
    `## Finding-code deltas\n\n` +
    `| Code | Before | After | Delta |\n| --- | ---: | ---: | ---: |\n${findingRows}\n\n` +
    `## Primary-disposition deltas\n\n` +
    `| Disposition | Before | After | Delta |\n| --- | ---: | ---: | ---: |\n${dispositionRows}\n\n` +
    `## Reproduce\n\n` +
    "```bash\n" +
    "bun scripts/generate-relationship-graph-campaign-comparison-v1.ts --check-baseline\n" +
    "bun run relationship-integrity\n" +
    "bun scripts/generate-relationship-graph-campaign-comparison-v1.ts --check\n" +
    "```\n";
  return { comparison, report };
}

function comparisonManifest(
  comparisonContent: string,
  reportContent: string,
): JsonRecord {
  return {
    schema_version: 1,
    campaign_id: CAMPAIGN_ID,
    baseline_capture: filePin(BASELINE_CAPTURE_PATH),
    baseline_graph_manifest: filePin(join(BASELINE_ROOT, "manifest.json")),
    baseline_graph_summary: filePin(join(BASELINE_ROOT, "summary.json")),
    final_graph_manifest: filePin(join(GRAPH_ROOT, "manifest.json")),
    final_graph_summary: filePin(join(GRAPH_ROOT, "summary.json")),
    outputs: [
      {
        path: "comparison.json",
        bytes: Buffer.byteLength(comparisonContent),
        sha256: sha256(comparisonContent),
      },
      {
        path: "report.md",
        bytes: Buffer.byteLength(reportContent),
        sha256: sha256(reportContent),
      },
    ],
    reproduction_command:
      "bun scripts/generate-relationship-graph-campaign-comparison-v1.ts --check",
  };
}

function generateComparison(check: boolean): void {
  const built = buildComparison();
  const comparisonContent = json(built.comparison as unknown as JsonValue);
  const reportContent = built.report;
  const manifestContent = json(
    comparisonManifest(comparisonContent, reportContent) as unknown as JsonValue,
  );
  compareOrWrite(join(OUTPUT_ROOT, "comparison.json"), comparisonContent, check);
  compareOrWrite(join(OUTPUT_ROOT, "report.md"), reportContent, check);
  compareOrWrite(join(OUTPUT_ROOT, "manifest.json"), manifestContent, check);
}

const args = process.argv.slice(2);
const allowed = new Set([
  "--capture-baseline",
  "--check-baseline",
  "--apply",
  "--check",
]);
if (args.length !== 1 || !allowed.has(args[0]!)) {
  throw new Error(
    "Usage: bun scripts/generate-relationship-graph-campaign-comparison-v1.ts " +
      "[--capture-baseline|--check-baseline|--apply|--check]",
  );
}
if (args[0] === "--capture-baseline") {
  captureBaseline();
} else if (args[0] === "--check-baseline") {
  validateBaseline();
} else {
  generateComparison(args[0] === "--check");
}

console.log(
  JSON.stringify(
    {
      mode: args[0],
      campaign_id: CAMPAIGN_ID,
      baseline_summary_sha256: BASELINE_SUMMARY_SHA256,
      output_root: normalizedRelative(OUTPUT_ROOT),
    },
    null,
    2,
  ),
);
