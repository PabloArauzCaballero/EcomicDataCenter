"""Call Yango Food's public layout endpoint (the one its web calls) for one point; print shape."""
import json, sys, uuid
import requests

lat, lon = float(sys.argv[1]), float(sys.argv[2])
H = {"x-device-id": "obs-" + uuid.uuid4().hex[:20], "x-platform": "yango_desktop_web", "x-app-version": "18.50.7",
     "content-type": "application/json;charset=UTF-8", "accept": "application/json, text/plain, */*",
     "accept-language": "es", "x-ya-coordinates": f"latitude={lat},longitude={lon}",
     "x-ya-user-location": f"latitude={lat},longitude={lon}",
     "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
     "referer": "https://food.yango.com/ci"}
r = requests.post("https://food.yango.com/eats/v1/layout-constructor/v1/layout", headers=H,
                  json={"location": {"latitude": lat, "longitude": lon}, "order_mode": "default"}, timeout=60)
print(r.status_code, len(r.text))
open(sys.argv[3], "w", encoding="utf-8").write(r.text)
d = r.json()
print(list(d.keys()), [ (l.get("type"), l.get("id")) for l in d.get("layout", [])][:30])
for k, v in d.get("data", {}).items():
    print(k, type(v).__name__, len(v) if hasattr(v, "__len__") else v)
