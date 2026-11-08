import unittest
from unittest.mock import patch

from sidecar.radar_sidecar.url_policy import is_public_http_url


class URLPolicyTests(unittest.TestCase):
    def test_rejects_non_http_schemes(self):
        self.assertFalse(is_public_http_url("file:///etc/passwd"))
        self.assertFalse(is_public_http_url("javascript:alert(1)"))

    def test_rejects_local_hosts(self):
        self.assertFalse(is_public_http_url("http://localhost/admin"))
        self.assertFalse(is_public_http_url("http://127.0.0.1/"))
        self.assertFalse(is_public_http_url("http://192.168.1.10/"))

    def test_rejects_credentials_and_nonstandard_ports(self):
        self.assertFalse(is_public_http_url("https://user:pass@example.com/"))
        self.assertFalse(is_public_http_url("https://example.com:8443/"))

    @patch("sidecar.radar_sidecar.url_policy.socket.getaddrinfo")
    def test_accepts_public_dns_name(self, mock_dns):
        mock_dns.return_value = [(None, None, None, None, ("93.184.216.34", 443))]
        self.assertTrue(is_public_http_url("https://example.com/"))

    @patch("sidecar.radar_sidecar.url_policy.socket.getaddrinfo")
    def test_rejects_dns_name_resolving_private(self, mock_dns):
        mock_dns.return_value = [(None, None, None, None, ("10.0.0.4", 443))]
        self.assertFalse(is_public_http_url("https://example.com/"))


if __name__ == "__main__":
    unittest.main()
