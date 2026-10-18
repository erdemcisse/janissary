#!/usr/bin/env node
// Phase 8e-14 readability guard: the medieval skin is verified by-eye by the
// owner, but contrast is verified HERE, programmatically. Computes WCAG 2.x
// relative-luminance contrast ratios for every text/ground pairing the skin
// ships, samples the processed frame's center fill to prove the 9-slice
// source still carries the dark parchment the CSS relies on, and reports the
// icon tiles' parchment-vs-card separation. Exits non-zero if any text pair
// drops below its threshold.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const framePath = join(root, "client/public/ui/frame-ornate.webp");
const stylesPath = join(root, "client/src/styles.css");

// --- WCAG relative luminance + contrast ratio -------------------------------

function channelToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]) {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// --- the pairings the skin ships (values must match styles.css) -------------

const INK = hexToRgb("#efe6d2");
const INK_DIM = hexToRgb("#c0b295");
const INK_FAINT = hexToRgb("#8f8570");
const GOLD = hexToRgb("#c19a52");
const GOLD_BRIGHT = hexToRgb("#e6bd7a");
const TEAM_OT = hexToRgb("#e0695c");
const TEAM_BZ = hexToRgb("#9a7bd8");
const BUTTON_TEXT = hexToRgb("#1a201a");
const CHROME_BG_SOLID = hexToRgb("#201709");
const CARD_BG = hexToRgb("#241a0e"); // mean of the class-card gradient (#2c2113 → #1c1409)
// Worst case for the death-screen light ink: the rgba(10,7,5,0.62) overlay
// blended over bright battlefield terrain (~#9aa878 grass/sky band).
const DEATH_BG = [0.62 * 10 + 0.38 * 154, 0.62 * 7 + 0.38 * 168, 0.62 * 5 + 0.38 * 120];

const results = [];
function check(name, ratio, threshold) {
  const pass = ratio >= threshold;
  results.push({ name, ratio: Number(ratio.toFixed(2)), threshold, pass });
  if (!pass) console.error(`contrast: FAIL ${name} — ${ratio.toFixed(2)} < ${threshold}`);
}

// --- sample the shipped frame fill + icon tiles ------------------------------

async function sampleFrameCenter() {
  const { data, info } = await sharp(framePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cx = Math.floor(info.width / 2);
  const cy = Math.floor(info.height / 2);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = cy - 40; y < cy + 40; y += 1) {
    for (let x = cx - 40; x < cx + 40; x += 1) {
      const i = (y * info.width + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
    }
  }
  return [r / n, g / n, b / n];
}

async function main() {
  // Sanity: styles.css must still carry the palette this checker pins.
  const styles = readFileSync(stylesPath, "utf8");
  for (const token of ["#efe6d2", "#c0b295", "#8f8570", "#c19a52", "#e6bd7a", "#201709", "frame-ornate.webp"]) {
    if (!styles.includes(token)) {
      console.error(`contrast: styles.css no longer contains ${token} — update this checker alongside the palette`);
      process.exit(1);
    }
  }

  const fill = await sampleFrameCenter();
  console.log(JSON.stringify({ event: "frame_fill_sampled", hex: `#${fill.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}` }));
  // The whole readability case rests on the fill being DARK parchment: light
  // ink must clear 4.5:1 on it. Also pin it near the source measurement
  // (#342515) so a re-processed frame can't silently lighten the center.
  const sourceCenter = hexToRgb("#342515");
  const drift = Math.hypot(fill[0] - sourceCenter[0], fill[1] - sourceCenter[1], fill[2] - sourceCenter[2]);
  if (drift > 24) {
    console.error(`contrast: frame center fill drifted from the measured source (#342515) by ${drift.toFixed(1)} — re-check the readability verdict`);
    process.exit(1);
  }

  // Text on the framed-panel fill (menu, scoreboard, ceremony, connect, upgrade).
  check("ink on frame fill", contrast(INK, fill), 4.5);
  check("ink-dim on frame fill", contrast(INK_DIM, fill), 4.5);
  check("gold-bright on frame fill", contrast(GOLD_BRIGHT, fill), 4.5);
  check("team-ot on frame fill", contrast(TEAM_OT, fill), 3.0); // large/bold names
  check("team-bz on frame fill", contrast(TEAM_BZ, fill), 3.0);

  // Text on the small-HUD bronze chrome.
  check("ink on chrome", contrast(INK, CHROME_BG_SOLID), 4.5);
  check("ink-dim on chrome", contrast(INK_DIM, CHROME_BG_SOLID), 4.5);
  check("gold-bright on chrome", contrast(GOLD_BRIGHT, CHROME_BG_SOLID), 4.5);
  check("gold (eyebrow) on chrome", contrast(GOLD, CHROME_BG_SOLID), 4.5);

  // Class cards + death overlay.
  check("ink on class card", contrast(INK, CARD_BG), 4.5);
  check("ink-dim on class card", contrast(INK_DIM, CARD_BG), 4.5);
  check("ink on death overlay", contrast(INK, DEATH_BG), 4.5);
  check("team-ot on chrome (kill feed)", contrast(TEAM_OT, CHROME_BG_SOLID), 3.0);
  check("team-bz on chrome (kill feed)", contrast(TEAM_BZ, CHROME_BG_SOLID), 3.0);

  // Gold button gradient with dark text (deploy/resume/active tabs).
  const gradientMean = [
    (hexToRgb("#e6bd7a")[0] + hexToRgb("#c19a52")[0]) / 2,
    (hexToRgb("#e6bd7a")[1] + hexToRgb("#c19a52")[1]) / 2,
    (hexToRgb("#e6bd7a")[2] + hexToRgb("#c19a52")[2]) / 2,
  ];
  check("button text on gold gradient", contrast(BUTTON_TEXT, gradientMean), 4.5);

  // Icon tiles: graphical UI components need ≥3:1 against the card they sit on.
  const tiles = ["musket", "kilij", "crossbow", "shield", "cannon", "horse", "banner", "helm"];
  for (const name of tiles) {
    const { data, info } = await sharp(join(root, `client/public/ui/class-icon-${name}.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1; }
    const mean = [r / n, g / n, b / n];
    check(`tile ${name} vs card bg`, contrast(mean, CARD_BG), 3.0);
  }

  // ink-faint is the micro-label register (kbd hints, minimap legend, caps).
  // It was already ~5.3 on the pre-8e-14 chrome; report it but hold it to
  // the WCAG large-text/UI threshold, not body text.
  check("ink-faint on chrome (micro-labels)", contrast(INK_FAINT, CHROME_BG_SOLID), 3.0);

  console.log(JSON.stringify({ event: "contrast_results", results }));
  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) {
    console.error(`contrast: ${failed.length} pairing(s) below threshold`);
    process.exit(1);
  }
  console.log(`contrast: ok — ${results.length} pairings verified (frame fill sampled from the shipped webp)`);
}

main().catch((error) => {
  console.error("contrast check failed:", error);
  process.exit(1);
});
