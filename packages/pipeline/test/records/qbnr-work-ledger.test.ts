import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  summarizeQbnrWorkLedger,
  type QbnrWorkLedgerAccountingUnit,
} from "@mta-wiki/pipeline/records/qbnr-work-ledger";

describe("QBNR work-ledger accounting", () => {
  it("removes reviewed terminal service ends from remaining change work", () => {
    const units: QbnrWorkLedgerAccountingUnit[] = [
      { event_kind: "no_change", work_status: "terminal_no_change" },
      { event_kind: "service_change", work_status: "completed_occurrence" },
      { event_kind: "service_end", work_status: "terminal_service_end" },
      { event_kind: "service_end", work_status: "pending_canonical_then_terminal" },
      { event_kind: "service_start", work_status: "pending_create_route" },
    ];

    expect(summarizeQbnrWorkLedger(units)).toEqual({
      actionable_change_unit_count: 4,
      explicit_no_change_unit_count: 1,
      completed_occurrence_unit_count: 1,
      terminal_service_end_unit_count: 1,
      remaining_change_unit_count: 2,
      projectable_pending_unit_count: 1,
      canonical_then_terminal_pending_unit_count: 1,
      counts_by_status: {
        completed_occurrence: 1,
        pending_canonical_then_terminal: 1,
        pending_create_route: 1,
        terminal_no_change: 1,
        terminal_service_end: 1,
      },
    });
  });

  it("rejects terminal_service_end on a non-service-end unit", () => {
    expect(() => summarizeQbnrWorkLedger([
      { event_kind: "service_change", work_status: "terminal_service_end" },
    ])).toThrow("terminal_service_end is valid only for a service_end work unit");
  });

  it("closes all six corpus service-end units after reviewed recovery", () => {
    const ledgerPath = join(
      repoRoot,
      "data/operational-anchor-review/work-orders/qbnr-2025/route-units.jsonl",
    );
    const units = readFileSync(ledgerPath, "utf8")
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as QbnrWorkLedgerAccountingUnit & {
        route_label: string;
        canonical_route_record_id: string | null;
        gtfs_route_id: string | null;
        occurrence_id: string | null;
      });
    const serviceEnds = units.filter((unit) => unit.event_kind === "service_end");
    const accounting = summarizeQbnrWorkLedger(units);

    expect(serviceEnds).toHaveLength(6);
    expect(new Set(serviceEnds.map((unit) => unit.work_status))).toEqual(
      new Set(["terminal_service_end"]),
    );
    expect(accounting.terminal_service_end_unit_count).toBe(6);
    expect(accounting.canonical_then_terminal_pending_unit_count).toBe(0);
    expect(accounting.completed_occurrence_unit_count).toBe(121);
    expect(accounting.projectable_pending_unit_count).toBe(0);
    expect(accounting.remaining_change_unit_count).toBe(0);
    expect(accounting.counts_by_status).toEqual({
      completed_occurrence: 121,
      terminal_no_change: 3,
      terminal_service_end: 6,
    });
    expect(units.find((unit) => unit.route_label === "Q52")).toMatchObject({
      canonical_route_record_id: "route_q52-sbs-queens",
      gtfs_route_id: "Q52+",
      occurrence_id: "occurrence:70956fca3524ebf56de16ef4",
      work_status: "completed_occurrence",
    });
  });
});
