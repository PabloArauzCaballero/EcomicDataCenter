"""Print the shape of a captured JSON response (first line URL, rest body)."""
import json, sys

t = open(sys.argv[1], encoding="utf-8").read().split("\n", 1)[1]
d = json.loads(t)
maxd = int(sys.argv[2]) if len(sys.argv) > 2 else 5


def walk(o, depth=0):
    if depth > maxd:
        return
    if isinstance(o, dict):
        for k, v in o.items():
            if isinstance(v, (dict, list)):
                print("  " * depth + str(k), type(v).__name__, len(v))
                walk(v, depth + 1)
            else:
                print("  " * depth + str(k), "=", str(v)[:80])
    elif isinstance(o, list) and o:
        walk(o[0], depth + 1)


walk(d)
