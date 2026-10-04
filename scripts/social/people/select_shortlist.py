"""Prioritize account discovery; output is not a published ranking."""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

from build_candidates import ROOT, fold

HERE = Path(__file__).resolve().parent
SINCE = date(2025, 10, 4)
SECTOR_ORDER = ("POLITICS", "BUSINESS", "MEDIA", "SCIENCE", "CULTURE", "CIVIC", "SPORTS", "UNCLASSIFIED")
SECTOR_OVERRIDES = {
    "EVO MORALES": "POLITICS",
    "LUIS FERNANDO CAMACHO": "POLITICS",
    "MARIA GALINDO": "CIVIC",
    "LUZMILA CARPIO": "CULTURE",
}
EXCLUDED_IDENTITIES = {
    # Her Wikidata citizenship statement is inconsistent with her Spanish/Swedish
    # chess federation history and public biography. This requires manual repair.
    "ANNA CRAMLING",
    # These entries also carry a Bolivia Wikidata claim, but independent sports
    # records identify careers and national teams outside Bolivia.
    "JUAN CARLOS TOJA",
    "MAURO FORMICA",
    "PATRICIO ALBACETE",
}


def primary_sector(person: dict) -> str:
    override = SECTOR_OVERRIDES.get(fold(person["name"]))
    if override:
        return override
    evidence = {item["source"] for item in person["evidence"]}
    for source, sector in (("OEP_ELECTION_2025", "POLITICS"),
                           ("MERCO_LEADERS_2025_26", "BUSINESS"),
                           ("COB_BOLIVARIAN_GAMES_2025", "SPORTS"),
                           ("UCB_MARIE_CURIE", "SCIENCE"),
                           ("UMSA_SCIENCE_2025", "SCIENCE"),
                           ("UCB_SCIENCE_2025", "SCIENCE")):
        if source in evidence:
            return sector
    if "CREATOR_DISCOVERY" in person["sectors"] and not any(
        sector in person["sectors"] for sector in SECTOR_ORDER[:-1]
    ):
        return "MEDIA"
    return next((sector for sector in SECTOR_ORDER if sector in person["sectors"]), "UNCLASSIFIED")


def recent_headlines() -> list[tuple[str, str]]:
    rows = []
    for year in (2025, 2026):
        source = ROOT / "src" / "database" / "seeds" / "boot" / f"press-archive-{year}.json"
        for article in json.loads(source.read_text(encoding="utf-8"))["articles"]:
            event_date = article.get("eventDate", "")
            if event_date >= SINCE.isoformat():
                rows.append((fold(article.get("headline", "")), article.get("domain", "")))
    return rows


def mention_counts(name: str, headlines: list[tuple[str, str]]) -> tuple[int, int]:
    normalized = fold(name)
    if len(normalized.split()) < 2:
        return 0, 0
    pattern = re.compile(rf"(?<![A-Z]){re.escape(normalized)}(?![A-Z])")
    domains = [domain for text, domain in headlines if pattern.search(text)]
    return len(domains), len(set(domains))


def score(person: dict) -> float:
    wikidata = next((e for e in person["evidence"] if e["source"] == "WIKIDATA_DISCOVERY"), {})
    merco = next((e for e in person["evidence"] if e["source"] == "MERCO_LEADERS_2025_26"), {})
    official = {e["source"] for e in person["evidence"]}
    creator = next((e for e in person["evidence"] if e["source"] in
                    ("HAFI_TIKTOK_BOLIVIA", "HYPEAUDITOR_INSTAGRAM_BOLIVIA")), {})
    study = next((e for e in person["evidence"] if e["source"] == "IPDRS_CREATOR_STUDY_2024"), {})
    mentions = person["recentHeadlineMentions"]
    outlets = person["recentHeadlineOutlets"]
    return round(
        1.5 * math.log1p(wikidata.get("sitelinks", 0))
        + 1.5 * math.log1p(mentions)
        + math.log1p(outlets)
        + (3 * (101 - merco["rank"]) / 100 if merco else 0)
        + (3 if "OEP_ELECTION_2025" in official else 0)
        + (2 if "COB_BOLIVARIAN_GAMES_2025" in official else 0)
        + (2 if official & {"UCB_MARIE_CURIE", "UMSA_SCIENCE_2025", "UCB_SCIENCE_2025"} else 0)
        + (2 * (101 - creator["rank"]) / 100 if creator else 0)
        + (3 * (31 - study["rank"]) / 30 if study else 0), 3
    )


def main() -> None:
    candidates = json.loads((HERE / "candidates.json").read_text(encoding="utf-8"))
    headlines = recent_headlines()
    by_sector: dict[str, list[dict]] = defaultdict(list)
    for person in candidates["people"]:
        if fold(person["name"]) in EXCLUDED_IDENTITIES:
            continue
        if all(e["source"] in ("HAFI_TIKTOK_BOLIVIA", "HYPEAUDITOR_INSTAGRAM_BOLIVIA")
               for e in person["evidence"]):
            continue  # country directories alone do not establish that this is a Bolivian person
        mentions, outlets = mention_counts(person["name"], headlines)
        person["recentHeadlineMentions"] = mentions
        person["recentHeadlineOutlets"] = outlets
        person["primarySector"] = primary_sector(person)
        person["discoveryPriority"] = score(person)
        person["slug"] = "P_" + fold(person["name"]).replace(" ", "_")[:90]
        by_sector[person["primarySector"]].append(person)

    selected = []
    for sector, people in by_sector.items():
        ordered = sorted(people, key=lambda person: (-person["discoveryPriority"], person["name"]))
        selected.extend(ordered[:150] if sector == "SPORTS" else ordered)
    selected.sort(key=lambda person: (-person["discoveryPriority"], person["name"]))
    output = {
        "status": "DISCOVERY_SHORTLIST_NOT_TOP_300",
        "generatedAt": candidates["generatedAt"],
        "pressWindowStart": SINCE.isoformat(),
        "pressHeadlineCount": len(headlines),
        "people": selected,
    }
    (HERE / "shortlist.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"people": len(selected), "sectors": {sector: sum(p["primarySector"] == sector for p in selected)
                                                          for sector in SECTOR_ORDER}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
