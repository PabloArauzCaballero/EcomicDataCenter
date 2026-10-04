"""Analyze public-account pilot readings without publishing commenters or raw text.

Only Spanish comments supported by the Spanish sentiment model are classified.
The output stays in artifacts until account identity and coverage are reviewed.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from langdetect import DetectorFactory, LangDetectException, detect_langs

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "company"))

from analyze_company_social import load_run, summary  # noqa: E402
from sentiment_onnx import Classifier  # noqa: E402
from social_text import TermCounter, fold  # noqa: E402

DetectorFactory.seed = 0
RAW = ROOT / "artifacts" / "people-social-raw"
OUTPUT = ROOT / "artifacts" / "people-social-pilot.json"
MIN_PUBLIC_COMMENTS = 30
WINDOW_DAYS = 365


def spanish(text: str) -> bool:
    """Short, emoji-only and uncertain-language comments remain unclassified."""
    if len(re.findall(r"\w+", text, re.UNICODE)) < 4:
        return False
    try:
        return any(language.lang == "es" and language.prob >= 0.7 for language in detect_langs(text))
    except LangDetectException:
        return False


def name_match(name: str, shown: str | None) -> bool:
    if not shown:
        return False
    candidate = fold(name)
    profile = fold(shown)
    return candidate in profile or profile in candidate


def analyze(run: str) -> dict:
    shortlist = json.loads((HERE / "shortlist.json").read_text(encoding="utf-8"))
    names = {person["slug"]: person["name"] for person in shortlist["people"]}
    readings = [reading for reading in load_run(RAW / run) if reading["profile"]["slug"] in names]
    if not readings:
        raise RuntimeError("no person-account readings")
    since = (datetime.strptime(run, "%Y-%m-%d") - timedelta(days=WINDOW_DAYS)).date().isoformat()
    classifier = Classifier()
    by_post: dict[tuple[str, str, str], list[str]] = defaultdict(list)
    all_comments = 0
    window_comments = 0
    for reading in readings:
        eligible = {post["postId"] for post in reading["posts"] if (post.get("publishedAt") or "")[:10] >= since}
        for comment in reading["comments"]:
            all_comments += 1
            if comment["postId"] not in eligible:
                continue
            window_comments += 1
            if spanish(comment["text"]):
                by_post[(comment["slug"], comment["platform"], comment["postId"])].append(comment["text"])

    labeled = [(key, text) for key, texts in by_post.items() for text in texts]
    labels = classifier.classify([text for _, text in labeled]) if labeled else []
    labels_by_post: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for (key, _), label in zip(labeled, labels):
        labels_by_post[key].append(label)

    profiles, posts, terms = [], [], []
    audience_terms: dict[str, TermCounter] = {}
    for reading in readings:
        profile = reading["profile"]
        slug, platform = profile["slug"], profile["platform"]
        name = names.get(slug, slug)
        audience_terms.setdefault(slug, TermCounter({fold(part) for part in name.split()}))
        account_labels = []
        eligible = {post["postId"] for post in reading["posts"] if (post.get("publishedAt") or "")[:10] >= since}
        for post in reading["posts"]:
            if post["postId"] not in eligible:
                continue
            key = (slug, platform, post["postId"])
            relevant = labels_by_post.get(key, [])
            account_labels.extend(relevant)
            for text in by_post.get(key, []):
                audience_terms[slug].add(text)
            posts.append({"slug": slug, "platform": platform, "postId": post["postId"],
                          "url": post["url"], "publishedAt": post.get("publishedAt"),
                          "likes": post.get("likes"), "comments": post.get("comments"),
                          "views": post.get("views"), "commentsAnalyzedSpanish": len(relevant),
                          "commentSentiment": summary(relevant) if len(relevant) >= MIN_PUBLIC_COMMENTS else None})
        profiles.append({"slug": slug, "name": name, "platform": platform, "url": profile["url"],
                         "readStatus": profile["status"], "statusNote": profile.get("statusNote"),
                         "identityStatus": "UNVERIFIED_NAME_MATCH" if name_match(name, profile.get("displayName"))
                         else "NEEDS_IDENTITY_REVIEW", "displayName": profile.get("displayName"),
                         "followers": profile.get("followers"), "retrievedAt": profile["retrievedAt"],
                         "postsCollected": len(reading["posts"]), "postsInWindow": len(eligible),
                         "commentsCollected": len(reading["comments"]),
                         "commentsInWindow": sum(comment["postId"] in eligible for comment in reading["comments"]),
                         "commentsAnalyzedSpanish": len(account_labels),
                         "sentimentStatus": "PUBLISHABLE_SAMPLE" if len(account_labels) >= MIN_PUBLIC_COMMENTS else "INSUFFICIENT_SAMPLE",
                         "commentSentiment": summary(account_labels) if len(account_labels) >= MIN_PUBLIC_COMMENTS else None})
    for slug, counter in audience_terms.items():
        if counter.texts >= MIN_PUBLIC_COMMENTS:
            terms.extend({"slug": slug, "scope": "AUDIENCE_SPANISH", "texts": counter.texts, **row}
                         for row in counter.top())
    return {
        "status": "PILOT_UNVERIFIED_NOT_FOR_PUBLIC_RANKING",
        "provenance": {"runId": run, "analyzedAt": datetime.now(timezone.utc).isoformat(),
                       "collector": "scripts/social/people/collect-person-social.ts",
                       "sentimentModel": classifier.name, "languageRule": "Spanish >=0.7, four or more words",
                       "minPublicComments": MIN_PUBLIC_COMMENTS, "windowStart": since,
                       "windowDays": WINDOW_DAYS, "commentsCollected": all_comments,
                       "commentsInWindow": window_comments, "commentsAnalyzedSpanish": len(labeled),
                       "commentsUnclassifiedInWindow": window_comments - len(labeled)},
        "profiles": profiles, "posts": posts, "terms": terms,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True)
    args = parser.parse_args()
    result = analyze(args.run)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"profiles": len(result["profiles"]), "posts": len(result["posts"]),
                      "commentsCollected": result["provenance"]["commentsCollected"],
                      "commentsAnalyzedSpanish": result["provenance"]["commentsAnalyzedSpanish"],
                      "terms": len(result["terms"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
