"""Retrospectiva de los videos comerciales: tendencias por rubro y mes, y cobertura por año (F4 de
PLAN-RETROSPECTIVA-VIDEOS; ADR 0031).

Funciones puras (sin red, sin clave, sin disco salvo `load_history`) para que se prueben solas.

- `trends`: por rubro y mes, cuántos videos hay, la mediana y el percentil 95 de vistas, la razón
  compartidos/vistas, los productos y precios dichos, los hashtags que aparecen ese mes y no antes y las tres
  marcas de venta más usadas. El umbral de *trend* es el 5 % superior de vistas DENTRO de su mes y rubro:
  nunca global, porque las vistas se inflan con el tiempo. Un mes con menos de `MIN_N` videos se publica con su
  cantidad y SIN estadística (ni mediana, ni percentil, ni razón): con 1 video el «percentil» sería ese video.
- `coverage_by_year`: para 2021-2026, cuántos videos hay y por qué: cuántas cuentas tienen leído el año
  completo, a medias o nada (sin sesión TikTok solo muestra los videos recientes de cada perfil).

Nunca sale la descripción ni un identificador de cuenta: las filas que entran ya traen el seudónimo.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

MIN_N = 5  # menos videos que esto en un rubro y mes: se publica la cantidad y nada más
TREND_Q = 0.95  # 5 % superior de vistas dentro del mes y rubro
MIN_PRICES = 3  # precios mínimos para publicar una mediana
MIN_TAG_ACCOUNTS = 2  # un hashtag «nuevo» necesita al menos dos cuentas distintas (no la marca de una sola)
MAX_TAGS, MAX_PRODUCTS, MAX_TACTICS = 6, 5, 3
MAX_PRODUCT_ROWS = 600
YEARS = (2021, 2022, 2023, 2024, 2025, 2026)
HISTORY_FLOOR = "2021-10-08"  # el recolector histórico no pide más atrás (tope de 5 años)

TAG = re.compile(r"#([^\s#.,;:!?()\[\]{}\"'«»]+)")


def percentile(values: list[float], q: float) -> float:
    """Percentil con interpolación lineal sobre una lista ya ordenada."""
    if not values:
        raise ValueError("sin valores")
    position = (len(values) - 1) * q
    low = int(position)
    high = min(low + 1, len(values) - 1)
    return values[low] + (values[high] - values[low]) * (position - low)


def _round(value: float, digits: int = 2) -> float:
    return round(value, digits)


# ------------------------------------------------------------------ lectura de la historia profunda


def _int(value: object) -> int | None:
    return int(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def normalise_history_row(handle: str, row: dict) -> dict | None:
    """Una fila de `video-history/<cuenta>/win-NNN.jsonl` en la forma de `video-raw`.

    Acepta los dos nombres de campo: los del recolector (`ts`, `views`, `shares`, `dur`, `desc`) y los de
    yt-dlp (`timestamp`, `view_count`, `like_count`, `comment_count`, `repost_count`, `description`/`title`).
    """
    video_id = row.get("id")
    created = _int(row.get("ts", row.get("timestamp", row.get("createTime"))))
    if video_id is None or not created:
        return None
    first = lambda *names: next((row[n] for n in names if row.get(n) is not None), None)  # noqa: E731
    text = first("desc", "description", "title") or ""
    return {
        "handle": handle,
        "origin": "HISTORIA",
        "id": str(video_id),
        "createTime": created,
        "desc": text if isinstance(text, str) else "",
        "duration": _int(first("dur", "duration")),
        "plays": _int(first("views", "view_count", "plays")),
        "likes": _int(first("likes", "like_count")),
        "comments": _int(first("comments", "comment_count")),
        "shares": _int(first("shares", "repost_count")),
        "saves": None,
        "isAd": False,
        "imagePost": False,
        "hashtags": [m.group(1) for m in TAG.finditer(text if isinstance(text, str) else "")],
    }


def load_history(history_dir: Path) -> tuple[list[dict], dict[str, dict]]:
    """Videos de `video-history/` y el último resumen por cuenta de `coverage.jsonl` (si existen)."""
    videos: list[dict] = []
    coverage: dict[str, dict] = {}
    if not history_dir.exists():
        return videos, coverage
    for account in sorted(path for path in history_dir.iterdir() if path.is_dir()):
        for window in sorted(account.glob("win-*.jsonl")):
            for line in window.read_text(encoding="utf-8").split("\n"):
                if not line.strip():
                    continue
                try:
                    row = normalise_history_row(account.name, json.loads(line))
                except json.JSONDecodeError:
                    continue
                if row:
                    videos.append(row)
    summary = history_dir / "coverage.jsonl"
    if summary.exists():
        for line in summary.read_text(encoding="utf-8").split("\n"):
            if line.strip():
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(row, dict) and row.get("handle"):
                    coverage[str(row["handle"])] = row  # la última línea de la cuenta manda
    return videos, coverage


def merge_videos(raw: Iterable[dict], history: Iterable[dict]) -> dict[str, dict]:
    """Une `video-raw` y `video-history` por id. La lectura de `video-raw` manda (trae hashtags, guardados y
    anuncio); de la historia se completa lo que falte. Entre dos historias, la de más vistas (más reciente)."""
    merged: dict[str, dict] = {}
    for row in history:
        old = merged.get(row["id"])
        if old is None or (row.get("plays") or 0) > (old.get("plays") or 0):
            merged[row["id"]] = {**(old or {}), **{k: v for k, v in row.items() if v is not None}}
    for row in raw:
        old = merged.get(str(row["id"]), {})
        filled = {k: v for k, v in old.items() if v not in (None, "", [])}
        merged[str(row["id"])] = {**filled, **{k: v for k, v in row.items() if v is not None}, "id": str(row["id"])}
    return merged


# ------------------------------------------------------------------------------------- tendencias


def _median_or_none(values: list[float]) -> float | None:
    return _round(percentile(sorted(values), 0.5)) if len(values) >= MIN_PRICES else None


def trends(rows: list[dict]) -> dict:
    """`rows`: un dict por video comercial con `month` (AAAA-MM), `year`, `rubro`, `seller`, `plays`, `shares`,
    `product`, `prices` (Bs), `hashtags` (plegados) y `tactics`."""
    by_cell: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        by_cell[(row["rubro"], row["month"])].append(row)

    first_month: dict[str, str] = {}
    for rubro, month in by_cell:
        if rubro not in first_month or month < first_month[rubro]:
            first_month[rubro] = month

    # hashtag → primer mes en que aparece, por rubro: «nuevo» es el mes de su primera aparición, y solo cuenta
    # si hay meses anteriores leídos (el primer mes de un rubro no tiene «antes»).
    first_seen: dict[tuple[str, str], str] = {}
    for rubro, month in sorted(by_cell, key=lambda cell: cell[1]):
        for row in by_cell[(rubro, month)]:
            for tag in row["hashtags"]:
                first_seen.setdefault((rubro, tag), month)

    months: list[dict] = []
    for (rubro, month), cell in sorted(by_cell.items()):
        n = len(cell)
        plays = sorted(r["plays"] for r in cell if r["plays"] is not None)
        stat = n >= MIN_N and len(plays) >= MIN_N
        total_plays = sum(plays)
        p95 = _round(percentile(plays, TREND_Q), 0) if stat else None
        shares = sum(r["shares"] or 0 for r in cell if r["plays"] is not None)
        prices = [p for r in cell for p in r["prices"]]
        products = Counter(r["product"] for r in cell if r["product"])
        tactics = Counter(t for r in cell for t in r["tactics"])
        tag_videos: dict[str, int] = Counter()
        tag_accounts: dict[str, set[str]] = defaultdict(set)
        for r in cell:
            for tag in set(r["hashtags"]):
                if first_seen.get((rubro, tag)) == month:
                    tag_videos[tag] += 1
                    tag_accounts[tag].add(r["seller"])
        baseline = month == first_month[rubro]
        new_tags = [] if baseline else [
            {"tag": tag, "n": count}
            for tag, count in sorted(tag_videos.items(), key=lambda item: (-item[1], item[0]))
            if len(tag_accounts[tag]) >= MIN_TAG_ACCOUNTS
        ][:MAX_TAGS]
        months.append({
            "rubro": rubro,
            "month": month,
            "n": n,
            "accounts": len({r["seller"] for r in cell}),
            "median": _round(percentile(plays, 0.5), 0) if stat else None,
            "p95": p95,
            "trendN": sum(1 for p in plays if p95 is not None and p >= p95) if stat else None,
            "shareRatio": _round(shares / total_plays, 4) if stat and total_plays else None,
            "priced": sum(1 for r in cell if r["prices"]),
            "priceMedian": _median_or_none(prices),
            "products": [{"product": p, "n": c} for p, c in sorted(products.items(), key=lambda i: (-i[1], i[0]))[:MAX_PRODUCTS]],
            "newTags": new_tags,
            "baseline": baseline,
            "tactics": [
                {"tactic": t, "share": _round(100 * c / n, 1)}
                for t, c in sorted(tactics.items(), key=lambda i: (-i[1], i[0]))[:MAX_TACTICS]
            ],
        })

    priced: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    named: Counter[tuple[str, str, str]] = Counter()
    for row in rows:
        if not row["product"]:
            continue
        cell = (row["year"], row["rubro"], row["product"])
        named[cell] += 1
        priced[cell].extend(row["prices"])
    products = []
    for cell, count in named.items():
        values = sorted(priced[cell])
        products.append({
            "year": cell[0],
            "rubro": cell[1],
            "product": cell[2],
            "n": count,
            "prices": len(values),
            "p25": _round(percentile(values, 0.25)) if len(values) >= MIN_PRICES else None,
            "median": _round(percentile(values, 0.5)) if len(values) >= MIN_PRICES else None,
            "p75": _round(percentile(values, 0.75)) if len(values) >= MIN_PRICES else None,
        })
    products.sort(key=lambda r: (-r["n"], r["year"], r["rubro"], r["product"]))
    return {
        "minN": MIN_N,
        "trendShare": _round(1 - TREND_Q, 2),
        "months": months,
        "products": sorted(products[:MAX_PRODUCT_ROWS], key=lambda r: (r["year"], -r["n"], r["rubro"], r["product"])),
    }


def trend_ids(rows: list[dict]) -> list[dict]:
    """Los videos en el 5 % superior de su mes y rubro (con n >= MIN_N): la lista de la segunda pasada (F3)."""
    by_cell: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        if row["plays"] is not None:
            by_cell[(row["rubro"], row["month"])].append(row)
    out = []
    for (rubro, month), cell in by_cell.items():
        if len(cell) < MIN_N:
            continue
        threshold = percentile(sorted(r["plays"] for r in cell), TREND_Q)
        out.extend(
            {"id": r["id"], "handle": r["handle"], "rubro": rubro, "month": month, "plays": r["plays"]}
            for r in cell
            if r["plays"] >= threshold
        )
    return out


# ------------------------------------------------------------------------------ cobertura por año


def account_floor(oldest: str | None, complete: bool, motive: str | None) -> str:
    """Desde qué día está leída la cuenta sin huecos. Completa (la lista se agotó): desde siempre. Con tope
    de 5 años: desde el tope. Cortada: desde su video más viejo leído. Sin videos: nunca."""
    if complete:
        return HISTORY_FLOOR if motive == "TECHO" else "0000-00-00"
    return oldest or "9999-99-99"


def coverage_by_year(floors: dict[str, str], videos_by_year: dict[str, int], accounts_by_year: dict[str, int]) -> dict:
    """`floors`: por cuenta incluida, el día desde el que está leída. Devuelve una fila por año 2021-2026."""
    total = len(floors)
    out: dict[str, dict] = {}
    for year in YEARS:
        start, end = f"{year}-01-01", f"{year}-12-31"
        full = sum(1 for floor in floors.values() if floor <= start)
        partial = sum(1 for floor in floors.values() if start < floor <= end)
        none = total - full - partial
        videos = videos_by_year.get(str(year), 0)
        if total == 0:
            cause, why = "SIN_CUENTAS", "No hay cuentas leídas."
        elif full >= 0.9 * total:
            cause = "COMPLETO"
            why = f"{full} de {total} cuentas tienen leído el año entero: lo que falta es lo que no se publicó o se borró."
        elif full + partial == 0:
            cause = "SIN_ALCANCE"
            why = (
                f"Ninguna de las {total} cuentas llega hasta {year}: sin sesión TikTok muestra de cada perfil solo los videos "
                f"recientes. Los {videos} videos del año vienen de otra vía y son un piso, no el total."
            )
        else:
            cause = "PARCIAL"
            why = (
                f"{full} de {total} cuentas tienen el año entero leído, {partial} lo tienen a medias (su video más viejo cae dentro "
                f"del año) y {none} no llegan hasta ahí (solo se ven sus videos recientes). Los {videos} videos son un piso, "
                "no el total; las cuentas borradas no aparecen."
            )
        if year == 2021 and cause != "SIN_CUENTAS":
            why += f" La lectura histórica no pide antes del {HISTORY_FLOOR[8:]}-10-2021 (tope de 5 años)."
        out[str(year)] = {
            "videos": videos,
            "accountsWithVideos": accounts_by_year.get(str(year), 0),
            "accountsFull": full,
            "accountsPartial": partial,
            "accountsNone": none,
            "cause": cause,
            "why": why,
        }
    return out
