import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { AOI_MAX_ENTITIES, CLASS_TUNING, DEFAULT_WEAPON_SLOT, PlayerClass, Team } from "@janissary/shared";
import { CHARACTER_MODELS, CHARACTER_WEAPON_MODELS } from "../models/manifest";
import { loadModel } from "../models/loader";

/**
 * Phase 8e-12 rigged characters: replaces the 8c-2 procedural blocky soldiers
 * for foot entities with six Meshy rigged characters (one skinned GLB each,
 * clips merged by tools/prep-characters.mjs). Hybrid LOD per ADR 0018's
 * recommendation, on the M2-Air budget ADR 0032 documented:
 *
 *  - NEAR (≤ SKINNED_RADIUS, capped at RIG_CAPS per tier): a pooled skinned
 *    clone per entity, AnimationMixer-driven from replicated state only —
 *    speed-derived locomotion (idle/walk/run), fire/slash one-shots from the
 *    existing combat events, an aim-hold heuristic between shots, and a
 *    clamped death clip that lingers as a corpse.
 *  - FAR: the same character baked to a static idle pose, drawn in one
 *    InstancedMesh batch per model — silhouette-readable, one draw call per
 *    model, and the only path on low tier (RIG_CAPS.low = 0).
 *
 * Mounted cavalry uses the same faction/class assets at a saddle-height
 * offset. The downloaded drop has no seated clip, so the lower body is posed
 * procedurally after mixer evaluation while the authored upper-body idle or
 * slash remains intact. The legacy renderer stays behind __gameDebug. The
 * wire carries no remote aim bit (PlayerFlag has none — verified against
 * shared/src/constants.ts), so a stationary ranged soldier derives the
 * authored shouldered `aim` pose from its active visual weapon slot.
 *
 * Pool/pose discipline mirrors particles.ts: after load, the frame path
 * performs zero allocation (rigs and far batches are pre-allocated; per-frame
 * work is matrix writes and mixer updates on visible rigs only).
 */

// ---------------------------------------------------------------------------
// Class → model mapping (ADR 0042 §mapping). Six models cover eight classes;
// the same faction/class model is now also used for mounted presentation.
// ---------------------------------------------------------------------------

export type CharacterModelId = keyof typeof CHARACTER_MODELS;
export type WeaponModelId = keyof typeof CHARACTER_WEAPON_MODELS;

export function characterModelForClass(playerClass: PlayerClass): CharacterModelId {
  switch (playerClass) {
    case PlayerClass.Janissary: return "janissaryMusketeer";
    case PlayerClass.Sipahi: return "janissarySwordsman";
    case PlayerClass.Topcu: return "ottomanGunner";
    case PlayerClass.Mehter: return "ottomanAzap";
    case PlayerClass.Guardsman: return "byzantineCrossbowman";
    case PlayerClass.WallGunner: return "byzantineCrossbowman";
    case PlayerClass.Knight: return "byzantineGuardsman";
    case PlayerClass.Priest: return "byzantineGuardsman";
    case PlayerClass.None:
    default: return "janissaryMusketeer";
  }
}

export function teamForModel(model: CharacterModelId): Team {
  return model === "byzantineGuardsman" || model === "byzantineCrossbowman" ? Team.Byzantine : Team.Ottoman;
}

/** Slot → hand prop. Ottoman blades are kilij/yatagan; Byzantine get the mace (slot 1) and the same yatagan sidearm. */
export function weaponForSlot(model: CharacterModelId, slot: number): WeaponModelId {
  const byzantine = teamForModel(model) === Team.Byzantine;
  if (slot === 1) {
    if (byzantine) return "warMace";
    return model === "janissarySwordsman" || model === "ottomanAzap" ? "kilijSwordAlternative" : "kilijSword";
  }
  if (slot === 3) return "yatagan";
  if (byzantine) return "heavyCrossbow";
  return model === "ottomanGunner" || model === "ottomanAzap" ? "matchlockArquebusAlternative" : "matchlockArquebus";
}

// ---------------------------------------------------------------------------
// Animation state machine — the pure decision layer (unit-tested).
// ---------------------------------------------------------------------------

export type LocomotionClip = "idle" | "walk" | "run" | "run-alt";

// Phase 8e-19 Task 2: walk-only. MAX_SPEED (6.8) IS the walk speed; the run
// gait read as a sprint the owner banned, so no speed ever selects a run
// clip — a stale "run"/"run-alt" previous state resolves to walk. The type
// keeps its historical members (rigs still carry run clips; nothing selects
// them). Hysteresis survives around the walk edge only.
const WALK_ENTER_SPEED = 0.5;
const WALK_EXIT_SPEED = 0.25;

/** Locomotion clip from derived ground speed — walk or idle, never run. */
export function locomotionClipFor(previous: LocomotionClip, speed: number): LocomotionClip {
  const wasMoving = previous === "walk" || previous === "run" || previous === "run-alt";
  if (wasMoving && speed >= WALK_EXIT_SPEED) return "walk";
  if (speed >= WALK_ENTER_SPEED) return "walk";
  return "idle";
}

export interface BaseClipInput {
  readonly ranged: boolean;
  readonly speed: number;
  readonly previousLocomotion: LocomotionClip;
}

const AIM_MAX_SPEED = 0.5;

/**
 * The base (looping) clip: a stationary combatant with a ranged weapon keeps
 * the authored two-hand ready pose. Idle/walk clips lower both hands and no
 * static prop transform can honestly turn that into a shouldered longarm;
 * using `aim` here fixes the old rifle/crossbow-through-torso presentation.
 * Moving soldiers use the authored walk and carry the longarm at their side.
 */
export function baseClipFor(input: BaseClipInput): string {
  if (input.ranged && input.speed < AIM_MAX_SPEED) return "aim";
  return locomotionClipFor(input.previousLocomotion, input.speed);
}

/**
 * Index of the rig to steal for a same-model acquire, or -1. Corpses are
 * always stolen first (a vanished corpse beats a vanished live soldier);
 * live rigs only when farther than the requester. Candidates are
 * (distanceSq, corpse) pairs in pool order.
 */
export function pickStealRig(candidates: readonly { readonly distanceSq: number; readonly corpse: boolean }[], requesterDistanceSq: number): number {
  let corpseIndex = -1;
  let farthestIndex = -1;
  let farthestDistanceSq = requesterDistanceSq;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate === undefined) continue;
    if (candidate.corpse) {
      if (corpseIndex === -1) corpseIndex = index;
      continue;
    }
    if (candidate.distanceSq > farthestDistanceSq) {
      farthestDistanceSq = candidate.distanceSq;
      farthestIndex = index;
    }
  }
  return corpseIndex !== -1 ? corpseIndex : farthestIndex;
}

// ---------------------------------------------------------------------------
// Tunables (tier-scaled per ADR 0028's lever-table discipline)
// ---------------------------------------------------------------------------

export const SKINNED_RADIUS_METERS = 60; // matches #renderRemoteEntities' near/far split
/** Total live+corpse skinned rigs across all six models. */
export const RIG_CAPS: Readonly<Record<"low" | "medium" | "high", number>> = { low: 0, medium: 14, high: 24 };
export const CORPSE_CAPS: Readonly<Record<"low" | "medium" | "high", number>> = { low: 0, medium: 4, high: 8 };
const CORPSE_SECONDS = 4; // bots respawn in 3; the corpse outlives the respawn by a beat
const CORPSE_SPAWN_RADIUS_SQ = 45 * 45; // no rig at death → corpse only when this close to the camera
/** 8e-16: a fresh corpse cannot be stolen for a live rig this long — the fall
 * must read before the pool recycles the body at saturated clusters. */
const CORPSE_STEAL_PROTECT_MS = 1_500;
const FEET_OFFSET_Y = 0.9; // entity origin is body-center (GROUND_CENTER_Y); rig pivot is the feet
export const MOUNTED_RIG_Y_OFFSET = 0.65;
const FADE_SECONDS = 0.18;
const ONESHOT_FADE_IN = 0.06;
const ONESHOT_HOLD_MS = 1_300; // fire/slash clips are 3.03 s with dead tail — cut back early
const ONESHOT_TIMESCALE = 1.35;
/** Model yaw fix: the Meshy rigs face +Z; entity forward is -Z (ADR 0032's convention). */
const MODEL_YAW_OFFSET = Math.PI;

/**
 * Corpse clip policy (Phase 8e-16): play the death clip once and CLAMP on its
 * last frame — the corpse holds the fallen pose until it expires. A rig that
 * already has a running action cross-fades in; a fresh rig (a corpse spawned
 * by a death event for an entity that never rendered) must snap to full
 * weight — fading in from nothing shows the bind pose for the fade window,
 * which is exactly the standing-T-pose corpse the 8e-12 screenshot review
 * caught. Exported for the state test in test/characters.test.ts.
 */
export function configureDeathAction(action: THREE.AnimationAction, hasRunningAction: boolean): void {
  action.reset().setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveTimeScale(1).setEffectiveWeight(1);
  if (hasRunningAction) action.fadeIn(ONESHOT_FADE_IN);
  action.play();
}

interface WeaponGrip {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
}

/** Dev-only per-rig state row (8e-16 diagnosis hook, `__gameDebug.characterRigs`). */
export interface RigDebugRow {
  readonly model: string;
  readonly entityId: number;
  readonly mode: RigMode;
  readonly visible: boolean;
  readonly action: string | null;
  readonly weight: number;
  readonly actionTime: number;
  readonly running: boolean;
  readonly oneShot: string | null;
  readonly locomotion: LocomotionClip;
  readonly height: number;
  readonly rootX: number;
  readonly rootY: number;
  readonly rootZ: number;
  readonly mounted: boolean;
  readonly leftFootY: number | null;
  readonly rightFootY: number | null;
  readonly leftKnee: readonly [number, number, number] | null;
  readonly rightKnee: readonly [number, number, number] | null;
  readonly leftFoot: readonly [number, number, number] | null;
  readonly rightFoot: readonly [number, number, number] | null;
}
/** Hand-bone-local prop placement, screenshot-tuned per weapon (ADR 0042 §weapons).
 * Units are bone-local centimetres (the armature's 0.0106 scale is countered on
 * the mesh, not the group). All meshy weapons are authored long-axis +X with the
 * working end at +X; the +90° Z roll lays that along the hand's finger axis. */
const WEAPON_GRIPS: Readonly<Record<WeaponModelId, WeaponGrip>> = {
  matchlockArquebus: { position: [0, 18, 0], rotation: [0, 0, Math.PI / 2] },
  matchlockArquebusAlternative: { position: [0, 18, 0], rotation: [0, 0, Math.PI / 2] },
  // 8e-18 screenshot pass (weapon-grip-shots.mjs): the Meshy blades are
  // authored tip +X / hilt −X with a CENTRED origin, so the +90° Z roll alone
  // left the fist wrapping the blade with the handle dangling below it — the
  // +Y shift slides the handle section up into the palm (fist centre sits a
  // few cm along the bone's finger axis).
  kilijSword: { position: [0, 40, 0], rotation: [0, 0, Math.PI / 2] },
  kilijSwordAlternative: { position: [0, 40, 0], rotation: [0, 0, Math.PI / 2] },
  yatagan: { position: [0, 30, 0], rotation: [0, 0, Math.PI / 2] },
  heavyCrossbow: { position: [0, 14, 0], rotation: [0, 0, Math.PI / 2] },
  // The mace is authored shaft-along-Y (head at +Y), unlike the +X blades, so
  // it takes NO roll — identity lays the shaft on the finger axis already;
  // +25 cm puts the lower handle in the fist with the head above it.
  warMace: { position: [0, 25, 0], rotation: [0, 0, 0] },
};

/**
 * 8e-16 two-hand longarms. A static hand-bone grip can't express a shouldered
 * two-hand hold: as the aim/fire clips raise and rotate the right wrist, a
 * fixed offset swings the barrel sideways (the owner's "gun stuck to their
 * hand" complaint). The slot-2 longarm is parented to the rig ROOT (metre
 * scale, no bone counter-scale) and placed procedurally every frame:
 *
 *  - aim/fire clips: the clip poses both arms in a rifle hold, but the
 *    wrist-to-wrist axis is NOT the barrel line (it runs ~70° off the facing
 *    direction — measured 2026-08-06). So the weapon is centred between the
 *    two wrists and aimed along the rig's facing axis, level: the butt tucks
 *    to the shoulder, the forestock lands in the cupped left palm.
 *  - all other clips (carry): the weapon tracks the right wrist with the
 *    former static grip, in world metres instead of bone centimetres.
 */
const LONGARM_WEAPONS: ReadonlySet<WeaponModelId> = new Set(["matchlockArquebus", "matchlockArquebusAlternative", "heavyCrossbow"]);
/** Aimed placement: weapon origin this far forward of the wrist midpoint along
 * the facing axis — the 1.35 m arquebus's grip section ends up between the
 * hands, butt back at the shoulder. */
const LONGARM_AIM_FORWARD_M = 0.3;
const CROSSBOW_AIM_FORWARD_M = 0.08;

/** Meshy crossbow's prod is at -X; firearm muzzles are at +X. */
export function longarmAxisSign(weapon: WeaponModelId): 1 | -1 {
  return weapon === "heavyCrossbow" ? -1 : 1;
}

export function longarmAimForward(weapon: WeaponModelId): number {
  return weapon === "heavyCrossbow" ? CROSSBOW_AIM_FORWARD_M : LONGARM_AIM_FORWARD_M;
}

/** Only clips authored with raised arms may use the wrist-to-wrist shoulder
 * placement. Idle/walk/death clips use the right-hand carry transform. */
export function longarmUsesTwoHandPlacement(clipName: string | null | undefined): boolean {
  return clipName === "aim" || clipName === "fire";
}

// ---------------------------------------------------------------------------
// Loaded asset caches
// ---------------------------------------------------------------------------

interface LoadedCharacter {
  readonly id: CharacterModelId;
  readonly template: THREE.Group;
  readonly clips: ReadonlyMap<string, THREE.AnimationClip>;
  readonly material: THREE.Material;
  readonly farGeometry: THREE.BufferGeometry; // idle-pose skin bake
  readonly farBatch: THREE.InstancedMesh;
  readonly farMountedGeometry: THREE.BufferGeometry; // seated lower-body bake
  readonly farMountedBatch: THREE.InstancedMesh;
  /** One slot-specific batch is active per visible far weapon. This avoids
   * distant swords/daggers/cavalry silently reverting to the slot-2 rifle. */
  readonly farWeaponGeometries: readonly THREE.BufferGeometry[];
  readonly farWeaponBatches: readonly THREE.InstancedMesh[];
  farCount: number;
  farMountedCount: number;
  farWeaponCounts: [number, number, number];
}

const gltfLoader = new GLTFLoader();
const characterCache = new Map<string, Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>>();
const SCRATCH_VEC = new THREE.Vector3(); // rig-build scratch only — never the frame path
// Frame-path longarm scratches (8e-16): reused across rigs, never allocated per call.
const LONGARM_RIGHT = new THREE.Vector3();
const LONGARM_LEFT = new THREE.Vector3();
const LONGARM_UP = new THREE.Vector3(0, 1, 0);
const LONGARM_BASIS = new THREE.Matrix4();
const LONGARM_WORLD = new THREE.Matrix4();
const LONGARM_ROOT_INV = new THREE.Matrix4();
const LONGARM_QUAT = new THREE.Quaternion();
const LONGARM_POS = new THREE.Vector3();
const LONGARM_ONE = new THREE.Vector3(1, 1, 1);
const LONGARM_SIDE = new THREE.Vector3();
const LONGARM_TMP = new THREE.Vector3();
const LONGARM_FACING = new THREE.Vector3();
// The six Meshy characters share the same named Mixamo-style skeleton. These
// local-space offsets turn its standing lower body into a stable saddle pose
// after each AnimationMixer update, preserving authored torso/arm animation.
// Mirrored Z rolls open the knees around the horse instead of letting both
// legs intersect its barrel.
// Browser-calibrated against the prepared 2.4 m horse: knees land on opposite
// sides of the barrel and boots at stirrup height (rather than both legs
// hanging through the horse's left flank).
const MOUNTED_LEFT_THIGH = new THREE.Quaternion().setFromEuler(new THREE.Euler(1, 1, -1.5));
const MOUNTED_RIGHT_THIGH = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.5, 1, 0));
const MOUNTED_LEFT_SHIN = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.28, 0, 0));
const MOUNTED_RIGHT_SHIN = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.28, 0, 0));
const MOUNTED_FOOT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.28, 0, 0));
const MOUNTED_TUNE_EULER = new THREE.Euler();
const FAR_WEAPON_EULER = new THREE.Euler();
const FAR_WEAPON_LOCAL = new THREE.Matrix4();
const FAR_WEAPON_SCALE = new THREE.Vector3();

/** Upright one-hand carry: muzzle/stock rises beside the right leg with a
 * small forward lean. The old hand-quaternion carry could rotate a horizontal
 * 1.35 m rifle straight through the abdomen on idle/walk clips. */
function longarmCarryFrame(weaponId: WeaponModelId, rightHand: THREE.Vector3, yaw: number): void {
  LONGARM_FACING.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  LONGARM_POS.copy(LONGARM_UP).multiplyScalar(0.94).addScaledVector(LONGARM_FACING, 0.34).normalize();
  LONGARM_TMP.copy(LONGARM_POS).multiplyScalar(longarmAxisSign(weaponId));
  LONGARM_SIDE.crossVectors(LONGARM_TMP, LONGARM_UP).normalize();
  LONGARM_FACING.crossVectors(LONGARM_SIDE, LONGARM_TMP).normalize();
  LONGARM_BASIS.makeBasis(LONGARM_TMP, LONGARM_FACING, LONGARM_SIDE);
  LONGARM_QUAT.setFromRotationMatrix(LONGARM_BASIS);
  LONGARM_POS.multiplyScalar(0.2).add(rightHand);
}

function loadCharacterGltf(path: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  const cached = characterCache.get(path);
  if (cached !== undefined) return cached;
  const pending = gltfLoader.loadAsync(`/${path}`).then((gltf) => ({ scene: gltf.scene, animations: gltf.animations }));
  characterCache.set(path, pending);
  return pending;
}

type RigMode = "live" | "corpse";

interface MountedBones {
  readonly leftUpLeg: THREE.Object3D;
  readonly leftLeg: THREE.Object3D;
  readonly leftFoot: THREE.Object3D;
  readonly rightUpLeg: THREE.Object3D;
  readonly rightLeg: THREE.Object3D;
  readonly rightFoot: THREE.Object3D;
}

interface Rig {
  readonly root: THREE.Group; // game transform: entity position + yaw
  readonly mixer: THREE.AnimationMixer;
  readonly actions: ReadonlyMap<string, THREE.AnimationAction>;
  readonly weapons: readonly THREE.Object3D[]; // slot 1/2/3 props on the right hand
  model: LoadedCharacter;
  entityId: number; // -1 when free
  mode: RigMode;
  activeAction: THREE.AnimationAction | null;
  oneShot: THREE.AnimationAction | null;
  oneShotUntil: number;
  /** Visual slot carried for the duration of a server-confirmed melee swing.
   * Bots fight with slot 1 while their replicated selected slot stays 2. */
  oneShotWeaponSlot: number | null;
  locomotion: LocomotionClip;
  corpseUntil: number;
  corpseFrozenAt: number;
  weaponSlot: number;
  distanceSq: number;
  seenAt: number; // frame stamp of the last pose() — stale rigs get reclaimed
  /** False only after build/stopAllAction — nothing running to crossfade from,
   * so the next play must snap to full weight instead of fading in from a
   * stale (or bind) pose (8e-16: the "T-posed soldiers" screenshot artifact). */
  hasRunningAction: boolean;
  /** Two-hand longarm state (8e-16): root-parented slot-2 weapon + the bones
   * it spans. Null for blade-only loadouts. */
  longarm: THREE.Group | null;
  rightHand: THREE.Object3D | null;
  leftHand: THREE.Object3D | null;
  /** Lower-body bones used by the post-mixer cavalry seat pose. */
  mountedBones: MountedBones | null;
  mounted: boolean;
  /** Dev-probe clip pin (debugForceClip); poseRig skips base switching while set. */
  forcedClip: string | null;
  /** Dev-probe slot pin (debugForceSlot, 8e-18); poseRig keeps showing the
   * pinned slot's prop instead of the replicated one while set. Bots never
   * press Slot1/3, so blade/sidearm grips are otherwise unphotographable. */
  forcedSlot: number | null;
  /** Fresh corpses are protected from live-rig stealing until this timestamp
   * (8e-16): at a saturated cluster the pool recycled each corpse within a
   * second, so the fall never read on screen. */
  corpseStealableAt: number;
}

function mountedBonesFor(root: THREE.Object3D): MountedBones | null {
  const leftUpLeg = root.getObjectByName("LeftUpLeg");
  const leftLeg = root.getObjectByName("LeftLeg");
  const leftFoot = root.getObjectByName("LeftFoot");
  const rightUpLeg = root.getObjectByName("RightUpLeg");
  const rightLeg = root.getObjectByName("RightLeg");
  const rightFoot = root.getObjectByName("RightFoot");
  return leftUpLeg !== undefined && leftLeg !== undefined && leftFoot !== undefined
    && rightUpLeg !== undefined && rightLeg !== undefined && rightFoot !== undefined
    ? { leftUpLeg, leftLeg, leftFoot, rightUpLeg, rightLeg, rightFoot }
    : null;
}

function applyMountedBoneOffsets(bones: MountedBones): void {
  bones.leftUpLeg.quaternion.multiply(MOUNTED_LEFT_THIGH);
  bones.rightUpLeg.quaternion.multiply(MOUNTED_RIGHT_THIGH);
  bones.leftLeg.quaternion.multiply(MOUNTED_LEFT_SHIN);
  bones.rightLeg.quaternion.multiply(MOUNTED_RIGHT_SHIN);
  bones.leftFoot.quaternion.multiply(MOUNTED_FOOT);
  bones.rightFoot.quaternion.multiply(MOUNTED_FOOT);
}

/**
 * Bakes a rigged character's idle pose into ONE static BufferGeometry for the
 * far-LOD InstancedMesh: every vertex is CPU-skinned at idle mid-frame, in
 * model yaw-fixed space (feet at y=0, facing -Z) so far batches take the same
 * translate/rotate instance transform the near rigs do.
 */
function bakeFarGeometry(template: THREE.Group, clips: ReadonlyMap<string, THREE.AnimationClip>, mounted = false): THREE.BufferGeometry {
  const idle = clips.get("idle");
  if (idle === undefined) throw new Error("character has no idle clip to bake");
  const mixer = new THREE.AnimationMixer(template);
  mixer.clipAction(idle).play();
  mixer.update(0.5);
  const mountedBones = mounted ? mountedBonesFor(template) : null;
  const mountedBase = mountedBones === null ? null : [
    mountedBones.leftUpLeg.quaternion.clone(), mountedBones.leftLeg.quaternion.clone(), mountedBones.leftFoot.quaternion.clone(),
    mountedBones.rightUpLeg.quaternion.clone(), mountedBones.rightLeg.quaternion.clone(), mountedBones.rightFoot.quaternion.clone(),
  ] as const;
  if (mountedBones !== null) applyMountedBoneOffsets(mountedBones);
  template.updateMatrixWorld(true);

  const baked: THREE.BufferGeometry[] = [];
  const base = new THREE.Vector3();
  const skinned = new THREE.Vector3();
  const contribution = new THREE.Vector3();
  const normalBase = new THREE.Vector3();
  const normalOut = new THREE.Vector3();
  const boneMatrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  template.traverse((node) => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    const geometry = node.geometry.clone();
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const skinIndex = geometry.getAttribute("skinIndex");
    const skinWeight = geometry.getAttribute("skinWeight");
    const skeleton = node.skeleton;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      base.fromBufferAttribute(position, vertex).applyMatrix4(node.bindMatrix);
      normalBase.fromBufferAttribute(normal, vertex);
      skinned.set(0, 0, 0);
      normalOut.set(0, 0, 0);
      for (let k = 0; k < 4; k += 1) {
        const weight = skinWeight.getComponent(vertex, k);
        if (weight === 0) continue;
        const boneIndex = skinIndex.getComponent(vertex, k);
        const bone = skeleton.bones[boneIndex];
        const boneInverse = skeleton.boneInverses[boneIndex];
        if (bone === undefined || boneInverse === undefined) continue;
        boneMatrix.multiplyMatrices(bone.matrixWorld, boneInverse);
        contribution.copy(base).applyMatrix4(boneMatrix);
        skinned.addScaledVector(contribution, weight);
        normalMatrix.setFromMatrix4(boneMatrix);
        contribution.copy(normalBase).applyMatrix3(normalMatrix);
        normalOut.addScaledVector(contribution, weight);
      }
      position.setXYZ(vertex, skinned.x, skinned.y, skinned.z);
      normalOut.normalize();
      normal.setXYZ(vertex, normalOut.x, normalOut.y, normalOut.z);
    }
    geometry.deleteAttribute("skinIndex");
    geometry.deleteAttribute("skinWeight");
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") geometry.deleteAttribute(name);
    }
    baked.push(geometry);
  });
  if (mountedBones !== null && mountedBase !== null) {
    mountedBones.leftUpLeg.quaternion.copy(mountedBase[0]);
    mountedBones.leftLeg.quaternion.copy(mountedBase[1]);
    mountedBones.leftFoot.quaternion.copy(mountedBase[2]);
    mountedBones.rightUpLeg.quaternion.copy(mountedBase[3]);
    mountedBones.rightLeg.quaternion.copy(mountedBase[4]);
    mountedBones.rightFoot.quaternion.copy(mountedBase[5]);
    template.updateMatrixWorld(true);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(template);
  const merged = mergeGeometries(baked, false);
  if (merged === null) throw new Error("character bake: incompatible primitive attributes");
  return merged;
}

/** Bake one slot prop into the model-local idle/carry frame for far LOD. */
function bakeFarWeaponGeometry(template: THREE.Group, weaponId: WeaponModelId, source: THREE.BufferGeometry): THREE.BufferGeometry {
  const rightHand = template.getObjectByName("RightHand");
  if (rightHand === undefined) return source.clone();
  rightHand.updateWorldMatrix(true, false);
  if (LONGARM_WEAPONS.has(weaponId)) {
    // Bind/idle wrists hang at the sides; a midpoint bake cuts the torso.
    // Match the near renderer's upright one-hand carry instead.
    rightHand.getWorldPosition(LONGARM_RIGHT);
    longarmCarryFrame(weaponId, LONGARM_RIGHT, 0);
    LONGARM_WORLD.compose(LONGARM_POS, LONGARM_QUAT, LONGARM_ONE);
    return source.clone().applyMatrix4(LONGARM_WORLD);
  }
  const grip = WEAPON_GRIPS[weaponId];
  rightHand.getWorldScale(FAR_WEAPON_SCALE);
  const meshScale = FAR_WEAPON_SCALE.x === 0 ? 1 : 1 / FAR_WEAPON_SCALE.x;
  LONGARM_POS.set(grip.position[0], grip.position[1], grip.position[2]);
  LONGARM_QUAT.setFromEuler(FAR_WEAPON_EULER.set(grip.rotation[0], grip.rotation[1], grip.rotation[2]));
  FAR_WEAPON_SCALE.setScalar(meshScale);
  FAR_WEAPON_LOCAL.compose(LONGARM_POS, LONGARM_QUAT, FAR_WEAPON_SCALE);
  LONGARM_WORLD.multiplyMatrices(rightHand.matrixWorld, FAR_WEAPON_LOCAL);
  return source.clone().applyMatrix4(LONGARM_WORLD);
}

// ---------------------------------------------------------------------------
// The renderer
// ---------------------------------------------------------------------------

export interface CharacterPose {
  readonly entityId: number;
  readonly playerClass: PlayerClass;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** Derived ground speed in m/s (0 for far entities — they don't animate). */
  readonly speed: number;
  readonly weaponSlot: number;
  readonly near: boolean;
  readonly distanceSq: number;
  readonly flash: boolean;
  readonly mounted: boolean;
}

export class CharacterRenderer {
  readonly #scene: THREE.Scene;
  readonly #models = new Map<CharacterModelId, LoadedCharacter>();
  readonly #weaponGeometries = new Map<WeaponModelId, { geometry: THREE.BufferGeometry; material: THREE.Material }>();
  readonly #freeByModel = new Map<CharacterModelId, Rig[]>();
  readonly #rigByEntity = new Map<number, Rig>();
  readonly #corpses: Rig[] = [];
  #rigCount = 0;
  #rigCap = RIG_CAPS.high;
  #corpseCap = CORPSE_CAPS.high;
  #frameStamp = 0;
  #cameraX = 0;
  #cameraZ = 0;
  // Dev-only diagnosis counters (8e-16): why corpses never spawned during the
  // screenshot hunt. Exposed via debugCounts().
  readonly #deathStats = { calls: 0, far: 0, capped: 0, unrigged: 0, spawned: 0 };
  #ready = false;
  readonly #transform = new THREE.Object3D();
  readonly #white = new THREE.Color(0xffffff);
  readonly #flash = new THREE.Color(0xe8c778);

  constructor(scene: THREE.Scene) {
    this.#scene = scene;
  }

  get ready(): boolean {
    return this.#ready;
  }

  /** Fire-and-forget: the old instanced path renders until every model lands. */
  load(): void {
    const timeout = new Promise<never>((_resolve, reject) => {
      setTimeout(() => { reject(new Error("characters: load timed out after 20 s")); }, 20_000);
    });
    void Promise.race([this.#loadAll(), timeout]).catch((error: unknown) => {
      // The 8e-0 lesson: never fail silently in dev — a swallowed load error
      // here cost nothing visible except the entire phase.
      console.error("characters: load failed, staying on procedural soldiers", error);
    });
  }

  async #loadAll(): Promise<void> {
    const entries = Object.entries(CHARACTER_MODELS) as [CharacterModelId, string][];
    const loaded = await Promise.all(entries.map(async ([id, path]) => {
      const gltf = await loadCharacterGltf(path);
      return { id, ...gltf };
    }));
    const weaponEntries = Object.entries(CHARACTER_WEAPON_MODELS) as [WeaponModelId, string][];
    await Promise.all(weaponEntries.map(async ([id, path]) => {
      const model = await loadModel(path);
      const material = (model.material as THREE.MeshStandardMaterial).clone();
      material.metalness = 0;
      material.roughness = 0.9;
      this.#weaponGeometries.set(id, { geometry: model.geometry, material });
    }));
    for (const { id, scene, animations } of loaded) {
      const clips = new Map<string, THREE.AnimationClip>();
      for (const clip of animations) clips.set(clip.name, clip);
      let material: THREE.Material | undefined;
      scene.traverse((node) => {
        if (node instanceof THREE.SkinnedMesh) {
          node.castShadow = true;
          node.frustumCulled = false; // bind-pose bounds don't cover animated poses
          const meshMaterial = node.material as THREE.MeshStandardMaterial;
          meshMaterial.metalness = 0;
          meshMaterial.roughness = 0.9;
          material = meshMaterial;
        }
      });
      if (material === undefined) throw new Error(`${id}: no skinned mesh`);
      // The template carries the orientation fix permanently so clones and
      // the far bake inherit it; rigs then take the raw entity yaw.
      scene.rotation.y = MODEL_YAW_OFFSET;
      scene.updateMatrixWorld(true);
      const farGeometry = bakeFarGeometry(scene, clips);
      const farBatch = new THREE.InstancedMesh(farGeometry, material, AOI_MAX_ENTITIES + 1);
      farBatch.count = 0;
      farBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      farBatch.frustumCulled = false;
      farBatch.castShadow = true;
      this.#scene.add(farBatch);
      const farMountedGeometry = bakeFarGeometry(scene, clips, true);
      const farMountedBatch = new THREE.InstancedMesh(farMountedGeometry, material, AOI_MAX_ENTITIES + 1);
      farMountedBatch.count = 0;
      farMountedBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      farMountedBatch.frustumCulled = false;
      farMountedBatch.castShadow = true;
      this.#scene.add(farMountedBatch);
      const farWeaponGeometries: THREE.BufferGeometry[] = [];
      const farWeaponBatches: THREE.InstancedMesh[] = [];
      for (const slot of [1, 2, 3]) {
        const weaponId = weaponForSlot(id, slot);
        const weapon = this.#weaponGeometries.get(weaponId);
        if (weapon === undefined) throw new Error(`${id}: slot-${slot} weapon geometry missing`);
        const geometry = bakeFarWeaponGeometry(scene, weaponId, weapon.geometry);
        const batch = new THREE.InstancedMesh(geometry, weapon.material, AOI_MAX_ENTITIES + 1);
        batch.count = 0;
        batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        batch.frustumCulled = false;
        batch.castShadow = true;
        this.#scene.add(batch);
        farWeaponGeometries.push(geometry);
        farWeaponBatches.push(batch);
      }
      this.#models.set(id, {
        id, template: scene, clips, material, farGeometry, farBatch, farMountedGeometry, farMountedBatch,
        farWeaponGeometries, farWeaponBatches, farCount: 0, farMountedCount: 0, farWeaponCounts: [0, 0, 0],
      });
      this.#freeByModel.set(id, []);
    }
    this.#ready = true;
  }

  setQuality(quality: "low" | "medium" | "high"): void {
    this.#rigCap = RIG_CAPS[quality];
    this.#corpseCap = CORPSE_CAPS[quality];
  }

  /** Per-frame camera context for corpse-spawn distance checks. */
  beginFrame(cameraX: number, cameraZ: number): void {
    this.#frameStamp += 1;
    this.#cameraX = cameraX;
    this.#cameraZ = cameraZ;
    for (const model of this.#models.values()) {
      model.farCount = 0;
      model.farMountedCount = 0;
      model.farWeaponCounts[0] = 0;
      model.farWeaponCounts[1] = 0;
      model.farWeaponCounts[2] = 0;
    }
  }

  /**
   * Consume one visible foot entity. Returns true when the renderer drew it
   * (skinned rig near, far batch otherwise) and the caller must SKIP the
   * legacy instanced write; false = caller falls back to the old path.
   */
  offer(pose: CharacterPose, now: number): boolean {
    if (!this.#ready) return false;
    const modelId = characterModelForClass(pose.playerClass);
    const model = this.#models.get(modelId);
    if (model === undefined) return false;
    if (pose.near && this.#rigCap > 0) {
      const rig = this.#acquire(model, pose, false, now);
      if (rig !== undefined) {
        this.#poseRig(rig, pose, now);
        return true;
      }
    }
    this.#transform.position.set(pose.x, pose.y - FEET_OFFSET_Y, pose.z);
    this.#transform.rotation.set(0, pose.yaw, 0);
    this.#transform.scale.set(1, 1, 1);
    this.#transform.updateMatrix();
    const characterBatch = pose.mounted ? model.farMountedBatch : model.farBatch;
    const index = pose.mounted ? model.farMountedCount : model.farCount;
    if (index >= characterBatch.instanceMatrix.count) return true; // capacity == AOI cap; never hit in practice
    characterBatch.setMatrixAt(index, this.#transform.matrix);
    characterBatch.setColorAt(index, pose.flash ? this.#flash : this.#white);
    if (pose.mounted) model.farMountedCount = index + 1;
    else model.farCount = index + 1;
    if (pose.weaponSlot >= 1 && pose.weaponSlot <= 3) {
      const weaponIndex = pose.weaponSlot - 1;
      const weaponBatch = model.farWeaponBatches[weaponIndex];
      const weaponCount = model.farWeaponCounts[weaponIndex] ?? 0;
      if (weaponBatch !== undefined && weaponCount < weaponBatch.instanceMatrix.count) {
        weaponBatch.setMatrixAt(weaponCount, this.#transform.matrix);
        model.farWeaponCounts[weaponIndex] = weaponCount + 1;
      }
    }
    return true;
  }

  /** Fire event for an entity: one-shot recoil. */
  onFire(entityId: number, now: number): void {
    const rig = this.#rigByEntity.get(entityId);
    if (rig === undefined || rig.mode !== "live") return;
    rig.oneShotWeaponSlot = null;
    const fire = rig.actions.get("fire");
    if (fire !== undefined) this.#playOneShot(rig, fire, now);
  }

  /** Authoritative melee attempt (hit or miss), including the actual visual slot. */
  onMelee(entityId: number, weaponSlot: number, now: number): void {
    const rig = this.#rigByEntity.get(entityId);
    if (rig === undefined || rig.mode !== "live") return;
    const slash = rig.actions.get("slash");
    if (slash !== undefined) {
      rig.oneShotWeaponSlot = weaponSlot >= 1 && weaponSlot <= 3 ? weaponSlot : 1;
      this.#playOneShot(rig, slash, now);
    }
  }

  /** Death event: the victim's rig becomes a clamped corpse in place. */
  onDeath(entityId: number, x: number, y: number, z: number, yaw: number, playerClass: PlayerClass, now: number): void {
    this.#deathStats.calls += 1;
    if (!this.#ready) return;
    let rig = this.#rigByEntity.get(entityId);
    if (rig === undefined) {
      const dx = x - this.#cameraX;
      const dz = z - this.#cameraZ;
      if (dx * dx + dz * dz > CORPSE_SPAWN_RADIUS_SQ) { this.#deathStats.far += 1; return; }
      if (this.#corpses.length >= this.#corpseCap) { this.#deathStats.capped += 1; return; }
      const model = this.#models.get(characterModelForClass(playerClass));
      if (model === undefined) return;
      rig = this.#acquire(model, { entityId, playerClass, x, y, z, yaw, speed: 0, weaponSlot: DEFAULT_WEAPON_SLOT, near: true, distanceSq: dx * dx + dz * dz, flash: false, mounted: false }, true, now);
      if (rig === undefined) { this.#deathStats.unrigged += 1; return; }
      rig.root.position.set(x, y - FEET_OFFSET_Y, z);
      rig.root.rotation.set(0, yaw, 0);
      rig.root.visible = true;
    } else {
      this.#rigByEntity.delete(entityId);
    }
    const wasMounted = rig.mounted;
    rig.mode = "corpse";
    if (wasMounted) rig.root.position.y -= MOUNTED_RIG_Y_OFFSET;
    rig.mounted = false;
    rig.corpseUntil = now + CORPSE_SECONDS * 1_000;
    rig.corpseStealableAt = now + CORPSE_STEAL_PROTECT_MS;
    rig.entityId = -1;
    rig.seenAt = this.#frameStamp;
    const death = rig.actions.get("death");
    const previous = rig.activeAction;
    if (death !== undefined) {
      configureDeathAction(death, rig.hasRunningAction);
      rig.hasRunningAction = true;
      rig.corpseFrozenAt = now + death.getClip().duration * 1_000 + 100;
      rig.activeAction = death;
    } else {
      rig.corpseFrozenAt = now;
    }
    rig.oneShot = null;
    rig.oneShotWeaponSlot = null;
    if (previous !== null && previous !== death) previous.fadeOut(ONESHOT_FADE_IN);
    if (!this.#corpses.includes(rig)) this.#corpses.push(rig);
    this.#deathStats.spawned += 1;
  }

  /** Entity left the AOI: its rig goes back to the free list immediately. */
  release(entityId: number): void {
    const rig = this.#rigByEntity.get(entityId);
    if (rig === undefined) return;
    this.#rigByEntity.delete(entityId);
    this.#freeRig(rig);
  }

  /** Advance mixers, reclaim stale rigs, expire corpses, flush far batches. */
  endFrame(dtSeconds: number, now: number): void {
    if (!this.#ready) return;
    for (const [entityId, rig] of this.#rigByEntity) {
      if (rig.seenAt !== this.#frameStamp) {
        this.#rigByEntity.delete(entityId);
        this.#freeRig(rig);
        continue;
      }
      rig.mixer.update(dtSeconds);
      this.#applyMountedPose(rig);
      this.#updateLongarm(rig);
    }
    for (let index = this.#corpses.length - 1; index >= 0; index -= 1) {
      const corpse = this.#corpses[index];
      if (corpse === undefined) continue;
      if (now < corpse.corpseFrozenAt) {
        corpse.mixer.update(dtSeconds);
        this.#updateLongarm(corpse);
      }
      if (now >= corpse.corpseUntil) {
        this.#corpses.splice(index, 1);
        this.#freeRig(corpse);
      }
    }
    for (const model of this.#models.values()) {
      model.farBatch.count = model.farCount;
      model.farBatch.instanceMatrix.needsUpdate = true;
      if (model.farBatch.instanceColor !== null) model.farBatch.instanceColor.needsUpdate = true;
      model.farMountedBatch.count = model.farMountedCount;
      model.farMountedBatch.instanceMatrix.needsUpdate = true;
      if (model.farMountedBatch.instanceColor !== null) model.farMountedBatch.instanceColor.needsUpdate = true;
      for (let slot = 0; slot < model.farWeaponBatches.length; slot += 1) {
        const batch = model.farWeaponBatches[slot];
        if (batch === undefined) continue;
        batch.count = model.farWeaponCounts[slot] ?? 0;
        batch.instanceMatrix.needsUpdate = true;
      }
    }
  }

  setLegacyMode(): void {
    // Legacy A/B is gated by the caller (offer() is never invoked); nothing to
    // do here except hide anything currently pooled so the paths never blend.
    for (const rig of this.#rigByEntity.values()) rig.root.visible = false;
    for (const corpse of this.#corpses) corpse.root.visible = false;
    for (const model of this.#models.values()) {
      model.farBatch.count = 0;
      model.farMountedBatch.count = 0;
      for (const batch of model.farWeaponBatches) batch.count = 0;
    }
  }

  /** Dev/probe introspection: live rig, corpse and far-batch counts per model. */
  debugCounts(): { rigs: number; corpses: number; far: number; farMounted: number; farWeapons: readonly [number, number, number]; ready: boolean; deaths: { calls: number; far: number; capped: number; unrigged: number; spawned: number } } {
    let far = 0;
    let farMounted = 0;
    const farWeapons: [number, number, number] = [0, 0, 0];
    for (const model of this.#models.values()) {
      far += model.farCount + model.farMountedCount;
      farMounted += model.farMountedCount;
      farWeapons[0] += model.farWeaponCounts[0];
      farWeapons[1] += model.farWeaponCounts[1];
      farWeapons[2] += model.farWeaponCounts[2];
    }
    return { rigs: this.#rigByEntity.size, corpses: this.#corpses.length, far, farMounted, farWeapons, ready: this.#ready, deaths: { ...this.#deathStats } };
  }

  /** Dev/probe: world transform of the rig currently bound to an entity. */
  debugRigWorld(entityId: number): { x: number; y: number; z: number; yaw: number } | null {
    const rig = this.#rigByEntity.get(entityId);
    if (rig === undefined) return null;
    return {
      x: rig.root.position.x,
      y: rig.root.position.y,
      z: rig.root.position.z,
      yaw: rig.root.rotation.y,
    };
  }

  /** Dev/probe (8e-16): longarm span diagnostics — wrist positions vs the
   * computed weapon world transform for a pinned-clip rig. */
  debugLongarm(entityId: number): {
    clip: string | null; weaponSlot: number; visible: boolean;
    right: [number, number, number]; left: [number, number, number]; weapon: [number, number, number];
  } | null {
    const rig = this.#rigByEntity.get(entityId);
    if (rig === undefined || rig.longarm === null || rig.rightHand === null || rig.leftHand === null) return null;
    rig.rightHand.getWorldPosition(LONGARM_RIGHT);
    rig.leftHand.getWorldPosition(LONGARM_LEFT);
    rig.longarm.getWorldPosition(LONGARM_POS);
    return {
      clip: rig.activeAction?.getClip().name ?? null,
      weaponSlot: rig.weaponSlot,
      visible: rig.longarm.visible,
      right: [LONGARM_RIGHT.x, LONGARM_RIGHT.y, LONGARM_RIGHT.z],
      left: [LONGARM_LEFT.x, LONGARM_LEFT.y, LONGARM_LEFT.z],
      weapon: [LONGARM_POS.x, LONGARM_POS.y, LONGARM_POS.z],
    };
  }

  /** Dev/probe (8e-16 grip screenshots): pin a rig's base clip until released.
   * poseRig keeps positioning the rig but must not switch clips while pinned. */
  debugForceClip(entityId: number, clip: string | null): boolean {
    const rig = this.#rigByEntity.get(entityId);
    if (rig === undefined) return false;
    if (clip === null) {
      rig.forcedClip = null;
      rig.activeAction = null; // let poseRig re-pick the live base clip
      return true;
    }
    const action = rig.actions.get(clip);
    if (action === undefined) return false;
    rig.oneShot = null;
    rig.oneShotWeaponSlot = null;
    const previous = rig.activeAction;
    action.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).play();
    if (previous !== null && previous !== action) previous.stop();
    rig.activeAction = action;
    rig.hasRunningAction = true;
    rig.forcedClip = clip;
    return true;
  }

  /** Dev/probe (8e-18 grip screenshots): pin a rig's weapon slot (null
   * releases). poseRig keeps deriving the base clip but shows the pinned
   * slot's prop; the longarm placement follows rig.weaponSlot as usual. */
  debugForceSlot(entityId: number, slot: number | null): boolean {
    const rig = this.#rigByEntity.get(entityId);
    if (rig === undefined) return false;
    if (slot !== null && (slot < 1 || slot > 3)) return false;
    rig.forcedSlot = slot;
    rig.weaponSlot = 0; // force the visibility refresh on the next poseRig
    return true;
  }

  /** Dev-only saddle-pose calibration. Four XYZ triples: left thigh, right
   * thigh, left shin, right shin. Kept as a probe surface so future model
   * replacements can be fitted without blind source edits. */
  debugTuneMountedPose(values: readonly number[]): boolean {
    if (values.length !== 12 || values.some((value) => !Number.isFinite(value))) return false;
    MOUNTED_LEFT_THIGH.setFromEuler(MOUNTED_TUNE_EULER.set(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0));
    MOUNTED_RIGHT_THIGH.setFromEuler(MOUNTED_TUNE_EULER.set(values[3] ?? 0, values[4] ?? 0, values[5] ?? 0));
    MOUNTED_LEFT_SHIN.setFromEuler(MOUNTED_TUNE_EULER.set(values[6] ?? 0, values[7] ?? 0, values[8] ?? 0));
    MOUNTED_RIGHT_SHIN.setFromEuler(MOUNTED_TUNE_EULER.set(values[9] ?? 0, values[10] ?? 0, values[11] ?? 0));
    return true;
  }

  /**
   * Dev/probe per-rig state dump (8e-16 diagnosis): model, mode, the active
   * action's name/weight/time, and a bone-derived world height so a rig
   * rendering at the wrong scale or stuck in bind pose is identifiable from
   * a headless probe without eyeballing screenshots.
   */
  /** Per-rig debug row returned by debugRigs(). */
  debugRigs(): readonly RigDebugRow[] {
    const out: RigDebugRow[] = [];
    const dump = (rig: Rig): void => {
      let maxY = -Infinity;
      let minY = Infinity;
      rig.root.updateMatrixWorld(true);
      rig.root.traverse((node) => {
        if (!(node instanceof THREE.SkinnedMesh)) return;
        for (const bone of node.skeleton.bones) {
          const y = bone.getWorldPosition(SCRATCH_VEC).y;
          if (y > maxY) maxY = y;
          if (y < minY) minY = y;
        }
      });
      const action = rig.activeAction;
      const leftFootY = rig.mountedBones?.leftFoot.getWorldPosition(SCRATCH_VEC).y ?? null;
      const rightFootY = rig.mountedBones?.rightFoot.getWorldPosition(SCRATCH_VEC).y ?? null;
      const bonePosition = (bone: THREE.Object3D | undefined): readonly [number, number, number] | null => {
        if (bone === undefined) return null;
        bone.getWorldPosition(SCRATCH_VEC);
        return [SCRATCH_VEC.x, SCRATCH_VEC.y, SCRATCH_VEC.z];
      };
      out.push({
        model: rig.model.id, entityId: rig.entityId, mode: rig.mode, visible: rig.root.visible,
        action: action?.getClip().name ?? null,
        weight: action === null ? 0 : action.getEffectiveWeight(),
        actionTime: action?.time ?? 0,
        running: action?.isRunning() ?? false,
        oneShot: rig.oneShot?.getClip().name ?? null,
        locomotion: rig.locomotion,
        height: maxY === -Infinity ? 0 : maxY - minY,
        rootX: rig.root.position.x,
        rootY: rig.root.position.y,
        rootZ: rig.root.position.z,
        mounted: rig.mounted,
        leftFootY,
        rightFootY,
        leftKnee: bonePosition(rig.mountedBones?.leftLeg),
        rightKnee: bonePosition(rig.mountedBones?.rightLeg),
        leftFoot: bonePosition(rig.mountedBones?.leftFoot),
        rightFoot: bonePosition(rig.mountedBones?.rightFoot),
      });
    };
    for (const rig of this.#rigByEntity.values()) dump(rig);
    for (const corpse of this.#corpses) dump(corpse);
    return out;
  }

  dispose(): void {
    for (const rig of this.#rigByEntity.values()) this.#scene.remove(rig.root);
    for (const corpse of this.#corpses) this.#scene.remove(corpse.root);
    for (const rigs of this.#freeByModel.values()) for (const rig of rigs) this.#scene.remove(rig.root);
    this.#rigByEntity.clear();
    this.#corpses.length = 0;
    this.#freeByModel.clear();
    // Far batches own only their instance buffers; geometry/material are
    // shared with the near rigs and stay cached (ADR 0018's disposal trap).
    for (const model of this.#models.values()) {
      this.#scene.remove(model.farBatch);
      model.farBatch.dispose();
      this.#scene.remove(model.farMountedBatch);
      model.farMountedBatch.dispose();
      for (const batch of model.farWeaponBatches) {
        this.#scene.remove(batch);
        batch.dispose();
      }
    }
    this.#models.clear();
    this.#ready = false;
  }

  // --- internals -----------------------------------------------------------

  #acquire(model: LoadedCharacter, pose: CharacterPose, forCorpse = false, now = 0): Rig | undefined {
    const existing = this.#rigByEntity.get(pose.entityId);
    if (existing !== undefined) {
      if (existing.model === model) return existing;
      this.#rigByEntity.delete(pose.entityId);
      this.#freeRig(existing);
    }
    const freeList = this.#freeByModel.get(model.id);
    const free = freeList?.pop();
    if (free !== undefined) return this.#assign(free, pose, forCorpse);
    if (this.#rigCount < this.#rigCap) {
      const built = this.#buildRig(model);
      this.#rigCount += 1;
      return this.#assign(built, pose, forCorpse);
    }
    // Pool exhausted: steal a corpse, else the farthest live rig of this model.
    // 8e-16: corpses inside their protect window are skipped — at a saturated
    // cluster every fresh corpse was recycled within a second and deaths
    // never read on screen.
    const candidates: { distanceSq: number; corpse: boolean }[] = [];
    const rigs: Rig[] = [];
    for (const corpse of this.#corpses) {
      if (corpse.model !== model) continue;
      if (now < corpse.corpseStealableAt) continue;
      rigs.push(corpse);
      candidates.push({ distanceSq: corpse.distanceSq, corpse: true });
    }
    for (const rig of this.#rigByEntity.values()) {
      if (rig.model !== model) continue;
      rigs.push(rig);
      candidates.push({ distanceSq: rig.distanceSq, corpse: false });
    }
    const pick = pickStealRig(candidates, pose.distanceSq);
    if (pick === -1) return undefined;
    const stolen = rigs[pick];
    if (stolen === undefined) return undefined;
    if (stolen.mode === "corpse") {
      const corpseIndex = this.#corpses.indexOf(stolen);
      if (corpseIndex !== -1) this.#corpses.splice(corpseIndex, 1);
    } else {
      this.#rigByEntity.delete(stolen.entityId);
    }
    return this.#assign(stolen, pose, forCorpse);
  }

  #assign(rig: Rig, pose: CharacterPose, forCorpse: boolean): Rig {
    rig.entityId = pose.entityId;
    rig.mode = "live";
    rig.oneShot = null;
    rig.oneShotWeaponSlot = null;
    rig.locomotion = "idle";
    rig.forcedClip = null;
    rig.forcedSlot = null;
    rig.mounted = pose.mounted;
    rig.weaponSlot = 0; // forces the visibility refresh in poseRig
    rig.distanceSq = pose.distanceSq;
    rig.seenAt = this.#frameStamp;
    if (!forCorpse) this.#rigByEntity.set(pose.entityId, rig);
    return rig;
  }

  #freeRig(rig: Rig): void {
    rig.root.visible = false;
    rig.entityId = -1;
    rig.oneShot = null;
    rig.oneShotWeaponSlot = null;
    rig.mounted = false;
    rig.activeAction = null;
    rig.mixer.stopAllAction();
    rig.hasRunningAction = false;
    rig.corpseStealableAt = 0;
    this.#freeByModel.get(rig.model.id)?.push(rig);
  }

  #poseRig(rig: Rig, pose: CharacterPose, now: number): void {
    rig.root.position.set(pose.x, pose.y - FEET_OFFSET_Y, pose.z);
    rig.root.rotation.set(0, pose.yaw, 0);
    rig.root.visible = true;
    rig.distanceSq = pose.distanceSq;
    rig.seenAt = this.#frameStamp;
    rig.mounted = pose.mounted;
    if (rig.forcedClip === null && rig.oneShot !== null && now >= rig.oneShotUntil) {
      rig.oneShot.fadeOut(FADE_SECONDS);
      rig.oneShot = null;
      rig.oneShotWeaponSlot = null;
      rig.activeAction = null; // force the base-clip fade-in below
    }
    const replicatedSlot = pose.weaponSlot >= 0 && pose.weaponSlot <= 3 ? pose.weaponSlot : DEFAULT_WEAPON_SLOT;
    const slot = rig.forcedSlot ?? rig.oneShotWeaponSlot ?? replicatedSlot;
    if (slot !== rig.weaponSlot) {
      for (let index = 0; index < rig.weapons.length; index += 1) {
        const weapon = rig.weapons[index];
        if (weapon !== undefined) weapon.visible = index === slot - 1;
      }
      rig.weaponSlot = slot;
    }
    if (rig.forcedClip !== null) return; // dev-probe pin: keep the forced clip
    if (rig.oneShot !== null) {
      return; // recoil/slash still reading
    }
    const clipName = baseClipFor({
      ranged: slot === 2 && !CLASS_TUNING[pose.playerClass].support,
      speed: pose.speed,
      previousLocomotion: rig.locomotion,
    });
    rig.locomotion = clipName === "run-alt" ? "run-alt" : clipName === "run" ? "run" : clipName === "walk" ? "walk" : "idle";
    const next = rig.actions.get(clipName);
    if (next === undefined || rig.activeAction === next) return;
    const previous = rig.activeAction;
    // Fresh or stopped rig: no running action to blend from — snap to full
    // weight and apply immediately, never render the stale/bind pose (8e-16).
    const snap = !rig.hasRunningAction;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1);
    if (snap) {
      next.play();
      rig.mixer.update(0);
    } else {
      next.fadeIn(FADE_SECONDS).play();
    }
    rig.hasRunningAction = true;
    if (previous !== null) previous.fadeOut(FADE_SECONDS);
    rig.activeAction = next;
  }

  /**
   * 8e-16: place the root-parented slot-2 longarm. Aim/fire clips span it
   * between the two wrists (right at the grip, left on the forestock); every
   * other clip carries it on the right wrist with the tuned grip. Runs after
   * mixer.update so bone transforms are this frame's.
   *
   * The carry path must not use the wrist midpoint: idle/walk clips leave both
   * hands lowered, so that midpoint is inside the torso. Only aim/fire clips
   * have a two-hand shoulder pose. Idle/walk/death use the right-hand carry
   * transform, keeping the prop anchored to a visible hand without inventing
   * a weapon pose the animation does not contain.
   */
  #updateLongarm(rig: Rig): void {
    const weapon = rig.longarm;
    if (weapon === null || rig.rightHand === null || rig.leftHand === null) return;
    if (rig.weaponSlot !== 2 || !rig.root.visible || !weapon.visible) return;
    rig.rightHand.updateWorldMatrix(true, false); // refreshes root→…→wrist only
    rig.rightHand.getWorldPosition(LONGARM_RIGHT);
    const clipName = rig.activeAction?.getClip().name;
    const twoHand = longarmUsesTwoHandPlacement(clipName);
    if (twoHand) {
      // Two-hand hold: centred between the wrists, aimed along the facing
      // axis (level) — see the comment at LONGARM_WEAPONS.
      rig.leftHand.updateWorldMatrix(true, false);
      rig.leftHand.getWorldPosition(LONGARM_LEFT);
      LONGARM_LEFT.add(LONGARM_RIGHT).multiplyScalar(0.5); // wrist midpoint
      const weaponId = weaponForSlot(rig.model.id, 2);
      const yaw = rig.root.rotation.y;
      LONGARM_FACING.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      LONGARM_TMP.copy(LONGARM_FACING).multiplyScalar(longarmAxisSign(weaponId));
      LONGARM_SIDE.crossVectors(LONGARM_TMP, LONGARM_UP).normalize();
      LONGARM_POS.crossVectors(LONGARM_SIDE, LONGARM_TMP); // resolved up
      LONGARM_BASIS.makeBasis(LONGARM_TMP, LONGARM_POS, LONGARM_SIDE);
      LONGARM_QUAT.setFromRotationMatrix(LONGARM_BASIS);
      LONGARM_POS.copy(LONGARM_FACING).multiplyScalar(longarmAimForward(weaponId)).add(LONGARM_LEFT);
    } else {
      // Carry: upright beside the right hand, never horizontal through torso.
      longarmCarryFrame(weaponForSlot(rig.model.id, 2), LONGARM_RIGHT, rig.root.rotation.y);
    }
    LONGARM_WORLD.compose(LONGARM_POS, LONGARM_QUAT, LONGARM_ONE);
    LONGARM_ROOT_INV.copy(rig.root.matrixWorld).invert();
    weapon.matrix.multiplyMatrices(LONGARM_ROOT_INV, LONGARM_WORLD);
    weapon.matrixWorldNeedsUpdate = true;
  }

  /** Preserve authored upper-body clips while folding a mounted rider's
   * thighs and shins around the saddle. AnimationMixer rewrites the source
   * rotations every frame, so these local offsets never accumulate. */
  #applyMountedPose(rig: Rig): void {
    if (!rig.mounted || rig.mountedBones === null) return;
    applyMountedBoneOffsets(rig.mountedBones);
  }

  #playOneShot(rig: Rig, action: THREE.AnimationAction, now: number): void {
    const previous = rig.activeAction;
    action.reset().setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    action.setEffectiveTimeScale(ONESHOT_TIMESCALE).setEffectiveWeight(1);
    if (rig.hasRunningAction) action.fadeIn(ONESHOT_FADE_IN);
    action.play();
    rig.hasRunningAction = true;
    if (previous !== null && previous !== action) previous.fadeOut(ONESHOT_FADE_IN);
    rig.oneShot = action;
    rig.oneShotUntil = now + ONESHOT_HOLD_MS;
    rig.activeAction = action;
  }

  #buildRig(model: LoadedCharacter): Rig {
    const cloned = skeletonClone(model.template) as THREE.Group;
    const root = new THREE.Group();
    root.add(cloned);
    root.visible = false;
    const mixer = new THREE.AnimationMixer(cloned);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const [name, clip] of model.clips) actions.set(name, mixer.clipAction(clip));
    const hand = cloned.getObjectByName("RightHand");
    const leftHand = cloned.getObjectByName("LeftHand");
    const mountedBones = mountedBonesFor(cloned);
    // The Meshy armature carries a ~0.0106 uniform scale (a cm-authored rig);
    // children of a bone inherit it, so a metre-scale weapon would render at
    // 1% size. Counter-scale the weapon MESH only — the group's grip offsets
    // stay in bone-local centimetres, matching the rig's bone translations.
    let meshScale = 1;
    if (hand !== undefined) {
      cloned.updateMatrixWorld(true);
      hand.getWorldScale(SCRATCH_VEC);
      meshScale = 1 / SCRATCH_VEC.x;
    }
    const weapons: THREE.Object3D[] = [];
    let longarm: THREE.Group | null = null;
    for (const slot of [1, 2, 3]) {
      const weaponId = weaponForSlot(model.id, slot);
      const source = this.#weaponGeometries.get(weaponId);
      const grip = WEAPON_GRIPS[weaponId];
      const weapon = new THREE.Group();
      if (slot === 2 && LONGARM_WEAPONS.has(weaponId) && hand !== undefined && leftHand !== undefined) {
        // 8e-16 two-hand longarm: parented to the rig root at metre scale and
        // placed procedurally in endFrame (#updateLongarm) — spanned between
        // the two hand bones during aim/fire, wrist-tracked carry otherwise.
        if (source !== undefined) weapon.add(new THREE.Mesh(source.geometry, source.material));
        weapon.matrixAutoUpdate = false;
        weapon.visible = false;
        root.add(weapon);
        longarm = weapon;
      } else {
        if (source !== undefined && hand !== undefined) {
          const mesh = new THREE.Mesh(source.geometry, source.material);
          mesh.scale.setScalar(meshScale);
          weapon.add(mesh);
        }
        weapon.position.set(grip.position[0], grip.position[1], grip.position[2]);
        weapon.rotation.set(grip.rotation[0], grip.rotation[1], grip.rotation[2]);
        weapon.visible = false;
        if (hand !== undefined) hand.add(weapon);
      }
      weapons.push(weapon);
    }
    this.#scene.add(root);
    return {
      root, mixer, actions, weapons, model,
      entityId: -1, mode: "live", activeAction: null, oneShot: null, oneShotUntil: 0,
      oneShotWeaponSlot: null,
      locomotion: "idle", corpseUntil: 0, corpseFrozenAt: 0, corpseStealableAt: 0,
      weaponSlot: 0, distanceSq: Infinity, seenAt: -1, hasRunningAction: false,
      longarm, rightHand: hand ?? null, leftHand: leftHand ?? null, mountedBones, mounted: false,
      forcedClip: null, forcedSlot: null,
    };
  }
}
