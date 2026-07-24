import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import type { JsonValue } from "../../../db/src/types";
import {
  buildPlan040QbnrStopRemovalAcquisitionManifest,
  plan040QbnrAcquisitionReplayHash,
} from "../../src/quality/plan040-qbnr-stop-removal-acquisition";

const read = (path: string) => readFileSync(`${repoRoot}/${path}`, "utf8");

function currentManifest() {
  return buildPlan040QbnrStopRemovalAcquisitionManifest({
    ledgerJsonl: read("data/quality/operational-reference/member-extent-ledger.jsonl"),
    treatmentJsonl: read("data/canonical/treatment_components.jsonl"),
    routeTreatmentScopesJsonl: read("data/exports/releases/v1-rc26/route_treatment_scopes.jsonl"),
    sourceBlocksJsonl: read(
      "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
    ),
    sourceHtml: read("raw/sources/mta_queens_bus_network_redesign_service_changes/source.html"),
    sourceMetadata: JSON.parse(read(
      "raw/sources/mta_queens_bus_network_redesign_service_changes/metadata.json",
    )) as unknown,
  });
}

describe("Plan 040 QBNR generic stop-removal acquisition manifest", () => {
  it("freezes exactly 37 denominator keys with exact MTA route blocks and document URLs", () => {
    const manifest = currentManifest();
    expect(manifest.candidate_count).toBe(37);
    expect(manifest.key_count).toBe(37);
    expect(manifest.decision_count).toBe(0);
    expect(manifest.raw_text_distribution).toEqual({
      "Some stops have been removed.": 23,
      "Some stops have been removed from this route.": 14,
    });
    expect(manifest.candidates.every((candidate) =>
      candidate.official_stop_list_url.startsWith("https://www.mta.info/document/") &&
      candidate.service_change_evidence_id.startsWith(
        "mta_queens_bus_network_redesign_service_changes#",
      ) &&
      candidate.requires_candidate_specific_stop_id_equivalence &&
      !candidate.authorizes_occurrence &&
      !candidate.authorizes_study &&
      !candidate.authorizes_cross_product)).toBe(true);
  });

  it("derives feed families from exact route-treatment scopes and preserves phase requirements", () => {
    const manifest = currentManifest();
    expect(Object.values(manifest.phase_feed_distribution)
      .flatMap((counts) => Object.values(counts))
      .reduce((sum, count) => sum + count, 0)).toBe(37);
    expect(manifest.candidates.every((candidate) =>
      candidate.implementation_phase === "phase_1"
        ? candidate.implementation_date === "2025-06-29" ||
          candidate.implementation_date === "2025-06-30"
        : candidate.implementation_date === "2025-08-31" ||
          candidate.implementation_date === "2025-09-02")).toBe(true);
    const nonzeroCells = Object.entries(manifest.phase_feed_distribution).flatMap(
      ([phase, counts]) => Object.entries(counts).flatMap(([feed, count]) =>
        count > 0 ? [`${phase}/${feed}/${count}`] : []),
    );
    expect(manifest.inventory_requirements.map((requirement) =>
      `${requirement.implementation_phase}/${requirement.feed_family}/${requirement.candidate_count}`))
      .toEqual(nonzeroCells);
    expect(manifest.inventory_requirements.find((requirement) =>
      requirement.implementation_phase === "phase_2" && requirement.feed_family === "busco"))
      .toMatchObject({
        candidate_count: 12,
        acquisition_status: "required_not_yet_accepted",
      });
    expect(manifest.inventory_requirements.some((requirement) =>
      requirement.implementation_phase === "phase_2" && requirement.feed_family === "queens"))
      .toBe(false);
    expect(manifest.inventory_requirements.filter((requirement) =>
      requirement.implementation_phase === "phase_1")).toEqual([
      {
        implementation_phase: "phase_1",
        feed_family: "busco",
        candidate_count: 12,
        pre_source_id: "gtfs_static_20250625_busco_pre_qbnr",
        post_source_id: "gtfs_static_20250626_busco_post_qbnr",
        acquisition_status: "accepted_reused",
      },
      {
        implementation_phase: "phase_1",
        feed_family: "queens",
        candidate_count: 13,
        pre_source_id: "gtfs_static_20250615_queens_pre_qbnr",
        post_source_id: "gtfs_static_20250626_queens_post_qbnr",
        acquisition_status: "accepted_reused",
      },
    ]);
  });

  it("pins all derivation inputs and replays to the exact checked-in bytes and key set", () => {
    const first = currentManifest();
    const second = currentManifest();
    expect(plan040QbnrAcquisitionReplayHash(second))
      .toBe(plan040QbnrAcquisitionReplayHash(first));
    expect(Object.values(first.derivation_inputs).every((digest) =>
      /^[0-9a-f]{64}$/u.test(digest))).toBe(true);
    expect(first.source_capture.source_html_sha256).toMatch(/^[0-9a-f]{64}$/u);
    const checkedBytes = read(
      "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-stop-removal-acquisition-manifest-v1.json",
    );
    expect(checkedBytes).toBe(`${stableJson(first as unknown as JsonValue)}\n`);
    expect(first.candidate_key_sha256)
      .toBe("0a9896feebea7617c745ab62492ad3cc66c2727eed6689eff0e70e3f2b01bf7e");
    expect(plan040QbnrAcquisitionReplayHash(first))
      .toBe("00d6dfee59e21a4631e37b8a1f3aeb3221fd51f859f3899d3455f146a960932f");
    expect(createHash("sha256").update(checkedBytes).digest("hex"))
      .toBe("00d6dfee59e21a4631e37b8a1f3aeb3221fd51f859f3899d3455f146a960932f");
  });

  it("fails closed on denominator, URL, and source-byte drift", () => {
    const sourceHtml = read(
      "raw/sources/mta_queens_bus_network_redesign_service_changes/source.html",
    );
    const metadata = JSON.parse(read(
      "raw/sources/mta_queens_bus_network_redesign_service_changes/metadata.json",
    )) as Record<string, unknown>;
    expect(() => buildPlan040QbnrStopRemovalAcquisitionManifest({
      ledgerJsonl: read("data/quality/operational-reference/member-extent-ledger.jsonl")
        .split("\n")
        .filter((line) => !line.includes("\"treatment_record_id\":\"treatment_q27-stop-removal-2025\""))
        .join("\n"),
      treatmentJsonl: read("data/canonical/treatment_components.jsonl"),
      routeTreatmentScopesJsonl: read("data/exports/releases/v1-rc26/route_treatment_scopes.jsonl"),
      sourceBlocksJsonl: read(
        "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
      ),
      sourceHtml,
      sourceMetadata: metadata,
    })).toThrow("expected exact 37-key package");

    const driftedHtml = sourceHtml.replace(
      /https:\\\/\\\/www\.mta\.info\\\/document\\\/81901/u,
      "https:\\/\\/example.test\\/not-mta",
    );
    expect(() => buildPlan040QbnrStopRemovalAcquisitionManifest({
      ledgerJsonl: read("data/quality/operational-reference/member-extent-ledger.jsonl"),
      treatmentJsonl: read("data/canonical/treatment_components.jsonl"),
      routeTreatmentScopesJsonl: read("data/exports/releases/v1-rc26/route_treatment_scopes.jsonl"),
      sourceBlocksJsonl: read(
        "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
      ),
      sourceHtml: driftedHtml,
      sourceMetadata: {
        ...metadata,
        sha256: `sha256:${createHash("sha256").update(driftedHtml).digest("hex")}`,
      },
    })).toThrow("first-party MTA document URL");
  });
});
