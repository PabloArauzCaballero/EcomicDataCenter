"""Palabras, bigramas, hashtags y emojis más repetidos de un conjunto de textos.

Se cuenta sobre la forma plegada (minúsculas y sin tildes) para que «Promoción»
y «promocion» sean la misma palabra, y se muestra la forma más frecuente con
que apareció. Se descartan URLs, @menciones, números, palabras de menos de tres
letras y dos listas de palabras vacías: la del español y la de las redes
(«jaja», «link», «bio», «dm»…), que de otro modo encabezarían toda empresa.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter, defaultdict

SPANISH = set(
    """
    a al algo algun alguna algunas alguno algunos ante antes aqui asi aun aunque bajo bien cada casi
    como con contra cual cuales cuando cuanto de del desde donde dos el ella ellas ellos en entre era
    eran eres es esa esas ese eso esos esta estaba estado estamos estan estar estas este esto estos
    estoy fue fueron gran ha habia han hasta hay hoy la las le les lo los mas me mi mis mismo mucho
    muy nada ni no nos nosotros nuestra nuestras nuestro nuestros o otra otras otro otros para pero
    poco por porque puede pueden que quien se sea sean ser si sido sin sobre solo son su sus tal
    tambien tan tanto te tenemos tener tiene tienen todo todos toda todas tu tus un una uno unos unas
    usted ustedes va vamos van ya yo cual cuál ser hacer hace hacen haz cada mejor mayor menor nuevo
    nueva nuevos nuevas aqui alli ahi ahora siempre nunca tras segun vez veces dia dias año años
    mas menos parte forma manera cosas cosa queremos quieres quiere puedes podemos esta estas the and
    tienes tenes muchas muchos durante junto juntos cada todo toda gracias hola buen buena buenas
    buenos tenga tengo cual cuales despues luego entonces
    for you your with our this that are from not all have more will can its
    """.split()
)

SOCIAL = set(
    """
    jaja jajaja jajajaja jeje jejeje xd xq pq q k d info link bio dm inbox wsp whatsapp click clic
    aqui ingresa ingresar visita visitanos siguenos sigue comenta comparte etiqueta like likes
    https http www com bo html video videos foto fotos post posts reel reels story historia
    facebook instagram tiktok youtube linkedin twitter mas+ ver mira mas info informacion
    """.split()
)

STOP = SPANISH | SOCIAL

URL = re.compile(r"https?://\S+|www\.\S+")
MENTION = re.compile(r"@[\w.]+")
HASHTAG = re.compile(r"#(\w+)")
WORD = re.compile(r"[^\W\d_]{3,}", re.UNICODE)
# Una bandera son dos indicadores regionales juntos (🇧 + 🇴): se cuentan como una.
EMOJI = re.compile(
    "[\U0001F1E6-\U0001F1FF]{2}|[\U0001F300-\U0001FAFF\U00002600-\U000027BF⭐⭕❤]"
)


def fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn")


class TermCounter:
    """Acumula textos y devuelve los términos más repetidos por clase."""

    def __init__(self, own: set[str] | None = None) -> None:
        # El nombre de la propia empresa encabezaría su lista sin decir nada.
        self.own = own or set()
        self.seen: set[str] = set()
        self.words: Counter[str] = Counter()
        self.bigrams: Counter[str] = Counter()
        self.hashtags: Counter[str] = Counter()
        self.emojis: Counter[str] = Counter()
        self.shown: dict[str, Counter[str]] = defaultdict(Counter)
        self.texts = 0

    def add(self, text: str) -> None:
        if not text or not text.strip():
            return
        # El mismo texto publicado en dos redes cuenta una vez.
        fingerprint = fold(" ".join(text.split()))
        if fingerprint in self.seen:
            return
        self.seen.add(fingerprint)
        self.texts += 1
        for tag in HASHTAG.findall(text):
            # #tigobolivia, #EntelBolivia: la marca dentro del hashtag también es la marca.
            if any(own in fold(tag) for own in self.own if len(own) >= 4):
                continue
            self.hashtags[fold(tag)] += 1
            self.shown[fold(tag)][tag.lower()] += 1
        self.emojis.update(EMOJI.findall(text))
        clean = HASHTAG.sub(" ", MENTION.sub(" ", URL.sub(" ", text)))
        tokens = []
        for raw in WORD.findall(clean):
            folded = fold(raw)
            if folded in STOP or folded in self.own:
                tokens.append(None)
                continue
            tokens.append(folded)
            self.words[folded] += 1
            self.shown[folded][raw.lower()] += 1
        for left, right in zip(tokens, tokens[1:]):
            if left and right and left != right:
                self.bigrams[f"{left} {right}"] += 1

    def display(self, folded: str) -> str:
        options = self.shown.get(folded)
        return options.most_common(1)[0][0] if options else folded

    def top(self, words: int = 30, bigrams: int = 15, hashtags: int = 15, emojis: int = 10) -> list[dict]:
        rows: list[dict] = []
        for kind, counter, limit, minimum in (
            ("WORD", self.words, words, 2),
            ("BIGRAM", self.bigrams, bigrams, 2),
            ("HASHTAG", self.hashtags, hashtags, 2),
            ("EMOJI", self.emojis, emojis, 2),
        ):
            for rank, (term, count) in enumerate(
                [(term, count) for term, count in counter.most_common() if count >= minimum][:limit], start=1
            ):
                shown = term if kind in ("BIGRAM", "EMOJI") else self.display(term)
                rows.append({"kind": kind, "term": shown, "count": count, "rank": rank})
        return rows
