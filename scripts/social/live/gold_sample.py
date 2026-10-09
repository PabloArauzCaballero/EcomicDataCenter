"""Conjunto de oro de las ventas en vivo (fase F6 del plan): armar la muestra y medir contra ella.

    python scripts/social/live/gold_sample.py sample --size=300      # escribe artifacts/live-raw/gold/muestra-<fecha>.csv
    python scripts/social/live/gold_sample.py score <csv etiquetado>   # precisión y recuperación por etiqueta

La muestra es estratificada: la misma cantidad de mensajes por rubro de la sala y por largo
(1-2 palabras, 3-5, 6 o más), para que el chat corto —el que más pesa— no tape al resto. El CSV
vive en `artifacts/` (fuera de Git) y no lleva autor: solo el texto, lo que dijo el léxico y dos
columnas vacías para la etiqueta humana (`humano_senales`, separadas por «|», y `humano_emocion`).

Mínimos para publicar una etiqueta (plan, F6): intención de compra con precisión ≥ 0,85 y
recuperación ≥ 0,70; tipo de pregunta con precisión ≥ 0,80.
"""

from __future__ import annotations

import argparse
import csv
import random
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from live_lexicon import BARE_YES, SIGNALS, fold, products_in, words_to_digits  # noqa: E402
from live_load import load_run, read_jsonl  # noqa: E402

ROOT = HERE.parents[2]
RAW = ROOT / "artifacts" / "live-raw"
GOLD = RAW / "gold"


def machine_tags(text: str) -> set[str]:
    folded = fold(words_to_digits(fold(text)))
    tags = {name for name, pattern in SIGNALS.items() if pattern.search(folded)}
    if "TALLA_COLOR" in tags:
        tags.discard("TALLA_COLOR")
        tags.add("VARIANTE")
    if products_in(folded):
        tags.add("PRODUCTO")
    if BARE_YES.match(folded):
        tags.add("YO_SUELTO")
    return tags


def length_band(text: str) -> str:
    words = len(re.findall(r"\w+", text))
    return "1-2" if words <= 2 else "3-5" if words <= 5 else "6+"


def sample(size: int, seed: int) -> Path:
    rows = []
    for night in sorted(path for path in RAW.iterdir() if re.fullmatch(r"\d{4}-\d{2}-\d{2}", path.name)):
        for room_id, room in load_run(night).items():
            title = (room.get("start") or {}).get("title", "")
            for message in read_jsonl(night / "chat" / f"{room_id}.jsonl"):
                if message.get("host") or not message.get("text"):
                    continue
                rows.append({"noche": night.name, "titulo_sala": title[:60], "texto": message["text"]})
    strata: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        strata[f"{row['titulo_sala']}|{length_band(row['texto'])}"].append(row)
    rng = random.Random(seed)
    picked: list[dict] = []
    while len(picked) < size and any(strata.values()):
        for key in list(strata):
            if strata[key] and len(picked) < size:
                picked.append(strata[key].pop(rng.randrange(len(strata[key]))))
    GOLD.mkdir(parents=True, exist_ok=True)
    out = GOLD / f"muestra-{date.today().isoformat()}.csv"
    with out.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "noche", "texto", "maquina_senales", "humano_senales", "humano_emocion"])
        writer.writeheader()
        for index, row in enumerate(picked, start=1):
            writer.writerow({
                "id": index,
                "noche": row["noche"],
                "texto": row["texto"],
                "maquina_senales": "|".join(sorted(machine_tags(row["texto"]))),
                "humano_senales": "",
                "humano_emocion": "",
            })
    return out


def score(path: Path) -> None:
    truth_positive: dict[str, int] = defaultdict(int)
    machine_positive: dict[str, int] = defaultdict(int)
    both: dict[str, int] = defaultdict(int)
    labelled = 0
    with path.open(encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            if row.get("humano_senales") is None or row["humano_senales"].strip() == "":
                continue
            labelled += 1
            human = {tag.strip().upper() for tag in row["humano_senales"].split("|") if tag.strip() and tag.strip() != "-"}
            machine = machine_tags(row["texto"]) - {"YO_SUELTO"}
            for tag in human:
                truth_positive[tag] += 1
            for tag in machine:
                machine_positive[tag] += 1
            for tag in human & machine:
                both[tag] += 1
    print(f"{labelled} mensajes etiquetados")
    for tag in sorted(set(truth_positive) | set(machine_positive)):
        precision = both[tag] / machine_positive[tag] if machine_positive[tag] else None
        recall = both[tag] / truth_positive[tag] if truth_positive[tag] else None
        say = lambda value: "—" if value is None else f"{value:.2f}"  # noqa: E731
        print(f"{tag:16} precisión {say(precision)}  recuperación {say(recall)}  (humano {truth_positive[tag]}, máquina {machine_positive[tag]})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["sample", "score"])
    parser.add_argument("path", nargs="?")
    parser.add_argument("--size", type=int, default=300)
    parser.add_argument("--seed", type=int, default=20261006)
    args = parser.parse_args()
    if args.mode == "sample":
        print(sample(args.size, args.seed))
    else:
        if not args.path:
            raise SystemExit("falta el CSV etiquetado")
        score(Path(args.path))


if __name__ == "__main__":
    main()
