// 8e-18 soak: 90 s live battle — the new sound library firing in anger.
// Watches __audioDebug(): variantPlays rotation across the 6-member gunshot
// pool and the new pool members, one-shot counts for the newly wired keys,
// ambient loops (shore-ambience proximity), and longRunners (stuck voices).
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
console.log("join:", await evaluate(`(() => {
  const card = document.querySelector(".connect-card");
  if (card === null) return "no-join-form";
  const input = card.querySelector("input");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "Soak8e18");
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
})()`));
await sleep(6_000);

// The AudioContext is created by a click gesture on the renderer canvas
// (#enableAudio in GameClient). Headless Chrome can't supply real user
// activation, so dispatch a synthetic click — with the soak's
// --autoplay-policy=no-user-gesture-required launch, the created context is
// allowed to run.
console.log("unlock:", await evaluate(`(() => {
  const canvas = document.querySelector("canvas");
  if (canvas === null) return "no-canvas";
  canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return typeof window.__audioDebug === "function" ? "clicked" : "no-hooks";
})()`));

const WATCH_KEYS = ["gunshot", "melee-swing", "sword-impact", "footsteps-dirt", "bombard-fire", "bombard-impact",
  "flesh-hit", "splat-gore", "headshot", "jump-land", "wood-impact", "thud", "ship-creak", "splash-big",
  "horse-neigh", "footsteps-stone", "footstep-water", "footsteps-wood"];
let lastPlays = {};
let longRunnerEvents = 0;
let heldMelee = false;
for (let t = 0; t < 300; t += 5) {
  // Single-phase wall watch: walk to the wall line (45, 0) and park under the
  // bombard fire — thud (shell on curtain), wood-impact (shell on siege
  // props), and melee windows (Slot1+Fire swings the kilij among the scrum).
  const windowIdx = Math.floor(t / 10) % 4;
  const melee = windowIdx === 1;
  const fire = windowIdx % 2 === 0;
  if (heldMelee) {
    await evaluate(`window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyE", bubbles: true }))`);
    heldMelee = false;
  }
  const where = await evaluate(`(() => {
    const dbg = window.__gameDebug;
    if (dbg === undefined) return null;
    const deploy = document.querySelector(".deploy-button:not([disabled])");
    if (deploy !== null) deploy.click();
    const pos = dbg.movement.state();
    if (pos === null) return null;
    if (${melee}) {
      // Drive override replaces the sim input but NOT the raw-input path the
      // melee-swing audio reads — so stop driving and hold the real E key.
      dbg.movement.driveStop();
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE", bubbles: true }));
      return { x: Math.round(pos.x), z: Math.round(pos.z), phase: "melee", alive: pos.alive, buttons: 0 };
    }
    const tx = 45, tz = 0;
    const dx = tx - pos.x, dz = tz - pos.z;
    const dist = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz);
    let buttons = 0;
    if (dist > 20) buttons |= 1; // Forward (park once at the wall)
    if (${fire}) buttons |= 16; // Fire (slot 2 arquebus at range)
    dbg.movement.drive(buttons, yaw);
    return { x: Math.round(pos.x), z: Math.round(pos.z), phase: "wall", alive: pos.alive, buttons };
  })()`);
  const snap = await evaluate(`(() => {
    if (typeof window.__audioDebug !== "function") return null;
    const s = window.__audioDebug();
    return { contextState: s.contextState, oneShots: s.oneShotVoices, loops: s.ambientLoops, variantPlays: s.variantPlays,
      totalPlays: s.totalPlays, longRunners: s.longRunners.map((v) => v.key + ":" + Math.round(v.ageMs)), pending: s.pendingLoads };
  })()`);
  if (snap === null || typeof snap === "string") { console.log(`t=${t}s no-debug:`, snap); await sleep(5_000); continue; }
  if (snap.longRunners.length > 0) { longRunnerEvents += 1; console.log(`t=${t}s LONG-RUNNERS:`, JSON.stringify(snap.longRunners)); }
  const plays = snap.totalPlays ?? {};
  const deltas = {};
  for (const key of WATCH_KEYS) {
    const now = plays[key] ?? 0;
    const before = lastPlays[key] ?? 0;
    if (now > before) deltas[key] = now - before;
    lastPlays[key] = now;
  }
  const shore = (snap.loops ?? []).find((l) => l.key === "shore-ambience");
  console.log(`t=${t}s ctx=${snap.contextState} at=${JSON.stringify(where)} deltas=${JSON.stringify(deltas)} oneShots=${JSON.stringify(snap.oneShots)} shore=${shore ? shore.target.toFixed(3) : "-"} pending=${snap.pending}`);
  await sleep(5_000);
}
console.log("FINAL FULL variantPlays:", JSON.stringify(await evaluate(`(() => { const s = window.__audioDebug(); return s.variantPlays; })()`)));
console.log("FINAL totalPlays:", JSON.stringify(await evaluate(`(() => { const s = window.__audioDebug(); return s.totalPlays; })()`)));
await evaluate(`window.__gameDebug?.movement.driveStop()`);
console.log(JSON.stringify({ event: "soak-done", longRunnerEvents }));
ws.close();
process.exit(0);
