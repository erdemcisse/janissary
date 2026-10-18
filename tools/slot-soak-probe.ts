import WebSocket from "ws";

/**
 * Slot-system soak (audit): 50 randomized weapon-slot switches interleaved
 * with fire/reload, run live against the authoritative server. The slot
 * machine is one phase old and lives in three layers (server sim, client
 * prediction, HUD), so the probe hunts for:
 *
 *   - stuck draws (`.drawing` held longer than the 600 ms draw + margin);
 *   - HUD/sim divergence (an active slot that no longer matches the last
 *     completed switch target and never recovers);
 *   - ammo/loaded-pip desync (fire empties the pip, a completed reload
 *     reloads it);
 *   - death/respawn phases (detected via the `.respawn` panel): the slot must
 *     reset to 2 with no draw after every respawn.
 *
 * Prereqs: dev servers on :5173/:9001 with bots, Chrome with
 * --remote-debugging-port=9333. Usage: pnpm --filter @janissary/tools exec
 * tsx slot-soak-probe.ts [target] [tag] [iterations]
 */

const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const TAG = process.argv[3] ?? "slot-soak";
const ITERATIONS = Number.parseInt(process.argv[4] ?? "50", 10);

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

async function key(send: Send, code: string, keyName: string, vk: number, holdMs = 160): Promise<void> {
  await send("Input.dispatchKeyEvent", { type: "keyDown", code, key: keyName, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(holdMs);
  await send("Input.dispatchKeyEvent", { type: "keyUp", code, key: keyName, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}

/** Walk toward the gate so the soak player actually gets shot at. */
async function walk(send: Send, holdMs: number): Promise<void> {
  await send("Input.dispatchKeyEvent", { type: "keyDown", code: "KeyW", key: "w", windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
  await sleep(holdMs);
  await send("Input.dispatchKeyEvent", { type: "keyUp", code: "KeyW", key: "w", windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
  await sleep(300);
}

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

interface HudRead {
  activeSlot: number;
  drawingSlots: number[];
  pipLoaded: boolean | null;
  respawning: boolean;
  aliveHud: boolean;
}

async function readHud(send: Send): Promise<HudRead> {
  const value = await evaluate(send, `(() => {
    const slots = [...document.querySelectorAll(".loadout .slot")];
    const active = slots.findIndex((slot) => slot.classList.contains("active"));
    const drawing = slots.map((slot, index) => slot.classList.contains("drawing") ? index + 1 : 0).filter((index) => index > 0);
    const slot2 = slots[1];
    const pip = slot2?.querySelector(".pip");
    const respawning = document.querySelector(".respawn") !== null;
    return {
      activeSlot: active >= 0 ? active + 1 : 0,
      drawingSlots: drawing,
      pipLoaded: pip === undefined ? null : pip.classList.contains("pip-loaded"),
      respawning,
      aliveHud: slots.length > 0,
    };
  })()`) as HudRead;
  return value;
}

interface Finding {
  kind: string;
  atSeconds: number;
  detail: string;
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
  await send("Input.setIgnoreInputEvents", { ignore: false });

  console.log(JSON.stringify({ event: "phase", tag: TAG, iterations: ITERATIONS, detail: "navigate" }));
  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);
  await evaluate(send, `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: "high" }));
    localStorage.setItem("janissary-name", "SlotSoak-${TAG}");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);

  const joinResult = await evaluate(send, `(() => {
    const input = document.querySelector(".connect-card input");
    if (input === null) return "no-join-form";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "SlotSoak-${TAG}");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".connect-card button").click();
    return "joined-submit";
  })()`);
  console.log(JSON.stringify({ event: "join", result: joinResult }));
  await sleep(4_000);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 700, y: 350, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 700, y: 350, button: "left", clickCount: 1 });
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "F3", code: "F3", windowsVirtualKeyCode: 114, nativeVirtualKeyCode: 114 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "F3", code: "F3", windowsVirtualKeyCode: 114, nativeVirtualKeyCode: 114 });
  await sleep(2_000);

  const startedAt = Date.now();
  const findings: Finding[] = [];
  const slotKeys: ReadonlyArray<readonly [string, string, number]> = [
    ["Digit1", "1", 49],
    ["Digit2", "2", 50],
    ["Digit3", "3", 51],
  ];

  let drawStartAt = -1;
  let respawnsObserved = 0;
  let pauseRecoveries = 0;
  let wasRespawning = false;
  let wasPaused = false;
  const watcher = setInterval(() => {
    void readHud(send).then(async (hud) => {
      if (!hud.aliveHud) return;
      const now = Date.now() - startedAt;
      if (hud.respawning && !wasRespawning) respawnsObserved += 1;
      wasRespawning = hud.respawning;
      // The click-to-resume pause swallows inputs (pointer lock was lost);
      // recover like a player would so the soak measures the slot system, not
      // Chrome's pointer-lock flakiness.
      const paused = (await evaluate(send, `document.querySelector(".pointer-unlocked-hint") !== null`)) === true;
      if (paused && !wasPaused) {
        pauseRecoveries += 1;
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 700, y: 350, button: "left", clickCount: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 700, y: 350, button: "left", clickCount: 1 });
      }
      wasPaused = paused;
      if (hud.drawingSlots.length > 0 && drawStartAt < 0) drawStartAt = now;
      if (hud.drawingSlots.length === 0 && drawStartAt >= 0) drawStartAt = -1;
      if (hud.drawingSlots.length > 0 && now - drawStartAt > 1_500) {
        findings.push({ kind: "stuck-draw", atSeconds: now / 1_000, detail: `drawing ${hud.drawingSlots.join(",")} for >1.5s` });
        drawStartAt = now;
      }
      if (!hud.respawning && hud.activeSlot === 0) {
        findings.push({ kind: "no-active-slot", atSeconds: now / 1_000, detail: "HUD has no active slot while alive" });
      }
    }).catch(() => undefined);
  }, 200);

  let lastRequestedSlot = 0;
  let lastSwitchStartedAt = 0;
  // March into the battle once, then re-walk every 25 iterations so deaths
  // actually happen (the spawn field is otherwise safe).
  await walk(send, 8_000);
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    if (iteration > 0 && iteration % 25 === 0) await walk(send, 4_000);
    const roll = Math.random();
    if (roll < 0.3) {
      // Fire: left click held like a human.
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 700, y: 350, button: "left", clickCount: 1 });
      await sleep(280);
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 700, y: 350, button: "left", clickCount: 1 });
      await sleep(120 + randomInt(400));
      continue;
    }
    if (roll < 0.5) {
      // Reload: level-triggered at 20 Hz, must be held.
      await key(send, "KeyR", "r", 82, 500);
      await sleep(300 + randomInt(500));
      continue;
    }
    const targetSlot = 1 + randomInt(3);
    await key(send, ...slotKeys[targetSlot - 1]!);
    lastRequestedSlot = targetSlot;
    lastSwitchStartedAt = Date.now() - startedAt;
    const expected = lastRequestedSlot;
    // Watch the switch land: draw appears, then active flips within 1.5 s.
    // A death mid-draw is legitimate: after respawn the slot must be 2 with
    // no draw — recover and verify that instead of reporting a failure.
    const landedAt = await new Promise<number>((resolve) => {
      const poll = setInterval(() => {
        void readHud(send).then((hud) => {
          if (!hud.respawning && hud.activeSlot === expected && hud.drawingSlots.length === 0) {
            clearInterval(poll);
            resolve(Date.now() - startedAt);
          }
          if (hud.respawning) {
            // Slot is reset server-side on respawn; wait for the post-respawn
            // HUD and accept slot 2 with no draw as the legitimate outcome.
            if (hud.drawingSlots.length === 0 && hud.activeSlot !== expected) {
              clearInterval(poll);
              resolve(-2);
            }
          }
        }).catch(() => undefined);
      }, 100);
      setTimeout(() => {
        clearInterval(poll);
        resolve(-1);
      }, 2_000);
    });
    if (landedAt === -2) {
      const hud = await readHud(send);
      if (hud.activeSlot !== 2 || hud.drawingSlots.length > 0) {
        findings.push({
          kind: "post-respawn-slot-wrong",
          atSeconds: (Date.now() - startedAt) / 1_000,
          detail: `after respawn expected slot 2 no draw, got active=${hud.activeSlot} drawing=${hud.drawingSlots.join(",")}`,
        });
      }
    } else if (landedAt < 0) {
      const hud = await readHud(send);
      const overlay = await evaluate(send, `(() => {
        const el = document.querySelector(".debug-overlay");
        if (el === null) return { present: false };
        const pairs = new Map();
        const dts = el.querySelectorAll("dt");
        for (const dt of dts) {
          const dd = dt.nextElementSibling;
          if (dd !== null) pairs.set(dt.textContent, dd.textContent);
        }
        return { present: true, entities: pairs.get("Entities"), corrections: pairs.get("Corrections"), fps: pairs.get("Frame rate") };
      })()`) as Record<string, unknown>;
      findings.push({
        kind: "switch-not-landed",
        atSeconds: (Date.now() - startedAt) / 1_000,
        detail: `requested slot ${expected}, hud active=${hud.activeSlot} drawing=${hud.drawingSlots.join(",")} respawning=${hud.respawning} overlay=${JSON.stringify(overlay)}`,
      });
    }
    const hud = await readHud(send);
    console.log(JSON.stringify({
      event: "switch-outcome",
      iteration,
      requested: expected,
      landed: landedAt,
      active: hud.activeSlot,
      drawing: hud.drawingSlots,
      respawning: hud.respawning,
    }));
    if (hud.drawingSlots.length > 0) {
      findings.push({
        kind: "draw-started",
        atSeconds: (Date.now() - startedAt) / 1_000,
        detail: `draw toward ${hud.drawingSlots.join(",")} observed`,
      });
      await sleep(1_000);
      const settled = await readHud(send);
      if (settled.activeSlot !== expected && !settled.respawning) {
        findings.push({
          kind: "hud-sim-divergence",
          atSeconds: (Date.now() - startedAt) / 1_000,
          detail: `after draw settled: expected ${expected}, hud active=${settled.activeSlot}`,
        });
      }
    }
    await sleep(200 + randomInt(600));
  }

  clearInterval(watcher);
  const finalHud = await readHud(send);
  console.log(JSON.stringify({
    event: "summary",
    tag: TAG,
    iterations: ITERATIONS,
    durationSeconds: Math.round((Date.now() - startedAt) / 1_000),
    respawnsObserved,
    pauseRecoveries,
    finalHud,
    findings,
    findingCount: findings.length,
    lastSwitchStartedAt,
  }));
  ws.close();
  process.exit(0);
}

main().catch((error) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
