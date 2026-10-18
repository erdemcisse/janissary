import { writeFileSync } from "node:fs";
import WebSocket from "ws";
import { heightAt } from "../shared/src/index";

/**
 * Phase 8e-17 scripted screenshot proof: joins the live battle on the headless
 * Chrome (:9333) and drives `__gameDebug.setCamera` to the five required
 * terrain-revision viewpoints (vista hills, carved river channel, forest
 * cluster, wall approach with the city-rise bias, ford) plus two bonus angles
 * (west-hill sightline, river mouth). Camera heights are computed from the
 * shared heightfield so the probe tracks any future retune.
 *
 * Prereqs: dev servers on :5173/:9001, Chrome --remote-debugging-port=9333.
 * Usage: npx tsx tools/terrain-shots-8e17.ts [url] [tag]
 */
const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const TAG = process.argv[3] ?? "8e-17";
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

interface Viewpoint {
  readonly name: string;
  readonly x: number;
  readonly z: number;
  /** Camera height above the local ground, meters. */
  readonly aboveGround: number;
  /** Look-at target (yaw derived). */
  readonly lookX: number;
  readonly lookZ: number;
  readonly pitch: number;
}

const VIEWPOINTS: readonly Viewpoint[] = [
  // Rolling terrain to the horizon from the high south-western ground
  // (shell-test hill, h~13-16), looking across the whole field to the city.
  { name: "vista-hills", x: 660, z: -690, aboveGround: 4, lookX: 0, lookZ: -30, pitch: -0.1 },
  // Carved channel + eroded sandy banks south of the road bridge, looking
  // down-channel toward the south ford.
  { name: "river-channel", x: -306, z: 142, aboveGround: 3.5, lookX: -328, lookZ: 100, pitch: -0.22 },
  // Cross-section read of the eroded sand margin: east bank strip in the
  // foreground, waterline, channel (camera on the bank at d~23).
  { name: "bank-detail", x: -297, z: 78, aboveGround: 5, lookX: -318, lookZ: 68, pitch: -0.35 },
  // Densest forest cluster (n~37 at (720,-480)) from its western edge.
  { name: "forest", x: 688, z: -456, aboveGround: 2, lookX: 725, lookZ: -485, pitch: -0.04 },
  // Elevated from inside the flat approach corridor: the wall at mid-frame
  // with the city ground rising behind it (the city-bias profile read).
  { name: "wall-approach", x: 0, z: 120, aboveGround: 18, lookX: 0, lookZ: -60, pitch: -0.1 },
  // Bonus: the spawn-road gate approach at eye level (8e-5's angle).
  { name: "road-gate", x: 4, z: 60, aboveGround: 1.8, lookX: 0, lookZ: -10, pitch: 0.03 },
  // Ford at (-327,110): shallow wade, surfacing stones, draped approach
  // tracks, reeds, eroded banks.
  { name: "ford", x: -298, z: 122, aboveGround: 2.5, lookX: -327, lookZ: 110, pitch: -0.15 },
  // Bonus: west-hill sightline over the open field (movement-slope region).
  { name: "hill-sightline", x: -632, z: -480, aboveGround: 2, lookX: 0, lookZ: -30, pitch: -0.03 },
  // Bonus: river mouth fading into the strait.
  { name: "river-mouth", x: -300, z: 215, aboveGround: 3, lookX: -330, lookZ: 236, pitch: -0.12 },
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
    const y = heightAt(view.x, view.z) + view.aboveGround;
    const yaw = Math.atan2(-(view.lookX - view.x), -(view.lookZ - view.z));
    console.log(JSON.stringify({ event: "viewpoint", name: view.name, x: view.x, y: Number(y.toFixed(2)), z: view.z, yaw: Number(yaw.toFixed(3)) }));
    await evaluate(send, `window.__gameDebug.setCamera(${view.x}, ${y}, ${view.z}, ${yaw}, ${view.pitch})`);
    // Let frames render (and lazy scatter GLBs land) before the capture.
    await sleep(900);
    await screenshot(send, `${TAG}-${view.name}`);
  }
  await evaluate(send, `window.__gameDebug.clearCamera()`);

  ws.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
