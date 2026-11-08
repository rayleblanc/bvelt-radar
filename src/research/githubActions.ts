/**
 * Dispatches the Scrapling research workflow for a completed Radar discovery run.
 * This module is additive: import it from the existing Worker; do not replace the
 * Cloudflare Queue, cron, /run endpoint, BEM integration, or any AI cascade.
 */

export interface ResearchDispatchEnv {
  GITHUB_ACTIONS_TOKEN?: string;
  RADAR_RESEARCH_REPOSITORY?: string;
}

export interface ResearchDispatchInput {
  run_id: string;
  mode: "founder" | "tenant";
  tenant_id: string;
}

export interface ResearchDispatchResult {
  queued: boolean;
  status?: number;
  reason?: string;
}

const DEFAULT_REPOSITORY = "rayleblanc/bvelt-radar";
const WORKFLOW_FILE = "radar-research.yml";

export async function dispatchScraplingResearch(
  env: ResearchDispatchEnv,
  input: ResearchDispatchInput
): Promise<ResearchDispatchResult> {
  const token = String(env.GITHUB_ACTIONS_TOKEN || "").trim();
  if (!token) return { queued: false, reason: "GITHUB_ACTIONS_TOKEN_NOT_CONFIGURED" };

  const repository = String(env.RADAR_RESEARCH_REPOSITORY || DEFAULT_REPOSITORY).trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return { queued: false, reason: "INVALID_GITHUB_REPOSITORY" };
  }

  if (!input.run_id || !["founder", "tenant"].includes(input.mode)) {
    return { queued: false, reason: "INVALID_RESEARCH_RUN" };
  }
  if (input.mode === "founder" && input.tenant_id !== "founder") {
    return { queued: false, reason: "FOUNDER_TENANT_MISMATCH" };
  }
  if (input.mode === "tenant" && (!input.tenant_id || input.tenant_id === "founder")) {
    return { queued: false, reason: "TENANT_ID_REQUIRED" };
  }

  const endpoint = `https://api.github.com/repos/${repository}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "BveltRadarResearch/1.0 (+https://bvelt.app)",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          run_id: input.run_id,
          mode: input.mode,
          tenant_id: input.tenant_id,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    // GitHub returns 204 when workflow_dispatch has been accepted.
    if (response.status === 204) return { queued: true, status: 204 };
    const body = (await response.text()).slice(0, 500);
    return {
      queued: false,
      status: response.status,
      reason: `GITHUB_DISPATCH_HTTP_${response.status}: ${body}`,
    };
  } catch (error: any) {
    return {
      queued: false,
      reason: String(error?.message || error || "GITHUB_DISPATCH_FAILED").slice(0, 300),
    };
  }
}
