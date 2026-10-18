import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

/**
 * Human-feel capture (Phase 8e-6): frame-stamped screenshot sequences of the
 * three feel situations — slope walk (plateau step-up), ford crossing, jump
 * landing — saved to docs/image-feedback/8e-6-*.jpg. Screenshots are taken
 * every 150 ms while the dev-only `__gameDebug.movement.drive` hook walks
 * the local player through the situation; the F3 overlay is on so each frame
 * carries the reconciliation/correction counters.
 *
 * Prereqs: dev servers on :5173/:9001, headed Chrome with
 * --remote-debugging-port=9333. Usage: pnpm --filter @janissary/tools exec
 * tsx movement-feel-capture.ts [target] [tag]
 */

const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const TAG = process.argv[3] ?? "fix";
const FRAME_MS = 150;

const BTN = { forward: 1, jump: 4096 } as const;

interface CdpResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message: string };
}

function connectCdp(url: string): Promise<{ ws: WebSocket; send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
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
  if (result.exceptionDetails !== undefined) throw new Error(JSON.stringify(result.exceptionDetails));
  const value = result.result as { value?: unknown } | undefined;
  return value?.value;
}

const state = (send: Send): Promise<{ x: number; y: number; z: number; alive: boolean; corrections: number }> =>
  evaluate(send, `window.__gameDebug?.movement.state()`) as Promise<{ x: number; y: number; z: number; alive: boolean; corrections: number }>;

const drive = (send: Send, buttons: number, yaw: number): Promise<unknown> =>
  evaluate(send, `window.__gameDebug?.movement.drive(${buttons}, ${yaw})`);

const outDir = fileURLToPath(new URL("../docs/image-feedback/", import.meta.url));

async function shot(send: Send, name: string): Promise<void> {
  const result = await send("Page.captureScreenshot", { format: "jpeg", quality: 80 });
  const data = result.data as string;
  writeFileSync(`${outDir}8e-6-${name}.jpg`, Buffer.from(data, "base64"));
}

/** Drive toward a target while screenshotting every FRAME_MS. */
async function driveTo(send: Send, tx: number, tz: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await state(send);
    if (!s.alive) throw new Error("died");
    const inMenu = await evaluate(send, `document.querySelector(".connect-card") !== null`);
    if (inMenu === true) throw new Error("returned to menu (war ended?)");
    const dx = tx - s.x;
    const dz = tz - s.z;
    if (Math.hypot(dx, dz) < 2) break;
    await drive(send, BTN.forward, Math.atan2(-dx, -dz));
    await sleep(150);
  }
  await evaluate(send, `window.__gameDebug?.movement.driveStop()`);
}

async function driveToWithShots(send: Send, tx: number, tz: number, prefix: string, timeoutMs: number, jump = false): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let frame = 0;
  while (Date.now() < deadline) {
    const s = await state(send);
    if (!s.alive) throw new Error("died");
    const inMenu = await evaluate(send, `document.querySelector(".connect-card") !== null`);
    if (inMenu === true) throw new Error("returned to menu (war ended?)");
    const dx = tx - s.x;
    const dz = tz - s.z;
    if (Math.hypot(dx, dz) < 2) break;
    const buttons = BTN.forward | (jump && frame % 4 === 2 ? BTN.jump : 0);
    await drive(send, buttons, Math.atan2(-dx, -dz));
    await shot(send, `${prefix}-${String(frame).padStart(3, "0")}`);
    frame += 1;
    await sleep(FRAME_MS - 60);
  }
  await evaluate(send, `window.__gameDebug?.movement.driveStop()`);
  return frame;
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
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

  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);
  await evaluate(send, `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: "high" }));
    localStorage.setItem("janissary-name", "FeelCap-${TAG}");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);
  await evaluate(send, `(() => {
    const input = document.querySelector(".connect-card input");
    if (input === null) return "no-join-form";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "FeelCap-${TAG}");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".connect-card button").click();
    return "joined-submit";
  })()`);
  await sleep(4_000);
  // F3 overlay: every frame carries fps + reconciliation counters.
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "F3", code: "F3", windowsVirtualKeyCode: 114, nativeVirtualKeyCode: 114 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "F3", code: "F3", windowsVirtualKeyCode: 114, nativeVirtualKeyCode: 114 });
  await sleep(500);

  const joinOnce = async (): Promise<void> => {
    await evaluate(send, `(() => {
      const input = document.querySelector(".connect-card input");
      if (input === null) return "no-join-form";
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "FeelCap-${TAG}");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector(".connect-card button").click();
      return "joined-submit";
    })()`);
    await sleep(5_000);
  };

  const captures: Record<string, number> = {};
  // 1. Jump landing: sprint at midfield with a hop every ~4 frames.
  try {
    captures["jump-landing"] = await driveToWithShots(send, 0, 30, "jump-landing", 20_000, true);
    console.log(JSON.stringify({ event: "capture", name: "jump-landing", frames: captures["jump-landing"] }));
  } catch (error) {
    console.log(JSON.stringify({ event: "capture-failed", name: "jump-landing", detail: String(error) }));
  }
  // 2. Slope walk: up the rear hill-fort stack at (-430, 150) — Ottoman backfield,
  // away from the wall-lane combat that killed the (-132, -85) route twice.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await driveTo(send, -385, 150, 110_000);
      captures["slope-walk"] = await driveToWithShots(send, -430, 150, "slope-walk", 45_000);
      console.log(JSON.stringify({ event: "capture", name: "slope-walk", frames: captures["slope-walk"] }));
      break;
    } catch (error) {
      console.log(JSON.stringify({ event: "capture-failed", name: "slope-walk", attempt, detail: String(error) }));
      if (attempt === 0) await joinOnce();
    }
  }
  // 3. Ford crossing: east to west through the northern ford, southern approach.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await driveTo(send, -295, 110, 90_000);
      captures["ford-crossing"] = await driveToWithShots(send, -360, 110, "ford-crossing", 60_000);
      console.log(JSON.stringify({ event: "capture", name: "ford-crossing", frames: captures["ford-crossing"] }));
      break;
    } catch (error) {
      console.log(JSON.stringify({ event: "capture-failed", name: "ford-crossing", attempt, detail: String(error) }));
      if (attempt === 0) await joinOnce();
    }
  }

  await evaluate(send, `window.__gameDebug?.movement.driveStop()`);
  console.log(JSON.stringify({ event: "done", tag: TAG, captures }));
  ws.close();
  process.exit(0);
}

main().catch((error) => {
  console.log(JSON.stringify({ event: "capture_error", detail: String(error) }));
  process.exit(1);
});
