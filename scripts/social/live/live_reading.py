"""La lectura de un live: qué ofrece el vendedor (voz, pantalla, título) y qué pide el
chat. Cada mensaje se clasifica una sola vez, aquí."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import datetime

from live_lexicon import (
    BARE_YES,
    DOLLAR_TALK,
    FOREIGN,
    GENDER,
    GENERIC_PRODUCTS,
    PAYMENTS,
    PRODUCT_RUBRO,
    SELLER_PLACE,
    SIGNALS,
    departments_in,
    emoji_emotion,
    fold,
    phrase_key,
    prices_in,
    products_in,
    words_to_digits,
)

EMOTIONS = ("joy", "sadness", "anger", "surprise", "disgust", "fear", "others")
FRICTION = re.compile(r"\b(caro|cara|carisimo|carisima|muy caro|subio|exagerado|abuso)\b")
DISTRUST = re.compile(r"\b(estafa|estafadora|estafador|no llego|no me llego|replica|imitacion|fallado|mentira|truchos?)\b")


# -------------------------------------------------------------- análisis


class RoomReading:
    def __init__(self, room: dict, key: bytes) -> None:
        self.room = room
        self.start = room.get("start") or {}
        self.end = room.get("end") or {}
        self.key = key
        self.signals: Counter[str] = Counter()
        self.payments: Counter[str] = Counter()
        self.destinations: Counter[str] = Counter()
        self.products: Counter[str] = Counter()
        self.emotions: Counter[str] = Counter()
        self.polarity: Counter[str] = Counter()
        self.prices: list[dict] = []
        self.audience_texts: list[str] = []
        self.seller_texts: list[str] = []
        self.messages: list[dict] = []
        self.offers: list[int] = []

    # --- oferta del vendedor: voz, pantalla, título

    def read_seller(self) -> None:
        title = fold(words_to_digits(fold(self.start.get("title") or "")))
        bio = fold(self.start.get("bio") or "")
        nickname = fold(self.start.get("nickname") or "")
        for product in products_in(title):
            self.products[product] += 3
        for product in products_in(bio):
            self.products[product] += 1
        for price in prices_in(title):
            self.add_price(price, title, "TITLE", self.start_ms(), products_in(title))
        last_product: tuple[int, str] | None = None
        for segment in self.room.get("speech", []):
            text = fold(words_to_digits(fold(segment.get("text", ""))))
            if not text or segment.get("noSpeech", 0) > 0.8:
                continue
            self.seller_texts.append(text)
            named = products_in(text)
            for product in named:
                self.products[product] += 2
            if named:
                last_product = (segment["t0"], named[-1])
            found = prices_in(text)
            if found or re.search(r"quien (quiere|lleva)|para quien|mio|reserv", text):
                self.offers.append(segment["t0"])
            for price in found:
                fallback = [last_product[1]] if last_product and segment["t0"] - last_product[0] < 20_000 else []
                self.add_price(price, text, "SPEECH", segment["t0"], named or fallback)
        for read in self.room.get("screen", []):
            text = fold(words_to_digits(fold(" ".join(line["text"] for line in read.get("lines", [])))))
            for product in products_in(text):
                self.products[product] += 1
            for price in prices_in(text):
                if price["explicit"]:
                    self.add_price(price, text, "SCREEN", read["t"], products_in(text))
        self.offers.sort()
        self.title, self.bio, self.nickname = title, bio, nickname

    def start_ms(self) -> int:
        stamp = self.start.get("at")
        return int(datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp() * 1000) if stamp else 0

    def add_price(self, price: dict, text: str, source: str, t: int, named: list[str]) -> None:
        start, _ = price["span"]
        product = None
        named = [name for name in named if name not in GENERIC_PRODUCTS]
        if named:
            # el producto más cercano al número dentro del mismo texto
            positions = [(abs(text.find(name) - start), name) for name in named if text.find(name) >= 0]
            product = min(positions)[1] if positions else named[-1]
        self.prices.append(
            {
                "amount": price["amount"],
                "currency": price["currency"],
                "unit": price["unit"],
                "explicit": price["explicit"],
                "source": source,
                "product": product,
                "t": t,
            }
        )

    # --- demanda: el chat

    def read_chat(self) -> None:
        host_name = self.nickname
        for message in self.room.get("chat", []):
            raw = message.get("text", "")
            text = fold(words_to_digits(fold(raw)))
            if not text:
                continue
            if message.get("host"):
                self.seller_texts.append(text)
                for price in prices_in(text):
                    self.add_price(price, text, "HOST_CHAT", message["t"], products_in(text))
                continue
            tags = {name for name, pattern in SIGNALS.items() if pattern.search(text)}
            if BARE_YES.match(text) and self.recent_offer(message["t"]):
                tags.add("COMPRA")
            if products_in(text):
                tags.add("PRODUCTO")
            if "TALLA_COLOR" in tags:
                tags.discard("TALLA_COLOR")
                tags.add("VARIANTE")
            if FRICTION.search(text):
                tags.add("FRICCION")
            if DISTRUST.search(text):
                tags.add("DESCONFIANZA")
            if DOLLAR_TALK.search(text):
                tags.add("DOLAR")
            for tag in tags:
                self.signals[tag] += 1
            for name, pattern in PAYMENTS.items():
                if pattern.search(text):
                    self.payments[name] += 1
            places = departments_in(text)
            if places and ("ENVIO" in tags or re.search(r"\b(a|para|hasta|llega a|desde)\s", text)):
                for place in places:
                    self.destinations[place] += 1
            for product in products_in(text):
                self.products[product] += 1
            self.audience_texts.append(text)
            self.messages.append(
                {
                    "author": message.get("author"),
                    "raw": raw,
                    "text": text,
                    "tags": tags,
                    "phrase": phrase_key(raw) if host_name not in fold(raw) or not host_name else None,
                }
            )

    def recent_offer(self, t: int) -> bool:
        return any(0 <= t - offer <= 60_000 for offer in self.offers[-50:])

    # --- quién vende, dónde y qué

    def place(self) -> tuple[str | None, str | None]:
        for source, text in (("PERFIL", f"{self.bio} {self.title} {self.nickname}"),):
            found = departments_in(text)
            if found:
                return Counter(found).most_common(1)[0][0], source
        said: Counter[str] = Counter()
        for text in self.seller_texts:
            for match in SELLER_PLACE.finditer(text):
                said.update(departments_in(match.group(0)))
        if said:
            return said.most_common(1)[0][0], "VOZ"
        return None, None

    def rubro(self) -> tuple[str | None, str | None, list[dict]]:
        if not self.products:
            return None, None, []
        by_rubro: Counter[str] = Counter()
        for product, weight in self.products.items():
            by_rubro[PRODUCT_RUBRO[product]] += weight
        rubro, top = by_rubro.most_common(1)[0]
        total = sum(by_rubro.values())
        if rubro == "ROPA_GENERAL":
            haystack = " ".join([self.title, self.bio, *self.seller_texts[:200]])
            genders = {code: len(pattern.findall(haystack)) for code, pattern in GENDER.items()}
            best = max(genders, key=lambda code: genders[code])
            if genders[best] >= 2:
                rubro = best
        mixed = top / total < 0.5 and total >= 6
        products = [
            {"product": product, "weight": weight, "rubro": PRODUCT_RUBRO[product]}
            for product, weight in self.products.most_common(5)
        ]
        main = next((item["product"] for item in products if item["product"] not in GENERIC_PRODUCTS), None)
        return ("MIXTO" if mixed else rubro), main, products

    def is_bolivian(self) -> tuple[bool, bool]:
        texts = " ".join([self.title, self.bio, self.nickname, *self.seller_texts[:300]])
        bolivia = bool(departments_in(texts)) or bool(re.search(r"\bbolivia|\bbs\b|bolivianos|pesitos|\+591", texts))
        bolivia = bolivia or any(price["currency"] == "BOB" and price["explicit"] for price in self.prices)
        foreign = bool(FOREIGN.search(f"{self.title} {self.bio}")) or any(price["currency"] == "PEN" for price in self.prices)
        return bolivia, foreign


def emotion_pass(readings: list[RoomReading]) -> None:
    """Emoción y polaridad de los mensajes aptos: ≥3 palabras con letras, o solo emojis con valor claro."""
    apt: list[tuple[RoomReading, dict]] = []
    texts: list[str] = []
    for reading in readings:
        for message in reading.messages:
            words = [word for word in re.findall(r"[a-zñ]+", message["text"]) if len(word) > 1]
            if len(words) >= 3:
                apt.append((reading, message))
                texts.append(message["raw"])
            else:
                emotion = emoji_emotion(message["raw"].strip())
                if emotion:
                    message["emotion"] = emotion
                    reading.emotions[emotion] += 1
                    reading.emotions["apt"] += 1
    if not texts:
        return
    from sentiment_onnx import Classifier

    classifier = Classifier()
    results: list[dict] = []
    for start in range(0, len(texts), 256):
        results += classifier.classify(texts[start: start + 256])
    for (reading, message), result in zip(apt, results):
        emotion = result.get("emotion") or "others"
        message["emotion"] = emotion
        reading.emotions[emotion] += 1
        reading.emotions["apt"] += 1
        if result.get("ironic"):
            reading.emotions["ironic"] += 1
        polarity = result.get("polarity")
        if polarity:
            reading.polarity[polarity] += 1


def outliers_out(prices: list[dict]) -> list[dict]:
    """Fuera los montos imposibles y, con muestra suficiente, lo que cae fuera de [P1, P99] de su producto."""
    kept = [price for price in prices if price["priceBs"] is not None and 0.5 <= price["priceBs"] <= 50_000]
    by_product: dict[str, list[float]] = defaultdict(list)
    for price in kept:
        by_product[price["product"] or ""].append(price["priceBs"])
    bounds = {}
    for product, values in by_product.items():
        if len(values) >= 20:
            ordered = sorted(values)
            bounds[product] = (ordered[int(len(ordered) * 0.01)], ordered[int(len(ordered) * 0.99) - 1])
    return [
        price
        for price in kept
        if (price["product"] or "") not in bounds
        or bounds[price["product"] or ""][0] <= price["priceBs"] <= bounds[price["product"] or ""][1]
    ]
