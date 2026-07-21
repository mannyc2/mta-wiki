---
managed_by: "mta-wiki-materializer"
record_id: "source_nyc-dot-bus-lanes-flatbush-phase1-opening-2025"
record_kind: "source"
display_name: "Bus Lanes - Local Streets: Flatbush Avenue Phase 1 opening rows"
source_id: "nyc_dot_bus_lanes_flatbush_phase1_opening_2025"
source_ids:
  - "nyc_dot_bus_lanes_flatbush_phase1_opening_2025"
local_observation_id: "source_nyc_dot_bus_lanes_flatbush_phase1_opening_2025"
local_observation_ids:
  - "source_nyc_dot_bus_lanes_flatbush_phase1_opening_2025"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-07-21T02:13:46.398Z"
raw_text: "Dataset description: Bus lanes are travel lanes that are restricted to buses during certain hours of the day. All bus lanes have signs posted along the route with specific regulations; lanes marked \"Bus Only\" and /or painted red. Bus lanes help to keep buses from getting stuck in traffic, generally making travel for bus riders faster and reliable and improving the overall traffic flow of a corridor. Each record represents a segment of a bus lane based on the LION geographic base file of NYC streets. User may use the SegmentID field in this dataset to join with the LION data for more information.\n\nField description: Year bus lane opened\n\nDataset rows updated at: 2026-04-06T15:44:03Z"
submission_ids:
  - "sub_875db57fd53214d0"
payload:
  authority_tier: "dataset_documentation"
  content_type: "official open-data API capture"
  dataset_id: "ycrg-ses3"
  dataset_rows_updated_at: "2026-04-06T15:44:03Z"
  description: "Pinned official NYC DOT bus-lane rows and schema, with official DCP LION segment context, for the Flatbush Avenue center-running bus lanes bounded by Livingston Street and State Street."
  distinct_segment_count: 5
  published_date_normalized: "2026-04-06"
  published_date_precision: "day"
  published_date_provenance: "staged_metadata"
  publisher: "New York City Department of Transportation (NYC DOT)"
  response_sha256: "a741b434f60f0fbb85a582c44c0c166133f9188386c6000f61d4df2a93f2297d"
  retrieved_at: "2026-07-21T02:08:00Z"
  row_count: 9
  source_url: "https://data.cityofnewyork.us/Transportation/Bus-Lanes-Local-Streets/ycrg-ses3"
  title: "Bus Lanes - Local Streets: Flatbush Avenue Phase 1 opening rows"
evidence_refs:
  -
    block_id: "p001_b0003"
    evidence_id: "nyc_dot_bus_lanes_flatbush_phase1_opening_2025#p001_b0003"
    page_number: 1
    role: "publisher"
    source_id: "nyc_dot_bus_lanes_flatbush_phase1_opening_2025"
    source_path: "raw/sources/nyc_dot_bus_lanes_flatbush_phase1_opening_2025/blocks.jsonl"
    source_quote: "Department of Transportation (DOT)"
    text_sha256: "sha256:c3e999240fbcd8ceab533453ab18c0e9908cfaca4937c2a8a7535a858b0f9cef"
    text_source: "raw_text"
  -
    block_id: "p001_b0004"
    evidence_id: "nyc_dot_bus_lanes_flatbush_phase1_opening_2025#p001_b0004"
    page_number: 1
    role: "dataset_scope"
    source_id: "nyc_dot_bus_lanes_flatbush_phase1_opening_2025"
    source_path: "raw/sources/nyc_dot_bus_lanes_flatbush_phase1_opening_2025/blocks.jsonl"
    text_sha256: "sha256:2f063455514a278fd0998786733fa765e8eb4241b474b46e546535e2f0f687cd"
    text_source: "raw_text"
  -
    block_id: "p001_b0005"
    evidence_id: "nyc_dot_bus_lanes_flatbush_phase1_opening_2025#p001_b0005"
    page_number: 1
    role: "dataset_update"
    source_id: "nyc_dot_bus_lanes_flatbush_phase1_opening_2025"
    source_path: "raw/sources/nyc_dot_bus_lanes_flatbush_phase1_opening_2025/blocks.jsonl"
    source_quote: "2026-04-06T15:44:03Z"
    text_sha256: "sha256:0ff832f4e5b628f4b6d369db72e884a9efd7dffa8e3f5f6bc832b2b956b3f709"
    text_source: "raw_text"
  -
    block_id: "p001_b0044"
    evidence_id: "nyc_dot_bus_lanes_flatbush_phase1_opening_2025#p001_b0044"
    page_number: 1
    role: "capture_hashes"
    source_id: "nyc_dot_bus_lanes_flatbush_phase1_opening_2025"
    source_path: "raw/sources/nyc_dot_bus_lanes_flatbush_phase1_opening_2025/blocks.jsonl"
    text_sha256: "sha256:fdec54b57f0c113c4ffef34b1dbf5cf6e159949d728ca28a6aca55d201003d49"
    text_source: "raw_text"
---

# Bus Lanes - Local Streets: Flatbush Avenue Phase 1 opening rows

source_id: nyc_dot_bus_lanes_flatbush_phase1_opening_2025
citation: cite block ids exactly as shown in square brackets
document: 44 block(s)

## Page 1

### [p001_b0001] NYC Open Data dataset: Bus Lanes - Local Streets
### [p001_b0002] Dataset ID: ycrg-ses3
### [p001_b0003] Dataset agency: Department of Transportation (DOT)
[p001_b0004] Dataset description: Bus lanes are travel lanes that are restricted to buses during certain hours of the day. All bus lanes have signs posted along the route with specific regulations; lanes marked "Bus Only" and /or painted red. Bus lanes help to keep buses from getting stuck in traffic, generally making travel for bus riders faster and reliable and improving the overall traffic flow of a corridor. Each record represents a segment of a bus lane based on the LION geographic base file of NYC streets. User may use the SegmentID field in this dataset to join with the LION data for more information.
### [p001_b0005] Dataset rows updated at: 2026-04-06T15:44:03Z
[p001_b0006] Dataset portal: https://data.cityofnewyork.us/Transportation/Bus-Lanes-Local-Streets/ycrg-ses3
### [p001_b0007] Field name: SegmentID
### [p001_b0008] Field key: segmentid
[p001_b0009] Field description: Segment ID: A seven digit number (right justified, zero filled) that identifies each segment of a street or a non-street feature represented in the LION file.
### [p001_b0010] Field name: Hours
### [p001_b0011] Field key: hours
### [p001_b0012] Field description: The hours the bus lanes are in effect
### [p001_b0013] Field name: Days
### [p001_b0014] Field key: days
### [p001_b0015] Field description: The days the bus lanes are in effect
### [p001_b0016] Field name: Lane_Type
### [p001_b0017] Field key: lane_type
[p001_b0018] Field description: A description on the type of bus lane.
### [p001_b0019] Field name: Open_dates
### [p001_b0020] Field key: open_dates
### [p001_b0021] Field description: Year bus lane opened
### [p001_b0022] Field name: Year1
### [p001_b0023] Field key: year1
### [p001_b0024] Field description: The year the bus lanes went into effect
[p001_b0025] Selected-row query: https://data.cityofnewyork.us/resource/ycrg-ses3.json?$select=street%2cbltrafdir%2csegmentid%2cboro%2cfacility%2cdirection%2chours%2cdays%2cdays_code%2clane_width%2clane_type1%2clane_type%2clane_type2%2clane_color%2csbs_route1%2csbs_route2%2copen_dates%2cyear1%2cyear2%2cyear3%2clast_updat%2cchron_id_1%2cshape_leng&$where=segmentid+in+%28%220022938%22%2c%220022942%22%2c%220028973%22%2c%220118635%22%2c%220118636%22%29&$order=segmentid%2cdirection&$limit=100
[p001_b0026] Selected-row response SHA-256: a741b434f60f0fbb85a582c44c0c166133f9188386c6000f61d4df2a93f2297d
[p001_b0027] {"street":"FLATBUSH AVENUE","bltrafdir":"T","segmentid":"0022938","boro":"BK","facility":"Flatbush Avenue","direction":"SB","hours":"24 Hours","days":"7 Days/Week","days_code":"7.0","lane_width":"Single","lane_type":"Center Running","lane_color":"Red","open_dates":"10/2/2025","year1":"2025","year2":"0","year3":"0","last_updat":"1/28/2026","chron_id_1":"BK2025","shape_leng":"142.11663065"}
[p001_b0028] {"street":"FLATBUSH AVENUE","bltrafdir":"T","segmentid":"0022942","boro":"BK","facility":"Flatbush Avenue","direction":"SB","hours":"24 Hours","days":"7 Days/Week","days_code":"7.0","lane_width":"Single","lane_type":"Center Running","lane_color":"Red","open_dates":"10/2/2025","year1":"2025","year2":"0","year3":"0","last_updat":"1/28/2026","chron_id_1":"BK2025","shape_leng":"133.159759846"}
[p001_b0029] {"street":"FLATBUSH AVENUE","bltrafdir":"T","segmentid":"0028973","boro":"BK","facility":"Flatbush Avenue","direction":"NB","hours":"24 Hours","days":"7 Days/Week","days_code":"7.0","lane_width":"Single","lane_type":"Center Running","lane_color":"Red","open_dates":"10/2/2025","year1":"2025","year2":"0","year3":"0","last_updat":"1/28/2026","chron_id_1":"BK2025","shape_leng":"402.783859781"}
[p001_b0030] {"street":"FLATBUSH AVENUE","bltrafdir":"T","segmentid":"0028973","boro":"BK","facility":"Flatbush Avenue","direction":"SB","hours":"24 Hours","days":"7 Days/Week","days_code":"7.0","lane_width":"Single","lane_type":"Center Running","lane_color":"Red","open_dates":"10/2/2025","year1":"2025","year2":"0","year3":"0","last_updat":"1/28/2026","chron_id_1":"BK2025","shape_leng":"402.783859781"}
[p001_b0031] {"street":"FLATBUSH AVENUE","bltrafdir":"T","segmentid":"0118635","boro":"BK","facility":"Flatbush Avenue","direction":"NB","hours":"24 Hours","days":"7 Days/Week","days_code":"7.0","lane_width":"Single","lane_type":"Center Running","lane_color":"Red","open_dates":"10/2/2025","year1":"2025","year2":"0","year3":"0","last_updat":"1/28/2026","chron_id_1":"BK2025","shape_leng":"160.313167532"}
[p001_b0032] {"street":"FLATBUSH AVENUE","bltrafdir":"T","segmentid":"0118635","boro":"BK","facility":"Flatbush Avenue","direction":"SB","hours":"24 Hours","days":"7 Days/Week","days_code":"7.0","lane_width":"Single","lane_type":"Center Running","lane_color":"Red","open_dates":"10/2/2025","year1":"2025","year2":"0","year3":"0","last_updat":"1/28/2026","chron_id_1":"BK2025","shape_leng":"160.313167532"}
[p001_b0033] {"street":"FLATBUSH AVENUE","bltrafdir":"T","segmentid":"0118636","boro":"BK","facility":"Flatbush Avenue","direction":"NB","hours":"24 Hours","days":"7 Days/Week","days_code":"7.0","lane_width":"Single","lane_type":"Center Running","lane_color":"Red","open_dates":"10/2/2025","year1":"2025","year2":"0","year3":"0","last_updat":"1/28/2026","chron_id_1":"BK2025","shape_leng":"56.8878678653"}
[p001_b0034] {"street":"FLATBUSH AVENUE","bltrafdir":"T","segmentid":"0118636","boro":"BK","facility":"Flatbush Avenue","direction":"SB","hours":"24 Hours","days":"7 Days/Week","days_code":"7.0","lane_width":"Single","lane_type":"Center Running","lane_color":"Red","open_dates":"10/2/2025","year1":"2025","year2":"0","year3":"0","last_updat":"1/28/2026","chron_id_1":"BK2025","shape_leng":"56.8878678653"}
[p001_b0035] DCP LION selected SegmentID response SHA-256: 46c7fd07197f5cf30fa1f9f77b3970c357dc7b2f77f36a22ad1764dcec10beff
[p001_b0036] {"SegmentID":"0022938","Street":"FLATBUSH AVENUE","NodeIDFrom":"0015092","NodeIDTo":"0015094"}
[p001_b0037] {"SegmentID":"0022942","Street":"FLATBUSH AVENUE","NodeIDFrom":"0015094","NodeIDTo":"0015093"}
[p001_b0038] {"SegmentID":"0028973","Street":"FLATBUSH AVENUE","NodeIDFrom":"0018580","NodeIDTo":"0018571"}
[p001_b0039] {"SegmentID":"0118635","Street":"FLATBUSH AVENUE","NodeIDFrom":"0015093","NodeIDTo":"0069788"}
[p001_b0040] {"SegmentID":"0118636","Street":"FLATBUSH AVENUE","NodeIDFrom":"0069788","NodeIDTo":"0018580"}
[p001_b0041] DCP LION adjoining-node response SHA-256: 7e3f301a6b4a39a6be8efe1ab440a855c819f9be897ef16e82697b7c0bbb50e7
[p001_b0042] Outer node 0015092: {"SegmentID":"0162283","Street":"LIVINGSTON STREET","NodeIDFrom":"0080849","NodeIDTo":"0015092"}
[p001_b0043] Outer node 0018571: {"SegmentID":"0022934","Street":"STATE STREET","NodeIDFrom":"0015090","NodeIDTo":"0018571"}
[p001_b0044] Capture provenance: bus-lanes-view-metadata.json SHA-256 33cd64b3ac584603a66e52375bf7ceb7e6c6db49d40202ecf9940f89ee92e2ea; bus-lanes-columns.json SHA-256 f495f728925b7b807dec228987cfbcb4e9e55279dd1d4edda79c20f3baa7cefe; bus-lanes-selected.json SHA-256 a741b434f60f0fbb85a582c44c0c166133f9188386c6000f61d4df2a93f2297d; lion-selected-segments.json SHA-256 46c7fd07197f5cf30fa1f9f77b3970c357dc7b2f77f36a22ad1764dcec10beff; lion-adjoining-nodes.json SHA-256 7e3f301a6b4a39a6be8efe1ab440a855c819f9be897ef16e82697b7c0bbb50e7.
