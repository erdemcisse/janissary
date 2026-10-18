// Interactive CDP helper: join once, then run commands from argv:
//   node tools/weapon-grip-peek.mjs "expr" ["outName"]
// Evaluates the expr in the page (returnByValue), prints it, optionally screenshots.
import { writeFileSync } from "node:fs";
import WebSocket from "ws";

const SHOT_DIR = new URL("../docs/image-feedback/", import.meta.url).pathname;
const list = await (await fetch("http://localhost:9334/json/list")).json();
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
    pending.delete(m.id);
    if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m.result);
  }
});
await new Promise((r) => ws.on("open", r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result?.value;
};

// Assumes an earlier probe already joined on this tab (session persists while
// the tab stays open). If the join form is back, join again.
const state = await evaluate(`(() => {
  const card = document.querySelector(".connect-card");
  if (card !== null && card.offsetParent !== null) return "join-form";
  return window.__gameDebug ? "in-game" : "no-hooks";
})()`);
console.log(JSON.stringify({ state }));
if (state === "join-form") {
  await evaluate(`(() => {
    const card = document.querySelector(".connect-card");
    const input = card.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "PeekProbe");
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
  await sleep(8_000);
}

const expr = process.argv[2];
const outName = process.argv[3];
if (expr) {
  const value = await evaluate(expr);
  console.log(JSON.stringify({ value }));
}
if (outName) {
  await sleep(Number(process.argv[4] ?? 300));
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
  writeFileSync(`${SHOT_DIR}/${outName}.jpg`, Buffer.from(r.data, "base64"));
  console.log(JSON.stringify({ event: "screenshot", outName }));
}
ws.close();
process.exit(0);
