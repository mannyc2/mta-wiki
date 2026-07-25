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
  parseBusLaneIdentityLedger,
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
  if (
    freeze.schema_version !== 1 ||
    freeze.contract_id !== "plan-041-v1-baseline-freeze-v1" ||
    freeze.authorizes_study !== false ||
    freeze.authorizes_cross_product !== false ||
    !Array.isArray(freeze.frozen_files)
  ) {
    throw new Error(`${path}: invalid freeze contract`);
  }
  for (const [index, entryValue] of freeze.frozen_files.entries()) {
    const entry = object(entryValue, `${path}.frozen_files[${index}]`);
    if (
      typeof entry.path !== "string" ||
      typeof entry.bytes !== "number" ||
      typeof entry.sha256 !== "string"
    ) {
      throw new Error(`${path}.frozen_files[${index}]: invalid pin`);
    }
    const bytes = readFileSync(safeFile(rootDir, entry.path));
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== entry.bytes || digest !== entry.sha256) {
      throw new Error(`${path}: frozen v1 drift at ${entry.path}`);
    }
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
