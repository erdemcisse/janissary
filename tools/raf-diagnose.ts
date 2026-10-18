import WebSocket from "ws";

interface CdpResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message: string };
}

function connectCdp(url: string): Promise<{ send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>> }> {
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
        if (message.error !== undefined) handler.reject(new Error(message.error.message));
        else handler.resolve(message.result ?? {});
      });
      resolve({ send });
    });
    ws.on("error", reject);
  });
}

async function main(): Promise<void> {
  const list = (await (await fetch("http://localhost:9333/json/list")).json()) as Array<{ type: string; url: string; webSocketDebuggerUrl: string }>;
  const page = list.find((t) => t.type === "page" && t.url.includes("localhost:5173"));
  if (page === undefined) throw new Error("no page target");
  const { send } = await connectCdp(page.webSocketDebuggerUrl);
  const ev = async (expression: string, awaitPromise = false): Promise<unknown> => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    return (r.result as { value?: unknown } | undefined)?.value;
  };
  const env = await ev(`JSON.stringify({
    visibility: document.visibilityState,
    focus: document.hasFocus(),
    inner: [window.innerWidth, window.innerHeight],
    outer: [window.outerWidth, window.outerHeight],
    pos: [window.screenX, window.screenY],
    debug: typeof window.__gameDebug,
  })`);
  console.log("env:", env);
  await ev(`window.__rafCount = 0; window.__rafTick = () => { window.__rafCount += 1; requestAnimationFrame(window.__rafTick); }; requestAnimationFrame(window.__rafTick); "started"`);
  await new Promise((r) => setTimeout(r, 1000));
  const raf = await ev(`window.__rafCount`);
  console.log("rafFramesPerSec:", raf);
  process.exit(0);
}

void main();
