#!/usr/bin/env python3
"""Checks architectural dependency rules without requiring Node dependencies."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
IMPORT_PATTERN = re.compile(r"^import(?:[\s\S]*?)from\s+['\"]([^'\"]+)['\"];?", re.MULTILINE)


def module_name(path: Path) -> str | None:
    parts = path.relative_to(SRC).parts
    if len(parts) >= 3 and parts[0] == "modules":
        return parts[1]
    return None


def resolve_relative(source: Path, specifier: str) -> Path:
    return (source.parent / specifier).resolve()


def main() -> int:
    violations: list[str] = []
    files = sorted(SRC.rglob("*.ts"))

    for source in files:
        text = source.read_text(encoding="utf-8")
        source_module = module_name(source)
        is_controller = source.name.endswith(".controller.ts")
        is_health_controller = source.as_posix().endswith("modules/health/health.controller.ts")

        for specifier in IMPORT_PATTERN.findall(text):
            if is_controller and not is_health_controller:
                if "database/models" in specifier or specifier in {"sequelize", "sequelize-typescript"}:
                    violations.append(f"{source.relative_to(ROOT)}: controller imports persistence detail {specifier}")

            if specifier.startswith("."):
                target = resolve_relative(source, specifier)
                try:
                    target_rel = target.relative_to(SRC)
                except ValueError:
                    continue
                target_parts = target_rel.parts
                target_module = target_parts[1] if len(target_parts) >= 3 and target_parts[0] == "modules" else None
                if source_module and target_module and source_module != target_module:
                    violations.append(
                        f"{source.relative_to(ROOT)}: module {source_module} imports internal module {target_module}"
                    )
                source_parts = source.relative_to(SRC).parts
                if source_parts[0] == "database" and target_parts and target_parts[0] == "modules":
                    violations.append(f"{source.relative_to(ROOT)}: database layer depends on application module")

    required_docs = [
        "docs/architecture/architecture-profile.md",
        "docs/architecture/non-functional-requirements.md",
        "docs/architecture/dependency-rules.md",
        "docs/architecture/security-boundaries.md",
        "docs/architecture/threat-model.md",
        "docs/architecture/authorization-matrix.md",
        "docs/architecture/architecture-gate.md",
        "docs/architecture/clean-code-review.md",
        "docs/decisions/README.md",
        "templates/adr.md",
    ]
    for relative in required_docs:
        if not (ROOT / relative).is_file():
            violations.append(f"Missing required phase-2 artifact: {relative}")

    architecture_diagrams = [
        "docs/architecture/system-context.puml",
        "docs/architecture/container-diagram.puml",
        "docs/architecture/component-diagram.puml",
        "docs/architecture/deployment-diagram.puml",
        "docs/architecture/trust-boundaries.puml",
    ]
    for relative in architecture_diagrams:
        diagram = ROOT / relative
        if not diagram.is_file():
            violations.append(f"Missing architecture diagram: {relative}")
            continue
        content = diagram.read_text(encoding="utf-8")
        if content.count("@startuml") != 1 or content.count("@enduml") != 1:
            violations.append(f"Invalid PlantUML envelope: {relative}")

    if violations:
        print("Architecture validation failed:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print(f"Architecture validation passed for {len(files)} TypeScript files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
