#!/usr/bin/env node
// Phase 8e-18: envelope measurement for audio windowing decisions — the
// ADR 0030 discipline (every SAMPLE_WINDOWS offset/duration/gain is measured,
// not guessed). Decodes any afconvert-readable file (m4a/wav/aiff/flac→WAV)
// and prints:
//   - duration, peak, overall RMS
//   - a 50 ms-resolution RMS sparkline (block chars, one line per 2 s)
//   - detected transient onsets (8× the 200 ms noise floor within 15 ms)
//   - per-onset candidate windows: RMS of [onset, onset+0.75 s] vs the first
//     onset's window (the gain-compensation ratio the SAMPLE_WINDOWS `gain`
//     field uses, peak-limited like ADR 0030's table)
//
// Usage: node tools/audio-envelope.mjs <file...> [--windows t0,dur t1,dur ...]
// With --windows, also prints RMS/peak for each explicit window (for verifying
// a chosen slice before pinning it in SAMPLE_WINDOWS).
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RATE = 22050;

function decode(file) {
  const tmp = mkdtempSync(join(tmpdir(), "envelope-"));
  const wavPath = join(tmp, "x.wav");
  execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${RATE}`, "-c", "1", file, wavPath], { stdio: "pipe" });
  const wav = readFileSync(wavPath);
  // Walk RIFF chunks to find "data" (fmt may carry extension bytes).
  let offset = 12;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "data") {
      dataOffset = offset + 8;
      dataLength = Math.min(size, wav.length - dataOffset);
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataOffset < 0) throw new Error(`no data chunk in ${file}`);
  const count = Math.floor(dataLength / 2);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i += 1) samples[i] = wav.readInt16LE(dataOffset + i * 2) / 32768;
  return samples;
}

function windowStats(samples, t0, dur) {
  const start = Math.max(0, Math.floor(t0 * RATE));
  const end = Math.min(samples.length, Math.floor((t0 + dur) * RATE));
  let sum = 0;
  let peak = 0;
  for (let i = start; i < end; i += 1) {
    const s = Math.abs(samples[i] ?? 0);
    sum += s * s;
    if (s > peak) peak = s;
  }
  const n = Math.max(1, end - start);
  return { rms: Math.sqrt(sum / n), peak };
}

const SPARKS = " ▁▂▃▄▅▆▇█";

function analyze(file, explicitWindows) {
  const samples = decode(file);
  const duration = samples.length / RATE;
  const { rms, peak } = windowStats(samples, 0, duration);
  // 50 ms sparkline.
  const cell = 0.05;
  const cells = Math.ceil(duration / cell);
  const env = new Array(cells).fill(0);
  for (let c = 0; c < cells; c += 1) env[c] = windowStats(samples, c * cell, cell).rms;
  const envMax = Math.max(...env, 1e-6);
  const lines = [];
  for (let c = 0; c < cells; c += 40) {
    const slice = env.slice(c, c + 40).map((v) => SPARKS[Math.min(8, Math.round((v / envMax) * 8))]).join("");
    lines.push(`  ${(c * cell).toFixed(2).padStart(6)}s |${slice}|`);
  }
  // Onsets: 15 ms RMS jumps above 8× the trailing 200 ms floor.
  const fine = 0.015;
  const fineCells = Math.ceil(duration / fine);
  const fineEnv = new Array(fineCells).fill(0);
  for (let c = 0; c < fineCells; c += 1) fineEnv[c] = windowStats(samples, c * fine, fine).rms;
  const onsets = [];
  for (let c = 1; c < fineCells; c += 1) {
    const floorStart = Math.max(0, c - 13);
    let floor = 0;
    for (let k = floorStart; k < c; k += 1) floor += fineEnv[k] ?? 0;
    floor = (floor / Math.max(1, c - floorStart)) || 1e-6;
    const v = fineEnv[c] ?? 0;
    if (v > Math.max(floor * 8, rms * 1.6) && (onsets.length === 0 || c * fine - (onsets[onsets.length - 1] ?? 0) > 0.25)) {
      onsets.push(c * fine);
    }
  }
  console.log(`\n=== ${file}`);
  console.log(`  duration ${duration.toFixed(3)}s  peak ${peak.toFixed(3)}  rms ${rms.toFixed(4)}`);
  for (const line of lines) console.log(line);
  if (onsets.length > 0) {
    console.log(`  onsets: ${onsets.map((t) => t.toFixed(3)).join("  ")}`);
    const ref = windowStats(samples, onsets[0] ?? 0, 0.75);
    for (const t of onsets) {
      const w = windowStats(samples, t, 0.75);
      const comp = ref.rms / Math.max(1e-6, w.rms);
      // ADR 0030 discipline: compensate window RMS to the reference, but never
      // let a full-scale transient exceed ~1.2 pre-bus.
      const clamped = Math.min(comp, 1.2 / Math.max(1e-6, w.peak));
      console.log(`    window @${t.toFixed(3)} +0.75s: rms ${w.rms.toFixed(4)} peak ${w.peak.toFixed(3)} gainComp ${comp.toFixed(2)} → clamped ${clamped.toFixed(2)}`);
    }
  }
  for (const [t0, dur] of explicitWindows) {
    const w = windowStats(samples, t0, dur);
    console.log(`    explicit [${t0}, +${dur}]: rms ${w.rms.toFixed(4)} peak ${w.peak.toFixed(3)}`);
  }
}

const args = process.argv.slice(2);
const sep = args.indexOf("--windows");
const files = sep === -1 ? args : args.slice(0, sep);
const windows = [];
if (sep !== -1) {
  for (const spec of args.slice(sep + 1)) {
    const [t0, dur] = spec.split(",").map(Number);
    if (Number.isFinite(t0) && Number.isFinite(dur)) windows.push([t0, dur]);
  }
}
if (files.length === 0) {
  console.error("usage: node tools/audio-envelope.mjs <file...> [--windows t0,dur ...]");
  process.exit(1);
}
for (const file of files) analyze(file, windows);
