import WebSocket from "ws";

/**
 * Long-session soak probe (audit): joins a live battle and watches for 10
 * minutes of unattended play — audio voice/loop drift, entity/nameplate pool
 * exhaustion, and heap growth. Every 30 s it samples:
 *
 *   - window.__audioDebug() (dev builds): one-shot voices by key, positional
 *     loops by key+id, ambient loops with gain targets, pending loads;
 *   - the F3 overlay: fps, frame p95, entities, interest set;
 *   - the DOM: nameplate count (the 12-label cap lives in nameplateLayout);
 *   - heap: performance.memory.usedJSHeapSize if exposed;
 *   - page errors via Runtime.consoleAPICalled / Log.entryAdded.
 *
 * Prereqs: dev servers on :5173/:9001 with bots, Chrome with
 * --remote-debugging-port=9333. Usage: pnpm --filter @janissary/tools exec
 * tsx soak-probe.ts [target] [tag] [durationSeconds]
 */

const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const TAG = process.argv[3] ?? "soak";
const DURATION_MS = (Number.parseInt(process.argv[4] ?? "600", 10)) * 1_000;
const INTERVAL_MS = 30_000;

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
  await send("Log.enable");

  const pageErrors: string[] = [];
  await evaluate(send, `(() => {
    window.__auditErrors = [];
    const original = console.error;
    console.error = (...args) => {
      window.__auditErrors.push(args.map((a) => String(a)).join(" "));
      original(...args);
    };
    return "hooked";
  })()`);

  console.log(JSON.stringify({ event: "phase", tag: TAG, detail: "navigate" }));
  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);
  await evaluate(send, `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: "high" }));
    localStorage.setItem("janissary-name", "SoakProbe-${TAG}");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);

  const joinResult = await evaluate(send, `(() => {
    const input = document.querySelector(".connect-card input");
    if (input === null) return "no-join-form";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "SoakProbe-${TAG}");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".connect-card button").click();
    return "joined-submit";
  })()`);
  console.log(JSON.stringify({ event: "join", result: joinResult }));
  await sleep(4_000);
  // Exit the click-to-resume state (this is also the AudioContext gesture),
  // then open F3 diagnostics.
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 700, y: 350, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 700, y: 350, button: "left", clickCount: 1 });
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "F3", code: "F3", windowsVirtualKeyCode: 114, nativeVirtualKeyCode: 114 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "F3", code: "F3", windowsVirtualKeyCode: 114, nativeVirtualKeyCode: 114 });
  await sleep(2_000);

  const startedAt = Date.now();
  while (Date.now() - startedAt < DURATION_MS) {
    await sleep(INTERVAL_MS);
    const audio = await evaluate(send, `typeof window.__audioDebug === "function" ? JSON.parse(JSON.stringify(window.__audioDebug())) : { unavailable: true }`) as Record<string, unknown>;
    const overlay = await evaluate(send, `(() => {
      const overlay = document.querySelector(".debug-overlay");
      if (overlay === null) return { present: false };
      const pairs = new Map();
      const dts = overlay.querySelectorAll("dt");
      for (const dt of dts) {
        const dd = dt.nextElementSibling;
        if (dd !== null) pairs.set(dt.textContent, dd.textContent);
      }
      const get = (label) => { const v = pairs.get(label); return v === undefined ? null : Number.parseFloat(v); };
      return {
        present: true,
        fps: get("Frame rate"),
        frameP95Ms: get("Frame p95"),
        entities: get("Entities"),
        interest: get("Interest set"),
        drawCalls: get("Draw calls"),
      };
    })()`);
    const dom = await evaluate(send, `(() => {
      const layer = document.querySelector(".name-layer");
      const memory = performance.memory;
      return {
        nameLayers: document.querySelectorAll(".name-layer").length,
        nameLayerPixels: layer ? layer.width * layer.height : 0,
        usedHeapMB: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
      };
    })()`);
    const errors = await evaluate(send, `(() => { const errors = window.__auditErrors ?? []; window.__auditErrors = []; return errors; })()`) as string[];
    const sample = {
      atSeconds: Math.round((Date.now() - startedAt) / 1_000),
      ...(overlay as Record<string, unknown>),
      ...(dom as Record<string, unknown>),
      audio,
      errors,
    };
    console.log(JSON.stringify({ event: "sample", ...sample }));
    if (errors.length > 0) pageErrors.push(...errors);
  }

  console.log(JSON.stringify({ event: "summary", tag: TAG, durationMs: DURATION_MS, samples: Math.floor(DURATION_MS / INTERVAL_MS), pageErrors }));
  ws.close();
  process.exit(0);
}

main().catch((error) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
