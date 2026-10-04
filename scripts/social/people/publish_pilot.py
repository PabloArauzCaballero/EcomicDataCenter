"""Publish only reviewed adult channels and aggregate public comment analysis."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
INPUT = ROOT / "artifacts" / "people-social-pilot.json"
OUTPUT = HERE / "pilot-3.json"


def publish() -> dict:
    analysis = json.loads(INPUT.read_text(encoding="utf-8"))
    reviews = json.loads((HERE / "reviewed-pilot-accounts.json").read_text(encoding="utf-8"))
    research = json.loads((HERE / "research-300.json").read_text(encoding="utf-8"))
    research_slugs = {person["slug"] for person in research["people"]}
    raw_titles = {}
    raw_file = ROOT / "artifacts" / "people-social-raw" / analysis["provenance"]["runId"] / "youtube.jsonl"
    for line in raw_file.read_text(encoding="utf-8").split("\n"):
        if not line:
            continue
        reading = json.loads(line)
        slug = reading["profile"]["slug"]
        if slug in reviews:
            for post in reading["posts"]:
                raw_titles[(slug, post["postId"])] = (post.get("text") or "").split("\n", 1)[0][:160]
    people = []
    for profile in analysis["profiles"]:
        slug = profile["slug"]
        if slug not in reviews:
            continue
        review = reviews[slug]
        if slug not in research_slugs or profile["url"] != review["url"]:
            raise RuntimeError(f"account review mismatch: {slug}")
        if profile["readStatus"] != "OK" or profile["commentsAnalyzedSpanish"] < 30:
            raise RuntimeError(f"insufficient reviewed sample: {slug}")
        if not profile["commentSentiment"] or review["adultStatus"] != "CORROBORATED":
            raise RuntimeError(f"missing adult or sentiment review: {slug}")
        posts = [post for post in analysis["posts"] if post["slug"] == slug]
        posts.sort(key=lambda post: (post["publishedAt"] or "", post["postId"]), reverse=True)
        public_posts = [{"url": post["url"], "publishedAt": post["publishedAt"],
                         "title": raw_titles.get((slug, post["postId"]), ""),
                         "likes": post["likes"], "comments": post["comments"], "views": post["views"],
                         "commentsAnalyzedSpanish": post["commentsAnalyzedSpanish"],
                         "commentSentiment": post["commentSentiment"]} for post in posts]
        words = [term for term in analysis["terms"] if term["slug"] == slug]
        people.append({"slug": slug, "name": profile["name"], "platform": "youtube",
                       "accountUrl": profile["url"], "identityStatus": review["identityStatus"],
                       "accountEvidence": review["sources"], "identityReviewRationale": review["rationale"],
                       "followersApprox": profile["followers"], "retrievedAt": profile["retrievedAt"],
                       "postsInWindow": profile["postsInWindow"],
                       "commentsCaptured": profile["commentsInWindow"],
                       "commentsAnalyzedSpanish": profile["commentsAnalyzedSpanish"],
                       "commentsExcluded": profile["commentsInWindow"] - profile["commentsAnalyzedSpanish"],
                       "sentiment": profile["commentSentiment"], "wordCloud": words,
                       "posts": public_posts})
    if set(reviews) != {person["slug"] for person in people}:
        raise RuntimeError("review set and published people differ")
    return {"status": "EXPLORATORY_THREE_CHANNEL_PILOT", "generatedAt": datetime.now(timezone.utc).isoformat(),
            "windowStart": analysis["provenance"]["windowStart"],
            "windowEnd": analysis["provenance"]["runId"],
            "method": {"source": "Public YouTube channel pages and visible comments",
                       "selection": "Selected recent videos from three corroborated adult Bolivian creators; comments are not a random or complete sample",
                       "language": "Spanish detection probability at least 0.7 and four or more words",
                       "sentimentModel": analysis["provenance"]["sentimentModel"],
                       "minimumForDisplay": 30,
                       "interpretation": "Automated labels describe captured comments only; they do not represent all followers or Bolivian public opinion",
                       "privacy": "No commenter names, identifiers or comment text are published"},
            "coverage": {"researchPeople": len(research["people"]), "peopleWithPilotSentiment": len(people),
                         "commentsCaptured": sum(person["commentsCaptured"] for person in people),
                         "commentsAnalyzedSpanish": sum(person["commentsAnalyzedSpanish"] for person in people)},
            "people": sorted(people, key=lambda person: person["name"])}


if __name__ == "__main__":
    result = publish()
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["coverage"], ensure_ascii=False))
