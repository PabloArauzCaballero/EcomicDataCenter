"""Data-integrity checks for historical collection, independent of network access."""

import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
import history_store
from history_store import Store, canonical_account
from youtube_history import boundary_status, initial_json
from discover_accounts import relevant, decode_link
from bs4 import BeautifulSoup
from instagram_embed import extract_caption


class HistoryIntegrityTest(unittest.TestCase):
    def test_post_urls_do_not_become_accounts(self):
        for url in ['https://www.instagram.com/p/ABC/', 'https://x.com/a/status/123',
                    'https://www.youtube.com/watch?v=abc', 'https://www.tiktok.com/@a/video/123',
                    'https://www.facebook.com/groups/123', 'https://example.com/person']:
            self.assertIsNone(canonical_account(url), url)

    def test_localized_linkedin_and_stable_youtube_id(self):
        self.assertEqual(canonical_account('https://bo.linkedin.com/in/carlos-limpias/es'),
                         ('linkedin', 'https://www.linkedin.com/in/carlos-limpias'))
        self.assertEqual(canonical_account('https://www.youtube.com/channel/UC123'),
                         ('youtube', 'https://www.youtube.com/channel/UC123'))

    def test_no_automatic_date_precision_at_boundaries(self):
        start, end = '2021-10-08T00:00:00-04:00', '2026-10-08T00:00:00-04:00'
        self.assertEqual(boundary_status('2021-10-08', start, end), 'BOUNDARY_DATE_NEEDS_TIME')
        self.assertEqual(boundary_status(None, start, end), 'UNKNOWN')
        self.assertEqual(boundary_status('2021-10-08T03:59:59Z', start, end), 'OUTSIDE_WINDOW')
        self.assertEqual(boundary_status('2021-10-08T04:00:00Z', start, end), 'IN_WINDOW')
        self.assertEqual(boundary_status('2026-10-08T04:00:00Z', start, end), 'OUTSIDE_WINDOW')
        self.assertEqual(boundary_status('2024-01-01T12:00:00', start, end), 'UNKNOWN_TIMEZONE')

    def test_search_drift_does_not_qualify_as_identity_evidence(self):
        self.assertFalse(relevant('Carlos Kempff', {'title': 'Onomatopeya del tambor', 'snippet': '', 'url': 'https://example.com'}))
        self.assertTrue(relevant('Carlos Kempff', {'title': 'Carlos Kempff - REF', 'snippet': '', 'url': 'https://linkedin.com/in/carlos'}))

    def test_embedded_json_keeps_braces_inside_strings(self):
        value = initial_json('var ytInitialPlayerResponse = {"text":"a } b", "id":1};next()', 'ytInitialPlayerResponse')
        self.assertEqual(value, {'text': 'a } b', 'id': 1})
        self.assertIsNone(initial_json('<html>captcha</html>', 'ytInitialPlayerResponse'))

    def test_research_lead_does_not_downgrade_prior_review(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(history_store, 'ROOT', Path(directory)):
            store = Store('test')
            store.add_lead('PERSON', 'https://x.com/example', 'https://source.test', 'INHERITED_REVIEW',
                           identity_status='CORROBORATED_PREVIOUS_RUN_RECHECK_PENDING')
            store.add_lead('PERSON', 'https://x.com/example', 'https://search.test', 'WEB_TOOL_SEARCH')
            self.assertEqual(len(store.leads()), 1)
            self.assertEqual(store.leads()[0]['source_kind'], 'INHERITED_REVIEW')

    def test_audit_rejects_truncated_json_instead_of_silent_success(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(history_store, 'ROOT', Path(directory)):
            store = Store('test')
            (store.path / 'broken.jsonl').write_text('{"id":', encoding='utf-8')
            with self.assertRaises(RuntimeError):
                store.events('broken')
            with self.assertRaises(ValueError):
                Store('../escape')

    def test_instagram_embed_caption_excludes_ui_and_verifies_author(self):
        html = '<div class="Caption"><a class="CaptionUsername" href="https://www.instagram.com/autor/?utm_source=ig_embed">autor</a> Mensaje visible<div class="CaptionComments">Ver todos los comentarios</div></div>'
        self.assertEqual(extract_caption(BeautifulSoup(html, 'html.parser'), 'autor'), 'Mensaje visible')
        self.assertIsNone(extract_caption(BeautifulSoup(html, 'html.parser'), 'otra_persona'))


if __name__ == '__main__':
    unittest.main()
