"""Read the named leader, electoral and creator lists used for discovery."""

from __future__ import annotations

import io
import re
import unicodedata

import pypdf
import requests
from bs4 import BeautifulSoup

MERCO = "https://www.merco.info/bo/ranking-merco-lideres"
OEP = "https://web.oep.org.bo/wp-content/uploads/2025/06/Reporte-General-Candidatos-Habilitados-06-06-2025-092904.pdf"
HAFI = "https://hafi.pro/top/most-followed-tiktok/bolivia"
HYPEAUDITOR = "https://hypeauditor.com/top-instagram-all-bolivia/"
HEADERS = {"User-Agent": "ObservatorioEconomico/1.0 (public-source research)"}


def get(url: str) -> bytes:
    response = requests.get(url, headers=HEADERS, timeout=45)
    response.raise_for_status()
    return response.content


def clean_display(value: str) -> str:
    return re.sub(r"\s+", " ", "".join(c if unicodedata.category(c)[0] in "LNM" or c.isspace() else " " for c in value)).strip()


def creator_leads() -> list[dict]:
    """Directory geography and personhood are unverified; these only start review."""
    leads = []
    tiktok = BeautifulSoup(get(HAFI), "html.parser")
    table = tiktok.find("table")
    if table is None:
        raise RuntimeError("Hafi table was not found")
    for row in table.find_all("tr")[1:]:
        cells = row.find_all("td")
        if len(cells) < 3:
            continue
        handle_match = re.search(r"@([A-Za-z0-9._]+)", cells[1].get_text(" ", strip=True))
        if not handle_match:
            continue
        handle = handle_match.group(1)
        display = cells[1].get_text(" ", strip=True).split("@" + handle, 1)[-1]
        name = clean_display(display)
        if len([word for word in name.split() if len(word) >= 2]) < 2:
            continue
        leads.append({"name": name, "platform": "tiktok", "handle": handle,
                      "rank": int(cells[0].get_text(" ", strip=True).lstrip("#")),
                      "reportedFollowers": cells[2].get_text(" ", strip=True), "sourceUrl": HAFI})

    instagram = BeautifulSoup(get(HYPEAUDITOR), "html.parser")
    for rank, image in enumerate(instagram.select('img[alt*="@"]'), 1):
        display = image.get("alt", "")
        if " @" not in display:
            continue
        name, handle = display.rsplit(" @", 1)
        name = clean_display(name)
        if len([word for word in name.split() if len(word) >= 2]) < 2:
            continue
        leads.append({"name": name, "platform": "instagram", "handle": handle,
                      "rank": rank, "sourceUrl": HYPEAUDITOR})
    return leads


def merco() -> list[dict]:
    soup = BeautifulSoup(get(MERCO), "html.parser")
    table = next((table for table in soup.find_all("table")
                  if "ROSARIO PAZ" in table.get_text(" ", strip=True).upper()), None)
    if table is None:
        raise RuntimeError("Merco leaders table was not found")
    result = []
    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) < 3:
            continue
        rank = cells[0].get_text(" ", strip=True)
        if not rank.isdigit():
            continue
        name = cells[1].get_text(" ", strip=True)
        organization = cells[1].find("em")
        if organization:
            name = name.removesuffix(organization.get_text(" ", strip=True)).strip()
        result.append({"name": name.title(), "rank": int(rank),
                       "organization": organization.get_text(" ", strip=True) if organization else None})
    if len(result) != 100:
        raise RuntimeError(f"Expected 100 Merco leaders, got {len(result)}")
    return result


def oep_national_candidates() -> list[dict]:
    reader = pypdf.PdfReader(io.BytesIO(get(OEP)))
    result = []
    for page_number, page in enumerate(reader.pages, 1):
        role = None
        for line in page.extract_text().splitlines():
            if "Candidata(o) a:" in line:
                role = line.split("Candidata(o) a:", 1)[1].strip()
            if role not in ("Presidente", "Vicepresidente"):
                continue
            match = re.match(r"^\s*\d+\s+\d+\s+TITULAR\s+(.+?)\s+\d{5,}\s+[MF]\s+\d{2}\s+\d{2}/\d{2}/\d{4}", line)
            if match:
                result.append({"name": match.group(1).strip().title(), "role": role,
                               "sourceUrl": f"{OEP}#page={page_number}"})
    if len(result) < 10:
        raise RuntimeError(f"Only {len(result)} presidential candidates parsed from OEP")
    return result
