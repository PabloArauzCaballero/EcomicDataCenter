"""amarillas.bo: enumerate all rubros (with counts) from /rubro/letra=X pages; save JSON."""
import re, json, os, string, html
from common import Http, SCRATCH
h = Http(pause=1.5)
rub = {}
for L in string.ascii_lowercase:
    r = h.get(f"http://www.amarillas.bo/rubro/letra={L}")
    if r is None:
        print("fail", L); continue
    for m in re.finditer(r'href="http://www\.amarillas\.bo/rubro/([^"/]+)"[^>]*>\s*([^<]*?)\s*\((\d+)\)\s*<', r.text):
        rub[m.group(1)] = {"name": html.unescape(m.group(2)), "n": int(m.group(3))}
    print(L, len(rub), flush=True)
os.makedirs(os.path.join(SCRATCH, "raw", "am"), exist_ok=True)
json.dump(rub, open(os.path.join(SCRATCH, "raw", "am", "rubros.json"), "w", encoding="utf-8"), ensure_ascii=False)
print("rubros", len(rub), "sum counts", sum(v["n"] for v in rub.values()))
print(sorted(rub.items(), key=lambda kv: -kv[1]["n"])[:15])
