---
managed_by: "mta-wiki-materializer"
record_id: "route_m57-nyct-2025"
record_aliases:
  - "route_m57"
  - "route_m57-ace"
record_kind: "route"
display_name: "M57 Bus Route"
source_id: "nyct_key_performance_metrics_doc194001"
source_ids:
  - "mta_automated_camera_enforcement"
  - "nyct_key_performance_metrics_doc194001"
local_observation_id: "route_m57_nyct_2025"
local_observation_ids:
  - "route_ace_dec2025_m57"
  - "route_m57_ace"
  - "route_m57_nyct_2025"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-07-13T17:11:49.446Z"
raw_text: "M57"
submission_ids:
  - "sub_125558fd9199520d"
  - "sub_4052258be4d96239"
  - "sub_be7374031235fd3e"
payload:
  borough: "Manhattan"
  borough_normalized: "manhattan"
  mode: "bus"
  route: "M57"
  route_id: "M57"
  route_label: "M57"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "bus"
  route_type_normalized: "bus"
  streets: "57 St"
evidence_refs:
  -
    block_id: "p010_c0011"
    evidence_id: "nyct_key_performance_metrics_doc194001#p010_c0011"
    page_number: 10
    role: "ace_program_route"
    source_id: "nyct_key_performance_metrics_doc194001"
    source_path: "raw/sources/nyct_key_performance_metrics_doc194001/blocks.jsonl"
    text_sha256: "sha256:e147dfa103fac9d1499e269c62864619e13cdfd4b3540e71e98ebfb706cd1a42"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "mta_automated_camera_enforcement#p001_b0001"
    page_number: 1
    role: "lists M57 as ACE route"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "M57, 57 St"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p010_c0011"
    evidence_id: "nyct_key_performance_metrics_doc194001#p010_c0011"
    page_number: 10
    role: "route_identity"
    source_id: "nyct_key_performance_metrics_doc194001"
    source_path: "raw/sources/nyct_key_performance_metrics_doc194001/blocks.jsonl"
    source_quote: "M57"
    text_sha256: "sha256:e147dfa103fac9d1499e269c62864619e13cdfd4b3540e71e98ebfb706cd1a42"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The [[route:route_m57-nyct-2025|M57 Bus Route]] is a Manhattan local bus route running along 57th Street [[cite:nyct_key_performance_metrics_doc194001#p010_c0011|M57 ACE expansion]]. On December 8, 2025, MTA materials reported an Automated Camera Enforcement (ACE) expansion to the M57 in Manhattan, along with the B68 and B60 in Brooklyn, with a 60-day warning phase during which vehicles blocking bus lanes, bus stops, or double-parked received warning notices [[cite:nyct_key_performance_metrics_doc194001#p010_c0011|M57 ACE expansion]]. The M57 is among the 60 bus routes covered by ACE in the cited program page [[cite:mta_automated_camera_enforcement#p001_b0001|ACE active on 60 routes]], which describes a program that has equipped over 1,400 buses across 560 miles of service since its June 2024 launch, benefiting over 915,000 daily customers [[cite:nyct_key_performance_metrics_doc194001#p011_c0009|ACE program statistics]]. The [[metric:metric_ace-weekday-riders|ACE program benefits over 1 million weekday riders]] across the system, with some segments experiencing speed gains of nearly 30% [[cite:mta_automated_camera_enforcement#p001_b0001|ACE speed gains]].

The M57 route itself is identified by the streets value of "57 St" in the ACE program documentation [[cite:mta_automated_camera_enforcement#p001_b0001|M57, 57 St listing]]. The cited warning-phase description says violating vehicles received warning notices rather than fines; after that phase, fines apply under the ACE civil penalty structure starting at $50 and escalating up to $250 per violation [[cite:mta_automated_camera_enforcement#p001_b0001|ACE fine structure]].
<!-- mta-wiki:writer:end -->
