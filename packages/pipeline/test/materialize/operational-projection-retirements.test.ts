import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "bun:test";

import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  loadOperationalAnchorReviewDecisions,
  operationalAnchorReviewSnapshotJson,
  parseOperationalAnchorReviewSnapshot,
} from "@mta-wiki/pipeline/materialize/operational-anchor-review";
import {
  loadOperationalOccurrenceAcceptedDecisions,
  operationalOccurrenceReviewSnapshotJson,
  parseOperationalOccurrenceReviewSnapshot,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-review";
import {
  applyOperationalOccurrenceReviewRetirements,
  assertOperationalProjectionRetirementsAgainstRouteIdentity,
  loadOperationalProjectionRetirements,
  parseOperationalProjectionRetirementV1,
  serializeOperationalProjectionRetirementV1,
  stageOperationalReviewRetirementArtifacts,
  type OperationalProjectionRetirementV1,
} from "@mta-wiki/pipeline/materialize/operational-projection-retirements";
import { readCanonicalRecordsFromJsonl } from "@mta-wiki/pipeline/materialize/canonical-read";
import { loadRouteIdentityReleaseProjection } from "@mta-wiki/pipeline/materialize/route-identity-release";

const retirementId = "q6-q06-current-ineligible-2026-07-18";
const retirementPath =
  `data/route-identity/operational-projection-retirements/v1/${retirementId}.json`;
const anchorOriginalPath =
  "data/operational-anchor-review/accepted/decisions/ace-2025-09-15-q6.json";
const occurrenceOriginalPath =
  "data/operational-occurrence-review/accepted/decisions/q6-route-redesign-2025-08-31.json";
const bindingLedgerPath = "data/route-identity/accepted/v1/decisions.jsonl";

const fixturePaths = [
  retirementPath,
  anchorOriginalPath,
  occurrenceOriginalPath,
  bindingLedgerPath,
] as const;

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceRetirement(): OperationalProjectionRetirementV1 {
  return parseOperationalProjectionRetirementV1(
    JSON.parse(readFileSync(join(repoRoot, retirementPath), "utf8")) as unknown,
  );
}

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "mta-operational-projection-retirement-"));
  for (const relativePath of fixturePaths) {
    const destination = join(root, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(repoRoot, relativePath), destination);
  }
  return root;
}

function withFixture(run: (root: string) => void): void {
  const root = fixtureRoot();
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeRetirement(
  root: string,
  value: unknown,
  id = retirementId,
): void {
  const path = join(
    root,
    `data/route-identity/operational-projection-retirements/v1/${id}.json`,
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${stableJson(value as JsonValue)}\n`, "utf8");
}

describe("operational projection retirements", () => {
  it("uses canonical stable JSON bytes with exactly one LF", () => {
    const bytes = readFileSync(join(repoRoot, retirementPath), "utf8");
    const parsed = sourceRetirement();
    const serialized = serializeOperationalProjectionRetirementV1(parsed);
    const loaded = loadOperationalProjectionRetirements().find(
      (entry) => entry.retirement_id === retirementId,
    );

    expect(serialized).toBe(bytes);
    expect(serializeOperationalProjectionRetirementV1(parsed)).toBe(serialized);
    expect(bytes.endsWith("\n")).toBeTrue();
    expect(bytes.endsWith("\n\n")).toBeFalse();
    expect(bytes.includes("\r")).toBeFalse();
    expect(loaded).toBeDefined();
    expect(loaded?.source_bytes).toBe(Buffer.byteLength(bytes));
    expect(loaded?.source_sha256).toBe(sha256(bytes));

    withFixture((root) => {
      writeFileSync(
        join(root, retirementPath),
        `${JSON.stringify(parsed, null, 2)}\n`,
        "utf8",
      );
      expect(() => loadOperationalProjectionRetirements(root)).toThrow(
        "expected canonical stable JSON bytes followed by LF",
      );
    });

    withFixture((root) => {
      writeFileSync(
        join(root, retirementPath),
        serialized.replace(/\n$/u, "\r\n"),
        "utf8",
      );
      expect(() => loadOperationalProjectionRetirements(root)).toThrow(
        "expected canonical stable JSON bytes followed by LF",
      );
    });
  });

  it("keeps retirement attribution independent from route-binding approval attribution", () => {
    withFixture((root) => {
      const retirement = sourceRetirement();
      retirement.accepted_by = "Independent operational-projection retirement reviewer";
      retirement.accepted_at = "2026-07-18T23:01:02Z";
      writeRetirement(root, retirement);

      const routeBinding = readFileSync(join(root, bindingLedgerPath), "utf8")
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as {
          decision_id: string;
          accepted_by: string;
          accepted_at: string;
        })
        .find((entry) => entry.decision_id === retirement.binding.route_binding_decision_id)!;
      const [loaded] = loadOperationalProjectionRetirements(root);

      expect(loaded?.accepted_by).toBe(retirement.accepted_by);
      expect(loaded?.accepted_at).toBe(retirement.accepted_at);
      expect(loaded?.accepted_by).not.toBe(routeBinding.accepted_by);
      expect(loaded?.accepted_at).not.toBe(routeBinding.accepted_at);
      expect(loaded?.binding.route_binding_sha256).toBe(retirement.binding.route_binding_sha256);
    });
  });

  it("filters retired anchor and occurrence decisions only from active projections", () => {
    const retirement = sourceRetirement();
    const retirements = loadOperationalProjectionRetirements();
    const anchorDecisionId = retirement.anchor_review_decisions[0]!.decision_id;
    const occurrenceDecisionId = retirement.occurrence_review_decisions[0]!.decision_id;
    const allAnchors = loadOperationalAnchorReviewDecisions(undefined, { includeRetired: true });
    const activeAnchors = loadOperationalAnchorReviewDecisions();
    const allOccurrences = loadOperationalOccurrenceAcceptedDecisions(undefined, {
      includeRetired: true,
    });
    const activeOccurrences = loadOperationalOccurrenceAcceptedDecisions();

    expect(allAnchors.some((entry) => entry.decision_id === anchorDecisionId)).toBeTrue();
    expect(activeAnchors.some((entry) => entry.decision_id === anchorDecisionId)).toBeFalse();
    expect(allAnchors.length - activeAnchors.length).toBe(
      retirements.reduce((count, entry) => count + entry.anchor_review_decisions.length, 0),
    );
    expect(allOccurrences.some((entry) => entry.decision_id === occurrenceDecisionId)).toBeTrue();
    expect(activeOccurrences.some((entry) => entry.decision_id === occurrenceDecisionId)).toBeFalse();
    expect(allOccurrences.length - activeOccurrences.length).toBe(
      retirements.reduce((count, entry) => count + entry.occurrence_review_decisions.length, 0),
    );
  });

  it("self-decodes stable anchor and occurrence review-v2 snapshots", () => {
    const retirements = loadOperationalProjectionRetirements();
    const anchorJson = operationalAnchorReviewSnapshotJson([], retirements);
    const occurrenceJson = operationalOccurrenceReviewSnapshotJson([], retirements);
    const anchor = parseOperationalAnchorReviewSnapshot(JSON.parse(anchorJson) as unknown);
    const occurrence = parseOperationalOccurrenceReviewSnapshot(
      JSON.parse(occurrenceJson) as unknown,
    );

    expect(anchor.snapshot_version).toBe(2);
    expect(occurrence.snapshot_version).toBe(2);
    expect(anchor).toEqual(JSON.parse(anchorJson));
    expect(occurrence).toEqual(JSON.parse(occurrenceJson));
    expect(anchorJson.endsWith("\n")).toBeTrue();
    expect(occurrenceJson.endsWith("\n")).toBeTrue();
    expect(operationalAnchorReviewSnapshotJson([], retirements)).toBe(anchorJson);
    expect(operationalOccurrenceReviewSnapshotJson([], retirements)).toBe(occurrenceJson);
  });

  it("fails closed when the retirement source receipt, binding receipt, or original is missing", () => {
    withFixture((root) => {
      const loaded = loadOperationalProjectionRetirements(root);
      unlinkSync(join(root, retirementPath));
      expect(() =>
        stageOperationalReviewRetirementArtifacts(root, join(root, "release"), loaded)
      ).toThrow(`retirement artifact is missing: ${retirementPath}`);
    });

    withFixture((root) => {
      unlinkSync(join(root, bindingLedgerPath));
      expect(() => loadOperationalProjectionRetirements(root)).toThrow(
        `retirement artifact is missing: ${bindingLedgerPath}`,
      );
    });

    withFixture((root) => {
      unlinkSync(join(root, anchorOriginalPath));
      expect(() => loadOperationalProjectionRetirements(root)).toThrow(
        `retirement artifact is missing: ${anchorOriginalPath}`,
      );
    });
  });

  it("rejects wrong original SHA, byte count, artifact bytes, and path", () => {
    withFixture((root) => {
      const retirement = sourceRetirement();
      retirement.anchor_review_decisions[0]!.original_artifact.sha256 = "0".repeat(64);
      writeRetirement(root, retirement);
      expect(() => loadOperationalProjectionRetirements(root)).toThrow(
        `${anchorOriginalPath}: retirement source bytes/hash changed`,
      );
    });

    withFixture((root) => {
      const retirement = sourceRetirement();
      retirement.anchor_review_decisions[0]!.original_artifact.bytes += 1;
      writeRetirement(root, retirement);
      expect(() => loadOperationalProjectionRetirements(root)).toThrow(
        `${anchorOriginalPath}: retirement source bytes/hash changed`,
      );
    });

    withFixture((root) => {
      writeFileSync(join(root, anchorOriginalPath), "{}\n", "utf8");
      expect(() => loadOperationalProjectionRetirements(root)).toThrow(
        `${anchorOriginalPath}: retirement source bytes/hash changed`,
      );
    });

    withFixture((root) => {
      const retirement = sourceRetirement();
      retirement.anchor_review_decisions[0]!.original_artifact.artifact_path =
        "data/operational-anchor-review/accepted/decisions/different.json";
      writeRetirement(root, retirement);
      expect(() => loadOperationalProjectionRetirements(root)).toThrow(
        "expected exact accepted decision path",
      );
    });
  });

  it("rejects another route snapshot, a projectable receipt, and a wrong accepted binding", () => {
    const projection = loadRouteIdentityReleaseProjection({
      rootDir: repoRoot,
      records: readCanonicalRecordsFromJsonl(),
    });
    expect(projection).not.toBeNull();
    const retirement = sourceRetirement();
    expect(() =>
      assertOperationalProjectionRetirementsAgainstRouteIdentity(
        [retirement],
        projection!.snapshot,
      )
    ).not.toThrow();

    const wrongSnapshot = structuredClone(retirement);
    wrongSnapshot.route_identity_snapshot_sha256 = "0".repeat(64);
    expect(() =>
      assertOperationalProjectionRetirementsAgainstRouteIdentity(
        [wrongSnapshot],
        projection!.snapshot,
      )
    ).toThrow("retirement addresses another route-identity snapshot");

    const projectable = structuredClone(retirement) as unknown as {
      binding: { projectable: boolean };
    };
    projectable.binding.projectable = true;
    expect(() => parseOperationalProjectionRetirementV1(projectable)).toThrow(
      "binding.projectable: expected false",
    );

    const wrongBinding = structuredClone(retirement);
    wrongBinding.binding.dataset_id = "mta-nyct-bus";
    expect(() =>
      assertOperationalProjectionRetirementsAgainstRouteIdentity(
        [wrongBinding],
        projection!.snapshot,
      )
    ).toThrow("retirement binding differs from accepted nonprojectable route");
  });

  it("rejects duplicate retirement targets across accepted receipts", () => {
    withFixture((root) => {
      const duplicate = sourceRetirement();
      duplicate.retirement_id = `${retirementId}-duplicate`;
      writeRetirement(root, duplicate, duplicate.retirement_id);
      expect(() => loadOperationalProjectionRetirements(root)).toThrow(
        "accepted review decisions cannot be retired twice",
      );
    });
  });

  it("rejects substituting the catalog literal Q6 for exact GTFS identity Q06", () => {
    const retirement = sourceRetirement();
    retirement.occurrence_review_decisions[0]!.pinned_gtfs_route_ids = ["Q6"];
    const allOccurrences = loadOperationalOccurrenceAcceptedDecisions(undefined, {
      includeRetired: true,
    });

    expect(() =>
      applyOperationalOccurrenceReviewRetirements(allOccurrences, [retirement])
    ).toThrow("does not bind the declared occurrence and route");
  });
});
