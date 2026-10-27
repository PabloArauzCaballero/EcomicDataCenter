"""Parse archived PedidosYa Bolivia pages (Wayback Machine raw snapshots) into vendor records.

Three page formats are handled:
  A) 2019 server-rendered listings: <li class="restaurant-wrapper" data-id data-lat data-lng data-info=JSON>
     plus <span class="address">.
  B) 2019 server-rendered vendor page: <div id="profileHeader" data-lat data-lng data-id data-state>,
     <h1 itemprop="name">, <span itemprop="streetAddress">.
  C) 2020+ SPA pages: window.__INITIAL_STATE__ = "<json string>"; vendor in core.shop.data /
     shop.data, listings in shopList.vendorsData (any dict with id+name+latitude is taken).
Output: one JSON line per (vendor id, snapshot) to stdout file; consolidation happens in build.py."""
import html, json, os, re, sys

D = sys.argv[1]  # dir with index.tsv
OUT = sys.argv[2]
idx = [l.rstrip("\n").split("\t") for l in open(os.path.join(D, "index.tsv"), encoding="utf-8")]

LI = re.compile(r'<li class="restaurant-wrapper[^"]*"(.*?)</li>', re.S)
ATTR = re.compile(r'data-([a-z]+)="([^"]*)"')
ADDR = re.compile(r'<span class="address">\s*(.*?)\s*</span>', re.S)
PH = re.compile(r'<div id="profileHeader"(.*?)>', re.S)
H1 = re.compile(r'<h1 itemprop="name"[^>]*>(.*?)</h1>', re.S)
STREET = re.compile(r'itemprop="streetAddress">(.*?)</span>', re.S)
LOCAL = re.compile(r'itemprop="addressLocality"[^>]*>\{id=(\d+), name=([^}]*)\}<', re.S)
RATING = re.compile(r'<section id="profileInfo".*?rating-points[^>]*>([\d.]+)<', re.S)
OPIN = re.compile(r'([\d.]+) opiniones')
IS = re.compile(r'window\.__INITIAL_STATE__\s*=\s*("(?:[^"\\]|\\.)*")', re.S)


def city_from_url(u):
    m = re.search(r"/restaurantes/([^/?]+)/", u)
    return m.group(1) if m else None


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip(" -")


def from_listing(t):
    for m in LI.finditer(t):
        a = dict(ATTR.findall(m.group(1)))
        if not a.get("id"):
            continue
        info = {}
        try:
            info = json.loads(html.unescape(a.get("info", "")))
        except Exception:
            pass
        am = ADDR.search(m.group(1))
        yield {"id": a["id"], "name": info.get("name") or clean(re.search(r'title="([^"]*)"', m.group(1)).group(1)),
               "lat": a.get("lat"), "lng": a.get("lng"), "status": a.get("status"), "url": a.get("url"),
               "address": clean(am.group(1)) if am else None,
               "categories": [c.get("name") for c in (info.get("topCategories") or []) if isinstance(c, dict)],
               "rating": info.get("ratingScore"), "reviews": info.get("validReviewsCount"),
               "city": info.get("cityName"), "fmt": "A", "extra": {k: info.get(k) for k in
               ("deliveryType", "deliveryTime", "shippingAmount", "restaurantTypeId", "isNew", "isGoldVip")}}


def from_profile(t, url):
    m = PH.search(t)
    if not m:
        return
    a = dict(ATTR.findall(m.group(1)))
    n = H1.search(t)
    st = STREET.search(t)
    lo = LOCAL.search(t)
    rt = RATING.search(t)
    yield {"id": a.get("id"), "name": clean(n.group(1)) if n else None, "lat": a.get("lat"), "lng": a.get("lng"),
           "status": a.get("status"), "state": a.get("state"), "url": url.split("?")[0],
           "address": clean(st.group(1)) if st else None, "city": lo.group(2) if lo else None,
           "rating": float(rt.group(1)) if rt else None, "fmt": "B", "categories": []}


def walk(o, acc):
    if isinstance(o, dict):
        if "id" in o and "name" in o and ("latitude" in o or ("address" in o and isinstance(o["address"], dict)
                                                              and "latitude" in o["address"])):
            acc.append(o)
        for v in o.values():
            walk(v, acc)
    elif isinstance(o, list):
        for v in o:
            walk(v, acc)


def from_state(t, url):
    m = IS.search(t)
    if not m:
        return
    try:
        st = json.loads(json.loads(m.group(1)))
    except Exception:
        return
    acc = []
    walk(st, acc)
    for o in acc:
        ad = o.get("address") if isinstance(o.get("address"), dict) else {}
        lat = o.get("latitude", ad.get("latitude"))
        lng = o.get("longitude", ad.get("longitude"))
        street = " ".join(x for x in [ad.get("street"), ad.get("doorNumber") if ad.get("doorNumber") not in ("-", "0", None) else None] if x)
        city = (((ad.get("area") or {}).get("city") or {}).get("name")) if ad else None
        cats = o.get("categories") or o.get("topCategories") or []
        if isinstance(cats, str):
            cats = [c for c in cats.split(",") if c]
        cats = [c.get("name") if isinstance(c, dict) else c for c in cats]
        sch = o.get("schedules") or []
        yield {"id": str(o["id"]), "name": o.get("name"), "lat": lat, "lng": lng, "status": o.get("opened"),
               "state": o.get("state"), "url": ("https://www.pedidosya.com.bo" + o["link"]) if o.get("link") else url.split("?")[0],
               "address": street or None, "city": city or o.get("cityName"), "categories": cats,
               "rating": o.get("generalScore") or o.get("ratingScore"), "reviews": o.get("validReviewCount") or o.get("validReviewsCount"),
               "phone": o.get("publicPhone") or o.get("phone"), "business_type": o.get("businessType"),
               "company": (o.get("billingInfo") or {}).get("companyName"),
               "hours": [f'{s.get("day")} {s.get("from")}-{s.get("to")}' for s in sch if isinstance(s, dict)] or None,
               "fmt": "C"}


n = 0
with open(OUT, "w", encoding="utf-8") as out:
    for ts, url, fn in idx:
        p = os.path.join(D, fn)
        if not os.path.exists(p):
            continue
        t = open(p, encoding="utf-8", errors="replace").read()
        recs = list(from_listing(t)) or list(from_profile(t, url)) or list(from_state(t, url))
        for r in recs:
            if not r.get("id") or not r.get("name"):
                continue
            r.update({"snapshot": ts, "page_url": url, "page_city_slug": city_from_url(url),
                      "archive_url": f"https://web.archive.org/web/{ts}/{url}"})
            out.write(json.dumps(r, ensure_ascii=False) + "\n"); n += 1
print("records", n)
