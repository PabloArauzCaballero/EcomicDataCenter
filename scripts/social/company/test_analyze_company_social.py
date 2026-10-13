"""Regression for comments from different companies sharing a platform post ID."""

import json
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

from analyze_company_social import main


class AnalyzeCompanySocialTest(unittest.TestCase):
    def test_same_post_id_in_two_companies_keeps_comments_separate(self):
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


if __name__ == "__main__":
    unittest.main()
