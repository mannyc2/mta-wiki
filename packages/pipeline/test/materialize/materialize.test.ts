import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { entriesToRecords, pageRelativePathForCanonicalRecord, pageRelativePathForRecord, routeRecordScope } from "@mta-wiki/pipeline/materialize/materialize";
import { createSubmissionEntry } from "@mta-wiki/pipeline/records/submissions";
import type { JsonObject, MtaCanonicalRecord, MtaSubmitObservationInput, StagedSourceBlock } from "@mta-wiki/db/types";

const sourceA = "test_identity_source_a";
const sourceB = "test_identity_source_b";

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function fixtureBlock(sourceId: string, rawText: string): StagedSourceBlock {
  return {
    source_id: sourceId,
    block_id: "p001_c0001",
    page_number: 1,
    reading_order: 1,
    source_surface: "chandra_ocr",
    block_kind: "text",
    raw_source_path: `raw/sources/${sourceId}/chandra/pages/p001.json`,
    raw_start_char: 0,
    raw_end_char: rawText.length,
    raw_text: rawText,
    normalized_text: rawText,
    raw_text_sha256: sha256(rawText),
    normalized_text_sha256: sha256(rawText),
  };
}

function writeSource(sourceId: string, text: string) {
  const sourceDir = join(repoRoot, "raw", "sources", sourceId);
  rmSync(sourceDir, { recursive: true, force: true });
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(sourceDir, "blocks.jsonl"), `${JSON.stringify(fixtureBlock(sourceId, text))}\n`, "utf8");
}

function evidenceRef(sourceId: string) {
  return {
    source_id: sourceId,
    block_id: "p001_c0001",
  };
}

function accepted(input: MtaSubmitObservationInput) {
  const entry = createSubmissionEntry("test_run", input, "2026-06-08T00:00:00.000Z");
  expect(entry.validation.state).toBe("accepted");
  return entry;
}

function legacyAccepted(input: MtaSubmitObservationInput) {
  const entry = createSubmissionEntry("test_run", input, "2026-06-08T00:00:00.000Z");
  entry.validation.state = "accepted";
  entry.validation.issues = [];
  return entry;
}

function derivedRelations(records: ReturnType<typeof entriesToRecords>) {
  return records.filter((record) => record.record_kind === "relation" && record.payload.derived_relation === true);
}

function routeRecord(recordId: string, payload: JsonObject, displayName = recordId, evidenceQuotes: string[] = []): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: "route",
    source_id: sourceA,
    source_ids: [sourceA],
    local_observation_id: recordId.replace(/-/gu, "_"),
    local_observation_ids: [recordId.replace(/-/gu, "_")],
    display_name: displayName,
    payload,
    evidence_refs: evidenceQuotes.map((source_quote, index) => ({ source_id: sourceA, block_id: `p001_c${String(index + 1).padStart(4, "0")}`, source_quote })),
    submission_ids: [`sub_${recordId}`],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-06-08T00:00:00.000Z",
  };
}

beforeAll(() => {
  writeSource(
    sourceA,
    "NYC DOT operates B44 Select Bus Service. The Fulton CBTC project is moving forward, with the RFQ already released and the RFP expected within weeks.",
  );
  writeSource(
    sourceB,
    "NYCDOT lists the B44-SBS bus route. A publicly advertised, competitively solicited and negotiated contract to Posillico Civil, Inc. in the amount of $38,092,008 to construct Phase 3B.",
  );
});

afterAll(() => {
  rmSync(join(repoRoot, "raw", "sources", sourceA), { recursive: true, force: true });
  rmSync(join(repoRoot, "raw", "sources", sourceB), { recursive: true, force: true });
});

describe("entriesToRecords identity materialization", () => {
  it("classifies audited aggregate and scope-shaped route records without changing page policy", () => {
    expect(
      routeRecordScope(
        routeRecord("route_x28-x38-bay-pkwy", {
          route_id: "X28/X38",
          route_type: "Express",
        }),
      ),
    ).toBe("aggregate_list_context");
    expect(routeRecordScope(routeRecord("route_x28-cb11-jun2025", { route_id: "X28", route_type: "Express" }))).toBe("true_route");
    expect(routeRecordScope(routeRecord("route_x38-cb11-jun2025", { route_id: "X38", route_type: "Express" }))).toBe("true_route");

    expect(
      routeRecordScope(
        routeRecord("route_15-express-bus-battery-pl", {
          route_id: "15 Express bus routes",
          description: "15 Express bus routes affected by Battery Pl delay",
        }),
      ),
    ).toBe("data_only_scope");

    expect(
      routeRecordScope(
        routeRecord("route_m34-sbs", {
          route_id: "M34",
          route_label: "M34 SBS",
          _merged_field_values: {
            route_id: ["M34", "M34/M34A"],
          },
        }),
      ),
    ).toBe("split_candidate");

    expect(
      routeRecordScope(
        routeRecord("route_m14-ad-sbs", {
          route_id: "M14 A SBS",
          route_label: "M14 A/D SBS",
          routes: ["M14A", "M14D"],
          route_type: "Select Bus Service",
        }),
      ),
    ).toBe("true_route");
  });

  it("flags high-denorm service-variant contamination as split candidates", () => {
    expect(
      routeRecordScope(
        routeRecord("route_q52-sbs-queens", {
          route_id: "Q52",
          route_label: "Q52 SBS",
          service_variant: "SBS",
          route_type_normalized: "select_bus_service",
          _merged_field_values: {
            route_type_normalized: ["select_bus_service", "limited_stop", "ltd"],
            service_variant: ["sbs", "limited_stop"],
          },
        }),
      ),
    ).toBe("split_candidate");

    expect(
      routeRecordScope(
        routeRecord("route_utica-ave-sbs", {
          route_id: "B46+",
          route_label: "B46 Select Bus Service",
          service_variant: "SBS",
          _merged_field_values: {
            route_type_normalized: ["select_bus_service", "limited_stop"],
          },
        }),
      ),
    ).toBe("split_candidate");

    expect(
      routeRecordScope(
        routeRecord("route_b44-sbs", {
          route_id: "B44",
          route_label: "B44 SBS",
          service_variant: "SBS",
          _merged_field_values: {
            route_id: ["B44", "B44+"],
            route_label: ["B44 SBS", "B44 Select Bus Service"],
          },
        }),
      ),
    ).toBe("true_route");
  });

  it("treats local-limited bundle evidence as compatible with local route evidence", () => {
    expect(
      routeRecordScope(
        routeRecord("route_b6-2015-sbk-corridor", {
          route_id: "B6",
          route_type: "Local and Limited",
          route_type_normalized: "local_and_limited",
          service_variant: "local_limited",
          _merged_field_values: {
            route_type: ["Local and Limited", "Local"],
            route_type_normalized: ["local_and_limited", "local"],
            service_variant: ["local_limited", "local"],
          },
        }),
      ),
    ).toBe("true_route");

    expect(
      routeRecordScope(
        routeRecord("route_q34-queens", {
          route_id: "Q34",
          route_type: "local",
          route_type_normalized: "local",
          service_variant: "local",
          _merged_field_values: {
            route_type: ["local", "limited"],
            route_type_normalized: ["local", "limited_stop"],
            service_variant: ["local", "limited_stop"],
          },
        }),
      ),
    ).toBe("split_candidate");
  });

  it("treats neighboring limited-route evidence as classifier spillover for local route scope", () => {
    expect(
      routeRecordScope(
        routeRecord(
          "route_q34-queens",
          {
            route_id: "Q34",
            route_label: "Q34",
            route_name: "Q34",
            route_type: "local",
            route_type_normalized: "local",
            service_variant: "local",
            _merged_field_values: {
              route_type: ["local", "limited"],
              route_type_normalized: ["local", "limited_stop"],
              service_variant: ["local", "limited_stop"],
              route_id: ["Q34"],
              route_label: ["Q34"],
              route_name: ["Q34"],
            },
          },
          "route_q34-queens",
          ["The Q25 LTD and Q34 operate on Kissena/Parsons Boulevards.", "Q34: Jamaica to Whitestone."],
        ),
      ),
    ).toBe("true_route");

    expect(
      routeRecordScope(
        routeRecord(
          "route_q25-queens",
          {
            route_id: "Q25",
            route_label: "Q25",
            route_name: "Q25",
            route_type: "local",
            route_type_normalized: "local",
            service_variant: "local",
            _merged_field_values: {
              route_type: ["local", "limited"],
              route_type_normalized: ["local", "limited_stop"],
              service_variant: ["local", "limited_stop"],
              description: ["Q25 LTD: Jamaica to College Point."],
            },
          },
          "route_q25-queens",
          ["Q25 LTD sources of delay were reviewed with Q34 context."],
        ),
      ),
    ).toBe("split_candidate");
  });

  it("treats exact local/SBS context spillover records as local route scope", () => {
    const spilloverPayload = {
      route_type_normalized: "local",
      service_variant: "local",
      _merged_field_values: {
        route_type_normalized: ["bus", "local", "select_bus_service"],
        service_variant: ["local", "sbs"],
      },
    };

    expect(
      routeRecordScope(
        routeRecord("route_bx35", {
          ...spilloverPayload,
          route_id: "BX35",
          route_label: "BX35",
          route_name: "BX35",
          description: "Existing bus route on Webster Avenue.",
          _merged_field_values: {
            ...spilloverPayload._merged_field_values,
            route_id: ["BX35", "Bx35"],
            route_label: ["BX35", "Bx35"],
            description: ["Bx35 bus route mentioned at E 167 St SBS station diagram."],
          },
        }),
      ),
    ).toBe("true_route");

    expect(
      routeRecordScope(
        routeRecord("route_m100-ace", {
          ...spilloverPayload,
          route_id: "M100",
          route_label: "M100",
          description: "M100 makes local stops along 125th Street.",
          _merged_field_values: {
            ...spilloverPayload._merged_field_values,
            description: ["M100 local bus service on 125th Street.", "Bus route on 125th Street with local stops unchanged under the SBS plan."],
          },
        }),
      ),
    ).toBe("true_route");

    expect(
      routeRecordScope(
        routeRecord("route_m101", {
          ...spilloverPayload,
          route_id: "M101",
          route_label: "M101",
          description: "Bus route discussed at the workshop. A suggestion was made to make the M101 an SBS route.",
          _merged_field_values: {
            ...spilloverPayload._merged_field_values,
            description: ["M101 local bus service on 125th Street."],
          },
        }),
      ),
    ).toBe("split_candidate");
  });

  it("treats narrow route lineage and bundled limited context as compatible route evidence", () => {
    expect(
      routeRecordScope(
        routeRecord("route_125th-laguardia-sbs", {
          route_id: "M60",
          route_label: "M60-SBS",
          route_name: "125th-LaGuardia Airport Select Bus Service",
          route_type: "Select Bus Service",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
          _merged_field_values: {
            route_type: ["Select Bus Service", "local"],
            route_type_normalized: ["select_bus_service", "local"],
            service_variant: ["sbs", "local"],
            description: ["Upgrade M60 route to SBS on 125th Street."],
          },
        }),
      ),
    ).toBe("true_route");

    expect(
      routeRecordScope(
        routeRecord("route_b41-ace", {
          route_id: "B41",
          route_label: "B41",
          route_type: "Local",
          route_type_normalized: "local",
          service_variant: "local",
          _merged_field_values: {
            route_type: ["Local", "local and limited", "Limited"],
            route_type_normalized: ["local", "local_and_limited", "limited_stop"],
            service_variant: ["local", "local_limited", "limited_stop"],
          },
        }),
      ),
    ).toBe("true_route");

    expect(
      routeRecordScope(
        routeRecord(
          "route_m34a-sbs",
          {
            route_id: "M34A",
            route_label: "M34A SBS",
            route_name: "M34A Select Bus Service",
            route_type: "SBS",
            route_type_normalized: "select_bus_service",
            service_variant: "sbs",
            _merged_field_values: {
              route_label: ["M34A SBS", "M16", "M34/M34A | 34th Street"],
              route_type: ["SBS", "local"],
              route_type_normalized: ["select_bus_service", "local"],
              service_variant: ["sbs", "local"],
              description: ["M16 renamed to M34A SBS for clearer passenger communication."],
            },
          },
          "M16 Bus Route on 34th Street",
        ),
      ),
    ).toBe("true_route");

    expect(
      routeRecordScope(
        routeRecord("route_m34-sbs", {
          route_id: "M34/M34A",
          route_label: "M34/M34A | 34th Street",
          route_type: "SBS",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
          _merged_field_values: {
            route_label: ["M34", "M34A"],
            description: ["M16 renamed to M34A SBS for clearer passenger communication."],
          },
        }),
      ),
    ).toBe("aggregate_list_context");

    expect(
      routeRecordScope(
        routeRecord("route_q52-sbs-queens", {
          route_id: "Q52 SBS",
          route_label: "Q52 SBS",
          route_type: "Select Bus Service",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
          _merged_field_values: {
            route_id: ["Q52 SBS", "Q52/Q53 SBS", "Q52 LTD"],
            route_type: ["Select Bus Service", "Limited"],
            route_type_normalized: ["select_bus_service", "limited_stop"],
            service_variant: ["sbs", "limited_stop"],
            description: ["Q52 extension under review on the Q52/Q53 corridor."],
          },
        }),
      ),
    ).toBe("split_candidate");

    expect(
      routeRecordScope(
        routeRecord("route_q53-sbs-ace", {
          route_id: "Q53-SBS",
          route_label: "Q53-SBS",
          route_type: "Select Bus Service",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
          _merged_field_values: {
            route_id: ["Q53-SBS", "Q53 LTD"],
            route_type: ["Select Bus Service", "Limited"],
            route_type_normalized: ["select_bus_service", "limited_stop"],
            service_variant: ["sbs", "limited_stop"],
            description: ["Proposed upgrade of Q53 Limited to SBS."],
          },
        }),
      ),
    ).toBe("true_route");

    expect(
      routeRecordScope(
        routeRecord("route_utica-ave-sbs", {
          route_id: "B46+",
          route_label: "B46+",
          route_type: "SBS",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
          _merged_field_values: {
            route_id: ["B46+", "B46 Limited"],
            route_label: ["B46+", "B46 LTD"],
            route_type: ["SBS", "Limited"],
            route_type_normalized: ["select_bus_service", "limited_stop"],
            service_variant: ["sbs", "limited_stop"],
            description: ["Proposed upgrade of B46 Limited to Select Bus Service on Utica Avenue."],
          },
        }),
      ),
    ).toBe("true_route");

    expect(
      routeRecordScope(
        routeRecord("route_bx41-limited-2012", {
          route_id: "Bx41",
          route_label: "Bx41 Limited",
          route_type: "Limited",
          route_type_normalized: "limited_stop",
          service_variant: "limited_stop",
          _merged_field_values: {
            route_type: ["Limited", "Local & SBS"],
            route_type_normalized: ["limited_stop", "local_and_sbs"],
            description: ["Bx41 Limited service replaced by Bx41 Select Bus Service."],
          },
        }),
      ),
    ).toBe("true_route");

    expect(
      routeRecordScope(
        routeRecord("route_q52-sbs-queens", {
          route_id: "Q52 SBS",
          route_label: "Q52 SBS",
          route_type: "Select Bus Service",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
          _merged_field_values: {
            route_id: ["Q52 SBS", "Q52/Q53 SBS", "Q52 LTD"],
            route_type: ["Select Bus Service", "Limited"],
            route_type_normalized: ["select_bus_service", "limited_stop"],
            service_variant: ["sbs", "limited_stop"],
            description: ["Proposed SBS route based on existing Q52 LTD route."],
          },
        }),
      ),
    ).toBe("split_candidate");

    expect(
      routeRecordScope(
        routeRecord("route_q44-cb12-2011", {
          route_id: "Q44",
          route_label: "Q44",
          route_type: "local",
          route_type_normalized: "local",
          service_variant: "local",
          _merged_field_values: {
            route_id: ["Q44", "Q44 LTD"],
            route_type: ["local", "Limited"],
            route_type_normalized: ["local", "limited_stop"],
            service_variant: ["local", "limited_stop"],
            description: ["Q44 Limited will be upgraded to Q44 Select Bus Service."],
          },
        }),
      ),
    ).toBe("split_candidate");

    expect(
      routeRecordScope(
        routeRecord("route_s79-hylan-2010", {
          route_id: "S79",
          route_label: "S79",
          route_type: "local",
          route_type_normalized: "local",
          service_variant: "local",
          _merged_field_values: {
            route_type: ["local", "Select Bus Service", "Limited"],
            route_type_normalized: ["local", "select_bus_service", "limited_stop"],
            service_variant: ["local", "sbs", "limited_stop"],
            description: ["Local bus service that would be replaced by proposed Select Bus Service."],
          },
        }),
      ),
    ).toBe("true_route");
  });

  it("treats exact limited-bus classifier artifacts as compatible local route evidence", () => {
    expect(
      routeRecordScope(
        routeRecord("route_meeting-doc-129371-s93", {
          route_id: "S93",
          route_type: "local",
          route_type_normalized: "local",
          service_variant: "local",
          _merged_field_values: {
            route_type: ["local", "limited bus"],
            route_type_normalized: ["bus", "local", "limited_bus"],
          },
        }),
      ),
    ).toBe("true_route");

    expect(
      routeRecordScope(
        routeRecord("route_q50-2014-brt-flushingjamaica-ws", {
          route_id: "Q50",
          route_type: "local",
          route_type_normalized: "local",
          service_variant: "local",
          _merged_field_values: {
            route_type: ["local", "limited bus"],
            route_type_normalized: ["local", "limited_bus"],
          },
        }),
      ),
    ).toBe("true_route");

    expect(
      routeRecordScope(
        routeRecord("route_q34-queens", {
          route_id: "Q34",
          route_type: "local",
          route_type_normalized: "local",
          service_variant: "local",
          _merged_field_values: {
            route_type: ["local", "limited"],
            route_type_normalized: ["local", "limited_stop"],
          },
        }),
      ),
    ).toBe("split_candidate");

    expect(
      routeRecordScope(
        routeRecord("route_q25-ltd-queens", {
          route_id: "Q25 LTD",
          route_type: "local",
          route_type_normalized: "local",
          service_variant: "local",
          _merged_field_values: {
            route_type: ["local", "limited bus"],
            route_type_normalized: ["local", "limited_bus"],
          },
        }),
      ),
    ).toBe("split_candidate");

    expect(
      routeRecordScope(
        routeRecord("route_q53-sbs-ace", {
          route_id: "Q53-SBS",
          route_type: "Select Bus Service",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
          _merged_field_values: {
            route_type: ["Select Bus Service", "limited bus"],
            route_type_normalized: ["select_bus_service", "limited_bus"],
          },
        }),
      ),
    ).toBe("split_candidate");

    expect(
      routeRecordScope(
        routeRecord("route_utica-ave-sbs", {
          route_id: "B46+",
          route_label: "B46 Select Bus Service",
          route_type: "SBS",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
          _merged_field_values: {
            route_type: ["SBS", "limited bus"],
            route_type_normalized: ["select_bus_service", "limited_bus"],
          },
        }),
      ),
    ).toBe("split_candidate");

    expect(
      routeRecordScope(
        routeRecord("route_bx15-ltd-webster-2012", {
          route_id: "Bx15",
          route_type: "local",
          route_type_normalized: "local",
          service_variant: "local",
          _merged_field_values: {
            route_id: ["Bx15", "Bx15 LTD"],
            route_type: ["local", "limited bus"],
            route_type_normalized: ["local", "limited_bus"],
          },
        }),
      ),
    ).toBe("split_candidate");

    expect(
      routeRecordScope(
        routeRecord("route_bx55-2012", {
          route_id: "Bx55",
          route_type: "local",
          route_type_normalized: "local",
          service_variant: "local",
          _merged_field_values: {
            route_label: ["Bx55 Limited"],
            route_type: ["local", "limited bus"],
            route_type_normalized: ["local", "limited_bus"],
          },
        }),
      ),
    ).toBe("split_candidate");

    expect(
      routeRecordScope(
        routeRecord("route_b103-ltd-proposed-draft", {
          route_id: "B103 LTD",
          route_type: "Limited",
          route_type_normalized: "limited_stop",
          service_variant: "limited_stop",
          _merged_field_values: {
            route_type: ["Limited", "local"],
            route_type_normalized: ["limited_stop", "local"],
            service_variant: ["limited_stop", "local"],
          },
        }),
      ),
    ).toBe("split_candidate");
  });

  it("keeps source-scoped supporting records data-only by default", () => {
    expect(pageRelativePathForRecord("entity", sourceA, "entity_test")).toBe("wiki/entities/entity_test.md");
    expect(pageRelativePathForRecord("source_gap", sourceA, "gap_test")).toBe("wiki/gaps/gap_test.md");
    expect(pageRelativePathForRecord("claim", sourceA, "claim_test")).toBeUndefined();
    expect(pageRelativePathForRecord("metric_claim", sourceA, "metric_test")).toBeUndefined();
    expect(pageRelativePathForRecord("table", sourceA, "table_test")).toBeUndefined();
    expect(pageRelativePathForRecord("event", sourceA, "event_test")).toBeUndefined();
    expect(pageRelativePathForRecord("treatment_component", sourceA, "treatment_test")).toBeUndefined();
    expect(pageRelativePathForRecord("relation", sourceA, "relation_test")).toBeUndefined();
  });

  it("keeps only count-shaped route scope records from materializing route pages", () => {
    expect(pageRelativePathForCanonicalRecord(routeRecord("route_b44-sbs", { route_id: "B44", service_variant: "SBS" }))).toBe(
      "wiki/routes/route_b44-sbs.md",
    );
    expect(pageRelativePathForCanonicalRecord(routeRecord("route_x28-x38-bay-pkwy", { route_id: "X28/X38", route_type: "Express" }))).toBe(
      "wiki/routes/route_x28-x38-bay-pkwy.md",
    );
    expect(
      pageRelativePathForCanonicalRecord(
        routeRecord("route_q52-sbs-queens", {
          route_id: "Q52",
          service_variant: "SBS",
          _merged_field_values: {
            service_variant: ["sbs", "limited_stop"],
          },
        }),
      ),
    ).toBe("wiki/routes/route_q52-sbs-queens.md");
    expect(pageRelativePathForCanonicalRecord(routeRecord("route_m34-sbs", { route_id: "M34", route_label: "M34/M34A SBS" }))).toBe(
      "wiki/routes/route_m34-sbs.md",
    );
    expect(
      pageRelativePathForCanonicalRecord(
        routeRecord("route_utica-ave-sbs", {
          route_id: "B46",
          service_variant: "SBS",
          _merged_field_values: {
            service_variant: ["sbs", "limited_stop"],
          },
        }),
      ),
    ).toBe("wiki/routes/route_utica-ave-sbs.md");
    expect(pageRelativePathForCanonicalRecord(routeRecord("route_15-express-bus-battery-pl", { route_id: "15 Express bus routes" }))).toBeUndefined();
  });

  it("persists route record scope as a materializer-owned companion", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_q10",
        label: "Q10",
        payload: {
          route_id: "Q10",
          route_type: "local",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_x28_x38",
        label: "X28/X38",
        payload: {
          route_id: "X28/X38",
          route_type: "Express",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_bx18a_b",
        label: "Bx18A/B",
        payload: {
          route_id: "Bx18A/B",
          route_type: "local",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_q20a",
        label: "Q20A/Q20B",
        payload: {
          route_id: "Q20A",
          route_label: "Q20A/Q20B",
          route_type: "local",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_15_express_bus_battery_pl",
        label: "15 Express bus routes",
        payload: {
          route_id: "15 Express bus routes",
          description: "15 Express bus routes affected by Battery Pl delay",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const routeScopes = new Map(
      records
        .filter((record) => record.record_kind === "route")
        .map((record) => [record.payload.route_id, { scope: record.payload.route_record_scope, reason: record.payload.route_record_scope_reason }]),
    );
    expect(routeScopes.get("Q10")).toEqual({ scope: "true_route", reason: "default_true_route" });
    expect(routeScopes.get("X28/X38")).toEqual({ scope: "aggregate_list_context", reason: "slash_route_surface" });
    expect(routeScopes.get("Bx18A/B")).toEqual({ scope: "true_route", reason: "same_base_branch_route_id" });
    expect(routeScopes.get("Q20A")).toEqual({ scope: "aggregate_list_context", reason: "slash_route_surface" });
    expect(routeScopes.get("15 Express bus routes")).toEqual({ scope: "data_only_scope", reason: "count_only_route_scope_text" });
  });

  it("treats display-only slash route surfaces as weak when structured fields identify one route", () => {
    const records = entriesToRecords([
      legacyAccepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_m34_sbs",
        label: "M34/M34A on 34th Street Busway",
        payload: {
          route_id: "M34",
          route_label: "M34 SBS",
          route: "M34 SBS",
          route_name: "M34+",
          internal_route_id: "M34+",
          route_id_authority: "mta_internal",
          source_route_surface: "mta_route_id",
          service_variant: "sbs",
          _merged_field_values: {
            route_id: ["M34/M34A"],
            route_label: ["M34/M34A SBS"],
            route_name: ["M34/M34A Select Bus Service"],
            internal_route_id: ["M34/M34A+"],
          },
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_x28_x38",
        label: "X28/X38",
        payload: {
          route_id: "X28/X38",
          route_type: "Express",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const m34 = records.find((record) => record.record_id === "route_m34-sbs");
    const x28X38 = records.find((record) => record.payload.route_id === "X28/X38");
    expect(m34?.payload.route_record_scope).toBe("split_candidate");
    expect(m34?.payload.route_record_scope_reason).toBe("merged_slash_route_surface");
    expect(m34?.record_aliases ?? []).not.toContain("route_m34-m34a");
    expect(x28X38?.payload.route_record_scope).toBe("aggregate_list_context");
    expect(x28X38?.payload.route_record_scope_reason).toBe("slash_route_surface");
  });

  it("persists a local-limited bundle reason for compatible merged route variants", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_b6_local_limited",
        target_record_id: "route_b6-2015-sbk-corridor",
        label: "B6",
        payload: {
          route_id: "B6",
          route_type: "Local and Limited",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "route",
        local_observation_id: "route_b6_local",
        target_record_id: "route_b6-2015-sbk-corridor",
        label: "B6 Local",
        payload: {
          route_id: "B6",
          route_type: "Local",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
    ]);

    const route = records.find((record) => record.record_id === "route_b6-2015-sbk-corridor");
    expect(route?.payload.route_record_scope).toBe("true_route");
    expect(route?.payload.route_record_scope_reason).toBe("local_limited_bundle_compatible");
  });

  it("persists narrow route lineage compatibility reasons", () => {
    const records = entriesToRecords([
      legacyAccepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_m60_sbs",
        target_record_id: "route_125th-laguardia-sbs",
        label: "M60-SBS",
        payload: {
          route_id: "M60",
          route_label: "M60-SBS",
          route_type: "Select Bus Service",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
          _merged_field_values: {
            route_type: ["Select Bus Service", "local"],
            route_type_normalized: ["select_bus_service", "local"],
            service_variant: ["sbs", "local"],
            description: ["Upgrade M60 route to SBS on 125th Street."],
          },
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const route = records.find((record) => record.record_id === "route_125th-laguardia-sbs");
    expect(route?.payload.route_record_scope).toBe("true_route");
    expect(route?.payload.route_record_scope_reason).toBe("sbs_local_upgrade_compatible");
  });

  it("persists predecessor-successor lifecycle compatibility reasons", () => {
    const records = entriesToRecords([
      legacyAccepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_q53_sbs",
        target_record_id: "route_q53-sbs-ace",
        label: "Q53-SBS",
        payload: {
          route_id: "Q53-SBS",
          route_label: "Q53-SBS",
          route_type: "Select Bus Service",
          route_type_normalized: "select_bus_service",
          service_variant: "sbs",
          _merged_field_values: {
            route_id: ["Q53-SBS", "Q53 LTD"],
            route_type: ["Select Bus Service", "Limited"],
            route_type_normalized: ["select_bus_service", "limited_stop"],
            service_variant: ["sbs", "limited_stop"],
            description: ["Proposed upgrade of Q53 Limited to SBS."],
          },
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const route = records.find((record) => record.record_id === "route_q53-sbs-ace");
    expect(route?.payload.route_record_scope).toBe("true_route");
    expect(route?.payload.route_record_scope_reason).toBe("predecessor_successor_lifecycle_compatible");
  });

  it("does not persist stale generic route base aliases when a variant-specific route id is present", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_m23_local_cb5",
        label: "M23",
        payload: {
          route_id: "M23",
          route_type: "local",
          service_variant: "local",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const route = records.find((record) => record.record_kind === "route");
    expect(route).toBeDefined();
    expect(route?.record_aliases ?? []).not.toContain("route_m23");
  });

  it("prunes stale generic route aliases after entries merge", () => {
    const records = entriesToRecords([
      legacyAccepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_bx55_generic",
        target_record_id: "route_bx55-2012",
        label: "Bx55",
        payload: {
          route_id: "Bx55",
          route_type: "local",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      legacyAccepted({
        source_id: sourceB,
        observation_kind: "route",
        local_observation_id: "route_bx55_limited",
        target_record_id: "route_bx55-2012",
        label: "Bx55 Limited",
        payload: {
          route_id: "Bx55",
          route_label: "Bx55 Limited",
          route_type: "Limited",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
    ]);

    const route = records.find((record) => record.record_id === "route_bx55-2012");
    expect(route).toBeDefined();
    expect(route?.record_aliases ?? []).not.toContain("route_bx55");
  });

  it("does not persist bare corridor aliases when scoped geography is present", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "corridor",
        local_observation_id: "corridor_broadway_upper_manhattan",
        label: "Broadway",
        payload: {
          corridor_name: "Broadway",
          limits: "157th Street to 220th Street",
          borough: "Manhattan",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const corridor = records.find((record) => record.record_kind === "corridor");
    expect(corridor).toBeDefined();
    expect(corridor?.record_aliases ?? []).not.toContain("corridor_broadway");
  });

  it("does not materialize legacy accepted table submissions", () => {
    const entry = createSubmissionEntry("test_run", {
      source_id: sourceA,
      observation_kind: "table",
      local_observation_id: "table_route_speeds",
      label: "Route speeds",
      payload: {
        table_title: "Route speeds",
        columns: ["Route", "Speed"],
        rows: [{ route: "B44", speed: "8 mph" }],
        caption: "Average speeds",
      },
      evidence_refs: [evidenceRef(sourceA)],
    });
    entry.validation.state = "accepted";
    entry.validation.issues = [];

    const table = entriesToRecords([entry]).find((record) => record.record_kind === "table");

    expect(table).toBeUndefined();
  });

  it("skips accepted submissions listed in retirement overrides", () => {
    const retired = accepted({
      source_id: sourceA,
      observation_kind: "route",
      local_observation_id: "route_retired_q10_q80",
      label: "Q10 Q80",
      payload: {
        route_label: "Q10 Q80",
      },
      evidence_refs: [evidenceRef(sourceA)],
    });
    const kept = accepted({
      source_id: sourceA,
      observation_kind: "route",
      local_observation_id: "route_q10",
      label: "Q10",
      payload: {
        route_id: "Q10",
      },
      evidence_refs: [evidenceRef(sourceA)],
    });

    const routes = entriesToRecords([retired, kept], {
      retiredSubmissionIds: new Set([retired.submission_id]),
    }).filter((record) => record.record_kind === "route");

    expect(routes).toHaveLength(1);
    expect(routes[0]?.record_id).toBe("route_q10");
    expect(routes[0]?.submission_ids).toEqual([kept.submission_id]);
  });

  it("merges route observations with the same canonical route identity across sources", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_b44_sbs",
        label: "B44 Select Bus Service",
        payload: {
          route_name: "B44",
          service_type: "Select Bus Service",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "route",
        local_observation_id: "route_b44_sbs",
        label: "B44-SBS bus route",
        payload: {
          route_id: "B44-SBS",
          operator: "MTA NYCT",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
    ]);

    const routes = records.filter((record) => record.record_kind === "route");
    expect(routes).toHaveLength(1);
    expect(routes[0]?.record_id).toBe("route_b44-sbs");
    expect(routes[0]?.source_ids).toEqual([sourceA, sourceB]);
    expect(routes[0]?.submission_ids).toHaveLength(2);
  });

  it("treats MTA plus-suffixed bus route ids as SBS route identities", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_b44_plus",
        label: "B44+",
        payload: {
          route_id: "B44+",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "route",
        local_observation_id: "route_b44_sbs",
        label: "B44-SBS bus route",
        payload: {
          route_id: "B44-SBS",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
    ]);

    const routes = records.filter((record) => record.record_kind === "route");
    expect(routes).toHaveLength(1);
    expect(routes[0]?.record_id).toBe("route_b44-sbs");
    expect(routes[0]?.record_aliases).toContain("route_b44-plus");
    expect(routes[0]?.payload).toMatchObject({
      route_id_authority: "mta_internal",
      internal_route_id: "B44+",
      service_variant: "sbs",
    });
  });

  it("keeps local-limited bundle evidence from becoming limited-only primary variant", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_m15_reference",
        target_record_id: "route_m15-local-limited",
        label: "M15 reference",
        payload: {
          route_id: "M15",
          route_label: "M15",
          source_route_type_phrase: "Local and Limited",
          route_type: "limited",
          description: "M15 local and limited route reference",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const route = records.find((record) => record.record_id === "route_m15-local-limited");
    expect(route?.payload.service_variant).toBe("local_limited");
    expect(route?.payload.route_type_normalized).toBe("local_limited");
    expect(route?.payload._merged_field_values).toBeUndefined();
  });

  it("does not promote project program names into strong identity aliases", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_jamaica_busway",
        label: "Jamaica Busway",
        payload: {
          project_name: "Jamaica Busway",
          program: "Better Buses Restart",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const project = records.find((record) => record.record_kind === "project");
    expect(project?.record_id).toBe("project_jamaica-busway");
    expect(project?.record_aliases ?? []).not.toContain("project_better-buses-restart");
  });

  it("promotes concrete project companion values over earlier other values while preserving conflicts", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_test_status_unknown",
        target_record_id: "project_test-status",
        label: "Test status project",
        payload: {
          project_name: "Test status project",
          project_type: "miscellaneous",
          status: "unclassified context",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "project",
        local_observation_id: "project_test_status_awarded",
        target_record_id: "project_test-status",
        label: "Test status project",
        payload: {
          project_name: "Test status project",
          project_type: "busway",
          status: "awarded",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
    ]);

    const project = records.find((record) => record.record_id === "project_test-status");
    expect(project?.payload.document_time_status).toBe("approved");
    expect(project?.payload.project_family).toBe("busway");
    expect(project?.payload._merged_field_values).toMatchObject({
      document_time_status: expect.arrayContaining(["other", "approved"]),
      project_family: expect.arrayContaining(["other", "busway"]),
    });
  });

  it("replays current normalizers for first-insert singleton records", () => {
    const stale = accepted({
      source_id: sourceA,
      observation_kind: "event",
      local_observation_id: "event_policy_announcement_stale",
      target_record_id: "event_policy-announcement-stale",
      label: "Subway safety policy announcement",
      payload: {
        event_kind: "public event",
      },
      evidence_refs: [evidenceRef(sourceA)],
    });
    stale.tool_args.payload = {
      event_kind: "policy announcement",
      description: "Governor Hochul announces Five-Point Plan to Protect New Yorkers on the Subway.",
      event_family: "other",
    };

    const records = entriesToRecords([stale]);
    const event = records.find((record) => record.record_id === "event_policy-announcement-stale");
    expect(event?.payload.event_family).toBe("planning");
  });

  it("uses top-level raw text as read-only normalization context for singleton records", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_fulton_context_singleton",
        target_record_id: "project_fulton-context-singleton",
        label: "Fulton CBTC Procurement / Liberty Line Signal Replacement",
        raw_text: "The Fulton CBTC project is moving forward, with the RFQ already released and the RFP expected within weeks.",
        payload: {
          project_name: "Fulton CBTC Procurement / Liberty Line Signal Replacement",
          project_type: "signal modernization",
          description: "Replacement of 79-year-old signaling equipment on the Liberty Line.",
          project_family: "capital_or_infrastructure",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const project = records.find((record) => record.record_id === "project_fulton-context-singleton");
    expect(project?.payload.document_time_status).toBe("planned");
    expect(project?.payload.raw_text).toBeUndefined();
    expect(project?.raw_text).toContain("RFQ already released");
  });

  it("uses cited source block text as read-only normalization context when source_quote is absent", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_fulton_block_context",
        label: "Fulton CBTC Procurement / Liberty Line Signal Replacement",
        payload: {
          project_name: "Fulton CBTC Procurement / Liberty Line Signal Replacement",
          project_type: "signal modernization",
          description: "Replacement of 79-year-old signaling equipment on the Liberty Line.",
          project_family: "capital_or_infrastructure",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const project = records.find((record) => record.record_id === "project_fulton-block-context");
    expect(project?.payload.document_time_status).toBe("planned");
    expect(project?.payload.evidence_quotes).toBeUndefined();
    expect(project?.payload.raw_text).toBeUndefined();
    expect(project?.evidence_refs.some((ref) => ref.source_quote !== undefined)).toBe(false);
  });

  it("uses cited source block text as read-only normalization context when source_quote is shorter than the block", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_fulton_block_context_with_quote",
        label: "Fulton CBTC Procurement / Liberty Line Signal Replacement",
        payload: {
          project_name: "Fulton CBTC Procurement / Liberty Line Signal Replacement",
          project_type: "signal modernization",
          description: "Replacement of 79-year-old signaling equipment on the Liberty Line.",
          project_family: "capital_or_infrastructure",
        },
        evidence_refs: [{ ...evidenceRef(sourceA), source_quote: "Fulton CBTC project" }],
      }),
    ]);

    const project = records.find((record) => record.record_id === "project_fulton-block-context-with-quote");
    expect(project?.payload.document_time_status).toBe("planned");
    expect(project?.payload.evidence_quotes).toBeUndefined();
    expect(project?.payload.raw_text).toBeUndefined();
    expect(project?.evidence_refs.some((ref) => ref.source_quote === "Fulton CBTC project")).toBe(true);
  });

  it("uses merged evidence quotes as read-only normalization context", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_lirr_sandy_identity",
        target_record_id: "project_lirr-sandy-context-merge",
        label: "LIRR Sandy Restoration and Resiliency Project Phase 3B",
        payload: {
          project_name: "LIRR Sandy Restoration and Resiliency Project Phase 3B",
          project_type: "construction",
          description: "Construct Phase 3B of LIRR's Sandy Restoration and Resiliency Project.",
          project_family: "capital_or_infrastructure",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "project",
        local_observation_id: "project_lirr_sandy_contract",
        target_record_id: "project_lirr-sandy-context-merge",
        label: "LIRR Sandy Restoration and Resiliency Project Phase 3B",
        payload: {
          description: "Phase 3B contract evidence.",
        },
        evidence_refs: [
          {
            ...evidenceRef(sourceB),
            source_quote:
              "A publicly advertised, competitively solicited and negotiated contract to Posillico Civil, Inc. in the amount of $38,092,008 to construct Phase 3B.",
          },
        ],
      }),
    ]);

    const project = records.find((record) => record.record_id === "project_lirr-sandy-context-merge");
    expect(project?.payload.document_time_status).toBe("approved");
    expect(project?.payload.evidence_refs).toBeUndefined();
    expect(project?.evidence_refs.some((ref) => ref.source_quote?.includes("Posillico Civil"))).toBe(true);
  });

  it("uses merged source block text as read-only normalization context when source_quote is absent", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_lirr_sandy_identity",
        target_record_id: "project_lirr-sandy-block-context-merge",
        label: "LIRR Sandy Restoration and Resiliency Project Phase 3B",
        payload: {
          project_name: "LIRR Sandy Restoration and Resiliency Project Phase 3B",
          project_type: "construction",
          description: "Construct Phase 3B of LIRR's Sandy Restoration and Resiliency Project.",
          project_family: "capital_or_infrastructure",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "project",
        local_observation_id: "project_lirr_sandy_contract",
        target_record_id: "project_lirr-sandy-block-context-merge",
        label: "LIRR Sandy Restoration and Resiliency Project Phase 3B",
        payload: {
          description: "Phase 3B contract evidence.",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
    ]);

    const project = records.find((record) => record.record_id === "project_lirr-sandy-block-context-merge");
    expect(project?.payload.document_time_status).toBe("approved");
    expect(project?.payload.evidence_quotes).toBeUndefined();
    expect(project?.evidence_refs.some((ref) => ref.source_quote !== undefined)).toBe(false);
  });

  it("replays project family normalization after merging split project type and scope evidence", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_midtown_42nd_scope",
        target_record_id: "project_midtown-42nd-scope",
        label: "Midtown 42nd St. Corridor Projects",
        payload: {
          project_name: "Midtown 42nd St. Corridor Projects",
          description:
            "Coordination and management of 42nd St Corridor projects including replacement of eleven escalators and three elevators at Grand Central Station and replacement of one elevator for Times Square Shuttle.",
          status: "under procurement for consultant services",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "project",
        local_observation_id: "project_midtown_42nd_type",
        target_record_id: "project_midtown-42nd-scope",
        label: "Midtown 42nd St. Corridor Projects",
        payload: {
          project_name: "Midtown 42nd St. Corridor Projects",
          project_type: "corridor project",
          description: "Project management and construction management services for Midtown 42nd St. Corridor projects.",
          project_family: "other",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
    ]);

    const project = records.find((record) => record.record_id === "project_midtown-42nd-scope");
    expect(project?.payload.project_family).toBe("accessibility_or_safety");
    expect(project?.payload._merged_field_values).toMatchObject({
      description: expect.arrayContaining([
        "Coordination and management of 42nd St Corridor projects including replacement of eleven escalators and three elevators at Grand Central Station and replacement of one elevator for Times Square Shuttle.",
        "Project management and construction management services for Midtown 42nd St. Corridor projects.",
      ]),
      project_family: expect.arrayContaining(["other", "accessibility_or_safety"]),
    });
  });

  it("replays project status normalization after merging detailed construction evidence", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_gct_train_shed_summary",
        target_record_id: "project_grand-central-terminal-train-shed",
        label: "Grand Central Terminal Train Shed and Park Avenue Viaduct Work",
        payload: {
          project_name: "Grand Central Terminal Train Shed and Park Avenue Viaduct Work",
          project_type: "infrastructure improvement",
          description: "Work on Grand Central Terminal Train Shed and Park Avenue Viaduct.",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "project",
        local_observation_id: "project_gct_train_shed_sector_1",
        target_record_id: "project_grand-central-terminal-train-shed",
        label: "Grand Central Terminal Train Shed Repairs",
        payload: {
          project_name: "Grand Central Terminal Train Shed Repairs",
          description:
            "Sector 1 is under construction, focusing on complete replacement of approximately 70,000 square feet over the Upper Level of the Train Shed.",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
    ]);

    const project = records.find((record) => record.record_id === "project_grand-central-terminal-train-shed");
    expect(project?.payload.document_time_status).toBe("under_construction");
    expect(project?.payload.project_family).toBe("capital_or_infrastructure");
  });

  it("promotes concrete treatment family over earlier other values while preserving conflicts", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "treatment_component",
        local_observation_id: "treatment_sbs_station",
        label: "SBS Station",
        payload: {
          treatment_kind: "unclassified treatment",
          treatment_family: "other",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "treatment_component",
        local_observation_id: "treatment_sbs_station",
        label: "SBS Station",
        payload: {
          treatment_kind: "SBS station",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const treatment = records.find((record) => record.record_id === "treatment_sbs-station");
    expect(treatment?.payload.treatment_family).toBe("bus_stop_or_boarding");
    expect(treatment?.payload._merged_field_values).toMatchObject({
      treatment_family: expect.arrayContaining(["other", "bus_stop_or_boarding"]),
    });
  });

  it("uses elevator and escalator repair labels as bounded treatment context", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "treatment_component",
        local_observation_id: "treatment_locust_manor_a_warranty",
        label: "Locust Manor A Elevator - GC Warranty Repairs",
        payload: {
          treatment_kind: "repair",
          description: "GC warranty repairs",
          location_text: "Locust Manor A",
          treatment_family: "other",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "treatment_component",
        local_observation_id: "treatment_generic_warranty",
        label: "Generic Warranty Repairs",
        payload: {
          treatment_kind: "repair",
          description: "GC warranty repairs",
          location_text: "Generic station",
          treatment_family: "other",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const elevatorRepair = records.find((record) => record.record_id === "treatment_locust-manor-a-warranty");
    expect(elevatorRepair?.payload.label).toBe("Locust Manor A Elevator - GC Warranty Repairs");
    expect(elevatorRepair?.payload.treatment_family).toBe("pedestrian_or_accessibility");

    const genericRepair = records.find((record) => record.record_id === "treatment_generic-warranty");
    expect(genericRepair?.payload.label).toBeUndefined();
    expect(genericRepair?.payload.treatment_family).toBe("other");
  });

  it("merges curated entity aliases such as nycdot into the canonical NYC DOT record", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_nyc_dot",
        label: "New York City Department of Transportation",
        payload: {
          entity_name: "New York City Department of Transportation",
          agency_name: "NYC DOT",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "entity",
        local_observation_id: "entity_nycdot",
        label: "NYCDOT",
        payload: {
          entity_name: "New York City Department of Transportation",
          agency_name: "NYCDOT",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
    ]);

    const entities = records.filter((record) => record.record_kind === "entity");
    expect(entities).toHaveLength(1);
    expect(entities[0]?.record_id).toBe("entity_nyc-dot");
    expect(entities[0]?.record_aliases).toContain("entity_nycdot");
    expect(entities[0]?.local_observation_ids).toEqual(["entity_nyc_dot", "entity_nycdot"]);
  });

  it("prunes under-specified community-board aliases when borough context is known", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_community_board_5",
        label: "Community Board 5",
        payload: {
          entity_name: "Community Board 5",
          entity_type: "community board",
          borough: "Brooklyn",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const entity = records.find((record) => record.record_kind === "entity");
    expect(entity?.record_aliases ?? []).toContain("entity_brooklyn-community-board-5");
    expect(entity?.record_aliases ?? []).not.toContain("entity_community-board-5");
  });

  it("disambiguates generic community-board and CAC display labels when scope is deterministic", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_community_board_1_brooklyn",
        label: "Community Board 1",
        payload: {
          entity_name: "Community Board 1",
          entity_type: "community board",
          borough: "Brooklyn",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_woodhaven_cac",
        label: "Community Advisory Committee (CAC)",
        payload: {
          entity_name: "Community Advisory Committee (CAC)",
          entity_type: "committee",
          description: "Community Advisory Committee for the Woodhaven / Cross Bay SBS project",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const communityBoard = records.find((record) => record.record_id === "entity_brooklyn-community-board-1");
    expect(communityBoard?.display_name).toBe("Brooklyn Community Board 1");

    const cac = records.find((record) => record.payload.description === "Community Advisory Committee for the Woodhaven / Cross Bay SBS project");
    expect(cac?.display_name).toBe("Woodhaven / Cross Bay SBS Community Advisory Committee (CAC)");
  });

  it("applies reviewed display labels for the Frank Farrell do-not-merge duplicate", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_frank_farrell_mta_acting_evp_buses",
        target_record_id: "entity_frank-farrell-mta-acting-evp-buses",
        label: "Frank Farrell",
        payload: {
          entity_name: "Frank Farrell",
          entity_type: "person",
          title: "MTA Acting Executive Vice President of Department of Buses/MTA Bus Company",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_mta_nyct_evp_frank_farrell",
        target_record_id: "entity_mta-nyct-evp-frank-farrell",
        label: "Frank Farrell",
        payload: {
          entity_name: "Frank Farrell",
          entity_type: "government_official",
          title: "MTA New York City Transit Executive Vice President of Buses",
          agency_name: "MTA New York City Transit",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    expect(records.find((record) => record.record_id === "entity_frank-farrell-mta-acting-evp-buses")?.display_name).toBe("Frank Farrell, MTA Acting EVP of Buses/MTA Bus Company");
    expect(records.find((record) => record.record_id === "entity_mta-nyct-evp-frank-farrell")?.display_name).toBe("Frank Farrell, MTA NYCT EVP of Buses");
  });

  it("does not assign parent board aliases to community-board committees", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_bronx_community_board_2_edc",
        label: "Bronx Community Board 2 Economic Development Committee",
        payload: {
          entity_name: "Bronx Community Board 2 Economic Development Committee",
          entity_type: "community board committee",
          borough: "Bronx",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const entity = records.find((record) => record.record_kind === "entity");
    expect(entity?.record_aliases ?? []).toContain("entity_bronx-community-board-2-economic-development-committee");
    expect(entity?.record_aliases ?? []).not.toContain("entity_bronx-community-board-2");
  });

  it("does not persist parent agency aliases for child unit records", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_department_of_subways",
        label: "Department of Subways",
        payload: {
          entity_name: "Department of Subways",
          agency_name: "New York City Transit",
          entity_type: "department",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const entity = records.find((record) => record.record_kind === "entity");
    expect(entity?.record_id).toBe("entity_department-of-subways");
    expect(entity?.record_aliases ?? []).not.toContain("entity_mta-nyct");
  });

  it("does not persist bare scoped-role aliases when a specific role alias is present", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_mnr_president",
        label: "President, Metro-North Railroad",
        payload: {
          entity_name: "President",
          agency_name: "Metro-North Railroad",
          entity_type: "role",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const entity = records.find((record) => record.record_kind === "entity");
    expect(entity?.record_aliases ?? []).toContain("entity_president-metro-north-railroad");
    expect(entity?.record_aliases ?? []).not.toContain("entity_president");
  });

  it("does not persist Grand Central Madison station and operating-company leakage aliases", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_grand-central-madison-127546",
        label: "Meeting Doc 121001 GCMOC",
        payload: {
          entity_name: "Grand Central Madison",
          entity_type: "station",
          acronym: "GCM",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "entity",
        local_observation_id: "entity_meeting-doc-121001-gcmoc",
        label: "Grand Central Madison",
        payload: {
          entity_name: "Grand Central Madison Concourse Operating Company",
          acronym: "GCMCOC",
          entity_type: "agency",
          parent_organization: "Metropolitan Transportation Authority",
          description: "A subsidiary created to operate the Grand Central Madison Terminal.",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
    ]);

    const station = records.find((record) => record.record_id === "entity_grand-central-madison-127546");
    const operator = records.find((record) => record.record_id === "entity_meeting-doc-121001-gcmoc");
    expect(station?.record_aliases ?? []).toContain("entity_grand-central-madison");
    expect(station?.record_aliases ?? []).not.toContain("entity_meeting-doc-121001-gcmoc");
    expect(operator?.record_aliases ?? []).toContain("entity_grand-central-madison-concourse-operating-company");
    expect(operator?.record_aliases ?? []).not.toContain("entity_grand-central-madison");
  });

  it("does not persist reviewed broad entity aliases for scoped firm records", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_meeting-doc-111791-michael-baker",
        label: "Independent Engineering Consultant",
        payload: {
          entity_name: "Michael Baker International",
          entity_type: "consultant",
          description: "Independent Engineering Consultant (IEC) for MTA Capital Program",
          organization: "Michael Baker International",
          role: "MTA Independent Engineering Consultant (IEC)",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const entity = records.find((record) => record.record_id === "entity_meeting-doc-111791-michael-baker");
    expect(entity?.record_aliases ?? []).toContain("entity_michael-baker-international");
    expect(entity?.record_aliases ?? []).not.toContain("entity_independent-engineering-consultant");
  });

  it("does not persist reviewed broad project aliases for scoped child records", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_jamaica-capacity-improvement",
        label: "Jamaica Capacity Improvement Project",
        payload: {
          project_name: "Jamaica Capacity Improvement Project",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "project",
        local_observation_id: "project_jamaica-capacity-improvement-phase2",
        label: "Jamaica Capacity Improvement Project Phase 2",
        payload: {
          project_name: "Jamaica Capacity Improvement Project",
          name: "Jamaica Capacity Improvement Project Phase 2",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
    ]);

    const parent = records.find((record) => record.record_id === "project_jamaica-capacity-improvement");
    const phase2 = records.find((record) => record.record_id === "project_jamaica-capacity-improvement-phase2");
    expect(parent?.record_aliases ?? []).toContain("project_jamaica-capacity-improvement-project");
    expect(phase2?.record_aliases ?? []).toContain("project_jamaica-capacity-improvement-project-phase-2");
    expect(phase2?.record_aliases ?? []).not.toContain("project_jamaica-capacity-improvement-project");
  });

  it("applies curated aliases to explicit target record ids", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_nyc_dot",
        label: "New York City Department of Transportation",
        payload: {
          entity_name: "New York City Department of Transportation",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "entity",
        local_observation_id: "entity_nycdot_targeted",
        target_record_id: "entity_nycdot",
        label: "NYCDOT",
        payload: {
          entity_name: "NYCDOT",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
    ]);

    const entities = records.filter((record) => record.record_kind === "entity");
    expect(entities).toHaveLength(1);
    expect(entities[0]?.record_id).toBe("entity_nyc-dot");
    expect(entities[0]?.record_aliases).toContain("entity_nycdot");
  });

  it("does not let explicit target submissions donate unrelated strong identity aliases", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_targeted_lirr_text",
        target_record_id: "entity_mta-nyct",
        label: "LIRR",
        payload: {
          entity_name: "Long Island Rail Road",
          entity_type: "agency",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const entity = records.find((record) => record.record_id === "entity_mta-nyct");
    expect(entity).toBeDefined();
    expect(entity?.record_aliases ?? []).not.toContain("entity_lirr");
    expect(entity?.record_aliases ?? []).not.toContain("entity_long-island-rail-rd");
    expect(entity?.record_aliases ?? []).not.toContain("entity_long-island-rail-road");
  });

  it("adds canonical relation endpoints from local observation references", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_test_busway",
        label: "Test Busway",
        payload: {
          project_name: "Test Busway",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "event",
        local_observation_id: "event_test_launch",
        label: "Test Busway launch",
        payload: {
          event_kind: "launch",
          date_text: "June 2026",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "relation",
        local_observation_id: "relation_project_launch",
        payload: {
          relation_kind: "has_timeline_event",
          subject_local_observation_id: "project_test_busway",
          object_local_observation_id: "event_test_launch",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const relation = records.find((record) => record.record_kind === "relation");
    expect(relation?.payload.subject_id).toBe("project_test-busway");
    expect(relation?.payload.object_id).toBe("event_test-launch");
  });

  it("does not materialize local-endpoint relations when a source local id identifies multiple records", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_34th_st_sbs",
        target_record_id: "route_m14-ad-sbs",
        label: "14th Street Select Bus Service",
        payload: {
          route_name: "14th Street Select Bus Service",
          route_id: "M14A/M14D",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_34th_st_sbs",
        label: "34th Street Select Bus Service",
        payload: {
          route_name: "34th Street Select Bus Service",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "event",
        local_observation_id: "event_14th_st_sbs_start",
        label: "14th Street SBS launch",
        payload: {
          event_kind: "launch",
          date_text: "Summer 2019",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "relation",
        local_observation_id: "relation_ambiguous_route_launch",
        label: "Ambiguous route launch",
        payload: {
          relation_kind: "has_timeline_event",
          subject_local_observation_id: "route_34th_st_sbs",
          object_local_observation_id: "event_14th_st_sbs_start",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "relation",
        local_observation_id: "relation_explicit_route_launch",
        label: "Explicit route launch",
        payload: {
          relation_kind: "has_timeline_event",
          subject_local_observation_id: "route_34th_st_sbs",
          subject_id: "route_m14-ad-sbs",
          object_local_observation_id: "event_14th_st_sbs_start",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    expect(records.find((record) => record.local_observation_id === "relation_ambiguous_route_launch")).toBeUndefined();

    const explicitRelation = records.find((record) => record.local_observation_id === "relation_explicit_route_launch");
    expect(explicitRelation?.payload.subject_id).toBe("route_m14-ad-sbs");
    expect(explicitRelation?.payload.object_id).toBe("event_14th-st-sbs-start");
  });

  it("does not materialize relations whose local endpoints exist only in another source", () => {
    const relation = createSubmissionEntry("test_run", {
      source_id: sourceB,
      observation_kind: "relation",
      local_observation_id: "relation_cross_source_project_entity",
      payload: {
        relation_kind: "implemented_by",
        subject_local_observation_id: "project_test_busway",
        object_local_observation_id: "entity_nycdot",
      },
      evidence_refs: [evidenceRef(sourceB)],
    });
    expect(relation.validation.state).toBe("accepted");

    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_test_busway",
        label: "Test Busway",
        payload: {
          project_name: "Test Busway",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "entity",
        local_observation_id: "entity_nycdot",
        label: "NYC DOT",
        payload: {
          entity_name: "NYC DOT",
          entity_type: "agency",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
      relation,
    ]);

    expect(records.some((record) => record.local_observation_id === "relation_cross_source_project_entity")).toBe(false);
  });

  it("keeps same-source relation endpoint filtering bounded for large accepted batches", () => {
    const entries = Array.from({ length: 6_000 }, (_, index) =>
      createSubmissionEntry(
        "test_run",
        {
          source_id: sourceA,
          observation_kind: "relation",
          local_observation_id: `relation_missing_endpoint_${index}`,
          payload: {
            relation_kind: "implemented_by",
            subject_local_observation_id: `missing_subject_${index}`,
            object_local_observation_id: `missing_object_${index}`,
          },
          evidence_refs: [evidenceRef(sourceA)],
        },
        "2026-06-08T00:00:00.000Z",
      ),
    );
    expect(entries.every((entry) => entry.validation.state === "accepted")).toBe(true);

    const startedAt = performance.now();
    const records = entriesToRecords(entries);
    const elapsedMs = performance.now() - startedAt;

    expect(records).toHaveLength(0);
    expect(elapsedMs).toBeLessThan(1_000);
  });

  it("indexes repeated local observation ids without quadratic duplicate-set churn", () => {
    const entries = Array.from({ length: 600 }, (_, index) =>
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_duplicate_local_perf",
        target_record_id: `project_duplicate_local_perf_${index}`,
        label: `Duplicate Local Perf Project ${index}`,
        payload: {
          project_name: `Duplicate Local Perf Project ${index}`,
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    );

    const originalSetIterator = Set.prototype[Symbol.iterator];
    let yieldedSetValues = 0;
    Set.prototype[Symbol.iterator] = function* patchedSetIterator<T>(this: Set<T>): IterableIterator<T> {
      for (const value of originalSetIterator.call(this)) {
        yieldedSetValues += 1;
        yield value;
      }
    } as typeof Set.prototype[typeof Symbol.iterator];

    try {
      const records = entriesToRecords(entries);
      expect(records.filter((record) => record.record_kind === "project")).toHaveLength(entries.length);
    } finally {
      Set.prototype[Symbol.iterator] = originalSetIterator;
    }

    expect(yieldedSetValues).toBeLessThan(entries.length * 25);
  });

  it("backfills relation local endpoint ids when canonical record ids are supplied directly", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_test_busway",
        label: "Test Busway",
        payload: {
          project_name: "Test Busway",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_nycdot",
        label: "NYC DOT",
        payload: {
          entity_name: "NYC DOT",
          entity_type: "agency",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "relation",
        local_observation_id: "relation_test_busway_implemented_by_nycdot",
        label: "Test Busway implemented by NYC DOT",
        payload: {
          relation_kind: "implemented_by",
          subject_id: "project_test-busway",
          object_id: "entity_nyc-dot",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const relation = records.find((record) => record.record_kind === "relation");

    expect(relation?.payload.subject_id).toBe("project_test-busway");
    expect(relation?.payload.object_id).toBe("entity_nyc-dot");
    expect(relation?.payload.subject_local_observation_id).toBe("project_test_busway");
    expect(relation?.payload.object_local_observation_id).toBe("entity_nycdot");
  });

  it("prefers same-source local endpoint ids when backfilling merged canonical relation targets", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_test_busway",
        label: "Test Busway",
        payload: {
          project_name: "Test Busway",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "entity",
        local_observation_id: "entity_nyc_dot",
        label: "NYC DOT",
        payload: {
          entity_name: "NYC DOT",
          entity_type: "agency",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "project",
        local_observation_id: "project_source_b_busway",
        target_record_id: "project_test-busway",
        label: "Test Busway",
        payload: {
          project_name: "Test Busway",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "entity",
        local_observation_id: "agency_dot",
        target_record_id: "entity_nyc-dot",
        label: "NYCDOT",
        payload: {
          entity_name: "NYCDOT",
          entity_type: "agency",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
      accepted({
        source_id: sourceB,
        observation_kind: "relation",
        local_observation_id: "relation_source_b_busway_implemented_by_dot",
        label: "Test Busway implemented by NYCDOT",
        payload: {
          relation_kind: "implemented_by",
          subject_id: "project_test-busway",
          object_id: "entity_nyc-dot",
        },
        evidence_refs: [evidenceRef(sourceB)],
      }),
    ]);

    const relation = records.find((record) => record.local_observation_id === "relation_source_b_busway_implemented_by_dot");

    expect(relation?.payload.subject_id).toBe("project_test-busway");
    expect(relation?.payload.object_id).toBe("entity_nyc-dot");
    expect(relation?.payload.subject_local_observation_id).toBe("project_source_b_busway");
    expect(relation?.payload.object_local_observation_id).toBe("agency_dot");
  });

  it("classifies ambiguous relation families from resolved endpoint shapes", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_trackwork",
        label: "Trackwork",
        payload: {
          project_name: "Trackwork",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_harlem_line",
        label: "Harlem Line",
        payload: {
          route_name: "Harlem Line",
          mode: "commuter_rail",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "relation",
        local_observation_id: "relation_schedule_affects_harlem",
        label: "Schedule change affects Harlem Line",
        payload: {
          relation_kind: "affects",
          relation_family: "other",
          subject_local_observation_id: "project_trackwork",
          object_local_observation_id: "route_harlem_line",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const relation = records.find((record) => record.local_observation_id === "relation_schedule_affects_harlem");

    expect(relation?.payload.relation_kind).toBe("affects");
    expect(relation?.payload.relation_family).toBe("route_scope");
  });

  it("derives exact project-route relations from route list fields", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_test_busway",
        label: "Test Busway",
        payload: {
          project_name: "Test Busway",
          routes_served: ["B44 SBS"],
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_b44_sbs",
        label: "B44 Select Bus Service",
        payload: {
          route_name: "B44",
          service_type: "Select Bus Service",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const relation = derivedRelations(records).find((record) => record.payload.relation_kind === "serves_route");

    expect(relation?.payload.subject_id).toBe("project_test-busway");
    expect(relation?.payload.object_id).toBe("route_b44-sbs");
    expect(relation?.payload.relation_family).toBe("route_scope");
    expect(relation?.payload.derived_from_payload_field).toBe("routes_served");
    expect(relation?.payload.derivation_confidence).toBe("exact_canonical_match");
  });

  it("derives metric route context in route-to-metric direction", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_b44_sbs",
        label: "B44 Select Bus Service",
        payload: {
          route_name: "B44",
          service_type: "Select Bus Service",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "metric_claim",
        local_observation_id: "metric_b44_speed",
        label: "B44 SBS average speed",
        payload: {
          metric_name: "average speed",
          route_label: "B44 SBS",
          raw_value_text: "10 mph",
          value: 10,
          unit: "mph",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);
    const metric = records.find((record) => record.record_kind === "metric_claim");

    const relation = derivedRelations(records).find((record) => record.payload.relation_kind === "has_metric");

    expect(relation?.payload.subject_id).toBe("route_b44-sbs");
    expect(relation?.payload.object_id).toBe(metric?.record_id);
    expect(relation?.payload.relation_family).toBe("metric_context");
    expect(relation?.payload.derived_from_payload_field).toBe("route_label");
  });

  it("does not derive metric edges to data-only route scope records", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_15_express_bus_battery_pl",
        label: "15 Express bus routes",
        payload: {
          route_id: "15 Express bus routes",
          description: "15 Express bus routes affected by Battery Pl delay",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "metric_claim",
        local_observation_id: "metric_190_trips_peak_period",
        label: "190 peak-period trips",
        payload: {
          metric_name: "peak-period trips",
          route: "15 Express bus routes",
          raw_value_text: "190 trips",
          value: 190,
          unit: "trips",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const route = records.find((record) => record.record_kind === "route");
    expect(route?.payload.route_record_scope).toBe("data_only_scope");
    expect(derivedRelations(records).filter((record) => record.payload.relation_kind === "has_metric")).toHaveLength(0);
  });

  it("keeps ambiguous bare route context as pass-through instead of deriving a relation", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_m86_local",
        label: "M86 Local",
        payload: {
          route_id: "M86",
          route_type: "Local",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_m86_sbs",
        label: "M86 Select Bus Service",
        payload: {
          route_id: "M86-SBS",
          route_type: "Select Bus Service",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "metric_claim",
        local_observation_id: "metric_m86_speed",
        label: "M86 average speed",
        payload: {
          metric_name: "average speed",
          route_label: "M86",
          raw_value_text: "8 mph",
          value: 8,
          unit: "mph",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const relations = derivedRelations(records).filter((record) => record.payload.relation_kind === "has_metric");

    expect(relations).toHaveLength(0);
  });

  it("does not duplicate an explicit relation with a derived one", () => {
    const records = entriesToRecords([
      accepted({
        source_id: sourceA,
        observation_kind: "project",
        local_observation_id: "project_test_busway",
        label: "Test Busway",
        payload: {
          project_name: "Test Busway",
          routes_served: ["B44 SBS"],
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "route",
        local_observation_id: "route_b44_sbs",
        label: "B44 Select Bus Service",
        payload: {
          route_name: "B44",
          service_type: "Select Bus Service",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
      accepted({
        source_id: sourceA,
        observation_kind: "relation",
        local_observation_id: "relation_project_route",
        payload: {
          relation_kind: "serves_route",
          subject_local_observation_id: "project_test_busway",
          object_local_observation_id: "route_b44_sbs",
        },
        evidence_refs: [evidenceRef(sourceA)],
      }),
    ]);

    const matching = records.filter(
      (record) => record.record_kind === "relation" && record.payload.relation_kind === "serves_route" && record.payload.subject_id === "project_test-busway" && record.payload.object_id === "route_b44-sbs",
    );

    expect(matching).toHaveLength(1);
    expect(matching[0]?.payload.derived_relation).toBeUndefined();
  });
});
