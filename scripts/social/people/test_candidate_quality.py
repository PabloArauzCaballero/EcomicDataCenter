"""Stable integrity and minimization checks for the public-figure pool."""

import json
import re
import unittest
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent


class CandidateQualityTest(unittest.TestCase):
    def setUp(self):
        self.pool = json.loads((HERE / "candidates.json").read_text(encoding="utf-8"))
        self.shortlist = json.loads((HERE / "shortlist.json").read_text(encoding="utf-8"))
        self.research = json.loads((HERE / "research-300.json").read_text(encoding="utf-8"))
        self.pilot = json.loads((HERE / "pilot-3.json").read_text(encoding="utf-8"))
        self.ranking = json.loads((HERE / "ranking-impacto-2025.json").read_text(encoding="utf-8"))

    def test_every_person_has_traceable_public_evidence(self):
        for person in self.pool["people"]:
            self.assertTrue(len(person["name"].split()) >= 2 or person.get("stageName"), person["name"])
            self.assertTrue(person["evidence"], person["name"])
            for evidence in person["evidence"]:
                self.assertIn(urlparse(evidence["url"]).scheme, ("http", "https"))
                self.assertTrue(urlparse(evidence["url"]).netloc)

    def test_electoral_document_ids_and_birth_dates_are_not_copied(self):
        for person in self.pool["people"]:
            for evidence in person["evidence"]:
                self.assertNotIn("documentNumber", evidence)
                self.assertNotIn("birthDate", evidence)
                self.assertNotRegex(json.dumps(evidence), r"\b\d{2}/\d{2}/\d{4}\b")

    def test_shortlist_is_unique_and_explicitly_unranked(self):
        self.assertEqual(self.shortlist["status"], "DISCOVERY_SHORTLIST_NOT_TOP_300")
        slugs = [person["slug"] for person in self.shortlist["people"]]
        self.assertEqual(len(slugs), len(set(slugs)))
        self.assertTrue(all(re.fullmatch(r"P_[A-Z0-9_]+", slug) for slug in slugs))
        self.assertGreaterEqual(len(slugs), 300)

    def test_research_300_has_evidence_and_no_unverified_metrics(self):
        self.assertEqual(self.research["status"], "RESEARCH_SET_300_NOT_FINAL_RANKING")
        people = self.research["people"]
        self.assertEqual(len(people), 300)
        self.assertEqual(len({person["slug"] for person in people}), 300)
        for person in people:
            self.assertTrue(person["evidence"])
            self.assertEqual(person["accountVerification"], "PENDING")
            self.assertIsNone(person["socialMetrics"])
            self.assertIsNone(person["sentiment"])
            self.assertIsNone(person["wordCloud"])
            self.assertEqual(person["ageReview"], "PENDING")
            self.assertNotIn("rank", person)

    def test_ambiguous_city_name_does_not_claim_news_coverage(self):
        carlos_paz = next(person for person in self.research["people"] if person["name"] == "Carlos Paz")
        self.assertEqual(carlos_paz["recentNews"]["status"], "HOMONYM_REVIEW_REQUIRED")
        self.assertIsNone(carlos_paz["recentNews"]["articlesObserved"])

    def test_public_pilot_is_small_aggregate_with_account_evidence(self):
        self.assertEqual(self.pilot["status"], "EXPLORATORY_THREE_CHANNEL_PILOT")
        self.assertEqual(len(self.pilot["people"]), 3)
        self.assertGreaterEqual(self.pilot["coverage"]["commentsAnalyzedSpanish"], 500)
        self.assertEqual(self.pilot["coverage"]["commentsAnalyzedSpanish"],
                         sum(person["commentsAnalyzedSpanish"] for person in self.pilot["people"]))
        for person in self.pilot["people"]:
            self.assertGreaterEqual(person["commentsAnalyzedSpanish"], 30)
            self.assertTrue(person["accountEvidence"])
            self.assertTrue(person["wordCloud"])
            self.assertEqual(person["sentiment"]["analyzed"], person["commentsAnalyzedSpanish"])
        serialized = json.dumps(self.pilot).lower()
        self.assertNotIn('"author"', serialized)
        self.assertNotIn('"commenttext"', serialized)
        self.assertNotIn('"commenter"', serialized)

    def test_final_impact_ranking_reproduces_only_the_published_top_five(self):
        self.assertEqual(self.ranking["status"], "FINAL_MEASURED_TOP_5")
        self.assertEqual(self.ranking["source"]["sampleSize"], 600)
        people = self.ranking["people"]
        self.assertEqual([person["rank"] for person in people], [1, 2, 3, 4, 5])
        self.assertEqual([person["impactSharePercent"] for person in people], [24, 20, 8, 7, 5])
        self.assertEqual([person["name"] for person in people], [
            "Rodrigo Paz", "Edmand Lara", "Jorge ‘Tuto’ Quiroga", "Luis Arce", "Jaime Dunn"
        ])
        self.assertIn("Ipsos CIESMORI", self.ranking["source"]["publisher"])
        self.assertIn("No se inventan", self.ranking["interpretation"]["cutoffLimit"])

    def test_top_300_ranks_every_card_once_and_counts_only_backed_accounts(self):
        top = json.loads((HERE / "ranking-top300.json").read_text(encoding="utf-8"))
        people = top["people"]
        self.assertEqual(len(people), 300)
        self.assertEqual([person["rank"] for person in people], list(range(1, 301)))
        self.assertEqual({person["slug"] for person in people}, {person["slug"] for person in self.research["people"]})
        scores = [person["score"] for person in people]
        self.assertEqual(scores, sorted(scores, reverse=True))
        counted = {"WIKIDATA_DECLARED", "PLATFORM_VERIFIED", "HANDLE_MATCHES_WIKIDATA"}
        for person in people:
            for account in person["verifiedAccounts"]:
                self.assertIn(account["verification"], counted, person["name"])
            for account in person["unverifiedAccounts"]:
                self.assertNotIn(account["verification"], counted, person["name"])
            self.assertNotEqual(person["adultReview"], "MINOR_OR_UNDER_18", person["name"])
            if not person["measured"]:
                self.assertEqual(person["score"], 0, person["name"])


if __name__ == "__main__":
    unittest.main()
