"""Reconstruye la entrega en una carpeta de preparación, la pasa por privacy_check.py y solo si da 0 hallazgos
la copia a deliveries/. Si hay hallazgos, sale con 1 y deliveries/ queda como estaba (no hay nada nuevo que commitear).

Uso: python -P checkpoint.py "texto de reanudación" """
import os, sys, shutil, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.dirname(HERE)
OUT = os.path.join(os.path.dirname(WORK), 'deliveries', '2026-10-27', 'empresas-sicoes-sin')
STAGE = os.path.join(WORK, 'staging', 'empresas-sicoes-sin')
DL = os.path.join(WORK, 'dl')
py = sys.executable


def run(*args, **kw):
    return subprocess.run([py, '-P'] + list(args), **kw).returncode


if os.path.exists(STAGE):
    shutil.rmtree(STAGE)
shutil.copytree(OUT, STAGE)
assert run(os.path.join(HERE, 'build_delivery.py'), DL, STAGE, stdout=subprocess.DEVNULL) == 0
assert run(os.path.join(HERE, 'write_pending.py'), STAGE) == 0
assert run(os.path.join(HERE, 'build_delivery.py'), DL, STAGE) == 0  # manifest con pendientes al día
rc = run(os.path.join(HERE, 'privacy_check.py'), os.path.join(STAGE, 'sicoes_rupe', 'sicoes_rupe_proveedores.ndjson.gz'),
         os.path.join(STAGE, 'sin', 'sin_listas_publicadas.ndjson.gz'))
if rc != 0:
    print('PUBLICACION CORTADA: privacy_check encontró datos personales; deliveries/ no se tocó.')
    sys.exit(1)
assert run(os.path.join(HERE, 'fill_readme.py'), STAGE, os.path.join(DL, 'README.tpl.md'), os.path.join(DL, 'cobertura.md'),
           os.path.join(DL, 'adj.md'), sys.argv[1]) == 0
for f in ['sic_rupe_list.py', 'sic_rupe_detail.py', 'sin_media.py', 'sin_scan_pdfs.py', 'sin_parse.py', 'sin_fe_tokens.py',
          'build_delivery.py', 'fill_readme.py', 'rupe_coverage.py', 'write_pending.py', 'checkpoint.py', 'privacy_check.py']:
    shutil.copy(os.path.join(HERE, f), os.path.join(STAGE, '_scripts', f))
shutil.copytree(STAGE, OUT, dirs_exist_ok=True)
print('ok: entrega copiada a deliveries/')
