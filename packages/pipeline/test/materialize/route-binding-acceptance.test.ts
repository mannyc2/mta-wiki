import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { MtaCanonicalRecord } from "@mta-wiki/db/types";

import {
  buildRouteBindingAcceptance,
  verifyRouteBindingAcceptance,
} from "../../src/materialize/route-binding-acceptance.js";
import { parseRouteInventoryJsonl } from "../../src/materialize/route-identity-contract.js";

const root = process.cwd();
const snapshotId = "mta-bus-2026-07-18-route-provenance-v1";
const proposalPath = join(root, "data/quality/route-identity", snapshotId, "proposed-bindings.json");
const manifestPath = join(root, "data/reference/gtfs/snapshots", snapshotId, "manifest.json");
const inventoryPath = join(root, "data/reference/gtfs/snapshots", snapshotId, "route_inventory.jsonl");
const routesPath = join(root, "data/canonical/routes.jsonl");
const completenessPath = join(root, "data/route-identity/accepted/v1/legacy-route-identity-completeness.jsonl");
const reviewPath = join(root, "data/relationship-integrity/dispositions/v1/routes/review.json");

function sha256(bytes: string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as T);
}

function fixture() {
  const proposalBytes = readFileSync(proposalPath, "utf8");
  const snapshotManifestBytes = readFileSync(manifestPath, "utf8");
  return {
    proposalBytes,
    expectedProposalSha256: sha256(proposalBytes),
    snapshotManifestBytes,
    snapshotManifestSha256: sha256(snapshotManifestBytes),
    records: jsonl<MtaCanonicalRecord>(routesPath),
    inventory: parseRouteInventoryJsonl(readFileSync(inventoryPath, "utf8")),
    legacyCompletenessBytes: readFileSync(completenessPath, "utf8"),
    legacyCompletenessPath: "data/route-identity/accepted/v1/legacy-route-identity-completeness.jsonl",
    legacyReviewBytes: readFileSync(reviewPath, "utf8"),
    legacyReviewPath: "data/relationship-integrity/dispositions/v1/routes/review.json",
    acceptedBy: "MTA Wiki owner (Codex task 019f7640-fd5c-7be2-8a40-a7c264284c0f)",
    acceptedAt: "2026-07-18T19:57:18Z",
    rationale: "The owner authorized the shared NYCT route namespace model and instructed that deterministic proposal hashes are receipts, not separate approval gates; this acceptance binds the complete corrected provenance-bearing snapshot without attributing deterministic projections to a human reviewer.",
    proposalPath: "data/quality/route-identity/mta-bus-2026-07-18-route-provenance-v1/proposed-bindings.json",
  } as const;
}

describe("route-binding owner acceptance", () => {
  it("accounts for the complete corpus and preserves exact base/plus identity", () => {
    const input = fixture();
    const built = buildRouteBindingAcceptance(input);
    expect(built.acceptance).toMatchObject({
      status: "accepted",
      route_record_count: 395,
      exact_binding_count: 299,
      projectable_count: 274,
      historical_description_count: 34,
      family_or_aggregate_count: 15,
      current_ineligible_count: 8,
      acceptance_scope: "owner_approved_complete_route_adjudication_v1",
    });
    expect(built.decisions).toHaveLength(156);
    expect(built.projectionInput).toHaveLength(395);
    expect(new Set(built.decisions.map((row) => row.route_record_id)).size).toBe(156);
    expect(built.projectionInput.filter((row) => row.decision_id === null)).toHaveLength(239);
    expect(built.projectionInput.every((row) => !("accepted_by" in row) && !("accepted_at" in row))).toBeTrue();
    expect(built.acceptance.decision_set_sha256).toBe(sha256(built.decisionsBytes));

    const byId = new Map(built.projectionInput.map((row) => [row.route_record_id, row]));
    expect(byId.get("route_b44-local")).toMatchObject({ gtfs_route_id: "B44", decision_id: null, decision_kind: "current_primary", projectable: true });
    expect(byId.get("route_b44-sbs")).toMatchObject({ gtfs_route_id: "B44+", decision_kind: "current_primary", projectable: true });
    expect(byId.get("route_b44-limited")).toMatchObject({ gtfs_route_id: "B44", decision_kind: "historical_description", projectable: false });
    expect(byId.get("route_b82-sbs")).toMatchObject({ gtfs_route_id: "B82+", projectable: true });
    expect(byId.get("route_bx6-local")).toMatchObject({ gtfs_route_id: "BX6", projectable: true });
    expect(byId.get("route_bx6-sbs")).toMatchObject({ gtfs_route_id: "BX6+", projectable: true });
    expect(byId.get("route_m14-ad-sbs")).toMatchObject({ gtfs_route_id: null, identity_scope: "aggregate_context", projectable: false });
    expect(byId.get("route_q48-serves-lga-2011")).toMatchObject({ gtfs_route_id: "Q48", record_temporal_scope: "historical_description", projectable: false });
    expect(byId.get("route_q6-ace")).toMatchObject({ gtfs_route_id: "Q06", projectable: false, ineligibility_reasons: ["catalog_not_in_effect"] });
    expect(byId.get("route_q9-qbnr-2025")).toMatchObject({ gtfs_route_id: "Q09", projectable: false, ineligibility_reasons: ["catalog_not_in_effect"] });
    expect(built.decisions.find((row) => row.route_record_id === "route_b44-local")).toBeUndefined();
    expect(built.decisions.find((row) => row.route_record_id === "route_b44-limited")).toMatchObject({ reviewed_axes: ["record_temporal_scope"], projectable: false });
    verifyRouteBindingAcceptance({ ...input, built });
  });

  it("is byte-deterministic for fixed accepted metadata", () => {
    const input = fixture();
    const left = buildRouteBindingAcceptance(input);
    const right = buildRouteBindingAcceptance({
      ...input,
      records: [...input.records].reverse(),
      inventory: [...input.inventory].reverse(),
    });
    expect(right.acceptanceBytes).toBe(left.acceptanceBytes);
    expect(right.decisionsBytes).toBe(left.decisionsBytes);
    expect(right.projectionInputBytes).toBe(left.projectionInputBytes);
  });

  it("fails closed on unaccepted proposal bytes, canonical drift, and output tampering", () => {
    const input = fixture();
    expect(() => buildRouteBindingAcceptance({ ...input, expectedProposalSha256: "0".repeat(64) }))
      .toThrow("does not match exact bytes");

    const changed = structuredClone(input.records);
    const first = changed[0]!;
    first.payload = { ...first.payload, route_id: "DRIFT" };
    expect(() => buildRouteBindingAcceptance({ ...input, records: changed }))
      .toThrow("stale against current canonical records");

    const built = buildRouteBindingAcceptance(input);
    expect(() => verifyRouteBindingAcceptance({
      ...input,
      built: { ...built, decisionsBytes: built.decisionsBytes + " " },
    })).toThrow("not the canonical projection");
  });
});
