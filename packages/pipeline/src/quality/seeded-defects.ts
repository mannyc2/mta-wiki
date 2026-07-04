import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord, StagedSourceBlock } from "@mta-wiki/db/types";
import { evidenceBlockText, readReleaseRecords } from "@mta-wiki/pipeline/quality/release-quality";
import { calibrationFixtureDir, type JudgeVerdict } from "@mta-wiki/pipeline/quality/judge-calibration";

export type SeededDefectClass =
  | "value_perturbation"
  | "unit_swap"
  | "endpoint_sibling_swap"
  | "lifecycle_flip"
  | "period_shift"
  | "wrong_block_recite"
  | "control";

export type SeededDefectFixtureRow = {
  record_id: string;
  original_record_id: string;
  record_kind: string;
  sample_group: string;
  defect_class: SeededDefectClass;
  expected_verdict: JudgeVerdict | "unsupported_or_wrong";
  display_name: string;
  payload: JsonObject;
  evidence: Array<{
    source_id: string | null;
    block_id: string | null;
    source_quote?: string | undefined;
    block_text?: string | undefined;
    error?: string | undefined;
  }>;
  mutation_note: string;
};

export type SeededDefectWriteResult = {
  path: string;
  rows: number;
  counts: Record<string, number>;
  sha256: string;
};

type AuditRow = {
  record_id: string;
  record_kind: string;
  sample_group: string;
  sample_index: number;
  verdict: JudgeVerdict;
  human_review?: boolean | undefined;
};

type HumanRow = {
  record_id: string;
  reviewer_decision: "agree" | "disagree";
};

const DEFECT_CLASSES: Exclude<SeededDefectClass, "control">[] = [
  "value_perturbation",
  "unit_swap",
  "endpoint_sibling_swap",
  "lifecycle_flip",
  "period_shift",
  "wrong_block_recite",
];

const DEFECT_TARGET = 25;
const CONTROL_TARGET = 50;

export function seededDefectsDir(rootDir = repoRoot): string {
  return join(rootDir, "data/quality/fixtures/seeded-defects-v1");
}

export function seededDefectsPath(rootDir = repoRoot): string {
  return join(seededDefectsDir(rootDir), "fixtures.jsonl");
}

export function buildSeededDefectFixtures(options: { seed?: string | undefined; rootDir?: string | undefined; releaseId?: string | undefined } = {}): SeededDefectFixtureRow[] {
  const rootDir = options.rootDir ?? repoRoot;
  const releaseId = options.releaseId ?? "v1-rc5";
  const seed = options.seed ?? "semqa-v1";
  const auditRows = readJsonl<AuditRow>(join(calibrationFixtureDir(rootDir), "judged-300.jsonl"));
  const humanRows = readJsonl<HumanRow>(join(calibrationFixtureDir(rootDir), "human-50.jsonl"));
  const humanAgreed = new Set(humanRows.filter((row) => row.reviewer_decision === "agree").map((row) => row.record_id));
  const humanDisagreed = new Set(humanRows.filter((row) => row.reviewer_decision === "disagree").map((row) => row.record_id));
  const records = readReleaseRecords(releaseId, rootDir);
  const recordsById = new Map(records.map((record) => [record.record_id, record]));

  const pool = auditRows
    .filter((row) => row.verdict === "supported" || row.verdict === "partially_supported")
    .filter((row) => !humanDisagreed.has(row.record_id))
    .filter((row) => !row.human_review || humanAgreed.has(row.record_id))
    .filter((row) => recordsById.has(row.record_id))
    .sort((a, b) => hash(seed, "pool", a.record_id).localeCompare(hash(seed, "pool", b.record_id)) || a.record_id.localeCompare(b.record_id));

  const rows: SeededDefectFixtureRow[] = [];
  for (const defectClass of DEFECT_CLASSES) {
    let count = 0;
    for (const auditRow of pool) {
      if (count >= DEFECT_TARGET) break;
      const record = recordsById.get(auditRow.record_id);
      if (!record) continue;
      const fixture = mutateRecord(defectClass, auditRow, record, records, count + 1, rootDir);
      if (!fixture) continue;
      rows.push(fixture);
      count += 1;
    }
  }

  for (const auditRow of pool.slice(0, CONTROL_TARGET)) {
    const record = recordsById.get(auditRow.record_id);
    if (!record) continue;
    rows.push(promptRow(auditRow, record, `__seeded-control-${rows.filter((row) => row.defect_class === "control").length + 1}`, "control", auditRow.verdict, "unmodified control", rootDir));
  }

  return rows;
}

export function writeSeededDefectFixtures(options: { seed?: string | undefined; rootDir?: string | undefined; releaseId?: string | undefined } = {}): SeededDefectWriteResult {
  const rootDir = options.rootDir ?? repoRoot;
  const rows = buildSeededDefectFixtures(options);
  const path = seededDefectsPath(rootDir);
  writeJsonl(path, rows);
  const content = readFileSync(path, "utf8");
  return {
    path,
    rows: rows.length,
    counts: countBy(rows.map((row) => row.defect_class)),
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

function mutateRecord(
  defectClass: Exclude<SeededDefectClass, "control">,
  auditRow: AuditRow,
  record: MtaCanonicalRecord,
  records: MtaCanonicalRecord[],
  index: number,
  rootDir: string,
): SeededDefectFixtureRow | undefined {
  const suffix = `__seeded-${defectClass}-${index}`;
  const payload = clone(record.payload);
  let note: string | undefined;
  if (defectClass === "value_perturbation") note = mutateValue(payload);
  if (defectClass === "unit_swap") note = mutateUnit(payload);
  if (defectClass === "endpoint_sibling_swap") note = mutateEndpoint(payload, record, records);
  if (defectClass === "lifecycle_flip") note = mutateLifecycle(payload);
  if (defectClass === "period_shift") note = mutatePeriod(payload);
  if (!note && defectClass !== "wrong_block_recite") return undefined;

  const row = promptRow(auditRow, { ...record, payload }, suffix, defectClass, "unsupported_or_wrong", note ?? "wrong cited block", rootDir);
  if (defectClass === "endpoint_sibling_swap") row.display_name = `${record.display_name} [endpoint sibling swap]`;
  if (defectClass === "wrong_block_recite" && !mutateWrongBlock(row, record, rootDir)) return undefined;
  return row;
}

function promptRow(
  auditRow: AuditRow,
  record: MtaCanonicalRecord,
  suffix: string,
  defectClass: SeededDefectClass,
  expectedVerdict: JudgeVerdict | "unsupported_or_wrong",
  mutationNote: string,
  rootDir: string,
): SeededDefectFixtureRow {
  return {
    record_id: `${record.record_id}${suffix}`,
    original_record_id: record.record_id,
    record_kind: record.record_kind,
    sample_group: auditRow.sample_group,
    defect_class: defectClass,
    expected_verdict: expectedVerdict,
    display_name: record.display_name,
    payload: clone(record.payload),
    evidence: record.evidence_refs.map((ref) => evidenceBlockText(ref, rootDir)),
    mutation_note: mutationNote,
  };
}

function mutateValue(payload: JsonObject): string | undefined {
  const current = typeof payload.value === "number" ? payload.value : undefined;
  if (current === undefined || !Number.isFinite(current)) return undefined;
  const next = Number((current * 1.3).toFixed(3));
  if (next === current) return undefined;
  payload.value = next;
  if (typeof payload.raw_value_text === "string") payload.raw_value_text = payload.raw_value_text.replace(/\d+(?:\.\d+)?/u, String(next));
  return `payload.value ${current} -> ${next}`;
}

function mutateUnit(payload: JsonObject): string | undefined {
  const current = stringPayload(payload, "unit") ?? stringPayload(payload, "unit_normalized");
  if (!current) return undefined;
  const next = /thousand/iu.test(current) ? "millions" : "thousands";
  payload.unit = next;
  payload.unit_normalized = next;
  return `unit ${current} -> ${next}`;
}

function mutateEndpoint(payload: JsonObject, record: MtaCanonicalRecord, records: MtaCanonicalRecord[]): string | undefined {
  for (const field of ["subject_id", "object_id"] as const) {
    const endpointId = stringPayload(payload, field);
    if (!endpointId) continue;
    const endpoint = records.find((candidate) => candidate.record_id === endpointId);
    if (!endpoint) continue;
    const sibling = records.find(
      (candidate) =>
        candidate.record_id !== endpoint.record_id &&
        candidate.record_kind === endpoint.record_kind &&
        (candidate.source_id === record.source_id || (candidate.source_ids ?? []).includes(record.source_id)),
    );
    if (!sibling) continue;
    payload[field] = sibling.record_id;
    return `${field} ${endpoint.record_id} -> ${sibling.record_id}`;
  }
  return undefined;
}

function mutateLifecycle(payload: JsonObject): string | undefined {
  const current = stringPayload(payload, "lifecycle_phase");
  const text = [stringPayload(payload, "event_kind"), stringPayload(payload, "description"), stringPayload(payload, "date_text")].filter(Boolean).join(" ").toLowerCase();
  if (!current || current === "completed") return undefined;
  if (!/(target|anticipated|planned|expected|schedule|forecast|completion)/u.test(text)) return undefined;
  payload.lifecycle_phase = "completed";
  return `lifecycle_phase ${current} -> completed`;
}

function mutatePeriod(payload: JsonObject): string | undefined {
  const current = stringPayload(payload, "period");
  if (!current) return undefined;
  const match = /\b(20\d{2}|19\d{2})\b/u.exec(current);
  if (!match) return undefined;
  const year = Number(match[1]);
  const next = String(year + 1);
  payload.period = current.replace(match[1]!, next);
  return `period ${current} -> ${payload.period}`;
}

function mutateWrongBlock(row: SeededDefectFixtureRow, record: MtaCanonicalRecord, rootDir: string): boolean {
  const first = record.evidence_refs[0];
  if (!first?.source_id || !first.block_id) return false;
  const blocks = readBlocks(rootDir, first.source_id);
  const sorted = [...blocks].sort((a, b) => a.block_id.localeCompare(b.block_id));
  const currentIndex = sorted.findIndex((block) => block.block_id === first.block_id);
  if (currentIndex === -1) return false;
  for (let offset = 1; offset < sorted.length; offset += 1) {
    const candidate = sorted[(currentIndex + offset) % sorted.length]!;
    if (candidate.raw_text.trim() && candidate.raw_text !== row.evidence[0]?.block_text) {
      row.evidence[0] = {
        source_id: first.source_id,
        block_id: candidate.block_id,
        block_text: candidate.raw_text,
      };
      row.mutation_note = `evidence block ${first.block_id} -> ${candidate.block_id}`;
      return true;
    }
  }
  return false;
}

function readBlocks(rootDir: string, sourceId: string): StagedSourceBlock[] {
  const path = join(rootDir, "raw", "sources", sourceId, "blocks.jsonl");
  if (!existsSync(path)) return [];
  return readJsonl<StagedSourceBlock>(path);
}

function stringPayload(payload: JsonObject, field: string): string | undefined {
  const value = payload[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function writeJsonl(path: string, rows: unknown[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((row) => stableJson(row as JsonValue)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

function clone<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hash(seed: string, group: string, value: string): string {
  return createHash("sha256").update(`${seed}:${group}:${value}`).digest("hex");
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function seededDefectSummary(result: SeededDefectWriteResult, rootDir = repoRoot): string {
  return `Seeded defects: ${result.rows} rows at ${relative(rootDir, result.path)} (${Object.entries(result.counts)
    .map(([key, count]) => `${key}=${count}`)
    .join(", ")}), sha256=${result.sha256}`;
}
