// A3: export-jsonl --verify parity logic (the validation campaign's per-wave DB↔JSONL gate).

import { describe, expect, it } from "bun:test";
import { verifyCanonicalJsonlParity } from "@mta-wiki/pipeline/materialize/export-jsonl";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";

function record(id: string, extra: Partial<MtaCanonicalRecord> = {}): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: "route",
    source_id: "src1",
    local_observation_id: id,
    display_name: id,
    payload: {},
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-06-10T00:00:00.000Z",
    ...extra,
  };
}

describe("verifyCanonicalJsonlParity", () => {
  it("passes when DB and JSONL hold identical records (order-independent)", () => {
    const db = [record("r_a"), record("r_b")];
    const jsonl = [record("r_b"), record("r_a")];
    const result = verifyCanonicalJsonlParity({ db, jsonl });
    expect(result.ok).toBe(true);
    expect(result.recordCount).toBe(2);
    expect(result.issues).toEqual([]);
  });

  it("flags records present on only one side", () => {
    const result = verifyCanonicalJsonlParity({ db: [record("r_a"), record("r_b")], jsonl: [record("r_a")] });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes("only in DB: r_b"))).toBe(true);
  });

  it("flags a record whose content differs between DB and JSONL", () => {
    const result = verifyCanonicalJsonlParity({
      db: [record("r_a", { display_name: "From DB" })],
      jsonl: [record("r_a", { display_name: "From JSONL" })],
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("record differs: r_a");
  });
});
