---
managed_by: "mta-wiki-materializer"
record_id: "route_meeting-doc-196866-4-line"
record_aliases:
  - "route_4-subway"
record_kind: "route"
display_name: "4 Line (subway)"
source_id: "meeting_doc_196866"
source_ids:
  - "meeting_doc_196866"
  - "meeting_doc_91606"
local_observation_id: "route_meeting_doc_196866_4_line"
local_observation_ids:
  - "route_4_line_meeting_doc_91606"
  - "route_meeting_doc_196866_4_line"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-22T21:36:22.620Z"
raw_text: "4 and 7 line schedule changes"
submission_ids:
  - "sub_145871c0a9ca06af"
  - "sub_1d5cf1194e935d70"
payload:
  _merged_field_values:
    route_name:
      - "4 line"
      - "4 Line"
  mode: "subway"
  operator: "NYCT"
  route_id: "4"
  route_name: "4 line"
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
    block_id: "p001_c0002"
    evidence_id: "meeting_doc_91606#p001_c0002"
    page_number: 1
    role: "route_mention"
    source_id: "meeting_doc_91606"
    source_path: "raw/sources/meeting_doc_91606/blocks.jsonl"
    source_quote: "Schedule Changes: 4 and 7 Line Subway Schedule Changes Effective December 2022"
    text_sha256: "sha256:7267547e669fc5b118a05162960a0abc631848e80892f48a6f4e5ff632ff07d7"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The 4 Line is a subway route operated by NYCT for which minor weekday schedule changes have been proposed from two separate NYCT staff summaries [[cite:meeting_doc_196866#p001_c0005|NYCT regular schedule review context]]. The first, from a July 8, 2022 staff summary, recommended shifting trips rather than adding or removing them: two southbound 4 trips would move from the 9-10 a.m. hour to the 5-6 a.m. hour, and one northbound 4 trip would move from the 7-8 p.m. hour to the 3-4 p.m. hour [[cite:meeting_doc_91606#p003_c0002|4 line trip shifts 2022]]. There was no net change in total daily trips on the 4 and 7 lines, and the number of crews required for 4 service would be unchanged [[cite:meeting_doc_91606#p003_c0004|crew unchanged]]. The changes, implemented in December 2022, were expected to save approximately $0.3 million annually [[cite:meeting_doc_91606#p001_c0009|budget savings]] and weekday 4 trains did not exceed the MTA Board-adopted loading guideline of 110 passengers per A Division car [[cite:meeting_doc_91606#p003_c0005|loading guideline 110]]. Frequency and load detail at 86 St and 59 St is captured by [[metric:metric_4-sb-86st-5am-freq|4 Southbound 86 St 5:00 AM frequency change]], [[metric:metric_4-sb-86st-5am-load|4 Southbound 86 St 5:00 AM max load change]], [[metric:metric_4-sb-86st-9am-freq|4 Southbound 86 St 9:00 AM frequency change]], [[metric:metric_4-nb-59st-3pm-freq|4 Northbound 59 St 3:00 PM frequency change]], and [[metric:metric_4-nb-59st-7pm-freq|4 Northbound 59 St 7:00 PM frequency change]].

A second proposal, dated January 15, 2026, covers minor schedule adjustments on the 2, 3, 4, and 5 lines to better align scheduled service with ridership by time of day and improve operational reliability [[cite:meeting_doc_196866#p001_c0005|spring 2026 proposal scope]]. On the 4 line, these trip shifts would result in a net decrease of one round trip [[cite:meeting_doc_196866#p003_c0003|net one round trip decrease]]. Specific proposed changes include moving one northbound trip from the 9:00 a.m. hour to the 7:00 a.m. hour, moving two trips from the 6:00 p.m. hour to the 7:00 p.m. hour, and removing one trip from the 10:00 a.m. hour; on the southbound direction, moving one trip from the 8:00 a.m. to the 5:00 a.m. hour, moving one trip from the 4:00 p.m. to the 3:00 p.m. hour, and removing one trip from the 9:00 a.m. hour [[cite:meeting_doc_196866#p003_c0004|4 line trip detail 2026]]. These changes are expected to be cost neutral [[cite:meeting_doc_196866#p001_c0009|cost neutral]] and would be implemented in May 2026 [[cite:meeting_doc_196866#p001_c0011|May 2026 implementation]]. The cumulative effect across all four lines is intended to spread peak service, even out headways, and reduce delays through the Nostrand Junction bottleneck [[cite:meeting_doc_196866#p002_c0010|Nostrand Junction bottleneck]]. Related headway, trip, and load metrics include [[metric:metric_meeting-doc-196866-4nb-7am-headway|4 NB 7 AM headway change]], [[metric:metric_meeting-doc-196866-4nb-7pm-change|4 NB 7 PM trip change]], [[metric:metric_meeting-doc-196866-4sb-8am-load|4 SB 8 AM guideline load change]], [[metric:metric_meeting-doc-196866-45combined-nb-7pm-change|4/5 combined NB 7 PM trip change]], [[metric:metric_meeting-doc-196866-45combined-nb-8am-headway|4/5 combined NB 8 AM headway change]], and [[metric:metric_meeting-doc-196866-45combined-sb-8am-headway|4/5 combined SB 8 AM headway change]].
<!-- mta-wiki:writer:end -->
