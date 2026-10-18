import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CLASS_TUNING, PlayerClass, SKIN_DEFINITIONS, Team } from "@janissary/shared";

/**
 * Phase 8c-2 procedural character models. Drop-in replacements for the
 * placeholder capsule (soldiers) and box (horse) InstancedMesh geometries in
 * GameClient — the instance convention is identical:
 *
 * - Local origin sits at the entity position, i.e. the body CENTER 0.9 m
 *   above the ground (GROUND_CENTER_Y), so geometry spans y ∈ [-0.9, +0.9]
 *   for a 1.8 m soldier. Feet at local y = -0.9.
 * - The model faces local -Z (entity forward is (-sin yaw, 0, -cos yaw) and
 *   the instance transform only applies rotation.y = yaw).
 * - The horse matches the old 1.15 × 0.75 × 1.7 box footprint, length along
 *   Z, nose toward -Z; its instance origin is entity y + 0.05.
 *
 * Team and class readability is baked into vertex colors (MeshStandardMaterial
 * with vertexColors: true, per-instance instanceColor stays white). Geometry
 * is non-indexed with per-face normals, so it reads flat-shaded without
 * material.flatShading. Standing and seated soldier variants plus the horse
 * are built once and cached — callers share them and must not mutate them.
 */

type VariantIndex = 0 | 1 | 2;

interface SoldierPalette {
  readonly cloth: number;
  readonly trousers: number;
  readonly belt: number;
  readonly shoulder: number;
  readonly trim: number;
  readonly felt: number;
  readonly plume: number;
  readonly shield: number;
  readonly leather: number;
  readonly wood: number;
  readonly metal: number;
  readonly darkMetal: number;
  readonly skin: number;
}

const SKIN_TAN = 0xc98f66;
const GOLD = 0xf0b35a;
const GOLD_BRIGHT = 0xffd166;

// Base uniforms harmonized with TEAM_PALETTES.default.accents in GameClient:
// Ottoman #b43a32 / #e0695c / #f0b35a, Byzantine #5e3a99 / #9a7bd8 / #f0b35a.
const OTTOMAN_PALETTES: readonly [SoldierPalette, SoldierPalette, SoldierPalette] = [
  {
    cloth: 0xb43a32, trousers: 0x7e2b26, belt: 0xe0695c, shoulder: 0xb43a32,
    trim: GOLD, felt: 0xefe6d8, plume: 0xe0695c, shield: 0x8a2f28,
    leather: 0x6a4a2e, wood: 0x805a31, metal: 0xc4c9c7, darkMetal: 0x342b25, skin: SKIN_TAN,
  },
  {
    cloth: 0x7e2b26, trousers: 0x5e2320, belt: 0x523826, shoulder: 0x523826,
    trim: 0xb98a4a, felt: 0xcfc4b0, plume: 0x8a4a42, shield: 0x6e2823,
    leather: 0x523826, wood: 0x6a4a26, metal: 0x9aa2a8, darkMetal: 0x2c2420, skin: SKIN_TAN,
  },
  {
    cloth: 0xc23a30, trousers: 0x8a322c, belt: GOLD_BRIGHT, shoulder: GOLD_BRIGHT,
    trim: GOLD_BRIGHT, felt: 0xf6efe2, plume: GOLD_BRIGHT, shield: 0xa02420,
    leather: 0x6a4a2e, wood: 0x8a6238, metal: 0xd4d9d7, darkMetal: 0x342b25, skin: SKIN_TAN,
  },
];

const BYZANTINE_PALETTES: readonly [SoldierPalette, SoldierPalette, SoldierPalette] = [
  {
    cloth: 0x5e3a99, trousers: 0x452a75, belt: 0x9a7bd8, shoulder: 0x5e3a99,
    trim: GOLD, felt: 0x3a2a5e, plume: 0x9a7bd8, shield: 0x5e3a99,
    leather: 0x5a4232, wood: 0x6e4e2e, metal: 0xc4c9c7, darkMetal: 0x342b25, skin: SKIN_TAN,
  },
  {
    cloth: 0x452a75, trousers: 0x342057, belt: 0x4a3b32, shoulder: 0x4a3b32,
    trim: 0xb98a4a, felt: 0x2e2249, plume: 0x6f55a8, shield: 0x3a2566,
    leather: 0x4a3b32, wood: 0x5a4026, metal: 0x9aa2a8, darkMetal: 0x2c2420, skin: SKIN_TAN,
  },
  {
    cloth: 0x6b3fb0, trousers: 0x4a2f80, belt: GOLD_BRIGHT, shoulder: GOLD_BRIGHT,
    trim: GOLD_BRIGHT, felt: 0x4a3280, plume: GOLD_BRIGHT, shield: 0x6b3fb0,
    leather: 0x5a4232, wood: 0x7a5733, metal: 0xd4d9d7, darkMetal: 0x342b25, skin: SKIN_TAN,
  },
];

interface Placement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
}

function paint(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const color = new THREE.Color(hex);
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function place(geometry: THREE.BufferGeometry, at: Placement): THREE.BufferGeometry {
  if (at.rz !== undefined) geometry.rotateZ(at.rz);
  if (at.rx !== undefined) geometry.rotateX(at.rx);
  if (at.ry !== undefined) geometry.rotateY(at.ry);
  geometry.translate(at.x, at.y, at.z);
  return geometry;
}

function box(width: number, height: number, depth: number, at: Placement, hex: number): THREE.BufferGeometry {
  return place(paint(new THREE.BoxGeometry(width, height, depth), hex), at);
}

function cylinder(radiusTop: number, radiusBottom: number, height: number, segments: number, at: Placement, hex: number): THREE.BufferGeometry {
  return place(paint(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), hex), at);
}

function cone(radius: number, height: number, segments: number, at: Placement, hex: number): THREE.BufferGeometry {
  return place(paint(new THREE.ConeGeometry(radius, height, segments), hex), at);
}

function sphere(radius: number, at: Placement, hex: number, scaleY = 1): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, 7, 5);
  if (scaleY !== 1) geometry.scale(1, scaleY, 1);
  return place(paint(geometry, hex), at);
}

const HALF_PI = Math.PI / 2;

type Vec3 = readonly [number, number, number];

/** Chunky box spanning two joints — posed arm segments and crossbow prod limbs. */
function limb(a: Vec3, b: Vec3, thickness: number, hex: number): THREE.BufferGeometry {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  const geometry = paint(new THREE.BoxGeometry(thickness, length + thickness * 0.4, thickness), hex);
  // Same rotation order as place(): rotateX pitches local +Y toward ±Z, then
  // rotateY swings it sideways, landing +Y on (b - a) / length.
  geometry.rotateX(Math.acos(Math.min(1, Math.max(-1, dy / length))));
  geometry.rotateY(Math.atan2(dx, dz));
  geometry.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return geometry;
}

/** Two-segment arm (upper arm, forearm, hand) posed so the hand lands on `hand`. */
function arm(parts: THREE.BufferGeometry[], p: SoldierPalette, shoulder: Vec3, elbow: Vec3, hand: Vec3): void {
  parts.push(
    limb(shoulder, elbow, 0.14, p.cloth),
    limb(elbow, hand, 0.12, p.cloth),
    box(0.12, 0.12, 0.14, { x: hand[0], y: hand[1], z: hand[2] }, p.skin),
  );
}

/**
 * Weapon carry frames shared by the weapon builders and the arm poses, so
 * hands always land on the grips. A weapon lies along unit axis U measured
 * from a butt anchor; placing with rx = -HALF_PI + phi, ry = yaw maps local
 * +Y onto U under place()'s rotation order.
 */
function weaponAxis(phi: number, yaw: number): Vec3 {
  return [-Math.cos(phi) * Math.sin(yaw), Math.sin(phi), -Math.cos(phi) * Math.cos(yaw)];
}

function along(butt: Vec3, u: Vec3, s: number): Vec3 {
  return [butt[0] + u[0] * s, butt[1] + u[1] * s, butt[2] + u[2] * s];
}

function weaponPlacement(butt: Vec3, u: Vec3, s: number, phi: number, yaw: number): Placement {
  const [x, y, z] = along(butt, u, s);
  return { x, y, z, rx: -HALF_PI + phi, ry: yaw };
}

// Arquebus low ready carry: butt at the right hip outside the torso, muzzle
// up ~28° and canted left across the chest. The barrel lies entirely in
// front of the torso front plane (z < -0.17) and clears a horse's neck when seated.
const ARQUEBUS_BUTT: Vec3 = [0.4, -0.14, 0.16];
const ARQUEBUS_PHI = 0.48;
const ARQUEBUS_YAW = 0.3;
const ARQUEBUS_U: Vec3 = weaponAxis(ARQUEBUS_PHI, ARQUEBUS_YAW);

// Crossbow held forward at chest height, nearly level with a slight cant;
// the butt end sits just in front of the right shoulder.
const CROSSBOW_BUTT: Vec3 = [0.35, 0.06, -0.08];
const CROSSBOW_PHI = 0.05;
const CROSSBOW_YAW = 0.15;
const CROSSBOW_U: Vec3 = weaponAxis(CROSSBOW_PHI, CROSSBOW_YAW);
/** Horizontal vector square to the tiller — the prod's span direction. */
const CROSSBOW_W: Vec3 = [Math.cos(CROSSBOW_YAW), 0, -Math.sin(CROSSBOW_YAW)];

/** Shared chunky humanoid: boots, legs (or robe skirt), torso, belt, shoulders, head. Arms are posed per class so the hands reach the weapon grips. */
function baseBody(parts: THREE.BufferGeometry[], p: SoldierPalette, options: { readonly bulk?: boolean; readonly robe?: boolean; readonly seated?: boolean }): void {
  const width = options.bulk === true ? 1.18 : 1;
  if (options.seated === true) {
    // Baked saddle pose: thighs angle toward the horse's shoulders while the
    // lower legs hang outside its body. Torso/head remain upright, avoiding a
    // runtime skeleton and retaining one instanced draw per cavalry class.
    parts.push(
      box(0.18, 0.46, 0.2, { x: -0.29, y: -0.37, z: -0.13, rx: 1.02 }, p.trousers),
      box(0.18, 0.46, 0.2, { x: 0.29, y: -0.37, z: -0.13, rx: 1.02 }, p.trousers),
      box(0.18, 0.16, 0.3, { x: -0.31, y: -0.61, z: -0.36, rx: 0.3 }, p.leather),
      box(0.18, 0.16, 0.3, { x: 0.31, y: -0.61, z: -0.36, rx: 0.3 }, p.leather),
    );
  } else if (options.robe === true) {
    parts.push(
      box(0.18, 0.14, 0.26, { x: -0.12, y: -0.83, z: -0.02 }, p.leather),
      box(0.18, 0.14, 0.26, { x: 0.12, y: -0.83, z: -0.02 }, p.leather),
    );
    parts.push(cylinder(0.3, 0.46, 0.62, 8, { x: 0, y: -0.55, z: 0 }, p.cloth));
  } else {
    parts.push(
      box(0.18, 0.14, 0.26, { x: -0.12, y: -0.83, z: -0.02 }, p.leather),
      box(0.18, 0.14, 0.26, { x: 0.12, y: -0.83, z: -0.02 }, p.leather),
      box(0.17, 0.5, 0.2, { x: -0.12, y: -0.56, z: 0 }, p.trousers),
      box(0.17, 0.5, 0.2, { x: 0.12, y: -0.56, z: 0 }, p.trousers),
    );
  }
  parts.push(
    box(0.56 * width, 0.62, 0.34, { x: 0, y: -0.02, z: 0 }, p.cloth),
    box(0.58 * width, 0.1, 0.36, { x: 0, y: -0.24, z: 0 }, p.belt),
    box(0.17, 0.13, 0.22, { x: -0.35 * width, y: 0.24, z: 0 }, p.shoulder),
    box(0.17, 0.13, 0.22, { x: 0.35 * width, y: 0.24, z: 0 }, p.shoulder),
    box(0.3, 0.34, 0.3, { x: 0, y: 0.46, z: 0 }, p.skin),
  );
}

/** Musket at a low ready carry: butt by the right hip, muzzle up and forward, barrel clear of the chest. */
function arquebus(parts: THREE.BufferGeometry[], p: SoldierPalette): void {
  const at = (s: number): Placement => weaponPlacement(ARQUEBUS_BUTT, ARQUEBUS_U, s, ARQUEBUS_PHI, ARQUEBUS_YAW);
  parts.push(
    box(0.09, 0.3, 0.13, at(0.02), p.wood),
    box(0.07, 0.52, 0.11, at(0.24), p.wood),
    cylinder(0.026, 0.026, 1.2, 6, at(1.04), p.darkMetal),
  );
}

/** Hands on the musket: right at the wrist of the stock, left under the fore-stock. */
function arquebusArms(parts: THREE.BufferGeometry[], p: SoldierPalette, width: number): void {
  const shoulderX = 0.37 * width;
  arm(parts, p, [shoulderX, 0.2, 0], [0.45, -0.08, -0.1], along(ARQUEBUS_BUTT, ARQUEBUS_U, 0.18));
  arm(parts, p, [-shoulderX, 0.2, 0], [-0.3, 0, -0.3], along(ARQUEBUS_BUTT, ARQUEBUS_U, 0.72));
}

/**
 * Crossbow held forward at chest height: tiller with a widened butt, a
 * tapered prod whose backswept limbs recurve at the tips, a taut string, a
 * stirrup and a bolt in the groove. The tiller stays clear of the torso and
 * passes right of a horse's head when seated.
 */
function crossbow(parts: THREE.BufferGeometry[], p: SoldierPalette): void {
  const at = (s: number): Placement => weaponPlacement(CROSSBOW_BUTT, CROSSBOW_U, s, CROSSBOW_PHI, CROSSBOW_YAW);
  const atop = (s: number, lift: number): Placement => {
    const placement = at(s);
    return { ...placement, y: placement.y + lift };
  };
  const prodCenter = along(CROSSBOW_BUTT, CROSSBOW_U, 0.62);
  const prodPoints = (side: 1 | -1): readonly [Vec3, Vec3, Vec3] => {
    const mid = along(along(prodCenter, CROSSBOW_W, side * 0.2), CROSSBOW_U, -0.05);
    const tip = along(along(prodCenter, CROSSBOW_W, side * 0.38), CROSSBOW_U, -0.13);
    const recurve = along(tip, CROSSBOW_U, 0.07);
    return [mid, tip, recurve];
  };
  const [rightMid, rightTip, rightRecurve] = prodPoints(1);
  const [leftMid, leftTip, leftRecurve] = prodPoints(-1);
  const stirrup = along(CROSSBOW_BUTT, CROSSBOW_U, 0.76);
  parts.push(
    box(0.09, 0.22, 0.13, at(0.05), p.wood),
    box(0.07, 0.78, 0.09, at(0.39), p.wood),
    box(0.05, 0.04, 0.1, atop(0.28, 0.05), p.darkMetal),
    cylinder(0.011, 0.011, 0.46, 5, atop(0.42, 0.055), p.metal),
    box(0.05, 0.04, 0.07, atop(0.22, 0.055), p.felt),
    limb(prodCenter, rightMid, 0.055, p.darkMetal),
    limb(rightMid, rightTip, 0.045, p.darkMetal),
    limb(rightTip, rightRecurve, 0.035, p.darkMetal),
    limb(prodCenter, leftMid, 0.055, p.darkMetal),
    limb(leftMid, leftTip, 0.045, p.darkMetal),
    limb(leftTip, leftRecurve, 0.035, p.darkMetal),
    limb(leftRecurve, rightRecurve, 0.012, p.leather),
    box(0.03, 0.07, 0.03, { x: stirrup[0], y: stirrup[1] - 0.05, z: stirrup[2] }, p.darkMetal),
    box(0.18, 0.025, 0.07, { x: stirrup[0], y: stirrup[1] - 0.095, z: stirrup[2], ry: CROSSBOW_YAW }, p.darkMetal),
  );
}

/** Right hand on the tiller grip; the off hand supports the fore-end unless a shield occupies it. */
function crossbowArms(parts: THREE.BufferGeometry[], p: SoldierPalette, width: number, offHand: boolean): void {
  const shoulderX = 0.37 * width;
  arm(parts, p, [shoulderX, 0.2, 0], [0.44, -0.03, -0.12], along(CROSSBOW_BUTT, CROSSBOW_U, 0.15));
  if (offHand) arm(parts, p, [-shoulderX, 0.2, 0], [-0.33, 0.04, -0.24], along(CROSSBOW_BUTT, CROSSBOW_U, 0.5));
}

/** Off arm bent to the strap of a side-hung shield (targe or heater). */
function shieldArm(parts: THREE.BufferGeometry[], p: SoldierPalette, width: number): void {
  arm(parts, p, [-0.37 * width, 0.2, 0], [-0.43, -0.06, -0.02], [-0.44, -0.12, -0.02]);
}

function lance(parts: THREE.BufferGeometry[], p: SoldierPalette): void {
  const tilt = -(HALF_PI - 0.22);
  parts.push(
    cylinder(0.024, 0.032, 2.0, 6, { x: 0.42, y: 0.18, z: -0.1, rx: tilt }, p.wood),
    cone(0.05, 0.2, 6, { x: 0.42, y: 0.41, z: -1.09, rx: tilt }, p.metal),
    cylinder(0.09, 0.09, 0.03, 8, { x: 0.42, y: 0.14, z: -0.34, rx: tilt }, p.trim),
  );
}

function roundTarge(parts: THREE.BufferGeometry[], p: SoldierPalette): void {
  parts.push(
    cylinder(0.3, 0.3, 0.05, 10, { x: -0.46, y: -0.02, z: -0.02, rz: HALF_PI }, p.shield),
    sphere(0.06, { x: -0.5, y: -0.02, z: -0.02 }, p.metal),
  );
}

function heaterShield(parts: THREE.BufferGeometry[], p: SoldierPalette): void {
  parts.push(
    box(0.05, 0.64, 0.44, { x: -0.46, y: -0.08, z: 0 }, p.shield),
    box(0.03, 0.5, 0.32, { x: -0.49, y: -0.08, z: 0 }, p.trim),
  );
}

/** Right arm couched over the lance shaft just behind its balance point. */
function lanceArm(parts: THREE.BufferGeometry[], p: SoldierPalette, width: number): void {
  arm(parts, p, [0.37 * width, 0.2, 0], [0.46, -0.03, -0.02], [0.42, 0.13, 0.12]);
}

/** Both arms raised to the drumsticks, mid-beat. */
function drumArms(parts: THREE.BufferGeometry[], p: SoldierPalette, width: number): void {
  const shoulderX = 0.37 * width;
  arm(parts, p, [-shoulderX, 0.2, 0], [-0.46, 0.1, -0.1], [-0.29, 0.088, -0.229]);
  arm(parts, p, [shoulderX, 0.2, 0], [0.46, 0.1, -0.1], [0.29, 0.088, -0.229]);
}

/** Right hand on the standard's pole, left hand resting at the hip. */
function standardArms(parts: THREE.BufferGeometry[], p: SoldierPalette, width: number): void {
  arm(parts, p, [0.37 * width, 0.2, 0], [0.47, 0.02, -0.05], [0.48, 0.05, -0.08]);
  arm(parts, p, [-0.37 * width, 0.2, 0], [-0.4, -0.06, -0.02], [-0.34, -0.2, -0.06]);
}

function buildSoldierParts(playerClass: PlayerClass, p: SoldierPalette, seated = false): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  switch (playerClass) {
    case PlayerClass.Sipahi:
      baseBody(parts, p, { seated });
      // Turban-wrapped helmet with a small spike.
      parts.push(
        sphere(0.23, { x: 0, y: 0.6, z: 0 }, p.felt, 0.8),
        cylinder(0.22, 0.24, 0.1, 8, { x: 0, y: 0.55, z: 0 }, p.cloth),
        cone(0.04, 0.14, 6, { x: 0, y: 0.82, z: 0 }, p.metal),
      );
      roundTarge(parts, p);
      lance(parts, p);
      lanceArm(parts, p, 1);
      shieldArm(parts, p, 1);
      break;
    case PlayerClass.Topcu:
      baseBody(parts, p, { bulk: true, seated });
      // Low leather cap, gunner's apron, arquebus + ramrod.
      parts.push(
        cylinder(0.18, 0.2, 0.16, 8, { x: 0, y: 0.7, z: 0 }, p.leather),
        box(0.52, 0.5, 0.05, { x: 0, y: -0.35, z: -0.2, rx: -0.08 }, p.leather),
      );
      arquebus(parts, p);
      const ramrodTip = along(ARQUEBUS_BUTT, ARQUEBUS_U, 1.0);
      parts.push(cylinder(0.012, 0.012, 1.05, 5, { x: ramrodTip[0], y: ramrodTip[1] - 0.055, z: ramrodTip[2], rx: -HALF_PI + ARQUEBUS_PHI, ry: ARQUEBUS_YAW }, p.wood));
      arquebusArms(parts, p, 1.18);
      break;
    case PlayerClass.Mehter:
      baseBody(parts, p, { seated });
      // Tall bandmaster cap with a trim band.
      parts.push(
        cylinder(0.16, 0.21, 0.52, 8, { x: 0, y: 0.85, z: 0.02 }, p.cloth),
        cylinder(0.215, 0.22, 0.07, 8, { x: 0, y: 0.63, z: 0.02 }, p.trim),
      );
      // War drum strapped at the chest: shell, drumhead, trim ring, two sticks.
      parts.push(
        cylinder(0.3, 0.3, 0.26, 10, { x: 0, y: -0.05, z: -0.44, rx: HALF_PI }, p.cloth),
        cylinder(0.31, 0.31, 0.03, 10, { x: 0, y: -0.05, z: -0.58, rx: HALF_PI }, p.felt),
        cylinder(0.32, 0.32, 0.025, 10, { x: 0, y: -0.05, z: -0.55, rx: HALF_PI }, p.trim),
        cylinder(0.015, 0.015, 0.4, 5, { x: -0.32, y: 0.16, z: -0.32, rx: -0.9, rz: 0.25 }, p.wood),
        cylinder(0.015, 0.015, 0.4, 5, { x: 0.32, y: 0.16, z: -0.32, rx: -0.9, rz: -0.25 }, p.wood),
      );
      drumArms(parts, p, 1);
      break;
    case PlayerClass.Guardsman:
      baseBody(parts, p, { seated });
      // Kettle helm: wide brim + dome.
      parts.push(
        cylinder(0.36, 0.36, 0.04, 10, { x: 0, y: 0.6, z: 0 }, p.metal),
        cylinder(0.1, 0.19, 0.18, 8, { x: 0, y: 0.71, z: 0 }, p.metal),
      );
      crossbow(parts, p);
      crossbowArms(parts, p, 1, true);
      break;
    case PlayerClass.Knight:
      baseBody(parts, p, { seated });
      // Great helm enclosing the whole head, with a vision slit.
      parts.push(
        cylinder(0.19, 0.22, 0.48, 8, { x: 0, y: 0.48, z: 0 }, p.metal),
        box(0.16, 0.03, 0.03, { x: 0, y: 0.52, z: -0.21 }, p.darkMetal),
        box(0.03, 0.12, 0.03, { x: 0, y: 0.42, z: -0.21 }, p.darkMetal),
      );
      heaterShield(parts, p);
      crossbow(parts, p);
      crossbowArms(parts, p, 1, false);
      shieldArm(parts, p, 1);
      break;
    case PlayerClass.WallGunner:
      baseBody(parts, p, { seated });
      // Mail coif: close hood over the head with a neck curtain.
      parts.push(
        sphere(0.23, { x: 0, y: 0.47, z: 0 }, p.metal, 1.05),
        cylinder(0.2, 0.27, 0.22, 8, { x: 0, y: 0.28, z: 0 }, p.metal),
      );
      crossbow(parts, p);
      crossbowArms(parts, p, 1, true);
      break;
    case PlayerClass.Priest:
      baseBody(parts, p, { robe: true, seated });
      // Kamilavka with a trim band.
      parts.push(
        cylinder(0.16, 0.19, 0.36, 8, { x: 0, y: 0.78, z: 0 }, p.felt),
        cylinder(0.195, 0.2, 0.06, 8, { x: 0, y: 0.62, z: 0 }, p.trim),
      );
      // Processional standard: pole, crossbar, icon panel, finial.
      parts.push(
        cylinder(0.024, 0.024, 2.35, 6, { x: 0.48, y: 0.32, z: -0.08 }, p.wood),
        box(0.4, 0.04, 0.04, { x: 0.48, y: 1.32, z: -0.08 }, p.trim),
        box(0.3, 0.36, 0.03, { x: 0.48, y: 1.06, z: -0.08 }, p.trim),
        sphere(0.05, { x: 0.48, y: 1.5, z: -0.08 }, p.trim),
      );
      standardArms(parts, p, 1);
      break;
    case PlayerClass.Janissary:
    default:
      baseBody(parts, p, { seated });
      // Tall felt börk with a forward-tilted plume; long arquebus across the body.
      parts.push(
        cylinder(0.15, 0.2, 0.46, 8, { x: 0, y: 0.82, z: 0.02, rx: 0.06 }, p.felt),
        box(0.05, 0.3, 0.05, { x: 0, y: 0.92, z: -0.14, rx: 0.3 }, p.plume),
      );
      arquebus(parts, p);
      arquebusArms(parts, p, 1);
      break;
  }
  return parts;
}

function assemble(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (merged === null) throw new Error("soldierModels: incompatible primitive attributes");
  const flat = merged.toNonIndexed();
  merged.dispose();
  // Per-face normals on non-shared vertices read as flat shading.
  flat.computeVertexNormals();
  return flat;
}

function clampVariant(variant: number | undefined): VariantIndex {
  return variant === 1 || variant === 2 ? variant : 0;
}

function paletteFor(playerClass: PlayerClass, variant: VariantIndex): SoldierPalette {
  const team = CLASS_TUNING[playerClass].team;
  const set = team === Team.Byzantine ? BYZANTINE_PALETTES : OTTOMAN_PALETTES;
  return set[variant];
}

const soldierCache = new Map<number, THREE.BufferGeometry>();
const seatedSoldierCache = new Map<number, THREE.BufferGeometry>();
const horseCache = new Map<VariantIndex, THREE.BufferGeometry>();

/**
 * Merged, vertex-colored, flat-shaded soldier geometry for a class + skin
 * variant (0 = base uniform, 1 = rank-6 veteran, 2 = gold-medal elite;
 * out-of-range falls back to 0). Cached per (class, variant) — the returned
 * instance is shared and must not be mutated or disposed by callers.
 */
export function soldierGeometry(playerClass: PlayerClass, variant?: number): THREE.BufferGeometry {
  const resolvedClass = playerClass >= PlayerClass.Janissary && playerClass <= PlayerClass.Priest
    ? playerClass
    : PlayerClass.Janissary;
  const resolvedVariant = clampVariant(variant);
  const key = resolvedClass * 10 + resolvedVariant;
  const cached = soldierCache.get(key);
  if (cached !== undefined) return cached;
  const geometry = assemble(buildSoldierParts(resolvedClass, paletteFor(resolvedClass, resolvedVariant)));
  soldierCache.set(key, geometry);
  return geometry;
}

/**
 * Cached cavalry rider geometry. The upper body keeps the class silhouette;
 * legs are baked forward/apart around the saddle instead of standing through
 * the horse. Uses a separate cache because InstancedMesh owns one geometry.
 */
export function seatedSoldierGeometry(playerClass: PlayerClass, variant?: number): THREE.BufferGeometry {
  const resolvedClass = playerClass >= PlayerClass.Janissary && playerClass <= PlayerClass.Priest
    ? playerClass
    : PlayerClass.Janissary;
  const resolvedVariant = clampVariant(variant);
  const key = resolvedClass * 10 + resolvedVariant;
  const cached = seatedSoldierCache.get(key);
  if (cached !== undefined) return cached;
  const geometry = assemble(buildSoldierParts(resolvedClass, paletteFor(resolvedClass, resolvedVariant), true));
  seatedSoldierCache.set(key, geometry);
  return geometry;
}

/** Entity-center to seated-rider geometry origin; pelvis lands on saddle top. */
export const MOUNTED_RIDER_CENTER_OFFSET = 0.82;

const HORSE_COAT = 0x6a4930;
const HORSE_DARK = 0x4e3320;
const HORSE_BLANKETS: readonly [number, number, number] = [0x7a5230, 0x5e4026, 0x8a5a2e];

/**
 * Low-poly cavalry horse replacing the old 1.15 × 0.75 × 1.7 placeholder box
 * (same footprint, nose toward local -Z, hooves touching ground when the
 * instance sits at entity y + 0.05). The saddle blanket is faction-neutral
 * leather — team identity comes from the rider. `variant` only shifts the
 * blanket tint for now. Cached; do not mutate or dispose the result.
 */
export function horseGeometry(variant?: number): THREE.BufferGeometry {
  const resolvedVariant = clampVariant(variant);
  const cached = horseCache.get(resolvedVariant);
  if (cached !== undefined) return cached;
  const blanket = HORSE_BLANKETS[resolvedVariant];
  const geometry = assemble([
    box(0.62, 0.62, 1.5, { x: 0, y: 0, z: 0 }, HORSE_COAT),
    box(0.26, 0.62, 0.34, { x: 0, y: 0.42, z: -0.78, rx: -0.5 }, HORSE_COAT),
    box(0.22, 0.26, 0.52, { x: 0, y: 0.72, z: -1.05, rx: -0.35 }, HORSE_COAT),
    cone(0.04, 0.14, 4, { x: -0.08, y: 0.9, z: -0.92 }, HORSE_DARK),
    cone(0.04, 0.14, 4, { x: 0.08, y: 0.9, z: -0.92 }, HORSE_DARK),
    box(0.08, 0.52, 0.3, { x: 0, y: 0.55, z: -0.72, rx: -0.5 }, HORSE_DARK),
    box(0.15, 0.66, 0.17, { x: -0.2, y: -0.62, z: -0.5 }, HORSE_DARK),
    box(0.15, 0.66, 0.17, { x: 0.2, y: -0.62, z: -0.5 }, HORSE_DARK),
    box(0.15, 0.66, 0.17, { x: -0.2, y: -0.62, z: 0.5 }, HORSE_DARK),
    box(0.15, 0.66, 0.17, { x: 0.2, y: -0.62, z: 0.5 }, HORSE_DARK),
    box(0.1, 0.5, 0.12, { x: 0, y: -0.08, z: 0.78, rx: 0.45 }, HORSE_DARK),
    box(0.7, 0.08, 0.72, { x: 0, y: 0.35, z: 0.1 }, blanket),
    box(0.4, 0.12, 0.4, { x: 0, y: 0.42, z: 0.1 }, 0x4a3626),
  ]);
  horseCache.set(resolvedVariant, geometry);
  return geometry;
}

/**
 * Maps a skin definition id (shared/src/skins.ts) to a geometry variant:
 * rank-6 skins → 1 (veteran), gold-medal skins → 2 (elite), anything else → 0.
 */
export function variantForSkinId(skinId: string | undefined): number {
  if (skinId === undefined) return 0;
  const definition = SKIN_DEFINITIONS.find((skin) => skin.id === skinId);
  if (definition === undefined) return 0;
  return definition.unlock.kind === "rank" ? 1 : 2;
}
