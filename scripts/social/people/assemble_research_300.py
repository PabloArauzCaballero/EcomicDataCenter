"""Assemble 300 traceable research candidates, not a published popularity ranking.

The discovery score decides which identities receive manual review first. It is
not an influence score: source coverage, social availability and naming vary by
sector. No account or sentiment is treated as verified in this output.
"""

from __future__ import annotations

import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from build_candidates import fold

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "research-300.json"
EXCLUDE_SOURCE_ONLY = {"COB_BOLIVARIAN_GAMES_2025"}  # Medalists may be minors.
SOURCE_WEIGHTS = {
    "MERCO_LEADERS_2025_26": 3.0,
    "OEP_ELECTION_2025": 3.0,
    "UCB_MARIE_CURIE": 2.5,
    "UMSA_SCIENCE_2025": 2.5,
    "UCB_SCIENCE_2025": 2.5,
    "IPDRS_CREATOR_STUDY_2024": 2.0,
    "WIKIDATA_DISCOVERY": 0.5,
}
SECTOR_LIMITS = {"BUSINESS": 100, "SPORTS": 65, "POLITICS": 75, "MEDIA": 55,
                 "SCIENCE": 30, "CULTURE": 45, "CIVIC": 25, "UNCLASSIFIED": 15}
REVIEWED_SHORT_NAMES = {
    "EVO MORALES", "LUIS ARCE", "EVA COPA", "CARLOS MESA", "JEANINE ANEZ",
    "EDMAND LARA", "MARIA GALINDO", "ALBERTINA SACACA", "ANABEL ANGUS",
    "CARLOS LAMPE", "RAMIRO VACA", "MANFRED REYES VILLA",
}


def news_usable(person: dict) -> bool:
    """Short names frequently match unrelated people, cities or family names."""
    return len(fold(person["name"]).split()) >= 3 or fold(person["name"]) in REVIEWED_SHORT_NAMES


def discovery_score(person: dict, news: dict) -> float:
    """Priority for human review, with low weight on incomplete news indexing."""
    evidence = person["evidence"]
    source = max((SOURCE_WEIGHTS.get(item["source"], 0) for item in evidence), default=0)
    merco = next((item for item in evidence if item["source"] == "MERCO_LEADERS_2025_26"), None)
    study = next((item for item in evidence if item["source"] == "IPDRS_CREATOR_STUDY_2024"), None)
    wiki = next((item for item in evidence if item["source"] == "WIKIDATA_DISCOVERY"), None)
    articles = news.get("articleCount") or 0 if news_usable(person) else 0
    outlets = news.get("outletCount") or 0 if news_usable(person) else 0
    score = source + (1.2 * (101 - merco["rank"]) / 100 if merco else 0)
    score += 0.8 * (31 - study["rank"]) / 30 if study else 0
    score += 0.45 * math.log1p(min(articles, 100)) + 0.25 * math.log1p(min(outlets, 50))
    score += 0.25 * math.log1p(min(wiki["sitelinks"], 150)) if wiki else 0
    return round(score, 4)


def assemble() -> dict:
    shortlist = json.loads((HERE / "shortlist.json").read_text(encoding="utf-8"))["people"]
    news = json.loads((HERE / "news-relevance.json").read_text(encoding="utf-8"))["people"]
    youtube = json.loads((HERE / "youtube-leads.json").read_text(encoding="utf-8"))["people"]
    if sum(person.get("status") == "OK" for person in news.values()) < len(shortlist) - 1:
        raise RuntimeError("news discovery is incomplete")
    candidates = []
    for person in shortlist:
        sources = {item["source"] for item in person["evidence"]}
        if sources <= EXCLUDE_SOURCE_ONLY:
            continue
        recent = news.get(person["slug"], {})
        if recent.get("status") != "OK":
            continue
        leads = []
        for platform, item in person.get("accounts", {}).items():
            leads.append({"platform": platform, "url": item["url"], "sourceUrl": item["sourceUrl"],
                          "status": "UNVERIFIED_WIKIDATA"})
        for item in person.get("accountLeads", []):
            leads.append({"platform": item["platform"], "url": item["url"],
                          "sourceUrl": item["sourceUrl"], "status": "UNVERIFIED_DIRECTORY"})
        yt = youtube.get(person["slug"], {})
        exact = [item for item in yt.get("channels", []) if fold(item["displayName"]) == fold(person["name"])]
        if exact and not any(item["platform"] == "youtube" for item in leads):
            leads.append({"platform": "youtube", "url": exact[0]["url"],
                          "sourceUrl": yt["searchUrl"], "status": "UNVERIFIED_SEARCH"})
        candidates.append({
            "slug": person["slug"], "name": person["name"], "sector": person["primarySector"],
            "evidence": [{"source": item["source"], "url": item["url"],
                          **({"rank": item["rank"]} if "rank" in item else {})}
                         for item in person["evidence"]],
            "recentNews": {"articlesObserved": recent["articleCount"] if news_usable(person) else None,
                           "outletsObserved": recent["outletCount"] if news_usable(person) else None,
                           "searchUrl": recent["searchUrl"], "resultCap": recent["resultCap"],
                           "sample": recent["sample"][:3] if news_usable(person) else [],
                           "status": "DISCOVERY_INDEX_NOT_COMPLETE_CENSUS" if news_usable(person)
                           else "HOMONYM_REVIEW_REQUIRED"},
            "accountLeads": leads, "accountVerification": "PENDING",
            "socialMetrics": None, "sentiment": None, "wordCloud": None,
            "identityReview": "PENDING", "ageReview": "PENDING",
            "discoveryPriority": discovery_score(person, recent),
        })
    candidates.sort(key=lambda item: (-item["discoveryPriority"], item["name"]))
    counts: Counter[str] = Counter()
    selected = []
    for person in candidates:
        if counts[person["sector"]] >= SECTOR_LIMITS[person["sector"]]:
            continue
        selected.append(person)
        counts[person["sector"]] += 1
        if len(selected) == 300:
            break
    if len(selected) != 300 or len({item["slug"] for item in selected}) != 300:
        raise RuntimeError(f"Expected 300 unique research candidates, got {len(selected)}")
    selected.sort(key=lambda item: (item["sector"], fold(item["name"])))
    return {"status": "RESEARCH_SET_300_NOT_FINAL_RANKING", "generatedAt": datetime.now(timezone.utc).isoformat(),
            "method": {"purpose": "Manual identity and account review; this is not a popularity ranking",
                       "newsWindow": "2025-10-04/2026-10-04", "newsResultCapPerName": 100,
                       "sourceAndSectorBias": "Discovery coverage differs by sector; missing social values are null",
                       "accountRule": "Search, directory and Wikidata links are leads until individually verified",
                       "ageRule": "No comment analysis is published until adult status is checked"},
            "sectors": dict(counts), "people": selected}


if __name__ == "__main__":
    result = assemble()
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"people": len(result["people"]), "sectors": result["sectors"],
                      "accountLeads": sum(bool(person["accountLeads"]) for person in result["people"])}, ensure_ascii=False))
