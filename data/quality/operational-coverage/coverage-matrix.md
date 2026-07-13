# Operational coverage matrix

Input fingerprint: `ec2fce54c65e9fe346c387c2350f394dc01260011372444ffe10fc42c0c2d788`
Corpus fingerprint: `f1147d2e9030de65b14250a46388be974fe74fe41d784e7cfde3b4342c4bd301`
Study window: 2023-04-01 through 2026-12-31

## Canonical event population

- Operational-family events: 1362
- In-window events: 663
- Pre-window events: 568
- Undated events: 123
- Timeline-linked distinct events: 750
- Unlinked operational events: 612

## Projection rows (diagnostic, not event counts)

- Broad rows: 750
- Reviewed overlay rows: 9
- Duplicate reviewed overlay rows: 9

## Resolved occurrences and downstream projection

- Distinct occurrences: 134
- Eligible occurrences: 133
- Bundle occurrences: 85
- Eligible occurrence-route pairs: 169
- Unique eligible GTFS routes: 147

## Completion ledger

- Gap rows: 2933
- Priority gap denominator: 488
- Priority open: 0
- Priority adjudicated/recoverable: 0
- Priority terminal: 488
- Sequential route-resolved treatment gaps: 15

## Downstream-served layer

- Status: pinned_release_not_present
- Consumer: bus-reliability-tracker
- Pinned release: v3-operational-occurrences-1

Exclusion and gap histograms overlap; they are not additive funnel attrition.
