import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { stableHash } from "@mta-wiki/db/stable-json";
import type { JsonObject, MtaCanonicalRecord, MtaSubmissionEntry, MtaSubmitObservationInput } from "@mta-wiki/db/types";
import { recordIdAssignmentsForMaterializableEntries } from "@mta-wiki/pipeline/materialize/materialize";
import {
  applyOperationalRecoveryProposal,
  buildOperationalRecoverySubmissionBatch,
  type OperationalRecoveryEntryFactory,
} from "@mta-wiki/pipeline/records/operational-recovery-apply";
import {
  operationalRecoveryProposalSubmissionInputs,
  parseOperationalRecoveryProposal,
  validateOperationalRecoveryJournal,
  validateOperationalRecoveryProposal,
  validateOperationalRecoveryProposalTree,
  type OperationalRecoveryObservationBundleProposal,
  type OperationalRecoveryProposal,
  type OperationalRecoveryRelationProposal,
  type OperationalRecoveryResolvedBlock,
} from "@mta-wiki/pipeline/records/operational-recovery-proposals";

const fingerprint = "a".repeat(64);
const gapId = "operational-coverage:fixture-gap";
const sourceId = "source_fixture";

function record(
  recordId: string,
  recordKind: MtaCanonicalRecord["record_kind"],
  payload: JsonObject = {},
  blockId = "b_rel",
): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: recordKind,
    source_id: sourceId,
    source_ids: [sourceId],
    local_observation_id: `local_${recordId}`,
    local_observation_ids: [`local_${recordId}`],
    display_name: recordId,
    payload,
    evidence_refs: [{
      source_id: sourceId,
      evidence_id: `${sourceId}#${blockId}`,
      source_path: `raw/sources/${sourceId}/blocks.jsonl`,
      page_number: 1,
      block_id: blockId,
      text_sha256: `sha256:${blockId}`,
      text_source: "raw_text",
    }],
    submission_ids: [`sub_${recordId}`],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-12T00:00:00.000Z",
  };
}

function canonicalFixture(): MtaCanonicalRecord[] {
  return [
    record("source_fixture_record", "source", { title: "Fixture source", publisher: "MTA" }),
    record("project_fixture", "project", { project_name: "Fixture project" }, "b_project"),
    record("treatment_fixture", "treatment_component", { treatment_kind: "bus lane" }),
  ];
}

function verifier() {
  return {
    reviewed_by: "adversarial-verifier",
    reviewed_at: "2026-07-12T01:00:00.000Z",
    verdict: "passed" as const,
    rationale: "The exact block supports the proposed endpoints without a cross-product inference.",
  };
}

function relationProposal(): OperationalRecoveryRelationProposal {
  return {
    schema_version: 1,
    proposal_id: "orp_fixture_relation",
    proposal_kind: "relation",
    corpus_fingerprint: fingerprint,
    gap_ids: [gapId],
    source_id: sourceId,
    review_state: "accepted",
    accepted_by: "owner-reviewer",
    accepted_at: "2026-07-12T02:00:00.000Z",
    provenance: {
      drafted_by: "curator",
      drafted_at: "2026-07-12T00:30:00.000Z",
      method: "manual_curation",
      verifier: verifier(),
    },
    rationale: "The source explicitly lists the treatment as part of this project.",
    proposed_relation: {
      relation_kind: "has_treatment",
      subject_record_id: "project_fixture",
      object_record_id: "treatment_fixture",
      assertion_status: "delivered",
      as_of_date: "2025-07",
      description: "Fixture project includes the bus-lane treatment.",
    },
    evidence_bindings: [{
      role: "relationship",
      record_id: "treatment_fixture",
      source_id: sourceId,
      evidence_id: `${sourceId}#b_rel`,
      block_id: "b_rel",
      source_quote: "The fixture project includes a bus lane treatment.",
    }],
  };
}

function observationProposal(): OperationalRecoveryObservationBundleProposal {
  return {
    schema_version: 1,
    proposal_id: "orp_fixture_observation",
    proposal_kind: "observation_bundle",
    corpus_fingerprint: fingerprint,
    gap_ids: [gapId],
    source_id: sourceId,
    review_state: "accepted",
    accepted_by: "owner-reviewer",
    accepted_at: "2026-07-12T03:00:00.000Z",
    provenance: {
      drafted_by: "curator",
      drafted_at: "2026-07-12T00:45:00.000Z",
      method: "manual_curation",
      verifier: verifier(),
    },
    rationale: "A post-event source gives a precise realized launch date.",
    observations: [{
      expected_record_id: "event_fixture-delivery-event",
      observation_kind: "event",
      local_observation_id: "fixture_delivery_event",
      label: "Fixture launch delivered",
      raw_text: "Launched July 1, 2025",
      payload: {
        event_kind: "launch",
        date_text: "July 1, 2025",
        date_normalized: "2025-07-01",
        date_precision: "day",
        event_family: "launch",
        lifecycle_phase: "launched",
      },
      evidence_bindings: [{
        role: "event_date",
        source_id: sourceId,
        evidence_id: `${sourceId}#b_event`,
        block_id: "b_event",
        source_quote: "The fixture project launched on July 1, 2025.",
      }],
    }],
    relations: [{
      local_observation_id: "fixture_delivery_timeline",
      label: "Fixture project has delivered launch",
      relation_kind: "has_timeline_event",
      subject: { record_id: "project_fixture" },
      object: { local_observation_id: "fixture_delivery_event" },
      assertion_status: "delivered",
      as_of_date: "2025-07-15",
      description: "Post-event source confirms delivery.",
      evidence_bindings: [{
        role: "relationship",
        source_id: sourceId,
        evidence_id: `${sourceId}#b_event`,
        block_id: "b_event",
        source_quote: "The fixture project launched on July 1, 2025.",
      }],
    }],
  };
}

const blockTexts = new Map([
  [`${sourceId}#b_project`, "The fixture project is described here."],
  [`${sourceId}#b_rel`, "The fixture project includes a bus lane treatment."],
  [`${sourceId}#b_event`, "The fixture project launched on July 1, 2025."],
  [`${sourceId}#b_route`, "The M86 route serves the fixture project."],
]);

function resolveBlock(source: string, block: string): OperationalRecoveryResolvedBlock | undefined {
  const rawText = blockTexts.get(`${source}#${block}`);
  return rawText ? { source_id: source, block_id: block, raw_text: rawText, raw_text_sha256: `sha256:${block}` } : undefined;
}

function context(records = canonicalFixture(), stage: "pending" | "resuming" | "applied" | "rejected" = "pending") {
  return {
    records,
    stage,
    current_corpus_fingerprint: fingerprint,
    known_gap_ids: new Set([gapId]),
    resolve_block: resolveBlock,
  } as const;
}

const fakeEntry: OperationalRecoveryEntryFactory = (
  runId: string,
  input: MtaSubmitObservationInput,
  submittedAt: string,
  additionalIssues: string[],
): MtaSubmissionEntry => {
  const toolArgs = structuredClone(input);
  const hash = stableHash(toolArgs as unknown as JsonObject);
  return {
    submission_id: `sub_${hash.slice(0, 16)}`,
    run_id: runId,
    submitted_at: submittedAt,
    tool_args_sha256: `sha256:${hash}`,
    schema_version: 2,
    tool_args: toolArgs,
    validation: { state: additionalIssues.length > 0 ? "rejected" : "accepted", issues: additionalIssues },
  };
};

function fakeRecordIdAssignments(entries: MtaSubmissionEntry[], retired: Set<string>) {
  return recordIdAssignmentsForMaterializableEntries(
    entries.filter((entry) => entry.validation.state === "accepted" && !retired.has(entry.submission_id)),
  );
}

function tempRoot(label: string): string {
  const root = join(tmpdir(), `mta-operational-recovery-${label}-${crypto.randomUUID()}`);
  mkdirSync(root, { recursive: true });
  return root;
}

function writeProposal(root: string, proposal: OperationalRecoveryProposal, kindDir: "relations" | "observations") {
  const path = join(root, "data", "operational-anchor-review", "proposed", kindDir, `${proposal.proposal_id}.json`);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(proposal)}\n`, "utf8");
  return path;
}

function appliedObservationRecords(): MtaCanonicalRecord[] {
  return [
    ...canonicalFixture(),
    record(
      "event_fixture-delivery-event",
      "event",
      { event_kind: "launch", event_family: "launch", lifecycle_phase: "launched", date_normalized: "2025-07-01" },
      "b_event",
    ),
    record(
      "relation_fixture-delivery",
      "relation",
      {
        relation_kind: "has_timeline_event",
        subject_id: "project_fixture",
        object_id: "event_fixture-delivery-event",
        assertion_status: "delivered",
        as_of_date: "2025-07-15",
      },
      "b_event",
    ),
  ];
}

function targetedRouteProposal(): OperationalRecoveryObservationBundleProposal {
  const proposal = structuredClone(observationProposal());
  proposal.proposal_id = "orp_fixture_targeted_route";
  proposal.rationale = "A route row augments an existing canonical route with source-local evidence.";
  proposal.observations[0] = {
    expected_record_id: "route_fixture",
    target_record_id: "route_fixture",
    observation_kind: "route",
    local_observation_id: "fixture_route_row",
    label: "M86 route row",
    payload: { route_id: "M86", route_name: "M86" },
    evidence_bindings: [{
      role: "route_scope",
      source_id: sourceId,
      evidence_id: `${sourceId}#b_route`,
      block_id: "b_route",
      source_quote: "The M86 route serves the fixture project.",
    }],
  };
  proposal.relations[0] = {
    local_observation_id: "fixture_project_route",
    label: "Fixture project affects M86",
    relation_kind: "affects_route",
    subject: { record_id: "project_fixture" },
    object: { local_observation_id: "fixture_route_row" },
    assertion_status: "delivered",
    as_of_date: "2025-07-15",
    evidence_bindings: [{
      role: "relationship",
      source_id: sourceId,
      evidence_id: `${sourceId}#b_route`,
      block_id: "b_route",
      source_quote: "The M86 route serves the fixture project.",
    }],
  };
  return proposal;
}

function targetedRouteRecord(): MtaCanonicalRecord {
  const target = record("route_fixture", "route", { route_id: "M86", route_name: "M86" }, "b_route");
  target.evidence_refs[0]!.role = "route_scope";
  target.evidence_refs[0]!.source_quote = "The M86 route serves the fixture project.";
  return target;
}

function targetedAppliedRecords(): MtaCanonicalRecord[] {
  return [
    ...canonicalFixture(),
    targetedRouteRecord(),
    record("relation_fixture-project-route", "relation", {
      relation_kind: "affects_route",
      subject_id: "project_fixture",
      object_id: "route_fixture",
      assertion_status: "delivered",
      as_of_date: "2025-07-15",
    }, "b_route"),
  ];
}

describe("operational recovery proposals", () => {
  it("strictly parses both proposal kinds and requires explicit accepted review plus a passed verifier", () => {
    expect(parseOperationalRecoveryProposal(relationProposal()).proposal_kind).toBe("relation");
    expect(parseOperationalRecoveryProposal(observationProposal()).proposal_kind).toBe("observation_bundle");

    expect(() => parseOperationalRecoveryProposal({ ...relationProposal(), surprise: true })).toThrow("unknown field");
    const missingAcceptedAt = { ...relationProposal() } as Record<string, unknown>;
    delete missingAcceptedAt.accepted_at;
    expect(() => parseOperationalRecoveryProposal(missingAcceptedAt)).toThrow("accepted_by and accepted_at");
    expect(() => parseOperationalRecoveryProposal({
      ...relationProposal(),
      provenance: { ...relationProposal().provenance, verifier: { ...verifier(), verdict: "refuted" } },
    })).toThrow("passed adversarial verifier");
  });

  it("validates exact canonical relation evidence and rejects cross-record, stale, and duplicate relations", () => {
    expect(validateOperationalRecoveryProposal(relationProposal(), context())).toEqual([]);

    const wrongRecord = structuredClone(relationProposal());
    wrongRecord.evidence_bindings[0]!.record_id = "project_fixture";
    expect(validateOperationalRecoveryProposal(wrongRecord, context()).join(" ")).toContain("not an exact canonical ref");

    const wrongQuote = structuredClone(relationProposal());
    wrongQuote.evidence_bindings[0]!.source_quote = "Text absent from the block.";
    expect(validateOperationalRecoveryProposal(wrongQuote, context()).join(" ")).toContain("source_quote is not present");

    const hashOnlyContext = {
      ...context(),
      resolve_block: (source: string, block: string) => ({ source_id: source, block_id: block, raw_text_sha256: `sha256:${block}` }),
    };
    expect(validateOperationalRecoveryProposal(relationProposal(), hashOnlyContext).join(" "))
      .toContain("source_quote cannot be verified");

    const hashMismatchContext = {
      ...context(),
      resolve_block: (source: string, block: string) => ({
        source_id: source,
        block_id: block,
        raw_text: blockTexts.get(`${source}#${block}`),
        raw_text_sha256: "sha256:different",
      }),
    };
    expect(validateOperationalRecoveryProposal(relationProposal(), hashMismatchContext).join(" "))
      .toContain("canonical evidence hash does not match");

    const stale = { ...relationProposal(), corpus_fingerprint: "b".repeat(64) };
    expect(validateOperationalRecoveryProposal(stale, context()).join(" ")).toContain("stale corpus_fingerprint");

    const existingRelation = record("relation_existing", "relation", {
      relation_kind: "has_treatment",
      subject_id: "project_fixture",
      object_id: "treatment_fixture",
    });
    expect(validateOperationalRecoveryProposal(relationProposal(), context([...canonicalFixture(), existingRelation])).join(" "))
      .toContain("relation already exists");

    const illegal = structuredClone(relationProposal());
    illegal.proposed_relation.subject_record_id = "treatment_fixture";
    expect(validateOperationalRecoveryProposal(illegal, context()).join(" ")).toContain("expects project|corridor|route");
  });

  it("keeps observation bundles source-local, collision-free, and endpoint-shaped", () => {
    const proposal = observationProposal();
    expect(validateOperationalRecoveryProposal(proposal, context())).toEqual([]);
    const inputs = operationalRecoveryProposalSubmissionInputs(proposal, canonicalFixture());
    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.create_new).toBe(true);
    expect(inputs[1]?.payload).toMatchObject({
      relation_kind: "has_timeline_event",
      subject_id: "project_fixture",
      object_local_observation_id: "fixture_delivery_event",
      assertion_status: "delivered",
    });

    const dangling = structuredClone(proposal);
    dangling.relations[0]!.object = { local_observation_id: "missing_local" };
    expect(validateOperationalRecoveryProposal(dangling, context()).join(" ")).toContain("unknown bundle local_observation_id");

    const crossProduct = structuredClone(proposal);
    crossProduct.relations[0]!.evidence_bindings = [{
      role: "relationship",
      source_id: sourceId,
      evidence_id: `${sourceId}#b_rel`,
      block_id: "b_rel",
      source_quote: "The fixture project includes a bus lane treatment.",
    }];
    expect(validateOperationalRecoveryProposal(crossProduct, context()).join(" ")).toContain("share an exact source block context");

    const collision = structuredClone(proposal);
    const records = [...canonicalFixture(), record("event_fixture-delivery-event", "event", {}, "b_event")];
    expect(validateOperationalRecoveryProposal(collision, context(records)).join(" ")).toContain("already exists");
  });

  it("strictly validates targeted observations against an existing same-kind canonical record", () => {
    const proposal = targetedRouteProposal();
    expect(parseOperationalRecoveryProposal(proposal).observations[0]?.target_record_id).toBe("route_fixture");
    expect(validateOperationalRecoveryProposal(proposal, context([...canonicalFixture(), targetedRouteRecord()]))).toEqual([]);

    const missing = structuredClone(proposal);
    missing.observations[0]!.target_record_id = "route_missing";
    expect(validateOperationalRecoveryProposal(missing, context()).join(" ")).toContain("target record route_missing does not exist");

    const wrongKind = structuredClone(proposal);
    wrongKind.observations[0]!.target_record_id = "project_fixture";
    wrongKind.observations[0]!.expected_record_id = "project_fixture";
    expect(validateOperationalRecoveryProposal(wrongKind, context()).join(" ")).toContain("has kind project, expected route");

    const nonGlobal = structuredClone(proposal);
    nonGlobal.observations[0]!.observation_kind = "event";
    expect(validateOperationalRecoveryProposal(nonGlobal, context([...canonicalFixture(), targetedRouteRecord()])).join(" "))
      .toContain("target_record_id is supported only for global record kinds");
    expect(() => operationalRecoveryProposalSubmissionInputs(nonGlobal, [...canonicalFixture(), targetedRouteRecord()]))
      .toThrow("cannot target a non-global event record");

    const mismatchedExpected = structuredClone(proposal);
    mismatchedExpected.observations[0]!.expected_record_id = "route_other";
    expect(validateOperationalRecoveryProposal(mismatchedExpected, context([...canonicalFixture(), targetedRouteRecord()])).join(" "))
      .toContain("must equal target_record_id");

    expect(() => parseOperationalRecoveryProposal({
      ...proposal,
      observations: [{ ...proposal.observations[0], unexpected: true }],
    })).toThrow("unknown field");
  });

  it("converts targeted observations without create_new and preserves the local relation endpoint", () => {
    const proposal = targetedRouteProposal();
    const inputs = operationalRecoveryProposalSubmissionInputs(proposal, [...canonicalFixture(), targetedRouteRecord()]);
    expect(inputs[0]).toMatchObject({ target_record_id: "route_fixture" });
    expect(inputs[0]?.create_new).toBeUndefined();
    expect(inputs[1]?.payload).toMatchObject({ object_local_observation_id: "fixture_route_row" });

    const projectEntry = fakeEntry("fixture_project", {
      source_id: sourceId,
      observation_kind: "project",
      local_observation_id: "project_fixture",
      target_record_id: "project_fixture",
      label: "Fixture project",
      payload: { project_name: "Fixture project" },
      evidence_refs: [{ source_id: sourceId, block_id: "b_project", evidence_id: `${sourceId}#b_project` }],
    }, "2026-07-12T03:00:00.000Z", []);
    const targetEntry = fakeEntry("fixture_target", inputs[0]!, "2026-07-12T03:00:01.000Z", []);
    const relationEntry = fakeEntry("fixture_target_relation", inputs[1]!, "2026-07-12T03:00:02.000Z", []);
    const materialized = recordIdAssignmentsForMaterializableEntries([projectEntry, targetEntry, relationEntry]);
    expect(materialized.values()).toContain("route_fixture");
  });

  it("requires exact targeted evidence during resume/apply and keeps targeted journals tamper-evident", () => {
    const proposal = targetedRouteProposal();
    const recordsWithoutNewEvidence = [
      ...canonicalFixture(),
      record("route_fixture", "route", { route_id: "M86", route_name: "M86" }, "b_rel"),
    ];
    expect(validateOperationalRecoveryProposal(proposal, context(recordsWithoutNewEvidence, "resuming"))).toEqual([]);
    expect(validateOperationalRecoveryProposal(proposal, context(recordsWithoutNewEvidence, "applied")).join(" "))
      .toContain("exact evidence is not materialized on target route_fixture");
    expect(validateOperationalRecoveryProposal(proposal, context(targetedAppliedRecords(), "applied"))).toEqual([]);

    const records = [...canonicalFixture(), targetedRouteRecord()];
    const tamperedEvidence = structuredClone(records);
    tamperedEvidence.find((record) => record.record_id === "route_fixture")!.evidence_refs[0]!.source_quote = "A different quote.";
    expect(validateOperationalRecoveryProposal(proposal, context(tamperedEvidence, "applied")).join(" "))
      .toContain("exact evidence is not materialized on target route_fixture");

    const tamperedRole = structuredClone(records);
    tamperedRole.find((record) => record.record_id === "route_fixture")!.evidence_refs[0]!.role = "different_role";
    expect(validateOperationalRecoveryProposal(proposal, context(tamperedRole, "applied")).join(" "))
      .toContain("exact evidence is not materialized on target route_fixture");

    const tamperedHash = structuredClone(records);
    tamperedHash.find((record) => record.record_id === "route_fixture")!.evidence_refs[0]!.text_sha256 = "sha256:different";
    expect(validateOperationalRecoveryProposal(proposal, context(tamperedHash, "applied")).join(" "))
      .toContain("canonical evidence hash does not match the resolved source block");

    const batch = buildOperationalRecoverySubmissionBatch(proposal, records, fakeEntry);
    const entries = batch.journal_content.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    (entries[0]!.tool_args as Record<string, unknown>).target_record_id = "route_tampered";
    expect(() => validateOperationalRecoveryJournal(
      `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "targeted-journal.jsonl",
      proposal,
      records,
      fakeEntry,
    )).toThrow("differs from the exact proposal-derived submission");
    expect(buildOperationalRecoverySubmissionBatch(proposal, records, fakeEntry)).toEqual(batch);
  });

  it("converts accepted proposals into deterministic, provenance-bearing accepted journal entries", () => {
    const first = buildOperationalRecoverySubmissionBatch(observationProposal(), canonicalFixture(), fakeEntry);
    const second = buildOperationalRecoverySubmissionBatch(observationProposal(), canonicalFixture(), fakeEntry);
    expect(first).toEqual(second);
    expect(first.entries).toHaveLength(2);
    expect(first.entries.every((entry) => entry.validation.state === "accepted")).toBe(true);
    expect(first.entries.every((entry) => entry.recovery_provenance?.proposal_id === "orp_fixture_observation")).toBe(true);
    expect(first.entries.every((entry) => entry.recovery_provenance?.accepted_by === "owner-reviewer")).toBe(true);
    expect(first.proposal_sha256).toMatch(/^sha256:[a-f0-9]{64}$/u);

  });

  it("rejects every persisted journal field not exactly derived from the accepted proposal", () => {
    const proposal = observationProposal();
    const batch = buildOperationalRecoverySubmissionBatch(proposal, canonicalFixture(), fakeEntry);
    const rawEntries = batch.journal_content.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    const mutations: Array<(entries: Record<string, unknown>[]) => void> = [
      (entries) => { entries[0]!.unexpected = true; },
      (entries) => { (entries[0]!.tool_args as Record<string, unknown>).target_record_id = "event_injected"; },
      (entries) => { ((entries[0]!.tool_args as Record<string, unknown>).payload as Record<string, unknown>).injected = true; },
      (entries) => { delete (entries[0]!.tool_args as Record<string, unknown>).raw_text; },
      (entries) => { entries[0]!.tool_args_sha256 = "sha256:tampered"; },
    ];
    for (const mutate of mutations) {
      const entries = structuredClone(rawEntries);
      mutate(entries);
      const content = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
      expect(() => validateOperationalRecoveryJournal(
        content,
        "fixture-journal.jsonl",
        proposal,
        canonicalFixture(),
        fakeEntry,
      )).toThrow("differs from the exact proposal-derived submission");
    }
  });

  it("validates the complete proposed/applied/rejected tree and reports malformed files through one lane", () => {
    const root = tempRoot("tree");
    try {
      const proposal = relationProposal();
      writeProposal(root, proposal, "relations");
      const valid = validateOperationalRecoveryProposalTree({
        rootDir: root,
        records: canonicalFixture(),
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
        resolveBlock,
      });
      expect(valid.issues).toEqual([]);
      expect(valid.proposals.map((artifact) => artifact.proposal.proposal_id)).toEqual([proposal.proposal_id]);

      const duplicate = { ...proposal, proposal_id: "orp_fixture_relation_duplicate" };
      const duplicatePath = writeProposal(root, duplicate, "relations");
      const duplicateReport = validateOperationalRecoveryProposalTree({
        rootDir: root,
        records: canonicalFixture(),
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
        resolveBlock,
      });
      expect(duplicateReport.issues.map((issue) => issue.message).join(" ")).toContain("duplicate pending recovery claim");
      rmSync(duplicatePath);

      const path = join(root, "data", "operational-anchor-review", "proposed", "relations", `${proposal.proposal_id}.json`);
      writeFileSync(path, `${JSON.stringify({ ...proposal, unknown: true })}\n`, "utf8");
      const invalid = validateOperationalRecoveryProposalTree({
        rootDir: root,
        records: canonicalFixture(),
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
        resolveBlock,
      });
      expect(invalid.issues).toHaveLength(1);
      expect(invalid.issues[0]?.code).toBe("invalid_relation_proposal");
      expect(invalid.issues[0]?.message).toContain("unknown field");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts an unreviewed draft without requiring an accepted recovery run id", () => {
    const root = tempRoot("draft");
    try {
      const draft = structuredClone(relationProposal());
      draft.review_state = "proposed";
      delete draft.accepted_by;
      delete draft.accepted_at;
      writeProposal(root, draft, "relations");
      const report = validateOperationalRecoveryProposalTree({
        rootDir: root,
        records: canonicalFixture(),
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
        resolveBlock,
      });
      expect(report.issues).toEqual([]);
      expect(report.proposals[0]?.proposal.review_state).toBe("proposed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects orphaned or provenance-free recovery journals even when no proposal artifact remains", () => {
    const root = tempRoot("orphan-journal");
    try {
      const proposal = observationProposal();
      const batch = buildOperationalRecoverySubmissionBatch(proposal, canonicalFixture(), fakeEntry);
      const journalPath = join(root, "data", "submissions", `${batch.run_id}.jsonl`);
      mkdirSync(join(journalPath, ".."), { recursive: true });
      writeFileSync(journalPath, batch.journal_content, "utf8");
      const orphan = validateOperationalRecoveryProposalTree({
        rootDir: root,
        records: canonicalFixture(),
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
        resolveBlock,
        createEntry: fakeEntry,
      });
      expect(orphan.issues.map((issue) => issue.message).join(" ")).toContain("orphaned recovery journal");

      const withoutProvenance = fakeEntry(
        "legacy",
        {
          source_id: sourceId,
          observation_kind: "event",
          local_observation_id: "legacy_event",
          payload: { event_kind: "launch" },
        },
        "2026-07-12T00:00:00.000Z",
        [],
      );
      writeFileSync(journalPath, `${JSON.stringify(withoutProvenance)}\n`, "utf8");
      const missingProvenance = validateOperationalRecoveryProposalTree({
        rootDir: root,
        records: canonicalFixture(),
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
        resolveBlock,
        createEntry: fakeEntry,
      });
      expect(missingProvenance.issues.map((issue) => issue.message).join(" ")).toContain("has no recovery_provenance");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires an applied proposal to retain its provenance-bound recovery journal", () => {
    const root = tempRoot("applied-journal");
    try {
      const proposal = relationProposal();
      const path = join(
        root,
        "data",
        "operational-anchor-review",
        "proposed",
        "applied",
        "relations",
        `${proposal.proposal_id}.json`,
      );
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, `${JSON.stringify(proposal)}\n`, "utf8");
      const appliedRelation = record("relation_applied", "relation", {
        relation_kind: "has_treatment",
        subject_id: "project_fixture",
        object_id: "treatment_fixture",
      });
      const report = validateOperationalRecoveryProposalTree({
        rootDir: root,
        records: [...canonicalFixture(), appliedRelation],
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
        resolveBlock,
      });
      expect(report.issues.map((issue) => issue.message).join(" ")).toContain("applied recovery proposal is missing journal");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("applies once, preserves append-only provenance, moves only after verification, and no-ops on retry", () => {
    const root = tempRoot("apply");
    let currentRecords = canonicalFixture();
    let materializeCalls = 0;
    try {
      const proposal = observationProposal();
      writeProposal(root, proposal, "observations");
      const first = applyOperationalRecoveryProposal(proposal.proposal_id, {
        rootDir: root,
        force: true,
        records: currentRecords,
        readRecords: () => currentRecords,
        materialize: () => {
          materializeCalls += 1;
          currentRecords = appliedObservationRecords();
        },
        refreshCoverage: () => {},
        createEntry: fakeEntry,
        recordIdAssignments: fakeRecordIdAssignments,
        resolveBlock,
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
      });
      expect(first.wrote_journal).toBe(true);
      expect(first.materialized).toBe(true);
      expect(first.moved_to_applied).toBe(true);
      expect(materializeCalls).toBe(1);
      expect(existsSync(join(root, first.journal_path))).toBe(true);
      const journal = readFileSync(join(root, first.journal_path), "utf8");
      expect(journal.split("\n").filter(Boolean)).toHaveLength(2);
      expect(journal).toContain('"proposal_id":"orp_fixture_observation"');

      currentRecords = currentRecords.map((record) =>
        record.record_id === "project_fixture" ? { ...record, display_name: "Renamed fixture project" } : record,
      );

      const second = applyOperationalRecoveryProposal(proposal.proposal_id, {
        rootDir: root,
        force: true,
        readRecords: () => currentRecords,
        materialize: () => { materializeCalls += 1; },
        refreshCoverage: () => {},
        createEntry: fakeEntry,
        recordIdAssignments: fakeRecordIdAssignments,
        resolveBlock,
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
      });
      expect(second.skipped_already_applied).toBe(true);
      expect(second.wrote_journal).toBe(false);
      expect(materializeCalls).toBe(1);
      expect(readFileSync(join(root, first.journal_path), "utf8")).toBe(journal);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves a resumable accepted proposal and exact journal when materialization fails", () => {
    const root = tempRoot("resume");
    try {
      const proposal = observationProposal();
      const pendingPath = writeProposal(root, proposal, "observations");
      expect(() => applyOperationalRecoveryProposal(proposal.proposal_id, {
        rootDir: root,
        force: true,
        records: canonicalFixture(),
        readRecords: canonicalFixture,
        materialize: () => { throw new Error("fixture materialize failure"); },
        createEntry: fakeEntry,
        recordIdAssignments: fakeRecordIdAssignments,
        resolveBlock,
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
      })).toThrow("fixture materialize failure");
      expect(existsSync(pendingPath)).toBe(true);
      const journals = join(root, "data", "submissions");
      expect(existsSync(journals)).toBe(true);
      expect(readFileSync(join(journals, readdirSync(journals)[0]!), "utf8")).toContain("orp_fixture_observation");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resumes when records materialized but coverage refresh failed before the applied move", () => {
    const root = tempRoot("late-resume");
    let currentRecords = canonicalFixture();
    let materializeCalls = 0;
    try {
      const proposal = observationProposal();
      const pendingPath = writeProposal(root, proposal, "observations");
      expect(() => applyOperationalRecoveryProposal(proposal.proposal_id, {
        rootDir: root,
        force: true,
        records: currentRecords,
        readRecords: () => currentRecords,
        materialize: () => {
          materializeCalls += 1;
          currentRecords = appliedObservationRecords();
        },
        refreshCoverage: () => { throw new Error("fixture coverage refresh failure"); },
        createEntry: fakeEntry,
        recordIdAssignments: fakeRecordIdAssignments,
        resolveBlock,
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
      })).toThrow("fixture coverage refresh failure");
      expect(existsSync(pendingPath)).toBe(true);
      const journalDir = join(root, "data", "submissions");
      const journalPath = join(journalDir, readdirSync(journalDir)[0]!);
      const journalBefore = readFileSync(journalPath, "utf8");

      const resumed = applyOperationalRecoveryProposal(proposal.proposal_id, {
        rootDir: root,
        force: true,
        readRecords: () => currentRecords,
        materialize: () => { materializeCalls += 1; },
        refreshCoverage: () => {},
        createEntry: fakeEntry,
        recordIdAssignments: fakeRecordIdAssignments,
        resolveBlock,
      });
      expect(resumed.wrote_journal).toBe(false);
      expect(resumed.materialized).toBe(true);
      expect(resumed.coverage_refreshed).toBe(true);
      expect(resumed.moved_to_applied).toBe(true);
      expect(materializeCalls).toBe(2);
      expect(readFileSync(journalPath, "utf8")).toBe(journalBefore);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses a proposal or submission identity already present in another journal", () => {
    const root = tempRoot("identity-conflict");
    try {
      const proposal = observationProposal();
      writeProposal(root, proposal, "observations");
      const batch = buildOperationalRecoverySubmissionBatch(proposal, canonicalFixture(), fakeEntry);
      const conflictPath = join(root, "data", "submissions", "different_recovery_run.jsonl");
      mkdirSync(join(conflictPath, ".."), { recursive: true });
      writeFileSync(conflictPath, batch.journal_content, "utf8");
      expect(() => applyOperationalRecoveryProposal(proposal.proposal_id, {
        rootDir: root,
        records: canonicalFixture(),
        createEntry: fakeEntry,
        recordIdAssignments: fakeRecordIdAssignments,
        resolveBlock,
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
      })).toThrow("already bound to a different journal");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects collision suffixing before writing the recovery journal or materializing", () => {
    const root = tempRoot("record-id-collision");
    let materializeCalls = 0;
    try {
      const proposal = observationProposal();
      writeProposal(root, proposal, "observations");
      const existing = fakeEntry(
        "existing_run",
        {
          source_id: "another_source",
          observation_kind: "event",
          local_observation_id: "fixture_delivery_event",
          label: "Existing colliding event",
          payload: { event_kind: "launch" },
        },
        "2026-07-11T00:00:00.000Z",
        [],
      );
      const existingPath = join(root, "data", "submissions", "existing_run.jsonl");
      mkdirSync(join(existingPath, ".."), { recursive: true });
      writeFileSync(existingPath, `${JSON.stringify(existing)}\n`, "utf8");
      let message = "";
      try {
        applyOperationalRecoveryProposal(proposal.proposal_id, {
          rootDir: root,
          force: true,
          records: canonicalFixture(),
          readRecords: canonicalFixture,
          materialize: () => { materializeCalls += 1; },
          refreshCoverage: () => {},
          createEntry: fakeEntry,
          recordIdAssignments: fakeRecordIdAssignments,
          resolveBlock,
          currentCorpusFingerprint: fingerprint,
          knownGapIds: new Set([gapId]),
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toMatch(/collision suffix ordering|complete submission corpus assigns/u);
      expect(materializeCalls).toBe(0);
      expect(readdirSync(join(root, "data", "submissions"))).toEqual(["existing_run.jsonl"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports the same tampered persisted journal through apply and repository validation", () => {
    const root = tempRoot("journal-tamper");
    try {
      const proposal = observationProposal();
      writeProposal(root, proposal, "observations");
      expect(() => applyOperationalRecoveryProposal(proposal.proposal_id, {
        rootDir: root,
        force: true,
        records: canonicalFixture(),
        readRecords: canonicalFixture,
        materialize: () => { throw new Error("stop after journal"); },
        createEntry: fakeEntry,
        recordIdAssignments: fakeRecordIdAssignments,
        resolveBlock,
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
      })).toThrow("stop after journal");
      const journalDir = join(root, "data", "submissions");
      const journalPath = join(journalDir, readdirSync(journalDir)[0]!);
      const entries = readFileSync(journalPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
      (entries[0]!.tool_args as Record<string, unknown>).target_record_id = "event_injected";
      writeFileSync(journalPath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");

      let applyMessage = "";
      try {
        applyOperationalRecoveryProposal(proposal.proposal_id, {
          rootDir: root,
          force: true,
          readRecords: canonicalFixture,
          materialize: () => { throw new Error("must not materialize"); },
          createEntry: fakeEntry,
          recordIdAssignments: fakeRecordIdAssignments,
          resolveBlock,
        });
      } catch (error) {
        applyMessage = error instanceof Error ? error.message : String(error);
      }
      expect(applyMessage).toContain("differs from the exact proposal-derived submission");

      const report = validateOperationalRecoveryProposalTree({
        rootDir: root,
        records: canonicalFixture(),
        currentCorpusFingerprint: fingerprint,
        knownGapIds: new Set([gapId]),
        resolveBlock,
        createEntry: fakeEntry,
      });
      expect(report.issues).toHaveLength(1);
      expect(report.issues[0]?.message).toContain("differs from the exact proposal-derived submission");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
