import { HORSE_ENTITY_BASE, MAX_HORSES, Team } from "@janissary/shared";

/** Replicated riderless horses. A horse is a world object, not a player marker. */
export interface HorseState {
  readonly active: Uint8Array;
  readonly team: Uint8Array;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly yaw: Float32Array;
  readonly lastTouchedTick: Uint32Array;
}

export function horseEntityId(index: number): number { return HORSE_ENTITY_BASE + index; }
export function isHorseEntityId(entityId: number): boolean {
  return entityId >= HORSE_ENTITY_BASE && entityId < HORSE_ENTITY_BASE + MAX_HORSES;
}
export function horseIndexForEntityId(entityId: number): number { return entityId - HORSE_ENTITY_BASE; }

export function createHorseState(): HorseState {
  return {
    active: new Uint8Array(MAX_HORSES),
    team: new Uint8Array(MAX_HORSES),
    x: new Float32Array(MAX_HORSES),
    z: new Float32Array(MAX_HORSES),
    yaw: new Float32Array(MAX_HORSES),
    lastTouchedTick: new Uint32Array(MAX_HORSES),
  };
}

export function spawnHorse(state: HorseState, index: number, x: number, z: number, yaw: number, team: Team, tick: number): void {
  state.active[index] = 1;
  state.team[index] = team;
  state.x[index] = x;
  state.z[index] = z;
  state.yaw[index] = yaw;
  state.lastTouchedTick[index] = tick;
}

export function despawnHorse(state: HorseState, index: number): void {
  state.active[index] = 0;
  state.team[index] = Team.None;
  state.lastTouchedTick[index] = 0;
}

export function findFreeHorse(state: HorseState): number {
  for (let index = 0; index < MAX_HORSES; index += 1) if (state.active[index] === 0) return index;
  return -1;
}
