/**
 * Exact mutable projection state produced by Plan 041.
 *
 * Plan 041 leaves every Plan 040 terminal projection byte unchanged except
 * the member-grain ledger, where it adds the reviewed provenance-only block
 * bindings required by the closure preflight. Historical Plan 040 checkpoint
 * artifacts retain their original pins; replay code may admit this map only as
 * one coherent, exact successor state.
 */
export const PLAN041_POST_CLOSURE_PROJECTION_PINS = {
  extent_ledger:
    "41b6b657babc2b7684a3d4d42c13fd1554f1e999b7a9e42cb8ee76b3c7af1fed",
  grain_ledger:
    "3e5d23357bb6a8ad38f13364c02a2087da3b181e5880288aef55f905b41fa027",
  bridge_ledger:
    "3c4a293ec089e364ebca63fcd045ee8bfb4c74b61ed0f82a2a1267f3b842c043",
  bridge_summary:
    "a9fbef6364dd8e78ad29272190a55c6fa457926369258c0c838813af8853daa1",
  consumer_priority_manifest:
    "d1427e1d300905a5d96432fa2e0f3b468be458f447c01c406b4f6f7a03ae5d30",
  study_manifest:
    "74857abb4ed98ac1f680815bede9cd0fa6f761409885fa159b19ead576730092",
  member_extent_contract:
    "5ca1ba253a75a577c0e32b249508873d5a5114f2bbb2565dba80e7fa60deab0e",
  member_extent_manifest:
    "47cd4cc4d50313798c324c25f8ee7606a6cbcffda703b0f2e8573e038d4b280e",
  member_extent_review_ledger:
    "e5d49eaf01bac97eefeacb8ab445e684cc7a1d9bd1823c9486ba4f9b936153ca",
  member_extent_summary:
    "cbdad78e2fd6d3907f690d32a41e9e328dc990c2a831109d4a57e4b0e716106d",
  operational_occurrences:
    "6cb8654efee370d7444405ce3a0cdb8ce6fa394e6ada2347982cbec49df701ef",
  operational_occurrence_decisions:
    "80e530c9953e59a767afcb2f0d61202d9a9209469075f41f993fe7469ee45883",
  treatment_components:
    "a9b76c3b7121fc87d0f190a44fb00f182229d8d309968d3ba00a8c27a1492bae",
  reviewed_candidate_packets:
    "f393971c46b568a94c6d9f2729f4a6e5d30919fe9e313cee046cc1d9db77e65b",
} as const;
