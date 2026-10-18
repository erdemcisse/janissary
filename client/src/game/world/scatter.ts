import * as THREE from "three";
import {
  CAPTURE_POINTS,
  heightAt,
  terrainGradientAt,
  terrainMaskAt,
  RIVER_FORDS,
  RIVER_HALF_WIDTH,
  RIVER_HEADWATER,
  RIVER_SEGMENTS,
  SIEGE_BLOCKOUT,
  isAllowed,
  onDeck,
  riverCenterlineDistance,
} from "@janissary/shared";
import { groundFit, loadModel, tintedMaterial } from "../models/loader";
import { SCATTER_MODELS } from "../models/manifest";
import { distanceToRoads } from "./biomes";

/**
 * Phase 8e-5 Task 3: world scatter — rocks on the hill bases, FORESTS of
 * mixed cypress/oak/olive on the high open ground (8e-17: real 30–80-tree
 * clusters replacing the old 3–6-tree mini-clusters), willows along the
 * river, grass/bush ground cover on the flats, reed beds at the fords, and
 * masonry debris along the wall. All of it is VISUAL DRESSING ONLY: no
 * colliders, no sim reads, instanced meshes built once at load, tier-scaled
 * by count (a prefix of each deterministic list, so lower tiers are a stable
 * subset of high).
 *
 * Placement is fully deterministic: one fixed-seed mulberry32 stream drives
 * every layer in a fixed order, and every candidate passes clearance rules
 * derived from shared world facts — the shared `isAllowed` prop rule
 * (artillery strip, wall lane, city, river, decks, capture points, spawns)
 * for anything big enough to read as an obstacle, plus road-polylines from
 * biomes.ts and SIEGE_BLOCKOUT AABB margins. Ankle-height ground cover
 * (grass, reeds, wall rubble) uses a lighter profile so the battlefield
 * itself gets cover: those layers can never be mistaken for cover, so their
 * only rules are dry land, off the roads, off the capture discs, and out of
 * the static boxes.
 *
 * Determinism note: like water.ts and terrain.ts this module carries its own
 * mulberry32/value-noise copies — tiny, fixed-seed, and test-locked by
 * scatter.test.ts's determinism assertion.
 */

export interface ScatterPlacement {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
  /** Rocks only: true for the hill-base ring population, which follows the
   * custom ring profile (off the capture disc, out of the mound, off roads)
   * instead of the full shared prop rule — see planRocks. */
  readonly ring?: boolean;
  /** Forests only (8e-17): explicit model-variant index (species). When
   * absent the builder falls back to index-based interleaving. */
  readonly variant?: number;
}

export interface ScatterPlan {
  readonly grass: readonly ScatterPlacement[];
  readonly bushes: readonly ScatterPlacement[];
  readonly rocks: readonly ScatterPlacement[];
  readonly trees: readonly ScatterPlacement[];
  readonly willows: readonly ScatterPlacement[];
  readonly reeds: readonly ScatterPlacement[];
  readonly rubble: readonly ScatterPlacement[];
}

export interface ScatterHandle {
  setQuality(quality: "low" | "medium" | "high"): void;
}

/**
 * Model-loader geometries are cached and shared by every consumer. Scatter
 * layers fit the same rock variants to different footprints, so fitting the
 * cached geometry in-place makes the later layer shrink the earlier one.
 * Keep the cache immutable and give each InstancedMesh its own fitted copy.
 */
export function prepareScatterGeometry(source: THREE.BufferGeometry, footprint: number): THREE.BufferGeometry {
  const geometry = source.clone();
  groundFit(geometry, footprint);
  return geometry;
}

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iz: number): number {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number, cell: number): number {
  const fx = x / cell;
  const fz = z / cell;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// Fixed seed: part of the map definition, exactly like TERRAIN_SEED.
const SCATTER_SEED = 0x8e5ca77e;

// ---------------------------------------------------------------------------
// Clearance profiles.
// ---------------------------------------------------------------------------

/** Clear of every static collider AABB by `margin` (walls, city, terrain
 * props, bridges, covers, stairs). Coarse AABB — scatter stays coarse-safe. */
function clearOfStatics(x: number, z: number, margin: number): boolean {
  for (const box of SIEGE_BLOCKOUT) {
    if (Math.abs(x - box.x) < box.width / 2 + margin && Math.abs(z - box.z) < box.depth / 2 + margin) return false;
  }
  return true;
}

/** Obstacle profile: full shared prop rule + roads + statics. Trees, rocks,
 * bushes, willows — things a player would expect to bump into. */
function obstacleClear(x: number, z: number, radius: number, roadMargin: number): boolean {
  return isAllowed(x, z, radius) && distanceToRoads(x, z) > roadMargin && clearOfStatics(x, z, radius);
}

/** Ground-cover profile: ankle-height dressing that cannot read as cover.
 * Dry land, off roads/capture discs/statics — but allowed on the artillery
 * strip and midfield flats where the battle actually runs. */
const GROUND_COVER_MAX_Z = 204;

function groundCoverClear(x: number, z: number, margin: number): boolean {
  if (Math.abs(x) > 860 || z < -860 || z > GROUND_COVER_MAX_Z) return false;
  if (riverCenterlineDistance(x, z) < RIVER_HALF_WIDTH + margin) return false;
  // 8e-17 carve: the headwater lake and bank dips sit below the waterline
  // without tripping the centerline distance check — never dress them.
  if (heightAt(x, z) < -0.5) return false;
  if (Math.abs(z) < 16) return false; // the packed-earth wall lane
  if (distanceToRoads(x, z) < 1.4 + margin) return false;
  return clearOfStatics(x, z, margin);
}

// ---------------------------------------------------------------------------
// Layer planners (fixed order — the rng stream defines the layout).
// ---------------------------------------------------------------------------

const GRASS_TARGET = 1300;
const GRASS_CELL = 31;
const GRASS_MEADOW_THRESHOLD = 0.46;
const BUSH_TARGET = 200;
const FIELD_ROCK_TARGET = 85;

function planGrass(rng: Rng): ScatterPlacement[] {
  const placements: ScatterPlacement[] = [];
  for (let attempt = 0; attempt < 30_000 && placements.length < GRASS_TARGET; attempt += 1) {
    const x = (rng() * 2 - 1) * 640;
    const z = -640 + rng() * 840;
    // Patchy meadows: tufts clump where the low-frequency noise runs high.
    if (valueNoise(x, z, GRASS_CELL) < GRASS_MEADOW_THRESHOLD) continue;
    if (!groundCoverClear(x, z, 0.3)) continue;
    placements.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.75 + rng() * 0.65 });
  }
  return placements;
}

function planBushes(rng: Rng): ScatterPlacement[] {
  const placements: ScatterPlacement[] = [];
  for (let attempt = 0; attempt < 6_000 && placements.length < BUSH_TARGET; attempt += 1) {
    const x = (rng() * 2 - 1) * 660;
    const z = -680 + rng() * 880;
    if (!obstacleClear(x, z, 0.9, 4)) continue;
    placements.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.8 + rng() * 0.5 });
  }
  return placements;
}

/** Rocks: a ring population at the hill/plateau bases ("rocks on hills")
 * plus free field boulders. Rings use a custom profile: the shared
 * `isAllowed` rule carries a 45 m capture-point prop clearance that would
 * reject the entire ring around the hill-fort stacks (the capture point sits
 * on the stack top, ~21-30 m from every ring spot) — but that clearance
 * exists for prop PLACEMENT, and these rocks are dressing that stays off the
 * actual capture disc (radius + 4) and out of the stack geometry itself. */
function planRocks(rng: Rng): ScatterPlacement[] {
  const placements: ScatterPlacement[] = [];
  const hillRingClear = (x: number, z: number): boolean => {
    if (riverCenterlineDistance(x, z) < RIVER_HALF_WIDTH + 1) return false;
    if (distanceToRoads(x, z) <= 3.5) return false;
    if (!clearOfStatics(x, z, 0.9)) return false;
    for (const point of CAPTURE_POINTS) {
      if (Math.hypot(x - point.x, z - point.z) < point.radius + 4) return false;
    }
    return true;
  };
  // Hill-base rings: reuse the plateau/stack tier-0 footprints.
  for (const prop of SIEGE_BLOCKOUT) {
    if (!prop.id.startsWith("terrain-plateau-") && !(prop.id.startsWith("terrain-stack-") && prop.id.endsWith("-0"))) continue;
    if (prop.id.endsWith("-top")) continue;
    const count = 2 + Math.floor(rng() * 4);
    for (let index = 0; index < count; index += 1) {
      const angle = rng() * Math.PI * 2;
      const ring = 1.05 + rng() * 0.45;
      const x = prop.x + Math.cos(angle) * (prop.width / 2) * ring;
      const z = prop.z + Math.sin(angle) * (prop.depth / 2) * ring;
      if (!hillRingClear(x, z)) continue;
      placements.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.9 + rng() * 0.9, ring: true });
    }
  }
  let fieldRocks = 0;
  for (let attempt = 0; attempt < 4_200 && fieldRocks < FIELD_ROCK_TARGET; attempt += 1) {
    const x = (rng() * 2 - 1) * 700;
    const z = -700 + rng() * 900;
    if (!obstacleClear(x, z, 0.8, 4)) continue;
    placements.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.7 + rng() * 0.9 });
    fieldRocks += 1;
  }
  return placements;
}

/**
 * Forests (8e-17, redcoats Forest_POI reference): real woods, not single
 * trees — 8 clusters of 30–80 trees, each cluster a blob of 1–3 overlapping
 * discs with ~5–7 m spacing, mixing the prepped Meshy species (cypress /
 * field oak / olive) with the kit cluster tree. Clusters sit on high,
 * fully-open ground (mask ≥ 0.85, above the beach/hollow floor), out of the
 * central siege corridor, and never in a lane (per-tree obstacle rule).
 */
const FOREST_CLUSTERS = 8;
const FOREST_CLUSTER_MIN_SPACING = 120;
const FOREST_TREE_MIN_SPACING = 5;
/** The push corridor rectangle (the corridor keep-flat + its skirt margin):
 * scatter's own rule — the shared isAllowed prop rule does not cover it. */
const FOREST_CORRIDOR_HALF_X = 70;
const FOREST_CORRIDOR_MIN_Z = -135;
const FOREST_CORRIDOR_MAX_Z = 140;

/** Species mix: cypress 40 %, field oak 30 %, olive 20 %, kit tree 10 %. */
const FOREST_VARIANTS = { cypress: 0, oak: 1, olive: 2, kit: 3 } as const;

function planTrees(rng: Rng): ScatterPlacement[] {
  const placements: ScatterPlacement[] = [];
  const centers: { x: number; z: number }[] = [];
  const gradient = { x: 0, z: 0 };
  for (let attempt = 0; attempt < 400 && centers.length < FOREST_CLUSTERS; attempt += 1) {
    const x = (rng() * 2 - 1) * 760;
    const z = -820 + rng() * 1000; // land side only (the sea blend starts ~185)
    if (Math.abs(x) < FOREST_CORRIDOR_HALF_X && z > FOREST_CORRIDOR_MIN_Z && z < FOREST_CORRIDOR_MAX_Z) continue;
    if (heightAt(x, z) < 0.3) continue; // high ground: no beach, no hollows
    if (terrainMaskAt(x, z) < 0.85) continue;
    if (!obstacleClear(x, z, 20, 10)) continue; // wide centre clearance
    let spaced = true;
    for (const center of centers) {
      if (Math.hypot(x - center.x, z - center.z) < FOREST_CLUSTER_MIN_SPACING) {
        spaced = false;
        break;
      }
    }
    if (!spaced) continue;
    centers.push({ x, z });
    // A cluster is 1–3 overlapping discs — a forest blob, not a circle.
    const discs: { x: number; z: number; r: number }[] = [];
    const discCount = 1 + Math.floor(rng() * 3);
    for (let d = 0; d < discCount; d += 1) {
      const angle = rng() * Math.PI * 2;
      const offset = d === 0 ? 0 : 12 + rng() * 20;
      discs.push({ x: x + Math.cos(angle) * offset, z: z + Math.sin(angle) * offset, r: 18 + rng() * 20 });
    }
    const treeTarget = 30 + Math.floor(rng() * 51); // 30–80 per cluster
    const clusterTrees: { x: number; z: number }[] = [];
    for (let t = 0; t < 3_000 && clusterTrees.length < treeTarget; t += 1) {
      const disc = discs[Math.floor(rng() * discs.length)];
      if (disc === undefined) break;
      const angle = rng() * Math.PI * 2;
      const radius = disc.r * Math.sqrt(rng());
      const tx = disc.x + Math.cos(angle) * radius;
      const tz = disc.z + Math.sin(angle) * radius;
      if (Math.abs(tx) < FOREST_CORRIDOR_HALF_X && tz > FOREST_CORRIDOR_MIN_Z && tz < FOREST_CORRIDOR_MAX_Z) continue;
      if (heightAt(tx, tz) < 0.3) continue;
      terrainGradientAt(tx, tz, gradient);
      if (Math.hypot(gradient.x, gradient.z) > 0.4) continue; // no cliff trees
      if (!obstacleClear(tx, tz, 1.5, 6)) continue;
      let crowded = false;
      for (const other of clusterTrees) {
        if (Math.hypot(tx - other.x, tz - other.z) < FOREST_TREE_MIN_SPACING) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;
      clusterTrees.push({ x: tx, z: tz });
      const roll = rng();
      const variant = roll < 0.4 ? FOREST_VARIANTS.cypress : roll < 0.7 ? FOREST_VARIANTS.oak : roll < 0.9 ? FOREST_VARIANTS.olive : FOREST_VARIANTS.kit;
      placements.push({ x: tx, z: tz, yaw: rng() * Math.PI * 2, scale: 0.85 + rng() * 0.4, variant });
    }
  }
  return placements;
}

/** Willows leaning over the riverbanks, skipping fords and bridge decks. */
function planWillows(rng: Rng): ScatterPlacement[] {
  const placements: ScatterPlacement[] = [];
  for (const segment of RIVER_SEGMENTS) {
    const dx = segment.x2 - segment.x1;
    const dz = segment.z2 - segment.z1;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    for (let along = 10 + rng() * 8; along < length - 10; along += 19 + rng() * 10) {
      const side = rng() < 0.5 ? -1 : 1;
      const offset = RIVER_HALF_WIDTH + 2.5 + rng() * 3.5;
      const x = segment.x1 + (dx / length) * along + nx * offset * side;
      const z = segment.z1 + (dz / length) * along + nz * offset * side;
      if (heightAt(x, z) < -0.5) continue; // 8e-17 carve: never underwater
      let nearFord = false;
      for (const ford of RIVER_FORDS) {
        if (Math.hypot(x - ford.x, z - ford.z) < ford.radius + 5) nearFord = true;
      }
      if (nearFord || onDeck(x, z, 4) || !obstacleClear(x, z, 2.2, 5)) continue;
      let crowded = false;
      for (const placed of placements) {
        if (Math.hypot(x - placed.x, z - placed.z) < 9) crowded = true;
      }
      if (crowded) continue;
      placements.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.9 + rng() * 0.4 });
    }
  }
  // Headwater lake rim: a small grove where the river dies.
  for (let index = 0; index < 4; index += 1) {
    const angle = rng() * Math.PI * 2;
    const x = RIVER_HEADWATER.x + Math.cos(angle) * (RIVER_HEADWATER.radius + 3 + rng() * 3);
    const z = RIVER_HEADWATER.z + Math.sin(angle) * (RIVER_HEADWATER.radius + 3 + rng() * 3);
    if (heightAt(x, z) < -0.5) continue; // 8e-17 carve: never underwater
    if (!obstacleClear(x, z, 2.2, 5)) continue;
    placements.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.85 + rng() * 0.4 });
  }
  return placements;
}

/** Reed/sedge beds: rings at the two fords plus sparse bank clumps. The
 * 8e-17 carve put the deep-channel banks underwater — placements reject any
 * spot whose bed sits more than 0.5 m below datum (fords at -0.35 survive:
 * reeds standing in the shallow wade read exactly right). */
function planReeds(rng: Rng): ScatterPlacement[] {
  const placements: ScatterPlacement[] = [];
  for (const ford of RIVER_FORDS) {
    for (let index = 0; index < 14; index += 1) {
      const angle = rng() * Math.PI * 2;
      const radius = ford.radius * (0.55 + rng() * 0.5);
      const x = ford.x + Math.cos(angle) * radius;
      const z = ford.z + Math.sin(angle) * radius;
      // Banks and the shallow edge itself — reeds stand in the waterline.
      const water = riverCenterlineDistance(x, z);
      if (water < RIVER_HALF_WIDTH - 5 || water > RIVER_HALF_WIDTH + 6) continue;
      if (heightAt(x, z) < -0.5) continue;
      if (onDeck(x, z, 3)) continue;
      placements.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.8 + rng() * 0.6 });
    }
  }
  for (const segment of RIVER_SEGMENTS) {
    const dx = segment.x2 - segment.x1;
    const dz = segment.z2 - segment.z1;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    // The carved waterline strip: bed ≥ -0.5 m runs roughly d ∈ [12.5, 16],
    // so the clump band hugs the bank instead of wading mid-channel.
    for (let along = 12 + rng() * 16; along < length - 10; along += 24 + rng() * 10) {
      const side = rng() < 0.5 ? -1 : 1;
      const offset = RIVER_HALF_WIDTH - 2.5 + rng() * 3.5;
      const x = segment.x1 + (dx / length) * along + nx * offset * side;
      const z = segment.z1 + (dz / length) * along + nz * offset * side;
      if (heightAt(x, z) < -0.5) continue;
      let nearFord = false;
      for (const ford of RIVER_FORDS) {
        if (Math.hypot(x - ford.x, z - ford.z) < ford.radius + 3) nearFord = true;
      }
      if (nearFord || onDeck(x, z, 3)) continue;
      placements.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.8 + rng() * 0.6 });
    }
  }
  return placements;
}

/** Masonry debris along the wall faces — small enough to read as rubble,
 * never as cover. Custom rules (it lives inside the wall lane by design). */
function planRubble(rng: Rng): ScatterPlacement[] {
  const placements: ScatterPlacement[] = [];
  for (let x = -68; x <= 68; x += 6.5) {
    if (Math.abs(x) < 11) continue; // the gate approach stays clear
    const jx = x + (rng() - 0.5) * 4;
    const side = rng() < 0.6 ? 1 : -1; // attacker face gets more
    const z = side * (2.6 + rng() * 3.2);
    if (distanceToRoads(jx, z) < 2.5) continue;
    placements.push({ x: jx, z, yaw: rng() * Math.PI * 2, scale: 0.35 + rng() * 0.4 });
  }
  return placements;
}

/** The full deterministic layout. Pure data — the test pokes every rule. */
export function planScatter(): ScatterPlan {
  const rng = mulberry32(SCATTER_SEED);
  return {
    grass: planGrass(rng),
    bushes: planBushes(rng),
    rocks: planRocks(rng),
    trees: planTrees(rng),
    willows: planWillows(rng),
    reeds: planReeds(rng),
    rubble: planRubble(rng),
  };
}

// ---------------------------------------------------------------------------
// Instanced meshes + tier scaling.
// ---------------------------------------------------------------------------

type Quality = "low" | "medium" | "high";

/** Per-layer tier density: a prefix of each deterministic list, so a lower
 * tier is always a stable subset of high. Grass is the floor layer — it
 * drops out entirely on low. Exported for the scatter test. */
export const TIER_DENSITY: Record<keyof ScatterPlan, Record<Quality, number>> = {
  grass: { low: 0, medium: 0.45, high: 1 },
  bushes: { low: 0.5, medium: 0.75, high: 1 },
  rocks: { low: 0.5, medium: 0.75, high: 1 },
  // Forests are the vertex-heaviest layer (8e-17: ~300–500 trees); low tier
  // keeps a readable third of every cluster (a stable prefix, as always).
  trees: { low: 0.35, medium: 0.7, high: 1 },
  willows: { low: 0.6, medium: 0.8, high: 1 },
  reeds: { low: 0.4, medium: 0.7, high: 1 },
  rubble: { low: 0.5, medium: 0.75, high: 1 },
};

/** groundFit footprint per layer (m) — the rest of the size comes from the
 * model's own proportions times the per-instance scale jitter. */
const LAYER_FOOTPRINT: Record<keyof ScatterPlan, number> = {
  grass: 1.15,
  bushes: 1.5,
  rocks: 1.25,
  trees: 2.7,
  willows: 4.4,
  reeds: 1.2,
  rubble: 0.85,
};

const LAYER_MODELS: Record<keyof ScatterPlan, readonly string[]> = {
  grass: [SCATTER_MODELS.grassA, SCATTER_MODELS.grassB],
  bushes: [SCATTER_MODELS.bushA, SCATTER_MODELS.bushB],
  rocks: [SCATTER_MODELS.rockA, SCATTER_MODELS.rockB],
  // 8e-17 forests: variant order MUST stay in sync with FOREST_VARIANTS.
  trees: [SCATTER_MODELS.cypressTree, SCATTER_MODELS.fieldOak, SCATTER_MODELS.oliveTree, SCATTER_MODELS.clusterTree],
  willows: [SCATTER_MODELS.willowA, SCATTER_MODELS.willowB],
  reeds: [SCATTER_MODELS.reed],
  rubble: [SCATTER_MODELS.rockA, SCATTER_MODELS.rockB],
};

/**
 * Bright-day scatter palette. The former dawn profile needed 1.9–2.1 linear
 * material multipliers to recover near-black nature-kit colors. Those HDR
 * tints clip textured leaves into neon/white facets under the new neutral
 * daylight. Every multiplier is now at or below one: authored variation is
 * preserved, field oak is restrained, and the inexpensive global fill light
 * supplies shaded readability instead of per-material overdrive.
 */
export const SCATTER_DAYLIGHT_TINTS = {
  treeVariants: [
    [0.78, 0.92, 0.84], // cypress — deep cool green
    [0.18, 0.34, 0.19], // field oak — tame the near-neon source atlas
    [0.14, 0.24, 0.12], // olive — color the source atlas's white/black facets
    [0.92, 1, 0.78], // kit tree — lift dark vertex colors without HDR clipping
  ],
  layers: {
    grass: [0.52, 0.72, 0.46],
    bushes: [0.5, 0.7, 0.45],
    rocks: [1, 0.96, 0.88],
    trees: [0.92, 1, 0.78],
    willows: [0.82, 0.95, 0.72],
    reeds: [0.88, 0.92, 0.68],
    rubble: [1, 0.96, 0.88],
  },
} as const;

const LAYER_VARIANT_OVERRIDES: Partial<Record<keyof ScatterPlan, readonly { footprint: number; tint: readonly [number, number, number] }[]>> = {
  trees: [
    { footprint: 1.89, tint: SCATTER_DAYLIGHT_TINTS.treeVariants[0] },
    { footprint: 8.21, tint: SCATTER_DAYLIGHT_TINTS.treeVariants[1] },
    { footprint: 6.15, tint: SCATTER_DAYLIGHT_TINTS.treeVariants[2] },
    { footprint: 2.7, tint: SCATTER_DAYLIGHT_TINTS.treeVariants[3] },
  ],
};

const LAYER_SHADOW: Record<keyof ScatterPlan, boolean> = {
  grass: false,
  bushes: true,
  rocks: true,
  trees: true,
  willows: true,
  reeds: false,
  rubble: false,
};

/**
 * Per-layer diffuse calibration (linear-space multiply against baked vertex
 * colors). Applied to a CLONE of the shared loader material so other users
 * of the same glb are unaffected.
 */
const LAYER_TINT: Record<keyof ScatterPlan, readonly [number, number, number]> = SCATTER_DAYLIGHT_TINTS.layers;

interface LayerMeshes {
  readonly meshes: THREE.InstancedMesh[];
  readonly counts: number[];
}

/**
 * Builds the scatter. Models load fire-and-forget (the dressing pattern):
 * until a layer resolves it simply isn't drawn, and a failed load leaves the
 * map fully playable. All matrices are written once with StaticDrawUsage;
 * setQuality only moves `count` along the deterministic prefix.
 */
export function buildScatter(scene: THREE.Scene): ScatterHandle {
  const plan = planScatter();
  const layers = new Map<keyof ScatterPlan, LayerMeshes>();
  let quality: Quality = "high";

  const applyQuality = (): void => {
    for (const [layer, meshes] of layers) {
      const density = TIER_DENSITY[layer][quality];
      meshes.meshes.forEach((mesh, index) => {
        mesh.count = Math.floor((meshes.counts[index] ?? 0) * density);
      });
    }
  };

  for (const layerName of Object.keys(LAYER_MODELS) as (keyof ScatterPlan)[]) {
    const placements = plan[layerName];
    if (placements.length === 0) continue;
    const variants = LAYER_MODELS[layerName];
    // Bucket placements across variants: an explicit per-placement variant
    // (8e-17 forest species) wins; otherwise interleave deterministically.
    const buckets: ScatterPlacement[][] = Array.from({ length: variants.length }, () => []);
    placements.forEach((placement, index) => {
      buckets[(placement.variant ?? index) % variants.length]?.push(placement);
    });
    const layerMeshes: LayerMeshes = { meshes: [], counts: buckets.map((bucket) => bucket.length) };
    layers.set(layerName, layerMeshes);
    variants.forEach((path, variant) => {
      const bucket = buckets[variant];
      if (bucket === undefined || bucket.length === 0) return;
      void loadModel(path)
        .then((model) => {
          const override = LAYER_VARIANT_OVERRIDES[layerName]?.[variant];
          const geometry = prepareScatterGeometry(model.geometry, override?.footprint ?? LAYER_FOOTPRINT[layerName]);
          const tint = override?.tint ?? LAYER_TINT[layerName];
          const mesh = new THREE.InstancedMesh(geometry, tintedMaterial(model, tint[0], tint[1], tint[2]), bucket.length);
          mesh.name = `scatter-${layerName}-${variant}`;
          const matrix = new THREE.Matrix4();
          const position = new THREE.Vector3();
          const quaternion = new THREE.Quaternion();
          const euler = new THREE.Euler();
          const scale = new THREE.Vector3();
          bucket.forEach((placement, index) => {
            // 8e-11: scatter sits on the shared heightfield (placements are
            // collision-aware in x/z already; the y is the terrain sample).
            position.set(placement.x, heightAt(placement.x, placement.z), placement.z);
            quaternion.setFromEuler(euler.set(0, placement.yaw, 0));
            scale.setScalar(placement.scale);
            matrix.compose(position, quaternion, scale);
            mesh.setMatrixAt(index, matrix);
          });
          mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
          mesh.castShadow = LAYER_SHADOW[layerName];
          mesh.receiveShadow = true;
          layerMeshes.meshes[variant] = mesh;
          scene.add(mesh);
          applyQuality();
        })
        .catch(() => undefined);
    });
  }

  return {
    setQuality(next: Quality): void {
      if (next === quality) return;
      quality = next;
      applyQuality();
    },
  };
}
