"""Descarga cada capa de la Guia Urbana de Santa Cruz (capas.tsv) a <dir>/<grupo>__<id>.json, en streaming.
Uso: python -I scz_fetch.py capas.tsv dir"""
import sys, os, shutil, time, urllib.request, urllib.parse
sys.stdout.reconfigure(encoding="utf-8")
tsv, d = sys.argv[1:3]
os.makedirs(d, exist_ok=True)
for line in open(tsv, encoding="utf-8"):
    grp, iid, val, lab, url = line.rstrip("\n").split("\t")
    if not val:
        print("sin valor", grp, iid)
        continue
    fn = os.path.join(d, f"{grp}__{iid}.json")
    if os.path.exists(fn):
        continue
    u = url.rsplit("/", 1)[0] + "/" + urllib.parse.quote(val)
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 DatosBolivia-collector/1.0"}), timeout=180) as r, open(fn, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
        print("ok", os.path.getsize(fn), grp, iid)
    except Exception as e:
        print("FAIL", grp, iid, e)
    time.sleep(0.5)
