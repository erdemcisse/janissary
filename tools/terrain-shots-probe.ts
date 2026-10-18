import { writeFileSync } from "node:fs";
import WebSocket from "ws";

/**
 * Phase 8e-5 scripted browser proof: joins the live battle, drives the
 * dev-only `__gameDebug.setCamera` hook to deterministic terrain viewpoints,
 * and captures the six required headed-Chrome screenshots (road/gate, wall
 * close-up, breach/wall state, river ford, hill crest, wide vista).
 *
 * Prereqs: dev servers on :5173/:9001, HEADED Chrome with
 * --remote-debugging-port=9334 (separate profile from the perf Chrome).
 */
const DEBUG_PORT = Number(process.argv[3] ?? 9334);
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const TAG = process.argv[4] ?? "8e5";
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

// yaw = atan2(-dx, -dz) for look direction (dx, dz) — the client's forward is
// (-sin(yaw), -cos(yaw)); positive pitch looks up. All positions verified
// against shared/src/map.ts + shared/src/terrain-props.ts world facts.
const VIEWPOINTS: readonly Viewpoint[] = [
  // Road spawn->gate, packed-earth strip and trample biome, gate approach.
  { name: `${TAG}-road-gate`, x: 4, y: 2.2, z: 60, yaw: Math.atan2(4, 60), pitch: -0.04 },
  // Ashlar close-up: courses, brick band, base weathering, merlon cap line.
  { name: `${TAG}-wall-closeup`, x: -10, y: 2.0, z: 13, yaw: Math.atan2(2, 13), pitch: 0.18 },
  // Wall halves from the south — whichever segment is breached reads as
  // rubble against the intact ashlar (wall state is live battle state).
  { name: `${TAG}-wall-west`, x: -30, y: 3.0, z: 30, yaw: Math.atan2(15, 30), pitch: 0.02 },
  { name: `${TAG}-wall-east`, x: 30, y: 3.0, z: 30, yaw: Math.atan2(-15, 30), pitch: 0.02 },
  // Ford at (-327, 110): river ribbon, ford shallows, willows, reeds, mud.
  { name: `${TAG}-river-ford`, x: -298, y: 3.2, z: 124, yaw: Math.atan2(29, 14), pitch: -0.1 },
  // Hill fort NW stack top (~8-11 m of tiers) looking DOWN at the hill-base
  // rock ring and scree, battlefield beyond.
  { name: `${TAG}-hill-crest`, x: -470, y: 12, z: -150, yaw: Math.atan2(-35, -35), pitch: -0.42 },
  // The same fort from below: tiered silhouette, scree ring, base rocks.
  { name: `${TAG}-hill-fort`, x: -505, y: 4.5, z: -112, yaw: Math.atan2(-35, 38), pitch: 0.1 },
  // Wide vista from the Ottoman rear: roads, meadow noise, scatter, wall.
  { name: `${TAG}-vista`, x: -60, y: 10, z: 135, yaw: Math.atan2(-60, 135), pitch: -0.1 },
  // Ground-level meadow read on the sunlit side of the shore tree cluster:
  // grass tufts, bushes, trees, galleys beyond.
  { name: `${TAG}-meadow`, x: 60, y: 2.5, z: 130, yaw: Math.atan2(-40, -40), pitch: -0.05 },
];

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
  await send("Page.bringToFront");

  console.log(JSON.stringify({ event: "phase", detail: "navigate" }));
  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);
  await evaluate(send, `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: "high" }));
    localStorage.setItem("janissary-name", "TerrainProbe-${TAG}");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);
  const join = await evaluate(send, `(() => {
    const input = document.querySelector(".connect-card input");
    if (input === null) return "no-join-form";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "TerrainProbe-${TAG}");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".connect-card button").click();
    return "joined-submit";
  })()`);
  console.log(JSON.stringify({ event: "join", result: join }));
  await sleep(18_000);

  const debugReady = await evaluate(send, `typeof window.__gameDebug`);
  console.log(JSON.stringify({ event: "debug_hook", type: debugReady }));
  if (debugReady !== "object") {
    console.log(JSON.stringify({ event: "cdp_error", detail: "__gameDebug missing (not a dev build?)" }));
    process.exit(1);
  }

  for (const view of VIEWPOINTS) {
    await evaluate(send, `window.__gameDebug.setCamera(${view.x}, ${view.y}, ${view.z}, ${view.yaw}, ${view.pitch})`);
    // Let a handful of frames render (and any lazy scatter GLBs land) before
    // the capture.
    await sleep(900);
    await screenshot(send, view.name);
  }
  await evaluate(send, `window.__gameDebug.clearCamera()`);

  ws.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
