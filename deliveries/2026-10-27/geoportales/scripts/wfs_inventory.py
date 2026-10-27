"""Inventario de un GeoServer WFS: capas, CRS, numero de features y tipo de geometria.
Uso: python -I wfs_inventory.py <base_ows_url> <salida.json> [--hits]
"""
import sys, json, re, urllib.request, urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding="utf-8")
UA = {"User-Agent": "Mozilla/5.0 DatosBolivia-collector/1.0"}
base, out = sys.argv[1], sys.argv[2]
do_hits = "--hits" in sys.argv


def get(url, timeout=90):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def u(params):
    return base + ("&" if "?" in base else "?") + urllib.parse.urlencode(params)


caps = get(u({"service": "WFS", "version": "2.0.0", "request": "GetCapabilities"}), 180)
root = ET.fromstring(caps)
ns = {"wfs": "http://www.opengis.net/wfs/2.0", "ows": "http://www.opengis.net/ows/1.1"}
layers = []
for ft in root.iter("{http://www.opengis.net/wfs/2.0}FeatureType"):
    def t(tag, nsk="wfs"):
        e = ft.find(f"{nsk}:{tag}", ns)
        return e.text if e is not None else None
    kws = [k.text for k in ft.findall("ows:Keywords/ows:Keyword", ns) if k.text]
    layers.append({"name": t("Name"), "title": t("Title"), "abstract": t("Abstract"),
                   "crs": t("DefaultCRS"), "keywords": kws})
print("layers", len(layers))


def enrich(l):
    try:
        x = get(u({"service": "WFS", "version": "2.0.0", "request": "DescribeFeatureType", "typeNames": l["name"]}), 60).decode("utf-8", "replace")
        g = re.findall(r'type="gml:(\w+)PropertyType"', x)
        l["geom"] = [a for a in g if a not in ("Feature",)]
        l["fields"] = re.findall(r'<xsd:element[^>]*name="([^"]+)"', x)
    except Exception as e:
        l["geom_err"] = str(e)[:120]
    if do_hits:
        try:
            x = get(u({"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": l["name"], "resultType": "hits"}), 120).decode("utf-8", "replace")
            m = re.search(r'numberMatched="(\d+)"', x)
            l["hits"] = int(m.group(1)) if m else None
        except Exception as e:
            l["hits_err"] = str(e)[:120]
    return l


with ThreadPoolExecutor(1) as ex:
    layers = list(ex.map(enrich, layers))
json.dump(layers, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for l in layers:
    print(l.get("hits"), "|", ",".join(l.get("geom", [])), "|", l["name"], "|", l["title"])
