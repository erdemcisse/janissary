import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ARTILLERY_MODELS, TERRAIN_ROCK_MODELS, WORLD_ASSET_MODELS } from "../src/game/models/manifest";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

interface GltfDocument {
  readonly meshes?: readonly unknown[];
  readonly skins?: readonly unknown[];
  readonly animations?: readonly unknown[];
}

function readJsonChunk(path: string): GltfDocument {
  const bytes = readFileSync(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error(`${path}: invalid GLB magic`);
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (type === 0x4e4f534a) {
      return JSON.parse(new TextDecoder().decode(bytes.subarray(offset + 8, offset + 8 + length))) as GltfDocument;
    }
    offset += 8 + length;
  }
  throw new Error(`${path}: missing JSON chunk`);
}

describe("prepared project-owned static props", () => {
  it("ships the normalized artillery pair instead of raw inbox exports", () => {
    for (const path of Object.values(ARTILLERY_MODELS)) {
      const absolute = join(PUBLIC_DIR, path);
      const gltf = readJsonChunk(absolute);
      expect(statSync(absolute).size, path).toBeLessThan(512 * 1024);
      expect(gltf.meshes?.length, path).toBeGreaterThan(0);
      expect(gltf.skins ?? [], path).toHaveLength(0);
      expect(gltf.animations ?? [], path).toHaveLength(0);
    }
  });

  it("keeps the generated limestone variant in the terrain rock pool", () => {
    expect(TERRAIN_ROCK_MODELS).toContain("models/scatter/meshy/limestone-boulders.glb");
    const path = join(PUBLIC_DIR, "models/scatter/meshy/limestone-boulders.glb");
    expect(statSync(path).size).toBeLessThan(256 * 1024);
    expect(readJsonChunk(path).skins ?? []).toHaveLength(0);
    expect(readJsonChunk(path).animations ?? []).toHaveLength(0);
  });

  it("ships the prepared horse used by the mounted instanced batch", () => {
    const path = join(PUBLIC_DIR, WORLD_ASSET_MODELS.warHorse);
    expect(statSync(path).size).toBeLessThan(512 * 1024);
    expect(readJsonChunk(path).meshes?.length).toBeGreaterThan(0);
    expect(readJsonChunk(path).skins ?? []).toHaveLength(0);
    expect(readJsonChunk(path).animations ?? []).toHaveLength(0);
  });
});
