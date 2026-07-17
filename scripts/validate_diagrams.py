#!/usr/bin/env python3
"""Validación estática de los diagramas PlantUML del modelo.

No reemplaza al parser oficial de PlantUML. Verifica estructura, archivos
obligatorios, declaraciones, referencias y conteos esperados.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SYSTEM_INFO = ROOT / "systemInfo"

REQUIRED = [
    SYSTEM_INFO / "domainModel.puml",
    SYSTEM_INFO / "caseUseModel.puml",
    SYSTEM_INFO / "classDiagram.puml",
    SYSTEM_INFO / "relationalModel.puml",
    SYSTEM_INFO / "stateDiagram.puml",
    SYSTEM_INFO / "activityDiagramMainFlow.puml",
]

def balanced_braces(text: str) -> bool:
    """Valida llaves de bloques, ignorando la notación crow's foot o{ y }o."""
    depth = 0
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("'"):
            continue
        if line == "}":
            depth -= 1
            if depth < 0:
                return False
            continue
        # PlantUML abre bloques con una llave al final de la línea.
        if line.endswith("{"):
            depth += 1
    return depth == 0

def declared_relational_aliases(text: str) -> set[str]:
    return set(re.findall(r'^\s*entity\s+"[^"]+"\s+as\s+(\w+)\s*\{', text, re.M))

def relationship_tokens(text: str) -> list[tuple[str, str, str]]:
    found = []
    pattern = re.compile(
        r'^\s*(\w+)\s+(?:"[^"]*"\s+)?'
        r'([|o}{*.\-]+)'
        r'\s+(?:"[^"]*"\s+)?(\w+)(?:\s*:\s*.*)?$',
        re.M,
    )
    for left, connector, right in pattern.findall(text):
        if "--" in connector or ".." in connector:
            found.append((left, connector, right))
    return found

def validate_file(path: Path) -> list[str]:
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    if text.count("@startuml") != 1:
        errors.append("debe contener exactamente un @startuml")
    if text.count("@enduml") != 1:
        errors.append("debe contener exactamente un @enduml")
    if not balanced_braces(text):
        errors.append("llaves no balanceadas")
    if re.search(r"^\s*!include", text, re.M):
        errors.append("contiene include externo")
    return errors

def main() -> int:
    errors: list[str] = []
    for path in REQUIRED:
        if not path.exists():
            errors.append(f"Falta archivo obligatorio: {path.relative_to(ROOT)}")

    puml_files = sorted(SYSTEM_INFO.rglob("*.puml"))
    if len(puml_files) < 20:
        errors.append(f"Se esperaban al menos 20 diagramas; existen {len(puml_files)}")

    for path in puml_files:
        for error in validate_file(path):
            errors.append(f"{path.relative_to(ROOT)}: {error}")

    relational = (SYSTEM_INFO / "relationalModel.puml").read_text(encoding="utf-8")
    aliases = declared_relational_aliases(relational)
    if len(aliases) != 40:
        errors.append(f"relationalModel: se esperaban 40 entidades y se encontraron {len(aliases)}")
    for left, connector, right in relationship_tokens(relational):
        if left not in aliases:
            errors.append(f"relationalModel: referencia no declarada {left}")
        if right not in aliases:
            errors.append(f"relationalModel: referencia no declarada {right}")

    # Cada entidad relacional debe tener PK.
    for name, block in re.findall(
        r'entity\s+"([^"]+)"\s+as\s+\w+\s*\{(.*?)^\s*\}',
        relational,
        re.M | re.S,
    ):
        if "<<PK>>" not in block:
            errors.append(f"relationalModel: {name} no declara PK")

    classes = re.findall(r"^\s*class\s+(\w+)", (SYSTEM_INFO / "classDiagram.puml").read_text(encoding="utf-8"), re.M)
    if len(set(classes)) != 40:
        errors.append(f"classDiagram: se esperaban 40 clases y se encontraron {len(set(classes))}")

    activities = sorted((SYSTEM_INFO / "activities").glob("*.puml"))
    if len(activities) != 8:
        errors.append(f"Se esperaban 8 actividades específicas y existen {len(activities)}")
    for path in activities + [SYSTEM_INFO / "activityDiagramMainFlow.puml"]:
        text = path.read_text(encoding="utf-8")
        if "start" not in text or "stop" not in text:
            errors.append(f"{path.relative_to(ROOT)}: falta start o stop")

    states = sorted((SYSTEM_INFO / "states").glob("*.puml"))
    if len(states) != 7:
        errors.append(f"Se esperaban 7 diagramas de estados y existen {len(states)}")
    for path in states + [SYSTEM_INFO / "stateDiagram.puml"]:
        if "[*]" not in path.read_text(encoding="utf-8"):
            errors.append(f"{path.relative_to(ROOT)}: no contiene pseudoestado inicial/final")

    if errors:
        print("VALIDATION_FAILED")
        for error in errors:
            print(f"- {error}")
        return 1

    print("VALIDATION_OK")
    print(f"- Diagramas PlantUML: {len(puml_files)}")
    print(f"- Entidades relacionales: {len(aliases)}")
    print(f"- Clases lógicas: {len(set(classes))}")
    print(f"- Actividades específicas: {len(activities)}")
    print(f"- Estados específicos: {len(states)}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
