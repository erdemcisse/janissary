import { writeFileSync } from "node:fs";
import WebSocket from "ws";

/**
 * Phase 8e-13 scripted browser proof: joins the live battle, gets killed by
 * walking into the enemy line, then exercises the new death → deploy flow end
 * to end with DOM assertions and screenshots:
 *
 *   1. death screen appears with NO countdown number (respawn timer is gone);
 *   2. class card click queues a class (card + kbd visible);
 *   3. spawn markers on the live minimap are clickable;
 *   4. Deploy arms only after the floor and spawns the player;
 *   5. ESC menu opens on the new Class tab; a pick there queues next class;
 *   6. the LoadoutHud "Next: X" chip reflects the queued class while alive.
 *
 * Prereqs: dev servers on :5173/:9001, headed Chrome with
 * --remote-debugging-port=9334. Pass "small" as argv[4] for the 1280×720 run
 * (death-screen shot only).
 *
 * Usage: pnpm --filter @janissary/tools exec tsx spawn-ux-probe.ts [url] [cdpPort] [small]
 */
const DEBUG_PORT = Number(process.argv[3] ?? 9334);
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const SMALL = process.argv[4] === "small";
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

interface DebugState { alive: boolean; x: number; z: number }
const BTN_FORWARD = 1 << 0;

const state = (send: Send): Promise<DebugState> =>
  evaluate(send, `window.__gameDebug?.movement.state()`) as Promise<DebugState>;
const nearestEnemy = (send: Send): Promise<{ x: number; z: number; distance: number } | null> =>
  evaluate(send, `window.__gameDebug?.combat.nearestEnemy()`) as Promise<{ x: number; z: number; distance: number } | null>;
const drive = (send: Send, buttons: number, yaw: number): Promise<unknown> =>
  evaluate(send, `window.__gameDebug?.movement.drive(${buttons}, ${yaw}, 0)`);
const driveStop = (send: Send): Promise<unknown> => evaluate(send, `window.__gameDebug?.movement.driveStop()`);

async function dismissModals(send: Send): Promise<void> {
  await evaluate(send, `(() => {
    for (const button of document.querySelectorAll("button")) {
      if (button.textContent?.trim() === "Not now") { button.click(); return "dismissed"; }
    }
    return "none";
  })()`);
}

async function waitFor(send: Send, expression: string, timeoutMs: number, label: string): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await evaluate(send, expression);
    if (value === true) return true;
    await sleep(250);
  }
  console.log(JSON.stringify({ event: "wait_timeout", label }));
  return false;
}

/**
 * Walk into the enemy line until the bots kill the probe player. The naive
 * march can stalemate: the nearest enemy may stand on the FAR side of the
 * Theodosian wall, so the probe hugs the south face forever, unkillable.
 * Unstick: no progress for 8 s → flank diagonally through the wall lane
 * (toward the breach/gate line), alternating direction if that also wedges.
 */
async function walkToDeath(send: Send): Promise<boolean> {
  const deadline = Date.now() + 180_000;
  let lastX = Number.NaN;
  let lastZ = Number.NaN;
  let lastProgress = Date.now();
  let flankSign = 1;
  while (Date.now() < deadline) {
    const s = await state(send);
    if (s === undefined || s === null) return false;
    if (!s.alive) {
      await driveStop(send);
      return true;
    }
    const now = Date.now();
    if (!Number.isFinite(lastX) || Math.hypot(s.x - lastX, s.z - lastZ) > 2) {
      lastX = s.x;
      lastZ = s.z;
      lastProgress = now;
    }
    const stuckFor = now - lastProgress;
    const enemy = await nearestEnemy(send);
    // No enemy inside the interest set yet → head for the wall lane.
    let target = enemy ?? { x: 0, z: -10 };
    if (stuckFor > 8_000) {
      if (stuckFor > 24_000) {
        flankSign *= -1;
        lastProgress = now - 12_000;
      }
      target = { x: s.x + flankSign * 60, z: s.z - 30 };
    }
    const dx = target.x - s.x;
    const dz = target.z - s.z;
    await drive(send, BTN_FORWARD, Math.atan2(-dx, -dz));
    await sleep(350);
  }
  await driveStop(send);
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
    localStorage.setItem("janissary-name", "SpawnUxProbe");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);

  // Join as an Ottoman Janissary (the default class).
  const join = await evaluate(send, `(() => {
    const card = document.querySelector(".connect-card");
    if (card === null) return "no-join-form";
    const selects = card.querySelectorAll("select");
    const pick = (select, wanted) => {
      for (const option of select.options) { if (option.text.includes(wanted)) { select.value = option.value; select.dispatchEvent(new Event("change", { bubbles: true })); return option.text; } }
      return "";
    };
    const team = selects.length > 0 ? pick(selects[0], "Ottoman") : "";
    const cls = selects.length > 1 ? pick(selects[1], "Janissary") : "";
    card.querySelector("button[type=submit]").click();
    return "joined:" + team + ":" + cls;
  })()`);
  console.log(JSON.stringify({ event: "join", result: join }));
  await sleep(12_000);

  const debugReady = await evaluate(send, `typeof window.__gameDebug`);
  if (debugReady !== "object") {
    console.log(JSON.stringify({ event: "cdp_error", detail: "__gameDebug missing (not a dev build?)" }));
    process.exit(1);
  }

  // Die: walk straight at the nearest enemy until the bots do their job.
  console.log(JSON.stringify({ event: "death_march_start" }));
  if (!(await walkToDeath(send))) {
    console.log(JSON.stringify({ event: "death_march_failed" }));
    ws.close();
    process.exit(1);
  }
  console.log(JSON.stringify({ event: "dead" }));
  await sleep(400);

  // 1. Death screen, no countdown number anywhere.
  await dismissModals(send);
  const deathDom = await evaluate(send, `(() => {
    const screen = document.querySelector(".death-screen");
    if (screen === null) return { screen: false };
    return {
      screen: true,
      timerGone: document.querySelector(".respawn-timer") === null && !/[0-9]+\\.[0-9]\\s*s/.test(screen.textContent ?? ""),
      map: screen.querySelector(".death-map canvas") !== null,
      markers: screen.querySelectorAll(".spawn-marker").length,
      cards: screen.querySelectorAll(".class-card").length,
      deployDisabled: screen.querySelector(".deploy-button")?.disabled ?? null,
    };
  })()`);
  console.log(JSON.stringify({ event: "death_dom", ...(deathDom as Record<string, unknown>) }));
  await screenshot(send, SMALL ? "8e-13-death-screen-1280x720" : "8e-13-death-screen");
  if (SMALL) {
    ws.close();
    process.exit(0);
  }

  // 2. Class card pick (Topçu — third card).
  await evaluate(send, `document.querySelectorAll(".death-screen .class-card")[2]?.click()`);
  await sleep(400);
  const picked = await evaluate(send, `(() => {
    const cards = [...document.querySelectorAll(".death-screen .class-card")];
    return { selectedIndex: cards.findIndex((card) => card.classList.contains("selected")) };
  })()`);
  console.log(JSON.stringify({ event: "class_picked", ...(picked as Record<string, unknown>) }));
  await screenshot(send, "8e-13-class-picked");

  // 3. Spawn marker click (a forward point if one is owned, else home).
  const marker = await evaluate(send, `(() => {
    const forward = document.querySelector(".death-screen .spawn-marker:not(.home)");
    const marker = forward ?? document.querySelector(".death-screen .spawn-marker.home");
    if (marker === null) return "none";
    marker.click();
    return forward !== null ? "forward" : "home";
  })()`);
  console.log(JSON.stringify({ event: "spawn_marker", picked: marker }));
  await sleep(300);
  await screenshot(send, "8e-13-minimap-zoom");

  // 4. Deploy arms after the floor; clicking it spawns the player.
  const armed = await waitFor(send, `document.querySelector(".deploy-button")?.disabled === false`, 6_000, "deploy-arm");
  console.log(JSON.stringify({ event: "deploy_armed", armed }));
  await evaluate(send, `document.querySelector(".deploy-button")?.click()`);
  const respawned = await waitFor(send, `window.__gameDebug?.movement.state().alive === true`, 10_000, "respawn");
  console.log(JSON.stringify({ event: "respawned", respawned }));

  // 5. ESC menu opens on the Class tab.
  await evaluate(send, `window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true, cancelable: true }))`);
  await sleep(500);
  const menuDom = await evaluate(send, `(() => {
    const menu = document.querySelector(".menu-panel");
    if (menu === null) return { open: false };
    return {
      open: true,
      activeTab: menu.querySelector(".menu-tabs button.active")?.textContent ?? "",
      resume: menu.querySelector(".menu-resume") !== null,
      cards: menu.querySelectorAll(".class-card").length,
    };
  })()`);
  console.log(JSON.stringify({ event: "esc_menu", ...(menuDom as Record<string, unknown>) }));
  await screenshot(send, "8e-13-esc-menu");

  // 6. Pick Sipahi (second card) in the menu → queued for the next life.
  await evaluate(send, `document.querySelectorAll(".menu-panel .class-card")[1]?.click()`);
  await sleep(400);
  await screenshot(send, "8e-13-esc-menu-class-change");

  // 7. Resume → the LoadoutHud "Next: Sipahi" chip must show.
  await evaluate(send, `document.querySelector(".menu-resume")?.click()`);
  await sleep(400);
  const chip = await evaluate(send, `document.querySelector(".loadout .queued-class")?.textContent ?? ""`);
  console.log(JSON.stringify({ event: "queued_chip", text: chip }));

  ws.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
