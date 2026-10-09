"""Léxico de las ventas en vivo: productos, intenciones, pagos, ciudades y precios.

Es la parte discutible del análisis y por eso vive aparte, como dato. Todo se
aplica sobre texto plegado (`fold`: minúsculas, sin tildes) y con las letras
alargadas recortadas («miiiio» → «mio»).

El chat de un live es corto («mío», «precio?», «talla?»): estas reglas leen la
intención con una sola palabra, que es justo donde un modelo de sentimiento no
tiene de dónde agarrarse. Cada cambio se mide contra el conjunto de oro
(`gold/`) antes de publicarse.
"""

from __future__ import annotations

import re

from live_fold import fold  # noqa: F401  (se reexporta)
from live_products import (  # noqa: F401  (se reexportan)
    GENDER,
    GENERIC_PRODUCTS,
    PRODUCT_RUBRO,
    RUBROS,
    products_in,
)

LEXICON_VERSION = "2026-10-06.1"


# -------------------------------------------------------- señales del chat

SIGNALS: dict[str, re.Pattern[str]] = {
    # «yo» suelto se resuelve aparte (`is_bare_yes`): solo cuenta si el vendedor acaba de ofrecer algo.
    "COMPRA": re.compile(
        r"(^|\s)(mi[o0]+ ?\d+|mia+ ?\d+|escribi prime+ro+|yo primero|esos? llevo|esas? llevo|lo llevo|la llevo|los llevo|las llevo|yo primera|mi[o0]+|mia+|mios|mias|lo quiero|la quiero|los quiero|las quiero|yo quiero|quiero \d|quiero uno|quiero una|"
        r"separame|separa|apartame|aparta|anotame|anota|me lo llevo|me la llevo|reservame|reserva|para mi|"
        r"yo \d|\d+ (unidades|pares|docenas)|x ?\d+\b|me apunto|lo compro|la compro|ya pague|ya le pague|pago ya|damelo|damela|me lo das)(\s|$|[!.?,])"
    ),
    "PRECIO": re.compile(r"(precio|presio|precios|cuanto|cuanto sale|a como|acomo|costo|cuesta|valor|\$\$|pvp|q precio)"),
    "VARIANTE": re.compile(r"\b(talla|tallas|talle|numero|nro|n°|color|colores|hay en|tienes en|tiene en|medida|modelo|tamano|tamanos|otro color|que tallas)\b"),
    "ENVIO": re.compile(r"\b(envio|envios|envian|envias|envia|delivery|llega a|a provincia|encomienda|flota|trufi|entrega|entregas|mandan|mandas|hacen envio|haces envio)\b"),
    "TALLA_COLOR": re.compile(
        r"(\b(tono|talla|nro|numero|n) ?\d{1,2}\b|^(de|en) \d{2}$|\ben (xs|s|m|l|xl|xxl)\b|^(xs|s|m|l|xl|xxl)$|"
        r"\b(negro|negra|blanco|blanca|rojo|roja|azul|cafe|beige|rosado|rosada|plomo|plomito|verde|morado|morada|gris|"
        r"celeste|lila|amarillo|amarilla|fucsia|nude|dorado|plateado|oscuro|clarito|claro)\b)"
    ),
    "CONTACTO": re.compile(r"\b(ya le escribo|te escribo|le escribo|al privado|privado|whatsapp|wsp|wasap|watsap|inbox|dm|tu numero|su numero|escribeme|escribame)\b"),
    "QUE_ES": re.compile(
        r"(^(y |de )?(que|q) (son|es)\b|\b(que|q) (son|es)[\s.?!]*$|para que sirve|como se usa|que material|"
        r"de que material|como funciona)"
    ),
    "PAGO": re.compile(r"\b(qr|transferencia|transfiero|deposito|efectivo|ya le pague|le pague|pagado|ya pague|contra entrega|contraentrega|tigo money|billetera movil|dolares|usdt|binance|tarjeta|yape)\b"),
    "CONFIANZA": re.compile(r"\b(original|originales|replica|imitacion|garantia|estafa|estafadora|no llego|no me llego|seguro|confiable|calidad|fallado)\b"),
    "PRECIO_JUICIO": re.compile(r"\b(caro|carisimo|barato|barata|baratito|oferta|rebaja|descuento|regalado|subio|muy caro|economico)\b"),
    "REGATEO": re.compile(
        r"\b(dame en|damelo en|damela en|dejamelo en|dejame en|deja en|dejelo en|rebajame|rebajeme|una rebajita|"
        r"ultimo precio|en cuanto me (lo )?deja|mas barato|mas baratito|descuentito|yapa|yapita)\b"
    ),
    "MAYOR": re.compile(r"\b(por mayor|al por mayor|mayorista|docena|docenas|por cantidad|al mayor)\b"),
    "UBICACION": re.compile(r"\b(de donde son|de donde es|donde estan|ubicacion|direccion|tienda fisica|donde queda|donde es su tienda|su tienda|que departamento|de que ciudad)\b"),
    "DISPONIBILIDAD": re.compile(r"\b(hay|tienes|tiene|queda|quedan|stock|todavia hay|aun hay|agotado)\b"),
    "MUESTRA": re.compile(r"\b(muestra|muestras|muestran|muestrame|muestre|muestreme|muestrelo|muestrela|mostro|mostrar|mostras|mostra|mostrame|ver mas|abra|abre otra|ensename|ensena|ensene|a ver|de cerca|el de la|la de la)\b"),
    "SALUDO": re.compile(r"\b(hola|buenas|buenos dias|buenas noches|saludos|bendiciones|holi|holis)\b"),
}

BARE_YES = re.compile(r"^(yo|yoo|yo yo|yo!|yo\.|yop|aqui|aca)$")

PAYMENTS: dict[str, re.Pattern[str]] = {
    "QR": re.compile(r"\bqr\b"),
    "TRANSFERENCIA": re.compile(r"\b(transferencia|transfiero|deposito)\b"),
    "EFECTIVO": re.compile(r"\befectivo\b"),
    "CONTRA_ENTREGA": re.compile(r"\b(contra entrega|contraentrega|pago al recibir)\b"),
    "TIGO_MONEY": re.compile(r"\b(tigo money|billetera movil)\b"),
    "DOLARES": re.compile(r"\b(dolar|dolares|usd)\b"),
    "USDT": re.compile(r"\b(usdt|binance|cripto|tether)\b"),
    "TARJETA": re.compile(r"\btarjeta\b"),
}

DOLLAR_TALK = re.compile(r"\b(dolar|dolares|paralelo|tipo de cambio|subio el dolar|precio viejo|no hay dolares)\b")

# ------------------------------------------------------------ ciudades

DEPARTMENTS = {
    "LPZ": "La Paz", "SCZ": "Santa Cruz", "CBB": "Cochabamba", "ORU": "Oruro", "PTS": "Potosí",
    "CHQ": "Chuquisaca", "TJA": "Tarija", "BEN": "Beni", "PND": "Pando",
}
_CITY_WORDS: dict[str, tuple[str, ...]] = {
    "LPZ": ("la paz", "el alto", "lpz", "viacha", "achacachi", "caranavi", "copacabana", "laz paz"),
    "SCZ": ("santa cruz", "scz", "montero", "warnes", "cotoca", "camiri", "san ignacio", "puerto quijarro", "puerto suarez", "la guardia", "yapacani", "san julian", "santa"),
    "CBB": ("cochabamba", "cbba", "cocha", "quillacollo", "sacaba", "tiquipaya", "colcapirhua", "vinto", "punata", "chapare", "villa tunari", "ivirgarzama"),
    "ORU": ("oruro", "challapata", "huanuni", "caracollo"),
    "PTS": ("potosi", "uyuni", "tupiza", "villazon", "llallagua", "villa imperial"),
    "CHQ": ("sucre", "chuquisaca", "monteagudo", "camargo"),
    "TJA": ("tarija", "yacuiba", "bermejo", "villamontes", "chaco"),
    "BEN": ("beni", "trinidad", "riberalta", "guayaramerin", "rurrenabaque", "san borja"),
    "PND": ("pando", "cobija"),
}
_CITY_PATTERN = re.compile(
    r"\b(" + "|".join(sorted((re.escape(w) for ws in _CITY_WORDS.values() for w in ws), key=len, reverse=True)) + r")\b"
)
_CITY_DEPARTMENT = {word: dept for dept, words in _CITY_WORDS.items() for word in words}
# «santa» sola solo vale como ciudad en el chat («saludos desde santa»), nunca en «santa clara»
_SANTA_FALSE = re.compile(r"\bsanta (clara|maria|rosa|teresa|ana|fe|barbara|claus)\b")

FOREIGN = re.compile(r"\b(peru|lima|soles|argentina|chile|paraguay|guatemala|mexico|colombia|ecuador|venezuela|brasil)\b")


def departments_in(text: str) -> list[str]:
    if _SANTA_FALSE.search(text):
        text = _SANTA_FALSE.sub(" ", text)
    return [_CITY_DEPARTMENT[match.group(1)] for match in _CITY_PATTERN.finditer(text)]


SELLER_PLACE = re.compile(
    r"\b(somos de|estamos en|desde|ubicados en|tienda en|aqui en|enviamos desde|en la ciudad de)\s+((?:\w+\s?){1,3})"
)

# -------------------------------------------------------------- precios

_NUMBER_WORDS = {
    "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8,
    "nueve": 9, "diez": 10, "once": 11, "doce": 12, "quince": 15, "veinte": 20, "treinta": 30, "cuarenta": 40,
    "cincuenta": 50, "sesenta": 60, "setenta": 70, "ochenta": 80, "noventa": 90, "cien": 100, "ciento": 100,
    "doscientos": 200, "trescientos": 300, "cuatrocientos": 400, "quinientos": 500, "mil": 1000,
}

_NUMBER_WORDS.update(
    {
        "trece": 13, "catorce": 14, "dieciseis": 16, "diecisiete": 17, "dieciocho": 18, "diecinueve": 19,
        "veintiuno": 21, "veintidos": 22, "veintitres": 23, "veinticuatro": 24, "veinticinco": 25,
        "veintiseis": 26, "veintisiete": 27, "veintiocho": 28, "veintinueve": 29,
    }
)
_NUMBER_ALTERNATION = "|".join(sorted(_NUMBER_WORDS, key=len, reverse=True))
_NUMBER_RUN = re.compile(rf"\b(?:{_NUMBER_ALTERNATION})(?:\s(?:y\s)?(?:{_NUMBER_ALTERNATION}))*\b")


def words_to_digits(text: str) -> str:
    """«ciento veinte bolivianos» → «120 bolivianos». Whisper a veces escribe el número en letras."""

    def convert(match: re.Match[str]) -> str:
        words = [w for w in match.group(0).split() if w != "y"]
        if len(words) == 1 and words[0] in ("un", "uno", "una"):
            return match.group(0)
        total, current = 0, 0
        for word in words:
            value = _NUMBER_WORDS[word]
            if value == 1000:
                total += (current or 1) * 1000
                current = 0
            else:
                current += value
        return str(total + current)

    return _NUMBER_RUN.sub(convert, text)


_AMOUNT = r"\d{1,5}(?:[.,]\d{1,2})?"
EXPLICIT_PRICE = re.compile(
    rf"(?:(?P<pre>bs\.?|bolivianos?|\$|usd|us\$)\s?(?P<n1>{_AMOUNT}))"
    rf"|(?:(?P<n2>{_AMOUNT})\s?(?P<post>bs\b\.?|bolivianos?|pesos|pesitos|dolares|dolar|usd|soles|lucas|bolis))"
)
CUED_PRICE = re.compile(r"\b(?:a|en|por|precio|vale|cuesta|sale|solo|esta a|estan a|a solo)\s(?P<n3>\d{1,5})(?=\s|$|[!.,])")
UNIT = re.compile(r"\b(docena|par|pares|unidad|c/u|cada uno|cada una|por mayor|paquete|kilo|metro|caja)\b")


def _currency(marker: str) -> str:
    if marker in ("$", "usd", "us$", "dolares", "dolar"):
        return "USD"
    if marker == "soles":
        return "PEN"
    return "BOB"


def prices_in(text: str) -> list[dict]:
    """Precios en un texto plegado: monto, moneda y la unidad dicha junto al número.

    Primero los montos con moneda («120 bolivianos», «bs 35», «10 pesitos»); después los
    que solo traen una señal de precio («a 39», «precio 50»), si no pisan a uno anterior.
    """
    found: list[dict] = []
    taken: list[tuple[int, int]] = []
    for pattern, explicit in ((EXPLICIT_PRICE, True), (CUED_PRICE, False)):
        for match in pattern.finditer(text):
            start, end = match.span()
            if any(start < b and end > a for a, b in taken):
                continue
            groups = match.groupdict()
            raw = groups.get("n1") or groups.get("n2") or groups.get("n3")
            if not raw:
                continue
            marker = (groups.get("pre") or groups.get("post") or "").strip(". ")
            before = re.split(r"[,.;!?]", text[max(0, start - 14): start])[-1]
            after = re.split(r"[,.;!?]", text[end: end + 14])[0]
            near = f"{before} {after}"
            unit_match = UNIT.search(near)
            taken.append((start, end))
            found.append(
                {
                    "amount": float(raw.replace(",", ".")),
                    "currency": _currency(marker) if explicit else "BOB",
                    "unit": unit_match.group(1) if unit_match else None,
                    "explicit": explicit,
                    "span": (start, end),
                }
            )
    return sorted(found, key=lambda price: price["span"][0])


# ------------------------------------------------------------ emociones

EMOJI_EMOTION = {
    "joy": "😍🥰😊😁😄😃🤩❤♥💖💕💗💓💞💘🤍🖤💜💙💚💛🧡🩷🔥👏🙌🎉✨🥳😻💯👍😎🙏",
    "sadness": "😢😭😞😔💔🥺",
    "anger": "😡😠🤬👎",
    "surprise": "😮😱😲🤯😯",
    "disgust": "🤢🤮😒🙄",
    "fear": "😨😰😧",
}
AMBIGUOUS_EMOJI = "😂🤣😅😆"


def emoji_emotion(text: str) -> str | None:
    """Emoción de un mensaje hecho solo de emojis. 😂 queda ambiguo (risa o burla)."""
    if any(ch.isalpha() for ch in text):
        return None
    votes: dict[str, int] = {}
    for ch in text:
        for emotion, chars in EMOJI_EMOTION.items():
            if ch in chars:
                votes[emotion] = votes.get(emotion, 0) + 1
    if not votes:
        return None
    return max(votes, key=lambda emotion: votes[emotion])


# ------------------------------------------------------------- frases

PHONE = re.compile(r"\d{7,}")
HANDLE = re.compile(r"@\w|https?://|www\.")


def phrase_key(text: str) -> str | None:
    """La forma canónica de un comentario para contarlo como frase repetida, o None si no se publica."""
    if HANDLE.search(text) or PHONE.search(text):
        return None
    folded = fold(text)
    folded = re.sub(r"[^\w\s]", " ", folded)
    folded = re.sub(r"\d+", "#", folded)
    words = folded.split()
    if not words or len(words) > 8:
        return None
    if all(word == "#" for word in words):
        return None
    return " ".join(words)
