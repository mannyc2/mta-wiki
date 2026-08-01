# Hand-reviewed reference fixture

These public-pack rows and `expected-output.json` are a manually maintained
consumer oracle. Producer code may validate them but must never regenerate the
expected semantic output. The fixture covers atomic and bundled multi-route
history, distinct same-family component keys, planned removal, confirmed and
last-confirmed placements, an exact reviewed founding transition, independent
placements without founding episodes, all three URL states, and a pending
frontier count excluded from episode rows.
