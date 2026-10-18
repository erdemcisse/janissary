import WebSocket from "ws";

const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const QUALITY = process.argv[3] ?? "high";
const TAG = process.argv[4] ?? "run";

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

async function evaluate(send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>, expression: string, awaitPromise = false): Promise<unknown> {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (result.exceptionDetails !== undefined) {
    return { __exception: result.exceptionDetails };
  }
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
  await send("Input.setIgnoreInputEvents", { ignore: false });

  console.log(JSON.stringify({ event: "phase", tag: TAG, quality: QUALITY, detail: "navigate" }));
  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);

  // Seed settings + name, then reload so React's initial state picks them up.
  await evaluate(send, `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: ${JSON.stringify(QUALITY)} }));
    localStorage.setItem("janissary-name", "PerfProbe-${TAG}");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);

  const preJoin = await evaluate(send, `(() => {
    const input = document.querySelector(".connect-card input");
    if (input === null) return "no-join-form";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "PerfProbe-${TAG}");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".connect-card button").click();
    return "joined-submit";
  })()`);
  console.log(JSON.stringify({ event: "join", result: preJoin }));

  // Wait for world load + diagnostics to have a few stat cycles.
  await sleep(20_000);

  const renderer = await evaluate(send, `(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      if (gl === null) return "no-webgl2";
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const name = ext !== null ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return name;
    } catch (error) { return "error:" + String(error); }
  })()`);
  console.log(JSON.stringify({ event: "renderer", renderer }));

  const canvasInfo = await evaluate(send, `(() => {
    const canvas = document.querySelector(".game-container canvas");
    if (canvas === null) return { present: false };
    return { present: true, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, width: canvas.width, height: canvas.height, dpr: window.devicePixelRatio };
  })()`);
  console.log(JSON.stringify({ event: "canvas", ...(canvasInfo as Record<string, unknown>) }));

  // Toggle F3 diagnostics.
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "F3", code: "F3", windowsVirtualKeyCode: 114, nativeVirtualKeyCode: 114 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "F3", code: "F3", windowsVirtualKeyCode: 114, nativeVirtualKeyCode: 114 });
  await sleep(2_000);

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
    return {
      present: true,
      fps: get("Frame rate"),
      frameP95Ms: get("Frame p95"),
      corrections: get("Corrections"),
      correctionP95Cm: get("Correction p95 / max") ?? null,
      drawCalls: get("Draw calls"),
      visible: get("Visible"),
      entities: get("Entities"),
      interest: get("Interest set"),
      pingMs: get("Ping"),
    };
  })()`);

  const samples: Record<string, unknown>[] = [];
  for (let index = 0; index < 6; index += 1) {
    const overlay = await readOverlay();
    samples.push(overlay as Record<string, unknown>);
    console.log(JSON.stringify({ event: "sample", index, ...(overlay as Record<string, unknown>) }));
    await sleep(4_000);
  }

  // Independent rAF cadence (10 s) as a cross-check of the overlay fps.
  const rafFps = await evaluate(send, `new Promise((resolve) => { let n = 0; const t0 = performance.now(); const f = () => { n += 1; if (performance.now() - t0 >= 10000) { resolve(n / 10); } else { requestAnimationFrame(f); } }; requestAnimationFrame(f); })`, true);
  console.log(JSON.stringify({ event: "raf_cadence_fps", fps: rafFps }));

  const fpsValues = samples.map((sample) => sample.fps).filter((value): value is number => typeof value === "number" && value > 0);
  const p95Values = samples.map((sample) => sample.frameP95Ms).filter((value): value is number => typeof value === "number" && value > 0);
  const median = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };
  console.log(JSON.stringify({ event: "summary", tag: TAG, quality: QUALITY, medianFps: median(fpsValues), medianFrameP95Ms: median(p95Values), samples: fpsValues, p95s: p95Values, rafFps }));
  ws.close();
  process.exit(0);
}

main().catch((error) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
