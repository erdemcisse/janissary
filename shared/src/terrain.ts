/**
 * Phase 8e-11 (ADR 0040): the continuous terrain heightfield — one source of
 * truth for ground height, sampled identically by the server sim, client
 * prediction, the client render mesh, and bots. Nothing about terrain crosses
 * the wire: both sides compute it from the same fixed seed and the same map
 * facts, so parity holds by construction.
 *
 * Revised by Phase 8e-17 (ADR 0044, "terrain like redcoats.io"):
 *
 * heightAt(x, z) = fieldHeightAt(x, z) * keepFlatMask(x, z) + riverCarveAt(x, z)
 *
 * - fieldHeightAt is layered position-hashed value noise with much bolder
 *   relief than 8e-11 (560/300 m swells, ±39.6 m noise bound) plus a broad
 *   elevation bias rising toward the city/wall side and a coastal taper that
 *   shrinks the field toward the sea band. It uses only integer hashing,
 *   Math.floor and IEEE-double arithmetic — deterministic across engines
 *   (Math.hypot may differ in the last ulp across libm implementations, which
 *   is ~1e-15 m against the 5 cm wire quantization), allocation-free, O(1).
 * - keepFlatMask is 0 (terrain pinned to exactly 0) around every
 *   gameplay-critical structure and rises to 1 through smoothstep feathers,
 *   so hills never cliff into the wall lane, captures, spawns, the river, or
 *   props. The protected set derives from the real shared data (no mirrored
 *   copies): the central siege corridor, the wall lane, the harbor capture,
 *   the river channel + headwater, the sea band, and every TERRAIN_PROPS
 *   footprint. With 3× taller terrain the feathers are ADAPTIVE (widened by
 *   the local field magnitude) so a 30 m hill next to a 12 m prop feather
 *   blends over a wide skirt instead of cliffing.
 * - riverCarveAt is an additive channel profile (bed below the water surface,
 *   a small levee lip at the bank line) that makes the river read as a carved
 *   channel with eroded margins (ADR 0044 Task 2 — this revisits 8e-11's
 *   flat-channel decision). It is zero inside bridge footprints (decks stay
 *   fully supported on flat ground) and fades at the sea mouth; fords keep a
 *   shallow bed so the wade crossing reads as a wade.
 *
 * Every water RULE stays an x,z-zone test (wade, drowning, galley draft), so
 * the carve changes no combat or movement semantics: the server sim reads the
 * raw heightAt exactly as before. The client additionally uses
 * impactHeightAt (surface-clamped over water) so visual tracers stop at the
 * water surface instead of diving to the carved bed.
 */

import { WATER_SHORE_Z, WATER_SURFACE_Y } from "./constants";
import {
  CAPTURE_POINTS,
  RIVER_BRIDGES,
  RIVER_FORDS,
  RIVER_HALF_WIDTH,
  RIVER_HEADWATER,
  RIVER_SEGMENTS,
  inRiver,
  riverCenterlineDistance,
} from "./map";
import { TERRAIN_PROPS } from "./terrain-props";

// ---------------------------------------------------------------------------
// Noise: position-hashed value noise, fully deterministic.
// ---------------------------------------------------------------------------

/** Decorrelates the terrain lattice from the client biome noise (same hash). */
const TERRAIN_HASH_SALT = 0x2f6e2b1d;

function hash2(ix: number, iz: number): number {
  let h = (ix * 374761393 + iz * 668265263 + TERRAIN_HASH_SALT) | 0;
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

/**
 * The terrain octaves (wavelength cell in meters, amplitude in meters).
 * 8e-17 retune toward the redcoats.io references: the relief budget sits in
 * the 560 m and 300 m swells — landforms tens of metres high and hundreds
 * wide that matter for sightlines and cannon arcs — while the 140/52 m
 * octaves keep slopes from reading as polygons. Worst-case aligned analytic
 * gradient of the noise is ~0.43; mask feathers and the carve dominate the
 * true bound (measured and pinned in terrain.test.ts).
 */
export const TERRAIN_OCTAVES: readonly { cell: number; amplitude: number; offsetX: number; offsetZ: number }[] = [
  { cell: 560, amplitude: 30, offsetX: 0, offsetZ: 0 },
  { cell: 300, amplitude: 11, offsetX: 157.31, offsetZ: 311.73 },
  { cell: 140, amplitude: 5, offsetX: -271.91, offsetZ: 523.17 },
  { cell: 52, amplitude: 2.2, offsetX: 719.13, offsetZ: -659.71 },
];

/** Sum of octave amplitudes: the hard bound on |noise| (before bias/mask). */
export const TERRAIN_MAX_HEIGHT = TERRAIN_OCTAVES.reduce((sum, octave) => sum + octave.amplitude, 0);

/**
 * Broad rise toward the city/wall side so the fortress reads as crowning
 * elevated ground (redcoats Twin_Peaks reference): +11 m at the keep center
 * (0, -30), fading over a 430 m radius. Gradient ≤ ~0.04 — a tilt, not a hill.
 */
const CITY_BIAS_CENTER_X = 0;
const CITY_BIAS_CENTER_Z = -30;
const CITY_BIAS_HEIGHT = 11;
const CITY_BIAS_RADIUS = 430;

/**
 * Coastal taper: shrinks the field toward the sea side so the beach/strait
 * blend stays gentle even with 3× taller terrain. Full strength up to
 * z = 40, 25% strength from z = 185 (where the sea mask blend begins).
 */
const COASTAL_TAPER_START_Z = 40;
const COASTAL_TAPER_END_Z = 185;
const COASTAL_TAPER_FLOOR = 0.25;

/** The unmasked rolling-field height: centered octaves + city bias, tapered. */
function fieldHeightAt(x: number, z: number): number {
  let noise = 0;
  for (const octave of TERRAIN_OCTAVES) {
    noise += (valueNoise(x + octave.offsetX, z + octave.offsetZ, octave.cell) - 0.5) * 2 * octave.amplitude;
  }
  const cityDistance = Math.hypot(x - CITY_BIAS_CENTER_X, z - CITY_BIAS_CENTER_Z);
  const bias = CITY_BIAS_HEIGHT * smoothstep01(1 - cityDistance / CITY_BIAS_RADIUS);
  const taper = 1 - (1 - COASTAL_TAPER_FLOOR) * smoothstep01((z - COASTAL_TAPER_START_Z) / (COASTAL_TAPER_END_Z - COASTAL_TAPER_START_Z));
  return (noise + bias) * taper;
}

/**
 * Hard bound on |fieldHeightAt| (noise bound + bias, taper only shrinks).
 * Sizes the adaptive mask feathers and their early-out bounds, and is the
 * relief-test bound (heightAt can exceed TERRAIN_MAX_HEIGHT by the bias).
 */
export const TERRAIN_FIELD_MAX_HEIGHT = TERRAIN_MAX_HEIGHT + CITY_BIAS_HEIGHT;

// ---------------------------------------------------------------------------
// Keep-flat mask. Each region contributes a factor in [0, 1]: 0 = terrain
// pinned exactly to 0, rising to full relief across a smoothstep feather.
// The mask is the MINIMUM over all region factors.
// ---------------------------------------------------------------------------

interface MaskRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly feather: number;
  /** AABB expanded by the feather: outside it the factor is 1 (early-out). */
  readonly boundMinX: number;
  readonly boundMaxX: number;
  readonly boundMinZ: number;
  readonly boundMaxZ: number;
}

interface MaskDisc {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly feather: number;
  readonly boundMinX: number;
  readonly boundMaxX: number;
  readonly boundMinZ: number;
  readonly boundMaxZ: number;
}

interface MaskCapsule {
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
  readonly radius: number;
  readonly feather: number;
  readonly boundMinX: number;
  readonly boundMaxX: number;
  readonly boundMinZ: number;
  readonly boundMaxZ: number;
}

/**
 * 8e-17: with 3× taller terrain a fixed feather cliffs into structure flats
 * (a 30 m hill beside a 12 m prop feather would need a gradient of ~3.75).
 * Feathers widen with the local field magnitude: feather_eff =
 * feather · (1 + |field| / MASK_ADAPTIVE_DIVISOR), capping the worst
 * mask-edge gradient near |field|·1.5/(feather·(1+|field|/6)) → ~0.75 for
 * the smallest feathers as |field| grows. |field| is continuous, so the
 * widened mask is continuous, and where the field crosses zero the feather
 * is exactly the base value (the kink in |field| is multiplied by 0).
 */
const MASK_ADAPTIVE_DIVISOR = 6;
/** Worst-case widening (|field| ≤ TERRAIN_FIELD_MAX_HEIGHT): sizes the early-out AABBs. */
const MASK_ADAPTIVE_MAX_FACTOR = 1 + TERRAIN_FIELD_MAX_HEIGHT / MASK_ADAPTIVE_DIVISOR;

function rectRegion(minX: number, maxX: number, minZ: number, maxZ: number, feather: number): MaskRect {
  const bound = feather * MASK_ADAPTIVE_MAX_FACTOR;
  return {
    minX, maxX, minZ, maxZ, feather,
    boundMinX: minX - bound, boundMaxX: maxX + bound,
    boundMinZ: minZ - bound, boundMaxZ: maxZ + bound,
  };
}

function discRegion(x: number, z: number, radius: number, feather: number): MaskDisc {
  const bound = feather * MASK_ADAPTIVE_MAX_FACTOR;
  return {
    x, z, radius, feather,
    boundMinX: x - radius - bound, boundMaxX: x + radius + bound,
    boundMinZ: z - radius - bound, boundMaxZ: z + radius + bound,
  };
}

function capsuleRegion(x1: number, z1: number, x2: number, z2: number, radius: number, feather: number): MaskCapsule {
  const bound = feather * MASK_ADAPTIVE_MAX_FACTOR;
  return {
    x1, z1, x2, z2, radius, feather,
    boundMinX: Math.min(x1, x2) - radius - bound, boundMaxX: Math.max(x1, x2) + radius + bound,
    boundMinZ: Math.min(z1, z2) - radius - bound, boundMaxZ: Math.max(z1, z2) + radius + bound,
  };
}

/**
 * The engineered heart of the siege: gate, breach field, defender platform,
 * inner city, both spawn zones, the cannon staging row and the push corridor.
 * One rectangle keeps the whole approach exactly as flat as it has always been.
 */
const CENTRAL_CORRIDOR = rectRegion(-40, 40, -125, 130, 25);
/** The wall line itself plus the assault lanes at its feet and the stairs. */
const WALL_LANE = rectRegion(-90, 90, -15, 15, 20);

const MASK_RECTS: readonly MaskRect[] = [
  CENTRAL_CORRIDOR,
  WALL_LANE,
  // Bridge decks are 36 m boxes centered up to ~7 m off the river centerline,
  // so their ends reach ~25 m out — beyond the channel capsule's 18 m flat
  // radius (independent-review finding R1: the south bridge's east end floated
  // ~1.5 m over a feather dip and the support test turned the deck into a
  // wall). Flatten each footprint with a 1 m margin, blend over 12 m.
  ...RIVER_BRIDGES.map((bridge) =>
    rectRegion(
      bridge.x - bridge.width / 2 - 1,
      bridge.x + bridge.width / 2 + 1,
      bridge.z - bridge.depth / 2 - 1,
      bridge.z + bridge.depth / 2 + 1,
      12,
    ),
  ),
];

const MASK_DISCS: readonly MaskDisc[] = (() => {
  const discs: MaskDisc[] = [];
  // Harbor-road capture (the only capture outside the corridor / stack discs).
  const harbor = CAPTURE_POINTS.find((point) => point.id === "HARBOR_ROAD");
  if (harbor !== undefined) discs.push(discRegion(harbor.x, harbor.z, harbor.radius + 6, 16));
  // Headwater lake: the circular basin plus a bank margin.
  discs.push(discRegion(RIVER_HEADWATER.x, RIVER_HEADWATER.z, RIVER_HEADWATER.radius + 3, 18));
  // Every terrain prop sits on locally flat ground: walkable plateaus and
  // hill-fort stacks need it (their colliders are absolute boxes based at 0),
  // and rocks/trees get a small settling disc so they never float or bury.
  for (const prop of TERRAIN_PROPS) {
    const halfDiagonal = Math.sqrt(prop.collider.width * prop.collider.width + prop.collider.depth * prop.collider.depth) / 2;
    if (prop.kind === "plateau") {
      discs.push(discRegion(prop.x, prop.z, halfDiagonal + 2, 20));
    } else if (prop.kind === "rock") {
      discs.push(discRegion(prop.x, prop.z, halfDiagonal + 1, 14));
    } else {
      discs.push(discRegion(prop.x, prop.z, halfDiagonal + 0.8, 12));
    }
  }
  return discs;
})();

/**
 * The river channel: 8e-17 carves the bed additively (see riverCarveAt), so
 * the mask only has to keep the FIELD off the water strip — flat to
 * HALF_WIDTH + 1, hills blending in just past the levee lip (d = 17).
 */
const MASK_CAPSULES: readonly MaskCapsule[] = RIVER_SEGMENTS.map((segment) =>
  capsuleRegion(segment.x1, segment.z1, segment.x2, segment.z2, RIVER_HALF_WIDTH + 1, 14),
);

// Sea band (the Golden Horn strait): flat water from just before the wade
// line across to the far shore; hills blend in over the beach on this side
// and resume past the strait on the far side.
const SEA_LAND_BLEND_START_Z = 185;
const SEA_FLAT_START_Z = WATER_SHORE_Z - 8; // 222: 3 m of flat beach before the wade band
const SEA_FLAT_END_Z = 318;
const SEA_FAR_BLEND_END_Z = 345;

function smoothstep01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * The keep-flat factor at a point: 0 = terrain exactly 0, 1 = full relief.
 * Exported for tests and for the client biome bake (slope/scree derivation).
 * Feathers adapt to the local field magnitude (see MASK_ADAPTIVE_DIVISOR).
 */
export function terrainMaskAt(x: number, z: number): number {
  return maskFactorAt(x, z, Math.abs(fieldHeightAt(x, z)));
}

function maskFactorAt(x: number, z: number, fieldMagnitude: number): number {
  // Sea band first: it covers the largest area and short-circuits to flat.
  const sea = Math.max(
    1 - smoothstep01((z - SEA_LAND_BLEND_START_Z) / (SEA_FLAT_START_Z - SEA_LAND_BLEND_START_Z)),
    smoothstep01((z - SEA_FLAT_END_Z) / (SEA_FAR_BLEND_END_Z - SEA_FLAT_END_Z)),
  );
  if (sea <= 0) return 0;
  let mask = sea;
  const featherScale = 1 + fieldMagnitude / MASK_ADAPTIVE_DIVISOR;
  for (const rect of MASK_RECTS) {
    if (x < rect.boundMinX || x > rect.boundMaxX || z < rect.boundMinZ || z > rect.boundMaxZ) continue;
    const outsideX = Math.max(rect.minX - x, 0, x - rect.maxX);
    const outsideZ = Math.max(rect.minZ - z, 0, z - rect.maxZ);
    const factor = smoothstep01(Math.hypot(outsideX, outsideZ) / (rect.feather * featherScale));
    if (factor <= 0) return 0;
    mask = Math.min(mask, factor);
  }
  for (const capsule of MASK_CAPSULES) {
    if (x < capsule.boundMinX || x > capsule.boundMaxX || z < capsule.boundMinZ || z > capsule.boundMaxZ) continue;
    const dx = capsule.x2 - capsule.x1;
    const dz = capsule.z2 - capsule.z1;
    const lengthSquared = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - capsule.x1) * dx + (z - capsule.z1) * dz) / lengthSquared));
    const cx = capsule.x1 + dx * t;
    const cz = capsule.z1 + dz * t;
    const distance = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz)) - capsule.radius;
    const factor = smoothstep01(distance / (capsule.feather * featherScale));
    if (factor <= 0) return 0;
    mask = Math.min(mask, factor);
  }
  for (const disc of MASK_DISCS) {
    if (x < disc.boundMinX || x > disc.boundMaxX || z < disc.boundMinZ || z > disc.boundMaxZ) continue;
    const dx = x - disc.x;
    const dz = z - disc.z;
    const distance = Math.sqrt(dx * dx + dz * dz) - disc.radius;
    const factor = smoothstep01(distance / (disc.feather * featherScale));
    if (factor <= 0) return 0;
    mask = Math.min(mask, factor);
  }
  return mask;
}

/**
 * Terrain surface height (feet level) in meters. Exactly the carve profile
 * inside the river channel, exactly 0 inside every other keep-flat region;
 * rolling elsewhere. O(1), allocation-free, deterministic.
 */
export function heightAt(x: number, z: number): number {
  const field = fieldHeightAt(x, z);
  const carve = riverCarveAt(x, z);
  const mask = maskFactorAt(x, z, Math.abs(field));
  if (mask <= 0) return carve;
  return field * mask + carve;
}

// ---------------------------------------------------------------------------
// River carve (8e-17): an additive channel profile, applied AFTER the mask so
// the bed/levee shape is exact regardless of the field. Distances are in
// "centerline units": d ≤ RIVER_HALF_WIDTH is inside the water zone.
// ---------------------------------------------------------------------------

/** Flat bed out to this centerline distance, then the bank rises. */
const RIVER_CARVE_FLAT_HALF_WIDTH = 8;
/** Small levee lip just past the waterline hides the flat water-mesh edge. */
const RIVER_CARVE_LIP_HEIGHT = 0.12;
const RIVER_CARVE_LIP_END = RIVER_HALF_WIDTH + 2;
/** Bed depth (m below 0) in the deep channel and at fords. */
const RIVER_CARVE_BED_DEEP = 2.2;
const RIVER_CARVE_BED_FORD = 0.35;
/** Fords stay shallow through the wade zone + 2 m, deepening over 7 m past it. */
const RIVER_CARVE_FORD_FADE_START = 2;
const RIVER_CARVE_FORD_FADE_LENGTH = 7;
/** The carve fades in over this distance past bridge footprints (decks stay
 * fully supported on flat, uncarved ground) and out approaching the sea. */
const RIVER_CARVE_BRIDGE_BLEND = 10;
const RIVER_CARVE_MOUTH_FADE = 8;

/** The carved channel offset (≤ 0 in the bed, small positive lip at the bank). */
function riverCarveAt(x: number, z: number): number {
  // Cheap reject: the river + headwater live in a small west-map box and the
  // mouth fade ends the carve at the shore line.
  if (x < -360 || x > -290 || z < -265 || z >= WATER_SHORE_Z) return 0;
  const lake = Math.hypot(x - RIVER_HEADWATER.x, z - RIVER_HEADWATER.z) - (RIVER_HEADWATER.radius - RIVER_HALF_WIDTH);
  const d = Math.min(riverCenterlineDistance(x, z), lake);
  if (d >= RIVER_CARVE_LIP_END) return 0;

  // Fords keep a shallow bed through (and slightly beyond) the wade zone.
  let fordT = 0;
  for (const ford of RIVER_FORDS) {
    const distance = Math.hypot(x - ford.x, z - ford.z) - ford.radius;
    fordT = Math.max(fordT, smoothstep01((RIVER_CARVE_FORD_FADE_START + RIVER_CARVE_FORD_FADE_LENGTH - distance) / RIVER_CARVE_FORD_FADE_LENGTH));
  }
  const bed = RIVER_CARVE_BED_DEEP + (RIVER_CARVE_BED_FORD - RIVER_CARVE_BED_DEEP) * fordT;

  let profile: number;
  if (d <= RIVER_CARVE_FLAT_HALF_WIDTH) {
    profile = -bed;
  } else if (d < RIVER_HALF_WIDTH) {
    const t = smoothstep01((d - RIVER_CARVE_FLAT_HALF_WIDTH) / (RIVER_HALF_WIDTH - RIVER_CARVE_FLAT_HALF_WIDTH));
    profile = -bed + (RIVER_CARVE_LIP_HEIGHT + bed) * t;
  } else {
    profile = RIVER_CARVE_LIP_HEIGHT * (1 - smoothstep01((d - RIVER_HALF_WIDTH) / (RIVER_CARVE_LIP_END - RIVER_HALF_WIDTH)));
  }

  // Bridge footprints stay flat and uncarved (deck support); the carve
  // returns over RIVER_CARVE_BRIDGE_BLEND past the footprint margin.
  let bridgeKeep = 1;
  for (const bridge of RIVER_BRIDGES) {
    const outsideX = Math.max(bridge.x - bridge.width / 2 - 1 - x, 0, x - (bridge.x + bridge.width / 2 + 1));
    const outsideZ = Math.max(bridge.z - bridge.depth / 2 - 1 - z, 0, z - (bridge.z + bridge.depth / 2 + 1));
    bridgeKeep = Math.min(bridgeKeep, smoothstep01(Math.hypot(outsideX, outsideZ) / RIVER_CARVE_BRIDGE_BLEND));
  }
  // Fade the carve out at the sea mouth so it meets the flat strait bed.
  const mouth = smoothstep01((WATER_SHORE_Z - z) / RIVER_CARVE_MOUTH_FADE);
  // Early-out on zero multipliers: keeps bridge decks and the mouth exactly
  // +0 (a negative profile times 0 would produce -0 and break flatness pins).
  if (bridgeKeep <= 0 || mouth <= 0) return 0;
  return profile * bridgeKeep * mouth;
}

/**
 * Client-only visual variant of heightAt: over water zones the surface
 * height is the water surface, not the carved bed, so tracers and shell
 * mirrors stop (and splash) at the surface instead of diving under it.
 * The server sim NEVER uses this — combat semantics read raw heightAt.
 */
export function impactHeightAt(x: number, z: number): number {
  const ground = heightAt(x, z);
  if (z > WATER_SHORE_Z || inRiver(x, z)) return Math.max(ground, WATER_SURFACE_Y);
  return ground;
}

// ---------------------------------------------------------------------------
// Gradient / rays.
// ---------------------------------------------------------------------------

/** Finite-difference step for the terrain gradient (meters). */
const TERRAIN_GRADIENT_EPSILON = 1;

/**
 * The terrain gradient dH/dx, dH/dz at a point (central differences), written
 * into `out` (no allocation). Gentle everywhere by design: the noise bound is
 * ~0.43 and the mask-feather/carve bounds are measured in terrain.test.ts.
 */
export function terrainGradientAt(x: number, z: number, out: { x: number; z: number }): void {
  out.x = (heightAt(x + TERRAIN_GRADIENT_EPSILON, z) - heightAt(x - TERRAIN_GRADIENT_EPSILON, z)) / (2 * TERRAIN_GRADIENT_EPSILON);
  out.z = (heightAt(x, z + TERRAIN_GRADIENT_EPSILON) - heightAt(x, z - TERRAIN_GRADIENT_EPSILON)) / (2 * TERRAIN_GRADIENT_EPSILON);
}

/**
 * Conservative |gradient| bound used by the ray marcher: above the measured
 * map-wide maximum (0.56 after the 8e-17 retune, pinned in terrain.test.ts)
 * with margin for the analytic worst case — |∇h| ≤ |∇field| + |field|·1.5 /
 * (feather·(1+|field|/6)) stays ≤ ~0.8 even where a deep pocket meets the
 * smallest (12 m) prop/bridge feather, and the carve bank adds ≤ 0.5 — so a
 * step can never skip over a crossing, while staying large enough that steps
 * stay coarse on open ground.
 */
const TERRAIN_RAY_MAX_GRADIENT = 1.25;
const TERRAIN_RAY_MIN_STEP = 0.75;
const TERRAIN_RAY_BISECT_ITERATIONS = 6;

/**
 * Marches a ray against the heightfield and returns the distance to the first
 * terrain crossing, or undefined if the ray stays above ground out to
 * `maximumDistance`. Sphere-traced: the safe step is the current clearance
 * divided by the worst closing rate (ray descent + terrain rise), so open
 * shots take few large steps and only the final bracket is bisected.
 * `direction` must be normalized. Deterministic; used by the server's hitscan
 * and earthwork aim and by the client's visual ball stops.
 */
export function raycastTerrain(
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  maximumDistance: number,
): number | undefined {
  let clearance = originY - heightAt(originX, originZ);
  if (clearance <= 0) return 0;
  const closingRate = Math.max(0, -directionY) + TERRAIN_RAY_MAX_GRADIENT;
  let t = 0;
  while (t < maximumDistance) {
    const next = Math.min(maximumDistance, t + Math.max(TERRAIN_RAY_MIN_STEP, clearance / closingRate));
    const nextClearance = originY + directionY * next - heightAt(originX + directionX * next, originZ + directionZ * next);
    if (nextClearance <= 0) {
      let lo = t;
      let hi = next;
      for (let iteration = 0; iteration < TERRAIN_RAY_BISECT_ITERATIONS; iteration += 1) {
        const mid = (lo + hi) / 2;
        const midClearance = originY + directionY * mid - heightAt(originX + directionX * mid, originZ + directionZ * mid);
        if (midClearance <= 0) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    if (next === maximumDistance) return undefined;
    t = next;
    clearance = nextClearance;
  }
  return undefined;
}
