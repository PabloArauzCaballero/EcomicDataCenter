"""Reconstruye la entrega y el README. Uso: python -P checkpoint.py "texto de reanudación" """
import os, sys, shutil, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.dirname(HERE)
OUT = os.path.join(os.path.dirname(WORK), 'deliveries', '2026-10-27', 'empresas-sicoes-sin')
DL = os.path.join(WORK, 'dl')
py = sys.executable
subprocess.run([py, '-P', os.path.join(HERE, 'build_delivery.py'), DL, OUT], check=True, stdout=subprocess.DEVNULL)
subprocess.run([py, '-P', os.path.join(HERE, 'fill_readme.py'), OUT, os.path.join(DL, 'README.tpl.md'),
                os.path.join(DL, 'cobertura.md'), os.path.join(DL, 'adj.md'), sys.argv[1]], check=True)
for f in ['sic_rupe_list.py', 'sic_rupe_detail.py', 'sin_media.py', 'sin_scan_pdfs.py', 'sin_parse.py', 'sin_fe_tokens.py',
          'build_delivery.py', 'fill_readme.py', 'rupe_coverage.py', 'write_pending.py', 'checkpoint.py']:
    shutil.copy(os.path.join(HERE, f), os.path.join(OUT, '_scripts', f))
print('ok')
