from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit, urljoin


def is_public_http_url(url: str) -> bool:
    """Reject non-web schemes, credentials, local names, and non-public IPs."""
    try:
        parsed = urlsplit((url or "").strip())
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return False
        if parsed.username or parsed.password:
            return False
        expected_port = 443 if parsed.scheme == "https" else 80
        if parsed.port is not None and parsed.port != expected_port:
            return False
        host = parsed.hostname.rstrip(".").lower()
        if host in {"localhost", "localhost.localdomain"} or host.endswith((".local", ".internal", ".localhost")):
            return False
        try:
            ip = ipaddress.ip_address(host)
            return ip.is_global
        except ValueError:
            pass
        addresses = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
        if not addresses:
            return False
        return all(ipaddress.ip_address(item[4][0]).is_global for item in addresses)
    except (ValueError, OSError, socket.gaierror):
        return False


def is_safe_redirect_target(base_url: str, target: str) -> bool:
    """Allow only public same-host redirects; reject HTTPS downgrades."""
    try:
        base = urlsplit((base_url or "").strip())
        resolved = urljoin(base_url, (target or "").strip())
        destination = urlsplit(resolved)
        if not is_public_http_url(base_url) or not is_public_http_url(resolved):
            return False
        base_host = (base.hostname or "").rstrip(".").lower().removeprefix("www.")
        target_host = (destination.hostname or "").rstrip(".").lower().removeprefix("www.")
        if not base_host or base_host != target_host:
            return False
        if base.scheme == "https" and destination.scheme != "https":
            return False
        return True
    except Exception:
        return False

