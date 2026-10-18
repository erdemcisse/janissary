import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Phase 8c-3: single load path for every sourced model. GLTFLoader wrapped
 * with a load-once promise cache keyed by path — the same "build once, share
 * from a module cache" convention as soldierModels.ts. Callers never block
 * the render loop: they either fire-and-forget a swap-in callback or await
 * during scene setup.
 *
 * Each glb is flattened to ONE merged BufferGeometry (node transforms baked,
 * non-indexed) plus ONE material, so the result drops straight into the
 * existing InstancedMesh batches:
 * - Color-only kits (the obj2gltf-converted Quaternius packs, whose MTL files
 *   carry flat Kd colors and no textures) get each primitive's material color
 *   baked into a vertex-color attribute and share one MeshStandardMaterial
 *   with vertexColors — matching the game's flat-color register exactly.
 * - Textured kits (Kenney pirate kit: one texture atlas per file) merge to a
 *   single geometry and keep the glTF material with its atlas map.
 */
export interface LoadedModel {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
}

// The sorted Kenney Pirate Kit GLBs reference this atlas by an external
// `Textures/colormap.png` URI, but the atlas was not included in the original
// asset drop. Returning a tiny embedded warm wood swatch for this one known
// path keeps the galley/dock/tower models loadable and readable on potato
// hardware without adding a network dependency or hiding other missing
// texture errors. The affected meshes are still credited as Kenney assets.
const MISSING_KENNEY_ATLAS_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4P7ssFAAHEwJm/mZHMgAAAABJRU5ErkJggg==";

export function resolveModelResourceUrl(url: string): string {
  return /\/textures\/colormap\.png(?:\?.*)?$/i.test(url) ? MISSING_KENNEY_ATLAS_DATA_URI : url;
}

const loader = new GLTFLoader();
loader.manager.setURLModifier(resolveModelResourceUrl);
const cache = new Map<string, Promise<LoadedModel>>();

interface PrimitiveSlice {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
}

function normalizeAttributes(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.index !== null ? source.toNonIndexed() : source.clone();
  const position = geometry.getAttribute("position");
  if (geometry.getAttribute("uv") === undefined) {
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(position.count * 2), 2));
  }
  const keep = new Set(["position", "normal", "uv"]);
  for (const name of Object.keys(geometry.attributes)) {
    if (!keep.has(name)) geometry.deleteAttribute(name);
  }
  if (geometry.getAttribute("normal") === undefined) geometry.computeVertexNormals();
  return geometry;
}

/** Splits a mesh into per-material primitives with the node transform baked in. */
function primitivesOf(mesh: THREE.Mesh): PrimitiveSlice[] {
  const geometry = normalizeAttributes(mesh.geometry);
  geometry.applyMatrix4(mesh.matrixWorld);
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (materials.length === 1 || geometry.groups.length === 0) {
    return [{ geometry, material: materials[0] as THREE.Material }];
  }
  const slices: PrimitiveSlice[] = [];
  for (const group of geometry.groups) {
    const material = materials[group.materialIndex ?? 0] as THREE.Material | undefined;
    if (material === undefined) continue;
    const slice = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      const attribute = geometry.getAttribute(name);
      const array = attribute.array.slice(group.start * attribute.itemSize, (group.start + group.count) * attribute.itemSize);
      slice.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize));
    }
    slices.push({ geometry: slice, material });
  }
  return slices;
}

function bakeColor(geometry: THREE.BufferGeometry, color: THREE.Color): void {
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** Merges every mesh in a glTF scene into a single geometry + one material. */
export function mergeGltfScene(scene: THREE.Group): LoadedModel {
  scene.updateMatrixWorld(true);
  const primitives: PrimitiveSlice[] = [];
  scene.traverse((node) => {
    if (node instanceof THREE.Mesh) primitives.push(...primitivesOf(node));
  });
  if (primitives.length === 0) throw new Error("glb contains no meshes");
  const textured = primitives.find((primitive) => {
    const material = primitive.material as THREE.MeshStandardMaterial;
    return material.map !== undefined && material.map !== null;
  });
  if (textured !== undefined) {
    // Single-atlas kit: merge as-is, keep the textured material.
    const geometry = mergeGeometries(primitives.map((primitive) => primitive.geometry), false);
    return { geometry, material: textured.material };
  }
  // Color-only kit: bake each primitive's diffuse color into vertex colors.
  for (const primitive of primitives) {
    const color = (primitive.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(0xffffff);
    bakeColor(primitive.geometry, color);
  }
  const geometry = mergeGeometries(primitives.map((primitive) => primitive.geometry), false);
  return { geometry, material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }) };
}

/**
 * Loads a model once and shares the result. `path` is relative to
 * client/public/ (e.g. "models/ships/kenney-pirate/ship-pirate-medium.glb")
 * and must be listed in models/manifest.ts for the asset audit to pass.
 */
export function loadModel(path: string): Promise<LoadedModel> {
  const cached = cache.get(path);
  if (cached !== undefined) return cached;
  const pending = loader
    .loadAsync(`/${path}`)
    .then((gltf) => mergeGltfScene(gltf.scene));
  cache.set(path, pending);
  return pending;
}

/**
 * Clones a loaded model's material with a linear-space colour lift. The
 * nature kits ship very dark forest palettes (DarkGreen foliage is
 * (0.043, 0.073, 0.030) linear) that rendered near-black under the former dawn
 * sun — scatter and terrain dressing pull them into the visual-feel bible's
 * warm register with per-layer tints. The shared cached material is never
 * mutated (Phase 8e-5).
 */
export function tintedMaterial(model: LoadedModel, r: number, g: number, b: number): THREE.Material {
  const material = (model.material as THREE.MeshStandardMaterial).clone();
  material.color.setRGB(r, g, b);
  return material;
}

/**
 * InstancedMesh damage/team colours only compile into the Three.js material
 * when vertex colours are enabled. Textured glTF props normally arrive with
 * that flag off, so add a white vertex-color channel before the per-instance
 * tint is used. The white channel preserves the atlas while allowing the
 * renderer to darken a destroyed carriage without changing the shared cache.
 */
export function prepareInstancedMaterial(geometry: THREE.BufferGeometry, source: THREE.Material): THREE.Material {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  colors.fill(1);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = source.clone() as THREE.MeshStandardMaterial;
  material.vertexColors = true;
  return material;
}

/**
 * Recenters a geometry on the origin (XZ centered, base at y=0) and scales it
 * uniformly so its largest XZ footprint dimension equals `footprint`. Returns
 * the scale applied, for callers that need derived heights.
 */
export function groundFit(geometry: THREE.BufferGeometry, footprint: number): number {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) return 1;
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = footprint / Math.max(size.x, size.z, 1e-6);
  const center = new THREE.Vector3();
  box.getCenter(center);
  geometry.translate(-center.x, -box.min.y, -center.z);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  return scale;
}

/**
 * Phase 8e-19 Task 4: cannon retint. The kenney-pirate cannon.glb carries one
 * atlas material whose colormap.png is missing from the repo (the register's
 * known broken-reference class), so the gun rendered as one flat slab under
 * the per-instance team tint — the owner's "cannons look all red" (the
 * Ottoman hull tint 0x8a2f28). This paints the merged geometry's vertices by
 * part instead of guessing an atlas:
 *
 *  - bronze barrel — the raised centred tube (|x| ≤ 0.26, y ≥ 0.45, the
 *    ADR 0032-measured muzzle signature);
 *  - dark iron wheels — the two rear slabs (z ≥ 1.05, or the low left-side
 *    stack x ≤ −0.05, z ≥ 0.15, y ≤ 0.62);
 *  - dark wood carriage — everything else.
 *
 * Shading comes from the existing per-vertex normals under a fixed warm key
 * light, so the low-poly mesh keeps a 3D read without the atlas. Returns the
 * vertex-colored material to swap in. Call BEFORE groundFit (the part
 * thresholds are the glb's native metres).
 */
export function paintCannon(geometry: THREE.BufferGeometry): THREE.Material {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const count = position.count;
  const colors = new Float32Array(count * 3);
  const BRONZE = new THREE.Color(0x8c5c33);
  const WOOD = new THREE.Color(0x5c4026);
  const IRON = new THREE.Color(0x38332b);
  const LIGHT_X = -0.45;
  const LIGHT_Y = 0.8;
  const LIGHT_Z = -0.4;
  const LIGHT_LENGTH = Math.hypot(LIGHT_X, LIGHT_Y, LIGHT_Z);
  const scratch = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const part = z >= 1.05 || (x <= -0.05 && z >= 0.15 && y <= 0.62) ? IRON
      : Math.abs(x) <= 0.26 && y >= 0.45 ? BRONZE
      : WOOD;
    const nx = normal.getX(index);
    const ny = normal.getY(index);
    const nz = normal.getZ(index);
    const dot = (nx * LIGHT_X + ny * LIGHT_Y + nz * LIGHT_Z) / LIGHT_LENGTH;
    const shading = 0.66 + 0.34 * Math.max(0, dot);
    scratch.copy(part).multiplyScalar(shading);
    colors[index * 3] = scratch.r;
    colors[index * 3 + 1] = scratch.g;
    colors[index * 3 + 2] = scratch.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.18, flatShading: true });
}
