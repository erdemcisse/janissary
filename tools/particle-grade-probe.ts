import { writeFileSync } from "node:fs";
import WebSocket from "ws";

/**
 * Phase 8e-10b scripted browser proof (particle color pass):
 * every powder/dirt particle must read DARK against the bright dawn sky and
 * against the light wall stone. Framings:
 *  - muzzle-against-sky / muzzle-against-wall: own shot, side-on low camera
 *    (sky) vs over-shoulder toward the wall (stone).
 *  - ground-hit-against-sky / -against-wall: steep-down shot, the client
 *    hook (combat.lastBallImpact, now with y + wall flag) reports the real
 *    impact patch; camera re-aims inside the spray life.
 *  - volley-against-sky / -against-wall: battle frames toward the firing
 *    line, low/up pitch (sky) and high/down pitch (stone).
 *  - kill-against-sky / -against-wall: poll combat.lastKillPuff, camera low
 *    north of the victim looking south (sky) or south looking north (wall).
 *
 * Mode "multiply" captures only the three blending-experiment shots
 * (muzzle-sky, muzzle-wall, volley-sky) with the multiply pool enabled.
 *
 * Prereqs: dev servers on :5173/:9001, Chrome with --remote-debugging-port=9333.
 *   npx tsx particle-grade-probe.ts [url] [mode]
 */
const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const MODE = process.argv[3] ?? "full"; // "full" | "multiply"
const SHOT_DIR = new URL("../docs/image-feedback/", import.meta.url).pathname;
const PREFIX = MODE === "multiply" ? "8e-10b-multiply" : "8e-10b";

/** InputButton bits (shared/src/constants.ts). */
const BTN = { forward: 1 << 0, fire: 1 << 4, reload: 1 << 5 } as const;

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
        if (message.error !== undefined) handler.reject(new Error(`${message.error.message ?? "cdp error"}: method`));
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
  alive: boolean;
}

interface Enemy {
  x: number;
  y: number;
  z: number;
  distance: number;
}

interface ImpactReport {
  x: number;
  y: number;
  z: number;
  wall: boolean;
  ageMs: number;
}

const state = (send: Send): Promise<DebugState> =>
  evaluate(send, `window.__gameDebug?.movement.state()`) as Promise<DebugState>;

const nearestEnemy = (send: Send): Promise<Enemy | null> =>
  evaluate(send, `window.__gameDebug?.combat.nearestEnemy()`) as Promise<Enemy | null>;

const lastBallImpact = (send: Send): Promise<ImpactReport | null> =>
  evaluate(send, `window.__gameDebug?.combat.lastBallImpact()`) as Promise<ImpactReport | null>;

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

/** Hold Reload until the pan reads loaded; yaw/pitch re-asserted each poll. */
async function waitLoaded(send: Send, timeoutMs = 12_000, yaw = 0, pitch = 0): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await ammoText(send);
    if (text.includes("1 / 1")) return true;
    await drive(send, BTN.reload, yaw, pitch);
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

/** The point the own muzzle smoke will occupy ~0.3 s after the shot. */
function muzzlePoint(s: DebugState, yaw: number): { x: number; y: number; z: number } {
  return { x: s.x - Math.sin(yaw) * 0.9, y: s.y + 0.85, z: s.z - Math.cos(yaw) * 0.9 };
}

/** Fire once after ensuring the pan is loaded; aim stays as passed. Logs the
 * own-shot counter delta so a silent no-fire (dead server, empty pan) shows
 * in the probe log instead of producing an empty frame. */
async function fireOnce(send: Send, yaw: number, pitch: number): Promise<void> {
  await waitLoaded(send, 12_000, yaw, pitch);
  await drive(send, 0, yaw, pitch);
  await sleep(400);
  const before = (await evaluate(send, `window.__gameDebug?.combat.counters()`)) as { shots: number } | null;
  await drive(send, BTN.fire, yaw, pitch);
  await sleep(120);
  const after = (await evaluate(send, `window.__gameDebug?.combat.counters()`)) as { shots: number } | null;
  console.log(JSON.stringify({ event: "fire", shotsBefore: before?.shots, shotsAfter: after?.shots }));
}

/** Muzzle smoke framed against open sky: player faces SOUTH (away from the
 * wall), camera low to the east looking up at the muzzle. */
async function shotMuzzleSky(send: Send, name: string): Promise<void> {
  await ensureAlive(send);
  const yaw = Math.PI; // face south — open field, no wall behind the smoke
  const s = await state(send);
  const muzzle = muzzlePoint(s, yaw);
  const cam = { x: s.x + 3.2, y: s.y + 0.15, z: s.z + 0.4 };
  const look = lookAt(cam, { x: muzzle.x, y: muzzle.y + 0.55, z: muzzle.z });
  await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
  await fireOnce(send, yaw, 0);
  await sleep(280);
  await screenshot(send, name);
  await sleep(420);
  await screenshot(send, `${name}-b`);
  await driveStop(send);
}

/** Muzzle smoke framed against the wall: settle close to the defenders, fire
 * north at them, camera just behind/side so the stone fills the background. */
async function shotMuzzleWall(send: Send, name: string): Promise<void> {
  await ensureAlive(send);
  await settleInBand(send, 12, 22, 40_000);
  const s = await state(send);
  const e = await nearestEnemy(send);
  const yaw = e === null ? 0 : aimAt(s, e).yaw;
  const muzzle = muzzlePoint(s, yaw);
  // Camera 2.6 m behind-right of the player, chest height, looking past the
  // muzzle toward the enemy — wall stone behind the cloud.
  const back = { x: s.x + Math.sin(yaw) * 2.6 + Math.cos(yaw) * 1.2, z: s.z + Math.cos(yaw) * 2.6 - Math.sin(yaw) * 1.2 };
  const cam = { x: back.x, y: s.y + 0.9, z: back.z };
  const look = lookAt(cam, { x: muzzle.x - Math.sin(yaw) * 2.5, y: muzzle.y + 0.35, z: muzzle.z - Math.cos(yaw) * 2.5 });
  await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
  await fireOnce(send, yaw, 0);
  await sleep(280);
  await screenshot(send, name);
  await sleep(420);
  await screenshot(send, `${name}-b`);
  await driveStop(send);
}

/** Ground-hit spray: fire steeply down in `yaw` direction, hook reports the
 * impact, camera re-aims from `camSide` ("sky" = north of impact looking
 * south+up; "wall" = south of impact looking north at the stone). */
async function shotGroundHit(send: Send, name: string, side: "sky" | "wall"): Promise<void> {
  await ensureAlive(send);
  if (side === "wall") await settleInBand(send, 12, 22, 40_000);
  const yaw = side === "wall" ? 0 : Math.PI; // wall: impact north of player; sky: south
  const pitch = -0.45;
  await waitLoaded(send, 12_000, yaw, pitch);
  await drive(send, 0, yaw, pitch);
  await sleep(400);
  await drive(send, BTN.fire, yaw, pitch);
  let impact: ImpactReport | null = null;
  const deadline = Date.now() + 1_800;
  while (Date.now() < deadline) {
    const report = await lastBallImpact(send);
    if (report !== null && !report.wall && report.ageMs < 250) {
      impact = report;
      break;
    }
    await sleep(35);
  }
  console.log(JSON.stringify({ event: "ground_impact_report", name, impact }));
  if (impact !== null) {
    const cam =
      side === "sky"
        ? { x: impact.x - 1.8, y: 0.35, z: impact.z - 1.8 } // NW, low, looking SE+up — player off-axis
        : { x: impact.x + 2.4, y: 0.5, z: impact.z + 2.2 }; // SE of the patch, looking N+up at the wall
    const look = lookAt(cam, { x: impact.x, y: 0.75, z: impact.z });
    await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
  }
  await screenshot(send, name);
  await sleep(150);
  await screenshot(send, `${name}-b`);
  await driveStop(send);
}

/** Battle volley frames toward the nearest enemy: low+up pitch (sky behind
 * the smoke) or high+down pitch (wall/ground behind). */
async function shotVolley(send: Send, name: string, side: "sky" | "wall"): Promise<void> {
  await ensureAlive(send);
  await settleInBand(send, 20, 45, 35_000);
  const s = await state(send);
  const e = await nearestEnemy(send);
  if (e !== null) {
    const cam =
      side === "sky"
        ? { x: s.x - (e.x - s.x) * 0.06, y: s.y + 0.9, z: s.z - (e.z - s.z) * 0.06 }
        : { x: s.x - (e.x - s.x) * 0.06, y: s.y + 5.0, z: s.z - (e.z - s.z) * 0.06 };
    const aimY = side === "sky" ? e.y + 2.6 : e.y + 0.4;
    const look = lookAt(cam, { x: e.x, y: aimY, z: e.z });
    await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
  }
  await screenshot(send, name);
  await sleep(600);
  await screenshot(send, `${name}-b`);
}

/** Kill puff: poll the hook, frame the victim against sky (camera north,
 * low, looking south+up) or wall (camera south, looking north). */
async function shotKill(send: Send, name: string, side: "sky" | "wall", waitSec: number): Promise<boolean> {
  await ensureAlive(send);
  await settleInBand(send, 15, 30, 35_000);
  const deadline = Date.now() + waitSec * 1_000;
  while (Date.now() < deadline) {
    const report = (await evaluate(send, `window.__gameDebug?.combat.lastKillPuff()`)) as { x: number; y: number; z: number; ageMs: number } | null;
    if (report !== null && report.ageMs < 300) {
      const cam =
        side === "sky"
          ? { x: report.x - 1, y: report.y + 0.05, z: report.z - 3.2 } // very low, steep up-pitch: puff against deep sky
          : { x: report.x + 0.8, y: report.y + 1.0, z: report.z + 4.2 };
      const look = lookAt(cam, { x: report.x, y: report.y + (side === "sky" ? 1.6 : 0.9), z: report.z });
      await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
      await screenshot(send, name);
      console.log(JSON.stringify({ event: "kill_puff_report", name, report }));
      return true;
    }
    await sleep(40);
  }
  console.log(JSON.stringify({ event: "kill_missed", name, waitSec }));
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
  await send("Input.setIgnoreInputEvents", { ignore: false });

  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);
  await evaluate(send, `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: "high" }));
    localStorage.setItem("janissary-name", "GradeProbe");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);

  // Join: Ottoman Janissary (arquebus).
  const join = await evaluate(send, `(() => {
    const card = document.querySelector(".connect-card");
    if (card === null) return "no-join-form";
    const input = card.querySelector("input");
    if (input !== null) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "GradeProbe");
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
  console.log(JSON.stringify({ event: "join", result: join, mode: MODE }));
  await sleep(6_000);
  await ensureAlive(send);

  const [cx, cy] = await canvasCenter(send);
  await click(send, cx, cy);
  await sleep(1_200);
  console.log(JSON.stringify({ event: "locked", locked: await evaluate(send, `document.pointerLockElement !== null`) }));

  if (MODE === "multiply") {
    // Blending experiment: muzzle smoke over sky + over wall stone, plus one
    // volley frame for the smoke-over-smoke stacking question.
    await shotMuzzleSky(send, `${PREFIX}-against-sky`);
    await shotMuzzleWall(send, `${PREFIX}-against-wall`);
    await shotVolley(send, `${PREFIX}-volley`, "sky");
  } else if (MODE === "impacts") {
    // Targeted re-capture for the palette-iteration loop: the four shots
    // whose kinds changed in pass 2 (impactDust/dirtChunk/killPuff).
    await shotGroundHit(send, `${PREFIX}-ground-hit-against-sky`, "sky");
    await shotGroundHit(send, `${PREFIX}-ground-hit-against-wall`, "wall");
    await shotKill(send, `${PREFIX}-kill-against-sky`, "sky", 75);
    await shotKill(send, `${PREFIX}-kill-against-wall`, "wall", 75);
  } else {
    await shotMuzzleSky(send, `${PREFIX}-muzzle-against-sky`);
    await shotMuzzleWall(send, `${PREFIX}-muzzle-against-wall`);
    await shotGroundHit(send, `${PREFIX}-ground-hit-against-sky`, "sky");
    await shotGroundHit(send, `${PREFIX}-ground-hit-against-wall`, "wall");
    await shotVolley(send, `${PREFIX}-volley-against-sky`, "sky");
    await shotVolley(send, `${PREFIX}-volley-against-wall`, "wall");
    const gotSky = await shotKill(send, `${PREFIX}-kill-against-sky`, "sky", 60);
    const gotWall = await shotKill(send, `${PREFIX}-kill-against-wall`, "wall", 60);
    if (!gotSky || !gotWall) {
      // One retry pass for whichever kill framing missed.
      if (!gotSky) await shotKill(send, `${PREFIX}-kill-against-sky`, "sky", 45);
      if (!gotWall) await shotKill(send, `${PREFIX}-kill-against-wall`, "wall", 45);
    }
  }

  await clearCamera(send);
  console.log(JSON.stringify({ event: "done" }));
  ws.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
