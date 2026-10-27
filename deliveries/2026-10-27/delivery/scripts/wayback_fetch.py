"""Download Wayback Machine snapshots (raw, `id_`) listed in CDX files.

Usage: python wayback_fetch.py OUT_DIR cdx1.txt [cdx2.txt ...]
CDX lines: timestamp original statuscode [digest]. Resumable: skips files already on disk.
Polite: 3 workers, exponential backoff on 429/5xx. Writes an index (index.tsv) as it goes."""
import hashlib, os, sys, time, threading
from concurrent.futures import ThreadPoolExecutor
import requests

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
rows = []
for f in sys.argv[2:]:
    for line in open(f, encoding="utf-8"):
        p = line.split()
        if len(p) >= 3 and p[2] == "200":
            rows.append((p[0], p[1]))
lock = threading.Lock()
idx = open(os.path.join(out, "index.tsv"), "a", encoding="utf-8")
sess = requests.Session()
sess.headers["User-Agent"] = UA


def name(ts, url):
    return f"{ts}_{hashlib.sha1(url.encode()).hexdigest()[:12]}.html"


def get(row):
    ts, url = row
    fn = os.path.join(out, name(ts, url))
    if os.path.exists(fn) and os.path.getsize(fn) > 0:
        return "skip"
    wb = f"https://web.archive.org/web/{ts}id_/{url}"
    for attempt in range(6):
        try:
            r = sess.get(wb, timeout=90)
            if r.status_code == 200:
                open(fn, "wb").write(r.content)
                with lock:
                    idx.write(f"{ts}\t{url}\t{os.path.basename(fn)}\n"); idx.flush()
                return "ok"
            if r.status_code in (404, 403):
                return f"http{r.status_code}"
        except requests.RequestException:
            pass
        time.sleep(5 * 2 ** attempt)
    return "fail"


done = {}
with ThreadPoolExecutor(3) as ex:
    for i, res in enumerate(ex.map(get, rows)):
        done[res] = done.get(res, 0) + 1
        if i % 50 == 0:
            print(i, len(rows), done, flush=True)
print("END", done, flush=True)
