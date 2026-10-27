import sys, urllib.request, urllib.parse, json, re, time
# usage: cdx.py domain outfile [regex]
dom, out = sys.argv[1], sys.argv[2]
rx = re.compile(sys.argv[3] if len(sys.argv) > 3 else r'\.(xls|xlsx|csv|zip|pdf|rar|ods|txt|json|xml)(\?|$)', re.I)
rows = []
q = {'url': dom, 'matchType': 'domain', 'output': 'json', 'fl': 'original,timestamp,mimetype,statuscode,length', 'collapse': 'urlkey', 'filter': 'statuscode:200'}
url = 'https://web.archive.org/cdx/search/cdx?' + urllib.parse.urlencode(q)
for attempt in range(4):
    try:
        data = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=300))
        break
    except Exception as e:
        print('retry', e); time.sleep(10)
else:
    sys.exit(1)
print('total captures (collapsed)', len(data) - 1)
hits = [r for r in data[1:] if rx.search(r[0]) or (r[2] or '').startswith('application/')]
json.dump(data, open(out, 'w', encoding='utf-8'))
print('file-like', len(hits))
for r in hits:
    print(r[1], r[2], r[4], r[0])
