import {
  CANNON_ENTITY_BASE,
  CANNON_STAGING,
  FIXED_SIEGE_CANNON_COUNT,
  MAX_SIEGE_CANNONS,
  PERSONAL_CANNON_HP,
  PERSONAL_CANNON_RADIUS,
  SIEGE_BLOCKOUT,
  SIEGE_CANNON_HP,
  SIEGE_CANNON_MAX_PUSHERS,
  SIEGE_CANNON_RADIUS,
  Team,
  WORLD_HALF_EXTENT,
  inDeepWater,
  isWallBoxSolid,
  terrainGradientAt,
} from "@janissary/shared";

/**
 * Mobile siege cannons (siege-loop phase, design doc docs/design/siege-loop.md).
 * A cannon is a second vehicle type built on the galley replication template:
 * replicated entity in its own id band (30 000+), one gunner station plus two
 * pusher stations, push kinematics with circle-vs-static-box collision, deploy
 * timers, HP with destroy/respawn. The four fixed Ottoman bombard emplacements
 * are replaced by these; only the three Byzantine wall-guns remain fixed.
 */

export const CANNON_COUNT = MAX_SIEGE_CANNONS;
/**
 * Virtual gun ids for cannon-fired projectiles. Emplacements own 0-2, galley
 * guns own 7-14; 16+ is free and fits the Int8 projectileGun array.
 */
export const CANNON_PROJECTILE_GUN_BASE = 16;
/** Recent-damager ring per cannon, for destroy assists. */
export const CANNON_DAMAGER_RING = 4;

export function cannonEntityId(cannonIndex: number): number {
  return CANNON_ENTITY_BASE + cannonIndex;
}

export function isCannonEntityId(entityId: number): boolean {
  return entityId >= CANNON_ENTITY_BASE && entityId < CANNON_ENTITY_BASE + MAX_SIEGE_CANNONS;
}

export function cannonIndexForEntityId(entityId: number): number {
  return entityId - CANNON_ENTITY_BASE;
}

export function cannonProjectileGunId(cannonIndex: number): number {
  return CANNON_PROJECTILE_GUN_BASE + cannonIndex;
}

export function isCannonProjectileGun(gunId: number): boolean {
  return gunId >= CANNON_PROJECTILE_GUN_BASE && gunId < CANNON_PROJECTILE_GUN_BASE + MAX_SIEGE_CANNONS;
}

export function cannonIndexForProjectileGun(gunId: number): number {
  return gunId - CANNON_PROJECTILE_GUN_BASE;
}

export interface CannonState {
  readonly active: Uint8Array;
  /** Mutable: an uncrewed cannon transfers to the boarder's team (capture). */
  readonly team: Uint8Array;
  /** Personal field gun marker; fixed bombards remain zero. */
  readonly personal: Uint8Array;
  /** Owning player slot for personal guns, or -1 for fixed bombards. */
  readonly ownerSlot: Int16Array;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly yaw: Float32Array;
  readonly hp: Uint16Array;
  /** Gunner station: player slot or -1. */
  readonly gunner: Int16Array;
  /** Pusher stations: MAX_SIEGE_CANNONS * SIEGE_CANNON_MAX_PUSHERS slots or -1. */
  readonly pushers: Int16Array;
  readonly deployed: Uint8Array;
  /** Deploy completes at this tick (0 = idle). */
  readonly deployUntilTick: Uint32Array;
  /** Undeploy completes at this tick (0 = idle). */
  readonly undeployUntilTick: Uint32Array;
  readonly reloadUntilTick: Uint32Array;
  readonly gunYaw: Float32Array;
  readonly gunPitch: Float32Array;
  /** Destroyed wreck respawns at staging at this tick. */
  readonly respawnAtTick: Uint32Array;
  /** Last tick the cannon actually changed position (drives push XP). */
  readonly lastMovedTick: Uint32Array;
  readonly stagingX: Float32Array;
  readonly stagingZ: Float32Array;
  readonly stagingYaw: Float32Array;
  /** Recent damagers: CANNON_DAMAGER_RING entries per cannon (slot/tick/damage). */
  readonly damagerSlot: Int16Array;
  readonly damagerTick: Uint32Array;
  readonly damagerDamage: Float32Array;
}

export function createCannonState(): CannonState {
  const stagingX = new Float32Array(MAX_SIEGE_CANNONS);
  const stagingZ = new Float32Array(MAX_SIEGE_CANNONS);
  const stagingYaw = new Float32Array(MAX_SIEGE_CANNONS);
  for (let index = 0; index < MAX_SIEGE_CANNONS; index += 1) {
    const staging = CANNON_STAGING[index];
    stagingX[index] = staging?.x ?? 0;
    stagingZ[index] = staging?.z ?? 0;
    stagingYaw[index] = staging?.yaw ?? 0;
  }
  return {
    active: new Uint8Array(MAX_SIEGE_CANNONS),
    team: new Uint8Array(MAX_SIEGE_CANNONS),
    personal: new Uint8Array(MAX_SIEGE_CANNONS),
    ownerSlot: new Int16Array(MAX_SIEGE_CANNONS).fill(-1),
    x: new Float32Array(MAX_SIEGE_CANNONS),
    z: new Float32Array(MAX_SIEGE_CANNONS),
    yaw: new Float32Array(MAX_SIEGE_CANNONS),
    hp: new Uint16Array(MAX_SIEGE_CANNONS),
    gunner: new Int16Array(MAX_SIEGE_CANNONS).fill(-1),
    pushers: new Int16Array(MAX_SIEGE_CANNONS * SIEGE_CANNON_MAX_PUSHERS).fill(-1),
    deployed: new Uint8Array(MAX_SIEGE_CANNONS),
    deployUntilTick: new Uint32Array(MAX_SIEGE_CANNONS),
    undeployUntilTick: new Uint32Array(MAX_SIEGE_CANNONS),
    reloadUntilTick: new Uint32Array(MAX_SIEGE_CANNONS),
    gunYaw: new Float32Array(MAX_SIEGE_CANNONS),
    gunPitch: new Float32Array(MAX_SIEGE_CANNONS),
    respawnAtTick: new Uint32Array(MAX_SIEGE_CANNONS),
    lastMovedTick: new Uint32Array(MAX_SIEGE_CANNONS),
    stagingX,
    stagingZ,
    stagingYaw,
    damagerSlot: new Int16Array(MAX_SIEGE_CANNONS * CANNON_DAMAGER_RING).fill(-1),
    damagerTick: new Uint32Array(MAX_SIEGE_CANNONS * CANNON_DAMAGER_RING),
    damagerDamage: new Float32Array(MAX_SIEGE_CANNONS * CANNON_DAMAGER_RING),
  };
}

export function spawnCannonAtStaging(state: CannonState, cannonIndex: number): void {
  state.active[cannonIndex] = 1;
  state.team[cannonIndex] = Team.Ottoman;
  state.personal[cannonIndex] = 0;
  state.ownerSlot[cannonIndex] = -1;
  state.x[cannonIndex] = state.stagingX[cannonIndex] ?? 0;
  state.z[cannonIndex] = state.stagingZ[cannonIndex] ?? 0;
  state.yaw[cannonIndex] = state.stagingYaw[cannonIndex] ?? 0;
  state.hp[cannonIndex] = SIEGE_CANNON_HP;
  state.gunner[cannonIndex] = -1;
  for (let index = 0; index < SIEGE_CANNON_MAX_PUSHERS; index += 1) {
    state.pushers[cannonIndex * SIEGE_CANNON_MAX_PUSHERS + index] = -1;
  }
  state.deployed[cannonIndex] = 0;
  state.deployUntilTick[cannonIndex] = 0;
  state.undeployUntilTick[cannonIndex] = 0;
  state.reloadUntilTick[cannonIndex] = 0;
  state.gunYaw[cannonIndex] = state.stagingYaw[cannonIndex] ?? 0;
  state.gunPitch[cannonIndex] = 0.3;
  state.respawnAtTick[cannonIndex] = 0;
  state.lastMovedTick[cannonIndex] = 0;
  for (let index = 0; index < CANNON_DAMAGER_RING; index += 1) {
    const entry = cannonIndex * CANNON_DAMAGER_RING + index;
    state.damagerSlot[entry] = -1;
    state.damagerTick[entry] = 0;
    state.damagerDamage[entry] = 0;
  }
}

export function spawnCannonsAtStaging(state: CannonState): void {
  for (let index = 0; index < FIXED_SIEGE_CANNON_COUNT; index += 1) spawnCannonAtStaging(state, index);
}

/** Spawn a Topçu's light field gun into one of the reserved replicated slots. */
export function spawnPersonalCannon(state: CannonState, cannonIndex: number, ownerSlot: number, x: number, z: number, yaw: number, team: Team, tick: number): void {
  state.active[cannonIndex] = 1;
  state.team[cannonIndex] = team;
  state.personal[cannonIndex] = 1;
  state.ownerSlot[cannonIndex] = ownerSlot;
  state.x[cannonIndex] = x;
  state.z[cannonIndex] = z;
  state.yaw[cannonIndex] = yaw;
  state.hp[cannonIndex] = PERSONAL_CANNON_HP;
  state.gunner[cannonIndex] = -1;
  for (let index = 0; index < SIEGE_CANNON_MAX_PUSHERS; index += 1) state.pushers[cannonIndex * SIEGE_CANNON_MAX_PUSHERS + index] = -1;
  state.deployed[cannonIndex] = 0;
  state.deployUntilTick[cannonIndex] = 0;
  state.undeployUntilTick[cannonIndex] = 0;
  state.reloadUntilTick[cannonIndex] = 0;
  state.gunYaw[cannonIndex] = yaw;
  state.gunPitch[cannonIndex] = 0.3;
  state.respawnAtTick[cannonIndex] = 0;
  state.lastMovedTick[cannonIndex] = tick;
  for (let index = 0; index < CANNON_DAMAGER_RING; index += 1) {
    const entry = cannonIndex * CANNON_DAMAGER_RING + index;
    state.damagerSlot[entry] = -1;
    state.damagerTick[entry] = 0;
    state.damagerDamage[entry] = 0;
  }
}

export function despawnCannon(state: CannonState, cannonIndex: number): void {
  state.active[cannonIndex] = 0;
  state.personal[cannonIndex] = 0;
  state.ownerSlot[cannonIndex] = -1;
  state.gunner[cannonIndex] = -1;
  for (let index = 0; index < SIEGE_CANNON_MAX_PUSHERS; index += 1) state.pushers[cannonIndex * SIEGE_CANNON_MAX_PUSHERS + index] = -1;
  state.hp[cannonIndex] = 0;
}

export function isPersonalCannon(state: CannonState, cannonIndex: number): boolean { return state.personal[cannonIndex] === 1; }
export function cannonRadius(state: CannonState, cannonIndex: number): number { return isPersonalCannon(state, cannonIndex) ? PERSONAL_CANNON_RADIUS : SIEGE_CANNON_RADIUS; }

export function cannonPusherCount(state: CannonState, cannonIndex: number): number {
  let count = 0;
  for (let index = 0; index < SIEGE_CANNON_MAX_PUSHERS; index += 1) {
    if ((state.pushers[cannonIndex * SIEGE_CANNON_MAX_PUSHERS + index] ?? -1) >= 0) count += 1;
  }
  return count;
}

/** State-level destruction: clears stations and arms the staging respawn. */
export function destroyCannon(state: CannonState, cannonIndex: number, respawnAtTick: number): void {
  state.hp[cannonIndex] = 0;
  state.gunner[cannonIndex] = -1;
  for (let index = 0; index < SIEGE_CANNON_MAX_PUSHERS; index += 1) {
    state.pushers[cannonIndex * SIEGE_CANNON_MAX_PUSHERS + index] = -1;
  }
  state.deployed[cannonIndex] = 0;
  state.deployUntilTick[cannonIndex] = 0;
  state.undeployUntilTick[cannonIndex] = 0;
  state.reloadUntilTick[cannonIndex] = 0;
  state.respawnAtTick[cannonIndex] = respawnAtTick;
}

export function respawnCannon(state: CannonState, cannonIndex: number): void {
  spawnCannonAtStaging(state, cannonIndex);
}

/**
 * Snapshot occupancy/state byte, mirroring vehicleOccupancyState:
 * bit0 destroyed, bit1 deployed, bit2 deploying-or-undeploying,
 * bit3 gunner present, bits 4-5 pusher count.
 */
export function cannonOccupancyState(state: CannonState, cannonIndex: number, tick: number): number {
  let shipState = 0;
  if ((state.hp[cannonIndex] ?? 0) === 0) shipState |= 1;
  if ((state.deployed[cannonIndex] ?? 0) === 1) shipState |= 2;
  if ((state.deployUntilTick[cannonIndex] ?? 0) > tick || (state.undeployUntilTick[cannonIndex] ?? 0) > tick) shipState |= 4;
  if ((state.gunner[cannonIndex] ?? -1) >= 0) shipState |= 8;
  shipState |= cannonPusherCount(state, cannonIndex) << 4;
  if (isPersonalCannon(state, cannonIndex)) shipState |= 1 << 6;
  return shipState;
}

/**
 * True when a cannon carriage (a circle of SIEGE_CANNON_RADIUS) cannot occupy
 * (x, z): deep water, overlap with any solid blockout box honoring current
 * wall states (an intact wall blocks, a breach's rubble also blocks — cannons
 * get no step-up), or overly steep terrain (8e-11: the carriage has no tilt
 * rendering, so slopes beyond CANNON_MAX_TERRAIN_TAN would bury the wheels).
 * Boxes low enough to roll over (none today) are ignored.
 */
export function cannonPositionBlocked(x: number, z: number, wallStates: Uint8Array | undefined, radius = SIEGE_CANNON_RADIUS): boolean {
  if (inDeepWater(x, z)) return true;
  terrainGradientAt(x, z, CANNON_TERRAIN_GRADIENT);
  if (Math.hypot(CANNON_TERRAIN_GRADIENT.x, CANNON_TERRAIN_GRADIENT.z) > CANNON_MAX_TERRAIN_TAN) return true;
  for (const box of SIEGE_BLOCKOUT) {
    if (!isWallBoxSolid(box, wallStates)) continue;
    const top = box.y + box.height / 2;
    if (top <= 0.3) continue;
    const halfWidth = box.width / 2 + radius;
    const halfDepth = box.depth / 2 + radius;
    if (Math.abs(x - box.x) <= halfWidth && Math.abs(z - box.z) <= halfDepth) return true;
  }
  return false;
}

/** 8e-11: max |∇height| a cannon carriage accepts (about a 24° slope). */
export const CANNON_MAX_TERRAIN_TAN = 0.45;
const CANNON_TERRAIN_GRADIENT = { x: 0, z: 0 };

/** World-bounds clamp for the carriage centre. */
export function clampCannonPosition(x: number, z: number): { x: number; z: number } {
  const limit = WORLD_HALF_EXTENT - SIEGE_CANNON_RADIUS;
  return {
    x: Math.max(-limit, Math.min(limit, x)),
    z: Math.max(-limit, Math.min(limit, z)),
  };
}
