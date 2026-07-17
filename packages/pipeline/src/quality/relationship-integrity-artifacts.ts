import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { loadRelationshipContract, type RelationshipValidationMode } from "@mta-wiki/db/relationship-contract";
import { readCanonicalRecords } from "../materialize/canonical-read.js";
import {
  auditRelationshipGraph,
  relationshipIntegrityArtifactRoot,
  type RelationshipFinding,
  type RelationshipGraphAudit,
} from "../records/relationship-integrity.js";

export type RelationshipIntegrityArtifactResult = {
  outputDir: string;
  audit: RelationshipGraphAudit;
  manifest: {
    schema_version: 1;
    contract_id: "relationship-contract-v1";
    contract_sha256: string;
    endpoint_matrix_sha256: string;
    canonical_relations_sha256: string;
    input_fingerprint: string;
    mode: RelationshipValidationMode;
    artifacts: Array<{ path: string; sha256: string; rows?: number | undefined }>;
    reproduction_commands: string[];
  };
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeText(path: string, content: string): string {
  mkdirSync(dirname(path), { recursive: true });
  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  writeFileSync(path, normalized, "utf8");
  return sha256(normalized);
}

function writeJson(path: string, value: JsonValue): string {
  return writeText(path, JSON.stringify(value, null, 2));
}

function writeJsonl(path: string, values: readonly JsonValue[]): string {
  return writeText(path, values.map((value) => stableJson(value)).join("\n"));
}

function findingRows(findings: readonly RelationshipFinding[], code: string): RelationshipFinding[] {
  return findings.filter((finding) => finding.code === code);
}

function reportMarkdown(audit: RelationshipGraphAudit): string {
  const byCode = Object.entries(audit.summary.findings_by_code).sort(([left], [right]) => left.localeCompare(right));
  const primary = Object.entries(audit.summary.primary_dispositions).sort(([left], [right]) => left.localeCompare(right));
  const orphans = Object.entries(audit.summary.orphan_records_by_kind).sort(([left], [right]) => left.localeCompare(right));
  return [
    "# Relationship integrity audit",
    "",
    `Contract: \`${audit.contract_id}\``,
    "",
    `Mode: \`${audit.mode}\``,
    "",
    `Canonical graph: ${audit.summary.canonical_record_count.toLocaleString("en-US")} records; ${audit.summary.canonical_relation_count.toLocaleString("en-US")} relation records; ${audit.summary.distinct_relation_kind_count.toLocaleString("en-US")} relation kinds.`,
    "",
    `Frozen matrix coverage: ${audit.summary.contract_covered_relation_count.toLocaleString("en-US")}/${audit.summary.canonical_relation_count.toLocaleString("en-US")} relations across ${audit.summary.contract_rule_count.toLocaleString("en-US")} exact relation-kind rules.`,
    "",
    "## Findings",
    "",
    "| Code | Count |",
    "|---|---:|",
    ...byCode.map(([code, count]) => `| \`${code}\` | ${count.toLocaleString("en-US")} |`),
    "",
    "## Exclusive primary relation dispositions",
    "",
    "| Disposition | Relation records |",
    "|---|---:|",
    ...primary.map(([disposition, count]) => `| \`${disposition}\` | ${count.toLocaleString("en-US")} |`),
    "",
    "## Non-exclusive graph inventory",
    "",
    `- Duplicate triple groups: ${audit.summary.duplicate_triple_groups.toLocaleString("en-US")} (${audit.summary.duplicate_triple_records.toLocaleString("en-US")} records).`,
    `- Exact duplicate groups: ${audit.summary.exact_duplicate_groups.toLocaleString("en-US")} (${audit.summary.exact_duplicate_records.toLocaleString("en-US")} records).`,
    `- Ambiguous canonical aliases: ${audit.summary.ambiguous_aliases.toLocaleString("en-US")}.`,
    `- Semantic supersessions: ${audit.summary.semantic_supersessions.toLocaleString("en-US")}.`,
    "",
    "## Orphan inventory",
    "",
    "| Kind | Zero-degree records |",
    "|---|---:|",
    ...orphans.map(([kind, count]) => `| \`${kind}\` | ${count.toLocaleString("en-US")} |`),
    "",
    "Orphan rows are inventory, not automatic completeness failures. Completeness enforcement uses the versioned record-class selectors and immutable dispositions, not graph degree alone.",
    "",
    "Parallel assertions with the same triple remain distinct when source, status, date, or evidence identity differs. Exact duplicates are the narrower same-triple/status/date/evidence groups.",
  ].join("\n");
}

export function writeRelationshipIntegrityArtifacts(options: {
  outputDir?: string | undefined;
  mode?: RelationshipValidationMode | undefined;
} = {}): RelationshipIntegrityArtifactResult {
  const outputDir = options.outputDir ? join(repoRoot, options.outputDir) : join(relationshipIntegrityArtifactRoot(), "graph-audit");
  const mode = options.mode ?? "warn";
  const records = readCanonicalRecords();
  if (records.length === 0) throw new Error("canonical.db contains no records; refusing to write an empty relationship audit");
  const loaded = loadRelationshipContract();
  const audit = auditRelationshipGraph(records, { mode, contract: loaded, includeOrphans: true });
  const artifacts: Array<{ path: string; sha256: string; rows?: number | undefined }> = [];
  const add = (name: string, hash: string, rows?: number) => artifacts.push({ path: name, sha256: hash, rows });
  add("relation-audit.jsonl", writeJsonl(join(outputDir, "relation-audit.jsonl"), audit.relation_rows as unknown as JsonValue[]), audit.relation_rows.length);
  const nonOrphans = audit.findings.filter((entry) => entry.code !== "REL_ORPHAN_RECORD");
  const orphans = findingRows(audit.findings, "REL_ORPHAN_RECORD");
  add("findings.jsonl", writeJsonl(join(outputDir, "findings.jsonl"), nonOrphans as unknown as JsonValue[]), nonOrphans.length);
  add("orphan-records.jsonl", writeJsonl(join(outputDir, "orphan-records.jsonl"), orphans as unknown as JsonValue[]), orphans.length);
  add("summary.json", writeJson(join(outputDir, "summary.json"), audit.summary as unknown as JsonValue));
  add("report.md", writeText(join(outputDir, "report.md"), reportMarkdown(audit)));

  const contractText = readFileSync(join(repoRoot, "data", "contracts", "relationships", "v1", "contract.json"), "utf8");
  const canonicalRelationsText = records
    .filter((record) => record.record_kind === "relation")
    .sort((left, right) => left.record_id.localeCompare(right.record_id))
    .map((record) => stableJson(record as unknown as JsonValue))
    .join("\n") + "\n";
  const manifest = {
    schema_version: 1 as const,
    contract_id: "relationship-contract-v1" as const,
    contract_sha256: sha256(stableJson(JSON.parse(contractText) as JsonValue)),
    endpoint_matrix_sha256: loaded.contract.endpoint_matrix.sha256,
    canonical_relations_sha256: sha256(canonicalRelationsText),
    input_fingerprint: sha256(stableJson({
      contract_sha256: sha256(stableJson(JSON.parse(contractText) as JsonValue)),
      endpoint_matrix_sha256: loaded.contract.endpoint_matrix.sha256,
      canonical_relations_sha256: sha256(canonicalRelationsText),
    })),
    mode,
    artifacts: [...artifacts].sort((left, right) => left.path.localeCompare(right.path)),
    reproduction_commands: [
      `bun packages/cli/src/cli.ts relationship-integrity --mode ${mode}`,
      "bun run validate",
      "bun run rebuild-db",
    ],
  };
  writeJson(join(outputDir, "manifest.json"), manifest as unknown as JsonValue);
  return { outputDir, audit, manifest };
}

export function relationshipIntegrityArtifactSummary(result: RelationshipIntegrityArtifactResult): string {
  return [
    `Relationship integrity artifacts: ${relative(repoRoot, result.outputDir)}`,
    `Relations: ${result.audit.summary.canonical_relation_count}; findings: ${result.audit.summary.finding_count}`,
    `Matrix: ${result.audit.summary.contract_covered_relation_count}/${result.audit.summary.canonical_relation_count} covered; ${result.audit.summary.contract_rule_count} rules`,
    `Input fingerprint: ${result.manifest.input_fingerprint}`,
  ].join("\n");
}
