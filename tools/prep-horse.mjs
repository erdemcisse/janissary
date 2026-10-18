#!/usr/bin/env node
/**
 * Prepare the owner-generated Meshy war-horse rig for the runtime horse pool.
 *
 * Input:
 *   client/models-inbox/anims/war-horse-rigged.glb
 *   client/models-inbox/anims/war-horse-walk.glb
 * Output:
 *   client/public/models/characters/meshy/war-horse-animated.glb
 *
 * The bind stub becomes a still `idle` clip, the authored walk is retargeted
 * by node name, root drift is removed, PBR is reduced to the readable/base
 * colour contract, the atlas is capped at 1K, and the horse is normalized to
 * a 2.4 m footprint with its hooves at y=0. Raw inbox files are never edited.
 */

import { mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { copyToDocument, dedup, prune, resample, textureCompress, unpartition } from "@gltf-transform/functions";
import sharp from "sharp";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const inboxDir = join(rootDir, "client/models-inbox/anims");
const outputDir = join(rootDir, "client/public/models/characters/meshy");
const basePath = join(inboxDir, "war-horse-rigged.glb");
const walkPath = join(inboxDir, "war-horse-walk.glb");
const outputPath = join(outputDir, "war-horse-animated.glb");
const HORSE_FOOTPRINT_METERS = 2.4;
const HORSE_TEXTURE_SIZE = 1024;

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
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let k = 0; k < 4; k += 1) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return out;
}

function transformPoint(matrix, x, y, z) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

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

/** Exact bind-pose bounds for the skinned result (joint world × inverse bind). */
function skinnedBounds(doc) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const worlds = worldMatrices(doc);
  for (const skin of doc.getRoot().listSkins()) {
    const joints = skin.listJoints();
    const inverseBind = skin.getInverseBindMatrices()?.getArray();
    if (inverseBind === undefined) throw new Error("war horse: skin has no inverse bind matrices");
    const bindMatrices = joints.map((joint, index) => {
      const world = worlds.get(joint);
      if (world === undefined) throw new Error(`war horse: joint ${joint.getName()} is outside the default scene`);
      return multiplyMat4(world, inverseBind.slice(index * 16, index * 16 + 16));
    });
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const positions = primitive.getAttribute("POSITION");
        const jointIndices = primitive.getAttribute("JOINTS_0");
        const weights = primitive.getAttribute("WEIGHTS_0");
        if (positions === null || jointIndices === null || weights === null) continue;
        const position = [0, 0, 0];
        const indices = [0, 0, 0, 0];
        const influences = [0, 0, 0, 0];
        for (let vertex = 0; vertex < positions.getCount(); vertex += 1) {
          positions.getElement(vertex, position);
          jointIndices.getElement(vertex, indices);
          weights.getElement(vertex, influences);
          let x = 0, y = 0, z = 0;
          for (let influence = 0; influence < 4; influence += 1) {
            const weight = influences[influence];
            if (weight === 0) continue;
            const point = transformPoint(bindMatrices[indices[influence]], position[0], position[1], position[2]);
            x += point[0] * weight;
            y += point[1] * weight;
            z += point[2] * weight;
          }
          min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
          max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
        }
      }
    }
  }
  return { min, max };
}

function duration(animation) {
  let seconds = 0;
  for (const sampler of animation.listSamplers()) {
    const input = sampler.getInput();
    if (input === null) continue;
    seconds = Math.max(seconds, input.getMax([])[0] ?? 0);
  }
  return seconds;
}

function stripPbr(doc) {
  for (const material of doc.getRoot().listMaterials()) {
    material.setNormalTexture(null);
    material.setMetallicRoughnessTexture(null);
    material.setOcclusionTexture(null);
    material.setEmissiveTexture(null);
    material.setEmissiveFactor([0, 0, 0]);
    material.setMetallicFactor(0.04);
    material.setRoughnessFactor(0.82);
    material.setDoubleSided(false);
  }
}

const io = new NodeIO();
const doc = await io.read(basePath);
const baseAnimations = doc.getRoot().listAnimations();
let idle = null;
for (const animation of baseAnimations) if (idle === null || duration(animation) > duration(idle)) idle = animation;
if (idle === null) throw new Error("war-horse-rigged.glb has no bind animation");
for (const animation of baseAnimations) if (animation !== idle) animation.dispose();
idle.setName("idle");

const baseNodeByName = new Map(doc.getRoot().listNodes().map((node) => [node.getName(), node]));
const walkDoc = await io.read(walkPath);
let sourceWalk = null;
for (const animation of walkDoc.getRoot().listAnimations()) {
  if (sourceWalk === null || duration(animation) > duration(sourceWalk)) sourceWalk = animation;
}
if (sourceWalk === null) throw new Error("war-horse-walk.glb has no animation");
const copiedMap = copyToDocument(doc, walkDoc, [sourceWalk]);
const copiedWalk = copiedMap.get(sourceWalk);
const copiedNodes = [];
for (const value of copiedMap.values()) if (value.propertyType === "Node") copiedNodes.push(value);
for (const channel of copiedWalk.listChannels()) {
  const targetName = channel.getTargetNode()?.getName();
  const target = targetName === undefined ? undefined : baseNodeByName.get(targetName);
  if (target === undefined) throw new Error(`war horse walk: base rig has no node named "${targetName}"`);
  channel.setTargetNode(target);
}
for (const node of copiedNodes) node.dispose();
copiedWalk.setName("walk");

// Remove first→last translation drift while keeping stride/bob motion around it.
for (const animation of doc.getRoot().listAnimations()) {
  for (const channel of animation.listChannels()) {
    if (channel.getTargetPath() !== "translation" || channel.getTargetNode()?.getName() !== "Hips") continue;
    const sampler = channel.getSampler();
    const input = sampler?.getInput()?.getArray();
    const output = sampler?.getOutput();
    const values = output?.getArray();
    if (input === undefined || output === null || output === undefined || values === undefined || input.length < 2) continue;
    const last = (input.length - 1) * 3;
    const drift = [values[last] - values[0], values[last + 1] - values[1], values[last + 2] - values[2]];
    if (Math.hypot(...drift) < 1e-5) continue;
    const fixed = Float32Array.from(values);
    const start = input[0];
    const span = input[input.length - 1] - start || 1;
    for (let key = 0; key < input.length; key += 1) {
      const fraction = (input[key] - start) / span;
      fixed[key * 3] -= drift[0] * fraction;
      fixed[key * 3 + 1] -= drift[1] * fraction;
      fixed[key * 3 + 2] -= drift[2] * fraction;
    }
    output.setArray(fixed);
  }
}

stripPbr(doc);
const before = skinnedBounds(doc);
const authoredFootprint = Math.max(before.max[0] - before.min[0], before.max[2] - before.min[2]);
if (!(authoredFootprint > 0.001)) throw new Error(`war horse: implausible footprint ${authoredFootprint}`);
const scale = HORSE_FOOTPRINT_METERS / authoredFootprint;
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
for (const node of scene.listChildren()) {
  const nodeScale = node.getScale();
  node.setScale([nodeScale[0] * scale, nodeScale[1] * scale, nodeScale[2] * scale]);
  const translation = node.getTranslation();
  node.setTranslation([translation[0], translation[1] - before.min[1] * scale, translation[2]]);
}

await doc.transform(
  resample(),
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [HORSE_TEXTURE_SIZE, HORSE_TEXTURE_SIZE], quality: 85 }),
  unpartition(),
);

mkdirSync(outputDir, { recursive: true });
await io.write(outputPath, doc);
const after = skinnedBounds(doc);
const outputFootprint = Math.max(after.max[0] - after.min[0], after.max[2] - after.min[2]);
const bytesIn = statSync(basePath).size + statSync(walkPath).size;
const bytesOut = statSync(outputPath).size;
console.log(`war horse: ${(bytesIn / 1024 / 1024).toFixed(2)} MiB → ${(bytesOut / 1024).toFixed(0)} KiB`);
console.log(`  clips: idle ${duration(idle).toFixed(2)} s, walk ${duration(copiedWalk).toFixed(2)} s`);
console.log(`  footprint: ${authoredFootprint.toFixed(3)} m → ${outputFootprint.toFixed(3)} m; hoof pivot y=${after.min[1].toFixed(4)}`);
