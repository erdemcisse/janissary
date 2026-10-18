import { writeFileSync } from "node:fs";
import WebSocket from "ws";

/**
 * Phase 8e-7 scripted browser proof (ADS):
 *  1. Screenshots — unaimed vs aimed view (FOV zoom + centered viewmodel) and
 *     the reload radial still readable while aiming.
 *  2. Live dispersion A/B — N shots unaimed vs N shots aimed at the nearest
 *     enemy from a standing position in the 70–130 m band; hit counts come
 *     from the client's own Fire/Hit counters (`__gameDebug.combat`).
 *  3. F3 fps/frame-p95 samples at high tier (ADR 0029 baseline: 18.0 ms p95).
 *
 * Input is driven through `__gameDebug.movement.drive` (dev-only override that
 * feeds the same fixed-step input sampler as the DOM path), so no synthetic
 * mouse movement is needed. Prereqs: dev servers on :5173/:9001, Chrome with
 * --remote-debugging-port=9333.
 */
const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const SHOTS_PER_ARM = Number.parseInt(process.argv[3] ?? "12", 10);
/** "shots" = screenshots only (viewmodel pose iteration); default = full. */
const MODE = process.argv[4] ?? "full";
const SHOT_DIR = new URL("../docs/image-feedback/", import.meta.url).pathname;

/** InputButton bits (shared/src/constants.ts). */
const BTN = { fire: 1 << 4, reload: 1 << 5, aim: 1 << 13 } as const;
/** Dispersion arm distance band (m, horizontal). */
const BAND_MIN = 70;
const BAND_MAX = 130;
/** Re-aim tolerance per shot — outside this, reposition before the shot. */
const SHOT_MIN = 40;
const SHOT_MAX = 140;

interface CdpResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message: string };
}

function connectCdp(url: string): Promise<{ ws: WebSocket; send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { perMessageDeflate: false });
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

async function evaluate(send: Send, expression: string, awaitPromise = false): Promise<unknown> {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (result.exceptionDetails !== undefined) return { __exception: result.exceptionDetails };
  const value = result.result as { value?: unknown } | undefined;
  return value?.value;
}

async function screenshot(send: Send, name: string): Promise<void> {
  const result = await send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
  const data = result.data as string | undefined;
  if (data === undefined) {
    console.log(JSON.stringify({ event: "screenshot_error", name }));
    return;
  }
  const path = `${SHOT_DIR}/${name}.jpg`;
  writeFileSync(path, Buffer.from(data, "base64"));
  console.log(JSON.stringify({ event: "screenshot", path }));
}

async function key(send: Send, code: string, keyName: string, vk: number, holdMs = 160): Promise<void> {
  // The fixed input step samples `buttons` at 20 Hz: an instant down/up pair
  // can fall between two samples and never reach the wire. Hold like a human.
  await send("Input.dispatchKeyEvent", { type: "keyDown", code, key: keyName, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(holdMs);
  await send("Input.dispatchKeyEvent", { type: "keyUp", code, key: keyName, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}

async function canvasCenter(send: Send): Promise<[number, number]> {
  const rect = await evaluate(send, `(() => { const c = document.querySelector(".game-container canvas"); if (c === null) return null; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  if (rect === null || typeof rect !== "object") return [800, 450];
  const { x, y, w, h } = rect as { x: number; y: number; w: number; h: number };
  return [Math.round(x + w / 2), Math.round(y + h / 2)];
}

async function click(send: Send, x: number, y: number, holdMs = 130): Promise<void> {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await sleep(holdMs);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

interface DebugState {
  x: number;
  y: number;
  z: number;
  grounded: boolean;
  alive: boolean;
}

interface Enemy {
  x: number;
  y: number;
  z: number;
  distance: number;
}

const state = (send: Send): Promise<DebugState> =>
  evaluate(send, `window.__gameDebug?.movement.state()`) as Promise<DebugState>;

const nearestEnemy = (send: Send): Promise<Enemy | null> =>
  evaluate(send, `window.__gameDebug?.combat.nearestEnemy()`) as Promise<Enemy | null>;

const adsWeight = (send: Send): Promise<number> =>
  evaluate(send, `window.__gameDebug?.combat.adsWeight()`) as Promise<number>;

const counters = (send: Send): Promise<{ shots: number; hits: number }> =>
  evaluate(send, `window.__gameDebug?.combat.counters()`) as Promise<{ shots: number; hits: number }>;

const drive = (send: Send, buttons: number, yaw: number, pitch = 0): Promise<unknown> =>
  evaluate(send, `window.__gameDebug?.movement.drive(${buttons}, ${yaw}, ${pitch})`);

const driveStop = (send: Send): Promise<unknown> => evaluate(send, `window.__gameDebug?.movement.driveStop()`);

const ammoText = async (send: Send): Promise<string> =>
  String(await evaluate(send, `document.querySelector(".vitals .ammo-num")?.textContent ?? ""`));

/** Yaw/pitch that aims the eye (+0.65) at the enemy's chest (+0.9). */
function aimAt(me: DebugState, enemy: Enemy): { yaw: number; pitch: number } {
  const dx = enemy.x - me.x;
  const dz = enemy.z - me.z;
  const distance = Math.max(1, Math.hypot(dx, dz));
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(enemy.y + 0.9 - (me.y + 0.65), distance) };
}

async function ensureAlive(send: Send): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const s = await state(send);
    if (s.alive) return;
    await sleep(500);
  }
  throw new Error("never alive");
}

async function waitLoaded(send: Send, timeoutMs = 12_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await ammoText(send);
    if (text.includes("1 / 1")) return true;
    await sleep(250);
  }
  return false;
}

/** Walk until the nearest enemy sits in the dispersion band (or timeout). */
async function settleInBand(send: Send, minDist: number, maxDist: number, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    const [s, enemy] = await Promise.all([state(send), nearestEnemy(send)]);
    if (!s.alive) throw new Error("died");
    if (enemy === null) {
      // Nobody visible — walk toward the walls (map -z) and look again.
      await drive(send, 1, 0);
      await sleep(300);
      continue;
    }
    last = enemy.distance;
    if (enemy.distance >= minDist && enemy.distance <= maxDist) {
      await drive(send, 0, aimAt(s, enemy).yaw);
      await driveStop(send);
      return last;
    }
    const forward = 1;
    const backward = 2;
    const { yaw } = aimAt(s, enemy);
    if (enemy.distance > maxDist) await drive(send, forward, yaw);
    else await drive(send, backward, yaw); // back away from the fight
    await sleep(200);
  }
  await driveStop(send);
  return last;
}

/** Stand still long enough for STATIONARY_ACCURACY_SECONDS (0.8 s) to bite. */
async function becomeSteady(send: Send, buttons: number): Promise<void> {
  const s = await state(send);
  const enemy = await nearestEnemy(send);
  const yaw = enemy === null ? 0 : aimAt(s, enemy).yaw;
  await drive(send, buttons, yaw);
  await sleep(1_300);
}

interface ShotRecord {
  arm: string;
  index: number;
  distance: number;
  hit: boolean;
}

async function fireArm(send: Send, arm: "unaimed" | "aimed", shots: number): Promise<ShotRecord[]> {
  const aimBit = arm === "aimed" ? BTN.aim : 0;
  const records: ShotRecord[] = [];
  await evaluate(send, `window.__gameDebug?.combat.resetCounters()`);
  await ensureAlive(send);
  await settleInBand(send, BAND_MIN, BAND_MAX, 30_000);
  await becomeSteady(send, aimBit);
  if (arm === "aimed") await sleep(400); // let the ADS blend finish before shot 1
  let fired = 0;
  let guard = 0;
  while (fired < shots && guard < shots * 4) {
    guard += 1;
    const s = await state(send);
    if (!s.alive) {
      console.log(JSON.stringify({ event: "died", arm, fired }));
      await ensureAlive(send);
      await settleInBand(send, BAND_MIN, BAND_MAX, 30_000);
      await becomeSteady(send, aimBit);
      continue;
    }
    if (!(await waitLoaded(send))) {
      console.log(JSON.stringify({ event: "reload_timeout", arm, fired }));
      await drive(send, BTN.reload | aimBit, 0);
      await sleep(500);
      continue;
    }
    const enemy = await nearestEnemy(send);
    if (enemy === null) {
      await sleep(400);
      continue;
    }
    if (enemy.distance < SHOT_MIN || enemy.distance > SHOT_MAX) {
      await settleInBand(send, SHOT_MIN, SHOT_MAX, 15_000);
      await becomeSteady(send, aimBit);
      continue;
    }
    const { yaw, pitch } = aimAt(s, enemy);
    const before = await counters(send);
    // Hold Fire across several 20 Hz input samples, then reload immediately.
    await drive(send, BTN.fire | aimBit, yaw, pitch);
    await sleep(220);
    await drive(send, aimBit, yaw, pitch);
    await sleep(160);
    await drive(send, BTN.reload | aimBit, yaw, pitch);
    await sleep(450);
    await drive(send, aimBit, yaw, pitch);
    // The Hit event arrives within ~a second (travel time + snapshot cadence).
    await sleep(700);
    const after = await counters(send);
    const shotFired = after.shots > before.shots;
    if (!shotFired) continue; // fire was gated (shouldn't happen) — retry
    fired += 1;
    const record: ShotRecord = { arm, index: fired, distance: Math.round(enemy.distance * 10) / 10, hit: after.hits > before.hits };
    records.push(record);
    console.log(JSON.stringify({ event: "shot", ...record, shots: after.shots, hits: after.hits }));
    await waitLoaded(send);
  }
  const total = await counters(send);
  console.log(JSON.stringify({ event: "arm_done", arm, shots: total.shots, hits: total.hits }));
  return records;
}

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
  await send("Input.setIgnoreInputEvents", { ignore: false });
  await send("Page.bringToFront");

  console.log(JSON.stringify({ event: "phase", detail: "navigate" }));
  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);
  await evaluate(send, `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: "high" }));
    localStorage.setItem("janissary-name", "AdsProbe-8e7");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);
  const join = await evaluate(send, `(() => {
    const card = document.querySelector(".connect-card");
    if (card === null) return "no-join-form";
    const input = card.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "AdsProbe-8e7");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const selects = card.querySelectorAll("select");
    const pick = (select, needle) => {
      const option = [...select.options].find((o) => o.textContent.includes(needle));
      if (option === undefined) return "missing:" + needle;
      const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
      selectSetter.call(select, option.value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      select.dispatchEvent(new Event("input", { bubbles: true }));
      return option.value;
    };
    const team = pick(selects[0], "Ottoman");
    const cls = pick(selects[1], "Janissary");
    card.querySelector("button").click();
    return "joined-submit:" + team + ":" + cls;
  })()`);
  console.log(JSON.stringify({ event: "join", result: join }));
  await sleep(15_000);
  await ensureAlive(send);

  // Pointer lock via a trusted canvas click (proven headless in the 8e-3 probe).
  const [cx, cy] = await canvasCenter(send);
  await click(send, cx, cy);
  await sleep(1_200);
  console.log(JSON.stringify({ event: "locked", locked: await evaluate(send, `document.pointerLockElement !== null`) }));

  // ── Part 1: presentation screenshots ────────────────────────────────────
  // Step out of the spawn crowd first so the viewmodel shots aren't
  // photobombed by teammates (8e-7 run 1 lesson).
  await settleInBand(send, 60, 140, 20_000);
  await becomeSteady(send, 0);
  await waitLoaded(send);
  await screenshot(send, "8e-7-unaimed");
  const s0 = await state(send);
  const e0 = await nearestEnemy(send);
  const look0 = e0 === null ? { yaw: 0, pitch: 0 } : aimAt(s0, e0);
  await drive(send, BTN.aim, look0.yaw, look0.pitch);
  await sleep(600);
  const weight1 = await adsWeight(send);
  console.log(JSON.stringify({ event: "ads_weight", phase: "aimed", weight: weight1 }));
  await screenshot(send, "8e-7-aimed");
  // Fire aimed once, then hold Aim through the reload: the radial ring must
  // stay readable under ADS (phase requirement).
  await drive(send, BTN.fire | BTN.aim, look0.yaw, look0.pitch);
  await sleep(220);
  await drive(send, BTN.reload | BTN.aim, look0.yaw, look0.pitch);
  await sleep(1_100);
  const reloadRing = await evaluate(send, `document.querySelector(".reticle .ret-reload") !== null`);
  const weight2 = await adsWeight(send);
  console.log(JSON.stringify({ event: "ads_reload", reloadRing, weight: weight2, ammo: await ammoText(send) }));
  await screenshot(send, "8e-7-aimed-reload");
  await drive(send, BTN.aim, look0.yaw, look0.pitch);
  await waitLoaded(send);
  await driveStop(send);
  if (MODE === "shots") {
    ws.close();
    process.exit(0);
  }

  // ── Part 2: live dispersion A/B ─────────────────────────────────────────
  console.log(JSON.stringify({ event: "phase", detail: `dispersion x${SHOTS_PER_ARM} per arm` }));
  const unaimed = await fireArm(send, "unaimed", SHOTS_PER_ARM);
  const aimed = await fireArm(send, "aimed", SHOTS_PER_ARM);
  await driveStop(send);
  const summarize = (records: ShotRecord[]): Record<string, unknown> => {
    const hits = records.filter((r) => r.hit).length;
    const mean = records.length === 0 ? 0 : records.reduce((sum, r) => sum + r.distance, 0) / records.length;
    return { shots: records.length, hits, hitRate: records.length === 0 ? 0 : Math.round((hits / records.length) * 100) / 100, meanDistance: Math.round(mean * 10) / 10 };
  };
  console.log(JSON.stringify({ event: "dispersion_summary", unaimed: summarize(unaimed), aimed: summarize(aimed) }));

  // ── Part 3: F3 perf sample (high tier, live battle) ─────────────────────
  await key(send, "F3", "F3", 114);
  await sleep(2_000);
  const readOverlay = (): Promise<unknown> => evaluate(send, `(() => {
    const overlay = document.querySelector(".debug-overlay");
    if (overlay === null) return { present: false };
    const pairs = new Map();
    for (const dt of overlay.querySelectorAll("dt")) {
      const dd = dt.nextElementSibling;
      if (dd !== null) pairs.set(dt.textContent, dd.textContent);
    }
    const get = (label) => { const v = pairs.get(label); return v === undefined ? null : Number.parseFloat(v); };
    return { present: true, fps: get("Frame rate"), frameP95Ms: get("Frame p95"), drawCalls: get("Draw calls"), visible: get("Visible"), entities: get("Entities") };
  })()`);
  for (let index = 0; index < 3; index += 1) {
    const overlay = await readOverlay();
    console.log(JSON.stringify({ event: "fps_sample", index, ...(overlay as Record<string, unknown>) }));
    await sleep(3_000);
  }
  const rafFps = await evaluate(send, `new Promise((resolve) => { let n = 0; const t0 = performance.now(); const f = () => { n += 1; if (performance.now() - t0 >= 8000) { resolve(n / 8); } else { requestAnimationFrame(f); } }; requestAnimationFrame(f); })`, true);
  console.log(JSON.stringify({ event: "raf_cadence_fps", fps: rafFps }));

  ws.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
