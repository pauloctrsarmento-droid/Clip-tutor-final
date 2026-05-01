"""Apply the latest seed-companion-prompt.sql content to the live DB row."""
import json, urllib.request, urllib.error, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")

# Load token from web/.env.local
ENV_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web", ".env.local")
TOKEN = None
for line in open(ENV_FILE, encoding="utf-8"):
    if line.startswith("SUPABASE_ACCESS_TOKEN="):
        TOKEN = line.split("=", 1)[1].strip()
        break
if not TOKEN:
    raise SystemExit("No SUPABASE_ACCESS_TOKEN in web/.env.local")

URL = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

# Extract prompt body from the seed SQL
SEED_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed-companion-prompt.sql")
seed = open(SEED_FILE, encoding="utf-8").read()
m = re.search(r"\$PROMPT\$([\s\S]*?)\$PROMPT\$", seed)
if not m:
    raise SystemExit("Could not extract prompt body from seed file")
body = m.group(1)

# Use a unique dollar-quote tag to avoid collision
sql = (
    "UPDATE prompts SET content = $NEW_BODY$"
    + body
    + "$NEW_BODY$, version = version + 1, updated_at = now() "
    + "WHERE slug = 'chat_tutor_companion' "
    + "RETURNING slug, version, length(content) AS chars;"
)

req = urllib.request.Request(
    URL,
    data=json.dumps({"query": sql}).encode("utf-8"),
    method="POST",
    headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "supabase-cli/2.84.4",
    },
)
try:
    print(urllib.request.urlopen(req).read().decode())
except urllib.error.HTTPError as e:
    print("HTTP", e.code, ":", e.read().decode()[:500])
