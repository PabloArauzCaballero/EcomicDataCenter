"""Resume una corrida de redes sociales en la semilla `company-social.json`.

Lee `artifacts/social-raw/<corrida>/<red>.jsonl` (lo que escribió
`collect-company-social.ts`) y escribe sólo agregados:

- por cuenta: cifras del perfil, posts leídos, ritmo de publicación,
  interacción media y el sentimiento de los comentarios;
- por post: sus cifras, su texto (es de la empresa) y el sentimiento de sus
  comentarios;
- por empresa: los términos más repetidos en lo que publica (`COMPANY`) y en
  lo que le comentan (`AUDIENCE`).

El texto de los comentarios se clasifica en memoria y no sale de aquí: no hay
autor, ni comentario, ni identificador de quien comentó en la semilla.

Sentimiento: los modelos de pysentimiento (RoBERTuito, entrenado con tuits en
español) corridos en ONNX (`sentiment_onnx.py`): polaridad POS/NEG/NEU y, cuando
sus modelos están, emoción e ironía. La ironía va aparte y NO se suma a lo
positivo: la burla es el caso que la ADR 0022 advierte que una polaridad sola
lee al revés.

    python scripts/social/company/analyze_company_social.py --run=AAAA-MM-DD
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from social_text import TermCounter, fold

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "artifacts" / "social-raw"
SEED = ROOT / "src" / "database" / "seeds" / "boot" / "company-social.json"
PLATFORMS = ("facebook", "instagram", "tiktok", "youtube", "linkedin")
WINDOW_DAYS = 90
EMOTIONS = ("joy", "sadness", "anger", "surprise", "disgust", "fear")
CAPTION_LIMIT = 600


def clip(text: str, limit: int) -> str:
    """Recorta a `limit` unidades UTF-16: así cuenta el validador de la semilla (un emoji vale 2)."""
    while len(text.encode("utf-16-le")) // 2 > limit:
        text = text[:-1]
    return text


def _read_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    if path.exists():
        # `splitlines()` también corta en U+2028/U+2029, que JSON.stringify deja crudos dentro de un texto.
        for line in path.read_text(encoding="utf-8").split("\n"):
            if line:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    pass  # una línea cortada por un tramo interrumpido no es una lectura
    return rows


_POST_FIELDS = ("publishedAt", "likes", "comments", "shares", "views", "format", "publishedHour")


def _best_post(versions: list[dict]) -> dict:
    """De varias lecturas del mismo post: el texto más largo y, campo a campo, la cifra que alguna trajo."""
    best = dict(max(versions, key=lambda post: sum(post.get(name) is not None for name in _POST_FIELDS)))
    best["text"] = max((post.get("text") or "" for post in versions), key=len)
    for name in _POST_FIELDS:
        if best.get(name) is None:
            best[name] = next((post[name] for post in versions if post.get(name) is not None), None)
    return best


def _merge(readings: list[dict]) -> dict:
    """Las lecturas de una cuenta (la corrida y su segunda pasada) en una: lo mejor de cada una, sin perder nada."""
    ok = [reading for reading in readings if reading["profile"]["status"] == "OK"]
    if not ok:
        return readings[-1]  # nunca se leyó bien: vale la última, con su razón
    newest = max(ok, key=lambda reading: reading["profile"]["retrievedAt"])
    versions: dict[str, list[dict]] = defaultdict(list)
    for reading in ok:
        for post in reading["posts"]:
            versions[post["postId"]].append(post)
    comments = {(c["postId"], c["text"]): c for reading in ok for c in reading["comments"]}
    return {
        "profile": newest["profile"],
        "posts": [_best_post(group) for group in versions.values()],
        "comments": list(comments.values()),
    }


def load_run(run_dir: Path) -> list[dict]:
    """Une las lecturas de la corrida y su segunda pasada, por cuenta."""
    by_account: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for directory in (run_dir, run_dir.with_name(run_dir.name + "-deep")):
        for platform in PLATFORMS:
            for reading in _read_jsonl(directory / f"{platform}.jsonl"):
                profile = reading["profile"]
                by_account[(platform, profile["slug"])].append(reading)
    return [_merge(readings) for readings in by_account.values()]


def summary(labels: list[dict]) -> dict | None:
    if not labels:
        return None
    total = len(labels)
    polarity = Counter(label["polarity"] for label in labels)
    emotions = Counter(label["emotion"] for label in labels if label["emotion"] not in (None, "others"))
    irony_known = [label["ironic"] for label in labels if label["ironic"] is not None]
    share = lambda count: round(100 * count / total, 1)  # noqa: E731
    return {
        "analyzed": total,
        "positivePct": share(polarity["POS"]),
        "negativePct": share(polarity["NEG"]),
        "neutralPct": share(polarity["NEU"]),
        "ironyPct": round(100 * sum(irony_known) / len(irony_known), 1) if irony_known else None,
        "netScore": round(share(polarity["POS"]) - share(polarity["NEG"]), 1),
        "topEmotion": emotions.most_common(1)[0][0] if emotions else None,
        # El reparto completo, no sólo la dominante: «alegría 40 %, enojo 35 %» no es «alegría».
        "emotionPct": {name: share(emotions[name]) for name in EMOTIONS} if emotions else None,
    }


def own_words(slug: str, handle: str) -> set[str]:
    """Las palabras del nombre y del handle de la empresa, plegadas."""
    words = {fold(part) for part in slug.split("_") if len(part) >= 3}
    words |= {fold(part) for part in re.split(r"[^a-zA-Z0-9]+", handle) if len(part) >= 3}
    return words - {"banco", "bolivia", "nacional", "empresa"} | {fold(handle.replace(".", "").replace("_", ""))}


def interactions(post: dict) -> int | None:
    parts = [post.get(key) for key in ("likes", "comments", "shares")]
    known = [part for part in parts if isinstance(part, (int, float))]
    return int(sum(known)) if known else None


def posts_per_week(posts: list[dict], run_day: date) -> float | None:
    """Publicaciones por semana entre la más antigua leída de la ventana y el día de la corrida."""
    days = [date.fromisoformat(post["publishedAt"]) for post in posts if post.get("publishedAt")]
    days = [day for day in days if (run_day - day).days <= WINDOW_DAYS]
    if len(days) < 2:
        return None
    span = max((run_day - min(days)).days, 7)
    return round(len(days) / span * 7, 2)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True)
    parser.add_argument("--no-sentiment", action="store_true")
    args = parser.parse_args()
    run_dir = RAW / args.run
    readings = load_run(run_dir)
    if not readings:
        raise SystemExit(f"no hay lecturas en {run_dir}")

    classifier = None
    if not args.no_sentiment:
        from sentiment_onnx import Classifier

        classifier = Classifier()
    comments_by_post: dict[tuple, list[str]] = defaultdict(list)
    for reading in readings:
        for comment in reading["comments"]:
            comments_by_post[(comment["slug"], comment["platform"], comment["postId"])].append(comment["text"])

    all_comments = [(key, text) for key, texts in comments_by_post.items() for text in texts]
    labels = classifier.classify([text for _, text in all_comments]) if classifier else []
    labels_by_post: dict[tuple, list[dict]] = defaultdict(list)
    for (key, _), label in zip(all_comments, labels):
        labels_by_post[key].append(label)

    captions = [post for reading in readings for post in reading["posts"]]
    caption_labels = classifier.classify_polarity([post["text"] or "" for post in captions]) if classifier else []
    caption_by_post = {
        (post["slug"], post["platform"], post["postId"]): label
        for post, label in zip(captions, caption_labels)
    }

    handles: dict[str, set[str]] = defaultdict(set)
    for reading in readings:
        handles[reading["profile"]["slug"]] |= own_words(reading["profile"]["slug"], reading["profile"].get("handle") or "")
    company_terms = {slug: TermCounter(own) for slug, own in handles.items()}
    audience_terms = {slug: TermCounter(own) for slug, own in handles.items()}
    profiles, posts = [], []
    for reading in readings:
        profile = reading["profile"]
        slug, platform = profile["slug"], profile["platform"]
        run_day = datetime.fromisoformat(profile["retrievedAt"].replace("Z", "+00:00")).date()
        since = run_day - timedelta(days=WINDOW_DAYS)
        rates, account_labels = [], []
        for post in reading["posts"]:
            key = (slug, platform, post["postId"])
            company_terms[slug].add(post["text"])
            for text in comments_by_post.get(key, []):
                audience_terms[slug].add(text)
            account_labels += labels_by_post.get(key, [])
            total = interactions(post)
            recent = post.get("publishedAt") and date.fromisoformat(post["publishedAt"]) >= since
            if total is not None and profile.get("followers") and recent:
                rates.append(100 * total / profile["followers"])
            caption = caption_by_post.get(key)
            posts.append(
                {
                    **{k: post.get(k) for k in ("slug", "platform", "postId", "url", "publishedAt", "likes", "comments", "shares", "views", "discovery", "format", "publishedHour")},
                    "text": clip(post["text"] or "", CAPTION_LIMIT),
                    "interactions": total,
                    "captionPolarity": caption["polarity"] if caption else None,
                    "commentSentiment": summary(labels_by_post.get(key, [])),
                }
            )
        recent_posts = [post for post in reading["posts"] if post.get("publishedAt") and date.fromisoformat(post["publishedAt"]) >= since]
        profiles.append(
            {
                **{k: profile.get(k) for k in ("slug", "platform", "url", "handle", "status", "statusNote", "retrievedAt", "sha256", "displayName", "followers", "following", "postCount", "likesTotal", "talkingAbout")},
                "postsRead": len(reading["posts"]),
                "postsInWindow": len(recent_posts),
                "postsPerWeek": posts_per_week(reading["posts"], run_day),
                "engagementPct": round(statistics.median(rates), 3) if rates else None,
                "commentsRead": len(reading["comments"]),
                "commentSentiment": summary(account_labels),
            }
        )

    terms = []
    for scope, counters in (("COMPANY", company_terms), ("AUDIENCE", audience_terms)):
        for slug, counter in counters.items():
            terms += [{"slug": slug, "scope": scope, "texts": counter.texts, **row} for row in counter.top()]

    retrieved = max(profile["retrievedAt"] for profile in profiles)
    seed = {
        "provenance": {
            "runId": args.run,
            "retrievedAt": retrieved,
            "collector": "scripts/social/company/collect-company-social.ts",
            "method": "Playwright sin sesión sobre las cuentas oficiales enlazadas por cada empresa (ADR 0027)",
            "sentimentModel": classifier.name if classifier else None,
            "windowDays": WINDOW_DAYS,
        },
        "profiles": sorted(profiles, key=lambda row: (row["slug"], row["platform"])),
        "posts": sorted(posts, key=lambda row: (row["slug"], row["platform"], row["publishedAt"] or "", row["postId"])),
        "terms": terms,
    }
    # Compacta: con la segunda pasada la semilla pasa de decenas de miles de posts y la sangría la triplicaría.
    SEED.write_text(json.dumps(seed, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    status = Counter((row["platform"], row["status"]) for row in profiles)
    print(f"{len(profiles)} cuentas, {len(posts)} posts, {len(all_comments)} comentarios clasificados, {len(terms)} términos")
    for platform in PLATFORMS:
        print(platform, {state: count for (name, state), count in status.items() if name == platform})
    print(f"semilla: {SEED}")


if __name__ == "__main__":
    main()
