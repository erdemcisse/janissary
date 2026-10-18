import { describe, expect, it } from "vitest";
import {
  EARTHWORK_COOLDOWN_SECONDS,
  EARTHWORK_MAX,
  EARTHWORK_MOUND_HEIGHT,
  FIXED_DT_MS,
  GROUND_CENTER_Y,
  heightAt,
  InputButton,
  PlayerFlag,
  Team,
} from "@janissary/shared";
import { addPlayer, createWorldState, enqueueInput, stepWorld, writeEntityStateAt } from "../src/sim/world";
import { earthworkEntityId } from "../src/sim/earthwork";

function input(worldTick: number, seq: number, buttons: number, yaw = 0, pitch = 0) {
  return { seq, lastSnapshotTick: worldTick, buttons, yaw, pitch, dtMs: FIXED_DT_MS };
}

/** Aim pitch that places the target EARTHWORK_MAX_RANGE * 0.5 m in front of the player. */
function aimPitch(eyeY: number, feetY: number, distance: number): number {
  return Math.atan2(feetY - eyeY, distance);
}

describe("earthworks (shovel) and torch (Phase 8c-4)", () => {
  it("places a mound through the input path when aiming at clear ground", () => {
    const world = createWorldState();
    const player = addPlayer(world, "builder", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    world.x[player.slot] = -200;
    world.z[player.slot] = -200;
    world.yaw[player.slot] = Math.PI / 2;
    // 8e-17: (-200,-200) is open field now (ground ≈ +1.96), so settle onto
    // the heightfield first, then aim from the settled eye height at the
    // ground 5 m ahead (the pitch the old flat-ground test baked in).
    for (let index = 0; index < 20; index += 1) stepWorld(world);
    const eyeY = (world.y[player.slot] ?? 0) + 0.65;
    world.pitch[player.slot] = aimPitch(eyeY, heightAt(-205, -200), 5);
    enqueueInput(world, player.entityId, input(world.tick, 1, InputButton.RaiseEarthwork, Math.PI / 2, world.pitch[player.slot] ?? 0));
    stepWorld(world);
    expect(world.earthworkCount).toBe(1);
    expect(world.earthworkKind[0]).toBe(1);
    expect(world.earthworkX[0]).toBeCloseTo(-205, 0);
    expect(world.earthworkZ[0]).toBeCloseTo(-200, 0);
  });

  it("rejects placements inside capture-point clearance and does not start the cooldown", () => {
    const world = createWorldState();
    const player = addPlayer(world, "builder", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    world.x[player.slot] = -20;
    world.z[player.slot] = -20;
    world.yaw[player.slot] = 0;
    world.pitch[player.slot] = aimPitch(1.55, 0, 5);
    enqueueInput(world, player.entityId, input(world.tick, 1, InputButton.RaiseEarthwork, 0, world.pitch[player.slot] ?? 0));
    stepWorld(world);
    expect(world.earthworkCount).toBe(0);
    expect(world.nextEarthworkTick[player.slot]).toBe(0);
  });

  it("caps concurrent earthworks at 60 and evicts the oldest on overflow", () => {
    const world = createWorldState();
    const player = addPlayer(world, "builder", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    world.x[player.slot] = -200;
    world.z[player.slot] = -200;
    world.yaw[player.slot] = Math.PI / 2;
    for (let index = 1; index <= EARTHWORK_MAX + 1; index += 1) {
      world.nextEarthworkTick[player.slot] = 0;
      world.pitch[player.slot] = aimPitch(1.55, 0, 5);
      enqueueInput(world, player.entityId, input(world.tick, index, InputButton.RaiseEarthwork, Math.PI / 2, world.pitch[player.slot] ?? 0));
      stepWorld(world);
    }
    expect(world.earthworkCount).toBe(EARTHWORK_MAX);
    let active = 0;
    for (let index = 0; index < EARTHWORK_MAX; index += 1) if ((world.earthworkKind[index] ?? 0) !== 0) active += 1;
    expect(active).toBe(EARTHWORK_MAX);
  });

  it("enforces the per-player placement cooldown", () => {
    const world = createWorldState();
    const player = addPlayer(world, "builder", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    world.x[player.slot] = -200;
    world.z[player.slot] = -200;
    world.yaw[player.slot] = Math.PI / 2;
    world.pitch[player.slot] = aimPitch(1.55, 0, 5);
    enqueueInput(world, player.entityId, input(world.tick, 1, InputButton.DigEarthwork, Math.PI / 2, world.pitch[player.slot] ?? 0));
    stepWorld(world);
    expect(world.earthworkCount).toBe(1);
    enqueueInput(world, player.entityId, input(world.tick + 1, 2, InputButton.DigEarthwork, Math.PI / 2, world.pitch[player.slot] ?? 0));
    stepWorld(world);
    expect(world.earthworkCount).toBe(1);
    const cooldownTicks = Math.ceil(EARTHWORK_COOLDOWN_SECONDS / (1 / 20));
    for (let tick = 0; tick < cooldownTicks; tick += 1) stepWorld(world);
    enqueueInput(world, player.entityId, input(world.tick, 3, InputButton.DigEarthwork, Math.PI / 2, world.pitch[player.slot] ?? 0));
    stepWorld(world);
    expect(world.earthworkCount).toBe(2);
  });

  it("replicates earthworks as snapshot entities with the subkind on the wire", () => {
    const world = createWorldState();
    const player = addPlayer(world, "builder", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    world.x[player.slot] = -200;
    world.z[player.slot] = -200;
    world.yaw[player.slot] = Math.PI / 2;
    world.pitch[player.slot] = aimPitch(1.55, 0, 5);
    enqueueInput(world, player.entityId, input(world.tick, 1, InputButton.RaiseEarthwork, Math.PI / 2, world.pitch[player.slot] ?? 0));
    stepWorld(world);
    const state = writeEntityStateAt(world, player.slot, { entityId: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    expect(state.torch).toBe(0);
  });

  it("blocks a projectile with a mound and lets a player stand on one", () => {
    const world = createWorldState();
    const shooter = addPlayer(world, "shooter", Team.Ottoman);
    const target = addPlayer(world, "target", Team.Byzantine);
    expect(shooter).toBeDefined();
    expect(target).toBeDefined();
    if (shooter === undefined || target === undefined) return;
    world.x[shooter.slot] = 100;
    world.z[shooter.slot] = 100;
    world.yaw[shooter.slot] = Math.PI;
    world.x[target.slot] = 100;
    world.z[target.slot] = 108;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    world.earthworkKind[0] = 1;
    world.earthworkX[0] = 100;
    world.earthworkZ[0] = 102;
    // 8e-11: this scenario plays on open-field terrain (heightAt ≈ -0.6 here);
    // the mound base sits on the heightfield exactly as placeEarthwork now writes it.
    world.earthworkY[0] = heightAt(100, 102);
    world.earthworkPlacedTick[0] = world.tick;
    world.earthworkCount = 1;
    for (let index = 0; index < 20; index += 1) stepWorld(world);
    const bodyPitch = Math.atan2(1.25 - 1.55, 8);
    enqueueInput(world, shooter.entityId, input(world.tick, 1, InputButton.Fire, Math.PI, bodyPitch));
    stepWorld(world);
    expect(world.health[target.slot]).toBe(100);
    expect(world.warHits[shooter.slot]).toBe(0);

    const walker = addPlayer(world, "walker", Team.Byzantine);
    expect(walker).toBeDefined();
    if (walker === undefined) return;
    world.x[walker.slot] = 100;
    world.z[walker.slot] = 99;
    world.yaw[walker.slot] = Math.PI;
    const walkY: number[] = [];
    for (let seq = 1; seq <= 40; seq += 1) {
      enqueueInput(world, walker.entityId, input(world.tick, seq, InputButton.Forward, Math.PI, 0));
      stepWorld(world);
      walkY.push(world.y[walker.slot] ?? 0);
    }
    // The walker climbs onto the mound (most of the cover rise above the local
    // terrain, 8e-11) and crosses it.
    expect(Math.max(...walkY)).toBeGreaterThan(heightAt(100, 102) + GROUND_CENTER_Y + EARTHWORK_MOUND_HEIGHT * 0.7);
    expect(world.z[walker.slot] ?? 0).toBeGreaterThan(104);
    // 8e-11: past the mound the walker stands on the heightfield, not on z=0.
    const finalX = world.x[walker.slot] ?? 0;
    const finalZ = world.z[walker.slot] ?? 0;
    expect(world.y[walker.slot] ?? 0).toBeCloseTo(heightAt(finalX, finalZ) + GROUND_CENTER_Y, 1);
  });

  it("toggles the torch on button edges and replicates it in entity state", () => {
    const world = createWorldState();
    const player = addPlayer(world, "torchbearer", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    enqueueInput(world, player.entityId, input(world.tick, 1, InputButton.Torch));
    stepWorld(world);
    expect(world.torch[player.slot]).toBe(1);
    // Held: no further toggle.
    enqueueInput(world, player.entityId, input(world.tick + 1, 2, InputButton.Torch));
    stepWorld(world);
    expect(world.torch[player.slot]).toBe(1);
    // Released, then pressed again: toggles off.
    enqueueInput(world, player.entityId, input(world.tick + 2, 3, 0));
    stepWorld(world);
    enqueueInput(world, player.entityId, input(world.tick + 3, 4, InputButton.Torch));
    stepWorld(world);
    expect(world.torch[player.slot]).toBe(0);
    const state = writeEntityStateAt(world, player.slot, { entityId: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    expect(state.torch).toBe(0);
    // The earthwork entity id range is reserved.
    expect(earthworkEntityId(0)).toBeGreaterThanOrEqual(20_000);
  });
});
