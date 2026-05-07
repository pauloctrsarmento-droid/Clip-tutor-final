"""Fix entries where new_facts_approved uses fact_id instead of proposed_id, or lacks ID entirely."""
import json, urllib.request, sys, re
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

TOK = next(l.split('=',1)[1].strip() for l in open('web/.env.local').read().splitlines() if l.startswith('SUPABASE_ACCESS_TOKEN='))
HDR = {'Authorization': f'Bearer {TOK}', 'Content-Type': 'application/json', 'User-Agent': 'supabase-cli/2.84.4'}

def sql(q):
    req = urllib.request.Request('https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query',
        data=json.dumps({'query': q}).encode(), method='POST', headers=HDR)
    return json.loads(urllib.request.urlopen(req, timeout=60).read())

# Find all entries missing proposed_id
rows = sql('''SELECT id::text, chunk_id, question_id::text, new_facts_approved
FROM linkage_proposals
WHERE status='reviewed' AND new_facts_approved IS NOT NULL
  AND jsonb_array_length(new_facts_approved) > 0;''')

# Filter to those with at least one entry missing proposed_id
to_fix = []
for r in rows:
    needs = False
    for nf in r['new_facts_approved']:
        if not isinstance(nf, dict):
            continue
        if 'proposed_id' not in nf:
            needs = True
            break
    if needs:
        to_fix.append(r)

print(f'{len(to_fix)} rows need proposed_id fix', file=sys.stderr)

# For each row, determine the next sequence number for that chunk's topic prefix
# We'll look at existing approved proposed_ids in the same chunk's topic to avoid clashes
fixed = 0
for r in to_fix:
    chunk_topic = '_'.join(r['chunk_id'].split('_')[:-1])  # e.g. BIO_T1 from BIO_T1_chunk_01
    # Generate sequential IDs: <topic>_GEN_F<NN>
    used = set()
    # Find existing ids in this whole topic across all rows for naming
    existing_rows = sql(f'''SELECT new_facts_approved FROM linkage_proposals
    WHERE chunk_id LIKE '{chunk_topic}_chunk_%' AND new_facts_approved IS NOT NULL;''')
    for er in existing_rows:
        for nf in (er['new_facts_approved'] or []):
            if isinstance(nf, dict):
                pid = nf.get('proposed_id') or nf.get('fact_id')
                if pid:
                    used.add(pid)

    rebuilt = []
    for nf in r['new_facts_approved']:
        if not isinstance(nf, dict):
            continue
        if 'proposed_id' in nf:
            rebuilt.append(nf)
            continue
        # Fall back to fact_id; else synthesize
        pid = nf.get('fact_id')
        if not pid:
            # Synthesize next free ID
            n = 1
            while f'{chunk_topic}_GEN_F{n:02d}' in used:
                n += 1
            pid = f'{chunk_topic}_GEN_F{n:02d}'
            used.add(pid)
        new_nf = {
            'proposed_id': pid,
            'fact_text': nf.get('fact_text'),
            'flashcard_front': nf.get('flashcard_front'),
            'rationale': nf.get('rationale', 'reconciled'),
        }
        rebuilt.append(new_nf)

    rebuilt_json = json.dumps(rebuilt).replace("'", "''")
    sql(f"UPDATE linkage_proposals SET new_facts_approved=$linkage${rebuilt_json}$linkage$::jsonb WHERE id='{r['id']}';")
    fixed += 1
print(f'Fixed {fixed}', file=sys.stderr)
