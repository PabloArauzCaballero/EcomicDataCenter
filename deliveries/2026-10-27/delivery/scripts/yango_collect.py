"""Yango Food (food.yango.com, the Yandex Eats front for Bolivia) collector.

Step 1 (grid): for every point of a grid over each city, POST the layout call that the web makes
  (/eats/v1/layout-constructor/v1/layout) and collect every place slug found in the response.
Step 2 (detail): GET /api/v2/catalog/{slug}?latitude&longitude (the place card the web loads):
  id, name, brand, business, address + lat/lon, rating, footer (legal seller, NIT, hours).
Resumable: grid responses summarized in _work/yango/grid.ndjson, details in _work/yango/detail/.
No account, no orders. 1 request at a time, ~0.7 s apart."""
import json, os, sys, time, uuid, math
import requests

W = "deliveries/2026-10-27/delivery/_work/yango"
os.makedirs(W + "/detail", exist_ok=True)
DEV = "obs-" + uuid.uuid4().hex[:20]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"

# city: (lat_min, lat_max, lon_min, lon_max)
CITIES = {
    "santa-cruz": (-17.90, -17.68, -63.28, -63.06),
    "cochabamba": (-17.45, -17.33, -66.30, -66.05),
    "la-paz": (-16.58, -16.47, -68.16, -68.05),
    "el-alto": (-16.56, -16.45, -68.25, -68.15),
    "sucre": (-19.07, -19.01, -65.29, -65.22),
    "tarija": (-21.56, -21.50, -64.76, -64.70),
    "oruro": (-17.99, -17.93, -67.14, -67.08),
    "potosi": (-19.61, -19.55, -65.78, -65.73),
    "trinidad": (-14.86, -14.80, -64.93, -64.88),
    "montero": (-17.36, -17.32, -63.27, -63.23),
}
STEP_KM = float(os.environ.get("STEP_KM", "2.0"))


def hdr(lat, lon):
    return {"x-device-id": DEV, "x-platform": "yango_desktop_web", "x-app-version": "18.50.7",
            "content-type": "application/json;charset=UTF-8", "accept": "application/json, text/plain, */*",
            "accept-language": "es", "x-ya-coordinates": f"latitude={lat},longitude={lon}",
            "x-ya-user-location": f"latitude={lat},longitude={lon}", "user-agent": UA,
            "referer": "https://food.yango.com/"}


def req(method, url, lat, lon, **kw):
    for a in range(5):
        try:
            r = requests.request(method, url, headers=hdr(lat, lon), timeout=60, **kw)
            if r.status_code == 200:
                return r
            if r.status_code in (400, 404):
                return r
            print("status", r.status_code, url[:120], flush=True)
        except requests.RequestException as e:
            print("err", e, flush=True)
        time.sleep(3 * 2 ** a)
    return None


def slugs_in(o, acc):
    if isinstance(o, dict):
        s = o.get("slug")
        if isinstance(s, str) and ("brand" in o or "business" in o) and isinstance(o.get("name"), (dict, str)):
            nm = o["name"]["value"] if isinstance(o["name"], dict) else o["name"]
            acc[s] = {"name": nm, "brand": (o.get("brand") or {}).get("slug") if isinstance(o.get("brand"), dict) else None,
                      "business": (o.get("brand") or {}).get("business") if isinstance(o.get("brand"), dict) else o.get("business")}
        for v in o.values():
            slugs_in(v, acc)
    elif isinstance(o, list):
        for v in o:
            slugs_in(v, acc)


def grid():
    done = set()
    gf = W + "/grid.ndjson"
    if os.path.exists(gf):
        for line in open(gf, encoding="utf-8"):
            j = json.loads(line); done.add((j["city"], j["lat"], j["lon"]))
    out = open(gf, "a", encoding="utf-8")
    only = sys.argv[2:] or list(CITIES)
    for city in only:
        la0, la1, lo0, lo1 = CITIES[city]
        dlat = STEP_KM / 111.0
        dlon = STEP_KM / (111.0 * math.cos(math.radians((la0 + la1) / 2)))
        off = float(os.environ.get("OFFSET_KM", "0"))
        lat = la0 + off / 111.0
        while lat <= la1 + 1e-9:
            lon = lo0 + off / (111.0 * math.cos(math.radians((la0 + la1) / 2)))
            while lon <= lo1 + 1e-9:
                key = (city, round(lat, 5), round(lon, 5))
                if key not in done:
                    r = req("POST", "https://food.yango.com/eats/v1/layout-constructor/v1/layout", key[1], key[2],
                            json={"location": {"latitude": key[1], "longitude": key[2]}, "order_mode": "default"})
                    acc = {}
                    if r is not None and r.status_code == 200:
                        slugs_in(r.json(), acc)
                    out.write(json.dumps({"city": city, "lat": key[1], "lon": key[2],
                                          "status": r.status_code if r is not None else None,
                                          "places": acc}, ensure_ascii=False) + "\n"); out.flush()
                    print(city, key[1], key[2], len(acc), flush=True)
                    time.sleep(0.7)
                lon += dlon
            lat += dlat


def detail():
    seen = {}
    for line in open(W + "/grid.ndjson", encoding="utf-8"):
        j = json.loads(line)
        for s, v in j["places"].items():
            # entries without a brand are the brand objects nested in each place, not places
            if v.get("brand") or os.environ.get("YANGO_ALL"):
                seen.setdefault(s, (j["lat"], j["lon"], j["city"]))
    print("slugs", len(seen), flush=True)
    for i, (s, (lat, lon, city)) in enumerate(seen.items()):
        fn = f"{W}/detail/{s}.json"
        if os.path.exists(fn):
            continue
        r = req("GET", f"https://food.yango.com/api/v2/catalog/{s}?latitude={lat}&longitude={lon}", lat, lon)
        if r is None:
            continue
        with open(fn, "w", encoding="utf-8") as f:
            json.dump({"slug": s, "query_lat": lat, "query_lon": lon, "grid_city": city, "status": r.status_code,
                       "retrieved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                       "body": r.json() if r.status_code == 200 else r.text[:500]}, f, ensure_ascii=False)
        if i % 50 == 0:
            print("detail", i, len(seen), flush=True)
        time.sleep(0.5)


if __name__ == "__main__":
    {"grid": grid, "detail": detail}[sys.argv[1]]()
