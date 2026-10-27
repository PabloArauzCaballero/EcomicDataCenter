"""Fill the __PLACEHOLDERS__ of README.md from the delivered files (counts are never typed by hand)."""
import collections, gzip, json, glob

BASE = "deliveries/2026-10-27/delivery"
R = {}
for src in ("yango", "pedidosya", "ubereats"):
    R[src] = [json.loads(l) for l in gzip.open(f"{BASE}/{src}.ndjson.gz", "rt", encoding="utf-8")]


def pct(a, b):
    return f"{a:,} ({100 * a / b:.1f} %)".replace(",", ".") if b else "0"


def ll(rs):
    return sum(1 for r in rs if r["lat"] is not None)


allr = [r for rs in R.values() for r in rs]
pts = sum(1 for l in open(f"{BASE}/_work/yango/grid.ndjson", encoding="utf-8"))
rep = {"__YA_N__": f"{len(R['yango']):,}".replace(",", "."), "__YA_LL__": pct(ll(R["yango"]), len(R["yango"])),
       "__PY_N__": f"{len(R['pedidosya']):,}".replace(",", "."), "__PY_LL__": pct(ll(R["pedidosya"]), len(R["pedidosya"])),
       "__UE_N__": f"{len(R['ubereats']):,}".replace(",", "."), "__UE_LL__": pct(ll(R["ubereats"]), len(R["ubereats"])),
       "__ALL_N__": f"{len(allr):,}".replace(",", "."), "__ALL_LL__": pct(ll(allr), len(allr)), "__YA_PTS__": str(pts)}

munis = collections.Counter(r["municipality"] or "(sin ciudad)" for r in allr)
lines = ["Por municipio y plataforma (registros / con lat-lon):", "",
         "| municipio | departamento | Yango | PedidosYa | Uber Eats | total |", "|---|---|---|---|---|---|"]
dept = {r["municipality"]: r["department"] for r in allr}
for m, _ in munis.most_common():
    cells = []
    for src in ("yango", "pedidosya", "ubereats"):
        rs = [r for r in R[src] if (r["municipality"] or "(sin ciudad)") == m]
        cells.append(f"{len(rs)} / {ll(rs)}" if rs else "—")
    tot = [r for r in allr if (r["municipality"] or "(sin ciudad)") == m]
    lines.append(f"| {m} | {dept.get(m) or '—'} | " + " | ".join(cells) + f" | {len(tot)} / {ll(tot)} |")

py = R["pedidosya"]
yrs = collections.Counter(((r["raw"].get("last_seen") or "2026")[:4]) for r in py)
lines += ["", "PedidosYa por año de la última captura: " + ", ".join(f"{y}: {n}" for y, n in sorted(yrs.items())) + ".",
          f"PedidosYa con dirección: {pct(sum(1 for r in py if r['address']), len(py))}; con rating: "
          f"{pct(sum(1 for r in py if r['rating']), len(py))}."]
ya = R["yango"]
bus = collections.Counter((r["raw"] or {}).get("business") for r in ya)
lines += ["", "Yango por vertical: " + ", ".join(f"{k}: {v}" for k, v in bus.most_common()) + ".",
          f"Yango con NIT del vendedor: {pct(sum(1 for r in ya if r['raw'].get('nit')), len(ya))}; con cocina: "
          f"{pct(sum(1 for r in ya if ';' in (r['category_raw'] or '')), len(ya))}; con rating: "
          f"{pct(sum(1 for r in ya if r['rating']), len(ya))}; marcas distintas: {len({r['chain'] for r in ya if r['chain']})}."]
rep["__COUNTS__"] = "\n".join(lines)

t = open(f"{BASE}/README.md", encoding="utf-8").read()
for k, v in rep.items():
    t = t.replace(k, v)
open(f"{BASE}/README.md", "w", encoding="utf-8", newline="\n").write(t)
print("\n".join(f"{k} {v}" for k, v in rep.items() if k != "__COUNTS__"))
print(rep["__COUNTS__"])
