# Relationship semantic review and remediation plan

This review is exhaustive over the pinned 1,136-tuple legacy endpoint matrix. It distinguishes structural resolvability from semantic validity; observed legacy tuples are not grandfathered merely because their endpoints exist.

## Tuple review

| Exclusive disposition | Tuple count |
|---|---:|
| Approved at stored precision | 913 |
| Obsolete after prior correction replay | 43 |
| Requires exact relation remediation | 180 |

The tuple partition covers 1136 tuples and 21247 frozen relation assignments. 399 exact surviving relations received source-specific remediation decisions.

## Exact remediation actions

| Terminal action | Relation count |
|---|---:|
| `patch_relation` | 106 |
| `replace_endpoint` | 83 |
| `replace_with_submissions` | 58 |
| `resolved_by_generator_fix` | 33 |
| `resolved_by_identity_campaign` | 16 |
| `retract_unsupported` | 103 |

## Enforcement status

Endpoint-type enforcement remains gated until the remediation plan has been applied, the resulting graph has been replayed, and every surviving post-remediation tuple has an explicit approved review decision. This artifact is evidence of completed review and an executable plan, not a waiver or allowlist.

Every relation action is exclusive. Supported facts are retained only at the precision established by cited authoritative evidence; unsupported route, facility, contract, date, phase, and agency claims are retracted rather than inferred.
