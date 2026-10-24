import sys, io, os, json, urllib.request, urllib.error

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

API_URL = "https://xruigpt-staging.geely.com/apisix/api/open/other/webSearch"

def search(query):
    token = os.environ.get('WEB_SEARCH_API_TOKEN', '')
    if not token:
        print("NO TOKEN")
        return None

    payload = {
        "query": query,
        "engineType": "GenericAdvanced",
        "contents": {
            "mainText": False, "markdownText": False,
            "summary": True, "rerankScore": False
        }
    }
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "agent-api-token": token}
    try:
        req = urllib.request.Request(API_URL, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"ERR: {e}")
        return None

def show(r):
    if r is None: return
    items = r.get("pageItems", [])
    if not items:
        print("NO RESULTS")
        return
    for i, item in enumerate(items[:8], 1):
        t = item.get('title','')
        s = item.get('snippet','')[:300]
        u = item.get('link','') or item.get('url','')
        print(f"\n{i}. {t}")
        print(f"   {s}")
        if u: print(f"   URL: {u}")

if len(sys.argv) < 2:
    print("Usage: python _search2.py <query>")
    sys.exit(1)

query = sys.argv[1]
print(f"=== SEARCH: {query} ===")
r = search(query)
show(r)