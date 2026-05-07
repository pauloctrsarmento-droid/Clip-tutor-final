"""Inspect recent quiz attempts: figure SMILES vs mark_scheme answer."""
import json, sys, urllib.request
sys.stdout.reconfigure(encoding='utf-8')

TOK = next(l.split('=', 1)[1].strip() for l in open('web/.env.local').read().splitlines() if l.startswith('SUPABASE_ACCESS_TOKEN='))
HDR = {'Authorization': f'Bearer {TOK}', 'Content-Type': 'application/json', 'User-Agent': 'supabase-cli/2.84.4'}

def sql(q: str):
    req = urllib.request.Request('https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query',
        data=json.dumps({'query': q}).encode(), method='POST', headers=HDR)
    return json.loads(urllib.request.urlopen(req, timeout=60).read())

PAULO = '3e298938-7166-45c9-90b5-52fc8fe2e54b'
rows = sql(f"""SELECT ai.id::text, ai.prompt_text, ai.mark_scheme, ai.correct_answer, ai.figures, qa.marks_awarded, qa.marks_available, qa.created_at
FROM quiz_attempts qa JOIN assessment_items ai ON ai.id=qa.question_id
WHERE qa.student_id='{PAULO}' AND qa.created_at > now() - interval '30 minutes'
ORDER BY qa.created_at DESC LIMIT 10;""")
for r in rows:
    figs = r['figures'] if r['figures'] else []
    print(f'=== {r["id"][:8]}  {r["marks_awarded"]}/{r["marks_available"]} ===')
    print(f'  prompt: {(r["prompt_text"] or "")[:160]}')
    print(f'  correct_answer: {r["correct_answer"]}')
    print(f'  mark_scheme: {(r["mark_scheme"] or "")[:300]}')
    for f in figs:
        ftype = f.get('type', '?')
        if ftype == 'organic_structure':
            print(f'  fig.organic SMILES: {f.get("smiles")}')
        else:
            print(f'  fig.{ftype}: {json.dumps(f)[:200]}')
    print()
