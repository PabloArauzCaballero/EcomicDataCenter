"""amarillas.bo (Páginas Amarillas de Bolivia). Fase 1: rubro pages (paginated) -> company slugs.
Fase 2: each /empresa/<slug> page -> microdata. Incremental: work files are appended and resumed."""
import json, os, re, html, sys
from common import Http, record, write_ndjson_gz, now_iso, dept_of, looks_like_person, clean_phone, SCRATCH, OUT

W = os.path.join(SCRATCH, "work", "amarillas"); os.makedirs(W, exist_ok=True)
h = Http(pause=1.2, jitter=0.6)
rub = json.load(open(os.path.join(SCRATCH, "raw", "am", "rubros.json"), encoding="utf-8"))
SLUGS = os.path.join(W, "slugs.json")
if os.path.exists(SLUGS):
    slugs = json.load(open(SLUGS, encoding="utf-8"))
else:
    slugs = {}
    for i, (rs, info) in enumerate(sorted(rub.items())):
        page = 1
        while True:
            u = f"http://www.amarillas.bo/rubro/{rs}" + (f"?page={page}" if page > 1 else "")
            r = h.get(u)
            if r is None or r.status_code != 200:
                break
            # only the result list: stop before 'related'/footer -> take empresa links inside company_small/list blocks
            found = re.findall(r'href="http://www\.amarillas\.bo/empresa/([^"/?#]+)"[^>]*>\s*([^<]+?)\s*<', r.text)
            for s, nm in found:
                slugs.setdefault(s, {"rubros": []})
                if rs not in slugs[s]["rubros"]:
                    slugs[s]["rubros"].append(rs)
            if f"?page={page + 1}\"" not in r.text:
                break
            page += 1
        if i % 20 == 0:
            print("rubro", i, rs, "slugs", len(slugs), flush=True)
            json.dump(slugs, open(SLUGS + ".tmp", "w", encoding="utf-8"))
    json.dump(slugs, open(SLUGS, "w", encoding="utf-8"))
print("slugs", len(slugs), flush=True)

# Reparto opcional en 2 hilos (procesos): AM_PART=0|1 toma los slugs de índice par|impar y escribe
# records_p<N>.ndjson; sin AM_PART escribe records.ndjson. Lo ya hecho en cualquier archivo se salta.
PART = os.environ.get("AM_PART")
DONE = os.path.join(W, f"records_p{PART}.ndjson" if PART is not None else "records.ndjson")
done = set()
for f in [os.path.join(W, "records.ndjson"), os.path.join(W, "records_p0.ndjson"), os.path.join(W, "records_p1.ndjson")]:
    if os.path.exists(f):
        for line in open(f, encoding="utf-8"):
            done.add(json.loads(line)["source_id"])
fh = open(DONE, "a", encoding="utf-8", newline="\n")


def txt(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x or ""))).strip()


for k, s in enumerate(sorted(slugs)):
    if s in done or (PART is not None and k % 2 != int(PART)):
        continue
    url = f"http://www.amarillas.bo/empresa/{s}"
    r = h.get(url)
    if r is None or r.status_code != 200:
        print("fail", s, r and r.status_code, flush=True)
        continue
    t = r.text
    i = t.find("schema.org/LocalBusiness")
    blk = t[i:t.find("related-companies", i)] if i >= 0 else t
    def ip(name):
        m = re.search(r'itemprop="%s"[^>]*>(.*?)</span>' % name, blk, re.S)
        return txt(m.group(1)) if m else None
    name = ip("name")
    if not name:
        print("noname", s); continue
    cats = [txt(c) for c in re.findall(r"<h2>(.*?)</h2>", blk.split("information")[0], re.S)]
    street = ip("streetAddress")
    loc = ip("addressLocality")
    loc = re.sub(r",\s*Bolivia$", "", loc or "").strip() or None
    terms = {}
    for m in re.finditer(r'<span class="term">\s*([^<:]+):?\s*</span>\s*(.*?)</div>', blk, re.S):
        terms[txt(m.group(1))] = txt(m.group(2))
    phone = ip("telephone") or terms.get("Teléfono") or terms.get("Celular")
    web = None
    m = re.search(r'href="(https?://(?!www\.amarillas|amarillas|www\.facebook\.com/sharer|twitter\.com/intent|plus\.google)[^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*(?:Sitio web|Web|www\.)', blk, re.I)
    if m:
        web = m.group(1)
    lat = lon = None
    m = re.search(r"LatLng\(\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\)", t) or \
        re.search(r'data-lat="(-?\d+\.\d+)"[^>]*data-lng="(-?\d+\.\d+)"', blk)
    if m:
        lat, lon = m.group(1), m.group(2)
    desc = None
    m = re.search(r'<meta name="description" content="([^"]*)"', t)
    if m:
        desc = html.unescape(m.group(1))
    hours = terms.get("Horario") or terms.get("Horarios") or terms.get("Horario de atención")
    person = looks_like_person(name)
    dept = dept_of(loc)
    locality = loc if loc and dept and loc not in ("La Paz", "Santa Cruz", "Cochabamba", "Oruro", "Potosí", "Tarija", "Beni", "Pando", "Chuquisaca") else None
    if loc == "Sucre":
        dept, locality = "Chuquisaca", "Sucre"
    raw = {"slug": s, "rubros_slug": slugs[s]["rubros"], "categories": cats, "address_locality": loc,
           "terms": {k2: v for k2, v in terms.items() if "mail" not in k2.lower()} if not person else {},
           "meta_description": desc, "owner_looks_like_person": person}
    rec = record(source="amarillas.bo", source_id=s, name=name, category_raw=" | ".join(cats) or None,
                 address=street, locality=locality, municipality=None, department=dept, lat=lat, lon=lon,
                 phone=None if person else clean_phone(phone), website=web, hours=hours,
                 source_updated_at=None, source_url=url, retrieved_at=now_iso(), raw=raw)
    fh.write(json.dumps(rec, ensure_ascii=False) + "\n"); fh.flush()
    done.add(s)
    if k % 100 == 0:
        print("emp", k, len(done), flush=True)
fh.close()
rows = [json.loads(l) for l in open(DONE, encoding="utf-8")]
write_ndjson_gz(os.path.join(OUT, "amarillas", "amarillas.ndjson.gz"), rows)
json.dump({"site_total_rubro_pairs": sum(v["n"] for v in rub.values()), "unique_slugs": len(slugs),
           "downloaded": len(rows)}, open(os.path.join(OUT, "amarillas", "stats.json"), "w"))
print("done", len(rows))
