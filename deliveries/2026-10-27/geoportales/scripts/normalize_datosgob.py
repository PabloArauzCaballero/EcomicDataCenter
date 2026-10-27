"""Normaliza dos conjuntos de datos.gob.bo con coordenadas:
- estab: establecimientos educativos 2016 (Ministerio de Educacion), CSV ; con coma decimal
- puntos-de-venta-doble-aguinaldo: puntos de venta 2019, CSV ,
Uso: python -I normalize_datosgob.py <dir_csv> <dir_salida>"""
import sys, csv, gzip, json, os
from datetime import datetime, timezone
sys.stdout.reconfigure(encoding="utf-8")
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
RET = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
csv.field_size_limit(10**8)


def num(s):
    try:
        return float(str(s).strip().replace(",", "."))
    except Exception:
        return None


def clean(s):
    s = (s or "").strip()
    return s or None


def latlon(a, b):
    lat, lon = num(a), num(b)
    if lat is None or lon is None:
        return None, None
    if not (-23.5 < lat < -9 and -70 < lon < -57):
        if -23.5 < lon < -9 and -70 < lat < -57:
            lat, lon = lon, lat
        else:
            return None, None
    return round(lat, 7), round(lon, 7)


stats = {}
# 1. Establecimientos educativos 2016
URL_E = "https://datos.gob.bo/dataset/a1ab65be-4160-494f-8eea-dddb1a04287d/resource/b5da4242-1c90-47d9-b98f-bde1f35a0764/download/me_establecimientos_educativos2016.csv"
n = nog = 0
with open(os.path.join(src, "me_establecimientos_educativos2016.csv"), encoding="utf-8-sig", errors="replace", newline="") as f, \
        gzip.open(os.path.join(out, "me-establecimientos-educativos-2016.ndjson.gz"), "wt", encoding="utf-8") as o:
    rd = csv.DictReader(f, delimiter=";")
    rd.fieldnames = [h.strip() for h in rd.fieldnames]
    for r in rd:
        lat, lon = latlon(r.get("latitud"), r.get("longitud"))
        nog += lat is None
        rec = {"source": "datos.gob.bo:estab", "source_id": f'{clean(r.get("codigo_ue"))}/{clean(r.get("cod_edif_educativo"))}/{n}',
               "name": clean(r.get("unidad_educativa")), "category_raw": "unidad educativa",
               "address": clean(r.get("direccion")), "locality": clean(r.get("zona")),
               "municipality": None, "department": clean(r.get("departamento")),
               "lat": lat, "lon": lon, "phone": None, "website": None, "hours": None,
               "source_updated_at": "2016-11-18", "source_url": URL_E, "retrieved_at": RET,
               "raw": {k: v for k, v in r.items()}}
        rec["raw"]["nota"] = "distrito es el distrito educativo, no el municipio"
        o.write(json.dumps(rec, ensure_ascii=False) + "\n")
        n += 1
stats["me-establecimientos-educativos-2016"] = {"rows": n, "no_geom": nog}

# 2. Puntos de venta doble aguinaldo
URL_P = "https://datos.gob.bo/dataset/37c16682-f1bd-4a18-94bd-097b65f6b763/resource/3a2748b5-e9dc-4e9e-952b-31a9f1e01112/download/puntos_venta_dap1.csv"
n = nog = 0
with open(os.path.join(src, "puntos_venta_dap1.csv"), encoding="utf-8-sig", errors="replace", newline="") as f, \
        gzip.open(os.path.join(out, "puntos-de-venta-doble-aguinaldo-2019.ndjson.gz"), "wt", encoding="utf-8") as o:
    for r in csv.DictReader(f):
        lat, lon = latlon(r.get("latitud"), r.get("longitud"))
        nog += lat is None
        emp, suc = clean(r.get("empresa")), clean(r.get("sucursal"))
        rec = {"source": "datos.gob.bo:puntos-de-venta-doble-aguinaldo", "source_id": clean(r.get("cartodb_id")),
               "name": f"{emp} - {suc}" if emp and suc and suc.lower() != emp.lower() else (emp or suc),
               "category_raw": " | ".join(x for x in ("punto de venta doble aguinaldo", clean(r.get("tipo"))) if x),
               "address": clean(r.get("direccion_")), "locality": None, "municipality": None,
               "department": clean(r.get("departamen")), "lat": lat, "lon": lon, "phone": None, "website": None,
               "hours": None, "source_updated_at": "2019-08-30", "source_url": URL_P, "retrieved_at": RET,
               "raw": {k: v for k, v in r.items() if k != "the_geom"}}
        o.write(json.dumps(rec, ensure_ascii=False) + "\n")
        n += 1
stats["puntos-de-venta-doble-aguinaldo-2019"] = {"rows": n, "no_geom": nog}
json.dump(stats, open(os.path.join(out, "_stats.json"), "w"), indent=1)
print(stats)
