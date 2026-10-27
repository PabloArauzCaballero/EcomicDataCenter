"""Parse ASFI 'Entidades ... Cobertura por departamento' PDFs -> json list.
usage: asfi_pdf.py in.pdf out.json estado"""
import sys, re, json, pdfplumber

XS = re.compile(r'^[xX]+$')
SIG = re.compile(r'^[A-Z0-9]{3}$')


def parse(path, estado):
    rows = []
    cat = None
    pdf = pdfplumber.open(path)
    for pi, p in enumerate(pdf.pages):
        ws = [w for w in p.extract_words(y_tolerance=1) if w.get('upright', True)]
        of = [w for w in ws if w['text'] == 'Oficina']
        if not of:
            p.close(); continue
        of = of[0]
        city0 = of['x0'] - 12
        if estado != 'lic':
            import collections
            CT = ('La', 'Santa', 'Cochabamba', 'Sucre', 'Oruro', 'Tarija', 'Potosí', 'Trinidad', 'Cobija', 'Yacuiba',
                  'Bermejo', 'Guayaramerín', 'Riberalta', 'Montero', 'Quillacollo', 'Punata', 'El', 'Villazón', 'Uyuni',
                  'Camiri', 'Villamontes', 'Puerto', 'Desaguadero', 'Copacabana', 'Sacaba', 'Tupiza', 'Warnes', 'Cotoca')
            cand = collections.Counter(round(w['x0']) for w in ws if w['text'] in CT and w['x0'] > 180)
            if cand: city0 = cand.most_common(1)[0][0] - 2
        body = [w for w in ws if w['top'] > of['top'] + 25]
        # lines
        body.sort(key=lambda w: (round(w['top']), w['x0']))
        anchors = [w for w in body if w['x0'] < 95 and w['text'].isdigit()]
        cats = []
        lines = {}
        for w in body:
            lines.setdefault(round(w['top'] / 2), []).append(w)
        for k, lw in sorted(lines.items()):
            lw.sort(key=lambda w: w['x0'])
            if lw[0]['x0'] < 95 and not lw[0]['text'].isdigit() and all(w['x0'] < city0 for w in lw):
                t = ' '.join(w['text'] for w in lw).lstrip('- ').strip()
                if t and not t.lower().startswith('empresas de servicios') and re.match(r'(Empresas|Casas|Almacenes|Bur|Cámaras|Sociedades|Agencias|Entidades|Bancos|Cooperativas|Instituciones|Fondos|Administradoras)', t):
                    cats.append((lw[0]['top'], t))
        for o in [w for w in ws if w['text'] == 'Oficina']:
            lab = [w for w in ws if w['x0'] < o['x0'] - 5 and abs(w['top'] - o['top']) <= 14 and not w['text'].isdigit()]
            lab.sort(key=lambda w: (round(w['top']), w['x0']))
            t = ' '.join(w['text'] for w in lab)
            if t and not t.lower().startswith('empresas de servicios'):
                cats.append((o['top'] - 15, t))
        cats.sort()
        ents = []
        for a in anchors:
            ents.append({'top': a['top'], 'num': a['text'], 'name': [], 'city': [], 'sigla': None, 'cov': 0})
        if not ents:
            p.close(); continue
        anchor_ids = set(id(a) for a in anchors)
        cat_tops = [c[0] for c in cats]
        for w in body:
            if id(w) in anchor_ids: continue
            if any(abs(w['top'] - t) < 1.5 for t in cat_tops) and w['x0'] < city0: continue
            e = min(ents, key=lambda e: abs(e['top'] - w['top']))
            if abs(e['top'] - w['top']) > 16: continue
            if XS.match(w['text']):
                e['cov'] += len(w['text']); continue
            if w['x0'] >= city0:
                e['city'].append(w)
            elif SIG.match(w['text']) and w['x0'] < 120 and abs(w['top'] - e['top']) < 2 and e['sigla'] is None:
                e['sigla'] = w['text']
            else:
                e['name'].append(w)
        for e in ents:
            c = [t for t, txt in cats if t < e['top']]
            ccat = [txt for t, txt in cats if t < e['top']]
            if ccat: cat = ccat[-1]
            nm = ' '.join(w['text'] for w in sorted(e['name'], key=lambda w: (round(w['top']), w['x0'])))
            ct = ' '.join(w['text'] for w in sorted(e['city'], key=lambda w: (round(w['top']), w['x0'])) if not re.match(r'^[A-Z]$', w['text']))
            warn = None
            m = re.search(r'\s\((\d|\*)\)\s+(A partir|Mediante|El Proceso|Direcci)', nm)
            if m: nm = nm[:m.start()]; warn = 'nota al pie recortada'
            nm = re.sub(r'^([A-Z] )+', '', nm).strip()
            ct = re.split(r'\s(el \d|de operaciones|entre |Monse|No cuenta)', ct)[0].strip()
            if nm.startswith('('):
                continue
            rows.append({'num': e['num'], 'sigla': e['sigla'], 'razon_social': nm, 'ciudad': ct, 'categoria': cat,
                         'departamentos_cobertura': e['cov'], 'estado': estado, 'page': pi + 1, 'aviso': warn})
        p.close()
    return rows


if __name__ == '__main__':
    r = parse(sys.argv[1], sys.argv[3])
    json.dump(r, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(sys.argv[1], len(r))
