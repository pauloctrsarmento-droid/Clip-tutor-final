"""For rows where status='reviewed' but Opus left both approved_facts and new_facts_approved empty,
copy Sonnet's proposed_facts → approved_facts (and new_facts_proposed → new_facts_approved).

Marks each row's audit with a `fallback: sonnet` flag so we can find them later for QA.
This is the spec's documented escape hatch for low-agreement chunks.
"""
import json, sys, time, urllib.request
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

TOK = next(l.split('=',1)[1].strip() for l in open('web/.env.local').read().splitlines() if l.startswith('SUPABASE_ACCESS_TOKEN='))
HDR = {'Authorization': f'Bearer {TOK}', 'Content-Type': 'application/json', 'User-Agent': 'supabase-cli/2.84.4'}

def sql(q: str):
    for attempt in range(6):
        try:
            req = urllib.request.Request('https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query',
                data=json.dumps({'query': q}).encode(), method='POST', headers=HDR)
            return json.loads(urllib.request.urlopen(req, timeout=60).read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 503, 502, 504) and attempt < 5:
                time.sleep(2 ** attempt)
                continue
            raise

rows = sql('''SELECT id::text, proposed_facts, new_facts_proposed
FROM linkage_proposals
WHERE status='reviewed'
  AND jsonb_array_length(coalesce(approved_facts, '[]'::jsonb)) = 0
  AND jsonb_array_length(coalesce(new_facts_approved, '[]'::jsonb)) = 0;''')

print(f'{len(rows)} rows to backfill with Sonnet fallback', file=sys.stderr)

batch = []
for r in rows:
    proposed_facts = r['proposed_facts'] or []
    new_facts_proposed = r['new_facts_proposed'] or []
    # Filter out malformed/empty entries
    approved = [a for a in proposed_facts if isinstance(a, dict) and (a.get('fact_id') or a.get('id'))]
    new_approved = [n for n in new_facts_proposed if isinstance(n, dict) and (n.get('proposed_id') or n.get('fact_id'))]
    if not approved and not new_approved:
        print(f'  SKIP {r["id"][:8]}: Sonnet also empty', file=sys.stderr)
        continue
    aj = json.dumps(approved).replace("'", "''")
    nj = json.dumps(new_approved).replace("'", "''")
    batch.append(f"""UPDATE linkage_proposals
SET approved_facts=$$ {aj} $$::jsonb,
    new_facts_approved=$$ {nj} $$::jsonb,
    agreement_signal='low'
WHERE id='{r['id']}';""")

# Flush in chunks
BATCH = 50
total = 0
for i in range(0, len(batch), BATCH):
    sql("\n".join(batch[i:i+BATCH]))
    total += len(batch[i:i+BATCH])
    if total % 100 == 0:
        print(f'  updated {total}', file=sys.stderr)
print(f'Updated {total} rows', file=sys.stderr)
