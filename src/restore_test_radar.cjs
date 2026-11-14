#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const outPath = path.join(__dirname, "test_radar.ts");
const fixturePath = path.join(__dirname, "fixtures", "test_radar.zlib.b64");
const b64 = fs.readFileSync(fixturePath, "utf8").replace(/\s+/g, "");
fs.writeFileSync(outPath, zlib.inflateSync(Buffer.from(b64, "base64")));
console.log("restored", outPath, fs.statSync(outPath).size, "bytes");
