import { writeFileSync } from "node:fs";
import WebSocket from "ws";

/**
 * Phase 8e-3 scripted browser proof: joins the live battle, switches weapon
 * slots 1/2/3, verifies the HUD follows, proves fire is blocked mid-draw,
 * captures screenshots, and samples F3 fps at high tier against ADR 0028.
 *
 * Prereqs: dev servers on :5173/:9001, Chrome with --remote-debugging-port=9333.
 */
const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const TAG = process.argv[4] ?? "8e3";
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
  // Same 20 Hz sampling caveat as keys: hold the press across fixed steps.
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await sleep(holdMs);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

const HUD_STATE_JS = `(() => {
  const slots = [...document.querySelectorAll(".loadout .slot")].map((slot) => ({
    title: slot.getAttribute("title"),
    active: slot.classList.contains("active"),
    drawing: slot.classList.contains("drawing"),
    pip: slot.querySelector(".pip") === null ? null : (slot.querySelector(".pip").classList.contains("pip-loaded") ? "loaded" : "empty"),
  }));
  const ammo = document.querySelector(".vitals .ammo-num")?.textContent ?? null;
  const meleeRing = document.querySelector(".reticle .ret-melee") !== null;
  const reloadRing = document.querySelector(".reticle .ret-reload") !== null;
  const locked = document.pointerLockElement !== null;
  return { slots, ammo, meleeRing, reloadRing, locked };
})()`;

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
    localStorage.setItem("janissary-name", "SlotProbe-${TAG}");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);
  const join = await evaluate(send, `(() => {
    const input = document.querySelector(".connect-card input");
    if (input === null) return "no-join-form";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "SlotProbe-${TAG}");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".connect-card button").click();
    return "joined-submit";
  })()`);
  console.log(JSON.stringify({ event: "join", result: join }));
  await sleep(18_000);

  // Pointer lock via a trusted canvas click at the canvas's own center.
  const [cx, cy] = await canvasCenter(send);
  await click(send, cx, cy);
  await sleep(1_500);

  const initial = await evaluate(send, HUD_STATE_JS);
  console.log(JSON.stringify({ event: "hud", phase: "initial-slot2", state: initial }));

  // Slot 1: sword.
  await key(send, "Digit1", "1", 49);
  await sleep(1_400);
  const slot1 = await evaluate(send, HUD_STATE_JS);
  console.log(JSON.stringify({ event: "hud", phase: "slot1-sword", state: slot1 }));
  await screenshot(send, "8e-3-slot1-sword");

  // Slot 3: dagger.
  await key(send, "Digit3", "3", 51);
  await sleep(1_400);
  const slot3 = await evaluate(send, HUD_STATE_JS);
  console.log(JSON.stringify({ event: "hud", phase: "slot3-dagger", state: slot3 }));
  await screenshot(send, "8e-3-slot3-dagger");

  // Fire mid-draw: start a draw to slot 2 and click inside the 0.6 s window;
  // the shot must be inert (ammo stays 1 / 1).
  await key(send, "Digit2", "2", 50);
  await sleep(120);
  await click(send, cx, cy);
  await sleep(400);
  const midDraw = await evaluate(send, HUD_STATE_JS);
  console.log(JSON.stringify({ event: "hud", phase: "fire-mid-draw-blocked", state: midDraw }));
  await sleep(1_000);
  const afterDraw = await evaluate(send, HUD_STATE_JS);
  console.log(JSON.stringify({ event: "hud", phase: "slot2-after-draw", state: afterDraw }));
  await screenshot(send, "8e-3-slot2-arquebus");

  // Fire for real: the round leaves the pan (ammo 0 / 1, pip empties).
  await click(send, cx, cy);
  await sleep(900);
  const fired = await evaluate(send, HUD_STATE_JS);
  console.log(JSON.stringify({ event: "hud", phase: "fired-empty", state: fired }));
  await screenshot(send, "8e-3-fired-empty");

  // F3 fps sample (high tier, live 100-bot battle).
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
