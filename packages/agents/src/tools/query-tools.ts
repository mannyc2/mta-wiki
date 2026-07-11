import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { TranscriptWriter } from "@mta-wiki/core/transcript";
import { embedQuery, type Embedder } from "@mta-wiki/pipeline/sources/embeddings";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import { recordCard, searchSemanticIndex, semanticIndexExists, type SemanticSearchHit } from "@mta-wiki/pipeline/materialize/semantic-index";
import { createMtaTools } from "./ingest-tools.js";
import { createMtaWriterTools } from "./writer-tools.js";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";

function textResult(text: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "on", "and", "or", "for", "is", "are", "was", "were", "did", "do", "does",
  "what", "when", "where", "which", "who", "whom", "how", "many", "much", "that", "this", "with", "at", "by", "from",
  "as", "it", "its", "be", "been", "has", "have", "had", "any", "about",
]);

function queryTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/[^a-z0-9]+/u).filter((term) => term.length >= 2 && !STOPWORDS.has(term)))];
}

/**
 * Cross-corpus keyword search over canonical record cards. The fallback when the embeddings server
 * or vector index is unavailable — needs nothing but the canonical records on disk.
 */
export function lexicalSearchRecords(
  query: string,
  records: MtaCanonicalRecord[],
  options: { maxResults?: number | undefined; recordKind?: string | undefined } = {},
): SemanticSearchHit[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const maxResults = Math.max(1, options.maxResults ?? 8);
  const scored: SemanticSearchHit[] = [];

  for (const record of records) {
    if (options.recordKind && record.record_kind !== options.recordKind) continue;
    const card = recordCard(record).toLowerCase();
    const name = record.display_name.toLowerCase();

    let matched = 0;
    let bonus = 0;
    for (const term of terms) {
      if (!card.includes(term)) continue;
      matched += 1;
      if (name.includes(term)) bonus += 0.5;
    }

    if (matched === 0) continue;
    scored.push({
      record_id: record.record_id,
      record_kind: record.record_kind,
      score: Number(((matched + bonus) / terms.length).toFixed(4)),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

// Read-only tools the ask agent reuses, by name, from the ingest and writer tool factories. No
// submit/write/flag tools are exposed — the ask agent never mutates canonical data or wiki pages.
const READONLY_INGEST_TOOLS = new Set([
  "mta_read_source",
  "mta_search_source",
  "mta_read_evidence",
  "mta_resolve_record",
  "mta_find_relation_candidates",
  "mta_read_ontology_guide",
]);

const READONLY_WRITER_TOOLS = new Set(["mta_list_records", "mta_read_record", "mta_list_wiki_pages", "mta_read_wiki_page"]);

export type QueryToolOptions = {
  /** Inject a deterministic embedder in tests so no embeddings server is required. */
  embed?: Embedder | undefined;
  /** Inject a fixture corpus in tests without swapping the live canonical DB. */
  records?: MtaCanonicalRecord[] | undefined;
};

export function createMtaQueryTools(transcript: TranscriptWriter, runId: string, options: QueryToolOptions = {}): AgentTool[] {
  const semanticSearchParameters = Type.Object({
    query: Type.String({ description: "Natural-language question or topic to find supporting canonical records for." }),
    max_results: Type.Optional(Type.Number({ description: "Number of records to return. Defaults to 8." })),
    record_kind: Type.Optional(
      Type.String({ description: "Optional filter, e.g. route, project, corridor, entity, event, claim, metric_claim, relation, treatment_component, source." }),
    ),
  });

  const semanticSearchTool: AgentTool<typeof semanticSearchParameters> = {
    name: "mta_semantic_search",
    label: "Search Records",
    description:
      "Find canonical records relevant to a query across the whole corpus. Uses vector similarity when the semantic index is available, and transparently falls back to cross-corpus keyword matching otherwise. Returns each record's evidence refs (source_id/block_id) so you can drill into source blocks for verbatim quotes.",
    parameters: semanticSearchParameters,
    executionMode: "parallel",
    execute: async (_toolCallId, params) => {
      const maxResults = params.max_results ?? 8;
      const records = options.records ?? readCanonicalRecords();

      let mode: "semantic" | "lexical" = "semantic";
      let hits: SemanticSearchHit[];
      try {
        if (!semanticIndexExists()) throw new Error("semantic index not built");
        const queryVector = await embedQuery(params.query, options.embed);
        hits = searchSemanticIndex(queryVector, { maxResults, recordKind: params.record_kind });
      } catch (error) {
        mode = "lexical";
        hits = lexicalSearchRecords(params.query, records, { maxResults, recordKind: params.record_kind });
        transcript.write("mta_tool_semantic_search_fallback", {
          reason: error instanceof Error ? error.message : String(error),
        });
      }

      const recordsById = new Map(records.map((record) => [record.record_id, record]));
      const results = hits.map((hit) => {
        const record = recordsById.get(hit.record_id);
        return {
          record_id: hit.record_id,
          record_kind: hit.record_kind,
          score: Number(hit.score.toFixed(4)),
          display_name: record?.display_name,
          source_ids: record ? (record.source_ids && record.source_ids.length > 0 ? record.source_ids : [record.source_id]) : [],
          payload_keys: record ? Object.keys(record.payload ?? {}).sort() : [],
          evidence_refs: (record?.evidence_refs ?? []).map((ref) => ({
            source_id: ref.source_id,
            evidence_id: ref.evidence_id,
            block_id: ref.block_id,
            page_number: ref.page_number,
            role: ref.role,
            source_quote: ref.source_quote,
          })),
        };
      });

      transcript.write("mta_tool_semantic_search", {
        queryBytes: Buffer.byteLength(params.query),
        recordKind: params.record_kind,
        resultCount: results.length,
        retrievalMode: mode,
      });

      const instruction =
        mode === "lexical"
          ? "Retrieval mode: lexical (keyword) fallback — the semantic index/embeddings server was unavailable, so these are exact keyword matches. Try alternate phrasings or synonyms if results look thin, and treat ranking as approximate. Use mta_read_record to read full records and mta_read_evidence/mta_read_source to confirm verbatim quotes before citing. Cite source_id#block_id exactly as shown."
          : "Retrieval mode: semantic. Use mta_read_record to read full records and mta_read_evidence/mta_read_source to confirm verbatim quotes before citing. Cite source_id#block_id; prefer the block ids exactly as shown.";

      return textResult(JSON.stringify({ retrieval_mode: mode, results, instruction }, null, 2), {
        resultCount: results.length,
        retrievalMode: mode,
      });
    },
  };

  const ingestReadTools = createMtaTools(transcript, runId).filter((tool) => READONLY_INGEST_TOOLS.has(tool.name));
  const writerReadTools = createMtaWriterTools(transcript, runId).filter((tool) => READONLY_WRITER_TOOLS.has(tool.name));

  return [semanticSearchTool, ...ingestReadTools, ...writerReadTools];
}
