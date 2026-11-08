import unittest
from unittest.mock import patch

from sidecar.radar_sidecar.scraper import _normalize_url, _strip_html


class ScraperContractTests(unittest.TestCase):
    @patch("sidecar.radar_sidecar.url_policy.socket.getaddrinfo")
    def test_normalizes_public_url(self, mock_dns):
        mock_dns.return_value = [(None, None, None, None, ("93.184.216.34", 443))]
        self.assertEqual(_normalize_url("example.com"), "https://example.com/")

    def test_rejects_local_url(self):
        self.assertIsNone(_normalize_url("http://localhost:8000/admin"))

    def test_strips_script_and_markup(self):
        text = _strip_html("<html><script>secret()</script><body><h1>Hello</h1></body></html>")
        self.assertIn("Hello", text)
        self.assertNotIn("secret", text)


if __name__ == "__main__":
    unittest.main()
