#!/usr/bin/env node
// Phase 8e-2 Task 2 spectral sanity check (ADR 0030): two consecutive bot
// volleys must no longer produce near-identical waveform envelopes.
//
// Method (repeatable, macOS): decode each gunshot asset to 16-bit WAV via
// afconvert, then simulate a volley of 8 shots on the pre-8e-2 bot cadence
// (250–400 ms spacing, seeded PRNG):
//   PRE  — every shot is the same sample at rate 1.0 / gain 1.0 (the 8e-1 mix);
//   POST — each shot draws a random variant (no immediate repeat), a
//          playbackRate jitter in 0.92–1.08 (linear resample), and a ±15%
//          gain jitter — the exact ranges from audioEngine.ts.
// Metric: the "robotic" character is every shot carrying the SAME envelope,
// so per-shot envelopes (10 ms RMS windows, gain-normalized) are correlated
// pairwise within each volley and averaged. Timing plays no role — each shot
// is windowed at its own onset. PRE ≈ 1.0 (identical buffer); POST must read
// clearly lower. Fixed seeds make every run identical.
//
// Usage: node tools/volley-spectral-check.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = [
  { key: "gunshot", file: "audio/gunshot.mp3", offset: 0.06, duration: 0.75 },
  { key: "gunshot-b", file: "audio/gunshot-2.mp3", offset: 0.065, duration: 0.75, gain: 1.33 },
  { key: "gunshot-c", file: "audio/gunshot-3.mp3", offset: 0.015, duration: 0.75, gain: 2.11 },
  { key: "gunshot-d", file: "audio/gunshot-4.mp3", offset: 0.04, duration: 0.8, gain: 1.41 },
  { key: "gunshot-e", file: "audio/gunshot-5.wav", offset: 0.06, duration: 0.75, gain: 1.41 },
  // ADR 0045: real-musket session event (one ~0.9 s lock+report+echo).
  { key: "gunshot-f", file: "audio/musket-shots-session.m4a", offset: 0.01, duration: 0.8, gain: 1.73 },
];
const SHOTS_PER_VOLLEY = 8;
const VOLLEY_SECONDS = 3.2;
const RATE = 22050; // analysis rate; envelopes are robust to downsample

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function decodeToMono16(file) {
  const tmp = mkdtempSync(join(tmpdir(), "volley-"));
  const wavPath = join(tmp, "decoded.wav");
  execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${RATE}`, "-c", "1", join(root, "client/public", file), wavPath]);
  const buf = readFileSync(wavPath);
  // Minimal PCM-WAV parse: find the data chunk.
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      const frames = Math.floor(size / 2);
      const pcm = new Float64Array(frames);
      for (let i = 0; i < frames; i += 1) pcm[i] = buf.readInt16LE(offset + 8 + i * 2) / 32768;
      return pcm;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${file}`);
}

function slice(asset) {
  const pcm = asset.pcm;
  const a = Math.floor(asset.offset * RATE);
  const b = Math.min(pcm.length, Math.floor((asset.offset + asset.duration) * RATE));
  return pcm.slice(a, b);
}

function resample(pcm, rate) {
  if (rate === 1) return pcm;
  const out = new Float64Array(Math.floor(pcm.length / rate));
  for (let i = 0; i < out.length; i += 1) {
    const pos = i * rate;
    const base = Math.floor(pos);
    const frac = pos - base;
    out[i] = (pcm[base] ?? 0) * (1 - frac) + (pcm[base + 1] ?? pcm[base] ?? 0) * frac;
  }
  return out;
}

function simulateVolley(seed, post) {
  const rand = mulberry32(seed);
  const shots = [];
  let lastVariant = -1;
  for (let shot = 0; shot < SHOTS_PER_VOLLEY; shot += 1) {
    let variant = 0;
    let rate = 1;
    let gain = 1;
    if (post) {
      variant = Math.floor(rand() * ASSETS.length);
      if (variant === lastVariant) variant = (variant + 1) % ASSETS.length;
      lastVariant = variant;
      rate = 0.92 + rand() * 0.16;
      gain = 0.85 + rand() * 0.3;
    }
    const asset = ASSETS[variant];
    shots.push({ pcm: resample(slice(asset), rate), gain: gain * (asset.gain ?? 1), key: asset.key });
  }
  return shots;
}

function envelopeOf(pcm) {
  const win = Math.floor(RATE * 0.01);
  const out = [];
  for (let i = 0; i + win <= pcm.length; i += win) {
    let acc = 0;
    for (let k = 0; k < win; k += 1) acc += pcm[i + k] * pcm[i + k];
    out.push(Math.sqrt(acc / win));
  }
  return out;
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i += 1) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i += 1) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** Mean pairwise envelope correlation of the shots inside one volley —
 * the "every shot sounds identical" metric. */
function volleySelfCorrelation(shots) {
  const envelopes = shots.map((shot) => envelopeOf(shot.pcm));
  let sum = 0;
  let count = 0;
  for (let i = 0; i < envelopes.length; i += 1) {
    for (let j = i + 1; j < envelopes.length; j += 1) {
      sum += pearson(envelopes[i], envelopes[j]);
      count += 1;
    }
  }
  return count === 0 ? 1 : sum / count;
}

for (const asset of ASSETS) asset.pcm = decodeToMono16(asset.file);

const pre = volleySelfCorrelation(simulateVolley(101, false));
const post = volleySelfCorrelation(simulateVolley(202, true));
const postSecond = volleySelfCorrelation(simulateVolley(303, true));
console.log(`PRE  (same sample, no jitter):  mean pairwise shot-envelope correlation = ${pre.toFixed(3)}`);
console.log(`POST (variants + pitch/gain jitter): volley A = ${post.toFixed(3)}, volley B = ${postSecond.toFixed(3)}`);
const pass = pre > 0.95 && post < pre - 0.3 && postSecond < pre - 0.3;
console.log(pass ? "PASS: consecutive volleys no longer share an envelope" : "FAIL: post-change volleys still correlate");
process.exit(pass ? 0 : 1);
