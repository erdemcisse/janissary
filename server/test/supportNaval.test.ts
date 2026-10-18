import { describe, expect, it } from "vitest";
import {
  FIXED_DT_MS,
  FIXED_DT_SECONDS,
  GALLEY_HULL_HP,
  GALLEY_MAX_SPEED,
  InputButton,
  PlayerClass,
  PlayerFlag,
  Team,
  WATER_SHORE_Z,
} from "@janissary/shared";
import { addPlayer, createWorldState, enqueueInput, requestClass, stepWorld, type WorldState } from "../src/sim/world";

function input(worldTick: number, seq: number, buttons: number, yaw = 0, pitch = 0) {
  return { seq, lastSnapshotTick: worldTick, buttons, yaw, pitch, dtMs: FIXED_DT_MS };
}

function tickWith(world: WorldState, inputs: { entityId: number; buttons: number; yaw?: number; lastSnapshotTick?: number }[], ticks: number): void {
  let seq = 1;
  for (let index = 0; index < ticks; index += 1) {
    for (const entry of inputs) {
      enqueueInput(world, entry.entityId, {
        seq,
        lastSnapshotTick: entry.lastSnapshotTick ?? 0,
        buttons: entry.buttons,
        yaw: entry.yaw ?? 0,
        pitch: 0,
        dtMs: FIXED_DT_MS,
      });
      seq += 1;
    }
    stepWorld(world);
  }
}

function pairOnField(team: Team): { world: WorldState; support: { entityId: number; slot: number }; ally: { entityId: number; slot: number } } {
  const world = createWorldState();
  const supportClass = team === Team.Ottoman ? PlayerClass.Mehter : PlayerClass.Priest;
  const support = addPlayer(world, "support", team, supportClass);
  const ally = addPlayer(world, "ally", team);
  if (support === undefined || ally === undefined) throw new Error("Slots unavailable");
  world.x[support.slot] = 60;
  world.z[support.slot] = -60;
  world.x[ally.slot] = 64;
  world.z[ally.slot] = -60;
  return { world, support, ally };
}

describe("support classes", () => {
  it("buffs nearby allies with a 15% reload reduction and 5% speed increase", () => {
    const { world, support, ally } = pairOnField(Team.Ottoman);
    tickWith(world, [
      { entityId: support.entityId, buttons: 0 },
      { entityId: ally.entityId, buttons: 0 },
    ], 6);
    expect((world.flags[ally.slot] ?? 0) & PlayerFlag.AuraActive).not.toBe(0);
    world.ammo[ally.slot] = 0;
    enqueueInput(world, ally.entityId, input(world.tick, 999, InputButton.Reload));
    stepWorld(world);
    const buffedReloadTicks = (world.reloadUntilTick[ally.slot] ?? 0) - world.tick;
    expect(buffedReloadTicks).toBe(Math.ceil(6 * 0.85 / FIXED_DT_SECONDS));
  });

  it("grants aura XP for nearby in-combat teammates capped per second", () => {
    const { world, support, ally } = pairOnField(Team.Ottoman);
    tickWith(world, [
      { entityId: support.entityId, buttons: 0 },
      { entityId: ally.entityId, buttons: InputButton.Fire },
    ], 6);
    expect((world.flags[ally.slot] ?? 0) & PlayerFlag.AuraActive).not.toBe(0);
    const before = world.warXp[support.slot] ?? 0;
    tickWith(world, [
      { entityId: support.entityId, buttons: 0 },
      { entityId: ally.entityId, buttons: 0 },
    ], 100);
    const gained = (world.warXp[support.slot] ?? 0) - before;
    expect(gained).toBeGreaterThanOrEqual(8);
    expect(gained).toBeLessThanOrEqual(10);
  });

  it("credits a support when a buffed ally kills", () => {
    const { world, support, ally } = pairOnField(Team.Ottoman);
    const enemy = addPlayer(world, "enemy", Team.Byzantine);
    if (enemy === undefined) throw new Error("Slots unavailable");
    world.x[enemy.slot] = 64;
    world.z[enemy.slot] = -61;
    world.flags[enemy.slot] = (world.flags[enemy.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    // Blade equipped (slot 1): with the ranged slot in hand the 8e-3 swing is
    // the weakest-tier butt stroke, which cannot kill inside the window.
    world.activeWeaponSlot[ally.slot] = 1;
    tickWith(world, [
      { entityId: support.entityId, buttons: 0 },
      { entityId: ally.entityId, buttons: 0 },
      { entityId: enemy.entityId, buttons: 0 },
    ], 6);
    const before = world.warXp[support.slot] ?? 0;
    tickWith(world, [
      { entityId: support.entityId, buttons: 0 },
      { entityId: ally.entityId, buttons: InputButton.Melee },
      { entityId: enemy.entityId, buttons: 0 },
    ], 40);
    expect((world.warXp[support.slot] ?? 0) - before).toBeGreaterThanOrEqual(10);
    expect(world.buffedKillAssists[support.slot] ?? 0).toBe(1);
  });

  it("pauses the aura for four seconds when the support swings", () => {
    const { world, support, ally } = pairOnField(Team.Ottoman);
    tickWith(world, [
      { entityId: support.entityId, buttons: 0 },
      { entityId: ally.entityId, buttons: 0 },
    ], 6);
    expect((world.flags[ally.slot] ?? 0) & PlayerFlag.AuraActive).not.toBe(0);
    enqueueInput(world, support.entityId, input(world.tick, 999, InputButton.Melee));
    stepWorld(world);
    const pauseEndsAt = world.auraPauseUntilTick[support.slot] ?? 0;
    expect(pauseEndsAt - world.tick).toBe(Math.ceil(4 / FIXED_DT_SECONDS));
    tickWith(world, [
      { entityId: support.entityId, buttons: 0 },
      { entityId: ally.entityId, buttons: 0 },
    ], Math.ceil(4 / FIXED_DT_SECONDS) - 1);
    expect((world.flags[ally.slot] ?? 0) & PlayerFlag.AuraActive).toBe(0);
  });

  it("enforces the 5% support cap with a minimum of one slot", () => {
    const world = createWorldState();
    const players: { entityId: number; slot: number }[] = [];
    for (let index = 0; index < 20; index += 1) {
      const player = addPlayer(world, `p${index}`, Team.Ottoman);
      if (player === undefined) throw new Error("Slots unavailable");
      players.push(player);
    }
    let accepted = 0;
    for (const player of players) {
      if (requestClass(world, player.entityId, PlayerClass.Mehter)) accepted += 1;
    }
    expect(accepted).toBe(1);
  });
});

describe("naval slice", () => {
  it("wades slowly and drains health past the shore line", () => {
    const world = createWorldState();
    const player = addPlayer(world, "wader", Team.Ottoman);
    if (player === undefined) throw new Error("Slots unavailable");
    world.x[player.slot] = 0;
    world.z[player.slot] = WATER_SHORE_Z - 2;
    world.yaw[player.slot] = 0;
    // Sample before the faster wade crosses back onto dry ground. The new
    // multiplier should feel slowed but still traversable, not nearly frozen.
    tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Forward }], 5);
    const wadeSpeed = Math.hypot(world.velocityX[player.slot] ?? 0, world.velocityZ[player.slot] ?? 0);
    expect(wadeSpeed).toBeGreaterThan(3.5);
    expect(wadeSpeed).toBeLessThan(5);
    world.x[player.slot] = 0;
    world.z[player.slot] = WATER_SHORE_Z + 4;
    const healthBefore = world.health[player.slot] ?? 100;
    tickWith(world, [{ entityId: player.entityId, buttons: 0 }], 20);
    expect((world.health[player.slot] ?? 100)).toBe(healthBefore - 3);
  });

  it("sails a galley from the helm station and fires a gun at an enemy hull", () => {
    const world = createWorldState();
    const helm = addPlayer(world, "helm", Team.Ottoman);
    const gunner = addPlayer(world, "gunner", Team.Ottoman);
    if (helm === undefined || gunner === undefined) throw new Error("Slots unavailable");
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
    const startX = world.vehicles.x[galley] ?? -100;
    tickWith(world, [
      { entityId: helm.entityId, buttons: InputButton.Forward },
      { entityId: gunner.entityId, buttons: InputButton.Fire, yaw: -Math.PI / 2, lastSnapshotTick: world.tick },
    ], 60);
    expect(world.vehicles.x[galley] ?? -100).toBeGreaterThan(startX);
    expect(world.vehicles.hullHp[enemyGalley] ?? GALLEY_HULL_HP).toBeLessThan(GALLEY_HULL_HP);
    expect(world.vehicles.active[enemyGalley]).toBe(1);
  });

  it("sinks a galley, dumps the crew, and respawns at the dock when the harbor is held", () => {
    const world = createWorldState();
    const crew = addPlayer(world, "crew", Team.Ottoman);
    if (crew === undefined) throw new Error("Slots unavailable");
    const galley = 0;
    world.vehicles.x[galley] = -125;
    world.vehicles.z[galley] = 260;
    world.vehicles.yaw[galley] = 0;
    world.vehicles.helm[galley] = crew.slot;
    world.flags[crew.slot] = (world.flags[crew.slot] ?? 0) | PlayerFlag.Aboard;
    world.aboardVehicle[crew.slot] = galley;
    world.aboardOffsetX[crew.slot] = 0;
    const harborHolder = addPlayer(world, "harbor", Team.Ottoman);
    if (harborHolder === undefined) throw new Error("Slots unavailable");
    world.x[harborHolder.slot] = 74;
    world.z[harborHolder.slot] = 42;
    const shooter = addPlayer(world, "shooter", Team.Ottoman);
    const shooterGalley = 2;
    if (shooter === undefined) throw new Error("Slots unavailable");
    world.vehicles.x[shooterGalley] = -140;
    world.vehicles.z[shooterGalley] = 260;
    world.vehicles.yaw[shooterGalley] = 0;
    world.vehicles.gun1[shooterGalley] = shooter.slot;
    world.flags[shooter.slot] = (world.flags[shooter.slot] ?? 0) | PlayerFlag.Aboard;
    world.aboardVehicle[shooter.slot] = shooterGalley;
    world.aboardOffsetX[shooter.slot] = 4.5;
    world.vehicles.hullHp[galley] = 70;
    tickWith(world, [
      { entityId: crew.entityId, buttons: 0 },
      { entityId: shooter.entityId, buttons: InputButton.Fire, yaw: -Math.PI / 2, lastSnapshotTick: world.tick },
      { entityId: harborHolder.entityId, buttons: 0 },
    ], 60);
    expect(world.vehicles.active[galley]).toBe(1);
    expect(world.vehicles.listingUntilTick[galley] ?? 0).toBeGreaterThan(world.tick);
    expect(world.aboardVehicle[crew.slot] ?? -1).toBe(-1);
    const listingEnds = world.vehicles.listingUntilTick[galley] ?? 0;
    tickWith(world, [
      { entityId: crew.entityId, buttons: 0 },
      { entityId: shooter.entityId, buttons: 0 },
      { entityId: harborHolder.entityId, buttons: 0 },
    ], listingEnds - world.tick + 900 + 20);
    expect(world.vehicles.active[galley]).toBe(1);
    expect(world.vehicles.x[galley]).toBeCloseTo(-284, 0);
    expect(world.vehicles.hullHp[galley]).toBe(GALLEY_HULL_HP);
  });

  it("does not respawn sunk galleys while the harbor point is lost", () => {
    const world = createWorldState();
    const galley = 0;
    world.vehicles.x[galley] = -125;
    world.vehicles.z[galley] = 260;
    world.vehicles.hullHp[galley] = 10;
    world.pointOwner[2] = Team.None;
    const shooter = addPlayer(world, "shooter", Team.Ottoman);
    const shooterGalley = 2;
    if (shooter === undefined) throw new Error("Slots unavailable");
    world.vehicles.x[shooterGalley] = -140;
    world.vehicles.z[shooterGalley] = 260;
    world.vehicles.gun1[shooterGalley] = shooter.slot;
    world.flags[shooter.slot] = (world.flags[shooter.slot] ?? 0) | PlayerFlag.Aboard;
    world.aboardVehicle[shooter.slot] = shooterGalley;
    world.aboardOffsetX[shooter.slot] = 4.5;
    tickWith(world, [
      { entityId: shooter.entityId, buttons: InputButton.Fire, yaw: -Math.PI / 2, lastSnapshotTick: world.tick },
    ], 1200);
    expect(world.vehicles.active[galley]).toBe(0);
  });

  it("rewinds a shot against a player on a moving galley at 150 ms latency", () => {
    const world = createWorldState();
    const attacker = addPlayer(world, "attacker", Team.Ottoman);
    const target = addPlayer(world, "target", Team.Byzantine);
    if (attacker === undefined || target === undefined) throw new Error("Slots unavailable");
    const galley = 0;
    world.vehicles.x[galley] = 0;
    world.vehicles.z[galley] = 260;
    world.vehicles.yaw[galley] = 0;
    world.vehicles.speed[galley] = GALLEY_MAX_SPEED;
    world.vehicles.helm[galley] = target.slot;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) | PlayerFlag.Aboard;
    world.aboardVehicle[target.slot] = galley;
    world.aboardOffsetX[target.slot] = 0;
    world.aboardOffsetZ[target.slot] = 0;
    tickWith(world, [
      { entityId: target.entityId, buttons: 0 },
      { entityId: attacker.entityId, buttons: 0 },
    ], 40);
    const fireTick = world.tick;
    const rewindTick = fireTick - 3;
    const currentSpeed = world.vehicles.speed[galley] ?? GALLEY_MAX_SPEED;
    const rewindGalleyX = (world.vehicles.x[galley] ?? 0) - currentSpeed * FIXED_DT_SECONDS * 3;
    world.x[attacker.slot] = rewindGalleyX - 10;
    world.z[attacker.slot] = 260;
    world.yaw[attacker.slot] = -Math.PI / 2;
    world.desiredYaw[attacker.slot] = -Math.PI / 2;
    enqueueInput(world, attacker.entityId, input(rewindTick, 500, InputButton.Fire, -Math.PI / 2));
    stepWorld(world);
    expect(world.health[target.slot] ?? 100).toBeLessThan(100);
    expect(world.entityId[target.slot]).toBe(world.entityId[target.slot]);
  });
});
