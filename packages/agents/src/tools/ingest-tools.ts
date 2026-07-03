import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { repoRoot } from "@mta-wiki/core/paths";
import type { TranscriptWriter } from "@mta-wiki/core/transcript";
import {
  agentVisibleBlock,
  agentVisibleMetadata,
  ingestVisibleBlocks,
  minimalEvidenceRef,
  sourceWindow,
} from "@mta-wiki/pipeline/sources/source-packet";
import { readConfig } from "@mta-wiki/core/config";
import { isGlobalRecordKind, resolveIdentityCandidates } from "@mta-wiki/db/identity";
import { allKindSpecs, kindSpec, submitToolKinds } from "@mta-wiki/db/kind-registry";
import { readCanonicalRecordById, readCanonicalRecords, readCanonicalRecordsByKind } from "@mta-wiki/pipeline/materialize/materialize";
import { normalizedCompanionsAdded, ontologyGuide, ontologyGuideMarkdown } from "@mta-wiki/pipeline/ontology/ontology";
import { payloadSchemaForKind, validatePayloadSchema } from "@mta-wiki/db/payload-schemas";
import { findRelationCandidates, possibleRelationCandidatesForSource } from "@mta-wiki/pipeline/records/relations";
import { sourceBlockById } from "@mta-wiki/pipeline/sources/source-prep";
import { appendSubmission, readSubmissionEntries } from "@mta-wiki/pipeline/records/submissions";
import type { JsonObject, MtaObservationKind, MtaSubmitObservationInput } from "@mta-wiki/db/types";

function textResult(text: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

export function createMtaTools(transcript: TranscriptWriter, runId: string): AgentTool[] {
  const resolvedKinds = new Set<string>();

  const readSourceParameters = Type.Object({
    source_id: Type.String(),
    page_number: Type.Optional(Type.Number()),
    start_block: Type.Optional(Type.Number({ description: "1-based block offset within the selected source/page window. Use next_start_block from prior results." })),
    max_blocks: Type.Optional(Type.Number()),
    format: Type.Optional(Type.String({ description: "Use markdown for page-shaped source text, or json for structured block objects. Defaults to markdown." })),
  });

  const searchSourceParameters = Type.Object({
    source_id: Type.String(),
    query: Type.String(),
    max_results: Type.Optional(Type.Number()),
  });

  const readEvidenceParameters = Type.Object({
    source_id: Type.String(),
    block_id: Type.String({ description: "A visible source block id or same-page range like p005_c0011..p005_c0020." }),
    context_blocks: Type.Optional(Type.Number({ description: "Neighbor blocks before and after the requested block to return for citation context." })),
  });

  const resolveRecordParameters = Type.Object({
    record_kind: Type.String({ description: "One of entity, project, corridor, or route." }),
    query: Type.String({ description: "Name, local id, acronym, route label, or corridor/project label to resolve against existing canonical records." }),
    max_results: Type.Optional(Type.Number()),
  });

  const findRelationCandidatesParameters = Type.Object({
    source_id: Type.Optional(Type.String({ description: "Limit results and advisory candidates to one source id." })),
    record_id: Type.Optional(Type.String({ description: "Canonical record id for incoming/outgoing relation lookup." })),
    subject_local_observation_id: Type.Optional(Type.String({ description: "Local id for the relation subject endpoint." })),
    object_local_observation_id: Type.Optional(Type.String({ description: "Local id for the relation object endpoint." })),
    subject_id: Type.Optional(Type.String({ description: "Canonical record id for the relation subject endpoint." })),
    object_id: Type.Optional(Type.String({ description: "Canonical record id for the relation object endpoint." })),
    relation_kind: Type.Optional(Type.String({ description: "Relation kind to match; common aliases are normalized for matching." })),
    max_results: Type.Optional(Type.Number()),
  });

  const readOntologyGuideParameters = Type.Object({
    observation_kind: Type.Optional(Type.String({ description: "Optional observation kind to filter guidance, e.g. metric_claim, route, project, event." })),
    format: Type.Optional(Type.String({ description: "Use markdown for compact guidance or json for structured policy. Defaults to markdown." })),
  });

  const evidenceRefsParameter = Type.Optional(
    Type.Array(
      Type.Object({
        source_id: Type.String(),
        evidence_id: Type.Optional(Type.String({ description: "Stable source_id#block_id handle returned by source tools." })),
        page_number: Type.Optional(Type.Number()),
        block_id: Type.Optional(Type.String({ description: "A visible source block id or same-page range like p005_c0011..p005_c0020." })),
        block_range: Type.Optional(Type.String({ description: "Optional same-page range like p005_c0011..p005_c0020 when one block is not enough." })),
        role: Type.Optional(Type.String()),
        source_quote: Type.Optional(Type.String({ description: "Optional short exact quote from the cited source block." })),
      }),
    ),
  );

  const submitObservationParameters = Type.Object({
    source_id: Type.String(),
    observation_kind: Type.String({
      description: `Only for kinds without a dedicated submit tool. Use mta_submit_<kind> for: ${submitToolKinds().join(", ")}.`,
    }),
    local_observation_id: Type.String(),
    justification: Type.String({
      description: "Why this observation does not fit any typed submit tool or known observation kind.",
    }),
    target_record_id: Type.Optional(Type.String({ description: "Existing canonical record_id to update when this observation is about a known entity/project/corridor/route." })),
    create_new: Type.Optional(Type.Boolean({ description: "Set true only after mta_resolve_record returns no plausible existing entity/project/corridor/route." })),
    label: Type.Optional(Type.String()),
    raw_text: Type.Optional(Type.String()),
    payload: Type.Optional(Type.Any()),
    evidence_refs: evidenceRefsParameter,
  });

  const readSourceTool: AgentTool<typeof readSourceParameters> = {
    name: "mta_read_source",
    label: "Read MTA Source",
    description: "Read a paged window of staged source evidence blocks. Use when the inline source packet is incomplete or you need another page.",
    parameters: readSourceParameters,
    executionMode: "parallel",
    execute: async (_toolCallId, params) => {
      const window = sourceWindow(params.source_id, {
        pageNumber: params.page_number,
        startBlock: params.start_block,
        maxBlocks: params.max_blocks,
      });
      const blocks = window.selectedBlocks.map((block) => agentVisibleBlock(params.source_id, block));
      const format = params.format === "json" ? "json" : "markdown";

      transcript.write("mta_tool_read_source", {
        sourceId: params.source_id,
        blockCount: window.allBlocks.length,
        returnedBlocks: blocks.length,
        format,
        pageNumber: params.page_number,
        startBlock: window.startBlock,
        nextStartBlock: window.nextStartBlock,
      });

      const payload = {
        metadata: agentVisibleMetadata(window.metadata),
        blocks,
        total_blocks: window.filteredBlocks.length,
        start_block: window.startBlock,
        returned_blocks: blocks.length,
        next_start_block: window.nextStartBlock,
        source_root: `${repoRoot}/raw/sources/${params.source_id}`,
      };
      const text = format === "json" ? JSON.stringify(payload, null, 2) : window.markdown;
      return textResult(text, {
        sourceId: params.source_id,
        blockCount: window.allBlocks.length,
        returnedBlocks: blocks.length,
        format,
        nextStartBlock: window.nextStartBlock,
      });
    },
  };

  const searchSourceTool: AgentTool<typeof searchSourceParameters> = {
    name: "mta_search_source",
    label: "Search MTA Source",
    description: "Search source blocks and return citeable evidence handles.",
    parameters: searchSourceParameters,
    executionMode: "parallel",
    execute: async (_toolCallId, params) => {
      const query = params.query.trim().replace(/\s+/gu, " ").toLowerCase();
      const maxResults = Math.max(1, params.max_results ?? 10);
      const results = ingestVisibleBlocks(params.source_id)
        .filter((block) => `${block.raw_text}\n${block.normalized_text}`.toLowerCase().includes(query))
        .slice(0, maxResults)
        .map((block) => ({
          ...agentVisibleBlock(params.source_id, block),
          evidence_ref: minimalEvidenceRef(params.source_id, block.block_id),
        }));

      transcript.write("mta_tool_search_source", {
        sourceId: params.source_id,
        queryBytes: Buffer.byteLength(params.query),
        resultCount: results.length,
      });

      return textResult(JSON.stringify({ results }, null, 2), { resultCount: results.length });
    },
  };

  const readEvidenceTool: AgentTool<typeof readEvidenceParameters> = {
    name: "mta_read_evidence",
    label: "Read Evidence",
    description: "Read a source block or range by visible id and return its citeable evidence ref.",
    parameters: readEvidenceParameters,
    executionMode: "parallel",
    execute: async (_toolCallId, params) => {
      const block = sourceBlockById(params.source_id, params.block_id);
      const ref = minimalEvidenceRef(params.source_id, params.block_id);
      const allBlocks = ingestVisibleBlocks(params.source_id);
      const requestedBlockId = block.child_block_ids?.[0] ?? block.block_id;
      const index = allBlocks.findIndex((candidate) => candidate.block_id === requestedBlockId);
      const contextRadius = Math.max(0, Math.min(5, params.context_blocks ?? 2));
      const context =
        index === -1
          ? []
          : allBlocks
              .slice(Math.max(0, index - contextRadius), index + contextRadius + 1)
              .filter((candidate) => candidate.page_number === block.page_number)
              .map((candidate) => ({
                ...agentVisibleBlock(params.source_id, candidate),
                evidence_ref: minimalEvidenceRef(params.source_id, candidate.block_id),
                requested: candidate.block_id === requestedBlockId || block.child_block_ids?.includes(candidate.block_id) === true,
              }));

      transcript.write("mta_tool_read_evidence", {
        sourceId: params.source_id,
        blockId: params.block_id,
        contextBlocks: context.length,
      });

      return textResult(
        JSON.stringify(
          {
            evidence_ref: ref,
            raw_text: block.raw_text,
            normalized_text: block.normalized_text,
            block_kind: block.block_kind,
            child_block_ids: ref.child_block_ids,
            source_line_ids: block.source_line_ids,
            context,
          },
          null,
          2,
        ),
        { evidenceRef: ref },
      );
    },
  };

  const resolveRecordTool: AgentTool<typeof resolveRecordParameters> = {
    name: "mta_resolve_record",
    label: "Resolve Canonical Record",
    description: "Search existing canonical entity/project/corridor/route records before deciding whether to update an existing record or create a new one.",
    parameters: resolveRecordParameters,
    executionMode: "parallel",
    execute: async (_toolCallId, params) => {
      if (!isGlobalRecordKind(params.record_kind)) {
        throw new Error("record_kind must be one of entity, project, corridor, or route");
      }

      resolvedKinds.add(params.record_kind);
      const candidates = resolveIdentityCandidates(params.record_kind, params.query, readCanonicalRecordsByKind(params.record_kind), params.max_results ?? 8);
      transcript.write("mta_tool_resolve_record", {
        recordKind: params.record_kind,
        queryBytes: Buffer.byteLength(params.query),
        resultCount: candidates.length,
      });

      return textResult(
        JSON.stringify(
          {
            candidates,
            instruction:
              candidates.length > 0
                ? "If this source refers to one of these records, submit with target_record_id set to that record_id."
                : "No plausible existing record found. If the source supports a new global record, submit with create_new=true.",
          },
          null,
          2,
        ),
        { resultCount: candidates.length },
      );
    },
  };

  const findRelationCandidatesTool: AgentTool<typeof findRelationCandidatesParameters> = {
    name: "mta_find_relation_candidates",
    label: "Find Relation Candidates",
    description:
      "Find existing relation edges and same-source advisory relation candidates. Use before submitting relation records and during the final relationship sweep.",
    parameters: findRelationCandidatesParameters,
    executionMode: "parallel",
    execute: async (_toolCallId, params) => {
      const result = findRelationCandidates(readCanonicalRecords(), readSubmissionEntries(), params);
      transcript.write("mta_tool_find_relation_candidates", {
        sourceId: params.source_id,
        recordId: params.record_id,
        existingRelationCount: result.existing_relations.length,
        possibleRelationCount: result.possible_relation_candidates.length,
      });

      return textResult(JSON.stringify(result, null, 2), {
        existingRelationCount: result.existing_relations.length,
        possibleRelationCount: result.possible_relation_candidates.length,
      });
    },
  };

  const readOntologyGuideTool: AgentTool<typeof readOntologyGuideParameters> = {
    name: "mta_read_ontology_guide",
    label: "Read Ontology Guide",
    description:
      "Read curated payload guidance before submitting observations. Guidance is data-backed and advisory: use preferred raw fields, preserve source literals, and let the runner add normalized companions while passthrough stays allowed.",
    parameters: readOntologyGuideParameters,
    executionMode: "parallel",
    execute: async (_toolCallId, params) => {
      const format = params.format === "json" ? "json" : "markdown";
      const guides = ontologyGuide(params.observation_kind);
      transcript.write("mta_tool_read_ontology_guide", {
        observationKind: params.observation_kind,
        guideCount: guides.length,
        format,
      });

      const text = format === "json" ? JSON.stringify({ guides }, null, 2) : ontologyGuideMarkdown(params.observation_kind);
      return textResult(text, { guideCount: guides.length });
    },
  };

  const schemaMode = readConfig().payloadSchemaMode ?? "warn";

  async function submitObservationCore(input: MtaSubmitObservationInput) {
    if (schemaMode === "enforce" && kindSpec(input.observation_kind) && !kindSpec(input.observation_kind)?.deprecated) {
      const payload = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload) ? input.payload : undefined;
      const schemaResult = validatePayloadSchema(input.observation_kind, payload);
      const hardIssues = [
        ...schemaResult.issues,
        ...schemaResult.unknown_fields.map(
          (field) => `${input.observation_kind}.${field} is not a known field; use an existing field or put it in extra_fields`,
        ),
      ];
      if (hardIssues.length > 0) {
        throw new Error(`Submission rejected by payload schema: ${hardIssues.join("; ")}`);
      }
    }

    if (isGlobalRecordKind(input.observation_kind)) {
      // Indexed point lookup for the target + an indexed same-kind fetch for candidates — both
      // byte-identical to scanning the full corpus (resolveIdentityCandidates only ever considers
      // same-kind records), but without loading every record on every global submission.
      const target = input.target_record_id ? readCanonicalRecordById(input.target_record_id) : undefined;
      const candidates = resolveIdentityCandidates(
        input.observation_kind,
        input.label ?? input.raw_text ?? input.local_observation_id,
        readCanonicalRecordsByKind(input.observation_kind),
        5,
      );

      if (input.target_record_id && !target) {
        throw new Error(
          `Submission rejected: target_record_id ${input.target_record_id} does not exist. Similar ${input.observation_kind} records: ${candidates.map((candidate) => candidate.record_id).join(", ") || "(none)"}`,
        );
      }
      if (target && target.record_kind !== input.observation_kind) {
        throw new Error(`Submission rejected: target_record_id ${input.target_record_id} is ${target.record_kind}, not ${input.observation_kind}`);
      }
      if (!input.target_record_id) {
        if (!resolvedKinds.has(input.observation_kind)) {
          throw new Error(
            `Submission rejected: call mta_resolve_record for ${input.observation_kind} before creating a new global record. Similar records: ${candidates.map((candidate) => candidate.record_id).join(", ") || "(none)"}`,
          );
        }
        if (candidates.length > 0 && input.create_new !== true) {
          throw new Error(
            `Submission rejected: possible existing ${input.observation_kind} record(s): ${candidates.map((candidate) => `${candidate.record_id} (${candidate.display_name})`).join("; ")}. Use target_record_id to update one, or set create_new=true only if these are not the same thing.`,
          );
        }
      }
    }

    const entry = appendSubmission(runId, input);
    const submittedPayload = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload) ? input.payload : {};
    const normalizedCompanions = normalizedCompanionsAdded(submittedPayload, entry.tool_args.payload);
    transcript.write("mta_tool_submit_observation", {
      submissionId: entry.submission_id,
      observationKind: entry.tool_args.observation_kind,
      state: entry.validation.state,
      issueCount: entry.validation.issues.length,
      warningCount: entry.validation.warnings?.length ?? 0,
      normalizedCompanionCount: normalizedCompanions.length,
    });

    if (entry.validation.state === "rejected") {
      throw new Error(`Submission rejected: ${entry.validation.issues.join("; ")}`);
    }

    const possibleRelationCandidates =
      entry.tool_args.observation_kind === "relation"
        ? []
        : possibleRelationCandidatesForSource(readSubmissionEntries(), entry.tool_args.source_id, entry.tool_args.local_observation_id, 5);

    return textResult(
      JSON.stringify(
        {
          state: "accepted",
          submission_id: entry.submission_id,
          ontology_warnings: entry.validation.warnings ?? [],
          normalized_companions_added: normalizedCompanions,
          possible_relation_candidates: possibleRelationCandidates,
          relation_candidate_instruction:
            "Possible relation candidates and ontology warnings are advisory only; submit relation records only when source evidence supports the edge. Preserve raw source literals and let the runner keep normalized companions.",
        },
        null,
        2,
      ),
      {
        submissionId: entry.submission_id,
        ontologyWarningCount: entry.validation.warnings?.length ?? 0,
        normalizedCompanionCount: normalizedCompanions.length,
        possibleRelationCandidateCount: possibleRelationCandidates.length,
      },
    );
  }

  const typedSubmitKinds = new Set<string>(submitToolKinds());

  function submitToolForKind(kind: MtaObservationKind): AgentTool {
    const spec = kindSpec(kind)!;
    const properties: Record<string, ReturnType<typeof Type.String> | ReturnType<typeof Type.Optional>> = {
      source_id: Type.String(),
      local_observation_id: Type.String({
        description: `Stable lowercase id for this observation, e.g. ${spec.observation_kind}_m14_ad_sbs.`,
      }),
      label: Type.Optional(Type.String({ description: "Short display label as printed in the source." })),
      raw_text: Type.Optional(Type.String({ description: "Verbatim source wording backing this observation." })),
      payload: Type.Optional(payloadSchemaForKind(kind)),
      evidence_refs: evidenceRefsParameter,
    };
    if (spec.global) {
      properties.target_record_id = Type.Optional(
        Type.String({ description: `Existing canonical ${kind} record_id to update; resolve with mta_resolve_record first.` }),
      );
      properties.create_new = Type.Optional(
        Type.Boolean({ description: `Set true only after mta_resolve_record returns no plausible existing ${kind}.` }),
      );
    }

    const noteSuffix = spec.notes.length > 0 ? ` ${spec.notes[0]}` : "";
    return {
      name: `mta_submit_${kind}`,
      label: `Submit ${kind.replace(/_/gu, " ")}`,
      description: `Submit a source-backed ${kind} observation. ${spec.summary}${noteSuffix}`,
      parameters: Type.Object(properties),
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        const input = { ...(params as Omit<MtaSubmitObservationInput, "observation_kind">), observation_kind: kind } as MtaSubmitObservationInput;
        return submitObservationCore(input);
      },
    } as AgentTool;
  }

  const submitObservationTool: AgentTool<typeof submitObservationParameters> = {
    name: "mta_submit_observation",
    label: "Submit Observation (escape hatch)",
    description:
      "Escape hatch for observations that do not fit any typed mta_submit_<kind> tool. Requires a justification; rejects kinds that have a dedicated tool.",
    parameters: submitObservationParameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      if (typedSubmitKinds.has(params.observation_kind)) {
        throw new Error(`Submission rejected: use mta_submit_${params.observation_kind} for ${params.observation_kind} observations.`);
      }
      if (!params.justification.trim()) {
        throw new Error("Submission rejected: justification is required when using the escape hatch.");
      }

      const { justification, ...rest } = params;
      const input = { ...rest, escape_justification: justification } as MtaSubmitObservationInput;
      return submitObservationCore(input);
    },
  };

  return [
    readSourceTool,
    searchSourceTool,
    readEvidenceTool,
    resolveRecordTool,
    findRelationCandidatesTool,
    readOntologyGuideTool,
    ...allKindSpecs()
      .filter((spec) => !spec.deprecated)
      .map((spec) => submitToolForKind(spec.observation_kind)),
    submitObservationTool,
  ];
}
