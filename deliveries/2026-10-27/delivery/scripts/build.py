"""Normalize everything collected into the common NDJSON.gz format + stats for the README.

Inputs (under _work/):
  yango/detail/*.json                 Yango Food place cards (live, 2026-10-27)
  pya_wb_records.ndjson               PedidosYa archived pages (Wayback), parse_pya_wayback.py
  x_003.txt                           PedidosYa public home lazy_load XHR (live, 2026-10-27)
  wb_ue/                              Uber Eats Bolivia archived pages (Wayback, 2020-2021)
Outputs (delivery dir): <source>.ndjson.gz per platform, stats.json."""
import collections, glob, gzip, html, json, os, re

BASE = "deliveries/2026-10-27/delivery"
WK = BASE + "/_work"
NOW = "2026-10-27T22:50:00Z"  # Wayback downloads ran 22:45-22:55 UTC

# city slug / name -> (municipality, department)
CITY = {
    "santa-cruz-de-la-sierra": ("Santa Cruz de la Sierra", "Santa Cruz"), "santa-cruz": ("Santa Cruz de la Sierra", "Santa Cruz"),
    "la-paz": ("La Paz", "La Paz"), "el-alto": ("El Alto", "La Paz"), "cochabamba": ("Cochabamba", "Cochabamba"),
    "sacaba": ("Sacaba", "Cochabamba"), "quillacollo": ("Quillacollo", "Cochabamba"), "tiquipaya": ("Tiquipaya", "Cochabamba"),
    "sucre": ("Sucre", "Chuquisaca"), "tarija": ("Tarija", "Tarija"), "yacuiba": ("Yacuiba", "Tarija"),
    "villa-montes": ("Villamontes", "Tarija"), "oruro": ("Oruro", "Oruro"), "potosi": ("Potosí", "Potosí"),
    "trinidad": ("Trinidad", "Beni"), "riberalta": ("Riberalta", "Beni"), "cobija": ("Cobija", "Pando"),
    "montero": ("Montero", "Santa Cruz"), "warnes": ("Warnes", "Santa Cruz"),
}


def slug(s):
    s = (s or "").lower().strip()
    for a, b in zip("áéíóúñü", "aeiounu"):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def muni_dept(city):
    return CITY.get(slug(city), (city, None)) if city else (None, None)


def fnum(x):
    try:
        v = float(x)
        return v if v == v and v != 0 else None
    except (TypeError, ValueError):
        return None


def in_bolivia(lat, lon):
    return lat is not None and lon is not None and -23.0 <= lat <= -9.5 and -69.8 <= lon <= -57.3


def rec(**k):
    base = dict.fromkeys(["source", "source_id", "name", "category_raw", "address", "locality", "municipality",
                          "department", "lat", "lon", "phone", "website", "hours", "source_updated_at", "source_url",
                          "retrieved_at", "raw", "rating", "reviews", "chain"])
    base.update(k)
    if not in_bolivia(base["lat"], base["lon"]):
        base["lat"] = base["lon"] = None
    return base


# ---------------------------------------------------------------- Yango
def yango():
    out, seen_ids = [], set()
    tags = collections.defaultdict(set)
    if os.path.exists(WK + "/yango/tags.ndjson"):
        for l in open(WK + "/yango/tags.ndjson", encoding="utf-8"):
            t = json.loads(l)
            for s in t["places"]:
                tags[s].add(t["name"])
    for f in sorted(glob.glob(WK + "/yango/detail/*.json")):
        j = json.load(open(f, encoding="utf-8"))
        if j.get("status") != 200 or not isinstance(j.get("body"), dict):
            continue
        fp = (j["body"].get("payload") or {}).get("foundPlace") or {}
        p = fp.get("place") or {}
        if not p or str(p.get("id")) in seen_ids:
            continue  # brand slugs resolve to one of their places: keep each place once
        seen_ids.add(str(p.get("id")))
        loc = (p.get("address") or {}).get("location") or {}
        short = (p.get("address") or {}).get("short") or ""
        parts = [x.strip() for x in short.split(",") if x.strip()]
        locality = next((x for x in parts if x.lower().startswith(("distrito", "zona", "barrio", "subdistrito"))), None)
        street = ", ".join(parts[-2:]) if len(parts) >= 2 else short or None
        foot = html.unescape(p.get("footerDescription") or "").replace("<br>", "\n")
        m = re.search(r"\(vendedor\)\s*(.*?),", foot)
        nit = re.search(r"INN\s*([0-9]+)", foot)
        hrs = re.search(r"Horario[^:]*:\s*(.+)", foot)
        lp = fp.get("locationParams") or {}
        city = (p.get("regionSlug") or j.get("grid_city"))
        mu, de = muni_dept(city)
        out.append(rec(
            source="yango", source_id=str(p.get("id")), name=p.get("name"),
            category_raw="; ".join(x for x in [p.get("business"),
                                               ", ".join(sorted(tags.get(p.get("slug"), set()) | {t.get("name", "") for t in p.get("tags") or [] if isinstance(t, dict)} - {""}))] if x),
            address=street, locality=locality, municipality=mu, department=de,
            lat=fnum(loc.get("latitude")), lon=fnum(loc.get("longitude")), phone=None, website=None,
            hours=hrs.group(1).strip() if hrs else None, source_updated_at=None,
            source_url=f"https://food.yango.com/api/v2/catalog/{p.get('slug')}?latitude={j['query_lat']}&longitude={j['query_lon']}",
            retrieved_at=j.get("retrieved_at"),
            rating=p.get("rating"), reviews=p.get("ratingCount"),
            chain=(p.get("brand") or {}).get("slug"),
            raw={"slug": p.get("slug"), "brand_slug": (p.get("brand") or {}).get("slug"), "business": p.get("business"),
                 "address_short": short, "region_slug": p.get("regionSlug"), "is_store": p.get("isStore"),
                 "market": p.get("market"), "legal_seller": m.group(1).strip() if m else None,
                 "nit": nit.group(1) if nit else None, "footer": foot or None,
                 "available_now": lp.get("availableNow"), "available_by_time": lp.get("availableByTime"),
                 "min_order_bs": p.get("minimalOrderPrice"), "price_category": (p.get("priceCategory") or {}).get("name"),
                 "is_new": p.get("isNew"), "shared_link": p.get("sharedLink")}))
    return out


# ---------------------------------------------------------------- PedidosYa (Wayback)
def pya_wayback():
    by = collections.defaultdict(list)
    for l in open(WK + "/pya_wb_records.ndjson", encoding="utf-8"):
        r = json.loads(l)
        by[r["id"]].append(r)
    out = []
    for vid, rs in by.items():
        rs.sort(key=lambda r: r["snapshot"])
        last = rs[-1]

        def latest(k):
            for r in reversed(rs):
                if r.get(k) not in (None, "", [], "0"):
                    return r[k]
            return None
        city = latest("city") or last.get("page_city_slug")
        url = latest("url")
        if not city and url:
            mm = re.search(r"/restaurantes/([^/]+)/", url)
            city = mm.group(1) if mm else None
        mu, de = muni_dept(city)
        cats = latest("categories") or []
        ts = last["snapshot"]
        out.append(rec(
            source="pedidosya", source_id=str(vid), name=latest("name"),
            category_raw="; ".join(c for c in cats if c) or latest("business_type"),
            address=latest("address"), locality=None, municipality=mu, department=de,
            lat=fnum(latest("lat")), lon=fnum(latest("lng")), phone=latest("phone"), website=None,
            hours="; ".join(latest("hours")) if latest("hours") else None,
            source_updated_at=f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}T{ts[8:10]}:{ts[10:12]}:{ts[12:14]}Z",
            source_url=url, retrieved_at=NOW, rating=fnum(latest("rating")), reviews=latest("reviews"), chain=None,
            raw={"via": "wayback", "archive_url": last["archive_url"], "first_seen": rs[0]["snapshot"],
                 "last_seen": ts, "n_snapshots": len({r["snapshot"] for r in rs}), "status_last": last.get("status"),
                 "state_last": latest("state"), "company": latest("company"), "extra": latest("extra"),
                 "city_raw": city}))
    return out


# ---------------------------------------------------------------- PedidosYa (live home)
def pya_home():
    p = WK + "/x_003.txt"
    if not os.path.exists(p):
        return []
    d = json.loads(open(p, encoding="utf-8").read().split("\n", 1)[1])
    found = {}

    def walk(o, swim=None):
        if isinstance(o, dict):
            if o.get("componentType") == "fenixSwimlane":
                swim = ((o.get("content") or {}).get("titleM") or {}).get("title") or o.get("id")
            c = o.get("content")
            if isinstance(c, dict) and c.get("vendorId"):
                tp = {}
                for t in o.get("tracking") or []:
                    tp.update(t.get("properties") or {})
                url = next((a["properties"]["targetUrl"] for a in o.get("actions") or [] if "targetUrl" in a.get("properties", {})), None)
                v = found.setdefault(c["vendorId"], {"id": c["vendorId"], "swimlanes": set()})
                v["swimlanes"].add(swim)
                v.update({k: x for k, x in {"name": c.get("vendorName"), "url": url,
                                            "business": tp.get("shopListBusinessType") or tp.get("businessType"),
                                            "rating": tp.get("shopRatingQuality"), "reviews": tp.get("shopRatingQuantity"),
                                            "status": tp.get("shopStatus"), "pickup_km": (c.get("serviceInfo") or {}).get("pickupDistance")}.items() if x})
            for x in o.values():
                walk(x, swim)
        elif isinstance(o, list):
            for x in o:
                walk(x, swim)
    walk(d)
    out = []
    for v in found.values():
        city = re.search(r"/restaurantes/([^/]+)/", v.get("url") or "")
        city = city.group(1) if city else None
        mu, de = muni_dept(city)
        name = v.get("name")
        if not name and v.get("url"):
            name = re.sub(r"-[0-9a-f]{8}-[0-9a-f-]{27}-menu$|-menu$", "", v["url"].rsplit("/", 1)[-1]).replace("-", " ").title()
        out.append(rec(source="pedidosya", source_id=str(v["id"]), name=name, category_raw=v.get("business"),
                       municipality=mu, department=de, source_updated_at=None,
                       source_url=("https://www.pedidosya.com.bo" + v["url"]) if v.get("url") else None,
                       retrieved_at="2026-10-27T22:38:00Z", rating=fnum(v.get("rating")),
                       reviews=int(v["reviews"]) if str(v.get("reviews", "")).isdigit() and int(v["reviews"]) else None,
                       raw={"via": "home_lazy_load", "name_from_slug": not v.get("name"), "status": v.get("status"),
                            "swimlanes": sorted(x for x in v["swimlanes"] if x), "pickup_distance_km": v.get("pickup_km"),
                            "query_point": [-17.78335, -63.1821]}))
    return out


# ---------------------------------------------------------------- Uber Eats (Wayback)
def ubereats():
    rows = [l.rstrip("\n").split("\t") for l in open(WK + "/wb_ue/index.tsv", encoding="utf-8")]
    ld, refs = {}, {}
    for ts, url, fn in rows:
        t = open(os.path.join(WK, "wb_ue", fn), encoding="utf-8", errors="replace").read()
        for m in re.finditer(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', t, re.S):
            try:
                j = json.loads(m.group(1))
            except Exception:
                continue
            if isinstance(j, dict) and j.get("@type") == "Restaurant":
                uid = j["@id"].rstrip("/").rsplit("/", 1)[-1]
                if uid not in ld or ld[uid][0] < ts:
                    ld[uid] = (ts, j, url)
        t2 = t.replace("\\u002F", "/").replace("\\/", "/")
        for m in re.finditer(r"(santa-cruz|la-paz|cochabamba)/food-delivery/([^/\"?]+)/([A-Za-z0-9_-]{22})", t2):
            refs.setdefault(m.group(3), (m.group(1), m.group(2), ts))
    out = []
    for uid, (ts, j, url) in ld.items():
        a = j.get("address") or {}
        g = j.get("geo") or {}
        city = re.search(r"/bo(?:-en|-es)?/([^/]+)/food-delivery/", j["@id"])
        if a.get("addressCountry") not in (None, "BO") or (city and city.group(1) not in CITY):
            continue  # e.g. a Washington DC store archived under the /bo/ prefix
        mu, de = muni_dept(city.group(1) if city else a.get("addressLocality"))
        hrs = "; ".join(f'{",".join(h.get("dayOfWeek") or [])} {h.get("opens")}-{h.get("closes")}'
                        for h in j.get("openingHoursSpecification") or [] if isinstance(h, dict)) or None
        ar = j.get("aggregateRating") or {}
        out.append(rec(source="ubereats", source_id=uid, name=html.unescape(j.get("name") or ""),
                       category_raw="; ".join(j.get("servesCuisine") or []) or None,
                       address=a.get("streetAddress"), municipality=mu, department=de,
                       lat=fnum(g.get("latitude")), lon=fnum(g.get("longitude")), phone=j.get("telephone"),
                       hours=hrs, source_updated_at=f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}T{ts[8:10]}:{ts[10:12]}:{ts[12:14]}Z",
                       source_url=j["@id"], retrieved_at=NOW, rating=fnum(ar.get("ratingValue")),
                       reviews=ar.get("reviewCount"),
                       raw={"via": "wayback", "archive_url": f"https://web.archive.org/web/{ts}/{url}",
                            "price_range": j.get("priceRange"), "address": a}))
    for uid, (city, sl, ts) in refs.items():
        if uid in ld:
            continue
        mu, de = muni_dept(city)
        out.append(rec(source="ubereats", source_id=uid, name=sl.replace("-", " ").title(), municipality=mu,
                       department=de, source_updated_at=f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}T{ts[8:10]}:{ts[10:12]}:{ts[12:14]}Z",
                       source_url=f"https://www.ubereats.com/bo-en/{city}/food-delivery/{sl}/{uid}", retrieved_at=NOW,
                       raw={"via": "wayback_link_only", "name_from_slug": True}))
    return out


def chains(recs):
    """PedidosYa: chain = text before ' - ' when that prefix is shared by >=2 vendors."""
    pre = collections.Counter()
    for r in recs:
        if r["source"] == "pedidosya" and r["name"] and " - " in r["name"]:
            pre[r["name"].split(" - ")[0].strip().lower()] += 1
    for r in recs:
        if r["source"] == "pedidosya" and r["name"] and " - " in r["name"]:
            p = r["name"].split(" - ")[0].strip()
            if pre[p.lower()] >= 2:
                r["chain"] = p
                r["raw"]["branch"] = r["name"].split(" - ", 1)[1].strip()


def main():
    ya = yango()
    pw = pya_wayback()
    ph = pya_home()
    # live home vendors: attach archived coordinates when the same vendor id was archived
    wb = {r["source_id"]: r for r in pw}
    for r in ph:
        o = wb.get(r["source_id"])
        if o:
            r["raw"]["archived_match"] = {"lat": o["lat"], "lon": o["lon"], "address": o["address"],
                                          "last_seen": o["raw"]["last_seen"]}
    pya = ph + [r for r in pw if r["source_id"] not in {x["source_id"] for x in ph}]
    ue = ubereats()
    allr = ya + pya + ue
    chains(allr)
    stats = {}
    for src, rs in (("yango", ya), ("pedidosya", pya), ("ubereats", ue)):
        rs.sort(key=lambda r: (r["department"] or "", r["municipality"] or "", r["name"] or ""))
        with gzip.open(f"{BASE}/{src}.ndjson.gz", "wt", encoding="utf-8") as f:
            for r in rs:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        bym = collections.Counter(r["municipality"] or "(sin ciudad)" for r in rs)
        stats[src] = {"total": len(rs), "with_latlon": sum(1 for r in rs if r["lat"] is not None),
                      "with_address": sum(1 for r in rs if r["address"]),
                      "by_municipality": dict(bym.most_common()),
                      "by_via": dict(collections.Counter((r["raw"] or {}).get("via", "live_api") for r in rs)),
                      "by_category": dict(collections.Counter((r["category_raw"] or "").split(";")[0] for r in rs).most_common(15))}
        if src == "pedidosya":
            stats[src]["last_seen_year"] = dict(collections.Counter((r["raw"].get("last_seen") or "2026")[:4] for r in rs))
    stats["all"] = {"total": len(allr), "with_latlon": sum(1 for r in allr if r["lat"] is not None)}
    json.dump(stats, open(f"{BASE}/stats.json", "w", encoding="utf-8", newline=chr(10)), ensure_ascii=False, indent=1)
    print(json.dumps(stats, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
