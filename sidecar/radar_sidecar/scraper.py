from __future__ import annotations

import hashlib
import re
import threading
import time
import urllib.robotparser
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit, urlunsplit
from typing import Any

from sidecar.radar_sidecar.url_policy import is_public_http_url

EXTRACTOR_VERSION = "bvelt-scrapling-1.0.0"
USER_AGENT = "BveltRadarResearch/1.0 (+https://bvelt.app; public business website research)"
MAX_CANDIDATES = 50
MAX_PAGES_PER_SITE = 5
MAX_CONCURRENCY = 3
MAX_HTML_BYTES = 1_500_000
_ROBOTS_CACHE: dict[str, tuple[float, urllib.robotparser.RobotFileParser | None]] = {}
_ROBOTS_LOCK = threading.Lock()
_DOMAIN_LOCKS: dict[str, threading.Lock] = {}
_DOMAIN_LAST_REQUEST: dict[str, float] = {}
_DOMAIN_GUARD = threading.Lock()
MIN_DOMAIN_INTERVAL_SECONDS = 1.25

EMAIL_RE = re.compile(r"(?i)(?<![\w.+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![\w.-])")
PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\d().\s/-]{7,}\d)(?!\w)")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _normalize_url(raw: str) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    if not re.match(r"^https?://", value, re.I):
        value = "https://" + value
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    normalized = urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path or "/", parsed.query, ""))
    return normalized if is_public_http_url(normalized) else None


def _host(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()


def _robots_allowed(url: str) -> bool:
    parsed = urlsplit(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    now = time.time()
    with _ROBOTS_LOCK:
        cached = _ROBOTS_CACHE.get(origin)
        if cached and now - cached[0] < 3600:
            parser = cached[1]
        else:
            parser = None
            try:
                from scrapling.fetchers import Fetcher
                robots_url = origin + "/robots.txt"
                if is_public_http_url(robots_url):
                    response = Fetcher.get(
                        robots_url, timeout=6, retries=0, follow_redirects="safe",
                        stealthy_headers=False, headers={"User-Agent": USER_AGENT}
                    )
                    if response.status == 200:
                        raw = response.body[:100_000].decode("utf-8", errors="replace")
                        parser = urllib.robotparser.RobotFileParser()
                        parser.set_url(robots_url)
                        parser.parse(raw.splitlines())
                    elif response.status in {404, 410}:
                        parser = None
                    else:
                        # Unknown/server error: fail closed for this host.
                        parser = False  # type: ignore[assignment]
            except Exception:
                parser = False  # type: ignore[assignment]
            _ROBOTS_CACHE[origin] = (now, parser)
    if parser is False:
        return False
    if parser is None:
        return True
    try:
        return bool(parser.can_fetch(USER_AGENT, url))
    except Exception:
        return False


def _wait_domain(url: str) -> None:
    host = _host(url)
    with _DOMAIN_GUARD:
        lock = _DOMAIN_LOCKS.setdefault(host, threading.Lock())
    with lock:
        elapsed = time.time() - _DOMAIN_LAST_REQUEST.get(host, 0.0)
        if elapsed < MIN_DOMAIN_INTERVAL_SECONDS:
            time.sleep(MIN_DOMAIN_INTERVAL_SECONDS - elapsed)
        _DOMAIN_LAST_REQUEST[host] = time.time()


def _fetch(url: str):
    from scrapling.fetchers import Fetcher
    if not is_public_http_url(url) or not _robots_allowed(url):
        return None
    try:
        _wait_domain(url)
        response = Fetcher.get(
            url,
            timeout=12,
            retries=1,
            retry_delay=1,
            follow_redirects="safe",
            stealthy_headers=False,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"},
        )
        if response.status in {429, 503}:
            retry_after = (response.headers or {}).get("retry-after") or (response.headers or {}).get("Retry-After")
            try:
                delay = min(10.0, max(1.0, float(retry_after)))
            except (TypeError, ValueError):
                delay = 2.0
            time.sleep(delay)
            _wait_domain(url)
            response = Fetcher.get(
                url, timeout=12, retries=0, follow_redirects="safe", stealthy_headers=False,
                headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"},
            )
        if response.status < 200 or response.status >= 300:
            return None
        content_type = str((response.headers or {}).get("content-type", "")).lower()
        if content_type and not any(kind in content_type for kind in ("text/html", "application/xhtml+xml", "text/plain")):
            return None
        body = response.body[:MAX_HTML_BYTES]
        return body.decode(response.encoding or "utf-8", errors="replace"), response.status
    except Exception:
        return None


def _browser_fetch(url: str):
    """Optional normal Chromium rendering; no CAPTCHA or access-control bypass."""
    try:
        from scrapling.fetchers import DynamicFetcher
        if not is_public_http_url(url) or not _robots_allowed(url):
            return None
        _wait_domain(url)

        def guard_requests(page):
            async def guard(route):
                target = route.request.url
                if is_public_http_url(target):
                    await route.continue_()
                else:
                    await route.abort()
            page.route("**/*", guard)

        response = DynamicFetcher.fetch(
            url,
            headless=True,
            disable_resources=True,
            timeout=15000,
            wait=700,
            network_idle=False,
            page_setup=guard_requests,
        )
        body = response.body[:MAX_HTML_BYTES]
        return body.decode(response.encoding or "utf-8", errors="replace"), response.status
    except Exception:
        return None


def _strip_html(html: str) -> str:
    html = re.sub(r"(?is)<(script|style|noscript|svg|template)[^>]*>.*?</\1>", " ", html)
    html = re.sub(r"(?s)<[^>]+>", " ", html)
    html = re.sub(r"&nbsp;|&#160;", " ", html, flags=re.I)
    html = re.sub(r"&amp;", "&", html, flags=re.I)
    html = re.sub(r"&quot;|&#34;", '"', html, flags=re.I)
    html = re.sub(r"&#39;|&apos;", "'", html, flags=re.I)
    html = re.sub(r"&lt;", "<", html, flags=re.I)
    html = re.sub(r"&gt;", ">", html, flags=re.I)
    return re.sub(r"\s+", " ", html).strip()


def _same_domain_links(html: str, base_url: str) -> list[str]:
    found: list[str] = []
    for href in re.findall(r"(?is)<a\b[^>]*?href\s*=\s*['\"]([^'\"]+)['\"]", html):
        href = href.strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        target = urljoin(base_url, href)
        if _host(target) != _host(base_url):
            continue
        path = urlsplit(target).path.lower()
        if any(word in path for word in ("contact", "about", "service", "quote", "estimate", "book", "appointment", "area", "location")):
            normalized = _normalize_url(target)
            if normalized and normalized not in found:
                found.append(normalized)
    return found


def _extract(candidate: dict[str, Any]) -> dict[str, Any] | None:
    prospect_id = str(candidate.get("prospect_id") or "").strip()
    website = _normalize_url(str(candidate.get("website") or ""))
    if not prospect_id or not website:
        return None

    pages: list[dict[str, Any]] = []
    queue = [website]
    visited: set[str] = set()
    emails: set[str] = set()
    phones: set[str] = set()
    service_terms: set[str] = set()
    signals: dict[str, bool] = {
        "contact_form_observed": False,
        "quote_or_estimate_language_observed": False,
        "booking_or_appointment_observed": False,
        "click_to_call_observed": False,
        "whatsapp_link_observed": False,
        "service_area_language_observed": False,
        "review_or_testimonial_section_observed": False,
    }
    all_text: list[str] = []
    first_page_html = ""
    successful_pages = 0

    while queue and len(pages) < MAX_PAGES_PER_SITE:
        url = queue.pop(0)
        if url in visited:
            continue
        visited.add(url)
        fetched = _fetch(url)
        if fetched is None:
            # Never escalate a blocked/rate-limited/robots-denied request to a browser.
            continue
        html, status = fetched
        # Browser rendering is only used for a successful HTTP page that appears
        # to be a JavaScript shell, not as a way around an HTTP denial.
        if (
            len(pages) == 0
            and status == 200
            and len(_strip_html(html)) < 350
            and str(__import__("os").environ.get("SIDECAR_ENABLE_BROWSER", "0")) == "1"
        ):
            browser_result = _browser_fetch(url)
            if browser_result is not None and browser_result[1] == 200:
                html, status = browser_result
        if not first_page_html:
            first_page_html = html
        successful_pages += 1
        text = _strip_html(html)
        lower = text.lower()
        all_text.append(text[:20_000])
        page_hash = hashlib.sha256(html.encode("utf-8", errors="ignore")).hexdigest()
        pages.append({"url": url, "http_status": status, "content_hash": page_hash})

        for email in EMAIL_RE.findall(html):
            email_l = email.lower().strip(".,;:()[]{}<>")
            if not any(x in email_l for x in ("example.com", "test.com", "wixpress.com", "sentry.io")):
                emails.add(email_l)
        for phone in PHONE_RE.findall(html):
            compact = re.sub(r"\s+", " ", phone).strip()
            if sum(ch.isdigit() for ch in compact) >= 8:
                phones.add(compact)

        signals["contact_form_observed"] = signals["contact_form_observed"] or bool(re.search(r"(?is)<form\b", html))
        signals["quote_or_estimate_language_observed"] = signals["quote_or_estimate_language_observed"] or bool(re.search(r"(?i)\b(get a quote|request a quote|free estimate|request an estimate|estimate request|get pricing)\b", text))
        signals["booking_or_appointment_observed"] = signals["booking_or_appointment_observed"] or bool(re.search(r"(?i)\b(book online|book an appointment|schedule online|make an appointment|appointment booking)\b", text))
        signals["click_to_call_observed"] = signals["click_to_call_observed"] or bool(re.search(r"(?i)href\s*=\s*['\"]tel:", html))
        signals["whatsapp_link_observed"] = signals["whatsapp_link_observed"] or bool(re.search(r"(?i)(wa\.me/|api\.whatsapp\.com|whatsapp\.com/send)", html))
        signals["service_area_language_observed"] = signals["service_area_language_observed"] or bool(re.search(r"(?i)\b(service area|areas we serve|serving [A-Z][\w ,&-]{2,60}|locations we serve)\b", text))
        signals["review_or_testimonial_section_observed"] = signals["review_or_testimonial_section_observed"] or bool(re.search(r"(?i)\b(testimonials|customer reviews|what our customers say|client reviews)\b", text))

        for term in re.findall(r"(?i)\b(?:repair|installation|maintenance|inspection|emergency|residential|commercial|cleaning|restoration|replacement|consultation|financing|warranty)\b", text):
            service_terms.add(term.lower())
        for link in _same_domain_links(html, url):
            if link not in visited and link not in queue:
                queue.append(link)

    if not pages:
        return None

    # Only positive observations are asserted. Absence from fetched pages is not proof
    # that the business lacks a capability or that revenue is being lost.
    observed_at = _now()
    combined_text = "\n".join(all_text)
    content_hash = hashlib.sha256(combined_text.encode("utf-8", errors="ignore")).hexdigest()
    title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", first_page_html)
    meta_description = None
    for meta_tag in re.findall(r"(?is)<meta\b[^>]*>", first_page_html):
        has_description_name = re.search(r"(?i)\bname\s*=\s*['\"]description['\"]", meta_tag)
        content_match = re.search(r"(?i)\bcontent\s*=\s*['\"]([^'\"]+)['\"]", meta_tag)
        if has_description_name and content_match:
            meta_description = content_match.group(1).strip()[:500]
            break
    evidence = {
        "business_name": str(candidate.get("business_name") or candidate.get("name") or "")[:200],
        "city": str(candidate.get("city") or "")[:120],
        "niche": str(candidate.get("trade") or "")[:120],
        "website": website,
        "page_title": (title_match.group(1).strip()[:250] if title_match else None),
        "meta_description": meta_description,
        "public_business_emails": sorted(emails)[:10],
        "public_business_phones": sorted(phones)[:10],
        "service_terms_observed": sorted(service_terms)[:30],
        "observed_capabilities": signals,
        "pages_fetched": pages,
        "successful_pages": successful_pages,
        "absence_is_not_proof": True,
        "interpretation": "Observed website facts only; no claim of lost revenue or buying intent.",
    }
    return {
        "prospect_id": prospect_id,
        "source_id": "scrapling_business_website",
        "source_url": website,
        "evidence_type": "business_website_profile",
        "evidence": evidence,
        "content_hash": content_hash,
        "extractor_version": EXTRACTOR_VERSION,
        "confidence": 0.78 if successful_pages >= 2 else 0.62,
        "observed_at": observed_at,
    }


def scrape_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    valid = [c for c in candidates[:MAX_CANDIDATES] if isinstance(c, dict)]
    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENCY) as pool:
        futures = [pool.submit(_extract, candidate) for candidate in valid]
        for future in as_completed(futures):
            try:
                item = future.result()
                if item:
                    results.append(item)
            except Exception as exc:
                print(f"Candidate extraction failed: {str(exc)[:160]}")
    return results
