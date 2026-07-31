import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import type {
  OperationalEpisodeCandidateLedgerRow,
  OperationalEpisodeFrontierSummary,
  OperationalEpisodeObservationLedgerRow,
} from "../packages/pipeline/src/materialize/operational-episode-frontier";

const PLAN_ID = "plan-052";
const CONTRACT_ID = "plan-052-operational-episode-batch-manifest-v1";
const STARTING_COMMIT = "0a0fb2c1ee09f661b77aaa854fe9b75581203722";
const FRONTIER_RELATIVE = "data/quality/operational-episode-frontier/v1";
const CAMPAIGN_RELATIVE =
  "data/operational-episode-resolution/campaigns/plan-052";
const FROZEN_RELATIVE = `${CAMPAIGN_RELATIVE}/frozen-frontier`;
const BATCH_RELATIVE = `${CAMPAIGN_RELATIVE}/batches`;
const PORTFOLIO_RELATIVE = `${CAMPAIGN_RELATIVE}/portfolio.json`;
const BASELINE_CANDIDATE_LEDGER_SHA256 =
  "7b2ea8b80920e534c8958fc0665182dad6d0a84bf31e6881c58413107b3254b2";

type SourceFamily =
  | "qbnr_service_changes"
  | "meeting_documents"
  | "bus_priority_program"
  | "corridor_project_materials"
  | "other_official_sources"
  | "cross_source";

type BatchSpec = {
  batch_id: string;
  wave: 0 | 1 | 2;
  source_family: SourceFamily | "mixed_characterization" | "mixed_wave0";
  candidate_rows: OperationalEpisodeCandidateLedgerRow[];
};

type Artifact = { path: string; bytes: number; sha256: string };

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}

function artifact(relativePath: string): Artifact {
  const bytes = readFileSync(absolute(relativePath));
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(absolute(relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function family(sourceIds: readonly string[]): SourceFamily {
  if (sourceIds.length > 1) return "cross_source";
  const sourceId = sourceIds[0] ?? "";
  if (sourceId === "mta_queens_bus_network_redesign_service_changes") {
    return "qbnr_service_changes";
  }
  if (sourceId.startsWith("meeting_doc_")) return "meeting_documents";
  if (
    /(?:brt|sbs|busway|bus_lane|better_buses|bus_forward|ace_route|mta_ace)/iu
      .test(sourceId)
  ) return "bus_priority_program";
  if (
    /(?:flatbush|fordham|tremont|church|dekalb|lexington|madison|broadway|jamaica|fresh_pond|rockaway|116_st|181st|34th_st|42nd_st|79_st|bay_pkwy|woodhaven|utica|webster|malcolm)/iu
      .test(sourceId)
  ) return "corridor_project_materials";
  return "other_official_sources";
}

function sortedRows<T extends { candidate_id: string }>(rows: T[]): T[] {
  return [...rows].sort((left, right) =>
    left.candidate_id.localeCompare(right.candidate_id)
  );
}

function take<T>(values: T[], count: number, label: string): T[] {
  if (values.length < count) {
    throw new Error(`${label} requires ${count} rows, found ${values.length}`);
  }
  return values.splice(0, count);
}

function chunks<T>(values: T[], sizes: readonly number[], label: string): T[][] {
  const result = sizes.map((size) => take(values, size, label));
  if (values.length !== 0) {
    throw new Error(`${label} leaves ${values.length} unassigned rows`);
  }
  return result;
}

function buildBatchSpecs(
  candidates: OperationalEpisodeCandidateLedgerRow[],
): BatchSpec[] {
  const sorted = sortedRows(candidates);
  const wave0 = sorted.filter((row) =>
    row.unresolved_active_occurrence_ids.length > 0
  );
  if (wave0.length !== 5) {
    throw new Error(`Wave 0 requires five unresolved candidates, found ${wave0.length}`);
  }
  const wave0Ids = new Set(wave0.map((row) => row.candidate_id));
  const remaining = sorted.filter((row) => !wave0Ids.has(row.candidate_id));
  const publishedQbnr = remaining.filter((row) =>
    row.disposition === "published" && family(row.source_ids) === "qbnr_service_changes"
  );
  const publishedOther = remaining.filter((row) =>
    row.disposition === "published" && family(row.source_ids) !== "qbnr_service_changes"
  );
  const pendingByFamily = new Map<SourceFamily, OperationalEpisodeCandidateLedgerRow[]>();
  for (const sourceFamily of [
    "bus_priority_program",
    "meeting_documents",
    "corridor_project_materials",
    "other_official_sources",
  ] as const) {
    pendingByFamily.set(
      sourceFamily,
      remaining.filter((row) =>
        row.disposition === "pending_review" &&
        family(row.source_ids) === sourceFamily
      ),
    );
  }
  const wave1 = [
    ...take(publishedOther, 13, "Wave 1 non-QBNR published characterization"),
    ...take(publishedQbnr, 5, "Wave 1 QBNR published characterization"),
    ...take(
      pendingByFamily.get("bus_priority_program")!,
      3,
      "Wave 1 bus-priority characterization",
    ),
    ...take(
      pendingByFamily.get("meeting_documents")!,
      3,
      "Wave 1 meeting-document characterization",
    ),
    ...take(
      pendingByFamily.get("corridor_project_materials")!,
      3,
      "Wave 1 corridor characterization",
    ),
    ...take(
      pendingByFamily.get("other_official_sources")!,
      3,
      "Wave 1 other-source characterization",
    ),
  ];
  if (wave1.length !== 30 || publishedOther.length !== 0) {
    throw new Error(
      `Wave 1 characterization mismatch: ${wave1.length} selected, ` +
        `${publishedOther.length} non-QBNR published remain`,
    );
  }
  const specs: BatchSpec[] = [
    {
      batch_id: "w0-unresolved-identities",
      wave: 0,
      source_family: "mixed_wave0",
      candidate_rows: sortedRows(wave0),
    },
    {
      batch_id: "w1-characterization",
      wave: 1,
      source_family: "mixed_characterization",
      candidate_rows: sortedRows(wave1),
    },
  ];
  const addChunks = (
    prefix: string,
    sourceFamily: SourceFamily,
    rows: OperationalEpisodeCandidateLedgerRow[],
    sizes: readonly number[],
  ) => {
    chunks(sortedRows(rows), sizes, prefix).forEach((candidateRows, index) => {
      specs.push({
        batch_id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
        wave: 2,
        source_family: sourceFamily,
        candidate_rows: candidateRows,
      });
    });
  };
  addChunks(
    "w2-qbnr-published",
    "qbnr_service_changes",
    publishedQbnr,
    [38, 37, 37],
  );
  addChunks(
    "w2-bus-priority-pending",
    "bus_priority_program",
    pendingByFamily.get("bus_priority_program")!,
    [46, 46, 46, 46, 45],
  );
  addChunks(
    "w2-meeting-docs-pending",
    "meeting_documents",
    pendingByFamily.get("meeting_documents")!,
    [43, 43, 42, 42, 42, 42, 42],
  );
  addChunks(
    "w2-corridor-pending",
    "corridor_project_materials",
    pendingByFamily.get("corridor_project_materials")!,
    [29, 29],
  );
  addChunks(
    "w2-other-pending",
    "other_official_sources",
    pendingByFamily.get("other_official_sources")!,
    [36],
  );
  if (specs.length !== 20) {
    throw new Error(`Plan 052 requires 20 batches, found ${specs.length}`);
  }
  const ids = specs.flatMap((spec) =>
    spec.candidate_rows.map((row) => row.candidate_id)
  );
  if (ids.length !== 766 || new Set(ids).size !== ids.length) {
    throw new Error("Plan 052 batch specs do not partition all 766 candidates");
  }
  return specs;
}

function riskClasses(spec: BatchSpec): string[] {
  if (spec.wave === 0) {
    return [
      "identity",
      "multi_phase",
      "multi_route",
      "plural_treatment",
      "possible_cross_product",
      "publishable_occurrence",
      "retirement",
      "route_namespace",
    ];
  }
  if (spec.wave === 1) {
    return [
      "characterization",
      "conformance",
      "identity",
      "segmentation",
      "source_and_route_diversity",
    ];
  }
  if (spec.candidate_rows.every((row) => row.disposition === "published")) {
    return ["baseline_published_conformance", "identity", "publishable_occurrence"];
  }
  return [
    "possible_alias_or_non_coreference",
    "possible_publishable_occurrence",
    "segmentation",
  ];
}

function reviewerAssignments(spec: BatchSpec) {
  const stem = spec.batch_id.replace(/^w[0-9]-/u, "");
  return {
    primary_reviewer: `plan-052-primary-${stem}`,
    required_independent_reviewer: `plan-052-independent-${stem}`,
    integrator: "plan-052-single-frontier-integrator",
    independence_required: true,
  };
}

function expectedArithmetic(spec: BatchSpec) {
  const published = spec.candidate_rows.filter((row) =>
    row.disposition === "published"
  ).length;
  const pending = spec.candidate_rows.filter((row) =>
    row.disposition === "pending_review"
  ).length;
  return {
    starting_candidate_count: spec.candidate_rows.length,
    starting_published_count: published,
    starting_pending_review_count: pending,
    required_terminal_candidate_count: spec.candidate_rows.length,
    required_accounted_observation_count: 0,
    final_published_count: published > 0 && pending === 0 ? published : null,
    final_nonpublication_count: published > 0 && pending === 0 ? 0 : null,
    evidence_determined_outcomes: pending > 0,
  };
}

function sourcePins(sourceIds: readonly string[]): Artifact[] {
  return [...new Set(sourceIds)].sort().map((sourceId) => {
    const path = `wiki/sources/${sourceId}.md`;
    if (!existsSync(absolute(path))) {
      throw new Error(`tracked source page is missing for ${sourceId}`);
    }
    return artifact(path);
  });
}

function freezeInputFiles(mode: "--write" | "--check"): void {
  const names = [
    "candidate_ledger.jsonl",
    "cohort.json",
    "observation_ledger.jsonl",
    "summary.json",
  ];
  if (mode === "--write") {
    if (existsSync(absolute(CAMPAIGN_RELATIVE))) {
      throw new Error(
        `Plan 052 campaign freeze already exists: ${CAMPAIGN_RELATIVE}`,
      );
    }
    mkdirSync(absolute(FROZEN_RELATIVE), { recursive: true });
    for (const name of names) {
      writeFileSync(
        absolute(`${FROZEN_RELATIVE}/${name}`),
        readFileSync(absolute(`${FRONTIER_RELATIVE}/${name}`)),
      );
    }
  } else {
    for (const name of names) {
      if (!existsSync(absolute(`${FROZEN_RELATIVE}/${name}`))) {
        throw new Error(`Plan 052 frozen frontier input is missing: ${name}`);
      }
    }
  }
  const candidatePin = artifact(`${FROZEN_RELATIVE}/candidate_ledger.jsonl`);
  if (candidatePin.sha256 !== BASELINE_CANDIDATE_LEDGER_SHA256) {
    throw new Error(
      `Plan 052 frozen candidate ledger drifted: ${candidatePin.sha256}`,
    );
  }
}

function expectedCampaignFiles(): Map<string, string> {
  const candidates = readJsonl<OperationalEpisodeCandidateLedgerRow>(
    `${FROZEN_RELATIVE}/candidate_ledger.jsonl`,
  );
  const observations = readJsonl<OperationalEpisodeObservationLedgerRow>(
    `${FROZEN_RELATIVE}/observation_ledger.jsonl`,
  );
  const summary = JSON.parse(
    readFileSync(absolute(`${FROZEN_RELATIVE}/summary.json`), "utf8"),
  ) as OperationalEpisodeFrontierSummary;
  if (
    candidates.length !== 766 ||
    observations.length !== 1366 ||
    summary.candidate_ledger_rows !== 766 ||
    summary.observation_ledger_rows !== 1366 ||
    summary.counts_by_candidate_disposition.published !== 130 ||
    summary.counts_by_candidate_disposition.pending_review !== 636 ||
    summary.counts_by_observation_disposition.pending_segmentation !== 629 ||
    summary.unresolved_active_identity_ids !== 5 ||
    summary.completeness_profile !== "partial"
  ) {
    throw new Error("Plan 052 frozen starting arithmetic drifted");
  }
  const specs = buildBatchSpecs(candidates);
  const observationOwner = new Map<string, string>();
  const observationsById = new Map(observations.map((row) => [
    row.event_record_id,
    row,
  ]));
  for (const spec of specs) {
    for (const eventId of spec.candidate_rows.flatMap((row) =>
      row.observation_event_record_ids
    )) {
      const prior = observationOwner.get(eventId);
      if (prior && prior !== spec.batch_id) {
        throw new Error(`observation ${eventId} is owned by two candidate batches`);
      }
      observationOwner.set(eventId, spec.batch_id);
    }
  }
  const familyBatches = new Map<SourceFamily, BatchSpec[]>();
  for (const sourceFamily of [
    "qbnr_service_changes",
    "meeting_documents",
    "bus_priority_program",
    "corridor_project_materials",
    "other_official_sources",
  ] as const) {
    familyBatches.set(
      sourceFamily,
      specs.filter((spec) => spec.source_family === sourceFamily),
    );
  }
  const cursors = new Map<SourceFamily, number>();
  for (const observation of observations) {
    if (observationOwner.has(observation.event_record_id)) continue;
    const sourceFamily = family(observation.source_ids);
    const eligible = sourceFamily === "cross_source"
      ? specs.filter((spec) => spec.batch_id === "w1-characterization")
      : familyBatches.get(sourceFamily) ?? [];
    if (eligible.length === 0) {
      throw new Error(
        `no Plan 052 batch can own observation ${observation.event_record_id} (${sourceFamily})`,
      );
    }
    const cursor = cursors.get(sourceFamily) ?? 0;
    observationOwner.set(
      observation.event_record_id,
      eligible[cursor % eligible.length]!.batch_id,
    );
    cursors.set(sourceFamily, cursor + 1);
  }
  if (
    observationOwner.size !== 1366 ||
    observations.some((row) => !observationOwner.has(row.event_record_id))
  ) {
    throw new Error("Plan 052 manifests do not partition all observations");
  }
  const records = readCanonicalRecordsFromJsonl();
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const frozenPins = [
    artifact(`${FROZEN_RELATIVE}/candidate_ledger.jsonl`),
    artifact(`${FROZEN_RELATIVE}/cohort.json`),
    artifact(`${FROZEN_RELATIVE}/observation_ledger.jsonl`),
    artifact(`${FROZEN_RELATIVE}/summary.json`),
  ];
  const files = new Map<string, string>();
  const portfolioRows: Array<Record<string, unknown>> = [];
  let campaignEstimatedCost = 0;
  for (const [index, spec] of specs.entries()) {
    const candidateRows = sortedRows(spec.candidate_rows);
    const observationRows = observations
      .filter((row) => observationOwner.get(row.event_record_id) === spec.batch_id)
      .sort((left, right) =>
        left.event_record_id.localeCompare(right.event_record_id)
      );
    const recordIds = new Set([
      ...candidateRows.flatMap((row) => row.evidence_bindings.map((binding) =>
        binding.record_id
      )),
      ...observationRows.flatMap((row) => row.evidence_bindings.map((binding) =>
        binding.record_id
      )),
      ...candidateRows.flatMap((row) => row.observation_event_record_ids),
      ...candidateRows.flatMap((row) => row.observation_relation_record_ids),
      ...observationRows.flatMap((row) => [row.event_record_id, ...row.relation_record_ids]),
    ]);
    const evidenceRecords = [...recordIds].sort().map((recordId) => {
      const record = recordsById.get(recordId);
      if (!record) throw new Error(`manifest evidence record is missing: ${recordId}`);
      return record;
    });
    const pins = sourcePins([
      ...candidateRows.flatMap((row) => row.source_ids),
      ...observationRows.flatMap((row) => row.source_ids),
    ]);
    const evidencePayload = {
      records: evidenceRecords as MtaCanonicalRecord[],
      source_page_pins: pins,
    };
    const packetPayload = {
      candidates: candidateRows,
      observations: observationRows,
      evidence: evidencePayload,
    };
    const packetBytes = Buffer.byteLength(stableJson(packetPayload as JsonValue));
    const inputTokensPerReviewer = Math.ceil(packetBytes / 4);
    const outputTokensPerReviewer = candidateRows.length * 256;
    const requestCount = 2;
    const estimatedCost = Number((
      ((inputTokensPerReviewer * 2) / 1_000_000) * 0.1 +
      ((outputTokensPerReviewer * 2) / 1_000_000) * 0.2
    ).toFixed(6));
    campaignEstimatedCost += estimatedCost;
    const arithmetic = expectedArithmetic(spec);
    arithmetic.required_accounted_observation_count = observationRows.length;
    const manifest = {
      schema_version: 1,
      contract_id: CONTRACT_ID,
      plan_id: PLAN_ID,
      batch_id: spec.batch_id,
      execution_order: index,
      wave: spec.wave,
      source_family: spec.source_family,
      immutable_starting_provenance: {
        commit_sha: STARTING_COMMIT,
        frontier_artifacts: frozenPins,
        cohort_fingerprint: summary.cohort_fingerprint,
        corpus_fingerprint: summary.corpus_fingerprint,
        adapter_fingerprint: summary.adapter_fingerprint,
        identity_fingerprint: summary.identity_fingerprint,
        review_fingerprint: summary.review_fingerprint,
        decision_fingerprint: summary.decision_fingerprint,
      },
      cohort_hashes: {
        candidate_membership_sha256: sha256(json(candidateRows.map((row) =>
          row.candidate_id
        ))),
        observation_membership_sha256: sha256(json(observationRows.map((row) =>
          row.event_record_id
        ))),
        candidate_input_sha256: sha256(json(candidateRows)),
        adapter_input_sha256: sha256(json(observationRows)),
        evidence_input_sha256: sha256(json(evidencePayload)),
      },
      candidate_ids: candidateRows.map((row) => row.candidate_id),
      candidate_keys: candidateRows.map((row) => row.candidate_key),
      observation_event_record_ids: observationRows.map((row) =>
        row.event_record_id
      ),
      evidence_source_pins: pins,
      risk_classes: riskClasses(spec),
      reviewers: reviewerAssignments(spec),
      expected_arithmetic: arithmetic,
      stop_conditions: [
        "denominator_or_fingerprint_drift",
        "new_source_or_acquisition_required",
        "canonical_observation_edit_required",
        "mixed_or_unclear_risk_outside_manifest",
        "identity_or_incidence_cannot_be_determined",
        "plural_route_by_plural_treatment_cross_product_not_explicitly_proved",
        "primary_and_independent_reviewers_disagree",
      ],
      provider_estimate: {
        execution_status: "not_authorized_without_numeric_owner_cap",
        estimate_basis:
          "UTF-8 review-packet bytes divided by four, two reviewers, 256 output tokens per candidate per reviewer",
        profile: "pioneer-deepseek-flash",
        provider: "pioneer",
        model: "deepseek-ai/DeepSeek-V4-Flash",
        request_count: requestCount,
        input_tokens_per_reviewer: inputTokensPerReviewer,
        output_token_allowance_per_reviewer: outputTokensPerReviewer,
        retry_allowance: 0,
        pricing_usd_per_million: { input: 0.1, output: 0.2 },
        estimated_cost_usd: estimatedCost,
        enforceable_campaign_cost_ceiling_usd: null,
      },
    };
    const relativePath = `${BATCH_RELATIVE}/${spec.batch_id}.json`;
    const content = json(manifest);
    files.set(relativePath, content);
    portfolioRows.push({
      batch_id: spec.batch_id,
      path: relativePath,
      sha256: sha256(content),
      candidate_count: candidateRows.length,
      observation_count: observationRows.length,
      starting_published_count: arithmetic.starting_published_count,
      starting_pending_review_count: arithmetic.starting_pending_review_count,
    });
  }
  const candidateIds = portfolioRows.flatMap((row) => {
    const content = files.get(String(row.path));
    const manifest = JSON.parse(content!) as { candidate_ids: string[] };
    return manifest.candidate_ids;
  });
  const observationIds = portfolioRows.flatMap((row) => {
    const content = files.get(String(row.path));
    const manifest = JSON.parse(content!) as {
      observation_event_record_ids: string[];
    };
    return manifest.observation_event_record_ids;
  });
  const portfolio = {
    schema_version: 1,
    contract_id: "plan-052-operational-episode-batch-portfolio-v1",
    plan_id: PLAN_ID,
    starting_commit_sha: STARTING_COMMIT,
    manifest_count: portfolioRows.length,
    candidate_count: candidateIds.length,
    observation_count: observationIds.length,
    candidate_partition_sha256: sha256(json([...candidateIds].sort())),
    observation_partition_sha256: sha256(json([...observationIds].sort())),
    ordered_portfolio_sha256: sha256(json(portfolioRows)),
    frozen_frontier_artifacts: frozenPins,
    starting_arithmetic: {
      observations: 1366,
      candidates: 766,
      published: 130,
      pending_candidates: 636,
      pending_segmentation_observations: 629,
      unresolved_active_identity_ids: 5,
      completeness_profile: "partial",
    },
    provider_budget: {
      existing_enforceable_ceiling_usd: null,
      estimated_campaign_cost_usd: Number(campaignEstimatedCost.toFixed(6)),
      paid_execution_authorized: false,
      incremental_provider_requests_executed: 0,
    },
    manifests: portfolioRows,
  };
  files.set(PORTFOLIO_RELATIVE, json(portfolio));
  return files;
}

function writeOrCheck(
  mode: "--write" | "--check",
  expected: Map<string, string>,
): void {
  if (mode === "--write") {
    for (const [path, content] of expected) {
      mkdirSync(dirname(absolute(path)), { recursive: true });
      writeFileSync(absolute(path), content, "utf8");
    }
    return;
  }
  const expectedPaths = [...expected.keys()].sort();
  const actualPaths: string[] = [];
  const visit = (relativeDir: string) => {
    for (const entry of readdirSync(absolute(relativeDir), {
      withFileTypes: true,
    })) {
      const path = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && basename(path) !== "README.md") actualPaths.push(path);
      else throw new Error(`unsupported Plan 052 campaign entry: ${path}`);
    }
  };
  visit(BATCH_RELATIVE);
  actualPaths.push(PORTFOLIO_RELATIVE);
  if (actualPaths.sort().join("\n") !== expectedPaths.join("\n")) {
    throw new Error("Plan 052 batch manifest file set is stale");
  }
  for (const [path, content] of expected) {
    if (!existsSync(absolute(path)) || readFileSync(absolute(path), "utf8") !== content) {
      throw new Error(`Plan 052 batch manifest is stale: ${path}`);
    }
  }
}

const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check") {
  throw new Error(
    "usage: bun scripts/freeze-plan052-operational-episode-batches.ts --write|--check",
  );
}
if (process.argv.length !== 3) throw new Error("unknown Plan 052 freeze arguments");
freezeInputFiles(mode);
const expected = expectedCampaignFiles();
writeOrCheck(mode, expected);
console.log(
  `Plan 052 batch portfolio ${mode === "--write" ? "frozen" : "verified"}: ` +
    `20 manifests, 766 candidates, 1366 observations.`,
);
