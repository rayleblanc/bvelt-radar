# Scrapling sidecar

This Python package is an on-demand evidence extractor invoked by the existing Radar Worker through GitHub Actions. It does not run its own cron and does not send outreach.

Install:

```bash
python -m pip install -r sidecar/requirements.txt
scrapling install
```

The workflow installs these dependencies automatically. `runner.py` reads `RADAR_WORKER_URL`, `RADAR_SIDECAR_CALLBACK_KEY`, `RADAR_RUN_ID`, `RADAR_MODE`, and `RADAR_TENANT_ID` from the environment.

Optional environment variables:

- `SIDECAR_ENABLE_BROWSER=1` enables Chromium rendering for JavaScript-shell homepages only (never to bypass denials).
- `SIDECAR_DEADLINE_SECONDS` (default 1320, i.e. 22 minutes) is a soft deadline for the whole run. When it is reached the scraper stops issuing requests, returns the evidence collected so far, and reports `candidates_deferred` + `soft_deadline_exceeded` in the callback, so the dispatch is always closed before the workflow hard timeout.

The Worker must implement the authenticated candidates and evidence endpoints described in `docs/AI_STUDIO_INTEGRATION_PROMPT.md` before enabling the workflow.
