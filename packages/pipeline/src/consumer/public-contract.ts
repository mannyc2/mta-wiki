export const PUBLIC_PACK_CONTRACT_ID = "resolved-transit-public-pack-v1" as const;

export type PublicSourceRef = {
  source_key: string;
};

export type PublicSource = {
  schema_version: 1;
  source_key: string;
  title: string;
  publisher: string | null;
  date: string | null;
  url: string | null;
  url_status: "source_provided" | "accepted_override" | "unavailable";
};

const forbiddenKey = /(?:^|_)(?:record_id|reviewer|review|decision|fingerprint|hash|sha256|gap_id|queue|validation_code|source_path|file_path)(?:$|_)/iu;
const internalId = /^(?:application|placement|candidate|transition|assertion|review|decision):/u;
const repositoryPath = /(?:^|\/)(?:data|raw|wiki|packages|docs)\//u;
const hashValue = /^(?:sha256:)?[a-f0-9]{32,64}$/iu;

export function assertPublicSafe(value: unknown, path = "public pack"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPublicSafe(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" &&
        (internalId.test(value) || repositoryPath.test(value) ||
         (hashValue.test(value) && !path.endsWith(".intervention_id")))) {
      throw new Error(`${path}: internal value is forbidden`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKey.test(key) || key.endsWith("_record_id")) {
      throw new Error(`${path}.${key}: operator-only field is forbidden`);
    }
    assertPublicSafe(entry, `${path}.${key}`);
  }
}

export function assertSlug(value: string, path: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
    throw new Error(`${path} must be a lowercase hyphenated public key`);
  }
}

export function parsePublicSource(value: unknown): PublicSource {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("public source must be an object");
  }
  const row = value as Record<string, unknown>;
  const fields = ["date", "publisher", "schema_version", "source_key", "title", "url", "url_status"];
  if (Object.keys(row).sort().join("|") !== fields.sort().join("|")) {
    throw new Error("public source requires exact fields");
  }
  if (row.schema_version !== 1 || typeof row.source_key !== "string" ||
      typeof row.title !== "string" || !row.title.trim() ||
      !["source_provided", "accepted_override", "unavailable"].includes(String(row.url_status))) {
    throw new Error("public source has invalid fields");
  }
  assertSlug(row.source_key, "source_key");
  const url = row.url === null ? null : String(row.url);
  const status = row.url_status as PublicSource["url_status"];
  if ((status === "unavailable") !== (url === null) ||
      (url !== null && !/^https:\/\/[^/\s]+(?:\/.*)?$/u.test(url))) {
    throw new Error("public source URL/status is inconsistent");
  }
  const result: PublicSource = {
    schema_version: 1,
    source_key: row.source_key,
    title: row.title,
    publisher: row.publisher === null ? null : String(row.publisher),
    date: row.date === null ? null : String(row.date),
    url,
    url_status: status,
  };
  assertPublicSafe(result);
  return result;
}
