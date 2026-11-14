/**
 * Thin Worker entry: delegates to the main worker and intercepts Tenant CRM learning ingest.
 */
import worker from "./worker";
import { handleTenantLearningIngest } from "./tenantLearningIngest";

const baseFetch = worker.fetch.bind(worker);

worker.fetch = async (request: Request, env: any, ctx: any) => {
  try {
    const url = new URL(request.url);
    if (url.pathname === "/api/learning/events" && request.method === "POST") {
      const corsHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Tenant-Id",
      };
      return await handleTenantLearningIngest(request, env, corsHeaders);
    }
  } catch (err) {
    console.error("[workerEntry] learning ingest intercept failed:", err);
  }
  return baseFetch(request, env, ctx);
};

export default worker;
export * from "./worker";
