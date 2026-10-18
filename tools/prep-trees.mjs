#!/usr/bin/env node
/**
 * Phase 8e-17 tree prep — turns the raw Meshy tree drops in
 * client/models-inbox/glb/ into shipped scatter models:
 *
 *   - strips every PBR map except baseColor (Meshy ships normal/MR/occlusion),
 *   - downscales textures to 1024²,
 *   - normalizes each tree to an exact real-world height with the pivot at
 *     the ground (XZ centered, trunk base at y=0),
 *   - emits to client/public/models/scatter/meshy/<id>.glb.
 *
 * The trees are static (no skins/animations). The tool is re-runnable;
 * originals in models-inbox/ are never modified. It prints the size report
 * for the ADR plus the natural XZ footprints to pin in scatter.ts (the
 * prepped models are already real-scale, so the scatter groundFit footprint
 * is pinned to the natural size and stays a no-op).
 */

import { statSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { dedup, prune, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inbox = join(root, "client/models-inbox/glb");
const outDir = join(root, "client/public/models/scatter/meshy");

const TEXTURE_SIZE = 1024;

/** id → exact real-world height in metres (cypress tall/thin, oak broad, olive low). */
const TREES = [
  { id: "cypress-tree", heightMeters: 10 },
  { id: "field-oak", heightMeters: 8 },
  { id: "olive-tree", heightMeters: 5 },
];

// --- minimal column-major mat4 helpers (same discipline as prep-characters) -

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

/** Drops every texture/factor except baseColor (Meshy ships normal/MR/occlusion). */
function stripPbr(doc) {
  for (const material of doc.getRoot().listMaterials()) {
    material.setNormalTexture(null);
    material.setMetallicRoughnessTexture(null);
    material.setOcclusionTexture(null);
    material.setEmissiveTexture(null);
    material.setEmissiveFactor([0, 0, 0]);
    material.setMetallicFactor(0);
    material.setRoughnessFactor(0.92);
    // Foliage reads from both sides once the backface-culled normals go.
    material.setDoubleSided(true);
  }
}

async function prepTree(io, def) {
  const inPath = join(inbox, `${def.id}.glb`);
  const beforeBytes = statSync(inPath).size;
  const doc = await io.read(inPath);
  stripPbr(doc);

  // Normalize: exact height, XZ centered, trunk base at y=0 — applied to the
  // scene roots (each drop is a single node, but stay general).
  const bounds = staticBounds(doc);
  const height = bounds.max[1] - bounds.min[1];
  if (!(height > 0.001)) throw new Error(`${def.id}: implausible height ${height}`);
  const scale = def.heightMeters / height;
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  for (const node of scene.listChildren()) {
    const s = node.getScale();
    node.setScale([s[0] * scale, s[1] * scale, s[2] * scale]);
    const t = node.getTranslation();
    node.setTranslation([
      (t[0] - centerX) * scale,
      (t[1] - bounds.min[1]) * scale,
      (t[2] - centerZ) * scale,
    ]);
  }

  await doc.transform(
    dedup(),
    prune(),
    textureCompress({
      encoder: sharp,
      targetFormat: doc.getRoot().listMaterials().some((m) => m.getAlphaMode() !== "OPAQUE") ? "png" : "jpeg",
      resize: [TEXTURE_SIZE, TEXTURE_SIZE],
      quality: 85,
    }),
  );

  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${def.id}.glb`);
  await io.write(outPath, doc);
  const afterBytes = statSync(outPath).size;
  const footprintX = (bounds.max[0] - bounds.min[0]) * scale;
  const footprintZ = (bounds.max[2] - bounds.min[2]) * scale;
  return { beforeBytes, afterBytes, height: height.toFixed(3), footprintX, footprintZ };
}

const io = new NodeIO();
const fmt = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

console.log("trees:");
for (const def of TREES) {
  const report = await prepTree(io, def);
  console.log(`  ${def.id}: ${fmt(report.beforeBytes)} → ${fmt(report.afterBytes)} (authored height ${report.height} m → ${def.heightMeters} m)`);
  console.log(`    natural XZ footprint ${report.footprintX.toFixed(2)} × ${report.footprintZ.toFixed(2)} m`);
}

console.log(`
manifest snippet (client/src/game/models/manifest.ts SCATTER_MODELS):
${TREES.map((t) => `  ${t.id.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())}: "models/scatter/meshy/${t.id}.glb",`).join("\n")}

credits row (CREDITS.md):
  | \`models/scatter/meshy/\` | https://meshy.ai (text/image-to-3D, project-generated) | Meshy AI | Meshy commercial (owned) | Forest scatter trees (cypress / field oak / olive), Phase 8e-17 |
`);
