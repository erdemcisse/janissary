import { describe, expect, it } from "vitest";
import { FIXED_DT_MS, GALLEY_DOCKS, InputButton, PlayerClass, PlayerFlag, Team, WATER_SHORE_Z } from "@janissary/shared";
import { addPlayer, createWorldState, enqueueInput, stepWorld } from "../src/sim/world";
import { clampToWaterGeometry } from "../src/sim/vehicle";
import { riverCenterlineDistance } from "@janissary/shared";

interface TickAction {
  entityId: number;
  buttons: number;
  yaw?: number;
  pitch?: number;
}

function tickWith(world: ReturnType<typeof createWorldState>, actions: readonly TickAction[], count: number, seqStart = 1): number {
  for (let tick = 0; tick < count; tick += 1) {
    for (const action of actions) {
      enqueueInput(world, action.entityId, { seq: seqStart + tick, lastSnapshotTick: world.tick, buttons: action.buttons, yaw: action.yaw ?? 0, pitch: action.pitch ?? 0, dtMs: FIXED_DT_MS });
    }
    stepWorld(world);
  }
  return seqStart + count;
}

describe("galley dock access (Phase 8c-4b)", () => {
  it("walks dry from the shore along a pier to a moored galley and boards without drowning", () => {
    const world = createWorldState();
    const player = addPlayer(world, "docksider", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    const dock = GALLEY_DOCKS[0];
    if (dock === undefined) return;
    // Start dry on the shore just south of the pier.
    world.x[player.slot] = dock.x;
    world.z[player.slot] = WATER_SHORE_Z - 6;
    world.yaw[player.slot] = 0;
    // Walk north onto the pier (yaw 0 faces -z? No: forward with yaw 0 moves
    // toward -z, so face +z via yaw = PI).
    world.yaw[player.slot] = Math.PI;
    let seq = 1;
    // Walk until the player is on the pier past the shoreline.
    for (let tick = 0; tick < 120 && (world.z[player.slot] ?? 0) < WATER_SHORE_Z + 8; tick += 1) {
      seq = tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Forward, yaw: Math.PI }], 1, seq);
    }
    expect(world.z[player.slot] ?? 0).toBeGreaterThan(WATER_SHORE_Z + 6);
    expect(world.health[player.slot]).toBe(100);
    // The player stands on the pier (feet dry).
    expect(world.y[player.slot] ?? 0).toBeGreaterThan(1.5);
    // Board the galley moored at the dock.
    seq = tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Interact }], 2, seq);
    expect(world.aboardVehicle[player.slot]).toBe(0);
    expect((world.flags[player.slot] ?? 0) & PlayerFlag.Aboard).not.toBe(0);
    expect(world.health[player.slot]).toBe(100);
  });

  it("allows a cavalry soldier to board and leave a galley like any other class", () => {
    const world = createWorldState();
    const sipahi = addPlayer(world, "dock-sipahi", Team.Ottoman, PlayerClass.Sipahi);
    expect(sipahi).toBeDefined();
    if (sipahi === undefined) return;
    const dock = GALLEY_DOCKS[0];
    if (dock === undefined) return;
    world.x[sipahi.slot] = dock.x;
    world.z[sipahi.slot] = dock.z;
    tickWith(world, [{ entityId: sipahi.entityId, buttons: InputButton.Interact }], 1);
    expect(world.mounted[sipahi.slot]).toBe(0);
    // Dismounting leaves the horse at the player's old position. Stand on the
    // galley's side rail, still inside the boarding envelope but outside the
    // remount radius, so the next Interact tests boarding rather than remount.
    world.x[sipahi.slot] = dock.x + 6;
    tickWith(world, [{ entityId: sipahi.entityId, buttons: 0 }], 35, 2);
    tickWith(world, [{ entityId: sipahi.entityId, buttons: InputButton.Interact }], 1, 37);
    expect(world.aboardVehicle[sipahi.slot]).toBe(0);
    expect((world.flags[sipahi.slot] ?? 0) & PlayerFlag.Aboard).not.toBe(0);

    tickWith(world, [{ entityId: sipahi.entityId, buttons: 0 }], 35, 38);
    tickWith(world, [{ entityId: sipahi.entityId, buttons: InputButton.Interact }], 1, 73);
    expect(world.aboardVehicle[sipahi.slot]).toBe(-1);
    expect((world.flags[sipahi.slot] ?? 0) & PlayerFlag.Aboard).toBe(0);
  });

  it("still drowns a player who wades off the pier into open water", () => {
    const world = createWorldState();
    const player = addPlayer(world, "swimmer", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    // Off the pier (x = -280 is outside the pier-0 footprint) and past the shore.
    world.x[player.slot] = -280;
    world.z[player.slot] = WATER_SHORE_Z + 4;
    const healthBefore = world.health[player.slot] ?? 100;
    tickWith(world, [{ entityId: player.entityId, buttons: 0 }], 20);
    expect(world.health[player.slot]).toBe(healthBefore - 3);
  });

  it("does not drain a player standing on a pier or bridge deck", () => {
    const world = createWorldState();
    const pierSitter = addPlayer(world, "pier-sitter", Team.Ottoman);
    const bridgeSitter = addPlayer(world, "bridge-sitter", Team.Byzantine);
    expect(pierSitter).toBeDefined();
    expect(bridgeSitter).toBeDefined();
    if (pierSitter === undefined || bridgeSitter === undefined) return;
    // On the pier (dock 0 pier) and on the south bridge deck — both past the
    // shoreline / inside the river channel.
    world.x[pierSitter.slot] = -284;
    world.z[pierSitter.slot] = WATER_SHORE_Z + 8;
    world.x[bridgeSitter.slot] = -319;
    world.z[bridgeSitter.slot] = 10;
    const pierHealth = world.health[pierSitter.slot] ?? 100;
    const bridgeHealth = world.health[bridgeSitter.slot] ?? 100;
    tickWith(world, [
      { entityId: pierSitter.entityId, buttons: 0 },
      { entityId: bridgeSitter.entityId, buttons: 0 },
    ], 60);
    expect(world.health[pierSitter.slot]).toBe(pierHealth);
    expect(world.health[bridgeSitter.slot]).toBe(bridgeHealth);
  });

  it("keeps a bridge jump dry but still drains a jump that leaves a pier", () => {
    const world = createWorldState();
    const bridgeJumper = addPlayer(world, "bridge-jumper", Team.Byzantine);
    const pierJumper = addPlayer(world, "pier-jumper", Team.Ottoman);
    expect(bridgeJumper).toBeDefined();
    expect(pierJumper).toBeDefined();
    if (bridgeJumper === undefined || pierJumper === undefined) return;
    world.x[bridgeJumper.slot] = -319;
    world.z[bridgeJumper.slot] = 10;
    world.x[pierJumper.slot] = -284;
    world.z[pierJumper.slot] = 244;
    let seq = tickWith(world, [
      { entityId: bridgeJumper.entityId, buttons: 0 },
      { entityId: pierJumper.entityId, buttons: 0 },
    ], 1);
    const bridgeHealth = world.health[bridgeJumper.slot] ?? 100;
    const pierHealth = world.health[pierJumper.slot] ?? 100;
    seq = tickWith(world, [
      { entityId: bridgeJumper.entityId, buttons: InputButton.Jump },
      { entityId: pierJumper.entityId, buttons: InputButton.Jump | InputButton.Forward, yaw: Math.PI },
    ], 20, seq);
    void seq;
    expect(world.health[bridgeJumper.slot]).toBe(bridgeHealth);
    expect(world.health[pierJumper.slot]).toBeLessThan(pierHealth);
    expect(world.z[pierJumper.slot] ?? 0).toBeGreaterThan(245);
  });

  it("crosses the river at a ford without drowning and wades slowly", () => {
    const world = createWorldState();
    const player = addPlayer(world, "fording", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    // Walk west across the southern ford (z = 110).
    world.x[player.slot] = -296;
    world.z[player.slot] = 110;
    world.yaw[player.slot] = Math.PI / 2;
    let seq = 1;
    let crossed = false;
    for (let tick = 0; tick < 450; tick += 1) {
      seq = tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Forward, yaw: Math.PI / 2 }], 1, seq);
      if ((world.x[player.slot] ?? 0) < -342) {
        crossed = true;
        break;
      }
    }
    expect(crossed).toBe(true);
    expect(world.health[player.slot]).toBe(100);
    expect(world.x[player.slot] ?? 0).toBeLessThan(-342);
  });

  it("drains a player crossing the river away from the fords", () => {
    const world = createWorldState();
    const player = addPlayer(world, "deep-river", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    // Mid-river at z = 80 — deep between the two fords.
    world.x[player.slot] = -320;
    world.z[player.slot] = 80;
    const healthBefore = world.health[player.slot] ?? 100;
    tickWith(world, [{ entityId: player.entityId, buttons: 0 }], 20);
    expect(world.health[player.slot]).toBe(healthBefore - 3);
  });

  it("clamps galleys into water geometry instead of letting them sail over land", () => {
    const world = createWorldState();
    const vehicles = world.vehicles;
    // Drop a galley on dry land far from any water.
    vehicles.x[0] = -200;
    vehicles.z[0] = 100;
    vehicles.speed[0] = 0;
    stepWorld(world);
    const x = vehicles.x[0] ?? 0;
    const z = vehicles.z[0] ?? 0;
    const inSea = z >= WATER_SHORE_Z;
    const inChannel = riverCenterlineDistance(x, z) <= 15.1;
    expect(inSea || inChannel).toBe(true);
    // And the clamp is idempotent for positions already in water.
    const clamped = clampToWaterGeometry(-330, 100);
    expect(clamped.x).toBe(-330);
    expect(clamped.z).toBe(100);
  });

  it("keeps a helmed galley in the channel while sailing up-river", () => {
    const world = createWorldState();
    const helm = addPlayer(world, "captain", Team.Ottoman);
    expect(helm).toBeDefined();
    if (helm === undefined) return;
    const vehicles = world.vehicles;
    vehicles.x[0] = -330;
    vehicles.z[0] = 228;
    vehicles.yaw[0] = -Math.PI / 2;
    vehicles.speed[0] = 0;
    vehicles.helm[0] = helm.slot;
    let seq = 1;
    let maxNorth = 228;
    for (let tick = 0; tick < 200; tick += 1) {
      seq = tickWith(world, [{ entityId: helm.entityId, buttons: InputButton.Forward, yaw: -Math.PI / 2 }], 1, seq);
      maxNorth = Math.min(maxNorth, vehicles.z[0] ?? 228);
      const x = vehicles.x[0] ?? 0;
      const z = vehicles.z[0] ?? 0;
      const inSea = z >= WATER_SHORE_Z;
      const inChannel = riverCenterlineDistance(x, z) <= 15.1;
      expect(inSea || inChannel).toBe(true);
    }
    // The galley made real progress up the channel (past the first bend).
    expect(maxNorth).toBeLessThan(170);
  });

  it("recalls an abandoned galley to its dock after the recall delay", () => {
    const world = createWorldState();
    const dock = GALLEY_DOCKS[0];
    if (dock === undefined) return;
    const vehicles = world.vehicles;
    vehicles.x[0] = 100;
    vehicles.z[0] = 250;
    vehicles.speed[0] = 0;
    expect(Math.hypot(100 - dock.x, 250 - dock.z)).toBeGreaterThan(40);
    // Run past the recall delay (15 s) plus margin.
    tickWith(world, [], 320);
    expect(vehicles.x[0]).toBeCloseTo(dock.x, 0);
    expect(vehicles.z[0]).toBeCloseTo(dock.z, 0);
  });

  it("does not recall a galley that is occupied or near its dock", () => {
    const world = createWorldState();
    const dock = GALLEY_DOCKS[0];
    if (dock === undefined) return;
    const vehicles = world.vehicles;
    // Parked at its dock: no recall.
    vehicles.x[0] = dock.x;
    vehicles.z[0] = dock.z;
    vehicles.speed[0] = 0;
    tickWith(world, [], 320);
    expect(vehicles.x[0]).toBeCloseTo(dock.x, 0);
    expect(vehicles.z[0]).toBeCloseTo(dock.z, 0);
  });
});
