"""Construye los inventarios de la entrega y la tabla de capas de La Paz para el README.
Uso: python -I build_inventories.py <dir_scratch> <dir_entrega>"""
import sys, json, os, csv
sys.stdout.reconfigure(encoding="utf-8")
G, D = sys.argv[1:3]
inv = json.load(open(os.path.join(G, "dl/lapaz_inventory.json"), encoding="utf-8"))
stats = json.load(open(os.path.join(G, "out/lapaz/_stats.json"), encoding="utf-8"))
EXCL = {
    "sit:pl_texto": "texto de planimetrias", "sit:AlumbradoPublico": "postes de alumbrado",
    "lapaz:luminarias": "luminarias", "lapaz:luminarias2": "luminarias",
    "territorio:tramitesTerritorio": "tramites de construccion con nombres de solicitantes y arquitectos",
    "sit:tramitesterritoriales": "tramites", "sit:permisosconstruccion": "permisos de construccion",
    "levantamiento:levpuntocontrolCatastro": "puntos de control topografico",
    "levantamiento:levpuntocontrol": "puntos de control topografico", "lev:levpuntocontrol": "puntos de control topografico",
    "lapaz:sumideros": "sumideros", "sit:ubicacionvias2": "etiquetas de vias",
    "geosit:mora_atm_centro": "mora tributaria por inmueble (dato sensible)", "geosit:mora_atm": "mora tributaria por inmueble (dato sensible)",
    "sit:contenedoresbasura": "contenedores de basura", "sit:reporteCasosRed114": "reportes de emergencia",
    "sit:sim_proyectos_p": "proyectos de inversion", "sit:camarasseguridad": "camaras de seguridad",
    "sit:rutas_recoleccion_basura_atencion": "atencion de residuos", "lapaz:quemassanjuan_2011": "quemas de San Juan",
    "lapaz:dm_medidores": "medidores", "sit:hidrantes": "hidrantes",
    "lapaz:siremu_contenedores012021": "contenedores", "lapaz:siremu_islasverdes012021": "islas verdes de reciclaje",
    "lapaz:sistemasemaforico": "semaforos", "sit:puntosdiapeaton": "puntos de evento", "sit:zonasgu2016_label": "etiquetas de zonas",
    "patrimonio:patrimonio_textos": "anotaciones", "movilidad:tipoPuntos": "catalogo de simbolos",
    "sit:mgr_puntosencuentro": "puntos de encuentro de emergencia", "lapaz:lugares": "duplicado de sit:toponimia (8.026 vs 8.023) y JSON roto en el servidor",
}
rows = []
for l in inv:
    n = l["name"]
    s = stats.get(n)
    if s:
        estado, motivo = "descargada", ""
    elif n in EXCL:
        estado, motivo = "descartada", EXCL[n]
    else:
        estado, motivo = "no descargada", "sin geometria de punto de interes (poligonos, lineas o tablas)"
    rows.append({"capa": n, "titulo": l.get("title"), "geometria": ",".join(l.get("geom", [])), "crs_nativo": l.get("crs"),
                 "features_servidor": l.get("hits"), "estado": estado, "motivo": motivo,
                 "filas_entregadas": s["rows"] if s else None, "con_nombre": s["named"] if s else None,
                 "dentro_municipio_la_paz": s["in_muni"] if s else None, "sin_geometria": s["no_geom"] if s else None,
                 "archivo": ("gamlp-sit-la-paz/" + s["file"]) if s else None, "campos": l.get("fields")})
with open(os.path.join(D, "inventarios/gamlp-sit-la-paz-capas.csv"), "w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=[k for k in rows[0] if k != "campos"])
    w.writeheader()
    for r in rows:
        w.writerow({k: v for k, v in r.items() if k != "campos"})
json.dump(rows, open(os.path.join(D, "inventarios/gamlp-sit-la-paz-capas.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# tabla markdown de capas descargadas
md = ["| Capa | Titulo | Filas | Con nombre | Dentro del municipio |", "|---|---|---:|---:|---:|"]
for r in sorted([r for r in rows if r["estado"] == "descargada"], key=lambda r: -r["filas_entregadas"]):
    md.append(f'| `{r["capa"]}` | {r["titulo"]} | {r["filas_entregadas"]:,} | {r["con_nombre"]:,} | {r["dentro_municipio_la_paz"]:,} |'.replace(",", "."))
open(os.path.join(G, "out/lapaz_table.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
from collections import Counter
print(Counter(r["estado"] for r in rows), sum(r["filas_entregadas"] or 0 for r in rows))

# otros inventarios
for src, dst in (("dl/elalto_inventory.json", "geoserver-el-alto-capas.json"),
                 ("dl/datosgob_ckan.json", "datos-gob-bo-catalogo.json"),
                 ("dl/iigeo/datasets.json", None)):
    if dst:
        json.dump(json.load(open(os.path.join(G, src), encoding="utf-8")), open(os.path.join(D, "inventarios", dst), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
iig = json.load(open(os.path.join(G, "dl/iigeo/datasets.json"), encoding="utf-8"))["datasets"]
json.dump([{"alternate": x.get("alternate"), "title": x.get("title"), "subtype": x.get("subtype")} for x in iig],
          open(os.path.join(D, "inventarios/geonode-iigeo-umsa-datasets.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for f in ("capas.tsv",):
    open(os.path.join(D, "inventarios/gamscs-guia-urbana-capas.tsv"), "w", encoding="utf-8").write(
        "grupo\tid_capa\tvalor\tetiqueta\turl\n" + open(os.path.join(G, "dl/scz/capas.tsv"), encoding="utf-8").read())
open(os.path.join(D, "inventarios/gamc-planificacion-categorias.tsv"), "w", encoding="utf-8").write(
    "id\truta\tsubcategorias\tdescripcion\n" + open(os.path.join(G, "dl/cbba/categorias.tsv"), encoding="utf-8").read())
