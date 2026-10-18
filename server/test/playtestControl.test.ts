import { afterEach, describe, expect, it } from "vitest";
import {
  BotBrain,
  CombatEventType,
  GROUND_CENTER_Y,
  InputButton,
  KillCause,
  PlayerClass,
  PlayerFlag,
  RoundPhase,
  Team,
  WALL_SEGMENT_COUNT,
  resetBotControl,
  setBotBehaviorMode,
  setBotCombatFrozen,
  type EntityState,
} from "@janissary/shared";
import { BotBackfill, type BackfillConfig } from "../src/bots/backfill";
import { BOT_COUNT_MAX, BOT_COUNT_MIN, parseBotCount, parseBotFreeze, parseBotMode, parsePlaytestReset } from "../src/bots/admin";
import { createWorldState, resetRoundForPlaytest, stepWorld } from "../src/sim/world";
/**
 * Phase 8e-19 Task 1: dev playtest-control. The module-level BotBrain control
 * state is global, so every test resets it via resetBotControl().
 */

function smallConfig(): BackfillConfig {
  return { floorTarget: 4, maxServerBots: 4, reserveSlots: 0, checkEveryTicks: 1 };
}

function battleFixture(): { brain: BotBrain; self: EntityState; entities: Map<number, EntityState> } {
  const brain = new BotBrain(1, Team.Ottoman, PlayerClass.Janissary, 0);
  const self: EntityState = {
    entityId: 1,
    x: 0,
    y: GROUND_CENTER_Y,
    z: 18,
    yaw: 0,
    pitch: 0,
    team: Team.Ottoman,
    flags: PlayerFlag.Alive,
    ammo: 20,
  };
  const enemy: EntityState = {
    entityId: 2,
    x: 0,
    y: GROUND_CENTER_Y,
    z: 5,
    yaw: 0,
    pitch: 0,
    team: Team.Byzantine,
    flags: PlayerFlag.Alive,
  };
  return { brain, self, entities: new Map([[self.entityId, self], [enemy.entityId, enemy]]) };
}

afterEach(() => resetBotControl());

describe("dev admin request parsing", () => {
  it("clamps bot count to the panel range", () => {
    expect(parseBotCount({ count: 150 })).toBe(150);
    expect(parseBotCount({ count: 0 })).toBe(0);
    expect(parseBotCount({ count: 999 })).toBe(BOT_COUNT_MAX);
    expect(parseBotCount({ count: -5 })).toBe(BOT_COUNT_MIN);
    expect(parseBotCount({ count: 7.9 })).toBe(7);
  });

  it("rejects malformed bot counts", () => {
    expect(parseBotCount({ count: "60" })).toBeUndefined();
    expect(parseBotCount({ count: NaN })).toBeUndefined();
    expect(parseBotCount({})).toBeUndefined();
    expect(parseBotCount("60")).toBeUndefined();
    expect(parseBotCount(undefined)).toBeUndefined();
  });

  it("accepts only the three behavior modes", () => {
    expect(parseBotMode({ mode: "standing" })).toBe("standing");
    expect(parseBotMode({ mode: "walking" })).toBe("walking");
    expect(parseBotMode({ mode: "battle" })).toBe("battle");
    expect(parseBotMode({ mode: "flee" })).toBeUndefined();
    expect(parseBotMode({})).toBeUndefined();
  });

  it("requires an explicit boolean for the freeze toggle", () => {
    expect(parseBotFreeze({ frozen: true })).toBe(true);
    expect(parseBotFreeze({ frozen: false })).toBe(false);
    expect(parseBotFreeze({ frozen: "yes" })).toBeUndefined();
    expect(parseBotFreeze({})).toBeUndefined();
  });

  it("requires an explicit confirmation for a battle reset", () => {
    expect(parsePlaytestReset({ confirm: true })).toBe(true);
    expect(parsePlaytestReset({ confirm: false })).toBeUndefined();
    expect(parsePlaytestReset({})).toBeUndefined();
    expect(parsePlaytestReset(undefined)).toBeUndefined();
  });
});

describe("battle reset", () => {
  it("returns the war to a clean active state without delayed shots or stale effects", () => {
    const world = createWorldState();
    world.roundPhase = RoundPhase.Victory;
    world.phaseUntilTick = world.tick + 200;
    world.pendingShots.push({
      sourceEntityId: 1,
      x: 0,
      y: 1,
      z: 0,
      directionX: 0,
      directionY: 0,
      directionZ: -1,
      damage: 60,
      headshotMultiplier: 1.5,
      maxRange: 100,
      falloffStart: 50,
      killCause: KillCause.Arquebus,
      rewindTick: 0,
      resolveTick: world.tick + 10,
    });
    world.events.push({
      id: 1,
      type: CombatEventType.Fire,
      sourceEntityId: 1,
      targetEntityId: 0,
      value: 0,
      tick: world.tick,
    });

    resetRoundForPlaytest(world);

    expect(world.roundPhase).toBe(RoundPhase.Active);
    expect(world.phaseUntilTick).toBe(0);
    expect(world.pendingShots).toHaveLength(0);
    expect(world.events).toHaveLength(0);
  });
});

describe("bot count control", () => {
  it("prunes the roster when the target drops", () => {
    const world = createWorldState();
    const backfill = new BotBackfill(world, smallConfig());
    backfill.step(1);
    expect(backfill.count).toBe(4);
    backfill.setFloorTarget(0);
    backfill.step(2);
    expect(backfill.count).toBe(0);
    expect(world.count).toBe(0);
  });

  it("fills back up when the target rises again", () => {
    const world = createWorldState();
    const backfill = new BotBackfill(world, smallConfig());
    backfill.setFloorTarget(0);
    backfill.step(1);
    expect(backfill.count).toBe(0);
    backfill.setFloorTarget(4);
    backfill.step(2);
    expect(backfill.count).toBe(4);
  });

  it("clamps the floor target to the panel range", () => {
    const world = createWorldState();
    const backfill = new BotBackfill(world, smallConfig());
    backfill.setFloorTarget(999);
    expect(backfill.floorTarget).toBe(BOT_COUNT_MAX);
    backfill.setFloorTarget(-3);
    expect(backfill.floorTarget).toBe(BOT_COUNT_MIN);
  });
});

describe("bot behavior modes", () => {
  it("standing mode parks a bot: zero buttons, held yaw", () => {
    setBotBehaviorMode("standing");
    const { brain, self, entities } = battleFixture();
    const wallStates = new Uint8Array(WALL_SEGMENT_COUNT);
    const first = brain.decide(entities, self.entityId, 0, wallStates);
    const later = brain.decide(entities, self.entityId, 2_000, wallStates);
    expect(first.buttons).toBe(0);
    expect(later.buttons).toBe(0);
    // The held yaw: standing decisions never steer.
    expect(later.yaw).toBe(first.yaw);
  });

  it("walking mode patrols without firing even with an enemy in range", () => {
    setBotBehaviorMode("walking");
    const { brain, self, entities } = battleFixture();
    const wallStates = new Uint8Array(WALL_SEGMENT_COUNT);
    // Same acquire cadence as the battle control: first reaction acquires the
    // target (starts the hold-off), a later reaction would fire in battle mode.
    brain.decide(entities, self.entityId, 0, wallStates);
    brain.decide(entities, self.entityId, 200, wallStates);
    const later = brain.decide(entities, self.entityId, 1_000, wallStates);
    expect(later.buttons & InputButton.Fire).toBe(0);
    expect(later.buttons & InputButton.Forward).not.toBe(0);
  });

  it("battle mode still fires (control) and walking mode never does", () => {
    const { brain, self, entities } = battleFixture();
    const wallStates = new Uint8Array(WALL_SEGMENT_COUNT);
    brain.decide(entities, self.entityId, 0, wallStates);
    brain.decide(entities, self.entityId, 200, wallStates); // acquire → hold-off starts
    const battleDecision = brain.decide(entities, self.entityId, 1_000, wallStates); // hold-off elapsed
    expect(battleDecision.buttons & InputButton.Fire).not.toBe(0);
    setBotBehaviorMode("walking");
    const walkingDecision = brain.decide(entities, self.entityId, 2_000, wallStates);
    expect(walkingDecision.buttons & InputButton.Fire).toBe(0);
  });

  it("standing bots fed through backfill neither move nor fire", () => {
    setBotBehaviorMode("standing");
    const world = createWorldState();
    const backfill = new BotBackfill(world, smallConfig());
    backfill.step(1);
    const before = backfill.botsOnTeam(Team.Ottoman).map((bot) => ({ slot: bot.slot, x: world.x[bot.slot] ?? 0, z: world.z[bot.slot] ?? 0 }));
    for (let tick = 2; tick <= 10; tick += 1) {
      stepWorld(world);
      backfill.step(tick);
    }
    for (const bot of backfill.botsOnTeam(Team.Ottoman)) {
      const queue = world.inputQueues[bot.slot] ?? [];
      const last = queue[queue.length - 1];
      expect(last?.buttons ?? 0).toBe(0);
    }
    for (const entry of before) {
      expect(world.x[entry.slot] ?? 0).toBeCloseTo(entry.x, 5);
      expect(world.z[entry.slot] ?? 0).toBeCloseTo(entry.z, 5);
    }
  });
});

describe("combat freeze", () => {
  it("strips fire and melee from a battle-mode decision", () => {
    setBotCombatFrozen(true);
    const { brain, self, entities } = battleFixture();
    const wallStates = new Uint8Array(WALL_SEGMENT_COUNT);
    brain.decide(entities, self.entityId, 0, wallStates);
    brain.decide(entities, self.entityId, 200, wallStates);
    const decision = brain.decide(entities, self.entityId, 1_000, wallStates);
    expect(decision.buttons & (InputButton.Fire | InputButton.Melee)).toBe(0);
    // Movement survives the freeze — bots still walk the field.
    expect(decision.buttons & InputButton.Forward).not.toBe(0);
  });

  it("unfreezes back to full combat", () => {
    setBotCombatFrozen(true);
    setBotCombatFrozen(false);
    const { brain, self, entities } = battleFixture();
    const wallStates = new Uint8Array(WALL_SEGMENT_COUNT);
    brain.decide(entities, self.entityId, 0, wallStates);
    brain.decide(entities, self.entityId, 200, wallStates);
    const decision = brain.decide(entities, self.entityId, 1_000, wallStates);
    expect(decision.buttons & InputButton.Fire).not.toBe(0);
  });
});

describe("standing-mode perf", () => {
  it("keeps the 150-bot tick budget with every bot standing", () => {
    setBotBehaviorMode("standing");
    const entities = new Map<number, EntityState>();
    const brains: { brain: BotBrain; entityId: number }[] = [];
    for (let index = 0; index < 150; index += 1) {
      const entityId = index + 1;
      entities.set(entityId, {
        entityId,
        x: -58 + (index % 30) * 4,
        y: GROUND_CENTER_Y,
        z: 18,
        yaw: 0,
        pitch: 0,
        team: index % 2 === 0 ? Team.Ottoman : Team.Byzantine,
        flags: PlayerFlag.Alive,
      });
      brains.push({ brain: new BotBrain(entityId, index % 2 === 0 ? Team.Ottoman : Team.Byzantine, PlayerClass.Janissary, 0), entityId });
    }
    const wallStates = new Uint8Array(WALL_SEGMENT_COUNT);
    const sampleDurations: number[] = [];
    for (let tick = 0; tick < 400; tick += 1) {
      const startedAt = performance.now();
      for (const entry of brains) entry.brain.decide(entities, entry.entityId, tick * 50, wallStates);
      sampleDurations.push(performance.now() - startedAt);
    }
    const sorted = sampleDurations.slice(100).sort((left, right) => left - right);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    expect(p95).toBeLessThan(5);
  });
});
