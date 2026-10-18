#!/usr/bin/env node
// Phase 8e-14 UI asset prep: turns the owner's two models-inbox renders into
// the shipped HUD skin under client/public/ui/.
//
//   ui-frame.png (2560×1440, symmetric ornate frame + parchment center)
//     → frame-ornate.webp, the single 9-slice border-image source. The slice
//       inset is MEASURED (center-line scan for the parchment run), not
//       guessed, and echoed as --frame-slice in styles.css.
//   class-icon-set.png (1536×1024, 2 rows × 4 cols of 384×512 parchment tiles)
//     → class-icon-<name>.webp, downscaled to 192×256.
//
// Modes:
//   node tools/prep-ui.mjs --analyze   measure geometry + dump palette (no writes)
//   node tools/prep-ui.mjs             process for real (writes client/public/ui/)
//
// The owner renders are the provenance; processed outputs are credited in
// CREDITS.md as Owner-generated (owned) and gated by
// tools/check-assets.mjs like every other shipped asset class.

import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const frameSrc = join(root, "client/models-inbox/ui-frame.png");
const sheetSrc = join(root, "client/models-inbox/class-icon-set.png");
const outDir = join(root, "client/public/ui");

const ANALYZE = process.argv.includes("--analyze");

/** Tile order in the sheet, row-major (owner-confirmed layout). */
const ICON_NAMES = ["musket", "kilij", "crossbow", "shield", "cannon", "horse", "banner", "helm"];
const SHEET_COLS = 4;
const SHEET_ROWS = 2;

function hex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function meanBox(data, width, x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * width + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
    }
  }
  return [r / n, g / n, b / n];
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Scan a center line inward and find where the ornate border gives way to the
 * steady parchment center: the first index whose following `run` pixels all
 * stay within `threshold` of the center color.
 */
function findInnerEdge(samples, center, threshold, run) {
  for (let i = 0; i < samples.length - run; i += 1) {
    let steady = true;
    for (let k = 0; k < run; k += 1) {
      if (dist(samples[i + k], center) > threshold) { steady = false; break; }
    }
    if (steady) return i;
  }
  return -1;
}

async function analyzeFrame() {
  const { data, info } = await sharp(frameSrc).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (x, y) => [data[(y * w + x) * 4], data[(y * w + x) * 4 + 1], data[(y * w + x) * 4 + 2]];
  console.log(JSON.stringify({ event: "frame_meta", width: w, height: h }));

  // Center parchment color: mean of a box around the exact center.
  const parch = meanBox(data, w, Math.round(w * 0.44), Math.round(h * 0.42), Math.round(w * 0.56), Math.round(h * 0.58));
  console.log(JSON.stringify({ event: "palette", part: "parchment-center", hex: hex(parch) }));

  // Horizontal center-line scan (left + right) for the parchment run.
  const midY = Math.floor(h / 2);
  const rowLeft = Array.from({ length: Math.floor(w / 2) }, (_, x) => px(x, midY));
  const rowRight = Array.from({ length: Math.floor(w / 2) }, (_, x) => px(w - 1 - x, midY));
  const edgeLeft = findInnerEdge(rowLeft, parch, 26, 48);
  const edgeRight = findInnerEdge(rowRight, parch, 26, 48);

  const midX = Math.floor(w / 2);
  const colTop = Array.from({ length: Math.floor(h / 2) }, (_, y) => px(midX, y));
  const colBottom = Array.from({ length: Math.floor(h / 2) }, (_, y) => px(midX, h - 1 - y));
  const edgeTop = findInnerEdge(colTop, parch, 26, 48);
  const edgeBottom = findInnerEdge(colBottom, parch, 26, 48);

  console.log(JSON.stringify({ event: "frame_edges", edgeLeft, edgeRight, edgeTop, edgeBottom, threshold: 26, run: 48 }));

  // Border-band palette: classify pixels of the border region (outside the
  // measured inner rectangle) into bronze / brick-red / gold families and
  // report the mean of each family.
  const inX0 = Math.min(edgeLeft, edgeRight);
  const inY0 = Math.min(edgeTop, edgeBottom);
  const families = { bronze: [], brick: [], gold: [], other: [] };
  const step = 3;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const inside = x > inX0 && x < w - inX0 && y > inY0 && y < h - inY0;
      if (inside) continue;
      const [r, g, b] = px(x, y);
      if (r > 100 && r > g * 1.35 && r > b * 1.35) families.brick.push([r, g, b]);
      else if (r > 120 && g > 80 && g < r * 0.92 && b < g * 0.85) families.gold.push([r, g, b]);
      else if (r < 125 && g < 115 && b < 100) families.bronze.push([r, g, b]);
      else families.other.push([r, g, b]);
    }
  }
  for (const [name, members] of Object.entries(families)) {
    if (members.length === 0) { console.log(JSON.stringify({ event: "palette", part: `border-${name}`, hex: null, count: 0 })); continue; }
    const mean = members.reduce((acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b], [0, 0, 0]).map((v) => v / members.length);
    console.log(JSON.stringify({ event: "palette", part: `border-${name}`, hex: hex(mean), count: members.length }));
  }

  // Corner medallion sample (for the record).
  console.log(JSON.stringify({ event: "palette", part: "corner-40,40", hex: hex(px(40, 40)) }));
  console.log(JSON.stringify({ event: "palette", part: "edge-mid-top", hex: hex(px(midX, 12)) }));
  console.log(JSON.stringify({ event: "palette", part: "edge-mid-left", hex: hex(px(12, midY)) }));
  return { width: w, height: h, edgeLeft, edgeRight, edgeTop, edgeBottom };
}

async function analyzeSheet() {
  const { data, info } = await sharp(sheetSrc).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  console.log(JSON.stringify({ event: "sheet_meta", width: w, height: h, tileW: w / SHEET_COLS, tileH: h / SHEET_ROWS }));
  const tileW = w / SHEET_COLS;
  const tileH = h / SHEET_ROWS;
  // Per-tile mean + dark-glyph coverage (how much of the tile is ink darker
  // than the tile's own parchment). Sanity-checks the grid alignment.
  ICON_NAMES.forEach((name, index) => {
    const col = index % SHEET_COLS;
    const row = Math.floor(index / SHEET_COLS);
    const x0 = Math.round(col * tileW);
    const y0 = Math.round(row * tileH);
    const x1 = Math.round((col + 1) * tileW);
    const y1 = Math.round((row + 1) * tileH);
    const mean = meanBox(data, w, x0, y0, x1, y1);
    let dark = 0, n = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const i = (y * w + x) * 4;
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (lum < 96) dark += 1;
        n += 1;
      }
    }
    console.log(JSON.stringify({ event: "tile", name, mean: hex(mean), darkFraction: Number((dark / n).toFixed(3)) }));
  });
}

/**
 * Measured border coverage at 2560×1440 (see --analyze profiles): the
 * ornate band runs ~32–256 px from the left, ~2288–2560 from the right,
 * ~40–312 from the top, and ~1144–1440 from the bottom, with medallion
 * bulges reaching into the black margin at the midpoints. The slice is the
 * symmetric envelope covering every side's band plus the start of the dark
 * parchment vignette, so no ornament lands in the stretch region.
 */
const FRAME_SLICE_FULL = { top: 320, right: 300, bottom: 320, left: 300 };
const FRAME_BUDGET_BYTES = 400_000;

async function processFrame() {
  const meta = await sharp(frameSrc).metadata();
  // Fallback chain: full resolution first, then 0.75×, then 0.5× — the
  // budget is ≤400 KB. Slice insets scale with the chosen resolution.
  const candidates = [
    { scale: 1, quality: 88 },
    { scale: 0.75, quality: 86 },
    { scale: 0.5, quality: 88 },
  ];
  for (const { scale, quality } of candidates) {
    const width = Math.round(meta.width * scale);
    const height = Math.round(meta.height * scale);
    const { data, size } = await sharp(frameSrc).resize(width, height).webp({ quality }).toBuffer({ resolveWithObject: true });
    if (size > FRAME_BUDGET_BYTES) {
      console.log(JSON.stringify({ event: "frame_skip", scale, quality, bytes: size, reason: "over budget" }));
      continue;
    }
    const outPath = join(outDir, "frame-ornate.webp");
    await sharp(data).toFile(outPath);
    const slice = {
      top: Math.round(FRAME_SLICE_FULL.top * scale),
      right: Math.round(FRAME_SLICE_FULL.right * scale),
      bottom: Math.round(FRAME_SLICE_FULL.bottom * scale),
      left: Math.round(FRAME_SLICE_FULL.left * scale),
    };
    console.log(JSON.stringify({ event: "frame_out", file: outPath, bytes: size, width, height, quality, slice }));
    return;
  }
  throw new Error("frame could not be fit under the 400 KB budget");
}

async function processIcons() {
  const meta = await sharp(sheetSrc).metadata();
  const tileW = meta.width / SHEET_COLS;
  const tileH = meta.height / SHEET_ROWS;
  for (let index = 0; index < ICON_NAMES.length; index += 1) {
    const col = index % SHEET_COLS;
    const row = Math.floor(index / SHEET_COLS);
    const outPath = join(outDir, `class-icon-${ICON_NAMES[index]}.webp`);
    const { size } = await sharp(sheetSrc)
      .extract({ left: Math.round(col * tileW), top: Math.round(row * tileH), width: Math.round(tileW), height: Math.round(tileH) })
      .resize(192, 256)
      .webp({ quality: 86 })
      .toFile(outPath);
    console.log(JSON.stringify({ event: "icon_out", name: ICON_NAMES[index], file: outPath, bytes: size }));
  }
}

async function analyzeFrameDeep() {
  const { data, info } = await sharp(frameSrc).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (x, y) => [data[(y * w + x) * 4], data[(y * w + x) * 4 + 1], data[(y * w + x) * 4 + 2]];

  // Run-length profile of the horizontal center line in 8-px blocks: tells
  // the black-margin width, band structure, and where the center starts.
  const midY = Math.floor(h / 2);
  const blocks = [];
  for (let x = 0; x < w; x += 8) {
    const m = meanBox(data, w, x, midY - 2, Math.min(x + 8, w), midY + 2);
    const lum = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
    const key = lum < 14 ? "K" : lum < 34 ? "D" : lum < 70 ? "B" : lum < 120 ? "W" : "L";
    const last = blocks[blocks.length - 1];
    if (last !== undefined && last.key === key) last.n += 1;
    else blocks.push({ key, n: 1, hex: hex(m) });
  }
  let x = 0;
  const profile = blocks.map((b) => { const s = `${b.key}${b.n * 8}[${b.hex}]@${x}`; x += b.n * 8; return s; });
  console.log(JSON.stringify({ event: "hprofile", y: midY, profile }));

  const midX = Math.floor(w / 2);
  const vblocks = [];
  for (let y = 0; y < h; y += 8) {
    const m = meanBox(data, w, midX - 2, y, midX + 2, Math.min(y + 8, h));
    const lum = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
    const key = lum < 14 ? "K" : lum < 34 ? "D" : lum < 70 ? "B" : lum < 120 ? "W" : "L";
    const last = vblocks[vblocks.length - 1];
    if (last !== undefined && last.key === key) last.n += 1;
    else vblocks.push({ key, n: 1, hex: hex(m) });
  }
  let y = 0;
  const vprofile = vblocks.map((b) => { const s = `${b.key}${b.n * 8}[${b.hex}]@${y}`; y += b.n * 8; return s; });
  console.log(JSON.stringify({ event: "vprofile", x: midX, profile: vprofile }));

  // 24×13 swatch grid (mean hex per ~107×111 px cell) for layout mapping.
  const cols = 24, rows = 13;
  const grid = [];
  for (let gy = 0; gy < rows; gy += 1) {
    const line = [];
    for (let gx = 0; gx < cols; gx += 1) {
      const x0 = Math.floor((gx * w) / cols), x1 = Math.floor(((gx + 1) * w) / cols);
      const y0 = Math.floor((gy * h) / rows), y1 = Math.floor(((gy + 1) * h) / rows);
      line.push(hex(meanBox(data, w, x0, y0, x1, y1)));
    }
    grid.push(line.join(" "));
  }
  grid.forEach((line, row) => console.log(JSON.stringify({ event: "grid", row, line })));

  // True brick-red + bright filigree-gold census in the outer 40% ring.
  const ring = { brick: [], gold: [] };
  for (let yy = 0; yy < h; yy += 4) {
    for (let xx = 0; xx < w; xx += 4) {
      const fx = xx / w, fy = yy / h;
      const inCenter = fx > 0.3 && fx < 0.7 && fy > 0.3 && fy < 0.7;
      if (inCenter) continue;
      const [r, g, b] = px(xx, yy);
      if (r > 95 && r > g * 1.55 && r > b * 1.7) ring.brick.push([r, g, b]);
      if (r > 150 && g > r * 0.6 && g < r * 0.88 && b < g * 0.72) ring.gold.push([r, g, b]);
    }
  }
  for (const [name, members] of Object.entries(ring)) {
    if (members.length === 0) { console.log(JSON.stringify({ event: "palette2", part: name, hex: null, count: 0 })); continue; }
    const mean = members.reduce((acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b], [0, 0, 0]).map((v) => v / members.length);
    console.log(JSON.stringify({ event: "palette2", part: name, hex: hex(mean), count: members.length }));
  }
}

async function main() {
  for (const src of [frameSrc, sheetSrc]) {
    if (!existsSync(src)) {
      console.error(`prep-ui: missing source ${src} (owner drop expected in client/models-inbox/)`);
      process.exit(1);
    }
  }
  await analyzeFrame();
  await analyzeSheet();
  if (ANALYZE) {
    await analyzeFrameDeep();
    console.log(JSON.stringify({ event: "analyze_done" }));
    return;
  }
  mkdirSync(outDir, { recursive: true });
  await processFrame();
  await processIcons();
  console.log(JSON.stringify({ event: "prep_done", outDir }));
}

main().catch((error) => {
  console.error("prep-ui failed:", error);
  process.exit(1);
});
