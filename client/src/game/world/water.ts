import * as THREE from "three";
import { heightAt, RIVER_FORDS, RIVER_HALF_WIDTH, RIVER_HEADWATER, RIVER_SEGMENTS, WATER_SURFACE_Y } from "@janissary/shared";

/**
 * Procedural Golden Horn harbor water plus the Phase 8c-4b western river.
 *
 * The sea is a single flat plane spanning the strait from the shoreline
 * (`shoreZ`) to z = 900 (the Phase 8c-4 world edge). The river is a ribbon
 * strip following RIVER_SEGMENTS with mitred joints, terminating in a disc
 * over the RIVER_HEADWATER lake. Both are displaced in the vertex stage by
 * summed directional sine waves and shaded with a foam band, ripple normal
 * wobble and grazing-angle fresnel injected into MeshStandardMaterial via
 * onBeforeCompile, so they still respond to the scene's warm dawn lighting
 * and fog.
 *
 * The sea takes its foam from a straight z-line shore (`uShoreZ`); the river
 * instead bakes a per-vertex `aShoreDist` attribute (meters to the nearest
 * bank / lake rim) so the same lapping-stripe foam follows the winding
 * channel and the lake rim. The two RIVER_FORDS shallows get a dedicated
 * treatment so the safe crossings read from a distance: a sandy tint and
 * calm damped swell in the shader, plus a visible riverbed disc, surfacing
 * stones and worn dirt approach tracks as ordinary static meshes.
 *
 * All water geometry is authored in local XY and rotated -PI/2 like the sea
 * plane, so the shared wave injection (which displaces local +z expecting
 * that convention) applies verbatim.
 */

export interface HarborWater {
  /** Sea + river + headwater lake + ford dressing; add this to the scene. */
  readonly group: THREE.Group;
  /** Drive with a monotonic clock (seconds) every frame. */
  update(elapsedSeconds: number): void;
  setQuality(quality: "low" | "medium" | "high"): void;
}

type WaterQuality = "low" | "medium" | "high";

/** Segments per axis of the underlying 1800x1800 plane, and wave height (m). */
const QUALITY_SETTINGS: Record<WaterQuality, { segmentsX: number; segmentsY: number; waveHeight: number }> = {
  low: { segmentsX: 32, segmentsY: 16, waveHeight: 0.09 },
  medium: { segmentsX: 64, segmentsY: 32, waveHeight: 0.14 },
  high: { segmentsX: 96, segmentsY: 48, waveHeight: 0.17 },
};

/**
 * River tessellation per quality: centerline row spacing (m), vertices
 * across the channel, and radial segments of the headwater lake disc. The
 * ford dressing (bed / stones / tracks) is cheap static geometry and stays
 * quality-independent.
 */
const RIVER_QUALITY_SETTINGS: Record<WaterQuality, { spacing: number; columns: number; lakeSegments: number }> = {
  low: { spacing: 12, columns: 4, lakeSegments: 24 },
  medium: { spacing: 7, columns: 6, lakeSegments: 36 },
  high: { spacing: 4.5, columns: 8, lakeSegments: 48 },
};

/** Rivers run gentler than the open strait: same waves, smaller amplitude. */
const RIVER_WAVE_SCALE = 0.6;

/** Far edge of the strait; the plane spans [shoreZ, WATER_FAR_Z]. */
const WATER_FAR_Z = 900;
/** Full world width of the water plane. */
const WATER_WIDTH = 1800;

/** Surface height of every water mesh (sea, river, lake). 8e-17: the value
 * lives in shared (`WATER_SURFACE_Y`) so the client-only `impactHeightAt`
 * visual stops agree with the meshes by construction. */
export const WATER_Y = WATER_SURFACE_Y;

/**
 * Shared wave field: three directional sine waves (wavelengths ~16 / 9 / 5.5 m)
 * summed into a height and an analytic gradient. Used by the vertex stage for
 * displacement and by the fragment stage for normal wobble. `uWaveHeight`
 * scales the result so quality levels can dial amplitude without recompiling.
 */
const WAVE_GLSL = /* glsl */ `
uniform float uTime;
uniform float uWaveHeight;

float harborWaveHeight(vec2 p, float t) {
  float h = 0.0;
  h += 0.50 * sin(dot(p, vec2(0.376, 0.132)) - t * 0.90);
  h += 0.30 * sin(dot(p, vec2(-0.419, 0.698)) - t * 1.35);
  h += 0.20 * sin(dot(p, vec2(0.229, -1.143)) - t * 1.90);
  return h * uWaveHeight;
}

vec2 harborWaveGradient(vec2 p, float t) {
  vec2 g = vec2(0.0);
  g += 0.50 * cos(dot(p, vec2(0.376, 0.132)) - t * 0.90) * vec2(0.376, 0.132);
  g += 0.30 * cos(dot(p, vec2(-0.419, 0.698)) - t * 1.35) * vec2(-0.419, 0.698);
  g += 0.20 * cos(dot(p, vec2(0.229, -1.143)) - t * 1.90) * vec2(0.229, -1.143);
  return g * uWaveHeight;
}
`;

/** Cheap 2D value noise for the foam break-up. */
const NOISE_GLSL = /* glsl */ `
float harborHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float harborNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(harborHash(i), harborHash(i + vec2(1.0, 0.0)), u.x),
    mix(harborHash(i + vec2(0.0, 1.0)), harborHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
`;

/** Matches the onBeforeCompile parameter type without importing internals. */
type WaterShader = Parameters<THREE.MeshStandardMaterial["onBeforeCompile"]>[0];

/** Deterministic PRNG for ford stone placement (mirrors cameraFeel.ts). */
const mulberry32 = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

function buildWaterGeometry(quality: WaterQuality): THREE.PlaneGeometry {
  const { segmentsX, segmentsY } = QUALITY_SETTINGS[quality];
  return new THREE.PlaneGeometry(WATER_WIDTH, WATER_WIDTH, segmentsX, segmentsY);
}

/**
 * River ribbon: a tessellated strip following the RIVER_SEGMENTS polyline
 * with mitred joints, RIVER_HALF_WIDTH to each side. Authored in the sea
 * plane's local convention — local (x, y) maps to world (x, -z) under
 * rotation.x = -PI/2 — with UVs in the sea plane's 0..1-over-1800 m space so
 * the shared water texture samples at the same world density, and an
 * `aShoreDist` attribute holding each vertex's distance (m) to the nearest
 * bank. Both polyline ends butt into other water (the sea at z = 230, the
 * headwater lake at the tail), so no end caps are needed.
 */
function buildRiverGeometry(spacing: number, columns: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const first = RIVER_SEGMENTS[0];
  if (!first) return geometry;

  // Centerline in local coords (local y = -world z).
  const points: { x: number; y: number }[] = [{ x: first.x1, y: -first.z1 }];
  for (const segment of RIVER_SEGMENTS) points.push({ x: segment.x2, y: -segment.z2 });

  // Per-segment direction/length and lateral normal. The normal convention
  // n = (dir.y, -dir.x) keeps the index winding below counter-clockwise in
  // local XY, so the strip faces local +z (world up after the rotation).
  const segmentDirections: { dx: number; dy: number; length: number }[] = [];
  const segmentNormals: { nx: number; ny: number }[] = [];
  for (let i = 0; i < RIVER_SEGMENTS.length; i++) {
    const from = points[i];
    const to = points[i + 1];
    if (!from || !to) continue;
    const rawX = to.x - from.x;
    const rawY = to.y - from.y;
    const length = Math.hypot(rawX, rawY) || 1;
    const dx = rawX / length;
    const dy = rawY / length;
    segmentDirections.push({ dx, dy, length });
    segmentNormals.push({ nx: dy, ny: -dx });
  }

  // Per-vertex frames: plain normals at the ends, mitred at interior joints
  // (miter scale widens the row so the banks meet without wedge gaps).
  const frames: { nx: number; ny: number; miter: number }[] = [];
  const fallbackNormal = { nx: 0, ny: 1 };
  for (let i = 0; i < points.length; i++) {
    const previous = segmentNormals[i - 1];
    const next = segmentNormals[i];
    if (!previous || !next) {
      const normal = previous ?? next ?? fallbackNormal;
      frames.push({ nx: normal.nx, ny: normal.ny, miter: 1 });
      continue;
    }
    const miterLength = Math.hypot(previous.nx + next.nx, previous.ny + next.ny);
    if (miterLength < 1e-4) {
      frames.push({ nx: next.nx, ny: next.ny, miter: 1 });
      continue;
    }
    const nx = (previous.nx + next.nx) / miterLength;
    const ny = (previous.ny + next.ny) / miterLength;
    const alignment = Math.max(nx * next.nx + ny * next.ny, 0.5);
    frames.push({ nx, ny, miter: Math.min(1 / alignment, 2) });
  }

  // Cumulative arclength at each polyline vertex, for UV v.
  const vertexDistances: number[] = [0];
  for (const direction of segmentDirections) {
    vertexDistances.push((vertexDistances[vertexDistances.length - 1] ?? 0) + direction.length);
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const shoreDistances: number[] = [];
  const indices: number[] = [];
  let rowCount = 0;

  for (let s = 0; s < segmentDirections.length; s++) {
    const direction = segmentDirections[s];
    const from = points[s];
    const to = points[s + 1];
    const segmentNormal = segmentNormals[s];
    const baseDistance = vertexDistances[s];
    if (!direction || !from || !to || !segmentNormal || baseDistance === undefined) continue;
    const steps = Math.max(1, Math.round(direction.length / spacing));
    // Rows at polyline vertices take the mitred frame; the first joint row
    // of a segment was already emitted as the previous segment's last row.
    for (let j = s === 0 ? 0 : 1; j <= steps; j++) {
      const t = j / steps;
      const frame = (j === 0 ? frames[s] : j === steps ? frames[s + 1] : undefined) ?? {
        nx: segmentNormal.nx,
        ny: segmentNormal.ny,
        miter: 1,
      };
      const cx = from.x + (to.x - from.x) * t;
      const cy = from.y + (to.y - from.y) * t;
      const rowDistance = baseDistance + direction.length * t;
      for (let c = 0; c < columns; c++) {
        const across = columns === 1 ? 0 : (c / (columns - 1)) * 2 - 1;
        const lateral = across * RIVER_HALF_WIDTH * frame.miter;
        positions.push(cx + frame.nx * lateral, cy + frame.ny * lateral, 0);
        normals.push(0, 0, 1);
        // UVs in the sea plane's 0..1-over-WATER_WIDTH space so the shared
        // texture repeat (78, 8) yields the same world-space texel density.
        uvs.push((across * RIVER_HALF_WIDTH) / WATER_WIDTH, rowDistance / WATER_WIDTH);
        shoreDistances.push(RIVER_HALF_WIDTH * (1 - Math.abs(across)));
      }
      rowCount += 1;
    }
  }

  for (let r = 0; r < rowCount - 1; r++) {
    for (let c = 0; c < columns - 1; c++) {
      const a = r * columns + c;
      const b = a + 1;
      const below = a + columns;
      const belowRight = below + 1;
      indices.push(a, b, below, b, belowRight, below);
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aShoreDist", new THREE.Float32BufferAttribute(shoreDistances, 1));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Headwater lake: a plain disc (CircleGeometry already lies in local XY with
 * +z normals), with UVs remapped to the sea plane's world-density space and
 * `aShoreDist` holding each vertex's distance (m) in from the rim.
 */
function buildLakeGeometry(radialSegments: number): THREE.BufferGeometry {
  const geometry: THREE.BufferGeometry = new THREE.CircleGeometry(RIVER_HEADWATER.radius, radialSegments);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  const shoreDistances = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    uv.setXY(i, x / WATER_WIDTH, y / WATER_WIDTH);
    shoreDistances[i] = Math.max(RIVER_HEADWATER.radius - Math.hypot(x, y), 0);
  }
  geometry.setAttribute("aShoreDist", new THREE.BufferAttribute(shoreDistances, 1));
  return geometry;
}

/** Normalized direction of the river segment nearest to a world point. */
function riverDirectionNear(x: number, z: number): { dx: number; dz: number } {
  let bestDistanceSquared = Infinity;
  let best = { dx: 0, dz: -1 };
  for (const segment of RIVER_SEGMENTS) {
    const sx = segment.x2 - segment.x1;
    const sz = segment.z2 - segment.z1;
    const lengthSquared = sx * sx + sz * sz || 1;
    const t = Math.max(0, Math.min(1, ((x - segment.x1) * sx + (z - segment.z1) * sz) / lengthSquared));
    const px = segment.x1 + sx * t;
    const pz = segment.z1 + sz * t;
    const distanceSquared = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      const length = Math.hypot(sx, sz) || 1;
      best = { dx: sx / length, dz: sz / length };
    }
  }
  return best;
}

/** Stones breaking the surface per ford. */
const FORD_STONE_COUNT = 7;
/** Dirt approach track dimensions (m): width across, length along the bank. */
const FORD_TRACK_WIDTH = 3.4;
const FORD_TRACK_LENGTH = 13;

/**
 * Static ford dressing (quality-independent): a sandy riverbed oval just
 * under the water surface, an instanced scatter of partially submerged
 * stones (deterministic, seeded per ford), and worn dirt approach tracks on
 * both banks. 8e-17: the terrain now carves the channel (ford beds sit at
 * -0.35 m), so the bed oval stays just under the surface to read as the
 * sandy shallows shelf, and the approach tracks are DRAPED over the carved
 * bank — the old flat quads floated on the slope.
 */
function buildFordGroup(): THREE.Group {
  const group = new THREE.Group();
  group.name = "river-fords";

  // Sandy gravel, matching the map's dirt palette.
  const bedMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8a06a,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  // Packed earth, darker than the bed so the tracks read as worn-in.
  const trackMaterial = new THREE.MeshStandardMaterial({
    color: 0x8f7350,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a867c,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });

  // Unit geometries, baked flat; per-ford meshes scale/rotate them. The
  // track strips are built per-ford (draped over the carved bank), so only
  // the bed shares geometry.
  const bedGeometry = new THREE.CircleGeometry(1, 26);
  bedGeometry.rotateX(-Math.PI / 2);

  const stoneGeometry = new THREE.IcosahedronGeometry(1, 0);
  const stones = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, RIVER_FORDS.length * FORD_STONE_COUNT);
  stones.name = "river-ford-stones";
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  let stoneIndex = 0;

  RIVER_FORDS.forEach((ford, fordIndex) => {
    const direction = riverDirectionNear(ford.x, ford.z);
    // Crossing normal: perpendicular to the local river direction.
    const nx = -direction.dz;
    const nz = direction.dx;

    // Riverbed oval, elongated across the channel so it extends a little
    // past both waterlines and reads as a shallows shelf.
    const bed = new THREE.Mesh(bedGeometry, bedMaterial);
    bed.name = `river-ford-bed-${fordIndex}`;
    bed.position.set(ford.x, WATER_Y - 0.015, ford.z);
    bed.rotation.y = Math.atan2(-nz, nx);
    bed.scale.set((ford.radius + 2) * 1.25, 1, (ford.radius + 2) * 0.9);
    group.add(bed);

    // Worn dirt tracks leading into the water on both banks, draped over the
    // carved terrain (8e-17): vertices sample heightAt along the strip so the
    // track follows the bank down into the shallows instead of floating as a
    // flat quad. polygonOffset keeps it clear of the ground.
    for (const side of [-1, 1]) {
      const offset = side * (RIVER_HALF_WIDTH + FORD_TRACK_LENGTH / 2 - 1.5);
      const cx = ford.x + nx * offset;
      const cz = ford.z + nz * offset;
      const yaw = Math.atan2(nx, nz);
      const geometry = new THREE.PlaneGeometry(FORD_TRACK_WIDTH, FORD_TRACK_LENGTH, 1, 8);
      geometry.rotateX(-Math.PI / 2);
      const positions = geometry.attributes.position as THREE.BufferAttribute;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      for (let vi = 0; vi < positions.count; vi += 1) {
        const lx = positions.getX(vi);
        const lz = positions.getZ(vi);
        const wx = cx + lx * cos + lz * sin;
        const wz = cz - lx * sin + lz * cos;
        positions.setY(vi, heightAt(wx, wz) + 0.03);
      }
      geometry.computeVertexNormals();
      const track = new THREE.Mesh(geometry, trackMaterial);
      track.name = `river-ford-track-${fordIndex}-${side < 0 ? "a" : "b"}`;
      track.position.set(cx, 0, cz);
      track.rotation.y = yaw;
      group.add(track);
    }

    // Partially submerged stones scattered through the ford (seeded, so the
    // layout is identical every session).
    const rng = mulberry32((0x5eed5eed + fordIndex * 0x9e3779b9) | 0);
    for (let i = 0; i < FORD_STONE_COUNT; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = ford.radius * (0.2 + rng() * 0.65);
      const size = 0.35 + rng() * 0.45;
      position.set(ford.x + Math.cos(angle) * radius, -0.15 + rng() * 0.25, ford.z + Math.sin(angle) * radius);
      quaternion.setFromEuler(euler.set(0, rng() * Math.PI * 2, 0));
      scale.set(size, size * 0.5, size);
      matrix.compose(position, quaternion, scale);
      stones.setMatrixAt(stoneIndex, matrix);
      stoneIndex += 1;
    }
  });

  group.add(stones);
  return group;
}

export function createHarborWater(waterTexture: THREE.Texture, shoreZ: number): HarborWater {
  // Deep strait blue-green; the map's #27496b base is normalized out in the
  // shader so this color, not the texture's hue, dominates the final look.
  const deepColor = new THREE.Color(0x24485c);
  const foamColor = new THREE.Color(0xe8e4d8);
  // Sky/fog color (0xa9c7db) warmed toward the daylight sun tint.
  const skyColor = new THREE.Color(0xa9c7db).lerp(new THREE.Color(0xfff1d2), 0.22);
  const mapBaseColor = new THREE.Color(0x27496b);
  // Sandy gravel tint for the ford shallows, matching the ford bed meshes.
  const shallowColor = new THREE.Color(0xb8a06a).lerp(deepColor, 0.35);

  const uTime: THREE.IUniform<number> = { value: 0 };
  const uWaveHeight: THREE.IUniform<number> = { value: QUALITY_SETTINGS.high.waveHeight };
  const uRiverWaveHeight: THREE.IUniform<number> = { value: QUALITY_SETTINGS.high.waveHeight * RIVER_WAVE_SCALE };
  const uShoreZ: THREE.IUniform<number> = { value: shoreZ };
  const uFoamColor: THREE.IUniform<THREE.Color> = { value: foamColor };
  const uSkyColor: THREE.IUniform<THREE.Color> = { value: skyColor };
  const uMapBaseColor: THREE.IUniform<THREE.Color> = { value: mapBaseColor };
  const uShallowColor: THREE.IUniform<THREE.Color> = { value: shallowColor };
  // Ford circles as (x, z, radius); missing entries park a tiny ford far off-map.
  const fordFallback = { x: 9999, z: 9999, radius: 0.01 };
  const fordA = RIVER_FORDS[0] ?? fordFallback;
  const fordB = RIVER_FORDS[1] ?? fordFallback;
  const uFordA: THREE.IUniform<THREE.Vector3> = { value: new THREE.Vector3(fordA.x, fordA.z, fordA.radius) };
  const uFordB: THREE.IUniform<THREE.Vector3> = { value: new THREE.Vector3(fordB.x, fordB.z, fordB.radius) };

  const material = new THREE.MeshStandardMaterial({
    color: deepColor,
    map: waterTexture,
    // Matte stylized water: no environment map or reflected-scene render.
    // The shader's analytic Fresnel tint is a few arithmetic operations only.
    roughness: 0.48,
    metalness: 0,
    transparent: true,
    opacity: 0.85,
  });

  waterTexture.repeat.set(78, 8);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uWaveHeight = uWaveHeight;
    shader.uniforms.uShoreZ = uShoreZ;
    shader.uniforms.uFoamColor = uFoamColor;
    shader.uniforms.uSkyColor = uSkyColor;
    shader.uniforms.uMapBaseColor = uMapBaseColor;

    shader.vertexShader = `
${WAVE_GLSL}
varying vec3 vWaterWorldPos;
${shader.vertexShader}`
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `
vec3 transformed = vec3( position );
{
  // Displace in world units: local +z maps to world +y for this plane
  // (rotation.x = -PI/2, unit scale on the z axis), so adding the wave
  // height to transformed.z lifts the surface vertically.
  vec3 baseWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  transformed.z += harborWaveHeight( baseWorld.xz, uTime );
}`,
      )
      .replace(
        "#include <worldpos_vertex>",
        /* glsl */ `
#include <worldpos_vertex>
vWaterWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`,
      );

    shader.fragmentShader = `
${WAVE_GLSL}
${NOISE_GLSL}
uniform float uShoreZ;
uniform vec3 uFoamColor;
uniform vec3 uSkyColor;
uniform vec3 uMapBaseColor;
varying vec3 vWaterWorldPos;
${shader.fragmentShader}`
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
#include <map_fragment>
{
  // Re-normalize the texture sample around its #27496b base so the map
  // contributes highlight/detail strokes without shifting the deep base hue.
  // map_fragment already multiplied the sample into diffuseColor, so dividing
  // by the base color leaves ~1.0 luminance detail on top of material.color.
  diffuseColor.rgb = clamp( diffuseColor.rgb / uMapBaseColor, vec3( 0.0 ), vec3( 1.0 ) );
}`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        /* glsl */ `
#include <normal_fragment_begin>
{
  // Ripple normal wobble from the wave gradient (world -> view space).
  vec2 gradient = harborWaveGradient( vWaterWorldPos.xz, uTime );
  vec3 rippleWorld = vec3( -gradient.x, 1.0, -gradient.y );
  vec3 rippleView = normalize( mat3( viewMatrix ) * rippleWorld );
  normal = normalize( mix( normal, rippleView, 0.65 ) );
}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
#include <emissivemap_fragment>
{
  // Foam band: within ~6 m of the shoreline, animated sine stripes broken
  // up by value noise scroll toward the shore and gently pulse.
  float shoreDist = max( vWaterWorldPos.z - uShoreZ, 0.0 );
  float band = 1.0 - smoothstep( 0.0, 6.0, shoreDist );
  float foamNoise = harborNoise( vWaterWorldPos.xz * 0.8 + vec2( uTime * 0.12, -uTime * 0.2 ) );
  float stripes = sin( shoreDist * 2.6 - uTime * 1.4 + foamNoise * 4.0 );
  float crest = smoothstep( 0.25, 0.85, stripes * 0.5 + 0.5 );
  float pulse = 0.75 + 0.25 * sin( uTime * 0.9 - shoreDist * 0.8 );
  float lapping = ( 1.0 - smoothstep( 0.0, 1.2, shoreDist ) ) * ( 0.55 + 0.45 * foamNoise );
  float foam = clamp( band * crest * pulse + lapping * 0.6, 0.0, 1.0 );
  diffuseColor.rgb = mix( diffuseColor.rgb, uFoamColor, foam * 0.75 );
  totalEmissiveRadiance += uFoamColor * foam * 0.12;

  // Subtle fresnel brightening of grazing angles toward the sky/fog color.
  vec3 viewDir = normalize( vViewPosition );
  float fresnel = pow( 1.0 - clamp( dot( normal, viewDir ), 0.0, 1.0 ), 3.0 );
  totalEmissiveRadiance += uSkyColor * fresnel * 0.18;
}`,
      );
  };
  // Distinct program cache key so this material never shares a compiled
  // program with a plain MeshStandardMaterial.
  material.customProgramCacheKey = () => "harbor-water";

  /**
   * River/lake variant of the water shader. Same wave field, texture
   * treatment, ripple wobble and fresnel as the sea, but the foam band is
   * driven by the per-vertex `aShoreDist` attribute (distance to the nearest
   * bank / lake rim) instead of a straight z-line shore, and the two ford
   * circles lighten the tint, damp the swell and add gentle ripple rings.
   */
  const injectRiverShader = (shader: WaterShader): void => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uWaveHeight = uRiverWaveHeight;
    shader.uniforms.uFoamColor = uFoamColor;
    shader.uniforms.uSkyColor = uSkyColor;
    shader.uniforms.uMapBaseColor = uMapBaseColor;
    shader.uniforms.uShallowColor = uShallowColor;
    shader.uniforms.uFordA = uFordA;
    shader.uniforms.uFordB = uFordB;

    shader.vertexShader = `
${WAVE_GLSL}
uniform vec3 uFordA;
uniform vec3 uFordB;
attribute float aShoreDist;
varying float vShoreDist;
varying vec2 vRiverUv;
varying vec3 vWaterWorldPos;
${shader.vertexShader}`
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `
vec3 transformed = vec3( position );
{
  // Same -PI/2 local-XY convention as the sea plane: local +z is world up.
  vec3 baseWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  // Fords are shallows: damp the swell inside the ford circles so the
  // crossings read as calm water from a distance.
  float outsideA = smoothstep( uFordA.z * 0.6, uFordA.z, distance( baseWorld.xz, uFordA.xy ) );
  float outsideB = smoothstep( uFordB.z * 0.6, uFordB.z, distance( baseWorld.xz, uFordB.xy ) );
  float fordCalm = 1.0 - 0.7 * ( 1.0 - min( outsideA, outsideB ) );
  transformed.z += harborWaveHeight( baseWorld.xz, uTime ) * fordCalm;
  vShoreDist = aShoreDist;
  vRiverUv = uv;
}`,
      )
      .replace(
        "#include <worldpos_vertex>",
        /* glsl */ `
#include <worldpos_vertex>
vWaterWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`,
      );

    shader.fragmentShader = `
${WAVE_GLSL}
${NOISE_GLSL}
uniform vec3 uFoamColor;
uniform vec3 uSkyColor;
uniform vec3 uMapBaseColor;
uniform vec3 uShallowColor;
uniform vec3 uFordA;
uniform vec3 uFordB;
varying float vShoreDist;
varying vec2 vRiverUv;
varying vec3 vWaterWorldPos;
${shader.fragmentShader}`
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
#include <map_fragment>
{
  // Same base-color re-normalization as the sea (see harbor-water).
  diffuseColor.rgb = clamp( diffuseColor.rgb / uMapBaseColor, vec3( 0.0 ), vec3( 1.0 ) );
}`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        /* glsl */ `
#include <normal_fragment_begin>
{
  // Ripple normal wobble from the wave gradient (world -> view space).
  vec2 gradient = harborWaveGradient( vWaterWorldPos.xz, uTime );
  vec3 rippleWorld = vec3( -gradient.x, 1.0, -gradient.y );
  vec3 rippleView = normalize( mat3( viewMatrix ) * rippleWorld );
  normal = normalize( mix( normal, rippleView, 0.65 ) );
}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
#include <emissivemap_fragment>
{
  // Bank foam: identical treatment to the sea shore, but the shore distance
  // comes from the aShoreDist attribute so it follows the winding channel
  // banks and the headwater lake rim.
  float shoreDist = max( vShoreDist, 0.0 );
  float band = 1.0 - smoothstep( 0.0, 6.0, shoreDist );
  float foamNoise = harborNoise( vWaterWorldPos.xz * 0.8 + vec2( uTime * 0.12, -uTime * 0.2 ) );
  float stripes = sin( shoreDist * 2.6 - uTime * 1.4 + foamNoise * 4.0 );
  float crest = smoothstep( 0.25, 0.85, stripes * 0.5 + 0.5 );
  float pulse = 0.75 + 0.25 * sin( uTime * 0.9 - shoreDist * 0.8 );
  float lapping = ( 1.0 - smoothstep( 0.0, 1.2, shoreDist ) ) * ( 0.55 + 0.45 * foamNoise );
  float foam = clamp( band * crest * pulse + lapping * 0.6, 0.0, 1.0 );
  diffuseColor.rgb = mix( diffuseColor.rgb, uFoamColor, foam * 0.75 );
  totalEmissiveRadiance += uFoamColor * foam * 0.12;

  // Phase 8e-5 Task 4: downstream current + muddy banks. The river UV's v
  // axis runs along the channel toward the sea (rowDistance 0 at the sea
  // end), so noise scrolled toward +v reads as flow; x is stretched thin so
  // the streaks elongate along the channel. Muddy wash near the banks ties
  // the water into the biome mud on the ground side.
  float current = harborNoise( vec2( vRiverUv.x * 900.0, vRiverUv.y * 26.0 + uTime * 0.42 ) );
  float currentLines = smoothstep( 0.52, 0.9, current ) * ( 1.0 - band );
  diffuseColor.rgb = mix( diffuseColor.rgb, uFoamColor, currentLines * 0.14 );
  float bankMud = 1.0 - smoothstep( 0.5, 3.0, vShoreDist );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.38, 0.35, 0.28 ), bankMud * 0.3 );

  // Ford shallows: a sandy wash over the wadeable bed plus slow concentric
  // ripple rings, so the safe crossings are obvious from across the map.
  float fordDistA = distance( vWaterWorldPos.xz, uFordA.xy );
  float fordDistB = distance( vWaterWorldPos.xz, uFordB.xy );
  float fordMaskA = 1.0 - smoothstep( uFordA.z * 0.55, uFordA.z, fordDistA );
  float fordMaskB = 1.0 - smoothstep( uFordB.z * 0.55, uFordB.z, fordDistB );
  float shallow = max( fordMaskA, fordMaskB );
  diffuseColor.rgb = mix( diffuseColor.rgb, uShallowColor, shallow * 0.55 );
  float fordRipples = smoothstep( 0.55, 1.0, sin( min( fordDistA, fordDistB ) * 2.1 - uTime * 2.2 ) * 0.5 + 0.5 ) * shallow;
  diffuseColor.rgb = mix( diffuseColor.rgb, uFoamColor, fordRipples * 0.35 );
  totalEmissiveRadiance += uFoamColor * fordRipples * 0.1;

  // Same grazing-angle fresnel lift toward the sky/fog color as the sea.
  vec3 viewDir = normalize( vViewPosition );
  float fresnel = pow( 1.0 - clamp( dot( normal, viewDir ), 0.0, 1.0 ), 3.0 );
  totalEmissiveRadiance += uSkyColor * fresnel * 0.18;
}`,
      );
  };

  const riverMaterial = new THREE.MeshStandardMaterial({
    color: deepColor,
    map: waterTexture,
    roughness: 0.48,
    metalness: 0,
    transparent: true,
    opacity: 0.85,
  });
  riverMaterial.onBeforeCompile = injectRiverShader;
  riverMaterial.customProgramCacheKey = () => "river-water";

  // The lake reuses the river program; the ribbon tail overlaps it (the
  // polyline's last point sits inside the lake circle), so the lake is
  // polygon-offset to always lose the depth tie in the overlap. Both share
  // the same world-space wave field, so the junction is seamless.
  const lakeMaterial = new THREE.MeshStandardMaterial({
    color: deepColor,
    map: waterTexture,
    roughness: 0.48,
    metalness: 0,
    transparent: true,
    opacity: 0.85,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
  });
  lakeMaterial.onBeforeCompile = injectRiverShader;
  lakeMaterial.customProgramCacheKey = () => "river-water";

  const mesh = new THREE.Mesh(buildWaterGeometry("high"), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, WATER_Y, (shoreZ + WATER_FAR_Z) / 2);
  mesh.scale.set(1, (WATER_FAR_Z - shoreZ) / WATER_WIDTH, 1);
  mesh.name = "harbor-water";

  // Ribbon vertices are baked in world coordinates (local x = world x,
  // local y = -world z), so the mesh itself sits at the origin.
  const riverMesh = new THREE.Mesh(buildRiverGeometry(RIVER_QUALITY_SETTINGS.high.spacing, RIVER_QUALITY_SETTINGS.high.columns), riverMaterial);
  riverMesh.rotation.x = -Math.PI / 2;
  riverMesh.position.y = WATER_Y;
  riverMesh.name = "river-water";

  const lakeMesh = new THREE.Mesh(buildLakeGeometry(RIVER_QUALITY_SETTINGS.high.lakeSegments), lakeMaterial);
  lakeMesh.rotation.x = -Math.PI / 2;
  lakeMesh.position.set(RIVER_HEADWATER.x, WATER_Y, RIVER_HEADWATER.z);
  lakeMesh.name = "river-headwater";

  const group = new THREE.Group();
  group.name = "water";
  group.add(mesh, riverMesh, lakeMesh, buildFordGroup());

  let quality: WaterQuality = "high";

  return {
    group,
    update(elapsedSeconds: number): void {
      uTime.value = elapsedSeconds;
      // Slow drift of the highlight strokes, matching the old plane's scroll.
      // The river/lake share this texture, and their v axis runs along the
      // channel, so the same scroll reads as a gentle downstream flow there.
      waterTexture.offset.x = elapsedSeconds * 0.006;
      waterTexture.offset.y = elapsedSeconds * 0.002;
    },
    setQuality(next: WaterQuality): void {
      if (next === quality) return;
      quality = next;
      uWaveHeight.value = QUALITY_SETTINGS[next].waveHeight;
      uRiverWaveHeight.value = QUALITY_SETTINGS[next].waveHeight * RIVER_WAVE_SCALE;
      const riverSettings = RIVER_QUALITY_SETTINGS[next];
      const previousSea = mesh.geometry;
      mesh.geometry = buildWaterGeometry(next);
      previousSea.dispose();
      const previousRiver = riverMesh.geometry;
      riverMesh.geometry = buildRiverGeometry(riverSettings.spacing, riverSettings.columns);
      previousRiver.dispose();
      const previousLake = lakeMesh.geometry;
      lakeMesh.geometry = buildLakeGeometry(riverSettings.lakeSegments);
      previousLake.dispose();
    },
  };
}
