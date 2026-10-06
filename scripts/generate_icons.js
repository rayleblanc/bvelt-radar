import fs from 'fs';
import zlib from 'zlib';

function createPng(width, height, drawFn) {
  // RGBA buffer
  const buffer = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const color = drawFn(x, y, width, height);
      buffer[idx] = color.r;     // Red
      buffer[idx + 1] = color.g; // Green
      buffer[idx + 2] = color.b; // Blue
      buffer[idx + 3] = color.a; // Alpha
    }
  }

  // Scanlines with filter byte 0
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    scanlines[y * (width * 4 + 1)] = 0; // Filter: None
    buffer.copy(
      scanlines,
      y * (width * 4 + 1) + 1,
      y * width * 4,
      (y + 1) * width * 4
    );
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 });

  // CRC32 implementation
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = data.length;
    const chunk = Buffer.alloc(4 + 4 + len + 4);
    chunk.writeUInt32BE(len, 0);
    chunk.write(type, 4, 4, 'ascii');
    data.copy(chunk, 8);
    const crcBuf = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    chunk.writeUInt32BE(crc32(crcBuf), 8 + len);
    return chunk;
  }

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth
  ihdrData[9] = 6; // Color type: RGBA
  ihdrData[10] = 0; // Compression method
  ihdrData[11] = 0; // Filter method
  ihdrData[12] = 0; // Interlace method

  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngHeader, ihdrChunk, idatChunk, iendChunk]);
}

function radarPainter(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(cx, cy);
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const normDist = dist / maxR;

  // Background: Deep dark navy #020617
  let r = 2, g = 6, b = 23, a = 255;

  // Maskable safe container circle glow
  if (normDist < 0.85) {
    // Inner radial subtle dark-blue gradient #0b152e
    const grad = 1 - normDist;
    r = Math.floor(2 + grad * 12);
    g = Math.floor(6 + grad * 25);
    b = Math.floor(23 + grad * 50);

    // Radar Concentric rings (radii at 0.25, 0.45, 0.65, 0.8)
    const ringRadii = [0.22, 0.42, 0.62, 0.80];
    for (const rr of ringRadii) {
      const ringDist = Math.abs(normDist - rr);
      const ringThickness = 0.015;
      if (ringDist < ringThickness) {
        const intensity = 1 - (ringDist / ringThickness);
        // Cyan / Electric Blue #38bdf8
        r = Math.floor(r * (1 - intensity) + 56 * intensity);
        g = Math.floor(g * (1 - intensity) + 189 * intensity);
        b = Math.floor(b * (1 - intensity) + 248 * intensity);
      }
    }

    // Crosshair lines
    const axisThickness = 1.5;
    if (Math.abs(dx) < axisThickness || Math.abs(dy) < axisThickness) {
      if (normDist > 0.12 && normDist < 0.82) {
        const lineIntensity = 0.4;
        r = Math.floor(r * (1 - lineIntensity) + 59 * lineIntensity);
        g = Math.floor(g * (1 - lineIntensity) + 130 * lineIntensity);
        b = Math.floor(b * (1 - lineIntensity) + 246 * lineIntensity);
      }
    }

    // Radar Sweep beam (in upper right quadrant)
    const angle = Math.atan2(dy, dx); // -PI to PI
    // Sweep between -PI/4 and 0
    if (angle > -Math.PI / 3 && angle < 0 && normDist < 0.80) {
      const sweepFactor = (angle - (-Math.PI / 3)) / (Math.PI / 3);
      const sweepIntensity = Math.pow(sweepFactor, 2) * 0.45 * (1 - normDist * 0.5);
      r = Math.floor(r * (1 - sweepIntensity) + 59 * sweepIntensity);
      g = Math.floor(g * (1 - sweepIntensity) + 130 * sweepIntensity);
      b = Math.floor(b * (1 - sweepIntensity) + 246 * sweepIntensity);
    }

    // Center Core Pulse (Radius < 0.12)
    if (normDist < 0.12) {
      const centerFactor = 1 - (normDist / 0.12);
      // Bright Blue Core #60a5fa -> #ffffff
      r = Math.floor(r * (1 - centerFactor) + 255 * centerFactor);
      g = Math.floor(g * (1 - centerFactor) + 255 * centerFactor);
      b = Math.floor(b * (1 - centerFactor) + 255 * centerFactor);
    }

    // Blip Target Indicator in sweep zone
    const blipX = cx + maxR * 0.45;
    const blipY = cy - maxR * 0.25;
    const blipDist = Math.sqrt((x - blipX) * (x - blipX) + (y - blipY) * (y - blipY));
    if (blipDist < maxR * 0.055) {
      const blipFactor = 1 - (blipDist / (maxR * 0.055));
      // Neon Emerald / Cyan blip
      r = Math.floor(r * (1 - blipFactor) + 52 * blipFactor);
      g = Math.floor(g * (1 - blipFactor) + 211 * blipFactor);
      b = Math.floor(b * (1 - blipFactor) + 153 * blipFactor);
    }
  }

  return { r, g, b, a };
}

// Generate files
const p192 = createPng(192, 192, radarPainter);
fs.writeFileSync('public/icon-192.png', p192);
console.log('Created public/icon-192.png (192x192 PNG)');

const p512 = createPng(512, 512, radarPainter);
fs.writeFileSync('public/icon-512.png', p512);
console.log('Created public/icon-512.png (512x512 PNG)');

const p180 = createPng(180, 180, radarPainter);
fs.writeFileSync('public/apple-touch-icon.png', p180);
console.log('Created public/apple-touch-icon.png (180x180 PNG)');
