# Bvelt Tenant observation delivery

## Required configuration on the Radar Worker

- `BVELT_TENANT_INGEST_URL=https://bvelt.app/api/radar/tenant-observations` — plaintext URL variable (not a secret).
- `BVELT_TENANT_INGEST_KEY` — secret matching Bvelt's separate `RADAR_TENANT_INGEST_KEY`.
- `RADAR_SERVICE_KEY` — separate secret matching Bvelt's outbound `RADAR_SERVICE_KEY`; it must not be replaced with or aliased to `FOUNDER_SERVICE_KEY`.

`wrangler.toml` uses `keep_vars = true` to retain Dashboard-managed plaintext variables during Wrangler deployments. `BVELT_TENANT_INGEST_URL` is also defined in the config. The file declares required secrets so Wrangler refuses to deploy this integration when its service credentials are missing. `keep_vars` does not create missing secrets. Cloudflare documents that encrypted secrets are not deleted by ordinary Wrangler deploys; deletion requires an explicit secret-delete operation.

These are separate from:
- `RADAR_SERVICE_KEY`, which authenticates Bvelt's server-side calls into Radar.
- `BVELT_INGEST_URL` / `BVELT_INGEST_KEY`, which remain Founder-only and continue to feed global BEM.

## Delivery behavior

- Only records with an exact `tenant_id` beginning with `bvelt_` and `mode='tenant'` are eligible.
- Tenant observations are sent as individual idempotent upserts after a prospect is qualified, and a bounded backfill is attempted when a Tenant search is requested.
- Tenant outcome updates are synchronized after the outcome is saved.
- The request uses `Authorization: Bearer <BVELT_TENANT_INGEST_KEY>` and `X-Bvelt-Tenant-Id: <tenant_id>`.
- Bvelt verifies the envelope and each item's tenant ID, then stores the rows in `radar_tenant_observations`, separate from the Founder BEM tables.
- If either secret is missing, delivery is skipped and Radar discovery continues. No outreach is triggered by this synchronization.

## Deployment order

1. Configure `RADAR_TENANT_INGEST_KEY` as a secret on the Bvelt Worker.
2. Configure `BVELT_TENANT_INGEST_URL` as a plaintext variable and `BVELT_TENANT_INGEST_KEY` as a secret on Radar.
3. Configure the matching `RADAR_SERVICE_KEY` secret on both Workers for Bvelt-to-Radar requests. Keep the existing `FOUNDER_SERVICE_KEY` unchanged; it remains Founder-only.
4. Deploy Bvelt and Radar only after both PRs are reviewed and merged.
