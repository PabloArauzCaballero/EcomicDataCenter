"""Normaliza las capas de la Guia Urbana del GAM Santa Cruz de la Sierra (public/api/<grupo>/<valor>).
Uso: python -I normalize_scz.py capas.tsv <dir_api> <salida.ndjson.gz>"""
import sys, json, gzip, os, urllib.parse
from collections import Counter
from datetime import datetime, timezone
sys.stdout.reconfigure(encoding="utf-8")
tsv, api, out = sys.argv[1:4]
RET = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def c(s):
    s = (str(s) if s is not None else "").strip()
    return s if s and s.upper() not in ("S/N", "SN", "-", "NULL") else None


stats, n, nogeo, dup = Counter(), 0, 0, 0
seen = set()
with gzip.open(out, "wt", encoding="utf-8") as o:
    for line in open(tsv, encoding="utf-8"):
        grp, iid, val, lab, url = line.rstrip("\n").split("\t")
        fn = os.path.join(api, f"{grp}__{iid}.json")
        if not val or not os.path.exists(fn):
            continue
        rows = json.load(open(fn, encoding="utf-8"))
        if isinstance(rows, dict):
            rows = rows.get("data") or rows.get("features") or []
        layer = iid.replace("_", " ")
        for i, r in enumerate(rows):
            try:
                lon, lat = float(r.get("x")), float(r.get("y"))
                if not (-23.5 < lat < -9 and -70 < lon < -57):
                    raise ValueError
            except Exception:
                lat = lon = None
                nogeo += 1
            key = (json.dumps(r, sort_keys=True, ensure_ascii=False))
            if key in seen:  # la API devuelve por prefijo (80 incluye 80.1): misma fila en dos capas
                dup += 1
                continue
            seen.add(key)
            dist = c(r.get("distrito"))
            cats = [x for x in (f"{grp} > {layer}", c(r.get("nivel")), c(r.get("infraestru")), c(r.get("adm"))) if x]
            rec = {"source": "gamscs_guia_urbana",
                   "source_id": f"{grp}/{val}/{i}",
                   "name": c(r.get("nombre")),
                   "category_raw": " | ".join(dict.fromkeys(cats)),
                   "address": c(r.get("direccion")),
                   "locality": c(r.get("barrio")) or (f"UV {c(r.get('uv'))}" if c(r.get("uv")) else None),
                   "municipality": "Santa Cruz de la Sierra", "department": "Santa Cruz",
                   "lat": round(lat, 7) if lat is not None else None,
                   "lon": round(lon, 7) if lon is not None else None,
                   "phone": c(r.get("telefono")), "website": None, "hours": None,
                   "source_updated_at": None,
                   "source_url": url.rsplit("/", 1)[0] + "/" + urllib.parse.quote(val),
                   "retrieved_at": RET,
                   "raw": {"grupo": grp, "capa": iid, "valor": val, "distrito_municipal": dist,
                           "properties": {k: v for k, v in r.items() if k != "google_map"}}}
            o.write(json.dumps(rec, ensure_ascii=False) + "\n")
            n += 1
            stats[f"{grp}/{iid}"] += 1
print("rows", n, "nogeo", nogeo, "duplicados_entre_capas", dup)
json.dump(stats, open(out.replace(".ndjson.gz", "_stats.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
