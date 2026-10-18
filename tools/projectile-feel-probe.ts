import { writeFileSync } from "node:fs";
import WebSocket from "ws";

/**
 * Phase 8e-9 scripted browser proof (projectile & explosion feel):
 *  1. First-person rifle viewmodel screenshots (hip / aimed / reload) — the
 *     long-rifle glb swap + the re-fitted 8e-7 ADS pose.
 *  2. Battle screenshots via the dev debug camera: volley tracers/bolts with
 *     lingering muzzle smoke, a cannonball in flight with its tail, the
 *     explosion burst right after impact, and the scorch field.
 * Shell/explosion timing polls the dev counters (`__gameDebug.combat`), so
 * the camera is always aimed when the event happens.
 *
 * Prereqs: dev servers on :5173/:9001, Chrome with --remote-debugging-port=9333.
 *   npx tsx projectile-feel-probe.ts [url] [timeoutSec]
 */
const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const ARTILLERY_TIMEOUT_SEC = Number.parseInt(process.argv[3] ?? "100", 10);
const SHOT_DIR = new URL("../docs/image-feedback/", import.meta.url).pathname;

/** InputButton bits (shared/src/constants.ts). */
const BTN = { forward: 1 << 0, fire: 1 << 4, reload: 1 << 5, aim: 1 << 13 } as const;

interface CdpResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message: string };
}

type Send = (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;

function connectCdp(url: string): Promise<{ ws: WebSocket; send: Send }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { perMessageDeflate: false });
    let nextId = 1;
    const pending = new Map<number, { resolve: (r: Record<string, unknown>) => void; reject: (e: Error) => void }>();
    ws.on("open", () => {
      const send: Send = (method, params = {}) =>
        new Promise((res, rej) => {
          const id = nextId++;
          pending.set(id, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
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

interface Counters {
  shots: number;
  hits: number;
  explosions: number;
  shellsFired: number;
}

const state = (send: Send): Promise<DebugState> =>
  evaluate(send, `window.__gameDebug?.movement.state()`) as Promise<DebugState>;

const nearestEnemy = (send: Send): Promise<Enemy | null> =>
  evaluate(send, `window.__gameDebug?.combat.nearestEnemy()`) as Promise<Enemy | null>;

const counters = (send: Send): Promise<Counters> =>
  evaluate(send, `window.__gameDebug?.combat.counters()`) as Promise<Counters>;

const shells = (send: Send): Promise<{ x: number; y: number; z: number }[]> =>
  evaluate(send, `window.__gameDebug?.combat.shells()`) as Promise<{ x: number; y: number; z: number }[]>;

const drive = (send: Send, buttons: number, yaw: number, pitch = 0): Promise<unknown> =>
  evaluate(send, `window.__gameDebug?.movement.drive(${buttons}, ${yaw}, ${pitch})`);

const driveStop = (send: Send): Promise<unknown> => evaluate(send, `window.__gameDebug?.movement.driveStop()`);

const setCamera = (send: Send, x: number, y: number, z: number, yaw: number, pitch: number): Promise<unknown> =>
  evaluate(send, `window.__gameDebug?.setCamera(${x}, ${y}, ${z}, ${yaw}, ${pitch})`);

const clearCamera = (send: Send): Promise<unknown> => evaluate(send, `window.__gameDebug?.clearCamera()`);

const ammoText = async (send: Send): Promise<string> =>
  String(await evaluate(send, `document.querySelector(".vitals .ammo-num")?.textContent ?? ""`));

/** Yaw/pitch that aims the eye (+0.65) at the enemy's chest (+0.9). */
function aimAt(me: { x: number; y: number; z: number }, enemy: { x: number; y: number; z: number }): { yaw: number; pitch: number } {
  const dx = enemy.x - me.x;
  const dz = enemy.z - me.z;
  const distance = Math.max(1, Math.hypot(dx, dz));
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(enemy.y + 0.9 - (me.y + 0.65), distance) };
}

/** Yaw/pitch for a free camera at `from` looking at `to`. */
function lookAt(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dy = to.y - from.y;
  const horizontal = Math.max(0.5, Math.hypot(dx, dz));
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, horizontal) };
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

/** Walk until the nearest enemy sits in the band (or timeout). */
async function settleInBand(send: Send, minDist: number, maxDist: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [s, enemy] = await Promise.all([state(send), nearestEnemy(send)]);
    if (!s.alive) {
      await ensureAlive(send);
      continue;
    }
    if (enemy === null) {
      await drive(send, BTN.forward, 0);
      await sleep(300);
      continue;
    }
    if (enemy.distance >= minDist && enemy.distance <= maxDist) {
      await drive(send, 0, aimAt(s, enemy).yaw);
      await driveStop(send);
      return;
    }
    const { yaw } = aimAt(s, enemy);
    await drive(send, enemy.distance > maxDist ? BTN.forward : 0, yaw);
    await sleep(250);
  }
  await driveStop(send);
}

async function main(): Promise<void> {
  let targets: { id: string; type: string; url: string; webSocketDebuggerUrl?: string }[] = [];
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
      targets = (await response.json()) as typeof targets;
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

  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);
  await evaluate(send, `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: "high" }));
    localStorage.setItem("janissary-name", "ProjectileProbe");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);

  // Join: Ottoman Janissary (arquebus — the rifle viewmodel under test).
  const join = await evaluate(send, `(() => {
    const card = document.querySelector(".connect-card");
    if (card === null) return "no-join-form";
    const input = card.querySelector("input");
    if (input !== null) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "ProjectileProbe");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const selects = card.querySelectorAll("select");
    const pick = (select, wanted) => {
      for (const option of select.options) { if (option.text.includes(wanted)) { select.value = option.value; select.dispatchEvent(new Event("change", { bubbles: true })); return option.text; } }
      return "";
    };
    const team = selects.length > 0 ? pick(selects[0], "Ottoman") : "";
    const cls = selects.length > 1 ? pick(selects[1], "Janissary") : "";
    card.querySelector("button").click();
    return "joined:" + team + ":" + cls;
  })()`);
  console.log(JSON.stringify({ event: "join", result: join }));
  await sleep(6_000);
  await ensureAlive(send);

  // Pointer lock via a trusted canvas click (proven headless in the 8e-3 probe).
  const [cx, cy] = await canvasCenter(send);
  await click(send, cx, cy);
  await sleep(1_200);
  console.log(JSON.stringify({ event: "locked", locked: await evaluate(send, `document.pointerLockElement !== null`) }));

  // ── Part 1: rifle viewmodel (hip / aimed / reload) ──────────────────────
  await settleInBand(send, 60, 140, 30_000);
  await ensureAlive(send);
  await drive(send, 0, 0);
  await sleep(1_400); // stand still: steady accuracy + bob settles
  await waitLoaded(send);
  await screenshot(send, "8e-9-viewmodel-hip");
  const s0 = await state(send);
  const e0 = await nearestEnemy(send);
  const look0 = e0 === null ? { yaw: 0, pitch: 0 } : aimAt(s0, e0);
  await drive(send, BTN.aim, look0.yaw, look0.pitch);
  await sleep(700);
  await screenshot(send, "8e-9-viewmodel-aimed");
  // Fire aimed, then hold Aim through the reload for the radial-under-ADS shot.
  await drive(send, BTN.fire | BTN.aim, look0.yaw, look0.pitch);
  await sleep(250);
  await drive(send, BTN.reload | BTN.aim, look0.yaw, look0.pitch);
  await sleep(1_100);
  await screenshot(send, "8e-9-viewmodel-reload");
  await drive(send, BTN.aim, look0.yaw, look0.pitch);
  await waitLoaded(send);
  await driveStop(send);

  // ── Part 2: volley / tracer / bolt / lingering smoke (debug camera) ─────
  // Walk to the front, then park the free camera just over the local
  // player's shoulder so the firefight is in frame without risking the shot.
  await settleInBand(send, 35, 80, 45_000);
  const s1 = await state(send);
  const e1 = await nearestEnemy(send);
  if (e1 !== null) {
    const cam = { x: s1.x - (e1.x - s1.x) * 0.08, y: s1.y + 2.6, z: s1.z - (e1.z - s1.z) * 0.08 };
    const look = lookAt(cam, { x: e1.x, y: e1.y + 1, z: e1.z });
    await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
  }
  // Timed burst of shots across the firefight: tracers, bolts, muzzle
  // flashes, and (1.5 s later) the lingering smoke with no flashes.
  await screenshot(send, "8e-9-volley-a");
  await sleep(600);
  await screenshot(send, "8e-9-volley-b");
  await sleep(1_500);
  await screenshot(send, "8e-9-muzzle-linger");

  // ── Part 3: artillery — shell in flight, explosion burst, scorch ────────
  const base = await counters(send);
  const deadline = Date.now() + ARTILLERY_TIMEOUT_SEC * 1000;
  let caughtShell: { x: number; y: number; z: number } | null = null;
  let artillerySeen = false;
  while (Date.now() < deadline && !artillerySeen) {
    const now = await counters(send);
    if (now.shellsFired > base.shellsFired) {
      const live = await shells(send);
      if (live.length > 0) {
        caughtShell = live[0] ?? null;
        artillerySeen = true;
      }
    }
    await sleep(120);
  }
  if (caughtShell !== null) {
    // Side-on view of the shell in flight: offset perpendicular to its
    // rough line of flight (toward the wall, -z) so the tail reads.
    const cam = { x: caughtShell.x + 9, y: caughtShell.y + 2.5, z: caughtShell.z + 9 };
    const look = lookAt(cam, caughtShell);
    await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
    await screenshot(send, "8e-9-shell-flight");
    // Track until the impact event, then catch the burst and the column.
    const beforeBoom = await counters(send);
    const impactDeadline = Date.now() + 10_000;
    let lastShell = caughtShell;
    while (Date.now() < impactDeadline) {
      const live = await shells(send);
      if (live.length > 0) lastShell = live[0] ?? lastShell;
      const now = await counters(send);
      if (now.explosions > beforeBoom.explosions) break;
      await sleep(60);
    }
    const boomCam = { x: lastShell.x + 14, y: lastShell.y + 6, z: lastShell.z + 14 };
    const boomLook = lookAt(boomCam, { x: lastShell.x, y: 0.5, z: lastShell.z });
    await setCamera(send, boomCam.x, boomCam.y, boomCam.z, boomLook.yaw, boomLook.pitch);
    await screenshot(send, "8e-9-explosion-burst");
    await sleep(1_200);
    await screenshot(send, "8e-9-explosion-column");
    // Scorch: look down at the impact point from closer/lower.
    const scorchCam = { x: lastShell.x + 6, y: 5, z: lastShell.z + 6 };
    const scorchLook = lookAt(scorchCam, { x: lastShell.x, y: 0, z: lastShell.z });
    await setCamera(send, scorchCam.x, scorchCam.y, scorchCam.z, scorchLook.yaw, scorchLook.pitch);
    await sleep(400);
    await screenshot(send, "8e-9-scorch-field");
  } else {
    console.log(JSON.stringify({ event: "no_artillery_observed", timeoutSec: ARTILLERY_TIMEOUT_SEC }));
  }
  await clearCamera(send);

  const final = await counters(send);
  console.log(JSON.stringify({ event: "done", counters: final }));
  ws.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
