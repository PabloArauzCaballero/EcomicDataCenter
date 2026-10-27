"""Cuisine tags for Yango places: repeat the layout call with each cuisine quickfilter the web
offers (body key `filters_v2`) at a subsample of grid points (~5 km apart) and record which
place slugs each filter returns. Output: _work/yango/tags.ndjson (resumable)."""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(__file__))
import yango_collect as y

U = "https://food.yango.com/eats/v1/layout-constructor/v1/layout"
SKIP = ("akcii", "search_rating", "less_than", "delivery_time", "all", "rating", "markop", "test_", "combo")
W = y.W
pts, seen = [], set()
for l in open(W + "/grid.ndjson", encoding="utf-8"):
    j = json.loads(l)
    if not j["places"]:
        continue
    cell = (j["city"], round(j["lat"] / 0.045), round(j["lon"] / 0.045))  # ~5 km cells
    if cell not in seen:
        seen.add(cell); pts.append((j["city"], j["lat"], j["lon"]))
print("points", len(pts), flush=True)
lat0, lon0 = pts[0][1], pts[0][2]
d = y.req("POST", U, lat0, lon0, json={"location": {"latitude": lat0, "longitude": lon0}, "order_mode": "default"}).json()
filters = {}
for fs in d["data"].get("filters_v3s", []):
    for x in fs["payload"]["data"]:
        if x.get("type") == "quickfilter" and not x["slug"].startswith(SKIP) and x["payload"].get("name"):
            filters[x["slug"]] = x["payload"]["name"]
print("filters", len(filters), filters, flush=True)
done = set()
tf = W + "/tags.ndjson"
if os.path.exists(tf):
    for l in open(tf, encoding="utf-8"):
        j = json.loads(l); done.add((j["slug"], j["lat"], j["lon"]))
out = open(tf, "a", encoding="utf-8")
for city, lat, lon in pts:
    for fs, name in filters.items():
        if (fs, lat, lon) in done:
            continue
        r = y.req("POST", U, lat, lon, json={"location": {"latitude": lat, "longitude": lon}, "order_mode": "default",
                                            "filters_v2": {"filters": [{"type": "quickfilter", "slug": fs}]}})
        acc = {}
        if r is not None and r.status_code == 200:
            # only the filtered result lists, not carousels/ads that ignore the filter
            y.slugs_in((r.json().get("data") or {}).get("places_v2_lists", []), acc)
        out.write(json.dumps({"slug": fs, "name": name, "city": city, "lat": lat, "lon": lon,
                              "places": [k for k, v in acc.items() if v.get("brand")]}, ensure_ascii=False) + "\n")
        out.flush()
        time.sleep(0.5)
    print("pt done", city, lat, lon, flush=True)
