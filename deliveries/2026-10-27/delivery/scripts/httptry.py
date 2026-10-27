"""GET each URL with Yango-web-like headers and print status + head of body."""
import sys, uuid
import requests

H = {"x-device-id": "obs-" + uuid.uuid4().hex[:20], "x-platform": "yango_desktop_web", "x-app-version": "18.50.7",
     "accept": "application/json, text/plain, */*", "accept-language": "es",
     "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"}
n = 1500
for u in sys.argv[1:]:
    if u.startswith("-n"):
        n = int(u[2:]); continue
    try:
        r = requests.get(u, headers=H, timeout=60)
        print("==", r.status_code, len(r.text), u)
        print(r.text[:n])
    except Exception as e:
        print("ERR", u, e)
