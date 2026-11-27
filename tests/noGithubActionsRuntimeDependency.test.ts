import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("GitHub Actions is not imported, dispatched, or required by Radar runtime", () => {
  const worker = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");
  assert.doesNotMatch(worker, /dispatchScraplingResearch|maybeDispatchSidecarResearch|api\.github\.com|GITHUB_ACTIONS_TOKEN_SECRET/);
  assert.match(worker, /runtime_dependency:\s*false/);
  assert.match(worker, /required:\s*false/);
});

test("Cloudflare release gate runs the complete verification suite without Actions", () => {
  const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(wrangler, /command\s*=\s*"npm run build"/);
  assert.match(pkg.scripts["verify:release"], /npm audit --audit-level=moderate/);
  assert.match(pkg.scripts["verify:release"], /npm run lint/);
  assert.match(pkg.scripts["verify:release"], /npm run test:radar/);
  assert.match(pkg.scripts["verify:release"], /pytest sidecar\/tests/);
  assert.match(pkg.scripts["verify:release"], /npm run build/);
});
