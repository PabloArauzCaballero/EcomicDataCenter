"""Copy NDJSON.gz outputs into the delivery tree, compute coverage stats, write manifest.json; print table rows."""
import gzip, json, os, shutil, hashlib, sys
from common import OUT, now_iso

DEST = sys.argv[1]  # .../deliveries/2026-10-27/directorios
os.makedirs(DEST, exist_ok=True)
manifest = {"generated_at": now_iso(), "branch": "datos/2026-10-27-directorios", "files": []}
stats = {}
for d in sorted(os.listdir(OUT)):
    src = os.path.join(OUT, d)
    if not os.path.isdir(src):
        continue
    for f in sorted(os.listdir(src)):
        if not f.endswith(".ndjson.gz"):
            continue
        rows = [json.loads(l) for l in gzip.open(os.path.join(src, f), "rt", encoding="utf-8")]
        n = len(rows) or 1
        pct = lambda k: round(100 * sum(1 for r in rows if r.get(k)) / n, 1)
        st = {"rows": len(rows), "coords": pct("lat"), "address": pct("address"), "phone": pct("phone"),
              "nit": pct("nit"), "date": pct("source_updated_at"), "department": pct("department")}
        sj = os.path.join(src, "stats.json")
        if os.path.exists(sj):
            st["site"] = json.load(open(sj))
        stats[d] = st
        os.makedirs(os.path.join(DEST, d), exist_ok=True)
        dst = os.path.join(DEST, d, f)
        shutil.copyfile(os.path.join(src, f), dst)
        sha = hashlib.sha256(open(dst, "rb").read()).hexdigest()
        manifest["files"].append({"path": f"{d}/{f}", "sha256": sha, "bytes": os.path.getsize(dst),
                                  "rows": len(rows), "source": rows[0]["source"] if rows else d})
json.dump(manifest, open(os.path.join(DEST, "manifest.json"), "w", encoding="utf-8", newline="\n"),
          ensure_ascii=False, indent=2)
print(json.dumps(stats, ensure_ascii=False, indent=1))
