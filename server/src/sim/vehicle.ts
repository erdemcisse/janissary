import {
  GALLEY_ACCELERATION,
  GALLEY_BRAKE_ACCELERATION,
  GALLEY_HULL_HALF_DEPTH,
  GALLEY_HULL_HALF_WIDTH,
  GALLEY_LANE_MAX_X,
  GALLEY_LANE_MAX_Z,
  GALLEY_LANE_MIN_X,
  GALLEY_LANE_MIN_Z,
  GALLEY_MAX_SPEED,
  GALLEY_PASSENGER_SLOTS,
  GALLEY_TURN_RATE_RADIANS,
  MAX_VEHICLES,
  Team,
  VEHICLE_ENTITY_BASE,
  WATER_SHORE_Z,
} from "@janissary/shared";
import { clamp, moveToward } from "@janissary/shared";
import { RIVER_HALF_WIDTH, RIVER_HEADWATER, RIVER_SEGMENTS } from "@janissary/shared";

export const GALLEY_COUNT = 4;
export const GALLEY_GUN_PROJECTILE_BASE = 7;
export const GALLEY_PASSENGER_CAPACITY = GALLEY_PASSENGER_SLOTS;

/**
 * Keeps a galley inside actual water (the sea band or the river channel,
 * Phase 8c-4b). The GALLEY_LANE box was extended to cover the river, so a
 * plain box clamp would let galleys sail over dry land; this snaps any
 * position outside the water geometry to the nearest channel boundary
 * (a "bank"), so the river is navigable but the map stays land.
 */
export function clampToWaterGeometry(x: number, z: number): { x: number; z: number } {
  if (z >= WATER_SHORE_Z) return { x, z };
  if (Math.hypot(x - RIVER_HEADWATER.x, z - RIVER_HEADWATER.z) <= RIVER_HEADWATER.radius) return { x, z };
  let nearest = Infinity;
  let nearestX = x;
  let nearestZ = z;
  for (const segment of RIVER_SEGMENTS) {
    const dx = segment.x2 - segment.x1;
    const dz = segment.z2 - segment.z1;
    const lengthSquared = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - segment.x1) * dx + (z - segment.z1) * dz) / (lengthSquared || 1)));
    const cx = segment.x1 + dx * t;
    const cz = segment.z1 + dz * t;
    const distance = Math.hypot(x - cx, z - cz);
    if (distance < nearest) {
      nearest = distance;
      nearestX = cx;
      nearestZ = cz;
    }
  }
  if (nearest <= RIVER_HALF_WIDTH) return { x, z };
  const length = Math.max(0.001, nearest);
  return {
    x: nearestX + ((x - nearestX) / length) * RIVER_HALF_WIDTH,
    z: nearestZ + ((z - nearestZ) / length) * RIVER_HALF_WIDTH,
  };
}

export interface VehicleState {
  readonly active: Uint8Array;
  readonly team: Uint8Array;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly yaw: Float32Array;
  readonly speed: Float32Array;
  readonly hullHp: Uint16Array;
  readonly listingUntilTick: Uint32Array;
  readonly respawnAtTick: Uint32Array;
  readonly recallAtTick: Uint32Array;
  readonly helm: Int32Array;
  readonly gun1: Int32Array;
  readonly gun2: Int32Array;
  readonly gun1ReloadUntilTick: Uint32Array;
  readonly gun2ReloadUntilTick: Uint32Array;
  /** Last authoritative bearing for each galley gun, used by the client barrel read. */
  readonly gun1Yaw: Float32Array;
  readonly gun2Yaw: Float32Array;
  readonly passengers: Int32Array;
  readonly passengerCount: Uint8Array;
  readonly dockX: Float32Array;
  readonly dockZ: Float32Array;
  readonly dockYaw: Float32Array;
}

export interface VehicleKinematics {
  x: number;
  z: number;
  yaw: number;
  speed: number;
}

export interface HelmInput {
  forward: number;
  turn: number;
}

export function vehicleEntityId(vehicleIndex: number): number {
  return VEHICLE_ENTITY_BASE + vehicleIndex;
}

export function vehicleIndexForEntityId(entityId: number): number {
  return entityId - VEHICLE_ENTITY_BASE;
}

export function isVehicleEntityId(entityId: number): boolean {
  return entityId >= VEHICLE_ENTITY_BASE && entityId < VEHICLE_ENTITY_BASE + MAX_VEHICLES;
}

export function galleyProjectileGunId(vehicleIndex: number, station: number): number {
  return GALLEY_GUN_PROJECTILE_BASE + vehicleIndex * 2 + station;
}

export function isGalleyProjectileGun(gunId: number): boolean {
  // Bounded: cannon projectiles (CANNON_PROJECTILE_GUN_BASE = 16+) must not
  // resolve as galley guns.
  return gunId >= GALLEY_GUN_PROJECTILE_BASE && gunId < GALLEY_GUN_PROJECTILE_BASE + MAX_VEHICLES * 2;
}

export function vehicleIndexForGunId(gunId: number): number {
  return (gunId - GALLEY_GUN_PROJECTILE_BASE) >> 1;
}

export function galleyGunStation(gunId: number): number {
  return (gunId - GALLEY_GUN_PROJECTILE_BASE) & 1;
}

export function createVehicleState(
  docks: readonly { team: Team; x: number; z: number; yaw: number }[],
): VehicleState {
  const dockX = new Float32Array(MAX_VEHICLES);
  const dockZ = new Float32Array(MAX_VEHICLES);
  const dockYaw = new Float32Array(MAX_VEHICLES);
  for (let index = 0; index < MAX_VEHICLES; index += 1) {
    const dock = docks[index];
    dockX[index] = dock?.x ?? 0;
    dockZ[index] = dock?.z ?? 0;
    dockYaw[index] = dock?.yaw ?? 0;
  }
  return {
    active: new Uint8Array(MAX_VEHICLES),
    team: new Uint8Array(MAX_VEHICLES),
    x: new Float32Array(MAX_VEHICLES),
    z: new Float32Array(MAX_VEHICLES),
    yaw: new Float32Array(MAX_VEHICLES),
    speed: new Float32Array(MAX_VEHICLES),
    hullHp: new Uint16Array(MAX_VEHICLES),
    listingUntilTick: new Uint32Array(MAX_VEHICLES),
    respawnAtTick: new Uint32Array(MAX_VEHICLES),
    recallAtTick: new Uint32Array(MAX_VEHICLES),
    helm: new Int32Array(MAX_VEHICLES).fill(-1),
    gun1: new Int32Array(MAX_VEHICLES).fill(-1),
    gun2: new Int32Array(MAX_VEHICLES).fill(-1),
    gun1ReloadUntilTick: new Uint32Array(MAX_VEHICLES),
    gun2ReloadUntilTick: new Uint32Array(MAX_VEHICLES),
    gun1Yaw: new Float32Array(MAX_VEHICLES),
    gun2Yaw: new Float32Array(MAX_VEHICLES),
    passengers: new Int32Array(MAX_VEHICLES * GALLEY_PASSENGER_CAPACITY).fill(-1),
    passengerCount: new Uint8Array(MAX_VEHICLES),
    dockX,
    dockZ,
    dockYaw,
  };
}

export function spawnVehicleAtDock(state: VehicleState, vehicleIndex: number, team: Team, dock: { x: number; z: number; yaw: number }, hullHp: number): void {
  state.active[vehicleIndex] = 1;
  state.team[vehicleIndex] = team;
  state.x[vehicleIndex] = dock.x;
  state.z[vehicleIndex] = dock.z;
  state.yaw[vehicleIndex] = dock.yaw;
  state.speed[vehicleIndex] = 0;
  state.hullHp[vehicleIndex] = hullHp;
  state.listingUntilTick[vehicleIndex] = 0;
  state.respawnAtTick[vehicleIndex] = 0;
  state.recallAtTick[vehicleIndex] = 0;
  state.helm[vehicleIndex] = -1;
  state.gun1[vehicleIndex] = -1;
  state.gun2[vehicleIndex] = -1;
  state.gun1ReloadUntilTick[vehicleIndex] = 0;
  state.gun2ReloadUntilTick[vehicleIndex] = 0;
  const sideBearing = dock.yaw;
  state.gun1Yaw[vehicleIndex] = sideBearing + Math.PI / 2;
  state.gun2Yaw[vehicleIndex] = sideBearing - Math.PI / 2;
  state.passengerCount[vehicleIndex] = 0;
  for (let index = 0; index < GALLEY_PASSENGER_CAPACITY; index += 1) {
    state.passengers[vehicleIndex * GALLEY_PASSENGER_CAPACITY + index] = -1;
  }
}

export function stepGalleyKinematics(
  previous: VehicleKinematics,
  input: HelmInput,
  dtSeconds: number,
): VehicleKinematics {
  const dt = clamp(dtSeconds, 0, 0.1);
  const targetSpeed = Math.max(0, input.forward * GALLEY_MAX_SPEED);
  const acceleration = input.forward === 0 ? GALLEY_BRAKE_ACCELERATION : GALLEY_ACCELERATION;
  const speed = moveToward(previous.speed, targetSpeed, acceleration * dt);
  const turnRate = GALLEY_TURN_RATE_RADIANS * Math.min(1, speed / (GALLEY_MAX_SPEED * 0.5));
  const yaw = previous.yaw + input.turn * turnRate * dt;
  return {
    x: clamp(previous.x + Math.cos(yaw) * speed * dt, GALLEY_LANE_MIN_X, GALLEY_LANE_MAX_X),
    z: clamp(previous.z + Math.sin(yaw) * speed * dt, GALLEY_LANE_MIN_Z, GALLEY_LANE_MAX_Z),
    yaw,
    speed,
  };
}

export function vehicleWorldHalfExtents(yaw: number): { halfWidth: number; halfDepth: number } {
  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  return {
    halfWidth: GALLEY_HULL_HALF_WIDTH * cos + GALLEY_HULL_HALF_DEPTH * sin,
    halfDepth: GALLEY_HULL_HALF_WIDTH * sin + GALLEY_HULL_HALF_DEPTH * cos,
  };
}

export function vehicleAabbOverlap(
  left: { x: number; z: number; yaw: number },
  right: { x: number; z: number; yaw: number },
): boolean {
  const leftExtents = vehicleWorldHalfExtents(left.yaw);
  const rightExtents = vehicleWorldHalfExtents(right.yaw);
  return Math.abs(left.x - right.x) <= leftExtents.halfWidth + rightExtents.halfWidth
    && Math.abs(left.z - right.z) <= leftExtents.halfDepth + rightExtents.halfDepth;
}

export function vehicleLocalToWorld(x: number, z: number, yaw: number, localX: number, localZ: number): { x: number; z: number } {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    x: x + cos * localX - sin * localZ,
    z: z + sin * localX + cos * localZ,
  };
}

export function vehicleWorldToLocal(x: number, z: number, yaw: number, worldX: number, worldZ: number): { x: number; z: number } {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const dx = worldX - x;
  const dz = worldZ - z;
  return {
    x: cos * dx + sin * dz,
    z: -sin * dx + cos * dz,
  };
}

export function vehicleOccupancyState(state: VehicleState, vehicleIndex: number, sunk: boolean): number {
  let shipState = 0;
  if (sunk) shipState |= 1;
  if ((state.helm[vehicleIndex] ?? -1) >= 0) shipState |= 2;
  if ((state.gun1[vehicleIndex] ?? -1) >= 0) shipState |= 4;
  if ((state.gun2[vehicleIndex] ?? -1) >= 0) shipState |= 8;
  shipState |= (state.passengerCount[vehicleIndex] ?? 0) << 4;
  return shipState;
}
