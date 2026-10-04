"""Build a traceable discovery pool for the Bolivian public-figures project.

This is a candidate pool, not the published Top 300. Source documents can contain
identity numbers and birth dates; neither field is copied to the output.
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import requests

from source_lists import HEADERS, MERCO, creator_leads, merco, oep_national_candidates

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(__file__).with_name("candidates.json")
COB = "https://comiteolimpicoboliviano.org.bo/bolivia-cierra-su-participacion-en-los-juegos-bolivarianos-con-esfuerzo-olimpico/"
IPDRS = "https://ipdrs.org/wp-content/uploads/2024/12/IPDRS-Investigacion-influencers-Bolivia.pdf"
UCB_SCIENCE = "https://lpz.ucb.edu.bo/ucb-lidera-la-ciencia-boliviana-cuatro-investigadoras-ph-d-ganan-el-premio-nacional-marie-curie/"
UMSA_SCIENCE = "https://umsa.bo/es/web/guest/umsa-noticias/-/asset_publisher/sIpuYXdbB9M8/content/cientificos-de-primera-en-el-iifb/12888639"
UCB_FUGAR = "https://lpz.ucb.edu.bo/proyecto-fugar-chiquitania-recibe-el-premio-plurinacional-de-ciencia-tecnologia-e-innovacion-2025/"
WIKIDATA = "https://query.wikidata.org/sparql"
ALIASES = {
    "CARLOS EDUARDO DEL CASTILLO DEL CARPIO": "CARLOS DEL CASTILLO",
    "EDMAND LARA MONTANO": "EDMAND LARA",
    "MONICA EVA COPA MURGA": "EVA COPA",
    "JORGE FERNANDO TUTO QUIROGA RAMIREZ": "JORGE QUIROGA RAMIREZ",
    "MANFRED ARMANDO ANTONIO REYES VILLA BACIGALUPI": "MANFRED REYES VILLA",
    "SAMUEL JORGE DORIA MEDINA AUZA": "SAMUEL DORIA MEDINA",
    "DANIEL DUENAS Z": "DANIEL DUENAS",
    "FABRU BLACUTT": "FABRICIO BLACUTT",
}


def fold(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    return re.sub(r"[^A-Z0-9]+", " ", "".join(c for c in value if not unicodedata.combining(c)).upper()).strip()


def key(name: str) -> str:
    normalized = fold(name)
    return ALIASES.get(normalized, normalized)


def wikidata() -> list[dict]:
    query = """SELECT ?item ?itemLabel ?sitelinks WHERE {
      ?item wdt:P31 wd:Q5; wdt:P27 wd:Q750; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks >= 5)
      FILTER NOT EXISTS { ?item wdt:P570 ?deathDate }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
    } ORDER BY DESC(?sitelinks) LIMIT 1000"""
    response = requests.get(
        WIKIDATA, params={"query": query, "format": "json"}, headers=HEADERS, timeout=45
    )
    response.raise_for_status()
    result = []
    for row in response.json()["results"]["bindings"]:
        item = row["item"]["value"]
        name = row["itemLabel"]["value"].strip()
        if not re.fullmatch(r"Q\d+", name) and key(name):
            result.append({
                "name": name,
                "wikidataId": item.rsplit("/", 1)[-1],
                "sitelinks": int(row["sitelinks"]["value"]),
                "sourceUrl": item.replace("http://", "https://"),
            })
    return result


def wikidata_details() -> dict[str, dict]:
    prefix = """?item wdt:P31 wd:Q5; wdt:P27 wd:Q750; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks >= 5) FILTER NOT EXISTS { ?item wdt:P570 ?deathDate }"""
    queries = {
        "occupations": f"""SELECT ?item ?occupationLabel WHERE {{ {prefix}
          ?item wdt:P106 ?occupation.
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "es,en". }}
        }} LIMIT 2000""",
        "accounts": f"""SELECT ?item ?instagram ?tiktok ?youtube ?facebook ?twitter ?linkedin WHERE {{ {prefix}
          OPTIONAL {{ ?item wdt:P2003 ?instagram }}
          OPTIONAL {{ ?item wdt:P7085 ?tiktok }}
          OPTIONAL {{ ?item wdt:P2397 ?youtube }}
          OPTIONAL {{ ?item wdt:P2013 ?facebook }}
          OPTIONAL {{ ?item wdt:P2002 ?twitter }}
          OPTIONAL {{ ?item wdt:P6634 ?linkedin }}
          FILTER(BOUND(?instagram)||BOUND(?tiktok)||BOUND(?youtube)||BOUND(?facebook)||BOUND(?twitter)||BOUND(?linkedin))
        }} LIMIT 2000""",
    }
    result: dict[str, dict] = {}
    for kind, query in queries.items():
        response = requests.get(WIKIDATA, params={"query": query, "format": "json"}, headers=HEADERS, timeout=45)
        response.raise_for_status()
        for row in response.json()["results"]["bindings"]:
            item = row["item"]["value"].rsplit("/", 1)[-1]
            detail = result.setdefault(item, {"occupations": [], "accounts": {}})
            if kind == "occupations":
                label = row["occupationLabel"]["value"]
                if label not in detail["occupations"]:
                    detail["occupations"].append(label)
            else:
                for platform in ("instagram", "tiktok", "youtube", "facebook", "twitter", "linkedin"):
                    if platform in row:
                        detail["accounts"][platform] = row[platform]["value"]
    return result


def sector_for(occupation: str) -> str | None:
    text = fold(occupation)
    groups = (
        ("SPORTS", "FUTBOL ENTRENADOR ATLETA TENISTA CICLISTA NADADOR ARBITRO ESGRIMA DEPORTISTA BALONCESTO AJEDRECISTA MARATONISTA BOXEADOR ESQUIADOR"),
        ("POLITICS", "POLITICO DIPLOMATICO MINISTRO PRESIDENTE ALCALDE GOBERNADOR FUNCIONARIO"),
        ("BUSINESS", "EMPRESARIO EMPRENDEDOR DIRECTIVO BANQUERO"),
        ("MEDIA", "PERIODISTA PRESENTADOR COMUNICADOR LOCUTOR YOUTUBER INFLUENCER"),
        ("SCIENCE", "INVESTIGADOR CIENTIFICO MEDICO ECONOMISTA HISTORIADOR PROFESOR UNIVERSITARIO ACADEMICO"),
        ("CULTURE", "ESCRITOR ACTOR CINE CANTANTE COMPOSITOR MUSICO PINTOR POETA ARTISTA MODELO FOTOGRAFO NOVELISTA GUIONISTA ARQUITECTO"),
        ("CIVIC", "ACTIVISTA SINDICALISTA RELIGIOSO OBISPO PRESBITERO SACERDOTE"),
    )
    for sector, words in groups:
        if any(word in text for word in words.split()):
            return sector
    return None


def account_url(platform: str, value: str) -> str:
    value = value.lstrip("@")
    bases = {
        "instagram": "https://www.instagram.com/",
        "tiktok": "https://www.tiktok.com/@",
        "youtube": "https://www.youtube.com/channel/",
        "facebook": "https://www.facebook.com/",
        "twitter": "https://x.com/",
        "linkedin": "https://www.linkedin.com/in/",
    }
    return bases[platform] + value


def add(pool: dict[str, dict], name: str, source: str, sector: str, **detail: object) -> None:
    normalized = key(name)
    if not normalized:
        return
    record = pool.setdefault(normalized, {"name": name, "aliases": [], "sectors": [], "evidence": []})
    if name != record["name"] and name not in record["aliases"]:
        record["aliases"].append(name)
    if sector not in record["sectors"]:
        record["sectors"].append(sector)
    if not any(e["source"] == source for e in record["evidence"]):
        record["evidence"].append({"source": source, **detail})


def build() -> dict:
    pool: dict[str, dict] = {}
    details = wikidata_details()
    for item in wikidata():
        add(pool, item["name"], "WIKIDATA_DISCOVERY", "UNCLASSIFIED", url=item["sourceUrl"],
            wikidataId=item["wikidataId"], sitelinks=item["sitelinks"])
        person = pool[key(item["name"])]
        detail = details.get(item["wikidataId"], {})
        person["occupations"] = detail.get("occupations", [])
        for occupation in person["occupations"]:
            sector = sector_for(occupation)
            if sector and sector not in person["sectors"]:
                person["sectors"].append(sector)
        if len(person["sectors"]) > 1:
            person["sectors"].remove("UNCLASSIFIED")
        person["accounts"] = {platform: {"url": account_url(platform, handle), "sourceUrl": item["sourceUrl"],
                                         "confidence": "UNVERIFIED_WIKIDATA"}
                              for platform, handle in detail.get("accounts", {}).items()}
    for item in merco():
        add(pool, item["name"], "MERCO_LEADERS_2025_26", "BUSINESS", url=MERCO,
            rank=item["rank"], organization=item["organization"])
    for item in oep_national_candidates():
        add(pool, item["name"], "OEP_ELECTION_2025", "POLITICS", url=item["sourceUrl"], role=item["role"])

    # Names explicitly printed in the COB's medal summary; this is a source
    # transcription, not a claim that the complete delegation was extracted.
    medalists = (
        "Valeria Quispe", "Mayte Guzmán", "Carol Bellido", "Maya Quinteros",
        "Benita Parra", "Leonardo Villarroel", "Eder Vargas", "Nataly Camacho",
        "Alejandro Velásquez", "Abigail Mena", "Jimmy Quiroz", "Eiser Ortiz",
        "Benjamín García", "Víctor Hugo Aguilar", "Briana Iriarte", "Flavia Quiroga",
        "Camila Torrico", "Carla Dorado", "Renata Nieto", "Luis Vera",
        "Amir Rodríguez", "Luz Roca", "Melani Unzueta", "Ariane Monje",
        "Juan Montalvo", "Adriana Martínez", "Daniela Daza", "María Hurtado",
        "José Heredia", "Sebastián Méndez", "Rocío Rengifo", "Rudolf Knijnenburg",
        "Sebastián Aguilar", "Maya Lizondo", "Patrick Linares", "Mila Ormachea",
        "Manuel Gonzáles",
    )
    for name in medalists:
        add(pool, name, "COB_BOLIVARIAN_GAMES_2025", "SPORTS", url=COB)

    # Table 1, pages 7-8, of the institute's 2024 study of 109 creator accounts.
    # Historical follower totals are deliberately not copied into this 2026 pool.
    creators = (
        "Junior Mavity", "Albertina Sacaca", "Leonel Fransezze", "Elias Ayaviri",
        "Ale Pinedo", "Fabricio Blacutt", "Alexius", "Daniel Dueñas",
        "Cris Emprende", "Maria Leydi", "Lizeth Callizaya", "Anabel Angus",
        "josesinlz", "Gabriela Zegarra", "Mamen Saavedra", "Carlos Marquina",
        "La Warmi Rosa", "Yossu Valerio", "Cristian Apaza", "gata de la copia",
        "Candres Peredo", "Mama Lucy", "AngelSG", "Mily Gonzales",
        "Evo Morales", "Layme", "Cocinando con Elena", "Manguerita",
        "Luz Cruz", "Yarit",
    )
    for rank, name in enumerate(creators, 1):
        add(pool, name, "IPDRS_CREATOR_STUDY_2024", "MEDIA", url=f"{IPDRS}#page={7 if rank <= 20 else 8}", rank=rank)
        if len(name.split()) == 1:
            pool[key(name)]["stageName"] = True

    for name in ("Mónica X. Guzmán Rojo", "Ana Guadalupe Peres Cajías", "Helga Gruberg Cazón",
                 "Marcela Losantos Velasco"):
        add(pool, name, "UCB_MARIE_CURIE", "SCIENCE", url=UCB_SCIENCE)
    for name in ("Yuran Calancha", "Dayana Perez", "Luis H. Crispín", "Alberto Giménez",
                 "María Teresa Álvarez", "Juan Carlos Ticona"):
        add(pool, name, "UMSA_SCIENCE_2025", "SCIENCE", url=UMSA_SCIENCE)
    add(pool, "Estela Herbas Baeny", "UCB_SCIENCE_2025", "SCIENCE", url=UCB_FUGAR)

    for lead in creator_leads():
        source = "HAFI_TIKTOK_BOLIVIA" if lead["platform"] == "tiktok" else "HYPEAUDITOR_INSTAGRAM_BOLIVIA"
        add(pool, lead["name"], source, "CREATOR_DISCOVERY", url=lead["sourceUrl"], rank=lead["rank"],
            accountUrl=account_url(lead["platform"], lead["handle"]),
            reportedFollowers=lead.get("reportedFollowers"))
        person = pool[key(lead["name"])]
        person.setdefault("accountLeads", []).append({"platform": lead["platform"],
                                                        "url": account_url(lead["platform"], lead["handle"]),
                                                        "confidence": "UNVERIFIED_DIRECTORY",
                                                        "sourceUrl": lead["sourceUrl"]})

    people = sorted(pool.values(), key=lambda p: key(p["name"]))
    sources = {source: sum(any(e["source"] == source for e in p["evidence"]) for p in people)
               for source in ("WIKIDATA_DISCOVERY", "MERCO_LEADERS_2025_26", "OEP_ELECTION_2025", "COB_BOLIVARIAN_GAMES_2025",
                              "HAFI_TIKTOK_BOLIVIA", "HYPEAUDITOR_INSTAGRAM_BOLIVIA", "IPDRS_CREATOR_STUDY_2024",
                              "UCB_MARIE_CURIE", "UMSA_SCIENCE_2025", "UCB_SCIENCE_2025")}
    return {"generatedAt": datetime.now(timezone.utc).isoformat(), "status": "CANDIDATE_POOL_NOT_RANKED",
            "sources": sources, "people": people}


if __name__ == "__main__":
    output = build()
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"people": len(output["people"]), "sources": output["sources"]}, ensure_ascii=False))
