"""Poll Vercel deployments for the web project."""
import json, sys, urllib.request
sys.stdout.reconfigure(encoding='utf-8')

TOK = next(l.split('=', 1)[1].strip() for l in open('web/.env.local').read().splitlines() if l.startswith('VERCEL_TOKEN='))
url = 'https://api.vercel.com/v6/deployments?projectId=prj_sxRP2uxtTSXP0NkZC9TYmWkBqrbY&teamId=team_RdDyI7DlhMFQBrPM3yAXAn4G&limit=3'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOK}'})
data = json.loads(urllib.request.urlopen(req, timeout=30).read())
for d in data['deployments']:
    sha = d.get('meta', {}).get('githubCommitSha', '')[:8]
    print(f"{d.get('uid')[:18]}  {d.get('readyState'):>10s}  sha={sha}  {d.get('url')}")
