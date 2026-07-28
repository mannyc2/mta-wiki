export type PublicDisplayReconciliationRow = {
  schema_version: 1;
  subject_kind: "episode" | "route" | "treatment_family" | "source" | "component" | "placement";
  subject_id: string;
  disposition: "resolved" | "requires_review" | "not_public";
  reason_code: string;
};

export function summarizePublicDisplayReconciliation(
  rows: readonly PublicDisplayReconciliationRow[],
): Record<string, number> {
  const result = { resolved: 0, requires_review: 0, not_public: 0 };
  for (const row of rows) result[row.disposition] += 1;
  return result;
}
