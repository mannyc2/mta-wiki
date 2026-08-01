import { describe, expect, it } from "bun:test";
import {
  checkPublicKeyRegistry,
  interventionComponentPublicKey,
  preparePublicKeyMigration,
  publicKeyEstablishOperation,
  publicKeyRedirectOperation,
  publicKeySupersedeOperation,
  reconcilePublicKeyMigration,
  replayPublicKeyOperations,
  resolvePublicKeySubject,
  type PublicKeyProposal,
} from "@mta-wiki/pipeline/materialize/resolved-transit-public-keys";

describe("resolved transit public key registry", () => {
  it("publishes no live key containing an unknown placeholder", () => {
    expect(checkPublicKeyRegistry("2026-07-27")).toMatchObject({
      eligible: 681,
      live: 681,
    });
  });

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

  it("preserves a component key when reviewed action and extent claims change", () => {
    const immutableKey = interventionComponentPublicKey({
      route_key: "q1",
      treatment_family_key: "bus-lane",
      application_id: "application:0123456789abcdef01234567",
    });
    expect(immutableKey).toBe("q1-bus-lane-component-0123456789abcdef01234567");
    expect(immutableKey).not.toContain("unknown");
    const original: PublicKeyProposal = {
      key_kind: "intervention_component",
      subject_id: "application:0123456789abcdef01234567",
      owner_intervention_id: "occurrence:0123456789abcdef01234567",
      public_key: immutableKey,
      establishment_method: "lossless_migration",
      decision_id: null,
      proposal_basis: {
        durable_application_id: "application:0123456789abcdef01234567",
        route_key: "q1",
        treatment_family_key: "bus-lane",
      },
    };
    const refined: PublicKeyProposal = {
      ...original,
    };
    const establishment = publicKeyEstablishOperation(original);
    const migration = reconcilePublicKeyMigration({
      existing_operations: [establishment],
      proposals: [refined],
      input_fingerprint: "fixture-refined-input",
      asOfDate: "2026-07-29",
      generatorCommit: "fixture-commit",
    });
    expect(migration.existing_live_key_count).toBe(1);
    expect(migration.proposed_operations).toEqual([]);
    expect(migration.requires_review).toEqual([]);
    expect(
      resolvePublicKeySubject(
        replayPublicKeyOperations([establishment]),
        original.key_kind,
        original.subject_id,
      )?.public_key,
    ).toBe(original.public_key);

    const supersession = publicKeySupersedeOperation({
      key_kind: original.key_kind,
      subject_id: original.subject_id,
      prior_public_key: original.public_key,
      public_key: "q1-bus-lane-component-aaaaaaaaaaaaaaaaaaaaaaaa",
      decision_id: "display:accepted-key-supersession",
      issued_at: "2026-07-29T00:00:00Z",
      rationale: "Remove mutable placeholders from the live presentation key.",
    });
    const renamed = resolvePublicKeySubject(
      replayPublicKeyOperations([establishment, supersession]),
      original.key_kind,
      original.subject_id,
    );
    expect(renamed?.public_key).toBe("q1-bus-lane-component-aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(renamed?.public_key_aliases).toContain(original.public_key);

    const stale = publicKeySupersedeOperation({
      key_kind: original.key_kind,
      subject_id: original.subject_id,
      prior_public_key: "another-prior-key",
      public_key: "third-presentation-key",
      decision_id: "display:stale-key-supersession",
      issued_at: "2026-07-29T01:00:00Z",
      rationale: "Invalid stale key mutation.",
    });
    expect(() => replayPublicKeyOperations([
      establishment,
      supersession,
      stale,
    ])).toThrow("stale prior public key");
  });

  it("preserves a placement key when its current claim is corrected append-only", () => {
    const original: PublicKeyProposal = {
      key_kind: "placement",
      subject_id: "placement:0123456789abcdef01234567",
      owner_intervention_id: null,
      public_key: "q1-bus-lane-route-wide",
      establishment_method: "accepted_review",
      decision_id: "placement:reviewed-establishment",
      proposal_basis: {
        route_key: "q1",
        treatment_family_key: "bus-lane",
        scope_kind: "route_wide",
      },
    };
    const corrected: PublicKeyProposal = {
      ...original,
      public_key: "q1-bus-lane-bounded-segment-corridor-one",
      proposal_basis: {
        ...original.proposal_basis,
        scope_kind: "bounded_segment",
      },
    };
    const establishment = publicKeyEstablishOperation(original);
    const migration = reconcilePublicKeyMigration({
      existing_operations: [establishment],
      proposals: [corrected],
      input_fingerprint: "fixture-corrected-placement-claim",
      asOfDate: "2026-07-29",
      generatorCommit: "fixture-commit",
    });
    expect(migration.proposed_operations).toEqual([]);
    expect(resolvePublicKeySubject(
      replayPublicKeyOperations([establishment]),
      "placement",
      original.subject_id,
    )?.public_key).toBe(original.public_key);
  });

  it("retains accepted subject redirects and key aliases while rejecting cyclic or duplicate ownership", () => {
    const oldProposal: PublicKeyProposal = {
      key_kind: "intervention_component",
      subject_id: "application:aaaaaaaaaaaaaaaaaaaaaaaa",
      owner_intervention_id: "occurrence:0123456789abcdef01234567",
      public_key: "q1-bus-lane-old",
      establishment_method: "accepted_review",
      decision_id: "display:old",
      proposal_basis: { reviewed_key: "q1-bus-lane-old" },
    };
    const newProposal: PublicKeyProposal = {
      ...oldProposal,
      subject_id: "application:bbbbbbbbbbbbbbbbbbbbbbbb",
      public_key: "q1-bus-lane-current",
      decision_id: "display:current",
      proposal_basis: { reviewed_key: "q1-bus-lane-current" },
    };
    const oldEstablish = publicKeyEstablishOperation(oldProposal);
    const newEstablish = publicKeyEstablishOperation(newProposal);
    const redirect = publicKeyRedirectOperation({
      key_kind: "intervention_component",
      subject_id: oldProposal.subject_id,
      redirect_subject_id: newProposal.subject_id,
      decision_id: "display:subject-redirect",
      issued_at: "2026-07-29T00:00:00Z",
      rationale: "Accepted same-component lineage.",
    });
    const registry = replayPublicKeyOperations([
      oldEstablish,
      newEstablish,
      redirect,
    ]);
    const resolved = resolvePublicKeySubject(
      registry,
      "intervention_component",
      oldProposal.subject_id,
    );
    expect(resolved?.subject_id).toBe(newProposal.subject_id);
    expect(resolved?.public_key_aliases).toContain(oldProposal.public_key);

    const cycle = publicKeyRedirectOperation({
      key_kind: "intervention_component",
      subject_id: newProposal.subject_id,
      redirect_subject_id: oldProposal.subject_id,
      decision_id: "display:cycle",
      issued_at: "2026-07-29T01:00:00Z",
      rationale: "Invalid reverse redirect.",
    });
    expect(() => replayPublicKeyOperations([
      oldEstablish,
      newEstablish,
      redirect,
      cycle,
    ])).toThrow("cyclic redirect target");

    const duplicateRouteA = publicKeyEstablishOperation({
      key_kind: "route",
      subject_id: "route_a",
      owner_intervention_id: null,
      public_key: "q1",
      establishment_method: "lossless_migration",
      decision_id: null,
      proposal_basis: { gtfs_route_id: "Q1" },
    });
    const duplicateRouteB = publicKeyEstablishOperation({
      key_kind: "route",
      subject_id: "route_b",
      owner_intervention_id: null,
      public_key: "q1",
      establishment_method: "lossless_migration",
      decision_id: null,
      proposal_basis: { gtfs_route_id: "Q1" },
    });
    expect(() => replayPublicKeyOperations([
      duplicateRouteA,
      duplicateRouteB,
    ])).toThrow("duplicate public key owner");
  });
});
