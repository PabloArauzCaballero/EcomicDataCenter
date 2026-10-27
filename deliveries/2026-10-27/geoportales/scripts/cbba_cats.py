"""Aplana el arbol de categorias del mapa interactivo de Planificacion (GAM Cochabamba).
Uso: python -I cbba_cats.py categorias.json salida.tsv"""
import sys, json
sys.stdout.reconfigure(encoding="utf-8")
d = json.load(open(sys.argv[1], encoding="utf-8"))
rows = []


def walk(cs, path):
    for c in cs:
        p = path + [c["title"]]
        subs = c.get("subcategories") or []
        rows.append((c["id"], " > ".join(p), len(subs), (c.get("description") or "").replace("\t", " ").replace("\n", " ")))
        walk(subs, p)


walk(d["categories"], [])
with open(sys.argv[2], "w", encoding="utf-8") as f:
    for r in rows:
        f.write("\t".join(map(str, r)) + "\n")
        print(*r, sep=" | ")
