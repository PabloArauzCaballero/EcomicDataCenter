#!/usr/bin/env python3
"""Enforce the manual-code size policy on the maintained production scope."""

from __future__ import annotations

import sys

from project_scope import ROOT, iter_maintained_code_files

EXEMPT_NAMES = {"build_openapi.py", "build_data_model_docs.py", "generate_migrations.py"}
EXEMPT_PARTS = {"migrations", "models"}


def main() -> int:
    violations: list[tuple[object, int]] = []
    warnings: list[tuple[object, int]] = []

    for path in sorted(iter_maintained_code_files()):
        if path.name in EXEMPT_NAMES or EXEMPT_PARTS.intersection(path.parts):
            continue
        line_count = len(path.read_text(encoding="utf-8").splitlines())
        relative = path.relative_to(ROOT)
        if line_count >= 300:
            violations.append((relative, line_count))
        elif line_count >= 220:
            warnings.append((relative, line_count))

    for path, line_count in warnings:
        print(f"WARN {line_count:>3} {path}")
    for path, line_count in violations:
        print(f"FAIL {line_count:>3} {path}")
    if violations:
        return 1

    print(
        f"PASS: {len(warnings)} maintained files require design review; "
        "no prohibited file exceeds 299 lines."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
