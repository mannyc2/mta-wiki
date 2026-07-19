import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";

import {
  parseRouteIdentitySnapshotV1,
  serializeRouteIdentityRecordBindingsJsonl,
  type RouteIdentitySnapshotV1,
} from "../../src/materialize/route-identity-contract.js";
import {
  loadRouteIdentityReleaseProjection,
  type BuiltRouteIdentityReleaseProjection,
} from "../../src/materialize/route-identity-release.js";

const root = process.cwd();
const selected = "mta-bus-2026-07-18-route-provenance-v1";
const scratch = mkdtempSync(join(tmpdir(), "route-identity-release-test-"));
const records = readFileSync(join(root, "data/canonical/routes.jsonl"), "utf8")
  .split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as MtaCanonicalRecord);
let built: BuiltRouteIdentityReleaseProjection;

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function copyTracked(relativePath: string, fixtureRoot: string): void {
  const target = join(fixtureRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(root, relativePath), target);
}

function fixtureRoot(): string {
  const fixture = mkdtempSync(join(scratch, "root-"));
  const snapshotRelative = "data/reference/gtfs/snapshots/" + selected;
  mkdirSync(dirname(join(fixture, snapshotRelative)), { recursive: true });
  cpSync(join(root, snapshotRelative), join(fixture, snapshotRelative), { recursive: true });
  copyTracked("data/reference/gtfs/SELECTED", fixture);
  copyTracked("data/route-identity/accepted/v1/acceptance.json", fixture);
  const acceptance = JSON.parse(readFileSync(join(root, "data/route-identity/accepted/v1/acceptance.json"), "utf8")) as Record<string, { path?: string }>;
  for (const key of ["proposal", "legacy_route_completeness", "legacy_route_review", "decisions", "projection_input"]) {
    copyTracked(acceptance[key]!.path!, fixture);
  }
  return fixture;
}

function withBindingHash(snapshot: RouteIdentitySnapshotV1): RouteIdentitySnapshotV1 {
  const bytes = serializeRouteIdentityRecordBindingsJsonl(snapshot.record_bindings);
  return { ...snapshot, record_binding_count: snapshot.record_bindings.length, record_bindings_sha256: sha256(bytes) };
}

beforeAll(() => {
  const result = loadRouteIdentityReleaseProjection({ rootDir: root, records });
  if (!result) throw new Error("selected route-identity projection is missing");
  built = result;
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("production route-identity release projection", () => {
  it("rebuilds deterministically with exact base/plus identity and truthful attribution", () => {
    const repeat = loadRouteIdentityReleaseProjection({ rootDir: root, records });
    expect(repeat?.snapshotBytes).toBe(built.snapshotBytes);
    expect(repeat?.routeAnchorsBytes).toBe(built.routeAnchorsBytes);
    expect(built.snapshot).toMatchObject({
      gtfs_snapshot_id: selected,
      service_identity_count: 399,
      record_binding_count: 395,
      expected_route_anchors_count: 520,
    });
    const b44 = built.routeAnchors.find((row) => row.gtfs_route_id === "B44");
    const b44Plus = built.routeAnchors.find((row) => row.gtfs_route_id === "B44+");
    expect(b44?.canonical_route_record_id).toBe("route_b44-local");
    expect(b44Plus?.canonical_route_record_id).toBe("route_b44-sbs");
    expect(b44?.variant_record_ids).not.toContain("route_b44-sbs");
    const reviewed = built.snapshot.record_bindings.find((row) => row.route_record_id === "route_125th-laguardia-sbs")!;
    expect(reviewed).toMatchObject({ decision_id: "route-binding-v1:route_125th-laguardia-sbs", gtfs_route_id: "M60+", reviewed_axes: ["identity_mapping"] });
    const deterministic = built.snapshot.record_bindings.find((row) => row.route_record_id === "route_b44-sbs")!;
    expect(deterministic).toMatchObject({ identity_basis: "deterministic_exact", gtfs_route_id: "B44+" });
    expect("accepted_by" in deterministic || "accepted_at" in deterministic || "rationale" in deterministic || "reviewed_axes" in deterministic).toBeFalse();
    const deterministicBase = built.snapshot.record_bindings.find((row) => row.route_record_id === "route_b44-local")!;
    expect("decision_id" in deterministicBase || "accepted_by" in deterministicBase).toBeFalse();
  });

  it("fails closed on attribution-shape and fingerprint drift even when binding hashes are recomputed", () => {
    const deterministicIndex = built.snapshot.record_bindings.findIndex((row) => !("decision_id" in row));
    const addedHuman = structuredClone(built.snapshot);
    (addedHuman.record_bindings[deterministicIndex] as unknown as Record<string, unknown>).accepted_by = "fabricated reviewer";
    expect(() => parseRouteIdentitySnapshotV1(withBindingHash(addedHuman))).toThrow("strict keys mismatch");

    const reviewedIndex = built.snapshot.record_bindings.findIndex((row) => "decision_id" in row);
    const missingRationale = structuredClone(built.snapshot);
    delete (missingRationale.record_bindings[reviewedIndex] as unknown as Record<string, unknown>).rationale;
    expect(() => parseRouteIdentitySnapshotV1(withBindingHash(missingRationale))).toThrow("strict keys mismatch");

    const staleFingerprint = structuredClone(built.snapshot);
    staleFingerprint.record_bindings[reviewedIndex]!.expected_gtfs_identity_fingerprint = "0".repeat(64);
    expect(() => parseRouteIdentitySnapshotV1(withBindingHash(staleFingerprint))).toThrow("stale GTFS identity fingerprint");

    const reviewedDeterministicIndex = built.snapshot.record_bindings.findIndex((row) => "decision_id" in row && row.identity_basis === "deterministic_exact");
    expect(reviewedDeterministicIndex).toBeGreaterThanOrEqual(0);
    const falseAttribution = structuredClone(built.snapshot);
    (falseAttribution.record_bindings[reviewedDeterministicIndex] as { reviewed_axes: string[] }).reviewed_axes.push("identity_mapping");
    (falseAttribution.record_bindings[reviewedDeterministicIndex] as { reviewed_axes: string[] }).reviewed_axes.sort();
    expect(() => parseRouteIdentitySnapshotV1(withBindingHash(falseAttribution))).toThrow("cannot be attributed to a human reviewer");
  });

  it("rejects re-signed semantic GTFS drift and re-signed accepted projection drift", () => {
    const gtfsDriftRoot = fixtureRoot();
    const inventoryPath = join(gtfsDriftRoot, "data/reference/gtfs/snapshots", selected, "route_inventory.jsonl");
    const inventoryRows = readFileSync(inventoryPath, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    inventoryRows[0]!.display_label = "FABRICATED";
    const inventoryBytes = inventoryRows.map((row) => stableJson(row as JsonValue)).join("\n") + "\n";
    writeFileSync(inventoryPath, inventoryBytes, "utf8");
    const manifestPath = join(gtfsDriftRoot, "data/reference/gtfs/snapshots", selected, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { outputs: Record<string, { bytes: number; rows: number; sha256: string }> };
    manifest.outputs["route_inventory.jsonl"] = { ...manifest.outputs["route_inventory.jsonl"]!, bytes: Buffer.byteLength(inventoryBytes), rows: inventoryRows.length, sha256: sha256(inventoryBytes) };
    writeFileSync(manifestPath, stableJson(manifest as unknown as JsonValue) + "\n", "utf8");
    expect(() => loadRouteIdentityReleaseProjection({ rootDir: gtfsDriftRoot, records })).toThrow(/display label|precedence/u);

    const decisionDriftRoot = fixtureRoot();
    const acceptancePath = join(decisionDriftRoot, "data/route-identity/accepted/v1/acceptance.json");
    const acceptance = JSON.parse(readFileSync(acceptancePath, "utf8")) as Record<string, unknown> & { projection_input: { path: string; sha256: string; bytes: number; rows: number } };
    const projectionPath = join(decisionDriftRoot, acceptance.projection_input.path);
    const projectionRows = readFileSync(projectionPath, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    const b44Plus = projectionRows.find((row) => row.route_record_id === "route_b44-sbs")!;
    b44Plus.gtfs_route_id = "B44";
    const projectionBytes = projectionRows.map((row) => stableJson(row as JsonValue)).join("\n") + "\n";
    writeFileSync(projectionPath, projectionBytes, "utf8");
    acceptance.projection_input = { ...acceptance.projection_input, bytes: Buffer.byteLength(projectionBytes), sha256: sha256(projectionBytes), rows: projectionRows.length };
    writeFileSync(acceptancePath, stableJson(acceptance as unknown as JsonValue) + "\n", "utf8");
    expect(() => loadRouteIdentityReleaseProjection({ rootDir: decisionDriftRoot, records })).toThrow("stale against current records");
  });

  it("rejects canonical drift before producing a release projection", () => {
    const changed = structuredClone(records);
    changed[0]!.payload = { ...changed[0]!.payload, route_id: "DRIFT" };
    expect(() => loadRouteIdentityReleaseProjection({ rootDir: root, records: changed })).toThrow("stale against current canonical records");
  });
});
