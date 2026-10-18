/**
 * Phase 8e-1 combat-feel browser proof: joins a battle headless, pointer-locks,
 * fires once, and captures the evidence screenshots (muzzle flash/tracer while
 * firing, reload radial after firing) plus F3 fps/frame-p95 samples. Built on
 * the perf-probe CDP pattern (ADR 0028). Usage:
 *
 *   pnpm --filter @janissary/tools exec tsx combat-feel-probe.ts [url] [quality] [tag]
 *
 * Chrome must already be running with --remote-debugging-port=9333.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import WebSocket from "ws";

const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const QUALITY = process.argv[3] ?? "high";
const TAG = process.argv[4] ?? "run";
const SHOT_DIR = "docs/image-feedback";

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
      const send: Send = (method, params = {}) => {
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

async function evaluate(send: Send, expression: string, awaitPromise = false): Promise<unknown> {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (result.exceptionDetails !== undefined) return { __exception: result.exceptionDetails };
  const value = result.result as { value?: unknown } | undefined;
  return value?.value;
}

async function screenshot(send: Send, name: string): Promise<void> {
  const result = await send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
  const data = result["data"];
  if (typeof data !== "string") {
    console.log(JSON.stringify({ event: "screenshot_failed", name }));
    return;
  }
  mkdirSync(SHOT_DIR, { recursive: true });
  writeFileSync(`${SHOT_DIR}/${name}.jpg`, Buffer.from(data, "base64"));
  console.log(JSON.stringify({ event: "screenshot", name }));
}

async function mouse(send: Send, type: string, x: number, y: number, button: "left" | "none", clickCount: number): Promise<void> {
  await send("Input.dispatchMouseEvent", { type, x, y, button, clickCount });
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
  await send("Log.enable").catch(() => ({}));
  ws.on("message", (data) => {
    const message = JSON.parse(String(data)) as { method?: string; params?: { entry?: { text?: string } } };
    if (message.method === "Log.entryAdded") console.log(JSON.stringify({ event: "console", text: message.params?.entry?.text }));
  });

  console.log(JSON.stringify({ event: "phase", tag: TAG, quality: QUALITY, detail: "navigate" }));
  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);

  await evaluate(send, `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: ${JSON.stringify(QUALITY)} }));
    localStorage.setItem("janissary-name", "FeelProbe-${TAG}");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);

  const join = await evaluate(send, `(() => {
    const input = document.querySelector(".connect-card input");
    if (input === null) return "no-join-form";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "FeelProbe-${TAG}");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".connect-card button").click();
    return "joined-submit";
  })()`);
  console.log(JSON.stringify({ event: "join", result: join }));
  await sleep(20_000);

  // Pointer lock needs a focused window (headed Chrome) — focus FIRST so the
  // F3 toggle and the clicks land.
  await send("Page.bringToFront");
  await sleep(800);

  // F3 diagnostics on.
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "F3", code: "F3", windowsVirtualKeyCode: 114, nativeVirtualKeyCode: 114 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "F3", code: "F3", windowsVirtualKeyCode: 114, nativeVirtualKeyCode: 114 });
  await sleep(1_500);

  await screenshot(send, `8e-1-${TAG}-before-fire`);
  // Pointer lock via a trusted click on the canvas center.
  const canvasBox = await evaluate(send, `(() => {
    const canvas = document.querySelector(".game-container canvas");
    if (canvas === null) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`) as { x: number; y: number } | null;
  if (canvasBox === null || "__exception" in (canvasBox as object)) {
    console.log(JSON.stringify({ event: "no_canvas" }));
    ws.close();
    process.exit(1);
  }
  await mouse(send, "mousePressed", canvasBox.x, canvasBox.y, "left", 1);
  await mouse(send, "mouseReleased", canvasBox.x, canvasBox.y, "left", 1);
  await sleep(600);
  const locked = await evaluate(send, `document.pointerLockElement !== null`);
  console.log(JSON.stringify({ event: "pointer_lock", locked }));

  // Fire: hold the button briefly. The first press both locks and fires only
  // when already locked — so click once more if the first click was spent on
  // the lock.
  await mouse(send, "mousePressed", canvasBox.x, canvasBox.y, "left", 1);
  await sleep(60);
  await mouse(send, "mouseReleased", canvasBox.x, canvasBox.y, "left", 1);
  await screenshot(send, `8e-1-${TAG}-firing-a`);
  await screenshot(send, `8e-1-${TAG}-firing-b`);

  const ammoState = await evaluate(send, `(() => {
    const ammo = document.querySelector(".ammo-num");
    const radial = document.querySelector(".ret-reload");
    const dot = document.querySelector(".ret-dot");
    return {
      ammoText: ammo === null ? null : ammo.textContent,
      radialPresent: radial !== null,
      radialOffset: radial === null ? null : getComputedStyle(radial).strokeDashoffset,
      dotEmpty: dot === null ? null : dot.classList.contains("empty"),
    };
  })()`);
  console.log(JSON.stringify({ event: "post_fire_state", ...(ammoState as Record<string, unknown>) }));

  // Reload is manual (R) and takes 6 s: start it, then screenshot the radial.
  // Hold the key — Reload is level-triggered and the client samples buttons
  // at 20 Hz, so an instant down/up pair can fall between two samples.
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "r", code: "KeyR", windowsVirtualKeyCode: 82, nativeVirtualKeyCode: 82 });
  await sleep(250);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "r", code: "KeyR", windowsVirtualKeyCode: 82, nativeVirtualKeyCode: 82 });
  await sleep(1_200);
  const radialEarly = await evaluate(send, `(() => {
    const radial = document.querySelector(".ret-reload");
    return radial === null ? null : getComputedStyle(radial).strokeDashoffset;
  })()`);
  console.log(JSON.stringify({ event: "radial_early", offset: radialEarly }));
  await screenshot(send, `8e-1-${TAG}-reload-radial`);
  await sleep(3_200);
  const radialMid = await evaluate(send, `(() => {
    const radial = document.querySelector(".ret-reload");
    return radial === null ? null : getComputedStyle(radial).strokeDashoffset;
  })()`);
  console.log(JSON.stringify({ event: "radial_mid", offset: radialMid }));
  // Poll for the READY flash (450 ms window) across the 6 s reload completion.
  let readyState: unknown = null;
  for (let poll = 0; poll < 12; poll += 1) {
    await sleep(300);
    readyState = await evaluate(send, `(() => {
      const reticle = document.querySelector(".reticle");
      const ammo = document.querySelector(".ammo-num");
      return {
        readyClass: reticle === null ? null : reticle.classList.contains("ready"),
        readyRing: document.querySelector(".ret-ready") !== null,
        ammoText: ammo === null ? null : ammo.textContent,
      };
    })()`);
    const state = readyState as { readyClass?: boolean } | null;
    if (state !== null && typeof state === "object" && state.readyClass === true) break;
  }
  console.log(JSON.stringify({ event: "ready_state", ...(readyState as Record<string, unknown>) }));
  await screenshot(send, `8e-1-${TAG}-ready`);

  // F3 samples for the perf comparison.
  const readOverlay = (): Promise<unknown> => evaluate(send, `(() => {
    const overlay = document.querySelector(".debug-overlay");
    if (overlay === null) return { present: false };
    const pairs = new Map();
    const dts = overlay.querySelectorAll("dt");
    for (const dt of dts) {
      const dd = dt.nextElementSibling;
      if (dd !== null) pairs.set(dt.textContent, dd.textContent);
    }
    const get = (label) => { const v = pairs.get(label); return v === undefined ? null : Number.parseFloat(v); };
    return { present: true, fps: get("Frame rate"), frameP95Ms: get("Frame p95"), drawCalls: get("Draw calls"), visible: get("Visible"), entities: get("Entities"), pingMs: get("Ping") };
  })()`);
  const samples: Record<string, unknown>[] = [];
  for (let index = 0; index < 4; index += 1) {
    const overlay = await readOverlay();
    samples.push(overlay as Record<string, unknown>);
    console.log(JSON.stringify({ event: "sample", index, ...(overlay as Record<string, unknown>) }));
    await sleep(3_000);
  }
  const rafFps = await evaluate(send, `new Promise((resolve) => { let n = 0; const t0 = performance.now(); const f = () => { n += 1; if (performance.now() - t0 >= 8000) { resolve(n / 8); } else { requestAnimationFrame(f); } }; requestAnimationFrame(f); })`, true);
  console.log(JSON.stringify({ event: "summary", tag: TAG, quality: QUALITY, rafFps, samples }));
  ws.close();
  process.exit(0);
}

main().catch((error) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
