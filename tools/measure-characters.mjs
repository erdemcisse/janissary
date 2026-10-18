// 8e-16 diagnostic: measure shipped character GLBs — skinned world height,
// Armature scale, animation clip names/durations. Read-only.
import { NodeIO } from "@gltf-transform/core";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "client/public/models/characters/meshy");
const files = [
  "janissary-musketeer.glb",
  "janissary-swordsman.glb",
  "ottoman-azap.glb",
  "ottoman-gunner.glb",
  "byzantine-guardsman.glb",
  "byzantine-crossbowman.glb",
];

function multiplyMat4(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1)
    for (let r = 0; r < 4; r += 1)
      for (let k = 0; k < 4; k += 1) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}
function composeMat4(t, r, s) {
  const [x, y, z, w] = r;
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
    const local = composeMat4(node.getTranslation(), node.getRotation(), node.getScale());
    const world = parent === null ? local : multiplyMat4(parent, local);
    map.set(node, world);
    for (const child of node.listChildren()) walk(child, world);
  };
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  for (const child of scene.listChildren()) walk(child, null);
  return map;
}

const io = new NodeIO();
for (const file of files) {
  const doc = await io.read(join(dir, file));
  const worlds = worldMatrices(doc);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let skinnedPrims = 0;
  for (const skin of doc.getRoot().listSkins()) {
    const joints = skin.listJoints();
    const ibms = skin.getInverseBindMatrices().getArray();
    const bindMats = joints.map((joint, index) => {
      const world = worlds.get(joint);
      const ibm = ibms.slice(index * 16, index * 16 + 16);
      return multiplyMat4(world, ibm);
    });
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute("POSITION");
        const jointAttr = prim.getAttribute("JOINTS_0");
        const weightAttr = prim.getAttribute("WEIGHTS_0");
        if (pos === null || jointAttr === null || weightAttr === null) continue;
        skinnedPrims += 1;
        const p = [0, 0, 0];
        const j = [0, 0, 0, 0];
        const w = [0, 0, 0, 0];
        for (let v = 0; v < pos.getCount(); v += 1) {
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
  const height = (max[1] - min[1]).toFixed(3);
  const anims = doc.getRoot().listAnimations().map((a) => {
    let duration = 0;
    for (const sampler of a.listSamplers()) {
      const input = sampler.getInput();
      if (input === null) continue;
      const m = input.getMax([]);
      if (m.length > 0 && m[0] > duration) duration = m[0];
    }
    return `${a.getName()}(${duration.toFixed(2)}s)`;
  });
  const armature = doc.getRoot().listNodes().find((n) => n.getName() === "Armature");
  console.log(`${file}: height=${height} minY=${min[1].toFixed(3)} skins=${doc.getRoot().listSkins().length} skinnedPrims=${skinnedPrims} armatureScale=${armature?.getScale().map((v) => v.toFixed(4))}`);
  console.log(`  clips: ${anims.join(", ")}`);
}
