#!/usr/bin/env node
/**
 * meshy-gen.mjs — Meshy image-to-3D pipeline for janissary-game.
 *
 * Flow: reference images in client/models-inbox/refs/ + manifest.json
 *   → POST /openapi/v1/image-to-3d (smart-topology, textured, glb)
 *   → poll → download GLB + thumbnails + task metadata (license records)
 *   → auto-inspect geometry (tri count, scale, orientation, textures)
 *
 * Usage:
 *   node tools/meshy-gen.mjs                 # dry run: plan + credit estimate, NO API spend
 *   node tools/meshy-gen.mjs --confirm       # actually create tasks and spend credits
 *   node tools/meshy-gen.mjs --only janissary-musketeer [--confirm]
 *   node tools/meshy-gen.mjs --status        # list recent Meshy tasks
 *
 * API key: reads MESHY_API_KEY from .env.local (gitignored). Never print it.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const INBOX = path.join(ROOT, "client/models-inbox");
const MANIFEST = path.join(INBOX, "manifest.json");
const API = "https://api.meshy.ai/openapi/v1/image-to-3d";

const key = (() => {
  for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^MESHY_API_KEY=(.+)$/);
    if (m) return m[1].trim();
  }
  console.error("MESHY_API_KEY missing from .env.local");
  process.exit(1);
})();

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm");
const STATUS = args.includes("--status");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

if (STATUS) {
  const tasks = await api("GET", `${API}?page_size=20&sort_by=-created_at`);
  for (const t of tasks)
    console.log(`${t.status.padEnd(10)} ${String(t.consumed_credits ?? "?").padStart(3)}cr  ${t.id}  ${t.texture_prompt || ""}`);
  process.exit(0);
}

// --fetch <taskId> <assetName>: download + inspect an already-created task (no new spend).
if (args.includes("--fetch")) {
  const taskId = args[args.indexOf("--fetch") + 1];
  const assetName = args[args.indexOf("--fetch") + 2];
  const manifest0 = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const entry = manifest0.assets.find((x) => x.name === assetName) ?? { name: assetName, kind: "prop", image: "?" };
  const task = await api("GET", `${API}/${taskId}`);
  if (task.status !== "SUCCEEDED") {
    console.error(`task ${taskId} status ${task.status} — not downloadable yet`);
    process.exit(1);
  }
  mkdirSync(path.join(INBOX, "glb"), { recursive: true });
  mkdirSync(path.join(INBOX, "meta"), { recursive: true });
  mkdirSync(path.join(INBOX, "thumbs"), { recursive: true });
  writeFileSync(path.join(INBOX, "glb", `${assetName}.glb`),
    Buffer.from(await (await fetch(task.model_urls.glb)).arrayBuffer()));
  writeFileSync(path.join(INBOX, "meta", `${assetName}.json`), JSON.stringify({
    name: assetName, kind: entry.kind, taskId, consumedCredits: task.consumed_credits,
    createdAt: new Date(task.created_at).toISOString(), finishedAt: new Date(task.finished_at).toISOString(),
    sourceImage: `refs/${entry.image}`,
    license: "Meshy paid-tier output — full commercial ownership; record kept per license policy",
  }, null, 2));
  for (const [view, url] of Object.entries(task.thumbnail_urls ?? { front: task.thumbnail_url })) {
    if (!url) continue;
    writeFileSync(path.join(INBOX, "thumbs", `${assetName}-${view}.png`),
      Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  console.log(`saved glb/${assetName}.glb + meta + thumbs (${task.consumed_credits}cr)`);
  try {
    const out = execFileSync("node", [path.join(ROOT, "tools/fetch-models.mjs"), "--inspect",
      path.join(INBOX, "glb", `${assetName}.glb`)], { encoding: "utf8" });
    console.log(out.split("\n").slice(0, 8).join("\n"));
  } catch (e) { console.error("inspect failed:", e.message); }
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const jobs = manifest.assets.filter((a) => !only || a.name === only);
if (jobs.length === 0) {
  console.error(only ? `No asset named "${only}" in manifest` : "Manifest has no assets");
  process.exit(1);
}

// Per-asset Meshy settings derived from manifest "kind".
function settings(a) {
  const character = a.kind === "character";
  return {
    model_type: "smart-topology",
    ai_model: "meshy-t2",
    target_polycount: a.polycount ?? (character ? 4000 : 1500),
    should_texture: true,
    enable_pbr: false, // flat-shaded style: base color only
    texture_resolution: "2k", // downscaled to 1k in our pipeline
    texture_prompt: a.texturePrompt,
    pose_mode: character ? "t-pose" : "",
    target_formats: ["glb"],
    auto_size: true, // AI-estimated real-world height
    origin_at: "bottom",
    multi_view_thumbnails: true,
  };
}

// Rough published pricing: image-to-3d textured ≈ 30 credits, texture guide +10.
const estCredits = (a) => 30 + (a.texturePrompt ? 10 : 0);

console.log(`\n=== Meshy generation plan (${CONFIRM ? "LIVE — credits will be spent" : "DRY RUN"}) ===\n`);
let total = 0;
for (const a of jobs) {
  const img = path.join(INBOX, "refs", a.image);
  const ok = existsSync(img);
  total += estCredits(a);
  console.log(
    `${ok ? "✓" : "✗ MISSING IMAGE"}  ${a.name}  [${a.kind}]  poly=${a.polycount ?? "auto"}  ~${estCredits(a)}cr  ${a.image}`,
  );
  if (!ok && CONFIRM) {
    console.error("Aborting: missing reference image while --confirm is set.");
    process.exit(1);
  }
}
console.log(`\nTotal estimate: ~${total} credits across ${jobs.length} asset(s).`);
if (!CONFIRM) {
  console.log("Dry run only. Re-run with --confirm to spend credits.\n");
  process.exit(0);
}

mkdirSync(path.join(INBOX, "glb"), { recursive: true });
mkdirSync(path.join(INBOX, "meta"), { recursive: true });
mkdirSync(path.join(INBOX, "thumbs"), { recursive: true });

for (const a of jobs) {
  console.log(`\n--- ${a.name} ---`);
  const imgPath = path.join(INBOX, "refs", a.image);
  const b64 = readFileSync(imgPath).toString("base64");
  const mime = a.image.endsWith(".png") ? "image/png" : "image/jpeg";
  const { result: id } = await api("POST", API, {
    image_url: `data:${mime};base64,${b64}`,
    ...settings(a),
  });
  console.log(`task ${id} created`);

  let task;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    task = await api("GET", `${API}/${id}`);
    if (i % 3 === 0) console.log(`  ${task.status} ${task.progress}%`);
    if (task.status === "SUCCEEDED" || task.status === "FAILED" || task.status === "CANCELED") break;
  }
  if (task.status !== "SUCCEEDED") {
    console.error(`  FAILED: ${task.task_error?.message || task.status}`);
    continue;
  }
  console.log(`  SUCCEEDED, ${task.consumed_credits} credits`);

  const glbPath = path.join(INBOX, "glb", `${a.name}.glb`);
  writeFileSync(glbPath, Buffer.from(await (await fetch(task.model_urls.glb)).arrayBuffer()));
  writeFileSync(
    path.join(INBOX, "meta", `${a.name}.json`),
    JSON.stringify(
      {
        name: a.name,
        kind: a.kind,
        taskId: id,
        consumedCredits: task.consumed_credits,
        createdAt: new Date(task.created_at).toISOString(),
        finishedAt: new Date(task.finished_at).toISOString(),
        sourceImage: `refs/${a.image}`,
        settings: settings(a),
        license: "Meshy paid-tier output — full commercial ownership; record kept per license policy",
      },
      null,
      2,
    ),
  );
  for (const [view, url] of Object.entries(task.thumbnail_urls ?? { front: task.thumbnail_url })) {
    if (!url) continue;
    writeFileSync(
      path.join(INBOX, "thumbs", `${a.name}-${view}.png`),
      Buffer.from(await (await fetch(url)).arrayBuffer()),
    );
  }
  console.log(`  saved glb/${a.name}.glb + meta + thumbnails`);

  try {
    const out = execFileSync("node", [path.join(ROOT, "tools/fetch-models.mjs"), "--inspect", glbPath], {
      encoding: "utf8",
    });
    console.log(out.split("\n").slice(0, 8).join("\n"));
  } catch (e) {
    console.error("  inspect failed:", e.message);
  }
}
console.log("\nDone. Review thumbs/, then tell the orchestrator which assets pass.\n");
