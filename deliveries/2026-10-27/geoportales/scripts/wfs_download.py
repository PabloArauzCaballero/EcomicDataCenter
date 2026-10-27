"""Descarga capas WFS reproyectadas por el servidor a EPSG:4326, paginando y
escribiendo en streaming: <dir>/<capa con : -> __>.ndjson (un feature por linea).
El servidor puede topar features por peticion (La Paz: 5000), asi que se pagina
hasta recibir una pagina vacia o alcanzar numberMatched.
Uso: python -I wfs_download.py <base_ows_url> <dir_salida> capa1 capa2 ... | @lista.txt
Respeta la memoria: un hilo, paginas de 2000, sin acumular la capa.
"""
import sys, json, os, time, csv, io, re, urllib.request, urllib.parse, subprocess

sys.stdout.reconfigure(encoding="utf-8")
csv.field_size_limit(10**8)
UA = {"User-Agent": "Mozilla/5.0 DatosBolivia-collector/1.0"}
base, outdir, layers = sys.argv[1], sys.argv[2], sys.argv[3:]
if layers and layers[0].startswith("@"):
    layers = [x.strip() for x in open(layers[0][1:], encoding="utf-8") if x.strip()]
PAGE = 2000
os.makedirs(outdir, exist_ok=True)


def free_kb():
    try:
        o = subprocess.run(["powershell", "-NoProfile", "-Command",
                            "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"],
                           capture_output=True, text=True, timeout=60).stdout.strip()
        return int(o)
    except Exception:
        return 10**9


def wait_ram():
    while (f := free_kb()) < 800000:
        print(f"  RAM libre {f} KB < 800000, espero 60 s", flush=True)
        time.sleep(60)


def get(url, timeout=600):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:
            print("  retry", i, str(e)[:120], flush=True)
            time.sleep(5 * (i + 1))
    raise RuntimeError(url[:200])


def hits(lay):
    try:
        x = get(base + "?" + urllib.parse.urlencode({"service": "WFS", "version": "2.0.0", "request": "GetFeature",
                                                     "typeNames": lay, "resultType": "hits"}), 120).decode("utf-8", "replace")
        m = re.search(r'numberMatched="(\d+)"', x)
        return int(m.group(1)) if m else None
    except Exception:
        return None


def csv_feats(txt):
    for row in csv.DictReader(io.StringIO(txt)):
        wkt = None
        for gk in ("the_geom", "geom", "Shape", "wkb_geometry", "geometry"):
            if gk in row:
                wkt = row.pop(gk)
                break
        yield {"type": "Feature", "id": row.pop("FID", None), "geometry_wkt": wkt, "properties": row}


for lay in layers:
    fn = os.path.join(outdir, lay.replace(":", "__") + ".ndjson")
    if os.path.exists(fn):
        print("skip", lay)
        continue
    wait_ram()
    total = hits(lay)
    tmp = fn + ".part"
    n, start, mode, ok = 0, 0, None, True
    with open(tmp, "w", encoding="utf-8") as out:
        while True:
            p = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": lay,
                 "srsName": "EPSG:4326", "count": PAGE, "startIndex": start}
            fs = None
            for fmt in (["application/json", "csv"] if mode is None else [mode]):
                try:
                    body = get(base + "?" + urllib.parse.urlencode({**p, "outputFormat": fmt}))
                    fs = json.loads(body).get("features", []) if fmt == "application/json" else list(csv_feats(body.decode("utf-8", "replace")))
                    mode = fmt
                    break
                except Exception as e:
                    print("  ", fmt, "fallo:", str(e)[:120], flush=True)
            if fs is None and start == 0:  # vista sin clave: sin paginar
                try:
                    q = {k: v for k, v in p.items() if k not in ("count", "startIndex")}
                    fs = json.loads(get(base + "?" + urllib.parse.urlencode({**q, "outputFormat": "application/json"}))).get("features", [])
                    mode = "unpaged"
                except Exception as e:
                    print("  unpaged fallo:", str(e)[:120], flush=True)
            if fs is None:
                ok = False
                break
            for f in fs:
                out.write(json.dumps(f, ensure_ascii=False) + "\n")
            n += len(fs)
            if mode == "unpaged" or not fs or (total is not None and n >= total):
                break
            start += len(fs)
            del fs
    if not ok:
        print("FAIL", lay, "parcial", n, flush=True)
        os.replace(tmp, fn + ".failed")
        continue
    os.replace(tmp, fn)
    print("ok", lay, n, "hits", total, "mode", mode, flush=True)
