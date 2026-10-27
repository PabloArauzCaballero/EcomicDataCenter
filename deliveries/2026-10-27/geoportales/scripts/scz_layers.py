"""Arma la lista de capas de la Guia Urbana del GAM Santa Cruz de la Sierra:
cruza las llamadas $.get("public/api/<grupo>/"+$("#<id>").val()) del JS con los
<input id=... value=...> del HTML. Escribe TSV: grupo, id, valor, etiqueta, url.
Uso: python -I scz_layers.py guiaurbana.html inicio.min.js salida.tsv"""
import sys, re, html
sys.stdout.reconfigure(encoding="utf-8")
h = open(sys.argv[1], encoding="utf-8", errors="replace").read()
js = open(sys.argv[2], encoding="utf-8", errors="replace").read()
BASE = "https://guiaurbana.gmsantacruz.gob.bo/guiaurbana/"
calls = re.findall(r'\$\.get\("public/api/([A-Za-z]+)/"\+\$\("#([^"]+)"\)\.val\(\)', js)
inputs = {}
for m in re.finditer(r"<input\b[^>]*>", h):
    tag = m.group(0)
    i = re.search(r'\bid="([^"]+)"', tag)
    v = re.search(r'\bvalue="([^"]*)"', tag)
    if i and v:
        # etiqueta: texto del <label for=id> si existe
        lab = re.search(r'<label[^>]*for="%s"[^>]*>(.*?)</label>' % re.escape(i.group(1)), h, re.S)
        txt = re.sub(r"<[^>]+>", " ", lab.group(1)) if lab else ""
        inputs[i.group(1)] = (v.group(1), html.unescape(" ".join(txt.split())))
seen = set()
with open(sys.argv[3], "w", encoding="utf-8") as f:
    for grp, iid in calls:
        iid = re.sub(r"\\x([0-9a-fA-F]{2})", lambda m: chr(int(m.group(1), 16)), iid)
        if grp in ("distrito", "areaUrbana", "distritoLimite"):
            continue  # poligonos de distritos y limites, no son lugares
        if (grp, iid) in seen:
            continue
        seen.add((grp, iid))
        val, lab = inputs.get(iid, ("", ""))
        url = f"{BASE}public/api/{grp}/{val}"
        f.write("\t".join([grp, iid, val, lab, url]) + "\n")
        print(grp, iid, repr(val), lab, sep=" | ")
