#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const https = require("https");
const outPath = path.join(__dirname, "test_radar.ts");

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "bvelt-radar-ci" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error("HTTP " + res.statusCode + " for " + url));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject);
  });
}

(async () => {
  const url =
    "https://raw.githubusercontent.com/rayleblanc/bvelt-radar/1bcdc38e4a0c1ac4e8ffdf90269641d34711426b/src/test_radar.ts";
  let text = await get(url);
  text = text.replace(
    /evidence: \{ contact_form_observed: true \},\n            content_hash: "hash_001",/,
    'evidence: { contact_form_observed: true },\n            content_hash: "a".repeat(64),'
  );
  text = text.replace(/content_hash: "hash_tenantB_cross"/, 'content_hash: "c".repeat(64)');
  text = text.replace(/content_hash: "hash_unknown"/, 'content_hash: "d".repeat(64)');
  text = text.replace(
    /batch: async \(statements: any\[\]\) => Promise\.all\(statements\.map\(statement => statement\.run\(\)\)\),/g,
    "batch: async (statements: any[]) => Promise.all(statements.map((statement: any) => {\n        if (statement && typeof statement.run === \"function\") return statement.run();\n        return { success: true, meta: { changes: 0 } };\n      })),"
  );
  fs.writeFileSync(outPath, text);
  console.log("restored+fixed", outPath, fs.statSync(outPath).size, "bytes");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
