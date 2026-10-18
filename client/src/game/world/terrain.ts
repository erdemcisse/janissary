import * as THREE from "three";
import { TERRAIN_PROPS, type TerrainProp } from "@janissary/shared";
import { groundFit, loadModel, tintedMaterial, type LoadedModel } from "../models/loader";
import { TERRAIN_ROCK_MODELS, TERRAIN_TREE_MODELS } from "../models/manifest";

export interface TerrainVisuals {
  readonly group: THREE.Group;
  readonly plateaus: readonly { x: number; z: number; topY: number }[];
  /** Internal: procedural rock/tree placeholder meshes, swapped out and disposed by upgradeTerrainVisuals. */
  readonly propPlaceholders?: readonly THREE.InstancedMesh[];
  /**
   * The landmark mountain stack (ids "terrain-stack-0--260-*"), when present
   * in the shared layout: top-tier center, top surface height, and the top
   * tier's rendered top radius. Exposed for camera/vista framing; the
   * wind-blown tree line is planted from the same facts.
   */
  readonly mountain?: { readonly x: number; readonly z: number; readonly topY: number; readonly topRadius: number };
}

function cloneWithRepeat(texture: THREE.Texture, repeatX: number, repeatY: number): THREE.Texture {
  const clone = texture.clone();
  clone.repeat.set(repeatX, repeatY);
  clone.needsUpdate = true;
  return clone;
}

// Stack-tier id prefixes, matching shared/terrain-props.ts: stack props are
// `terrain-stack-${site.x}-${site.z}-${tier}`, so the landmark mountain at
// (0,-260) is "terrain-stack-0--260-<tier>" and the three hill forts carry
// the generic "terrain-stack-" prefix on every other site.
const STACK_PREFIX = "terrain-stack-";
const MOUNTAIN_STACK_PREFIX = "terrain-stack-0--260-";

function stackTierIndex(id: string): number {
  const tier = Number(id.slice(id.lastIndexOf("-") + 1));
  return Number.isInteger(tier) && tier >= 0 ? tier : 0;
}

/** mulberry32 — same fixed-seed pattern as shared/terrain-props.ts. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOUNTAIN_SIDE_COLOR = 0x6f7468;
const MOUNTAIN_TOP_COLOR = 0x8a7c66;
// Phase 8e-5: lifted from 0xaea28c — steep frustum faces sit off the low
// former low dawn sun, so the side albedo was lifted to read as rocky, not black.
const HILL_FORT_SIDE_TINT = 0xcdbfa9;
// Radial silhouette jitter for mountain tiers (±5%): enough to read as crag
// strata, small enough to stay inside the walkable collider's slack.
const CRAG_JITTER = 0.1;
const CYLINDER_SEGMENTS = 14;

/**
 * Crags a plateau cylinder's silhouette deterministically: every ring vertex
 * at the same angle gets the same radial scale (per row), so caps and side
 * walls stay welded — only the XZ outline becomes faceted rock. Y is never
 * touched, so stacked tiers keep flush contact.
 */
function cragJitter(geometry: THREE.BufferGeometry, tier: number, bottomRadius: number): void {
  const rng = mulberry32(0x5f3561 + Math.imul(tier + 1, 0x9e3779));
  const jitter: number[] = [];
  for (let index = 0; index < CYLINDER_SEGMENTS * 2; index += 1) {
    jitter.push(1 + (rng() - 0.5) * CRAG_JITTER);
  }
  const segmentWidth = (Math.PI * 2) / CYLINDER_SEGMENTS;
  const position = geometry.getAttribute("position");
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const x = position.getX(vertex);
    const z = position.getZ(vertex);
    if (Math.hypot(x, z) < bottomRadius * 0.1) continue; // cap center vertices
    // CylinderGeometry rings lie at theta = k * segmentWidth with
    // x = r*sin(theta), z = r*cos(theta), so round() lands every ring vertex
    // dead-center of its jitter cell — no seam cracks.
    const theta = Math.atan2(x, z);
    const segment = ((Math.round(theta / segmentWidth) % CYLINDER_SEGMENTS) + CYLINDER_SEGMENTS) % CYLINDER_SEGMENTS;
    const row = position.getY(vertex) > 0 ? 1 : 0;
    const factor = jitter[row * CYLINDER_SEGMENTS + segment] ?? 1;
    position.setX(vertex, x * factor);
    position.setZ(vertex, z * factor);
  }
}

interface MountainTop {
  readonly x: number;
  readonly z: number;
  readonly topY: number;
  readonly topRadius: number;
}

/**
 * Derives the mountain's top tier straight from TERRAIN_PROPS (nothing
 * hardcoded): highest stack tier at the mountain site, its top surface Y and
 * rendered top radius (footprint/2 × the 0.78 frustum taper; the mesh scale
 * is 1 because stack footprints are square).
 */
function mountainTopInfo(): MountainTop | undefined {
  let topTier: TerrainProp | undefined;
  for (const prop of TERRAIN_PROPS) {
    if (!prop.id.startsWith(MOUNTAIN_STACK_PREFIX)) continue;
    if (topTier === undefined || prop.collider.y > topTier.collider.y) topTier = prop;
  }
  if (topTier === undefined) return undefined;
  return {
    x: topTier.x,
    z: topTier.z,
    topY: topTier.collider.y + topTier.collider.height / 2,
    topRadius: (Math.max(topTier.collider.width, topTier.collider.depth) / 2) * 0.78,
  };
}

/**
 * Wind-blown tree line on the mountain top — fixed spots (deterministic, no
 * RNG) as fractions of the top-tier radius, all within ~0.7× of center so
 * every trunk stands on the top surface. leanZ 0.06-0.1 sells the wind; all
 * trees lean the same way with slight per-tree tilt variation.
 */
const MOUNTAIN_TREE_LINE: readonly {
  readonly angle: number;
  readonly distance: number;
  readonly scale: number;
  readonly yaw: number;
  readonly leanX: number;
  readonly leanZ: number;
}[] = [
  { angle: 0.55, distance: 0.58, scale: 1.0, yaw: 0.4, leanX: 0.02, leanZ: 0.09 },
  { angle: 1.75, distance: 0.66, scale: 0.8, yaw: 2.1, leanX: -0.02, leanZ: 0.07 },
  { angle: 2.9, distance: 0.34, scale: 0.9, yaw: 4.4, leanX: 0.01, leanZ: 0.08 },
  { angle: 4.2, distance: 0.62, scale: 0.7, yaw: 1.2, leanX: -0.01, leanZ: 0.06 },
  { angle: 5.4, distance: 0.5, scale: 0.85, yaw: 3.3, leanX: 0.025, leanZ: 0.1 },
];

/** Windswept peak trees stay shorter than the lowland cypress (6.5 m). */
const MOUNTAIN_TREE_HEIGHT = 4.8;

function treeLineSpotPosition(mountain: MountainTop, spot: (typeof MOUNTAIN_TREE_LINE)[number]): { x: number; z: number } {
  return {
    x: mountain.x + Math.cos(spot.angle) * spot.distance * mountain.topRadius,
    z: mountain.z + Math.sin(spot.angle) * spot.distance * mountain.topRadius,
  };
}

/** Procedural fallback tree line: same trunk+cone register as the placeholder cypress. */
function buildMountainTreeLine(mountain: MountainTop): THREE.Group {
  const group = new THREE.Group();
  group.name = "mountainTreeLine";
  const trunkGeometry = new THREE.CylinderGeometry(0.24, 0.34, 3.5, 7);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 });
  const canopyGeometry = new THREE.ConeGeometry(1.15, 3.8, 8);
  const canopyMaterial = new THREE.MeshStandardMaterial({ color: 0x33402f, flatShading: true, roughness: 1 });
  for (const spot of MOUNTAIN_TREE_LINE) {
    const { x, z } = treeLineSpotPosition(mountain, spot);
    // Lean pivots at the base (yaw on the children) so the wind direction
    // stays consistent across trees and roots stay planted.
    const pivot = new THREE.Group();
    pivot.position.set(x, mountain.topY, z);
    pivot.rotation.set(spot.leanX, 0, spot.leanZ);
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 1.75 * spot.scale;
    trunk.rotation.y = spot.yaw;
    trunk.scale.setScalar(spot.scale);
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.position.y = 3.5 * spot.scale + 1.9 * spot.scale - 0.4;
    canopy.rotation.y = spot.yaw;
    canopy.scale.setScalar(spot.scale);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    pivot.add(trunk);
    pivot.add(canopy);
    group.add(pivot);
  }
  return group;
}

/** Disposes a procedural tree-line group's private geometries/materials (deduped — children share them). */
function disposeTreeLine(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry);
      const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of nodeMaterials) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

/**
 * Rock-stair clusters ("terrain-rock-stair-*") render through the generic
 * rock path; this tiny deterministic per-rock width jitter (±6%) makes each
 * stair step read as its own slab. Used in BOTH the placeholder and sourced
 * rock paths so their matrices stay identical.
 */
function rockStairWidthJitter(id: string): number {
  if (!id.startsWith("terrain-rock-stair-")) return 1;
  return 1 + (variantIndex(id, 5) - 2) * 0.03;
}

/**
 * Builds the procedural terrain set dressing (plateaus, rocks, trees) from the
 * deterministic shared TERRAIN_PROPS layout. Meshes are static: instanced
 * matrices are written once with StaticDrawUsage, and plateau geometry is a
 * one-time construction. Colliders for these props come from the shared data
 * (ids prefixed "terrain-"), so the render loop must skip those for the
 * default static-box visuals.
 *
 * Stack tiers get site-aware treatments: plains plateaus keep grass-over-dirt,
 * hill-fort stacks keep grass tops (walkable capture high ground) over a
 * rockier tinted dirt side, and the landmark mountain stack gets flat-shaded
 * crag-jittered stone sides with per-tier strata tones plus a grey-brown
 * scree top, so it reads as the tallest, most distinct feature on the map.
 * The mountain top also gets a visual-only wind-blown tree line (procedural
 * placeholder, swapped for sourced dead trees by upgradeTerrainVisuals).
 */
export function buildTerrain(textures: { grass: THREE.Texture; dirt: THREE.Texture; stone: THREE.Texture }): TerrainVisuals {
  const group = new THREE.Group();
  group.name = "terrain";

  const plateauTops: { x: number; z: number; topY: number }[] = [];
  const propPlaceholders: THREE.InstancedMesh[] = [];
  const rocks: readonly TerrainProp[] = TERRAIN_PROPS.filter((prop) => prop.kind === "rock");
  const trees: readonly TerrainProp[] = TERRAIN_PROPS.filter((prop) => prop.kind === "tree");

  // Plateaus: beveled mounds — a squashed 14-sided cylinder frustum with a
  // flattened grass top and dirt sides, one mesh per prop (few total).
  const grassTop = cloneWithRepeat(textures.grass, 3, 3);
  const dirtSide = cloneWithRepeat(textures.dirt, 5, 1);
  const plateauSideMaterial = new THREE.MeshStandardMaterial({
    map: dirtSide,
    // Warm lift so shaded faces stay readable as dirt under clear daylight
    // (Phase 8e-5) — steep slopes get little of the low key light.
    color: 0xd6c9b2,
    roughness: 1,
  });
  const plateauTopMaterial = new THREE.MeshStandardMaterial({ map: grassTop, roughness: 1 });

  // Hill-fort stacks: grass tops (they hold capture points and must read as
  // walkable high ground) but stone-textured, flat-shaded sides tinted warm
  // so they read as rocky hills, not smooth dirt mounds (Phase 8e-5 — the
  // owner's "hills should have rocky texture"). Same collider, new paint.
  const hillFortSideMaterial = new THREE.MeshStandardMaterial({
    map: cloneWithRepeat(textures.stone, 5, 1),
    color: HILL_FORT_SIDE_TINT,
    flatShading: true,
    roughness: 1,
  });

  // Mountain stack: rock-face sides (flat-shaded stone, greener-grey) with a
  // per-tier tonal step so the strata read at distance, and a grey-brown
  // scree top instead of grass. One cached side material per tier index.
  const mountainSideTexture = cloneWithRepeat(textures.stone, 6, 1);
  const mountainSideMaterials = new Map<number, THREE.MeshStandardMaterial>();
  const mountainSideMaterial = (tier: number): THREE.MeshStandardMaterial => {
    let material = mountainSideMaterials.get(tier);
    if (material === undefined) {
      // Strata: adjacent tiers step ~5% in brightness so the layering reads.
      const tone = 0.94 + (tier % 3) * 0.05;
      material = new THREE.MeshStandardMaterial({
        map: mountainSideTexture,
        color: new THREE.Color(MOUNTAIN_SIDE_COLOR).multiplyScalar(tone),
        flatShading: true,
        roughness: 1,
      });
      mountainSideMaterials.set(tier, material);
    }
    return material;
  };
  const mountainTopMaterial = new THREE.MeshStandardMaterial({
    map: cloneWithRepeat(textures.stone, 4, 4),
    color: MOUNTAIN_TOP_COLOR,
    flatShading: true,
    roughness: 1,
  });

  for (const prop of TERRAIN_PROPS) {
    if (prop.kind !== "plateau") continue;
    const { width, height, depth } = prop.collider;
    const bottomRadius = Math.max(width, depth) / 2;
    const geometry = new THREE.CylinderGeometry(bottomRadius * 0.78, bottomRadius, height, CYLINDER_SEGMENTS, 1, false);
    let sideMaterial = plateauSideMaterial;
    let topMaterial = plateauTopMaterial;
    if (prop.id.startsWith(MOUNTAIN_STACK_PREFIX)) {
      const tier = stackTierIndex(prop.id);
      sideMaterial = mountainSideMaterial(tier);
      topMaterial = mountainTopMaterial;
      cragJitter(geometry, tier, bottomRadius);
    } else if (prop.id.startsWith(STACK_PREFIX)) {
      sideMaterial = hillFortSideMaterial;
    }
    const mesh = new THREE.Mesh(geometry, [sideMaterial, topMaterial, sideMaterial]);
    mesh.position.set(prop.x, prop.collider.y, prop.z);
    mesh.rotation.y = prop.rotation;
    mesh.scale.set(width / (bottomRadius * 2), 1, depth / (bottomRadius * 2));
    mesh.receiveShadow = true;
    group.add(mesh);
    plateauTops.push({ x: prop.x, z: prop.z, topY: prop.collider.y + height / 2 });
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scaleVector = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();

  // Rocks: one InstancedMesh of low-poly icosahedra, slight per-instance
  // scale/rotation jitter baked into the static matrices.
  if (rocks.length > 0) {
    const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
    const rockMaterial = new THREE.MeshStandardMaterial({
      map: cloneWithRepeat(textures.stone, 1, 1),
      color: 0xb8b4aa,
      flatShading: true,
      roughness: 1,
    });
    const rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, rocks.length);
    rocks.forEach((prop, index) => {
      position.set(prop.x, prop.collider.y * 0.85, prop.z);
      quaternion.setFromEuler(euler.set(0, prop.rotation, 0));
      const widthJitter = rockStairWidthJitter(prop.id);
      scaleVector.set(
        (prop.collider.width / 2) * prop.scale * widthJitter,
        (prop.collider.height / 2) * prop.scale,
        (prop.collider.depth / 2) * prop.scale * widthJitter,
      );
      matrix.compose(position, quaternion, scaleVector);
      rockMesh.setMatrixAt(index, matrix);
    });
    rockMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    group.add(rockMesh);
    propPlaceholders.push(rockMesh);
  }

  // Trees: two InstancedMeshes — trunk cylinder plus a narrow dark cypress
  // cone canopy. The trunk matches the shared 0.6×3.5×0.6 collider.
  if (trees.length > 0) {
    const trunkGeometry = new THREE.CylinderGeometry(0.24, 0.34, 3.5, 7);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 });
    const trunkMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
    const canopyGeometry = new THREE.ConeGeometry(1.15, 3.8, 8);
    const canopyMaterial = new THREE.MeshStandardMaterial({ color: 0x2f4530, flatShading: true, roughness: 1 });
    const canopyMesh = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, trees.length);
    trees.forEach((prop, index) => {
      quaternion.setFromEuler(euler.set(0, prop.rotation, 0));
      matrix.compose(position.set(prop.x, 1.75, prop.z), quaternion, scaleVector.set(1, 1, 1));
      trunkMesh.setMatrixAt(index, matrix);
      const canopyScale = prop.scale;
      matrix.compose(
        position.set(prop.x, 3.5 + 1.9 * canopyScale - 0.4, prop.z),
        quaternion,
        scaleVector.set(canopyScale, canopyScale, canopyScale),
      );
      canopyMesh.setMatrixAt(index, matrix);
    });
    trunkMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    canopyMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    canopyMesh.castShadow = true;
    canopyMesh.receiveShadow = true;
    group.add(trunkMesh);
    group.add(canopyMesh);
    propPlaceholders.push(trunkMesh, canopyMesh);
  }

  const mountain = mountainTopInfo();
  const visuals: TerrainVisuals = {
    group,
    plateaus: plateauTops,
    propPlaceholders,
    ...(mountain !== undefined ? { mountain } : {}),
  };

  // Wind-blown tree line on the mountain top (visual only, no colliders).
  // Procedural now; upgradeTerrainVisuals swaps in the sourced dead trees.
  if (mountain !== undefined) {
    const treeLine = buildMountainTreeLine(mountain);
    mountainTreeLines.set(visuals, treeLine);
    group.add(treeLine);
  }

  return visuals;
}

/**
 * Rendered height of a sourced tree at prop.scale 1. The procedural cypress
 * tops out near 6.9 m (3.5 m trunk + canopy), so 6.5 m keeps the same
 * presence without the canopy variants dwarfing the wall.
 */
const TARGET_TREE_HEIGHT = 6.5;

const upgradedVisuals = new WeakSet<TerrainVisuals>();

/** Internal: procedural mountain tree line pending the sourced swap. */
const mountainTreeLines = new WeakMap<TerrainVisuals, THREE.Group>();

/** djb2 — stable per-prop variant pick, independent of prop array order. */
function variantIndex(id: string, variantCount: number): number {
  let hash = 5381;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 33 + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % variantCount;
}

function distributeById(props: readonly TerrainProp[], variantCount: number): TerrainProp[][] {
  const buckets: TerrainProp[][] = Array.from({ length: variantCount }, () => []);
  for (const prop of props) {
    const bucket = buckets[variantIndex(prop.id, variantCount)];
    if (bucket !== undefined) bucket.push(prop);
  }
  return buckets;
}

/**
 * Phase 8c-3: fire-and-forget swap of the procedural rock/tree placeholders
 * for the sourced CC0 glbs (one InstancedMesh per variant). Call once after
 * buildTerrain; the scene keeps rendering placeholders until the models
 * arrive, and keeps them permanently if any load fails. A second call on the
 * same visuals is a no-op. Also swaps the mountain tree line for sourced
 * windswept trees when a mountain stack exists.
 */
export function upgradeTerrainVisuals(visuals: TerrainVisuals): void {
  if (upgradedVisuals.has(visuals)) return;
  upgradedVisuals.add(visuals);
  void swapInSourcedModels(visuals);
  if (visuals.mountain !== undefined) void swapInMountainTreeLine(visuals, visuals.mountain);
}

async function swapInSourcedModels(visuals: TerrainVisuals): Promise<void> {
  let rockModels: LoadedModel[];
  let treeModels: LoadedModel[];
  try {
    [rockModels, treeModels] = await Promise.all([
      Promise.all(TERRAIN_ROCK_MODELS.map(loadModel)),
      Promise.all(TERRAIN_TREE_MODELS.map(loadModel)),
    ]);
  } catch (error) {
    console.warn("terrain: sourced model load failed, keeping procedural placeholders", error);
    return;
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scaleVector = new THREE.Vector3();
  const upgraded: THREE.InstancedMesh[] = [];

  // Rocks: groundFit to footprint 2 preserves the radius-1 convention of the
  // placeholder icosahedron, so the per-instance matrix composition is
  // identical to buildTerrain (y = collider.y * 0.85, collider/2 × scale,
  // plus the same rock-stair width jitter). Clone before fitting: generated
  // and sourced variants can also be requested by other visual layers.
  const rockVariants = distributeById(
    TERRAIN_PROPS.filter((prop) => prop.kind === "rock"),
    rockModels.length,
  );
  rockModels.forEach((model, variant) => {
    const props = rockVariants[variant];
    if (props === undefined || props.length === 0) return;
    const geometry = model.geometry.clone();
    groundFit(geometry, 2);
    // Same warm lift as the scatter rocks (Phase 8e-5): the kit's blue-grey
    // reads near-black in shade otherwise.
    const mesh = new THREE.InstancedMesh(geometry, tintedMaterial({ geometry, material: model.material }, 1.35, 1.25, 1.1), props.length);
    props.forEach((prop, index) => {
      position.set(prop.x, prop.collider.y * 0.85, prop.z);
      quaternion.setFromEuler(euler.set(0, prop.rotation, 0));
      const widthJitter = rockStairWidthJitter(prop.id);
      scaleVector.set(
        (prop.collider.width / 2) * prop.scale * widthJitter,
        (prop.collider.height / 2) * prop.scale,
        (prop.collider.depth / 2) * prop.scale * widthJitter,
      );
      matrix.compose(position, quaternion, scaleVector);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    upgraded.push(mesh);
  });

  // Trees: groundFit to footprint 1, then a per-variant uniform scale so the
  // rendered tree stands TARGET_TREE_HEIGHT × prop.scale tall with its base
  // at ground y=0 — same footprint as the placeholder cypress.
  const treeVariants = distributeById(
    TERRAIN_PROPS.filter((prop) => prop.kind === "tree"),
    treeModels.length,
  );
  treeModels.forEach((model, variant) => {
    const props = treeVariants[variant];
    if (props === undefined || props.length === 0) return;
    const geometry = model.geometry.clone();
    groundFit(geometry, 1);
    const box = geometry.boundingBox;
    if (box === null) return;
    const heightScale = TARGET_TREE_HEIGHT / Math.max(box.max.y - box.min.y, 1e-6);
    // Same foliage lift as the scatter trees (Phase 8e-5) — DarkGreen kit
    // foliage is near-black untinted.
    const mesh = new THREE.InstancedMesh(geometry, tintedMaterial({ geometry, material: model.material }, 2.1, 1.95, 1.65), props.length);
    props.forEach((prop, index) => {
      position.set(prop.x, 0, prop.z);
      quaternion.setFromEuler(euler.set(0, prop.rotation, 0));
      scaleVector.setScalar(heightScale * prop.scale);
      matrix.compose(position, quaternion, scaleVector);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    upgraded.push(mesh);
  });

  // Swap: drop the placeholders (owned here, safe to dispose) and add the
  // sourced meshes in their place.
  for (const placeholder of visuals.propPlaceholders ?? []) {
    visuals.group.remove(placeholder);
    placeholder.geometry.dispose();
    const materials = Array.isArray(placeholder.material) ? placeholder.material : [placeholder.material];
    for (const material of materials) material.dispose();
    placeholder.dispose();
  }
  for (const mesh of upgraded) visuals.group.add(mesh);
}

/**
 * Fire-and-forget swap of the mountain-top procedural tree line for sourced
 * trees from the existing manifest — mostly CommonTree_Dead_1 (windswept
 * peak) with one stunted CommonTree_1. Silent failure: any load error keeps
 * the procedural fallback. Geometries are cloned before groundFit so the
 * shared loadModel cache entries (also used, and groundFit-mutated, by
 * swapInSourcedModels) are never touched twice.
 */
async function swapInMountainTreeLine(visuals: TerrainVisuals, mountain: MountainTop): Promise<void> {
  let deadModel: LoadedModel;
  let greenModel: LoadedModel;
  try {
    [deadModel, greenModel] = await Promise.all([
      loadModel(TERRAIN_TREE_MODELS[2]),
      loadModel(TERRAIN_TREE_MODELS[0]),
    ]);
  } catch {
    return;
  }

  const group = new THREE.Group();
  group.name = "mountainTreeLine";
  MOUNTAIN_TREE_LINE.forEach((spot, index) => {
    // The dead tree carries the peak; a single stunted green sits mid-cluster.
    const source = index === 2 ? greenModel : deadModel;
    const geometry = source.geometry.clone();
    groundFit(geometry, 1);
    const box = geometry.boundingBox;
    if (box === null) {
      geometry.dispose();
      return;
    }
    const heightScale = (MOUNTAIN_TREE_HEIGHT * spot.scale) / Math.max(box.max.y - box.min.y, 1e-6);
    const { x, z } = treeLineSpotPosition(mountain, spot);
    const pivot = new THREE.Group();
    pivot.position.set(x, mountain.topY, z);
    pivot.rotation.set(spot.leanX, 0, spot.leanZ);
    // Phase 8e-5 kit lift: the green tree gets the full foliage tint, the
    // dead wood a mild one (dead trees should stay sombre, not black).
    const mesh = new THREE.Mesh(geometry, index === 2 ? tintedMaterial(source, 2.1, 1.95, 1.65) : tintedMaterial(source, 1.3, 1.25, 1.15));
    mesh.rotation.y = spot.yaw;
    mesh.scale.setScalar(heightScale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
  });

  // Swap: dispose the procedural fallback (its geometries/materials are
  // private to it) and plant the sourced trees. The sourced group is
  // terminal — its tinted material clones (Phase 8e-5) live as long as the
  // terrain itself, so it is never disposed here.
  const placeholder = mountainTreeLines.get(visuals);
  if (placeholder !== undefined) {
    visuals.group.remove(placeholder);
    disposeTreeLine(placeholder);
    mountainTreeLines.delete(visuals);
  }
  visuals.group.add(group);
}
