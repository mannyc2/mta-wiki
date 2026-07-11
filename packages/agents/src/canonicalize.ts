import { canonicalizeDir } from "@mta-wiki/pipeline/records/canonicalize-shared";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { buildHarnessAgent, positiveIntegerEnv } from "@mta-wiki/core/agent";
import { readConfig } from "@mta-wiki/core/config";
import { selectModel, type ModelSelection } from "@mta-wiki/core/models";
import { repoRoot } from "@mta-wiki/core/paths";
import { createHarnessSession } from "@mta-wiki/core/session";
import { createWikiReactorSandboxTools, sandboxSystemPrompt } from "@mta-wiki/core/sandbox";
import { createTranscript, type TranscriptWriter } from "@mta-wiki/core/transcript";
import type { HarnessConfig, HarnessRunOptions } from "@mta-wiki/core/types";
import { assistantText } from "@mta-wiki/core/usage";
import {
  buildCanonicalizePackets,
  linkPairSuppressed,
  type CanonicalizeDecision,
  type CanonicalizeEvidenceRefInput,
  type CanonicalizePacket,
  type CanonicalizeProposedRelation,
} from "@mta-wiki/pipeline/records/canonicalize-packets";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import { relationEndpointShapeIssue, normalizeRelationKind } from "@mta-wiki/pipeline/records/relations";
import { quoteIsInBlock } from "@mta-wiki/pipeline/records/submissions";
import { sourceBlockById } from "@mta-wiki/pipeline/sources/source-prep";
import { parseJsonResponse } from "@mta-wiki/agents/ontology-normalize";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaObservationKind } from "@mta-wiki/db/types";

const CANONICALIZE_TIMEOUT_MS = 180_000;
const DEFAULT_CONCURRENCY = 2;

const DECISIONS_BY_PACKET_KIND: Record<CanonicalizePacket["packet_kind"], Set<string>> = {
  identity: new Set(["link", "new", "uncertain"]),
  treatment: new Set(["relate", "skip", "uncertain"]),
  relation_linker: new Set(["relate", "skip", "uncertain"]),
};

export type CanonicalizeRunOptions = HarnessRunOptions & {
  runId: string;
  kind?: string | undefined;
  concurrency?: number | undefined;
  onProgress?: ((message: string) => void) | undefined;
};

export type CanonicalizePacketResult = {
  packet_id: string;
  status: "planned" | "completed" | "failed";
  decision_count: number;
  validated_decision_count: number;
  quarantined_decision_count: number;
  raw_response_path?: string | undefined;
  transcript_dir?: string | undefined;
  error?: string | undefined;
};

export type CanonicalizeRunManifest = {
  run_id: string;
  generated_at: string;
  dry_run: boolean;
  profile_name: string;
  provider: string;
  model: string;
  concurrency: number;
  packet_count: number;
  completed: number;
  failed: number;
  planned: number;
  observation_count: number;
  validated_decision_count: number;
  quarantined_decision_count: number;
  paths: {
    output_dir: string;
    manifest: string;
    decisions_jsonl: string;
    quarantine_jsonl: string;
    raw_responses_dir: string;
  };
  results: CanonicalizePacketResult[];
};

export type CanonicalizeValidationContext = {
  recordsById: Map<string, MtaCanonicalRecord>;
  /** Base ids that map to more than one materialized identity (a `${base}_N` sibling exists). */
  collidingBaseIds: Set<string>;
};

export { canonicalizeDir } from "@mta-wiki/pipeline/records/canonicalize-shared";

function relativePath(path: string) {
  return relative(repoRoot, path).split("/").join("/");
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonl(path: string, values: unknown[]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, values.length ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "", "utf8");
}

export function buildCanonicalizeValidationContext(records: MtaCanonicalRecord[]): CanonicalizeValidationContext {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const collidingBaseIds = new Set<string>();
  for (const record of records) {
    const match = /^(.+)_(\d+)$/u.exec(record.record_id);
    if (match?.[1] && recordsById.has(match[1])) collidingBaseIds.add(match[1]);
  }
  return { recordsById, collidingBaseIds };
}

function asObject(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function asString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isDecisionIdSafe(value: string) {
  return /^[a-z0-9][a-z0-9_.:-]*$/u.test(value);
}

function evidenceRefInputs(value: JsonValue | undefined): CanonicalizeEvidenceRefInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const object = asObject(item);
    const sourceId = asString(object?.source_id);
    const blockId = asString(object?.block_id);
    if (!sourceId || !blockId) return [];
    return [{ source_id: sourceId, block_id: blockId, source_quote: asString(object?.source_quote) }];
  });
}

function validateEvidence(refs: CanonicalizeEvidenceRefInput[], label: string, issues: string[]) {
  for (const [index, ref] of refs.entries()) {
    try {
      const block = sourceBlockById(ref.source_id, ref.block_id);
      if (ref.source_quote && !quoteIsInBlock(ref.source_quote, block.raw_text)) {
        issues.push(`${label}[${index}].source_quote is not present in block ${ref.source_id}#${ref.block_id}`);
      }
    } catch (error) {
      issues.push(`${label}[${index}] unknown source block: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function validateProposedRelations(
  raw: JsonValue | undefined,
  context: CanonicalizeValidationContext,
  issues: string[],
): CanonicalizeProposedRelation[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push("proposed_relations must be an array");
    return [];
  }

  const relations: CanonicalizeProposedRelation[] = [];
  for (const [index, item] of raw.entries()) {
    const object = asObject(item);
    if (!object) {
      issues.push(`proposed_relations[${index}] must be an object`);
      continue;
    }
    const relationKind = asString(object.relation_kind);
    const subjectId = asString(object.subject_id);
    const objectId = asString(object.object_id);
    if (!relationKind || !subjectId || !objectId) {
      issues.push(`proposed_relations[${index}] requires relation_kind, subject_id, object_id`);
      continue;
    }
    const subject = context.recordsById.get(subjectId);
    const object_ = context.recordsById.get(objectId);
    if (!subject) issues.push(`proposed_relations[${index}].subject_id "${subjectId}" does not exist`);
    if (!object_) issues.push(`proposed_relations[${index}].object_id "${objectId}" does not exist`);
    if (subject && object_) {
      const shapeIssue = relationEndpointShapeIssue(relationKind, subject.record_kind, object_.record_kind);
      if (shapeIssue) issues.push(`proposed_relations[${index}]: ${shapeIssue.message}`);
    }
    const evidence = evidenceRefInputs(object.evidence_refs);
    if (evidence.length === 0) {
      issues.push(`proposed_relations[${index}].evidence_refs must cite at least one source block`);
    }
    validateEvidence(evidence, `proposed_relations[${index}].evidence_refs`, issues);
    relations.push({
      relation_kind: normalizeRelationKind(relationKind),
      subject_id: subjectId,
      object_id: objectId,
      description: asString(object.description),
      evidence_refs: evidence,
    });
  }
  return relations;
}

export function validateCanonicalizeEnvelope(
  packet: CanonicalizePacket,
  parsed: JsonValue | undefined,
  context: CanonicalizeValidationContext,
): { validated: CanonicalizeDecision[]; quarantined: JsonObject[] } {
  const root = asObject(parsed);
  const quarantined: JsonObject[] = [];
  const validated: CanonicalizeDecision[] = [];
  const observationsByLocalId = new Map(packet.observations.map((observation) => [observation.local_observation_id, observation]));
  const covered = new Set<string>();
  const seenDecisionIds = new Set<string>();

  const rawDecisions = root && Array.isArray(root.decisions) ? root.decisions : undefined;
  if (!root || !rawDecisions) {
    quarantined.push({
      packet_id: packet.packet_id,
      run_id: packet.run_id,
      issues: ["response is not a JSON object with a decisions array"],
      raw_response: parsed,
    });
  } else {
    for (const [index, rawDecision] of rawDecisions.entries()) {
      const decision = asObject(rawDecision);
      const issues: string[] = [];
      if (!decision) {
        quarantined.push({ packet_id: packet.packet_id, decision_index: index, issues: ["decision is not an object"], raw_decision: rawDecision });
        continue;
      }

      const decisionId = asString(decision.decision_id);
      if (!decisionId) issues.push("decision_id is required");
      else if (!isDecisionIdSafe(decisionId)) issues.push(`decision_id "${decisionId}" must be lowercase slug-safe`);
      else if (seenDecisionIds.has(decisionId)) issues.push(`duplicate decision_id "${decisionId}"`);
      if (decisionId) seenDecisionIds.add(decisionId);

      const localObservationId = asString(decision.local_observation_id);
      const observation = localObservationId ? observationsByLocalId.get(localObservationId) : undefined;
      if (!localObservationId) issues.push("local_observation_id is required");
      else if (!observation) issues.push(`local_observation_id "${localObservationId}" was not in the packet`);
      if (observation) covered.add(observation.local_observation_id);

      const decisionType = asString(decision.decision);
      const allowed = DECISIONS_BY_PACKET_KIND[packet.packet_kind];
      if (!decisionType || !allowed.has(decisionType)) {
        issues.push(`decision must be one of ${[...allowed].join(", ")} for ${packet.packet_kind} packets`);
      }

      const rationale = asString(decision.rationale);
      if (!rationale) issues.push("rationale is required");

      const targetRecordId = asString(decision.target_record_id);
      const evidence = evidenceRefInputs(decision.evidence_refs);

      if (decisionType === "link") {
        if (!targetRecordId) {
          issues.push("link decisions require target_record_id");
        } else if (observation) {
          const target = context.recordsById.get(targetRecordId);
          if (!target) issues.push(`target_record_id "${targetRecordId}" does not exist`);
          else if (target.record_kind !== observation.observation_kind) {
            issues.push(`target_record_id "${targetRecordId}" is ${target.record_kind}, not ${observation.observation_kind}`);
          }
          if (targetRecordId === observation.base_record_id) issues.push("link target equals the observation's own base record id; use new instead");
          if (linkPairSuppressed(observation.observation_kind, observation.base_record_id, targetRecordId)) {
            issues.push(`pair ${observation.base_record_id} <> ${targetRecordId} is in do-not-merge overrides`);
          }
          if (context.collidingBaseIds.has(observation.base_record_id)) {
            issues.push(
              `base record id ${observation.base_record_id} maps to multiple materialized identities; an alias on the bare base id would merge them all`,
            );
          }
          if (evidence.length === 0) issues.push("link decisions require evidence_refs");
        }
      } else if (targetRecordId && decisionType !== "link") {
        issues.push(`target_record_id is only valid on link decisions`);
      }

      validateEvidence(evidence, "evidence_refs", issues);
      const proposedRelations = validateProposedRelations(decision.proposed_relations, context, issues);
      if (decisionType === "relate" && proposedRelations.length === 0) {
        issues.push("relate decisions require at least one proposed relation");
      }

      const normalized: CanonicalizeDecision = {
        decision_id: decisionId ?? `decision-${index}`,
        run_id: packet.run_id,
        packet_id: packet.packet_id,
        packet_kind: packet.packet_kind,
        kind: String(packet.kind),
        submission_id: observation?.submission_id ?? "",
        local_observation_id: localObservationId ?? "",
        source_id: observation?.source_id ?? "",
        base_record_id: observation?.base_record_id ?? "",
        decision: (decisionType ?? "uncertain") as CanonicalizeDecision["decision"],
        target_record_id: targetRecordId,
        proposed_relations: proposedRelations,
        rationale: rationale ?? "",
        evidence_refs: evidence,
      };

      if (issues.length === 0) validated.push(normalized);
      else quarantined.push({ ...(normalized as unknown as JsonObject), issues, raw_decision: decision });
    }
  }

  for (const observation of packet.observations) {
    if (covered.has(observation.local_observation_id)) continue;
    quarantined.push({
      packet_id: packet.packet_id,
      run_id: packet.run_id,
      local_observation_id: observation.local_observation_id,
      submission_id: observation.submission_id,
      decision: "uncertain",
      issues: ["observation was not covered by any decision; treated as implicit uncertain"],
    });
  }

  return { validated, quarantined };
}

function canonicalizeSystemPrompt(packet: CanonicalizePacket, config: HarnessConfig) {
  const identityInstructions = [
    "You are the per-run identity canonicalizer for the MTA wiki.",
    "For every observation in the packet decide link, new, or uncertain against the canonical registry of this kind.",
    "link means the observation refers to the SAME real-world thing as an existing registry record: same route variant (SBS vs local matters), same borough/limits for corridors, same person vs organization for entities, same project vs program scope.",
    "new means no registry record refers to the same thing. uncertain means you cannot tell from the evidence; never guess.",
    "CRITICAL decision shape: include `target_record_id` ONLY on a `link` decision. OMIT it entirely on `new` and `uncertain`.",
    "`link` is ONLY for matching a DIFFERENT existing registry record. `target_record_id` MUST differ from the observation's own base_record_id. If the closest match IS the observation's own base_record_id, the decision is `new` (the observation already resolves to that id) — never `link` to your own base_record_id.",
    "Respect do_not_merge_pairs: those pairs have been reviewed as distinct.",
    "You may also propose evidence-backed relations between canonical record ids (proposed_relations) when the cited text supports an edge.",
  ];
  const treatmentInstructions = [
    "You are the treatment-component relation pass for the MTA wiki. Do NOT merge treatment identities.",
    "For every treatment observation decide relate, skip, or uncertain.",
    "relate means the cited evidence supports attaching the treatment to a project or corridor: propose has_treatment relations from the project/corridor canonical record id (subject_id) to the treatment's canonical record id (object_id, use the observation's record_id).",
    "skip means the source supports no attachment; uncertain means you cannot tell.",
    "NEVER set target_record_id (that field is only for identity-packet link decisions). relate decisions carry proposed_relations only; skip/uncertain carry neither.",
    "Only relate when the cited block's text explicitly states the attachment; a block merely listing a design/station/feature is NOT evidence it is a treatment on the corridor.",
  ];
  const linkerInstructions = [
    "You are the relation linker for the MTA wiki run. The packet contains the run's metric_claims, claims, and events plus the registry of canonical subjects.",
    "For every observation decide relate, skip, or uncertain.",
    "relate: propose has_metric / has_claim / has_timeline_event edges with subject_id = the canonical subject record id and object_id = the observation's record_id, citing the evidence block that states the connection.",
    "Only propose an edge when the cited text names the subject; never infer from co-occurrence alone.",
    "NEVER set target_record_id (that field is only for identity-packet link decisions). relate decisions carry proposed_relations only; skip/uncertain carry neither.",
  ];
  const intro = packet.packet_kind === "identity" ? identityInstructions : packet.packet_kind === "treatment" ? treatmentInstructions : linkerInstructions;

  return [
    ...intro,
    "Use only the packet contents and local repository evidence; do not use external knowledge.",
    "Every decision must cover exactly one packet observation by local_observation_id; cover every observation.",
    "Evidence refs must cite real source blocks ({source_id, block_id, source_quote}); quotes must appear verbatim in the cited block.",
    "You must call `mta_submit_canonicalize_decisions` exactly once with the final envelope. Do not put the envelope in assistant text.",
    "Decision shape:",
    JSON.stringify(
      {
        packet_id: "must equal the packet packet_id",
        decisions: [
          {
            decision_id: "lowercase stable id unique within this packet",
            local_observation_id: "observation id from the packet",
            decision: packet.packet_kind === "identity" ? "link | new | uncertain" : "relate | skip | uncertain",
            target_record_id: "ONLY on identity-packet `link` decisions: a DIFFERENT existing registry record id (must NOT equal this observation's base_record_id). OMIT entirely on new/uncertain AND on every relate/skip decision (those use proposed_relations).",
            proposed_relations: [
              {
                relation_kind: "lowercase relation kind",
                subject_id: "existing canonical record id",
                object_id: "existing canonical record id",
                description: "optional short description",
                evidence_refs: [{ source_id: "source id", block_id: "block id", source_quote: "verbatim quote" }],
              },
            ],
            rationale: "short reason grounded in packet evidence",
            evidence_refs: [{ source_id: "source id", block_id: "block id", source_quote: "verbatim quote" }],
          },
        ],
      },
      null,
      2,
    ),
    sandboxSystemPrompt("canonicalize", config),
  ].join("\n\n");
}

function canonicalizePrompt(packet: CanonicalizePacket) {
  return `Canonicalize this packet into typed decisions. Submit the final envelope with mta_submit_canonicalize_decisions.

Packet data:

\`\`\`json
${JSON.stringify(packet, null, 2)}
\`\`\`
`;
}

async function buildCanonicalizeAgent(config: HarnessConfig, selection: ModelSelection, transcript: TranscriptWriter, packet: CanonicalizePacket) {
  const bundle = await createHarnessSession(config, transcript.runId);
  let submittedEnvelope: JsonObject | undefined;
  const parameters = Type.Object({
    packet_id: Type.String({ description: "Must equal the packet packet_id." }),
    decisions: Type.Array(
      Type.Object(
        {
          decision_id: Type.String(),
          local_observation_id: Type.String(),
          decision: Type.String({ description: packet.packet_kind === "identity" ? "link | new | uncertain" : "relate | skip | uncertain" }),
          target_record_id: Type.Optional(Type.String()),
          proposed_relations: Type.Optional(Type.Array(Type.Any())),
          rationale: Type.String(),
          evidence_refs: Type.Optional(Type.Array(Type.Any())),
        },
        { additionalProperties: true },
      ),
    ),
  });
  const submitTool: AgentTool<typeof parameters> = {
    name: "mta_submit_canonicalize_decisions",
    label: "Submit Canonicalize Decisions",
    description: "Submit the final canonicalize decision envelope for this packet. Call exactly once when ready.",
    parameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      submittedEnvelope = params as JsonObject;
      transcript.write("mta_tool_submit_canonicalize_decisions", { packetId: params.packet_id, decisionCount: params.decisions.length });
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ state: "accepted_for_validation", instruction: "Envelope captured. Stop now." }) }],
        details: { packetId: params.packet_id, decisionCount: params.decisions.length },
        terminate: true,
      };
    },
  };
  const { agent, sessionPath } = buildHarnessAgent({
    selection,
    transcript,
    bundle,
    tools: [...createWikiReactorSandboxTools(config, "canonicalize"), submitTool],
    streamOptions: { timeoutMs: CANONICALIZE_TIMEOUT_MS },
    systemPrompt: canonicalizeSystemPrompt(packet, config),
  });
  return { agent, sessionPath, submittedEnvelope: () => submittedEnvelope };
}

async function runOnePacket(
  packet: CanonicalizePacket,
  config: HarnessConfig,
  selection: ModelSelection,
  options: CanonicalizeRunOptions,
  context: CanonicalizeValidationContext,
  rawResponsesDir: string,
): Promise<{ result: CanonicalizePacketResult; validated: CanonicalizeDecision[]; quarantined: JsonObject[] }> {
  options.onProgress?.(`packet ${packet.packet_id}: ${packet.observation_count} observations (${packet.registry_mode} registry)`);
  const transcript = createTranscript(config, "canonicalize", `${options.runId}_${packet.packet_id}`, options.dryRun);
  const { agent, submittedEnvelope } = await buildCanonicalizeAgent(config, selection, transcript, packet);
  const prompt = canonicalizePrompt(packet);

  if (options.dryRun) {
    transcript.writeResponse(`Dry run prepared for ${packet.packet_id}.\n\nPrompt:\n\n${prompt}`);
    return {
      result: {
        packet_id: packet.packet_id,
        status: "planned",
        decision_count: 0,
        validated_decision_count: 0,
        quarantined_decision_count: 0,
        transcript_dir: relativePath(transcript.runDir),
      },
      validated: [],
      quarantined: [],
    };
  }

  const responseText = assistantText(await agent.prompt(prompt));
  const toolEnvelope = submittedEnvelope();
  transcript.writeResponse(responseText || (toolEnvelope ? "[decisions submitted via mta_submit_canonicalize_decisions]" : ""));

  let parsed: JsonValue | undefined;
  let parseError: string | undefined;
  if (toolEnvelope) parsed = toolEnvelope;
  else {
    try {
      parsed = parseJsonResponse(responseText);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }

  const rawResponsePath = join(rawResponsesDir, `${packet.packet_id}.json`);
  writeJson(rawResponsePath, {
    run_id: options.runId,
    packet_id: packet.packet_id,
    generated_at: new Date().toISOString(),
    profile_name: selection.profileName,
    provider: selection.model.provider,
    model: selection.model.id,
    response_mode: toolEnvelope ? "tool" : "assistant_text",
    parsed_response: parsed,
    parse_error: parseError,
    raw_response: toolEnvelope ? undefined : responseText,
    transcript_dir: relativePath(transcript.runDir),
  });

  const { validated, quarantined } = parseError
    ? {
        validated: [] as CanonicalizeDecision[],
        quarantined: [
          { packet_id: packet.packet_id, run_id: packet.run_id, issues: [`model response was not parseable JSON: ${parseError}`], raw_response: responseText },
        ] as JsonObject[],
      }
    : validateCanonicalizeEnvelope(packet, parsed, context);

  options.onProgress?.(`packet ${packet.packet_id}: ${validated.length} validated, ${quarantined.length} quarantined`);
  return {
    result: {
      packet_id: packet.packet_id,
      status: "completed",
      decision_count: validated.length + quarantined.length,
      validated_decision_count: validated.length,
      quarantined_decision_count: quarantined.length,
      raw_response_path: relativePath(rawResponsePath),
      transcript_dir: relativePath(transcript.runDir),
    },
    validated,
    quarantined,
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) break;
        results[index] = await worker(items[index]!);
      }
    }),
  );
  return results;
}

export async function runCanonicalize(options: CanonicalizeRunOptions): Promise<CanonicalizeRunManifest> {
  const config = readConfig();
  const selection = selectModel(config, options);
  const records = readCanonicalRecords();
  const packets = buildCanonicalizePackets(options.runId, { kind: options.kind });
  const context = buildCanonicalizeValidationContext(records);

  const outputDir = canonicalizeDir(options.runId);
  const decisionsPath = join(outputDir, "decisions.jsonl");
  const quarantinePath = join(outputDir, "quarantine.jsonl");
  const rawResponsesDir = join(outputDir, "raw-responses");
  const manifestPath = join(outputDir, "propose-manifest.json");
  const concurrency = options.concurrency ?? positiveIntegerEnv("MTA_CANONICALIZE_CONCURRENCY") ?? DEFAULT_CONCURRENCY;
  mkdirSync(rawResponsesDir, { recursive: true });

  const packetRuns = await mapWithConcurrency(packets, concurrency, async (packet) => {
    try {
      return await runOnePacket(packet, config, selection, options, context, rawResponsesDir);
    } catch (error) {
      options.onProgress?.(`packet ${packet.packet_id} failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        result: {
          packet_id: packet.packet_id,
          status: "failed" as const,
          decision_count: 0,
          validated_decision_count: 0,
          quarantined_decision_count: 0,
          error: error instanceof Error ? error.message : String(error),
        },
        validated: [] as CanonicalizeDecision[],
        quarantined: [] as JsonObject[],
      };
    }
  });

  const validated = packetRuns.flatMap((run) => run.validated);
  const quarantined = packetRuns.flatMap((run) => run.quarantined);
  if (!options.dryRun) {
    writeJsonl(decisionsPath, validated);
    writeJsonl(quarantinePath, quarantined);
  }

  const results = packetRuns.map((run) => run.result);
  const manifest: CanonicalizeRunManifest = {
    run_id: options.runId,
    generated_at: new Date().toISOString(),
    dry_run: options.dryRun,
    profile_name: selection.profileName,
    provider: selection.model.provider,
    model: selection.model.id,
    concurrency,
    packet_count: packets.length,
    completed: results.filter((result) => result.status === "completed").length,
    failed: results.filter((result) => result.status === "failed").length,
    planned: results.filter((result) => result.status === "planned").length,
    observation_count: packets.reduce((sum, packet) => sum + packet.observation_count, 0),
    validated_decision_count: validated.length,
    quarantined_decision_count: quarantined.length,
    paths: {
      output_dir: relativePath(outputDir),
      manifest: relativePath(manifestPath),
      decisions_jsonl: relativePath(decisionsPath),
      quarantine_jsonl: relativePath(quarantinePath),
      raw_responses_dir: relativePath(rawResponsesDir),
    },
    results,
  };
  writeJson(manifestPath, manifest);
  return manifest;
}

export type { MtaObservationKind };
