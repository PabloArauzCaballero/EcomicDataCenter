"""Normaliza las categorias de puntos del Mapa Interactivo de la Direccion de Planificacion
del GAM Cochabamba (planificacionapi.cochabamba.bo/api/v1/site/list/?category_id=N).
Descarta lineas (tendido de fibra); poligonos -> centroide.
Uso: python -I normalize_cbba.py <dir_sites> <categorias.tsv> <salida.ndjson.gz>"""
import sys, json, gzip, os, re
from datetime import datetime, timezone
sys.stdout.reconfigure(encoding="utf-8")
sites, cats_f, out = sys.argv[1:4]
RET = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
cats = {}
for line in open(cats_f, encoding="utf-8"):
    cid, path, _, desc = line.rstrip("\n").split("\t")
    cats[int(cid)] = path.strip()
API = "https://planificacionapi.cochabamba.bo/api/v1/site/list/?category_id="


def centroid(g):
    t, c = g["type"], g["coordinates"]
    if t == "Point":
        return c[0], c[1]
    if t == "MultiPoint":
        return c[0][0], c[0][1]
    if t in ("Polygon", "MultiPolygon"):
        ring = (c[0] if t == "Polygon" else max(c, key=lambda p: len(p[0]))[0])
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    return None


def first(p, keys):
    for k in keys:
        v = p.get(k)
        if v not in (None, "") and str(v).strip():
            return str(v).strip()
    return None


n = skipped = 0
stats = {}
with gzip.open(out, "wt", encoding="utf-8") as o:
    for fn in sorted(os.listdir(sites)):
        cid = int(re.search(r"\d+", fn).group())
        d = json.load(open(os.path.join(sites, fn), encoding="utf-8"))
        k = 0
        for i, f in enumerate(d["features"]):
            g = f.get("geometry") or {}
            xy = centroid(g) if g else None
            if not xy:
                skipped += 1
                continue
            p = f.get("properties") or {}
            if g.get("type") in ("Polygon", "MultiPolygon") and not first(p, ["Name", "Nombre", "Establecim", "name", "nombre", "NOMBRE"]):
                skipped += 1  # predios sin nombre (categoria 154)
                continue
            extra = [first(p, [x]) for x in ("Tipo", "Nivel", "Subsector", "Sectorial", "Dependenci")]
            rec = {"source": "gamc_planificacion_mapa_interactivo",
                   "source_id": f"{cid}/{f.get('id') or i}",
                   "name": first(p, ["Name", "Nombre", "Establecim", "name", "nombre", "NOMBRE"]),
                   "category_raw": " | ".join([cats.get(cid, str(cid))] + [e for e in extra if e]),
                   "address": first(p, ["Dirección", "Direccion", "DIRECCION"]),
                   "locality": first(p, ["comuna", "Comuna"]),
                   "municipality": "Cochabamba", "department": "Cochabamba",
                   "lat": round(xy[1], 7), "lon": round(xy[0], 7),
                   "phone": first(p, ["Telefono", "Teléfono"]), "website": None, "hours": None,
                   "source_updated_at": None, "source_url": API + str(cid), "retrieved_at": RET,
                   "raw": {"category_id": cid, "geometry_type": g.get("type"),
                           "properties": {kk: vv for kk, vv in p.items() if kk != "icon_path"}}}
            o.write(json.dumps(rec, ensure_ascii=False) + "\n")
            n += 1
            k += 1
        stats[cid] = k
print("rows", n, "skipped_lines_or_unnamed_polygons", skipped, stats)
