import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";

type SourceBlock = {
  block_id: string;
  raw_text: string;
  raw_text_sha256: string;
};

type Occurrence = {
  occurrence_id: string;
  resolved_status: string;
  resolved_onset: { date: string; precision: string };
  routes: Array<{ gtfs_route_id: string; route_record_id: string }>;
  treatment: {
    kind: string;
    member: { treatment_family: string; treatment_record_id: string };
  };
};

type ExpectedCandidates = {
  candidates: Array<{
    analysis_family: string;
    member_treatment_families: string[];
    occurrence_id: string;
    route_id: string;
    treatment_kind: string;
  }>;
};

type CoverageQueueRow = {
  event_record_id: string;
  dimension: string;
  status: string;
  resolved_occurrence_ids: string[];
};

type AcquisitionReceipt = {
  source_graph: {
    publication_event_record_id: string;
    completion_event_record_id: string;
    operational_occurrence: null;
    routes: Array<{ gtfs_route_id: string; route_record_id: string }>;
  };
  date_adjudication: {
    publication_date: string;
    completion_status_as_of: string;
    exact_completion_phase_date: string;
    exact_first_operational_onset: null;
    rejected_inference: string;
  };
  rc19_reconciliation: {
    candidate_set_id: string;
    candidate_set_sha256: string;
    candidate_ids: string[];
    source_fixed_dimensions: string[];
    remaining_blockers: string[];
    anticipated_tracker_effect: string;
  };
  explicit_exclusions: string[];
};

const sourceId = "nyc_dot_gun_hill_road_completion_2023";
const occurrenceId = "occurrence:8242d37ca802fce17d107e2c";
const eventId = "event_gun-hill-road-substantial-completion-announcement-2023-10-31";
const completionEventId = "event_gun-hill-road-bus-lanes-completed-2023-10-31";
const treatmentId = "treatment_gun-hill-road-bus-lanes-bainbridge-bartow";
const supersededTreatmentId = "treatment_meeting-doc-127471-gun-hill-road-bus-lanes-completion";
const receiptPath = "data/quality/acquisition/receipts/gun-hill-road-bus-lanes-completion-2023.json";

const sourcePins = {
  "metadata.json": "bb26f2761fbdf79d94ae0df62e24551ce10391595e66f0da8066f216f9ff439c",
  "source.html": "66d8005f4c919f2dc65edc8acc0d926c213df833486ee857e38586ecc3937a99",
  "text.txt": "4f23cbc0937b5857b95b15e274379e1a4e2ec66f7b3dac75b2f6cebfcb66ee54",
  "blocks.jsonl": "bbfd1504126dc2d83d47d6e1c4335e4fb98457b9785dadfaf6aa35d4a617e905",
} as const;

const evidencePins = {
  p001_b0010: "sha256:7bae7d6be36d5f4483b724271d610c3c269daf05d14487e9e679a6979beff5b0",
  p001_b0015: "sha256:5b2746623424ff7c40cc1ab19533e670e32b4a9ec5c4e498ff2e93ae1f267f37",
  p001_b0021: "sha256:f2d50c0df7d117ee3f132cf6496b5e1c9f938e889b2a9f2b323178d6a1a77a86",
  p001_b0024: "sha256:568131f4328fad9b16fd248365b3b7c573f5e5a5a158fce4f112cb1bbe682834",
} as const;

const completionSourcePins = {
  "metadata.json": "3abae4c00097503d301593a61dd79537542cb80fb66fbf4fb64cb28c0c1c1df2",
  "source.pdf": "5d3a82851efed1316ff8b65540eaa7e33c7fe9d21221192740476002f50d51ce",
  "blocks.jsonl": "e3ee6c7214ec37ea01ecfa906cc26e8ba62b7ea5da30f56fcb312f42ef2e959a",
} as const;

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as T;
}

function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(join(repoRoot, relativePath), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function sha256Hex(relativePath: string): string {
  return createHash("sha256").update(readFileSync(join(repoRoot, relativePath))).digest("hex");
}

function byRecordId(records: readonly MtaCanonicalRecord[], recordId: string): MtaCanonicalRecord {
  const record = records.find((candidate) => candidate.record_id === recordId);
  if (!record) throw new Error(`missing canonical record ${recordId}`);
  return record;
}

describe("Gun Hill Road bus-lane completion on October 31, 2023", () => {
  const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
  const projects = readJsonl<MtaCanonicalRecord>("data/canonical/projects.jsonl");
  const routes = readJsonl<MtaCanonicalRecord>("data/canonical/routes.jsonl");
  const treatments = readJsonl<MtaCanonicalRecord>("data/canonical/treatment_components.jsonl");
  const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");
  const receipt = readJson<AcquisitionReceipt>(receiptPath);

  it("pins the official DOT snapshot and exact evidence blocks", () => {
    for (const [filename, expectedHash] of Object.entries(sourcePins)) {
      expect(sha256Hex(`raw/sources/${sourceId}/${filename}`)).toBe(expectedHash);
    }

    const blocks = readJsonl<SourceBlock>(`raw/sources/${sourceId}/blocks.jsonl`);
    for (const [blockId, expectedHash] of Object.entries(evidencePins)) {
      expect(blocks.find((block) => block.block_id === blockId)?.raw_text_sha256).toBe(expectedHash);
    }
    expect(blocks.find((block) => block.block_id === "p001_b0021")?.raw_text).toContain("Bx28 and Bx38 routes");
    expect(blocks.find((block) => block.block_id === "p001_b0024")?.raw_text).toContain(
      "from Bainbridge Avenue to Bartow Avenue",
    );

    for (const [filename, expectedHash] of Object.entries(completionSourcePins)) {
      expect(sha256Hex(`raw/sources/meeting_doc_127471/${filename}`)).toBe(expectedHash);
    }
    const mtaBlocks = readJsonl<SourceBlock>("raw/sources/meeting_doc_127471/blocks.jsonl");
    expect(mtaBlocks.find((block) => block.block_id === "p015_c0011")?.raw_text_sha256).toBe(
      "sha256:5d341caabe6b1c4265e38f291b8b527ffc02e724a0b5329fdf5167134f302cbf",
    );
    expect(mtaBlocks.find((block) => block.block_id === "p015_c0011")?.raw_text).toContain(
      "completed on October 31st",
    );
  });

  it("binds the publication/status-as-of day, route scope, treatment, and bounded segment", () => {
    expect(byRecordId(events, eventId).payload).toMatchObject({
      event_kind: "press release",
      event_family: "publication",
      lifecycle_phase: "other",
      date_normalized: "2023-10-31",
      date_precision: "day",
    });
    expect(byRecordId(events, completionEventId).payload).toMatchObject({
      event_kind: "bus lane completion",
      event_family: "milestone",
      lifecycle_phase: "completed",
      date_normalized: "2023-10-31",
      date_precision: "day",
    });
    expect(byRecordId(projects, "project_gun-hill-road-bus-lanes").payload).toMatchObject({
      status: "substantially complete",
      launch_date: null,
      launch_date_normalized: null,
      date_normalized: null,
      date_precision: "unknown",
      completion_status_as_of: "2023-10-31",
    });
    const treatment = byRecordId(treatments, treatmentId);
    expect(treatment.payload).toMatchObject({
      treatment_family: "bus_lane",
      location_text: "East Gun Hill Road from Bainbridge Avenue to Bartow Avenue",
    });
    expect(treatments.some((candidate) => candidate.record_id === supersededTreatmentId)).toBe(false);
    expect(treatment.source_ids).toEqual(
      expect.arrayContaining(["nyc_dot_gun_hill_road_completion_2023", "meeting_doc_127471"]),
    );
    expect(treatment.local_observation_ids).toEqual(
      expect.arrayContaining([
        "treatment_gun_hill_road_bus_lanes_bainbridge_bartow",
        "treatment_meeting_doc_127471_gun_hill_road_bus_lanes_completion",
      ]),
    );
    expect(treatment.submission_ids).toEqual(
      expect.arrayContaining(["sub_d02eed7b3daaf5c4", "sub_6cc45a173df68e21"]),
    );
    expect(treatment.evidence_refs.map((ref) => ref.source_id)).toEqual(
      expect.arrayContaining(["nyc_dot_gun_hill_road_completion_2023", "meeting_doc_127471"]),
    );

    expect(byRecordId(routes, "route_bx28-addendum-update").payload.route_id).toBe("Bx28");
    expect(byRecordId(routes, "route_bx38-ace").payload.route_id).toBe("Bx38");

    for (const [relationId, objectId] of [
      ["relation_gun-hill-project-serves-bx28-dot-2023", "route_bx28-addendum-update"],
      ["relation_gun-hill-road-bus-lanes-serves-bx38", "route_bx38-ace"],
      ["relation_gun-hill-road-project-has-bainbridge-bartow-bus-lanes", treatmentId],
      ["relation_gun-hill-road-bus-lanes-has-completion-announcement-2023-10-31", eventId],
      ["relation_gun-hill-road-bus-lanes-has-completion-2023-10-31", completionEventId],
      ["relation_gun-hill-completion-affects-bx28", "route_bx28-addendum-update"],
      ["relation_gun-hill-completion-affects-bx38", "route_bx38-ace"],
      ["relation_gun-hill-bainbridge-bartow-lanes-has-completion-2023-10-31", completionEventId],
    ] as const) {
      expect(byRecordId(relations, relationId).payload).toMatchObject({
        object_id: objectId,
        assertion_status: "delivered",
        as_of_date: "2023-10-31",
      });
    }
    expect(byRecordId(relations, "relation_gun-hill-completion-affects-bx28").payload).toMatchObject({
      relation_kind: "affects_route",
      subject_id: completionEventId,
    });
    expect(byRecordId(relations, "relation_gun-hill-completion-affects-bx38").payload).toMatchObject({
      relation_kind: "affects_route",
      subject_id: completionEventId,
    });
    const completionRelation = byRecordId(
      relations,
      "relation_gun-hill-bainbridge-bartow-lanes-has-completion-2023-10-31",
    );
    expect(completionRelation.payload).toMatchObject({
      relation_kind: "has_timeline_event",
      subject_id: treatmentId,
    });
    expect(treatment.local_observation_ids).toContain(completionRelation.payload.subject_local_observation_id);
  });

  it("does not project an exact operational occurrence and preserves both remaining gates", () => {
    const occurrences = readJsonl<Occurrence>(
      "data/contract-fixtures/operational-occurrences-v1/operational_occurrences.jsonl",
    );
    expect(occurrences.some((candidate) => candidate.occurrence_id === occurrenceId)).toBe(false);

    const expected = readJson<ExpectedCandidates>(
      "data/contract-fixtures/operational-occurrences-v1/expected_route_candidates.json",
    ).candidates.filter((candidate) => candidate.occurrence_id === occurrenceId);
    expect(expected).toEqual([]);

    const coverageRows = readJsonl<CoverageQueueRow>(
      "data/quality/operational-coverage/priority-queue.jsonl",
    ).filter((row) => row.event_record_id === completionEventId);
    expect(coverageRows).toEqual([]);

    expect(receipt.source_graph).toMatchObject({
      publication_event_record_id: eventId,
      completion_event_record_id: completionEventId,
      operational_occurrence: null,
      routes: [
        { gtfs_route_id: "BX28", route_record_id: "route_bx28-addendum-update" },
        { gtfs_route_id: "BX38", route_record_id: "route_bx38-ace" },
      ],
    });
    expect(receipt.date_adjudication).toMatchObject({
      publication_date: "2023-10-31",
      completion_status_as_of: "2023-10-31",
      exact_completion_phase_date: "2023-10-31",
      exact_first_operational_onset: null,
    });
    expect(receipt.date_adjudication.rejected_inference).toContain("first day any portion");
    expect(receipt.rc19_reconciliation.candidate_ids).toEqual([
      "study-event-v2:06559cef3f03e1672b7dd685",
      "study-event-v2:8759b24539a59fc715b1dff3",
    ]);
    expect(receipt.rc19_reconciliation.remaining_blockers.join(" ")).toContain("phase-preserving standard occurrence");
    expect(receipt.rc19_reconciliation.remaining_blockers.join(" ")).toContain("exact treated-lane overlap spine");
    expect(receipt.rc19_reconciliation.anticipated_tracker_effect).toContain("Inference only");
    expect(receipt.explicit_exclusions.join(" ")).toContain("BX16, BX25, or BX26");
  });
});
