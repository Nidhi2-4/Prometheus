# Promethius-26 — model performance (all 5 models)

Computed 2026-10-22 from the saved model bundles in `models/`. Every model is scored on data it did not train on.
Machine-readable copy: `models/all_models_metrics.csv`.

| Model | Test set | n | Positives | Accuracy | Balanced acc. | Precision (PPV) | Recall (sensitivity) | Specificity | F1 | AUROC |
|---|---|---|---|---|---|---|---|---|---|---|
| M1 Hypertension | internal 2017–20 | 1,590 | 635 | 74.5% | 76.3% | 63.6% | 84.9% | 67.6% | 0.727 | 0.841 |
| M1 Hypertension | external 2021–23 | 6,084 | 2,378 | 71.0% | 73.8% | 58.7% | 86.8% | 60.9% | 0.700 | 0.816 |
| M2 Undiagnosed diabetes | internal 2017–20 | 1,323 | 40 | 71.0% | 70.5% | 7.0% | 70.0% | 71.0% | 0.127 | 0.786 |
| M2 Undiagnosed diabetes | external 2021–23 | 4,826 | 128 | 71.6% | 66.8% | 5.6% | 61.7% | 71.8% | 0.103 | 0.753 |
| M3 CVD (no-lab) | held-out test | 13,703 | 6,781 | 67.2% | 67.4% | 62.1% | 86.3% | 48.4% | 0.722 | 0.789 |
| M4 Maternal (urgent referral) | 5-fold CV | 452 | 112 | 79.4% | 83.0% | 55.2% | 90.2% | 75.9% | 0.685 | 0.927 |
| M5 PPG signal quality | 5-fold CV by person | 3,887 | 830 | 84.3% | 76.3% | 63.6% | 62.4% | 90.3% | 0.630 | 0.854 |

## Extra results

**M4 Maternal, 3-class (low / mid / high), 5-fold CV:** accuracy 66.4%, macro F1 0.611

| Class | Precision | Recall | F1 | n |
|---|---|---|---|---|
| low | 76.2% | 76.5% | 0.763 | 234 |
| mid | 36.0% | 30.2% | 0.328 | 106 |
| high | 69.5% | 79.5% | 0.742 | 112 |

**M5 heart-rate estimate** (readings accepted at P(good) ≥ 0.6): MAE 6.6 bpm, 65.0% within ±5 bpm.
On all good-quality recordings: MAE 5.5 bpm, 75.5% within ±5 bpm.

## Operating points

| Model | Threshold | Chosen to |
|---|---|---|
| M1 Hypertension | 0.310 | catch ≥ 85% of hypertension cases |
| M2 Diabetes | 0.271 (with family history) / 0.241 (without) | refer the top 25% highest-risk |
| M3 CVD (no-lab) | 0.31 | catch ~86% of CVD cases |
| M4 Maternal | P(high) ≥ 0.25 | catch ≥ 90% of high-risk pregnancies |
| M5 PPG | P(good) ≥ 0.6 | accept a reading only when the signal is likely clean |

## Reading these numbers

- **AUROC** is threshold-independent and the fairest way to compare models.
- **Accuracy and precision depend on the threshold.** M1, M3 and M4 are tuned for high recall (screening), so they accept more false alarms.
- **M2 precision is low by design.** Only ~3% of people not already diagnosed have undiagnosed diabetes, so most referrals are negative even with a good model.
- **M5 accuracy is inflated by class imbalance.** 78.6% of recordings are poor quality, so rejecting everything would already score 78.6%.
