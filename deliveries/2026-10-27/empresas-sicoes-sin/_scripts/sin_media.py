"""Enumera la biblioteca de medios del WordPress del SIN (wp-json) y guarda título, url, fecha."""
import sys, json, time, requests
out = sys.argv[1]
s = requests.Session()
s.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 (DatosBolivia research)'
B = 'https://www.impuestos.gob.bo/index.php/wp-json/wp/v2/media'
rows = []
page = 1
while True:
    r = s.get(B, params={'per_page': 100, 'page': page, '_fields': 'id,date,title,source_url,mime_type'}, timeout=90)
    if r.status_code != 200:
        print('stop', page, r.status_code, r.text[:200]); break
    j = r.json()
    if not j: break
    for x in j:
        rows.append({'id': x['id'], 'date': x['date'], 'title': x['title']['rendered'], 'url': x['source_url'], 'mime': x.get('mime_type')})
    print(page, r.headers.get('X-WP-Total'), r.headers.get('X-WP-TotalPages'), flush=True)
    if page >= int(r.headers.get('X-WP-TotalPages') or 0): break
    page += 1
json.dump(rows, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(rows))
