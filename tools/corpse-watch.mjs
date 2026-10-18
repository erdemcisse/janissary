// Reload + join + park at the densest cluster, then watch corpse spawns and
// the 8e-16 death-path counters for ~90 s.
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
    pending.delete(m.id);
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
console.log("join:", JSON.stringify(await evaluate(`(() => {
  const card = document.querySelector(".connect-card");
  if (card === null) return "no-join-form";
  const input = card.querySelector("input");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "CorpseProbe");
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
})()`)));
await sleep(8_000);

for (let i = 0; i < 90; i += 1) {
  const cluster = await evaluate(`window.__gameDebug.combat.densestCluster()`);
  if (cluster && cluster.count >= 6) {
    await evaluate(`window.__gameDebug.setCamera(${cluster.x}, 16, ${cluster.z + 16}, 0, -0.55)`);
  }
  const row = await evaluate(`(() => {
    const counts = window.__gameDebug.characterCounts();
    const rigs = window.__gameDebug.characterRigs();
    const corpses = rigs.filter((r) => r.mode === "corpse");
    return { deaths: counts.deaths, corpses: corpses.length, clips: corpses.map((r) => r.action + "@w" + r.weight.toFixed(2) + "/t" + r.actionTime.toFixed(2) + "/h" + r.height.toFixed(2)) };
  })()`);
  console.log(i, JSON.stringify(row));
  if (row && row.corpses >= 3 && i > 10) break;
  await sleep(1_000);
}
ws.close();
process.exit(0);
