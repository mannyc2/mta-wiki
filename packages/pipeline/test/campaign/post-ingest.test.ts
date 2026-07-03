import { describe, expect, it } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  auditPostIngestCoverageRows,
  auditSubmissionSourceIdDriftRows,
  claimWriterBacklogDispatchShards,
  collectWriterBacklogItems,
  generateWriterBacklogDispatchPlan,
  generateWriterBacklogPacketSetManifest,
  generateWriterBacklogPackets,
  summarizeWriterBacklogPacketCoverage,
  verifyWriterBacklogPacketEdits,
  verifyWriterBacklogDispatchClaim,
  verifyWriterBacklogDispatchClaims,
  verifyWriterBacklogDispatchHandoffBatch,
  verifyWriterBacklogDispatchHandoffPromptCoverage,
  verifyWriterBacklogDispatchHandoffPrompts,
  verifyWriterBacklogDispatchPlan,
  verifyWriterBacklogPackets,
  verifyWriterBacklogPacketSetManifest,
  writeWriterBacklogDispatchHandoffBatch,
  writeWriterBacklogDispatchHandoffPromptCoverageReport,
  writeWriterBacklogDispatchHandoffPrompts,
  writeWriterBacklogDispatchNextShard,
  writeWriterBacklogDispatchPlanStatus,
  writeWriterBacklogDispatchReadinessReport,
  writerBacklogDispatchPlanStatus,
  type WriterBacklogPacketRun,
} from "@mta-wiki/pipeline/campaign/post-ingest";
import type { ReadinessRow } from "@mta-wiki/pipeline/campaign/campaign-readiness";
import type { MtaSubmissionEntry } from "@mta-wiki/db/types";

const ARTIFACT_TEST_TIMEOUT_MS = 30000;

function cleanupPacketRun(run: WriterBacklogPacketRun) {
  rmSync(join(repoRoot, run.json_path), { force: true });
  rmSync(join(repoRoot, run.markdown_path), { force: true });
}

describe("post-ingest coverage audit", () => {
  it("passes when readiness is exhausted and every readiness source has explicit post-ingest scope", () => {
    const rows: ReadinessRow[] = [
      { source_id: "source_a", ready: true, ingested: true, has_pdf: false, block_count: 3 },
      { source_id: "source_b", ready: true, ingested: true, has_pdf: true, block_count: 9 },
    ];

    const audit = auditPostIngestCoverageRows("test-campaign", rows, [
      { path: "data/post-ingest/a.json", source_ids: ["source_a"] },
      { path: "data/post-ingest/b.json", source_ids: ["source_b", "external_source_from_accepted_journal"] },
    ]);

    expect(audit.ok).toBe(true);
    expect(audit.writer_backlog).toEqual({
      empty_writer_regions: 0,
      status: "paused_by_owner",
      packet_coverage: {
        status: "not_started",
        artifact_files: 0,
        packet_count: 0,
        unique_pages: 0,
        duplicate_pages: 0,
        covered_current_backlog_pages: 0,
        missing_current_backlog_pages: 0,
        stale_packet_pages: 0,
      },
    });
    expect(audit.readiness_sources_missing_post_ingest_scope).toEqual([]);
    expect(audit.post_ingest_scoped_sources_not_in_readiness).toEqual(["external_source_from_accepted_journal"]);
  });

  it("fails when a readiness source is unprocessed or missing explicit post-ingest scope", () => {
    const rows: ReadinessRow[] = [
      { source_id: "source_a", ready: true, ingested: true, has_pdf: false, block_count: 3 },
      { source_id: "source_b", ready: true, ingested: false, has_pdf: false, block_count: 2 },
      { source_id: "source_c", ready: false, ingested: false, reason: "missing blocks" },
    ];

    const audit = auditPostIngestCoverageRows("test-campaign", rows, [{ path: "data/post-ingest/a.json", source_ids: ["source_a"] }]);

    expect(audit.ok).toBe(false);
    expect(audit.readiness.ready_never_ingested).toBe(1);
    expect(audit.readiness.not_ready).toBe(1);
    expect(audit.readiness_sources_missing_post_ingest_scope).toEqual(["source_b", "source_c"]);
  });
});

function submissionFixture(overrides: {
  submission_id: string;
  source_id: string;
  evidence_source_ids?: string[] | undefined;
  run_id?: string | undefined;
  local_observation_id?: string | undefined;
  observation_kind?: string | undefined;
}): MtaSubmissionEntry {
  return {
    submission_id: overrides.submission_id,
    run_id: overrides.run_id ?? `run_${overrides.source_id}`,
    submitted_at: "2026-06-24T00:00:00.000Z",
    tool_args_sha256: `sha256:${overrides.submission_id.replace(/^sub_/u, "").padEnd(64, "0").slice(0, 64)}`,
    schema_version: 2,
    tool_args: {
      source_id: overrides.source_id,
      observation_kind: overrides.observation_kind ?? "claim",
      local_observation_id: overrides.local_observation_id ?? `claim_${overrides.source_id}`,
      label: "Fixture",
      payload: { claim_text: "Fixture claim" },
      evidence_refs: (overrides.evidence_source_ids ?? [overrides.source_id]).map((sourceId) => ({ source_id: sourceId, block_id: "p001_c0001" })),
    },
    validation: { state: "accepted", issues: [] },
  };
}

describe("submission source-id drift audit", () => {
  it("passes when accepted unretired submissions cite staged source ids matching evidence", () => {
    const audit = auditSubmissionSourceIdDriftRows(
      [submissionFixture({ submission_id: "sub_clean", source_id: "meeting_doc_124306" })],
      new Set(["meeting_doc_124306"]),
    );

    expect(audit.ok).toBe(true);
    expect(audit.candidates).toEqual([]);
  });

  it("flags accepted submissions whose source id is missing and disagrees with evidence", () => {
    const audit = auditSubmissionSourceIdDriftRows(
      [
        submissionFixture({
          submission_id: "sub_bad",
          run_id: "2026_ingest_meeting-doc-124306",
          source_id: "meeting_doc_1246",
          evidence_source_ids: ["meeting_doc_124306"],
          local_observation_id: "claim_meeting_doc_124306_accessibility_training_success",
        }),
      ],
      new Set(["meeting_doc_124306"]),
    );

    expect(audit.ok).toBe(false);
    expect(audit.summary).toMatchObject({
      total_candidates: 1,
      missing_source_id: 1,
      source_mismatch: 1,
      single_evidence_likely_truncated: 1,
    });
    expect(audit.candidates[0]).toMatchObject({
      submission_id: "sub_bad",
      source_id: "meeting_doc_1246",
      source_exists: false,
      evidence_source_ids: ["meeting_doc_124306"],
      likely_correct_source_id: "meeting_doc_124306",
      likely_truncated: true,
    });
  });

  it("ignores retired drift submissions", () => {
    const audit = auditSubmissionSourceIdDriftRows(
      [submissionFixture({ submission_id: "sub_retired", source_id: "missing_source", evidence_source_ids: ["real_source"] })],
      new Set(["real_source"]),
      new Set(["sub_retired"]),
    );

    expect(audit.ok).toBe(true);
  });
});

describe("writer backlog packets", () => {
  it("summarizes full, partial, and stale packet coverage against a backlog queue", () => {
    const queue = [{ page_path: "wiki/projects/a.md" }, { page_path: "wiki/projects/b.md" }, { page_path: "wiki/projects/c.md" }];

    expect(
      summarizeWriterBacklogPacketCoverage(queue, [
        { offset: 0, pages: ["wiki/projects/a.md", "wiki/projects/b.md"] },
        { offset: 2, pages: ["wiki/projects/c.md"] },
      ]),
    ).toMatchObject({
      status: "complete",
      artifact_files: 2,
      packet_count: 3,
      unique_pages: 3,
      duplicate_pages: 0,
      covered_current_backlog_pages: 3,
      missing_current_backlog_pages: 0,
      stale_packet_pages: 0,
      min_offset: 0,
      max_offset: 2,
    });

    expect(summarizeWriterBacklogPacketCoverage(queue, [{ offset: 0, pages: ["wiki/projects/a.md"] }])).toMatchObject({
      status: "partial",
      covered_current_backlog_pages: 1,
      missing_current_backlog_pages: 2,
    });

    expect(
      summarizeWriterBacklogPacketCoverage(queue, [
        { offset: 0, pages: ["wiki/projects/a.md", "wiki/projects/a.md"] },
        { offset: 2, pages: ["wiki/projects/stale.md"] },
      ]),
    ).toMatchObject({
      status: "stale_or_overlapping",
      duplicate_pages: 1,
      stale_packet_pages: 1,
    });
  });

  it("records queue metadata that matches the current writer backlog queue", () => {
    const run = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    try {
      const queueItems = collectWriterBacklogItems();
      expect(run.scope.queue_fingerprint).toMatch(/^[a-f0-9]{64}$/u);
      expect(run.packets.length).toBeGreaterThan(0);
      let totalEvidenceRefs = 0;
      let totalSnippetRefs = 0;

      for (const [index, packet] of run.packets.entries()) {
        expect(packet.queue_position).toBe(index);
        expect(packet.queue_item_hash).toMatch(/^[a-f0-9]{64}$/u);
        const queueItem = queueItems[packet.queue_position!];
        expect(queueItem?.page_path).toBe(packet.page_path);
        expect(queueItem?.record_id).toBe(packet.record_id);
        expect(packet.target_record.evidence_refs?.length).toBeGreaterThan(0);
        expect(packet.target_record.evidence_refs!.length).toBeLessThanOrEqual(packet.target_record.evidence_count);
        expect(packet.target_record.evidence_snippets.length).toBeLessThanOrEqual(5);
        for (const record of [packet.target_record, ...packet.supporting_records]) {
          expect(record.evidence_refs?.length).toBeGreaterThan(0);
          expect(record.evidence_refs!.length).toBeLessThanOrEqual(record.evidence_count);
          expect(new Set(record.evidence_refs!.map((ref) => `${ref.source_id}#${ref.block_id}`)).size).toBe(record.evidence_refs!.length);
          totalEvidenceRefs += record.evidence_refs!.length;
          totalSnippetRefs += record.evidence_snippets.length;
        }
      }

      const verification = verifyWriterBacklogPackets(run.json_path);
      expect(verification.ok).toBe(true);
      expect(verification.checked_source_blocks).toBe(totalEvidenceRefs);
      expect(verification.checked_source_blocks).toBeGreaterThan(totalSnippetRefs);
      expect(verification.issues.map((issue) => issue.code)).not.toContain("queue_item_drift");
      expect(verification.issues.map((issue) => issue.code)).not.toContain("invalid_queue_position");
      expect(verification.issues.map((issue) => issue.code)).not.toContain("missing_queue_item_hash");
    } finally {
      cleanupPacketRun(run);
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("filters writer packets to route and corridor pages for the bounded writer pass", () => {
    const run = generateWriterBacklogPackets({ limit: 6, offset: 0, recordKinds: ["route", "corridor"] });
    try {
      const queueItems = collectWriterBacklogItems(undefined, { recordKinds: ["route", "corridor"] });
      expect(run.scope.record_kinds).toEqual(["corridor", "route"]);
      expect(run.scope.empty_writer_regions).toBe(queueItems.length);
      expect(run.packets.length).toBeGreaterThan(0);
      expect(run.packets.every((packet) => packet.record_kind === "route" || packet.record_kind === "corridor")).toBe(true);
      expect(run.packets.every((packet) => packet.instructions.some((instruction) => instruction.includes("[[cite:source_id#block_id|label]]")))).toBe(true);
      expect(run.packets.every((packet) => packet.instructions.some((instruction) => instruction.includes("[[route:id|label]]")))).toBe(true);
    } finally {
      cleanupPacketRun(run);
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("builds writer packets for an explicit page list in caller order", () => {
    const queueItems = collectWriterBacklogItems(undefined, { recordKinds: ["route", "corridor"] });
    const pagePaths = [queueItems[2]!.page_path, queueItems[0]!.page_path, queueItems[1]!.page_path];
    const run = generateWriterBacklogPackets({ limit: 3, offset: 0, recordKinds: ["route", "corridor"], pagePaths });
    try {
      expect(run.scope.page_paths).toEqual(pagePaths);
      expect(run.scope.empty_writer_regions).toBe(pagePaths.length);
      expect(run.packets.map((packet) => packet.page_path)).toEqual(pagePaths);
      expect(run.packets.map((packet) => packet.queue_position)).toEqual([0, 1, 2]);
      expect(verifyWriterBacklogPackets(run.json_path).ok).toBe(true);
    } finally {
      cleanupPacketRun(run);
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("builds bounded dispatch shards from packet artifacts without editing pages", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      expect(plan.shards.length).toBe(2);
      expect(plan.scope.execution_policy).toContain("Do not launch writer agents");
      expect(plan.shards.map((shard) => shard.packet_count)).toEqual([2, 2]);
      for (const shard of plan.shards) {
        expect(shard.preflight_command).toContain("verify-writer-packet-set");
        expect(shard.post_edit_command).toContain("verify-writer-packet-edits");
        expect(shard.suggested_subagent_prompt).toContain("Before editing, run the shard preflight command exactly");
      }
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("freezes an explicit packet set and builds dispatch shards from it", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let manifest: ReturnType<typeof generateWriterBacklogPacketSetManifest> | undefined;
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    try {
      manifest = generateWriterBacklogPacketSetManifest({ label: "test" });
      const verification = verifyWriterBacklogPacketSetManifest(manifest.path);
      expect(verification.ok).toBe(true);
      expect(manifest.packet_files.slice(0, 2)).toEqual([runA.json_path, runB.json_path]);

      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2, packetSetPath: manifest.path });
      expect(plan.shards.length).toBe(2);
      expect(plan.shards[0]!.packet_files).toEqual([runA.json_path]);
      expect(plan.shards[1]!.packet_files).toEqual([runB.json_path]);
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      if (manifest) {
        rmSync(join(repoRoot, manifest.path), { force: true });
        rmSync(join(repoRoot, manifest.markdown_path), { force: true });
      }
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("detects packet-set manifest drift from packet files", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    let manifest: ReturnType<typeof generateWriterBacklogPacketSetManifest> | undefined;
    const tamperedPath = join(repoRoot, "data", "post-ingest", "test-writer-packet-set-manifest-drift.json");
    try {
      manifest = generateWriterBacklogPacketSetManifest({ label: "test" });
      const tampered = JSON.parse(readFileSync(join(repoRoot, manifest.path), "utf8")) as ReturnType<typeof generateWriterBacklogPacketSetManifest>;
      tampered.packets[0]!.page_paths = [...tampered.packets[0]!.page_paths].reverse();
      writeFileSync(tamperedPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");

      const verification = verifyWriterBacklogPacketSetManifest(tamperedPath);
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.code)).toContain("packet_pages_mismatch");
    } finally {
      cleanupPacketRun(runA);
      if (manifest) {
        rmSync(join(repoRoot, manifest.path), { force: true });
        rmSync(join(repoRoot, manifest.markdown_path), { force: true });
      }
      rmSync(tamperedPath, { force: true });
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("verifies dispatch shard coverage and gate commands", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    const tamperedPath = join(repoRoot, "data", "post-ingest", "test-writer-dispatch-plan-tampered.json");
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      const clean = verifyWriterBacklogDispatchPlan(plan.path);
      expect(clean.ok).toBe(false);
      expect(clean.shard_count).toBe(2);
      expect(clean.issues.map((issue) => issue.code)).toContain("missing_backlog_pages");

      const tampered = JSON.parse(readFileSync(join(repoRoot, plan.path), "utf8")) as ReturnType<typeof generateWriterBacklogDispatchPlan>;
      tampered.shards[1]!.page_paths[0] = tampered.shards[0]!.page_paths[0]!;
      tampered.shards[0]!.preflight_command = "echo nope";
      writeFileSync(tamperedPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
      const verification = verifyWriterBacklogDispatchPlan(tamperedPath);
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.code)).toContain("duplicate_dispatch_pages");
      expect(verification.issues.map((issue) => issue.code)).toContain("preflight_command_mismatch");
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
      rmSync(tamperedPath, { force: true });
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("verifies dispatch shard packet files match planned page paths", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    const tamperedPath = join(repoRoot, "data", "post-ingest", "test-writer-dispatch-plan-packet-file-drift.json");
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      const tampered = JSON.parse(readFileSync(join(repoRoot, plan.path), "utf8")) as ReturnType<typeof generateWriterBacklogDispatchPlan>;
      tampered.shards[0]!.page_paths = [...tampered.shards[0]!.page_paths].reverse();
      tampered.shards[1]!.packet_files[0] = tampered.shards[0]!.packet_files[0]!;
      tampered.shards[1]!.preflight_command = `bun packages/cli/src/cli.ts verify-writer-packet-set ${tampered.shards[1]!.packet_files.join(" ")}`;
      tampered.shards[1]!.post_edit_command = `bun packages/cli/src/cli.ts verify-writer-packet-edits ${tampered.shards[1]!.packet_files.join(" ")}`;
      writeFileSync(tamperedPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");

      const verification = verifyWriterBacklogDispatchPlan(tamperedPath);
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.code)).toContain("packet_file_page_mismatch");
      expect(verification.issues.map((issue) => issue.code)).toContain("duplicate_dispatch_packet_files");
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
      rmSync(tamperedPath, { force: true });
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("reports dispatch shard progress from writer-region state", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    let pagePath: string | undefined;
    let originalPage: string | undefined;
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      const initial = writerBacklogDispatchPlanStatus(plan.path);
      expect(initial.not_started_shards).toBe(2);
      expect(initial.in_progress_shards).toBe(0);
      expect(initial.non_empty_pages).toBe(0);
      expect(initial.claimed_shards).toBe(0);
      expect(initial.unclaimed_not_started_shards).toBe(2);

      pagePath = join(repoRoot, plan.shards[0]!.page_paths[0]!);
      originalPage = readFileSync(pagePath, "utf8");
      writeFileSync(
        pagePath,
        originalPage.replace(/<!-- mta-wiki:writer:start -->[\s\S]*?<!-- mta-wiki:writer:end -->/u, "<!-- mta-wiki:writer:start -->\nDraft text.\n<!-- mta-wiki:writer:end -->"),
        "utf8",
      );

      const edited = writerBacklogDispatchPlanStatus(plan.path);
      expect(edited.in_progress_shards).toBe(1);
      expect(edited.non_empty_pages).toBe(1);
      expect(edited.shards[0]!.state).toBe("in_progress");
    } finally {
      if (pagePath && originalPage) writeFileSync(pagePath, originalPage, "utf8");
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("writes a durable dispatch status report", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    let report: ReturnType<typeof writeWriterBacklogDispatchPlanStatus> | undefined;
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      report = writeWriterBacklogDispatchPlanStatus(plan.path);
      expect(report.dispatch_plan_path).toBe(plan.path);
      expect(report.status.not_started_shards).toBe(2);
      expect(report.status.in_progress_shards).toBe(0);
      expect(report.status.non_empty_pages).toBe(0);
      expect(readFileSync(join(repoRoot, report.path), "utf8")).toContain("\"not_started_shards\": 2");
      expect(readFileSync(join(repoRoot, report.markdown_path), "utf8")).toContain("No shard has started");
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
      if (report) {
        rmSync(join(repoRoot, report.path), { force: true });
        rmSync(join(repoRoot, report.markdown_path), { force: true });
      }
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("claims unstarted dispatch shards without launching writer work", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    const claims: ReturnType<typeof claimWriterBacklogDispatchShards>[] = [];
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      const first = claimWriterBacklogDispatchShards(plan.path, { limit: 1, owner: "test-owner" });
      claims.push(first);
      const firstVerification = verifyWriterBacklogDispatchClaim(first.path);
      expect(firstVerification.ok).toBe(true);
      expect(firstVerification.claimed_count).toBe(1);
      expect(first.claimed_count).toBe(1);
      expect(first.skipped_already_claimed_shards).toBe(0);
      expect(first.shards[0]!.shard_id).toBe("writer-shard-001");
      expect(first.execution_policy).toContain("Do not launch writer agents");
      expect(first.claim_preflight_command).toBe(`bun packages/cli/src/cli.ts verify-writer-packet-dispatch-claim ${first.path}`);
      expect(readFileSync(join(repoRoot, first.markdown_path), "utf8")).toContain("Claimed shards: 1");
      expect(readFileSync(join(repoRoot, first.markdown_path), "utf8")).toContain(first.claim_preflight_command!);

      const firstStatus = writerBacklogDispatchPlanStatus(plan.path);
      expect(firstStatus.claimed_shards).toBe(1);
      expect(firstStatus.unclaimed_not_started_shards).toBe(1);
      expect(firstStatus.shards[0]!.claim?.owner).toBe("test-owner");
      expect(firstStatus.shards[0]!.claim?.path).toBe(first.path);

      const second = claimWriterBacklogDispatchShards(plan.path, { limit: 1, owner: "test-owner" });
      claims.push(second);
      const secondVerification = verifyWriterBacklogDispatchClaim(second.path);
      expect(secondVerification.ok).toBe(true);
      expect(second.claimed_count).toBe(1);
      expect(second.skipped_already_claimed_shards).toBe(1);
      expect(second.shards[0]!.shard_id).toBe("writer-shard-002");

      const secondStatus = writerBacklogDispatchPlanStatus(plan.path);
      expect(secondStatus.claimed_shards).toBe(2);
      expect(secondStatus.unclaimed_not_started_shards).toBe(0);
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
      for (const claim of claims) {
        rmSync(join(repoRoot, claim.path), { force: true });
        rmSync(join(repoRoot, claim.markdown_path), { force: true });
      }
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("detects tampered dispatch claim artifacts", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    let claim: ReturnType<typeof claimWriterBacklogDispatchShards> | undefined;
    const tamperedPath = join(repoRoot, "data", "post-ingest", "test-writer-dispatch-claim-tampered.json");
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      claim = claimWriterBacklogDispatchShards(plan.path, { limit: 1, owner: "test-owner" });
      const tampered = JSON.parse(readFileSync(join(repoRoot, claim.path), "utf8")) as ReturnType<typeof claimWriterBacklogDispatchShards>;
      tampered.claimed_count = 2;
      tampered.claim_preflight_command = "echo nope";
      tampered.shards.push({ ...tampered.shards[0]!, shard_id: "writer-shard-999" });
      tampered.shards[0]!.packet_files = ["data/post-ingest/missing-packet.json"];
      writeFileSync(tamperedPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");

      const verification = verifyWriterBacklogDispatchClaim(tamperedPath);
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.code)).toContain("claim_status_mismatch");
      expect(verification.issues.map((issue) => issue.code)).toContain("claim_preflight_command_mismatch");
      expect(verification.issues.map((issue) => issue.code)).toContain("claim_packet_files_mismatch");
      expect(verification.issues.map((issue) => issue.code)).toContain("unknown_claim_shard");
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      if (claim) {
        rmSync(join(repoRoot, claim.path), { force: true });
        rmSync(join(repoRoot, claim.markdown_path), { force: true });
      }
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
      rmSync(tamperedPath, { force: true });
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("verifies all dispatch claim files together", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    const claims: ReturnType<typeof claimWriterBacklogDispatchShards>[] = [];
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      claims.push(claimWriterBacklogDispatchShards(plan.path, { limit: 1, owner: "test-owner" }));
      claims.push(claimWriterBacklogDispatchShards(plan.path, { limit: 1, owner: "test-owner" }));

      const verification = verifyWriterBacklogDispatchClaims(plan.path);
      expect(verification.ok).toBe(true);
      expect(verification.claim_file_count).toBe(2);
      expect(verification.unique_claimed_shards).toBe(2);
      expect(verification.unclaimed_not_started_shards).toBe(0);
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
      for (const claim of claims) {
        rmSync(join(repoRoot, claim.path), { force: true });
        rmSync(join(repoRoot, claim.markdown_path), { force: true });
      }
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("writes a next-shard handoff for claimed not-started dispatch shards", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    let claim: ReturnType<typeof claimWriterBacklogDispatchShards> | undefined;
    let next: ReturnType<typeof writeWriterBacklogDispatchNextShard> | undefined;
    let selected: ReturnType<typeof writeWriterBacklogDispatchNextShard> | undefined;
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      claim = claimWriterBacklogDispatchShards(plan.path, { limit: 2, owner: "test-owner" });

      next = writeWriterBacklogDispatchNextShard(plan.path);
      expect(next.selected).toBe(true);
      expect(next.shard?.shard_id).toBe("writer-shard-001");
      expect(next.shard?.claim?.owner).toBe("test-owner");
      expect(next.shard?.page_paths.length).toBe(2);
      expect(next.claim_preflight_command).toBe(`bun packages/cli/src/cli.ts verify-writer-packet-dispatch-claim ${claim.path}`);
      expect(readFileSync(join(repoRoot, next.markdown_path), "utf8")).toContain("Subagent Prompt");
      expect(readFileSync(join(repoRoot, next.markdown_path), "utf8")).toContain("writer-shard-001");

      selected = writeWriterBacklogDispatchNextShard(plan.path, { shardId: "writer-shard-002" });
      expect(selected.selected).toBe(true);
      expect(selected.shard?.shard_id).toBe("writer-shard-002");
      expect(selected.shard?.post_edit_command).toContain("verify-writer-packet-edits");
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      for (const report of [next, selected]) {
        if (!report) continue;
        rmSync(join(repoRoot, report.path), { force: true });
        rmSync(join(repoRoot, report.markdown_path), { force: true });
      }
      if (claim) {
        rmSync(join(repoRoot, claim.path), { force: true });
        rmSync(join(repoRoot, claim.markdown_path), { force: true });
      }
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("writes a bounded handoff batch for claimed not-started dispatch shards", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    let claim: ReturnType<typeof claimWriterBacklogDispatchShards> | undefined;
    let batch: ReturnType<typeof writeWriterBacklogDispatchHandoffBatch> | undefined;
    let skippedBatch: ReturnType<typeof writeWriterBacklogDispatchHandoffBatch> | undefined;
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      claim = claimWriterBacklogDispatchShards(plan.path, { limit: 2, owner: "test-owner" });

      batch = writeWriterBacklogDispatchHandoffBatch(plan.path, { limit: 2 });
      expect(batch.selected_count).toBe(2);
      expect(batch.available_claimed_not_started_shards).toBe(2);
      expect(batch.shards.map((entry) => entry.shard.shard_id)).toEqual(["writer-shard-001", "writer-shard-002"]);
      expect(batch.shards[0]!.claim_preflight_command).toBe(`bun packages/cli/src/cli.ts verify-writer-packet-dispatch-claim ${claim.path}`);
      expect(batch.shards[0]!.shard.page_paths.length).toBe(2);
      expect(readFileSync(join(repoRoot, batch.markdown_path), "utf8")).toContain("writer-shard-001");
      expect(readFileSync(join(repoRoot, batch.markdown_path), "utf8")).toContain("Subagent prompt");

      const verification = verifyWriterBacklogDispatchHandoffBatch(batch.path);
      expect(verification.ok).toBe(true);
      expect(verification.selected_count).toBe(2);
      expect(verification.claim_file_count).toBe(1);
      expect(verification.packet_count).toBe(4);

      skippedBatch = writeWriterBacklogDispatchHandoffBatch(plan.path, { limit: 1, skip: 1 });
      expect(skippedBatch.requested_skip).toBe(1);
      expect(skippedBatch.selected_count).toBe(1);
      expect(skippedBatch.shards.map((entry) => entry.shard.shard_id)).toEqual(["writer-shard-002"]);
      expect(readFileSync(join(repoRoot, skippedBatch.markdown_path), "utf8")).toContain("Skip: 1");
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      for (const report of [batch, skippedBatch]) {
        if (!report) continue;
        rmSync(join(repoRoot, report.path), { force: true });
        rmSync(join(repoRoot, report.markdown_path), { force: true });
      }
      if (claim) {
        rmSync(join(repoRoot, claim.path), { force: true });
        rmSync(join(repoRoot, claim.markdown_path), { force: true });
      }
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("detects tampered handoff batch artifacts", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    let claim: ReturnType<typeof claimWriterBacklogDispatchShards> | undefined;
    let batch: ReturnType<typeof writeWriterBacklogDispatchHandoffBatch> | undefined;
    const tamperedPath = join(repoRoot, "data", "post-ingest", "test-writer-dispatch-handoff-batch-tampered.json");
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      claim = claimWriterBacklogDispatchShards(plan.path, { limit: 2, owner: "test-owner" });
      batch = writeWriterBacklogDispatchHandoffBatch(plan.path, { limit: 2 });
      const tampered = JSON.parse(readFileSync(join(repoRoot, batch.path), "utf8")) as ReturnType<typeof writeWriterBacklogDispatchHandoffBatch>;
      tampered.selected_count = 1;
      tampered.shards[0]!.claim_preflight_command = "echo nope";
      tampered.shards.push({ ...tampered.shards[0]! });
      writeFileSync(tamperedPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");

      const verification = verifyWriterBacklogDispatchHandoffBatch(tamperedPath);
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.code)).toContain("selected_count_mismatch");
      expect(verification.issues.map((issue) => issue.code)).toContain("claim_preflight_command_mismatch");
      expect(verification.issues.map((issue) => issue.code)).toContain("duplicate_handoff_shard");
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      rmSync(tamperedPath, { force: true });
      if (batch) {
        rmSync(join(repoRoot, batch.path), { force: true });
        rmSync(join(repoRoot, batch.markdown_path), { force: true });
      }
      if (claim) {
        rmSync(join(repoRoot, claim.path), { force: true });
        rmSync(join(repoRoot, claim.markdown_path), { force: true });
      }
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("splits a verified handoff batch into per-shard prompt files", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    let claim: ReturnType<typeof claimWriterBacklogDispatchShards> | undefined;
    let batch: ReturnType<typeof writeWriterBacklogDispatchHandoffBatch> | undefined;
    let prompts: ReturnType<typeof writeWriterBacklogDispatchHandoffPrompts> | undefined;
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      claim = claimWriterBacklogDispatchShards(plan.path, { limit: 2, owner: "test-owner" });
      batch = writeWriterBacklogDispatchHandoffBatch(plan.path, { limit: 2 });

      prompts = writeWriterBacklogDispatchHandoffPrompts(batch.path);
      expect(prompts.verification.ok).toBe(true);
      expect(prompts.prompt_count).toBe(2);
      expect(prompts.prompts.map((prompt) => prompt.shard_id)).toEqual(["writer-shard-001", "writer-shard-002"]);
      const firstPrompt = readFileSync(join(repoRoot, prompts.prompts[0]!.path), "utf8");
      expect(firstPrompt).toContain("Writer Shard Handoff: writer-shard-001");
      expect(firstPrompt).toContain("Claim preflight");
      expect(firstPrompt).toContain("Post-edit verification");
      expect(readFileSync(join(repoRoot, prompts.markdown_path), "utf8")).toContain(prompts.prompts[1]!.path);

      const verification = verifyWriterBacklogDispatchHandoffPrompts(prompts.path);
      expect(verification.ok).toBe(true);
      expect(verification.prompt_count).toBe(2);
      expect(verification.existing_prompt_count).toBe(2);
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      if (prompts) {
        for (const prompt of prompts.prompts) rmSync(join(repoRoot, prompt.path), { force: true });
        rmSync(join(repoRoot, prompts.path), { force: true });
        rmSync(join(repoRoot, prompts.markdown_path), { force: true });
      }
      if (batch) {
        rmSync(join(repoRoot, batch.path), { force: true });
        rmSync(join(repoRoot, batch.markdown_path), { force: true });
      }
      if (claim) {
        rmSync(join(repoRoot, claim.path), { force: true });
        rmSync(join(repoRoot, claim.markdown_path), { force: true });
      }
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("detects tampered handoff prompt bundles", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    let claim: ReturnType<typeof claimWriterBacklogDispatchShards> | undefined;
    let batch: ReturnType<typeof writeWriterBacklogDispatchHandoffBatch> | undefined;
    let prompts: ReturnType<typeof writeWriterBacklogDispatchHandoffPrompts> | undefined;
    const tamperedPath = join(repoRoot, "data", "post-ingest", "test-writer-dispatch-handoff-prompts-tampered.json");
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      claim = claimWriterBacklogDispatchShards(plan.path, { limit: 2, owner: "test-owner" });
      batch = writeWriterBacklogDispatchHandoffBatch(plan.path, { limit: 2 });
      prompts = writeWriterBacklogDispatchHandoffPrompts(batch.path);
      const tampered = JSON.parse(readFileSync(join(repoRoot, prompts.path), "utf8")) as ReturnType<typeof writeWriterBacklogDispatchHandoffPrompts>;
      tampered.prompt_count = 1;
      tampered.prompts.push({ ...tampered.prompts[0]! });
      const firstPromptPath = join(repoRoot, prompts.prompts[0]!.path);
      writeFileSync(firstPromptPath, readFileSync(firstPromptPath, "utf8").replace("Post-edit verification:", "Post edit removed:"), "utf8");
      writeFileSync(tamperedPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");

      const verification = verifyWriterBacklogDispatchHandoffPrompts(tamperedPath);
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.code)).toContain("prompt_count_mismatch");
      expect(verification.issues.map((issue) => issue.code)).toContain("duplicate_prompt_shard");
      expect(verification.issues.map((issue) => issue.code)).toContain("prompt_missing_required_text");
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      rmSync(tamperedPath, { force: true });
      if (prompts) {
        for (const prompt of prompts.prompts) rmSync(join(repoRoot, prompt.path), { force: true });
        rmSync(join(repoRoot, prompts.path), { force: true });
        rmSync(join(repoRoot, prompts.markdown_path), { force: true });
      }
      if (batch) {
        rmSync(join(repoRoot, batch.path), { force: true });
        rmSync(join(repoRoot, batch.markdown_path), { force: true });
      }
      if (claim) {
        rmSync(join(repoRoot, claim.path), { force: true });
        rmSync(join(repoRoot, claim.markdown_path), { force: true });
      }
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("verifies aggregate handoff prompt coverage across reports", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    const runC = generateWriterBacklogPackets({ limit: 2, offset: 4 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    let claim: ReturnType<typeof claimWriterBacklogDispatchShards> | undefined;
    let batchA: ReturnType<typeof writeWriterBacklogDispatchHandoffBatch> | undefined;
    let batchB: ReturnType<typeof writeWriterBacklogDispatchHandoffBatch> | undefined;
    let promptsA: ReturnType<typeof writeWriterBacklogDispatchHandoffPrompts> | undefined;
    let promptsB: ReturnType<typeof writeWriterBacklogDispatchHandoffPrompts> | undefined;
    let coverageReport: ReturnType<typeof writeWriterBacklogDispatchHandoffPromptCoverageReport> | undefined;
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 3 });
      claim = claimWriterBacklogDispatchShards(plan.path, { limit: 3, owner: "test-owner" });
      batchA = writeWriterBacklogDispatchHandoffBatch(plan.path, { limit: 2 });
      batchB = writeWriterBacklogDispatchHandoffBatch(plan.path, { limit: 1, skip: 2 });
      promptsA = writeWriterBacklogDispatchHandoffPrompts(batchA.path);
      promptsB = writeWriterBacklogDispatchHandoffPrompts(batchB.path);

      const verification = verifyWriterBacklogDispatchHandoffPromptCoverage(plan.path, [promptsA.path, promptsB.path]);
      expect(verification.ok).toBe(true);
      expect(verification.expected_shard_count).toBe(3);
      expect(verification.covered_shard_count).toBe(3);
      expect(verification.prompt_report_count).toBe(2);
      expect(verification.prompt_count).toBe(3);
      expect(verification.missing_shard_count).toBe(0);

      const missing = verifyWriterBacklogDispatchHandoffPromptCoverage(plan.path, [promptsA.path]);
      expect(missing.ok).toBe(false);
      expect(missing.issues.map((issue) => issue.code)).toContain("missing_prompt_shard");

      const duplicate = verifyWriterBacklogDispatchHandoffPromptCoverage(plan.path, [promptsA.path, promptsA.path, promptsB.path]);
      expect(duplicate.ok).toBe(false);
      expect(duplicate.issues.map((issue) => issue.code)).toContain("duplicate_prompt_shard_across_reports");

      coverageReport = writeWriterBacklogDispatchHandoffPromptCoverageReport(plan.path, [promptsA.path, promptsB.path]);
      expect(coverageReport.verification.ok).toBe(true);
      expect(coverageReport.verification.covered_shard_count).toBe(3);
      expect(readFileSync(join(repoRoot, coverageReport.markdown_path), "utf8")).toContain("Coverage: 3/3 shard(s)");
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      cleanupPacketRun(runC);
      for (const prompts of [promptsA, promptsB]) {
        if (!prompts) continue;
        for (const prompt of prompts.prompts) rmSync(join(repoRoot, prompt.path), { force: true });
        rmSync(join(repoRoot, prompts.path), { force: true });
        rmSync(join(repoRoot, prompts.markdown_path), { force: true });
      }
      for (const batch of [batchA, batchB]) {
        if (!batch) continue;
        rmSync(join(repoRoot, batch.path), { force: true });
        rmSync(join(repoRoot, batch.markdown_path), { force: true });
      }
      if (coverageReport) {
        rmSync(join(repoRoot, coverageReport.path), { force: true });
        rmSync(join(repoRoot, coverageReport.markdown_path), { force: true });
      }
      if (claim) {
        rmSync(join(repoRoot, claim.path), { force: true });
        rmSync(join(repoRoot, claim.markdown_path), { force: true });
      }
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
    }
  }, 60000);

  it("detects duplicate shard ownership across dispatch claim files", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    let claim: ReturnType<typeof claimWriterBacklogDispatchShards> | undefined;
    const duplicatePath = join(repoRoot, "data", "post-ingest", "test_writer-packet-dispatch-claim-duplicate.json");
    try {
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2 });
      claim = claimWriterBacklogDispatchShards(plan.path, { limit: 1, owner: "test-owner" });
      const duplicate = JSON.parse(readFileSync(join(repoRoot, claim.path), "utf8")) as ReturnType<typeof claimWriterBacklogDispatchShards>;
      duplicate.path = "data/post-ingest/test_writer-packet-dispatch-claim-duplicate.json";
      duplicate.markdown_path = "data/post-ingest/test_writer-packet-dispatch-claim-duplicate.md";
      duplicate.claim_preflight_command = `bun packages/cli/src/cli.ts verify-writer-packet-dispatch-claim ${duplicate.path}`;
      writeFileSync(duplicatePath, `${JSON.stringify(duplicate, null, 2)}\n`, "utf8");

      const verification = verifyWriterBacklogDispatchClaims(plan.path);
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.code)).toContain("duplicate_claimed_shard_across_files");
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      if (claim) {
        rmSync(join(repoRoot, claim.path), { force: true });
        rmSync(join(repoRoot, claim.markdown_path), { force: true });
      }
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
      rmSync(duplicatePath, { force: true });
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("writes a dispatch readiness report and reflects claim progress", () => {
    const runA = generateWriterBacklogPackets({ limit: 2, offset: 0 });
    const runB = generateWriterBacklogPackets({ limit: 2, offset: 2 });
    let manifest: ReturnType<typeof generateWriterBacklogPacketSetManifest> | undefined;
    let plan: ReturnType<typeof generateWriterBacklogDispatchPlan> | undefined;
    let claim: ReturnType<typeof claimWriterBacklogDispatchShards> | undefined;
    let initialReport: ReturnType<typeof writeWriterBacklogDispatchReadinessReport> | undefined;
    let readyReport: ReturnType<typeof writeWriterBacklogDispatchReadinessReport> | undefined;
    try {
      manifest = generateWriterBacklogPacketSetManifest({ label: "test" });
      plan = generateWriterBacklogDispatchPlan({ packetsPerShard: 2, maxShards: 2, packetSetPath: manifest.path });
      initialReport = writeWriterBacklogDispatchReadinessReport(plan.path, { packetSetPath: manifest.path });
      expect(initialReport.ok).toBe(false);
      expect(initialReport.readiness.all_shards_claimed).toBe(false);

      claim = claimWriterBacklogDispatchShards(plan.path, { limit: 2, owner: "test-owner" });
      readyReport = writeWriterBacklogDispatchReadinessReport(plan.path, { packetSetPath: manifest.path });
      expect(readyReport.ok).toBe(false);
      expect(readyReport.readiness.all_shards_claimed).toBe(true);
      expect(readyReport.dispatch_verification.ok).toBe(false);
      expect(readyReport.status.claimed_shards).toBe(2);
      expect(readyReport.claims_verification.ok).toBe(true);
      expect(readyReport.claim_execution.length).toBe(1);
      expect(readyReport.claim_execution[0]!.claim_preflight_command).toContain("verify-writer-packet-dispatch-claim");
      expect(readFileSync(join(repoRoot, readyReport.markdown_path), "utf8")).toContain("all_shards_claimed: true");
      expect(readFileSync(join(repoRoot, readyReport.markdown_path), "utf8")).toContain("Claim Execution Checklist");
    } finally {
      cleanupPacketRun(runA);
      cleanupPacketRun(runB);
      if (manifest) {
        rmSync(join(repoRoot, manifest.path), { force: true });
        rmSync(join(repoRoot, manifest.markdown_path), { force: true });
      }
      if (claim) {
        rmSync(join(repoRoot, claim.path), { force: true });
        rmSync(join(repoRoot, claim.markdown_path), { force: true });
      }
      if (plan) {
        rmSync(join(repoRoot, plan.path), { force: true });
        rmSync(join(repoRoot, plan.markdown_path), { force: true });
      }
      for (const report of [initialReport, readyReport]) {
        if (!report) continue;
        rmSync(join(repoRoot, report.path), { force: true });
        rmSync(join(repoRoot, report.markdown_path), { force: true });
      }
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("detects stale writer backlog queue metadata", () => {
    const run = generateWriterBacklogPackets({ limit: 1, offset: 0 });
    const driftPath = join(repoRoot, "data", "post-ingest", "test-writer-packet-queue-drift.json");
    try {
      const packetJson = JSON.parse(readFileSync(join(repoRoot, run.json_path), "utf8")) as WriterBacklogPacketRun;
      packetJson.packets[0]!.queue_item_hash = "bad-hash";
      writeFileSync(driftPath, `${JSON.stringify(packetJson, null, 2)}\n`, "utf8");

      const verification = verifyWriterBacklogPackets(driftPath);
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.code)).toContain("queue_item_drift");
    } finally {
      cleanupPacketRun(run);
      rmSync(driftPath, { force: true });
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("detects stale packet evidence refs", () => {
    const run = generateWriterBacklogPackets({ limit: 1, offset: 0 });
    const staleEvidencePath = join(repoRoot, "data", "post-ingest", "test-writer-packet-stale-evidence.json");
    try {
      const packetJson = JSON.parse(readFileSync(join(repoRoot, run.json_path), "utf8")) as WriterBacklogPacketRun;
      const target = packetJson.packets[0]!.target_record;
      expect(target.evidence_refs!.length).toBeGreaterThan(target.evidence_snippets.length);
      target.evidence_refs![target.evidence_snippets.length] = { source_id: "missing_source", block_id: "missing_block" };
      writeFileSync(staleEvidencePath, `${JSON.stringify(packetJson, null, 2)}\n`, "utf8");

      const verification = verifyWriterBacklogPackets(staleEvidencePath);
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.code)).toContain("stale_packet_evidence_ref");
    } finally {
      cleanupPacketRun(run);
      rmSync(staleEvidencePath, { force: true });
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("detects missing packet evidence refs", () => {
    const run = generateWriterBacklogPackets({ limit: 1, offset: 0 });
    const missingEvidencePath = join(repoRoot, "data", "post-ingest", "test-writer-packet-missing-evidence.json");
    try {
      const packetJson = JSON.parse(readFileSync(join(repoRoot, run.json_path), "utf8")) as WriterBacklogPacketRun;
      packetJson.packets[0]!.target_record.evidence_refs = packetJson.packets[0]!.target_record.evidence_refs!.slice(0, -1);
      writeFileSync(missingEvidencePath, `${JSON.stringify(packetJson, null, 2)}\n`, "utf8");

      const verification = verifyWriterBacklogPackets(missingEvidencePath);
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.code)).toContain("missing_packet_evidence_ref");
    } finally {
      cleanupPacketRun(run);
      rmSync(missingEvidencePath, { force: true });
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("detects malformed packet evidence refs", () => {
    const run = generateWriterBacklogPackets({ limit: 1, offset: 0 });
    const malformedEvidencePath = join(repoRoot, "data", "post-ingest", "test-writer-packet-malformed-evidence.json");
    try {
      const packetJson = JSON.parse(readFileSync(join(repoRoot, run.json_path), "utf8")) as WriterBacklogPacketRun;
      (packetJson.packets[0]!.target_record as unknown as { evidence_refs: unknown }).evidence_refs = [null, { source_id: "source_only" }];
      writeFileSync(malformedEvidencePath, `${JSON.stringify(packetJson, null, 2)}\n`, "utf8");

      const verification = verifyWriterBacklogPackets(malformedEvidencePath);
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.code)).toContain("malformed_packet_evidence_refs");
      expect(verification.issues.map((issue) => issue.code)).toContain("missing_packet_evidence_ref");
    } finally {
      cleanupPacketRun(run);
      rmSync(malformedEvidencePath, { force: true });
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("distinguishes non-empty writer regions during packet freshness verification", () => {
    const run = generateWriterBacklogPackets({ limit: 1, offset: 0 });
    const pagePath = join(repoRoot, run.packets[0]!.page_path);
    const originalPage = readFileSync(pagePath, "utf8");
    try {
      writeFileSync(
        pagePath,
        originalPage.replace(/<!-- mta-wiki:writer:start -->[\s\S]*?<!-- mta-wiki:writer:end -->/u, "<!-- mta-wiki:writer:start -->\nDraft text.\n<!-- mta-wiki:writer:end -->"),
        "utf8",
      );
      const verification = verifyWriterBacklogPackets(run.json_path);
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.code)).toContain("writer_region_not_empty");
    } finally {
      writeFileSync(pagePath, originalPage, "utf8");
      cleanupPacketRun(run);
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("distinguishes missing writer regions during packet freshness verification", () => {
    const run = generateWriterBacklogPackets({ limit: 1, offset: 0 });
    const pagePath = join(repoRoot, run.packets[0]!.page_path);
    const originalPage = readFileSync(pagePath, "utf8");
    try {
      writeFileSync(pagePath, originalPage.replace(/<!-- mta-wiki:writer:start -->[\s\S]*?<!-- mta-wiki:writer:end -->/u, ""), "utf8");
      const verification = verifyWriterBacklogPackets(run.json_path);
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.code)).toContain("missing_writer_region");
    } finally {
      writeFileSync(pagePath, originalPage, "utf8");
      cleanupPacketRun(run);
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("derives packet pages for future writer edit verification", () => {
    const run = generateWriterBacklogPackets({ limit: 1, offset: 0 });
    try {
      const verification = verifyWriterBacklogPacketEdits([run.json_path]);
      expect(verification.ok).toBe(false);
      expect(verification.packet_file_count).toBe(1);
      expect(verification.page_count).toBe(1);
      expect(verification.pages).toEqual([run.packets[0]!.page_path]);
      expect(verification.packet_verification.ok).toBe(true);
      expect(verification.citation_verification.ok).toBe(false);
      expect(verification.citation_verification.issues.map((issue) => issue.code)).toContain("missing_writer_citations");
    } finally {
      cleanupPacketRun(run);
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);

  it("detects duplicate packet pages before writer edit verification", () => {
    const run = generateWriterBacklogPackets({ limit: 1, offset: 0 });
    const duplicatePath = join(repoRoot, "data", "post-ingest", "test-writer-packet-edit-duplicate.json");
    try {
      const packetJson = JSON.parse(readFileSync(join(repoRoot, run.json_path), "utf8")) as WriterBacklogPacketRun;
      packetJson.packets.push({ ...packetJson.packets[0]! });
      writeFileSync(duplicatePath, `${JSON.stringify(packetJson, null, 2)}\n`, "utf8");

      const verification = verifyWriterBacklogPacketEdits([duplicatePath]);
      expect(verification.ok).toBe(false);
      expect(verification.packet_issues.map((issue) => issue.code)).toContain("duplicate_packet_page");
    } finally {
      cleanupPacketRun(run);
      rmSync(duplicatePath, { force: true });
    }
  }, ARTIFACT_TEST_TIMEOUT_MS);
});
