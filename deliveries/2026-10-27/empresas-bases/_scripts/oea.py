"""Parse Aduana OEA certified companies PDF -> json."""
import sys, json, pdfplumber
COLS = [('nit', 75, 135), ('razon_social', 135, 350), ('tipo', 350, 470), ('estado', 470, 999)]
rows = []
pdf = pdfplumber.open(sys.argv[1])
for p in pdf.pages:
    ws = p.extract_words(y_tolerance=1)
    anchors = [w for w in ws if w['x0'] < 75 and w['text'].isdigit() and w['top'] > 115]
    ents = [{'top': a['top'], 'nro': a['text'], **{c: [] for c, _, _ in COLS}} for a in anchors]
    if not ents: continue
    for w in ws:
        if w['top'] <= 115 or w in anchors: continue
        e = min(ents, key=lambda e: abs(e['top'] - w['top']))
        if abs(e['top'] - w['top']) > 9: continue
        for c, a, b in COLS:
            if a <= w['x0'] < b:
                e[c].append(w); break
    for e in ents:
        r = {'nro': e['nro']}
        for c, _, _ in COLS:
            r[c] = ' '.join(w['text'] for w in sorted(e[c], key=lambda w: (round(w['top']), w['x0'])))
        rows.append(r)
json.dump(rows, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(rows))
