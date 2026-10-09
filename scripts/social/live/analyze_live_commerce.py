"""Resume las capturas de lives en la semilla `tiktok-live.json`.

Lee todas las noches de `artifacts/live-raw/<AAAA-MM-DD>/` (lo que escribieron
`collect-live.ts` y `live_media.py`) y escribe solo agregados:

- `rooms`: una fila por live observado, con el vendedor en seudónimo, rubro,
  producto principal, ciudad, hora, audiencia, y los CONTEOS de cada señal del
  chat (compra, precio, talla, envío, pago...), de emociones y de regalos. El
  tablero suma conteos sobre lo que el lector filtra: por eso no hay tasas aquí.
- `prices`: cada precio dicho o mostrado, con su producto y su fuente.
- `phrases`: las frases que repitieron al menos 5 personas distintas en al menos
  3 lives (decisión del 6-oct-2026: frases repetidas, nunca citas).
- `terms`: lo más repetido por rubro en el chat (`AUDIENCE`) y en la voz del
  vendedor (`SELLER`).
- `coverage`: cuánto se vio, cuánto se clasificó y cuánto quedó como residuo.

Cada mensaje se clasifica una sola vez aquí; las vistas solo suman (lección de
la migración 0093). Nada de quien comenta sale de este proceso: el chat crudo ya
llega con el autor en seudónimo de corrida.

    python scripts/social/live/analyze_live_commerce.py
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "company"))

from live_lexicon import DEPARTMENTS, LEXICON_VERSION, PRODUCT_RUBRO, RUBROS  # noqa: E402
from live_load import clip, viewer_curve, la_paz, load_run, parallel_rate, pseudonym, run_coverage, seller_key, size_of  # noqa: E402
from live_reading import EMOTIONS, RoomReading, emotion_pass, outliers_out, top_terms  # noqa: E402

ROOT = HERE.parents[2]
RAW = ROOT / "artifacts" / "live-raw"
SEED = ROOT / "src" / "database" / "seeds" / "boot" / "tiktok-live.json"
PHRASE_PEOPLE = 5
PHRASE_LIVES = 3


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", default="", help="noches separadas por coma; por defecto todas")
    args = parser.parse_args()
    key = seller_key()
    runs = sorted(
        path for path in RAW.iterdir()
        if path.is_dir() and re.fullmatch(r"\d{4}-\d{2}-\d{2}", path.name)
        and (not args.runs or path.name in args.runs.split(","))
    )
    if not runs:
        raise SystemExit(f"no hay corridas en {RAW}")
    usd = parallel_rate()  # con caché del último valor bueno si Contabo no responde

    readings: list[RoomReading] = []
    coverage: dict[str, dict] = {}
    for run_dir in runs:
        rooms = load_run(run_dir)
        coverage[run_dir.name] = run_coverage(run_dir, rooms)
        for room in rooms.values():
            if not room.get("start") or room["start"].get("wall"):
                continue
            reading = RoomReading(room, key)
            reading.read_seller()
            reading.read_chat()
            readings.append(reading)
    emotion_pass(readings)

    rooms_out: list[dict] = []
    prices_out: list[dict] = []
    phrase_people: dict[str, set] = defaultdict(set)
    phrase_rooms: dict[str, set] = defaultdict(set)
    phrase_rubro: dict[str, Counter] = defaultdict(Counter)
    phrase_emotion: dict[str, Counter] = defaultdict(Counter)
    phrase_tags: dict[str, Counter] = defaultdict(Counter)
    audience_terms: dict[str, Counter] = defaultdict(Counter)
    seller_terms: dict[str, Counter] = defaultdict(Counter)

    from social_text import STOP

    for reading in readings:
        start = reading.start
        begin = reading.start_ms()
        local = la_paz(begin)
        rubro, product, products = reading.rubro()
        city, city_source = reading.place()
        bolivian, foreign = reading.is_bolivian()
        commerce = (reading.signals["COMPRA"] + reading.signals["PRECIO"] >= 2) or bool(reading.prices)
        stats = [row for row in reading.room.get("stats", []) if row.get("viewers") is not None]
        viewers = [row["viewers"] for row in stats] + ([start["viewers"]] if start.get("viewers") is not None else [])
        events = Counter(row.get("kind") for row in reading.room.get("events", []))
        gift_units = sum(int(row.get("count") or 1) for row in reading.room.get("events", []) if row.get("kind") == "gift")
        minutes = (reading.end or {}).get("minutes") or max(1, round(len(stats)))
        authors = {message["author"] for message in reading.messages if message["author"]}
        buyers = {message["author"] for message in reading.messages if message["author"] and "COMPRA" in message["tags"]}
        room_key = pseudonym(f"room:{reading.room['roomId']}", key)
        if foreign and not bolivian:
            status = "EXTRANJERO"
        elif commerce:
            status = "VENTA"
        elif rubro == "ENTRETENIMIENTO" or (start.get("fun") or 0) > 0:
            status = "ENTRETENIMIENTO"
        else:
            status = "SIN_VENTA"
        rooms_out.append(
            {
                "roomKey": room_key,
                "run": reading.room["run"],
                "date": local.strftime("%Y-%m-%d"),
                "hour": local.hour,
                "weekday": local.isoweekday(),
                "sellerId": start.get("sellerId") or pseudonym(start.get("handle", ""), key),
                "status": status,
                "rubro": rubro or "SIN_IDENTIFICAR",
                "product": product,
                "products": products,
                "city": city,
                "citySource": city_source,
                "bolivia": bolivian,
                "size": size_of(max(viewers) if viewers else None),
                "minutes": int(minutes),
                "endReason": (reading.end or {}).get("reason") or "SIN_CIERRE",
                "viewersPeak": max(viewers) if viewers else None,
                "viewersMedian": int(statistics.median(viewers)) if viewers else None,
                "entries": max((row.get("entries") or 0) for row in stats) if stats else start.get("entries"),
                "messages": len(reading.messages),
                "authors": len(authors),
                "buyers": len(buyers),
                "signals": dict(reading.signals),
                "payments": dict(reading.payments),
                "destinations": dict(reading.destinations),
                "emotions": {name: reading.emotions[name] for name in (*EMOTIONS, "apt", "ironic") if reading.emotions[name]},
                "polarity": dict(reading.polarity),
                "gifts": gift_units,
                "follows": events["follow"],
                "shares": events["share"],
                "likes": events["like"],
                "curve": viewer_curve(stats, start.get("liveSince")),
                "dollarTalk": reading.signals["DOLAR"],
                "speechSegments": len(reading.room.get("speech", [])),
                "screenReads": len(reading.room.get("screen", [])),
                "prices": len(reading.prices),
            }
        )
        effective_rubro = rubro or "SIN_IDENTIFICAR"
        for price in reading.prices:
            amount = price["amount"]
            if price["currency"] == "USD":
                price_bs = round(amount * usd, 2) if usd else None
            elif price["currency"] == "BOB":
                price_bs = amount
            else:
                price_bs = None
            product_name = price["product"] or product
            prices_out.append(
                {
                    "roomKey": room_key,
                    "date": la_paz(price["t"] or begin).strftime("%Y-%m-%d"),
                    "rubro": PRODUCT_RUBRO.get(product_name or "", effective_rubro) if price["product"] else effective_rubro,
                    "product": product_name,
                    "productSource": "TEXTO" if price["product"] else ("SALA" if product_name else "NINGUNO"),
                    "amount": amount,
                    "currency": price["currency"],
                    "priceBs": price_bs,
                    "unit": price["unit"],
                    "source": price["source"],
                    "explicit": price["explicit"],
                    "city": city,
                }
            )
        if status != "VENTA":
            continue
        for message in reading.messages:
            phrase = message.get("phrase")
            if phrase and message["author"]:
                phrase_people[phrase].add(message["author"])
                phrase_rooms[phrase].add(room_key)
                phrase_rubro[phrase][effective_rubro] += 1
                if message.get("emotion"):
                    phrase_emotion[phrase][message["emotion"]] += 1
                for tag in message["tags"]:
                    phrase_tags[phrase][tag] += 1
            for word in re.findall(r"[a-zñ]{3,}", message["text"]):
                if word not in STOP:
                    audience_terms[effective_rubro][word] += 1
        for text in reading.seller_texts:
            for word in re.findall(r"[a-zñ]{4,}", text):
                if word not in STOP:
                    seller_terms[effective_rubro][word] += 1

    phrases_out = []
    for phrase, people in phrase_people.items():
        lives = phrase_rooms[phrase]
        if len(people) < PHRASE_PEOPLE or len(lives) < PHRASE_LIVES:
            continue
        phrases_out.append(
            {
                "phrase": clip(phrase, 80),
                "people": len(people),
                "lives": len(lives),
                "rubro": phrase_rubro[phrase].most_common(1)[0][0],
                "emotion": phrase_emotion[phrase].most_common(1)[0][0] if phrase_emotion[phrase] else None,
                "signal": phrase_tags[phrase].most_common(1)[0][0] if phrase_tags[phrase] else None,
            }
        )
    phrases_out.sort(key=lambda row: (-row["people"], row["phrase"]))

    terms_out = top_terms({"AUDIENCE": audience_terms, "SELLER": seller_terms})

    prices_out = outliers_out(prices_out)
    for run in coverage:
        own = [room for room in rooms_out if room["run"] == run]
        messages = sum(room["messages"] for room in own)
        signaled = sum(
            1
            for reading in readings
            if reading.room["run"] == run
            for message in reading.messages
            if message["tags"] - {"SALUDO"}
        )
        coverage[run].update(
            {
                "roomsCommerce": sum(1 for room in own if room["status"] == "VENTA"),
                "roomsNoCommerce": sum(1 for room in own if room["status"] == "SIN_VENTA"),
                "roomsEntertainment": sum(1 for room in own if room["status"] == "ENTRETENIMIENTO"),
                "roomsForeign": sum(1 for room in own if room["status"] == "EXTRANJERO"),
                "roomsUnidentified": sum(1 for room in own if room["rubro"] == "SIN_IDENTIFICAR"),
                "messages": messages,
                "messagesWithSignal": signaled,
                "messagesApt": sum(room["emotions"].get("apt", 0) for room in own),
                "speechSegments": sum(room["speechSegments"] for room in own),
                "screenReads": sum(room["screenReads"] for room in own),
                "prices": sum(1 for price in prices_out if any(price["roomKey"] == room["roomKey"] for room in own)),
                "minutes": sum(room["minutes"] for room in own),
            }
        )

    seed = {
        "provenance": {
            "runId": runs[-1].name,
            "runs": [run.name for run in runs],
            "retrievedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "collector": "scripts/social/live/collect-live.ts",
            "method": (
                "Lives públicos de TikTok vistos sin sesión desde una conexión residencial en Bolivia; chat leído de la "
                "página, voz transcrita completa y texto en pantalla leído del stream; solo agregados."
            ),
            "speechModel": "faster-whisper small (CTranslate2)",
            "sentimentModel": "pysentimiento RoBERTuito (ONNX)",
            "ocrModel": "RapidOCR (ONNX)",
            "lexiconVersion": LEXICON_VERSION,
            "usdRate": usd,
            "phraseThreshold": {"people": PHRASE_PEOPLE, "lives": PHRASE_LIVES},
        },
        "rubros": [{"code": code, "label": label} for code, label in RUBROS.items()],
        "departments": [{"code": code, "label": label} for code, label in DEPARTMENTS.items()],
        "rooms": rooms_out,
        "prices": prices_out,
        "phrases": phrases_out[:400],
        "terms": terms_out,
        "coverage": [{"run": run, **values} for run, values in coverage.items()],
    }
    SEED.write_text(json.dumps(seed, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    sold = [room for room in rooms_out if room["status"] == "VENTA"]
    total_messages = sum(room["messages"] for room in rooms_out)
    with_signal = sum(cov.get("messagesWithSignal", 0) for cov in coverage.values())
    print(
        json.dumps(
            {
                "corridas": len(runs),
                "lives": len(rooms_out),
                "deVenta": len(sold),
                "sinRubro": sum(1 for room in sold if room["rubro"] == "SIN_IDENTIFICAR"),
                "mensajes": total_messages,
                "conSenal": with_signal,
                "residuoMensajesPct": round(100 * (1 - with_signal / total_messages), 1) if total_messages else None,
                "aptosEmocion": sum(room["emotions"].get("apt", 0) for room in rooms_out),
                "precios": len(prices_out),
                "frases": len(phrases_out),
                "dolarParalelo": usd,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
