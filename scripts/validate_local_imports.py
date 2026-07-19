#!/usr/bin/env python3
"""Validate relative imports in maintained TypeScript and repository scripts."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from project_scope import CORE_SOURCE_ROOTS, ROOT, iter_files

IMPORT_PATTERN = re.compile(
    r"(?:from\s+|import\s*\()(?P<quote>['\"])(?P<path>\.{1,2}/[^'\"]+)(?P=quote)"
)
EXTENSIONS = (".ts", ".tsx", ".js", ".cjs", ".mjs", ".json")
SOURCE_EXTENSIONS = frozenset({".ts", ".tsx", ".js", ".cjs", ".mjs"})


def resolves(source: Path, target: str) -> bool:
    candidate = (source.parent / target).resolve()
    if candidate.is_file():
        return True
    if any(Path(str(candidate) + extension).is_file() for extension in EXTENSIONS):
        return True
    return any((candidate / f"index{extension}").is_file() for extension in EXTENSIONS)


def main() -> int:
    errors: list[str] = []
    checked = 0
    roots = CORE_SOURCE_ROOTS + (ROOT / "scripts",)

    for source in sorted(iter_files(roots, SOURCE_EXTENSIONS)):
        text = source.read_text(encoding="utf-8")
        for match in IMPORT_PATTERN.finditer(text):
            checked += 1
            target = match.group("path")
            if not resolves(source, target):
                errors.append(f"{source.relative_to(ROOT)} -> {target}")

    for error in errors:
        print(f"FAIL: unresolved local import: {error}")
    if errors:
        return 1

    print(f"PASS: {checked} maintained local imports resolved.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
