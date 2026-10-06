"""Lo que el analizador lee de disco y de la red: las noches de captura, la clave del
seudónimo y el dólar paralelo del Observatorio."""

from __future__ import annotations

import hashlib
import hmac
import json
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

LA_PAZ = timezone(timedelta(hours=-4))


def read_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    if path.exists():
        # `splitlines()` corta también en U+2028, que puede venir dentro de un comentario.
        for line in path.read_text(encoding="utf-8").split("\n"):
            if line.strip():
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return rows


def clip(text: str, limit: int) -> str:
    """Recorta a `limit` unidades UTF-16: así cuenta el validador de la semilla (un emoji vale 2)."""
    while len(text.encode("utf-16-le")) // 2 > limit:
        text = text[:-1]
    return text


def seller_key() -> bytes:
    path = Path.home() / ".observatorio-social" / "live-key"
    return bytes.fromhex(path.read_text(encoding="utf-8").strip())


def pseudonym(value: str, key: bytes) -> str:
    return hmac.new(key, value.strip().lower().encode("utf-8"), hashlib.sha256).hexdigest()[:16]


def la_paz(epoch_ms: float) -> datetime:
    return datetime.fromtimestamp(epoch_ms / 1000, tz=LA_PAZ)


def size_of(peak: int | None) -> str:
    if peak is None:
        return "SIN_DATO"
    if peak < 20:
        return "MICRO"
    if peak < 100:
        return "CHICO"
    if peak < 500:
        return "MEDIANO"
    return "GRANDE"


def parallel_rate(attempts: int = 3) -> float | None:
    """El dólar paralelo del Observatorio, para pasar a Bs los precios dichos en dólares.

    Contabo a veces tarda más de 30 s en responder: se reintenta antes de dejar el dólar en nulo.
    """
    since = (datetime.now(LA_PAZ) - timedelta(days=10)).strftime("%Y-%m-%d")
    url = f"https://test.datosbolivia.com/api/export?dataset=series&desde={since}&format=json"
    for _ in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"user-agent": "observatorio-live"})
            rows = json.load(urllib.request.urlopen(request, timeout=60))
        except Exception:
            continue
        rows = rows.get("datos", rows) if isinstance(rows, dict) else rows
        values = [
            (str(row.get("fecha")), float(row["valor"]))
            for row in rows
            if isinstance(row, dict)
            and row.get("indicador") == "FX_PARALLEL_USD_BOB"
            and row.get("lado") == "SELL"
            and row.get("valor") is not None
        ]
        return sorted(values)[-1][1] if values else None
    return None



# ------------------------------------------------------------------ carga


def load_run(run_dir: Path) -> dict[str, dict]:
    rooms: dict[str, dict] = {}
    for row in read_jsonl(run_dir / "rooms.jsonl"):
        room = rooms.setdefault(row["roomId"], {"roomId": row["roomId"], "run": run_dir.name})
        if row.get("phase") == "start" and "start" not in room:
            room["start"] = row
        elif row.get("phase") == "end":
            room["end"] = row
    for room_id, room in rooms.items():
        room["chat"] = read_jsonl(run_dir / "chat" / f"{room_id}.jsonl")
        room["events"] = read_jsonl(run_dir / "events" / f"{room_id}.jsonl")
        room["stats"] = read_jsonl(run_dir / "stats" / f"{room_id}.jsonl")
        room["speech"] = read_jsonl(run_dir / "speech" / f"{room_id}.jsonl")
        room["screen"] = read_jsonl(run_dir / "screen" / f"{room_id}.jsonl")
    return rooms


def run_coverage(run_dir: Path, rooms: dict[str, dict]) -> dict:
    candidates = read_jsonl(run_dir / "candidates.jsonl")
    return {
        "candidatesSeen": len({row.get("handle") for row in candidates}),
        "candidatesLive": len({row.get("handle") for row in candidates if row.get("live")}),
        "roomsOpened": len(rooms),
        "roomsBlocked": sum(1 for room in rooms.values() if (room.get("start") or {}).get("wall")),
    }
