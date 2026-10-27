"""Separa de wikidata.ndjson.gz las filas cuya coordenada cae fuera de la caja de Bolivia
(embajadas en el exterior, el continente, etc.). Uso: python -I wd_filter.py in.gz out.gz descartes.gz"""
import sys, gzip, json
from collections import Counter
src, dst, rej = sys.argv[1:4]
k = Counter()
with gzip.open(dst, "wt", encoding="utf-8") as o, gzip.open(rej, "wt", encoding="utf-8") as x:
    for line in gzip.open(src, "rt", encoding="utf-8"):
        r = json.loads(line)
        inbox = -22.95 <= r["lat"] <= -9.6 and -69.7 <= r["lon"] <= -57.4
        if inbox:
            o.write(line); k[("ok", r["raw"]["match"])] += 1
        else:
            x.write(line); k[("fuera", r["raw"]["match"])] += 1
print(dict(k))
