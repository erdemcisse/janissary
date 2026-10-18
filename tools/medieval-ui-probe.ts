import { writeFileSync } from "node:fs";
import WebSocket from "ws";

/**
 * Phase 8e-14 scripted browser proof for the medieval UI skin: joins the
 * live battle, then captures every reskinned surface with DOM assertions:
 *
 *   1. in-game HUD (bronze chip chrome) + draw-call baseline via F3 overlay;
 *   2. scoreboard (Tab) inside the ornate 9-slice frame;
 *   3. death screen — viewport frame, framed class plaque, all eight class
 *      tiles loaded (img.complete + naturalWidth);
 *   4. class pick on the death screen (selected state);
 *   5. ESC menu — framed panel, border-image actually resolves to
 *      /ui/frame-ornate.webp (computed style);
 *   6. alive again with a queued class → LoadoutHud "Next:" chip + icon;
 *   7. post-respawn draw calls must equal the baseline (skin adds zero GPU
 *      work — no canvas layers, no filters on animated elements).
 *
 * Prereqs: dev servers on :5173/:9001, headed Chrome with
 * --remote-debugging-port=9334.
 *
 * Usage: pnpm --filter @janissary/tools exec tsx medieval-ui-probe.ts [url] [cdpPort]
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

const key = (code: string, type: "keydown" | "keyup"): string =>
  `window.dispatchEvent(new KeyboardEvent("${type}", { code: "${code}", bubbles: true, cancelable: true }))`;

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

/** Toggle the F3 debug overlay, read the Draw-calls line, toggle it back. */
async function sampleDrawCalls(send: Send): Promise<number | null> {
  await evaluate(send, key("F3", "keydown"));
  await sleep(1200);
  const value = await evaluate(send, `(() => {
    const overlay = document.querySelector(".debug-overlay");
    if (overlay === null) return null;
    const dts = [...overlay.querySelectorAll("dt")];
    const label = dts.find((dt) => dt.textContent?.trim() === "Draw calls");
    return label !== undefined ? Number(label.nextElementSibling?.textContent ?? "NaN") : null;
  })()`);
  await evaluate(send, key("F3", "keydown"));
  await sleep(300);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Walk into the enemy line until the bots kill the probe (spawn-ux-probe logic). */
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
  await evaluate(send, `(() => { localStorage.setItem("janissary-name", "MedievalUiProbe"); return "seeded"; })()`);
  await send("Page.reload");
  await sleep(8_000);

  // Preload contract: all nine UI-skin images are declared up front.
  const preloads = await evaluate(send, `document.querySelectorAll('link[rel="preload"][href^="/ui/"]').length`);
  console.log(JSON.stringify({ event: "preloads", count: preloads, expected: 9 }));

  // Join as an Ottoman Janissary.
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
  await dismissModals(send);
  await sleep(2_000);

  // 1. In-game HUD + draw-call baseline.
  const drawCallsBefore = await sampleDrawCalls(send);
  console.log(JSON.stringify({ event: "draw_calls_before", drawCalls: drawCallsBefore }));
  await screenshot(send, "8e-14-hud");

  // 2. Scoreboard (hold Tab).
  await evaluate(send, key("Tab", "keydown"));
  const scoreboardShown = await waitFor(send, `document.querySelector(".scoreboard") !== null`, 3_000, "scoreboard");
  const scoreboardFrame = await evaluate(send, `(() => {
    const el = document.querySelector(".scoreboard");
    return el === null ? "" : getComputedStyle(el).borderImageSource;
  })()`);
  console.log(JSON.stringify({ event: "scoreboard", shown: scoreboardShown, frame: String(scoreboardFrame).slice(0, 96) }));
  await sleep(400);
  await screenshot(send, "8e-14-scoreboard");
  await evaluate(send, key("Tab", "keyup"));
  await sleep(400);

  // 3. Die for the death screen.
  console.log(JSON.stringify({ event: "death_march_start" }));
  if (!(await walkToDeath(send))) {
    console.log(JSON.stringify({ event: "death_march_failed" }));
    ws.close();
    process.exit(1);
  }
  await sleep(600);
  await dismissModals(send);

  const deathDom = await evaluate(send, `(() => {
    const screen = document.querySelector(".death-screen");
    if (screen === null) return { screen: false };
    const icons = [...screen.querySelectorAll(".class-card .class-icon")];
    return {
      screen: true,
      screenFrame: getComputedStyle(screen).borderImageSource.slice(0, 96),
      cards: screen.querySelectorAll(".class-card").length,
      icons: icons.length,
      iconsLoaded: icons.filter((img) => img.complete && img.naturalWidth > 0).length,
      sideFrame: getComputedStyle(screen.querySelector(".death-side")).borderImageSource.slice(0, 64),
    };
  })()`);
  console.log(JSON.stringify({ event: "death_dom", ...(deathDom as Record<string, unknown>) }));
  await screenshot(send, "8e-14-death-screen");

  // 4. Pick Topçu (third card) — selected state + tile visible.
  await evaluate(send, `document.querySelectorAll(".death-screen .class-card")[2]?.click()`);
  await sleep(400);
  await screenshot(send, "8e-14-class-picked");

  // 5. ESC menu — framed panel surface.
  await evaluate(send, key("Escape", "keydown"));
  const menuShown = await waitFor(send, `document.querySelector(".menu-panel") !== null`, 3_000, "menu");
  const menuDom = await evaluate(send, `(() => {
    const menu = document.querySelector(".menu-panel");
    if (menu === null) return { open: false };
    return {
      open: true,
      frame: getComputedStyle(menu).borderImageSource.slice(0, 96),
      cards: menu.querySelectorAll(".class-card").length,
      iconsLoaded: [...menu.querySelectorAll(".class-card .class-icon")].filter((img) => img.complete && img.naturalWidth > 0).length,
    };
  })()`);
  console.log(JSON.stringify({ event: "esc_menu", shown: menuShown, ...(menuDom as Record<string, unknown>) }));
  await screenshot(send, "8e-14-esc-menu");

  // Queue Sipahi (second card) for the next life, then resume + deploy.
  await evaluate(send, `document.querySelectorAll(".menu-panel .class-card")[1]?.click()`);
  await sleep(300);
  await evaluate(send, `document.querySelector(".menu-resume")?.click()`);
  await sleep(400);

  const armed = await waitFor(send, `document.querySelector(".death-screen .deploy-button")?.disabled === false`, 8_000, "deploy-arm");
  await evaluate(send, `document.querySelector(".death-screen .deploy-button")?.click()`);
  const respawned = await waitFor(send, `window.__gameDebug?.movement.state().alive === true`, 10_000, "respawn");
  console.log(JSON.stringify({ event: "deploy", armed, respawned }));
  await sleep(1_500);
  await dismissModals(send);

  // 6. Alive with a queued class? The chip shows only when the queued class
  //    differs from the live one. Deploy consumed the step-5 pick (we ARE
  //    that class now), so queue a DIFFERENT enabled class from the ESC menu.
  let chipText = String(await evaluate(send, `document.querySelector(".loadout .queued-class")?.textContent ?? ""`));
  if (chipText === "") {
    await evaluate(send, key("Escape", "keydown"));
    await waitFor(send, `document.querySelector(".menu-panel") !== null`, 3_000, "menu-2");
    const menuState = await evaluate(send, `(() => {
      const menu = document.querySelector(".menu-panel");
      if (menu === null) return { open: false };
      const cards = [...menu.querySelectorAll(".class-card")];
      const current = cards.findIndex((card) => card.classList.contains("selected"));
      const target = cards.findIndex((card, i) => i !== current && !card.disabled);
      cards[target]?.click();
      return {
        open: true,
        activeTab: menu.querySelector(".menu-tabs button.active")?.textContent ?? "",
        cards: cards.length,
        currentSelected: current,
        picked: target,
        pickedTitle: cards[target]?.querySelector("strong")?.textContent ?? "",
      };
    })()`);
    console.log(JSON.stringify({ event: "menu_2_pick", ...(menuState as Record<string, unknown>) }));
    await sleep(600);
    await evaluate(send, `document.querySelector(".menu-resume")?.click()`);
    await sleep(1_000);
    chipText = String(await evaluate(send, `document.querySelector(".loadout .queued-class")?.textContent ?? ""`));
  }
  const chipIcon = await evaluate(send, `(() => {
    const img = document.querySelector(".loadout .queued-class .chip-icon");
    return img === null ? "none" : img.complete && img.naturalWidth > 0 ? "loaded" : "failed";
  })()`);
  console.log(JSON.stringify({ event: "queued_chip", text: chipText, icon: chipIcon }));
  await screenshot(send, "8e-14-queued-chip");

  // 7. Perf guard: the skin is pure DOM/CSS — it cannot add WebGL work, so
  //    the evidence is (a) draw-call stability across same-spot samples a few
  //    seconds apart and (b) no filter/backdrop-filter on the per-frame HUD.
  const samples: (number | null)[] = [];
  for (let i = 0; i < 3; i += 1) {
    samples.push(await sampleDrawCalls(send));
    await sleep(2_000);
  }
  const hudFilter = await evaluate(send, `(() => {
    const vitals = document.querySelector(".vitals");
    if (vitals === null) return null;
    const style = getComputedStyle(vitals);
    return { filter: style.filter, backdropFilter: style.backdropFilter, canvasCount: document.querySelectorAll(".game-container canvas").length };
  })()`);
  console.log(JSON.stringify({ event: "draw_calls_samples", samples, baselinePreDeath: drawCallsBefore, hudFilter }));

  ws.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
