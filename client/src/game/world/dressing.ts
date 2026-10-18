import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DOCK_PIERS, GALLEY_DOCKS, RIVER_BRIDGES, SIEGE_BLOCKOUT, TERRAIN_PROPS, type StaticBox } from "@janissary/shared";
import { groundFit, loadModel } from "../models/loader";
import { DRESSING_MODELS } from "../models/manifest";

/**
 * Phase 8c-3/8c-4: additive, non-collider dressing layered over the blockout.
 * Nothing here touches SIEGE_BLOCKOUT or any collider — these are pure
 * visuals, and the map is fully playable without them.
 *
 *  - Watchtowers break up the flat wall run at its ends (clear of every
 *    blockout collider — the wall boxes span |x| <= 71.75, the towers sit at
 *    |x| = 80), and dock platforms dress the four galley moorings.
 *  - Inner city: pitched prism roofs on the city-wall boxes so each reads as
 *    a building (the two south segments flanking the gate stay flat so the
 *    gap reads clean), street props flush to wall faces, a lintel beam plus
 *    two pennants marking the gate gap, and a pair of cloth awnings.
 *  - River bridges and dock piers get trestle posts into the water, diagonal
 *    cross-braces, dark plank lines across the deck, and post-and-rope
 *    railings along both edges (ends stay open for boarding).
 *  - Always-lit torches: free-standing poles in front of the main wall (so a
 *    breach never leaves a flame floating over rubble), two flanking the city
 *    gate, and one on each hill-fort stack top. Each torch is a pole stub, an
 *    additive flame billboard, and one shadowless warm point light; the
 *    returned update() drives a deterministic two-sine flicker.
 *
 * Fire-and-forget: glb pieces pop in when their load resolves, and a failed
 * load just means no dressing. update() performs zero per-frame allocation.
 */
export interface DressingHandle {
  update(dtSeconds: number): void;
  /** Tier the fortress torch point-light budget (flame sprites never scale). */
  setQuality(quality: "low" | "medium" | "high"): void;
}

// Warm desaturated palette, matching the blockout/soldier register.
const ROOF_TERRACOTTA = 0x9c5a48;
const ROOF_DARK_WOOD = 0x5a4232;
const WOOD_DARK = 0x4a3626;
const WOOD_MID = 0x6b4a2c;
const ROPE_COLOR = 0x7a6a4a;
const CLOTH_RED = 0xb03a30;
const CLOTH_CANVAS = 0xcbb98a;
const IRON_DARK = 0x342b25;
const TORCH_COLOR = 0xff9a3c;
const TORCH_INTENSITY = 7.5;
const TORCH_DISTANCE = 20;
const FLAME_SCALE = 0.85;
const MAX_DT = 0.1;

/** Triangular-prism roof, ridge along +X, base at y=0, no underside. */
function prismRoofGeometry(length: number, width: number, height: number): THREE.BufferGeometry {
  const lx = length / 2;
  const wz = width / 2;
  // A(-lx,0,-wz) B(lx,0,-wz) C(lx,0,wz) D(-lx,0,wz) E(-lx,h,0) F(lx,h,0)
  const positions = new Float32Array([
    // -z slope
    -lx, 0, -wz, lx, height, 0, lx, 0, -wz,
    -lx, 0, -wz, -lx, height, 0, lx, height, 0,
    // +z slope
    -lx, 0, wz, lx, 0, wz, lx, height, 0,
    -lx, 0, wz, lx, height, 0, -lx, height, 0,
    // -x gable
    -lx, 0, -wz, -lx, 0, wz, -lx, height, 0,
    // +x gable
    lx, 0, -wz, lx, height, 0, lx, 0, wz,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals(); // non-indexed -> flat face normals
  return geometry;
}

/** 64×64 radial gradient: warm white core -> orange -> transparent. */
function makeFlameTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    const gradient = ctx.createRadialGradient(32, 34, 2, 32, 34, 30);
    gradient.addColorStop(0, "rgba(255, 242, 205, 1)");
    gradient.addColorStop(0.35, "rgba(255, 164, 70, 0.9)");
    gradient.addColorStop(0.7, "rgba(255, 122, 40, 0.35)");
    gradient.addColorStop(1, "rgba(255, 110, 30, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

interface TorchSpec {
  readonly x: number;
  readonly z: number;
  readonly baseY: number;
  readonly poleHeight: number;
}

interface Torch {
  readonly light: THREE.PointLight;
  readonly flame: THREE.Sprite;
  readonly phase: number;
}

/** Top of a hill-fort stack, summed from the tier colliders at runtime. */
function stackTopY(x: number, z: number): number {
  const prefix = `terrain-stack-${x}-${z}-`;
  let top = 0;
  for (const prop of TERRAIN_PROPS) {
    if (prop.id.startsWith(prefix)) {
      top = Math.max(top, prop.collider.y + prop.collider.height / 2);
    }
  }
  return top;
}

function torchSpecs(): TorchSpec[] {
  const specs: TorchSpec[] = [];
  // City gate first: flanking the 12 m gap (x in [-6,6]) — the single most
  // watched approach at night, so low tier keeps these.
  for (const side of [-7.5, 7.5]) {
    specs.push({ x: side, z: -49.4, baseY: 0, poleHeight: 4.6 });
  }
  // Main wall line: every other segment (ids 0,2,4,6,8,10 -> x=-66..54),
  // free-standing poles on the attacker face so a breach drops the wall
  // behind the torch, never the torch itself.
  for (let id = 0; id < 12; id += 2) {
    specs.push({ x: -66 + id * 12, z: 1.9, baseY: 0, poleHeight: 8.4 });
  }
  // Hill forts: short stubs on the stack tops, clear of the capture banner
  // (which sits at the point's edge, offset +x by construction). Their light
  // pools are ~20 m wide on tops 400+ m away, so the sprites carry the read
  // and low/medium drop the lights first.
  const forts = [
    { x: -470, z: -150 },
    { x: 470, z: -130 },
    { x: -430, z: 150 },
  ];
  for (const fort of forts) {
    specs.push({ x: fort.x - 3, z: fort.z + 2.5, baseY: stackTopY(fort.x, fort.z), poleHeight: 1.7 });
  }
  return specs;
}

/** Roofs over the city-wall boxes; the gate-flanking south pair stays flat. */
function buildCityRoofs(scene: THREE.Scene): void {
  const terracotta = new THREE.MeshStandardMaterial({ color: ROOF_TERRACOTTA, roughness: 1, flatShading: true });
  const darkWood = new THREE.MeshStandardMaterial({ color: ROOF_DARK_WOOD, roughness: 1, flatShading: true });
  for (const box of SIEGE_BLOCKOUT) {
    if (!box.id.startsWith("city-wall-")) continue;
    if (box.id === "city-wall-south-west" || box.id === "city-wall-south-east") continue;
    const longAxis = Math.max(box.width, box.depth) + 0.8; // slight overhang
    const shortAxis = Math.min(box.width, box.depth) + 1.0;
    const height = Math.min(2.4, shortAxis * 0.5);
    const roof = new THREE.Mesh(
      prismRoofGeometry(longAxis, shortAxis, height),
      box.id.includes("divider") ? darkWood : terracotta,
    );
    if (box.depth > box.width) roof.rotation.y = Math.PI / 2;
    roof.position.set(box.x, box.y + box.height / 2, box.z);
    roof.castShadow = true;
    roof.receiveShadow = true;
    scene.add(roof);
  }
}

interface StreetPropSpec {
  readonly key: keyof typeof DRESSING_MODELS;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly footprint: number;
}

// Fixed placements, flush to wall faces and clear of the ~8 m walk lines,
// the gate gap (x in [-6,6] at z=-52) and the cross-street corridor
// (z in [-71,-65] between the divider faces at x in [-4,4]).
const STREET_PROPS: readonly StreetPropSpec[] = [
  { key: "barrel", x: -14.2, z: -62.5, yaw: 0.3, footprint: 0.9 }, // west wall
  { key: "barrel", x: -13.4, z: -61.3, yaw: 1.2, footprint: 0.9 }, // west wall, cluster
  { key: "crate", x: -14.3, z: -74, yaw: 0.15, footprint: 1.0 }, // west wall
  { key: "barrel", x: -7.8, z: -80.5, yaw: 0.9, footprint: 0.9 }, // west divider, north arm
  { key: "crateBottles", x: 14.3, z: -60, yaw: -0.2, footprint: 1.0 }, // east wall
  { key: "barrel", x: 14.2, z: -70.5, yaw: 2.1, footprint: 0.9 }, // east wall
  { key: "chest", x: 7.7, z: -76, yaw: 0.5, footprint: 1.1 }, // east divider, north arm
  { key: "crate", x: 3.2, z: -81.3, yaw: 0.7, footprint: 1.0 }, // north wall
  { key: "barrel", x: -3.4, z: -81.3, yaw: 1.8, footprint: 0.9 }, // north wall
  { key: "crate", x: 12.3, z: -54.7, yaw: -0.4, footprint: 1.0 }, // south-east wall, inner face
  { key: "barrel", x: -12.5, z: -54.7, yaw: 0.1, footprint: 0.9 }, // south-west wall, inner face
  { key: "cart", x: 11, z: -81.1, yaw: 0.05, footprint: 2.4 }, // cart-like planks, north wall
];

function buildStreetProps(scene: THREE.Scene): void {
  const keys = [...new Set(STREET_PROPS.map((spec) => spec.key))];
  for (const key of keys) {
    void loadModel(DRESSING_MODELS[key])
      .then((model) => {
        for (const spec of STREET_PROPS) {
          if (spec.key !== key) continue;
          const geometry = model.geometry.clone();
          groundFit(geometry, spec.footprint);
          const mesh = new THREE.Mesh(geometry, model.material);
          mesh.position.set(spec.x, 0, spec.z);
          mesh.rotation.y = spec.yaw;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          scene.add(mesh);
        }
      })
      .catch(() => undefined);
  }
}

/** Angled cloth plane hanging off a wall face; `yaw` turns it to face out. */
function addAwning(scene: THREE.Scene, x: number, z: number, yaw: number, color: number): void {
  const group = new THREE.Group();
  group.position.set(x, 2.55, z);
  group.rotation.y = yaw;
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 1.9),
    new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }),
  );
  cloth.rotation.x = -0.62; // top edge against the wall, hem kicking out
  cloth.castShadow = true;
  group.add(cloth);
  scene.add(group);
}

/** Lintel beam over the gate gap plus a pennant on each flanking wall top. */
function buildGateEmphasis(scene: THREE.Scene): void {
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(13.2, 0.7, 1.1),
    new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.9, flatShading: true }),
  );
  beam.position.set(0, 4.4, -52); // rests on the 4 m flanking wall tops
  beam.castShadow = true;
  beam.receiveShadow = true;
  scene.add(beam);

  void loadModel(DRESSING_MODELS.flag)
    .then((model) => {
      for (const side of [-7.2, 7.2]) {
        const geometry = model.geometry.clone();
        groundFit(geometry, 1.2);
        const flag = new THREE.Mesh(geometry, model.material);
        flag.position.set(side, 4, -52);
        flag.rotation.y = side < 0 ? 0.25 : -0.25;
        flag.castShadow = true;
        scene.add(flag);
      }
    })
    .catch(() => undefined);
}

interface DeckSpec {
  readonly box: StaticBox;
  readonly alongX: boolean; // true: span runs along X (bridges), false: along Z (piers)
}

/**
 * Trestle posts into the water, diagonal cross-braces, dark plank lines
 * across the walking direction, and post-and-rope railings along both edges
 * (merged to a handful of meshes per deck; ends stay open).
 */
function buildDeckDressing(scene: THREE.Scene, spec: DeckSpec): void {
  const { box } = spec;
  const topY = box.y + box.height / 2;
  const length = spec.alongX ? box.width : box.depth;
  const halfLength = length / 2;
  const halfWidth = (spec.alongX ? box.depth : box.width) / 2;

  const postGeometries: THREE.BufferGeometry[] = [];
  const braceGeometries: THREE.BufferGeometry[] = [];
  const plankGeometries: THREE.BufferGeometry[] = [];
  const ropeGeometries: THREE.BufferGeometry[] = [];

  const place = (geometry: THREE.BufferGeometry, along: number, y: number, across: number): THREE.BufferGeometry => {
    geometry.translate(spec.alongX ? box.x + along : box.x + across, y, spec.alongX ? box.z + across : box.z + along);
    return geometry;
  };

  // Trestles: pairs of posts under the deck, every ~5 m along the span.
  const postOffsets: number[] = [];
  for (let along = -halfLength + 5; along <= halfLength - 5; along += 5) {
    postOffsets.push(along);
  }
  const postInset = Math.min(halfWidth - 0.8, 2.5);
  for (const along of postOffsets) {
    for (const side of [-postInset, postInset]) {
      postGeometries.push(place(new THREE.CylinderGeometry(0.2, 0.24, 2.6, 6), along, topY - 1.4, side));
    }
  }
  // One diagonal brace per bay per side, alternating direction.
  for (let index = 0; index < postOffsets.length - 1; index += 1) {
    const from = postOffsets[index];
    const to = postOffsets[index + 1];
    if (from === undefined || to === undefined) continue;
    const dx = to - from;
    const dy = index % 2 === 0 ? 1.6 : -1.6;
    const braceLength = Math.hypot(dx, dy);
    for (const side of [-postInset, postInset]) {
      const brace = new THREE.CylinderGeometry(0.09, 0.09, braceLength, 5);
      brace.rotateZ(spec.alongX ? Math.atan2(-dx, dy) : 0);
      if (!spec.alongX) brace.rotateX(Math.atan2(dx, dy));
      braceGeometries.push(place(brace, (from + to) / 2, topY - 1.3 + dy / 2, side));
    }
  }

  // Plank lines across the walking direction, every ~2.2 m.
  for (let along = -halfLength + 1.2; along <= halfLength - 1.2; along += 2.2) {
    const plank = new THREE.BoxGeometry(spec.alongX ? 0.6 : halfWidth * 2 - 0.6, 0.03, spec.alongX ? halfWidth * 2 - 0.6 : 0.6);
    plankGeometries.push(place(plank, along, topY + 0.015, 0));
  }

  // Railings: posts every ~4 m on both edges, two rope lines between them.
  const edgeInset = halfWidth - 0.15;
  for (let along = -halfLength + 2; along <= halfLength - 2; along += 4) {
    for (const side of [-edgeInset, edgeInset]) {
      postGeometries.push(place(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 5), along, topY + 0.5, side));
    }
  }
  for (const side of [-edgeInset, edgeInset]) {
    for (const ropeY of [topY + 0.95, topY + 0.55]) {
      const rope = new THREE.CylinderGeometry(0.035, 0.035, length - 4, 4);
      if (spec.alongX) rope.rotateZ(Math.PI / 2);
      else rope.rotateX(Math.PI / 2);
      ropeGeometries.push(place(rope, 0, ropeY, side));
    }
  }

  const woodMaterial = new THREE.MeshStandardMaterial({ color: WOOD_MID, roughness: 0.95, flatShading: true });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 1, flatShading: true });
  const ropeMaterial = new THREE.MeshStandardMaterial({ color: ROPE_COLOR, roughness: 1 });
  const addMerged = (geometries: THREE.BufferGeometry[], material: THREE.Material, shadows: boolean): void => {
    if (geometries.length === 0) return;
    const mesh = new THREE.Mesh(mergeGeometries(geometries, false), material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  addMerged([...postGeometries, ...braceGeometries], woodMaterial, true);
  addMerged(plankGeometries, darkMaterial, false);
  addMerged(ropeGeometries, ropeMaterial, false);
}

function buildTorches(scene: THREE.Scene): Torch[] {
  const torches: Torch[] = [];
  const flameTexture = makeFlameTexture();
  const flameMaterial = new THREE.SpriteMaterial({
    map: flameTexture,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const poleMaterial = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.9, flatShading: true });
  const ironMaterial = new THREE.MeshStandardMaterial({ color: IRON_DARK, roughness: 0.6, metalness: 0.5 });
  let phase = 0;
  for (const spec of torchSpecs()) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, spec.poleHeight, 6), poleMaterial);
    pole.position.set(spec.x, spec.baseY + spec.poleHeight / 2, spec.z);
    pole.castShadow = true;
    scene.add(pole);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.1, 0.28, 6), ironMaterial);
    cup.position.set(spec.x, spec.baseY + spec.poleHeight + 0.1, spec.z);
    scene.add(cup);
    const flameY = spec.baseY + spec.poleHeight + 0.45;
    const flame = new THREE.Sprite(flameMaterial);
    flame.position.set(spec.x, flameY, spec.z);
    flame.scale.set(FLAME_SCALE, FLAME_SCALE * 1.2, 1);
    scene.add(flame);
    const light = new THREE.PointLight(TORCH_COLOR, TORCH_INTENSITY, TORCH_DISTANCE, 2);
    light.position.set(spec.x, flameY + 0.1, spec.z);
    light.castShadow = false;
    scene.add(light);
    torches.push({ light, flame, phase });
    phase += 2.39; // incommensurate spread so no two torches flicker in sync
  }
  return torches;
}

export function buildDressing(scene: THREE.Scene): DressingHandle {
  void loadModel(DRESSING_MODELS.tower)
    .then((model) => {
      const geometry = model.geometry.clone();
      // ~5 m footprint -> ~10.5 m tall watchtower, looming over the 8 m wall.
      groundFit(geometry, 5);
      for (const side of [-80, 80]) {
        const tower = new THREE.Mesh(geometry, model.material);
        tower.position.set(side, 0, 0);
        tower.rotation.y = side < 0 ? 0.4 : -0.4;
        tower.castShadow = true;
        tower.receiveShadow = true;
        scene.add(tower);
      }
    })
    .catch(() => undefined);

  void loadModel(DRESSING_MODELS.dock)
    .then((model) => {
      const geometry = model.geometry.clone();
      groundFit(geometry, 10);
      // Squash the platform to dock-deck height; pilings read through the water.
      geometry.scale(1, 0.2, 1);
      for (const dock of GALLEY_DOCKS) {
        const platform = new THREE.Mesh(geometry, model.material);
        platform.position.set(dock.x, -0.1, dock.z - 9);
        platform.rotation.y = dock.yaw;
        platform.receiveShadow = true;
        scene.add(platform);
      }
    })
    .catch(() => undefined);

  buildCityRoofs(scene);
  buildStreetProps(scene);
  buildGateEmphasis(scene);
  addAwning(scene, -14.85, -57, Math.PI / 2, CLOTH_RED); // west wall, near the gate approach
  addAwning(scene, 3.85, -58, -Math.PI / 2, CLOTH_CANVAS); // east divider, central street
  for (const bridge of RIVER_BRIDGES) {
    buildDeckDressing(scene, { box: bridge, alongX: true });
  }
  for (const pier of DOCK_PIERS) {
    buildDeckDressing(scene, { box: pier, alongX: false });
  }
  const torches = buildTorches(scene);
  // Per-fragment point-light budget for the fortress torches (Phase 8c-5b).
  // Every lit surface pixel pays the full point-light loop, so the tiers
  // turn down light COUNT, not light taste: the flame sprites (the actual
  // night-time read) stay at all tiers; only the light pools scale.
  const TORCH_LIGHT_COUNT: Record<"low" | "medium" | "high", number> = { low: 4, medium: 8, high: torches.length };

  let elapsed = 0;
  return {
    update(dtSeconds: number): void {
      elapsed += Math.min(dtSeconds, MAX_DT);
      for (let index = 0; index < torches.length; index += 1) {
        const torch = torches[index];
        if (torch === undefined) continue;
        const flicker =
          0.86 +
          0.1 * Math.sin(elapsed * 11 + torch.phase) +
          0.06 * Math.sin(elapsed * 23.7 + torch.phase * 1.7);
        if (torch.light.visible) torch.light.intensity = TORCH_INTENSITY * flicker;
        const scale = FLAME_SCALE * (0.9 + 0.18 * flicker);
        torch.flame.scale.set(scale, scale * 1.25, 1);
      }
    },
    setQuality(quality: "low" | "medium" | "high"): void {
      const count = TORCH_LIGHT_COUNT[quality];
      for (let index = 0; index < torches.length; index += 1) {
        const torch = torches[index];
        if (torch === undefined) continue;
        torch.light.visible = index < count;
        if (!torch.light.visible) torch.light.intensity = 0;
      }
    },
  };
}
