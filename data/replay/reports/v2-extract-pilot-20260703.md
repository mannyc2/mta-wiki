# Replay Eval v2-extract-pilot-20260703

- Release: v1-rc5
- Sources: 10
- Self diff: no
- Overall agreement: 0.00% (0/722)

## Agreement By Kind

| Kind | Expected | Actual | Match | Field mismatch | Missing | Extra | Agreement |
|---|---:|---:|---:|---:|---:|---:|---:|
| claim | 57 | 26 | 0 | 11 | 46 | 15 | 0.00% |
| corridor | 10 | 10 | 0 | 9 | 1 | 1 | 0.00% |
| entity | 34 | 14 | 0 | 11 | 23 | 3 | 0.00% |
| event | 57 | 34 | 0 | 23 | 34 | 11 | 0.00% |
| metric_claim | 163 | 81 | 0 | 68 | 95 | 13 | 0.00% |
| project | 13 | 6 | 0 | 5 | 8 | 1 | 0.00% |
| relation | 252 | 78 | 0 | 0 | 252 | 78 | 0.00% |
| route | 51 | 35 | 0 | 34 | 17 | 1 | 0.00% |
| source | 10 | 7 | 0 | 7 | 3 | 0 | 0.00% |
| source_gap | 2 | 0 | 0 | 0 | 2 | 0 | 0.00% |
| treatment_component | 73 | 30 | 0 | 21 | 52 | 9 | 0.00% |

## Collision Summary

| Scope | Kind | Buckets | Records | Projection-distinguishable | Projection-ambiguous |
|---|---|---:|---:|---:|---:|
| replay_scope | claim | 6 | 14 | 6 | 0 |
| replay_scope | entity | 2 | 5 | 2 | 0 |
| replay_scope | event | 10 | 50 | 10 | 0 |
| replay_scope | metric_claim | 39 | 144 | 39 | 0 |
| replay_scope | project | 1 | 2 | 1 | 0 |
| replay_scope | relation | 14 | 28 | 14 | 0 |
| replay_scope | route | 5 | 45 | 5 | 0 |
| replay_scope | treatment_component | 10 | 34 | 10 | 0 |
| full_release | claim | 984 | 2697 | 984 | 0 |
| full_release | corridor | 78 | 286 | 78 | 0 |
| full_release | entity | 2222 | 6853 | 2222 | 0 |
| full_release | event | 932 | 2677 | 932 | 0 |
| full_release | metric_claim | 7850 | 31023 | 7845 | 5 |
| full_release | project | 321 | 971 | 321 | 0 |
| full_release | relation | 679 | 1359 | 678 | 1 |
| full_release | route | 477 | 1567 | 477 | 0 |
| full_release | source | 13 | 26 | 13 | 0 |
| full_release | source_gap | 9 | 22 | 9 | 0 |
| full_release | treatment_component | 415 | 1310 | 415 | 0 |
