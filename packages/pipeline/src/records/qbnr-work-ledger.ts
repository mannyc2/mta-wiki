export const qbnrWorkStatuses = [
  "completed_occurrence",
  "pending_canonical_then_terminal",
  "pending_create_route",
  "pending_existing_anchor",
  "pending_identity_exception",
  "partial_occurrence_needs_enrichment",
  "terminal_no_change",
  "terminal_service_end",
] as const;

export type QbnrWorkStatus = (typeof qbnrWorkStatuses)[number];

export type QbnrWorkLedgerAccountingUnit = {
  event_kind: string;
  work_status: QbnrWorkStatus;
};

export type QbnrWorkLedgerAccounting = {
  actionable_change_unit_count: number;
  explicit_no_change_unit_count: number;
  completed_occurrence_unit_count: number;
  terminal_service_end_unit_count: number;
  remaining_change_unit_count: number;
  projectable_pending_unit_count: number;
  canonical_then_terminal_pending_unit_count: number;
  counts_by_status: Record<string, number>;
};

const projectablePendingStatuses = new Set<QbnrWorkStatus>([
  "partial_occurrence_needs_enrichment",
  "pending_existing_anchor",
  "pending_create_route",
  "pending_identity_exception",
]);

export function summarizeQbnrWorkLedger(
  units: readonly QbnrWorkLedgerAccountingUnit[],
): QbnrWorkLedgerAccounting {
  for (const unit of units) {
    if (unit.work_status === "terminal_service_end" && unit.event_kind !== "service_end") {
      throw new Error("terminal_service_end is valid only for a service_end work unit");
    }
  }

  const countsByStatus = Object.fromEntries(
    [...new Set(units.map((unit) => unit.work_status))]
      .sort()
      .map((status) => [status, units.filter((unit) => unit.work_status === status).length]),
  );
  const changeUnits = units.filter((unit) => unit.event_kind !== "no_change");
  const completedOccurrenceUnitCount = changeUnits.filter(
    (unit) => unit.work_status === "completed_occurrence",
  ).length;
  const terminalServiceEndUnitCount = changeUnits.filter(
    (unit) => unit.work_status === "terminal_service_end",
  ).length;
  const remainingChangeUnitCount = changeUnits.length
    - completedOccurrenceUnitCount
    - terminalServiceEndUnitCount;

  return {
    actionable_change_unit_count: changeUnits.length,
    explicit_no_change_unit_count: units.filter((unit) => unit.event_kind === "no_change").length,
    completed_occurrence_unit_count: completedOccurrenceUnitCount,
    terminal_service_end_unit_count: terminalServiceEndUnitCount,
    remaining_change_unit_count: remainingChangeUnitCount,
    projectable_pending_unit_count: units.filter((unit) => projectablePendingStatuses.has(unit.work_status)).length,
    canonical_then_terminal_pending_unit_count: units.filter(
      (unit) => unit.work_status === "pending_canonical_then_terminal",
    ).length,
    counts_by_status: countsByStatus,
  };
}
