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
import { loadOperationalOccurrenceCurrentReviewDecisions } from "../packages/pipeline/src/materialize/operational-occurrence-resolution";

const PLAN_ID = "plan-053";
const STARTING_COMMIT = "f29cc5e3ee27dd4411405693e3474af4fb2c217e";
const CAMPAIGN_RELATIVE =
  "data/operational-application-semantics/campaigns/plan-053";
const FROZEN_RELATIVE = `${CAMPAIGN_RELATIVE}/frozen-cohort`;
const BATCH_RELATIVE = `${CAMPAIGN_RELATIVE}/batches`;
const PORTFOLIO_RELATIVE = `${CAMPAIGN_RELATIVE}/portfolio.json`;

const BASELINE_INPUTS = {
  applications: "data/resolved-transit/operator/v1/interventions/applications.jsonl",
  episodes: "data/resolved-transit/operator/v1/interventions/episodes.jsonl",
  public_keys: "data/resolved-transit/operator/v1/public-display/public_keys.jsonl",
  placement_candidates:
    "data/resolved-transit/operator/v1/placements/candidate_ledger.jsonl",
  placement_summary: "data/resolved-transit/operator/v1/placements/summary.json",
} as const;

type Application = {
  action: string;
  application_id: string;
  evidence_bindings: EvidenceBinding[];
  extent: { description: string | null; kind: string; record_ids: string[] };
  gtfs_route_id: string;
  occurrence_id: string;
  phase_record_id: string | null;
  review_decision_id: string;
  route_record_id: string;
  treatment_family: string;
  treatment_record_id: string;
};

type EvidenceBinding = {
  evidence_id: string;
  record_id: string;
  role: string;
  source_id: string;
};

type PublicKeyRow = {
  key_kind: string;
  operation: string;
  operation_id: string;
  public_key: string;
  subject_id: string;
};

type EvidencePin = EvidenceBinding & {
  canonical_record_sha256: string;
  block_text_sha256: string;
};

type CohortRow = {
  schema_version: 1;
  application_id: string;
  occurrence_id: string;
  incidence: {
    route_record_id: string;
    gtfs_route_id: string;
    treatment_record_id: string;
    treatment_family: string;
    phase_record_id: string | null;
  };
  predecessor: {
    decision_id: string;
    membership_fingerprint: string;
    schema_version: number;
    path: string;
    sha256: string;
  };
  starting_claim: {
    action: string;
    extent: Application["extent"];
  };
  public_lookup: {
    public_key: string;
    public_key_aliases: string[];
    operation_ids: string[];
  };
  evidence_pins: EvidencePin[];
  risk_classes: string[];
  cohort_row_sha256: string;
};

type Artifact = { path: string; bytes: number; sha256: string };

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}

function jsonl(values: readonly unknown[]): string {
  return values.length > 0
    ? `${values.map((value) => stableJson(value as JsonValue)).join("\n")}\n`
    : "";
}

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}

function readJsonl<T>(relativePath: string): T[] {
  const text = readFileSync(absolute(relativePath), "utf8").trim();
  return text
    ? text.split("\n").map((line) => JSON.parse(line) as T)
    : [];
}

function artifact(relativePath: string): Artifact {
  const bytes = readFileSync(absolute(relativePath));
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

function frozenPath(key: keyof typeof BASELINE_INPUTS): string {
  const source = BASELINE_INPUTS[key];
  return `${FROZEN_RELATIVE}/${basename(source)}`;
}

function freezeBaseline(mode: "--write" | "--check"): void {
  for (const key of Object.keys(BASELINE_INPUTS) as Array<keyof typeof BASELINE_INPUTS>) {
    const target = frozenPath(key);
    if (mode === "--write") {
      const content = readFileSync(absolute(BASELINE_INPUTS[key]));
      if (existsSync(absolute(target))) {
        const prior = readFileSync(absolute(target));
        if (!prior.equals(content)) {
          throw new Error(`refusing to rewrite frozen Plan 053 baseline: ${target}`);
        }
      } else {
        mkdirSync(dirname(absolute(target)), { recursive: true });
        writeFileSync(absolute(target), content);
      }
    } else if (!existsSync(absolute(target))) {
      throw new Error(`missing frozen Plan 053 baseline: ${target}`);
    }
  }
}

function decisionPath(decision: { decision_id: string; schema_version: number }): string {
  return decision.schema_version === 2
    ? `data/operational-occurrence-review/accepted-v2/decisions/${decision.decision_id}.json`
    : `data/operational-occurrence-review/accepted-current/decisions/${decision.decision_id}.json`;
}

function sourcePagePins(sourceIds: readonly string[]): Artifact[] {
  return [...new Set(sourceIds)].sort().map((sourceId) => {
    const path = `wiki/sources/${sourceId}.md`;
    if (!existsSync(absolute(path))) {
      throw new Error(`missing source page for Plan 053 evidence: ${path}`);
    }
    return artifact(path);
  });
}

function balancedChunks<T>(values: readonly T[], count: number): T[][] {
  if (values.length < count) throw new Error("cannot create empty Plan 053 batch");
  const base = Math.floor(values.length / count);
  const remainder = values.length % count;
  const result: T[][] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    result.push(values.slice(cursor, cursor + size));
    cursor += size;
  }
  return result;
}

function batchSpecs(applications: readonly Application[]): Array<{
  batch_id: string;
  evidence_shape: string;
  applications: Application[];
}> {
  const sorted = [...applications].sort((left, right) =>
    [
      left.evidence_bindings[0]?.source_id ?? "",
      left.treatment_record_id,
      left.application_id,
    ].join("|").localeCompare([
      right.evidence_bindings[0]?.source_id ?? "",
      right.treatment_record_id,
      right.application_id,
    ].join("|"))
  );
  const boarding = sorted.filter((row) => row.treatment_family === "bus_stop_or_boarding");
  const service = sorted.filter((row) => row.treatment_family === "service_pattern");
  const fare = sorted.filter((row) => row.treatment_family === "fare_collection");
  const physical = sorted.filter((row) =>
    !["bus_stop_or_boarding", "service_pattern", "fare_collection"].includes(
      row.treatment_family,
    )
  );
  if (
    boarding.length !== 116 || service.length !== 162 || fare.length !== 30 ||
    physical.length !== 35
  ) {
    throw new Error(
      `Plan 053 grouping drift: boarding=${boarding.length}, service=${service.length}, ` +
      `fare=${fare.length}, physical=${physical.length}`,
    );
  }
  const result: Array<{
    batch_id: string;
    evidence_shape: string;
    applications: Application[];
  }> = [];
  const add = (
    prefix: string,
    evidenceShape: string,
    rows: readonly Application[],
    count: number,
  ) => {
    balancedChunks(rows, count).forEach((chunk, index) => {
      result.push({
        batch_id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
        evidence_shape: evidenceShape,
        applications: chunk,
      });
    });
  };
  add("boarding", "stop_and_boarding_change", boarding, 3);
  add("service-pattern", "route_service_pattern_change", service, 4);
  add("fare-collection", "fare_collection_change", fare, 1);
  add("physical-treatment", "physical_corridor_or_route_treatment", physical, 1);
  return result;
}

function expectedFiles(): Map<string, string> {
  const applications = readJsonl<Application>(frozenPath("applications"));
  if (applications.length !== 343) {
    throw new Error(`Plan 053 requires 343 starting applications, found ${applications.length}`);
  }
  const applicationIds = applications.map((row) => row.application_id).sort();
  if (new Set(applicationIds).size !== 343) {
    throw new Error("Plan 053 starting application ids are not unique");
  }
  const incidence = applications.map((row) => [
    row.occurrence_id,
    row.route_record_id,
    row.treatment_record_id,
    row.phase_record_id ?? "",
  ].join("|")).sort();
  if (new Set(incidence).size !== 343) {
    throw new Error("Plan 053 starting incidence multiset is not unique");
  }

  const records = readCanonicalRecordsFromJsonl();
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const heads = loadOperationalOccurrenceCurrentReviewDecisions();
  const headByOccurrence = new Map(heads.map((head) => [head.occurrence_id, head]));
  const publicKeys = readJsonl<PublicKeyRow>(frozenPath("public_keys"));
  const componentKeyByApplication = new Map(
    publicKeys
      .filter((row) => row.key_kind === "intervention_component")
      .map((row) => [row.subject_id, row]),
  );
  if (componentKeyByApplication.size !== 343) {
    throw new Error(
      `Plan 053 requires 343 component public keys, found ${componentKeyByApplication.size}`,
    );
  }

  const occurrenceShape = new Map<string, { routes: number; treatments: number }>();
  for (const row of applications) {
    const episodeRows = applications.filter((candidate) =>
      candidate.occurrence_id === row.occurrence_id
    );
    occurrenceShape.set(row.occurrence_id, {
      routes: new Set(episodeRows.map((candidate) => candidate.route_record_id)).size,
      treatments: new Set(episodeRows.map((candidate) => candidate.treatment_record_id)).size,
    });
  }

  const cohortRows: CohortRow[] = applications.map((application) => {
    const head = headByOccurrence.get(application.occurrence_id);
    if (!head || head.decision_id !== application.review_decision_id) {
      throw new Error(`starting predecessor head drift for ${application.application_id}`);
    }
    const predecessorPath = decisionPath(head);
    if (!existsSync(absolute(predecessorPath))) {
      throw new Error(`missing predecessor decision: ${predecessorPath}`);
    }
    const publicKey = componentKeyByApplication.get(application.application_id);
    if (!publicKey || publicKey.operation !== "establish_public_key") {
      throw new Error(`missing live public lookup for ${application.application_id}`);
    }
    const evidencePins: EvidencePin[] = application.evidence_bindings.map((binding) => {
      const record = recordsById.get(binding.record_id);
      if (!record) throw new Error(`missing canonical evidence record ${binding.record_id}`);
      const evidenceRef = record.evidence_refs.find((ref) =>
        ref.source_id === binding.source_id && ref.evidence_id === binding.evidence_id
      );
      if (!evidenceRef?.text_sha256) {
        throw new Error(
          `missing exact evidence hash for ${application.application_id}: ` +
          `${binding.record_id}|${binding.evidence_id}`,
        );
      }
      return {
        ...binding,
        canonical_record_sha256: sha256(stableJson(record as unknown as JsonValue)),
        block_text_sha256: evidenceRef.text_sha256.replace(/^sha256:/u, ""),
      };
    });
    const shape = occurrenceShape.get(application.occurrence_id)!;
    const risks = ["public_identity"];
    if (shape.routes > 1) risks.push("multi_route_episode");
    if (shape.treatments > 1) risks.push("plural_treatment_episode");
    if (shape.routes > 1 && shape.treatments > 1) risks.push("cross_product_risk");
    if (new Set(application.evidence_bindings.map((binding) => binding.source_id)).size > 1) {
      risks.push("cross_source_evidence");
    }
    if (application.action === "unknown") risks.push("unknown_action");
    if (application.extent.kind === "unknown") risks.push("scope_ambiguity");
    const withoutHash = {
      schema_version: 1 as const,
      application_id: application.application_id,
      occurrence_id: application.occurrence_id,
      incidence: {
        route_record_id: application.route_record_id,
        gtfs_route_id: application.gtfs_route_id,
        treatment_record_id: application.treatment_record_id,
        treatment_family: application.treatment_family,
        phase_record_id: application.phase_record_id,
      },
      predecessor: {
        decision_id: head.decision_id,
        membership_fingerprint: head.membership_fingerprint,
        schema_version: head.schema_version,
        path: predecessorPath,
        sha256: artifact(predecessorPath).sha256,
      },
      starting_claim: {
        action: application.action,
        extent: application.extent,
      },
      public_lookup: {
        public_key: publicKey.public_key,
        public_key_aliases: [],
        operation_ids: [publicKey.operation_id],
      },
      evidence_pins: evidencePins,
      risk_classes: risks.sort(),
    };
    return {
      ...withoutHash,
      cohort_row_sha256: sha256(stableJson(withoutHash as unknown as JsonValue)),
    };
  }).sort((left, right) => left.application_id.localeCompare(right.application_id));

  const files = new Map<string, string>();
  files.set(`${FROZEN_RELATIVE}/cohort.jsonl`, jsonl(cohortRows));

  const frozenArtifacts = (Object.keys(BASELINE_INPUTS) as Array<keyof typeof BASELINE_INPUTS>)
    .map((key) => artifact(frozenPath(key)));
  const cohortSummary = {
    schema_version: 1,
    contract_id: "plan-053-application-cohort-v1",
    plan_id: PLAN_ID,
    starting_commit_sha: STARTING_COMMIT,
    application_count: cohortRows.length,
    episode_count: new Set(cohortRows.map((row) => row.occurrence_id)).size,
    public_component_key_count: componentKeyByApplication.size,
    placement_candidate_count:
      readJsonl<Record<string, unknown>>(frozenPath("placement_candidates")).length,
    action_counts: Object.fromEntries(
      [...new Set(applications.map((row) => row.action))].sort().map((action) => [
        action,
        applications.filter((row) => row.action === action).length,
      ]),
    ),
    extent_counts: Object.fromEntries(
      [...new Set(applications.map((row) => row.extent.kind))].sort().map((kind) => [
        kind,
        applications.filter((row) => row.extent.kind === kind).length,
      ]),
    ),
    application_partition_sha256: sha256(json(applicationIds)),
    incidence_partition_sha256: sha256(json(incidence)),
    cohort_input_sha256: sha256(jsonl(cohortRows)),
    frozen_artifacts: frozenArtifacts,
    provider_usage: {
      provider_requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      committed_cost_usd: 0,
      actual_cost_usd: 0,
      paid_execution_authorized: false,
    },
  };
  files.set(`${FROZEN_RELATIVE}/cohort.json`, json(cohortSummary));

  const portfolioRows: Array<Record<string, unknown>> = [];
  const allBatchApplicationIds: string[] = [];
  for (const [executionOrder, spec] of batchSpecs(applications).entries()) {
    const rows = spec.applications
      .map((application) => cohortRows.find((row) =>
        row.application_id === application.application_id
      )!)
      .sort((left, right) => left.application_id.localeCompare(right.application_id));
    const recordIds = new Set(rows.flatMap((row) =>
      row.evidence_pins.map((pin) => pin.record_id)
    ));
    const evidenceRecords = [...recordIds].sort().map((recordId) => {
      const record = recordsById.get(recordId);
      if (!record) throw new Error(`missing manifest evidence record ${recordId}`);
      return record;
    });
    const sourceIds = rows.flatMap((row) =>
      row.evidence_pins.map((pin) => pin.source_id)
    );
    const sourcePins = sourcePagePins(sourceIds);
    const predecessorPins = [...new Map(rows.map((row) => [
      row.predecessor.path,
      {
        path: row.predecessor.path,
        sha256: row.predecessor.sha256,
        bytes: readFileSync(absolute(row.predecessor.path)).length,
      },
    ])).values()].sort((left, right) => left.path.localeCompare(right.path));
    const riskClasses = [...new Set(rows.flatMap((row) => row.risk_classes))].sort();
    const evidencePayload = {
      records: evidenceRecords as MtaCanonicalRecord[],
      source_page_pins: sourcePins,
    };
    const manifest = {
      schema_version: 1,
      contract_id: "plan-053-application-batch-manifest-v1",
      plan_id: PLAN_ID,
      batch_id: spec.batch_id,
      execution_order: executionOrder,
      evidence_shape: spec.evidence_shape,
      treatment_families: [...new Set(rows.map((row) =>
        row.incidence.treatment_family
      ))].sort(),
      starting_provenance: {
        commit_sha: STARTING_COMMIT,
        cohort_sha256: cohortSummary.cohort_input_sha256,
        application_partition_sha256: cohortSummary.application_partition_sha256,
        incidence_partition_sha256: cohortSummary.incidence_partition_sha256,
        frozen_artifacts: frozenArtifacts,
      },
      cohort_hashes: {
        application_membership_sha256: sha256(json(rows.map((row) =>
          row.application_id
        ))),
        incidence_membership_sha256: sha256(json(rows.map((row) =>
          row.incidence
        ))),
        predecessor_heads_sha256: sha256(json(rows.map((row) => row.predecessor))),
        evidence_input_sha256: sha256(json(evidencePayload)),
        batch_input_sha256: sha256(json(rows)),
      },
      application_ids: rows.map((row) => row.application_id),
      applications: rows,
      predecessor_decision_pins: predecessorPins,
      evidence_source_pins: sourcePins,
      evidence_records: evidenceRecords,
      risk_classes: riskClasses,
      reviewers: {
        primary_reviewer: `plan-053-primary-${spec.batch_id}`,
        required_independent_reviewer: `plan-053-independent-${spec.batch_id}`,
        independence_required: true,
        integrator: "plan-053-single-writer-integrator",
        disagreement_adjudicator: "plan-053-clean-room-adjudicator",
      },
      expected_arithmetic: {
        starting_application_count: rows.length,
        required_reviewed_application_count: rows.length,
        expected_current_head_count: rows.length,
        expected_incidence_count: rows.length,
        expected_added_application_count: 0,
        expected_removed_application_count: 0,
        starting_unknown_action_count: rows.filter((row) =>
          row.starting_claim.action === "unknown"
        ).length,
        starting_unknown_extent_count: rows.filter((row) =>
          row.starting_claim.extent.kind === "unknown"
        ).length,
      },
      stop_conditions: [
        "denominator_or_incidence_drift",
        "canonical_observation_edit_required",
        "new_source_or_acquisition_required",
        "paid_provider_required",
        "placement_or_current_state_inference",
        "identity_or_public_key_lineage_exception",
        "systemic_schema_defect",
      ],
      provider_usage: {
        provider_requests: 0,
        input_tokens: 0,
        output_tokens: 0,
        committed_cost_usd: 0,
        actual_cost_usd: 0,
        provider: null,
        model: null,
        profile: null,
      },
    };
    const path = `${BATCH_RELATIVE}/${spec.batch_id}.json`;
    const content = json(manifest);
    files.set(path, content);
    allBatchApplicationIds.push(...manifest.application_ids);
    portfolioRows.push({
      batch_id: spec.batch_id,
      path,
      sha256: sha256(content),
      application_count: rows.length,
      unknown_action_count: manifest.expected_arithmetic.starting_unknown_action_count,
      unknown_extent_count: manifest.expected_arithmetic.starting_unknown_extent_count,
      primary_reviewer: manifest.reviewers.primary_reviewer,
      required_independent_reviewer:
        manifest.reviewers.required_independent_reviewer,
    });
  }

  const sortedBatchIds = [...allBatchApplicationIds].sort();
  if (
    sortedBatchIds.length !== 343 ||
    new Set(sortedBatchIds).size !== 343 ||
    stableJson(sortedBatchIds as JsonValue) !== stableJson(applicationIds as JsonValue)
  ) {
    throw new Error("Plan 053 batch manifests do not partition the cohort exactly once");
  }
  const portfolio = {
    schema_version: 1,
    contract_id: "plan-053-application-batch-portfolio-v1",
    plan_id: PLAN_ID,
    starting_commit_sha: STARTING_COMMIT,
    manifest_count: portfolioRows.length,
    application_count: sortedBatchIds.length,
    episode_count: cohortSummary.episode_count,
    application_partition_sha256: cohortSummary.application_partition_sha256,
    incidence_partition_sha256: cohortSummary.incidence_partition_sha256,
    cohort_input_sha256: cohortSummary.cohort_input_sha256,
    batch_partition_sha256: sha256(json(sortedBatchIds)),
    ordered_portfolio_sha256: sha256(json(portfolioRows)),
    frozen_artifacts: frozenArtifacts,
    starting_arithmetic: {
      episodes: cohortSummary.episode_count,
      applications: 343,
      public_component_keys: 343,
      placement_candidates: cohortSummary.placement_candidate_count,
      unknown_actions: applications.filter((row) => row.action === "unknown").length,
      unknown_extents: applications.filter((row) => row.extent.kind === "unknown").length,
    },
    provider_usage: cohortSummary.provider_usage,
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
      if (existsSync(absolute(path)) && readFileSync(absolute(path), "utf8") !== content) {
        throw new Error(`refusing to rewrite frozen Plan 053 artifact: ${path}`);
      }
      writeFileSync(absolute(path), content, "utf8");
    }
    return;
  }
  const expectedPaths = [...expected.keys()].sort();
  const actualPaths: string[] = [];
  for (const entry of readdirSync(absolute(BATCH_RELATIVE), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      throw new Error(`unsupported Plan 053 batch entry: ${entry.name}`);
    }
    actualPaths.push(`${BATCH_RELATIVE}/${entry.name}`);
  }
  actualPaths.push(`${FROZEN_RELATIVE}/cohort.json`);
  actualPaths.push(`${FROZEN_RELATIVE}/cohort.jsonl`);
  actualPaths.push(PORTFOLIO_RELATIVE);
  if (actualPaths.sort().join("\n") !== expectedPaths.join("\n")) {
    throw new Error("Plan 053 frozen portfolio file set is stale");
  }
  for (const [path, content] of expected) {
    if (!existsSync(absolute(path)) || readFileSync(absolute(path), "utf8") !== content) {
      throw new Error(`Plan 053 frozen artifact is stale: ${path}`);
    }
  }
}

function checkFrozenPortfolio(): void {
  const cohortRows = readJsonl<CohortRow>(`${FROZEN_RELATIVE}/cohort.jsonl`);
  const cohort = JSON.parse(readFileSync(
    absolute(`${FROZEN_RELATIVE}/cohort.json`),
    "utf8",
  )) as {
    application_count: number;
    episode_count: number;
    frozen_artifacts: Artifact[];
    application_partition_sha256: string;
    incidence_partition_sha256: string;
    cohort_input_sha256: string;
  };
  const portfolio = JSON.parse(readFileSync(absolute(PORTFOLIO_RELATIVE), "utf8")) as {
    application_count: number;
    episode_count: number;
    manifest_count: number;
    application_partition_sha256: string;
    incidence_partition_sha256: string;
    cohort_input_sha256: string;
    manifests: Array<{ path: string; sha256: string; application_count: number }>;
  };
  if (
    cohortRows.length !== 343 || cohort.application_count !== 343 ||
    cohort.episode_count !== 157 || portfolio.application_count !== 343 ||
    portfolio.episode_count !== 157 || portfolio.manifest_count !== 9 ||
    new Set(cohortRows.map((row) => row.application_id)).size !== 343 ||
    new Set(cohortRows.map((row) => [
      row.occurrence_id,
      row.incidence.route_record_id,
      row.incidence.treatment_record_id,
      row.incidence.phase_record_id ?? "",
    ].join("|"))).size !== 343
  ) {
    throw new Error("Plan 053 frozen cohort denominator/incidence drift");
  }
  for (const row of cohortRows) {
    const { cohort_row_sha256: rowHash, ...projection } = row;
    if (rowHash !== sha256(stableJson(projection as unknown as JsonValue))) {
      throw new Error(`Plan 053 frozen cohort row hash drift: ${row.application_id}`);
    }
    if (artifact(row.predecessor.path).sha256 !== row.predecessor.sha256) {
      throw new Error(`Plan 053 frozen predecessor hash drift: ${row.application_id}`);
    }
  }
  for (const pin of cohort.frozen_artifacts) {
    const current = artifact(pin.path);
    if (current.sha256 !== pin.sha256 || current.bytes !== pin.bytes) {
      throw new Error(`Plan 053 frozen baseline hash drift: ${pin.path}`);
    }
  }
  if (
    portfolio.application_partition_sha256 !== cohort.application_partition_sha256 ||
    portfolio.incidence_partition_sha256 !== cohort.incidence_partition_sha256 ||
    portfolio.cohort_input_sha256 !== cohort.cohort_input_sha256
  ) {
    throw new Error("Plan 053 frozen portfolio/cohort partition drift");
  }
  const ids: string[] = [];
  for (const pin of portfolio.manifests) {
    if (artifact(pin.path).sha256 !== pin.sha256) {
      throw new Error(`Plan 053 frozen manifest hash drift: ${pin.path}`);
    }
    const manifest = JSON.parse(readFileSync(absolute(pin.path), "utf8")) as {
      application_ids: string[];
    };
    if (manifest.application_ids.length !== pin.application_count) {
      throw new Error(`Plan 053 frozen manifest arithmetic drift: ${pin.path}`);
    }
    ids.push(...manifest.application_ids);
  }
  if (
    ids.length !== 343 || new Set(ids).size !== 343 ||
    ids.sort().join("\n") !== cohortRows.map((row) => row.application_id).sort().join("\n")
  ) {
    throw new Error("Plan 053 frozen manifest partition drift");
  }
}

const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check") {
  throw new Error(
    "usage: bun scripts/freeze-plan053-application-semantics.ts --write|--check",
  );
}
if (process.argv.length !== 3) throw new Error("unknown Plan 053 freeze arguments");
freezeBaseline(mode);
if (mode === "--write") {
  writeOrCheck(mode, expectedFiles());
} else {
  checkFrozenPortfolio();
}
console.log(
  `Plan 053 application portfolio ${mode === "--write" ? "frozen" : "verified"}: ` +
    "9 manifests, 343 applications, 157 episodes, provider usage $0.",
);
