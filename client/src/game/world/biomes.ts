import * as THREE from "three";
import {
  ARTILLERY_EMPLACEMENTS,
  BYZANTINE_SPAWN,
  CANNON_STAGING,
  CAPTURE_POINTS,
  heightAt,
  OTTOMAN_SPAWN,
  RIVER_HALF_WIDTH,
  RIVER_HEADWATER,
  RIVER_SEGMENTS,
  TERRAIN_PROPS,
  riverCenterlineDistance,
  terrainGradientAt,
} from "@janissary/shared";

/**
 * Phase 8e-5 Task 1: ground biomes. The battle ground was one flat green
 * plane (144×-tiled grass, nothing else). This module derives a per-vertex
 * color MULTIPLIER field from world facts the sim already owns — river
 * distance (muddy banks), plateau/stack footprints (rocky scree at the hill
 * bases), capture points and spawns (trampled dirt), the wall lane and
 * artillery positions (patchy battle scorch), the shore band (sand) — plus a
 * low-frequency deterministic meadow variation so open grass stops reading
 * as a single fill. The multiplier is baked into a `color` attribute on the
 * subdivided ground plane; the material keeps its tiled grass map and bump,
 * so close-up detail is unchanged and the biome reads as albedo variation.
 *
 * Phase 8e-11: the plane is displaced by the shared heightfield — every
 * vertex's z is `heightAt(worldX, worldZ)` exactly, so the render mesh IS the
 * ground the sim reads (one source of truth, no render/sim divergence). The
 * biome field additionally blends rocky scree onto steep heightfield slopes.
 * Everything stays deterministic and computed once at scene setup — nothing
 * here runs per frame.
 *
 * Worn paths are separate DECAL STRIPS (the packed-earth pattern from
 * `#setupScene`): at 5.6 m vertex cells a 4 m road would alias, so roads are
 * thin dirt-textured planes laid over the vertex-colored ground, each vertex
 * displaced onto the heightfield as well.
 */

/** Ground plane coverage (matches the old 1800×1800 plane). */
export const GROUND_SIZE = 1800;
/** Segments per axis: 1800 / 480 = 3.75 m cells — 8e-17 bumped from 360 so
 * the carved riverbank waterline and the eroded sand margin read smoothly
 * (5 m cells stair-stepped the lip). Broad biomes, not fine paths. */
export const GROUND_SEGMENTS = 480;

// ---------------------------------------------------------------------------
// Deterministic value noise (position-hashed, no RNG state).
// ---------------------------------------------------------------------------

function hash2(ix: number, iz: number): number {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise on a `cell`-meter grid, output in [0, 1]. */
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

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 8e-11: heightfield slope (|∇h|) where ground cover starts reading as
 * scree / is fully scree — matches the open-field gradient range (max ≈ 0.22
 * after the 8e-17 retune, measured in shared/test/terrain.test.ts) so only
 * the steepest hill flanks and keep-flat feather edges tint. The 8e-17 carve
 * banks reach ~0.5 and read fully scree — but the river-bank sand below
 * applies after this and wins near the water. */
export const SLOPE_SCREE_START = 0.1;
export const SLOPE_SCREE_FULL = 0.25;
const BIOME_GRADIENT_SCRATCH = { x: 0, z: 0 };

/** 8e-17: high crests read as exposed rock ("hills should have rocky
 * texture") — by HEIGHT, not slope, so the broad flat-topped hills of the
 * retune still catch it. Measured relief: −20.8…+20.8 m. */
const CREST_ROCK_START = 11;
const CREST_ROCK_FULL = 19;

// ---------------------------------------------------------------------------
// Biome inputs (all from shared world facts).
// ---------------------------------------------------------------------------

/** Distance to the river OR the headwater lake rim, in "centerline" units
 * (≤ RIVER_HALF_WIDTH means in the water), mirroring terrain-props' trick. */
function waterDistance(x: number, z: number): number {
  const lake = Math.hypot(x - RIVER_HEADWATER.x, z - RIVER_HEADWATER.z) - RIVER_HEADWATER.radius + RIVER_HALF_WIDTH;
  return Math.min(riverCenterlineDistance(x, z), lake);
}

interface ScreeSite {
  readonly x: number;
  readonly z: number;
  readonly cos: number;
  readonly sin: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
  /** Outer fade edge as a multiple of the footprint radius ratio. */
  readonly fade: number;
}

/** Plains plateaus plus the tier-0 footprints of the hill-fort/mountain
 * stacks (second-tier "-top" props sit on their own mound — the ground under
 * them is hidden, so they contribute no ground ring). */
function screeSites(): readonly ScreeSite[] {
  const sites: ScreeSite[] = [];
  for (const prop of TERRAIN_PROPS) {
    if (prop.kind !== "plateau" || prop.id.endsWith("-top")) continue;
    const mountain = prop.id.startsWith("terrain-stack-0--260-");
    const stack = prop.id.startsWith("terrain-stack-");
    if (stack && !prop.id.endsWith("-0")) continue; // tier 0 owns the base ring
    sites.push({
      x: prop.x,
      z: prop.z,
      cos: Math.cos(prop.rotation),
      sin: Math.sin(prop.rotation),
      halfWidth: prop.collider.width / 2,
      halfDepth: prop.collider.depth / 2,
      fade: mountain ? 1.75 : stack ? 1.5 : 1.35,
    });
  }
  return sites;
}

const SCREE_SITES = screeSites();

/** Normalized footprint radius ratio: < 1 is under the mound mesh. */
function screeRatio(site: ScreeSite, x: number, z: number): number {
  const dx = x - site.x;
  const dz = z - site.z;
  const lx = dx * site.cos + dz * site.sin;
  const lz = -dx * site.sin + dz * site.cos;
  return Math.hypot(lx / site.halfWidth, lz / site.halfDepth);
}

// Wall lane scorch bounds: the 12 wall segments span x ∈ [-71.75, 71.75].
const WALL_LANE_HALF_X = 78;
const WALL_LANE_MIN_Z = -10;
const WALL_LANE_MAX_Z = 12;

/** Scorch discs: the fixed wall guns plus the mobile-cannon staging row. */
const SCORCH_DISCS: readonly { x: number; z: number; radius: number }[] = [
  ...ARTILLERY_EMPLACEMENTS.map((gun) => ({ x: gun.x, z: gun.z, radius: 8 })),
  ...CANNON_STAGING.map((gun) => ({ x: gun.x, z: gun.z, radius: 6 })),
];

// Shoreline (Golden Horn) — z at which dry land turns to beach.
const SHORE_Z = 230;
const SHORE_SAND_START = 190;

// ---------------------------------------------------------------------------
// The per-point biome color (multiplier over the grass texture).
// ---------------------------------------------------------------------------

export interface BiomeColor {
  r: number;
  g: number;
  b: number;
}

export interface GroundDetailWeights {
  /** Grass, dirt/mud, rock — always sums to one. */
  grass: number;
  dirt: number;
  rock: number;
}

function mix(color: BiomeColor, r: number, g: number, b: number, factor: number): void {
  const t = Math.max(0, Math.min(1, factor));
  color.r += (r - color.r) * t;
  color.g += (g - color.g) * t;
  color.b += (b - color.b) * t;
}

/**
 * Computes the albedo multiplier at a world point. Exported pure so the
 * client test can probe biome reads without a scene. Everything is a smooth
 * blend of named factors; nothing allocates, nothing is random.
 */
export function computeBiomeColor(x: number, z: number, color: BiomeColor): void {
  color.r = 1;
  color.g = 1;
  color.b = 1;

  // Meadow variation: two octaves of soft value drift over a confident
  // saturated green (8e-17 redcoats grade — hue stays green, only the value
  // breathes; the old warm-dry yellowing is gone).
  const meadow = valueNoise(x, z, 47);
  const detail = valueNoise(x + 913, z - 377, 13);
  mix(color, 0.82, 1.12, 0.92, meadow * 0.28); // sunlit spring-green patches
  mix(color, 0.72, 1.15, 0.88, (1 - meadow) * 0.34); // lusher low spots
  const brightness = 1.02 + detail * 0.07;
  color.r *= brightness;
  color.g *= brightness;
  color.b *= brightness;

  // Rocky scree at hill/plateau bases ("hills should have rocky texture").
  for (const site of SCREE_SITES) {
    const ratio = screeRatio(site, x, z);
    if (ratio >= site.fade) continue;
    const rocky = 1 - smoothstep(0.95, site.fade, ratio);
    const grit = 0.82 + valueNoise(x * 1.3, z * 1.3, 7) * 0.35;
    mix(color, 0.8 * grit, 0.76 * grit, 0.68 * grit, rocky * 0.85);
  }

  // 8e-11: slope-driven scree — the heightfield's steeper flanks read as
  // exposed rock/scree, the flats stay meadow. Keep-flat zones and their
  // gentle feathers stay below the start threshold, so gameplay lanes are
  // unaffected.
  terrainGradientAt(x, z, BIOME_GRADIENT_SCRATCH);
  const slope = Math.hypot(BIOME_GRADIENT_SCRATCH.x, BIOME_GRADIENT_SCRATCH.z);
  const slopeRock = smoothstep(SLOPE_SCREE_START, SLOPE_SCREE_FULL, slope);
  if (slopeRock > 0) {
    const grit = 0.85 + valueNoise(x * 1.1 + 271, z * 1.1 - 149, 6) * 0.3;
    mix(color, 0.78 * grit, 0.74 * grit, 0.66 * grit, slopeRock * 0.75);
  }

  // 8e-17: crest rock by height — the big landforms crown in grey scree even
  // where their tops are gentle (slope-scree alone misses flat crests).
  const crest = smoothstep(CREST_ROCK_START, CREST_ROCK_FULL, heightAt(x, z));
  if (crest > 0) {
    const grit = 0.85 + valueNoise(x * 1.9 - 61, z * 1.9 + 43, 5) * 0.3;
    mix(color, 0.72 * grit, 0.7 * grit, 0.64 * grit, crest * 0.8);
  }

  // River banks (8e-17 carve): a wide warm-tan eroded sand margin with a
  // ribbed high-frequency breakup (redcoats River_passage), and a dark wet
  // band at the waterline itself. The band runs at FULL strength ~6 m above
  // the waterline (d ≤ 20) before fading — the waterline sits at d ≈ 14.3, so
  // a band that peaks inside d ≤ 15.5 would hide its sand under the water.
  // The sand multipliers deliberately exceed 1: the grass texel is a dark
  // ~(0.37, 0.56, 0.24), so only an r>g>b boost reads as warm sand instead of
  // olive mud (product peaks at ~(0.65, 0.60, 0.35) albedo — same value range
  // as the ford shallows mesh 0xb8a06a).
  const water = waterDistance(x, z);
  const bank = 1 - smoothstep(RIVER_HALF_WIDTH + 5, RIVER_HALF_WIDTH + 17, water);
  if (bank > 0) {
    const ribs = 0.9 + valueNoise(x * 2.1 + 37, z * 2.1 - 83, 4) * 0.2;
    mix(color, 1.75 * ribs, 1.08 * ribs, 1.45 * ribs, bank * 0.92);
    const wet = 1 - smoothstep(RIVER_HALF_WIDTH - 1, RIVER_HALF_WIDTH + 2.5, water);
    mix(color, 0.48, 0.42, 0.33, wet * 0.7);
  }

  // Trampled dirt at capture points and both spawn zones.
  for (const point of CAPTURE_POINTS) {
    const d = Math.hypot(x - point.x, z - point.z);
    const trample = 1 - smoothstep(point.radius * 0.6, point.radius + 7, d);
    if (trample > 0) mix(color, 0.83, 0.72, 0.56, trample * (0.55 + detail * 0.25));
  }
  for (const spawn of [OTTOMAN_SPAWN, BYZANTINE_SPAWN]) {
    const d = Math.hypot(x - spawn.x, z - spawn.z);
    const trample = 1 - smoothstep(6, 15, d);
    if (trample > 0) mix(color, 0.82, 0.72, 0.57, trample * 0.6);
  }

  // Battle wear: patchy scorch along the wall lane and around every gun.
  if (Math.abs(x) < WALL_LANE_HALF_X && z > WALL_LANE_MIN_Z && z < WALL_LANE_MAX_Z) {
    const laneFade = 1 - smoothstep(WALL_LANE_MIN_Z, WALL_LANE_MAX_Z, Math.abs(z - 1));
    const mask = smoothstep(0.45, 0.75, valueNoise(x * 1.7, z * 1.7, 9));
    mix(color, 0.45, 0.41, 0.37, laneFade * mask * 0.8);
    mix(color, 0.78, 0.7, 0.58, laneFade * 0.3); // general trample under the scorch
  }
  for (const disc of SCORCH_DISCS) {
    const d = Math.hypot(x - disc.x, z - disc.z);
    if (d >= disc.radius) continue;
    const mask = smoothstep(0.35, 0.7, valueNoise(x * 2.3 + 51, z * 2.3 - 17, 5));
    const ring = 1 - smoothstep(disc.radius * 0.35, disc.radius, d);
    mix(color, 0.42, 0.39, 0.35, ring * mask * 0.85);
  }

  // Golden Horn shore: grass fades to beach sand approaching the waterline.
  const sand = smoothstep(SHORE_SAND_START, SHORE_Z - 2, z);
  if (sand > 0) {
    mix(color, 0.88, 0.8, 0.62, sand * 0.85);
    const wetSand = smoothstep(SHORE_Z - 6, SHORE_Z, z);
    mix(color, 0.62, 0.56, 0.45, wetSand * 0.5);
  }
}

/**
 * Selects the surface family for the ground detail maps. This is deliberately
 * separate from the color multiplier: the biome color is the readable grade,
 * while these weights only choose where real grass, mud, and rock grain is
 * sampled. The same smooth inputs used by computeBiomeColor keep the three
 * families from forming hard square borders.
 */
export function computeGroundDetailWeights(x: number, z: number, weights: GroundDetailWeights): void {
  terrainGradientAt(x, z, BIOME_GRADIENT_SCRATCH);
  const slope = Math.hypot(BIOME_GRADIENT_SCRATCH.x, BIOME_GRADIENT_SCRATCH.z);
  let rock = smoothstep(SLOPE_SCREE_START, SLOPE_SCREE_FULL, slope) * 0.82;
  rock = Math.max(rock, smoothstep(CREST_ROCK_START, CREST_ROCK_FULL, heightAt(x, z)) * 0.8);
  for (const site of SCREE_SITES) {
    const ratio = screeRatio(site, x, z);
    if (ratio < site.fade) rock = Math.max(rock, (1 - smoothstep(0.9, site.fade, ratio)) * 0.8);
  }

  const water = waterDistance(x, z);
  let dirt = 1 - smoothstep(RIVER_HALF_WIDTH + 4, RIVER_HALF_WIDTH + 19, water);
  dirt = Math.max(dirt, smoothstep(SHORE_SAND_START, SHORE_Z - 2, z) * 0.85);
  for (const point of CAPTURE_POINTS) {
    const distance = Math.hypot(x - point.x, z - point.z);
    dirt = Math.max(dirt, (1 - smoothstep(point.radius * 0.55, point.radius + 8, distance)) * 0.82);
  }
  for (const spawn of [OTTOMAN_SPAWN, BYZANTINE_SPAWN]) {
    dirt = Math.max(dirt, (1 - smoothstep(6, 16, Math.hypot(x - spawn.x, z - spawn.z))) * 0.7);
  }
  if (Math.abs(x) < WALL_LANE_HALF_X && z > WALL_LANE_MIN_Z && z < WALL_LANE_MAX_Z) dirt = Math.max(dirt, 0.72);

  rock = Math.max(0, Math.min(0.95, rock));
  dirt = Math.max(0, Math.min(1 - rock, dirt));
  weights.rock = rock;
  weights.dirt = dirt;
  weights.grass = Math.max(0, 1 - rock - dirt);
}

/**
 * The subdivided ground plane displaced by the shared heightfield, with the
 * biome multiplier baked into a `color` attribute. Local (x, y) maps to world
 * (x, -z) under the mesh's rotation.x = -PI/2 (same convention as the water
 * planes), so colors and heights are sampled at (x, -y) — every vertex's
 * local z is exactly `heightAt(worldX, worldZ)`, the same function the server
 * sim, client prediction, and bots read. Normals are recomputed after
 * displacement so lighting follows the hills.
 */
export function buildBiomeGroundGeometry(size = GROUND_SIZE, segments = GROUND_SEGMENTS): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const color: BiomeColor = { r: 1, g: 1, b: 1 };
  const detailWeights = new Float32Array(position.count * 3);
  const weights: GroundDetailWeights = { grass: 1, dirt: 0, rock: 0 };
  for (let index = 0; index < position.count; index += 1) {
    const worldX = position.getX(index);
    const worldZ = -position.getY(index);
    computeBiomeColor(worldX, worldZ, color);
    computeGroundDetailWeights(worldX, worldZ, weights);
    position.setZ(index, heightAt(worldX, worldZ));
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    detailWeights[index * 3] = weights.grass;
    detailWeights[index * 3 + 1] = weights.dirt;
    detailWeights[index * 3 + 2] = weights.rock;
  }
  position.needsUpdate = true;
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("groundBlend", new THREE.BufferAttribute(detailWeights, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// Worn paths (dirt decal strips, the packed-earth pattern).
// ---------------------------------------------------------------------------

export interface RoadPath {
  readonly points: readonly { x: number; z: number }[];
  readonly width: number;
}

/**
 * The army's worn lanes, derived from shared waypoints: the Ottoman approach
 * (spawn → gate), the gate breach corridor into the inner city, the short
 * Byzantine spawn link, and the harbor-road spur to its capture point and on
 * to the wall lane's east end. Fixed data — deterministic by inspection.
 */
export const ROAD_PATHS: readonly RoadPath[] = [
  { points: [{ x: 0, z: 90 }, { x: 0, z: 15 }], width: 5 },
  { points: [{ x: 0, z: -15 }, { x: 0, z: -50 }], width: 4 },
  { points: [{ x: 0, z: -90 }, { x: 0, z: -70 }], width: 4 },
  { points: [{ x: 3, z: 86 }, { x: 74, z: 42 }], width: 4 },
  { points: [{ x: 74, z: 42 }, { x: 70, z: 15 }], width: 3.5 },
];

/** Shortest distance from a point to any road centerline (for scatter
 * clearance — scatter keeps off the worn paths). */
export function distanceToRoads(x: number, z: number): number {
  let nearest = Infinity;
  for (const road of ROAD_PATHS) {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const from = road.points[index];
      const to = road.points[index + 1];
      if (from === undefined || to === undefined) continue;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const lengthSquared = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / lengthSquared));
      nearest = Math.min(nearest, Math.hypot(x - (from.x + dx * t), z - (from.z + dz * t)));
    }
  }
  return nearest;
}

const ROAD_Y_BASE = 0.0045; // above the displaced ground by a hair (decal offset)
const ROAD_Y_STEP = 0.00025;
/** Strip subdivision: ~4 m quads so the decal follows heightfield curvature. */
const ROAD_SEGMENT_METERS = 4;

export interface RoadSurfaceSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Returns a world-space point on a road edge. The old implementation used a
 * rotated PlaneGeometry and wrote the world height into local Z. After the
 * second rotation, local Z was not the world-up axis, so sloped roads could
 * drift sideways or float. Road vertices now use this direct world-space
 * contract, which is also easy to regression-test against heightAt.
 */
export function roadSurfaceSample(
  road: RoadPath,
  segmentIndex: number,
  along: number,
  side: -1 | 1,
  lift = ROAD_Y_BASE,
): RoadSurfaceSample {
  const from = road.points[segmentIndex];
  const to = road.points[segmentIndex + 1];
  if (from === undefined || to === undefined) throw new Error("road segment out of range");
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 1) throw new Error("road segment is too short");
  const distance = Math.max(0, Math.min(length, along));
  const tx = dx / length;
  const tz = dz / length;
  const centerX = from.x + tx * distance;
  const centerZ = from.z + tz * distance;
  const edge = side * road.width / 2;
  const x = centerX - tz * edge;
  const z = centerZ + tx * edge;
  return { x, y: heightAt(x, z) + lift, z };
}

/**
 * Lays the dirt decal strips for ROAD_PATHS. Each strip clones the shared
 * dirt texture so its repeat follows the segment length; strips are y-
 * staggered to keep overlaps free of z-fighting. 8e-11: strips are subdivided
 * every ~ROAD_SEGMENT_METERS and every vertex is displaced onto the shared
 * heightfield (roads that leave the keep-flat corridor used to float or bury
 * on slopes). Static meshes, built once.
 */
export function buildRoadDecals(scene: THREE.Scene, dirtTexture: THREE.Texture): void {
  let layer = 0;
  for (const road of ROAD_PATHS) {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const from = road.points[index];
      const to = road.points[index + 1];
      if (from === undefined || to === undefined) continue;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const length = Math.hypot(dx, dz);
      if (length < 1) continue;
      const texture = dirtTexture.clone();
      texture.repeat.set(Math.max(1, Math.round(road.width / 3)), Math.max(1, Math.round(length / 14)));
      texture.needsUpdate = true;
      const rows = Math.max(1, Math.round(length / ROAD_SEGMENT_METERS));
      const positions = new Float32Array((rows + 1) * 2 * 3);
      const uvs = new Float32Array((rows + 1) * 2 * 2);
      const indices: number[] = [];
      const yOffset = ROAD_Y_BASE + layer * ROAD_Y_STEP;
      for (let row = 0; row <= rows; row += 1) {
        const distance = length * row / rows;
        const left = roadSurfaceSample(road, index, distance, -1, yOffset);
        const right = roadSurfaceSample(road, index, distance, 1, yOffset);
        const vertex = row * 2;
        positions[vertex * 3] = left.x;
        positions[vertex * 3 + 1] = left.y;
        positions[vertex * 3 + 2] = left.z;
        positions[(vertex + 1) * 3] = right.x;
        positions[(vertex + 1) * 3 + 1] = right.y;
        positions[(vertex + 1) * 3 + 2] = right.z;
        uvs[vertex * 2] = 0;
        uvs[vertex * 2 + 1] = row / rows;
        uvs[(vertex + 1) * 2] = 1;
        uvs[(vertex + 1) * 2 + 1] = row / rows;
        if (row === 0) continue;
        const previous = (row - 1) * 2;
        indices.push(previous, previous + 1, vertex, previous + 1, vertex + 1, vertex);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const strip = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
      strip.receiveShadow = true;
      scene.add(strip);
      layer += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// River bank sand margins (8e-17): the eroded sandy channel rim from the
// redcoats River_passage / River_mouth references. The biome multiplier under
// it can only shift the dark grass texel to olive, so the strong warm-sand
// read uses the road-decal trick: one opaque strip per bank with an honest
// sand albedo (the ford shallows' 0xb8a06a), every vertex displaced onto the
// carved heightfield. One BufferGeometry for both banks → one draw call.
// ---------------------------------------------------------------------------

/** Inner edge sits just above the carved waterline (d ≈ 14.3), so the strip
 * continues into the shallows and reads as a sandy bed under the waterline. */
const RIVER_BANK_INNER_D = 13;
/** Above the ground and road decals, below the ford shallows discs (0.015). */
const RIVER_BANK_Y = 0.004;
/** Polyline sampling step (m). */
const RIVER_BANK_STEP = 4;
/** The strip stops before the carve's sea-mouth fade; the beach biome takes
 * over from there. */
const RIVER_BANK_MAX_Z = 221;

export function buildRiverBankDecals(scene: THREE.Scene): void {
  interface BankSample { readonly x: number; readonly z: number; readonly tx: number; readonly tz: number; readonly along: number }
  const samples: BankSample[] = [];
  let along = 0;
  for (const segment of RIVER_SEGMENTS) {
    const dx = segment.x2 - segment.x1;
    const dz = segment.z2 - segment.z1;
    const length = Math.hypot(dx, dz);
    if (length < 1) continue;
    const tx = dx / length;
    const tz = dz / length;
    for (let local = 0; local < length; local += RIVER_BANK_STEP) {
      const z = segment.z1 + tz * local;
      if (z > RIVER_BANK_MAX_Z) continue; // mouth prefix: beach takes over
      samples.push({ x: segment.x1 + tx * local, z, tx, tz, along: along + local });
    }
    along += length;
  }
  if (samples.length < 2) return;

  const vertexCount = samples.length * 4;
  const positions = new Float32Array(vertexCount * 3);
  const indices: number[] = [];
  for (let row = 0; row < samples.length; row += 1) {
    const sample = samples[row];
    if (sample === undefined) continue;
    // Crossing normal (perpendicular to the local river direction).
    const nx = -sample.tz;
    const nz = sample.tx;
    // Ragged outer edge: the margin wanders 24–32 m out at a ~24 m wander
    // wavelength so the strip doesn't read as a decal-straight cut.
    for (const side of [1, -1] as const) {
      const outerD = 24 + 8 * valueNoise(sample.along, side * 9, 24);
      const base = (row * 4 + (side === 1 ? 0 : 2)) * 3;
      const innerX = sample.x + nx * side * RIVER_BANK_INNER_D;
      const innerZ = sample.z + nz * side * RIVER_BANK_INNER_D;
      const outerX = sample.x + nx * side * outerD;
      const outerZ = sample.z + nz * side * outerD;
      positions[base] = innerX;
      positions[base + 1] = heightAt(innerX, innerZ) + RIVER_BANK_Y;
      positions[base + 2] = innerZ;
      positions[base + 3] = outerX;
      positions[base + 4] = heightAt(outerX, outerZ) + RIVER_BANK_Y;
      positions[base + 5] = outerZ;
    }
    if (row === 0) continue;
    const prev = (row - 1) * 4;
    const curr = row * 4;
    // Winding keeps every triangle's normal up (+Y): with n = (-tz, tx) the
    // advance cross normal is (t × n).y = -1, so side A (+n bank) goes
    // inner_r → outer_r → inner_r1 and side B (-n bank) mirrors it.
    indices.push(prev, prev + 1, curr, prev + 1, curr + 1, curr);
    indices.push(prev + 2, curr + 2, prev + 3, prev + 3, curr + 2, curr + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xb8a06a,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  mesh.name = "river-bank-sand";
  mesh.receiveShadow = true;
  scene.add(mesh);
}
