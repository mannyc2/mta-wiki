import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { TranscriptWriter } from "@mta-wiki/core/transcript";
import { embedQuery, type Embedder } from "@mta-wiki/pipeline/sources/embeddings";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import { recordCard, searchSemanticIndex, semanticIndexExists, type SemanticSearchHit } from "@mta-wiki/pipeline/materialize/semantic-index";
import { createMtaTools } from "./ingest-tools.js";
import { createMtaWriterTools } from "./writer-tools.js";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import { assertCanonicalDbSourceRefreshAvailable } from "@mta-wiki/db/canonical-db-source-refresh";
import {
  readResolvedCurrentInterventionFootprint,
  readResolvedInterventionApplications,
  readResolvedInterventionEpisodes,
  readResolvedInterventionPlacements,
  readResolvedInterventionPlacementStates,
} from "@mta-wiki/db/resolved-transit-db";

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
  /** Override the generated resolved read-model DB in tests. */
  resolvedDbPath?: string | undefined;
};

export function createMtaQueryTools(transcript: TranscriptWriter, runId: string, options: QueryToolOptions = {}): AgentTool[] {
  assertCanonicalDbSourceRefreshAvailable({
    operation: "query tool initialization",
  });
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

  const resolvedParameters = Type.Object({
    occurrence_id: Type.Optional(Type.String({ description: "Exact operational occurrence id." })),
    gtfs_route_id: Type.Optional(Type.String({ description: "Exact GTFS route id." })),
    treatment_family: Type.Optional(Type.String({ description: "Exact reviewed treatment family." })),
  });
  const resolvedTool: AgentTool<typeof resolvedParameters> = {
    name: "mta_read_resolved_interventions",
    label: "Read Resolved Interventions",
    description:
      "Read the internal, review-authorized intervention episode/application layer. Applications are exact route-treatment-phase incidence; episode convenience arrays are non-authoritative derived sets. This operator surface includes review and provenance fields.",
    parameters: resolvedParameters,
    executionMode: "parallel",
    execute: async (_toolCallId, params) => {
      const episodes = readResolvedInterventionEpisodes({
        ...(params.occurrence_id ? { occurrenceId: params.occurrence_id } : {}),
        ...(options.resolvedDbPath ? { path: options.resolvedDbPath } : {}),
      });
      const applications = readResolvedInterventionApplications({
        ...(params.occurrence_id ? { occurrenceId: params.occurrence_id } : {}),
        ...(params.gtfs_route_id ? { gtfsRouteId: params.gtfs_route_id } : {}),
        ...(params.treatment_family ? { treatmentFamily: params.treatment_family } : {}),
        ...(options.resolvedDbPath ? { path: options.resolvedDbPath } : {}),
      });
      transcript.write("mta_tool_read_resolved_interventions", {
        occurrenceId: params.occurrence_id,
        gtfsRouteId: params.gtfs_route_id,
        treatmentFamily: params.treatment_family,
        episodeCount: episodes.length,
        applicationCount: applications.length,
      });
      return textResult(JSON.stringify({
        layer: "resolved-intervention-model-v1",
        authority: "exact applications",
        episodes,
        applications,
      }, null, 2), {
        episodeCount: episodes.length,
        applicationCount: applications.length,
      });
    },
  };

  const episodeSearchParameters = Type.Object({
    query: Type.String(),
    max_results: Type.Optional(Type.Number()),
  });
  const searchEpisodesTool: AgentTool<typeof episodeSearchParameters> = {
    name: "search_intervention_episodes",
    label: "Search Resolved Episodes",
    description: "Search the reviewed resolved episode read model. This is not a source-document search.",
    parameters: episodeSearchParameters,
    executionMode: "parallel",
    execute: async (_id, params) => {
      const terms = queryTerms(params.query);
      const episodes = readResolvedInterventionEpisodes({
        ...(options.resolvedDbPath ? { path: options.resolvedDbPath } : {}),
      });
      const results = episodes.filter((row) => {
        const text = JSON.stringify(row).toLowerCase();
        return terms.every((term) => text.includes(term));
      }).slice(0, Math.max(1, params.max_results ?? 8));
      return textResult(JSON.stringify({
        layer: "resolved-intervention-model-v1",
        question_type: "reviewed_episode_resolution",
        results,
      }, null, 2), { resultCount: results.length });
    },
  };
  const episodeGetParameters = Type.Object({ intervention_id: Type.String() });
  const getEpisodeTool: AgentTool<typeof episodeGetParameters> = {
    name: "get_intervention_episode",
    label: "Get Resolved Episode",
    description: "Get one resolved episode and its exact reviewed applications.",
    parameters: episodeGetParameters,
    executionMode: "parallel",
    execute: async (_id, params) => {
      const path = options.resolvedDbPath ? { path: options.resolvedDbPath } : {};
      const episodes = readResolvedInterventionEpisodes({ occurrenceId: params.intervention_id, ...path });
      const applications = readResolvedInterventionApplications({ occurrenceId: params.intervention_id, ...path });
      return textResult(JSON.stringify({
        layer: "resolved-intervention-model-v1", episodes, applications,
      }, null, 2), { episodeCount: episodes.length, applicationCount: applications.length });
    },
  };
  const routeHistoryParameters = Type.Object({ gtfs_route_id: Type.String() });
  const routeHistoryTool: AgentTool<typeof routeHistoryParameters> = {
    name: "list_route_intervention_history",
    label: "List Route Intervention History",
    description: "List exact resolved application history for one GTFS route.",
    parameters: routeHistoryParameters,
    executionMode: "parallel",
    execute: async (_id, params) => {
      const applications = readResolvedInterventionApplications({
        gtfsRouteId: params.gtfs_route_id,
        ...(options.resolvedDbPath ? { path: options.resolvedDbPath } : {}),
      });
      return textResult(JSON.stringify({
        layer: "resolved-intervention-model-v1",
        gtfs_route_id: params.gtfs_route_id,
        applications,
      }, null, 2), { applicationCount: applications.length });
    },
  };
  const placementSearchParameters = Type.Object({
    gtfs_route_id: Type.Optional(Type.String()),
    treatment_family: Type.Optional(Type.String()),
    state: Type.Optional(Type.String()),
    as_of_date: Type.Optional(Type.String()),
  });
  const searchPlacementsTool: AgentTool<typeof placementSearchParameters> = {
    name: "search_intervention_placements",
    label: "Search Resolved Placements",
    description: "Search stable resolved placement identities and optionally their dated state snapshot.",
    parameters: placementSearchParameters,
    executionMode: "parallel",
    execute: async (_id, params) => {
      const path = options.resolvedDbPath ? { path: options.resolvedDbPath } : {};
      const placements = readResolvedInterventionPlacements({
        ...(params.gtfs_route_id ? { gtfsRouteId: params.gtfs_route_id } : {}),
        ...(params.treatment_family ? { treatmentFamily: params.treatment_family } : {}),
        ...path,
      });
      const states = readResolvedInterventionPlacementStates({
        ...(params.state ? { state: params.state } : {}),
        ...(params.as_of_date ? { asOfDate: params.as_of_date } : {}),
        ...path,
      });
      return textResult(JSON.stringify({
        layer: "resolved-intervention-placement-v1", placements, states,
      }, null, 2), { placementCount: placements.length, stateCount: states.length });
    },
  };
  const placementGetParameters = Type.Object({ placement_id: Type.String() });
  const getPlacementTool: AgentTool<typeof placementGetParameters> = {
    name: "get_intervention_placement",
    label: "Get Resolved Placement",
    description: "Get one stable resolved placement plus available dated state and current-footprint rows.",
    parameters: placementGetParameters,
    executionMode: "parallel",
    execute: async (_id, params) => {
      const path = options.resolvedDbPath ? { path: options.resolvedDbPath } : {};
      const placements = readResolvedInterventionPlacements({ placementId: params.placement_id, ...path });
      const states = readResolvedInterventionPlacementStates({ placementId: params.placement_id, ...path });
      const footprint = readResolvedCurrentInterventionFootprint(path);
      return textResult(JSON.stringify({
        layer: "resolved-intervention-placement-v1",
        placements,
        states,
        current_footprint: footprint.filter((row) =>
          (row as Record<string, unknown>).placement_id === params.placement_id
        ),
      }, null, 2), { placementCount: placements.length });
    },
  };
  const stateGetParameters = Type.Object({
    placement_id: Type.String(),
    as_of_date: Type.String(),
  });
  const getStateTool: AgentTool<typeof stateGetParameters> = {
    name: "get_intervention_state_as_of",
    label: "Get Resolved Placement State",
    description: "Read a placement state snapshot for an explicit date; absence means that date was not materialized, never an inferred state.",
    parameters: stateGetParameters,
    executionMode: "parallel",
    execute: async (_id, params) => {
      const states = readResolvedInterventionPlacementStates({
        placementId: params.placement_id,
        asOfDate: params.as_of_date,
        ...(options.resolvedDbPath ? { path: options.resolvedDbPath } : {}),
      });
      return textResult(JSON.stringify({
        layer: "resolved-intervention-placement-state-v1",
        as_of_date: params.as_of_date,
        states,
        instruction: states.length ? "Resolved state snapshot." : "No state snapshot exists for this date; do not infer one.",
      }, null, 2), { stateCount: states.length });
    },
  };

  const ingestReadTools = createMtaTools(transcript, runId).filter((tool) => READONLY_INGEST_TOOLS.has(tool.name));
  const writerReadTools = createMtaWriterTools(transcript, runId).filter((tool) => READONLY_WRITER_TOOLS.has(tool.name));

  return [
    semanticSearchTool,
    resolvedTool,
    searchEpisodesTool,
    getEpisodeTool,
    routeHistoryTool,
    searchPlacementsTool,
    getPlacementTool,
    getStateTool,
    ...ingestReadTools,
    ...writerReadTools,
  ];
}
