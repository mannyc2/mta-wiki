---
managed_by: "mta-wiki-materializer"
record_id: "route_q48-serves-lga-2011"
record_kind: "route"
display_name: "Q48 historical service"
source_id: "110622_lga_aa_slides"
source_ids:
  - "110622_lga_aa_slides"
  - "2012_04_20_brt_lga_workshop_summary"
  - "mta_queens_bus_network_redesign_service_changes"
local_observation_id: "route_q48_serves_lga_2011"
local_observation_ids:
  - "route_q48_historical_qbnr_2025"
  - "route_q48_lga_2012"
  - "route_q48_serves_lga_2011"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-07-13T01:21:01.000Z"
raw_text: "The existing Q48 will be discontinued and replaced with the new Q90."
submission_ids:
  - "sub_aa5ec1bd54bcede3"
  - "sub_b226d002dd20cff1"
  - "sub_f4ba6b46cf8562e4"
payload:
  _merged_field_values:
    description:
      - "Bus route serving LaGuardia Airport as of June 2011"
      - "Bus route used to access LaGuardia Airport; participants expressed desire for Q48 to provide express service to the airport and to continue to LIJ Hospital and North Shore Towers"
  borough: "Queens"
  borough_normalized: "queens"
  description: "Bus route serving LaGuardia Airport as of June 2011"
  route_id: "Q48"
  route_label: "Q48"
  route_name: "Q48"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "bus"
  route_type_normalized: "bus"
evidence_refs:
  -
    block_id: "p006_c0004"
    evidence_id: "110622_lga_aa_slides#p006_c0004"
    page_number: 6
    role: "route"
    source_id: "110622_lga_aa_slides"
    source_path: "raw/sources/110622_lga_aa_slides/blocks.jsonl"
    source_quote: "LGA currently served by M60, Q33, Q47, Q48 and Q72 bus routes"
    text_sha256: "sha256:80f284beb4b68c5d261725fa6151ee7a891e4091bba94e784438b794a113b84e"
    text_source: "raw_text"
  -
    block_id: "p002_c0013"
    evidence_id: "2012_04_20_brt_lga_workshop_summary#p002_c0013"
    page_number: 2
    role: "route_mention"
    source_id: "2012_04_20_brt_lga_workshop_summary"
    source_path: "raw/sources/2012_04_20_brt_lga_workshop_summary/blocks.jsonl"
    text_sha256: "sha256:6795d20d10836882e995178c75d44f858e9906c8367546cb75d052acef4ed062"
    text_source: "raw_text"
  -
    block_id: "p003_c0006"
    evidence_id: "2012_04_20_brt_lga_workshop_summary#p003_c0006"
    page_number: 3
    role: "route_mention"
    source_id: "2012_04_20_brt_lga_workshop_summary"
    source_path: "raw/sources/2012_04_20_brt_lga_workshop_summary/blocks.jsonl"
    text_sha256: "sha256:39c30e9f1dbf4e9c601d14d9722be8470c825251338c762017df86d16e7a91df"
    text_source: "raw_text"
  -
    block_id: "p004_c0003"
    evidence_id: "2012_04_20_brt_lga_workshop_summary#p004_c0003"
    page_number: 4
    role: "route_mention"
    source_id: "2012_04_20_brt_lga_workshop_summary"
    source_path: "raw/sources/2012_04_20_brt_lga_workshop_summary/blocks.jsonl"
    text_sha256: "sha256:698ac1bfe02b42111ff6ecef658f4ef4376b558ad0085be2567714856231470f"
    text_source: "raw_text"
  -
    block_id: "p001_b0053"
    evidence_id: "mta_queens_bus_network_redesign_service_changes#p001_b0053"
    page_number: 1
    role: "route_identity"
    source_id: "mta_queens_bus_network_redesign_service_changes"
    source_path: "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl"
    source_quote: "The existing Q48 will be discontinued and replaced with the new Q90."
    text_sha256: "sha256:2d86bb2a28c2950f7d20c2914620b66ed3a177234eeab7a66616d68708e2977f"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The Q48 is a bus route in Queens that, as of June 2011, was one of five routes serving LaGuardia Airport (LGA) alongside the M60, Q33, Q47, and Q72 [[cite:110622_lga_aa_slides#p006_c0004|LGA served by M60, Q33, Q47, Q48 and Q72 bus routes]]. At the time, the Q48 route was part of the LaGuardia Airport Access Alternatives Analysis (AA) study led by NYCDOT, which examined options to improve transit connectivity to LGA [[cite:110622_lga_aa_slides#p004_c0003|NYCDOT receives FTA grant to study transit access alternatives]]. The AA study had selected Bus Rapid Transit (BRT) as the locally preferred mode by late 2011 [[cite:2012_04_20_brt_lga_workshop_summary#p001_c0013|decision was made to move forward with BRT as the locally preferred mode]].

During the second public meeting for the AA study on November 2, 2011, workshop participants who used public transportation to reach LGA reported using both the Q23 and Q48 routes to access the airport [[cite:2012_04_20_brt_lga_workshop_summary#p002_c0013|Q23 and Q48 routes are both used to access the airport]]. Participants expressed interest in having the Q48 provide express service to the airport [[cite:2012_04_20_brt_lga_workshop_summary#p002_c0013|participants expressed they would like to see the Q48 provide express service to the airport]]. Another participant-identified route concept proposed running the Q48 (or Q26) from North Shore Towers to LGA [[cite:2012_04_20_brt_lga_workshop_summary#p003_c0006|Q48 (or Q26) from North Shore Towers to LGA]].

Data presented at the workshop showed that only a small fraction of LGA passengers used buses: just [[metric:metric_lga-passengers-from-nyc|over two-thirds of LGA passengers came from New York City]], with [[metric:metric_lga-passengers-from-manhattan|47% from Manhattan]], [[metric:metric_lga-passengers-from-other-boroughs|20% from other boroughs]], and [[metric:metric_lga-passengers-from-elsewhere|33% from elsewhere]] [[cite:110622_lga_aa_slides#p007_c0005|LGA passenger origin data table]]. Only [[metric:metric_lga-other-mode-share|four percent of LGA passengers arrived by transit (including bus)]] while a majority used taxis, livery cars, or personal vehicles [[cite:110622_lga_aa_slides#p008_c0006|Airport mode share table for LGA: 63% taxi/livery, 23% personal car, 10% transit, 4% other]]. The workshop summary noted only seven percent of all LGA passengers arrived by bus specifically [[cite:2012_04_20_brt_lga_workshop_summary#p001_c0012|only seven percent of passengers are arriving at LaGuardia by bus]].
<!-- mta-wiki:writer:end -->
