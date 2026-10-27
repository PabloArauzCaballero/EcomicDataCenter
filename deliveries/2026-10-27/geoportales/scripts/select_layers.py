"""Elige capas a descargar de un inventario: puntos menos exclusiones, mas extras.
Uso: python -I select_layers.py inventario.json salida.txt --exclude a,b --extra c,d"""
import sys, json
inv = json.load(open(sys.argv[1], encoding="utf-8"))
args = sys.argv[3:]
exc = set(args[args.index("--exclude") + 1].split(",")) if "--exclude" in args else set()
ext = args[args.index("--extra") + 1].split(",") if "--extra" in args else []
sel = [l["name"] for l in inv if set(l.get("geom", [])) & {"Point", "MultiPoint"} and l["name"] not in exc]
sel += [e for e in ext if e and e not in sel]
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(sel) + "\n")
print(len(sel))
