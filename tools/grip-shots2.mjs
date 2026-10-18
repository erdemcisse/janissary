// 8e-16 grip close-ups v2: pick a musketeer rig near the densest cluster,
// PIN its clip (aim / fire / run via forceClip), and frame it front-quarter
// for the two-hand-hold screenshots.
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
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
  writeFileSync(`${SHOT_DIR}/${name}.jpg`, Buffer.from(r.data, "base64"));
  console.log(JSON.stringify({ event: "screenshot", name }));
};

const PREFIX = process.argv[2] ?? "8e-16-grip";
const CLIPS = (process.argv[3] ?? "run,aim,fire").split(",");

await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:5173" });
await sleep(9_000);
await evaluate(`(() => {
  const card = document.querySelector(".connect-card");
  if (card === null) return "no-join-form";
  const input = card.querySelector("input");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "GripProbe2");
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

let cluster = null;
for (let i = 0; i < 240; i++) {
  cluster = await evaluate(`window.__gameDebug.combat.densestCluster()`);
  if (cluster && cluster.count >= 8) break;
  await sleep(500);
}
console.log(JSON.stringify({ event: "cluster", cluster }));
if (!cluster) process.exit(1);

// Find a musketeer rig near the cluster.
let target = null;
for (let i = 0; i < 60 && target === null; i += 1) {
  target = await evaluate(`(() => {
    const rigs = window.__gameDebug.characterRigs();
    const rig = rigs.find((r) => r.mode === "live" && (r.model === "janissaryMusketeer" || r.model === "ottomanAzap" || r.model === "ottomanGunner"));
    if (!rig) return null;
    const pos = window.__gameDebug.rigWorld(rig.entityId);
    return pos ? { entityId: rig.entityId, model: rig.model, pos } : null;
  })()`);
  if (target === null) await sleep(500);
}
console.log(JSON.stringify({ event: "target", target }));
if (!target) process.exit(1);

for (const clip of CLIPS) {
  // Re-resolve per clip: the previous target may have died or left the AOI.
  let target = null;
  for (let i = 0; i < 40 && target === null; i += 1) {
    target = await evaluate(`(() => {
      const rigs = window.__gameDebug.characterRigs();
      const rig = rigs.find((r) => r.mode === "live" && (r.model === "janissaryMusketeer" || r.model === "ottomanAzap" || r.model === "ottomanGunner"));
      if (!rig) return null;
      const pos = window.__gameDebug.rigWorld(rig.entityId);
      return pos ? { entityId: rig.entityId, model: rig.model, pos } : null;
    })()`);
    if (target === null) await sleep(500);
  }
  if (!target) { console.log(JSON.stringify({ event: "no-target", clip })); continue; }
  const ok = await evaluate(`window.__gameDebug.forceClip(${target.entityId}, ${JSON.stringify(clip)})`);
  if (!ok) { console.log(JSON.stringify({ event: "pin-failed", clip })); continue; }
  await sleep(700); // let the mixer settle into the pose
  const pos = await evaluate(`window.__gameDebug.rigWorld(${target.entityId})`);
  if (!pos) { console.log(JSON.stringify({ event: "lost-target", clip })); continue; }
  // Front-quarter: entity forward is -Z rotated by yaw; step 2.4 m to the
  // front-left and slightly above the hip so both hands read.
  const fx = -Math.sin(pos.yaw);
  const fz = -Math.cos(pos.yaw);
  const cx = pos.x + fx * 2.4 - fz * 1.1;
  const cz = pos.z + fz * 2.4 + fx * 1.1;
  const cy = pos.y + 1.35;
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = -0.12;
  await evaluate(`window.__gameDebug.setCamera(${cx}, ${cy}, ${cz}, ${yaw}, ${pitch})`);
  await sleep(150);
  const name = clip === "run" ? `${PREFIX}-carry-run` : clip === "aim" ? `${PREFIX}-aim-twohand` : `${PREFIX}-fire-twohand`;
  await shot(name);
  console.log(JSON.stringify({ event: "captured", clip }));
  await evaluate(`window.__gameDebug.forceClip(${target.entityId}, null)`);
}
await evaluate(`window.__gameDebug.clearCamera()`);
ws.close();
process.exit(0);
