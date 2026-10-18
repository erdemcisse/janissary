import { describe, expect, it } from "vitest";
import { FIXED_DT_MS, InputButton, PlayerFlag, Team } from "@janissary/shared";
import { decodeInput, encodeInput } from "@janissary/shared";
import { addPlayer, createWorldState, enqueueInput, stepWorld } from "../src/sim/world";

/**
 * Regression coverage for the playtest report "human player cannot land
 * hits/kills": a human-equivalent player (plain addPlayer, no bot AI) fires
 * through the exact wire path the server's handleInput uses — encodeInput then
 * decodeInput — and a hit must register against an in-range target. The bot
 * backfill path feeds the same enqueueInput, so a pass here means the sim and
 * wire layers are healthy for human input and the reported failure must be
 * client-side (pointer lock / input capture).
 */
describe("human fire input path", () => {
  it("registers a hit when a human-equivalent player fires via the encoded input message", () => {
    const world = createWorldState();
    const shooter = addPlayer(world, "human-shooter", Team.Ottoman);
    const target = addPlayer(world, "victim", Team.Byzantine);
    expect(shooter).toBeDefined();
    expect(target).toBeDefined();
    if (shooter === undefined || target === undefined) return;
    world.x[shooter.slot] = 80;
    world.z[shooter.slot] = -20;
    world.yaw[shooter.slot] = Math.PI;
    world.x[target.slot] = 80;
    world.z[target.slot] = -10;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    // Warm up so the shot uses standing spread (deterministic hit at 10 m).
    for (let index = 0; index < 20; index += 1) stepWorld(world);

    const wire = decodeInput(encodeInput({
      seq: 1,
      lastSnapshotTick: world.tick,
      buttons: InputButton.Fire,
      yaw: Math.PI,
      pitch: 0,
      dtMs: FIXED_DT_MS,
    }));
    expect(enqueueInput(world, shooter.entityId, wire)).toBe(true);
    stepWorld(world);

    expect(world.warShots[shooter.slot]).toBe(1);
    expect(world.warHits[shooter.slot]).toBe(1);
    expect(world.health[target.slot]).toBe(40);
    expect(world.events.some((event) => event.type === 2 && event.sourceEntityId === shooter.entityId && event.targetEntityId === target.entityId)).toBe(true);
  });

  it("refills ammo after a reload request over the same wire path", () => {
    const world = createWorldState();
    const player = addPlayer(world, "human-reloader", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    world.ammo[player.slot] = 0;
    const wire = decodeInput(encodeInput({
      seq: 1,
      lastSnapshotTick: world.tick,
      buttons: InputButton.Reload,
      yaw: 0,
      pitch: 0,
      dtMs: FIXED_DT_MS,
    }));
    expect(enqueueInput(world, player.entityId, wire)).toBe(true);
    stepWorld(world);
    const reloadUntil = world.reloadUntilTick[player.slot] ?? 0;
    while (world.tick <= reloadUntil) stepWorld(world);
    expect(world.ammo[player.slot]).toBe(1);
  });

  it("does not turn one held trigger into another shot after reload", () => {
    const world = createWorldState();
    const player = addPlayer(world, "single-trigger", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    let seq = 1;
    const hold = (buttons: number): void => {
      enqueueInput(world, player.entityId, { seq, lastSnapshotTick: world.tick, buttons, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS });
      seq += 1;
      stepWorld(world);
    };
    hold(InputButton.Fire);
    expect(world.warShots[player.slot]).toBe(1);
    // Keep both reload and the physical trigger held until the charge is ready.
    hold(InputButton.Reload | InputButton.Fire);
    const reloadUntil = world.reloadUntilTick[player.slot] ?? 0;
    while (world.tick <= reloadUntil) hold(InputButton.Reload | InputButton.Fire);
    expect(world.ammo[player.slot]).toBe(1);
    expect(world.warShots[player.slot]).toBe(1);
    // Releasing and pressing again is the only way to fire the next round.
    hold(0);
    hold(InputButton.Fire);
    expect(world.warShots[player.slot]).toBe(2);
  });

  it("compares a human slot's ammo/reload state against a bot slot's at the same tick", () => {
    const world = createWorldState();
    const human = addPlayer(world, "human", Team.Ottoman);
    const bot = addPlayer(world, "bot", Team.Byzantine);
    expect(human).toBeDefined();
    expect(bot).toBeDefined();
    if (human === undefined || bot === undefined) return;
    // Both slots spawn identically: one loaded round, no reload, no fire cooldown.
    expect(world.ammo[human.slot]).toBe(world.ammo[bot.slot]);
    expect(world.ammo[human.slot]).toBe(1);
    expect(world.reloadUntilTick[human.slot]).toBe(0);
    expect(world.nextFireTick[human.slot]).toBe(0);
    expect(world.reloadUntilTick[bot.slot]).toBe(0);
    expect(world.nextFireTick[bot.slot]).toBe(0);
    // After a fired round the human slot's cooldown/ammo state matches what the
    // fire gate consumes: nextFireTick is in the future and ammo is empty until
    // a reload completes.
    enqueueInput(world, human.entityId, { seq: 1, lastSnapshotTick: world.tick, buttons: InputButton.Fire, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS });
    stepWorld(world);
    expect(world.ammo[human.slot]).toBe(0);
    expect(world.nextFireTick[human.slot]).toBeGreaterThan(world.tick);
    enqueueInput(world, human.entityId, { seq: 2, lastSnapshotTick: world.tick, buttons: InputButton.Reload, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS });
    stepWorld(world);
    expect(world.reloadUntilTick[human.slot]).toBeGreaterThan(world.tick);
    const reloadUntil = world.reloadUntilTick[human.slot] ?? 0;
    while (world.tick <= reloadUntil) stepWorld(world);
    expect(world.ammo[human.slot]).toBe(1);
    expect(world.reloadUntilTick[human.slot]).toBe(0);
  });
});
