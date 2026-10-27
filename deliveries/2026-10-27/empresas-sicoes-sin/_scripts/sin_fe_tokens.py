import re
NIT = re.compile(r'^\d{6,13}$')
DATE = re.compile(r'^\d{1,2}/\d{1,2}/\d{2,4}$')
GRP = re.compile(r'^G[IVX]{1,4}$')
MODS = re.compile(r'^(EL|CL|PWL|PW|M|P|C|E)( [oO] (EL|CL|PWL|PW))?$')
LONG = re.compile(r'L[IÍ]NEA|ELECTR[OÓ]NIC|COMPUTARIZAD|PORTAL WEB|MANUAL|PREVALORAD', re.I)
ADM = re.compile(r'^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .]{1,40}$')
LETTER = re.compile(r'^[AB]$')
COMBO = re.compile(r'^(PW|M|P|C|E) (\d{1,2}/\d{1,2}/\d{2,4}) ?(G[IVX]+)?$')
DG = re.compile(r'^(\d{1,2}/\d{1,2}/\d{2,4}) (G[IVX]+)$')


def tokens(page_text):
    return [re.sub(r'\s+', ' ', t).strip() for t in re.split(r'[\n\t]+', page_text) if t.strip()]


def fe_rows(page_text):
    tk = tokens(page_text)
    out = []
    for i, t in enumerate(tk):
        if not NIT.match(t):
            continue
        rec = {'nit': t}
        for u in tk[i + 1:i + 4]:
            if NIT.match(u):
                break
            m = COMBO.match(u)
            if m:
                rec.setdefault('mod', m.group(1))
                rec.setdefault('fecha', m.group(2))
                if m.group(3):
                    rec.setdefault('grupo', m.group(3))
                continue
            m = DG.match(u)
            if m:
                rec.setdefault('fecha', m.group(1))
                rec.setdefault('grupo', m.group(2))
                continue
            if DATE.match(u) and 'fecha' not in rec:
                rec['fecha'] = u
            elif GRP.match(u) and 'grupo' not in rec:
                rec['grupo'] = u
            elif MODS.match(u) and 'mod' not in rec:
                rec['mod'] = u
            elif LONG.search(u) and 'mod' not in rec:
                rec['mod'] = u
            elif ADM.match(u) and 'adm' not in rec and not LONG.search(u):
                rec['adm'] = u
        if 'mod' in rec:
            out.append(rec)
    return out


def nit_letter_rows(page_text):
    tk = tokens(page_text)
    out = {}
    for i, t in enumerate(tk[:-1]):
        if NIT.match(t) and LETTER.match(tk[i + 1]):
            out[t] = tk[i + 1]
    return out


def numbered_nits(page_text):
    tk = tokens(page_text)
    out = []
    for i, t in enumerate(tk[:-1]):
        if re.match(r'^\d{1,4}$', t) and re.match(r'^\d{7,13}$', tk[i + 1]):
            out.append((int(t), tk[i + 1]))
    return out
