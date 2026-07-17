#!/usr/bin/env python3
"""Shared definition of the maintained production source scope."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CORE_SOURCE_ROOTS = (
    ROOT / "src" / "main.ts",
    ROOT / "src" / "app.module.ts",
    ROOT / "src" / "common",
    ROOT / "src" / "config",
    ROOT / "src" / "database",
    ROOT / "src" / "modules" / "governance",
    ROOT / "src" / "modules" / "health",
    ROOT / "src" / "modules" / "ingestion",
    ROOT / "src" / "modules" / "provenance",
    ROOT / "src" / "modules" / "quality",
    ROOT / "src" / "modules" / "query",
)


def iter_files(roots: tuple[Path, ...], extensions: frozenset[str]) -> Iterator[Path]:
    """Yield unique files from explicit roots without traversing quarantined code."""
    seen: set[Path] = set()
    for root in roots:
        candidates = (root,) if root.is_file() else root.rglob("*") if root.is_dir() else ()
        for candidate in candidates:
            if not candidate.is_file() or candidate.suffix not in extensions:
                continue
            resolved = candidate.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            yield candidate


def iter_core_typescript_files() -> Iterator[Path]:
    """Yield TypeScript files that belong to the deployed application graph."""
    yield from iter_files(CORE_SOURCE_ROOTS, frozenset({".ts", ".tsx"}))


def iter_maintained_code_files() -> Iterator[Path]:
    """Yield deployed TypeScript and repository-owned validation scripts."""
    yield from iter_files(
        CORE_SOURCE_ROOTS + (ROOT / "scripts",),
        frozenset({".ts", ".tsx", ".js", ".mjs", ".cjs", ".py"}),
    )
