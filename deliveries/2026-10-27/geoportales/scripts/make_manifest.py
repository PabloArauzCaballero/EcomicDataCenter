"""Escribe manifest.json con sha256, bytes y filas de cada archivo de la entrega (streaming).
Uso: python -I make_manifest.py <dir_entrega>"""
import sys, os, json, hashlib, gzip
from collections import Counter
from datetime import datetime, timezone
sys.stdout.reconfigure(encoding="utf-8")
D = sys.argv[1]
files, by_source, total = [], Counter(), 0
for root, _, fs in os.walk(D):
    for f in sorted(fs):
        p = os.path.join(root, f)
        rel = os.path.relpath(p, D).replace("\\", "/")
        if rel == "manifest.json":
            continue
        h = hashlib.sha256()
        with open(p, "rb") as fh:
            for b in iter(lambda: fh.read(1 << 20), b""):
                h.update(b)
        e = {"path": rel, "bytes": os.path.getsize(p), "sha256": h.hexdigest()}
        if f.endswith(".ndjson.gz"):
            n, src = 0, None
            with gzip.open(p, "rt", encoding="utf-8") as g:
                for line in g:
                    n += 1
                    if src is None:
                        src = json.loads(line)["source"]
            e["rows"], e["source"] = n, src
            if "descartes" not in rel:
                by_source[src] += n
                total += n
        files.append(e)
files.sort(key=lambda e: e["path"])
m = {"delivery": "2026-10-27/geoportales", "branch": "datos/2026-10-27-geoportales",
     "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
     "crs": "EPSG:4326 (WGS84); las capas UTM 19S del GAMLP se reproyectaron en el servidor (srsName=EPSG:4326)",
     "rows_total": total, "rows_by_source": dict(by_source),
     "schema": ["source", "source_id", "name", "category_raw", "address", "locality", "municipality", "department",
                "lat", "lon", "phone", "website", "hours", "source_updated_at", "source_url", "retrieved_at", "raw"],
     "files": files}
json.dump(m, open(os.path.join(D, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(total, dict(by_source), len(files))
