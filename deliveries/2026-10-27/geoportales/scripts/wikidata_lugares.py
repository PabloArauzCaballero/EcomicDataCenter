"""Recolecta de Wikidata todos los items con coordenadas (P625) en Bolivia.

Universo: P17=Q750, o P131+ hasta Q750, mas los items sin pais (P17) cuya
coordenada cae en la caja de Bolivia (marcados raw.match='bbox_sin_pais').
Salida: NDJSON gzip con el esquema comun de los 12 agentes.
Uso: python -I wikidata_lugares.py <dir_salida>
"""
import gzip, json, sys, time, re, urllib.parse, urllib.request
from collections import defaultdict
from datetime import datetime, timezone

EP = "https://query.wikidata.org/sparql"
UA = "DatosBolivia-collector/1.0 (https://github.com/PabloArauzCaballero/EcomicDataCenter)"
OUT = sys.argv[1]
RETRIEVED = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

UNIVERSE = """
  { ?item wdt:P17 wd:Q750 . ?item wdt:P625 ?anyc . }
  UNION { ?item wdt:P131+ wd:Q750 . ?item wdt:P625 ?anyc . }
  UNION { SERVICE wikibase:box { ?item wdt:P625 ?anyc .
      bd:serviceParam wikibase:cornerSouthWest "Point(-69.7 -22.95)"^^geo:wktLiteral .
      bd:serviceParam wikibase:cornerNorthEast "Point(-57.4 -9.6)"^^geo:wktLiteral . }
    FILTER NOT EXISTS { ?item wdt:P17 ?xx } }
"""


def q(query, tries=5):
    data = urllib.parse.urlencode({"query": query}).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(EP, data=data, headers={
                "User-Agent": UA, "Accept": "application/sparql-results+json",
                "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.load(r)["results"]["bindings"]
        except Exception as e:  # noqa
            print("retry", i, e, file=sys.stderr)
            time.sleep(10 * (i + 1))
    raise RuntimeError("SPARQL failed")


def qid(uri):
    return uri.rsplit("/", 1)[-1]


def v(b, k):
    return b[k]["value"] if k in b else None



# 1. Universo: tres consultas simples (la union en una sola da 504)
bol = set()
for qq in ("SELECT DISTINCT ?item WHERE { ?item wdt:P17 wd:Q750 ; wdt:P625 ?c }",
           "SELECT DISTINCT ?item WHERE { ?item wdt:P131+ wd:Q750 . ?item wdt:P625 ?c }"):
    bol |= {qid(v(b, "item")) for b in q(qq)}
box = {qid(v(b, "item")) for b in q("""SELECT DISTINCT ?item WHERE { SERVICE wikibase:box { ?item wdt:P625 ?c .
  bd:serviceParam wikibase:cornerSouthWest "Point(-69.7 -22.95)"^^geo:wktLiteral .
  bd:serviceParam wikibase:cornerNorthEast "Point(-57.4 -9.6)"^^geo:wktLiteral . }
  FILTER NOT EXISTS { ?item wdt:P17 ?xx } }""")}
universe = sorted(bol | box, key=lambda x: int(x[1:]))
print("universe", len(bol), len(box), len(universe), file=sys.stderr)
CH = 1500
chunks = [" ".join("wd:" + x for x in universe[k:k + CH]) for k in range(0, len(universe), CH)]

items = {}
labels = defaultdict(dict)
props = {
    "P31": "instance_of", "P6375": "street_address", "P969": "located_at_street_address",
    "P856": "website", "P571": "inception", "P1619": "official_opening",
    "P131": "located_in_admin", "P1329": "phone", "P281": "postal_code",
    "P669": "located_on_street", "P670": "street_number", "P373": "commons_category",
    "P18": "image", "P1448": "official_name", "P127": "owned_by", "P137": "operator",
    "P238": "iata", "P239": "icao", "P1435": "heritage_designation",
}
pvalues = " ".join("wdt:" + p for p in props)
vals = defaultdict(lambda: defaultdict(list))
for n, ch in enumerate(chunks):
    for b in q(f"SELECT ?item ?c ?mod WHERE {{ VALUES ?item {{ {ch} }} ?item p:P625/ps:P625 ?c . OPTIONAL {{ ?item schema:dateModified ?mod }} }}"):
        it = items.setdefault(qid(v(b, "item")), {"coords": [], "mod": None})
        c = v(b, "c") or ""
        m = re.match(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", c)
        if m:  # coords de otros globos empiezan con <http...>, no casan
            pt = (float(m.group(2)), float(m.group(1)))
            if pt not in it["coords"]:
                it["coords"].append(pt)
        it["mod"] = v(b, "mod")
    for b in q(f"""SELECT ?item ?l ?lang ?kind WHERE {{ VALUES ?item {{ {ch} }}
        {{ ?item rdfs:label ?l . BIND("l" AS ?kind) }} UNION {{ ?item schema:description ?l . BIND("d" AS ?kind) }}
        BIND(lang(?l) AS ?lang) FILTER(?lang IN ("es","en","mul","ay","qu","gn") || ?kind = "l") }}"""):
        i, lang, kind = qid(v(b, "item")), v(b, "lang"), v(b, "kind")
        if lang in ("es", "en"):
            labels[i][f"{kind}_{lang}"] = v(b, "l")
        if kind == "l":
            labels[i].setdefault("l_any", v(b, "l"))
    for b in q(f"SELECT ?item ?p ?val WHERE {{ VALUES ?item {{ {ch} }} VALUES ?p {{ {pvalues} }} ?item ?p ?val . }}"):
        i = qid(v(b, "item"))
        name = props[qid(v(b, "p"))]
        val = v(b, "val")
        if val.startswith("http://www.wikidata.org/entity/"):
            val = qid(val)
        if val not in vals[i][name]:
            vals[i][name].append(val)
    print("chunk", n + 1, "/", len(chunks), file=sys.stderr, flush=True)
print("items", len(items), file=sys.stderr)

# Etiquetas de los Q referenciados (tipos, entidades admin, operadores)
refs = set()
for i in vals:
    for name in ("instance_of", "located_in_admin", "owned_by", "operator", "heritage_designation", "located_on_street"):
        refs.update(x for x in vals[i].get(name, []) if re.fullmatch(r"Q\d+", x))
reflabel = {}
refs = sorted(refs)
for k in range(0, len(refs), 400):
    chunk = " ".join("wd:" + r for r in refs[k:k + 400])
    for b in q(f'SELECT ?x ?xLabel WHERE {{ VALUES ?x {{ {chunk} }} SERVICE wikibase:label {{ bd:serviceParam wikibase:language "es,en,mul". }} }}'):
        reflabel[qid(v(b, "x"))] = v(b, "xLabel")

# 4. Jerarquia administrativa: para cada entidad admin de Bolivia, su municipio y departamento
admin_type = {}
for b in q("SELECT DISTINCT ?a ?t WHERE { ?a wdt:P131* wd:Q750 . ?a wdt:P31 ?t . VALUES ?t { wd:Q250050 wd:Q1062710 wd:Q1062593 wd:Q824650 } }"):
    admin_type.setdefault(qid(v(b, "a")), set()).add(qid(v(b, "t")))
parent = defaultdict(set)
for b in q("SELECT DISTINCT ?a ?p WHERE { ?a wdt:P131+ wd:Q750 . ?a wdt:P131 ?p . }"):
    parent[qid(v(b, "a"))].add(qid(v(b, "p")))
admin_lbl = {}
alist = sorted(set(admin_type) | {p for s in parent.values() for p in s})
for k in range(0, len(alist), 400):
    chunk = " ".join("wd:" + r for r in alist[k:k + 400])
    for b in q(f'SELECT ?x ?xLabel WHERE {{ VALUES ?x {{ {chunk} }} SERVICE wikibase:label {{ bd:serviceParam wikibase:language "es,en,mul". }} }}'):
        admin_lbl[qid(v(b, "x"))] = v(b, "xLabel")
reflabel.update(admin_lbl)


def climb(start, want, seen=None):
    """BFS por P131 desde start hasta una entidad de tipo want."""
    frontier, seen = list(start), set()
    while frontier:
        nxt = []
        for a in frontier:
            if a in seen:
                continue
            seen.add(a)
            if want in admin_type.get(a, ()):
                return a
            nxt.extend(parent.get(a, ()))
        frontier = nxt
    return None


def clean_label(s):
    return s if s and not re.fullmatch(r"Q\d+", s) else None


n = 0
with gzip.open(OUT + "/wikidata.ndjson.gz", "wt", encoding="utf-8") as f:
    for i in sorted(items, key=lambda x: int(x[1:])):
        it = items[i]
        if not it["coords"]:
            continue
        lb = labels.get(i, {})
        pv = vals.get(i, {})
        lat, lon = it["coords"][0]
        admins = pv.get("located_in_admin", [])
        self_types = admin_type.get(i, set())
        muni = i if "Q1062710" in self_types else climb(admins, "Q1062710")
        dept = i if "Q250050" in self_types else climb(admins, "Q250050")
        types = pv.get("instance_of", [])
        addr = (pv.get("street_address") or pv.get("located_at_street_address") or [None])[0]
        if not addr and pv.get("located_on_street"):
            st = reflabel.get(pv["located_on_street"][0]) or pv["located_on_street"][0]
            num = (pv.get("street_number") or [""])[0]
            addr = f"{st} {num}".strip()
        name = lb.get("l_es") or lb.get("l_en") or lb.get("l_any")
        loc_admin = admins[0] if admins else None
        rec = {
            "source": "wikidata",
            "source_id": i,
            "name": name,
            "category_raw": "; ".join(clean_label(reflabel.get(t)) or t for t in types) or None,
            "address": addr,
            "locality": clean_label(reflabel.get(loc_admin)) if loc_admin and loc_admin not in (muni, dept) else None,
            "municipality": clean_label(reflabel.get(muni)) if muni else None,
            "department": clean_label(reflabel.get(dept)) if dept else None,
            "lat": round(lat, 7), "lon": round(lon, 7),
            "phone": (pv.get("phone") or [None])[0],
            "website": (pv.get("website") or [None])[0],
            "hours": None,
            "source_updated_at": it["mod"],
            "source_url": f"https://www.wikidata.org/wiki/{i}",
            "retrieved_at": RETRIEVED,
            "raw": {
                "label_es": lb.get("l_es"), "label_en": lb.get("l_en"),
                "description_es": lb.get("d_es"), "description_en": lb.get("d_en"),
                "instance_of": [{"id": t, "label": reflabel.get(t)} for t in types],
                "located_in_admin": [{"id": a, "label": reflabel.get(a)} for a in admins],
                "municipality_qid": muni, "department_qid": dept,
                "all_coords": it["coords"],
                "match": "pais_o_p131" if i in bol else "bbox_sin_pais",
                **{k: vv for k, vv in pv.items() if k not in ("instance_of", "located_in_admin")},
                **({"owned_by_labels": [reflabel.get(x) for x in pv["owned_by"]]} if "owned_by" in pv else {}),
                **({"operator_labels": [reflabel.get(x) for x in pv["operator"]]} if "operator" in pv else {}),
            },
        }
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        n += 1
print("written", n, file=sys.stderr)
