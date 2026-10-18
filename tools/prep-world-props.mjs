#!/usr/bin/env node
/**
 * Phase 8e-27 world-prop preparation.
 *
 * The Meshy inbox contains static exports rather than animation clips. This
 * tool makes the remaining drops safe to serve: unused PBR maps are removed,
 * embedded color atlases are capped at 1K, and every model receives a
 * deterministic ground pivot and real-world scale. Raw inbox files are never
 * modified.
 */

import { statSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { dedup, prune, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inbox = join(root, "client/models-inbox/glb");
const TEXTURE_SIZE = 1024;

// Static GLBs only. Character and weapon outputs use prep-characters.mjs so
// their longest axis, hand scale, and live loadout contract stay correct.
const PROPS = [
  { id: "caique-boat", output: "models/ships/meshy/caique-boat.glb", height: 2.4, yaw: Math.PI / 2 },
  { id: "campaign-tent", output: "models/props/meshy/campaign-tent.glb", height: 4.2, yaw: 0 },
  // This owner-generated hound is an unusually dense export (~1.8M indices).
  // Keep the silhouette, but cap it at roughly 10% of the source triangles.
  { id: "dechos-hunde-easteregg", output: "models/props/meshy/dechos-hunde-easteregg.glb", height: 1.7, yaw: 0, simplifyRatio: 0.1 },
  { id: "dome-church", output: "models/props/meshy/dome-church.glb", height: 13, yaw: 0 },
  { id: "field-banner", output: "models/props/meshy/field-banner.glb", height: 4.5, yaw: 0 },
  { id: "great-basilica", output: "models/props/meshy/great-basilica.glb", height: 19, yaw: 0 },
  { id: "minaret", output: "models/props/meshy/minaret.glb", height: 18, yaw: 0 },
  { id: "sahi-bombard", output: "models/artillery/sahi-bombard.glb", height: 4.2, yaw: -Math.PI / 2 },
  { id: "siege-ladder", output: "models/props/meshy/siege-ladder.glb", height: 6.2, yaw: 0 },
  { id: "siege-mantlet", output: "models/props/meshy/siege-mantlet.glb", height: 3.6, yaw: 0 },
  { id: "supply-cart", output: "models/props/meshy/supply-cart.glb", height: 3.0, yaw: 0 },
  { id: "timber-house", output: "models/props/meshy/timber-house.glb", height: 9.5, yaw: 0 },
  { id: "war-horse", output: "models/props/meshy/war-horse.glb", height: 1.8, yaw: 0 },
  { id: "war-horse-alternative", output: "models/props/meshy/war-horse-alternative.glb", height: 1.8, yaw: 0 },
];

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

function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function staticBounds(doc) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const walk = (node, parent) => {
    const local = composeTRS(node.getTranslation(), node.getRotation(), node.getScale());
    const world = parent === null ? local : multiplyMat4(parent, local);
    const mesh = node.getMesh();
    if (mesh !== null) {
      for (const primitive of mesh.listPrimitives()) {
        const position = primitive.getAttribute("POSITION");
        if (position === null) continue;
        const point = [0, 0, 0];
        for (let index = 0; index < position.getCount(); index += 1) {
          position.getElement(index, point);
          const transformed = transformPoint(world, point[0], point[1], point[2]);
          for (let axis = 0; axis < 3; axis += 1) {
            min[axis] = Math.min(min[axis], transformed[axis]);
            max[axis] = Math.max(max[axis], transformed[axis]);
          }
        }
      }
    }
    for (const child of node.listChildren()) walk(child, world);
  };
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  for (const child of scene.listChildren()) walk(child, null);
  return { min, max };
}

function stripPbr(doc) {
  for (const material of doc.getRoot().listMaterials()) {
    material.setNormalTexture(null);
    material.setMetallicRoughnessTexture(null);
    material.setOcclusionTexture(null);
    material.setEmissiveTexture(null);
    material.setEmissiveFactor([0, 0, 0]);
    // These baked atlases are predominantly stone, timber, cloth, leather,
    // or animal coat. The Meshy-wide metallic=1 default is invalid once its
    // MR texture is stripped and otherwise turns the props black at runtime.
    material.setMetallicFactor(0.04);
    material.setRoughnessFactor(0.84);
    material.setDoubleSided(true);
  }
}

function yawQuaternion(radians) {
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
}

async function prep(io, spec) {
  const inputPath = join(inbox, `${spec.id}.glb`);
  const beforeBytes = statSync(inputPath).size;
  const doc = await io.read(inputPath);
  stripPbr(doc);
  const bounds = staticBounds(doc);
  const width = bounds.max[0] - bounds.min[0];
  const depth = bounds.max[2] - bounds.min[2];
  const height = bounds.max[1] - bounds.min[1];
  if (!(height > 0.001) || !(Math.max(width, depth) > 0.001)) throw new Error(`${spec.id}: invalid static bounds`);
  const scale = spec.height / height;
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  for (const node of scene.listChildren()) {
    const nodeScale = node.getScale();
    node.setScale([nodeScale[0] * scale, nodeScale[1] * scale, nodeScale[2] * scale]);
    const translation = node.getTranslation();
    node.setTranslation([
      (translation[0] - centerX) * scale,
      (translation[1] - bounds.min[1]) * scale,
      (translation[2] - centerZ) * scale,
    ]);
    if (spec.yaw !== 0) node.setRotation(yawQuaternion(spec.yaw));
  }
  const transforms = [dedup()];
  if (spec.simplifyRatio !== undefined) {
    transforms.push(weld({ tolerance: 0.0001 }));
    transforms.push(simplify({ simplifier: MeshoptSimplifier, ratio: spec.simplifyRatio, error: 0.01 }));
  }
  transforms.push(
    prune(),
    textureCompress({
      encoder: sharp,
      targetFormat: doc.getRoot().listMaterials().some((material) => material.getAlphaMode() !== "OPAQUE") ? "png" : "jpeg",
      resize: [TEXTURE_SIZE, TEXTURE_SIZE],
      quality: 82,
    }),
  );
  await doc.transform(...transforms);
  const outputPath = join(root, "client/public", spec.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  await io.write(outputPath, doc);
  return { beforeBytes, afterBytes: statSync(outputPath).size, width, depth, height };
}

const io = new NodeIO();
for (const spec of PROPS) {
  const report = await prep(io, spec);
  console.log(`${spec.id}: ${(report.beforeBytes / 1024).toFixed(0)} KB → ${(report.afterBytes / 1024).toFixed(0)} KB; raw ${report.width.toFixed(3)} × ${report.height.toFixed(3)} × ${report.depth.toFixed(3)} m; target height ${spec.height} m`);
}
