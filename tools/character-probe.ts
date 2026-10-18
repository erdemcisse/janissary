import { writeFileSync } from "node:fs";
import WebSocket from "ws";

/**
 * Phase 8e-12 scripted browser proof (rigged characters):
 *  1. close-detail: a near bot at ~4 m — texture quality, weapon in hand.
 *  2. volley-line: an Ottoman firing line mid-volley (fire/aim clips).
 *  3. melee-scrum: close-quarters cluster (slash on landed hits).
 *  4. death-pose: camera re-aimed at the killPuff hook position → corpse clip.
 *  5. far-lod: the same crowd from ~75 m — baked idle-pose instanced batches.
 *  6. aim-pose: a stationary shooter holding the shouldered pose.
 * Also dumps __gameDebug.characterCounts() at each step (rig pool evidence).
 *
 * Prereqs: dev servers on :5173/:9001, Chrome with --remote-debugging-port=9333.
 *   npx tsx character-probe.ts [url]
 */
const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const SHOT_DIR = new URL("../docs/image-feedback/", import.meta.url).pathname;

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

async function evaluate(send: Send, expression: string): Promise<unknown> {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails !== undefined) return { __exception: result.exceptionDetails };
  const value = result.result as { value?: unknown } | undefined;
  return value?.value;
}

async function screenshot(send: Send, name: string): Promise<void> {
  const result = await send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
  const data = result.data as string | undefined;
  if (data === undefined) {
    console.log(JSON.stringify({ event: "screenshot_error", name }));
    return;
  }
  const path = `${SHOT_DIR}/${name}.jpg`;
  writeFileSync(path, Buffer.from(data, "base64"));
  console.log(JSON.stringify({ event: "screenshot", path }));
}

interface Point {
  x: number;
  y: number;
  z: number;
}

const nearestEnemy = (send: Send): Promise<(Point & { distance: number }) | null> =>
  evaluate(send, `window.__gameDebug?.combat.nearestEnemy()`) as Promise<(Point & { distance: number }) | null>;

const characterCounts = (send: Send): Promise<unknown> =>
  evaluate(send, `window.__gameDebug?.characterCounts?.()`);

const setCamera = (send: Send, x: number, y: number, z: number, yaw: number, pitch: number): Promise<unknown> =>
  evaluate(send, `window.__gameDebug?.setCamera(${x}, ${y}, ${z}, ${yaw}, ${pitch})`);

/** Yaw/pitch for a free camera at `from` looking at `to`. */
function lookAt(from: Point, to: Point): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dy = to.y - from.y;
  const horizontal = Math.max(0.5, Math.hypot(dx, dz));
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, horizontal) };
}

async function main(): Promise<void> {
  let targets: { id: string; type: string; webSocketDebuggerUrl?: string }[] = [];
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
    localStorage.setItem("janissary-name", "RigProbe");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);

  const join = await evaluate(send, `(() => {
    const card = document.querySelector(".connect-card");
    if (card === null) return "no-join-form";
    const input = card.querySelector("input");
    if (input !== null) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "RigProbe");
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
  await sleep(8_000);

  // Wait until the rig pool is actually animating someone.
  let counts: unknown = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    counts = await characterCounts(send);
    if (counts !== null && typeof counts === "object" && (counts as { rigs?: number }).rigs !== undefined && ((counts as { rigs: number }).rigs > 0 || (counts as { far: number }).far > 0)) break;
    await sleep(500);
  }
  console.log(JSON.stringify({ event: "character_counts", counts }));

  // ── 1. close-detail: nearest enemy at ~4 m ───────────────────────────────
  let enemy = await nearestEnemy(send);
  if (enemy !== null) {
    const cam = { x: enemy.x + 2.8, y: enemy.y + 1.6, z: enemy.z + 2.8 };
    const look = lookAt(cam, { x: enemy.x, y: enemy.y + 1.0, z: enemy.z });
    await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
    await sleep(250);
    await screenshot(send, "8e-12-close-detail");
    await sleep(900);
    await screenshot(send, "8e-12-close-detail-b");
  }

  // ── 2. volley-line: side-on wide of the same fight ───────────────────────
  enemy = await nearestEnemy(send);
  if (enemy !== null) {
    const cam = { x: enemy.x + 14, y: enemy.y + 3.2, z: enemy.z + 10 };
    const look = lookAt(cam, { x: enemy.x, y: enemy.y + 1.2, z: enemy.z });
    await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
    for (let index = 0; index < 4; index += 1) {
      await screenshot(send, index === 0 ? "8e-12-volley-line" : `8e-12-volley-line-${index}`);
      await sleep(700);
    }
  }
  console.log(JSON.stringify({ event: "character_counts", counts: await characterCounts(send) }));

  // ── 3. death-pose: re-aim at the kill hook, catch the fall + the lie ─────
  {
    const deadline = Date.now() + 90_000;
    let caught = false;
    while (Date.now() < deadline && !caught) {
      const report = (await evaluate(send, `window.__gameDebug?.combat.lastKillPuff()`)) as (Point & { ageMs: number }) | null;
      if (report !== null && report.ageMs < 350) {
        const cam = { x: report.x + 3.4, y: report.y + 1.0, z: report.z + 2.6 };
        const look = lookAt(cam, { x: report.x, y: report.y - 0.2, z: report.z });
        await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
        await screenshot(send, "8e-12-death-pose");
        await sleep(1_600);
        await screenshot(send, "8e-12-death-pose-b");
        console.log(JSON.stringify({ event: "death_caught", report }));
        caught = true;
        break;
      }
      await sleep(40);
    }
    if (!caught) console.log(JSON.stringify({ event: "death_missed" }));
  }

  // ── 4b. melee-scrum: tight cluster with blades out (breach fights do this) ─
  enemy = await nearestEnemy(send);
  if (enemy !== null) {
    const cam = { x: enemy.x - 4.4, y: enemy.y + 2.2, z: enemy.z + 4.0 };
    const look = lookAt(cam, { x: enemy.x, y: enemy.y + 0.9, z: enemy.z });
    await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
    await sleep(250);
    await screenshot(send, "8e-12-melee-scrum");
    await sleep(800);
    await screenshot(send, "8e-12-melee-scrum-b");
  }

  // ── 4. far-lod: the crowd from ~75 m — instanced idle-pose batches ───────
  enemy = await nearestEnemy(send);
  if (enemy !== null) {
    const bearing = Math.atan2(-(enemy.x), -(enemy.z));
    const cam = { x: enemy.x + Math.sin(bearing) * 0 + 55, y: enemy.y + 7, z: enemy.z + 55 };
    const look = lookAt(cam, { x: enemy.x, y: enemy.y + 1, z: enemy.z });
    await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
    await sleep(300);
    await screenshot(send, "8e-12-far-lod");
  }
  console.log(JSON.stringify({ event: "character_counts", counts: await characterCounts(send) }));

  // ── 5. aim-pose: stationary shooter shouldered (firing lines do this) ────
  enemy = await nearestEnemy(send);
  if (enemy !== null) {
    const cam = { x: enemy.x - 3.2, y: enemy.y + 1.5, z: enemy.z - 3.2 };
    const look = lookAt(cam, { x: enemy.x, y: enemy.y + 1.1, z: enemy.z });
    await setCamera(send, cam.x, cam.y, cam.z, look.yaw, look.pitch);
    await sleep(250);
    await screenshot(send, "8e-12-aim-pose");
    await sleep(800);
    await screenshot(send, "8e-12-aim-pose-b");
  }
  console.log(JSON.stringify({ event: "character_counts", counts: await characterCounts(send) }));

  await evaluate(send, `window.__gameDebug?.clearCamera()`);
  console.log(JSON.stringify({ event: "done" }));
  ws.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
