"""Print head of captured XHR files whose first line contains a substring.
Usage: python peek.py GLOB SUBSTR [N]"""
import glob, sys

pat, sub = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 2500
for f in sorted(glob.glob(pat)):
    t = open(f, encoding="utf-8", errors="replace").read()
    first = t.split("\n", 1)[0]
    print("===", f, first[:160])
    if sub in first:
        print(t.split("\n", 3)[-1][:n])
