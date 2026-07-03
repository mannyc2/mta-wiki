import { readConfig } from "@mta-wiki/core/config";

/**
 * An embedder turns texts into dense vectors. The default implementation talks to a local
 * OpenAI-compatible `/v1/embeddings` endpoint (the embeddings vLLM server), but callers can inject
 * a deterministic embedder in tests so no server is required.
 */
export type Embedder = (texts: string[]) => Promise<Float32Array[]>;

export type EmbedOptions = {
  batchSize?: number | undefined;
  onBatch?: ((done: number, total: number) => void) | undefined;
};

const DEFAULT_BASE_URL = "http://localhost:8001/v1";
const DEFAULT_MODEL = "embeddings";
const DEFAULT_BATCH_SIZE = 64;

export type EmbeddingsEndpoint = {
  baseUrl: string;
  model: string;
  apiKey: string | undefined;
};

/**
 * Resolve the embeddings endpoint from the optional `embeddings` profile in harness.config.json,
 * overridable by env vars so local differences stay out of the committed config.
 */
export function embeddingsEndpoint(): EmbeddingsEndpoint {
  const profile = readConfig().profiles.embeddings;
  const baseUrl = (process.env.EMBEDDINGS_BASE_URL ?? profile?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/u, "");
  const model = process.env.EMBEDDINGS_MODEL ?? profile?.model ?? DEFAULT_MODEL;
  const apiKeyEnv = profile?.apiKeyEnv ?? "EMBEDDINGS_API_KEY";
  const apiKey = process.env[apiKeyEnv] ?? process.env.EMBEDDINGS_API_KEY;
  return { baseUrl, model, apiKey };
}

type EmbeddingsResponse = {
  data?: Array<{ index?: number; embedding?: number[] }> | undefined;
};

/**
 * Embed a list of texts via the configured OpenAI-compatible endpoint, batching requests so large
 * index builds stay within a single server's batch limits. Output order matches input order.
 */
export async function embedTexts(texts: string[], options: EmbedOptions = {}): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  const { baseUrl, model, apiKey } = embeddingsEndpoint();
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const vectors: Float32Array[] = [];

  for (let offset = 0; offset < texts.length; offset += batchSize) {
    const batch = texts.slice(offset, offset + batchSize);
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, input: batch }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Embeddings request failed (${response.status} ${response.statusText}) at ${baseUrl}/embeddings: ${detail}`);
    }

    const json = (await response.json()) as EmbeddingsResponse;
    const data = json.data ?? [];
    if (data.length !== batch.length) {
      throw new Error(`Embeddings endpoint returned ${data.length} vectors for ${batch.length} inputs`);
    }

    const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const item of ordered) {
      if (!item.embedding) throw new Error("Embeddings endpoint returned an entry without an embedding");
      vectors.push(Float32Array.from(item.embedding));
    }

    options.onBatch?.(Math.min(offset + batch.length, texts.length), texts.length);
  }

  return vectors;
}

/** Embed a single query string and return its vector. */
export async function embedQuery(text: string, embed: Embedder = embedTexts): Promise<Float32Array> {
  const [vector] = await embed([text]);
  if (!vector) throw new Error("Embeddings endpoint returned no vector for query");
  return vector;
}
