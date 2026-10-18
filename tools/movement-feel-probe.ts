import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

/**
 * Movement-feel probe (Phase 8e-6 Task 0): drives a headed client through the
 * glitch situations from the owner's report — flat sprint, jump spam, plateau
 * step-up, wall strafe, ford wade — via the dev-only `__gameDebug.movement`
 * scripted-input hook, and records the client's per-frame prediction data
 * (fixed vs rendered state, reconcile errors, correction count, pending
 * depth, frame time). Output: one JSON stats line per scenario plus full
 * traces saved to docs/loadtests/ for the ADR.
 *
 * Prereqs: dev servers on :5173/:9001, headed Chrome with
 * --remote-debugging-port=9333. Usage: pnpm --filter @janissary/tools exec
 * tsx movement-feel-probe.ts [target] [tag] [scenariosCsv]
 */

const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const TAG = process.argv[3] ?? "base";
const SCENARIOS = (process.argv[4] ?? "meadow,jump,plateau,wall,ford").split(",");

// shared/src/constants.ts InputButton bits (const enum — kept in sync by hand).
const BTN = { forward: 1, backward: 2, left: 4, right: 8, jump: 4096 } as const;

interface CdpResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message: string };
}

function connectCdp(url: string): Promise<{ ws: WebSocket; send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    let nextId = 1;
    const pending = new Map<number, { resolve: (r: Record<string, unknown>) => void; reject: (e: Error) => void }>();
    ws.on("open", () => {
      const send = (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
        const id = nextId++;
        return new Promise((res, rej) => {
          pending.set(id, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      };
      ws.on("message", (data) => {
        const message = JSON.parse(String(data)) as CdpResponse;
        const handler = pending.get(message.id);
        if (handler === undefined) return;
        pending.delete(message.id);
        if (message.error !== undefined) handler.reject(new Error(`${message.error.message ?? "cdp error"}`));
        else handler.resolve(message.result ?? {});
      });
      resolve({ ws, send });
    });
    ws.on("error", reject);
  });
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type Send = (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;

async function evaluate(send: Send, expression: string): Promise<unknown> {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails !== undefined) throw new Error(JSON.stringify(result.exceptionDetails));
  const value = result.result as { value?: unknown } | undefined;
  return value?.value;
}

interface DebugState {
  x: number;
  y: number;
  z: number;
  grounded: boolean;
  alive: boolean;
  corrections: number;
  pending: number;
  lastError: number;
}

interface TraceSample {
  t: number;
  dt: number;
  fx: number;
  fy: number;
  fz: number;
  rx: number;
  ry: number;
  rz: number;
  ox: number;
  oy: number;
  oz: number;
  acc: number;
  grounded: boolean;
  pending: number;
  err: number;
  corr: number;
}

const state = (send: Send): Promise<DebugState> =>
  evaluate(send, `window.__gameDebug?.movement.state()`) as Promise<DebugState>;

const drive = (send: Send, buttons: number, yaw: number): Promise<unknown> =>
  evaluate(send, `window.__gameDebug?.movement.drive(${buttons}, ${yaw})`);

const driveStop = (send: Send): Promise<unknown> => evaluate(send, `window.__gameDebug?.movement.driveStop()`);

/** Steer toward (tx, tz) holding Forward; resolves true on arrival, false on
 * timeout, and throws "died" if the probe player is killed mid-drive. */
async function driveTo(send: Send, tx: number, tz: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await state(send);
    if (!s.alive) throw new Error("died");
    const dx = tx - s.x;
    const dz = tz - s.z;
    if (Math.hypot(dx, dz) < 2) {
      await driveStop(send);
      return true;
    }
    await drive(send, BTN.forward, Math.atan2(-dx, -dz));
    await sleep(100);
  }
  await driveStop(send);
  return false;
}

async function ensureAlive(send: Send): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const s = await state(send);
    if (s.alive) return;
    await sleep(500);
  }
  throw new Error("never alive");
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

function stats(values: readonly number[]): { p50: number; p95: number; max: number; mean: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
  return {
    p50: Number(percentile(sorted, 50).toFixed(4)),
    p95: Number(percentile(sorted, 95).toFixed(4)),
    max: Number((sorted[sorted.length - 1] ?? 0).toFixed(4)),
    mean: Number(mean.toFixed(4)),
  };
}

function analyze(samples: readonly TraceSample[]): Record<string, unknown> {
  // Cut discontinuity windows: a reconcile error above 0.5 m is a respawn or
  // teleport, not prediction noise — drop it and the surrounding 1 s.
  const clean = samples.filter((sample) => {
    if (sample.err > 0.5) return false;
    return !samples.some((other) => other.err > 0.5 && Math.abs(other.t - sample.t) < 1_000);
  });
  const seconds = clean.length > 1 ? ((clean[clean.length - 1]?.t ?? 0) - (clean[0]?.t ?? 0)) / 1_000 : 0;
  const errors = clean.filter((sample) => sample.err >= 0).map((sample) => sample.err);
  const corrStart = clean[0]?.corr ?? 0;
  const corrEnd = clean[clean.length - 1]?.corr ?? 0;
  const groundedY = clean.filter((sample) => sample.grounded).map((sample) => Math.abs(sample.ry - sample.fy));
  const airborneY = clean.filter((sample) => !sample.grounded).map((sample) => Math.abs(sample.ry - sample.fy));
  const horizontal = clean.map((sample) => Math.hypot(sample.rx - sample.fx, sample.rz - sample.fz));
  const smoother = clean.map((sample) => Math.hypot(sample.ox, sample.oy, sample.oz));
  // Visible vertical vibration: frame-to-frame rendered-y delta magnitude on
  // normal frames (skip >40 ms stalls, per audit §4.1 do-not-chase-artifacts).
  const dy: number[] = [];
  const dxz: number[] = [];
  for (let index = 1; index < clean.length; index += 1) {
    const prev = clean[index - 1];
    const next = clean[index];
    if (prev === undefined || next === undefined || next.dt > 40) continue;
    dy.push(Math.abs(next.ry + next.oy - prev.ry - prev.oy));
    dxz.push(Math.hypot(next.rx + next.ox - prev.rx - prev.ox, next.rz + next.oz - prev.rz - prev.oz));
  }
  const corrections = corrEnd - corrStart;
  return {
    samples: clean.length,
    seconds: Number(seconds.toFixed(1)),
    reconciles: errors.length,
    reconcilePerSecond: seconds > 0 ? Number((errors.length / seconds).toFixed(1)) : 0,
    errorMeters: stats(errors),
    corrections,
    correctionsPerSecond: seconds > 0 ? Number((corrections / seconds).toFixed(2)) : 0,
    renderVsFixedYGrounded: stats(groundedY),
    renderVsFixedYAirborne: stats(airborneY),
    renderVsFixedHorizontal: stats(horizontal),
    smootherOffsetMeters: stats(smoother),
    frameDeltaY: stats(dy),
    frameDeltaXZ: stats(dxz),
    pendingInputs: stats(clean.map((sample) => sample.pending)),
    frameMs: stats(clean.map((sample) => sample.dt)),
  };
}

type Scenario = (send: Send) => Promise<void>;

const SCENARIO_SCRIPTS: Record<string, Scenario> = {
  // Sprint straight at midfield on flat ground for 7 s.
  meadow: async (send) => {
    const deadline = Date.now() + 7_000;
    while (Date.now() < deadline) {
      const s = await state(send);
      if (!s.alive) throw new Error("died");
      await drive(send, BTN.forward, Math.atan2(-(0 - s.x), -(0 - s.z)));
      await sleep(100);
    }
    await driveStop(send);
  },
  // Same sprint with a jump every ~550 ms (150 ms hold) for 8 s.
  jump: async (send) => {
    const deadline = Date.now() + 8_000;
    let jumping = false;
    let toggleAt = 0;
    while (Date.now() < deadline) {
      const s = await state(send);
      if (!s.alive) throw new Error("died");
      const now = Date.now();
      if (now >= toggleAt) {
        jumping = !jumping;
        toggleAt = now + (jumping ? 150 : 400);
      }
      await drive(send, BTN.forward | (jumping ? BTN.jump : 0), Math.atan2(-(0 - s.x), -(0 - s.z)));
      await sleep(50);
    }
    await driveStop(send);
  },
  // Plateau-1 at (-132, -85): approach from the east, climb the step-up side,
  // cross, descend the west side. The classic "slope" of the owner's report.
  plateau: async (send) => {
    await driveTo(send, -105, -85, 90_000);
    await driveTo(send, -132, -85, 30_000);
    await driveTo(send, -160, -85, 30_000);
  },
  // Slide along the attacker face of the city wall: into the wall + strafe.
  wall: async (send) => {
    const arrived = await driveTo(send, 40, 20, 90_000);
    if (!arrived) return;
    await drive(send, BTN.forward | BTN.right, 0);
    await sleep(3_000);
    await drive(send, BTN.forward | BTN.left, 0);
    await sleep(3_000);
    await driveStop(send);
  },
  // Cross the northern ford (-327, 110) east to west through the wade zone.
  ford: async (send) => {
    await driveTo(send, -295, 110, 120_000);
    await driveTo(send, -360, 110, 90_000);
  },
};

async function main(): Promise<void> {
  let targets: { id: string; type: string; url: string; webSocketDebuggerUrl?: string }[] = [];
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
      targets = await response.json() as typeof targets;
      if (targets.length > 0) break;
    } catch {
      // chrome not up yet
    }
    await sleep(500);
  }
  const page = targets.find((target) => target.type === "page");
  const wsUrl = page?.webSocketDebuggerUrl;
  if (page === undefined || wsUrl === undefined) {
    console.log(JSON.stringify({ event: "cdp_error", detail: "no page target" }));
    process.exit(1);
  }
  const { ws, send } = await connectCdp(wsUrl);
  await send("Runtime.enable");
  await send("Page.enable");

  console.log(JSON.stringify({ event: "phase", tag: TAG, scenarios: SCENARIOS, detail: "navigate" }));
  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);
  await evaluate(send, `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: "high" }));
    localStorage.setItem("janissary-name", "MoveProbe-${TAG}");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);

  const joinResult = await evaluate(send, `(() => {
    const input = document.querySelector(".connect-card input");
    if (input === null) return "no-join-form";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "MoveProbe-${TAG}");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".connect-card button").click();
    return "joined-submit";
  })()`);
  console.log(JSON.stringify({ event: "join", result: joinResult }));
  await sleep(4_000);
  await ensureAlive(send);
  const spawn = await state(send);
  console.log(JSON.stringify({ event: "spawn", x: Number(spawn.x.toFixed(1)), z: Number(spawn.z.toFixed(1)) }));

  const traces: Record<string, TraceSample[]> = {};
  for (const name of SCENARIOS) {
    const script = SCENARIO_SCRIPTS[name];
    if (script === undefined) {
      console.log(JSON.stringify({ event: "scenario-skipped", name, reason: "unknown" }));
      continue;
    }
    let outcome = "ok";
    let trace: TraceSample[] = [];
    // Combat deaths pollute a trace; retry up to three times for a clean run.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await ensureAlive(send);
      } catch {
        console.log(JSON.stringify({ event: "scenario-aborted", name, reason: "never respawned" }));
        outcome = "never-respawned";
        break;
      }
      await sleep(1_000);
      await evaluate(send, `window.__gameDebug?.movement.traceStart()`);
      try {
        await script(send);
        outcome = "ok";
      } catch (error) {
        outcome = String(error);
      }
      await driveStop(send);
      trace = (await evaluate(send, `window.__gameDebug?.movement.traceStop()`)) as TraceSample[];
      console.log(JSON.stringify({ event: "scenario", tag: TAG, name, attempt, outcome, ...analyze(trace) }));
      if (outcome === "ok") break;
      await sleep(1_000);
    }
    traces[name] = trace;
  }

  const tracesDir = fileURLToPath(new URL("../docs/loadtests/", import.meta.url));
  mkdirSync(tracesDir, { recursive: true });
  writeFileSync(`${tracesDir}8e-6-movement-${TAG}.json`, JSON.stringify({ tag: TAG, at: new Date().toISOString(), traces }));
  console.log(JSON.stringify({ event: "done", tag: TAG, tracesFile: `docs/loadtests/8e-6-movement-${TAG}.json` }));
  ws.close();
  process.exit(0);
}

main().catch((error) => {
  console.log(JSON.stringify({ event: "probe_error", detail: String(error) }));
  process.exit(1);
});
