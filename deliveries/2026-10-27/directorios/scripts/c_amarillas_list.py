"""amarillas.bo, vía rápida: parse the listing cards on every rubro page (with pagination).
Each card: slug, name, slogan, rubros, description, full street address (title attr), zone, city.
No phone here (only on the company page). Resumable: done rubros + cards appended to work files."""
import json, os, re, html
from common import Http, SCRATCH, now_iso

W = os.path.join(SCRATCH, "work", "amarillas"); os.makedirs(W, exist_ok=True)
rub = json.load(open(os.path.join(SCRATCH, "raw", "am", "rubros.json"), encoding="utf-8"))
DONE_R = os.path.join(W, "list_done_rubros.txt")
CARDS = os.path.join(W, "list_cards.ndjson")
done = set(open(DONE_R, encoding="utf-8").read().split()) if os.path.exists(DONE_R) else set()
h = Http(pause=1.0, jitter=0.5)


def txt(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x or ""))).strip()


fc = open(CARDS, "a", encoding="utf-8", newline="\n")
fd = open(DONE_R, "a", encoding="utf-8", newline="\n")
for i, rs in enumerate(sorted(rub)):
    if rs in done:
        continue
    page, ok = 1, True
    while True:
        u = f"http://www.amarillas.bo/rubro/{rs}" + (f"?page={page}" if page > 1 else "")
        r = h.get(u)
        if r is None or r.status_code != 200:
            ok = r is not None and r.status_code == 404
            break
        ts = now_iso()
        for cid, body in re.findall(r'<section[^>]*class="company"[^>]*id="company-item-(\d+)">(.*?)</section>', r.text, re.S):
            m = re.search(r'href="http://www\.amarillas\.bo/empresa/([^"/?#]+)"[^>]*title="([^"]*)"', body)
            if not m:
                continue
            slug, name = m.group(1), html.unescape(m.group(2))
            slogan = re.search(r'<p class="slogan">(.*?)</p>', body, re.S)
            rubs = [html.unescape(x) for x in re.findall(r'<li><a href="http://www\.amarillas\.bo/rubro/[^"]+" title="([^"]*)"', body)]
            desc = re.search(r"</ul>\s*<p>(.*?)</p>", body, re.S)
            st = re.search(r'itemprop="streetAddress" title="([^"]*)"', body)
            zone = re.search(r'<span class="bold">\s*,?\s*([^<]*)</span>', body)
            city = re.search(r'itemprop="addressLocality"[^>]*>\s*,?\s*([^<]*)<', body)
            fc.write(json.dumps({"slug": slug, "company_item_id": cid, "name": name,
                                 "slogan": txt(slogan.group(1)) if slogan else None, "rubros": rubs,
                                 "description": txt(desc.group(1)) if desc else None,
                                 "street": html.unescape(st.group(1)).strip() if st else None,
                                 "zone": txt(zone.group(1)) if zone else None,
                                 "city": txt(city.group(1)) if city else None,
                                 "rubro_page": u, "retrieved_at": ts}, ensure_ascii=False) + "\n")
        fc.flush()
        if f"?page={page + 1}\"" not in r.text:
            break
        page += 1
    if ok:
        fd.write(rs + "\n"); fd.flush()
    if i % 25 == 0:
        print("rubro", i, rs, flush=True)
print("done")
