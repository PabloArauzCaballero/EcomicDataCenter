"""Download Wayback captures raw: wb.py outdir ts url [ts url ...]
Rejects truncated bodies (content-length mismatch, or PDF without %%EOF)."""
import sys, os, urllib.request, time
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
a = sys.argv[2:]
for ts, url in zip(a[::2], a[1::2]):
    name = url.split('?')[0].rstrip('/').split('/')[-1] or 'index.html'
    dest = os.path.join(out, ts + '_' + name)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print('skip', dest); continue
    w = 'https://web.archive.org/web/%sid_/%s' % (ts, url)
    for i in range(5):
        time.sleep(5)
        try:
            r = urllib.request.urlopen(urllib.request.Request(w, headers={'User-Agent': 'Mozilla/5.0'}), timeout=300)
            b = r.read(); cl = r.headers.get('content-length')
            if cl and int(cl) != len(b): raise IOError('truncated %d/%s' % (len(b), cl))
            if b[:4] == b'%PDF' and b'%%EOF' not in b[-2048:]: raise IOError('pdf without EOF, len %d' % len(b))
            open(dest, 'wb').write(b)
            print(len(b), r.headers.get('content-type'), dest); break
        except Exception as e:
            print('retry', i, e); time.sleep(25)
