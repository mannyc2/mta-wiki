import { describe, expect, it } from "bun:test";
import {
  preparePublicKeyMigration,
} from "@mta-wiki/pipeline/materialize/resolved-transit-public-keys";

describe("resolved transit public key registry", () => {
  it("prepares a complete lossless migration with explicit subject arithmetic", () => {
    const migration = preparePublicKeyMigration({
      asOfDate: "2026-07-27",
      generatorCommit: "fixture-commit",
    });
    expect(migration.eligible_subject_count).toBe(
      migration.existing_live_key_count +
      migration.newly_established_losslessly +
      migration.newly_established_from_accepted_review +
      migration.requires_review_count,
    );
    expect(migration.requires_review_count).toBe(0);
    expect(migration.proposed_operations.every((row) =>
      row.establishment_method === "lossless_migration" && row.decision_id === null
    )).toBe(true);
    expect(new Set(migration.proposed_operations.map((row) =>
      `${row.key_kind}|${row.subject_id}`
    )).size).toBe(migration.proposed_operations.length);
  });
});
