"""Descarga URLs a disco en streaming (bloques de 1 MB). Uso: python -I fetch.py dir url1 url2 ..."""
import sys, os, urllib.request, shutil
sys.stdout.reconfigure(encoding="utf-8")
d = sys.argv[1]
os.makedirs(d, exist_ok=True)
for u in sys.argv[2:]:
    if "::" in u:  # nombre::url
        name, u = u.split("::", 1)
    else:
        name = u.rstrip("/").rsplit("/", 1)[-1].split("?")[0]
    fn = os.path.join(d, name)
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 DatosBolivia-collector/1.0"}), timeout=300) as r, open(fn, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
        print("ok", os.path.getsize(fn), fn)
    except Exception as e:
        print("FAIL", u, e)
