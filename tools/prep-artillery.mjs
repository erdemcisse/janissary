#!/usr/bin/env node
/**
 * Phase 8e-26 prop preparation — turns selected Meshy prop drops into small,
 * static GLBs that are safe to ship in the browser build.
 *
 * Raw Meshy exports remain in client/models-inbox/. This tool strips the
 * unused PBR maps, resizes the embedded base-color atlas to 1k, normalizes
 * the ground pivot/footprint, and writes only the props with a runtime
 * placement contract to client/public/models/.
 */

import { statSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { dedup, prune, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inbox = join(root, "client/models-inbox/glb");

const PROPS = [
  // The raw culverin is authored along -X. -90° Y maps that barrel onto the
  // engine's local -Z forward convention used by artillery yaw.
  { id: "field-culverin", output: "models/artillery/field-culverin.glb", footprint: 2.5, yaw: -Math.PI / 2 },
  // The wall gun is authored along local Z and needs no corrective yaw.
  { id: "wall-gun", output: "models/artillery/wall-gun.glb", footprint: 2.8, yaw: 0 },
  // A small project-owned rock variant adds visual variety to the existing
  // instanced terrain stairs without creating a new collider layer.
  { id: "limestone-boulders", output: "models/scatter/meshy/limestone-boulders.glb", footprint: 2, yaw: 0 },
];

const TEXTURE_SIZE = 1024;

function composeYaw(radians) {
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
}

function composeTRS(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz - wx) * sy, 0,
    (xz + wy) * sz, (yz + wx) * sz, (1 - (xx + yy)) * sz, 0,
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
  const worlds = new Map();
  const walk = (node, parent) => {
    const local = composeTRS(node.getTranslation(), node.getRotation(), node.getScale());
    const world = parent === null ? local : multiplyMat4(parent, local);
    worlds.set(node, world);
    for (const child of node.listChildren()) walk(child, world);
  };
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  for (const child of scene.listChildren()) walk(child, null);
  for (const [node, world] of worlds) {
    const mesh = node.getMesh();
    if (mesh === null) continue;
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
  return { min, max };
}

function stripPbr(doc) {
  for (const material of doc.getRoot().listMaterials()) {
    material.setNormalTexture(null);
    material.setMetallicRoughnessTexture(null);
    material.setOcclusionTexture(null);
    material.setEmissiveTexture(null);
    material.setEmissiveFactor([0, 0, 0]);
    // Meshy exports these mixed wood/bronze/iron atlases at metallic=1 and
    // roughness=1. Once the MR texture is stripped, retaining those factors
    // removes diffuse response and makes the whole gun nearly black without
    // an environment map. A low mixed-material metal factor keeps the baked
    // atlas readable while direct light still catches the barrel.
    material.setMetallicFactor(0.12);
    material.setRoughnessFactor(0.74);
    material.setDoubleSided(true);
  }
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
  const scale = spec.footprint / Math.max(width, depth, 0.001);
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
    if (spec.yaw !== 0) node.setRotation(composeYaw(spec.yaw));
  }
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({
      encoder: sharp,
      targetFormat: doc.getRoot().listMaterials().some((material) => material.getAlphaMode() !== "OPAQUE") ? "png" : "jpeg",
      resize: [TEXTURE_SIZE, TEXTURE_SIZE],
      quality: 82,
    }),
  );
  const outputPath = join(root, "client/public", spec.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  await io.write(outputPath, doc);
  return { beforeBytes, afterBytes: statSync(outputPath).size, width, depth, height };
}

const io = new NodeIO();
for (const spec of PROPS) {
  const report = await prep(io, spec);
  console.log(`${spec.id}: ${(report.beforeBytes / 1024).toFixed(0)} KB → ${(report.afterBytes / 1024).toFixed(0)} KB; raw ${report.width.toFixed(3)} × ${report.height.toFixed(3)} × ${report.depth.toFixed(3)} m; yaw ${spec.yaw.toFixed(3)} rad`);
}
