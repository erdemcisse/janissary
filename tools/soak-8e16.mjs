// 8e-16 soak: 90 s live battle — watch the kill feed for drowning lines
// (bot water-guard proof) and __audioDebug().longRunners (stuck-voice proof).
import WebSocket from "ws";
const list = await (await fetch("http://localhost:9333/json/list")).json();
const page = list.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
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
    if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m.result);
  }
});
await new Promise((r) => ws.on("open", r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return `ERR ${JSON.stringify(r.exceptionDetails).slice(0, 300)}`;
  return r.result?.value;
};

await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:5173" });
await sleep(9_000);
await evaluate(`(() => {
  const card = document.querySelector(".connect-card");
  if (card === null) return "no-join-form";
  const input = card.querySelector("input");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "SoakProbe");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const selects = card.querySelectorAll("select");
  const pick = (select, wanted) => {
    for (const option of select.options) { if (option.text.includes(wanted)) { select.value = option.value; select.dispatchEvent(new Event("change", { bubbles: true })); return option.text; } }
    return "";
  };
  if (selects.length > 0) pick(selects[0], "Ottoman");
  if (selects.length > 1) pick(selects[1], "Janissary");
  card.querySelector("button").click();
  return "joined";
})()`);
await sleep(6_000);

const seen = new Set();
let drownedCount = 0;
const longRunnerLog = [];
for (let t = 0; t < 90; t += 2) {
  const feed = await evaluate(`Array.from(document.querySelectorAll(".kill-feed *")).map((n) => n.textContent || "").filter(Boolean)`);
  if (Array.isArray(feed)) {
    for (const line of feed) {
      if (!seen.has(line)) {
        seen.add(line);
        if (/drowned/i.test(line)) { drownedCount += 1; console.log("DROWNED-LINE:", line); }
      }
    }
  }
  const audio = await evaluate(`(() => {
    if (typeof window.__audioDebug !== "function") return null;
    const s = window.__audioDebug();
    return { voices: s.voices ?? s.activeVoices ?? null, longRunners: (s.longRunners || []).map((v) => v.key + ":" + Math.round(v.ageMs) + "ms"), keys: Object.keys(s) };
  })()`);
  if (audio && audio.longRunners && audio.longRunners.length > 0) {
    longRunnerLog.push({ t, longRunners: audio.longRunners });
    console.log(`t=${t}s LONG-RUNNERS:`, JSON.stringify(audio.longRunners));
  }
  if (t % 20 === 0 && audio) console.log(`t=${t}s audio keys=${JSON.stringify(audio.keys)} voices=${audio.voices}`);
  await sleep(2_000);
}
const audioKeys = await evaluate(`typeof window.__audioDebug === "function" ? Object.keys(window.__audioDebug()) : null`);
console.log(JSON.stringify({ event: "soak-done", drownedCount, longRunnerEvents: longRunnerLog.length, audioKeys, feedLines: seen.size }));
ws.close();
process.exit(0);
