"""Lista todos los conjuntos de un CKAN con sus recursos (formato, url) a un JSON compacto.
Uso: python -I ckan_list.py <base> <salida.json>"""
import sys, json, urllib.request, urllib.parse
sys.stdout.reconfigure(encoding="utf-8")
base, out = sys.argv[1], sys.argv[2]
UA = {"User-Agent": "Mozilla/5.0 DatosBolivia-collector/1.0"}
rows, start = [], 0
while True:
    u = f"{base}/api/3/action/package_search?" + urllib.parse.urlencode({"rows": 200, "start": start})
    d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120))["result"]
    for p in d["results"]:
        rows.append({"name": p["name"], "title": p.get("title"), "org": (p.get("organization") or {}).get("title"),
                     "license": p.get("license_title"), "modified": p.get("metadata_modified"),
                     "tags": [t["name"] for t in p.get("tags", [])],
                     "resources": [{"name": r.get("name"), "format": r.get("format"), "url": r.get("url"),
                                    "modified": r.get("last_modified") or r.get("created")} for r in p.get("resources", [])]})
    start += 200
    if start >= d["count"]:
        break
json.dump(rows, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("datasets", len(rows))
