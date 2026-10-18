// 8e-18 weapon grip shots: pin a rig's weapon SLOT (forceSlot — bots never
// press Slot1/3, so blade/sidearm props never show otherwise) and its clip
// (forceClip), then frame it front-quarter like grip-shots2.mjs (8e-16).
//
//   node tools/weapon-grip-shots.mjs <modelSubstr> <slot> <clip> <shotName> [actionTime] [spawn|cluster] [Ottoman|Byzantine] [rejoin] [near]
//
// Chrome: --remote-debugging-port=9334 (own instance; 9333 belongs to another
// probe). Dev server must already be running on :5173.
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
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
  writeFileSync(`${SHOT_DIR}/${name}.jpg`, Buffer.from(r.data, "base64"));
  console.log(JSON.stringify({ event: "screenshot", name }));
};

const MODEL = process.argv[2]; // e.g. janissarySwordsman
const SLOT = Number(process.argv[3]); // 1/2/3
const CLIP = process.argv[4]; // walk | slash | aim | ...
const NAME = process.argv[5];
const WANT_TIME = process.argv[6] === undefined ? null : Number(process.argv[6]); // pin a clip phase (s)
const ANCHOR_MODE = process.argv[7] ?? "spawn"; // spawn | cluster
const TEAM = process.argv[8] ?? "Ottoman"; // join team when a fresh join is needed
const REJOIN = process.argv[9] === "rejoin"; // force a fresh join (team switch)
const NEAR = process.argv[10] === "near"; // pick the rig NEAREST the cluster (melee rigs only exist in the scrum)
const TARGET_ID = process.argv[11] === undefined ? null : Number(process.argv[11]); // pin a specific entity (from a peek census)

await send("Page.enable");
// Reuse a live session when the tab is already in-game (fresh joins spawn far
// from the fighting and the AOI starves the rig pool).
const state = await evaluate(`(() => {
  const card = document.querySelector(".connect-card");
  if (card !== null && card.offsetParent !== null) return "join-form";
  return window.__gameDebug ? "in-game" : "cold";
})()`);
if (state !== "in-game" || REJOIN) {
  await send("Page.navigate", { url: "http://localhost:5173" });
  await sleep(9_000);
  await evaluate(`(() => {
    const card = document.querySelector(".connect-card");
    if (card === null) return "no-join-form";
    const input = card.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "WeaponProbe18");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const selects = card.querySelectorAll("select");
    const pick = (select, wanted) => {
      for (const option of select.options) { if (option.text.includes(wanted)) { select.value = option.value; select.dispatchEvent(new Event("change", { bubbles: true })); return option.text; } }
      return "";
    };
    if (selects.length > 0) pick(selects[0], ${JSON.stringify(TEAM)});
    if (selects.length > 1) pick(selects[1], ${JSON.stringify(TEAM === "Byzantine" ? "Guardsman" : "Janissary")});
    card.querySelector("button").click();
    return "joined";
  })()`);
  await sleep(8_000);
}

// The clip is always pinned (forceClip snaps to full weight — a stationary
// bot playing walk still shows the true carry grip, which is what these shots
// prove). ANCHOR (arg 7): "spawn" keeps the camera wherever the session
// already is (open ground, steady foot traffic); "cluster" jumps to the
// densest fighting first (needed for Byzantine models while playing Ottoman).

// One page-side eval per step — every extra CDP round trip is a window for
// the battle to kill or reclaim the pinned rig. The setup eval finds the
// ISOLATED rig (farthest from the densest cluster — scrum rigs are occluded
// by neighbours and siege engines), pins slot + clip, and installs a
// TRACKING camera: an in-page interval re-frames the rig every 100 ms, so a
// walking target can't stroll out of the shot between evals.
const setupExpr = (side) => `(() => {
  const dbg = window.__gameDebug;
  const cluster = dbg.combat.densestCluster();
  const candidates = [];
  for (const r of dbg.characterRigs()) {
    if (r.mode !== "live" || r.model !== ${JSON.stringify(MODEL)}) continue;
    if (${TARGET_ID === null ? "false" : `r.entityId !== ${TARGET_ID}`}) continue;
    const pos = dbg.rigWorld(r.entityId);
    if (!pos) continue;
    const d = cluster ? Math.hypot(pos.x - cluster.x, pos.z - cluster.z) : 0;
    candidates.push({ entityId: r.entityId, pos, d });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => ${NEAR ? "a.d - b.d" : "b.d - a.d"});
  const best = candidates[0];
  if (!dbg.forceSlot(best.entityId, ${SLOT})) return null;
  if (!dbg.forceClip(best.entityId, ${JSON.stringify(CLIP)})) return null;
  if (window.__gripTrack !== undefined) clearInterval(window.__gripTrack);
  const sign = ${side === "a" ? "1" : "-1"};
  const frame = () => {
    const pos = dbg.rigWorld(best.entityId);
    if (!pos) return;
    const fx = -Math.sin(pos.yaw);
    const fz = -Math.cos(pos.yaw);
    const cx = pos.x + fx * 2.2 - fz * 1.0 * sign;
    const cz = pos.z + fz * 2.2 + fx * 1.0 * sign;
    dbg.setCamera(cx, pos.y + 1.25, cz, Math.atan2(-(pos.x - cx), -(pos.z - cz)), -0.14);
  };
  frame();
  window.__gripTrack = setInterval(frame, 100);
  return { entityId: best.entityId, isolation: best.d };
})()`;

const stopTrack = `(clearInterval(window.__gripTrack), window.__gripTrack = undefined, true)`;

// Re-install the tracker on the SAME pinned rig for the other camera side.
const trackExpr = (entityId, side) => `(() => {
  const dbg = window.__gameDebug;
  if (window.__gripTrack !== undefined) clearInterval(window.__gripTrack);
  const sign = ${side === "a" ? "1" : "-1"};
  const frame = () => {
    const pos = dbg.rigWorld(${entityId});
    if (!pos) return;
    const fx = -Math.sin(pos.yaw);
    const fz = -Math.cos(pos.yaw);
    const cx = pos.x + fx * 2.2 - fz * 1.0 * sign;
    const cz = pos.z + fz * 2.2 + fx * 1.0 * sign;
    dbg.setCamera(cx, pos.y + 1.25, cz, Math.atan2(-(pos.x - cx), -(pos.z - cz)), -0.14);
  };
  frame();
  window.__gripTrack = setInterval(frame, 100);
  return true;
})()`;

const waitPhase = async (entityId) => {
  if (WANT_TIME === null) return;
  for (let i = 0; i < 400; i += 1) {
    const t = await evaluate(`(() => {
      const row = window.__gameDebug.characterRigs().find((r) => r.entityId === ${entityId});
      return row && row.action === ${JSON.stringify(CLIP)} ? row.actionTime : null;
    })()`);
    if (t === null) return;
    if (t >= WANT_TIME && t < WANT_TIME + 0.12) return;
    await sleep(40);
  }
};

// Wide cluster anchor so rigs bloom near the battle before the hunt. With
// ANCHOR "spawn" (default) the camera stays on the live session's own view —
// spawn areas are open ground with steady foot traffic, and repeated fresh
// joins land far from the fight (the AOI then starves the rig pool).
const anchor = async () => {
  if (ANCHOR_MODE !== "cluster") {
    await evaluate(`window.__gameDebug.clearCamera()`); // a previous run may have left the camera parked
    return null;
  }
  const c = await evaluate(`window.__gameDebug.combat.densestCluster()`);
  if (!c) return null;
  await evaluate(`window.__gameDebug.setCamera(${c.x}, ${c.y + 6}, ${c.z + 10}, 0, -0.45)`);
  // The AOI follows the LOCAL ENTITY, not the camera — a probe that spawned at
  // camp (100 m from the fight) sees an empty rig pool even with the camera
  // parked on the cluster. Walk the entity toward the cluster so rigs bloom.
  for (let leg = 0; leg < 3; leg += 1) {
    const reached = await evaluate(`(() => {
      const dbg = window.__gameDebug;
      const c = dbg.combat.densestCluster();
      const pos = dbg.movement.state();
      if (c === null || pos === null || !pos.alive) return false;
      const dx = c.x - pos.x, dz = c.z - pos.z;
      if (Math.hypot(dx, dz) < 40) return true;
      dbg.movement.drive(1, Math.atan2(-dx, -dz));
      return false;
    })()`);
    if (reached) break;
    await sleep(5_000);
  }
  await evaluate(`window.__gameDebug.movement.driveStop()`);
  return c;
};
await anchor();
await sleep(3_000);

for (let attempt = 1; attempt <= 40; attempt += 1) {
  if (attempt % 8 === 0) await anchor(); // the cluster drifts; keep rigs near it
  const target = await evaluate(setupExpr("a"));
  if (!target || (!NEAR && target.isolation < 12 && attempt < 39)) {
    // Crowded rigs hide the grip behind neighbours; wait for a straggler
    // unless we have already been hunting a while.
    if (target) await evaluate(`${stopTrack}, window.__gameDebug.forceClip(${target.entityId}, null), window.__gameDebug.forceSlot(${target.entityId}, null)`);
    console.log(JSON.stringify({ event: target ? "too-crowded" : "no-target", attempt, isolation: target?.isolation ?? null }));
    await sleep(600);
    continue;
  }
  await sleep(300); // mixer settle: forceClip snaps weight, two frames is enough
  let captured = false;
  for (const side of ["a", "b"]) {
    if (side === "b") await evaluate(trackExpr(target.entityId, "b")); // same rig, other camera side
    await waitPhase(target.entityId);
    // A few tracking frames per side — a turning walker gives one clean angle.
    for (let frame = 0; frame < 3; frame += 1) {
      const alive = await evaluate(`window.__gameDebug.rigWorld(${target.entityId}) !== null`);
      if (!alive) { console.log(JSON.stringify({ event: "lost-at-shot", attempt, side })); break; }
      await shot(`${NAME}-${side}${frame}`);
      captured = true;
      if (WANT_TIME === null) await sleep(500); // let the walk cycle advance between frames
      else break; // phase-pinned shots only need one frame per side
    }
    if (!captured) break;
  }
  await evaluate(stopTrack);
  await evaluate(`window.__gameDebug.forceClip(${target.entityId}, null)`);
  await evaluate(`window.__gameDebug.forceSlot(${target.entityId}, null)`);
  if (captured) {
    console.log(JSON.stringify({ event: "captured", NAME, attempt, entityId: target.entityId, isolation: target.isolation }));
    await evaluate(`window.__gameDebug.clearCamera()`);
    ws.close();
    process.exit(0);
  }
}
console.log(JSON.stringify({ event: "gave-up", MODEL }));
ws.close();
process.exit(1);
