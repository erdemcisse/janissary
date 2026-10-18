import { writeFileSync } from "node:fs";
import WebSocket from "ws";

/**
 * Phase 8e-10 scripted browser proof (combat polish batch):
 *  1. Muzzle dust + restyled powder smoke: side-on free camera on the local
 *     player firing off dirt/grass (ground-level dust puff at the feet,
 *     grey-brown cloud, no white wall).
 *  2. Ground-hit dirt spray: fire into the ground ahead, camera on the
 *     impact patch (dirtChunk soil spray + dust).
 *  3. Volley with restyled tracers (dim warm-grey dust wisps, dark balls)
 *     and the smaller remote muzzle clouds — over-the-shoulder free camera.
 *  4. Kill burst: poll the kill feed for a new row and screenshot inside the
 *     killPuff's 0.5–0.8 s life.
 *
 * Prereqs: dev servers on :5173/:9001, Chrome with --remote-debugging-port=9333.
 *   npx tsx combat-polish-probe.ts [url] [killWaitSec]
 */
const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const KILL_WAIT_SEC = Number.parseInt(process.argv[3] ?? "60", 10);
const SHOT_DIR = new URL("../docs/image-feedback/", import.meta.url).pathname;

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

const state = (send: Send): Promise<DebugState> =>
  evaluate(send, `window.__gameDebug?.movement.state()`) as Promise<DebugState>;

const nearestEnemy = (send: Send): Promise<Enemy | null> =>
  evaluate(send, `window.__gameDebug?.combat.nearestEnemy()`) as Promise<Enemy | null>;

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

/**
 * Wait until the pan is loaded, HOLDING the Reload bit while waiting — the
 * server only reloads on an explicit InputButton.Reload (world.ts:2642),
 * there is no auto-reload. startReload no-ops while loaded/reloading
 * (world.ts:1661), so holding the bit is safe. Yaw/pitch are re-asserted so
 * the wait never disturbs the caller's aim.
 */
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
    localStorage.setItem("janissary-name", "PolishProbe");
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
      setter.call(input, "PolishProbe");
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

  const [cx, cy] = await canvasCenter(send);
  await click(send, cx, cy);
  await sleep(1_200);
  console.log(JSON.stringify({ event: "locked", locked: await evaluate(send, `document.pointerLockElement !== null`) }));

  await settleInBand(send, 35, 80, 45_000);
  await ensureAlive(send);
  await waitLoaded(send);

  // ── Shot 1: muzzle dust + restyled own smoke, side-on ────────────────────
  // Free camera 4.5 m off the player's right shoulder at chest height,
  // looking at the feet — the fire flashes, the ground dust, and the
  // grey-brown cloud all read from there.
  {
    const s = await state(send);
    const e = await nearestEnemy(send);
    const yaw = e === null ? 0 : aimAt(s, e).yaw;
    await drive(send, 0, yaw);
    await sleep(700);
    const sNow = await state(send);
    // Camera to the player's left flank, slightly toward the muzzle side.
    const cam = { x: sNow.x + Math.cos(yaw) * 4.5, y: sNow.y + 1.5, z: sNow.z - Math.sin(yaw) * 4.5 };
    const look = lookAt(cam, { x: sNow.x, y: sNow.y + 0.4, z: sNow.z });
    await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
    await waitLoaded(send, 12_000, yaw);
    await drive(send, BTN.fire, yaw);
    await sleep(200);
    await screenshot(send, "8e-10-muzzle-dust");
    await sleep(450);
    await screenshot(send, "8e-10-muzzle-smoke");
    await driveStop(send);
  }

  // ── Shot 2: ground-hit dirt spray ────────────────────────────────────────
  // Rounds 2-4 missed: outside-in ballistic estimates can't be trusted (the
  // client ball mirror flies a flat pitch line from an unknown muzzle height)
  // and a single screenshot raced server-echo spawn latency. Fix: fire
  // steeply down, then let the CLIENT say where the own ball actually landed
  // (8e-10 dev hook combat.lastBallImpact, own-slots only) and re-aim the
  // camera at the reported point inside the 0.4-0.7 s spray life.
  {
    await ensureAlive(send);
    const yaw = 0;
    const pitch = -0.45;
    await waitLoaded(send, 12_000, yaw, pitch);
    await drive(send, 0, yaw, pitch);
    await sleep(500);
    const sNow = await state(send);
    const guess = { x: sNow.x - Math.sin(yaw) * 2.4, y: 0.15, z: sNow.z - Math.cos(yaw) * 2.4 };
    const cam0 = { x: guess.x + 2.5, y: 1.8, z: guess.z + 2.5 };
    const look0 = lookAt(cam0, guess);
    await setCamera(send, cam0.x, cam0.y, cam0.z, look0.yaw, look0.pitch);
    await drive(send, BTN.fire, yaw, pitch);
    let impact: { x: number; z: number; ageMs: number } | null = null;
    const impactDeadline = Date.now() + 1_500;
    while (Date.now() < impactDeadline) {
      const report = (await evaluate(send, `window.__gameDebug?.combat.lastBallImpact()`)) as { x: number; z: number; ageMs: number } | null;
      if (report !== null && report.ageMs < 250) {
        impact = report;
        break;
      }
      await sleep(40);
    }
    console.log(JSON.stringify({ event: "ground_impact_report", impact, player: { x: sNow.x, y: sNow.y, z: sNow.z } }));
    if (impact !== null) {
      const cam = { x: impact.x + 2.2, y: 1.6, z: impact.z + 2.2 };
      const look = lookAt(cam, { x: impact.x, y: 0.15, z: impact.z });
      await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
      await screenshot(send, "8e-10-ground-hit");
      await sleep(140);
      await screenshot(send, "8e-10-ground-hit-b");
    } else {
      await screenshot(send, "8e-10-ground-hit");
    }
    await driveStop(send);
  }

  // ── Shots 3-4: volley with restyled tracers/smoke (over-shoulder) ────────
  await ensureAlive(send);
  await settleInBand(send, 35, 80, 30_000);
  {
    const s = await state(send);
    const e = await nearestEnemy(send);
    if (e !== null) {
      const cam = { x: s.x - (e.x - s.x) * 0.08, y: s.y + 2.6, z: s.z - (e.z - s.z) * 0.08 };
      const look = lookAt(cam, { x: e.x, y: e.y + 1, z: e.z });
      await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
    }
    await screenshot(send, "8e-10-volley-a");
    await sleep(600);
    await screenshot(send, "8e-10-volley-b");
  }

  // ── Shot 5: kill burst — the client reports the victim, camera re-aims ───
  // Feed-polling can't frame a 0.5-0.8 s puff (the feed carries no position;
  // round 7's melee kill was probably in frame but indistinguishable). The
  // client now reports the killPuff position itself (dev hook
  // combat.lastKillPuff): poll at 40 ms, teleport the debug camera onto the
  // victim, screenshot inside the puff life — the ground-hit pattern.
  {
    await ensureAlive(send);
    await settleInBand(send, 18, 30, 40_000);
    const deadline = Date.now() + KILL_WAIT_SEC * 1_000;
    let caught = 0;
    const names = ["8e-10-kill-burst", "8e-10-kill-burst-b", "8e-10-kill-burst-c"];
    while (Date.now() < deadline && caught < names.length) {
      const report = (await evaluate(send, `window.__gameDebug?.combat.lastKillPuff()`)) as { x: number; y: number; z: number; ageMs: number } | null;
      if (report !== null && report.ageMs < 300) {
        const cam = { x: report.x + 4, y: report.y + 1.2, z: report.z + 3 };
        const look = lookAt(cam, report);
        await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
        const name = names[caught] ?? "8e-10-kill-burst-x";
        await screenshot(send, name);
        console.log(JSON.stringify({ event: "kill_puff_report", name, report }));
        caught += 1;
        await sleep(400); // let this report age past the 300 ms filter
        continue;
      }
      await sleep(40);
    }
    if (caught === 0) console.log(JSON.stringify({ event: "kill_burst_missed", waitSec: KILL_WAIT_SEC }));
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
