import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";

export const OPERATIONAL_OCCURRENCE_IDENTITY_SCHEMA_VERSION = 1 as const;

export type OperationalOccurrenceIdentityEntry = {
  schema_version: typeof OPERATIONAL_OCCURRENCE_IDENTITY_SCHEMA_VERSION;
  occurrence_id: string;
  founding_key: string;
  founding_event_record_ids: string[];
  resolution_cluster_id: string | null;
  aliases: string[];
  tombstoned: boolean;
  decision_id: string | null;
  issued_at: string;
};

const identityFields = new Set([
  "aliases",
  "decision_id",
  "founding_event_record_ids",
  "founding_key",
  "issued_at",
  "occurrence_id",
  "resolution_cluster_id",
  "schema_version",
  "tombstoned",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return requiredString(value, path);
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const values = value.map((entry, index) => requiredString(entry, `${path}[${index}]`));
  if (new Set(values).size !== values.length) throw new Error(`${path} must not contain duplicates`);
  return values;
}

export function parseOperationalOccurrenceIdentityEntry(
  value: unknown,
  path = "operational occurrence identity",
): OperationalOccurrenceIdentityEntry {
  if (!isObject(value)) throw new Error(`${path} must be an object`);
  const extras = Object.keys(value).filter((field) => !identityFields.has(field)).sort();
  if (extras.length > 0) throw new Error(`${path} has unknown field(s): ${extras.join(", ")}`);
  if (value.schema_version !== OPERATIONAL_OCCURRENCE_IDENTITY_SCHEMA_VERSION) {
    throw new Error(`${path}.schema_version must be ${OPERATIONAL_OCCURRENCE_IDENTITY_SCHEMA_VERSION}`);
  }
  if (typeof value.tombstoned !== "boolean") throw new Error(`${path}.tombstoned must be boolean`);
  const foundingKey = requiredString(value.founding_key, `${path}.founding_key`);
  if (!/^(?:event|cluster):[^\s]+$/u.test(foundingKey)) {
    throw new Error(`${path}.founding_key must be an event:<record-id> or cluster:<decision-id> key`);
  }
  const foundingEventRecordIds = stringArray(value.founding_event_record_ids, `${path}.founding_event_record_ids`).sort();
  if (foundingEventRecordIds.length === 0) throw new Error(`${path}.founding_event_record_ids must not be empty`);
  const issuedAt = requiredString(value.issued_at, `${path}.issued_at`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(issuedAt) || Number.isNaN(Date.parse(issuedAt))) {
    throw new Error(`${path}.issued_at must be an ISO-8601 UTC timestamp`);
  }
  return {
    schema_version: OPERATIONAL_OCCURRENCE_IDENTITY_SCHEMA_VERSION,
    occurrence_id: requiredString(value.occurrence_id, `${path}.occurrence_id`),
    founding_key: foundingKey,
    founding_event_record_ids: foundingEventRecordIds,
    resolution_cluster_id: nullableString(value.resolution_cluster_id, `${path}.resolution_cluster_id`),
    aliases: stringArray(value.aliases, `${path}.aliases`).sort(),
    tombstoned: value.tombstoned,
    decision_id: nullableString(value.decision_id, `${path}.decision_id`),
    issued_at: issuedAt,
  };
}

export function assertOperationalOccurrenceIdentityRegistry(
  entries: readonly OperationalOccurrenceIdentityEntry[],
): OperationalOccurrenceIdentityEntry[] {
  const parsed = entries.map((entry, index) =>
    parseOperationalOccurrenceIdentityEntry(entry, `operational occurrence identity[${index}]`),
  );
  const occurrenceIds = new Set<string>();
  const foundingKeys = new Set<string>();
  const aliasOwner = new Map<string, string>();
  for (const entry of parsed) {
    if (occurrenceIds.has(entry.occurrence_id)) throw new Error(`duplicate occurrence identity ${entry.occurrence_id}`);
    occurrenceIds.add(entry.occurrence_id);
    if (foundingKeys.has(entry.founding_key)) throw new Error(`duplicate occurrence founding key ${entry.founding_key}`);
    foundingKeys.add(entry.founding_key);
    if (entry.aliases.includes(entry.occurrence_id)) throw new Error(`occurrence identity ${entry.occurrence_id} aliases itself`);
    for (const alias of entry.aliases) {
      const owner = aliasOwner.get(alias);
      if (owner) throw new Error(`occurrence alias ${alias} is owned by both ${owner} and ${entry.occurrence_id}`);
      aliasOwner.set(alias, entry.occurrence_id);
    }
  }
  for (const [alias, owner] of aliasOwner) {
    if (occurrenceIds.has(alias)) throw new Error(`occurrence alias ${alias} conflicts with active/tombstoned identity ${owner}`);
  }
  return parsed.sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));
}

export function operationalOccurrenceIdentityRegistryPath(rootDir = repoRoot): string {
  return join(rootDir, "data", "operational-occurrence-identities", "registry.jsonl");
}

export function loadOperationalOccurrenceIdentityRegistry(
  path = operationalOccurrenceIdentityRegistryPath(),
): OperationalOccurrenceIdentityEntry[] {
  if (!existsSync(path)) return [];
  const entries = readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(`${path}:${index + 1}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      return parseOperationalOccurrenceIdentityEntry(parsed, `${path}:${index + 1}`);
    });
  return assertOperationalOccurrenceIdentityRegistry(entries);
}

export function deterministicOperationalOccurrenceId(foundingKey: string): string {
  // The digest input is intentionally only the immutable founding event or
  // accepted cluster-decision key. Enrichment fields must never participate.
  return `occurrence:${createHash("sha256").update(foundingKey).digest("hex").slice(0, 24)}`;
}

export function newOperationalOccurrenceIdentityEntry(input: {
  foundingKey: string;
  foundingEventRecordIds: readonly string[];
  resolutionClusterId?: string | null | undefined;
  decisionId?: string | null | undefined;
  issuedAt: string;
}): OperationalOccurrenceIdentityEntry {
  return parseOperationalOccurrenceIdentityEntry({
    schema_version: OPERATIONAL_OCCURRENCE_IDENTITY_SCHEMA_VERSION,
    occurrence_id: deterministicOperationalOccurrenceId(input.foundingKey),
    founding_key: input.foundingKey,
    founding_event_record_ids: [...input.foundingEventRecordIds].sort(),
    resolution_cluster_id: input.resolutionClusterId ?? null,
    aliases: [],
    tombstoned: false,
    decision_id: input.decisionId ?? null,
    issued_at: input.issuedAt,
  });
}

export function resolveOperationalOccurrenceIdentity(
  foundingKey: string,
  entries: readonly OperationalOccurrenceIdentityEntry[],
): OperationalOccurrenceIdentityEntry {
  const registry = assertOperationalOccurrenceIdentityRegistry(entries);
  const entry = registry.find((candidate) => candidate.founding_key === foundingKey);
  if (!entry) throw new Error(`missing persistent operational-occurrence identity for ${foundingKey}`);
  if (entry.tombstoned) throw new Error(`operational-occurrence identity ${entry.occurrence_id} is tombstoned`);
  return entry;
}
