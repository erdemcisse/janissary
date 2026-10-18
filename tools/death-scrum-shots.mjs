// 8e-16 corpse scrum proof v2: side-on framing of a corpse (lying prone) and
// a mixed living+fallen scale shot.
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

await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:5173" });
await sleep(9_000);
await evaluate(`(() => {
  const card = document.querySelector(".connect-card");
  if (card === null) return "no-join-form";
  const input = card.querySelector("input");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "DeathProbe");
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

// Wait until a SETTLED corpse (height < 0.7 = fully prone) exists, then frame
// it side-on. Prefer one with a living neighbour for the scale shot.
let pick = null;
for (let i = 0; i < 240; i += 1) {
  const cluster = await evaluate(`window.__gameDebug.combat.densestCluster()`);
  if (cluster && cluster.count >= 6) {
    await evaluate(`window.__gameDebug.setCamera(${cluster.x}, 20, ${cluster.z + 18}, 0, -0.6)`);
  }
  pick = await evaluate(`(() => {
    const rigs = window.__gameDebug.characterRigs();
    const corpses = rigs.filter((r) => r.mode === "corpse" && r.height < 0.7);
    if (corpses.length === 0) return null;
    let best = null;
    for (const c of corpses) {
      let near = 1e9; let living = null;
      for (const r of rigs) {
        if (r.mode !== "live" || !r.visible) continue;
        const d = Math.hypot(r.rootX - c.rootX, r.rootZ - c.rootZ);
        if (d < near) { near = d; living = r; }
      }
      if (!best || near < best.near) best = { x: c.rootX, y: c.rootY, z: c.rootZ, h: c.height, near, living: living ? { x: living.rootX, z: living.rootZ, h: living.height } : null };
    }
    return best;
  })()`);
  if (pick && pick.near < 8) break;
  await sleep(1_000);
}
console.log(JSON.stringify({ event: "pick", pick }));
if (!pick) { ws.close(); process.exit(1); }

// Side-on close-up: 2.6 m east of the corpse, camera 1.1 m up, looking west
// slightly down — a prone body reads as a horizontal figure from the side.
{
  const dx = 2.6, dz = 0.0;
  const yaw = Math.atan2(-(pick.x - (pick.x + dx)), -(pick.z - (pick.z + dz)));
  await evaluate(`window.__gameDebug.setCamera(${pick.x + dx}, ${pick.y + 1.1}, ${pick.z + dz}, ${yaw}, -0.28)`);
  await sleep(300);
  await shot("8e-16-death-fixed");
}

// Scale shot: corpse in foreground, nearest living soldier behind it — camera
// placed so both are in frame at similar depth.
if (pick.living) {
  const mx = (pick.x + pick.living.x) / 2, mz = (pick.z + pick.living.z) / 2;
  const dx = mx - pick.x, dz = mz - pick.z;
  const len = Math.hypot(dx, dz) || 1;
  // camera perpendicular to the corpse→living line, 6 m back
  const px = -dz / len, pz = dx / len;
  const cx = mx + px * 6, cz = mz + pz * 6;
  const yaw = Math.atan2(-(mx - cx), -(mz - cz));
  await evaluate(`window.__gameDebug.setCamera(${cx}, 2.2, ${cz}, ${yaw}, -0.18)`);
  await sleep(300);
  await shot("8e-16-uniform-scale");
}

await evaluate(`window.__gameDebug.clearCamera()`);
ws.close();
process.exit(0);
