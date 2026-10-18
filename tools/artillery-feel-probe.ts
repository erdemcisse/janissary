import { writeFileSync } from "node:fs";
import WebSocket from "ws";

/**
 * Phase 8e-9 scripted browser proof (artillery half): mans a Byzantine wall
 * gun and fires live shells so the camera can catch
 *  1. the cannonball in flight with its smoke tail ("8e-9-shell-flight"),
 *  2. the impact burst ("8e-9-explosion-burst"),
 *  3. the rising smoke column ("8e-9-explosion-column"),
 *  4. the scorch field after the bombardment ("8e-9-scorch-field").
 *
 * The client mirrors the server shell at the STATIC gun yaw and the fixed
 * SHELL_PITCH = 0.32 (GameClient.ts #trackShell) — so the probe aims the gun
 * at exactly yaw π / pitch 0.32, making the visual trajectory identical to
 * the server's: muzzle (0, 1.5, -7), v = 58 m/s, g = -18 → impact ≈ (0, 0,
 * +109) after ≈ 2.1 s. Timing polls the dev counters, so the camera is
 * always aimed when the event happens.
 *
 * Prereqs: dev servers on :5173/:9001, Chrome with --remote-debugging-port=9333.
 *   npx tsx artillery-feel-probe.ts [url]
 */
const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const SHOT_DIR = new URL("../docs/image-feedback/", import.meta.url).pathname;

/** InputButton bits (shared/src/constants.ts). */
const BTN = { forward: 1 << 0, fire: 1 << 4, interact: 1 << 8 } as const;

/** Wall gun id 1: shared/src/map.ts ARTILLERY_EMPLACEMENTS. */
const GUN = { x: 0, z: -7, yaw: Math.PI };
/** The gun's aim while probing: near the left arc limit, so the SERVER shell
 * (the damage) lands in the empty eastern field — killing bots ranks the
 * probe player up and the promotion fanfare ruins screenshots (rounds 2-3).
 * The CLIENT mirror ignores the aim and flies the static gun yaw + SHELL_PITCH
 * either way (GameClient.ts #trackShell), so every screenshot below still
 * shows the same deterministic visual trajectory. */
const AIM_YAW = Math.PI - 1.2;
const SHELL_PITCH = 0.32; // GameClient.ts SHELL_PITCH — mirror = server here
// Deterministic impact estimate (speed 58, gravity -18, muzzle y 1.5):
const IMPACT = { x: 0, z: 109 };

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

async function evaluate(send: Send, expression: string): Promise<unknown> {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
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

interface DebugState {
  x: number;
  y: number;
  z: number;
  grounded: boolean;
  alive: boolean;
}

interface Counters {
  shots: number;
  hits: number;
  explosions: number;
  shellsFired: number;
}

const state = (send: Send): Promise<DebugState> =>
  evaluate(send, `window.__gameDebug?.movement.state()`) as Promise<DebugState>;

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

/** The "Save your progress" magic-link modal pops mid-battle and blurs every
 * screenshot under it — click it away if present. */
async function dismissModals(send: Send): Promise<void> {
  await evaluate(send, `(() => {
    for (const button of document.querySelectorAll("button")) {
      if (button.textContent?.trim() === "Not now") { button.click(); return "dismissed"; }
    }
    return "none";
  })()`);
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

/** Walk to the gun and stop within arm's reach (server manning radius is 3 m).
 * The Byzantine spawn sits behind the inner-city district's solid north wall
 * (shared/src/map.ts CITY_WALLS: (0,-84) spans x -19..19), so a straight line
 * to the gun pins against the wall face forever — route around the district. */
const WAYPOINTS = [{ x: 32, z: -88 }, { x: 32, z: -10 }, { x: GUN.x, z: GUN.z }];

async function walkToGun(send: Send): Promise<boolean> {
  const deadline = Date.now() + 90_000;
  let waypoint = 0;
  let polls = 0;
  while (Date.now() < deadline) {
    const s = await state(send);
    if (!s.alive) {
      await ensureAlive(send);
      continue;
    }
    polls += 1;
    if (polls % 10 === 1) console.log(JSON.stringify({ event: "walk", x: Math.round(s.x), z: Math.round(s.z), waypoint }));
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
    await drive(send, BTN.forward, Math.atan2(-dx, -dz));
    await sleep(300);
  }
  await driveStop(send);
  return false;
}

/** One Interact tap (the server's 0.5 s interact gate makes holds toggle). */
async function tapInteract(send: Send): Promise<void> {
  await drive(send, BTN.interact, AIM_YAW, SHELL_PITCH);
  await sleep(150);
  await drive(send, 0, AIM_YAW, SHELL_PITCH);
  await sleep(600);
}

/** Hold Fire briefly; returns true once a new shell is tracked flying. */
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

  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);
  await evaluate(send, `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: "high" }));
    localStorage.setItem("janissary-name", "ArtilleryProbe");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);

  // Join: Byzantine Wall Gunner — the artillery class that can man wall guns.
  const join = await evaluate(send, `(() => {
    const card = document.querySelector(".connect-card");
    if (card === null) return "no-join-form";
    const input = card.querySelector("input");
    if (input !== null) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "ArtilleryProbe");
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
  await sleep(6_000);
  await ensureAlive(send);
  const spawned = await state(send);
  console.log(JSON.stringify({ event: "spawned", x: Math.round(spawned.x), z: Math.round(spawned.z) }));

  // Focus the canvas so the input pipeline takes the drive override (the
  // 8e-9 projectile probe's drive was only ever proven after this click).
  const [cx, cy] = await canvasCenter(send);
  await click(send, cx, cy);
  await sleep(1_000);
  console.log(JSON.stringify({ event: "locked", locked: await evaluate(send, `document.pointerLockElement !== null`) }));

  if (!(await walkToGun(send))) {
    console.log(JSON.stringify({ event: "walk_failed" }));
    await screenshot(send, "8e-9-artillery-failed");
    ws.close();
    process.exit(1);
  }
  const atGun = await state(send);
  console.log(JSON.stringify({ event: "at_gun", x: atGun.x, z: atGun.z }));

  // Man the gun: tap Interact, then prove it by firing — a tracked shell is
  // the manning receipt. One retry in case the first tap raced the gate.
  let base = await counters(send);
  let manned = false;
  for (let attempt = 0; attempt < 3 && !manned; attempt += 1) {
    await tapInteract(send);
    manned = await fireGun(send, base);
    if (!manned) await sleep(800);
  }
  if (!manned) {
    console.log(JSON.stringify({ event: "man_failed" }));
    await screenshot(send, "8e-9-artillery-failed");
    ws.close();
    process.exit(1);
  }
  console.log(JSON.stringify({ event: "manned_and_fired" }));

  // ── Shell flight: camera pre-aimed side-on at MY shell's deterministic
  // corridor (from (0,1.5,-7) toward +Z). Round 2 lesson: a shell triggered
  // at the corridor edge leaves the frame during the screenshot latency, so
  // the trigger window is the frame's CENTER third (z 30..46 from this
  // camera) — detection at z=30 lands the capture at z≈36-41, dead center,
  // 13 m away, where the ball spans ~40 px with its 5 m tail behind it.
  // shells() tracks every gun's shell, so the |x|<5 guard keeps bot guns'
  // shells (x=±38 emplacements, x≈±8..24 bombards) from false-triggering.
  const corridorCam = { x: 13, y: 9, z: 38 };
  const corridorLook = lookAt(corridorCam, { x: 0, y: 8, z: 38 });
  await setCamera(send, corridorCam.x, corridorCam.y, corridorCam.z, corridorLook.yaw, corridorLook.pitch);
  let flightCaught = false;
  const tryFlightShot = async (windowMs: number): Promise<boolean> => {
    const deadline = Date.now() + windowMs;
    while (Date.now() < deadline) {
      const live = await shells(send);
      for (const shell of live) {
        if (Math.abs(shell.x) < 5 && shell.z > 30 && shell.z < 46 && shell.y > 4) {
          await dismissModals(send);
          await screenshot(send, "8e-9-shell-flight");
          return true;
        }
      }
      await sleep(40);
    }
    return false;
  };
  // Fire #1 already happened (the manning proof) — its shell may still be
  // early in flight when we get here.
  flightCaught = await tryFlightShot(2_600);

  // ── Shot 1 impact: swing the camera to the impact zone before the shell
  // lands (≈1 s left), then poll the explosion counter for the burst frame.
  const boomCam = { x: IMPACT.x + 18, y: 9, z: IMPACT.z + 6 };
  const boomLook = lookAt(boomCam, { x: IMPACT.x, y: 1, z: IMPACT.z });
  await setCamera(send, boomCam.x, boomCam.y, boomCam.z, boomLook.yaw, boomLook.pitch);
  const preBoom = await counters(send);
  {
    const deadline = Date.now() + 6_000;
    while (Date.now() < deadline) {
      const now = await counters(send);
      if (now.explosions > preBoom.explosions) {
        await dismissModals(send);
        await screenshot(send, "8e-9-explosion-burst");
        break;
      }
      await sleep(50);
    }
  }
  await sleep(1_200);
  await dismissModals(send);
  await screenshot(send, "8e-9-explosion-column");
  console.log(JSON.stringify({ event: "impact", x: IMPACT.x, z: IMPACT.z }));

  // ── Shot 2 (after the 12 s solo reload) fires ONLY as the flight-shot
  // retry — the scorch screenshot moved ahead of it (see below).
  // ── Scorch field FIRST, right after the column: the decal lives 60 s, and
  // the probe's artillery kills rank the player up seconds later — every
  // late screenshot loses to the promotion fanfare (rounds 2-3). The wait is
  // long and double-confirmed because ceremonies queue back-to-back. The
  // camera uses the deterministic mirror impact point, not a polled shell —
  // shells() tracks every gun in the battle and round 4's scorch camera
  // chased a bot's shell to the wrong field.
  const scorchCam = { x: IMPACT.x + 7, y: 5.5, z: IMPACT.z + 7 };
  const scorchLook = lookAt(scorchCam, { x: IMPACT.x, y: 0, z: IMPACT.z });
  await setCamera(send, scorchCam.x, scorchCam.y, scorchCam.z, scorchLook.yaw, scorchLook.pitch);
  let clearPolls = 0;
  for (let wait = 0; wait < 60 && clearPolls < 2; wait += 1) {
    const ceremony = await evaluate(send, `document.body.innerText.includes("Promoted to")`);
    clearPolls = ceremony === true ? 0 : clearPolls + 1;
    await sleep(500);
  }
  await dismissModals(send);
  await sleep(400);
  await screenshot(send, "8e-9-scorch-field");

  if (!flightCaught) {
    await sleep(12_500);
    base = await counters(send);
    const second = await fireGun(send, base);
    console.log(JSON.stringify({ event: "second_shot", fired: second }));
    if (second) {
      await setCamera(send, corridorCam.x, corridorCam.y, corridorCam.z, corridorLook.yaw, corridorLook.pitch);
      flightCaught = await tryFlightShot(2_400);
    }
  }
  console.log(JSON.stringify({ event: "flight_caught", caught: flightCaught }));
  await clearCamera(send);
  await driveStop(send);

  const final = await counters(send);
  console.log(JSON.stringify({ event: "done", counters: final }));
  ws.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
