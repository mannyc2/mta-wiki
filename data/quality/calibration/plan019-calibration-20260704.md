# Judge Calibration plan019-calibration-20260704

Verdicts: `data/quality/calibration/plan019-calibration-verdicts.jsonl`

- Human agreement: 86.00% (43/50, missing 0) FAIL
- Seeded recall overall: 48.09% (63/131, missing 0) FAIL
- Seeded critical recall: 62.00% (31/50, missing 0) FAIL
- Control false-flag: 2.00% (49/50, missing 0) PASS

## By Class

- endpoint_sibling_swap: 24.00% (6/25, missing 0) FAIL
- lifecycle_flip: 0.00% (0/6, missing 0) FAIL
- period_shift: 64.00% (16/25, missing 0) FAIL
- unit_swap: 8.00% (2/25, missing 0) FAIL
- value_perturbation: 100.00% (25/25, missing 0) PASS
- wrong_block_recite: 56.00% (14/25, missing 0) FAIL

## Verdict Distribution

- Baseline: partially_supported=73, supported=197, unsupported=26, wrong=4
- Actual: partially_supported=59, supported=105, unsupported=18, wrong=49
