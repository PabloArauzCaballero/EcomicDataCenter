"""Prueba URLs: estado, tamano, URL final y primeros bytes.
Uso: python -I probe.py N url1 url2 ...  (N = caracteres a mostrar)"""
import sys, urllib.request, urllib.error
sys.stdout.reconfigure(encoding="utf-8")

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DatosBolivia-collector/1.0"}
n = int(sys.argv[1])
for u in sys.argv[2:]:
    try:
        req = urllib.request.Request(u, headers=UA)
        with urllib.request.urlopen(req, timeout=40) as r:
            body = r.read()
            print(f"== {u} -> {r.status} {len(body)}B {r.url} [{r.headers.get('content-type')}]")
    except urllib.error.HTTPError as e:
        body = e.read()
        print(f"== {u} -> HTTP {e.code} {len(body)}B")
    except Exception as e:
        print(f"== {u} -> ERR {type(e).__name__}: {str(e)[:160]}")
        continue
    print(body[:n].decode("utf-8", "replace").replace("\n", " "))
