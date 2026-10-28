"""Build the amarillas delivery: base = listing cards from rubro pages (address, zone, city, rubros);
overlay = company-page records where fetched (phone, website, terms). Fixes: several phones -> first;
'Página web' -> website; city/department normalization (the site labels by department, Sucre aparte)."""
import json, os, re
from common import write_ndjson_gz, dept_of, looks_like_person, clean_phone, record, SCRATCH, OUT, DEPTS, fold

W = os.path.join(SCRATCH, "work", "amarillas")
rub = json.load(open(os.path.join(SCRATCH, "raw", "am", "rubros.json"), encoding="utf-8"))
slugs = json.load(open(os.path.join(W, "slugs.json"), encoding="utf-8"))
DEPT_NAMES = {fold(v) for v in DEPTS.values()}


def first_phone(s):
    if not s:
        return None
    for part in re.split(r"\s+-\s+|[/,;]|\s{2,}", s):
        p = clean_phone(part)
        if p and 6 <= len(re.sub(r"\D", "", p)) <= 12:
            return p
    return None


cards = {}
if os.path.exists(os.path.join(W, "list_cards.ndjson")):
    for line in open(os.path.join(W, "list_cards.ndjson"), encoding="utf-8"):
        c = json.loads(line)
        prev = cards.get(c["slug"])
        if prev:
            prev["rubros"] = list(dict.fromkeys(prev["rubros"] + c["rubros"]))
        else:
            cards[c["slug"]] = c
pages = {}
if os.path.exists(os.path.join(W, "records.ndjson")):
    for line in open(os.path.join(W, "records.ndjson"), encoding="utf-8"):
        r = json.loads(line)
        pages[r["source_id"]] = r

rows = []
for slug in sorted(set(cards) | set(pages)):
    c, p = cards.get(slug), pages.get(slug)
    name = (p or {}).get("name") or c["name"]
    person = looks_like_person(name)
    if p:
        loc = p["raw"].get("address_locality") or ""
        parts = [x.strip() for x in loc.split(",") if x.strip()]
        city = parts[-1] if parts else (c or {}).get("city")
        zone = ", ".join(parts[:-1]) or (c or {}).get("zone")
    else:
        city, zone = c.get("city"), c.get("zone")
    cats = (p["raw"]["categories"] if p and p["raw"].get("categories") else None) or (c or {}).get("rubros") or []
    street = (c or {}).get("street") or (p or {}).get("address")  # title attr = full; page may be full too
    if p and p.get("address") and (not street or len(p["address"]) > len(street)):
        street = p["address"]
    terms = (p or {}).get("raw", {}).get("terms") or {}
    phone = None if person else (first_phone(terms.get("Teléfono")) or first_phone(terms.get("Celular"))
                                 or (first_phone(p.get("phone")) if p else None))
    web = terms.get("Página web") or terms.get("Web")
    if web and not web.startswith("http"):
        web = "http://" + web
    fc = fold(city)
    dept = "Chuquisaca" if fc == "sucre" else dept_of(city)
    locality = "Sucre" if fc == "sucre" else (city if city and fc not in DEPT_NAMES else None)
    raw = {"slug": slug, "zona": zone or None, "address_locality": city, "rubros": (c or {}).get("rubros"),
           "slogan": (c or {}).get("slogan"), "description": (c or {}).get("description") or (p or {}).get("raw", {}).get("meta_description"),
           "company_item_id": (c or {}).get("company_item_id"), "company_page_fetched": bool(p),
           "terms": {} if person else {k: v for k, v in terms.items() if "mail" not in k.lower()},
           "owner_looks_like_person": person}
    rows.append(record(source="amarillas.bo", source_id=slug, name=name, category_raw=" | ".join(cats) or None,
                       address=street, locality=locality, municipality=None, department=dept,
                       lat=None, lon=None, phone=phone, website=web, hours=None, source_updated_at=None,
                       source_url=f"http://www.amarillas.bo/empresa/{slug}",
                       retrieved_at=(p or {}).get("retrieved_at") or c["retrieved_at"], raw=raw))
os.makedirs(os.path.join(OUT, "amarillas"), exist_ok=True)
write_ndjson_gz(os.path.join(OUT, "amarillas", "amarillas.ndjson.gz"), rows)
json.dump({"site_total_rubro_pairs": sum(v["n"] for v in rub.values()), "unique_slugs": len(slugs),
           "downloaded": len(rows), "company_pages_fetched": len(pages)},
          open(os.path.join(OUT, "amarillas", "stats.json"), "w"))
print("rows", len(rows), "pages", len(pages), "phone", sum(1 for x in rows if x["phone"]),
      "addr", sum(1 for x in rows if x["address"]), "dept", sum(1 for x in rows if x["department"]))
