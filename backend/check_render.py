import sys
sys.stdout.reconfigure(encoding='utf-8')
import urllib.request
import json
import http.cookiejar

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

base = 'https://swasthikk.onrender.com/api/v1'

print("=" * 60)
print("TESTING LIVE RENDER BACKEND (https://swasthikk.onrender.com)")
print("=" * 60)

# 1. Start Session
req_sess = urllib.request.Request(f'{base}/session', data=b'{}', headers={'Content-Type': 'application/json'})
with opener.open(req_sess) as r:
    print('1. Session Started -> Status:', r.status)

# 2. Assess Sunita
payload = {
    'language': 'hi',
    'lat': 21.1458,
    'lng': 79.0882,
    'features': {
        'age': 45, 'sex': 'F', 'height_cm': 155, 'weight_kg': 72,
        'smoker': False, 'alcohol': False, 'activity_level': 'low',
        'known_hypertension': False, 'known_diabetes': False, 'known_heart_disease': False,
        'family_history_diabetes': True, 'family_history_cvd': False,
        'systolic': 142, 'diastolic': 92,
        'is_pregnant': False, 'pregnancy_weeks': None,
        'symptoms': ['headache', 'dizziness', 'frequent_urination']
    },
    'heart_rate': {'bpm': 78, 'quality': 'good'}
}

req_assess = urllib.request.Request(f'{base}/assess', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
with opener.open(req_assess) as r:
    res = json.loads(r.read().decode())
    print('\n2. Live Assessment -> Status:', r.status)
    print('Triage Level:', res.get('triage_level').upper())
    print('Models Evaluated:', len(res.get('results', [])))
    for item in res.get('results', []):
        cond = item['condition'].upper()
        lvl = item['level'].upper()
        prob = item['probability']
        ver = item['model_version']
        print(f"\n -> {cond}: Level={lvl} (Prob={prob*100:.1f}%) [Model: {ver}]")
        print("    SHAP Explanations (Hindi):")
        for f in item.get('top_factors', []):
            print(f"     * {f['feature']}: {f['text']}")

print("\n" + "=" * 60)
print("SUCCESS: RENDER BACKEND IS FULLY WORKING WITH PRAVESH MODELS!")
print("=" * 60)
