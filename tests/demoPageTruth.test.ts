import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");
const demoStart = worker.indexOf("function handleEdgeDemoPage(): Response");
const demoEnd = worker.indexOf("\n}\n", demoStart);
const demo = worker.slice(demoStart, demoEnd);

test("prospect demo is generic and explicitly illustrative", () => {
  assert.ok(demoStart >= 0, "demo renderer must remain present");
  assert.match(demo, /Ejemplo simulado/);
  assert.match(demo, /ficticios/);
  assert.doesNotMatch(demo, /safeName|safeTrade|safePhone/);
});

test("prospect demo contains no fabricated performance or revenue claims", () => {
  assert.doesNotMatch(demo, /\+\$\s?3,?400/i);
  assert.doesNotMatch(demo, /<\s?8\s?seg/i);
  assert.doesNotMatch(demo, /Tiempo de respuesta|Ingreso mensual recuperado/i);
});

test("public demo route does not load a prospect phone or evidence as page content", () => {
  const routeStart = worker.indexOf('if (path === "/demo" && method === "GET")');
  const routeEnd = worker.indexOf('// 1c. Demo CTA Click Tracking Endpoint', routeStart);
  const route = worker.slice(routeStart, routeEnd);
  assert.match(route, /SELECT id, name FROM prospects WHERE demo_token = \?/);
  assert.doesNotMatch(route, /SELECT id, name, trade, phone|safePhone|tradeName/);
  assert.match(route, /return handleEdgeDemoPage\(\)/);
});
