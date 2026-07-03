---
managed_by: "mta-wiki-materializer"
record_id: "source_bus-lanes-dataset-dictionary"
record_kind: "source"
display_name: "NYC DOT Bus Lanes Dataset Dictionary"
source_id: "bus_lanes_dataset_dictionary"
source_ids:
  - "bus_lanes_dataset_dictionary"
local_observation_id: "source_bus_lanes_dataset_dictionary"
local_observation_ids:
  - "source_bus_lanes_dataset_dictionary"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-08T20:08:02.993Z"
raw_text: "NYC DOT Bus Lanes Dataset Columns — data dictionary / schema definition for the Bus Lanes dataset on NYC Open Data"
submission_ids:
  - "sub_47d2b770e0d0e69a"
payload:
  authority_tier: "dataset_documentation"
  dataset_name: "Bus Lanes"
  description: "Schema definition with column names, data types, descriptions, and cached value distributions for the NYC DOT Bus Lanes dataset"
  format: "JSON data dictionary (Socrata API column metadata)"
  publisher: "NYC Department of Transportation"
  record_count: 4068
  source_type: "data_dictionary"
evidence_refs:
  -
    block_id: "p001_b0023"
    evidence_id: "bus_lanes_dataset_dictionary#p001_b0023"
    page_number: 1
    source_id: "bus_lanes_dataset_dictionary"
    source_path: "raw/sources/bus_lanes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"non_null\": \"4068\""
    text_sha256: "sha256:abe514968f2ed8dd7f04b722e60edf3fba9792681f695d542c6973d01682d48e"
    text_source: "raw_text"
  -
    block_id: "p001_b0015"
    evidence_id: "bus_lanes_dataset_dictionary#p001_b0015"
    page_number: 1
    source_id: "bus_lanes_dataset_dictionary"
    source_path: "raw/sources/bus_lanes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"name\": \"Street\""
    text_sha256: "sha256:215b5c3bdfaf5d93961db2b8d29e5e28577810ae1918c309b1baf4ef0a6ff007"
    text_source: "raw_text"
---

# NYC DOT Bus Lanes Dataset Columns

source_id: bus_lanes_dataset_dictionary
citation: cite block ids exactly as shown in square brackets
document: 1829 block(s)

## Page 1

[p001_b0001] [
[p001_b0002] {
### [p001_b0003] "id": 617611143,
### [p001_b0004] "name": "the_geom",
### [p001_b0005] "dataTypeName": "multiline",
### [p001_b0006] "description": "",
### [p001_b0007] "fieldName": "the_geom",
### [p001_b0008] "position": 1,
### [p001_b0009] "renderTypeName": "multiline",
### [p001_b0010] "tableColumnId": 124489671,
### [p001_b0011] "format": {}
[p001_b0012] },
[p001_b0013] {
### [p001_b0014] "id": 617611144,
### [p001_b0015] "name": "Street",
### [p001_b0016] "dataTypeName": "text",
### [p001_b0017] "description": "Street of the bus lane",
### [p001_b0018] "fieldName": "street",
### [p001_b0019] "position": 2,
### [p001_b0020] "renderTypeName": "text",
### [p001_b0021] "tableColumnId": 124489672,
### [p001_b0022] "cachedContents": {
### [p001_b0023] "non_null": "4068",
### [p001_b0024] "largest": "WOODHAVEN BOULEVARD",
### [p001_b0025] "null": "0",
### [p001_b0026] "top": [
[p001_b0027] {
### [p001_b0028] "item": "HILLSIDE AVENUE",
### [p001_b0029] "count": "284"
[p001_b0030] },
[p001_b0031] {
### [p001_b0032] "item": "1 AVENUE",
### [p001_b0033] "count": "204"
[p001_b0034] },
[p001_b0035] {
### [p001_b0036] "item": "WOODHAVEN BOULEVARD",
### [p001_b0037] "count": "203"
[p001_b0038] },
[p001_b0039] {
### [p001_b0040] "item": "WEBSTER AVENUE",
### [p001_b0041] "count": "202"
[p001_b0042] },
[p001_b0043] {
### [p001_b0044] "item": "HYLAN BOULEVARD",
### [p001_b0045] "count": "191"
[p001_b0046] },
[p001_b0047] {
### [p001_b0048] "item": "2 AVENUE",
### [p001_b0049] "count": "167"
[p001_b0050] },
[p001_b0051] {
### [p001_b0052] "item": "NOSTRAND AVENUE",
### [p001_b0053] "count": "125"
[p001_b0054] },
[p001_b0055] {
### [p001_b0056] "item": "NORTHERN BOULEVARD",
### [p001_b0057] "count": "125"
[p001_b0058] },
[p001_b0059] {
### [p001_b0060] "item": "STORY AVENUE",
### [p001_b0061] "count": "122"
[p001_b0062] },
[p001_b0063] {
### [p001_b0064] "item": "3 AVENUE",
### [p001_b0065] "count": "118"
[p001_b0066] },
[p001_b0067] {
### [p001_b0068] "item": "MERRICK BOULEVARD",
### [p001_b0069] "count": "109"
[p001_b0070] },
[p001_b0071] {
### [p001_b0072] "item": "EAST GUN HILL ROAD",
### [p001_b0073] "count": "109"
[p001_b0074] },
[p001_b0075] {
### [p001_b0076] "item": "21 STREET",
### [p001_b0077] "count": "100"
[p001_b0078] },
[p001_b0079] {
### [p001_b0080] "item": "UTICA AVENUE",
### [p001_b0081] "count": "89"
[p001_b0082] },
[p001_b0083] {
### [p001_b0084] "item": "5 AVENUE",
### [p001_b0085] "count": "87"
[p001_b0086] },
[p001_b0087] {
### [p001_b0088] "item": "FULTON STREET",
### [p001_b0089] "count": "81"
[p001_b0090] },
[p001_b0091] {
### [p001_b0092] "item": "BROADWAY",
### [p001_b0093] "count": "75"
[p001_b0094] },
[p001_b0095] {
### [p001_b0096] "item": "LEXINGTON AVENUE",
### [p001_b0097] "count": "72"
[p001_b0098] },
[p001_b0099] {
### [p001_b0100] "item": "EAST 149 STREET",
### [p001_b0101] "count": "70"
[p001_b0102] },
[p001_b0103] {
### [p001_b0104] "item": "EAST FORDHAM ROAD",
### [p001_b0105] "count": "68"
[p001_b0106] }
[p001_b0107] ],
### [p001_b0108] "smallest": "11 AVENUE",
### [p001_b0109] "count": "4068",
### [p001_b0110] "cardinality": "4068"
[p001_b0111] },
### [p001_b0112] "format": {}
[p001_b0113] },
[p001_b0114] {
### [p001_b0115] "id": 617611145,
### [p001_b0116] "name": "TrafDir",
### [p001_b0117] "dataTypeName": "text",
[p001_b0118] "description": "Bus Lane Traffic Direction. Code indicating the flow of bus traffic in bus lane relative to the street segment's directionality.",
### [p001_b0119] "fieldName": "bltrafdir",
### [p001_b0120] "position": 3,
### [p001_b0121] "renderTypeName": "text",
### [p001_b0122] "tableColumnId": 124489673,
### [p001_b0123] "cachedContents": {
### [p001_b0124] "non_null": "4066",
### [p001_b0125] "largest": "W",
### [p001_b0126] "null": "2",
### [p001_b0127] "top": [
[p001_b0128] {
### [p001_b0129] "item": "T",
### [p001_b0130] "count": "2144"
[p001_b0131] },
[p001_b0132] {
### [p001_b0133] "item": "A",
### [p001_b0134] "count": "1008"
[p001_b0135] },
[p001_b0136] {
### [p001_b0137] "item": "W",
### [p001_b0138] "count": "913"
[p001_b0139] },
[p001_b0140] {
### [p001_b0141] "item": "P",
### [p001_b0142] "count": "1"
[p001_b0143] }
[p001_b0144] ],
### [p001_b0145] "smallest": "A",
### [p001_b0146] "count": "4068",
### [p001_b0147] "cardinality": "4068"
[p001_b0148] },
### [p001_b0149] "format": {}
[p001_b0150] },
[p001_b0151] {
### [p001_b0152] "id": 617611146,
### [p001_b0153] "name": "SegmentID",
### [p001_b0154] "dataTypeName": "text",
[p001_b0155] "description": "Segment ID: A seven digit number (right justified, zero filled) that identifies each segment of a street or a non-street feature represented in the LION file.",
### [p001_b0156] "fieldName": "segmentid",
### [p001_b0157] "position": 4,
### [p001_b0158] "renderTypeName": "text",
### [p001_b0159] "tableColumnId": 124489674,
### [p001_b0160] "cachedContents": {
### [p001_b0161] "non_null": "4068",
### [p001_b0162] "largest": "9024008",
### [p001_b0163] "null": "0",
### [p001_b0164] "top": [
[p001_b0165] {
### [p001_b0166] "item": "0057466",
### [p001_b0167] "count": "6"
[p001_b0168] },
[p001_b0169] {
### [p001_b0170] "item": "9004294",
### [p001_b0171] "count": "6"
[p001_b0172] },
[p001_b0173] {
### [p001_b0174] "item": "9004292",
### [p001_b0175] "count": "6"
[p001_b0176] },
[p001_b0177] {
### [p001_b0178] "item": "9004324",
### [p001_b0179] "count": "4"
[p001_b0180] },
[p001_b0181] {
### [p001_b0182] "item": "9004296",
### [p001_b0183] "count": "4"
[p001_b0184] },
[p001_b0185] {
### [p001_b0186] "item": "0060110",
### [p001_b0187] "count": "4"
[p001_b0188] },
[p001_b0189] {
### [p001_b0190] "item": "0060907",
### [p001_b0191] "count": "4"
[p001_b0192] },
[p001_b0193] {
### [p001_b0194] "item": "0115894",
### [p001_b0195] "count": "4"
[p001_b0196] },
[p001_b0197] {
### [p001_b0198] "item": "0061035",
### [p001_b0199] "count": "4"
[p001_b0200] },
[p001_b0201] {
### [p001_b0202] "item": "0060768",
### [p001_b0203] "count": "4"
[p001_b0204] },
[p001_b0205] {
### [p001_b0206] "item": "0060598",
### [p001_b0207] "count": "4"
[p001_b0208] },
[p001_b0209] {
### [p001_b0210] "item": "0060429",
### [p001_b0211] "count": "4"
[p001_b0212] },
[p001_b0213] {
### [p001_b0214] "item": "9004332",
### [p001_b0215] "count": "4"
[p001_b0216] },
[p001_b0217] {
### [p001_b0218] "item": "9004327",
### [p001_b0219] "count": "4"
[p001_b0220] },
[p001_b0221] {
### [p001_b0222] "item": "9004318",
### [p001_b0223] "count": "4"
[p001_b0224] },
[p001_b0225] {
### [p001_b0226] "item": "0171158",
### [p001_b0227] "count": "4"
[p001_b0228] },
[p001_b0229] {
### [p001_b0230] "item": "0060262",
### [p001_b0231] "count": "4"
[p001_b0232] },
[p001_b0233] {
### [p001_b0234] "item": "0115893",
### [p001_b0235] "count": "4"
[p001_b0236] },
[p001_b0237] {
### [p001_b0238] "item": "0061021",
### [p001_b0239] "count": "4"
[p001_b0240] },
[p001_b0241] {
### [p001_b0242] "item": "0076625",
### [p001_b0243] "count": "4"
[p001_b0244] }
[p001_b0245] ],
### [p001_b0246] "smallest": "0005839",
### [p001_b0247] "count": "4068",
### [p001_b0248] "cardinality": "4068"
[p001_b0249] },
### [p001_b0250] "format": {}
[p001_b0251] },
[p001_b0252] {
### [p001_b0253] "id": 617611147,
### [p001_b0254] "name": "RW_TYPE",
### [p001_b0255] "dataTypeName": "text",
[p001_b0256] "description": "Roadway type (example: street, highway, bridge, tunnel, alley, etc.)",
### [p001_b0257] "fieldName": "rw_type",
### [p001_b0258] "position": 5,
### [p001_b0259] "renderTypeName": "text",
### [p001_b0260] "tableColumnId": 124489675,
### [p001_b0261] "cachedContents": {
### [p001_b0262] "non_null": "3775",
### [p001_b0263] "largest": "9",
### [p001_b0264] "null": "293",
### [p001_b0265] "top": [
[p001_b0266] {
### [p001_b0267] "item": "1",
### [p001_b0268] "count": "3723"
[p001_b0269] },
[p001_b0270] {
### [p001_b0271] "item": "3",
### [p001_b0272] "count": "25"
[p001_b0273] },
[p001_b0274] {
### [p001_b0275] "item": "2",
### [p001_b0276] "count": "19"
[p001_b0277] },
[p001_b0278] {
### [p001_b0279] "item": "9",
### [p001_b0280] "count": "6"
[p001_b0281] },
[p001_b0282] {
### [p001_b0283] "item": "13",
### [p001_b0284] "count": "1"
[p001_b0285] },
[p001_b0286] {
### [p001_b0287] "item": "6",
### [p001_b0288] "count": "1"
[p001_b0289] }
[p001_b0290] ],
### [p001_b0291] "smallest": "1",
### [p001_b0292] "count": "4068",
### [p001_b0293] "cardinality": "4068"
[p001_b0294] },
### [p001_b0295] "format": {}
[p001_b0296] },
[p001_b0297] {
### [p001_b0298] "id": 617611148,
### [p001_b0299] "name": "StreetWidt",
### [p001_b0300] "dataTypeName": "number",
### [p001_b0301] "description": "Approximate width, in feet, of the paved area of the street",
### [p001_b0302] "fieldName": "streetwidt",
### [p001_b0303] "position": 6,
### [p001_b0304] "renderTypeName": "number",
### [p001_b0305] "tableColumnId": 124489676,
### [p001_b0306] "cachedContents": {
### [p001_b0307] "non_null": "4068",
### [p001_b0308] "largest": "134.0",
### [p001_b0309] "null": "0",
### [p001_b0310] "top": [
[p001_b0311] {
### [p001_b0312] "item": "0.0",
### [p001_b0313] "count": "682"
[p001_b0314] },
[p001_b0315] {
### [p001_b0316] "item": "60.0",
### [p001_b0317] "count": "660"
[p001_b0318] },
[p001_b0319] {
### [p001_b0320] "item": "70.0",
### [p001_b0321] "count": "573"
[p001_b0322] },
[p001_b0323] {
### [p001_b0324] "item": "30.0",
### [p001_b0325] "count": "240"
[p001_b0326] },
[p001_b0327] {
### [p001_b0328] "item": "50.0",
### [p001_b0329] "count": "186"
[p001_b0330] },
[p001_b0331] {
### [p001_b0332] "item": "52.0",
### [p001_b0333] "count": "170"
[p001_b0334] },
[p001_b0335] {
### [p001_b0336] "item": "44.0",
### [p001_b0337] "count": "170"
[p001_b0338] },
[p001_b0339] {
### [p001_b0340] "item": "40.0",
### [p001_b0341] "count": "169"
[p001_b0342] },
[p001_b0343] {
### [p001_b0344] "item": "32.0",
### [p001_b0345] "count": "154"
[p001_b0346] },
[p001_b0347] {
### [p001_b0348] "item": "54.0",
### [p001_b0349] "count": "83"
[p001_b0350] },
[p001_b0351] {
### [p001_b0352] "item": "48.0",
### [p001_b0353] "count": "79"
[p001_b0354] },
[p001_b0355] {
### [p001_b0356] "item": "55.0",
### [p001_b0357] "count": "79"
[p001_b0358] },
[p001_b0359] {
### [p001_b0360] "item": "34.0",
### [p001_b0361] "count": "78"
[p001_b0362] },
[p001_b0363] {
### [p001_b0364] "item": "62.0",
### [p001_b0365] "count": "76"
[p001_b0366] },
[p001_b0367] {
### [p001_b0368] "item": "68.0",
### [p001_b0369] "count": "62"
[p001_b0370] },
[p001_b0371] {
### [p001_b0372] "item": "38.0",
### [p001_b0373] "count": "60"
[p001_b0374] },
[p001_b0375] {
### [p001_b0376] "item": "42.0",
### [p001_b0377] "count": "54"
[p001_b0378] },
[p001_b0379] {
### [p001_b0380] "item": "45.0",
### [p001_b0381] "count": "42"
[p001_b0382] },
[p001_b0383] {
### [p001_b0384] "item": "58.0",
### [p001_b0385] "count": "42"
[p001_b0386] },
[p001_b0387] {
### [p001_b0388] "item": "24.0",
### [p001_b0389] "count": "41"
[p001_b0390] }
[p001_b0391] ],
### [p001_b0392] "smallest": "0.0",
### [p001_b0393] "count": "4068",
### [p001_b0394] "cardinality": "4068"
[p001_b0395] },
### [p001_b0396] "format": {}
[p001_b0397] },
[p001_b0398] {
### [p001_b0399] "id": 617611149,
### [p001_b0400] "name": "Boro",
### [p001_b0401] "dataTypeName": "text",
### [p001_b0402] "description": "The borough of the bus lane",
### [p001_b0403] "fieldName": "boro",
### [p001_b0404] "position": 7,
### [p001_b0405] "renderTypeName": "text",
### [p001_b0406] "tableColumnId": 124489677,
### [p001_b0407] "cachedContents": {
### [p001_b0408] "non_null": "4068",
### [p001_b0409] "largest": "SI",
### [p001_b0410] "null": "0",
### [p001_b0411] "top": [
[p001_b0412] {
### [p001_b0413] "item": "MAN",
### [p001_b0414] "count": "1304"
[p001_b0415] },
[p001_b0416] {
### [p001_b0417] "item": "QNS",
### [p001_b0418] "count": "1083"
[p001_b0419] },
[p001_b0420] {
### [p001_b0421] "item": "BX",
### [p001_b0422] "count": "797"
[p001_b0423] },
[p001_b0424] {
### [p001_b0425] "item": "BK",
### [p001_b0426] "count": "569"
[p001_b0427] },
[p001_b0428] {
### [p001_b0429] "item": "SI",
### [p001_b0430] "count": "284"
[p001_b0431] },
[p001_b0432] {
### [p001_b0433] "item": "BX, MN",
### [p001_b0434] "count": "31"
[p001_b0435] }
[p001_b0436] ],
### [p001_b0437] "smallest": "BK",
### [p001_b0438] "count": "4068",
### [p001_b0439] "cardinality": "4068"
[p001_b0440] },
### [p001_b0441] "format": {}
[p001_b0442] },
[p001_b0443] {
### [p001_b0444] "id": 617611150,
### [p001_b0445] "name": "Facility",
### [p001_b0446] "dataTypeName": "text",
### [p001_b0447] "description": "Street name of bus lane with travel direction of lane",
### [p001_b0448] "fieldName": "facility",
### [p001_b0449] "position": 8,
### [p001_b0450] "renderTypeName": "text",
### [p001_b0451] "tableColumnId": 124489678,
### [p001_b0452] "cachedContents": {
### [p001_b0453] "non_null": "4068",
### [p001_b0454] "largest": "Woodhaven Boulevard",
### [p001_b0455] "null": "0",
### [p001_b0456] "top": [
[p001_b0457] {
### [p001_b0458] "item": "Hillside Avenue",
### [p001_b0459] "count": "284"
[p001_b0460] },
[p001_b0461] {
### [p001_b0462] "item": "Woodhaven Boulevard",
### [p001_b0463] "count": "248"
[p001_b0464] },
[p001_b0465] {
### [p001_b0466] "item": "1st Avenue",
### [p001_b0467] "count": "204"
[p001_b0468] },
[p001_b0469] {
### [p001_b0470] "item": "Webster Avenue",
### [p001_b0471] "count": "202"
[p001_b0472] },
[p001_b0473] {
### [p001_b0474] "item": "2nd Avenue",
### [p001_b0475] "count": "167"
[p001_b0476] },
[p001_b0477] {
### [p001_b0478] "item": "Hylan Boulevard",
### [p001_b0479] "count": "126"
[p001_b0480] },
[p001_b0481] {
### [p001_b0482] "item": "Northern Boulevard",
### [p001_b0483] "count": "125"
[p001_b0484] },
[p001_b0485] {
### [p001_b0486] "item": "Nostrand Avenue",
### [p001_b0487] "count": "125"
[p001_b0488] },
[p001_b0489] {
### [p001_b0490] "item": "Story Avenue",
### [p001_b0491] "count": "122"
[p001_b0492] },
[p001_b0493] {
### [p001_b0494] "item": "Gun Hill Road",
### [p001_b0495] "count": "109"
[p001_b0496] },
[p001_b0497] {
### [p001_b0498] "item": "Merrick Boulevard",
### [p001_b0499] "count": "109"
[p001_b0500] },
[p001_b0501] {
### [p001_b0502] "item": "21st",
### [p001_b0503] "count": "100"
[p001_b0504] },
[p001_b0505] {
### [p001_b0506] "item": "Utica Avenue",
### [p001_b0507] "count": "89"
[p001_b0508] },
[p001_b0509] {
### [p001_b0510] "item": "5th Avenue",
### [p001_b0511] "count": "87"
[p001_b0512] },
[p001_b0513] {
### [p001_b0514] "item": "Fordham Road",
### [p001_b0515] "count": "84"
[p001_b0516] },
[p001_b0517] {
### [p001_b0518] "item": "Fulton Street",
### [p001_b0519] "count": "81"
[p001_b0520] },
[p001_b0521] {
### [p001_b0522] "item": "Broadway",
### [p001_b0523] "count": "75"
[p001_b0524] },
[p001_b0525] {
### [p001_b0526] "item": "Lexington Avenue",
### [p001_b0527] "count": "72"
[p001_b0528] },
[p001_b0529] {
### [p001_b0530] "item": "Kings Highway",
### [p001_b0531] "count": "67"
[p001_b0532] },
[p001_b0533] {
### [p001_b0534] "item": "Hylan Bl",
### [p001_b0535] "count": "65"
[p001_b0536] }
[p001_b0537] ],
### [p001_b0538] "smallest": "11th Avenue",
### [p001_b0539] "count": "4068",
### [p001_b0540] "cardinality": "4068"
[p001_b0541] },
### [p001_b0542] "format": {}
[p001_b0543] },
[p001_b0544] {
### [p001_b0545] "id": 617611198,
### [p001_b0546] "name": "Direction",
### [p001_b0547] "dataTypeName": "text",
### [p001_b0548] "description": "Direction of travel of the street\n",
### [p001_b0549] "fieldName": "direction",
### [p001_b0550] "position": 9,
### [p001_b0551] "renderTypeName": "text",
### [p001_b0552] "tableColumnId": 161816237,
### [p001_b0553] "cachedContents": {
### [p001_b0554] "non_null": "4055",
### [p001_b0555] "largest": "WB",
### [p001_b0556] "null": "13",
### [p001_b0557] "top": [
[p001_b0558] {
### [p001_b0559] "item": "NB",
### [p001_b0560] "count": "1292"
[p001_b0561] },
[p001_b0562] {
### [p001_b0563] "item": "SB",
### [p001_b0564] "count": "1149"
[p001_b0565] },
[p001_b0566] {
### [p001_b0567] "item": "EB",
### [p001_b0568] "count": "827"
[p001_b0569] },
[p001_b0570] {
### [p001_b0571] "item": "WB",
### [p001_b0572] "count": "787"
[p001_b0573] }
[p001_b0574] ],
### [p001_b0575] "smallest": "EB",
### [p001_b0576] "count": "4068",
### [p001_b0577] "cardinality": "4068"
[p001_b0578] },
### [p001_b0579] "format": {}
[p001_b0580] },
[p001_b0581] {
### [p001_b0582] "id": 617611151,
### [p001_b0583] "name": "Hours",
### [p001_b0584] "dataTypeName": "text",
### [p001_b0585] "description": "The hours the bus lanes are in effect",
### [p001_b0586] "fieldName": "hours",
### [p001_b0587] "position": 10,
### [p001_b0588] "renderTypeName": "text",
### [p001_b0589] "tableColumnId": 124489679,
### [p001_b0590] "cachedContents": {
### [p001_b0591] "non_null": "4054",
### [p001_b0592] "largest": "7AM-9PM",
### [p001_b0593] "null": "14",
### [p001_b0594] "top": [
[p001_b0595] {
### [p001_b0596] "item": "24 Hours",
### [p001_b0597] "count": "2295"
[p001_b0598] },
[p001_b0599] {
### [p001_b0600] "item": "7AM-7PM",
### [p001_b0601] "count": "449"
[p001_b0602] },
[p001_b0603] {
### [p001_b0604] "item": "7AM-9PM",
### [p001_b0605] "count": "127"
[p001_b0606] },
[p001_b0607] {
### [p001_b0608] "item": "6AM-9AM",
### [p001_b0609] "count": "109"
[p001_b0610] },
[p001_b0611] {
### [p001_b0612] "item": "7AM-10AM/4PM-7PM",
### [p001_b0613] "count": "109"
[p001_b0614] },
[p001_b0615] {
### [p001_b0616] "item": "7AM-10AM/2PM-7PM",
### [p001_b0617] "count": "101"
[p001_b0618] },
[p001_b0619] {
### [p001_b0620] "item": "4PM-7PM",
### [p001_b0621] "count": "93"
[p001_b0622] },
[p001_b0623] {
### [p001_b0624] "item": "3PM-7PM",
### [p001_b0625] "count": "91"
[p001_b0626] },
[p001_b0627] {
### [p001_b0628] "item": "7AM-9AM",
### [p001_b0629] "count": "87"
[p001_b0630] },
[p001_b0631] {
### [p001_b0632] "item": "7AM-10AM",
### [p001_b0633] "count": "68"
[p001_b0634] },
[p001_b0635] {
### [p001_b0636] "item": "7AM - 8PM",
### [p001_b0637] "count": "64"
[p001_b0638] },
[p001_b0639] {
### [p001_b0640] "item": "6 AM - 7 PM",
### [p001_b0641] "count": "54"
[p001_b0642] },
[p001_b0643] {
### [p001_b0644] "item": "6AM-10PM",
### [p001_b0645] "count": "49"
[p001_b0646] },
[p001_b0647] {
### [p001_b0648] "item": "7AM-10AM / 4PM-8PM",
### [p001_b0649] "count": "42"
[p001_b0650] },
[p001_b0651] {
### [p001_b0652] "item": "7 AM - 7 PM",
### [p001_b0653] "count": "40"
[p001_b0654] },
[p001_b0655] {
### [p001_b0656] "item": "7 AM - 8 PM",
### [p001_b0657] "count": "34"
[p001_b0658] },
[p001_b0659] {
### [p001_b0660] "item": "7AM-10AM/12PM-7PM",
### [p001_b0661] "count": "31"
[p001_b0662] },
[p001_b0663] {
### [p001_b0664] "item": "7AM-6PM",
### [p001_b0665] "count": "28"
[p001_b0666] },
[p001_b0667] {
### [p001_b0668] "item": "7AM-12PM/2PM-7PM",
### [p001_b0669] "count": "22"
[p001_b0670] },
[p001_b0671] {
### [p001_b0672] "item": "7AM - 7PM",
### [p001_b0673] "count": "20"
[p001_b0674] }
[p001_b0675] ],
### [p001_b0676] "smallest": "24 hour",
### [p001_b0677] "count": "4068",
### [p001_b0678] "cardinality": "4068"
[p001_b0679] },
### [p001_b0680] "format": {}
[p001_b0681] },
[p001_b0682] {
### [p001_b0683] "id": 617611152,
### [p001_b0684] "name": "Days",
### [p001_b0685] "dataTypeName": "text",
### [p001_b0686] "description": "The days the bus lanes are in effect",
### [p001_b0687] "fieldName": "days",
### [p001_b0688] "position": 11,
### [p001_b0689] "renderTypeName": "text",
### [p001_b0690] "tableColumnId": 124489680,
### [p001_b0691] "cachedContents": {
### [p001_b0692] "non_null": "4067",
### [p001_b0693] "largest": "Mon - Sat",
### [p001_b0694] "null": "1",
### [p001_b0695] "top": [
[p001_b0696] {
### [p001_b0697] "item": "7 Days/Week",
### [p001_b0698] "count": "2567"
[p001_b0699] },
[p001_b0700] {
### [p001_b0701] "item": "Mon - Fri",
### [p001_b0702] "count": "1410"
[p001_b0703] },
[p001_b0704] {
### [p001_b0705] "item": "Mon - Sat",
### [p001_b0706] "count": "69"
[p001_b0707] },
[p001_b0708] {
### [p001_b0709] "item": "Mon-Fri",
### [p001_b0710] "count": "20"
[p001_b0711] },
[p001_b0712] {
### [p001_b0713] "item": "& Days/Week",
### [p001_b0714] "count": "1"
[p001_b0715] }
[p001_b0716] ],
### [p001_b0717] "smallest": "7 Days/Week",
### [p001_b0718] "count": "4068",
### [p001_b0719] "cardinality": "4068"
[p001_b0720] },
### [p001_b0721] "format": {}
[p001_b0722] },
[p001_b0723] {
### [p001_b0724] "id": 617611163,
### [p001_b0725] "name": "Days_Code",
### [p001_b0726] "dataTypeName": "number",
### [p001_b0727] "description": "Number of days per week bus lane is in effect.",
### [p001_b0728] "fieldName": "days_code",
### [p001_b0729] "position": 12,
### [p001_b0730] "renderTypeName": "number",
### [p001_b0731] "tableColumnId": 124489691,
### [p001_b0732] "cachedContents": {
### [p001_b0733] "non_null": "4068",
### [p001_b0734] "largest": "7.0",
### [p001_b0735] "null": "0",
### [p001_b0736] "top": [
[p001_b0737] {
### [p001_b0738] "item": "7.0",
### [p001_b0739] "count": "2584"
[p001_b0740] },
[p001_b0741] {
### [p001_b0742] "item": "5.0",
### [p001_b0743] "count": "1413"
[p001_b0744] },
[p001_b0745] {
### [p001_b0746] "item": "6.0",
### [p001_b0747] "count": "70"
[p001_b0748] },
[p001_b0749] {
### [p001_b0750] "item": "0.0",
### [p001_b0751] "count": "1"
[p001_b0752] }
[p001_b0753] ],
### [p001_b0754] "smallest": "0.0",
### [p001_b0755] "count": "4068",
### [p001_b0756] "cardinality": "4068"
[p001_b0757] },
### [p001_b0758] "format": {}
[p001_b0759] },
[p001_b0760] {
### [p001_b0761] "id": 617611153,
### [p001_b0762] "name": "Lane_width",
### [p001_b0763] "dataTypeName": "text",
### [p001_b0764] "description": "Single or dual bus lanes",
### [p001_b0765] "fieldName": "lane_width",
### [p001_b0766] "position": 13,
### [p001_b0767] "renderTypeName": "text",
### [p001_b0768] "tableColumnId": 124489681,
### [p001_b0769] "cachedContents": {
### [p001_b0770] "non_null": "3980",
### [p001_b0771] "largest": "Single",
### [p001_b0772] "null": "88",
### [p001_b0773] "top": [
[p001_b0774] {
### [p001_b0775] "item": "Single",
### [p001_b0776] "count": "3919"
[p001_b0777] },
[p001_b0778] {
### [p001_b0779] "item": "Double",
### [p001_b0780] "count": "61"
[p001_b0781] }
[p001_b0782] ],
### [p001_b0783] "smallest": "Double",
### [p001_b0784] "count": "4068",
### [p001_b0785] "cardinality": "4068"
[p001_b0786] },
### [p001_b0787] "format": {}
[p001_b0788] },
[p001_b0789] {
### [p001_b0790] "id": 617611158,
### [p001_b0791] "name": "Lane_Type1",
### [p001_b0792] "dataTypeName": "text",
### [p001_b0793] "description": "The type of bus lane.",
### [p001_b0794] "fieldName": "lane_type1",
### [p001_b0795] "position": 14,
### [p001_b0796] "renderTypeName": "text",
### [p001_b0797] "tableColumnId": 124489686,
### [p001_b0798] "cachedContents": {
### [p001_b0799] "non_null": "3683",
### [p001_b0800] "largest": "Shared Lane",
### [p001_b0801] "null": "385",
### [p001_b0802] "top": [
[p001_b0803] {
### [p001_b0804] "item": "Bus Lane",
### [p001_b0805] "count": "2572"
[p001_b0806] },
[p001_b0807] {
### [p001_b0808] "item": "Shared Lane",
### [p001_b0809] "count": "1111"
[p001_b0810] }
[p001_b0811] ],
### [p001_b0812] "smallest": "Bus Lane",
### [p001_b0813] "count": "4068",
### [p001_b0814] "cardinality": "4068"
[p001_b0815] },
### [p001_b0816] "format": {}
[p001_b0817] },
[p001_b0818] {
### [p001_b0819] "id": 617611197,
### [p001_b0820] "name": "Lane_Type",
### [p001_b0821] "dataTypeName": "text",
### [p001_b0822] "description": "A description on the type of bus lane.",
### [p001_b0823] "fieldName": "lane_type",
### [p001_b0824] "position": 15,
### [p001_b0825] "renderTypeName": "text",
### [p001_b0826] "tableColumnId": 161816236,
### [p001_b0827] "cachedContents": {
### [p001_b0828] "non_null": "4067",
### [p001_b0829] "largest": "Shoulder",
### [p001_b0830] "null": "1",
### [p001_b0831] "top": [
[p001_b0832] {
### [p001_b0833] "item": "Offset",
### [p001_b0834] "count": "1913"
[p001_b0835] },
[p001_b0836] {
### [p001_b0837] "item": "Curbside",
### [p001_b0838] "count": "1771"
[p001_b0839] },
[p001_b0840] {
### [p001_b0841] "item": "Busway",
### [p001_b0842] "count": "129"
[p001_b0843] },
[p001_b0844] {
### [p001_b0845] "item": "Median",
### [p001_b0846] "count": "120"
[p001_b0847] },
[p001_b0848] {
### [p001_b0849] "item": "Center Running",
### [p001_b0850] "count": "49"
[p001_b0851] },
[p001_b0852] {
### [p001_b0853] "item": "Left-side running",
### [p001_b0854] "count": "28"
[p001_b0855] },
[p001_b0856] {
### [p001_b0857] "item": "Bus lane on shoulder",
### [p001_b0858] "count": "19"
[p001_b0859] },
[p001_b0860] {
### [p001_b0861] "item": "Contraflow",
### [p001_b0862] "count": "7"
[p001_b0863] },
[p001_b0864] {
### [p001_b0865] "item": "Enhanced Bus Stop",
### [p001_b0866] "count": "7"
[p001_b0867] },
[p001_b0868] {
### [p001_b0869] "item": "Shoulder",
### [p001_b0870] "count": "6"
[p001_b0871] },
[p001_b0872] {
### [p001_b0873] "item": "bus lane on shoulder",
### [p001_b0874] "count": "6"
[p001_b0875] },
[p001_b0876] {
### [p001_b0877] "item": "Queue Jump",
### [p001_b0878] "count": "4"
[p001_b0879] },
[p001_b0880] {
### [p001_b0881] "item": "Enhanced bus stop",
### [p001_b0882] "count": "4"
[p001_b0883] },
[p001_b0884] {
### [p001_b0885] "item": "Buses and local deliveries only",
### [p001_b0886] "count": "2"
[p001_b0887] },
[p001_b0888] {
### [p001_b0889] "item": "Left Turn Lane",
### [p001_b0890] "count": "1"
[p001_b0891] },
[p001_b0892] {
### [p001_b0893] "item": "Bus Only",
### [p001_b0894] "count": "1"
[p001_b0895] }
[p001_b0896] ],
### [p001_b0897] "smallest": "Buses and local deliveries only",
### [p001_b0898] "count": "4068",
### [p001_b0899] "cardinality": "4068"
[p001_b0900] },
### [p001_b0901] "format": {}
[p001_b0902] },
[p001_b0903] {
### [p001_b0904] "id": 617611159,
### [p001_b0905] "name": "Lane_Descr",
### [p001_b0906] "dataTypeName": "text",
### [p001_b0907] "description": "A secondary description on the type of bus lane.",
### [p001_b0908] "fieldName": "lane_type2",
### [p001_b0909] "position": 16,
### [p001_b0910] "renderTypeName": "text",
### [p001_b0911] "tableColumnId": 124489687,
### [p001_b0912] "cachedContents": {
### [p001_b0913] "non_null": "719",
### [p001_b0914] "largest": "Quick Kerb",
### [p001_b0915] "null": "3349",
### [p001_b0916] "top": [
[p001_b0917] {
### [p001_b0918] "item": "Paint",
### [p001_b0919] "count": "570"
[p001_b0920] },
[p001_b0921] {
### [p001_b0922] "item": "Bus Only Lane",
### [p001_b0923] "count": "63"
[p001_b0924] },
[p001_b0925] {
### [p001_b0926] "item": "Queue Jump",
### [p001_b0927] "count": "13"
[p001_b0928] },
[p001_b0929] {
### [p001_b0930] "item": "Offset",
### [p001_b0931] "count": "13"
[p001_b0932] },
[p001_b0933] {
### [p001_b0934] "item": "Median",
### [p001_b0935] "count": "13"
[p001_b0936] },
[p001_b0937] {
### [p001_b0938] "item": "Curbside",
### [p001_b0939] "count": "11"
[p001_b0940] },
[p001_b0941] {
### [p001_b0942] "item": "Intermittent queue jumps",
### [p001_b0943] "count": "10"
[p001_b0944] },
[p001_b0945] {
### [p001_b0946] "item": "Concrete",
### [p001_b0947] "count": "5"
[p001_b0948] },
[p001_b0949] {
### [p001_b0950] "item": "Contraflow",
### [p001_b0951] "count": "5"
[p001_b0952] },
[p001_b0953] {
### [p001_b0954] "item": "Enhanced Bus Stop",
### [p001_b0955] "count": "5"
[p001_b0956] },
[p001_b0957] {
### [p001_b0958] "item": "Quick curb",
### [p001_b0959] "count": "5"
[p001_b0960] },
[p001_b0961] {
### [p001_b0962] "item": "Quick Kerb",
### [p001_b0963] "count": "4"
[p001_b0964] },
[p001_b0965] {
### [p001_b0966] "item": "Bus Only Left Turn Bay",
### [p001_b0967] "count": "1"
[p001_b0968] },
[p001_b0969] {
### [p001_b0970] "item": "Continuous",
### [p001_b0971] "count": "1"
[p001_b0972] }
[p001_b0973] ],
### [p001_b0974] "smallest": "Bus Only Lane",
### [p001_b0975] "count": "4068",
### [p001_b0976] "cardinality": "4068"
[p001_b0977] },
### [p001_b0978] "format": {}
[p001_b0979] },
[p001_b0980] {
### [p001_b0981] "id": 617611165,
### [p001_b0982] "name": "Lane_Color",
### [p001_b0983] "dataTypeName": "text",
### [p001_b0984] "description": "Color of bus lanes",
### [p001_b0985] "fieldName": "lane_color",
### [p001_b0986] "position": 17,
### [p001_b0987] "renderTypeName": "text",
### [p001_b0988] "tableColumnId": 124489693,
### [p001_b0989] "cachedContents": {
### [p001_b0990] "non_null": "2982",
### [p001_b0991] "largest": "Red",
### [p001_b0992] "null": "1086",
### [p001_b0993] "top": [
[p001_b0994] {
### [p001_b0995] "item": "Red",
### [p001_b0996] "count": "2929"
[p001_b0997] },
[p001_b0998] {
### [p001_b0999] "item": "None",
### [p001_b1000] "count": "32"
[p001_b1001] },
[p001_b1002] {
### [p001_b1003] "item": "No",
### [p001_b1004] "count": "14"
[p001_b1005] },
[p001_b1006] {
### [p001_b1007] "item": "No/Never",
### [p001_b1008] "count": "7"
[p001_b1009] }
[p001_b1010] ],
### [p001_b1011] "smallest": "No",
### [p001_b1012] "count": "4068",
### [p001_b1013] "cardinality": "4068"
[p001_b1014] },
### [p001_b1015] "format": {}
[p001_b1016] },
[p001_b1017] {
### [p001_b1018] "id": 617611160,
### [p001_b1019] "name": "SBS_Route1",
### [p001_b1020] "dataTypeName": "text",
### [p001_b1021] "description": "Select Bus Service (SBS) route(s) using bus lane",
### [p001_b1022] "fieldName": "sbs_route1",
### [p001_b1023] "position": 18,
### [p001_b1024] "renderTypeName": "text",
### [p001_b1025] "tableColumnId": 124489688,
### [p001_b1026] "cachedContents": {
### [p001_b1027] "non_null": "1861",
### [p001_b1028] "largest": "S79",
### [p001_b1029] "null": "2207",
### [p001_b1030] "top": [
[p001_b1031] {
### [p001_b1032] "item": "M15",
### [p001_b1033] "count": "381"
[p001_b1034] },
[p001_b1035] {
### [p001_b1036] "item": "Q52",
### [p001_b1037] "count": "270"
[p001_b1038] },
[p001_b1039] {
### [p001_b1040] "item": "S79",
### [p001_b1041] "count": "204"
[p001_b1042] },
[p001_b1043] {
### [p001_b1044] "item": "BX41",
### [p001_b1045] "count": "202"
[p001_b1046] },
[p001_b1047] {
### [p001_b1048] "item": "B44",
### [p001_b1049] "count": "180"
[p001_b1050] },
[p001_b1051] {
### [p001_b1052] "item": "B82",
### [p001_b1053] "count": "105"
[p001_b1054] },
[p001_b1055] {
### [p001_b1056] "item": "B46",
### [p001_b1057] "count": "89"
[p001_b1058] },
[p001_b1059] {
### [p001_b1060] "item": "BX12",
### [p001_b1061] "count": "88"
[p001_b1062] },
[p001_b1063] {
### [p001_b1064] "item": "Q44",
### [p001_b1065] "count": "83"
[p001_b1066] },
[p001_b1067] {
### [p001_b1068] "item": "M34",
### [p001_b1069] "count": "56"
[p001_b1070] },
[p001_b1071] {
### [p001_b1072] "item": "Q53",
### [p001_b1073] "count": "44"
[p001_b1074] },
[p001_b1075] {
### [p001_b1076] "item": "BX6",
### [p001_b1077] "count": "39"
[p001_b1078] },
[p001_b1079] {
### [p001_b1080] "item": "M60",
### [p001_b1081] "count": "37"
[p001_b1082] },
[p001_b1083] {
### [p001_b1084] "item": "M14 A",
### [p001_b1085] "count": "32"
[p001_b1086] },
[p001_b1087] {
### [p001_b1088] "item": "M23",
### [p001_b1089] "count": "27"
[p001_b1090] },
[p001_b1091] {
### [p001_b1092] "item": "M14",
### [p001_b1093] "count": "17"
[p001_b1094] },
[p001_b1095] {
### [p001_b1096] "item": "M86",
### [p001_b1097] "count": "7"
[p001_b1098] }
[p001_b1099] ],
### [p001_b1100] "smallest": "B44",
### [p001_b1101] "count": "4068",
### [p001_b1102] "cardinality": "4068"
[p001_b1103] },
### [p001_b1104] "format": {}
[p001_b1105] },
[p001_b1106] {
### [p001_b1107] "id": 617611161,
### [p001_b1108] "name": "SBS_Route2",
### [p001_b1109] "dataTypeName": "text",
### [p001_b1110] "description": "Select Bus Service (SBS) route(s) using bus lane",
### [p001_b1111] "fieldName": "sbs_route2",
### [p001_b1112] "position": 19,
### [p001_b1113] "renderTypeName": "text",
### [p001_b1114] "tableColumnId": 124489689,
### [p001_b1115] "cachedContents": {
### [p001_b1116] "non_null": "369",
### [p001_b1117] "largest": "Q53",
### [p001_b1118] "null": "3699",
### [p001_b1119] "top": [
[p001_b1120] {
### [p001_b1121] "item": "Q53",
### [p001_b1122] "count": "254"
[p001_b1123] },
[p001_b1124] {
### [p001_b1125] "item": "M34A",
### [p001_b1126] "count": "56"
[p001_b1127] },
[p001_b1128] {
### [p001_b1129] "item": "M14 D",
### [p001_b1130] "count": "32"
[p001_b1131] },
[p001_b1132] {
### [p001_b1133] "item": "Q25",
### [p001_b1134] "count": "17"
[p001_b1135] },
[p001_b1136] {
### [p001_b1137] "item": "M14 A",
### [p001_b1138] "count": "10"
[p001_b1139] }
[p001_b1140] ],
### [p001_b1141] "smallest": "M14 A",
### [p001_b1142] "count": "4068",
### [p001_b1143] "cardinality": "4068"
[p001_b1144] },
### [p001_b1145] "format": {}
[p001_b1146] },
[p001_b1147] {
### [p001_b1148] "id": 617611162,
### [p001_b1149] "name": "SBS_Route3",
### [p001_b1150] "dataTypeName": "text",
### [p001_b1151] "description": "Select Bus Service (SBS) route(s) using bus lane",
### [p001_b1152] "fieldName": "sbs_route3",
### [p001_b1153] "position": 20,
### [p001_b1154] "renderTypeName": "text",
### [p001_b1155] "tableColumnId": 124489690,
### [p001_b1156] "cachedContents": {
### [p001_b1157] "non_null": "0",
### [p001_b1158] "null": "4068",
### [p001_b1159] "count": "4068",
### [p001_b1160] "cardinality": "4068"
[p001_b1161] },
### [p001_b1162] "format": {}
[p001_b1163] },
[p001_b1164] {
### [p001_b1165] "id": 617611166,
### [p001_b1166] "name": "Open_dates",
### [p001_b1167] "dataTypeName": "text",
### [p001_b1168] "description": "Year bus lane opened",
### [p001_b1169] "fieldName": "open_dates",
### [p001_b1170] "position": 21,
### [p001_b1171] "renderTypeName": "text",
### [p001_b1172] "tableColumnId": 146293317,
### [p001_b1173] "cachedContents": {
### [p001_b1174] "non_null": "3857",
### [p001_b1175] "largest": "9/9/2024",
### [p001_b1176] "null": "211",
### [p001_b1177] "top": [
[p001_b1178] {
### [p001_b1179] "item": "6/30/2013",
### [p001_b1180] "count": "195"
[p001_b1181] },
[p001_b1182] {
### [p001_b1183] "item": "9/15/2025",
### [p001_b1184] "count": "195"
[p001_b1185] },
[p001_b1186] {
### [p001_b1187] "item": "11/17/2013",
### [p001_b1188] "count": "138"
[p001_b1189] },
[p001_b1190] {
### [p001_b1191] "item": "8/24/82, 10/10/10",
### [p001_b1192] "count": "130"
[p001_b1193] },
[p001_b1194] {
### [p001_b1195] "item": "12/03/2021",
### [p001_b1196] "count": "127"
[p001_b1197] },
[p001_b1198] {
### [p001_b1199] "item": "8/8/2023",
### [p001_b1200] "count": "125"
[p001_b1201] },
[p001_b1202] {
### [p001_b1203] "item": "09/02/12",
### [p001_b1204] "count": "113"
[p001_b1205] },
[p001_b1206] {
### [p001_b1207] "item": "12/1/2020",
### [p001_b1208] "count": "109"
[p001_b1209] },
[p001_b1210] {
### [p001_b1211] "item": "10/31/2023",
### [p001_b1212] "count": "109"
[p001_b1213] },
[p001_b1214] {
### [p001_b1215] "item": "8/15/2022",
### [p001_b1216] "count": "100"
[p001_b1217] },
[p001_b1218] {
### [p001_b1219] "item": "9/12/2020",
### [p001_b1220] "count": "93"
[p001_b1221] },
[p001_b1222] {
### [p001_b1223] "item": "05/26/69",
### [p001_b1224] "count": "85"
[p001_b1225] },
[p001_b1226] {
### [p001_b1227] "item": "9/3/02,06/29/08",
### [p001_b1228] "count": "78"
[p001_b1229] },
[p001_b1230] {
### [p001_b1231] "item": "7/28/82,10/10/10",
### [p001_b1232] "count": "73"
[p001_b1233] },
[p001_b1234] {
### [p001_b1235] "item": "09/01/15",
### [p001_b1236] "count": "72"
[p001_b1237] },
[p001_b1238] {
### [p001_b1239] "item": "9/1/2022",
### [p001_b1240] "count": "70"
[p001_b1241] },
[p001_b1242] {
### [p001_b1243] "item": "10/05/2018",
### [p001_b1244] "count": "67"
[p001_b1245] },
[p001_b1246] {
### [p001_b1247] "item": "8/5/2020",
### [p001_b1248] "count": "64"
[p001_b1249] },
[p001_b1250] {
### [p001_b1251] "item": "09/16/2019",
### [p001_b1252] "count": "62"
[p001_b1253] },
[p001_b1254] {
### [p001_b1255] "item": "8/24/82,10/10/10",
### [p001_b1256] "count": "56"
[p001_b1257] }
[p001_b1258] ],
### [p001_b1259] "smallest": "???",
### [p001_b1260] "count": "4068",
### [p001_b1261] "cardinality": "4068"
[p001_b1262] },
### [p001_b1263] "format": {}
[p001_b1264] },
[p001_b1265] {
### [p001_b1266] "id": 617611155,
### [p001_b1267] "name": "Year1",
### [p001_b1268] "dataTypeName": "number",
### [p001_b1269] "description": "The year the bus lanes went into effect",
### [p001_b1270] "fieldName": "year1",
### [p001_b1271] "position": 22,
### [p001_b1272] "renderTypeName": "number",
### [p001_b1273] "tableColumnId": 124489683,
### [p001_b1274] "cachedContents": {
### [p001_b1275] "non_null": "4068",
### [p001_b1276] "largest": "2025",
### [p001_b1277] "null": "0",
### [p001_b1278] "top": [
[p001_b1279] {
### [p001_b1280] "item": "1982",
### [p001_b1281] "count": "519"
[p001_b1282] },
[p001_b1283] {
### [p001_b1284] "item": "2013",
### [p001_b1285] "count": "361"
[p001_b1286] },
[p001_b1287] {
### [p001_b1288] "item": "2023",
### [p001_b1289] "count": "361"
[p001_b1290] },
[p001_b1291] {
### [p001_b1292] "item": "2020",
### [p001_b1293] "count": "357"
[p001_b1294] },
[p001_b1295] {
### [p001_b1296] "item": "2015",
### [p001_b1297] "count": "273"
[p001_b1298] },
[p001_b1299] {
### [p001_b1300] "item": "2025",
### [p001_b1301] "count": "270"
[p001_b1302] },
[p001_b1303] {
### [p001_b1304] "item": "2017",
### [p001_b1305] "count": "223"
[p001_b1306] },
[p001_b1307] {
### [p001_b1308] "item": "2022",
### [p001_b1309] "count": "201"
[p001_b1310] },
[p001_b1311] {
### [p001_b1312] "item": "2019",
### [p001_b1313] "count": "197"
[p001_b1314] },
[p001_b1315] {
### [p001_b1316] "item": "2021",
### [p001_b1317] "count": "162"
[p001_b1318] },
[p001_b1319] {
### [p001_b1320] "item": "2018",
### [p001_b1321] "count": "143"
[p001_b1322] },
[p001_b1323] {
### [p001_b1324] "item": "2012",
### [p001_b1325] "count": "123"
[p001_b1326] },
[p001_b1327] {
### [p001_b1328] "item": "2024",
### [p001_b1329] "count": "93"
[p001_b1330] },
[p001_b1331] {
### [p001_b1332] "item": "2010",
### [p001_b1333] "count": "90"
[p001_b1334] },
[p001_b1335] {
### [p001_b1336] "item": "1969",
### [p001_b1337] "count": "85"
[p001_b1338] },
[p001_b1339] {
### [p001_b1340] "item": "2002",
### [p001_b1341] "count": "78"
[p001_b1342] },
[p001_b1343] {
### [p001_b1344] "item": "2014",
### [p001_b1345] "count": "53"
[p001_b1346] },
[p001_b1347] {
### [p001_b1348] "item": "1986",
### [p001_b1349] "count": "45"
[p001_b1350] },
[p001_b1351] {
### [p001_b1352] "item": "2016",
### [p001_b1353] "count": "45"
[p001_b1354] },
[p001_b1355] {
### [p001_b1356] "item": "2001",
### [p001_b1357] "count": "43"
[p001_b1358] }
[p001_b1359] ],
### [p001_b1360] "smallest": "0",
### [p001_b1361] "count": "4068",
### [p001_b1362] "cardinality": "4068"
[p001_b1363] },
### [p001_b1364] "format": {
### [p001_b1365] "noCommas": "true"
[p001_b1366] }
[p001_b1367] },
[p001_b1368] {
### [p001_b1369] "id": 617611156,
### [p001_b1370] "name": "Year2",
### [p001_b1371] "dataTypeName": "number",
### [p001_b1372] "description": "The first time the bus lane design or hours were modified",
### [p001_b1373] "fieldName": "year2",
### [p001_b1374] "position": 23,
### [p001_b1375] "renderTypeName": "number",
### [p001_b1376] "tableColumnId": 152717907,
### [p001_b1377] "cachedContents": {
### [p001_b1378] "non_null": "4068",
### [p001_b1379] "largest": "2021",
### [p001_b1380] "null": "0",
### [p001_b1381] "top": [
[p001_b1382] {
### [p001_b1383] "item": "0",
### [p001_b1384] "count": "3250"
[p001_b1385] },
[p001_b1386] {
### [p001_b1387] "item": "2010",
### [p001_b1388] "count": "347"
[p001_b1389] },
[p001_b1390] {
### [p001_b1391] "item": "2008",
### [p001_b1392] "count": "115"
[p001_b1393] },
[p001_b1394] {
### [p001_b1395] "item": "2017",
### [p001_b1396] "count": "87"
[p001_b1397] },
[p001_b1398] {
### [p001_b1399] "item": "2019",
### [p001_b1400] "count": "69"
[p001_b1401] },
[p001_b1402] {
### [p001_b1403] "item": "2021",
### [p001_b1404] "count": "52"
[p001_b1405] },
[p001_b1406] {
### [p001_b1407] "item": "2011",
### [p001_b1408] "count": "37"
[p001_b1409] },
[p001_b1410] {
### [p001_b1411] "item": "1999",
### [p001_b1412] "count": "36"
[p001_b1413] },
[p001_b1414] {
### [p001_b1415] "item": "2018",
### [p001_b1416] "count": "22"
[p001_b1417] },
[p001_b1418] {
### [p001_b1419] "item": "1990",
### [p001_b1420] "count": "20"
[p001_b1421] },
[p001_b1422] {
### [p001_b1423] "item": "1982",
### [p001_b1424] "count": "19"
[p001_b1425] },
[p001_b1426] {
### [p001_b1427] "item": "2015",
### [p001_b1428] "count": "14"
[p001_b1429] }
[p001_b1430] ],
### [p001_b1431] "smallest": "0",
### [p001_b1432] "count": "4068",
### [p001_b1433] "cardinality": "4068"
[p001_b1434] },
### [p001_b1435] "format": {}
[p001_b1436] },
[p001_b1437] {
### [p001_b1438] "id": 617611157,
### [p001_b1439] "name": "Year3",
### [p001_b1440] "dataTypeName": "number",
### [p001_b1441] "description": "The second time the bus lane design or hours were modified",
### [p001_b1442] "fieldName": "year3",
### [p001_b1443] "position": 24,
### [p001_b1444] "renderTypeName": "number",
### [p001_b1445] "tableColumnId": 152717906,
### [p001_b1446] "cachedContents": {
### [p001_b1447] "non_null": "4068",
### [p001_b1448] "largest": "2024",
### [p001_b1449] "null": "0",
### [p001_b1450] "top": [
[p001_b1451] {
### [p001_b1452] "item": "0",
### [p001_b1453] "count": "3895"
[p001_b1454] },
[p001_b1455] {
### [p001_b1456] "item": "2024",
### [p001_b1457] "count": "50"
[p001_b1458] },
[p001_b1459] {
### [p001_b1460] "item": "2022",
### [p001_b1461] "count": "39"
[p001_b1462] },
[p001_b1463] {
### [p001_b1464] "item": "2015",
### [p001_b1465] "count": "27"
[p001_b1466] },
[p001_b1467] {
### [p001_b1468] "item": "2014",
### [p001_b1469] "count": "20"
[p001_b1470] },
[p001_b1471] {
### [p001_b1472] "item": "2012",
### [p001_b1473] "count": "19"
[p001_b1474] },
[p001_b1475] {
### [p001_b1476] "item": "2023",
### [p001_b1477] "count": "16"
[p001_b1478] },
[p001_b1479] {
### [p001_b1480] "item": "2019",
### [p001_b1481] "count": "2"
[p001_b1482] }
[p001_b1483] ],
### [p001_b1484] "smallest": "0",
### [p001_b1485] "count": "4068",
### [p001_b1486] "cardinality": "4068"
[p001_b1487] },
### [p001_b1488] "format": {}
[p001_b1489] },
[p001_b1490] {
### [p001_b1491] "id": 617611164,
### [p001_b1492] "name": "Last_Updat",
### [p001_b1493] "dataTypeName": "text",
### [p001_b1494] "description": "Date feature was updated in database",
### [p001_b1495] "fieldName": "last_updat",
### [p001_b1496] "position": 25,
### [p001_b1497] "renderTypeName": "text",
### [p001_b1498] "tableColumnId": 124489692,
### [p001_b1499] "cachedContents": {
### [p001_b1500] "non_null": "4030",
### [p001_b1501] "largest": "9/28/2023",
### [p001_b1502] "null": "38",
### [p001_b1503] "top": [
[p001_b1504] {
### [p001_b1505] "item": "7/19/2017",
### [p001_b1506] "count": "1750"
[p001_b1507] },
[p001_b1508] {
### [p001_b1509] "item": "5/16/2024",
### [p001_b1510] "count": "361"
[p001_b1511] },
[p001_b1512] {
### [p001_b1513] "item": "03/31/21",
### [p001_b1514] "count": "334"
[p001_b1515] },
[p001_b1516] {
### [p001_b1517] "item": "1/28/2026",
### [p001_b1518] "count": "289"
[p001_b1519] },
[p001_b1520] {
### [p001_b1521] "item": "12/19/2019",
### [p001_b1522] "count": "215"
[p001_b1523] },
[p001_b1524] {
### [p001_b1525] "item": "3/1/2023",
### [p001_b1526] "count": "204"
[p001_b1527] },
[p001_b1528] {
### [p001_b1529] "item": "10/31/17",
### [p001_b1530] "count": "169"
[p001_b1531] },
[p001_b1532] {
### [p001_b1533] "item": "12/15/2021",
### [p001_b1534] "count": "159"
[p001_b1535] },
[p001_b1536] {
### [p001_b1537] "item": "2/25/2019",
### [p001_b1538] "count": "156"
[p001_b1539] },
[p001_b1540] {
### [p001_b1541] "item": "4/4/2025",
### [p001_b1542] "count": "93"
[p001_b1543] },
[p001_b1544] {
### [p001_b1545] "item": "10/3/17",
### [p001_b1546] "count": "74"
[p001_b1547] },
[p001_b1548] {
### [p001_b1549] "item": "9/26/2023",
### [p001_b1550] "count": "46"
[p001_b1551] },
[p001_b1552] {
### [p001_b1553] "item": "10/2/17",
### [p001_b1554] "count": "39"
[p001_b1555] },
[p001_b1556] {
### [p001_b1557] "item": "12/23/2019",
### [p001_b1558] "count": "30"
[p001_b1559] },
[p001_b1560] {
### [p001_b1561] "item": "4/9/2024",
### [p001_b1562] "count": "18"
[p001_b1563] },
[p001_b1564] {
### [p001_b1565] "item": "9/05/2024",
### [p001_b1566] "count": "17"
[p001_b1567] },
[p001_b1568] {
### [p001_b1569] "item": "5/9/2024",
### [p001_b1570] "count": "16"
[p001_b1571] },
[p001_b1572] {
### [p001_b1573] "item": "12/05/2024",
### [p001_b1574] "count": "15"
[p001_b1575] },
[p001_b1576] {
### [p001_b1577] "item": "11/25/2024",
### [p001_b1578] "count": "14"
[p001_b1579] },
[p001_b1580] {
### [p001_b1581] "item": "9/28/2023",
### [p001_b1582] "count": "9"
[p001_b1583] }
[p001_b1584] ],
### [p001_b1585] "smallest": "03/31/21",
### [p001_b1586] "count": "4068",
### [p001_b1587] "cardinality": "4068"
[p001_b1588] },
### [p001_b1589] "format": {}
[p001_b1590] },
[p001_b1591] {
### [p001_b1592] "id": 617611167,
### [p001_b1593] "name": "Chron_ID_1",
### [p001_b1594] "dataTypeName": "text",
### [p001_b1595] "description": "Borough and opening year of bus lane",
### [p001_b1596] "fieldName": "chron_id_1",
### [p001_b1597] "position": 26,
### [p001_b1598] "renderTypeName": "text",
### [p001_b1599] "tableColumnId": 124489695,
### [p001_b1600] "cachedContents": {
### [p001_b1601] "non_null": "4064",
### [p001_b1602] "largest": "SI2020",
### [p001_b1603] "null": "4",
### [p001_b1604] "top": [
[p001_b1605] {
### [p001_b1606] "item": "MAN1982",
### [p001_b1607] "count": "519"
[p001_b1608] },
[p001_b1609] {
### [p001_b1610] "item": "BX2013",
### [p001_b1611] "count": "223"
[p001_b1612] },
[p001_b1613] {
### [p001_b1614] "item": "QNS2025",
### [p001_b1615] "count": "199"
[p001_b1616] },
[p001_b1617] {
### [p001_b1618] "item": "QNS2017",
### [p001_b1619] "count": "172"
[p001_b1620] },
[p001_b1621] {
### [p001_b1622] "item": "BX2023",
### [p001_b1623] "count": "167"
[p001_b1624] },
[p001_b1625] {
### [p001_b1626] "item": "BK2018",
### [p001_b1627] "count": "145"
[p001_b1628] },
[p001_b1629] {
### [p001_b1630] "item": "BK2013",
### [p001_b1631] "count": "138"
[p001_b1632] },
[p001_b1633] {
### [p001_b1634] "item": "BX2021",
### [p001_b1635] "count": "127"
[p001_b1636] },
[p001_b1637] {
### [p001_b1638] "item": "QNS2023",
### [p001_b1639] "count": "127"
[p001_b1640] },
[p001_b1641] {
### [p001_b1642] "item": "QNS2015",
### [p001_b1643] "count": "126"
[p001_b1644] },
[p001_b1645] {
### [p001_b1646] "item": "QNS2020",
### [p001_b1647] "count": "118"
[p001_b1648] },
[p001_b1649] {
### [p001_b1650] "item": "SI2012",
### [p001_b1651] "count": "113"
[p001_b1652] },
[p001_b1653] {
### [p001_b1654] "item": "BX2020",
### [p001_b1655] "count": "101"
[p001_b1656] },
[p001_b1657] {
### [p001_b1658] "item": "QNS2022",
### [p001_b1659] "count": "100"
[p001_b1660] },
[p001_b1661] {
### [p001_b1662] "item": "SI2020",
### [p001_b1663] "count": "95"
[p001_b1664] },
[p001_b1665] {
### [p001_b1666] "item": "BK2015",
### [p001_b1667] "count": "94"
[p001_b1668] },
[p001_b1669] {
### [p001_b1670] "item": "QNS1969",
### [p001_b1671] "count": "85"
[p001_b1672] },
[p001_b1673] {
### [p001_b1674] "item": "MAN2024",
### [p001_b1675] "count": "83"
[p001_b1676] },
[p001_b1677] {
### [p001_b1678] "item": "MAN2019",
### [p001_b1679] "count": "79"
[p001_b1680] },
[p001_b1681] {
### [p001_b1682] "item": "BX2002",
### [p001_b1683] "count": "78"
[p001_b1684] }
[p001_b1685] ],
### [p001_b1686] "smallest": "BK0",
### [p001_b1687] "count": "4068",
### [p001_b1688] "cardinality": "4068"
[p001_b1689] },
### [p001_b1690] "format": {}
[p001_b1691] },
[p001_b1692] {
### [p001_b1693] "id": 617611168,
### [p001_b1694] "name": "Shape_Leng",
### [p001_b1695] "dataTypeName": "number",
### [p001_b1696] "description": "Length of the line segment in feet",
### [p001_b1697] "fieldName": "shape_leng",
### [p001_b1698] "position": 27,
### [p001_b1699] "renderTypeName": "number",
### [p001_b1700] "tableColumnId": 124489696,
### [p001_b1701] "cachedContents": {
### [p001_b1702] "non_null": "4068",
### [p001_b1703] "largest": "1843.81930317",
### [p001_b1704] "null": "0",
### [p001_b1705] "top": [
[p001_b1706] {
### [p001_b1707] "item": "0.0",
### [p001_b1708] "count": "205"
[p001_b1709] },
[p001_b1710] {
### [p001_b1711] "item": "270.513164317",
### [p001_b1712] "count": "6"
[p001_b1713] },
[p001_b1714] {
### [p001_b1715] "item": "59.9186260656",
### [p001_b1716] "count": "6"
[p001_b1717] },
[p001_b1718] {
### [p001_b1719] "item": "88.1716140123",
### [p001_b1720] "count": "6"
[p001_b1721] },
[p001_b1722] {
### [p001_b1723] "item": "40.5644272623",
### [p001_b1724] "count": "4"
[p001_b1725] },
[p001_b1726] {
### [p001_b1727] "item": "299.546385088",
### [p001_b1728] "count": "4"
[p001_b1729] },
[p001_b1730] {
### [p001_b1731] "item": "259.856207038",
### [p001_b1732] "count": "4"
[p001_b1733] },
[p001_b1734] {
### [p001_b1735] "item": "27.0219316229",
### [p001_b1736] "count": "4"
[p001_b1737] },
[p001_b1738] {
### [p001_b1739] "item": "216.881825323",
### [p001_b1740] "count": "4"
[p001_b1741] },
[p001_b1742] {
### [p001_b1743] "item": "16.6542809568",
### [p001_b1744] "count": "4"
[p001_b1745] },
[p001_b1746] {
### [p001_b1747] "item": "26.2490407042",
### [p001_b1748] "count": "4"
[p001_b1749] },
[p001_b1750] {
### [p001_b1751] "item": "272.438536031",
### [p001_b1752] "count": "4"
[p001_b1753] },
[p001_b1754] {
### [p001_b1755] "item": "14.4899438147",
### [p001_b1756] "count": "4"
[p001_b1757] },
[p001_b1758] {
### [p001_b1759] "item": "336.500125693",
### [p001_b1760] "count": "4"
[p001_b1761] },
[p001_b1762] {
### [p001_b1763] "item": "20.2185647499",
### [p001_b1764] "count": "4"
[p001_b1765] },
[p001_b1766] {
### [p001_b1767] "item": "170.830304197",
### [p001_b1768] "count": "4"
[p001_b1769] },
[p001_b1770] {
### [p001_b1771] "item": "94.681859267",
### [p001_b1772] "count": "4"
[p001_b1773] },
[p001_b1774] {
### [p001_b1775] "item": "31.000304141",
### [p001_b1776] "count": "4"
[p001_b1777] },
[p001_b1778] {
### [p001_b1779] "item": "19.1928075532",
### [p001_b1780] "count": "4"
[p001_b1781] },
[p001_b1782] {
### [p001_b1783] "item": "257.388386688",
### [p001_b1784] "count": "3"
[p001_b1785] }
[p001_b1786] ],
### [p001_b1787] "smallest": "0.0",
### [p001_b1788] "count": "4068",
### [p001_b1789] "cardinality": "4068"
[p001_b1790] },
### [p001_b1791] "format": {}
[p001_b1792] },
[p001_b1793] {
### [p001_b1794] "id": 617611169,
### [p001_b1795] "name": "Shape_Le_1",
### [p001_b1796] "dataTypeName": "multiline",
### [p001_b1797] "description": "Length of the line segment in feet",
### [p001_b1798] "fieldName": "shape_le_1",
### [p001_b1799] "position": 28,
### [p001_b1800] "renderTypeName": "multiline",
### [p001_b1801] "tableColumnId": 146293316,
### [p001_b1802] "format": {}
[p001_b1803] },
[p001_b1804] {
### [p001_b1805] "id": 617611195,
### [p001_b1806] "name": "Mid_Block",
### [p001_b1807] "dataTypeName": "text",
[p001_b1808] "description": "Indicates whether the lane begins or ends before or after the intersection \n",
### [p001_b1809] "fieldName": "mid_block",
### [p001_b1810] "position": 29,
### [p001_b1811] "renderTypeName": "text",
### [p001_b1812] "tableColumnId": 161816234,
### [p001_b1813] "cachedContents": {
### [p001_b1814] "non_null": "14",
### [p001_b1815] "largest": "Y",
### [p001_b1816] "null": "4054",
### [p001_b1817] "top": [
[p001_b1818] {
### [p001_b1819] "item": "Y",
### [p001_b1820] "count": "14"
[p001_b1821] }
[p001_b1822] ],
### [p001_b1823] "smallest": "Y",
### [p001_b1824] "count": "4068",
### [p001_b1825] "cardinality": "4068"
[p001_b1826] },
### [p001_b1827] "format": {}
[p001_b1828] }
[p001_b1829] ]
