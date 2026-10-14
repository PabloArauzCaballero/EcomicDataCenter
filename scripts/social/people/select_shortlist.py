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


# Cuentas de los directorios que no son una personalidad boliviana. Se revisaron las 88 a mano (14-oct-2026).
DIRECTORY_NOT_A_PERSON = {
    "NEETU PANDIT": "nombre y cuenta de la India; el directorio filtra por audiencia, no por nacionalidad",
    "SANJNA SHARMA": "nombre y cuenta de la India; el directorio filtra por audiencia, no por nacionalidad",
    "RED UNO DE BOLIVIA": "canal de televisión: es una empresa de medios",
    "EL DEBER": "periódico: es una empresa de medios",
    "EL EXPLAINER": "cuenta informativa, no una persona",
    "NAVAJAS BARBERSHOP": "negocio",
    "LIBRERIA IRBE BOLIVIA": "negocio",
    "ORIENTE PETROLERO": "club deportivo",
    "SHOW BUSINESS": "cuenta de farándula, no una persona",
    "LOS MOMOS DEL PAPU": "página de memes",
    "LOVE MUSIC": "agregador de música",
    "I LOVE YOU MAMA": "cuenta de frases",
    "SECRETOS DE MUNECAS": "página temática",
    "LA SABROSA": "negocio o programa, no una persona",
    "GABO BURGER": "negocio",
    "SABORES BOLIVIANOS": "página de recetas",
    "RECETAS SWEET FACTORY": "negocio",
}
# La misma persona con otro nombre: la ficha que ya existe (o la más completa) conserva la cuenta.
DIRECTORY_SAME_PERSON = {
    "MANGUERITA OFICIAL": "Manguerita",
    "CRISTIAN APAZA CORO": "Cristian Apaza",
    "YARIT LAZONAR JA": "Yarit",
    "FIORELLA ZAMORA": "Fiorella Zoe Zamora Fernandez",
    "EDUARDO SALVATIERRA": "El Capi",
}
DIRECTORY_SOURCES = ("HAFI_TIKTOK_BOLIVIA", "HYPEAUDITOR_INSTAGRAM_BOLIVIA")


def directory_only(person: dict) -> bool:
    return all(e["source"] in DIRECTORY_SOURCES for e in person["evidence"])


def account_key(url: str | None) -> str | None:
    """«tiktok:adrinavid» / «instagram:brferrante»: la cuenta, no el nombre que muestra."""
    m = re.search(r"(tiktok|instagram|youtube)\.com/(?:@|channel/)?([\w.\-]+)", url or "", re.I)
    return f"{m.group(1).lower()}:{m.group(2).lower()}" if m else None


def claimed_accounts(people: list[dict]) -> set[str]:
    """Cuentas que ya pertenecen a una ficha con otra fuente: un creador no entra dos veces con otro nombre."""
    keys = set()
    for person in people:
        if directory_only(person):
            continue
        for item in person["evidence"]:
            keys.add(account_key(item.get("accountUrl")))
        for lead in person.get("accountLeads", []):
            keys.add(account_key(lead.get("url")))
    keys.discard(None)
    return keys


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
    claimed = claimed_accounts(candidates["people"])
    seen_directory: set[str] = set()
    for person in candidates["people"]:
        if fold(person["name"]) in EXCLUDED_IDENTITIES:
            continue
        if directory_only(person):
            # Los directorios «más seguidos de Bolivia» filtran por país y traen la cuenta con su rango: es un creador
            # real con audiencia medible. Antes se descartaban por «no probar que es boliviano» y dejaban fuera a
            # todos los creadores que no figuraban además en Wikidata o en el estudio del IPDRS (88 de 120).
            # Entran con su cuenta como identidad; los repetidos (misma cuenta bajo otro nombre) no.
            if fold(person["name"]) in DIRECTORY_NOT_A_PERSON or fold(person["name"]) in DIRECTORY_SAME_PERSON:
                continue
            keys = {account_key(e.get("accountUrl")) for e in person["evidence"]} - {None}
            if not keys or keys & claimed or keys & seen_directory:
                continue
            seen_directory |= keys
            person["directoryOnly"] = True
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
