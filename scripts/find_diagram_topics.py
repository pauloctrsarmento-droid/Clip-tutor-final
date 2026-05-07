import json, sys, time, urllib.request
sys.stdout.reconfigure(encoding='utf-8')
TOK = next(l.split('=', 1)[1].strip() for l in open('web/.env.local').read().splitlines() if l.startswith('SUPABASE_ACCESS_TOKEN='))
HDR = {'Authorization': f'Bearer {TOK}', 'Content-Type': 'application/json', 'User-Agent': 'supabase-cli/2.84.4'}

def sql(q: str):
    for a in range(5):
        try:
            req = urllib.request.Request('https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query',
                data=json.dumps({'query': q}).encode(), method='POST', headers=HDR)
            return json.loads(urllib.request.urlopen(req, timeout=60).read())
        except urllib.error.HTTPError:
            time.sleep(3 * (a + 1))

for ftype, subj in [('periodic_table', '0620'), ('circuit', '0625'), ('bio_diagram', '0610')]:
    print(f'\n=== {ftype} ({subj}) — top filters by density ===')
    rows = sql(f"""SELECT st.id::text, st.topic_code, ai.response_type, ai.difficulty,
       count(*) FILTER (WHERE figures @> '[{{"type":"{ftype}"}}]'::jsonb)::int AS with_fig,
       count(*)::int AS total
FROM assessment_items ai LEFT JOIN syllabus_topics st ON st.id=ai.syllabus_topic_id
WHERE ai.status='approved' AND ai.subject_code='{subj}'
GROUP BY st.id, st.topic_code, ai.response_type, ai.difficulty
HAVING count(*) FILTER (WHERE figures @> '[{{"type":"{ftype}"}}]'::jsonb) > 0
ORDER BY (count(*) FILTER (WHERE figures @> '[{{"type":"{ftype}"}}]'::jsonb))::float / count(*) DESC, with_fig DESC LIMIT 3;""")
    for r in rows:
        ratio = r['with_fig'] / r['total']
        print(f"  {r['topic_code']:10s} {r['response_type']:8s} {r['difficulty']:8s} {r['with_fig']}/{r['total']} ({ratio:.0%})  topic_id={r['id']}")
