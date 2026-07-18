# Operational-integrity plan reconciliation (Plans 026–035)

This table reconciles the July 12 runbooks against merged
`origin/main` at
`299752f2e9c7696296b29b1bcefbb5f454cb1699` and the authorized July 18
implementation branch. A row is satisfied only by its required outcome; newer
code or a stale README label is not evidence by itself.

| Plan | Required outcome | Exact evidence | Reconciled state |
|---|---|---|---|
| 026 | Clean, reproducible tracked baseline | Canonical DB reader import repaired at `37d9e4ab`; committed tree contains no NUL bytes; `data/exports/releases/LATEST` is exact `v1-rc5\n`; current AGENTS contract does not reference the retired harness path. | SATISFIED on merged main; no replay of the stale cleanup sequence. |
| 027 | Opt-in release promotion and guarded pointer reads | `packages/pipeline/src/materialize/export-release.ts` updates `LATEST` only with `setLatest`; `docs/releases-and-provenance.md` documents promotion/canary semantics; `packages/pipeline/src/validate.ts` and `packages/pipeline/test/validate.test.ts` cover dangling release pointers. | SATISFIED; July 18 adds the missing normal-validation regression. |
| 028 | Unique source registry and permanent collision/reference lanes | Current canonical source population is 2,584 unique records. `packages/pipeline/src/validate.ts` has `duplicate_source_id`, `source_record_collision_suffix`, and `unresolved_source_reference` lanes with adversarial tests; normal validation reports zero issues. | SATISFIED by current data plus tested permanent lanes. |
| 029 | Honest funnel, entry-gate accounting, and downstream-pin coverage | `packages/pipeline/src/materialize/operational-anchors.ts`, `operational-occurrences.ts`, and `packages/pipeline/src/quality/operational-coverage.ts` keep broad/reviewed/distinct populations separate, expose entry-gate exclusions, avoid bundle attrition, and read the explicit downstream pin. Generated evidence is under `data/quality/operational-coverage/`. | SATISFIED; current generated matrix is the durable evidence. |
| 030 | Exhaust the priority recovery ledger with evidence-backed terminal states | Merged recovery campaign begins at `44bfce93` and includes reviewed proposal/journal/apply and QBNR occurrence commits through `8fa94aac`. July 18 deterministic closure adds three receipt/evidence-backed `not_applicable` decisions. Regenerated ledger: 2,930 gaps, 492 priority rows, 0 open, 492 terminal. | SATISFIED without a new provider-backed run. |
| 031 | Accepted reconciliation and post-event-safe effective eligibility | Persistent reviewed occurrence decisions and identity registry preserve document-time anchors while only accepted, evidence-backed realized occurrences enter the effective layer. The reviewed occurrence corpus from `c5834836` through `8fa94aac` and later acquisition commits implements the required outcome without the stale proposed mechanics. | SATISFIED AS SUPERSEDED; exact anchor-v1 history remains unchanged. |
| 032 | Production occurrence contract, persistent IDs, plural routes/bundles, strict release support | Manifest-v3/occurrence-v1 landed at `c5834836`; manifest-v4, occurrence-v2, relationship-integrity bundle, strict serializers, release fixture, and full verifier hardening landed from `2aee96ce` through `443e6e34`. | SATISFIED AND SUPERSEDED by the stricter manifest-v5 route-identity foundation; legacy decoders remain. |
| 033 | Acquire and curate at least one official in-window candidate-ready occurrence | Official in-window recoveries include Flatbush Phase 1 (`44f0c888`), May 2025 ACE cohorts (`6099c03b`), and December 2025 ACE warning cohort (`35984e9d`), all with accepted occurrence projections. | SATISFIED on merged main; no synthetic occurrence or new provider spend needed. |
| 034 | Strict consumer support, deterministic producer cut, pinned read-only replay, and truthful in-window downstream review material | Reconciled runbook: `plans/034-delivery-cutover-and-acceptance.md`. Final release, replay, review-artifact, commit, and PR receipts are populated only after verification. | IN EXECUTION. |
| 035 | Official exact-route snapshot, complete binding review, manifest-v5/full verifier, quarantine, Tracker migration | Authenticated external runbook SHA-256 `8eb7547d10fc0a21f2f8769d1e0d6f00059364f732fafaa1a2e5e42c9939396f`; selected snapshot `mta-bus-2026-07-18-route-provenance-v1`; manifest SHA-256 `aee23d3178f1ae6040b5687a76d156f01f89530b807f8b9865f22fca1c9c09c9`; accepted binding receipt SHA-256 `2655022038d6f72c44ce8c76ac75887a880510f34779835ca0ee6d4c98d376e6`. | IN EXECUTION until named release and cross-repository replay are complete. |

## Final receipt fields

The completion update must add:

- corrected immutable release ID/path, generator commit, manifest SHA, complete
  relative-path/SHA tree, and independent reproduction result;
- manifest and contract versions plus route-identity, route-anchor, occurrence,
  review, relationship, and quality-report hashes/counts;
- rc22/rc23 quarantine status and rc23 replacement ID after all gates;
- Tracker branch/commit/PR/merge state, exact replay commands and inputs,
  route-evidence/candidate/review hashes, and B44/B44+ assertions;
- producer and Tracker full gate results;
- proof that `LATEST` stayed exact `v1-rc5\n`, every pre-existing immutable
  release hash stayed unchanged, and no approval/publication/deployment occurred.
