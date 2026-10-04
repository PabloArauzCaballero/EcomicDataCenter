"""Find YouTube channel leads from YouTube's public channel search.

Search results do not establish account ownership. The output is a review queue.
"""

from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

import requests

from build_candidates import fold

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "youtube-leads.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36"}
EXCLUDE = ("NO OFICIAL", "FAN", "APOYO", "NOTICIAS", "NEWS", "TRIBUT", "PARODIA")


def nested_channels(value: object):
    if isinstance(value, dict):
        if "channelRenderer" in value:
            yield value["channelRenderer"]
        for child in value.values():
            yield from nested_channels(child)
    elif isinstance(value, list):
        for child in value:
            yield from nested_channels(child)


def channel_search(name: str) -> tuple[str, list[dict]]:
    query = f"{name} Bolivia"
    url = "https://www.youtube.com/results?" + urlencode({"search_query": query, "sp": "EgIQAg=="})
    response = requests.get(url, headers=HEADERS, timeout=25)
    response.raise_for_status()
    marker = "ytInitialData = "
    if marker not in response.text:
        raise RuntimeError("YouTube did not return search data")
    start = response.text.index(marker) + len(marker)
    data, _ = json.JSONDecoder().raw_decode(response.text[start:])
    channels = []
    for item in nested_channels(data):
        title = item.get("title", {}).get("simpleText", "")
        description = "".join(run.get("text", "") for run in item.get("descriptionSnippet", {}).get("runs", []))
        subscriber = item.get("videoCountText", {}).get("simpleText", "")
        channel_id = item.get("channelId", "")
        if re.fullmatch(r"UC[\w-]{22}", channel_id):
            channels.append({"url": f"https://www.youtube.com/channel/{channel_id}",
                             "displayName": title, "description": description[:300],
                             "subscriberDisplay": subscriber})
    return url, channels


def candidate(name: str, channel: dict) -> bool:
    title = fold(channel["displayName"])
    description = fold(channel["description"])
    if any(word in title or word in description for word in EXCLUDE):
        return False
    parts = [part for part in fold(name).split() if len(part) >= 3]
    return len(parts) >= 2 and (fold(name) in title or
                                (parts[0] in title and parts[1] in title))


def main() -> None:
    people = json.loads((HERE / "shortlist.json").read_text(encoding="utf-8"))["people"]
    arguments = [argument for argument in sys.argv[1:] if not argument.startswith("--")]
    max_new = int(arguments[0]) if arguments else len(people)
    refresh_empty = "--refresh-empty" in sys.argv
    only_ipdrs = "--only-ipdrs" in sys.argv
    existing = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {"people": {}}
    done = 0
    for person in people:
        if only_ipdrs and not any(e["source"] == "IPDRS_CREATOR_STUDY_2024" for e in person["evidence"]):
            continue
        slug = person["slug"]
        if slug in existing["people"] and not (refresh_empty and existing["people"][slug]["status"] == "NO_PLAUSIBLE_CHANNEL_FOUND"):
            continue
        if done >= max_new:
            break
        try:
            search_url, channels = channel_search(person["name"])
            leads = [channel for channel in channels if candidate(person["name"], channel)][:3]
            status = "LEADS_UNVERIFIED" if leads else "NO_PLAUSIBLE_CHANNEL_FOUND"
            row = {"name": person["name"], "status": status, "searchUrl": search_url,
                   "searchedAt": datetime.now(timezone.utc).isoformat(), "channels": leads}
        except (requests.RequestException, ValueError, RuntimeError) as error:
            row = {"name": person["name"], "status": "SEARCH_ERROR", "error": type(error).__name__,
                   "searchedAt": datetime.now(timezone.utc).isoformat(), "channels": []}
        existing["people"][slug] = row
        OUTPUT.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        done += 1
        if done % 20 == 0:
            found = sum(bool(value["channels"]) for value in existing["people"].values())
            print(f"searched={len(existing['people'])} plausible={found}", flush=True)
        time.sleep(0.7)
    print(f"new={done} total={len(existing['people'])}", flush=True)


if __name__ == "__main__":
    main()
