import unittest
from types import SimpleNamespace
from unittest.mock import patch

from sidecar.radar_sidecar.scraper import _fetch, _normalize_url, _strip_html


class ScraperContractTests(unittest.TestCase):
    @patch("sidecar.radar_sidecar.url_policy.socket.getaddrinfo")
    def test_normalizes_public_url(self, mock_dns):
        mock_dns.return_value = [(None, None, None, None, ("93.184.216.34", 443))]
        self.assertEqual(_normalize_url("example.com"), "https://example.com/")

    def test_rejects_local_url(self):
        self.assertIsNone(_normalize_url("http://localhost:8000/admin"))

    
    @patch("sidecar.radar_sidecar.scraper._wait_domain")
    @patch("sidecar.radar_sidecar.scraper._robots_allowed", return_value=True)
    @patch("sidecar.radar_sidecar.scraper.is_public_http_url")
    @patch("scrapling.fetchers.Fetcher.get")
    def test_rejects_redirect_to_private_network(self, mock_get, mock_public, _robots, _wait):
        mock_public.side_effect = lambda value: not value.startswith("http://127.")
        mock_get.return_value = SimpleNamespace(
            status=302,
            headers={"location": "http://127.0.0.1/admin"},
            body=b"",
            encoding="utf-8",
        )
        self.assertIsNone(_fetch("https://example.com/"))
        mock_get.assert_called_once()

    @patch("sidecar.radar_sidecar.scraper._wait_domain")
    @patch("sidecar.radar_sidecar.scraper._robots_allowed", return_value=True)
    @patch("sidecar.radar_sidecar.scraper.is_public_http_url", return_value=True)
    @patch("scrapling.fetchers.Fetcher.get")
    def test_rejects_cross_domain_redirect(self, mock_get, _public, _robots, _wait):
        mock_get.return_value = SimpleNamespace(
            status=301,
            headers={"location": "https://unrelated.example/"},
            body=b"",
            encoding="utf-8",
        )
        self.assertIsNone(_fetch("https://example.com/"))
        mock_get.assert_called_once()

    def test_strips_script_and_markup(self):
        text = _strip_html("<html><script>secret()</script><body><h1>Hello</h1></body></html>")
        self.assertIn("Hello", text)
        self.assertNotIn("secret", text)


if __name__ == "__main__":
    unittest.main()
