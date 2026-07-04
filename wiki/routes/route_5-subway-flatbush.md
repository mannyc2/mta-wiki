---
managed_by: "mta-wiki-materializer"
record_id: "route_5-subway-flatbush"
record_aliases:
  - "route_5-subway"
  - "route_meeting-doc-196866-5-line"
record_kind: "route"
display_name: "5 Subway"
source_id: "meeting_doc_196866"
source_ids:
  - "meeting_doc_196866"
  - "meeting_doc_40161"
local_observation_id: "route_meeting_doc_196866_5_line"
local_observation_ids:
  - "route_5_subway_flatbush"
  - "route_meeting_doc_196866_5_line"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-21T23:35:07.271Z"
raw_text: "5 subway line serving Flatbush Avenue Station, shown as green circle on station sign"
submission_ids:
  - "sub_7c81620cbf209b9c"
  - "sub_c21c5492d33f7edb"
payload:
  boroughs:
    - "Brooklyn"
    - "Manhattan"
    - "Bronx"
  boroughs_normalized:
    - "brooklyn"
    - "manhattan"
    - "bronx"
  description: "5 subway line serving Flatbush Avenue Station"
  mode: "subway"
  operator: "NYCT"
  route_id: "5"
  route_name: "5 line"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "subway"
  route_type_normalized: "subway"
evidence_refs:
  -
    block_id: "p001_c0005"
    evidence_id: "meeting_doc_196866#p001_c0005"
    page_number: 1
    source_id: "meeting_doc_196866"
    source_path: "raw/sources/meeting_doc_196866/blocks.jsonl"
    text_sha256: "sha256:62531ea15d5f48f23274efaaa19552ae5df46eb55dc31ee39b7568acc00fca92"
    text_source: "raw_text"
  -
    block_id: "p007_c0003"
    evidence_id: "meeting_doc_196866#p007_c0003"
    page_number: 7
    source_id: "meeting_doc_196866"
    source_path: "raw/sources/meeting_doc_196866/blocks.jsonl"
    text_sha256: "sha256:e56db489b5e74951e39c82e9a57a4d3cc333108f90839d3e1b65efdb7c438a7c"
    text_source: "raw_text"
  -
    block_id: "p004_c0001"
    evidence_id: "meeting_doc_40161#p004_c0001"
    page_number: 4
    source_id: "meeting_doc_40161"
    source_path: "raw/sources/meeting_doc_40161/blocks.jsonl"
    source_quote: "numbers '2' and '5' in red and green circles"
    text_sha256: "sha256:014ebd2178d4650433d2ea667de0240482913e4f6914b3b6ec339d0d63bd933b"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
NYCT proposed minor weekday schedule changes on the [[route:route_5-subway-flatbush|5 Subway]] along with the 2, 3, and 4 lines, to be implemented in May 2026, reallocating trips to better match shifts in ridership by time of day and improve operational reliability [[cite:meeting_doc_196866#p001_c0005|NYCT schedule review]] [[cite:meeting_doc_196866#p001_c0011|May 2026 implementation]]. The cumulative effect is intended to spread peak service for more even headways and reduce delays through the Nostrand Junction bottleneck [[cite:meeting_doc_196866#p002_c0010|Nostrand Junction bottleneck relief]]. The adjustments are expected to be cost neutral [[cite:meeting_doc_196866#p001_c0009|cost neutral]].

For the northbound [[route:route_5-subway-flatbush|5 Subway]] at 14 St-Union Square, proposed changes include adding two trips each to the 7:00 AM, 8:00 AM, and 6:00 PM hours, adding one trip to the 7:00 PM hour, removing two trips each from the 9:00 AM and 4:00 PM hours, and removing one trip each from the 11:00 AM, 5:00 PM, and 8:00 PM hours [[cite:meeting_doc_196866#p003_c0004|5 NB trip bullet list]] [[cite:meeting_doc_196866#p007_c0003|5 NB table]]. Key headway changes include the 7:00 AM hour going from 8.6 to 6.7 minutes ([[metric:metric_meeting-doc-196866-5nb-7am-headway|5 NB 7 AM headway change]]) and the 8:00 AM guideline load dropping from 102% to 84% ([[metric:metric_meeting-doc-196866-5nb-8am-load|5 NB 8 AM guideline load change]]) [[cite:meeting_doc_196866#p007_c0003|5 NB 7 AM and 8 AM table rows]].

For the southbound [[route:route_5-subway-flatbush|5 Subway]] at Grand Central-42 St, the proposal moves one trip each from the 8:00 AM and 3:00 PM hours to the 6:00 AM hour [[cite:meeting_doc_196866#p003_c0004|5 SB trip bullet list]] [[cite:meeting_doc_196866#p007_c0003|5 SB table]]. The 6:00 AM headway would improve from 7.5 to 6.0 minutes ([[metric:metric_meeting-doc-196866-5sb-6am-headway|5 SB 6 AM headway change]]) [[cite:meeting_doc_196866#p007_c0003|5 SB 6 AM table row]].

Combined 4/5 corridor metrics also reflect the changes. Northbound at 14 St-Union Square, the 7:00 PM hour would gain 3 trips ([[metric:metric_meeting-doc-196866-45combined-nb-7pm-change|4/5 combined NB 7 PM trip change]]) and the 8:00 AM combined headway would tighten from 2.9 to 2.6 minutes ([[metric:metric_meeting-doc-196866-45combined-nb-8am-headway|4/5 combined NB 8 AM headway change]]), while southbound 8:00 AM combined headway would ease from 2.4 to 2.6 minutes ([[metric:metric_meeting-doc-196866-45combined-sb-8am-headway|4/5 combined SB 8 AM headway change]]) [[cite:meeting_doc_196866#p008_c0003|4/5 combined table]].

The [[route:route_5-subway-flatbush|5 Subway]] serves Flatbush Avenue station, where a memorial event honoring Garrett Goble was held and a mural of Goble was installed in the station [[cite:meeting_doc_40161#p001_c0001|memorial event description]] [[cite:meeting_doc_40161#p004_c0001|memorial event and station sign showing 5]] [[cite:meeting_doc_40161#p002_c0001|mural at Flatbush Avenue station]].
<!-- mta-wiki:writer:end -->
