// 8e-12 A/B: sample F3 overlay with legacy procedural vs rigged characters,
// same session, toggling __gameDebug.legacySoldiers. Assumes the page is
// already joined with the F3 overlay open (perf-probe end state).
import WebSocket from "ws";
const list = await (await fetch("http://localhost:9333/json/list")).json();
const page = list.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 1;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = id++;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
ws.on("message", (d) => {
  const m = JSON.parse(String(d));
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m.result);
  }
});
await new Promise((r) => ws.on("open", r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result?.value;
const readOverlay = () => evaluate(`(() => {
  const overlay = document.querySelector(".debug-overlay");
  if (overlay === null) return { present: false };
  const pairs = new Map();
  for (const dt of overlay.querySelectorAll("dt")) {
    const dd = dt.nextElementSibling;
    if (dd !== null) pairs.set(dt.textContent, dd.textContent);
  }
  const get = (label) => { const v = pairs.get(label); return v === undefined ? null : Number.parseFloat(v); };
  return { present: true, fps: get("Frame rate"), frameP95Ms: get("Frame p95"), drawCalls: get("Draw calls"), visible: get("Visible"), entities: get("Entities") };
})()`);
const median = (values) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

const sampleSet = async (label) => {
  await sleep(5_000); // settle after toggle
  const p95s = [], fpss = [], draws = [];
  for (let i = 0; i < 6; i++) {
    const s = await readOverlay();
    if (s && s.present) {
      p95s.push(s.frameP95Ms); fpss.push(s.fps); draws.push(s.drawCalls);
      console.log(JSON.stringify({ event: "ab_sample", label, i, ...s }));
    }
    await sleep(4_000);
  }
  console.log(JSON.stringify({ event: "ab_summary", label, medianFps: median(fpss), medianP95: median(p95s), medianDraws: median(draws) }));
};

console.log(JSON.stringify({ event: "legacy_toggle", on: await evaluate(`(() => { window.__gameDebug.legacySoldiers(true); return true; })()`) }));
await sampleSet("legacy");
await evaluate(`window.__gameDebug.legacySoldiers(false)`);
await sampleSet("rigged");
console.log(JSON.stringify({ event: "counts", counts: await evaluate(`window.__gameDebug.characterCounts()`) }));
ws.close();
process.exit(0);
