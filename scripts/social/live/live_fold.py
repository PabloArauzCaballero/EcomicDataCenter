"""El plegado de texto que comparten el léxico y la lista de productos."""

from __future__ import annotations

import re
import unicodedata


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"(.)\1{2,}", r"\1", text)  # «miiiio» → «mio», «preciooo» → «precio»
    return re.sub(r"\s+", " ", text).strip()
