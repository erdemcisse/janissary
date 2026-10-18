import WebSocket from "ws";
import {
  MessageType,
  encodeJoin,
  encodePing,
  decodePing,
  decodeWelcome,
  readMessageType,
} from "@janissary/shared";

/**
 * Phase 8e-0 follow-up (ADR 0027 caveat): a 358 ms ping was observed on a
 * localhost client under ~100 bots, with the server tick ruled out (p95
 * ~5 ms). The remaining suspects were join-time snapshot bursts and the
 * client's own ping measurement. This probe measures BOTH sides at once:
 *
 *  1. raw protocol RTT — a node-side WebSocket joins as a guest and app-level
 *     Pings are round-tripped every second. This is the pure network + server
 *     path with no browser main thread in the loop.
 *  2. the page's F3 Ping — the real client's measurement, sampled every 5 s.
 *  3. PerformanceObserver longtask entries in the page, to correlate any F3
 *     ping spike with main-thread stalls.
 *
 * If raw RTT stays low while F3 ping spikes, the anomaly is client-side
 * (main-thread queueing or the measurement itself); if both spike, the server
 * or the join burst is the cause.
 *
 * Prereqs: dev servers on :5173/:9001 with bots populated, Chrome with
 * --remote-debugging-port=9333. Usage: pnpm --filter @janissary/tools exec
 * tsx ping-anomaly-probe.ts [target] [tag] [durationSeconds]
 */

const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const TAG = process.argv[3] ?? "ping-anomaly";
const DURATION_MS = (Number.parseInt(process.argv[4] ?? "90", 10)) * 1_000;

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

function toArrayBuffer(data: WebSocket.RawData): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data.slice(0);
  if (Array.isArray(data)) {
    const total = data.reduce((sum, item) => sum + item.byteLength, 0);
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const item of data) {
      combined.set(item, offset);
      offset += item.byteLength;
    }
    return combined.buffer;
  }
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

interface RawRttSample {
  atMs: number;
  rttMs: number;
}

/** Node-side protocol RTT sampler: joins as a guest and pings every second. */
async function runRawRttSampler(url: string, durationMs: number, onSample: (sample: RawRttSample) => void, onJoin: (info: { welcomeMs: number; burstBytes: number }) => void): Promise<void> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { perMessageDeflate: false });
    let welcomeAt = 0;
    let burstBytes = 0;
    let burstReported = false;
    let burstClosed = false;
    const joinSentAt = Date.now();
    const pending = new Map<number, number>();
    ws.on("open", () => {
      ws.send(encodeJoin({
        token: "",
        name: `PingProbe-${TAG}`.slice(0, 24),
        preferredTeam: 0,
        preferredClass: 0,
      }));
    });
    ws.on("message", (data) => {
      const buffer = toArrayBuffer(data);
      const type = readMessageType(buffer);
      const now = Date.now();
      if (type === MessageType.Welcome) {
        welcomeAt = now;
        decodeWelcome(buffer);
        return;
      }
      if (type === MessageType.Pong) {
        if (burstClosed && !burstReported) {
          burstReported = true;
          onJoin({ welcomeMs: welcomeAt - joinSentAt, burstBytes });
        }
        const nonce = decodePing(buffer, MessageType.Pong);
        const sentAt = pending.get(nonce);
        if (sentAt !== undefined) {
          pending.delete(nonce);
          onSample({ atMs: now, rttMs: now - sentAt });
        }
        return;
      }
      // Count bytes from the first snapshot until the first Pong: the join-time
      // burst (full snapshot + AOI joins) is what a fresh client decodes.
      if (!burstClosed && type === MessageType.Snapshot) {
        burstBytes += buffer.byteLength;
      }
    });
    ws.on("error", () => resolve());
    const startPingLoop = (): void => {
      const interval = setInterval(() => {
        const nonce = Math.floor(Date.now()) >>> 0;
        pending.set(nonce, Date.now());
        ws.send(encodePing(MessageType.Ping, nonce));
      }, 1_000);
      setTimeout(() => {
        clearInterval(interval);
        ws.close();
        resolve();
      }, durationMs);
    };
    const checkBurst = setInterval(() => {
      if (welcomeAt !== 0) {
        clearInterval(checkBurst);
        startPingLoop();
      }
    }, 25);
    // The join burst closes at the first Pong (proves a full post-join round).
    ws.on("message", (data) => {
      if (readMessageType(toArrayBuffer(data)) === MessageType.Pong && !burstClosed) {
        burstClosed = true;
      }
    });
    setTimeout(() => {
      clearInterval(checkBurst);
      if (!burstReported) {
        burstReported = true;
        onJoin({ welcomeMs: -1, burstBytes });
      }
      resolve();
    }, 15_000);
  });
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

  console.log(JSON.stringify({ event: "phase", tag: TAG, detail: "navigate" }));
  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);
  await evaluate(send, `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: "high" }));
    localStorage.setItem("janissary-name", "PingProbe-${TAG}");
    return "seeded";
  })()`);
  await send("Page.reload");
  await sleep(8_000);

  // Long-task observer for main-thread stalls.
  await evaluate(send, `(() => {
    window.__auditLongTasks = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__auditLongTasks.push({ start: entry.startTime, duration: entry.duration });
      }
    });
    observer.observe({ type: "longtask", buffered: true });
    return "observer-installed";
  })()`);

  const joinResult = await evaluate(send, `(() => {
    const input = document.querySelector(".connect-card input");
    if (input === null) return "no-join-form";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "PingProbe-${TAG}");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".connect-card button").click();
    return "joined-submit";
  })()`);
  console.log(JSON.stringify({ event: "join", result: joinResult }));
  // Toggle F3 diagnostics immediately after the join click so the join-time
  // burst lands inside the measurement window.
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "F3", code: "F3", windowsVirtualKeyCode: 114, nativeVirtualKeyCode: 114 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "F3", code: "F3", windowsVirtualKeyCode: 114, nativeVirtualKeyCode: 114 });
  await sleep(2_000);

  // Sample from the first snapshot so the join burst is inside the window.
  const startedAt = Date.now();
  const rawSamples: RawRttSample[] = [];
  let joinInfo = { welcomeMs: -1, burstBytes: 0 };
  const raw = runRawRttSampler("ws://localhost:9001", DURATION_MS, (sample) => rawSamples.push(sample), (info) => { joinInfo = info; });
  const f3Samples: Record<string, unknown>[] = [];
  while (Date.now() - startedAt < DURATION_MS) {
    await sleep(500);
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
        pingMs: get("Ping"),
        frameP95Ms: get("Frame p95"),
        entities: get("Entities"),
        corrections: get("Corrections"),
      };
    })()`);
    const longTasks = await evaluate(send, `(() => {
      const tasks = window.__auditLongTasks ?? [];
      window.__auditLongTasks = [];
      return { count: tasks.length, maxDuration: tasks.reduce((m, t) => Math.max(m, t.duration), 0), total: tasks.reduce((s, t) => s + t.duration, 0) };
    })()`);
    f3Samples.push({ atMs: Date.now() - startedAt, ...(overlay as Record<string, unknown>), longTasks });
    console.log(JSON.stringify({ event: "sample", atMs: Date.now() - startedAt, ...(overlay as Record<string, unknown>), longTasks }));
  }
  await raw;

  const sorted = (values: number[]): number[] => [...values].sort((a, b) => a - b);
  const percentile = (values: number[], p: number): number => {
    const sortedValues = sorted(values);
    return sortedValues[Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * p))] ?? 0;
  };
  const f3Pings = f3Samples.map((sample) => sample.pingMs).filter((value): value is number => typeof value === "number" && value > 0);
  const rawRtts = rawSamples.map((sample) => sample.rttMs);
  const frameP95s = f3Samples.map((sample) => sample.frameP95Ms).filter((value): value is number => typeof value === "number" && value > 0);
  console.log(JSON.stringify({
    event: "summary",
    tag: TAG,
    durationMs: DURATION_MS,
    join: joinInfo,
    rawRtt: rawRtts.length === 0 ? null : { count: rawRtts.length, min: Math.min(...rawRtts), median: percentile(rawRtts, 0.5), p95: percentile(rawRtts, 0.95), max: Math.max(...rawRtts) },
    f3Ping: f3Pings.length === 0 ? null : { count: f3Pings.length, min: Math.min(...f3Pings), median: percentile(f3Pings, 0.5), p95: percentile(f3Pings, 0.95), max: Math.max(...f3Pings), samples: f3Pings },
    frameP95: frameP95s.length === 0 ? null : { min: Math.min(...frameP95s), median: percentile(frameP95s, 0.5), p95: percentile(frameP95s, 0.95), max: Math.max(...frameP95s), samples: frameP95s },
  }));
  ws.close();
  process.exit(0);
}

main().catch((error) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
