import os
import requests, json
KEY = os.environ["OPENAI_API_KEY"]
print("Calling OpenAI gpt-4o-mini...", flush=True)
r = requests.post("https://api.openai.com/v1/chat/completions", json={
    "model": "gpt-4o-mini",
    "max_tokens": 512,
    "response_format": {"type": "json_object"},
    "messages": [
        {"role": "system", "content": 'Generate 5 flashcard questions. Return JSON: {"results":[{"id":"T1","questions":["q1","q2","q3","q4","q5"]}]}'},
        {"role": "user", "content": "Fact: Density is defined as mass per unit volume."},
    ],
}, headers={"Authorization": f"Bearer {KEY}"}, timeout=30)
print(f"Status: {r.status_code}", flush=True)
print(r.json()["choices"][0]["message"]["content"], flush=True)
print("OK!", flush=True)
