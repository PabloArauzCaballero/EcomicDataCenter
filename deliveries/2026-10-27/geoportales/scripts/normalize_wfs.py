"""Normaliza capas WFS descargadas (ndjson crudo) al esquema comun, en streaming.
Uso: python -I normalize_wfs.py <inventario.json> <dir_crudo> <dir_salida> <source> <base_ows>
       <municipio> <departamento> [<ndjson_poligono_jurisdiccion>]
Escribe <dir_salida>/<capa>.ndjson.gz y <dir_salida>/_stats.json.
"""
import sys, json, gzip, os, re, urllib.parse
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8")
inv_f, raw_dir, out_dir, SOURCE, BASE, MUNI, DEPT = sys.argv[1:8]
juris_f = sys.argv[8] if len(sys.argv) > 8 else None
RETRIEVED = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
inv = {l["name"]: l for l in json.load(open(inv_f, encoding="utf-8"))}
os.makedirs(out_dir, exist_ok=True)

# Campos con datos personales o internos que no se publican en raw
DROP = {"ci", "exp", "nit_ci", "usuario", "owner", "control_usuario", "idusuarioactualizador", "email"}

NAME = ["nombre", "razonsocial", "denominacion", "nombrecentro", "nombr_snis", "nombrecontribuyente",
        "nombreoficina", "nombre_esc", "name", "ue1", "text", "titulo", "layer"]
ADDR = ["direccion", "ubicacion", "nombredireccion", "direccionreferencia", "direccionreferencial"]
LOCAL = ["zona", "zonaref", "macrodistrito", "distrito"]
PHONE = ["telefono", "celular"]
WEB = ["paginaweb", "direcionweb", "direccionweb", "web", "enlace"]
HOURS = ["horariosatencion", "horario"]
UPD = ["fechaactual", "fecha_actualizacion", "fechaactualizacion", "fecha"]
CAT = ["entidad", "tipo_ofi", "actividad", "actividaddesarrollada", "descgrupo", "categoria", "tipo", "subtipo",
       "tipo_desc", "subtipo_desc", "sector", "nivel", "niveles", "clase", "tipologia", "descripcio",
       "tipoatencion", "tiporuta", "tipovehicu", "entidad"]
EMPTY = {"", "s/n", "sn", "null", "none", "-", "0", "no identificada", "sin dato", "s/d"}


def val(props_l, keys):
    for k in keys:
        x = props_l.get(k)
        if x is None:
            continue
        s = str(x).strip()
        s = re.sub(r"(\s+S/N)+$", "", s, flags=re.I).strip()
        if s.lower() not in EMPTY:
            return s
    return None


def ring_centroid(r):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]):
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    if abs(a) < 1e-15:
        xs, ys = [p[0] for p in r], [p[1] for p in r]
        return sum(xs) / len(xs), sum(ys) / len(ys), 0
    return cx / (3 * a), cy / (3 * a), abs(a / 2)


def centroid(g):
    t, c = g.get("type"), g.get("coordinates")
    if t == "Point":
        return c[0], c[1], "point"
    if t == "MultiPoint":
        return c[0][0], c[0][1], "multipoint_first"
    polys = [c] if t == "Polygon" else c if t == "MultiPolygon" else None
    if polys:
        best = max((ring_centroid([tuple(p[:2]) for p in poly[0]]) for poly in polys if poly and poly[0]), key=lambda z: z[2])
        return best[0], best[1], "polygon_centroid"
    if t in ("LineString", "MultiLineString"):
        pts = c if t == "LineString" else [p for l in c for p in l]
        m = pts[len(pts) // 2]
        return m[0], m[1], "line_midpoint"
    return None, None, None


def wkt_point(w):
    nums = [float(x) for x in re.findall(r"-?\d+\.?\d*(?:[eE]-?\d+)?", w or "")]
    if len(nums) < 2:
        return None, None, None
    xs, ys = nums[0::2], nums[1::2]
    x, y = sum(xs) / len(xs), sum(ys) / len(ys)
    return x, y, "wkt_mean"


def fix_axis(x, y):
    """Devuelve (lat, lon); corrige ejes invertidos con el rango de Bolivia."""
    if x is None:
        return None, None
    if -23.5 < x < -9 and -70 < y < -57:
        return x, y
    return y, x


poly = None
if juris_f:
    f = json.loads(open(juris_f, encoding="utf-8").readline())
    g = f["geometry"]
    poly = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]


def inside(lon, lat):
    if poly is None:
        return True
    hit = False
    for p in poly:
        for ri, ring in enumerate(p):
            r_in = False
            for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
                if (y0 > lat) != (y1 > lat) and lon < (x1 - x0) * (lat - y0) / (y1 - y0) + x0:
                    r_in = not r_in
            if ri == 0 and not r_in:
                break
            if ri == 0:
                hit = True
            elif r_in:
                hit = False
        if hit:
            return True
    return False


stats = {}
for fn in sorted(os.listdir(raw_dir)):
    if not fn.endswith(".ndjson"):
        continue
    lay = fn[:-7].replace("__", ":", 1)
    meta = inv.get(lay, {})
    title = meta.get("title") or lay
    n = nogeo = named = inmuni = 0
    outp = os.path.join(out_dir, fn[:-7] + ".ndjson.gz")
    with open(os.path.join(raw_dir, fn), encoding="utf-8") as src, gzip.open(outp, "wt", encoding="utf-8") as out:
        for line in src:
            f = json.loads(line)
            props = f.get("properties") or {}
            pl = {k.lower(): v for k, v in props.items()}
            if f.get("geometry"):
                x, y, how = centroid(f["geometry"])
            else:
                x, y, how = wkt_point(f.get("geometry_wkt"))
            lat, lon = fix_axis(y, x) if x is not None else (None, None)
            # fix_axis espera (lat?, lon?): GeoJSON da x=lon, y=lat
            if lat is None:
                nogeo += 1
            name = val(pl, NAME)
            if pl.get("nombreoficina") and pl.get("nombre") and pl["nombreoficina"] != pl["nombre"]:
                name = f'{pl["nombre"]} - {pl["nombreoficina"]}'
            addr = val(pl, ADDR)
            if not addr and pl.get("nombre_via"):
                addr = " ".join(str(p) for p in (pl.get("tipo_via"), pl.get("nombre_via"), pl.get("num_puerta")) if p not in (None, ""))
            if addr and pl.get("numeropuerta") and str(pl["numeropuerta"]) not in addr:
                addr = f'{addr} {pl["numeropuerta"]}'
            web = val(pl, WEB)
            if web and "maps.google" in web:
                web = None
            cats = []
            for k in CAT:
                s = val(pl, [k])
                if s and s not in cats and not s.isdigit():
                    cats.append(s)
            in_m = lat is not None and inside(lon, lat)
            inmuni += in_m
            named += bool(name)
            fid = f.get("id")
            rec = {
                "source": SOURCE,
                "source_id": f"{lay}/{fid}",
                "name": name,
                "category_raw": " | ".join([title] + cats),
                "address": addr,
                "locality": val(pl, LOCAL[:2]),
                "municipality": MUNI if (in_m and MUNI) else None,
                "department": DEPT or None,
                "lat": round(lat, 7) if lat is not None else None,
                "lon": round(lon, 7) if lon is not None else None,
                "phone": " / ".join(s for s in (val(pl, [k]) for k in PHONE) if s) or None,
                "website": web,
                "hours": val(pl, HOURS),
                "source_updated_at": val(pl, UPD),
                "source_url": BASE + "?" + urllib.parse.urlencode({"service": "WFS", "version": "2.0.0", "request": "GetFeature",
                                                                   "typeNames": lay, "featureID": fid, "outputFormat": "application/json"}),
                "retrieved_at": RETRIEVED,
                "raw": {"layer": lay, "layer_title": title, "geom_from": how,
                        "in_municipality_polygon": in_m if poly is not None else None,
                        "properties": {k: v for k, v in props.items() if k.lower() not in DROP}},
            }
            out.write(json.dumps(rec, ensure_ascii=False, default=str) + "\n")
            n += 1
    stats[lay] = {"title": title, "rows": n, "named": named, "no_geom": nogeo, "in_muni": inmuni,
                  "crs_native": meta.get("crs"), "hits": meta.get("hits"), "file": os.path.basename(outp)}
    print(lay, n, named, nogeo, inmuni, flush=True)
json.dump(stats, open(os.path.join(out_dir, "_stats.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
