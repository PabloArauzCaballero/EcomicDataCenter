"""CADECOCRUZ (Cámara de la Construcción de Santa Cruz): public 'Asociados' table at index.php?op=5.
No robots.txt (404) -> no restrictions declared. One request."""
import json, os, re, html
from common import Http, record, write_ndjson_gz, now_iso, dept_of, clean_phone, OUT

URL = "https://www.cadecocruz.org.bo/index.php?op=5"
h = Http()
r = h.get(URL)
ts = now_iso()


def txt(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()


rows = []
tbl = r.text[r.text.find('id="tabla1"'):]
tbl = tbl[:tbl.find("</table>")]
OTHER = [("yacuiba", "Yacuiba", "Tarija"), ("tarija", "Tarija", "Tarija"), ("la paz", "La Paz", "La Paz"),
         ("sopocachi", "La Paz", "La Paz"), ("calacoto", "La Paz", "La Paz"), (" - lp", "La Paz", "La Paz"),
         ("warnes", "Warnes", "Santa Cruz"), ("cochabamba", "Cochabamba", "Cochabamba"), ("sucre", "Sucre", "Chuquisaca")]
for i, tr in enumerate(re.findall(r"<tr>(.*?)</tr>", tbl, re.S)):
    tds = [txt(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
    if len(tds) < 4 or not tds[0]:
        continue
    name, tipo, addr, tel = tds[:4]
    full = f"{name} {tipo}".strip()
    a = addr.lower()
    loc, dept, inferred = "Santa Cruz de la Sierra", "Santa Cruz", True
    for k, l, d in OTHER:
        if k in a:
            loc, dept = l, d
            break
    rows.append(record(source="cadecocruz", source_id=re.sub(r"[^a-z0-9]+", "-", full.lower()).strip("-"),
                       name=full, category_raw="Construcción (asociado CADECOCRUZ)", address=addr or None,
                       locality=loc, municipality=None, department=dept, lat=None, lon=None,
                       phone=clean_phone(tel), website=None, hours=None, source_updated_at=None,
                       source_url=URL, retrieved_at=ts,
                       raw={"empresa": name, "tipo_societario": tipo, "direccion": addr, "telefono": tel,
                            "fila": i, "locality_inferred": inferred}))
write_ndjson_gz(os.path.join(OUT, "cadecocruz", "cadecocruz.ndjson.gz"), rows)
json.dump({"site_total": len(rows), "downloaded": len(rows)}, open(os.path.join(OUT, "cadecocruz", "stats.json"), "w"))
print("done", len(rows))
