from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
EXEMPT = {'openapi.yaml', 'data-model.tex'}
EXTENSIONS = {'.ts', '.tsx', '.js', '.mjs', '.cjs', '.py'}
violations = []
warnings = []
for path in ROOT.rglob('*'):
    if not path.is_file() or path.suffix not in EXTENSIONS or 'node_modules' in path.parts or 'dist' in path.parts:
        continue
    if path.name in EXEMPT or 'migrations' in path.parts or 'models' in path.parts:
        continue
    lines = len(path.read_text(encoding='utf-8').splitlines())
    relative = path.relative_to(ROOT)
    if lines >= 300:
        violations.append((relative, lines))
    elif lines >= 220:
        warnings.append((relative, lines))

for path, lines in warnings:
    print(f'WARN {lines:>3} {path}')
for path, lines in violations:
    print(f'FAIL {lines:>3} {path}')
if violations:
    sys.exit(1)
print(f'PASS: {len(warnings)} files require design review; no prohibited file exceeds 299 lines.')
