"""boliviaempresas.com: WordPress + Directorist; every listing via the public REST API
/wp-json/directorist/v1/listings (no auth). robots.txt only disallows /wp-admin/."""
import json, os, re, html
from common import Http, record, write_ndjson_gz, now_iso, dept_of, looks_like_person, clean_phone, CAPITAL, OUT

API = "https://boliviaempresas.com/wp-json/directorist/v1/listings"
h = Http(pause=2.0)
rows, page, total = [], 1, None
while True:
    r = h.get(API, params={"per_page": 100, "page": page})
    if r is None or r.status_code != 200:
        print("stop", page, r and r.status_code)
        break
    total = r.headers.get("X-WP-Total")
    data = r.json()
    if not data:
        break
    ts = now_iso()
    for x in data:
        x.pop("_links", None)
        desc = re.sub(r"<[^>]+>", " ", html.unescape(x.get("description") or "")).strip()
        cats = [c["name"] for c in x.get("categories") or []]
        tags = [t["name"] for t in x.get("tags") or []]
        locs = [l["name"] for l in x.get("locations") or []]
        dept = dept_of(*locs) or dept_of(x.get("permalink", "").split("/")[3].replace("-", " "))
        person = looks_like_person(x.get("name"))
        raw = {k: x.get(k) for k in ("id", "slug", "date_created_gmt", "date_modified_gmt", "date_expired",
                                      "zip", "address", "latitude", "longitude", "website", "tagline",
                                      "featured", "categories", "tags", "locations", "directory")}
        raw["description"] = desc[:2000]
        raw["owner_looks_like_person"] = person
        if not person:
            raw["phone"], raw["phone_2"] = x.get("phone"), x.get("phone_2")
        # e-mail se omite: en estas fichas suele ser una casilla personal (gmail/hotmail del titular)
        rows.append(record(
            source="boliviaempresas", source_id=str(x["id"]), name=html.unescape(x.get("name") or ""),
            category_raw=" | ".join(cats + tags) or None, address=x.get("address"),
            locality=None, municipality=None, department=dept,
            lat=x.get("latitude"), lon=x.get("longitude"),
            phone=None if person else clean_phone(x.get("phone") or x.get("phone_2")),
            website=x.get("website"), hours=None,
            # date_modified lo reescribe a diario el cron de vencimiento de Directorist; la fecha real es la de alta
            source_updated_at=x["date_created_gmt"] + "Z" if x.get("date_created_gmt") else None,
            source_url=x.get("permalink"), retrieved_at=ts, raw=raw))
    print("page", page, len(data), "total", total, flush=True)
    page += 1
write_ndjson_gz(os.path.join(OUT, "boliviaempresas", "boliviaempresas.ndjson.gz"), rows)
json.dump({"site_total": int(total or 0), "downloaded": len(rows)},
          open(os.path.join(OUT, "boliviaempresas", "stats.json"), "w"))
print("done", len(rows))
