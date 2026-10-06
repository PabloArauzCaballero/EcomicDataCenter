"""Pruebas del léxico de las ventas en vivo, con frases reales de la primera noche (6-oct-2026).

    python -m pytest scripts/social/live/test_live_lexicon.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from live_lexicon import (  # noqa: E402
    BARE_YES,
    SIGNALS,
    departments_in,
    emoji_emotion,
    fold,
    phrase_key,
    prices_in,
    products_in,
    words_to_digits,
)


def norm(text: str) -> str:
    return fold(words_to_digits(fold(text)))


def tags(text: str) -> set[str]:
    folded = norm(text)
    return {name for name, pattern in SIGNALS.items() if pattern.search(folded)}


def test_prices_take_the_currency_and_the_unit_of_their_own_clause():
    found = prices_in(norm("Este pantalón jean está a ciento veinte bolivianos, la docena a treinta y cinco"))
    assert [(p["amount"], p["currency"], p["unit"], p["explicit"]) for p in found] == [
        (120.0, "BOB", None, True),
        (35.0, "BOB", "docena", False),
    ]


def test_pesitos_are_bolivianos_and_dollars_are_not():
    assert prices_in(norm("la funda mío 10 pesitos"))[0]["currency"] == "BOB"
    assert prices_in(norm("este celular a 150 dólares"))[0]["currency"] == "USD"
    assert prices_in(norm("bs. 25 el par"))[0]["unit"] == "par"


def test_a_bare_number_is_not_a_price():
    assert prices_in(norm("249 case, 249")) == []


def test_short_chat_lines_carry_the_intent():
    assert "COMPRA" in tags("mío 10")
    assert "COMPRA" in tags("Miiiio")
    assert "PRECIO" in tags("Las digas a como?")
    assert "PRECIO" in tags("Esas estrellitas cuánto?")
    assert "ENVIO" in tags("Hace envíos La Paz?")
    assert "MAYOR" in tags("por mayor")
    assert "UBICACION" in tags("De dónde son?")
    assert "MUESTRA" in tags("el morocho me muestras")
    assert tags("Gracias") == set()


def test_a_lone_yes_is_left_to_the_offer_rule():
    assert BARE_YES.match(norm("yo"))
    assert "COMPRA" not in tags("yo")
    assert not BARE_YES.match(norm("yo también saludos"))


def test_products_and_places():
    assert products_in(norm("precio de los gogos corbatita en tira")) == ["gogo"]
    assert products_in(norm("Por docena luces Led")) == ["luces led"]
    assert departments_in(norm("somos de Santa Cruz, envíos a Cocha y El Alto")) == ["SCZ", "CBB", "LPZ"]
    assert departments_in(norm("la santa maría")) == []


def test_emoji_only_messages_and_the_ambiguous_laugh():
    assert emoji_emotion("😍🔥") == "joy"
    assert emoji_emotion("😂😂") is None
    assert emoji_emotion("precio 😍") is None


def test_phrases_never_keep_a_handle_or_a_phone():
    assert phrase_key("Precio!!! 🥰") == "precio"
    assert phrase_key("escribime al 76543210") is None
    assert phrase_key("@alguien mira esto") is None
    assert phrase_key("mio 2") == "mio #"


def test_sizes_colors_and_closing_in_private():
    assert "TALLA_COLOR" in tags("tono 5")
    assert "TALLA_COLOR" in tags("De 43")
    assert "TALLA_COLOR" in tags("En L")
    assert "TALLA_COLOR" in tags("el body café oscuro")
    assert "CONTACTO" in tags("Okis, ya le escribo")
    assert "QUE_ES" in tags("que son?")


def test_second_night_residue():
    assert "COMPRA" in tags("mio6")
    assert "COMPRA" in tags("mi0 35")
    assert "COMPRA" in tags("Escribí primero case...")
    assert "REGATEO" in tags("case los bluey dámelo en 40 los dos")
    assert "PAGO" in tags("case Ya le pagué todos los llaveros")
    assert "MUESTRA" in tags("muestrelo")
    assert "UBICACION" in tags("o en dónde es su tienda?")
    assert "REGATEO" not in tags("más o menos")
    assert products_in(norm("soldaditos porfa")) == ["soldadito"]
    assert emoji_emotion("🤍🤍🤍") == "joy"


def test_the_virtual_list_does_not_count_a_message_twice():
    from live_load import dedupe_chat

    rows = [
        {"t": 0, "author": "a", "text": "precio"},
        {"t": 3_000, "author": "a", "text": "precio"},
        {"t": 3_000, "author": "b", "text": "precio"},
        {"t": 200_000, "author": "a", "text": "precio"},
    ]
    assert [(row["author"], row["t"]) for row in dedupe_chat(rows)] == [("a", 0), ("b", 3_000), ("a", 200_000)]


def test_first_gold_measurement():
    assert "COMPRA" in tags("mioo 16")
    assert "COMPRA" in tags("esos llevo yo")
    assert "COMPRA" in tags("yo igual escribí primeeroo paaraa lo dell baarril")
    assert "PRECIO_JUICIO" not in tags("no.veo su cara amiga w")
    assert "QUE_ES" not in tags("Pcreo que es un músico pero no estoy segura")
    assert "QUE_ES" in tags("esa manzana que es")
    assert "QUE_ES" in tags("Y DEMI QUE ES.????")
    assert "QUE_ES" in tags("que son?")
