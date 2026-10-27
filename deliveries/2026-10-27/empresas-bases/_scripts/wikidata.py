"""Wikidata: businesses (Q4830453 subclasses) with country Bolivia (Q750) -> raw json."""
import json, sys, urllib.request, urllib.parse
Q = """
SELECT ?item ?itemLabel ?inception ?dissolved ?industryLabel ?legalLabel ?hqLabel ?admLabel ?website ?leiv ?ocid WHERE {
  ?item wdt:P17 wd:Q750 .
  ?item wdt:P31/wdt:P279* wd:Q4830453 .
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item wdt:P576 ?dissolved }
  OPTIONAL { ?item wdt:P452 ?industry }
  OPTIONAL { ?item wdt:P1454 ?legal }
  OPTIONAL { ?item wdt:P159 ?hq . OPTIONAL { ?hq wdt:P131 ?adm } }
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item wdt:P1278 ?leiv }
  OPTIONAL { ?item wdt:P1320 ?ocid }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}"""
u = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': Q, 'format': 'json'})
d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'DatosBolivia-empresas/1.0 (research)', 'Accept': 'application/sparql-results+json'}), timeout=300))
rows = d['results']['bindings']
agg = {}
for b in rows:
    g = lambda k: b.get(k, {}).get('value')
    qid = g('item').rsplit('/', 1)[1]
    a = agg.setdefault(qid, {'qid': qid, 'label': g('itemLabel'), 'inception': g('inception'), 'dissolved': g('dissolved'),
                             'industry': set(), 'legal': set(), 'hq': set(), 'adm': set(), 'website': g('website'),
                             'lei': g('leiv'), 'opencorporates': g('ocid')})
    for k in ('industry', 'legal', 'hq', 'adm'):
        v = g(k + 'Label')
        if v: a[k].add(v)
out = [{**a, **{k: sorted(a[k]) for k in ('industry', 'legal', 'hq', 'adm')}} for a in agg.values()]
json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False)
print('bindings', len(rows), 'items', len(out))
