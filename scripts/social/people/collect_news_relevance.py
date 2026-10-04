"""Count recent independent headline matches for the discovery shortlist.

Google News RSS is a discovery index. Counts are capped by its returned results
and are evidence of coverage, not a complete census of all news articles.
"""

from __future__ import annotations

import json
import random
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlencode

import requests

from build_candidates import fold

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "news-relevance.json"
SINCE = date(2025, 10, 4)
UNTIL = date(2026, 10, 4)


def matches(name: str, title: str) -> bool:
    normalized = fold(name)
    headline = fold(title)
    if len(normalized) < 7:
        return False
    return re.search(rf"(?<![A-Z]){re.escape(normalized)}(?![A-Z])", headline) is not None


def search(name: str) -> tuple[str, list[dict]]:
    query = f'"{name}" Bolivia after:{SINCE.isoformat()} before:2026-10-05'
    url = "https://news.google.com/rss/search?" + urlencode({
        "q": query, "hl": "es-419", "gl": "BO", "ceid": "BO:es-419",
    })
    response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=25)
    response.raise_for_status()
    root = ET.fromstring(response.content)
    articles = []
    for item in root.findall("./channel/item"):
        title = item.findtext("title") or ""
        source = item.find("source")
        published = item.findtext("pubDate") or ""
        try:
            day = parsedate_to_datetime(published).date()
        except (TypeError, ValueError):
            continue
        if not (SINCE <= day <= UNTIL) or not matches(name, title):
            continue
        articles.append({"title": title, "publishedAt": day.isoformat(),
                         "outlet": source.text if source is not None else "",
                         "outletUrl": source.get("url", "") if source is not None else "",
                         "url": item.findtext("link") or ""})
    return url, articles


def main() -> None:
    people = json.loads((HERE / "shortlist.json").read_text(encoding="utf-8"))["people"]
    max_new = int(sys.argv[1]) if len(sys.argv) > 1 else len(people)
    output = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {"people": {}}
    new = 0
    for person in people:
        slug = person["slug"]
        if slug in output["people"]:
            continue
        if new >= max_new:
            break
        try:
            url, articles = search(person["name"])
            unique = {fold(a["title"]): a for a in articles}
            output["people"][slug] = {
                "name": person["name"], "status": "OK", "searchedAt": datetime.now(timezone.utc).isoformat(),
                "searchUrl": url, "articleCount": len(unique),
                "outletCount": len({a["outletUrl"] or a["outlet"] for a in unique.values()}),
                "resultCap": 100, "sample": list(unique.values())[:12],
            }
        except (requests.RequestException, ET.ParseError) as error:
            output["people"][slug] = {"name": person["name"], "status": "SEARCH_ERROR",
                                      "error": type(error).__name__, "articleCount": None, "outletCount": None}
        OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        new += 1
        if new % 25 == 0:
            print(f"searched={len(output['people'])} with_articles={sum((p.get('articleCount') or 0)>0 for p in output['people'].values())}", flush=True)
        time.sleep(0.8 + random.random() * 0.7)
    print(f"new={new} total={len(output['people'])}", flush=True)


if __name__ == "__main__":
    main()
