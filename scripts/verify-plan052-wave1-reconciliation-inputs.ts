import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { plan052BudgetState } from "./plan052-provider-budget";

const manifestRelative =
  "data/operational-episode-resolution/campaigns/plan-052/batches/w1-characterization.json";
const frozenCandidateRelative =
  "data/operational-episode-resolution/campaigns/plan-052/frozen-frontier/candidate_ledger.jsonl";
const frozenObservationRelative =
  "data/operational-episode-resolution/campaigns/plan-052/frozen-frontier/observation_ledger.jsonl";
const supplementRelative =
  "data/operational-episode-resolution/campaigns/plan-052/evidence-supplements/w1-broadway-q70-installed-v1.json";
const freshAdjudicationRelative =
  "data/operational-episode-resolution/campaigns/plan-052/review-receipts/w1-characterization/fresh-independent-adjudication.json";
const freshAdjudicationSha256 =
  "68816846ff3fe9064b57f3f7052c1d7a9302c3788d772fafa8cc68fc214d4263";
const reconciliationRelative =
  "data/operational-episode-resolution/campaigns/plan-052/reconciliation-receipts/wave-1-owner-adjudication-v1.json";
const representationRepairRelative =
  "data/operational-episode-resolution/campaigns/plan-052/reconciliation-receipts/wave-1-representation-repair-v1.json";
const positiveIntegrationRelative =
  "data/operational-episode-resolution/campaigns/plan-052/integration-receipts/wave-1-positive-occurrences.json";
const candidateId = "candidate:089c5dca117ab12f156ec032";
const candidateKey =
  "event:event_broadway-center-running-bus-lane-installation-confirmed";
const supplementEvidenceId =
  "nyc_dot_current_projects_july_2026#p001_b0631";
const originalEvidenceId =
  "nyc_mayor_broadway_created_june_2026#p001_b0114";

const immutableInputs = [
  {
    path: manifestRelative,
    sha256: "b96adbd4878a5abfae2cd9523c3534239195ea876dc0877fffc5abc8a99fbe7e",
  },
  {
    path:
      "data/operational-episode-resolution/campaigns/plan-052/review-receipts/w1-characterization/primary.json",
    sha256: "1ce0f2058aa2f4e0c9b179f724475498afc6b6f27e4fbcbbe49e2cf750e758c1",
  },
  {
    path:
      "data/operational-episode-resolution/campaigns/plan-052/review-receipts/w1-characterization/independent.json",
    sha256: "24e81ea5bfbfbfeabc6931858b4c316b43d2b8df2d792e6696a054cce5e6e5f3",
  },
  {
    path:
      "data/operational-episode-resolution/campaigns/plan-052/review-receipts/w1-characterization/disagreement.json",
    sha256: "ef07d3d72e98bf0e548c4faa04ac403ba873370fb45f43356c9b34cc539044c2",
  },
] as const;

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rows(relativePath: string): Array<{
  line: string;
  row: Record<string, unknown>;
}> {
  return readFileSync(absolute(relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) => ({
      line,
      row: object(
        JSON.parse(line) as unknown,
        `${relativePath}:${index + 1}`,
      ),
    }));
}

function rowBy(
  relativePath: string,
  field: string,
  id: string,
): {
  line: string;
  row: Record<string, unknown>;
} {
  const matches = rows(relativePath).filter(({ row }) => row[field] === id);
  if (matches.length !== 1) {
    throw new Error(
      `${relativePath} expected exactly one ${field}=${id}; found ${matches.length}`,
    );
  }
  return matches[0]!;
}

function block(relativePath: string, blockId: string): {
  text: string;
  textBytes: number;
  textSha256: string;
} {
  const marker = `[${blockId}] `;
  const matches = readFileSync(absolute(relativePath), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(marker));
  if (matches.length !== 1) {
    throw new Error(`${relativePath} expected one ${blockId}; found ${matches.length}`);
  }
  const text = matches[0]!.slice(marker.length);
  return {
    text,
    textBytes: Buffer.byteLength(text),
    textSha256: sha256(text),
  };
}

function evidenceIds(row: Record<string, unknown>, path: string): Set<string> {
  if (!Array.isArray(row.evidence_refs)) {
    throw new Error(`${path}.evidence_refs must be an array`);
  }
  return new Set(row.evidence_refs.map((value, index) => {
    const ref = object(value, `${path}.evidence_refs[${index}]`);
    if (typeof ref.evidence_id !== "string") {
      throw new Error(`${path}.evidence_refs[${index}].evidence_id is missing`);
    }
    return ref.evidence_id;
  }));
}

function expectPinnedRow(
  spec: {
    path: string;
    record_id: string;
    row_sha256: string;
  },
  requiredEvidenceId: string,
): Record<string, unknown> {
  const found = rowBy(spec.path, "record_id", spec.record_id);
  if (sha256(found.line) !== spec.row_sha256) {
    throw new Error(`${spec.path} ${spec.record_id} row hash drifted`);
  }
  if (!evidenceIds(found.row, spec.record_id).has(requiredEvidenceId)) {
    throw new Error(`${spec.record_id} is not bound to ${requiredEvidenceId}`);
  }
  return found.row;
}

function main(): void {
  for (const input of immutableInputs) {
    const actual = sha256(readFileSync(absolute(input.path)));
    if (actual !== input.sha256) {
      throw new Error(`${input.path} immutable hash drifted: ${actual}`);
    }
  }
  const supplement = object(
    JSON.parse(readFileSync(absolute(supplementRelative), "utf8")) as unknown,
    supplementRelative,
  );
  const manifest = object(supplement.manifest, `${supplementRelative}.manifest`);
  const candidate = object(supplement.candidate, `${supplementRelative}.candidate`);
  if (
    supplement.schema_version !== 1 ||
    supplement.contract_id !== "plan-052-versioned-evidence-supplement-v1" ||
    supplement.plan_id !== "plan-052" ||
    supplement.batch_id !== "w1-characterization" ||
    manifest.path !== manifestRelative ||
    manifest.sha256 !== immutableInputs[0]!.sha256 ||
    candidate.candidate_id !== candidateId ||
    candidate.candidate_key !== candidateKey ||
    supplement.new_external_source_acquired !== false ||
    supplement.canonical_observations_changed !== false ||
    supplement.frozen_manifest_changed !== false
  ) {
    throw new Error("Broadway supplement scope or immutable linkage drifted");
  }

  const frozenCandidate = rowBy(
    frozenCandidateRelative,
    "candidate_id",
    candidateId,
  );
  const frozenObservation = rowBy(
    frozenObservationRelative,
    "event_record_id",
    "event_broadway-center-running-bus-lane-installation-confirmed",
  );
  if (
    sha256(frozenCandidate.line) !== candidate.frozen_candidate_row_sha256 ||
    sha256(frozenObservation.line) !== candidate.frozen_observation_row_sha256 ||
    frozenCandidate.row.candidate_key !== candidateKey
  ) {
    throw new Error("Broadway frozen candidate/observation pins drifted");
  }

  for (
    const field of [
      ["supplemented_source", "p001_b0631"],
      ["original_source", "p001_b0114"],
    ] as const
  ) {
    const source = object(supplement[field[0]], `${supplementRelative}.${field[0]}`);
    const sourceFile = object(
      source.source_file,
      `${supplementRelative}.${field[0]}.source_file`,
    );
    const pinnedBlock = object(
      source.block,
      `${supplementRelative}.${field[0]}.block`,
    );
    const relativePath = String(sourceFile.path);
    const fileBytes = readFileSync(absolute(relativePath));
    const actualBlock = block(relativePath, field[1]);
    if (
      fileBytes.length !== sourceFile.bytes ||
      sha256(fileBytes) !== sourceFile.sha256 ||
      actualBlock.text !== pinnedBlock.text ||
      actualBlock.textBytes !== pinnedBlock.text_bytes ||
      actualBlock.textSha256 !== pinnedBlock.text_sha256
    ) {
      throw new Error(`${field[0]} source-file or block hash drifted`);
    }
  }

  const join = object(supplement.canonical_join, `${supplementRelative}.canonical_join`);
  const project = expectPinnedRow(
    object(join.project, `${supplementRelative}.canonical_join.project`) as {
      path: string;
      record_id: string;
      row_sha256: string;
    },
    supplementEvidenceId,
  );
  const routeSpec = object(
    join.route,
    `${supplementRelative}.canonical_join.route`,
  ) as {
    path: string;
    record_id: string;
    row_sha256: string;
    gtfs_route_id: string;
  };
  const route = expectPinnedRow(routeSpec, supplementEvidenceId);
  const treatment = expectPinnedRow(
    object(join.treatment, `${supplementRelative}.canonical_join.treatment`) as {
      path: string;
      record_id: string;
      row_sha256: string;
    },
    supplementEvidenceId,
  );
  if (
    project.record_kind !== "project" ||
    route.record_kind !== "route" ||
    treatment.record_kind !== "treatment_component" ||
    routeSpec.gtfs_route_id !== "Q70+"
  ) {
    throw new Error("Broadway supplement canonical subject kinds drifted");
  }
  const routeBinding = rowBy(
    "data/route-identity/accepted/v1/record-bindings.jsonl",
    "route_record_id",
    routeSpec.record_id,
  ).row;
  if (
    routeBinding.gtfs_route_id !== routeSpec.gtfs_route_id ||
    routeBinding.identity_scope !== "exact_service" ||
    routeBinding.projectable !== true
  ) {
    throw new Error("Broadway Q70+ exact route binding drifted");
  }

  const relations = join.relations;
  if (!Array.isArray(relations) || relations.length !== 3) {
    throw new Error("Broadway supplement must pin exactly three join relations");
  }
  const relationRows = relations.map((value, index) => {
    const spec = object(
      value,
      `${supplementRelative}.canonical_join.relations[${index}]`,
    ) as {
      path: string;
      record_id: string;
      row_sha256: string;
    };
    return expectPinnedRow(spec, supplementEvidenceId);
  });
  const semanticKeys = relationRows.map((row) => {
    const payload = object(row.payload, `${row.record_id}.payload`);
    return [
      payload.relation_kind,
      payload.subject_id,
      payload.object_id,
      payload.assertion_status,
    ].join("|");
  }).sort();
  const expected = [
    "has_treatment|project_broadway-bus-priority-2026|treatment_broadway-center-running-bus-lane|delivered",
    "serves_route|project_broadway-bus-priority-2026|route_q70-sbs|delivered",
    "has_treatment|route_q70-sbs|treatment_broadway-center-running-bus-lane|delivered",
  ].sort();
  if (semanticKeys.join("\n") !== expected.join("\n")) {
    throw new Error(
      `Broadway exact project/route/treatment join drifted:\n${semanticKeys.join("\n")}`,
    );
  }

  const originalEvent = rowBy(
    "data/canonical/events.jsonl",
    "record_id",
    "event_broadway-center-running-bus-lane-installation-confirmed",
  ).row;
  if (!evidenceIds(originalEvent, String(originalEvent.record_id)).has(originalEvidenceId)) {
    throw new Error("Broadway installed event lost its original mayor evidence");
  }

  const budget = plan052BudgetState();
  if (
    budget.ceiling_usd !== 1 ||
    budget.committed_cost_usd > 1 ||
    budget.settled_cost_usd !== 0 ||
    budget.provider_request_count !== 0
  ) {
    throw new Error("Plan 052 provider budget is not at the authorized no-cost state");
  }
  if (
    sha256(readFileSync(absolute(freshAdjudicationRelative))) !==
      freshAdjudicationSha256
  ) {
    throw new Error("Fresh independent Wave 1 adjudication hash drifted");
  }
  const adjudication = object(
    JSON.parse(
      readFileSync(absolute(freshAdjudicationRelative), "utf8"),
    ) as unknown,
    freshAdjudicationRelative,
  );
  if (
    adjudication.factual_contradiction_found !== false ||
    adjudication.data_model_gap_found !== true ||
    adjudication.stop_condition !==
      "data_model_cannot_encode_owner_ruling_without_inference" ||
    adjudication.integration_permitted !== false ||
    adjudication.wave_2_permitted !== false
  ) {
    throw new Error("Fresh independent adjudication no longer records the required STOP");
  }
  const reconciliation = object(
    JSON.parse(readFileSync(absolute(reconciliationRelative), "utf8")) as unknown,
    reconciliationRelative,
  );
  const reconciliationInputs = object(
    reconciliation.append_only_inputs,
    `${reconciliationRelative}.append_only_inputs`,
  );
  const linkedAdjudication = object(
    reconciliationInputs.fresh_independent_adjudication,
    `${reconciliationRelative}.append_only_inputs.fresh_independent_adjudication`,
  );
  if (
    reconciliation.contract_id !==
      "plan-052-wave1-owner-reconciliation-v1" ||
    linkedAdjudication.path !== freshAdjudicationRelative ||
    linkedAdjudication.sha256 !== freshAdjudicationSha256 ||
    reconciliation.integration_status !==
      "stopped_before_wave1_semantic_writes" ||
    reconciliation.wave_2_status !== "not_started" ||
    reconciliation.owner_decision_required !== true
  ) {
    throw new Error("Wave 1 reconciliation STOP receipt is stale");
  }
  const representationRepair = object(
    JSON.parse(
      readFileSync(absolute(representationRepairRelative), "utf8"),
    ) as unknown,
    representationRepairRelative,
  );
  const historicalStop = object(
    representationRepair.historical_stop_receipt,
    `${representationRepairRelative}.historical_stop_receipt`,
  );
  const positiveIntegration = object(
    representationRepair.positive_integration_receipt,
    `${representationRepairRelative}.positive_integration_receipt`,
  );
  const resolution = object(
    representationRepair.resolution,
    `${representationRepairRelative}.resolution`,
  );
  if (
    representationRepair.contract_id !==
      "plan-052-wave1-representation-repair-v1" ||
    historicalStop.path !== reconciliationRelative ||
    historicalStop.sha256 !==
      sha256(readFileSync(absolute(reconciliationRelative))) ||
    positiveIntegration.path !== positiveIntegrationRelative ||
    positiveIntegration.sha256 !==
      sha256(readFileSync(absolute(positiveIntegrationRelative))) ||
    resolution.factual_contradiction_found !== false ||
    resolution.frozen_denominator_changed !== false ||
    resolution.canonical_observations_changed !== false ||
    resolution.representation_gap_repaired_in_scope !== true ||
    resolution.historical_route_continuity_preserved !== true ||
    resolution.integration_permitted !== true ||
    resolution.wave_2_permitted !== true
  ) {
    throw new Error(
      "Wave 1 append-only representation repair authority is missing or stale",
    );
  }
  const currentArtifacts = [
    "data/quality/operational-episode-frontier/v1/cohort.json",
    "data/quality/operational-episode-frontier/v1/observation_ledger.jsonl",
    "data/quality/operational-episode-frontier/v1/candidate_ledger.jsonl",
    "data/quality/operational-episode-frontier/v1/summary.json",
  ] as const;
  const currentArtifactPointers = currentArtifacts.map((path) => ({
    path,
    sha256: sha256(readFileSync(absolute(path))),
  }));
  const currentSummary = object(
    JSON.parse(readFileSync(
      absolute("data/quality/operational-episode-frontier/v1/summary.json"),
      "utf8",
    )) as unknown,
    "current operational episode frontier summary",
  );
  if (
    currentSummary.observation_ledger_rows !== 1366 ||
    currentSummary.candidate_ledger_rows !== 766 ||
    currentSummary.published_distinct_occurrence_ids !== 135 ||
    currentSummary.invalid_count !== 0 ||
    currentSummary.unresolved_active_identity_ids !== 0 ||
    currentSummary.completeness_profile !== "partial"
  ) {
    throw new Error("current frontier arithmetic is stale after Wave 1 repair");
  }
  const expectedPublished = new Map([
    ["candidate:00a57691fb4583cceadb9be0", "occurrence:184e8d4319dd4fd1e15eef93"],
    ["candidate:0065d35d05693332aeb8b1ef", "occurrence:96b33d493a0743d2d0d90470"],
    ["candidate:002e8ac7107b222e82e03c82", "occurrence:2137dc5b364cf4d9a8cd6392"],
    ["candidate:089c5dca117ab12f156ec032", "occurrence:b9cdb2271eacb4ebf7888b00"],
  ]);
  const currentCandidates = rows(
    "data/quality/operational-episode-frontier/v1/candidate_ledger.jsonl",
  );
  for (const [publishedCandidateId, occurrenceId] of expectedPublished) {
    const matches = currentCandidates.filter(({ row }) =>
      row.candidate_id === publishedCandidateId
    );
    if (
      matches.length !== 1 ||
      matches[0]!.row.disposition !== "published" ||
      matches[0]!.row.published_occurrence_id !== occurrenceId
    ) {
      throw new Error(
        `${publishedCandidateId} is not the repaired published occurrence`,
      );
    }
  }
  console.log(JSON.stringify({
    status: "verified",
    immutable_wave1_inputs: immutableInputs,
    supplement_path: supplementRelative,
    supplement_sha256: sha256(readFileSync(absolute(supplementRelative))),
    candidate_id: candidateId,
    exact_route_id: "Q70+",
    exact_treatment_id: "treatment_broadway-center-running-bus-lane",
    installed_by: "2026-06-10",
    exact_onset: null,
    fresh_adjudication: {
      path: freshAdjudicationRelative,
      sha256: freshAdjudicationSha256,
      integration_permitted: false,
      wave_2_permitted: false,
      historical_stop_preserved: true,
    },
    reconciliation_path: reconciliationRelative,
    representation_repair_path: representationRepairRelative,
    current_frontier: currentArtifactPointers,
    provider_budget: budget,
  }, null, 2));
}

main();
