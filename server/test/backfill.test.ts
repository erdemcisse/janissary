import { describe, expect, it } from "vitest";
import { PlayerClass, Team } from "@janissary/shared";
import { BotBackfill, type BackfillConfig } from "../src/bots/backfill";
import { addPlayer, createWorldState, requestClass, stepWorld } from "../src/sim/world";

function smallConfig(): BackfillConfig {
  return { floorTarget: 4, maxServerBots: 4, reserveSlots: 0, checkEveryTicks: 1 };
}

describe("bot backfill", () => {
  it("fills an empty war to the population floor across both teams", () => {
    const world = createWorldState();
    const backfill = new BotBackfill(world, smallConfig());
    backfill.step(1);
    expect(backfill.count).toBe(4);
    expect(backfill.botsOnTeam(Team.Ottoman).length).toBe(2);
    expect(backfill.botsOnTeam(Team.Byzantine).length).toBe(2);
    expect(world.count).toBe(4);
  });

  it("backs off as humans fill the floor and never exceeds the cap", () => {
    const world = createWorldState();
    const backfill = new BotBackfill(world, smallConfig());
    backfill.step(1);
    const human = addPlayer(world, "Human", Team.Ottoman);
    expect(human).toBeDefined();
    backfill.step(2);
    expect(backfill.count).toBeLessThanOrEqual(4);
    expect(world.count).toBeLessThanOrEqual(5);
  });

  it("evicts the lowest-tenure bot on the human's team first", () => {
    const world = createWorldState();
    const backfill = new BotBackfill(world, smallConfig());
    backfill.step(1);
    backfill.step(2);
    const ottomanBots = backfill.botsOnTeam(Team.Ottoman);
    expect(ottomanBots.length).toBe(2);
    const oldest = [...ottomanBots].sort((left, right) => left.joinedAtTick - right.joinedAtTick)[0];
    expect(oldest).toBeDefined();
    if (oldest === undefined) return;
    expect(backfill.evictLowestTenureOnTeam(Team.Ottoman)).toBe(true);
    expect(backfill.count).toBe(3);
    expect(world.slotByEntityId.has(oldest.entityId)).toBe(false);
    expect(backfill.botsOnTeam(Team.Ottoman).length).toBe(1);
    expect(backfill.botsOnTeam(Team.Byzantine).length).toBe(2);
  });

  it("never blocks a human join even when the roster is all bots", () => {
    const world = createWorldState();
    const backfill = new BotBackfill(world, smallConfig());
    backfill.step(1);
    backfill.evictLowestTenureOnTeam(Team.Ottoman);
    backfill.evictLowestTenureOnTeam(Team.Ottoman);
    backfill.evictLowestTenureOnTeam(Team.Byzantine);
    backfill.evictLowestTenureOnTeam(Team.Byzantine);
    expect(backfill.count).toBe(0);
    const human = addPlayer(world, "Late Human", Team.Ottoman);
    expect(human).toBeDefined();
    expect(backfill.isServerBot(human?.entityId ?? 0)).toBe(false);
  });

  it("feeds bot brains into the authoritative world as inputs", () => {
    const world = createWorldState();
    const backfill = new BotBackfill(world, smallConfig());
    for (let tick = 1; tick <= 4; tick += 1) {
      stepWorld(world);
      backfill.step(tick);
    }
    for (const bot of backfill.botsOnTeam(Team.Ottoman)) {
      expect(world.lastInputTick[bot.slot]).toBeGreaterThan(0);
    }
  });

  it("releases a pinned pusher so the gunner bot can deploy the cannon", () => {
    const world = createWorldState();
    // floor 14 → 7 per team → Ottoman rolls 1..7 include the two Topcu rolls
    // (index 3 and index 7): one becomes the gunner, one the pusher.
    const backfill = new BotBackfill(world, { floorTarget: 14, maxServerBots: 14, reserveSlots: 0, checkEveryTicks: 1 });
    backfill.step(1);
    // Park the cannon close to the wall so the pusher pins it quickly, and
    // stand the Topcu bots right next to it so they board within a few ticks.
    world.cannons.x[0] = -24;
    world.cannons.z[0] = -20;
    const topcus = backfill.botsOnTeam(Team.Ottoman).filter((bot) => (world.playerClass[bot.slot] ?? PlayerClass.None) === PlayerClass.Topcu);
    expect(topcus.length).toBe(2);
    for (const bot of topcus) {
      world.x[bot.slot] = -23;
      world.z[bot.slot] = -18;
    }
    let deployed = false;
    let pusherReleased = false;
    for (let tick = 1; tick <= 900; tick += 1) {
      stepWorld(world);
      backfill.step(tick);
      // The gunner deploys only once every pusher has left the carriage.
      if ((world.cannons.deployed[0] ?? 0) === 1) {
        deployed = true;
        break;
      }
      for (const bot of topcus) {
        if ((world.cannonCrew[bot.slot] ?? -1) === 0) continue;
        if ((world.cannonCrew[bot.slot] ?? -1) < 0) {
          pusherReleased = true;
          break;
        }
      }
      if (pusherReleased && deployed) break;
    }
    // The siege loop must not deadlock: the pusher walks off the pinned
    // carriage and the gunner's deploy completes.
    expect(pusherReleased).toBe(true);
    expect(deployed).toBe(true);
  });

  it("does not let filler bots exhaust the human role caps", () => {
    const world = createWorldState();
    const human = addPlayer(world, "human", Team.Ottoman);
    expect(human).toBeDefined();
    if (human === undefined) return;
    // 50 support-class bots on the same team: under the old tally they filled
    // the proportional support cap and a human could never pick Mehter.
    for (let index = 0; index < 50; index += 1) {
      addPlayer(world, `bot-${index}`, Team.Ottoman, PlayerClass.Mehter, true);
    }
    expect(requestClass(world, human.entityId, PlayerClass.Mehter)).toBe(true);
  });
});
