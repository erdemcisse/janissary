// 8e-12 focused captures: anchor on densestCluster() and burst-shoot.
import { writeFileSync } from "node:fs";
import WebSocket from "ws";

const SHOT_DIR = new URL("../docs/image-feedback/", import.meta.url).pathname;
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
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result?.value;
};
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
  writeFileSync(`${SHOT_DIR}/${name}.jpg`, Buffer.from(r.data, "base64"));
  console.log(JSON.stringify({ event: "screenshot", name }));
};
const lookAt = (cam, target) => {
  const dx = target.x - cam.x, dz = target.z - cam.z;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(target.y - cam.y, Math.hypot(dx, dz));
  return { yaw, pitch };
};
const setCam = (cam, target) => {
  const { yaw, pitch } = lookAt(cam, target);
  return evaluate(`window.__gameDebug.setCamera(${cam.x}, ${cam.y}, ${cam.z}, ${yaw}, ${pitch})`);
};

await send("Page.enable");
// Fresh load so the just-added densestCluster hook exists, then rejoin.
await send("Page.navigate", { url: "http://localhost:5173" });
await sleep(9_000);
const join = await evaluate(`(() => {
  const card = document.querySelector(".connect-card");
  if (card === null) return "no-join-form";
  const input = card.querySelector("input");
  if (input !== null) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "RigProbe");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const selects = card.querySelectorAll("select");
  const pick = (select, wanted) => {
    for (const option of select.options) { if (option.text.includes(wanted)) { select.value = option.value; select.dispatchEvent(new Event("change", { bubbles: true })); return option.text; } }
    return "";
  };
  const team = selects.length > 0 ? pick(selects[0], "Ottoman") : "";
  const cls = selects.length > 1 ? pick(selects[1], "Janissary") : "";
  card.querySelector("button").click();
  return "joined:" + team + ":" + cls;
})()`);
console.log(JSON.stringify({ event: "join", join }));
await sleep(9_000);


const inGame = await evaluate(`!!window.__gameDebug`);
console.log(JSON.stringify({ event: "in_game", inGame }));
if (!inGame) process.exit(1);

// Wait for a real scrum (>= 8 neighbours), then burst-capture side-on,
// re-polling before EVERY frame — a 36-bot scrum drifts metres per second.
let cluster = null;
for (let i = 0; i < 120; i++) {
  cluster = await evaluate(`window.__gameDebug.combat.densestCluster()`);
  if (cluster && cluster.count >= 8) break;
  await sleep(500);
}
console.log(JSON.stringify({ event: "cluster", cluster }));
if (cluster) {
  for (let i = 0; i < 6; i++) {
    const c = await evaluate(`window.__gameDebug.combat.densestCluster()`);
    if (!c) break;
    const camA = { x: c.x + 7.5, y: c.y + 2.4, z: c.z + 5.5 };
    await setCam(camA, { x: c.x, y: c.y + 1.1, z: c.z });
    await sleep(120);
    await shot(i === 0 ? "8e-12-melee-scrum" : `8e-12-melee-scrum-${i}`);
    await sleep(430);
  }
  // volley-line: pull back + swing to catch shooters side-on
  for (let i = 0; i < 6; i++) {
    const c = await evaluate(`window.__gameDebug.combat.densestCluster()`);
    if (!c) break;
    const camB = { x: c.x - 11, y: c.y + 3.0, z: c.z + 8.5 };
    await setCam(camB, { x: c.x, y: c.y + 1.2, z: c.z });
    await sleep(120);
    await shot(i === 0 ? "8e-12-volley-line" : `8e-12-volley-line-${i}`);
    await sleep(530);
  }
}
await evaluate(`window.__gameDebug.clearCamera()`);
console.log(JSON.stringify({ event: "done" }));
ws.close();
process.exit(0);
