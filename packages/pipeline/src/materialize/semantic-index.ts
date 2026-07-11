import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { embedTexts, embeddingsEndpoint, type Embedder } from "@mta-wiki/pipeline/sources/embeddings";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import { stableHash } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";

const INDEX_DIR = join(repoRoot, "data", "index");
const VECTORS_PATH = join(INDEX_DIR, "record-embeddings.f32");
const MANIFEST_PATH = join(INDEX_DIR, "record-embeddings.manifest.json");

const MAX_CARD_CHARS = 6000;

export type SemanticIndexRow = {
  record_id: string;
  record_kind: string;
  source_ids: string[];
  card_sha256: string;
};

export type SemanticIndexManifest = {
  model: string;
  dims: number;
  count: number;
  generated_at: string;
  rows: SemanticIndexRow[];
};

export type SemanticSearchHit = {
  record_id: string;
  record_kind: string;
  score: number;
};

export type BuildSemanticIndexOptions = {
  embed?: Embedder | undefined;
  rebuild?: boolean | undefined;
  generatedAt?: string | undefined;
  records?: MtaCanonicalRecord[] | undefined;
  onProgress?: ((done: number, total: number) => void) | undefined;
};

export type BuildSemanticIndexResult = {
  total: number;
  embedded: number;
  reused: number;
  dims: number;
  model: string;
  vectorsPath: string;
  manifestPath: string;
};

function valueToText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join("; ");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, entry]) => `${key}=${valueToText(entry)}`)
      .filter((entry) => !entry.endsWith("="))
      .join(", ");
  }
  return String(value);
}

/**
 * Build the embeddable text for a record: its name, kind, structured payload, raw source text, and
 * any verbatim evidence quotes. This is what semantic search matches against.
 */
export function recordCard(record: MtaCanonicalRecord): string {
  const parts: string[] = [record.display_name, `kind: ${record.record_kind}`];

  for (const [key, value] of Object.entries(record.payload ?? {})) {
    const text = valueToText(value);
    if (text) parts.push(`${key}: ${text}`);
  }

  if (record.raw_text) parts.push(record.raw_text);

  const quotes = (record.evidence_refs ?? [])
    .map((ref) => ref.source_quote)
    .filter((quote): quote is string => Boolean(quote));
  if (quotes.length > 0) parts.push(quotes.join("\n"));

  return parts.join("\n").slice(0, MAX_CARD_CHARS);
}

function cardHash(card: string): string {
  return stableHash(card);
}

function recordSourceIds(record: MtaCanonicalRecord): string[] {
  return record.source_ids && record.source_ids.length > 0 ? record.source_ids : [record.source_id];
}

function packVectors(vectors: Float32Array[], dims: number): Buffer {
  const flat = new Float32Array(vectors.length * dims);
  vectors.forEach((vector, index) => flat.set(vector, index * dims));
  return Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength);
}

function readManifest(): SemanticIndexManifest | undefined {
  if (!existsSync(MANIFEST_PATH)) return undefined;
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as SemanticIndexManifest;
}

function readVectors(manifest: SemanticIndexManifest): Float32Array[] {
  if (!existsSync(VECTORS_PATH)) return [];
  const raw = readFileSync(VECTORS_PATH);
  const copy = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const flat = new Float32Array(copy);
  const vectors: Float32Array[] = [];
  for (let index = 0; index < manifest.count; index += 1) {
    vectors.push(flat.subarray(index * manifest.dims, (index + 1) * manifest.dims));
  }
  return vectors;
}

/**
 * Embed every canonical record card into `data/index/`, reusing prior vectors whose card content is
 * unchanged so re-indexing after a materialize only re-embeds touched records.
 */
export async function buildSemanticIndex(options: BuildSemanticIndexOptions = {}): Promise<BuildSemanticIndexResult> {
  const embed = options.embed ?? embedTexts;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const records = options.records ?? readCanonicalRecords();
  const model = embeddingsEndpoint().model;

  const priorManifest = options.rebuild ? undefined : readManifest();
  const priorVectors = priorManifest ? readVectors(priorManifest) : [];
  const priorByRecord = new Map<string, { hash: string; vector: Float32Array }>();
  if (priorManifest) {
    priorManifest.rows.forEach((row, index) => {
      const vector = priorVectors[index];
      if (vector) priorByRecord.set(row.record_id, { hash: row.card_sha256, vector });
    });
  }

  type Pending = { record: MtaCanonicalRecord; hash: string; card: string; vector?: Float32Array | undefined };
  const pending: Pending[] = records.map((record) => {
    const card = recordCard(record);
    const hash = cardHash(card);
    const prior = priorByRecord.get(record.record_id);
    const reusable = prior && prior.hash === hash && (!priorManifest || prior.vector.length === priorManifest.dims);
    return { record, hash, card, vector: reusable ? prior?.vector : undefined };
  });

  const toEmbed = pending.filter((entry) => !entry.vector);
  if (toEmbed.length > 0) {
    const fresh = await embed(toEmbed.map((entry) => entry.card));
    if (fresh.length !== toEmbed.length) {
      throw new Error(`Embedder returned ${fresh.length} vectors for ${toEmbed.length} cards`);
    }
    toEmbed.forEach((entry, index) => {
      entry.vector = fresh[index];
    });
    options.onProgress?.(toEmbed.length, toEmbed.length);
  }

  const vectors = pending.map((entry) => entry.vector as Float32Array);
  const dims = vectors[0]?.length ?? priorManifest?.dims ?? 0;
  for (const vector of vectors) {
    if (vector.length !== dims) {
      throw new Error(`Inconsistent embedding dimensions: expected ${dims}, got ${vector.length}`);
    }
  }

  const manifest: SemanticIndexManifest = {
    model,
    dims,
    count: pending.length,
    generated_at: generatedAt,
    rows: pending.map((entry) => ({
      record_id: entry.record.record_id,
      record_kind: entry.record.record_kind,
      source_ids: recordSourceIds(entry.record),
      card_sha256: entry.hash,
    })),
  };

  mkdirSync(INDEX_DIR, { recursive: true });
  writeFileSync(VECTORS_PATH, packVectors(vectors, dims));
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    total: pending.length,
    embedded: toEmbed.length,
    reused: pending.length - toEmbed.length,
    dims,
    model,
    vectorsPath: relative(repoRoot, VECTORS_PATH),
    manifestPath: relative(repoRoot, MANIFEST_PATH),
  };
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type SemanticSearchOptions = {
  maxResults?: number | undefined;
  recordKind?: string | undefined;
};

/** Cosine top-k over the cached record index. Throws a clear error if the index is missing. */
export function searchSemanticIndex(queryVector: Float32Array, options: SemanticSearchOptions = {}): SemanticSearchHit[] {
  const manifest = readManifest();
  if (!manifest || !existsSync(VECTORS_PATH)) {
    throw new Error("Semantic index not found. Run `bun run build-index` first (requires the embeddings server).");
  }
  if (queryVector.length !== manifest.dims) {
    throw new Error(`Query embedding has ${queryVector.length} dims but the index has ${manifest.dims}. Rebuild the index with the same model.`);
  }

  const vectors = readVectors(manifest);
  const maxResults = Math.max(1, options.maxResults ?? 8);

  const scored: SemanticSearchHit[] = [];
  manifest.rows.forEach((row, index) => {
    if (options.recordKind && row.record_kind !== options.recordKind) return;
    const vector = vectors[index];
    if (!vector) return;
    scored.push({ record_id: row.record_id, record_kind: row.record_kind, score: cosineSimilarity(queryVector, vector) });
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

export function semanticIndexExists(): boolean {
  return existsSync(MANIFEST_PATH) && existsSync(VECTORS_PATH);
}
