"""La semilla social solo admite cuentas cuya identidad se confirmó."""

import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from analyze_company_social import load_run, main


class TrustedAccountsTest(unittest.TestCase):
    def test_low_search_result_requires_review_and_url_match(self) -> None:
        directory = {
            "companies": [
                {"slug": "TRUSTED", "accounts": {"youtube": {"url": "https://example.com/ok", "confidence": "HIGH"}}},
                {"slug": "UNREVIEWED", "accounts": {"youtube": {"url": "https://example.com/low", "confidence": "LOW"}}},
                {"slug": "REVIEWED", "accounts": {"youtube": {"url": "https://example.com/yes", "confidence": "LOW", "reviewed": True}}},
                {"slug": "CHANGED", "accounts": {"youtube": {"url": "https://example.com/new", "confidence": "HIGH"}}},
            ]
        }
        rows = [
            {"profile": {"slug": slug, "platform": "youtube", "url": url, "status": "OK", "retrievedAt": "2026-10-01T00:00:00Z"}, "posts": [], "comments": []}
            for slug, url in (
                ("TRUSTED", "https://example.com/ok/"),
                ("UNREVIEWED", "https://example.com/low"),
                ("REVIEWED", "https://example.com/yes"),
                ("CHANGED", "https://example.com/old"),
            )
        ]
        read_rows = lambda path: rows if path.name == "youtube.jsonl" and path.parent.name == "run" else []
        with (
            patch("analyze_company_social.ACCOUNTS", MagicMock(read_text=lambda **_: json.dumps(directory))),
            patch("analyze_company_social._read_jsonl", side_effect=read_rows),
        ):
            result = load_run(Path("run"))
        self.assertEqual({row["profile"]["slug"] for row in result}, {"TRUSTED", "REVIEWED"})

    def test_same_post_id_in_two_companies_keeps_comments_separate(self) -> None:
        class FakeClassifier:
            name = "test"

            def classify(self, texts):
                return [
                    {"polarity": "POS" if text == "bien" else "NEG", "emotion": None, "ironic": False}
                    for text in texts
                ]

            def classify_polarity(self, texts):
                return [{"polarity": "NEU"} for _ in texts]

        readings = []
        for slug, comment in (("FIRST", "bien"), ("SECOND", "mal")):
            readings.append({
                "profile": {"slug": slug, "platform": "facebook", "status": "OK", "handle": slug,
                            "retrievedAt": "2026-10-01T00:00:00Z"},
                "posts": [{"slug": slug, "platform": "facebook", "postId": "shared-id",
                           "text": "publicación", "publishedAt": None}],
                "comments": [{"slug": slug, "platform": "facebook", "postId": "shared-id", "text": comment}],
            })
        seed_path = MagicMock()
        with (
            patch("analyze_company_social.load_run", return_value=readings),
            patch("analyze_company_social.SEED", seed_path),
            patch.object(sys, "argv", ["analyze_company_social.py", "--run=2026-10-01"]),
            patch.dict(sys.modules, {"sentiment_onnx": types.SimpleNamespace(Classifier=FakeClassifier)}),
        ):
            main()
        seed = json.loads(seed_path.write_text.call_args.args[0])
        by_slug = {row["slug"]: row for row in seed["profiles"]}
        self.assertEqual(by_slug["FIRST"]["commentSentiment"]["positivePct"], 100)
        self.assertEqual(by_slug["SECOND"]["commentSentiment"]["negativePct"], 100)
        self.assertEqual(sum(row["commentsRead"] for row in seed["profiles"]), 2)
        self.assertEqual({row["captionPolarity"] for row in seed["posts"]}, {"NEU"})


if __name__ == "__main__":
    unittest.main()
