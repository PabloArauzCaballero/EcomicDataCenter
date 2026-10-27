"""Write manifest.json with sha256, size and line count of every delivered file."""
import glob, gzip, hashlib, json, os

BASE = "deliveries/2026-10-27/delivery"
files = []
for p in sorted(glob.glob(BASE + "/*.ndjson.gz") + glob.glob(BASE + "/stats.json") + glob.glob(BASE + "/README.md")
                + glob.glob(BASE + "/scripts/*.py")):
    b = open(p, "rb").read()
    e = {"path": os.path.relpath(p, BASE).replace("\\", "/"), "bytes": len(b), "sha256": hashlib.sha256(b).hexdigest()}
    if p.endswith(".ndjson.gz"):
        e["records"] = sum(1 for _ in gzip.open(p, "rt", encoding="utf-8"))
    files.append(e)
json.dump({"delivery": "2026-10-27/delivery", "agent_topic": "apps y webs de delivery (PedidosYa, Yango, Uber Eats)",
           "generated_at": "2026-10-27", "files": files}, open(BASE + "/manifest.json", "w", encoding="utf-8"), indent=1)
print(json.dumps(files, indent=1))
