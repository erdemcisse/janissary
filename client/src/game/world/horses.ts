import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ANIMATED_HORSE_MODEL } from "../models/manifest";

/**
 * Near-only animated horse pool. The existing InstancedMesh remains the far,
 * Low-tier, saturation, and load-failure path, so one downloaded rig cannot
 * turn cavalry into an unbounded mixer/draw-call cost.
 */
export const HORSE_RIG_CAPS: Readonly<Record<"low" | "medium" | "high", number>> = {
  low: 0,
  medium: 4,
  high: 8,
};
export const HORSE_RIG_RADIUS_METERS = 46;

const MODEL_YAW_OFFSET = Math.PI; // Meshy horse faces +Z; gameplay forward is -Z.
const WALK_ENTER_SPEED = 0.35;
const WALK_EXIT_SPEED = 0.18;
const AUTHORED_WALK_SPEED = 2.4;
const CLIP_FADE_SECONDS = 0.12;

export type HorseClip = "idle" | "walk";

export function horseClipFor(previous: HorseClip, speed: number): HorseClip {
  const moving = previous === "walk" ? speed >= WALK_EXIT_SPEED : speed >= WALK_ENTER_SPEED;
  return moving ? "walk" : "idle";
}

/** Prevents a high-tier free pool from exceeding a later lower-tier cap. */
export function canAcquireHorseRig(activeCount: number, cap: number): boolean {
  return activeCount < cap;
}

export interface HorsePose {
  readonly entityId: number;
  /** Hoof/ground Y, not the player's body-centre Y. */
  readonly y: number;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly speed: number;
  readonly distanceSq: number;
}

export interface HorseRigDebugRow {
  readonly entityId: number;
  readonly action: "idle" | "walk";
  readonly speed: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly visible: boolean;
}

interface HorseRig {
  readonly root: THREE.Group;
  readonly mixer: THREE.AnimationMixer;
  readonly idle: THREE.AnimationAction;
  readonly walk: THREE.AnimationAction;
  entityId: number;
  action: "idle" | "walk";
  speed: number;
  seenAt: number;
  forcedAction: "idle" | "walk" | null;
}

const loader = new GLTFLoader();

export class HorseRenderer {
  readonly #scene: THREE.Scene;
  #template: THREE.Group | null = null;
  #idleClip: THREE.AnimationClip | null = null;
  #walkClip: THREE.AnimationClip | null = null;
  readonly #byEntity = new Map<number, HorseRig>();
  readonly #free: HorseRig[] = [];
  #rigCount = 0;
  #cap = HORSE_RIG_CAPS.high;
  #frameStamp = 0;
  #ready = false;

  constructor(scene: THREE.Scene) {
    this.#scene = scene;
  }

  get ready(): boolean {
    return this.#ready;
  }

  load(): void {
    const timeout = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error("animated horse: load timed out after 20 s")), 20_000);
    });
    void Promise.race([this.#loadModel(), timeout]).catch((error: unknown) => {
      console.error("animated horse: load failed, retaining static instanced horses", error);
    });
  }

  async #loadModel(): Promise<void> {
    const gltf = await loader.loadAsync(`/${ANIMATED_HORSE_MODEL}`);
    const idle = gltf.animations.find((clip) => clip.name === "idle");
    const walk = gltf.animations.find((clip) => clip.name === "walk");
    if (idle === undefined || walk === undefined) throw new Error("animated horse is missing idle/walk clips");
    gltf.scene.rotation.y = MODEL_YAW_OFFSET;
    gltf.scene.traverse((node) => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
      const material = node.material as THREE.MeshStandardMaterial;
      material.metalness = 0.04;
      material.roughness = 0.82;
    });
    gltf.scene.updateMatrixWorld(true);
    this.#template = gltf.scene;
    this.#idleClip = idle;
    this.#walkClip = walk;
    this.#ready = true;
  }

  setQuality(quality: "low" | "medium" | "high"): void {
    this.#cap = HORSE_RIG_CAPS[quality];
    while (this.#byEntity.size > this.#cap) {
      const first = this.#byEntity.entries().next().value as [number, HorseRig] | undefined;
      if (first === undefined) break;
      this.#byEntity.delete(first[0]);
      this.#freeRig(first[1]);
    }
  }

  beginFrame(): void {
    this.#frameStamp += 1;
  }

  /** Returns true when an animated near rig drew the horse; false means the caller must use its static instance. */
  offer(pose: HorsePose): boolean {
    if (!this.#ready || this.#cap === 0 || pose.distanceSq > HORSE_RIG_RADIUS_METERS * HORSE_RIG_RADIUS_METERS) return false;
    let rig = this.#byEntity.get(pose.entityId);
    if (rig === undefined) {
      if (!canAcquireHorseRig(this.#byEntity.size, this.#cap)) return false;
      rig = this.#free.pop();
      if (rig === undefined) {
        if (this.#rigCount >= this.#cap) return false;
        rig = this.#buildRig();
        this.#rigCount += 1;
      }
      rig.entityId = pose.entityId;
      rig.seenAt = this.#frameStamp;
      rig.root.visible = true;
      this.#byEntity.set(pose.entityId, rig);
    }
    rig.root.position.set(pose.x, pose.y, pose.z);
    rig.root.rotation.set(0, pose.yaw, 0);
    rig.root.visible = true;
    rig.speed = pose.speed;
    rig.seenAt = this.#frameStamp;
    const action = rig.forcedAction ?? horseClipFor(rig.action, pose.speed);
    this.#setAction(rig, action);
    if (action === "walk") rig.walk.setEffectiveTimeScale(Math.max(0.65, Math.min(2.35, pose.speed / AUTHORED_WALK_SPEED)));
    return true;
  }

  endFrame(dtSeconds: number): void {
    if (!this.#ready) return;
    for (const [entityId, rig] of this.#byEntity) {
      if (rig.seenAt !== this.#frameStamp) {
        this.#byEntity.delete(entityId);
        this.#freeRig(rig);
        continue;
      }
      rig.mixer.update(dtSeconds);
    }
  }

  release(entityId: number): void {
    const rig = this.#byEntity.get(entityId);
    if (rig === undefined) return;
    this.#byEntity.delete(entityId);
    this.#freeRig(rig);
  }

  debugRigs(): readonly HorseRigDebugRow[] {
    return [...this.#byEntity.values()].map((rig) => ({
      entityId: rig.entityId,
      action: rig.action,
      speed: rig.speed,
      x: rig.root.position.x,
      y: rig.root.position.y,
      z: rig.root.position.z,
      visible: rig.root.visible,
    }));
  }

  debugCounts(): { ready: boolean; rigs: number; cap: number } {
    return { ready: this.#ready, rigs: this.#byEntity.size, cap: this.#cap };
  }

  /** Dev-only clip pin for calm F8 visual verification. */
  debugForceAction(entityId: number, action: "idle" | "walk" | null): boolean {
    const rig = this.#byEntity.get(entityId);
    if (rig === undefined) return false;
    rig.forcedAction = action;
    if (action !== null) this.#setAction(rig, action);
    return true;
  }

  dispose(): void {
    for (const rig of this.#byEntity.values()) this.#scene.remove(rig.root);
    for (const rig of this.#free) this.#scene.remove(rig.root);
    this.#byEntity.clear();
    this.#free.length = 0;
    this.#template = null;
    this.#idleClip = null;
    this.#walkClip = null;
    this.#ready = false;
  }

  #buildRig(): HorseRig {
    if (this.#template === null || this.#idleClip === null || this.#walkClip === null) throw new Error("animated horse built before load");
    const clone = skeletonClone(this.#template) as THREE.Group;
    const root = new THREE.Group();
    root.add(clone);
    root.visible = false;
    const mixer = new THREE.AnimationMixer(clone);
    const idle = mixer.clipAction(this.#idleClip);
    const walk = mixer.clipAction(this.#walkClip);
    idle.setLoop(THREE.LoopRepeat, Infinity).play();
    mixer.update(0);
    this.#scene.add(root);
    return { root, mixer, idle, walk, entityId: -1, action: "idle", speed: 0, seenAt: -1, forcedAction: null };
  }

  #setAction(rig: HorseRig, action: "idle" | "walk"): void {
    if (rig.action === action) return;
    const previous = rig.action === "walk" ? rig.walk : rig.idle;
    const next = action === "walk" ? rig.walk : rig.idle;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(CLIP_FADE_SECONDS).play();
    previous.fadeOut(CLIP_FADE_SECONDS);
    rig.action = action;
  }

  #freeRig(rig: HorseRig): void {
    rig.root.visible = false;
    rig.entityId = -1;
    rig.speed = 0;
    rig.forcedAction = null;
    rig.mixer.stopAllAction();
    rig.idle.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).play();
    rig.action = "idle";
    this.#free.push(rig);
  }
}
