"""Escribe los códigos RUPE cuya ficha falta, en el orden de prioridad, para reanudar desde la entrega."""
import sys, os, gzip, json
OUT = sys.argv[1]
fn = os.path.join(OUT, 'sicoes_rupe', 'sicoes_rupe_proveedores.ndjson.gz')
pend = []
with gzip.open(fn, 'rt', encoding='utf-8') as f:
    for line in f:
        r = json.loads(line)
        if 'Persona Natural' in (r['tipo'] or ''):
            continue
        if not r['raw'].get('detalle_consultado'):
            t = r['tipo'] or ''
            pend.append(((0 if r['nit'] else 1), (2 if 'Accidental' in t else (1 if 'Extranjera' in t else 0)), r['raw']['rupe']))
pend.sort()
with open(os.path.join(OUT, 'sicoes_rupe', 'fichas_pendientes.txt'), 'w', encoding='utf-8', newline='\n') as f:
    for p in pend:
        f.write(p[2] + '\n')
print(len(pend))
