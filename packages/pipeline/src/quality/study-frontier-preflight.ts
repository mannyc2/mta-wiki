import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  parseBusLaneIdentityDecision,
  parseBusLaneIdentityLedger,
  validateReviewedReceiptRefs,
  type BusLaneIdentityRow,
} from "./bus-lane-identity.js";
import {
  loadMemberGrainBlockReceipt,
  memberGrainBlockKey,
} from "./member-grain-block-receipts.js";
import type {
  MemberExtentLedgerRow,
  MemberGrainLedgerRow,
} from "./member-extent-ledger.js";
import {
  loadMemberExtentAbsenceReceipts,
  loadMemberExtentDecisions,
  loadMemberSourceGapOverlays,
} from "./member-extent-ledger.js";
import {
  loadMemberGrainDecisions,
} from "./member-grain-decisions.js";
import type { MemberExtentRow } from "./study-readiness-v1.js";

export const STUDY_FRONTIER_PREFLIGHT_CONTRACT_ID =
  "study-frontier-preflight-v1" as const;

export type StudyFrontierPreflightResult = {
  schema_version: 1;
  contract_id: typeof STUDY_FRONTIER_PREFLIGHT_CONTRACT_ID;
  status: "closed";
  bus_lane_candidate_count: number;
  member_extent_candidate_count: number;
  member_grain_candidate_count: number;
  bridge_candidate_count: number;
  frontier_exception_count: 0;
  receipt_reference_count: number;
  histograms: {
    bus_lane: Record<string, number>;
    member_extent: Record<string, number>;
    member_grain: Record<string, number>;
  };
  frozen_v1_verified: true;
  authorizes_study: false;
  authorizes_cross_product: false;
};

type PreflightPaths = {
  busLedger: string;
  busPackets: string;
  memberCompanion: string;
  memberExtentLedger: string;
  memberGrainLedger: string;
  bridge: string;
  exceptions: string;
  freeze: string;
  qualityRoot: string;
  grainBlockReceipt: string;
  busDecisionDir: string;
  busReceiptDir: string;
  extentDecisionDir: string;
  grainDecisionDir: string;
  absenceReceiptDir: string;
  sourceGapOverlayDir: string;
};

const defaults: PreflightPaths = {
  busLedger: "data/quality/operational-reference/bus-lane-identity-ledger.jsonl",
  busPackets: "data/quality/acquisition/packets/bus-lane",
  memberCompanion:
    "data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl",
  memberExtentLedger:
    "data/quality/operational-reference/member-extent-ledger.jsonl",
  memberGrainLedger:
    "data/quality/operational-reference/member-grain-ledger.jsonl",
  bridge: "data/quality/study-readiness/v1/bridge-ledger.jsonl",
  exceptions:
    "data/quality/operational-reference/frontier-exceptions.json",
  freeze:
    "data/quality/study-frontier-closure/plan-041-v1-baseline-freeze.json",
  qualityRoot: "data/quality",
  grainBlockReceipt:
    "data/quality/acquisition/receipts/member-grain/plan-040-package-11-reviewed-blocks-v1.json",
  busDecisionDir:
    "data/quality/operational-reference/bus-lane-identity-decisions",
  busReceiptDir: "data/quality/acquisition/receipts/bus-lane-review",
  extentDecisionDir:
    "data/quality/operational-reference/member-extent-ledger-decisions",
  grainDecisionDir:
    "data/quality/operational-reference/member-grain-decisions",
  absenceReceiptDir: "data/quality/acquisition/receipts/member-extent",
  sourceGapOverlayDir:
    "data/quality/operational-reference/member-source-gap-overlays",
};

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  return value as Record<string, unknown>;
}

function safeFile(rootDir: string, relativePath: string): string {
  const root = resolve(rootDir);
  const target = resolve(root, relativePath);
  if (!target.startsWith(`${root}${sep}`)) {
    throw new Error(`${relativePath}: path escapes repository root`);
  }
  const rootReal = realpathSync(root);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${relativePath}: expected normal file`);
  }
  if (!realpathSync(target).startsWith(`${rootReal}${sep}`)) {
    throw new Error(`${relativePath}: file resolves outside repository root`);
  }
  return target;
}

function jsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8").split(/\r?\n/u).flatMap((line, index) => {
    if (!line) return [];
    const value = JSON.parse(line) as unknown;
    if (stableJson(value as JsonValue) !== line) {
      throw new Error(`${path}:${index + 1}: expected canonical stable JSON`);
    }
    return [value as T];
  });
}

function files(path: string): string[] {
  if (!existsSync(path)) return [];
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`${path}: symlinks are forbidden`);
  if (stat.isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    files(join(path, entry.name))
  ).sort();
}

function histogram(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  ));
}

function memberKey(value: {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
}): string {
  return `${value.occurrence_id}\0${value.route_record_id}\0${value.treatment_record_id}`;
}

function assertUniqueSorted(values: readonly string[], path: string): void {
  if (
    new Set(values).size !== values.length ||
    stableJson(values as JsonValue) !== stableJson([...values].sort() as JsonValue)
  ) {
    throw new Error(`${path}: denominator must be sorted and unique`);
  }
}

function collectArtifactIds(root: string): Set<string> {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    for (const [key, entry] of Object.entries(value)) {
      if (
        ["acceptance_id", "decision_id", "overlay_id", "receipt_id"].includes(key) &&
        typeof entry === "string"
      ) {
        ids.add(entry);
      }
      visit(entry);
    }
  };
  for (const path of files(root)) {
    if (![".json", ".jsonl"].includes(extname(path))) continue;
    const bytes = readFileSync(path, "utf8");
    try {
      if (extname(path) === ".jsonl") {
        for (const line of bytes.split(/\r?\n/u)) {
          if (line) visit(JSON.parse(line) as unknown);
        }
      } else {
        visit(JSON.parse(bytes) as unknown);
      }
    } catch {
      throw new Error(`${path}: invalid JSON while resolving frontier provenance`);
    }
  }
  return ids;
}

function verifyFreeze(rootDir: string, path: string): void {
  const freeze = object(
    JSON.parse(readFileSync(safeFile(rootDir, path), "utf8")) as unknown,
    path,
  );
  const rootFields = [
    "authorizes_cross_product", "authorizes_study", "contract_id",
    "frozen_files", "newest_verified_release", "plan_040_checkpoint",
    "schema_version",
  ];
  if (
    Object.keys(freeze).some((key) => !rootFields.includes(key)) ||
    rootFields.some((key) => !(key in freeze)) ||
    freeze.schema_version !== 1 ||
    freeze.contract_id !== "plan-041-v1-baseline-freeze-v1" ||
    freeze.authorizes_study !== false ||
    freeze.authorizes_cross_product !== false ||
    !Array.isArray(freeze.frozen_files)
  ) {
    throw new Error(`${path}: invalid freeze contract`);
  }
  const expectedPaths = [
    "data/quality/study-readiness/v1/bridge-ledger.jsonl",
    "data/quality/study-readiness/v1/bridge-summary.json",
    "data/quality/study-readiness/v1/consumer-owned-quarantine.jsonl",
    "data/quality/study-readiness/v1/consumer-priority-manifest.json",
    "data/quality/study-readiness/v1/manifest.json",
    "data/quality/study-readiness/v1/research/reviewed-candidate-packets.jsonl",
    "data/quality/study-readiness/v1/research/summary.json",
    "data/quality/study-readiness/v1/tracker-rc26-input.json",
    "packages/pipeline/src/quality/study-readiness-v1.ts",
  ];
  const frozenPaths: string[] = [];
  for (const [index, entryValue] of freeze.frozen_files.entries()) {
    const entry = object(entryValue, `${path}.frozen_files[${index}]`);
    if (
      stableJson(Object.keys(entry).sort() as JsonValue) !==
        stableJson(["bytes", "path", "sha256"] as JsonValue)
    ) {
      throw new Error(`${path}.frozen_files[${index}]: exact fields required`);
    }
    if (
      typeof entry.path !== "string" ||
      typeof entry.bytes !== "number" ||
      !Number.isInteger(entry.bytes) ||
      entry.bytes < 1 ||
      typeof entry.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(entry.sha256)
    ) {
      throw new Error(`${path}.frozen_files[${index}]: invalid pin`);
    }
    frozenPaths.push(entry.path);
    const bytes = readFileSync(safeFile(rootDir, entry.path));
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== entry.bytes || digest !== entry.sha256) {
      throw new Error(`${path}: frozen v1 drift at ${entry.path}`);
    }
  }
  if (
    stableJson(frozenPaths as JsonValue) !== stableJson(expectedPaths as JsonValue)
  ) {
    throw new Error(`${path}: frozen v1 set must be the exact sorted nine-file baseline`);
  }
  const checkpoint = object(freeze.plan_040_checkpoint, `${path}.plan_040_checkpoint`);
  const checkpointFields = ["commit", "path", "sha256"];
  if (
    stableJson(Object.keys(checkpoint).sort() as JsonValue) !==
      stableJson(checkpointFields as JsonValue) ||
    checkpoint.commit !== "40a032dd5f3ae90208a6dc2b32219f9b43510d59" ||
    checkpoint.path !==
      "data/quality/operational-reference/member-extent-risk/plan-040-final-checkpoint-v1.json" ||
    checkpoint.sha256 !==
      "33ba121bed1d4e5ade57983ccadfff0d1b6099c1e87a653237673cb7871c5594"
  ) {
    throw new Error(`${path}: Plan-040 checkpoint pin drifted`);
  }
  const checkpointBytes = readFileSync(safeFile(rootDir, checkpoint.path as string));
  if (
    createHash("sha256").update(checkpointBytes).digest("hex") !==
      checkpoint.sha256
  ) {
    throw new Error(`${path}: Plan-040 checkpoint bytes drifted`);
  }
  const release = object(
    freeze.newest_verified_release,
    `${path}.newest_verified_release`,
  );
  const releaseFields = [
    "manifest_bytes", "manifest_path", "manifest_sha256", "manifest_version",
    "release_id",
  ];
  if (
    stableJson(Object.keys(release).sort() as JsonValue) !==
      stableJson(releaseFields as JsonValue) ||
    release.release_id !== "v1-rc27" ||
    release.manifest_version !== 5 ||
    release.manifest_path !== "data/exports/releases/v1-rc27/manifest.json" ||
    release.manifest_bytes !== 76157 ||
    release.manifest_sha256 !==
      "ed2332e653c7c9b5e37faee52198ff9f4c17d725c539831a4010471be5de622a"
  ) {
    throw new Error(`${path}: newest verified release pin drifted`);
  }
  const releaseBytes = readFileSync(safeFile(rootDir, release.manifest_path as string));
  if (
    releaseBytes.length !== release.manifest_bytes ||
    createHash("sha256").update(releaseBytes).digest("hex") !==
      release.manifest_sha256
  ) {
    throw new Error(`${path}: newest verified release bytes drifted`);
  }
}

function validateExceptions(rootDir: string, path: string): void {
  const value = object(
    JSON.parse(readFileSync(safeFile(rootDir, path), "utf8")) as unknown,
    path,
  );
  if (
    stableJson(Object.keys(value).sort() as JsonValue) !==
      stableJson(["exceptions", "schema_version"] as JsonValue) ||
    value.schema_version !== 1 ||
    !Array.isArray(value.exceptions)
  ) {
    throw new Error(`${path}: invalid exceptions contract`);
  }
  if (value.exceptions.length > 0) {
    throw new Error(`${path}: closure release requires zero frontier exceptions`);
  }
}

function validatePackets(
  packetRoot: string,
  ledger: readonly BusLaneIdentityRow[],
): void {
  const expected = new Set(ledger.map((row) => row.candidate_id));
  const packets = files(packetRoot).filter((path) => extname(path) === ".json")
    .map((path) => object(JSON.parse(readFileSync(path, "utf8")) as unknown, path))
    .filter((packet) => typeof packet.packet_id === "string");
  const candidateIds = packets.map((packet) => String(packet.candidate_id));
  if (
    new Set(candidateIds).size !== candidateIds.length ||
    candidateIds.length !== expected.size ||
    candidateIds.some((id) => !expected.has(id))
  ) {
    throw new Error(`${packetRoot}: packet denominator does not match identity ledger`);
  }
  for (const packet of packets) {
    if (packet.disposition === "open") {
      throw new Error(`${packetRoot}: open packet ${String(packet.packet_id)}`);
    }
  }
}

export function runStudyFrontierPreflight(options: {
  rootDir?: string;
  paths?: Partial<PreflightPaths>;
} = {}): StudyFrontierPreflightResult {
  const rootDir = resolve(options.rootDir ?? repoRoot);
  const paths = { ...defaults, ...options.paths };
  verifyFreeze(rootDir, paths.freeze);
  validateExceptions(rootDir, paths.exceptions);

  const bus = parseBusLaneIdentityLedger(
    readFileSync(safeFile(rootDir, paths.busLedger), "utf8"),
    paths.busLedger,
  );
  const busIds = bus.map((row) => row.candidate_id);
  assertUniqueSorted(busIds, paths.busLedger);
  for (const row of bus) {
    if (
      ["unreviewed", "occurrence_ready", "onset_unresolved",
        "traversal_marginal_or_ambiguous"].includes(row.verdict)
    ) {
      throw new Error(`${row.ledger_id}: nonterminal identity verdict ${row.verdict}`);
    }
    if (!row.decision_id || row.receipt_ids.length === 0) {
      throw new Error(`${row.ledger_id}: terminal identity row lacks decision/receipt provenance`);
    }
  }
  validatePackets(resolve(rootDir, paths.busPackets), bus);
  validateReviewedReceiptRefs(
    bus,
    resolve(rootDir, paths.busReceiptDir),
  );
  const busDecisions = files(resolve(rootDir, paths.busDecisionDir))
    .filter((path) => extname(path) === ".json")
    .map((path) =>
      parseBusLaneIdentityDecision(
        JSON.parse(readFileSync(path, "utf8")) as unknown,
        path,
      )
    );
  const busDecisionById = new Map(busDecisions.map((decision) => [
    decision.decision_id,
    decision,
  ]));
  if (busDecisionById.size !== busDecisions.length) {
    throw new Error(`${paths.busDecisionDir}: duplicate decision ids`);
  }
  for (const row of bus) {
    const decision = busDecisionById.get(row.decision_id!);
    if (
      !decision ||
      decision.ledger_id !== row.ledger_id ||
      decision.candidate_id !== row.candidate_id ||
      decision.verdict !== row.verdict ||
      stableJson(decision.receipt_ids as JsonValue) !==
        stableJson(row.receipt_ids as JsonValue) ||
      stableJson(decision.unresolved_bindings as JsonValue) !==
        stableJson(row.unresolved_bindings as JsonValue)
    ) {
      throw new Error(`${row.ledger_id}: decision does not bind the terminal row`);
    }
  }

  const companion = jsonl<MemberExtentRow>(safeFile(rootDir, paths.memberCompanion));
  const extent = jsonl<MemberExtentLedgerRow>(safeFile(rootDir, paths.memberExtentLedger));
  const grain = jsonl<MemberGrainLedgerRow>(safeFile(rootDir, paths.memberGrainLedger));
  const companionKeys = companion.map(memberKey);
  const extentKeys = extent.map(memberKey);
  const grainKeys = grain.map(memberKey);
  assertUniqueSorted(companionKeys, paths.memberCompanion);
  assertUniqueSorted(extentKeys, paths.memberExtentLedger);
  assertUniqueSorted(grainKeys, paths.memberGrainLedger);
  if (
    stableJson(companionKeys as JsonValue) !== stableJson(extentKeys as JsonValue) ||
    stableJson(extentKeys as JsonValue) !== stableJson(grainKeys as JsonValue)
  ) {
    throw new Error("member companion/extent/grain denominator mismatch");
  }
  const extentDecisions = loadMemberExtentDecisions([
    resolve(rootDir, paths.extentDecisionDir),
  ]);
  const extentDecisionsById = new Map(extentDecisions.map((decision) => [
    decision.decision_id,
    decision,
  ]));
  const grainDecisions = loadMemberGrainDecisions([
    resolve(rootDir, paths.grainDecisionDir),
  ]);
  const grainDecisionsById = new Map(grainDecisions.map((decision) => [
    decision.decision_id,
    decision,
  ]));
  const grainDecisionsByKey = new Map(grainDecisions.map((decision) => [
    memberKey(decision),
    decision,
  ]));
  const absenceCoverage = new Set<string>();
  for (const receipt of loadMemberExtentAbsenceReceipts([
    resolve(rootDir, paths.absenceReceiptDir),
  ])) {
    for (const key of receipt.extent_keys.map(memberKey)) {
      for (const surface of receipt.surfaces) {
        absenceCoverage.add(`${surface}\0${key}\0${receipt.receipt_id}`);
      }
    }
  }
  const sourceGapCoverage = new Set<string>();
  for (const overlay of loadMemberSourceGapOverlays(
    [resolve(rootDir, paths.sourceGapOverlayDir)],
    rootDir,
  )) {
    for (const entry of overlay.entries) {
      for (const surface of entry.blocked_surfaces) {
        sourceGapCoverage.add(
          `${surface}\0${entry.candidate_key}\0${overlay.source_receipt.receipt_id}`,
        );
      }
    }
  }

  for (let index = 0; index < companion.length; index += 1) {
    const source = companion[index]!;
    const spatial = extent[index]!;
    const service = grain[index]!;
    if (spatial.verdict === "unreviewed") {
      throw new Error(`${spatial.ledger_id}: unreviewed member extent`);
    }
    if (service.verdict === "unreviewed") {
      throw new Error(`${service.ledger_id}: unreviewed member grain`);
    }
    if (
      source.extent === "unresolved" &&
      spatial.verdict !== "absent_in_source" &&
      !spatial.verdict.startsWith("blocked_upstream:")
    ) {
      throw new Error(`${spatial.ledger_id}: unresolved companion row is not terminal`);
    }
    if (
      source.extent !== "unresolved" &&
      (!spatial.verdict.startsWith("resolved:") ||
        !spatial.verdict_basis?.startsWith("review:"))
    ) {
      throw new Error(`${spatial.ledger_id}: positive companion row lacks validating decision`);
    }
    if (
      (spatial.verdict === "absent_in_source" ||
        spatial.verdict.startsWith("blocked_upstream:")) &&
      spatial.receipt_ids.length === 0
    ) {
      throw new Error(`${spatial.ledger_id}: terminal extent lacks receipt`);
    }
    const spatialReviewId = spatial.verdict_basis?.match(/review:([^;]+)/u)?.[1];
    if (spatialReviewId) {
      const decision = extentDecisionsById.get(spatialReviewId);
      const companionDecisionMatches =
        source.decision_id === spatialReviewId &&
        source.extent === spatial.current_extent_kind;
      if (
        !companionDecisionMatches &&
        (!decision || memberKey(decision) !== memberKey(spatial) ||
          decision.resolution !== spatial.current_extent_kind)
      ) {
        throw new Error(`${spatial.ledger_id}: extent decision does not bind the row`);
      }
    }
    for (const receiptId of spatial.receipt_ids) {
      const coverage = `member_extent\0${memberKey(spatial)}\0${receiptId}`;
      if (!absenceCoverage.has(coverage) && !sourceGapCoverage.has(coverage)) {
        throw new Error(`${spatial.ledger_id}: receipt ${receiptId} does not name the row`);
      }
    }
    if (
      (service.verdict === "absent_in_source" ||
        service.verdict.startsWith("blocked_upstream:")) &&
      service.receipt_ids.length === 0
    ) {
      throw new Error(`${service.ledger_id}: terminal grain lacks receipt`);
    }
    if (
      ["resolved", "not_applicable"].includes(service.verdict) &&
      (!service.service_scope || !service.verdict_basis?.startsWith("review:"))
    ) {
      throw new Error(`${service.ledger_id}: terminal grain lacks structured reviewed decision`);
    }
    const grainReviewId = service.verdict_basis?.match(/review:([^;]+)/u)?.[1];
    const grainDecision = grainReviewId
      ? grainDecisionsById.get(grainReviewId)
      : grainDecisionsByKey.get(memberKey(service));
    if (
      service.service_scope !== null &&
      (
        !grainDecision ||
        memberKey(grainDecision) !== memberKey(service) ||
        grainDecision.gtfs_route_id !== service.gtfs_route_id ||
        grainDecision.member_extent_decision_id !==
          service.member_extent_decision_id ||
        stableJson(grainDecision.service_scope as unknown as JsonValue) !==
          stableJson(service.service_scope as unknown as JsonValue) ||
        stableJson(grainDecision.lineage_segments as unknown as JsonValue) !==
          stableJson(service.lineage_segments as unknown as JsonValue) ||
        stableJson(grainDecision.evidence_bindings as unknown as JsonValue) !==
          stableJson(service.evidence_bindings as unknown as JsonValue)
      )
    ) {
      throw new Error(`${service.ledger_id}: grain decision does not bind the row`);
    }
    for (const receiptId of service.receipt_ids) {
      if (receiptId === "plan-040-package-11-reviewed-blocks-v1") continue;
      const coverage = `member_grain\0${memberKey(service)}\0${receiptId}`;
      if (!absenceCoverage.has(coverage) && !sourceGapCoverage.has(coverage)) {
        throw new Error(`${service.ledger_id}: receipt ${receiptId} does not name the row`);
      }
    }
  }

  const grainBlock = loadMemberGrainBlockReceipt(paths.grainBlockReceipt, rootDir);
  const grainByKey = new Map(grain.map((row) => [memberKey(row), row]));
  for (const binding of grainBlock.bindings) {
    const row = grainByKey.get(memberGrainBlockKey(binding));
    if (
      !row ||
      !row.verdict.startsWith("blocked_upstream:") ||
      !row.receipt_ids.includes(grainBlock.receipt_id) ||
      row.member_extent_decision_id !== binding.member_extent_decision_id
    ) {
      throw new Error(
        `${grainBlock.receipt_id}: unresolved binding is not overlaid in member-grain ledger`,
      );
    }
  }

  const artifactIds = collectArtifactIds(resolve(rootDir, paths.qualityRoot));
  const referenced = new Set<string>();
  for (const row of bus) {
    referenced.add(row.decision_id!);
    row.receipt_ids.forEach((id) => referenced.add(id));
  }
  for (const row of [...extent, ...grain]) {
    row.receipt_ids.forEach((id) => referenced.add(id));
    const reviewId = row.verdict_basis?.match(/review:([^;]+)/u)?.[1];
    if (reviewId) referenced.add(reviewId);
  }
  const unresolvedRefs = [...referenced].filter((id) => !artifactIds.has(id)).sort();
  if (unresolvedRefs.length > 0) {
    throw new Error(
      `frontier provenance references do not resolve: ${unresolvedRefs.slice(0, 10).join(", ")}`,
    );
  }

  const bridge = jsonl<{ candidate_id: string }>(safeFile(rootDir, paths.bridge));
  const bridgeIds = new Set(bridge.map((row) => row.candidate_id));
  const missingBus = busIds.filter((id) => !bridgeIds.has(id));
  if (missingBus.length > 0) {
    throw new Error(`bridge omits identity candidates: ${missingBus.slice(0, 5).join(", ")}`);
  }
  if (
    bus.length !== 321 ||
    extent.length !== 308 ||
    grain.length !== 308 ||
    bridge.length !== 484 ||
    bus.some((row) => row.verdict !== "binding_absent_after_search")
  ) {
    throw new Error(
      "live frontier denominator/histogram drift: expected 321 binding-absent identities, 308 extents, 308 grains, 484 bridge rows",
    );
  }
  const bridgeRows = jsonl<{
    candidate_id: string;
    downstream_disposition: string;
    treatment_extent?: { members?: MemberExtentRow[] };
  }>(safeFile(rootDir, paths.bridge));
  const bridgeMemberKeys = bridgeRows.flatMap((row) =>
    row.treatment_extent?.members?.map(memberKey) ?? []
  );
  if (
    new Set(bridgeMemberKeys).size !== bridgeMemberKeys.length ||
    bridgeMemberKeys.some((key) => !new Set(extentKeys).has(key))
  ) {
    throw new Error("bridge/member frontier denominator cross-check failed");
  }
  const memberFrontierIds = new Set(bridgeRows
    .filter((row) =>
      row.downstream_disposition === "source_fixable_member_treatment_extent"
    )
    .map((row) => row.candidate_id));
  if (memberFrontierIds.size !== 83) {
    throw new Error(
      `bridge member frontier denominator drift: expected 83, got ${memberFrontierIds.size}`,
    );
  }
  const overlap = busIds.filter((id) => memberFrontierIds.has(id));
  if (overlap.length > 0) {
    throw new Error(
      `candidate appears in both source frontiers without a consistent state: ${overlap.join(", ")}`,
    );
  }
  if (referenced.size !== 838) {
    throw new Error(
      `live frontier receipt-reference denominator drift: expected 838, got ${referenced.size}`,
    );
  }

  return {
    schema_version: 1,
    contract_id: STUDY_FRONTIER_PREFLIGHT_CONTRACT_ID,
    status: "closed",
    bus_lane_candidate_count: bus.length,
    member_extent_candidate_count: extent.length,
    member_grain_candidate_count: grain.length,
    bridge_candidate_count: bridge.length,
    frontier_exception_count: 0,
    receipt_reference_count: referenced.size,
    histograms: {
      bus_lane: histogram(bus.map((row) => row.verdict)),
      member_extent: histogram(extent.map((row) => row.verdict)),
      member_grain: histogram(grain.map((row) => row.verdict)),
    },
    frozen_v1_verified: true,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}
