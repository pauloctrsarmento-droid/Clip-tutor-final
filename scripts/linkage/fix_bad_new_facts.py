"""One-off: reconcile malformed `new_facts_approved` entries that came back as bare strings."""
import json, urllib.request, sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

TOK = next(l.split('=',1)[1].strip() for l in open('web/.env.local').read().splitlines() if l.startswith('SUPABASE_ACCESS_TOKEN='))
HDR = {'Authorization': f'Bearer {TOK}', 'Content-Type': 'application/json', 'User-Agent': 'supabase-cli/2.84.4'}

def sql(q):
    req = urllib.request.Request('https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query',
        data=json.dumps({'query': q}).encode(), method='POST', headers=HDR)
    return json.loads(urllib.request.urlopen(req, timeout=60).read())

rows = sql('''SELECT id::text, question_id::text, new_facts_approved, new_facts_proposed
FROM linkage_proposals
WHERE status='reviewed' AND new_facts_approved IS NOT NULL
  AND jsonb_array_length(new_facts_approved) > 0
  AND jsonb_typeof(new_facts_approved->0) <> 'object';''')
print(f'{len(rows)} bad rows', file=sys.stderr)

fixed = 0
for r in rows:
    approved_ids = r['new_facts_approved']
    proposed = r['new_facts_proposed'] or []
    by_id = {p.get('proposed_id'): p for p in proposed if isinstance(p, dict)}
    rebuilt = []
    for aid in approved_ids:
        if not isinstance(aid, str):
            continue
        if aid in by_id:
            p = by_id[aid]
            rebuilt.append({
                'proposed_id': aid,
                'fact_text': p.get('fact_text'),
                'flashcard_front': p.get('flashcard_front'),
                'rationale': 'opus approved (reconciled from sonnet proposal)',
            })
    if not rebuilt:
        print(f'  SKIP {r["id"][:8]}: no matching sonnet entries', file=sys.stderr)
        continue
    rebuilt_json = json.dumps(rebuilt).replace("'", "''")
    sql(f"UPDATE linkage_proposals SET new_facts_approved=$linkage${rebuilt_json}$linkage$::jsonb WHERE id='{r['id']}';")
    fixed += 1
print(f'Fixed {fixed}', file=sys.stderr)
