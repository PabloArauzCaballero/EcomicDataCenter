"""Resumen de un ndjson.gz normalizado: filas, completitud por campo, top categorias.
Uso: python -I qa.py archivo.ndjson.gz [n_muestras]"""
import sys, gzip, json
from collections import Counter
sys.stdout.reconfigure(encoding="utf-8")
F = ["name", "category_raw", "address", "locality", "municipality", "department", "lat", "lon", "phone", "website", "hours", "source_updated_at"]
c, cats, n, samples = Counter(), Counter(), 0, []
k = int(sys.argv[2]) if len(sys.argv) > 2 else 0
bad = 0
for line in gzip.open(sys.argv[1], "rt", encoding="utf-8"):
    r = json.loads(line)
    n += 1
    for f in F:
        if r.get(f) not in (None, ""):
            c[f] += 1
    cats[(r.get("category_raw") or "")[:60]] += 1
    if r.get("lat") is not None and not (-23.5 < r["lat"] < -9.5 and -70 < r["lon"] < -57.3):
        bad += 1
    if len(samples) < k and n % 997 == 1:
        samples.append(r)
print("rows", n, "| fuera_caja_bolivia", bad)
print({f: f"{c[f]}" for f in F})
print(cats.most_common(15))
for s in samples:
    s = dict(s); s["raw"] = str(s["raw"])[:200]
    print(json.dumps(s, ensure_ascii=False)[:700])
