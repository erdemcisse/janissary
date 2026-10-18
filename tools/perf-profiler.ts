import WebSocket from "ws";

const DEBUG_PORT = 9333;
const TARGET_URL = process.argv[2] ?? "http://localhost:5173";
const QUALITY = process.argv[3] ?? "high";
const TAG = process.argv[4] ?? "prof";
const SAMPLE_SECONDS = Number.parseFloat(process.argv[5] ?? "12");

interface CdpResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message: string };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  let targets: { type: string; url: string; webSocketDebuggerUrl?: string }[] = [];
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
      targets = await response.json() as typeof targets;
      if (targets.length > 0) break;
    } catch { /* chrome not up */ }
    await sleep(500);
  }
  const page = targets.find((target) => target.type === "page");
  const wsUrl = page?.webSocketDebuggerUrl;
  if (wsUrl === undefined) {
    console.log(JSON.stringify({ event: "cdp_error", detail: "no page target" }));
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
  await new Promise<void>((resolve, reject) => { ws.on("open", () => resolve()); ws.on("error", reject); });
  let nextId = 1;
  const pending = new Map<number, { resolve: (r: Record<string, unknown>) => void; reject: (e: Error) => void }>();
  ws.on("message", (data) => {
    const message = JSON.parse(String(data)) as CdpResponse;
    const handler = pending.get(message.id);
    if (handler === undefined) return;
    pending.delete(message.id);
    if (message.error !== undefined) handler.reject(new Error(message.error.message ?? "cdp error"));
    else handler.resolve(message.result ?? {});
  });
  const send = (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const id = nextId++;
    return new Promise((res, rej) => {
      pending.set(id, { resolve: res, reject: rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: TARGET_URL });
  await sleep(5_000);
  await send("Runtime.evaluate", { expression: `(() => {
    localStorage.setItem("janissary-settings", JSON.stringify({ ...(JSON.parse(localStorage.getItem("janissary-settings") ?? "{}")), quality: ${JSON.stringify(QUALITY)} }));
    localStorage.setItem("janissary-name", "ProfProbe-${TAG}");
    return "seeded";
  })()`, returnByValue: true });
  await send("Page.reload");
  await sleep(8_000);
  await send("Runtime.evaluate", { expression: `(() => {
    const input = document.querySelector(".connect-card input");
    if (input === null) return "no-join-form";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "ProfProbe-${TAG}");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".connect-card button").click();
    return "joined";
  })()`, returnByValue: true });
  await sleep(18_000);

  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 500 });
  await send("Profiler.start");
  await sleep(SAMPLE_SECONDS * 1_000);
  const profile = (await send("Profiler.stop")).profile as {
    nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number } ; parent?: number }[];
    samples: number[];
  };

  const nodes = new Map<number, { functionName: string; url: string }>();
  for (const node of profile.nodes) {
    nodes.set(node.id, { functionName: node.callFrame.functionName || "(anonymous)", url: node.callFrame.url ?? "" });
  }
  const counts = new Map<string, number>();
  for (const sample of profile.samples) {
    const node = nodes.get(sample);
    if (node === undefined) continue;
    let name = node.functionName;
    if (name === "(anonymous)") name = `anon@${node.url.split("/").pop() ?? ""}`;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const total = profile.samples.length;
  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([name, count]) => ({ name, samples: count, msPerFrame: (count / total) * (SAMPLE_SECONDS * 1_000) }));
  console.log(JSON.stringify({ event: "profile", tag: TAG, quality: QUALITY, totalSamples: total, rows }));
  ws.close();
  process.exit(0);
}

main().catch((error) => {
  console.log(JSON.stringify({ event: "cdp_error", detail: String(error) }));
  process.exit(1);
});
