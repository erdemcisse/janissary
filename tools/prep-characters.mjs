#!/usr/bin/env node
/**
 * Phase 8e-12 character/weapon prep — turns the raw Meshy drops in
 * client/models-inbox/ into the shipped rigged characters:
 *
 *   - characters: merges each `<asset>-rigged.glb` (bind base) with its
 *     single-clip GLBs into ONE rigged GLB with named clips, strips every PBR
 *     map except baseColor, downscales textures, and normalizes the rig to
 *     exactly CHARACTER_HEIGHT_METERS with the pivot at the feet. Every
 *     shipping rig receives the complete runtime contract (idle/walk/run/
 *     run-alt/aim/fire/slash/block/death): clips missing from a character's
 *     own Meshy drop are retargeted from the matching shared-skeleton source.
 *   - weapons: same strip/downscale, uniform scale to a real-world length.
 *
 * Emits to client/public/models/characters/meshy/ and prints the manifest +
 * credits snippets to paste (plus the size/clip report for the ADR). The tool
 * is re-runnable; originals in models-inbox/ are never modified.
 *
 * Rig facts (measured with probe-rig.mjs, 2026-08-06): every character shares
 * one Mixamo-style skeleton (Hips/Spine02/…/RightHand, 24 joints) under an
 * `Armature` node scaled 0.01 (cm rig); clip GLBs carry the same node names,
 * so channels retarget by name. The base rigged GLB's own `clip0` animation is
 * a ~0.03 s bind stub and is dropped.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { copyToDocument, dedup, prune, resample, textureCompress, unpartition } from "@gltf-transform/functions";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inbox = join(root, "client/models-inbox");
const outDir = join(root, "client/public/models/characters/meshy");

const CHARACTER_HEIGHT_METERS = 1.8;
const CHARACTER_TEXTURE_SIZE = 1024;
const WEAPON_TEXTURE_SIZE = 512; // hand props read small on screen; resident-memory budget

const BASE_CLIPS = ["idle", "walk", "run", "run-alt", "death"];
const COMPLETE_CLIPS = [...BASE_CLIPS, "aim", "fire", "slash", "block"];

const CHARACTERS = [
  { id: "janissary-musketeer", yawDegrees: 0 },
  { id: "janissary-swordsman", yawDegrees: 0 },
  { id: "ottoman-azap", yawDegrees: 0 },
  { id: "ottoman-gunner", yawDegrees: 0 },
  { id: "byzantine-guardsman", yawDegrees: 0 },
  { id: "byzantine-crossbowman", yawDegrees: 0 },
];

/**
 * Meshy exported the six characters against the same named 24-joint skeleton,
 * but only the swordsman owns melee clips and only the other five own ranged
 * clips. Runtime loadouts do not have that split: every class carries both a
 * blade and a ranged primary. Retarget the two missing families by name so a
 * model never silently drops an animation when its weapon slot changes.
 */
function clipSource(characterId, clipName) {
  if (clipName === "slash" || clipName === "block") return "janissary-swordsman";
  if ((clipName === "aim" || clipName === "fire") && characterId === "janissary-swordsman") return "janissary-musketeer";
  return characterId;
}

// Scale = longest authored axis → target metres. Orientation is NOT baked:
// grip alignment lives in the client's attach constants (screenshot-tuned).
const WEAPONS = [
  { id: "matchlock-arquebus", lengthMeters: 1.35 },
  { id: "matchlock-arquebus-alternative", lengthMeters: 1.35 },
  { id: "kilij-sword", lengthMeters: 0.95 },
  { id: "kilij-sword-alternative", lengthMeters: 0.95 },
  { id: "yatagan", lengthMeters: 0.72 }, // 8e-18: was 0.6 (dagger-sized); a real yatagan is 0.7–0.8 m
  { id: "heavy-crossbow", lengthMeters: 0.85 },
  { id: "war-mace", lengthMeters: 0.7 },
];

// --- minimal column-major mat4 helpers (glTF/three layout) -----------------

function composeTRS(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

function multiplyMat4(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let k = 0; k < 4; k += 1) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    }
  }
  return out;
}

function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** node → world matrix map, walking the default scene from its roots. */
function worldMatrices(doc) {
  const map = new Map();
  const walk = (node, parent) => {
    const local = composeTRS(node.getTranslation(), node.getRotation(), node.getScale());
    const world = parent === null ? local : multiplyMat4(parent, local);
    map.set(node, world);
    for (const child of node.listChildren()) walk(child, world);
  };
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  for (const child of scene.listChildren()) walk(child, null);
  return map;
}

/**
 * Rest-pose bounds of the SKINNED result: p_world = Σ wk·(jointWorld·IBM)k·p.
 * The skinned mesh node's own transform is ignored per the glTF spec, so
 * getBounds() (which would apply the 0.01-armature mesh node only) reads the
 * rig ~100× too small — this measures what three.js will actually draw.
 */
function skinnedBounds(doc) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const worlds = worldMatrices(doc);
  for (const skin of doc.getRoot().listSkins()) {
    const joints = skin.listJoints();
    const ibms = skin.getInverseBindMatrices().getArray();
    const bindMats = joints.map((joint, index) => {
      const world = worlds.get(joint);
      if (world === undefined) throw new Error(`joint ${joint.getName()} is not in the default scene`);
      const ibm = ibms.slice(index * 16, index * 16 + 16);
      return multiplyMat4(world, ibm);
    });
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute("POSITION");
        const jointAttr = prim.getAttribute("JOINTS_0");
        const weightAttr = prim.getAttribute("WEIGHTS_0");
        if (pos === null || jointAttr === null || weightAttr === null) continue;
        const count = pos.getCount();
        const p = [0, 0, 0];
        const j = [0, 0, 0, 0];
        const w = [0, 0, 0, 0];
        for (let v = 0; v < count; v += 1) {
          pos.getElement(v, p);
          jointAttr.getElement(v, j);
          weightAttr.getElement(v, w);
          let x = 0, y = 0, z = 0;
          for (let k = 0; k < 4; k += 1) {
            if (w[k] === 0) continue;
            const tp = transformPoint(bindMats[j[k]], p[0], p[1], p[2]);
            x += tp[0] * w[k]; y += tp[1] * w[k]; z += tp[2] * w[k];
          }
          if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
          if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
          if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
        }
      }
    }
  }
  return { min, max };
}

/** Static scene bounds from POSITION accessors transformed by node worlds. */
function staticBounds(doc) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const worlds = worldMatrices(doc);
  for (const [node, world] of worlds) {
    const mesh = node.getMesh();
    if (mesh === null) continue;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (pos === null) continue;
      const p = [0, 0, 0];
      for (let v = 0; v < pos.getCount(); v += 1) {
        pos.getElement(v, p);
        const tp = transformPoint(world, p[0], p[1], p[2]);
        for (let axis = 0; axis < 3; axis += 1) {
          if (tp[axis] < min[axis]) min[axis] = tp[axis];
          if (tp[axis] > max[axis]) max[axis] = tp[axis];
        }
      }
    }
  }
  return { min, max };
}

/** Drops every texture/factor except baseColor (Meshy ships emissive + spec/ior). */
function stripPbr(doc) {
  for (const material of doc.getRoot().listMaterials()) {
    material.setNormalTexture(null);
    material.setMetallicRoughnessTexture(null);
    material.setOcclusionTexture(null);
    material.setEmissiveTexture(null);
    material.setEmissiveFactor([0, 0, 0]);
    // One atlas mixes cloth, skin, leather, wood, and small metal details.
    // The source-wide metallic=1 default becomes physically invalid after the
    // MR texture is removed and blackens every soldier and carried weapon.
    material.setMetallicFactor(0.06);
    material.setRoughnessFactor(0.76);
    material.setDoubleSided(false);
  }
}

function animationDuration(anim) {
  let duration = 0;
  for (const sampler of anim.listSamplers()) {
    const input = sampler.getInput();
    if (input === null) continue;
    const max = input.getMax([]);
    if (max.length > 0 && max[0] > duration) duration = max[0];
  }
  return duration;
}

async function prepCharacter(io, def) {
  const basePath = join(inbox, "anims", `${def.id}-rigged.glb`);
  const beforeBytes = statSync(basePath).size;
  let clipBytes = 0;
  const doc = await io.read(basePath);

  // The base rigged GLB carries only a bind stub — drop every animation it
  // ships; the named clips below replace it.
  for (const anim of doc.getRoot().listAnimations()) anim.dispose();

  // Merge each single-clip GLB's longest animation, retargeted onto the base
  // rig by node name (the rigs are identical across this drop).
  const baseNodeByName = new Map();
  for (const node of doc.getRoot().listNodes()) baseNodeByName.set(node.getName(), node);
  const clipReport = [];
  for (const clipName of COMPLETE_CLIPS) {
    const sourceId = clipSource(def.id, clipName);
    const clipPath = join(inbox, "anims", `${sourceId}-${clipName}.glb`);
    clipBytes += statSync(clipPath).size;
    const clipDoc = await io.read(clipPath);
    let picked = null;
    for (const anim of clipDoc.getRoot().listAnimations()) {
      if (picked === null || animationDuration(anim) > animationDuration(picked)) picked = anim;
    }
    if (picked === null) throw new Error(`${sourceId}-${clipName}.glb has no animations`);
    const duration = animationDuration(picked);
    const map = copyToDocument(doc, clipDoc, [picked]);
    const copied = map.get(picked);
    const copiedNodes = [];
    for (const value of map.values()) if (value.propertyType === "Node") copiedNodes.push(value);
    let retargeted = 0;
    for (const channel of copied.listChannels()) {
      const targetName = channel.getTargetNode()?.getName();
      const baseNode = targetName === undefined ? undefined : baseNodeByName.get(targetName);
      if (baseNode === undefined) throw new Error(`${def.id}/${clipName}: no base node named "${targetName}"`);
      channel.setTargetNode(baseNode);
      retargeted += 1;
    }
    for (const node of copiedNodes) node.dispose();
    copied.setName(clipName);
    const sourceNote = sourceId === def.id ? "" : ` ← ${sourceId}`;
    clipReport.push(`${clipName} ${duration.toFixed(2)}s (${retargeted}ch)${sourceNote}`);
  }

  // 8e-16: strip root motion. Several Meshy clips (run-alt worst: 5.4 m per
  // loop; death ~1 m backward; slash ~0.8 m lunge) carry the character's
  // travel inside the Hips translation track. The game moves the ROOT at the
  // entity transform, so a baked slide reads as the mesh gliding metres away
  // from its nameplate and snapping back every loop (and, sliding toward a
  // camera, as a "giant"). Subtract the first→last XZ drift as a linear ramp,
  // keeping Y (crouch/fall) and the in-place sway. Clips that already loop in
  // place (< 1 cm drift) are untouched.
  for (const anim of doc.getRoot().listAnimations()) {
    for (const channel of anim.listChannels()) {
      if (channel.getTargetPath() !== "translation") continue;
      if (channel.getTargetNode()?.getName() !== "Hips") continue;
      const sampler = channel.getSampler();
      if (sampler === null) continue;
      const input = sampler.getInput()?.getArray();
      const output = sampler.getOutput();
      const arr = output?.getArray();
      if (input === undefined || output === null || arr === undefined) continue;
      const keyCount = input.length;
      if (keyCount < 2) continue;
      const last = (keyCount - 1) * 3;
      const driftX = arr[last] - arr[0];
      const driftZ = arr[last + 2] - arr[2];
      const drift = Math.hypot(driftX, driftZ);
      if (drift < 1) continue; // cm rig: < 1 cm end-to-end = loops in place
      const t0 = input[0];
      const span = input[keyCount - 1] - t0 || 1;
      const fixed = Float32Array.from(arr);
      for (let k = 0; k < keyCount; k += 1) {
        const f = (input[k] - t0) / span;
        fixed[k * 3] -= driftX * f;
        fixed[k * 3 + 2] -= driftZ * f;
      }
      output.setArray(fixed);
      clipReport.push(`${anim.getName()} root-motion ${(drift / 100).toFixed(2)} m stripped`);
    }
  }

  stripPbr(doc);

  // Normalize: exact height, pivot at the feet. The Armature node parents both
  // the skeleton and the skinned mesh node, so scaling/translating it carries
  // the whole rig; bone-local animation channels stay valid.
  const bounds = skinnedBounds(doc);
  const height = bounds.max[1] - bounds.min[1];
  if (!(height > 0.01)) throw new Error(`${def.id}: implausible skinned height ${height}`);
  const scale = CHARACTER_HEIGHT_METERS / height;
  for (const scene of doc.getRoot().listScenes()) {
    for (const node of scene.listChildren()) {
      if (node.getName() !== "Armature") continue;
      const s = node.getScale();
      node.setScale([s[0] * scale, s[1] * scale, s[2] * scale]);
      // Feet to y=0 only — the authored XZ origin already sits between the
      // feet (zeroing minX would shift a T-pose sideways by a hand-span).
      const t = node.getTranslation();
      node.setTranslation([t[0], t[1] - bounds.min[1] * scale, t[2]]);
      if (def.yawDegrees !== 0) {
        const radians = (def.yawDegrees * Math.PI) / 180;
        node.setRotation([0, Math.sin(radians / 2), 0, Math.cos(radians / 2)]);
      }
    }
  }

  await doc.transform(
    resample(),
    dedup(),
    prune(),
    textureCompress({
      encoder: sharp,
      targetFormat: doc.getRoot().listMaterials().some((m) => m.getAlphaMode() !== "OPAQUE") ? "png" : "jpeg",
      resize: [CHARACTER_TEXTURE_SIZE, CHARACTER_TEXTURE_SIZE],
      quality: 85,
    }),
    unpartition(), // clip merges drag each source doc's buffer along; GLB wants one
  );

  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${def.id}.glb`);
  await io.write(outPath, doc);
  const afterBytes = statSync(outPath).size;
  return { beforeBytes: beforeBytes + clipBytes, afterBytes, height: height.toFixed(3), clipReport };
}

async function prepWeapon(io, def) {
  const inPath = join(inbox, "glb", `${def.id}.glb`);
  const beforeBytes = statSync(inPath).size;
  const doc = await io.read(inPath);
  stripPbr(doc);
  const bounds = staticBounds(doc);
  const longest = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
  if (!(longest > 0.001)) throw new Error(`${def.id}: implausible extent ${longest}`);
  const scale = def.lengthMeters / longest;
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  for (const node of scene.listChildren()) {
    const s = node.getScale();
    node.setScale([s[0] * scale, s[1] * scale, s[2] * scale]);
  }
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({
      encoder: sharp,
      targetFormat: doc.getRoot().listMaterials().some((m) => m.getAlphaMode() !== "OPAQUE") ? "png" : "jpeg",
      resize: [WEAPON_TEXTURE_SIZE, WEAPON_TEXTURE_SIZE],
      quality: 85,
    }),
  );
  const dir = join(outDir, "weapons");
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, `${def.id}.glb`);
  await io.write(outPath, doc);
  const afterBytes = statSync(outPath).size;
  return { beforeBytes, afterBytes, longest: longest.toFixed(3) };
}

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : undefined;
const io = new NodeIO();
const fmt = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

console.log("characters:");
for (const def of CHARACTERS) {
  if (only !== undefined && def.id !== only) continue;
  const report = await prepCharacter(io, def);
  console.log(`  ${def.id}: ${fmt(report.beforeBytes)} → ${fmt(report.afterBytes)} (rest height ${report.height} m)`);
  console.log(`    ${report.clipReport.join(", ")}`);
}
console.log("weapons:");
for (const def of WEAPONS) {
  if (only !== undefined && def.id !== only) continue;
  const report = await prepWeapon(io, def);
  console.log(`  ${def.id}: ${fmt(report.beforeBytes)} → ${fmt(report.afterBytes)} (authored extent ${report.longest} m → ${def.lengthMeters} m)`);
}

// ADR/check-assets snippets (pasted by hand — the tool never edits sources).
console.log(`
manifest snippet (client/src/game/models/manifest.ts):
  export const CHARACTER_MODELS = {
${CHARACTERS.map((c) => `    ${c.id.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())}: "models/characters/meshy/${c.id}.glb",`).join("\n")}
  } as const;
  export const CHARACTER_WEAPON_MODELS = {
${WEAPONS.map((w) => `    ${w.id.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())}: "models/characters/meshy/weapons/${w.id}.glb",`).join("\n")}
  } as const;

credits row (CREDITS.md):
  | \`models/characters/meshy/\` | https://meshy.ai (text/image-to-3D + text-to-animation, project-generated) | Meshy AI | Meshy commercial (owned) | Rigged faction soldiers (6 characters, merged clip sets) + hand weapons (arquebus/kilij/yatagan/crossbow/mace), Phase 8e-12 |
`);
