import os
"""
Update 3 prompts with LANGUAGE section + LaTeX rules.
Prepends language block to top, appends LaTeX rule to response format section.
Saves old version to prompt_versions.
"""
import json
import urllib.request
import time
import sys

sys.stdout.reconfigure(encoding="utf-8")

MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

LANGUAGE_BLOCK = """== LANGUAGE ==
You MUST respond entirely in {{language_name}}. All explanations, feedback, questions, and encouragement must be in {{language_name}}. Use the correct subject-specific terminology for this language.

Language rules by subject:
- Chemistry, Physics, Biology, CS, English: Respond in English. Use English scientific/technical terminology.
- French (0520): Respond entirely in French. Use French grammatical terms. Explain in French. Encouragement in French.
- Portuguese (0504): Respond entirely in Portuguese. Use Portuguese literary/linguistic terms. Explain in Portuguese. Encouragement in Portuguese.

"""

LATEX_RULE = """
== FORMATTING ==
For mathematical formulas, chemical equations, and scientific notation, use LaTeX notation:
- $inline$ for inline formulas (e.g. $\\rho = \\frac{m}{V}$, $CO_2$, $\\Delta H$)
- $$block$$ for displayed equations
- Use **bold** for key terms.
Always prefer LaTeX over Unicode for formulas — the frontend renders it properly."""


def run_sql(sql):
    for attempt in range(5):
        data = json.dumps({"query": sql}).encode("utf-8")
        req = urllib.request.Request(MGMT_API, data=data, method="POST", headers={
            "Authorization": f"Bearer {MGMT_TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "supabase-cli/2.84.4",
        })
        try:
            resp = urllib.request.urlopen(req)
            return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            raise


def escape(text):
    return text.replace("'", "''")


SLUGS = ["chat_tutor", "quiz_evaluator", "flashcard_explainer"]

print("Updating 3 prompts with LANGUAGE + LaTeX rules...\n")

for slug in SLUGS:
    # Get current
    result = run_sql(f"SELECT id, content, version FROM prompts WHERE slug = '{slug}'")
    if not result:
        print(f"  SKIP {slug}: not found")
        continue

    row = result[0]
    old_content = row["content"]
    old_version = row["version"]

    # Skip if already has LANGUAGE section
    if "== LANGUAGE ==" in old_content:
        print(f"  SKIP {slug}: already has LANGUAGE section (v{old_version})")
        continue

    # Build new content: LANGUAGE at top + LATEX at end
    new_content = LANGUAGE_BLOCK + old_content + LATEX_RULE

    # Save old to history
    safe_old = escape(old_content)
    run_sql(f"""INSERT INTO prompt_versions (prompt_id, content, version, change_note)
        VALUES ('{row["id"]}', '{safe_old}', {old_version}, 'Before LANGUAGE + LaTeX update')""")
    time.sleep(0.5)

    # Update
    safe_new = escape(new_content)
    new_version = old_version + 1
    run_sql(f"""UPDATE prompts SET content = '{safe_new}', version = {new_version}, updated_at = now()
        WHERE slug = '{slug}'""")
    time.sleep(0.5)

    print(f"  {slug}: v{old_version} -> v{new_version} ({len(new_content)} chars)")

print("\nDone. Verifying:")
time.sleep(1)
result = run_sql("SELECT slug, version, length(content) AS len FROM prompts ORDER BY slug")
for r in result:
    print(f"  {r['slug']}: v{r['version']}, {r['len']} chars")
