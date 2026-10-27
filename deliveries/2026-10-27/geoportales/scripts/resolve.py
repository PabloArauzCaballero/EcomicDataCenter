"""Resuelve nombres candidatos via dns.google (DoH) y lista los que existen.
Uso: python -I resolve.py dominio1,dominio2 prefijo1,prefijo2"""
import sys, json, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
sys.stdout.reconfigure(encoding="utf-8")
doms = sys.argv[1].split(",")
pref = sys.argv[2].split(",")
names = [f"{p}.{d}" for d in doms for p in pref]


def res(n):
    try:
        u = "https://dns.google/resolve?" + urllib.parse.urlencode({"name": n, "type": "A"})
        d = json.load(urllib.request.urlopen(u, timeout=20))
        ans = [a["data"] for a in d.get("Answer", [])]
        return n, d.get("Status"), ans
    except Exception as e:
        return n, "ERR", str(e)[:60]


with ThreadPoolExecutor(16) as ex:
    for n, st, ans in ex.map(res, names):
        if st == 0 and ans:
            print(n, ans)
