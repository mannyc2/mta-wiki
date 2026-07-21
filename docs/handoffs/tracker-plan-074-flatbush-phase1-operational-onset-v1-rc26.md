# Tracker Plan 074: Flatbush Phase 1 Operational Onset in rc26

Use MTA Wiki release `v1-rc26`, manifest SHA-256
`c1792d1cbfdf498ea0481fa2374202b634dc2deea532f87a600390c6da382dc0`.
The immutable rc25 snapshot is unchanged.

## Resolved fact

- Occurrence: `occurrence:8c987704152b459014217d44`
- Stable founding key: `event:event_flatbush-phase1-installation-start-sep2025`
- Corridor: `corridor_flatbush-phase1-livingston-state`
- Routes: exactly `B41` and `B67`
- Atomic treatment: `treatment_flatbush-phase1-center-running-bus-lanes-livingston-state`
- Operational onset: `2025-10-02`, precision `day`
- Phase disposition: `related_phases`
- Installation phase: `event_flatbush-phase1-installation-start-sep2025`, date `2025-09`,
  precision `month`
- Opening phase: `event_flatbush-phase1-operational-opening-2025-10-02`, date `2025-10-02`,
  precision `day`
- Phase relation: `relation_flatbush-phase1-installation-precedes-opening-2025-10-02`

September is installation commencement, not the operational onset. October 2 is not a second
occurrence: it is the exact operational-opening phase of the same stable occurrence and physical
scope.

## Authoritative provenance

NYC DOT's Bus Lanes - Local Streets dataset (`ycrg-ses3`) defines `Open_dates` as the date/year the
bus lane opened and `Year1` as the year the bus lanes went into effect. The pinned selected response
contains nine directional rows over five distinct Flatbush Avenue segment ids—`0022938`, `0022942`,
`0028973`, `0118635`, and `0118636`—and every row records `open_dates=10/2/2025`, `year1=2025`,
`lane_type=Center Running`, `hours=24 Hours`, and `days=7 Days/Week`.

- Selected NYC DOT response SHA-256:
  `a741b434f60f0fbb85a582c44c0c166133f9188386c6000f61d4df2a93f2297d`
- NYC DOT view metadata SHA-256:
  `33cd64b3ac584603a66e52375bf7ceb7e6c6db49d40202ecf9940f89ee92e2ea`
- NYC DOT column schema SHA-256:
  `f495f728925b7b807dec228987cfbcb4e9e55279dd1d4edda79c20f3baa7cefe`
- DCP LION selected-segment response SHA-256:
  `46c7fd07197f5cf30fa1f9f77b3970c357dc7b2f77f36a22ad1764dcec10beff`
- DCP LION adjoining-node response SHA-256:
  `7e3f301a6b4a39a6be8efe1ab440a855c819f9be897ef16e82697b7c0bbb50e7`

The LION records form one continuous node chain whose outer nodes intersect Livingston Street and
State Street. This proves the opening rows describe the existing Phase 1 bounded scope rather than
an adjacent or Phase 2 intervention. The September 25 announcement separately says installation
work would start that week on Flatbush Avenue between those same streets.

The tracked source page preserves the exact query and citeable anchors:

- Dataset semantics: `nyc_dot_bus_lanes_flatbush_phase1_opening_2025#p001_b0021` and `#p001_b0024`
- Selected-query hash and dated rows: `#p001_b0026` through `#p001_b0034`
- Continuous LION segment chain: `#p001_b0035` through `#p001_b0040`
- Livingston/State boundary nodes: `#p001_b0042` and `#p001_b0043`
- Complete capture-hash receipt: `#p001_b0044`

## Import action

Plan 074 should pin `data/exports/releases/v1-rc26/operational_occurrences.jsonl` at SHA-256
`6cb8654efee370d7444405ce3a0cdb8ce6fa394e6ada2347982cbec49df701ef`, select the stable occurrence
id above, and use `resolved_onset.date=2025-10-02` with `resolved_onset.precision=day` for causal
timing. Preserve both phase records and the `precedes_event` relation in provenance. Do not use the
rc25 September month as operational onset, do not manufacture an exact September day, and do not
create a second occurrence for the October opening.
