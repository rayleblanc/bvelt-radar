# Scrapling sidecar

This Python package is an on-demand evidence extractor invoked by the existing Radar Worker through GitHub Actions. It does not run its own cron and does not send outreach.

Install:

```bash
python -m pip install -r sidecar/requirements.txt
scrapling install
```

The workflow installs these dependencies automatically. `runner.py` reads `RADAR_WORKER_URL`, `RADAR_SIDECAR_CALLBACK_KEY`, `RADAR_RUN_ID`, `RADAR_MODE`, and `RADAR_TENANT_ID` from the environment.

The Worker must implement the authenticated candidates and evidence endpoints described in `docs/AI_STUDIO_INTEGRATION_PROMPT.md` before enabling the workflow.
