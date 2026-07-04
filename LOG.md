# MTA Wiki Changelog

This file is the compact durable history for the public repository. Keep it changelog-sized:
record release milestones, public data-contract changes, owner decisions that affect publication,
and active caveats. Do not use it as a transcript, run log, or plan archive.

## 2026-07-04

### Bounded Writer Full-Slice Batch 02

- Plan 012 full-slice batch 02 filled another `50` route/corridor writer regions, bringing the
  post-sample full-slice total to `100` pages. Actual usage including verifier-failed attempts:
  `50` writer runs, `357` provider requests, `14206261` input tokens, `258561` output tokens,
  `38142773` cache-read tokens, `52607595` total tokens, estimated cost `$1.472338`.
- STOPs handled before commit: value-as-label metric primitives on the Broadway Queens, Harlem
  Line, and DeKalb Avenue pages; one malformed DeKalb metric primitive with an extra label pipe;
  and review cleanup for source-specific political wording plus dataset/cardinality language.
- Batch review found `50` modified wiki pages, `0` validation issues, and no modified writer
  headings, bullet lists, bad `cite:` targets, or lingering flagged review terms.
- Batch gates passed: `bun run typecheck`; `bun run test` (`961 pass`, `1 skip`, `0 fail`);
  `bun run validate` with `Issues: 0`; and `bun scripts/determinism-anchor.ts` with combined
  hash `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### Bounded Writer Full-Slice Batch 03

- Plan 012 full-slice batch 03 filled another `50` route/corridor writer regions, bringing the
  post-sample full-slice total to `150` pages. Actual usage including one failed BM2 attempt and
  retry: `51` writer runs, `355` provider requests, `13824915` input tokens, `218806` output
  tokens, `36761039` cache-read tokens, `50804760` total tokens, estimated cost `$1.426253`.
- STOPs handled before commit: an empty BM2 write rejected for missing citations and rerun cleanly;
  value-as-label metric primitives on Stationary Bronx and Better Buses pages; one internal
  frontmatter/payload wording cleanup; one range-like cite cleanup; one stationary/ABLE metric
  mismatch on Stationary Brooklyn; and one Bx17 corridor-benefit overclaim tightened to context.
- Generated a review note for the West 181st Street table/narrative completion-date conflict.
- Batch review found `50` modified wiki pages, `0` validation issues, and no modified writer
  headings, bullet lists, bad `cite:` targets, range-like cite targets, or lingering flagged
  internal/review terms.
- Batch gates passed: `bun run typecheck`; `bun run test` (`961 pass`, `1 skip`, `0 fail`);
  `bun run validate` with `Issues: 0`; and `bun scripts/determinism-anchor.ts` with combined
  hash `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### Bounded Writer Full-Slice Batch 04

- Plan 012 full-slice batch 04 filled another `50` route/corridor writer regions, bringing the
  post-sample full-slice total to `200` pages. Actual usage: `50` writer runs, `333` provider
  requests, `10574342` input tokens, `179704` output tokens, `28504861` cache-read tokens,
  `39258907` total tokens, estimated cost `$1.093375`.
- STOPs handled before commit: primitive-label verifier failures on Manhattan Avenue CB9,
  Kings Highway Bay Pkwy-Ocean Ave, and Lower Montauk Branch; two source-facing wording cleanups
  for Streets Plan administration phrasing; one LIRR county-scope prose cleanup; one M79
  range-like citation cleanup; and one New Haven Line farebox unit-scale wording cleanup.
- Generated review notes for the LIRR county-zone scope mismatch and New Haven Line farebox
  revenue scale ambiguity.
- Batch review found `50` modified wiki pages, `0` writer-edit/citation issues across `470`
  citations, and no modified writer headings, bullet lists, bad `cite:` targets, range-like cite
  targets, or lingering flagged internal/review terms.
- Batch gates passed: `bun run typecheck`; `bun run test` (`961 pass`, `1 skip`, `0 fail`);
  `bun run validate` with `Issues: 0`; and `bun scripts/determinism-anchor.ts` with combined
  hash `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### Bounded Writer Full-Slice Batch 05

- Plan 012 full-slice batch 05 filled another `50` route/corridor writer regions, bringing the
  post-sample full-slice total to `250` pages. Actual usage: `50` writer runs, `329` provider
  requests, `7338567` input tokens, `170465` output tokens, `22883167` cache-read tokens,
  `30392199` total tokens, estimated cost `$0.767950`.
- STOPs handled before commit: primitive-label verifier failures on Jamaica Avenue, Van Sinderen
  Av/Fulton St, and Park Avenue Sector 2; one Church Avenue local/SBS scope wording cleanup.
- Batch review found `50` modified wiki pages, `0` writer-edit/citation issues across `370`
  citations, and no modified writer headings, bullet lists, bad `cite:` targets, range-like cite
  targets, or lingering flagged internal/review terms.
- Batch gates passed: `bun run typecheck`; `bun run test` (`961` pass, `1` skip,
  `0` fail); `bun run validate` with `Issues: 0`; and
  `bun scripts/determinism-anchor.ts` with combined hash
  `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### Bounded Writer Full-Slice Batch 06

- Plan 012 full-slice batch 06 filled another `50` route/corridor writer regions, bringing the
  post-sample full-slice total to `300` pages; `186` route/corridor writer pages remain empty.
  Actual usage: `50` writer runs, `309` provider requests, `11140758` input tokens, `204816`
  output tokens, `29640488` cache-read tokens, `40986062` total tokens, estimated cost
  `$1.155039`.
- STOPs handled before commit: value-as-label metric primitives on the Q35 Flatbush, SIM24
  Madison Avenue, B14, BM4, and M4 pages; range-like Bx3 citation handles; and internal
  `frontmatter`/`payload`/`packet` wording on M subway and B9 pages.
- Batch review found `50` modified wiki pages, `0` writer-edit/citation issues across `411`
  citations, and no modified writer headings, bullet lists, bad `cite:` targets, range-like cite
  targets, value-like metric labels, or lingering flagged internal/review terms.
- Added a review note for S78 customer-satisfaction metric evidence precision and an S46/S96
  fare-free-pilot map label inconsistency.
- Batch gates passed: `bun run typecheck`; `bun run test` (`961` pass, `1` skip,
  `0` fail); `bun run validate` with `Issues: 0`; and
  `bun scripts/determinism-anchor.ts` with combined hash
  `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### Bounded Writer Full-Slice Batch 07

- Plan 012 full-slice batch 07 filled another `50` route/corridor writer regions, bringing the
  post-sample full-slice total to `350` pages; `136` route/corridor writer pages remain empty.
  Actual usage: `50` writer runs, `342` provider requests, `13472028` input tokens, `211344`
  output tokens, `32042357` cache-read tokens, `45725729` total tokens, estimated cost
  `$1.389472`.
- STOPs handled before commit: value-as-label metric primitives on the Bx23 page; one range-like
  Bay Parkway/Cropsey Avenue citation target; one internal `packet` wording cleanup; one scanner
  false-positive around Avenue I wording; and source-time rewrites for ACE warning-period prose.
- Batch review found `50` modified wiki pages, `0` writer-edit/citation issues across `386`
  citations, and no modified writer headings, bullet lists, bad `cite:` targets, range-like cite
  targets, value-like metric labels, or lingering flagged internal/review terms.
- Added a review note for coarse ACE page-level evidence granularity and thin route-specific
  evidence on LGA/Bee-Line route pages.
- Batch gates passed: `bun run typecheck`; `bun run test` (`961` pass, `1` skip,
  `0` fail); `bun run validate` with `Issues: 0`; and
  `bun scripts/determinism-anchor.ts` with combined hash
  `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### Bounded Writer Full-Slice Batch 08

- Plan 012 full-slice batch 08 filled another `50` route/corridor writer regions, bringing the
  post-sample full-slice total to `400` pages; `86` route/corridor writer pages remain empty.
  Actual usage: `50` writer runs, `330` provider requests, `11148984` input tokens, `184994`
  output tokens, `25480449` cache-read tokens, `36814427` total tokens, estimated cost
  `$1.151897`.
- STOPs handled before commit: value-as-label metric primitives on the B17, S Shuttle, SIM1C,
  and Staten Island express bus pages; one S53 outside-writer-region duplicate-marker repair;
  Q8 value-only metric labels; and internal/temporal/source-scope wording on M35, X51, Bx2,
  Q80, SIM4C, QM10, and X64.
- Batch review found `50` modified wiki pages, `0` writer-edit/citation issues across `396`
  citations, and no modified writer headings, bullet lists, bad `cite:` targets, range-like cite
  targets, value-like metric labels, temporal live-status terms, or lingering flagged
  internal/review terms.
- Added a review note for coarse ACE page-level evidence, historical QBB aggregate/survey scope,
  and OCR table/figure precision caveats.
- Batch gates passed: `bun run typecheck`; `bun run test` (`961` pass, `1` skip,
  `0` fail); `bun run validate` with `Issues: 0`; and
  `bun scripts/determinism-anchor.ts` with combined hash
  `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

## 2026-07-03

### Remaining Plan Approval

- Owner approved LLM spend for the remaining post-v1 plans in this conversation: "I give you
  permission for the llm spend."
- Owner also approved proceeding through owner gates in this conversation: "its not owner gated i
  give you permission"

### Bounded Writer Pass Spend Gate

- Plan 012 Step 1 sample spend is approved under the two owner approvals above. The writer design
  requires inline primitives for known records (`route`, `corridor`, `project`, `entity`,
  `metric`) and `cite` primitives for source blocks; every factual sentence needs a direct
  `[[cite:source_id#block_id|label]]`, pages should stay around `150-400` words, and structured
  facts/numeric values remain ids-only rather than prose-owned.
- Deterministic 20-page sample, seed `v1-writer-sample`: `corridor_avenue-a-d-manhattan-bus-lanes`,
  `corridor_bay-pkwy`, `corridor_bus-fwd-2-brooklyn-access-jfk-sbs`,
  `corridor_bus-fwd-2-flushing-springfield-sbs`, `corridor_hillside-ave-brt-phase2`,
  `corridor_meeting-doc-109341-montauk-branch-amityville-babylon`,
  `corridor_meeting-doc-151786-harlem-line`, `corridor_mnr-zone2-ct-135311`,
  `corridor_university-ave`, `corridor_verrazzano-narrows-bridge`, `route_bx18a-b`,
  `route_fordham-pelham-pkwy-sbs`, `route_hylan-blvd-sbs`, `route_m186726-waterbury-branch`,
  `route_m23-local-cb4-apr2016`, `route_meeting-doc-152171-42-st-shuttle`,
  `route_meeting-doc-42866-n-subway`, `route_q-subway-nyct-2025`, `route_q26-lga-2012`,
  `route_q51-queens`.
- Dry token estimate used a 2-page packet count on Pioneer DeepSeek V4 Flash (`$0.10/M input`,
  `$0.20/M output`): average `137172` input tokens/page. The 20-page sample estimate is
  `2743440` input tokens plus a `24000` output-token allowance, about `$0.279144`. The currently
  empty route/corridor slice (`506` pages) extrapolates to about `$7.062343` before retries.
- No live Plan 012 provider call has run yet; current work is prompt, packet, and runner prep.

### Bounded Writer Runner Prep

- Added explicit-page writer packet generation for the recorded Plan 012 sample and a safe
  `write-writer-packet` runner that accepts one one-page packet, uses only curated writer tools
  plus repository-local read tools, and verifies writer-region/citation gates after the model run.
- Updated writer citation verification to accept `[[cite:source_id#block_id|label]]` primitives
  while preserving legacy `[source_id#block_id]` support. Dry-run proof completed for
  `wiki/corridors/corridor_avenue-a-d-manhattan-bus-lanes.md` with Pioneer DeepSeek V4 Flash;
  no live Plan 012 provider call has run yet.
- Runner prep gates passed: `bun run typecheck`; `bun run test` (`956 pass`, `1 skip`,
  `0 fail`); `bun run validate` with `Issues: 0`; and `bun scripts/determinism-anchor.ts` with
  combined hash `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### Bounded Writer Sample

- Plan 012 live sample ran the recorded 20 route/corridor pages with Pioneer DeepSeek V4 Flash.
  Including rejected/retried attempts and the Q26 repair rerun, transcript usage totals were
  `31` runs, `182` provider requests, `6433917` input tokens, `89055` output tokens,
  `12773601` cache-read tokens, `19296573` total tokens, and estimated cost `$0.661203`.
- The sample exposed a validator gap: legacy/bare writer wikilinks such as
  `[[treatment_bus-lanes-2012|Offset Bus Lanes]]` were not parsed as primitives, so they could
  slip past dangling-link validation. Added `invalid_writer_primitive_syntax` validation for
  unsupported `[[...]]` links and narrowed the one-page writer prompt to allow-list-only record
  primitives; Q26 was cleared and rerun through the hardened runner.
- Final sample self-review found `0` unsupported writer links, `0` uncited paragraphs, and `0`
  heading/bullet lines across the 20 writer regions. `bun run materialize` rebuilt the local DB
  after ignored artifact cleanup; `bun run validate` passed with `Issues: 0`.
- Full-gate testing also exposed timestamp collisions in writer/post-ingest artifacts created
  back-to-back; timestamped writer backlog, packet, dispatch, claim, handoff, and coverage paths
  now allocate a suffix instead of overwriting same-timestamp JSON/Markdown/directory pairs.
- Disk caveat: `/mnt/models` reached 100% while `.git-archive` remains preserved per the Plan
  009 owner decision. Only ignored deterministic/runner artifacts were removed
  (`data/canonical.db` rebuilt by materialize; stale `data/post-ingest` files deleted).
- Checkpoint gates passed: `bun run typecheck`; `bun run test` (`959 pass`, `1 skip`,
  `0 fail`); `bun run validate` with `Issues: 0`; and `bun scripts/determinism-anchor.ts`
  with combined hash `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### Local History Archive Relocation

- To continue Plan 012 after `/mnt/models` reached 100% disk use, preserved the retired
  history archive by moving `.git-archive` to `/home/cjpher/mta-wiki-git-archive` and leaving
  `.git-archive` as an ignored symlink. The archive was not deleted.

### Bounded Writer Full-Slice Budget

- After the live 20-page sample, the remaining route/corridor backlog is `486` empty pages.
  The sample's all-in cost including rejected attempts was `$0.661203`; the hardened successful
  run rate projects the remaining slice in roughly the `$10-$17` range depending on tool turns
  and retries. Under the owner's open LLM-spend approval in this conversation, proceed with a
  conservative Plan 012 operational budget of `$20` total spend and stop/report if actual spend
  reaches `$24` before completion.

### Bounded Writer Full-Slice Batch 01

- Plan 012 full-slice batch 01 filled `50` route/corridor writer regions after the 20-page
  sample. Actual usage including rejected/empty attempts: `53` writer runs, `298` provider
  requests, `10944266` input tokens, `221676` output tokens, `32964299` cache-read tokens,
  `44130241` total tokens, estimated cost `$1.138762`.
- STOPs handled before commit: malformed metric-as-citation primitives; an uncited paragraph;
  an unsupported map-derived distance estimate; two empty writer-region attempts; and review
  cleanup for off-scope dataset/cardinality or corridor metrics. The writer tool now rejects
  malformed primitives and uncited paragraphs before writing.
- Batch review found `50` modified wiki pages, `0` validation issues, and no modified writer
  headings, bullet lists, bad `cite:` targets, or lingering flagged review terms.
- Batch gates passed: `bun run typecheck`; `bun run test` (`961 pass`, `1 skip`, `0 fail`);
  `bun run validate` with `Issues: 0`; and `bun scripts/determinism-anchor.ts` with combined
  hash `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### V2 Extract Pilot Spend Gate

- Owner approval for Plan 014 provider spend, recorded verbatim: "I give you permission for the
  llm spend."
- Plan 014 10-source pilot estimate used Pioneer DeepSeek V4 Flash (`$0.10/M input`,
  `$0.20/M output`) and the vendored DeepSeek tokenizer on the first 10 replay-manifest prompts:
  `223452` input tokens total, `22345` average input tokens/source, estimated input cost
  `$0.022345`. With output allowances of `2000`, `5000`, or `10000` tokens/source, estimated
  10-source pilot cost is `$0.026345`, `$0.032345`, or `$0.042345` respectively before retries.

### V2 Extract Stage Local Implementation

- Plan 014 Steps 1-3 landed locally: a deterministic prompt-embedded final-schema extraction
  contract, a replay-only `extract` CLI path that writes under `data/replay/runs/<run_id>/`,
  boundary validation with enum-miss review handling, and deterministic anchor matching against
  existing canonical ids/aliases/do-not-merge pairs.
- Mocked CLI verification passed for `14th_street_busway_brochure`: `accepted=1`, `review=0`,
  `enum_misses=0`, with no live provider call and no writes to `data/submissions/` or
  `data/canonical/`.
- Plan 014 code gates passed before pilot: `bun run typecheck`; `bun run test` (`945 pass`,
  `1 skip`, `0 fail`); `bun run validate` with `Issues: 0`; and
  `bun scripts/determinism-anchor.ts` with combined hash
  `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### V2 Extract Pilot Stop

- Plan 014 Step 4 ran the owner-approved 10-source pilot as `v2-extract-pilot-20260703`
  with Pioneer DeepSeek V4 Flash. Actual usage: `10` requests, `224642` input tokens,
  `183696` output tokens, `408338` total tokens, estimated cost `$0.059203`.
- Corrected the replay evaluator with an `--actual-only` scope so pilot reports compare only
  sources that have actual output files. The scoped pilot report covers `10` sources and scored
  `0.00%` agreement (`0/722`), with `321` actual records, `189` field mismatches, `533`
  missing records, and `132` extras.
- Plan 014 STOP condition fired: pilot agreement is far below the bar, so the full replay was
  not run. Diagnostics are in `data/replay/reports/v2-extract-pilot-20260703-diagnostics.*`.
  Top review causes were `evidence_quote_not_in_block=86`, `missing_display_name=53`,
  `payload_schema_warning=46`, `anchor_ambiguous=10`, `anchor_new=2`, and
  `unknown_evidence_block=1`. Top mismatch fields were `evidence_refs=189`,
  `display_name=177`, `payload.description=160`, and `raw_text=109`.
- Post-STOP gates passed after the `--actual-only` replay-eval fix and pilot artifacts:
  `bun run typecheck`; `bun run test` (`946 pass`, `1 skip`, `0 fail`); `bun run validate`
  with `Issues: 0`; and `bun scripts/determinism-anchor.ts` with combined hash
  `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### V2 Extract Deterministic Boundary Iteration

- Without provider spend, replayed the saved 10 pilot responses through a local boundary fix.
  The fix derives display names from payload anchors when the model omits `display_name`,
  accepts OCR-equivalent citation quotes after conservative normalization, and maps relation
  `subject_local_observation_id`/`object_local_observation_id` aliases into final
  `subject_id`/`object_id` before anchor remapping.
- The no-spend replay improved boundary yield but did not clear the Plan 014 STOP:
  accepted records `321 -> 374`, review entries `198 -> 147`, `missing_display_name`
  `53 -> 0`, but scoped replay agreement remained `0.00%` (`0/722`). The generated
  throwaway replay run was removed; the durable conclusion is this LOG entry plus tests.
- Post-iteration gates passed: `bun run typecheck`; `bun run test` (`949 pass`, `1 skip`,
  `0 fail`); `bun run validate` with `Issues: 0`; and `bun scripts/determinism-anchor.ts`
  with combined hash `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### V2 Replay Projection Diagnostics

- Corrected replay equality to use the plan-013 comparable projection: declared schema fields
  plus runner companions, source/block evidence identity, and relation endpoints/family/kind/status;
  v1-only payload residue and evidence role/page/hash metadata are no longer scored as equality
  failures. The projection-v2 self-diff stayed `15770/15770`.
- Replayed the saved 10 pilot responses through the current boundary with no provider spend as
  `v2-extract-pilot-20260703-boundary-projection-v2`. It produced `374` accepted records and
  `147` review entries (`evidence_quote_not_in_block=86`, `payload_schema_warning=46`,
  `anchor_ambiguous=12`, `anchor_new=2`, `unknown_evidence_block=1`).
- Plan 014 remains STOPPED: corrected projection agreement is still `0.00%` (`0/722`) with
  `220` field mismatches, `502` missing records, and `154` extras. Top mismatch classes are
  schema/content gaps, especially `payload.description`, metric unit normalization, metric scope/name/raw
  value fields, route companions, and citation block sets.
- Added deterministic replay diagnostic examples to projection-v2 reports: bounded field
  mismatch, missing, and extra samples with truncated expected/actual values. This used no
  provider spend and did not change replay scores: self-diff remains `15770/15770`, and
  boundary projection-v2 remains `0/722`.
- Post-diagnostic gates passed: `bun run typecheck`; `bun run test` (`952 pass`, `1 skip`,
  `0 fail`); `bun run validate` with `Issues: 0`; and `bun scripts/determinism-anchor.ts`
  with combined hash `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### Static Site Exporter Ready

- Added the static HTML exporter for route, corridor, project, and source citation-target pages.
  The exporter reads tracked wiki Markdown plus rebuilt `data/canonical.db`, writes to
  `dist/site/`, caps oversized project/source pages, and builds a Pagefind search index.
- Corpus export check passed: `318` routes, `218` corridors, `1859` projects, `2561` sources;
  `dist/site` is `352M`; no generated HTML page exceeds `3M`.
- Bus-product cross-links were skipped because no bus product base URL or served-route artifact
  was supplied for Plan 011 Step 4.
- Plan 011 code gates passed before deploy: `bun run typecheck`, `bun run test`, `bun run
  validate` with `Issues: 0`, and `bun scripts/determinism-anchor.ts`.
- Owner approval for Plan 011 GitHub Pages deployment, recorded verbatim: "its not owner gated
  i give you permission".
- Deployed `dist/site` to the public `gh-pages` branch and enabled GitHub Pages at
  `https://mannyc2.github.io/mta-wiki/`. GitHub reports source `gh-pages` path `/`, HTTPS
  enforced, status `built`. HTTP 200 spot checks passed for the homepage, `route_m116`,
  `project_lirr-mnr-ptc`, and source `116_st_morningside_ave_pleasant_ave_cb10_feb2025`.
- Deployment branch commit: `624717c`. Post-deploy gates passed: `bun run typecheck`;
  `bun run test` (`952 pass`, `1 skip`, `0 fail`); `bun run validate` with `Issues: 0`;
  and `bun scripts/determinism-anchor.ts` with combined hash
  `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### Relation Family DB Constraint

- Added a `relations.relation_family` SQLite CHECK and bumped `CANONICAL_DB_VERSION` from
  `3` to `4`. This enforces the already code-closed `RELATION_FAMILIES` tuple at the DB
  boundary, like the existing `record_kind` and `provenance` CHECKs; it is not raw
  `relation_kind` closure. The `schema-audit` saturation signal is structurally unavailable
  for this 18-value field because `ENUM_MAX_DISTINCT=12`.
- Step 1 corpus evidence, recorded verbatim:
  `SELECT COUNT(*) FROM relations;` => `20640`.
  `SELECT relation_family, COUNT(*) FROM relations GROUP BY 1 ORDER BY 2 DESC;` =>
  `metric_context|6015`; `timeline_context|3626`; `agency_role|2194`;
  `treatment_context|1690`; `corridor_scope|1286`; `route_scope|1020`;
  `publication_role|1015`; `organization_hierarchy|883`; `claim_context|815`;
  `partnership_engagement|686`; `funding_award|645`; `program_project_scope|227`;
  `governance_legal|197`; `dependency_or_reference|179`; `location_scope|74`;
  `ownership_role|65`; `data_reporting|23`.
  Out-of-tuple count => `0`.
- Local `data/canonical.db` was rebuilt to `PRAGMA user_version=4` and contains the
  `relation_family` CHECK; per the public-history policy from Plan 009, the DB remains ignored
  and is not committed.
- Determinism anchor re-baselined from `dump=9ebbafe0c187f13c46d530585191dae1f2fc78d4dc0b149dd8e385e1adc17335`,
  `fts=f4838f4b9807560b62ba6b8296591041544408daac8f295422b43612a7c4ea2f`,
  `master=c93647aacf94b89286f7764dde2841195ed984787e23df8ea687048be7f2a1b4`,
  `combined=8e42b43fc9695204316204f211552b4e15ec1b444b8baaaf818b2613aa7de858` to
  `dump=17054fd6f6e8bbdb855c2120ae1c4bebe8a73de47b50b8724f52fff2d551922b`,
  `fts=f4838f4b9807560b62ba6b8296591041544408daac8f295422b43612a7c4ea2f`,
  `master=7eb86293059611f6a04a97c7805ebc25cc6fb387f4989bd18ec7d24a3615cc09`,
  `combined=d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`; the FTS
  hash is unchanged.
- Plan 016 gates passed: `bun run typecheck`, `bun run test`, `bun run validate` with
  `Issues: 0`, and `bun scripts/determinism-anchor.ts`.

### Writer Primitive Validation

- Added the writer primitive grammar for ids-only inline links and structured writer blocks:
  `[[route:id|label]]`, `[[corridor:id|label]]`, `[[project:id|label]]`,
  `[[entity:id|label]]`, `[[metric:id|label]]`, and `[[cite:source#block|label]]`,
  plus fenced `mta:<kind>` JSON blocks for route, corridor, project, entity, and metric context.
- `validate` now checks non-source writer regions for dangling writer primitives by default while
  leaving the stricter uncited-paragraph check behind `--strict-writer-citations`.
- Plan 010 gates passed: `bun run typecheck`, `bun run test`, `bun run validate` with
  `Issues: 0`, and `bun scripts/determinism-anchor.ts`.

### Replay Harness Preflight Stop

- Plan 013 stopped before implementation under its explicit STOP conditions. The 300-row
  `v1-rc5` audit sample cites `257` distinct sources, exceeding the plan's approximate `250`
  source limit for the mandatory replay set.
- Evidence-ref matching is ambiguous in the shipped v1 release: using
  `source_id#block_id + record_kind + relation endpoints` produces `13,980` collision keys
  across the full release and `1,997` collision keys even when scoped to the mandatory
  audit-cited sources. The largest affected family is `metric_claim`.
- Follow-up decision needed before Plan 013 resumes: revise the replay matching key and/or
  rebalance the mandatory sample scope instead of silently choosing one colliding v1 record.

### Replay Harness Resume Decision

- Owner decision for Plan 013: "proceed with all 257 audit-cited sources. Revise replay matching
  so the primary bucket remains source_id#block_id + record_kind + relation endpoints, but
  ambiguous buckets are resolved by deterministic comparable-projection matching rather than
  stopping. Preserve truly identical projected duplicates as multiset entries. Record this in
  LOG.md and resume Plan 013. Within-bucket resolution must be deterministic
  (order-independent), and per-kind collision counts must appear in the replay report, not only
  LOG.md."

### Replay Eval Harness Landed

- Added deterministic replay evaluation scaffolding for the v2 track: `replay-eval` writes
  `data/replay/sample-manifest.json`, per-source v1 baseline projections under
  `data/replay/baseline/`, and JSON/Markdown reports under `data/replay/reports/`.
- Manifest seed: `v2-replay-v1`; sources: `257`; selected strata: `197` board-book,
  `17` DOT-project-PDF, and `43` other. All `300` quality-audit rows have their cited sources
  included.
- Self-diff sanity for `v1-rc5`: `15770 / 15770` matches, `0` field mismatches, `0` missing,
  `0` extra. The report records per-kind collision counts for replay-scope and full-release
  buckets.
- Plan 013 gates passed: `bun run typecheck`, `bun run test`, `bun run validate` with
  `Issues: 0`, and `bun scripts/determinism-anchor.ts`.

### Public History, Docs, And Log Cleanup

- Rewrote the public repository to a compact single-root history for normal GitHub use. `main`
  and `v1` point to the same public-history root after cleanup.
- Removed local execution plans from the tracked tree. `plans/` is now local-only through
  `.git/info/exclude`; previous plan/status docs were preserved locally under
  `plans/archived-docs/docs-before-public-cleanup-2026-07-03/`.
- Added `.claude/` to `.gitignore` and removed `.claude/scheduled_tasks.lock` from the tracked
  public tree.
- Replaced the old `docs/` planning/status surface with durable user-facing docs:
  `docs/README.md`, `architecture.md`, `data-model.md`, `mta-llm-wiki-spec.md`,
  `operations.md`, `releases-and-provenance.md`, plus the untouched
  `docs/immutable-mta-llm-wiki-spec.md`.
- Compressed `LOG.md` from a long project diary into this changelog. Future entries should stay
  short and public-facing.

### Public Repository Published

- Created the public GitHub repository `mannyc2/mta-wiki`.
- Owner approved public publication of extracted text and verbatim evidence quotes from the
  MTA/DOT source corpus, with an attribution/correction/takedown note.
- Code license: MIT. Data provenance statement: source documents are public NYC/MTA government
  records obtained from public agency websites; extracted text and derived data are provided for
  research and reference; correction or takedown requests should be opened as GitHub issues.
- Retired the old local Git history because it had a 120.95 GiB pack with generated artifacts.
  The archive remains on disk as `.git-archive/` until the owner explicitly deletes it.
- Publication intentionally leaves old commit hashes cited in archived local plans as inert labels.

### Public Clone Validation

- The public repository tracks `data/submissions/`, `data/canonical/`,
  `data/evidence-block-index.jsonl`, `data/reference/gtfs/`, `wiki/`, and
  `data/exports/releases/v1-rc5/`, but not `raw/` or `data/canonical.db`.
- Added `bun run rebuild-db` plus a public-clone `materialize` path that rebuilds the ignored
  `data/canonical.db` from tracked `data/canonical/*.jsonl` without requiring `raw/` or rewriting
  canonical/wiki outputs.
- Added the compact evidence-block index so `validate` can perform evidence page/hash checks in
  fresh public clones without `raw/sources/*/blocks.jsonl`.

### V1 Release Closed

- `v1` is the public release tag for release `v1-rc5`; `data/exports/releases/LATEST` remains
  `v1-rc5`.
- Final v1 gates passed: `bun run typecheck`, `bun run test`, `bun run validate` with `Issues: 0`,
  and `bun scripts/determinism-anchor.ts`.
- Determinism anchor combined hash for v1: `8e42b43fc9695204316204f211552b4e15ec1b444b8baaaf818b2613aa7de858`.
- Corpus at v1: `98119` submissions, `84027` canonical records, `7331` wiki pages.
- Quality report for `v1-rc5`: evidence resolution `132526 / 132526`; sample precision
  `65.67%` strict and `90.00%` lenient.
- Owner accepted the `50`-row human-review calibration as agent-executed and owner-ratified:
  `47/50` judge agreement (`94.00%`), with no new hard-wrong class.
- Bus importer parity for `v1-rc5` was accepted: `0` ambiguous omissions, `10` matched served Bus
  routes, and `2` honest `no_wiki_coverage` served Bus routes.

### V1 Data Contract Landed

- Versioned release exports landed under `data/exports/releases/`, with manifest hashes and a
  `LATEST` pointer.
- Route anchor export landed for downstream route matching: `396` GTFS ids resolved to `213`
  canonical anchors plus `183` `no_wiki_coverage` rows, with `0` ambiguous dispositions.
- Route-scoped relation assertion cleanup met the v1 stop line: unknown rates were below 10% for
  `claim_context`, `corridor_scope`, `metric_context`, `route_scope`, `timeline_context`, and
  `treatment_context`.
- Release taxonomy export landed for relation families and assertion-status vocabulary.
- Events and projects gained `date_normalized` and `date_precision` release fields.
- Empty payloads were effectively eliminated for v1: `4` corpus-wide and `0` on routes.

## 2026-06

### Pipeline Foundation

- Built the filesystem-first two-stage pipeline: ingest agents submit structured observations;
  deterministic materialization writes canonical JSONL, wiki pages, release exports, and SQLite
  projections; writer agents own only marked Markdown regions on non-source pages.
- Established source prep around citeable source blocks and staged source folders under
  `raw/sources/<source_id>/`.
- Added deterministic validation, identity, ontology normalization, route anchoring, release export,
  quality-report, and SQLite materialization infrastructure.
- Imported the curated source set in cheap mode: `61` captures discovered, `53` staged, `8`
  skipped, `0` failed. The full artifact-tree dry run found `2632` unique source ids, with
  roughly `7.35 GB` of stageable source artifacts before extracted text/block files.
- Early canary runs used `14th_street_busway_brochure` and `m86_sbs_progress_report_2017` to expose
  duplicate observations, broad evidence spans, writer-context gaps, and status/document-time
  semantics.
