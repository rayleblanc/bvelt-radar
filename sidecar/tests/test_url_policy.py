import socket
import unittest
from unittest.mock import patch

from sidecar.radar_sidecar.url_policy import is_public_http_url, is_safe_redirect_target


class URLPolicyTests(unittest.TestCase):
    def test_rejects_non_http_schemes(self):
        self.assertFalse(is_public_http_url("file:///etc/passwd"))
        self.assertFalse(is_public_http_url("javascript:alert(1)"))

    def test_rejects_local_hosts(self):
        self.assertFalse(is_public_http_url("http://localhost/admin"))
        self.assertFalse(is_public_http_url("http://127.0.0.1/"))
        self.assertFalse(is_public_http_url("http://192.168.1.10/"))

    def test_rejects_credentials_and_nonstandard_or_mismatched_ports(self):
        self.assertFalse(is_public_http_url("https://user:pass@example.com/"))
        self.assertFalse(is_public_http_url("https://example.com:8443/"))
        self.assertFalse(is_public_http_url("https://example.com:80/"))
        self.assertFalse(is_public_http_url("http://example.com:443/"))

    @patch("sidecar.radar_sidecar.url_policy.socket.getaddrinfo")
    def test_accepts_public_dns_name(self, mock_dns):
        mock_dns.return_value = [(None, None, None, None, ("93.184.216.34", 443))]
        self.assertTrue(is_public_http_url("https://example.com/"))

    @patch("sidecar.radar_sidecar.url_policy.socket.getaddrinfo")
    def test_rejects_dns_name_resolving_private(self, mock_dns):
        mock_dns.return_value = [(None, None, None, None, ("10.0.0.4", 443))]
        self.assertFalse(is_public_http_url("https://example.com/"))

    @patch("sidecar.radar_sidecar.url_policy.socket.getaddrinfo")
    def test_rejects_mixed_public_and_private_dns_answers(self, mock_dns):
        mock_dns.return_value = [
            (None, None, None, None, ("93.184.216.34", 443)),
            (None, None, None, None, ("10.0.0.4", 443)),
        ]
        self.assertFalse(is_public_http_url("https://example.com/"))

    @patch("sidecar.radar_sidecar.url_policy.socket.getaddrinfo")
    def test_allows_relative_redirect_to_same_public_host(self, mock_dns):
        mock_dns.return_value = [(None, None, None, None, ("93.184.216.34", 443))]
        self.assertTrue(is_safe_redirect_target("https://example.com/start", "/contact"))

    @patch("sidecar.radar_sidecar.url_policy.socket.getaddrinfo")
    def test_rejects_redirect_to_private_address(self, mock_dns):
        mock_dns.return_value = [(None, None, None, None, ("93.184.216.34", 443))]
        base_url = "https://example.com/start"
        self.assertFalse(is_safe_redirect_target(base_url, "http://127.0.0.1:8080/admin"))
        self.assertFalse(is_safe_redirect_target(base_url, "http://192.168.1.1/"))
        self.assertFalse(is_safe_redirect_target(base_url, "http://169.254.169.254/latest/meta-data/"))
        self.assertFalse(is_safe_redirect_target(base_url, "http://localhost/"))
        self.assertFalse(is_safe_redirect_target(base_url, "file:///etc/hosts"))

    @patch("sidecar.radar_sidecar.url_policy.socket.getaddrinfo")
    def test_rejects_cross_host_redirect(self, mock_dns):
        mock_dns.return_value = [(None, None, None, None, ("93.184.216.34", 443))]
        self.assertFalse(is_safe_redirect_target("https://example.com/start", "https://attacker.example/collect"))

    @patch("sidecar.radar_sidecar.url_policy.socket.getaddrinfo")
    def test_rejects_https_downgrade(self, mock_dns):
        mock_dns.return_value = [(None, None, None, None, ("93.184.216.34", 443))]
        self.assertFalse(is_safe_redirect_target("https://example.com/start", "http://example.com/collect"))

    @patch("sidecar.radar_sidecar.url_policy.socket.getaddrinfo", side_effect=socket.gaierror("DNS failure"))
    def test_rejects_dns_resolution_failure(self, mock_dns):
        self.assertFalse(is_public_http_url("https://unresolvable.example/"))


if __name__ == "__main__":
    unittest.main()

