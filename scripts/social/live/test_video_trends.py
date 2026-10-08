"""Pruebas de la retrospectiva de videos (F4): tendencias por rubro y mes, umbral de trend y cobertura por año.

    python -m pytest scripts/social/live/test_video_trends.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from video_trends import (  # noqa: E402
    MIN_N,
    account_floor,
    coverage_by_year,
    load_history,
    merge_videos,
    normalise_history_row,
    percentile,
    trend_ids,
    trends,
)


def row(month: str, plays: int | None, *, rubro: str = "CALZADO", seller: str = "a", n: int = 0, **extra) -> dict:
    return {
        "id": f"{month}-{rubro}-{seller}-{n}-{plays}",
        "handle": f"@{seller}",
        "seller": seller,
        "month": month,
        "year": month[:4],
        "rubro": rubro,
        "plays": plays,
        "shares": 0,
        "product": None,
        "prices": [],
        "hashtags": [],
        "tactics": [],
        **extra,
    }


def cell(trend: dict, rubro: str, month: str) -> dict:
    return next(r for r in trend["months"] if r["rubro"] == rubro and r["month"] == month)


def test_a_month_with_one_video_is_published_as_n_1_without_a_percentile():
    out = trends([row("2022-03", 9_000_000)])
    only = cell(out, "CALZADO", "2022-03")
    assert only["n"] == 1
    assert only["median"] is None and only["p95"] is None and only["trendN"] is None and only["shareRatio"] is None


def test_four_videos_still_have_no_percentile_and_five_do():
    four = trends([row("2022-03", 100 * i, n=i) for i in range(1, MIN_N)])
    assert cell(four, "CALZADO", "2022-03")["p95"] is None
    five = trends([row("2022-03", 100 * i, n=i) for i in range(1, MIN_N + 1)])
    assert cell(five, "CALZADO", "2022-03")["p95"] == 480
    assert cell(five, "CALZADO", "2022-03")["median"] == 300


def test_the_threshold_is_per_month_and_rubro_never_global():
    rows = [row("2021-11", 1_000 + i, n=i) for i in range(20)]  # un mes viejo: pocas vistas
    rows += [row("2026-09", 1_000_000 + i, n=i) for i in range(20)]  # uno reciente: muchas
    rows += [row("2026-09", 5_000 + i, rubro="HOGAR", n=i) for i in range(20)]  # otro rubro del mismo mes
    ids = trend_ids(rows)
    by_cell: dict[tuple[str, str], int] = {}
    for item in ids:
        by_cell[(item["rubro"], item["month"])] = by_cell.get((item["rubro"], item["month"]), 0) + 1
    # un video por celda (el 5 % superior de 20), también en el mes viejo y en el rubro chico
    assert by_cell == {("CALZADO", "2021-11"): 1, ("CALZADO", "2026-09"): 1, ("HOGAR", "2026-09"): 1}
    old = next(item for item in ids if item["month"] == "2021-11")
    assert old["plays"] == 1_019  # con un umbral global ese video no habría pasado


def test_small_cells_never_feed_the_trend_list():
    assert trend_ids([row("2022-03", 10_000_000), row("2022-03", 5, n=1)]) == []


def test_new_hashtags_need_a_prior_month_and_two_accounts():
    rows = [
        row("2025-01", 10, seller="a", hashtags=["viejo"]),
        row("2025-02", 10, seller="a", hashtags=["viejo", "nuevo"]),
        row("2025-02", 10, seller="b", n=1, hashtags=["nuevo", "solouno"]),
        row("2025-02", 10, seller="b", n=2, hashtags=["solouno"]),
        row("2025-03", 10, seller="a", hashtags=["nuevo"]),
    ]
    out = trends(rows)
    assert cell(out, "CALZADO", "2025-01")["newTags"] == []  # sin «antes» no hay nuevos
    assert cell(out, "CALZADO", "2025-01")["baseline"] is True
    feb = cell(out, "CALZADO", "2025-02")
    assert [t["tag"] for t in feb["newTags"]] == ["nuevo"]  # «viejo» ya estaba; «solouno» tiene una sola cuenta
    assert feb["newTags"][0]["n"] == 2
    assert cell(out, "CALZADO", "2025-03")["newTags"] == []  # ya no es nuevo


def test_prices_products_and_the_three_commonest_sale_marks():
    rows = [
        row("2025-05", 10 * i, n=i, product="zapato", prices=[100.0 + i], tactics=["PRECIO", "ENVIO"] if i % 2 else ["PRECIO"])
        for i in range(6)
    ]
    out = trends(rows)
    may = cell(out, "CALZADO", "2025-05")
    assert may["products"] == [{"product": "zapato", "n": 6}]
    assert may["priceMedian"] == 102.5 and may["priced"] == 6
    assert [t["tactic"] for t in may["tactics"]] == ["PRECIO", "ENVIO"]
    assert may["tactics"][0]["share"] == 100.0
    year = next(p for p in out["products"] if p["product"] == "zapato")
    assert year["year"] == "2025" and year["n"] == 6 and year["median"] == 102.5


def test_the_output_never_carries_a_caption_or_a_handle():
    out = json.dumps(trends([row("2025-05", 10, seller="vendedor", n=i) for i in range(6)]))
    assert "@vendedor" not in out and "desc" not in out and "handle" not in out


def test_history_rows_are_read_with_both_naming_schemes_and_dedup_by_id(tmp_path: Path):
    account = tmp_path / "tienda"
    account.mkdir()
    (account / "win-001.jsonl").write_text(
        json.dumps({"id": "1", "ts": 1_700_000_000, "views": 50, "likes": 3, "comments": 1, "shares": 2, "dur": 9, "desc": "zapatos a 100 bs #moda"}) + "\n"
        + json.dumps({"id": "2", "timestamp": 1_600_000_000, "view_count": 70, "like_count": 1, "comment_count": 0, "repost_count": 0}) + "\n"
        + "no es json\n",
        encoding="utf-8",
    )
    (tmp_path / "coverage.jsonl").write_text(
        json.dumps({"handle": "tienda", "motive": "ERROR"}) + "\n" + json.dumps({"handle": "tienda", "motive": "FIN"}) + "\n",
        encoding="utf-8",
    )
    history, coverage = load_history(tmp_path)
    assert sorted(h["id"] for h in history) == ["1", "2"]
    assert history[0]["plays"] == 50 and history[0]["hashtags"] == ["moda"] and history[0]["handle"] == "tienda"
    assert coverage["tienda"]["motive"] == "FIN"  # la última línea de la cuenta manda
    raw = [{"handle": "tienda", "id": 1, "createTime": 1_700_000_000, "desc": "con texto", "plays": 40, "saves": 5, "hashtags": ["x"]}]
    merged = merge_videos(raw, history)
    assert sorted(merged) == ["1", "2"]  # sin repetir ids
    assert merged["1"]["desc"] == "con texto" and merged["1"]["saves"] == 5  # manda video-raw
    assert merged["1"]["shares"] == 2  # y lo que falta se completa con la historia


def test_a_history_row_without_id_or_date_is_dropped():
    assert normalise_history_row("x", {"id": "9"}) is None
    assert normalise_history_row("x", {"ts": 5}) is None


def test_coverage_by_year_says_why_each_year_has_what_it_has():
    floors = {
        "a": account_floor("2026-06-01", False, "ERROR"),  # cortada: solo 2026 a medias
        "b": account_floor("2022-03-04", False, None),  # llega a 2022
        "c": account_floor("2021-10-09", True, "TECHO"),  # tope de 5 años
        "d": account_floor("2024-01-01", True, "FIN"),  # agotada: completa desde siempre
    }
    out = coverage_by_year(floors, {"2026": 40, "2022": 3}, {"2026": 4, "2022": 1})
    assert sorted(out) == ["2021", "2022", "2023", "2024", "2025", "2026"]
    assert out["2021"]["accountsFull"] == 1 and out["2021"]["accountsPartial"] == 1 and out["2021"]["accountsNone"] == 2
    assert "tope de 5 años" in out["2021"]["why"]
    assert out["2026"]["accountsPartial"] == 1 and out["2026"]["accountsNone"] == 0
    assert out["2025"]["cause"] == "PARCIAL" and "piso" in out["2025"]["why"]
    assert out["2022"]["videos"] == 3


def test_a_year_nobody_reaches_is_declared_without_reach():
    out = coverage_by_year({"a": account_floor("2026-06-01", False, None)}, {}, {})
    assert out["2022"]["cause"] == "SIN_ALCANCE" and out["2022"]["videos"] == 0


def test_percentile_interpolates():
    assert percentile([1, 2, 3, 4], 0.5) == 2.5
    assert percentile([7], 0.95) == 7
