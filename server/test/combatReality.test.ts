import { describe, expect, it } from "vitest";
import {
  ARTILLERY_CREW_RADIUS,
  ARTILLERY_EMPLACEMENTS,
  BOMBARD_CREW_RELOAD_SECONDS,
  BOMBARD_SOLO_RELOAD_SECONDS,
  CAVALRY_HORSE_HEALTH,
  CAVALRY_LANCE_RECOUCH_SECONDS,
  CAVALRY_SABER_RANGE,
  CombatEventType,
  CROSSBOW_TRAVEL_SECONDS,
  DEPLOY_MIN_SECONDS,
  FIXED_DT_MS,
  FIXED_DT_SECONDS,
  GALLEY_HULL_HP,
  InputButton,
  KillCause,
  MAX_HEALTH,
  PlayerClass,
  PlayerFlag,
  SIEGE_CANNON_MAX_PITCH,
  SIEGE_CANNON_MIN_PITCH,
  SIEGE_CANNON_YAW_ARC,
  Team,
  WEAPON_DEFS,
  WeaponType,
} from "@janissary/shared";
import {
  addPlayer,
  applyDamage,
  createWorldState,
  enqueueInput,
  requestDeploy,
  stepWorld,
  type WorldState,
} from "../src/sim/world";

/**
 * Phase 8e-25 reality pass (full-audit slice 1): state-machine edges of the
 * combat and player-flow loop that previously had no coverage and, in two
 * cases, no implementation at all:
 *
 * - Death must release every station a player occupies (wall-gun emplacement,
 *   galley helm/gun/passenger seat). Before this pass, dying at a wall-gun
 *   left the emplacement booked forever, and dying aboard a galley re-glued
 *   the respawned player to the ship every tick.
 * - One trigger press drives exactly one weapon: a galley gunner firing the
 *   ship gun must not also fire a personal arquebus in the same tick.
 * - Support classes are explicitly fire-inert (previously only enforced by
 *   ammo starvation, with an unreachable pause branch in fireWeapon).
 * - Travel-time weapons announce the shot at trigger time, not at the moment
 *   the bolt lands 0.22 s later.
 * - Headshots are lethal regardless of distance; body shots kill in two hits.
 * - Death while mounted leaves a riderless horse; mounted reload and cavalry
 *   lance damage keep their promised behavior.
 * - Artillery aim clamps to the carriage arc and crewed reloads run at the
 *   crew rate.
 */

const TICKS_PER_SECOND = 20;
const DEPLOY_FLOOR_TICKS = DEPLOY_MIN_SECONDS * TICKS_PER_SECOND;

interface Seat {
  entityId: number;
  slot: number;
}

function add(world: WorldState, name: string, team: Team, playerClass?: PlayerClass): Seat {
  const added = addPlayer(world, name, team);
  if (added === undefined) throw new Error("Slots unavailable");
  if (playerClass !== undefined) {
    // Bypass the class caps: these tests need specific compositions.
    world.desiredClass[added.slot] = playerClass;
    world.playerClass[added.slot] = playerClass;
  }
  return added;
}

function input(worldTick: number, seq: number, buttons: number, yaw = 0, pitch = 0) {
  return { seq, lastSnapshotTick: worldTick, buttons, yaw, pitch, dtMs: FIXED_DT_MS };
}

function activeHorses(world: WorldState): number {
  let count = 0;
  for (let index = 0; index < world.horses.active.length; index += 1) {
    if (world.horses.active[index] !== 0) count += 1;
  }
  return count;
}

describe("combat reality pass — state leaks on death", () => {
  it("releases a wall-gun emplacement when the gunner dies, so the next gunner can man it", () => {
    const world = createWorldState();
    const gunner = add(world, "wallgunner", Team.Byzantine, PlayerClass.WallGunner);
    const killer = add(world, "killer", Team.Ottoman);
    const gun = ARTILLERY_EMPLACEMENTS.find((entry) => entry.team === Team.Byzantine && entry.kind === "wall-gun");
    expect(gun).toBeDefined();
    if (gun === undefined) return;

    world.x[gunner.slot] = gun.x;
    world.z[gunner.slot] = gun.z;
    enqueueInput(world, gunner.entityId, input(world.tick, 1, InputButton.Interact));
    stepWorld(world);
    expect(world.gunnerSlot[gun.id]).toBe(gunner.slot);
    expect(world.mannedGun[gunner.slot] ?? -1).toBe(gun.id);

    world.flags[gunner.slot] = (world.flags[gunner.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    applyDamage(world, killer.slot, gunner.slot, 100, 5, false, KillCause.Arquebus);
    expect(world.gunnerSlot[gun.id]).toBe(-1);
    expect(world.mannedGun[gunner.slot] ?? -1).toBe(-1);

    // The emplacement must be free immediately: a second gunner can man it
    // without any disconnect or round reset.
    const second = add(world, "second", Team.Byzantine, PlayerClass.WallGunner);
    world.x[second.slot] = gun.x;
    world.z[second.slot] = gun.z;
    enqueueInput(world, second.entityId, input(world.tick, 1, InputButton.Interact));
    stepWorld(world);
    expect(world.gunnerSlot[gun.id]).toBe(second.slot);
  });

  it("releases a galley station when the occupant dies and never re-glues the respawned player", () => {
    const world = createWorldState();
    const helm = add(world, "helm", Team.Ottoman);
    const killer = add(world, "killer", Team.Byzantine);
    const galley = 0;
    world.vehicles.x[galley] = -100;
    world.vehicles.z[galley] = 260;
    world.vehicles.yaw[galley] = 0;
    world.vehicles.helm[galley] = helm.slot;
    world.flags[helm.slot] = (world.flags[helm.slot] ?? 0) | PlayerFlag.Aboard;
    world.aboardVehicle[helm.slot] = galley;
    world.aboardOffsetX[helm.slot] = 0;
    world.flags[helm.slot] = (world.flags[helm.slot] ?? 0) & ~PlayerFlag.SpawnProtected;

    applyDamage(world, killer.slot, helm.slot, 100, 5, false, KillCause.Arquebus);
    expect(world.vehicles.helm[galley]).toBe(-1);
    expect(world.aboardVehicle[helm.slot] ?? -1).toBe(-1);

    // Redeploy after the floor: the respawned player must stay at their spawn
    // — never overwritten by the galley station position every tick.
    for (let index = 0; index < DEPLOY_FLOOR_TICKS; index += 1) stepWorld(world);
    expect(requestDeploy(world, helm.entityId)).toBe(true);
    const x = world.x[helm.slot] ?? 0;
    const z = world.z[helm.slot] ?? 0;
    expect(Math.abs(x - (-100))).toBeGreaterThan(50);
    for (let index = 0; index < 5; index += 1) {
      enqueueInput(world, helm.entityId, input(world.tick, index + 1, 0));
      stepWorld(world);
    }
    expect(world.aboardVehicle[helm.slot] ?? -1).toBe(-1);
    expect(world.x[helm.slot]).toBe(x);
    expect(world.z[helm.slot]).toBe(z);
  });
});

describe("combat reality pass — one trigger, one weapon", () => {
  it("a galley gunner's Fire drives only the ship gun, never a personal weapon", () => {
    const world = createWorldState();
    const helm = add(world, "helm", Team.Ottoman);
    const gunner = add(world, "gunner", Team.Ottoman);
    const galley = 0;
    world.vehicles.x[galley] = -100;
    world.vehicles.z[galley] = 260;
    world.vehicles.yaw[galley] = 0;
    world.vehicles.helm[galley] = helm.slot;
    world.vehicles.gun1[galley] = gunner.slot;
    world.flags[helm.slot] = (world.flags[helm.slot] ?? 0) | PlayerFlag.Aboard;
    world.flags[gunner.slot] = (world.flags[gunner.slot] ?? 0) | PlayerFlag.Aboard;
    world.aboardVehicle[helm.slot] = galley;
    world.aboardVehicle[gunner.slot] = galley;
    world.aboardOffsetX[helm.slot] = 0;
    world.aboardOffsetX[gunner.slot] = 4.5;
    const enemyGalley = 2;
    world.vehicles.x[enemyGalley] = -70;
    world.vehicles.z[enemyGalley] = 260;
    world.vehicles.yaw[enemyGalley] = 0;
    const ammoBefore = world.ammo[gunner.slot] ?? 0;
    let seq = 0;
    for (let tick = 0; tick < 60; tick += 1) {
      seq += 1;
      enqueueInput(world, helm.entityId, input(world.tick, seq, 0));
      seq += 1;
      enqueueInput(world, gunner.entityId, input(world.tick, seq, InputButton.Fire, -Math.PI / 2, 0.25));
      stepWorld(world);
    }
    // The ship gun hit the enemy hull…
    expect(world.vehicles.hullHp[enemyGalley] ?? GALLEY_HULL_HP).toBeLessThan(GALLEY_HULL_HP);
    // …and the gunner's personal weapon never left the holster: no shot
    // counter, no ammo consumption, no Fire event for the personal weapon.
    expect(world.warShots[gunner.slot] ?? 0).toBe(0);
    expect(world.ammo[gunner.slot] ?? 0).toBe(ammoBefore);
    const personalFires = world.events.filter((event) => event.type === CombatEventType.Fire && event.sourceEntityId === gunner.entityId);
    expect(personalFires).toHaveLength(0);
  });

  it("a support class pressing Fire stays inert — no shot, no event, no ammo change", () => {
    const world = createWorldState();
    const mehter = add(world, "mehter", Team.Ottoman, PlayerClass.Mehter);
    // Spawned with a loaded pan (the class override happens after spawn);
    // the explicit support gate must refuse the shot even with ammo present.
    expect(world.ammo[mehter.slot] ?? 0).toBeGreaterThan(0);
    const ammoBefore = world.ammo[mehter.slot] ?? 0;
    enqueueInput(world, mehter.entityId, input(world.tick, 1, InputButton.Fire));
    stepWorld(world);
    expect(world.warShots[mehter.slot] ?? 0).toBe(0);
    expect(world.ammo[mehter.slot] ?? 0).toBe(ammoBefore);
    expect(world.events.some((event) => event.type === CombatEventType.Fire && event.sourceEntityId === mehter.entityId)).toBe(false);
    expect(world.pendingShots).toHaveLength(0);
  });
});

describe("combat reality pass — travel-time weapon timing", () => {
  it("announces the shot at trigger time and resolves the damage at the travel tick", () => {
    const world = createWorldState();
    const shooter = add(world, "shooter", Team.Byzantine, PlayerClass.Guardsman);
    const target = add(world, "target", Team.Ottoman);
    world.x[shooter.slot] = 80;
    world.z[shooter.slot] = -20;
    world.yaw[shooter.slot] = Math.PI;
    world.desiredYaw[shooter.slot] = Math.PI;
    world.x[target.slot] = 80;
    world.z[target.slot] = -10;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    for (let index = 0; index < 20; index += 1) stepWorld(world);

    const eyeY = (world.y[shooter.slot] ?? 0) + 0.65;
    const bodyCenterY = (world.y[target.slot] ?? 0) + 0.35;
    const pitch = Math.atan2(bodyCenterY - eyeY, 10);
    enqueueInput(world, shooter.entityId, input(world.tick, 1, InputButton.Fire, Math.PI, pitch));
    stepWorld(world);
    const fireTick = world.tick;

    const fires = world.events.filter((event) => event.type === CombatEventType.Fire && event.sourceEntityId === shooter.entityId);
    expect(fires).toHaveLength(1);
    // The bolt is still in flight (0.22 s ≈ 4-5 ticks): no damage yet.
    expect(world.health[target.slot]).toBe(MAX_HEALTH);
    for (let index = 0; index < Math.ceil(CROSSBOW_TRAVEL_SECONDS / FIXED_DT_SECONDS) + 2; index += 1) {
      enqueueInput(world, shooter.entityId, input(world.tick, index + 2, 0));
      stepWorld(world);
    }
    expect(world.health[target.slot]).toBeLessThan(MAX_HEALTH);
    // No shot was ever re-announced: any retained Fire event still carries
    // the trigger tick, never a later one (resolution does not re-fire).
    const newFires = world.events.filter((event) => event.type === CombatEventType.Fire && event.sourceEntityId === shooter.entityId && event.tick > fireTick);
    expect(newFires).toHaveLength(0);
  });
});

describe("combat reality pass — mounted edges", () => {
  it("death while mounted dismounts the rider and leaves the horse behind", () => {
    const world = createWorldState();
    const shooter = add(world, "shooter", Team.Ottoman);
    const rider = add(world, "rider", Team.Byzantine);
    world.mounted[rider.slot] = 1;
    world.flags[rider.slot] = (world.flags[rider.slot] ?? 0) | PlayerFlag.Mounted;
    world.horseHp[rider.slot] = CAVALRY_HORSE_HEALTH;
    world.flags[rider.slot] = (world.flags[rider.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    const horsesBefore = activeHorses(world);
    applyDamage(world, shooter.slot, rider.slot, 100, 5, false, KillCause.Arquebus);
    expect(world.mounted[rider.slot]).toBe(0);
    expect((world.flags[rider.slot] ?? 0) & PlayerFlag.Mounted).toBe(0);
    expect(activeHorses(world)).toBe(horsesBefore + 1);
  });

  it("a mounted rider reloads at the normal rate", () => {
    const world = createWorldState();
    const rider = add(world, "rider", Team.Ottoman);
    world.mounted[rider.slot] = 1;
    world.flags[rider.slot] = (world.flags[rider.slot] ?? 0) | PlayerFlag.Mounted;
    world.horseHp[rider.slot] = CAVALRY_HORSE_HEALTH;
    world.ammo[rider.slot] = 0;
    enqueueInput(world, rider.entityId, input(world.tick, 1, InputButton.Reload));
    stepWorld(world);
    expect(world.reloadUntilTick[rider.slot] ?? 0).toBeGreaterThan(world.tick);
    while (world.tick <= (world.reloadUntilTick[rider.slot] ?? 0)) {
      enqueueInput(world, rider.entityId, input(world.tick, 1, 0));
      stepWorld(world);
    }
    expect(world.ammo[rider.slot]).toBe(WEAPON_DEFS[WeaponType.Arquebus].magazineSize ?? 1);
  });

  it("a charging cavalry swing deals lance-scale damage and applies the recouch cooldown", () => {
    const world = createWorldState();
    const rider = add(world, "rider", Team.Ottoman);
    const target = add(world, "target", Team.Byzantine);
    world.mounted[rider.slot] = 1;
    world.flags[rider.slot] = (world.flags[rider.slot] ?? 0) | PlayerFlag.Mounted;
    world.horseHp[rider.slot] = CAVALRY_HORSE_HEALTH;
    // yaw 0 faces -z: the target at (0, 8) is directly ahead of (0, 10).
    world.x[rider.slot] = 0;
    world.z[rider.slot] = 10;
    world.yaw[rider.slot] = 0;
    world.desiredYaw[rider.slot] = 0;
    world.x[target.slot] = 0;
    world.z[target.slot] = 8;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    // Charge at full gallop: velocity -z at the horse top speed.
    world.velocityZ[rider.slot] = -15.6;
    const damageBefore = 100 - (world.health[target.slot] ?? 100);
    enqueueInput(world, rider.entityId, input(world.tick, 1, InputButton.Melee | InputButton.Forward));
    stepWorld(world);
    const damage = 100 - (world.health[target.slot] ?? 100);
    // Lance damage (max 90) far exceeds the saber's 35; a plain swing at the
    // same distance could never deal this much.
    expect(damage).toBeGreaterThanOrEqual(60);
    expect(damage).toBeGreaterThan(damageBefore);
    expect(world.nextMeleeTick[rider.slot] ?? 0).toBe(world.tick + Math.ceil(CAVALRY_LANCE_RECOUCH_SECONDS * TICKS_PER_SECOND));
    expect(CAVALRY_SABER_RANGE).toBeGreaterThanOrEqual(2.6);
  });
});

describe("combat reality pass — artillery aim clamp and crew reload", () => {
  it("clamps the gunner's aim into the carriage yaw arc and pitch band", () => {
    const world = createWorldState();
    const gunner = add(world, "gunner", Team.Ottoman, PlayerClass.Topcu);
    world.x[gunner.slot] = world.cannons.x[0] ?? -24;
    world.z[gunner.slot] = (world.cannons.z[0] ?? 84) + 1;
    enqueueInput(world, gunner.entityId, input(world.tick, 1, InputButton.Interact));
    stepWorld(world);
    expect(world.cannons.gunner[0]).toBe(gunner.slot);
    const carriageYaw = world.cannons.yaw[0] ?? 0;
    enqueueInput(world, gunner.entityId, input(world.tick, 2, 0, carriageYaw + 3, 1.5));
    stepWorld(world);
    const yawDelta = Math.abs(((world.cannons.gunYaw[0] ?? carriageYaw) - carriageYaw + Math.PI) % (2 * Math.PI) - Math.PI);
    expect(yawDelta).toBeLessThanOrEqual(SIEGE_CANNON_YAW_ARC + 1e-6);
    // Float32 storage of the exact clamp bound carries a tiny epsilon.
    expect(world.cannons.gunPitch[0] ?? 0).toBeGreaterThanOrEqual(SIEGE_CANNON_MIN_PITCH - 1e-6);
    expect(world.cannons.gunPitch[0] ?? 0).toBeLessThanOrEqual(SIEGE_CANNON_MAX_PITCH + 1e-6);
  });

  it("runs the crewed bombard reload at the crew rate, faster than solo", () => {
    const world = createWorldState();
    const gunner = add(world, "gunner", Team.Ottoman, PlayerClass.Topcu);
    const helperA = add(world, "helper-a", Team.Ottoman);
    const helperB = add(world, "helper-b", Team.Ottoman);
    world.x[gunner.slot] = world.cannons.x[0] ?? -24;
    world.z[gunner.slot] = (world.cannons.z[0] ?? 84) + 1;
    world.x[helperA.slot] = (world.cannons.x[0] ?? -24) + ARTILLERY_CREW_RADIUS - 1;
    world.z[helperA.slot] = (world.cannons.z[0] ?? 84) + 1;
    world.x[helperB.slot] = (world.cannons.x[0] ?? -24) - ARTILLERY_CREW_RADIUS + 1;
    world.z[helperB.slot] = (world.cannons.z[0] ?? 84) + 1;
    enqueueInput(world, gunner.entityId, input(world.tick, 1, InputButton.Interact));
    stepWorld(world);
    // Deploy on a Fire edge, then the held Fire fires after deploy completes.
    for (let tick = 0; tick < 62; tick += 1) {
      const seq = tick + 2;
      enqueueInput(world, gunner.entityId, input(world.tick, seq, InputButton.Fire, 0, 0.3));
      enqueueInput(world, helperA.entityId, input(world.tick, seq, 0));
      enqueueInput(world, helperB.entityId, input(world.tick, seq, 0));
      stepWorld(world);
    }
    expect(world.cannons.deployed[0]).toBe(1);
    expect(world.events.some((event) => event.type === CombatEventType.ArtilleryFire)).toBe(true);
    const reloadTicks = (world.cannons.reloadUntilTick[0] ?? world.tick) - world.tick;
    const crewSeconds = BOMBARD_CREW_RELOAD_SECONDS / FIXED_DT_SECONDS;
    const soloSeconds = BOMBARD_SOLO_RELOAD_SECONDS / FIXED_DT_SECONDS;
    expect(reloadTicks).toBeGreaterThanOrEqual(crewSeconds - 1);
    expect(reloadTicks).toBeLessThanOrEqual(crewSeconds + 1);
    expect(crewSeconds).toBeLessThan(soloSeconds);
  });
});
