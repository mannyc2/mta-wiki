import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";

type PlainEvidence = {
  record_id: string;
  source_id: string;
  evidence_id: string;
};

type FrozenCandidate = {
  candidate_id: string;
  candidate_key: string;
  disposition: string;
  observation_event_record_ids: string[];
  observation_relation_record_ids: string[];
  evidence_bindings: PlainEvidence[];
};

const batchId = "w1-characterization";
const decidedAt = "2026-07-30T12:00:00.000Z";
const campaign =
  "data/operational-episode-resolution/campaigns/plan-052";
const manifestRelative = `${campaign}/batches/${batchId}.json`;
const primaryRelative = `${campaign}/review-receipts/${batchId}/primary.json`;
const independentRelative =
  `${campaign}/review-receipts/${batchId}/independent.json`;
const adjudicationRelative =
  `${campaign}/review-receipts/${batchId}/fresh-independent-adjudication.json`;
const reconciliationRelative =
  `${campaign}/reconciliation-receipts/wave-1-owner-adjudication-v1.json`;
const frozenCandidatesRelative =
  `${campaign}/frozen-frontier/candidate_ledger.jsonl`;
const decisionDir =
  "data/operational-episode-resolution/decisions/accepted-current";
const mappingDir =
  "data/operational-episode-resolution/adapters/accepted-current";

const specs = [
  {
    candidate_id: "candidate:1231d55f0a2a808692101b1c",
    disposition: "insufficient_evidence",
    rationale:
      "Both independent Wave 1 reviewers found only proposed, forward-looking Bx35 implementation evidence. The frozen cohort does not prove a realized route × treatment occurrence.",
    known_facts: [
      "The pinned February 2020 source describes a Bx35 implementation window in late spring through fall 2020.",
      "The source framing is proposed or forward-looking rather than evidence of completed implementation.",
    ],
    prohibited_inferences: [
      "Do not convert a proposed implementation window into a realized occurrence.",
      "Do not infer an exact route × treatment incidence from project-level context.",
    ],
    owner_adjudicated: false,
  },
  {
    candidate_id: "candidate:061d89f4090bae3d8d422e25",
    disposition: "insufficient_evidence",
    rationale:
      "Both independent Wave 1 reviewers found a planned Summer/Fall 2025 DeKalb/Lafayette implementation, not proof of completed operational work.",
    known_facts: [
      "The pinned December 2024 source describes DeKalb/Lafayette implementation planned for Summer/Fall 2025.",
      "The frozen evidence does not establish completion.",
    ],
    prohibited_inferences: [
      "Do not publish a planned implementation as realized.",
      "Do not infer route incidence or a treatment cross-product from corridor planning context.",
    ],
    owner_adjudicated: false,
  },
  {
    candidate_id: "candidate:028228114b28e6cee3ddd224",
    disposition: "insufficient_evidence",
    rationale:
      "Both independent Wave 1 reviewers found only a target 2012 SBS start in the frozen evidence, not proof that this candidate's implementation occurred.",
    known_facts: [
      "The pinned source states a target 2012 SBS start.",
      "The frozen candidate evidence does not prove delivered implementation.",
    ],
    prohibited_inferences: [
      "Do not turn a target date into a realized onset.",
      "Do not inherit route or treatment incidence from later SBS evidence.",
    ],
    owner_adjudicated: false,
  },
  {
    candidate_id: "candidate:02cad757a6d52baca3130545",
    disposition: "insufficient_evidence",
    rationale:
      "The owner-adjudicated Wave 1 review proves 2022 TSP installation at 37 Flatbush Avenue intersections but cannot prove exact route incidence in the frozen cohort.",
    known_facts: [
      "Transit signal priority was installed at 37 Flatbush Avenue intersections in 2022.",
      "The corridor, treatment, year, and pinned source evidence are preserved.",
      "The frozen evidence does not establish exact route incidence.",
    ],
    prohibited_inferences: [
      "Do not infer B41, B12, or any route cross-product.",
      "Do not use later bus-only-signal evidence to establish TSP incidence.",
    ],
    owner_adjudicated: true,
  },
  {
    candidate_id: "candidate:001098617ce238bef5e9cbc4",
    disposition: "outside_domain",
    rationale:
      "Both independent Wave 1 reviewers classify this LIRR-only New Year's Eve service event outside the bus route × treatment occurrence product.",
    known_facts: [],
    prohibited_inferences: [],
    owner_adjudicated: false,
  },
  {
    candidate_id: "candidate:000c6dc834dffa5ef7e98f7f",
    disposition: "outside_domain",
    rationale:
      "Both independent Wave 1 reviewers classify this rail platform and station-track infrastructure event outside the bus route × treatment occurrence product.",
    known_facts: [],
    prohibited_inferences: [],
    owner_adjudicated: false,
  },
  {
    candidate_id: "candidate:00d747ca94c86213e5c59992",
    disposition: "outside_domain",
    rationale:
      "Both independent Wave 1 reviewers classify this LIRR event-service occurrence outside the bus route × treatment occurrence product.",
    known_facts: [],
    prohibited_inferences: [],
    owner_adjudicated: false,
  },
  {
    candidate_id: "candidate:09d24ae40bf93ee46e8eb095",
    disposition: "outside_domain",
    rationale:
      "The owner-adjudicated Wave 1 ruling classifies the real administrative redesign restart outside the route × treatment operational product; it is not rejected as a false source event.",
    known_facts: [],
    prohibited_inferences: [],
    owner_adjudicated: true,
  },
] as const;

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}

function pointer(relativePath: string): { path: string; sha256: string } {
  const bytes = readFileSync(absolute(relativePath));
  return { path: relativePath, sha256: sha256(bytes) };
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function findingsByCandidate(
  relativePath: string,
): Map<string, Record<string, unknown>> {
  const input = object(
    JSON.parse(readFileSync(absolute(relativePath), "utf8")) as unknown,
    relativePath,
  );
  if (
    input.schema_version !== 1 ||
    input.contract_id !== "plan-052-semantic-review-receipt-v1" ||
    input.batch_id !== batchId ||
    input.review_complete !== true ||
    !Array.isArray(input.findings)
  ) {
    throw new Error(`${relativePath} is not a complete Wave 1 review receipt`);
  }
  const usage = object(input.provider_usage, `${relativePath}.provider_usage`);
  if (
    usage.provider_called !== false ||
    usage.request_count !== 0 ||
    usage.estimated_cost_usd !== 0 ||
    usage.actual_cost_usd !== 0
  ) {
    throw new Error(`${relativePath} does not preserve zero provider use`);
  }
  const manifest = pointer(manifestRelative);
  if (
    input.manifest_path !== manifest.path ||
    input.manifest_sha256 !== manifest.sha256
  ) {
    throw new Error(`${relativePath} has stale manifest authority`);
  }
  const result = new Map<string, Record<string, unknown>>();
  for (const [index, value] of input.findings.entries()) {
    const finding = object(value, `${relativePath}.findings[${index}]`);
    const candidateId = String(finding.candidate_id);
    if (result.has(candidateId)) {
      throw new Error(`${relativePath} has duplicate finding ${candidateId}`);
    }
    result.set(candidateId, finding);
  }
  return result;
}

function verifyAuthorities(): void {
  const primary = findingsByCandidate(primaryRelative);
  const independent = findingsByCandidate(independentRelative);
  for (const spec of specs) {
    const primaryDisposition = String(
      primary.get(spec.candidate_id)?.recommended_disposition,
    );
    const independentDisposition = String(
      independent.get(spec.candidate_id)?.recommended_disposition,
    );
    if (!spec.owner_adjudicated) {
      if (
        primaryDisposition !== spec.disposition ||
        independentDisposition !== spec.disposition
      ) {
        throw new Error(
          `${spec.candidate_id} no longer has exact original reviewer agreement`,
        );
      }
    }
  }
  const adjudication = object(
    JSON.parse(readFileSync(absolute(adjudicationRelative), "utf8")) as unknown,
    adjudicationRelative,
  );
  const reconciliation = object(
    JSON.parse(readFileSync(absolute(reconciliationRelative), "utf8")) as unknown,
    reconciliationRelative,
  );
  if (
    adjudication.batch_id !== batchId ||
    reconciliation.batch_id !== batchId
  ) {
    throw new Error("Wave 1 owner adjudication authority is stale");
  }
}

function frozenCandidates(): Map<string, FrozenCandidate> {
  const rows = readFileSync(absolute(frozenCandidatesRelative), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FrozenCandidate);
  return new Map(rows.map((row) => [row.candidate_id, row]));
}

function expectedFiles(): Map<string, string> {
  verifyAuthorities();
  const rows = frozenCandidates();
  const files = new Map<string, string>();
  const artifactPointers: Array<{
    candidate_id: string;
    decision: { path: string; sha256: string };
    evidence_gap: { path: string; sha256: string } | null;
    mapping: { path: string; sha256: string };
  }> = [];
  for (const spec of specs) {
    const row = rows.get(spec.candidate_id);
    if (
      !row ||
      row.disposition !== "pending_review" ||
      row.observation_event_record_ids.length !== 1 ||
      row.evidence_bindings.length === 0
    ) {
      throw new Error(`${spec.candidate_id} frozen candidate membership drifted`);
    }
    const suffix = spec.candidate_id.replace("candidate:", "");
    const decisionId = `plan-052-w1-terminal-${suffix}`;
    const mappingId = `plan-052-w1-mapping-${suffix}`;
    const gapRelative = spec.disposition === "insufficient_evidence"
      ? `${campaign}/evidence-gap-receipts/${batchId}/${suffix}.json`
      : null;
    let gapPointer: { path: string; sha256: string } | null = null;
    if (gapRelative) {
      const reviewReceipts = spec.owner_adjudicated
        ? [
            pointer(primaryRelative),
            pointer(independentRelative),
            pointer(adjudicationRelative),
            pointer(reconciliationRelative),
          ]
        : [pointer(primaryRelative), pointer(independentRelative)];
      const gapBytes = json({
        schema_version: 1,
        contract_id: "plan-052-evidence-gap-receipt-v1",
        plan_id: "plan-052",
        batch_id: batchId,
        candidate_id: row.candidate_id,
        candidate_key: row.candidate_key,
        disposition: "insufficient_evidence",
        evidence_bindings: row.evidence_bindings,
        known_facts: spec.known_facts,
        prohibited_inferences: spec.prohibited_inferences,
        manifest: pointer(manifestRelative),
        review_receipts: reviewReceipts,
        recorded_at: decidedAt,
      });
      files.set(gapRelative, gapBytes);
      gapPointer = { path: gapRelative, sha256: sha256(gapBytes) };
    }
    const decisionRelative = `${decisionDir}/${decisionId}.json`;
    const decisionBytes = json({
      schema_version: 1,
      decision_id: decisionId,
      candidate_key: row.candidate_key,
      disposition: spec.disposition,
      canonical_candidate_key: null,
      successor_occurrence_ids: [],
      reviewer: "plan-052-wave1-reconciled-dual-review",
      decided_at: decidedAt,
      rationale: spec.rationale,
      evidence_bindings: row.evidence_bindings,
      ...(gapPointer
        ? {
            evidence_gap_receipt_path: gapPointer.path,
            evidence_gap_receipt_sha256: gapPointer.sha256,
          }
        : {}),
    });
    files.set(decisionRelative, decisionBytes);
    const mappingRelative = `${mappingDir}/${mappingId}.json`;
    const mappingBytes = json({
      schema_version: 1,
      mapping_id: mappingId,
      adapter_id: "accepted_mapping_v1",
      observation_event_record_ids: row.observation_event_record_ids,
      observation_relation_record_ids: row.observation_relation_record_ids,
      candidate_keys: [row.candidate_key],
      occurrence_id: null,
      evidence_bindings: row.evidence_bindings,
      decision_id: decisionId,
      reviewer: "plan-052-single-frontier-integrator",
      reviewed_at: decidedAt,
      rationale:
        `Exact frozen observation membership is terminally accounted for as ${spec.disposition}; no occurrence identity or route incidence is inferred.`,
    });
    files.set(mappingRelative, mappingBytes);
    artifactPointers.push({
      candidate_id: row.candidate_id,
      decision: { path: decisionRelative, sha256: sha256(decisionBytes) },
      evidence_gap: gapPointer,
      mapping: { path: mappingRelative, sha256: sha256(mappingBytes) },
    });
  }
  const integrationRelative =
    `${campaign}/integration-receipts/wave-1-terminal-partition.json`;
  files.set(integrationRelative, json({
    schema_version: 1,
    contract_id: "plan-052-wave-integration-receipt-v1",
    plan_id: "plan-052",
    batch_id: batchId,
    partition: "terminal_nonpublication",
    integrated_at: decidedAt,
    integrator: "plan-052-single-frontier-integrator",
    manifest: pointer(manifestRelative),
    review_receipts: [
      pointer(primaryRelative),
      pointer(independentRelative),
      pointer(adjudicationRelative),
      pointer(reconciliationRelative),
    ],
    accepted_artifacts: artifactPointers,
    terminal_arithmetic: {
      accepted_candidate_count: specs.length,
      insufficient_evidence: specs.filter((spec) =>
        spec.disposition === "insufficient_evidence"
      ).length,
      outside_domain: specs.filter((spec) =>
        spec.disposition === "outside_domain"
      ).length,
      published: 0,
    },
    expected_global_after_regeneration: {
      candidate_total: 766,
      published: 131,
      retired: 4,
      insufficient_evidence: 4,
      outside_domain: 4,
      pending_review: 623,
      pending_segmentation_observations: 621,
      pending_count: 1244,
      invalid_count: 0,
      unresolved_active_identity_ids: 0,
    },
    quarantined_publishable_candidate_ids: [
      "candidate:089c5dca117ab12f156ec032",
      "candidate:0065d35d05693332aeb8b1ef",
      "candidate:002e8ac7107b222e82e03c82",
      "candidate:00a57691fb4583cceadb9be0",
    ],
    provider_usage: {
      request_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
    },
  }));
  return files;
}

function writeOrCheck(mode: "--write" | "--check", files: Map<string, string>): void {
  for (const [relativePath, content] of files) {
    const target = absolute(relativePath);
    if (mode === "--write") {
      if (existsSync(target)) {
        throw new Error(
          `Wave 1 terminal semantic artifact already exists: ${relativePath}`,
        );
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    } else if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      throw new Error(`Wave 1 terminal artifact is stale: ${relativePath}`);
    }
  }
}

const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check") {
  throw new Error(
    "usage: bun scripts/apply-plan052-wave1-terminal-partition.ts --write|--check",
  );
}
if (process.argv.length !== 3) throw new Error("unknown Wave 1 arguments");
const files = expectedFiles();
writeOrCheck(mode, files);
console.log(
  `Plan 052 Wave 1 terminal partition ${
    mode === "--write" ? "applied" : "verified"
  }: four insufficient-evidence, four outside-domain, zero inferred routes.`,
);
