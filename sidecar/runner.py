from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from sidecar.radar_sidecar.scraper import scrape_candidates


def _api_request(url: str, key: str, method: str = "GET", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "BveltRadarResearch/1.0",
        },
    )
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                raw = response.read(2_000_000)
                if response.status < 200 or response.status >= 300:
                    raise RuntimeError(f"Radar API HTTP {response.status}")
                return json.loads(raw.decode("utf-8")) if raw else {}
        except (urllib.error.URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Radar API request failed: {last_error}")


def main() -> int:
    worker_url = os.environ.get("RADAR_WORKER_URL", "").strip().rstrip("/")
    callback_key = os.environ.get("RADAR_SIDECAR_CALLBACK_KEY", "").strip()
    run_id = os.environ.get("RADAR_RUN_ID", "").strip()
    mode = os.environ.get("RADAR_MODE", "").strip().lower()
    tenant_id = os.environ.get("RADAR_TENANT_ID", "").strip()

    if not worker_url or not callback_key or not run_id:
        print("Missing RADAR_WORKER_URL, RADAR_SIDECAR_CALLBACK_KEY or RADAR_RUN_ID", file=sys.stderr)
        return 2
    if mode not in {"founder", "tenant"}:
        print("Invalid RADAR_MODE", file=sys.stderr)
        return 2
    if mode == "founder" and tenant_id != "founder":
        print("Founder run must use tenant_id=founder", file=sys.stderr)
        return 2
    if mode == "tenant" and (not tenant_id or tenant_id == "founder"):
        print("Tenant run requires its exact tenant_id", file=sys.stderr)
        return 2

    query = urllib.parse.urlencode({"run_id": run_id, "mode": mode, "tenant_id": tenant_id})
    candidates_url = f"{worker_url}/api/research/candidates?{query}"
    candidates_response = _api_request(candidates_url, callback_key)
    candidates = candidates_response.get("records", [])
    if not isinstance(candidates, list):
        raise RuntimeError("Radar candidates response has an invalid records field")

    print(f"Research run={run_id} mode={mode} tenant={tenant_id} candidates={len(candidates)}")
    evidence = scrape_candidates(candidates) if candidates else []
    if not candidates:
        print("No eligible website candidates; closing research run with zero evidence.")
    elif not evidence:
        print("No evidence extracted from eligible public business websites.")

    # Always callback, including an empty result, so Radar can mark the dispatch
    # completed rather than leaving it permanently in queued/running state.
    callback_url = f"{worker_url}/api/research/evidence"
    result = _api_request(
        callback_url,
        callback_key,
        method="POST",
        payload={
            "run_id": run_id,
            "mode": mode,
            "tenant_id": tenant_id,
            "extractor_version": "bvelt-scrapling-1.0.0",
            "run_status": "completed",
            "candidates_received": len(candidates),
            "records": evidence,
        },
    )
    print(json.dumps({"callback": "accepted", "result": result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
