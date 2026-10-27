"""Try body shapes for a Yango quickfilter on the layout call; print place counts per shape."""
import json, sys
sys.path.insert(0, "deliveries/2026-10-27/delivery/scripts")
import yango_collect as y

lat, lon = -17.7833, -63.1821
U = "https://food.yango.com/eats/v1/layout-constructor/v1/layout"
base = {"location": {"latitude": lat, "longitude": lon}, "order_mode": "default"}
d = y.req("POST", U, lat, lon, json=base).json()
f = d["data"]["filters_v3s"][0]["payload"]["data"]
print([(x["slug"], x["payload"].get("name")) for x in f][:60])
slug = next(x["slug"] for x in f if "pizza" in x["slug"].lower() or "Pizza" in (x["payload"].get("name") or ""))
shapes = {
    "filters": {"filters": [{"type": "quickfilter", "slug": slug}]},
    "filters_v2": {"filters_v2": {"filters": [{"type": "quickfilter", "slug": slug}]}},
    "filters_v2_group": {"filters_v2": {"groups": [{"filters": [{"type": "quickfilter", "slug": slug}]}]}},
    "filters_v3": {"filters_v3": {"filters": [{"type": "quickfilter", "slug": slug}]}},
}
for k, extra in shapes.items():
    r = y.req("POST", U, lat, lon, json={**base, **extra})
    acc = {}
    if r is not None and r.status_code == 200:
        y.slugs_in(r.json(), acc)
    print(k, r.status_code if r is not None else None, len(acc), [v["name"] for v in list(acc.values())[:5]])
