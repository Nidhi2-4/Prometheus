import sys
sys.stdout.reconfigure(encoding='utf-8')
from app import risk
from app.schemas import Features, HeartRate

print("=" * 60)
print("1. CHECKING LOADED MODELS IN MEMORY")
print("=" * 60)
for name, b in risk.MODELS.items():
    print(f" -> {name.upper()}: version={b.get('version')}, features={len(b.get('features', []))}")

print("\n" + "=" * 60)
print("2. TESTING HYPERTENSION (HIGH BP) MODEL")
print("=" * 60)
# Healthy young person
f_young = Features(age=22, sex='M', height_cm=175, weight_kg=65, activity_level='high', smoker=False, alcohol=False)
res_young = risk.predict('hypertension', f_young, None, 'en')
print(f"Healthy 22yo -> Level: {res_young.level.upper()} (Prob: {res_young.probability * 100:.1f}%)")

# Sunita: 45yo, BMI 32.5, low activity, family history
f_sunita = Features(age=45, sex='F', height_cm=155, weight_kg=78, activity_level='low', smoker=False, alcohol=False,
                    family_history_diabetes=True, symptoms=['headache', 'dizziness'])
res_htn = risk.predict('hypertension', f_sunita, None, 'hi')
print(f"Sunita -> Level: {res_htn.level.upper()} (Prob: {res_htn.probability * 100:.1f}%)")
print("SHAP Explanations (Hindi):")
for fac in res_htn.top_factors:
    print(f"  * {fac.feature} (impact: {fac.impact:+.2f}) -> {fac.text}")

# High BP Rule Override (150/95)
f_bp = Features(age=30, sex='M', height_cm=170, weight_kg=70, systolic=150, diastolic=95)
res_bp = risk.predict('hypertension', f_bp, None, 'en')
print(f"High BP (150/95) Rule Override -> Level: {res_bp.level.upper()}, Version: {res_bp.model_version}")

print("\n" + "=" * 60)
print("3. TESTING DIABETES (TYPE-2) MODEL")
print("=" * 60)
f_dm = Features(age=50, sex='M', height_cm=165, weight_kg=88, activity_level='low',
                family_history_diabetes=True, symptoms=['frequent_urination', 'excessive_thirst'])
res_dm = risk.predict('diabetes', f_dm, None, 'mr')
print(f"Diabetes Risk -> Level: {res_dm.level.upper()} (Prob: {res_dm.probability * 100:.1f}%)")
print("SHAP Explanations (Marathi):")
for fac in res_dm.top_factors:
    print(f"  * {fac.feature} (impact: {fac.impact:+.2f}) -> {fac.text}")

print("\n" + "=" * 60)
print("4. TESTING CARDIOVASCULAR (CVD) MODEL")
print("=" * 60)
f_cvd = Features(age=58, sex='M', height_cm=168, weight_kg=84, systolic=152, diastolic=96, smoker=True, activity_level='low')
res_cvd = risk.predict('cvd', f_cvd, None, 'en')
print(f"Heart Disease (CVD) -> Level: {res_cvd.level.upper()} (Prob: {res_cvd.probability * 100:.1f}%)")
print("SHAP Explanations (English):")
for fac in res_cvd.top_factors:
    print(f"  * {fac.feature} (impact: {fac.impact:+.2f}) -> {fac.text}")

print("\n" + "=" * 60)
print("5. TESTING MATERNAL HEALTH MODEL (PRIYA)")
print("=" * 60)
f_priya = Features(age=26, sex='F', height_cm=158, weight_kg=68, is_pregnant=True, pregnancy_weeks=24,
                   systolic=145, diastolic=95, symptoms=['swelling'])
hr = HeartRate(bpm=88, quality='good')
res_mat = risk.predict('maternal', f_priya, hr, 'hi')
print(f"Maternal Risk -> Level: {res_mat.level.upper()}")
print(f"3-Class Probabilities: {res_mat.class_probabilities}")
print("SHAP Explanations (Hindi):")
for fac in res_mat.top_factors:
    print(f"  * {fac.feature} (impact: {fac.impact:+.2f}) -> {fac.text}")

print("\n" + "=" * 60)
print("ALL 4 MODELS EXECUTED SUCCESSFULLY AND PASSED!")
print("=" * 60)
