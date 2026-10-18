import { describe, expect, it } from "vitest";
import {
  BYZANTINE_SPAWN,
  DEPLOY_MIN_SECONDS,
  FIXED_DT_MS,
  GROUND_CENTER_Y,
  InputButton,
  MAX_HEALTH,
  PlayerClass,
  PlayerFlag,
  RESPAWN_SECONDS,
  Team,
  decodeInput,
  encodeInput,
} from "@janissary/shared";
import { addPlayer, createWorldState, enqueueInput, requestClass, requestDeploy, stepWorld } from "../src/sim/world";

/**
 * Phase 8e-13 (ADR 0041): the forced respawn countdown is gone for humans.
 * Death records only a short deploy-eligibility floor (DEPLOY_MIN_SECONDS);
 * the player redeploys on an explicit Deploy request that consumes the
 * already-recorded class and spawn point. Bots keep the classic
 * RESPAWN_SECONDS auto-respawn timer (they have no UI to click).
 */

const TICKS_PER_SECOND = 20; // FIXED_DT_MS = 50
const DEPLOY_FLOOR_TICKS = DEPLOY_MIN_SECONDS * TICKS_PER_SECOND;
const BOT_TIMER_TICKS = RESPAWN_SECONDS * TICKS_PER_SECOND;

type World = ReturnType<typeof createWorldState>;
type Seat = { entityId: number; slot: number };

/** Kills the victim through the exact wire path (8e-13 needs the real death code so scheduleRespawn runs). */
function killViaFirePath(world: World, shooter: Seat, victim: Seat): void {
  world.x[shooter.slot] = 80;
  world.z[shooter.slot] = -20;
  world.yaw[shooter.slot] = Math.PI;
  world.x[victim.slot] = 80;
  world.z[victim.slot] = -10;
  world.flags[victim.slot] = (world.flags[victim.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
  world.health[victim.slot] = 1;
  // Warm up so the shot uses standing spread (deterministic hit at 10 m); 20
  // steps = 1 s, well under the 8 s regen delay, so the victim stays at 1 hp.
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
  expect(world.health[victim.slot]).toBe(0);
  expect((world.flags[victim.slot] ?? 0) & PlayerFlag.Alive).toBe(0);
}

describe("deploy-on-request respawn (Phase 8e-13)", () => {
  it("records the short deploy floor for humans and the classic timer for bots", () => {
    const humanWorld = createWorldState();
    const humanShooter = addPlayer(humanWorld, "shooter", Team.Ottoman);
    const humanVictim = addPlayer(humanWorld, "victim", Team.Byzantine);
    expect(humanShooter).toBeDefined();
    expect(humanVictim).toBeDefined();
    if (humanShooter === undefined || humanVictim === undefined) return;
    killViaFirePath(humanWorld, humanShooter, humanVictim);
    expect((humanWorld.respawnAtTick[humanVictim.slot] ?? 0) - humanWorld.tick).toBe(DEPLOY_FLOOR_TICKS);

    const botWorld = createWorldState();
    const botShooter = addPlayer(botWorld, "shooter", Team.Ottoman);
    const botVictim = addPlayer(botWorld, "bot-victim", Team.Byzantine, PlayerClass.Guardsman, true);
    expect(botShooter).toBeDefined();
    expect(botVictim).toBeDefined();
    if (botShooter === undefined || botVictim === undefined) return;
    killViaFirePath(botWorld, botShooter, botVictim);
    expect((botWorld.respawnAtTick[botVictim.slot] ?? 0) - botWorld.tick).toBe(BOT_TIMER_TICKS);
  });

  it("never auto-respawns a dead human, even well past the old countdown", () => {
    const world = createWorldState();
    const shooter = addPlayer(world, "shooter", Team.Ottoman);
    const victim = addPlayer(world, "victim", Team.Byzantine);
    expect(shooter).toBeDefined();
    expect(victim).toBeDefined();
    if (shooter === undefined || victim === undefined) return;
    killViaFirePath(world, shooter, victim);
    for (let index = 0; index < BOT_TIMER_TICKS + 20; index += 1) stepWorld(world);
    expect((world.flags[victim.slot] ?? 0) & PlayerFlag.Alive).toBe(0);
    expect(world.health[victim.slot]).toBe(0);
  });

  it("rejects deploy before the floor, then spawns the queued class at the home base", () => {
    const world = createWorldState();
    const shooter = addPlayer(world, "shooter", Team.Ottoman);
    const victim = addPlayer(world, "victim", Team.Byzantine);
    expect(shooter).toBeDefined();
    expect(victim).toBeDefined();
    if (shooter === undefined || victim === undefined) return;
    expect(requestClass(world, victim.entityId, PlayerClass.Priest)).toBe(true);
    killViaFirePath(world, shooter, victim);

    expect(requestDeploy(world, victim.entityId)).toBe(false);
    expect((world.flags[victim.slot] ?? 0) & PlayerFlag.Alive).toBe(0);

    for (let index = 0; index < DEPLOY_FLOOR_TICKS; index += 1) stepWorld(world);
    expect(requestDeploy(world, victim.entityId)).toBe(true);
    expect((world.flags[victim.slot] ?? 0) & PlayerFlag.Alive).toBe(PlayerFlag.Alive);
    expect(world.health[victim.slot]).toBe(MAX_HEALTH);
    expect(world.playerClass[victim.slot]).toBe(PlayerClass.Priest);
    expect(world.x[victim.slot]).toBeCloseTo(BYZANTINE_SPAWN.x);
    expect(world.z[victim.slot]).toBeCloseTo(BYZANTINE_SPAWN.z);
    expect(world.y[victim.slot]).toBeCloseTo(GROUND_CENTER_Y);
  });

  it("treats deploy while alive as a harmless no-op (double-click, late duplicate)", () => {
    const world = createWorldState();
    const player = addPlayer(world, "alive", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    const before = { x: world.x[player.slot], z: world.z[player.slot], health: world.health[player.slot] };
    expect(requestDeploy(world, player.entityId)).toBe(false);
    expect(world.x[player.slot]).toBe(before.x);
    expect(world.z[player.slot]).toBe(before.z);
    expect(world.health[player.slot]).toBe(before.health);
    expect((world.flags[player.slot] ?? 0) & PlayerFlag.Alive).toBe(PlayerFlag.Alive);
  });

  it("still auto-respawns bots on the classic timer without any deploy", () => {
    const world = createWorldState();
    const shooter = addPlayer(world, "shooter", Team.Ottoman);
    const bot = addPlayer(world, "bot", Team.Byzantine, PlayerClass.Guardsman, true);
    expect(shooter).toBeDefined();
    expect(bot).toBeDefined();
    if (shooter === undefined || bot === undefined) return;
    killViaFirePath(world, shooter, bot);
    for (let index = 0; index < BOT_TIMER_TICKS - 1; index += 1) stepWorld(world);
    expect((world.flags[bot.slot] ?? 0) & PlayerFlag.Alive).toBe(0);
    stepWorld(world);
    expect((world.flags[bot.slot] ?? 0) & PlayerFlag.Alive).toBe(PlayerFlag.Alive);
    expect(world.health[bot.slot]).toBe(MAX_HEALTH);
  });
});
