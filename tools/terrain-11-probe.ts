import { writeFileSync } from "node:fs";
import WebSocket from "ws";

/**
 * Phase 8e-11 scripted browser proof: joins the live battle, drives the
 * dev-only `__gameDebug.setCamera` hook to the terrain-heightfield viewpoints
 * (rolling wide field, hill sightline, flat wall lane, river ford, scatter on
 * a slope), then mans wall gun 1 and captures a shell in flight over the
 * field. The hillside-IMPACT half of "shell over hill" is proven by the
 * server test (terrainAdoption.test.ts) — no gun can reach a real hill
 * (~250+ m vs ~130 m shell reach) and the client shell mirror flies the
 * static gun yaw (ADR 0038 residual), so a swung gun would fake the visual.
 *
 * Prereqs: dev servers on :5173/:9001, headed Chrome with
 * --remote-debugging-port=9334 (separate profile from the perf Chrome).
 */
const DEBUG_PORT = Number(process.argv[3] ?? 9334);
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const SHOT_DIR = new URL("../docs/image-feedback/", import.meta.url).pathname;

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

interface Viewpoint {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
}

// yaw = atan2(-dx, -dz) for look direction (dx, dz); positive pitch looks up.
// Camera heights are terrain heightAt + eye offset, surveyed against
// shared/src/terrain.ts (see ADR 0040 for the table).
const VIEWPOINTS: readonly Viewpoint[] = [
  // From the eastern hilltop (h=7.85) across the rolling field to the wall —
  // the "open wide high enough" read: relief to the horizon, not bumps.
  { name: "8e-11-wide-field", x: 710, y: 11, z: -745, yaw: Math.atan2(710, -545), pitch: -0.06 },
  // Up the same hill's approach slope — the sightline a defender loses.
  { name: "8e-11-hill-sightline", x: 660, y: 4.2, z: -690, yaw: Math.atan2(-50, 55), pitch: 0.03 },
  // The wall lane stays dead flat (keep-flat mask) with hills beyond it.
  { name: "8e-11-wall-lane-flat", x: -60, y: 2.3, z: 6, yaw: Math.atan2(-1, 0), pitch: 0 },
  // The Lycus ford at (-327, 110): flat channel, water reads as before.
  { name: "8e-11-river-ford", x: -298, y: 2.6, z: 124, yaw: Math.atan2(29, 14), pitch: -0.12 },
  // Grass/scree on a real slope (relief ~2.3 m over 20 m) at (435,-418).
  { name: "8e-11-scatter-on-slope", x: 420, y: 6.5, z: -400, yaw: Math.atan2(-25, 25), pitch: -0.1 },
  // Vista from the Ottoman approach: corridor flat, hills framing both sides.
  { name: "8e-11-vista", x: -40, y: 9, z: 100, yaw: Math.atan2(40, -100), pitch: -0.08 },
];

// --- artillery flow helpers (from tools/artillery-feel-probe.ts) -----------

const BTN = { forward: 1 << 0, fire: 1 << 4, interact: 1 << 8 } as const;
const GUN = { x: 0, z: -7 }; // wall gun 1, yaw PI straight down the corridor
// Aim near the left arc limit so the SERVER shell lands in the empty field —
// kills would rank the probe player up and the fanfare modal ruins shots
// (8e-9 lesson). The CLIENT mirror flies the static gun yaw either way, so
// the flight screenshot is unaffected by the aim swing.
const AIM_YAW = Math.PI - 1.2;
const SHELL_PITCH = 0.32;

interface DebugState { alive: boolean; x: number; z: number }
interface Counters { shellsFired: number }

const state = (send: Send): Promise<DebugState> =>
  evaluate(send, `window.__gameDebug?.movement.state()`) as Promise<DebugState>;
const counters = (send: Send): Promise<Counters> =>
  evaluate(send, `window.__gameDebug?.combat.counters()`) as Promise<Counters>;
const shells = (send: Send): Promise<{ x: number; y: number; z: number }[]> =>
  evaluate(send, `window.__gameDebug?.combat.shells()`) as Promise<{ x: number; y: number; z: number }[]>;
const drive = (send: Send, buttons: number, yaw: number, pitch: number): Promise<unknown> =>
  evaluate(send, `window.__gameDebug?.movement.drive(${buttons}, ${yaw}, ${pitch})`);
const driveStop = (send: Send): Promise<unknown> => evaluate(send, `window.__gameDebug?.movement.driveStop()`);
const setCamera = (send: Send, x: number, y: number, z: number, yaw: number, pitch: number): Promise<unknown> =>
  evaluate(send, `window.__gameDebug?.setCamera(${x}, ${y}, ${z}, ${yaw}, ${pitch})`);
const clearCamera = (send: Send): Promise<unknown> => evaluate(send, `window.__gameDebug?.clearCamera()`);

async function canvasCenter(send: Send): Promise<[number, number]> {
  const rect = await evaluate(send, `(() => { const r = document.querySelector("canvas").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number };
  return [rect.x, rect.y];
}

async function click(send: Send, x: number, y: number): Promise<void> {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await sleep(120);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function dismissModals(send: Send): Promise<void> {
  await evaluate(send, `(() => {
    for (const button of document.querySelectorAll("button")) {
      if (button.textContent?.trim() === "Not now") { button.click(); return "dismissed"; }
    }
    return "none";
  })()`);
}

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

// The Byzantine spawn sits behind the inner-city district's north wall, so
// the route to the wall gun goes around the district (same as 8e-9).
const WAYPOINTS = [{ x: 32, z: -88 }, { x: 32, z: -10 }, { x: GUN.x, z: GUN.z }];

async function walkToGun(send: Send): Promise<boolean> {
  const deadline = Date.now() + 90_000;
  let waypoint = 0;
  while (Date.now() < deadline) {
    const s = await state(send);
    if (!s.alive) {
      await ensureAlive(send);
      continue;
    }
    const target = WAYPOINTS[Math.min(waypoint, WAYPOINTS.length - 1)] ?? GUN;
    const dx = target.x - s.x;
    const dz = target.z - s.z;
    const reach = waypoint === WAYPOINTS.length - 1 ? 2.2 : 3.5;
    if (Math.hypot(dx, dz) < reach) {
      waypoint += 1;
      if (waypoint >= WAYPOINTS.length) {
        await driveStop(send);
        return true;
      }
      continue;
    }
    await drive(send, BTN.forward, Math.atan2(-dx, -dz), 0);
    await sleep(300);
  }
  await driveStop(send);
  return false;
}

async function tapInteract(send: Send): Promise<void> {
  await drive(send, BTN.interact, AIM_YAW, SHELL_PITCH);
  await sleep(150);
  await drive(send, 0, AIM_YAW, SHELL_PITCH);
  await sleep(600);
}

async function fireGun(send: Send, base: Counters): Promise<boolean> {
  await drive(send, BTN.fire, AIM_YAW, SHELL_PITCH);
  await sleep(220);
  await drive(send, 0, AIM_YAW, SHELL_PITCH);
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const now = await counters(send);
    if (now.shellsFired > base.shellsFired) return true;
    await sleep(60);
  }
  return false;
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
  await send("Page.bringToFront");

  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);
  await evaluate(send, `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: "high" }));
    localStorage.setItem("janissary-name", "Terrain11Probe");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);

  // Join as a Byzantine Wall Gunner — the class that can man the wall guns.
  const join = await evaluate(send, `(() => {
    const card = document.querySelector(".connect-card");
    if (card === null) return "no-join-form";
    const input = card.querySelector("input");
    if (input !== null) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "Terrain11Probe");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const selects = card.querySelectorAll("select");
    const pick = (select, wanted) => {
      for (const option of select.options) { if (option.text.includes(wanted)) { select.value = option.value; select.dispatchEvent(new Event("change", { bubbles: true })); return option.text; } }
      return "";
    };
    const team = selects.length > 0 ? pick(selects[0], "Byzantine") : "";
    const cls = selects.length > 1 ? pick(selects[1], "Wall Gunner") : "";
    card.querySelector("button").click();
    return "joined:" + team + ":" + cls;
  })()`);
  console.log(JSON.stringify({ event: "join", result: join }));
  await sleep(14_000);

  const debugReady = await evaluate(send, `typeof window.__gameDebug`);
  if (debugReady !== "object") {
    console.log(JSON.stringify({ event: "cdp_error", detail: "__gameDebug missing (not a dev build?)" }));
    process.exit(1);
  }

  // Static viewpoints first — these are the required terrain shots and must
  // not depend on the walk/fire flow succeeding.
  for (const view of VIEWPOINTS) {
    await setCamera(send, view.x, view.y, view.z, view.yaw, view.pitch);
    await sleep(900);
    await screenshot(send, view.name);
  }
  await clearCamera(send);

  // Shell in flight over the field: man wall gun 1 and fire straight down
  // the corridor; the camera sits side-on at the corridor edge so the ball
  // and its tail read against the rolling field beyond.
  await ensureAlive(send);
  const [cx, cy] = await canvasCenter(send);
  await click(send, cx, cy);
  await sleep(1_000);
  if (!(await walkToGun(send))) {
    console.log(JSON.stringify({ event: "walk_failed" }));
    ws.close();
    process.exit(1);
  }
  let base = await counters(send);
  let manned = false;
  for (let attempt = 0; attempt < 3 && !manned; attempt += 1) {
    await tapInteract(send);
    manned = await fireGun(send, base);
    if (!manned) await sleep(800);
  }
  if (!manned) {
    console.log(JSON.stringify({ event: "man_failed" }));
    ws.close();
    process.exit(1);
  }
  console.log(JSON.stringify({ event: "manned_and_fired" }));

  // Gun 1 fires from (0, 1.5, -7) toward +Z; watch the corridor cross-section
  // at z≈36-41 from the east side, hills filling the far frame.
  const corridorCam = { x: 14, y: 8, z: 38 };
  const corridorLook = lookAt(corridorCam, { x: -2, y: 7, z: 40 });
  await setCamera(send, corridorCam.x, corridorCam.y, corridorCam.z, corridorLook.yaw, corridorLook.pitch);
  const tryFlightShot = async (windowMs: number): Promise<boolean> => {
    const deadline = Date.now() + windowMs;
    while (Date.now() < deadline) {
      const live = await shells(send);
      for (const shell of live) {
        if (Math.abs(shell.x) < 5 && shell.z > 30 && shell.z < 46 && shell.y > 4) {
          await dismissModals(send);
          await screenshot(send, "8e-11-shell-over-hill");
          return true;
        }
      }
      await sleep(40);
    }
    return false;
  };
  let flightCaught = await tryFlightShot(2_600);
  for (let attempt = 0; attempt < 4 && !flightCaught; attempt += 1) {
    base = await counters(send);
    if (!(await fireGun(send, base))) {
      await sleep(500);
      continue;
    }
    flightCaught = await tryFlightShot(3_500);
  }
  console.log(JSON.stringify({ event: "shell_flight", caught: flightCaught }));
  await clearCamera(send);

  ws.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
