/**
 * Procedural terrain set dressing: gentle plateaus, hill-fortress stacks,
 * climbable rock-stair clusters, scattered rocks, and cypress/scrub trees
 * placed around the battle's edges and non-objective areas. Placement is
 * fully deterministic — a fixed-seed mulberry32 PRNG runs once at module
 * load, so client and server compute identical results with no runtime
 * randomness and no sourced assets.
 *
 * Hard placement rules (world facts mirrored from constants.ts / map.ts —
 * this module intentionally has zero imports so it stays a pure data module):
 * - world is ±900 in x/z (Phase 8c-4); water starts at z = 230, so nothing
 *   is placed at z ∈ (205, 310) — the shore band and the strait itself
 * - every prop is ≥45 m from all seven capture points (gate, breach field,
 *   harbor road, inner city, and the three hill forts)
 * - every prop is ≥30 m from both spawns (0,92) / (0,-92) and from the
 *   z ∈ [60,90] Ottoman artillery strip (i.e. prop z ≤ 30 or z ≥ 120)
 * - nothing inside the wall/breach lane x ∈ [-90,90] ∧ z ∈ [-15,15]
 * - nothing inside the inner-city district x ∈ [-19,19] ∧ z ∈ [-86,-50]
 * - props concentrate in the edge bands |x| ∈ [120,850], the north city-side
 *   z ∈ [-850,-70], the south approach z ∈ [120,200] with |x| > 100, and the
 *   far shore beyond the strait z ∈ [310,880] with |x| > 300
 * - hill-fortress stacks are hand-placed at the three hill-fort capture
 *   points plus one taller landmark "mountain" stack with no capture point
 * - rock-stair clusters are hand-anchored staircases of 4 rocks whose tops
 *   rise ≤ MAX_STEP_UP per step, climbable with the shared step-up collision
 */

export interface TerrainProp {
  readonly id: string;
  readonly kind: "plateau" | "rock" | "tree";
  readonly x: number;
  readonly z: number;
  readonly rotation: number;
  readonly scale: number;
  readonly collider: {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly material: "stone" | "earth" | "wood";
  };
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

// Fixed seed: any change here reshuffles the whole layout, so treat it as part
// of the map definition.
const TERRAIN_SEED = 0x1a2b3c4d;

// Mirrored world facts (see map.ts). Guarded by mirror-consistency.test.ts.
const CAPTURE_POINTS: readonly { x: number; z: number }[] = [
  { x: 0, z: 0 },
  { x: 0, z: -32 },
  { x: 74, z: 42 },
  { x: 0, z: -66 },
  { x: -470, z: -150 },
  { x: 470, z: -130 },
  { x: -430, z: 150 },
];
const SPAWNS: readonly { x: number; z: number }[] = [
  { x: 0, z: 92 },
  { x: 0, z: -92 },
];

const CAPTURE_CLEARANCE = 45;
const SPAWN_CLEARANCE = 30;
// Mirrored clearance facts. Guarded by mirror-consistency.test.ts.
// Artillery strip z ∈ [60,90] plus its 30 m clearance on each side.
const ARTILLERY_STRIP_MIN_Z = 30;
const ARTILLERY_STRIP_MAX_Z = 120;
// Shore-side prop cap (keep props clear of the waterline band) and the
// far-shore band past the strait — placement rules, not water extents.
const MAX_PROP_Z = 205;
const BEYOND_WATER_MIN_Z = 310;
const WORLD_LIMIT = 880;
// Wall + breach lane, x ∈ [-90,90] ∧ z ∈ [-15,15].
const WALL_LANE_HALF_X = 90;
const WALL_LANE_HALF_Z = 15;
// Inner-city district, x ∈ [-19,19] ∧ z ∈ [-86,-50].
const CITY_HALF_X = 19;
const CITY_MIN_Z = -86;
const CITY_MAX_Z = -50;

// River channel + headwater lake and bridge/dock decks (mirrored from map.ts —
// this module intentionally has zero imports, so world facts are duplicated
// here exactly as CAPTURE_POINTS/SPAWNS are). Guarded by
// mirror-consistency.test.ts.
const RIVER_MIRROR: readonly { x1: number; z1: number; x2: number; z2: number }[] = [
  { x1: -330, z1: 230, x2: -335, z2: 150 },
  { x1: -335, z1: 150, x2: -310, z2: 30 },
  { x1: -310, z1: 30, x2: -330, z2: -60 },
  { x1: -330, z1: -60, x2: -330, z2: -150 },
  { x1: -330, z1: -150, x2: -320, z2: -220 },
];
const RIVER_HALF_WIDTH_MIRROR = 15;
const RIVER_HEADWATER_MIRROR = { x: -325, z: -230, radius: 30 };
const DECK_MIRROR: readonly { x: number; z: number; width: number; depth: number }[] = [
  { x: -327, z: 170, width: 36, depth: 8 },
  { x: -319, z: 10, width: 36, depth: 8 },
  { x: -330, z: -130, width: 36, depth: 8 },
  { x: -284, z: 236, width: 6, depth: 16 },
  { x: -252, z: 237, width: 6, depth: 20 },
  { x: 284, z: 236, width: 6, depth: 16 },
  { x: 252, z: 237, width: 6, depth: 20 },
];

/**
 * Test-only reachability for every hand-copied map fact. Keeping this object
 * here preserves the module's deliberate zero-import runtime contract; the
 * cross-module test owns drift detection.
 */
export const MIRRORED_WORLD_FACTS = {
  capturePointCount: CAPTURE_POINTS.length,
  capturePoints: CAPTURE_POINTS,
  spawns: SPAWNS,
  riverSegments: RIVER_MIRROR,
  riverHalfWidth: RIVER_HALF_WIDTH_MIRROR,
  riverHeadwater: RIVER_HEADWATER_MIRROR,
  decks: DECK_MIRROR,
  cityBounds: { halfX: CITY_HALF_X, minZ: CITY_MIN_Z, maxZ: CITY_MAX_Z },
  artilleryStrip: { minZ: ARTILLERY_STRIP_MIN_Z, maxZ: ARTILLERY_STRIP_MAX_Z },
  wallLane: { halfX: WALL_LANE_HALF_X, halfZ: WALL_LANE_HALF_Z },
  worldLimit: WORLD_LIMIT,
} as const;

function riverDistanceMirror(x: number, z: number): number {
  let nearest = Infinity;
  for (const segment of RIVER_MIRROR) {
    const dx = segment.x2 - segment.x1;
    const dz = segment.z2 - segment.z1;
    const lengthSquared = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - segment.x1) * dx + (z - segment.z1) * dz) / (lengthSquared || 1)));
    nearest = Math.min(nearest, Math.hypot(x - (segment.x1 + dx * t), z - (segment.z1 + dz * t)));
  }
  return Math.min(nearest, Math.hypot(x - RIVER_HEADWATER_MIRROR.x, z - RIVER_HEADWATER_MIRROR.z) - RIVER_HEADWATER_MIRROR.radius + RIVER_HALF_WIDTH_MIRROR);
}

type Band = "edge" | "north" | "south" | "beyond";

// Weighted so the flanks get the most dressing, then the north city-side,
// then the south approach and the far shore.
const BANDS: readonly Band[] = ["edge", "edge", "edge", "north", "north", "south", "beyond", "beyond"];

function sampleInBand(rng: Rng, band: Band): { x: number; z: number } {
  if (band === "edge") {
    const sign = rng() < 0.5 ? -1 : 1;
    return { x: sign * (120 + rng() * 730), z: -880 + rng() * 1085 };
  }
  if (band === "north") {
    return { x: -880 + rng() * 1760, z: -220 + rng() * 150 };
  }
  if (band === "south") {
    const sign = rng() < 0.5 ? -1 : 1;
    return { x: sign * (100 + rng() * 330), z: 120 + rng() * 80 };
  }
  const sign = rng() < 0.5 ? -1 : 1;
  return { x: sign * (300 + rng() * 580), z: 310 + rng() * 570 };
}

/**
 * Clearance rule shared by the deterministic prop scatter and the server's
 * earthwork placement validation (reused for the shovel, see ADR 0019).
 * `radius` is the footprint radius of the thing being placed, so every rule
 * applies to the footprint, not just the center.
 */
export function isAllowed(x: number, z: number, radius: number): boolean {
  if (Math.abs(x) > WORLD_LIMIT || z < -WORLD_LIMIT) return false;
  if (z > MAX_PROP_Z && z < BEYOND_WATER_MIN_Z) return false;
  // Artillery strip clearance.
  if (z > ARTILLERY_STRIP_MIN_Z - radius && z < ARTILLERY_STRIP_MAX_Z + radius) return false;
  // Wall + breach lane.
  if (Math.abs(x) < WALL_LANE_HALF_X + radius && Math.abs(z) < WALL_LANE_HALF_Z + radius) return false;
  // Inner-city district.
  if (Math.abs(x) < CITY_HALF_X + radius && z > CITY_MIN_Z - radius && z < CITY_MAX_Z + radius) return false;
  // River channel + headwater lake.
  if (riverDistanceMirror(x, z) < RIVER_HALF_WIDTH_MIRROR + radius) return false;
  // Bridge decks and dock piers.
  for (const deck of DECK_MIRROR) {
    if (Math.abs(x - deck.x) <= deck.width / 2 + radius && Math.abs(z - deck.z) <= deck.depth / 2 + radius) return false;
  }
  for (const point of CAPTURE_POINTS) {
    if (Math.hypot(x - point.x, z - point.z) < CAPTURE_CLEARANCE + radius) return false;
  }
  for (const spawn of SPAWNS) {
    if (Math.hypot(x - spawn.x, z - spawn.z) < SPAWN_CLEARANCE + radius) return false;
  }
  return true;
}

interface PlacedSpot {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

// Hill-fortress stacks: hand-placed at the three hill-fort capture points
// plus one taller landmark "mountain" with no capture point. Each tier is
// ≤ MAX_STEP_UP tall and shrinks toward the top, so the whole stack is
// walkable end-to-end with the shared step-up collision.
interface StackSite {
  readonly x: number;
  readonly z: number;
  readonly tiers: number;
  readonly base: number;
}

const STACK_SITES: readonly StackSite[] = [
  { x: -470, z: -150, tiers: 5, base: 40 },
  { x: 470, z: -130, tiers: 5, base: 40 },
  { x: -430, z: 150, tiers: 4, base: 36 },
  { x: 0, z: -260, tiers: 6, base: 46 },
];

// Rock-stair clusters: 4 rocks per staircase, each rock's top within
// MAX_STEP_UP of its neighbor's, offset ~3 m apart so the footprints overlap
// and the cluster reads as natural stairs. Anchored by tryPlace (respecting
// every clearance), so each cluster lands in a valid, prop-free spot.
const ROCK_STAIR_CLUSTERS = 3;
const ROCK_STAIR_PER_CLUSTER = 4;
const ROCK_STAIR_STEP = 1.8;
const ROCK_STAIR_OFFSET = 3.0;

function generateTerrainProps(): TerrainProp[] {
  const rng = mulberry32(TERRAIN_SEED);
  const props: TerrainProp[] = [];
  const placed: PlacedSpot[] = [];

  const tryPlace = (radius: number): { x: number; z: number } | null => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const band = BANDS[Math.floor(rng() * BANDS.length)] ?? "edge";
      const { x, z } = sampleInBand(rng, band);
      if (!isAllowed(x, z, radius)) continue;
      let clear = true;
      for (const spot of placed) {
        if (Math.hypot(x - spot.x, z - spot.z) < spot.radius + radius + 2) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      placed.push({ x, z, radius });
      return { x, z };
    }
    return null;
  };

  // Plateaus: wide, flat-topped walkable rises. Per-tier height stays ≤2.4 so
  // the shared 2.5 step-up limit keeps every tier walkable; two-tier plateaus
  // emit a second, smaller prop stacked on top (total height ≤4.8).
  const PLATEAU_SITES = 5;
  for (let index = 0; index < PLATEAU_SITES; index += 1) {
    const spot = tryPlace(14);
    if (spot === null) break;
    const width = 14 + rng() * 12;
    const depth = 14 + rng() * 12;
    const height = 1.4 + rng() * 1.0;
    const rotation = rng() * Math.PI * 2;
    const id = `terrain-plateau-${index}`;
    props.push({
      id,
      kind: "plateau",
      x: spot.x,
      z: spot.z,
      rotation,
      scale: 1,
      collider: { id, x: spot.x, y: height / 2, z: spot.z, width, height, depth, material: "earth" },
    });
    if (rng() < 0.6) {
      const topHeight = 1.2 + rng() * 1.2;
      const topId = `terrain-plateau-${index}-top`;
      props.push({
        id: topId,
        kind: "plateau",
        x: spot.x,
        z: spot.z,
        rotation,
        scale: 1,
        collider: {
          id: topId,
          x: spot.x,
          y: height + topHeight / 2,
          z: spot.z,
          width: width * 0.55,
          height: topHeight,
          depth: depth * 0.55,
          material: "earth",
        },
      });
    }
  }

  // Hill-fortress stacks: 4-6 tiers reaching 6-10 m at each hill fort (the
  // capture point sits on the top tier), and the mountain landmark stack —
  // the tallest in the map (6 tiers ≈ 13 m) — at a pure vista position.
  for (const site of STACK_SITES) {
    let cumulative = 0;
    let footprint = site.base;
    for (let tier = 0; tier < site.tiers; tier += 1) {
      const height = site.x === 0 && site.z === -260 ? 1.9 + rng() * 0.5 : 1.6 + rng() * 0.6;
      const offsetX = tier === 0 ? 0 : (rng() - 0.5) * 3;
      const offsetZ = tier === 0 ? 0 : (rng() - 0.5) * 3;
      const x = site.x + offsetX;
      const z = site.z + offsetZ;
      const id = `terrain-stack-${site.x}-${site.z}-${tier}`;
      cumulative += height;
      props.push({
        id,
        kind: "plateau",
        x,
        z,
        rotation: 0,
        scale: 1,
        collider: {
          id,
          x,
          y: cumulative - height / 2,
          z,
          width: footprint,
          height,
          depth: footprint,
          material: "earth",
        },
      });
      footprint *= 0.85;
    }
    placed.push({ x: site.x, z: site.z, radius: site.base / 2 + 4 });
  }

  // Rocks: low-poly boulders, 1.5-3.5 m footprint, 1-2.5 m tall.
  const ROCK_TARGET = 40;
  for (let index = 0; index < ROCK_TARGET; index += 1) {
    const spot = tryPlace(3);
    if (spot === null) break;
    const width = 1.5 + rng() * 2;
    const depth = 1.5 + rng() * 2;
    const height = 1 + rng() * 1.5;
    const id = `terrain-rock-${index}`;
    props.push({
      id,
      kind: "rock",
      x: spot.x,
      z: spot.z,
      rotation: rng() * Math.PI * 2,
      scale: 0.9 + rng() * 0.4,
      collider: { id, x: spot.x, y: height / 2, z: spot.z, width, height, depth, material: "stone" },
    });
  }

  // Rock-stair clusters: staggered lines of rocks whose tops rise
  // ROCK_STAIR_STEP (≤ MAX_STEP_UP) per rock, so the cluster is climbable
  // like natural stairs with the existing step-up collision.
  for (let cluster = 0; cluster < ROCK_STAIR_CLUSTERS; cluster += 1) {
    const anchor = tryPlace(8);
    if (anchor === null) continue;
    const direction = rng() * Math.PI * 2;
    const sinDirection = Math.sin(direction);
    const cosDirection = Math.cos(direction);
    const baseId = `terrain-rock-stair-${cluster}`;
    for (let index = 0; index < ROCK_STAIR_PER_CLUSTER; index += 1) {
      const x = anchor.x + cosDirection * index * ROCK_STAIR_OFFSET;
      const z = anchor.z + sinDirection * index * ROCK_STAIR_OFFSET;
      const top = (index + 1) * ROCK_STAIR_STEP;
      const width = 2.8 + rng() * 0.8;
      const depth = 2.4 + rng() * 0.6;
      const id = `${baseId}-${index}`;
      props.push({
        id,
        kind: "rock",
        x,
        z,
        rotation: rng() * Math.PI * 2,
        scale: 1,
        collider: { id, x, y: top / 2, z, width, height: top, depth, material: "stone" },
      });
      placed.push({ x, z, radius: Math.max(width, depth) / 2 + 0.5 });
    }
  }

  // Trees: trunk-only colliders (0.6×3.5×0.6); the canopy is visual only.
  const TREE_TARGET = 48;
  for (let index = 0; index < TREE_TARGET; index += 1) {
    const spot = tryPlace(2);
    if (spot === null) break;
    const id = `terrain-tree-${index}`;
    props.push({
      id,
      kind: "tree",
      x: spot.x,
      z: spot.z,
      rotation: rng() * Math.PI * 2,
      scale: 0.9 + rng() * 0.7,
      collider: { id, x: spot.x, y: 1.75, z: spot.z, width: 0.6, height: 3.5, depth: 0.6, material: "wood" },
    });
  }

  return props;
}

export const TERRAIN_PROPS: readonly TerrainProp[] = generateTerrainProps();
