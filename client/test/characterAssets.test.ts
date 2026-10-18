import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ANIMATED_HORSE_MODEL, CHARACTER_MODELS } from "../src/game/models/manifest";

/**
 * Phase 8e-16 asset regression cover for the six shipped Meshy character
 * GLBs. The 8e-12 screenshot review caught a ~2×-scale "giant" (baked Hips
 * root travel in run-alt, up to 5.3 m) and standing T-pose corpses; the prep
 * tool now strips root motion and the renderer snaps fresh rigs. These tests
 * pin the ASSET side so a re-run of tools/prep-characters.mjs can never
 * reintroduce either defect:
 *
 *   (a) every model ships the complete nine-clip contract, including ranged
 *       and melee actions needed when any class changes weapon slot;
 *   (b) the skinned bind-pose world height is exactly the 1.8 m the renderer
 *       assumes, pivot at the feet (minY ≈ 0);
 *   (c) no clip's Hips translation drifts more than 0.5 m XZ first→last
 *       (the root-motion strip the giant came from).
 *
 * Zero-dependency by design (the client package has no glTF parser): the GLB
 * container + accessor reads below are ~100 lines of DataView work.
 */

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// ---------------------------------------------------------------------------
// Minimal GLB reader (JSON chunk + BIN chunk + typed accessor views)
// ---------------------------------------------------------------------------

interface GltfBufferView {
  readonly byteOffset?: number;
  readonly byteStride?: number;
}

interface GltfAccessor {
  readonly bufferView: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
  readonly normalized?: boolean;
}

interface GltfNode {
  readonly name?: string;
  readonly translation?: number[];
  readonly rotation?: number[];
  readonly scale?: number[];
  readonly matrix?: number[];
  readonly children?: number[];
}

interface GltfPrimitive {
  readonly attributes: Record<string, number>;
}

interface GltfMesh {
  readonly primitives: GltfPrimitive[];
}

interface GltfSkin {
  readonly joints: number[];
  readonly inverseBindMatrices: number;
}

interface GltfChannel {
  readonly sampler: number;
  readonly target: { readonly node: number; readonly path: string };
}

interface GltfSampler {
  readonly input: number;
  readonly output: number;
}

interface GltfAnimation {
  readonly name: string;
  readonly channels: GltfChannel[];
  readonly samplers: GltfSampler[];
}

interface GltfJson {
  readonly accessors: GltfAccessor[];
  readonly bufferViews: GltfBufferView[];
  readonly nodes: GltfNode[];
  readonly meshes: GltfMesh[];
  readonly skins: GltfSkin[];
  readonly animations: GltfAnimation[];
  readonly scenes: readonly { readonly nodes: number[] }[];
  readonly scene?: number;
}

interface Glb {
  readonly json: GltfJson;
  readonly bin: Uint8Array;
}

function parseGlb(path: string): Glb {
  const bytes = readFileSync(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  let offset = 12;
  let json: GltfJson | undefined;
  let bin: Uint8Array | undefined;
  while (offset < bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const body = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body)) as GltfJson;
    else if (chunkType === 0x004e4942) bin = body;
    offset += 8 + chunkLength;
  }
  if (json === undefined || bin === undefined) throw new Error(`${path}: missing chunks`);
  return { json, bin };
}

const COMPONENT_BYTES: Readonly<Record<number, number>> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function accessorAt(glb: Glb, accessorIndex: number): GltfAccessor {
  const accessor = glb.json.accessors[accessorIndex];
  if (accessor === undefined) throw new Error(`missing accessor ${accessorIndex}`);
  return accessor;
}

/** Reads accessor element `index` as plain numbers (normalization applied). */
function readAccessor(glb: Glb, accessorIndex: number, elementIndex: number): number[] {
  const accessor = accessorAt(glb, accessorIndex);
  const bufferView = glb.json.bufferViews[accessor.bufferView];
  if (bufferView === undefined) throw new Error(`missing bufferView ${accessor.bufferView}`);
  const componentBytes = COMPONENT_BYTES[accessor.componentType] ?? 0;
  const componentCount = TYPE_COMPONENTS[accessor.type] ?? 0;
  const stride = bufferView.byteStride ?? componentBytes * componentCount;
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + elementIndex * stride;
  const view = new DataView(glb.bin.buffer, glb.bin.byteOffset + base, componentBytes * componentCount);
  const out: number[] = [];
  for (let component = 0; component < componentCount; component += 1) {
    const at = component * componentBytes;
    let value: number;
    switch (accessor.componentType) {
      case 5120: value = view.getInt8(at); break;
      case 5121: value = view.getUint8(at); break;
      case 5122: value = view.getInt16(at, true); break;
      case 5123: value = view.getUint16(at, true); break;
      case 5125: value = view.getUint32(at, true); break;
      case 5126: value = view.getFloat32(at, true); break;
      default: throw new Error(`componentType ${accessor.componentType}`);
    }
    if (accessor.normalized === true) {
      if (accessor.componentType === 5121) value /= 255;
      else if (accessor.componentType === 5123) value /= 65535;
      else if (accessor.componentType === 5120) value = Math.max(-1, value / 127);
      else if (accessor.componentType === 5122) value = Math.max(-1, value / 32767);
    }
    out.push(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mat4 (column-major, glTF convention) + node world transforms
// ---------------------------------------------------------------------------

function multiplyMat4(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c += 1)
    for (let r = 0; r < 4; r += 1)
      for (let k = 0; k < 4; k += 1) out[c * 4 + r] = (out[c * 4 + r] ?? 0) + (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0);
  return out;
}

function composeMat4(t: readonly number[], r: readonly number[], s: readonly number[]): number[] {
  const [x = 0, y = 0, z = 0, w = 1] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx = 1, sy = 1, sz = 1] = s;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0] ?? 0, t[1] ?? 0, t[2] ?? 0, 1,
  ];
}

function transformPoint(m: readonly number[], x: number, y: number, z: number): readonly [number, number, number] {
  return [
    (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0),
    (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
    (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0),
  ];
}

/** World matrix per node index, walking the default scene. */
function worldMatrices(glb: Glb): Map<number, number[]> {
  const nodes = glb.json.nodes;
  const out = new Map<number, number[]>();
  const walk = (index: number, parent: number[] | null): void => {
    const node = nodes[index];
    if (node === undefined) return;
    const local = node.matrix !== undefined
      ? node.matrix
      : composeMat4(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]);
    const world = parent === null ? local : multiplyMat4(parent, local);
    out.set(index, world);
    for (const child of node.children ?? []) walk(child, world);
  };
  const scene = glb.json.scenes[glb.json.scene ?? 0];
  for (const rootIndex of scene?.nodes ?? []) walk(rootIndex, null);
  return out;
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

/** Skinned bind-pose world-space bbox (joint world × IBM per spec; a skinned mesh's own node transform is ignored). */
function skinnedBounds(glb: Glb): { minX: number; minY: number; minZ: number; width: number; height: number; depth: number } {
  const worlds = worldMatrices(glb);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const skin of glb.json.skins) {
    const bindMats = skin.joints.map((joint, index) =>
      multiplyMat4(worlds.get(joint) ?? composeMat4([], [], []), readAccessor(glb, skin.inverseBindMatrices, index)));
    for (const mesh of glb.json.meshes) {
      for (const primitive of mesh.primitives) {
        const position = primitive.attributes["POSITION"];
        const jointsAttr = primitive.attributes["JOINTS_0"];
        const weightsAttr = primitive.attributes["WEIGHTS_0"];
        if (position === undefined || jointsAttr === undefined || weightsAttr === undefined) continue;
        const vertexCount = accessorAt(glb, position).count;
        for (let v = 0; v < vertexCount; v += 1) {
          const p = readAccessor(glb, position, v);
          const j = readAccessor(glb, jointsAttr, v);
          const w = readAccessor(glb, weightsAttr, v);
          let x = 0;
          let y = 0;
          let z = 0;
          for (let k = 0; k < 4; k += 1) {
            const weight = w[k] ?? 0;
            if (weight === 0) continue;
            const transformed = transformPoint(bindMats[Math.round(j[k] ?? 0)] ?? [], p[0] ?? 0, p[1] ?? 0, p[2] ?? 0);
            x += (transformed[0] ?? 0) * weight;
            y += (transformed[1] ?? 0) * weight;
            z += (transformed[2] ?? 0) * weight;
          }
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (z < minZ) minZ = z;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          if (z > maxZ) maxZ = z;
        }
      }
    }
  }
  return { minX, minY, minZ, width: maxX - minX, height: maxY - minY, depth: maxZ - minZ };
}

/** First→last XZ drift of the Hips translation channel for every clip, in
 * WORLD metres (raw track units × the Armature's world scale — the rigs are
 * authored in centimetres under a ~0.0106-scale Armature). */
function hipsDriftByClip(glb: Glb): Map<string, number> {
  const nodes = glb.json.nodes;
  const worlds = worldMatrices(glb);
  let armatureScale = 1;
  for (let index = 0; index < nodes.length; index += 1) {
    if (nodes[index]?.name !== "Armature") continue;
    const world = worlds.get(index);
    if (world !== undefined) armatureScale = Math.hypot(world[0] ?? 1, world[1] ?? 0, world[2] ?? 0);
    break;
  }
  const out = new Map<string, number>();
  for (const animation of glb.json.animations) {
    let drift = 0;
    for (const channel of animation.channels) {
      if (channel.target.path !== "translation") continue;
      if (nodes[channel.target.node]?.name !== "Hips") continue;
      const sampler = animation.samplers[channel.sampler];
      if (sampler === undefined) continue;
      const count = accessorAt(glb, sampler.output).count;
      if (count < 2) continue;
      const first = readAccessor(glb, sampler.output, 0);
      const last = readAccessor(glb, sampler.output, count - 1);
      drift = Math.max(drift, Math.hypot((last[0] ?? 0) - (first[0] ?? 0), (last[2] ?? 0) - (first[2] ?? 0)));
    }
    out.set(animation.name, drift * armatureScale);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The six shipping rigs (paths from the manifest, never hardcoded)
// ---------------------------------------------------------------------------

const MODEL_KEYS = Object.keys(CHARACTER_MODELS) as (keyof typeof CHARACTER_MODELS)[];
const COMPLETE_CLIPS = ["idle", "walk", "run", "run-alt", "aim", "fire", "slash", "block", "death"];

describe("character GLB assets (8e-16)", () => {
  it("all six manifest models parse as GLBs with a skin", () => {
    expect(MODEL_KEYS).toHaveLength(6);
    for (const key of MODEL_KEYS) {
      const glb = parseGlb(join(PUBLIC_DIR, CHARACTER_MODELS[key]));
      expect(glb.json.skins.length, key).toBeGreaterThan(0);
    }
  });

  it("every rig ships the complete ranged + melee clip contract", () => {
    for (const key of MODEL_KEYS) {
      const glb = parseGlb(join(PUBLIC_DIR, CHARACTER_MODELS[key]));
      const clips = glb.json.animations.map((animation) => animation.name);
      expect(clips, key).toHaveLength(COMPLETE_CLIPS.length);
      for (const clip of COMPLETE_CLIPS) expect(clips, `${key} missing ${clip}`).toContain(clip);
    }
  });

  it("skinned world height is exactly 1.8 m with the pivot at the feet (no scale anomalies)", () => {
    for (const key of MODEL_KEYS) {
      const glb = parseGlb(join(PUBLIC_DIR, CHARACTER_MODELS[key]));
      const bounds = skinnedBounds(glb);
      expect(bounds.height, key).toBeGreaterThan(1.79);
      expect(bounds.height, key).toBeLessThan(1.81);
      expect(Math.abs(bounds.minY), `${key} pivot`).toBeLessThan(0.02);
    }
  });

  it("no clip drifts the Hips more than 0.5 m XZ first→last (the 8e-12 giant regression)", () => {
    for (const key of MODEL_KEYS) {
      const glb = parseGlb(join(PUBLIC_DIR, CHARACTER_MODELS[key]));
      const drifts = hipsDriftByClip(glb);
      expect(drifts.size, key).toBeGreaterThan(0);
      for (const [clip, drift] of drifts) {
        expect(drift, `${key}/${clip}`).toBeLessThan(0.5);
      }
    }
  });
});

describe("animated Meshy horse asset", () => {
  it("ships one skin, idle/walk clips, a 2.4 m footprint, and a ground pivot", () => {
    const glb = parseGlb(join(PUBLIC_DIR, ANIMATED_HORSE_MODEL));
    expect(glb.json.skins).toHaveLength(1);
    expect(glb.json.animations.map((animation) => animation.name).sort()).toEqual(["idle", "walk"]);
    const bounds = skinnedBounds(glb);
    expect(Math.max(bounds.width, bounds.depth)).toBeGreaterThan(2.39);
    expect(Math.max(bounds.width, bounds.depth)).toBeLessThan(2.41);
    expect(Math.abs(bounds.minY)).toBeLessThan(0.02);
    expect(bounds.height).toBeGreaterThan(1.2);
    expect(bounds.height).toBeLessThan(2.1);
  });
});
