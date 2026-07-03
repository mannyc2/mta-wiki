import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  identityPairKey,
  readIdentityDoNotMergeOverrides,
  readIdentityOverrides,
  type GlobalMtaRecordKind,
} from "@mta-wiki/db/identity";

// Shared write-side machinery for data/identity-overrides/. Used by both the
// human-reviewed identity-review apply path and the canonicalizer auto-apply path.

export const GLOBAL_KINDS: GlobalMtaRecordKind[] = ["entity", "project", "corridor", "route"];

export type AliasAddition = {
  kind: GlobalMtaRecordKind;
  alias: string;
  target: string;
};

export type DoNotMergeAddition = {
  kind: GlobalMtaRecordKind;
  record_ids: [string, string];
  reason: string;
  source_decision?: string | undefined;
  reviewed_at?: string | undefined;
};

export function mergesPath() {
  return join(repoRoot, "data", "identity-overrides", "merges.json");
}

export function doNotMergePath() {
  return join(repoRoot, "data", "identity-overrides", "do-not-merge.json");
}

export function writeJsonFile(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function sortedAliasesWithAdditions(additions: AliasAddition[]) {
  const existing = readIdentityOverrides();
  const aliases: Partial<Record<GlobalMtaRecordKind, Record<string, string>>> = {};

  for (const kind of GLOBAL_KINDS) {
    const merged = { ...(existing.aliases?.[kind] ?? {}) };
    for (const addition of additions.filter((entry) => entry.kind === kind)) {
      merged[addition.alias] = addition.target;
    }
    const entries = Object.entries(merged).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length > 0) aliases[kind] = Object.fromEntries(entries);
  }

  return { version: 1, aliases };
}

export function sortedDoNotMergeWithAdditions(additions: DoNotMergeAddition[]) {
  const existing = readIdentityDoNotMergeOverrides();
  const pairs: Partial<
    Record<GlobalMtaRecordKind, Array<{ record_ids: [string, string]; reason?: string; source_decision?: string; reviewed_at?: string }>>
  > = {};

  for (const kind of GLOBAL_KINDS) {
    const byPair = new Map<string, { record_ids: [string, string]; reason?: string; source_decision?: string; reviewed_at?: string }>();
    for (const entry of existing.pairs?.[kind] ?? []) {
      const ids = entry.record_ids;
      if (!Array.isArray(ids) || ids.length !== 2 || typeof ids[0] !== "string" || typeof ids[1] !== "string") continue;
      const sortedIds = [ids[0], ids[1]].sort() as [string, string];
      byPair.set(identityPairKey(sortedIds[0], sortedIds[1]), {
        record_ids: sortedIds,
        ...(entry.reason ? { reason: entry.reason } : {}),
        ...(entry.source_decision ? { source_decision: entry.source_decision } : {}),
        ...(entry.reviewed_at ? { reviewed_at: entry.reviewed_at } : {}),
      });
    }
    for (const addition of additions.filter((entry) => entry.kind === kind)) {
      const sortedIds = [...addition.record_ids].sort() as [string, string];
      byPair.set(identityPairKey(sortedIds[0], sortedIds[1]), {
        record_ids: sortedIds,
        reason: addition.reason,
        ...(addition.source_decision ? { source_decision: addition.source_decision } : {}),
        ...(addition.reviewed_at ? { reviewed_at: addition.reviewed_at } : {}),
      });
    }
    const entries = [...byPair.values()].sort((a, b) => a.record_ids[0].localeCompare(b.record_ids[0]) || a.record_ids[1].localeCompare(b.record_ids[1]));
    if (entries.length > 0) pairs[kind] = entries;
  }

  return { version: 1, pairs };
}

export function existingDoNotMergePair(kind: GlobalMtaRecordKind, leftRecordId: string, rightRecordId: string) {
  const target = identityPairKey(leftRecordId, rightRecordId);
  return Boolean(
    readIdentityDoNotMergeOverrides().pairs?.[kind]?.some((entry) => {
      const ids = entry.record_ids;
      return Array.isArray(ids) && ids.length === 2 && identityPairKey(ids[0]!, ids[1]!) === target;
    }),
  );
}
