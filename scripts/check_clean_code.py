#!/usr/bin/env python3
"""Conservative clean-code checks for production TypeScript source files."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

FORBIDDEN_FILENAMES = {
    "utils.ts",
    "helpers.ts",
    "manager.ts",
    "processor.ts",
}
PATTERNS = {
    "explicit any": re.compile(r"(?::|\bas|<)\s*any\b"),
    "console runtime logging": re.compile(r"\bconsole\.(?:log|debug|info|warn|error)\s*\("),
    "TypeScript suppression": re.compile(r"@ts-(?:ignore|nocheck)"),
    "empty catch": re.compile(r"catch\s*(?:\([^)]*\))?\s*\{\s*\}"),
    "TODO debt marker": re.compile(r"\b(?:TODO|FIXME|HACK)\b"),
}
GENERIC_CLASS = re.compile(r"\bclass\s+\w*(?:Manager|Helper|Processor|Utils)\b")


def main() -> int:
    violations: list[str] = []
    files = sorted(SRC.rglob("*.ts"))

    for path in files:
        relative = path.relative_to(ROOT)
        if path.name in FORBIDDEN_FILENAMES:
            violations.append(f"{relative}: generic filename")
        text = path.read_text(encoding="utf-8")
        for label, pattern in PATTERNS.items():
            if pattern.search(text):
                violations.append(f"{relative}: {label}")
        if GENERIC_CLASS.search(text):
            violations.append(f"{relative}: generic class name")

    if violations:
        print("Clean-code validation failed:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print(f"Clean-code validation passed for {len(files)} TypeScript files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
