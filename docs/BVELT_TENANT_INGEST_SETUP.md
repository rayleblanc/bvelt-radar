# Bvelt Tenant observation delivery

## Required secrets on the Radar Worker

- `BVELT_TENANT_INGEST_URL=https://bvelt.app/api/radar/tenant-observations`
- `BVELT_TENANT_INGEST_KEY`: the value of Bvelt's separate `RADAR_TENANT_INGEST_KEY`

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
2. Configure `BVELT_TENANT_INGEST_URL` and `BVELT_TENANT_INGEST_KEY` as secrets/variables on the Radar Worker.
3. Configure the matching `RADAR_SERVICE_KEY` on both sides for Bvelt-to-Radar requests.
4. Deploy Bvelt and Radar only after both PRs are reviewed and merged.
