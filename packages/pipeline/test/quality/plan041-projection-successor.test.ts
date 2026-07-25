import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS } from
  "../../src/quality/plan040-accelerated-package15-closeout.js";
import { PLAN041_POST_CLOSURE_PROJECTION_PINS } from
  "../../src/quality/plan041-projection-successor.js";

const projectionPaths = {
  extent_ledger:
    "data/quality/operational-reference/member-extent-ledger.jsonl",
  grain_ledger:
    "data/quality/operational-reference/member-grain-ledger.jsonl",
  bridge_ledger: "data/quality/study-readiness/v1/bridge-ledger.jsonl",
  bridge_summary: "data/quality/study-readiness/v1/bridge-summary.json",
  consumer_priority_manifest:
    "data/quality/study-readiness/v1/consumer-priority-manifest.json",
  study_manifest: "data/quality/study-readiness/v1/manifest.json",
  member_extent_contract:
    "data/contracts/operational-occurrence-member-extent/v1/" +
    "operational_occurrence_member_extents.jsonl",
  member_extent_manifest:
    "data/contracts/operational-occurrence-member-extent/v1/manifest.json",
  member_extent_review_ledger:
    "data/contracts/operational-occurrence-member-extent/v1/" +
    "review-ledger.jsonl",
  member_extent_summary:
    "data/contracts/operational-occurrence-member-extent/v1/summary.json",
  operational_occurrences:
    "data/exports/releases/v1-rc26/operational_occurrences.jsonl",
  operational_occurrence_decisions:
    "data/exports/releases/v1-rc26/" +
    "operational_occurrence_review_decisions.json",
  treatment_components: "data/canonical/treatment_components.jsonl",
  reviewed_candidate_packets:
    "data/quality/study-readiness/v1/research/" +
    "reviewed-candidate-packets.jsonl",
} as const;

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

describe("Plan 041 exact successor projection", () => {
  it("changes only the reviewed provenance-bearing grain ledger", () => {
    expect(Object.keys(PLAN041_POST_CLOSURE_PROJECTION_PINS).sort()).toEqual(
      Object.keys(PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS).sort(),
    );
    expect(
      Object.keys(PLAN041_POST_CLOSURE_PROJECTION_PINS).filter((name) =>
        PLAN041_POST_CLOSURE_PROJECTION_PINS[
          name as keyof typeof PLAN041_POST_CLOSURE_PROJECTION_PINS
        ] !==
          PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS[
            name as keyof typeof PLAN040_PACKAGE_15_POST_PERSISTENCE_PINS
          ]
      ),
    ).toEqual(["grain_ledger"]);
  });

  it("pins one coherent current projection state by exact bytes", () => {
    expect(Object.keys(projectionPaths).sort()).toEqual(
      Object.keys(PLAN041_POST_CLOSURE_PROJECTION_PINS).sort(),
    );
    for (const [name, path] of Object.entries(projectionPaths)) {
      expect(sha256(readFileSync(`${repoRoot}/${path}`))).toBe(
        PLAN041_POST_CLOSURE_PROJECTION_PINS[
          name as keyof typeof PLAN041_POST_CLOSURE_PROJECTION_PINS
        ],
      );
    }
  });
});
