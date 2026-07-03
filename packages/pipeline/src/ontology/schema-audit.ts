import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/materialize";
import { REQUIRED_PAYLOAD_ANCHORS, readSubmissionEntries } from "@mta-wiki/pipeline/records/submissions";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaSubmissionEntry } from "@mta-wiki/db/types";

// Step 1 of the payload-tightening move: derive the concrete fields and enum
// closures the corpus actually uses, so `mta_submit_observation` payload typing
// can be replaced from evidence instead of guessed. This is read-only and stages
// a reviewable artifact for the LLM/human enum-proposal pass; it never enforces.

export type SchemaAuditOptions = {
  include?: string | undefined;
  exclude?: string | undefined;
};

type FieldClassification = "enum_candidate" | "free_text" | "numeric" | "boolean" | "structured" | "sparse";
type FieldValueKind = "scalar_string" | "array_string" | "number" | "boolean" | "object" | "mixed" | "empty";

export type SchemaAuditField = {
  field: string;
  declared_anchor: boolean;
  occurrences: number;
  accepted_occurrences: number;
  rejected_occurrences: number;
  canonical_occurrences: number;
  coverage: number;
  accepted_coverage: number;
  canonical_coverage: number;
  value_kind: FieldValueKind;
  accepted_value_kind: FieldValueKind;
  canonical_value_kind: FieldValueKind;
  distinct_string_values: number;
  accepted_distinct_string_values: number;
  canonical_distinct_string_values: number;
  classification: FieldClassification;
  sample_values: string[];
  accepted_sample_values: string[];
  canonical_sample_values: string[];
};

export type SchemaAuditEnumCandidate = {
  field: string;
  occurrences: number;
  accepted_occurrences: number;
  rejected_occurrences: number;
  canonical_occurrences: number;
  distinct_values: number;
  accepted_distinct_values: number;
  canonical_distinct_values: number;
  // Saturation evidence: a deterministic replacement for asking the model how
  // confident it is. singleton_ratio is a Good-Turing-style proxy for the mass
  // of values not yet observed; closure_readiness flags when an enum looks
  // complete enough to consider closing (advisory while closure is deferred).
  singleton_count: number;
  singleton_ratio: number;
  closure_readiness: "saturated" | "open";
  proposed_closure: string[];
  accepted_closure: string[];
  canonical_closure: string[];
  value_counts: Array<{ value: string; count: number }>;
  accepted_value_counts: Array<{ value: string; count: number }>;
  canonical_value_counts: Array<{ value: string; count: number }>;
};

export type SchemaAuditLabelRepeat = {
  source: "label" | "raw_text";
  value: string;
  count: number;
};

export type SchemaAuditKind = {
  observation_kind: string;
  submission_count: number;
  accepted_count: number;
  rejected_count: number;
  canonical_record_count: number;
  declared_anchor_fields: string[];
  fields: SchemaAuditField[];
  additional_keys: string[];
  enum_candidates: SchemaAuditEnumCandidate[];
  label_repeats: SchemaAuditLabelRepeat[];
};

export type SchemaAuditManifest = {
  run_id: string;
  generated_at: string;
  output_dir: string;
  paths: {
    latest: string;
    markdown: string;
  };
  thresholds: {
    enum_max_distinct: number;
    min_enum_occurrences: number;
    free_text_char_length: number;
  };
  corpus: {
    total_submissions: number;
    accepted: number;
    rejected: number;
    canonical_records: number;
    observation_kinds: number;
  };
  kinds: SchemaAuditKind[];
  truncations: string[];
};

const ENUM_MAX_DISTINCT = 12;
const MIN_ENUM_OCCURRENCES = 2;
const FREE_TEXT_CHAR_LENGTH = 40;
// An enum looks "saturated" (closable) when almost no values are singletons and
// it is both well-sampled and widely used. Closure stays deferred; this only flags.
const SATURATION_MAX_SINGLETON_RATIO = 0.05;
const SATURATION_MIN_OCCURRENCES = 10;
const SATURATION_MIN_COVERAGE = 0.3;
const MAX_SAMPLE_VALUES = 8;
const MAX_VALUE_COUNTS = 50;
const MAX_LABEL_REPEATS = 25;

function schemaAuditDir() {
  return join(repoRoot, "data", "identity-review", "schema-audit");
}

function nowRunId(date = new Date()) {
  return `${date.toISOString().replace(/[:.]/gu, "-")}_schema-audit`;
}

function mkdir(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, value: unknown) {
  mkdir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function relativePath(path: string) {
  return relative(repoRoot, path).split("/").join("/");
}

// A single payload value can be a scalar, an array of scalars, or structured.
// For enum analysis we only care about the string tokens it contributes.
function describeValue(value: JsonValue | undefined): { kind: FieldValueKind; strings: string[]; present: boolean } {
  if (value === undefined || value === null) return { kind: "empty", strings: [], present: false };
  if (typeof value === "string") {
    const trimmed = value.trim();
    return { kind: "scalar_string", strings: trimmed ? [trimmed] : [], present: trimmed.length > 0 };
  }
  if (typeof value === "number") return { kind: "number", strings: [], present: true };
  if (typeof value === "boolean") return { kind: "boolean", strings: [], present: true };
  if (Array.isArray(value)) {
    const strings = value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
    const allStrings = value.length > 0 && value.every((item) => typeof item === "string");
    return { kind: allStrings ? "array_string" : "object", strings, present: value.length > 0 };
  }
  return { kind: "object", strings: [], present: true };
}

function mergeValueKind(current: FieldValueKind | undefined, next: FieldValueKind): FieldValueKind {
  if (next === "empty") return current ?? "empty";
  if (current === undefined || current === "empty") return next;
  return current === next ? current : "mixed";
}

function looksNumeric(values: string[]) {
  if (values.length === 0) return false;
  const numeric = values.filter((value) => value !== "" && Number.isFinite(Number(value))).length;
  return numeric / values.length >= 0.6;
}

function looksFreeText(values: string[]) {
  if (values.length === 0) return false;
  const longOrWordy = values.filter((value) => value.length > FREE_TEXT_CHAR_LENGTH || value.split(/\s+/u).length > 4).length;
  return longOrWordy / values.length >= 0.6;
}

function classifyField(valueKind: FieldValueKind, distinctStrings: number, occurrences: number, distinctValues: string[]): FieldClassification {
  if (valueKind === "number") return "numeric";
  if (valueKind === "boolean") return "boolean";
  if (valueKind === "object") return "structured";
  if (occurrences < MIN_ENUM_OCCURRENCES) return "sparse";
  if (looksNumeric(distinctValues)) return "numeric";
  if (distinctStrings === 0 || distinctStrings > ENUM_MAX_DISTINCT || looksFreeText(distinctValues)) return "free_text";
  // A real enum repeats its values; a free-text field with few samples has
  // distinct ≈ occurrences. Require repetition unless the closure is tiny.
  const repeats = distinctStrings <= 4 || occurrences >= distinctStrings * 1.5;
  return repeats ? "enum_candidate" : "free_text";
}

function sanitizeCell(value: string, max = 60) {
  const compact = value.replace(/\s+/gu, " ").replace(/\|/gu, "\\|").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 1)).trim()}…`;
}

type FieldAccumulator = {
  occurrences: number;
  acceptedOccurrences: number;
  rejectedOccurrences: number;
  canonicalOccurrences: number;
  valueKind: FieldValueKind | undefined;
  acceptedValueKind: FieldValueKind | undefined;
  canonicalValueKind: FieldValueKind | undefined;
  valueCounts: Map<string, number>;
  acceptedValueCounts: Map<string, number>;
  rejectedValueCounts: Map<string, number>;
  canonicalValueCounts: Map<string, number>;
};

type KindAccumulator = {
  submissionCount: number;
  acceptedCount: number;
  rejectedCount: number;
  canonicalRecordCount: number;
  fields: Map<string, FieldAccumulator>;
  labelCounts: Map<string, number>;
  rawTextCounts: Map<string, number>;
};

function emptyKindAccumulator(): KindAccumulator {
  return {
    submissionCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    canonicalRecordCount: 0,
    fields: new Map(),
    labelCounts: new Map(),
    rawTextCounts: new Map(),
  };
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topCounts(map: Map<string, number>, limit: number) {
  return [...map.entries()]
    .filter(([, count]) => count >= MIN_ENUM_OCCURRENCES)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function emptyFieldAccumulator(): FieldAccumulator {
  return {
    occurrences: 0,
    acceptedOccurrences: 0,
    rejectedOccurrences: 0,
    canonicalOccurrences: 0,
    valueKind: undefined,
    acceptedValueKind: undefined,
    canonicalValueKind: undefined,
    valueCounts: new Map(),
    acceptedValueCounts: new Map(),
    rejectedValueCounts: new Map(),
    canonicalValueCounts: new Map(),
  };
}

function sortedSampleValues(map: Map<string, number>, limit = MAX_SAMPLE_VALUES) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function coverage(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100) / 100;
}

function buildField(
  field: string,
  accumulator: FieldAccumulator,
  submissionCount: number,
  acceptedCount: number,
  canonicalRecordCount: number,
  declaredAnchors: Set<string>,
): SchemaAuditField {
  const valueKind = accumulator.valueKind ?? "empty";
  const acceptedValueKind = accumulator.acceptedValueKind ?? "empty";
  const canonicalValueKind = accumulator.canonicalValueKind ?? "empty";
  const distinctValues = [...accumulator.valueCounts.keys()];

  return {
    field,
    declared_anchor: declaredAnchors.has(field),
    occurrences: accumulator.occurrences,
    accepted_occurrences: accumulator.acceptedOccurrences,
    rejected_occurrences: accumulator.rejectedOccurrences,
    canonical_occurrences: accumulator.canonicalOccurrences,
    coverage: coverage(accumulator.occurrences, submissionCount),
    accepted_coverage: coverage(accumulator.acceptedOccurrences, acceptedCount),
    canonical_coverage: coverage(accumulator.canonicalOccurrences, canonicalRecordCount),
    value_kind: valueKind,
    accepted_value_kind: acceptedValueKind,
    canonical_value_kind: canonicalValueKind,
    distinct_string_values: accumulator.valueCounts.size,
    accepted_distinct_string_values: accumulator.acceptedValueCounts.size,
    canonical_distinct_string_values: accumulator.canonicalValueCounts.size,
    classification: classifyField(valueKind, accumulator.valueCounts.size, accumulator.occurrences, distinctValues),
    sample_values: sortedSampleValues(accumulator.valueCounts),
    accepted_sample_values: sortedSampleValues(accumulator.acceptedValueCounts),
    canonical_sample_values: sortedSampleValues(accumulator.canonicalValueCounts),
  };
}

function buildKind(observationKind: string, accumulator: KindAccumulator, truncations: string[]): SchemaAuditKind {
  const declaredAnchors = new Set(REQUIRED_PAYLOAD_ANCHORS[observationKind as keyof typeof REQUIRED_PAYLOAD_ANCHORS] ?? []);
  const fields = [...accumulator.fields.entries()]
    .map(([field, fieldAccumulator]) =>
      buildField(field, fieldAccumulator, accumulator.submissionCount, accumulator.acceptedCount, accumulator.canonicalRecordCount, declaredAnchors),
    )
    .sort((a, b) => b.occurrences - a.occurrences || a.field.localeCompare(b.field));

  const enumCandidates: SchemaAuditEnumCandidate[] = fields
    .filter((field) => field.classification === "enum_candidate")
    .map((field) => {
      const fieldAccumulator = accumulator.fields.get(field.field);
      const valueCounts = fieldAccumulator ? topCounts(fieldAccumulator.valueCounts, MAX_VALUE_COUNTS) : [];
      if (fieldAccumulator && fieldAccumulator.valueCounts.size > MAX_VALUE_COUNTS) {
        truncations.push(`${observationKind}.${field.field}: showing ${MAX_VALUE_COUNTS} of ${fieldAccumulator.valueCounts.size} distinct values`);
      }
      const proposedClosure = fieldAccumulator ? [...fieldAccumulator.valueCounts.keys()].sort((a, b) => a.localeCompare(b)) : [];
      const singletonCount = fieldAccumulator ? [...fieldAccumulator.valueCounts.values()].filter((count) => count === 1).length : 0;
      const singletonRatio = field.distinct_string_values === 0 ? 1 : Math.round((singletonCount / field.distinct_string_values) * 100) / 100;
      const saturated =
        singletonRatio <= SATURATION_MAX_SINGLETON_RATIO && field.occurrences >= SATURATION_MIN_OCCURRENCES && field.coverage >= SATURATION_MIN_COVERAGE;
      return {
        field: field.field,
        occurrences: field.occurrences,
        accepted_occurrences: field.accepted_occurrences,
        rejected_occurrences: field.rejected_occurrences,
        canonical_occurrences: field.canonical_occurrences,
        distinct_values: field.distinct_string_values,
        accepted_distinct_values: field.accepted_distinct_string_values,
        canonical_distinct_values: field.canonical_distinct_string_values,
        singleton_count: singletonCount,
        singleton_ratio: singletonRatio,
        closure_readiness: saturated ? ("saturated" as const) : ("open" as const),
        proposed_closure: proposedClosure,
        accepted_closure: fieldAccumulator ? [...fieldAccumulator.acceptedValueCounts.keys()].sort((a, b) => a.localeCompare(b)) : [],
        canonical_closure: fieldAccumulator ? [...fieldAccumulator.canonicalValueCounts.keys()].sort((a, b) => a.localeCompare(b)) : [],
        value_counts: valueCounts,
        accepted_value_counts: fieldAccumulator ? topCounts(fieldAccumulator.acceptedValueCounts, MAX_VALUE_COUNTS) : [],
        canonical_value_counts: fieldAccumulator ? topCounts(fieldAccumulator.canonicalValueCounts, MAX_VALUE_COUNTS) : [],
      };
    });

  const additionalKeys = fields.filter((field) => !field.declared_anchor).map((field) => field.field).sort();

  const labelRepeats: SchemaAuditLabelRepeat[] = [
    ...topCounts(accumulator.labelCounts, MAX_LABEL_REPEATS).map((entry) => ({ source: "label" as const, ...entry })),
    ...topCounts(accumulator.rawTextCounts, MAX_LABEL_REPEATS).map((entry) => ({ source: "raw_text" as const, ...entry })),
  ];

  return {
    observation_kind: observationKind,
    submission_count: accumulator.submissionCount,
    accepted_count: accumulator.acceptedCount,
    rejected_count: accumulator.rejectedCount,
    canonical_record_count: accumulator.canonicalRecordCount,
    declared_anchor_fields: [...declaredAnchors].sort(),
    fields,
    additional_keys: additionalKeys,
    enum_candidates: enumCandidates,
    label_repeats: labelRepeats,
  };
}

function accumulateEntry(byKind: Map<string, KindAccumulator>, entry: MtaSubmissionEntry) {
  const observationKind = entry.tool_args.observation_kind;
  const accumulator = byKind.get(observationKind) ?? emptyKindAccumulator();
  byKind.set(observationKind, accumulator);

  accumulator.submissionCount += 1;
  const accepted = entry.validation.state === "accepted";
  if (accepted) accumulator.acceptedCount += 1;
  else accumulator.rejectedCount += 1;

  const label = entry.tool_args.label?.trim();
  if (label) increment(accumulator.labelCounts, label);
  const rawText = entry.tool_args.raw_text?.trim();
  if (rawText) increment(accumulator.rawTextCounts, rawText);

  const payload: JsonObject = entry.tool_args.payload ?? {};
  for (const [field, value] of Object.entries(payload)) {
    const described = describeValue(value);
    const fieldAccumulator = accumulator.fields.get(field) ?? emptyFieldAccumulator();
    accumulator.fields.set(field, fieldAccumulator);
    fieldAccumulator.valueKind = mergeValueKind(fieldAccumulator.valueKind, described.kind);
    if (accepted) fieldAccumulator.acceptedValueKind = mergeValueKind(fieldAccumulator.acceptedValueKind, described.kind);
    else fieldAccumulator.rejectedOccurrences += described.present ? 1 : 0;
    if (described.present) {
      fieldAccumulator.occurrences += 1;
      if (accepted) fieldAccumulator.acceptedOccurrences += 1;
    }
    for (const token of described.strings) {
      increment(fieldAccumulator.valueCounts, token);
      if (accepted) increment(fieldAccumulator.acceptedValueCounts, token);
      else increment(fieldAccumulator.rejectedValueCounts, token);
    }
  }
}

function accumulateCanonicalRecord(byKind: Map<string, KindAccumulator>, record: MtaCanonicalRecord) {
  const observationKind = record.record_kind;
  const accumulator = byKind.get(observationKind) ?? emptyKindAccumulator();
  byKind.set(observationKind, accumulator);
  accumulator.canonicalRecordCount += 1;

  for (const [field, value] of Object.entries(record.payload ?? {})) {
    const described = describeValue(value);
    const fieldAccumulator = accumulator.fields.get(field) ?? emptyFieldAccumulator();
    accumulator.fields.set(field, fieldAccumulator);
    fieldAccumulator.canonicalValueKind = mergeValueKind(fieldAccumulator.canonicalValueKind, described.kind);
    if (described.present) fieldAccumulator.canonicalOccurrences += 1;
    for (const token of described.strings) increment(fieldAccumulator.canonicalValueCounts, token);
  }
}

function markdownTable(headers: string[], rows: string[][]) {
  const head = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return `${head}\n${divider}\n${body}`;
}

function kindMarkdown(kind: SchemaAuditKind) {
  const lines: string[] = [];
  lines.push(`## ${kind.observation_kind}`);
  lines.push("");
  lines.push(
    `submissions: ${kind.submission_count} (accepted ${kind.accepted_count} / rejected ${kind.rejected_count}); canonical records: ${kind.canonical_record_count}`,
  );
  lines.push("");

  if (kind.fields.length === 0) {
    lines.push("No payload fields observed.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("### Fields");
  lines.push("");
  lines.push(
    markdownTable(
      ["field", "anchor", "all", "acc", "canon", "coverage", "value_kind", "distinct", "classification", "samples"],
      kind.fields.map((field) => [
        sanitizeCell(field.field),
        field.declared_anchor ? "yes" : "—",
        String(field.occurrences),
        String(field.accepted_occurrences),
        String(field.canonical_occurrences),
        field.coverage.toFixed(2),
        field.value_kind,
        String(field.distinct_string_values),
        field.classification,
        sanitizeCell(field.sample_values.join(", "), 70),
      ]),
    ),
  );
  lines.push("");

  if (kind.enum_candidates.length > 0) {
    lines.push("### Enum candidates (proposed closures, derived from corpus)");
    lines.push("");
    for (const candidate of kind.enum_candidates) {
      const closure = candidate.proposed_closure.map((value) => `\`${value}\``).join(" | ");
      const readiness = candidate.closure_readiness === "saturated" ? "**saturated → closure candidate**" : "open";
      lines.push(
        `- **${candidate.field}** (${candidate.occurrences} all / ${candidate.accepted_occurrences} accepted / ${candidate.canonical_occurrences} canonical, ${candidate.distinct_values} distinct, singletons ${candidate.singleton_count}/${candidate.distinct_values}, ${readiness}): ${closure}`,
      );
      const counts = candidate.value_counts.map((entry) => `${entry.value}×${entry.count}`).join(", ");
      if (counts) lines.push(`  - counts: ${counts}`);
      const acceptedCounts = candidate.accepted_value_counts.map((entry) => `${entry.value}×${entry.count}`).join(", ");
      if (acceptedCounts) lines.push(`  - accepted counts: ${acceptedCounts}`);
      const canonicalCounts = candidate.canonical_value_counts.map((entry) => `${entry.value}×${entry.count}`).join(", ");
      if (canonicalCounts) lines.push(`  - canonical counts: ${canonicalCounts}`);
    }
    lines.push("");
  }

  if (kind.additional_keys.length > 0) {
    lines.push("### Keys outside declared anchors");
    lines.push("");
    lines.push("These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.");
    lines.push("");
    lines.push(kind.additional_keys.map((key) => `\`${key}\``).join(", "));
    lines.push("");
  }

  if (kind.label_repeats.length > 0) {
    lines.push("### Repeated labels / raw_text (source_labels candidates)");
    lines.push("");
    for (const repeat of kind.label_repeats) {
      lines.push(`- (${repeat.source} ×${repeat.count}) ${sanitizeCell(repeat.value, 100)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function auditMarkdown(manifest: SchemaAuditManifest) {
  const lines: string[] = [];
  lines.push("# Payload Schema Audit");
  lines.push("");
  lines.push(`run_id: ${manifest.run_id}`);
  lines.push(`generated_at: ${manifest.generated_at}`);
  lines.push("");
  lines.push(
    `Corpus: ${manifest.corpus.total_submissions} submissions (accepted ${manifest.corpus.accepted} / rejected ${manifest.corpus.rejected}) across ${manifest.corpus.observation_kinds} observation kinds.`,
  );
  lines.push(`Canonical records in audit projection: ${manifest.corpus.canonical_records}.`);
  lines.push("");
  lines.push(
    `Thresholds: enum if ≤ ${manifest.thresholds.enum_max_distinct} distinct string values and ≥ ${manifest.thresholds.min_enum_occurrences} occurrences and not free-text/numeric. Values count across **all** submissions (accepted + rejected).`,
  );
  lines.push("");
  lines.push(
    "Closure is **deferred**: all enums stay open with an escape hatch. `closure_readiness: saturated` flags an enum whose observed values look complete (near-zero singletons, well sampled) — a candidate to close later, not a decision.",
  );
  lines.push("");
  if (manifest.truncations.length > 0) {
    lines.push("> Truncated outputs (not silently dropped):");
    for (const truncation of manifest.truncations) lines.push(`> - ${truncation}`);
    lines.push("");
  }

  for (const kind of manifest.kinds) {
    lines.push(kindMarkdown(kind));
  }

  lines.push("## Reviewer Task");
  lines.push("");
  lines.push("This is a diagnostic feed for tightening `mta_submit_observation` payload typing. Suggest only — do not enforce here.");
  lines.push("");
  lines.push("For each enum candidate: confirm whether the proposed closure is complete (`other` + `other_type_text` escape hatch), or whether values should be normalized/merged. For each key outside declared anchors: classify as promote-to-schema, alias-of-existing, escape-hatch, or drop. Stage proposals under `data/identity-review/llm-suggestions/`; land them as warn-mode normalizers before any hard-reject.");
  lines.push("");

  return lines.join("\n");
}

// Pure core: no filesystem, no clock. Aggregates a submission corpus into the
// per-kind field/enum analysis. Exported for testing with synthetic entries.
export function auditSubmissionEntries(
  entries: MtaSubmissionEntry[],
  canonicalRecords: MtaCanonicalRecord[] = [],
): {
  kinds: SchemaAuditKind[];
  corpus: SchemaAuditManifest["corpus"];
  truncations: string[];
} {
  const byKind = new Map<string, KindAccumulator>();
  for (const entry of entries) accumulateEntry(byKind, entry);
  for (const record of canonicalRecords) accumulateCanonicalRecord(byKind, record);

  const truncations: string[] = [];
  const kinds = [...byKind.entries()]
    .map(([observationKind, accumulator]) => buildKind(observationKind, accumulator, truncations))
    .sort((a, b) => b.submission_count - a.submission_count || a.observation_kind.localeCompare(b.observation_kind));

  return {
    kinds,
    corpus: {
      total_submissions: entries.length,
      accepted: entries.filter((entry) => entry.validation.state === "accepted").length,
      rejected: entries.filter((entry) => entry.validation.state !== "accepted").length,
      canonical_records: canonicalRecords.length,
      observation_kinds: kinds.length,
    },
    truncations,
  };
}

export function generateSchemaAudit(options: SchemaAuditOptions = {}): SchemaAuditManifest {
  const generatedAt = new Date().toISOString();
  const runId = nowRunId(new Date(generatedAt));
  const outputDir = schemaAuditDir();
  mkdir(outputDir);

  const include = options.include ? new RegExp(options.include, "iu") : undefined;
  const exclude = options.exclude ? new RegExp(options.exclude, "iu") : undefined;

  const entries = readSubmissionEntries().filter((entry) => {
    const kind = entry.tool_args.observation_kind;
    if (include && !include.test(kind)) return false;
    if (exclude && exclude.test(kind)) return false;
    return true;
  });
  const canonicalRecords = readCanonicalRecords().filter((record) => {
    const kind = record.record_kind;
    if (include && !include.test(kind)) return false;
    if (exclude && exclude.test(kind)) return false;
    return true;
  });

  const { kinds, corpus, truncations } = auditSubmissionEntries(entries, canonicalRecords);

  const latestPath = join(outputDir, "latest.json");
  const markdownPath = join(outputDir, `audit-${runId}.md`);

  const manifest: SchemaAuditManifest = {
    run_id: runId,
    generated_at: generatedAt,
    output_dir: relativePath(outputDir),
    paths: {
      latest: relativePath(latestPath),
      markdown: relativePath(markdownPath),
    },
    thresholds: {
      enum_max_distinct: ENUM_MAX_DISTINCT,
      min_enum_occurrences: MIN_ENUM_OCCURRENCES,
      free_text_char_length: FREE_TEXT_CHAR_LENGTH,
    },
    corpus,
    kinds,
    truncations,
  };

  writeJson(latestPath, manifest);
  writeFileSync(markdownPath, `${auditMarkdown(manifest)}\n`, "utf8");

  return manifest;
}
