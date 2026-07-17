from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOTS = [ROOT / 'src', ROOT / 'test', ROOT / 'scripts']
IMPORT_PATTERN = re.compile(
    r"(?:from\s+|import\s*\()(?P<quote>['\"])(?P<path>\.{1,2}/[^'\"]+)(?P=quote)"
)
EXTENSIONS = ('.ts', '.tsx', '.js', '.cjs', '.mjs', '.json')


def resolves(source: Path, target: str) -> bool:
    candidate = (source.parent / target).resolve()
    if candidate.is_file():
        return True
    if any(Path(str(candidate) + extension).is_file() for extension in EXTENSIONS):
        return True
    return any((candidate / f'index{extension}').is_file() for extension in EXTENSIONS)


def main() -> None:
    errors: list[str] = []
    checked = 0
    for root in SOURCE_ROOTS:
        if not root.exists():
            continue
        for source in root.rglob('*'):
            if source.suffix not in {'.ts', '.tsx', '.js', '.cjs', '.mjs'}:
                continue
            text = source.read_text(encoding='utf-8')
            for match in IMPORT_PATTERN.finditer(text):
                checked += 1
                target = match.group('path')
                if not resolves(source, target):
                    errors.append(f'{source.relative_to(ROOT)} -> {target}')

    for error in errors:
        print(f'FAIL: unresolved local import: {error}')
    if errors:
        sys.exit(1)
    print(f'PASS: {checked} local imports resolved.')


if __name__ == '__main__':
    main()
