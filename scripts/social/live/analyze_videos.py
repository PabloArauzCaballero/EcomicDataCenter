"""Resume la historia de videos de los vendedores en la semilla `tiktok-videos.json` (catálogo «videos»,
aparte de los lives; ADR 0031).

Lee todas las corridas de `artifacts/video-raw/<fecha>/` (lo que escribió `collect-videos.ts`) y escribe
solo lo necesario para dibujar día a día:

- `accounts`: una fila por cuenta incluida, en seudónimo, con su clase (venta, gastronomía,
  entretenimiento), rubro, departamento, cómo se la encontró (vista en un live o sugerida como
  parecida) y sus cifras de perfil.
- `videos`: una fila por video, en seudónimo, con fecha, hora, rubro, producto, precios dichos en la
  descripción, cifras y las marcas de cómo vende. Nunca la descripción ni un identificador real.
- `terms`: hashtags más usados por rubro.
- `coverage`: cuántas cuentas se leyeron, cuántas se excluyeron y por qué, y cuántos videos hay por año.

Una cuenta sugerida que no es de Bolivia, o que no vende ni entretiene, queda fuera y contada: es la
regla para no ensuciar la data. Sin sesión, cada perfil entrega sus ~16-35 videos más recientes: la
serie larga está cargada hacia lo reciente y la cobertura por año lo muestra.

    python scripts/social/live/analyze_videos.py
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from live_lexicon import DEPARTMENTS, FOREIGN, PRODUCT_RUBRO, RUBROS, departments_in, fold, prices_in, products_in, words_to_digits  # noqa: E402
from live_load import la_paz, parallel_rate, pseudonym, read_jsonl, seller_key  # noqa: E402
from live_products import GENERIC_PRODUCTS  # noqa: E402

ROOT = HERE.parents[2]
RAW = ROOT / "artifacts" / "video-raw"
SEED = ROOT / "src" / "database" / "seeds" / "boot" / "tiktok-videos.json"

TACTICS: dict[str, re.Pattern[str]] = {
    "PRECIO": re.compile(r"\b(precio|bs\.?\s?\d|\d+\s?bs\b|bolivianos|a solo|desde \d|oferta de \d)"),
    "ENVIO": re.compile(r"\b(envio|envios|delivery|enviamos|a todo bolivia|a domicilio|encomienda|entrega)"),
    "CONTACTO": re.compile(r"(whatsapp|wsp|wasap|\binbox\b|\bdm\b|escribenos|escribeme|contacto|al privado|\+?591|\b[67]\d{7}\b|link en (la )?bio)"),
    "PROMO": re.compile(r"\b(oferta|promo|promocion|descuento|liquidacion|remate|2x1|rebaja|outlet|black friday|cyber)"),
    "LIVE": re.compile(r"(\blive\b|\ben ?vivo\b|#live|transmision|hoy a las \d)"),
    "SORTEO": re.compile(r"\b(sorteo|rifa|giveaway|ganador|premio)"),
    "MAYOR": re.compile(r"\b(por mayor|al por mayor|mayorista|docena|por cantidad)"),
    "NUEVO_STOCK": re.compile(r"\b(llego|llegaron|nuevo stock|novedades|nueva coleccion|recien llegado|reposicion|stock)"),
    "UNBOXING": re.compile(r"\b(abriendo|unboxing|desempacando|abrimos)"),
    "PEDIDOS": re.compile(r"\b(empacando|pedidos|pedido|preparando pedidos)"),
}
BOLIVIA = re.compile(r"(bolivia|🇧🇴|\bbs\b|bolivianos|\+?591|\bscz\b|\blpz\b|\bcbba\b)")
MIN_PRICE_BS, MAX_PRICE_BS = 0.5, 50_000


def latest_rows() -> tuple[dict[str, dict], dict[str, dict], list[str]]:
    videos: dict[str, dict] = {}
    profiles: dict[str, dict] = {}
    runs = sorted(path for path in RAW.iterdir() if path.is_dir() and re.fullmatch(r"\d{4}-\d{2}-\d{2}", path.name)) if RAW.exists() else []
    for run in runs:
        for row in read_jsonl(run / "videos.jsonl"):
            videos[str(row["id"])] = {**row, "run": run.name}
        for row in read_jsonl(run / "profiles.jsonl"):
            profiles[str(row["handle"])] = {**row, "run": run.name}
    return videos, profiles, [run.name for run in runs]


def classify_account(profile: dict, captions: list[str]) -> dict:
    bio = fold(f"{profile.get('nickname') or ''} {profile.get('bio') or ''}")
    text = " ".join([bio, *captions])
    products: Counter[str] = Counter()
    for product in products_in(bio):
        products[product] += 3
    for caption in captions:
        for product in products_in(caption):
            products[product] += 1
    by_rubro: Counter[str] = Counter()
    for product, weight in products.items():
        if product not in GENERIC_PRODUCTS or len(products) == 1:
            by_rubro[PRODUCT_RUBRO[product]] += weight
    rubro = by_rubro.most_common(1)[0][0] if by_rubro else None
    priced = sum(1 for caption in captions if prices_in(caption))
    selling = priced + sum(1 for caption in captions if TACTICS["ENVIO"].search(caption) or TACTICS["CONTACTO"].search(caption))
    if rubro == "GASTRONOMIA":
        kind = "GASTRONOMIA"
    elif rubro == "ENTRETENIMIENTO" or (rubro is None and re.search(r"(musica|cantante|gamer|gaming|free ?fire|dj\b|show|batalla)", text)):
        kind = "ENTRETENIMIENTO"
    elif rubro and selling:
        kind = "VENTA"
    else:
        kind = None
    places = departments_in(bio) or departments_in(text)
    bolivian = bool(places) or bool(BOLIVIA.search(text))
    foreign = bool(FOREIGN.search(bio)) and not bolivian
    return {
        "kind": kind,
        "rubro": rubro or ("ENTRETENIMIENTO" if kind == "ENTRETENIMIENTO" else None),
        "city": Counter(places).most_common(1)[0][0] if places else None,
        "bolivian": bolivian and not foreign,
    }


def main() -> None:
    key = seller_key()
    videos, profiles, runs = latest_rows()
    if not videos:
        raise SystemExit(f"no hay videos en {RAW}")
    usd = parallel_rate()  # con caché del último valor bueno si Contabo no responde

    captions_by_account: dict[str, list[str]] = defaultdict(list)
    for row in videos.values():
        captions_by_account[row["handle"]].append(fold(words_to_digits(fold(row.get("desc") or ""))))

    accounts_out, videos_out = [], []
    excluded: Counter[str] = Counter()
    hashtags: dict[str, Counter] = defaultdict(Counter)
    included: dict[str, dict] = {}
    for handle, profile in profiles.items():
        info = classify_account(profile, captions_by_account.get(handle, []))
        if not info["bolivian"]:
            excluded["NO_BOLIVIA"] += 1
            continue
        if not info["kind"]:
            excluded["NI_VENTA_NI_ENTRETENIMIENTO"] += 1
            continue
        own = [row for row in videos.values() if row["handle"] == handle and row.get("createTime")]
        dates = sorted(la_paz(row["createTime"] * 1000).strftime("%Y-%m-%d") for row in own)
        seller_id = pseudonym(handle, key)
        included[handle] = {**info, "sellerId": seller_id}
        accounts_out.append({
            "sellerId": seller_id,
            "origin": profile.get("origin") or "LIVE",
            "kind": info["kind"],
            "rubro": info["rubro"] or "SIN_IDENTIFICAR",
            "city": info["city"],
            "followers": profile.get("followers"),
            "hearts": profile.get("hearts"),
            "videoCount": profile.get("videoCount"),
            "videosRead": len(own),
            "firstVideo": dates[0] if dates else None,
            "lastVideo": dates[-1] if dates else None,
        })

    for row in videos.values():
        account = included.get(row["handle"])
        if not account or not row.get("createTime"):
            continue
        caption = fold(words_to_digits(fold(row.get("desc") or "")))
        local = la_paz(row["createTime"] * 1000)
        named = [product for product in products_in(caption) if product not in GENERIC_PRODUCTS]
        product = named[0] if named else None
        rubro = PRODUCT_RUBRO.get(product, account["rubro"] or "SIN_IDENTIFICAR") if product else (account["rubro"] or "SIN_IDENTIFICAR")
        prices = []
        for price in prices_in(caption):
            amount = price["amount"]
            value = amount if price["currency"] == "BOB" else (round(amount * usd, 2) if price["currency"] == "USD" and usd else None)
            if value is not None and MIN_PRICE_BS <= value <= MAX_PRICE_BS and price["explicit"]:
                prices.append(value)
        for tag in row.get("hashtags") or []:
            folded = fold(str(tag))
            if folded and not re.search(r"\d{7,}", folded):
                hashtags[rubro][folded[:40]] += 1
        videos_out.append({
            "videoKey": pseudonym(f"video:{row['id']}", key),
            "sellerId": account["sellerId"],
            "kind": account["kind"],
            "date": local.strftime("%Y-%m-%d"),
            "hour": local.hour,
            "weekday": local.isoweekday(),
            "rubro": rubro,
            "product": product,
            "prices": prices[:5],
            "plays": row.get("plays"),
            "likes": row.get("likes"),
            "comments": row.get("comments"),
            "shares": row.get("shares"),
            "saves": row.get("saves"),
            "duration": row.get("duration"),
            "photo": bool(row.get("imagePost")),
            "ad": bool(row.get("isAd")),
            "tactics": sorted(name for name, pattern in TACTICS.items() if pattern.search(caption)),
            "readOn": row["run"],
        })

    terms = [
        {"rubro": rubro, "term": term, "count": count, "rank": rank}
        for rubro, counter in hashtags.items()
        for rank, (term, count) in enumerate(counter.most_common(25), start=1)
        if count >= 3
    ]
    by_year = Counter(video["date"][:4] for video in videos_out)
    seed = {
        "provenance": {
            "runId": runs[-1],
            "runs": runs,
            "retrievedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "collector": "scripts/social/live/collect-videos.ts",
            "method": (
                "Perfiles públicos de TikTok de vendedores vistos en lives bolivianos y de las cuentas que esos perfiles "
                "sugieren, leídos sin sesión; cada perfil entrega sus videos más recientes (unos 16 a 35)."
            ),
            "usdRate": usd,
        },
        "rubros": [{"code": code, "label": label} for code, label in RUBROS.items()],
        "departments": [{"code": code, "label": label} for code, label in DEPARTMENTS.items()],
        "accounts": accounts_out,
        "videos": videos_out,
        "terms": terms,
        "coverage": {
            "accountsRead": len(profiles),
            "accountsIncluded": len(accounts_out),
            "excludedNotBolivia": excluded["NO_BOLIVIA"],
            "excludedNoActivity": excluded["NI_VENTA_NI_ENTRETENIMIENTO"],
            "videos": len(videos_out),
            "videosByYear": dict(sorted(by_year.items())),
        },
    }
    SEED.write_text(json.dumps(seed, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({**seed["coverage"], "cuentasPorClase": Counter(a["kind"] for a in accounts_out), "dolar": usd}, ensure_ascii=False))


if __name__ == "__main__":
    main()
