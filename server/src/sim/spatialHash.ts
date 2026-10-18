import { AOI_CELL_SIZE, MAX_PLAYERS } from "@janissary/shared";
import type { WorldState } from "./world";

export interface SpatialHash {
  readonly cellSize: number;
  readonly cells: Map<number, number[]>;
  readonly freeBuckets: number[][];
}

export function createSpatialHash(cellSize = AOI_CELL_SIZE): SpatialHash {
  return { cellSize, cells: new Map<number, number[]>(), freeBuckets: [] };
}

function cellCoordinate(value: number, cellSize: number): number {
  return Math.floor(value / cellSize);
}

function cellKey(x: number, z: number): number {
  return (x + 32_768) * 65_536 + z + 32_768;
}

export function rebuildSpatialHash(hash: SpatialHash, world: WorldState): void {
  for (const bucket of hash.cells.values()) {
    bucket.length = 0;
    hash.freeBuckets.push(bucket);
  }
  hash.cells.clear();
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    if (world.active[slot] === 0) continue;
    const x = cellCoordinate(world.x[slot] ?? 0, hash.cellSize);
    const z = cellCoordinate(world.z[slot] ?? 0, hash.cellSize);
    const key = cellKey(x, z);
    const bucket = hash.cells.get(key);
    if (bucket === undefined) {
      const next = hash.freeBuckets.pop() ?? [];
      next.push(slot);
      hash.cells.set(key, next);
    }
    else bucket.push(slot);
  }
}

export function querySpatialHash(
  hash: SpatialHash,
  world: WorldState,
  centerX: number,
  centerZ: number,
  radius: number,
): number[] {
  const result: number[] = [];
  querySpatialHashInto(hash, world, centerX, centerZ, radius, result);
  return result;
}

export function querySpatialHashInto(
  hash: SpatialHash,
  world: WorldState,
  centerX: number,
  centerZ: number,
  radius: number,
  result: number[],
  maximumResults = Number.POSITIVE_INFINITY,
): void {
  result.length = 0;
  const radiusSquared = radius * radius;
  const minX = cellCoordinate(centerX - radius, hash.cellSize);
  const maxX = cellCoordinate(centerX + radius, hash.cellSize);
  const minZ = cellCoordinate(centerZ - radius, hash.cellSize);
  const maxZ = cellCoordinate(centerZ + radius, hash.cellSize);
  for (let cellX = minX; cellX <= maxX; cellX += 1) {
    for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
      const bucket = hash.cells.get(cellKey(cellX, cellZ));
      if (bucket === undefined) continue;
      for (const slot of bucket) {
        const dx = (world.x[slot] ?? 0) - centerX;
        const dz = (world.z[slot] ?? 0) - centerZ;
        if (dx * dx + dz * dz <= radiusSquared) {
          result.push(slot);
          if (result.length >= maximumResults) return;
        }
      }
    }
  }
}
