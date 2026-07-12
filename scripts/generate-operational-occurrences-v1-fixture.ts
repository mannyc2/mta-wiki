import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import {
  loadOperationalAnchorReviewDecisions,
  operationalAnchorReviewSnapshotJson,
} from "../packages/pipeline/src/materialize/operational-anchor-review";
import {
  computeOperationalAnchors,
  operationalAnchorsJsonl,
  operationalAnchorSummaryJson,
  summarizeOperationalAnchors,
} from "../packages/pipeline/src/materialize/operational-anchors";
import {
  loadOperationalOccurrenceIdentityRegistry,
} from "../packages/pipeline/src/materialize/operational-occurrence-identity";
import {
  assertOperationalOccurrenceReviewDecisions,
  loadOperationalOccurrenceAcceptedDecisions,
  operationalOccurrenceReviewDecisions,
  operationalOccurrenceReviewSnapshotJson,
} from "../packages/pipeline/src/materialize/operational-occurrence-review";
import {
  computeOperationalOccurrences,
  operationalOccurrencesJsonl,
  operationalOccurrenceSummaryJson,
  summarizeOperationalOccurrences,
} from "../packages/pipeline/src/materialize/operational-occurrences";
import {
  computeRouteAnchors,
  readGtfsRoutesFromDb,
  readRouteAnchorOverrides,
} from "../packages/pipeline/src/materialize/route-anchors";

const dir = join(repoRoot, "data", "contract-fixtures", "operational-occurrences-v1");
mkdirSync(dir, { recursive: true });

const records = readCanonicalRecordsFromJsonl();
const anchorReviews = loadOperationalAnchorReviewDecisions();
const occurrenceReviews = loadOperationalOccurrenceAcceptedDecisions();
const routeAnchors = computeRouteAnchors(records, readGtfsRoutesFromDb(), readRouteAnchorOverrides());
const rows = computeOperationalOccurrences(records, routeAnchors, {
  reviewDecisions: anchorReviews,
  occurrenceReviewDecisions: occurrenceReviews,
  identityRegistry: loadOperationalOccurrenceIdentityRegistry(),
});
const reviewSnapshot = assertOperationalOccurrenceReviewDecisions(
  operationalOccurrenceReviewDecisions(rows, anchorReviews, occurrenceReviews),
  rows,
);
const legacyAnchorRows = computeOperationalAnchors(records, routeAnchors, {
  reviewDecisions: anchorReviews,
}).filter((row) => row.anchor_id.startsWith("operational-reviewed:"));

const files: Record<string, string> = {
  "operational_anchors.jsonl": operationalAnchorsJsonl(legacyAnchorRows),
  "operational_anchors_summary.json": operationalAnchorSummaryJson(
    summarizeOperationalAnchors(legacyAnchorRows, {
      canonicalEventCount: new Set(legacyAnchorRows.map((row) => row.event_record_id)).size,
      operationalFamilyEventCount: new Set(legacyAnchorRows.map((row) => row.event_record_id)).size,
      entryGate: {
        relations_examined: 0,
        non_event_timeline_objects: 0,
        non_operational_event_objects: 0,
      },
    }),
  ),
  "operational_anchor_review_decisions.json": operationalAnchorReviewSnapshotJson(anchorReviews),
  "operational_occurrences.jsonl": operationalOccurrencesJsonl(rows),
  "operational_occurrences_summary.json": operationalOccurrenceSummaryJson(summarizeOperationalOccurrences(rows)),
  "operational_occurrence_review_decisions.json": operationalOccurrenceReviewSnapshotJson(reviewSnapshot),
};

const candidates = rows
  .filter((row) => row.study_projection_eligible)
  .flatMap((row) =>
    row.routes.map((route) => {
      const memberFamilies =
        row.treatment.kind === "atomic"
          ? [row.treatment.member.treatment_family]
          : row.treatment.members.map((member) => member.treatment_family);
      let analysisFamily =
        row.treatment.kind === "atomic" ? row.treatment.member.treatment_family : row.treatment.bundle_family;
      if (
        row.treatment.kind === "atomic" &&
        analysisFamily === "fare_collection" &&
        /(?:off[-_]?board|proof[-_]?of[-_]?payment)/iu.test(row.treatment.member.treatment_record_id)
      ) {
        analysisFamily = "off_board_fare_collection";
      }
      const routeId = /^Q0[1-9]$/u.test(route.gtfs_route_id)
        ? `Q${route.gtfs_route_id.slice(2)}`
        : route.gtfs_route_id;
      return {
        occurrence_id: row.occurrence_id,
        route_id: routeId,
        treatment_kind: row.treatment.kind,
        analysis_family: analysisFamily,
        member_treatment_families: memberFamilies,
      };
    }),
  )
  .sort((left, right) =>
    [left.occurrence_id, left.route_id].join("|").localeCompare([right.occurrence_id, right.route_id].join("|")),
  );
const expected = {
  schema_version: 1,
  candidate_count: candidates.length,
  candidates,
};
files["expected_route_candidates.json"] = `${stableJson(expected as unknown as JsonValue)}\n`;

for (const [name, bytes] of Object.entries(files)) writeFileSync(join(dir, name), bytes, "utf8");

const addressedFiles = Object.fromEntries(
  Object.entries(files).map(([name, bytes]) => [
    name,
    { bytes: Buffer.byteLength(bytes), sha256: createHash("sha256").update(bytes).digest("hex") },
  ]),
);
const manifest = {
  manifest_version: 3,
  release_id: "operational-occurrences-v1-fixture",
  generator_commit: "contract-fixture-v1",
  contract_versions: {
    operational_anchors: 1,
    operational_anchor_review_decisions: 1,
    operational_occurrences: 1,
    operational_occurrence_review_decisions: 1,
  },
  record_counts: {},
  files: addressedFiles,
  pointers: {
    operational_anchors: "operational_anchors.jsonl",
    operational_anchor_summary: "operational_anchors_summary.json",
    operational_anchor_review_decisions: "operational_anchor_review_decisions.json",
    operational_occurrences: "operational_occurrences.jsonl",
    operational_occurrence_summary: "operational_occurrences_summary.json",
    operational_occurrence_review_decisions: "operational_occurrence_review_decisions.json",
    route_anchors: null,
    taxonomy: null,
    quality_report: null,
  },
};
writeFileSync(join(dir, "manifest.json"), `${stableJson(manifest as unknown as JsonValue)}\n`, "utf8");
